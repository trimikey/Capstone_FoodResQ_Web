import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Thứ tự lưu ảnh: Cloudinary (chính) → Firebase Storage → ./uploads local (dev-only).
 *
 * RULE: MỌI ảnh upload phải lên Cloudinary khi có credentials — DB của team là
 * cloud dùng chung nhưng ./uploads là disk từng máy, lưu local sẽ vỡ ảnh trên
 * máy khác / trên Render (đã xảy ra với ảnh bìa chiến dịch).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadRoot = join(process.cwd(), 'uploads');
  private firebaseApp: App | null | undefined;
  private bucketName: string | null | undefined;

  constructor(private config: ConfigService) {}

  /** Có credentials Cloudinary chưa — nơi khác dùng để quyết định fallback. */
  isCloudinaryConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CLOUDINARY_CLOUD_NAME') &&
        this.config.get<string>('CLOUDINARY_API_KEY') &&
        this.config.get<string>('CLOUDINARY_API_SECRET'),
    );
  }

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
      throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its image type');
    }

    const safeSubdir = subdir.replace(/[^a-z0-9_-]/gi, '');

    // 1) Cloudinary — nguồn ảnh chính thức của project
    const cloudinaryUrl = await this.saveImageToCloudinary(file, safeSubdir);
    if (cloudinaryUrl) return cloudinaryUrl;

    // 2) Firebase Storage — nếu Cloudinary chưa cấu hình
    const cloudUrl = await this.saveImageToFirebase(file, safeSubdir, ext);
    if (cloudUrl) return cloudUrl;

    const dir = join(this.uploadRoot, safeSubdir);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    return `/uploads/${safeSubdir}/${filename}`;
  }

  /**
   * Upload ảnh lên Cloudinary bằng signed upload (REST, không cần SDK).
   * Chữ ký = SHA1 của các param (sắp xếp alphabet) + API secret.
   */
  private async saveImageToCloudinary(
    file: Express.Multer.File,
    safeSubdir: string,
  ): Promise<string | null> {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) return null;

    const baseFolder = this.config.get<string>('CLOUDINARY_FOLDER') || 'foodresq';
    const folder = safeSubdir ? `${baseFolder}/${safeSubdir}` : baseFolder;
    const timestamp = Math.floor(Date.now() / 1000);
    // Param ký phải theo thứ tự alphabet: folder < timestamp
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }));
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        this.logger.error(`Cloudinary upload thất bại (${res.status}): ${await res.text()}`);
        return null;
      }
      const json = (await res.json()) as { secure_url?: string };
      return json.secure_url ?? null;
    } catch (error) {
      this.logger.error(`Cloudinary upload lỗi: ${(error as Error).message}`);
      return null;
    }
  }

  private getFirebaseApp(): App | null {
    if (this.firebaseApp !== undefined) return this.firebaseApp;

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    this.bucketName = this.config.get<string>('FIREBASE_STORAGE_BUCKET') || (projectId ? `${projectId}.appspot.com` : null);

    if (!projectId || !clientEmail || !privateKey || !this.bucketName) {
      this.firebaseApp = null;
      return null;
    }

    this.firebaseApp =
      getApps()[0] ??
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket: this.bucketName,
      });
    return this.firebaseApp;
  }

  private async saveImageToFirebase(
    file: Express.Multer.File,
    safeSubdir: string,
    ext: string,
  ): Promise<string | null> {
    const app = this.getFirebaseApp();
    if (!app || !this.bucketName) return null;

    const filename = `${randomUUID()}.${ext}`;
    const objectName = `uploads/${safeSubdir}/${filename}`;
    const downloadToken = randomUUID();

    try {
      await getStorage(app)
        .bucket(this.bucketName)
        .file(objectName)
        .save(file.buffer, {
          resumable: false,
          metadata: {
            contentType: file.mimetype,
            metadata: { firebaseStorageDownloadTokens: downloadToken },
          },
        });

      return `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodeURIComponent(objectName)}?alt=media&token=${downloadToken}`;
    } catch {
      return null;
    }
  }

  // Chống giả mạo Content-Type từ client: đối chiếu magic bytes của file thật
  private matchesMagicBytes(buffer: Buffer, mimetype: string): boolean {
    if (!buffer || buffer.length < 12) return false;
    switch (mimetype) {
      case 'image/jpeg':
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      case 'image/png':
        return (
          buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
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
