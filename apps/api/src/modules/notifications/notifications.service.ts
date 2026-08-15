import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

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
  ) {}

  /** Tạo thông báo (lưu DB) + đẩy real-time qua WebSocket. Không throw để không chặn flow chính. */
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
      return notif;
    } catch {
      return null;
    }
  }

  /**
   * Gửi cùng một thông báo cho MỌI quản trị viên đang hoạt động.
   *
   * Việc cần admin xử lý (chiến dịch chờ duyệt, khiếu nại mới, hồ sơ chờ xác minh…)
   * không thuộc về một admin cụ thể nào, nên fan-out cho tất cả rồi ai xử lý trước
   * thì thôi. Không throw để không chặn luồng nghiệp vụ chính.
   *
   * @returns số admin đã nhận
   */
  async notifyAdmins(input: NotifyInput): Promise<number> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'admin', deletedAt: null },
        select: { id: true },
      });
      await Promise.all(admins.map((a) => this.notify(a.id, input)));
      return admins.length;
    } catch {
      return 0;
    }
  }

  /**
   * Gửi thông báo cho user đứng đầu hồ sơ của tổ chức (charity) s� hữu chiến dịch.
   * Dùng cho sự cố cần org xử lý ngay: QC fail, món không đảm bảo chất lượng…
   *
   * Trả về số user đã nhận (0 = campaign không tìm thấy / org không có user active).
   */
  async notifyCampaignOwner(
    campaignId: string,
    input: NotifyInput,
  ): Promise<number> {
    try {
      const campaign = await this.prisma.kitchenCampaign.findUnique({
        where: { id: campaignId },
        select: {
          charityReceiver: {
            select: {
              user: { select: { id: true, status: true, deletedAt: true } },
            },
          },
        },
      });
      const owner = campaign?.charityReceiver?.user;
      if (!owner || owner.status !== 'active' || owner.deletedAt) return 0;
      await this.notify(owner.id, input);
      return 1;
    } catch {
      return 0;
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
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async saveDeviceToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
      select: { id: true },
    });
    return { ok: true };
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
