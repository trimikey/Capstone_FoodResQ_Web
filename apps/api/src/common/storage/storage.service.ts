import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Dev storage: ghi file vào ./uploads và serve qua static assets.
 * Prod phải thay bằng S3/Cloudflare R2 (xem CLAUDE.md §6) — giữ nguyên interface saveImage().
 */
@Injectable()
export class StorageService {
  private readonly uploadRoot = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {}

  /**
   * Kiểm tra file upload local còn tồn tại trước khi dùng làm bằng chứng
   * xác minh. URL http(s) do object storage quản lý nên không đọc như file local.
   */
  async imageExists(url: string): Promise<boolean> {
    if (/^https?:\/\//i.test(url)) return true;
    if (!url.startsWith('/uploads/')) return false;

    const filePath = resolve(this.uploadRoot, url.slice('/uploads/'.length));
    const relativePath = relative(this.uploadRoot, filePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) return false;

    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async saveImage(file: Express.Multer.File, subdir: string): Promise<string> {
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Only JPEG, PNG or WebP images are allowed',
      );
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match its image type',
      );
    }

    const safeSubdir = subdir.replace(/[^a-z0-9_-]/gi, '');
    if (this.shouldUseCloudinary()) {
      return this.saveToCloudinary(file, safeSubdir, ext);
    }

    const dir = join(this.uploadRoot, safeSubdir);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    return `/uploads/${safeSubdir}/${filename}`;
  }

  private shouldUseCloudinary(): boolean {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    const explicitDriver = this.config.get<string>('STORAGE_DRIVER')?.trim();
    const hasAnyCloudinaryEnv = !!(cloudName || apiKey || apiSecret);

    if (explicitDriver === 'cloudinary' || hasAnyCloudinaryEnv) {
      if (!cloudName || !apiKey || !apiSecret) {
        throw new InternalServerErrorException(
          'Cloudinary storage is not fully configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
        );
      }
      return true;
    }

    return false;
  }

  private async saveToCloudinary(
    file: Express.Multer.File,
    subdir: string,
    ext: string,
  ): Promise<string> {
    const cloudName = this.config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.getOrThrow<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.getOrThrow<string>('CLOUDINARY_API_SECRET');
    const rootFolder = this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'foodresq';
    const folder = `${rootFolder}/${subdir}`;
    const publicId = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.signCloudinaryParams(
      { folder, public_id: publicId, timestamp },
      apiSecret,
    );

    const arrayBuffer = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    const body = new FormData();
    body.append('file', new Blob([arrayBuffer], { type: file.mimetype }), `${publicId}.${ext}`);
    body.append('api_key', apiKey);
    body.append('timestamp', timestamp);
    body.append('folder', folder);
    body.append('public_id', publicId);
    body.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body },
    );
    const payload = (await response.json().catch(() => null)) as {
      secure_url?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok || !payload?.secure_url) {
      throw new InternalServerErrorException(
        payload?.error?.message ?? 'Cloudinary upload failed.',
      );
    }

    return payload.secure_url;
  }

  private signCloudinaryParams(
    params: Record<string, string>,
    apiSecret: string,
  ): string {
    const toSign = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${toSign}${apiSecret}`)
      .digest('hex');
  }

  // Chống giả mạo Content-Type từ client: đối chiếu magic bytes của file thật
  private matchesMagicBytes(buffer: Buffer, mimetype: string): boolean {
    if (!buffer || buffer.length < 12) return false;
    switch (mimetype) {
      case 'image/jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      case 'image/png':
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        );
      case 'image/webp':
        return (
          buffer.toString('ascii', 0, 4) === 'RIFF' &&
          buffer.toString('ascii', 8, 12) === 'WEBP'
        );
      default:
        return false;
    }
  }
}
