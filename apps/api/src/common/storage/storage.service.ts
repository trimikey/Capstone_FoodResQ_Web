import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

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

  async saveImage(file: Express.Multer.File, subdir: string): Promise<string> {
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    }
    if (!this.matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its image type');
    }

    const safeSubdir = subdir.replace(/[^a-z0-9_-]/gi, '');
    const dir = join(this.uploadRoot, safeSubdir);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    return `/uploads/${safeSubdir}/${filename}`;
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
