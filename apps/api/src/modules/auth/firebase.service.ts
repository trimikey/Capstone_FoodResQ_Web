import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  name: string | null;
  picture: string | null;
}

/**
 * Verify Firebase ID token bằng firebase-admin.
 * Khởi tạo từ env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
 * Nếu chưa cấu hình → service vẫn chạy nhưng verifyIdToken sẽ báo lỗi rõ ràng
 * (để backend không crash khi chưa có service account).
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;

  constructor(private config: ConfigService) {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (projectId && clientEmail && privateKey) {
      this.app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          // env lưu private key 1 dòng với \n escaped → khôi phục xuống dòng thật
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      this.logger.warn(
        'Firebase chưa cấu hình (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY) — đăng nhập Google/Phone sẽ không khả dụng.',
      );
    }
  }

  async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
    if (!this.app) {
      throw new ServiceUnavailableException('Đăng nhập Firebase chưa được cấu hình trên server');
    }

    try {
      const decoded = await getAuth(this.app).verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        phoneNumber: decoded.phone_number ?? null,
        name: decoded.name ?? null,
        picture: decoded.picture ?? null,
      };
    } catch {
      throw new UnauthorizedException('Firebase ID token không hợp lệ hoặc đã hết hạn');
    }
  }
}
