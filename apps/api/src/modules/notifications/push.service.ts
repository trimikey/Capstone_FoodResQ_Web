import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApp, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '@/prisma/prisma.service';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  link?: string;
}

/**
 * Gửi push notification qua Firebase Cloud Messaging.
 * Tự tắt (no-op) nếu chưa cấu hình FIREBASE_SERVICE_ACCOUNT — app vẫn chạy bình thường.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app?: App;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!raw || !raw.trim()) {
      this.logger.warn('FCM chưa cấu hình (FIREBASE_SERVICE_ACCOUNT trống) — push notification bị tắt.');
      return;
    }
    try {
      const json = raw.trim().startsWith('{')
        ? JSON.parse(raw)
        : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      this.app = getApps().length ? getApp() : initializeApp({ credential: cert(json as ServiceAccount) });
      this.logger.log('FCM đã sẵn sàng — push notification bật.');
    } catch (e) {
      this.logger.error('Khởi tạo FCM thất bại: ' + (e as Error).message);
    }
  }

  get enabled(): boolean {
    return !!this.app;
  }

  /** Lưu token thiết bị cho user (idempotent theo token). */
  async registerToken(userId: string, token: string, platform?: string) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform: platform ?? null },
      update: { userId, platform: platform ?? null },
    });
    return { ok: true };
  }

  async removeToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { ok: true };
  }

  /** Gửi push tới tất cả thiết bị của user; tự dọn token hết hạn. */
  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.app) return;
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;

    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v);

    try {
      const res = await getMessaging(this.app).sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title: payload.title, body: payload.body },
        data,
        webpush: { fcmOptions: { link: payload.link ?? '/' } },
      });
      const invalid: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')) {
          invalid.push(tokens[i].token);
        }
      });
      if (invalid.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } });
    } catch (e) {
      this.logger.warn('Gửi push thất bại: ' + (e as Error).message);
    }
  }
}
