import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
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
  private firebaseApp: App | null | undefined;
  private bucketName: string | null | undefined;

  constructor(private config: ConfigService) {}

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
    const cloudUrl = await this.saveImageToFirebase(file, safeSubdir, ext);
    if (cloudUrl) return cloudUrl;

    const dir = join(this.uploadRoot, safeSubdir);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    return `/uploads/${safeSubdir}/${filename}`;
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
