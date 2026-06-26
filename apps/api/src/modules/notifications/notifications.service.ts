import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';

interface NotifyInput {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private push: PushService,
  ) {}

  /** Tạo thông báo (lưu DB) + đẩy real-time qua WebSocket + push FCM. Không throw để không chặn flow chính. */
  async notify(userId: string, input: NotifyInput) {
    try {
      const notif = await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: (input.data ?? {}) as never,
        },
      });
      this.gateway.emitToUser(userId, 'notification:new', notif);
      // Push FCM (no-op nếu chưa cấu hình / user chưa có device token)
      void this.push.sendToUser(userId, { title: input.title, body: input.body, data: input.data });
      return notif;
    } catch {
      return null;
    }
  }

  async listMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }
}
