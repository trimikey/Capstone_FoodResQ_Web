import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { logCronError } from '@/common/utils/cron-error';

@Injectable()
export class ListingsCron {
  private readonly logger = new Logger(ListingsCron.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleExpiryAlerts() {
    try {
      const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

      const expiringListings = await this.prisma.foodListing.findMany({
        where: {
          status: 'active',
          deletedAt: null,
          expiryTime: {
            gt: new Date(),
            lte: oneHourFromNow,
          },
        },
        include: {
          provider: {
            include: { user: true },
          },
        },
      });

      for (const listing of expiringListings) {
        const userId = listing.provider.userId;
        const isNear = listing.expiryTime <= thirtyMinutesFromNow;
        const minutesLeft = Math.round(
          (new Date(listing.expiryTime).getTime() - Date.now()) / 60000,
        );

        await this.notifications.notify(userId, {
          type: isNear ? 'listing_expiring_urgent' : 'listing_expiring_soon',
          title: isNear ? 'Tin sắp hết hạn!' : 'Thông báo hết hạn',
          body: `Tin "${listing.title}" sẽ hết hạn trong ${minutesLeft} phút.`,
          data: { listingId: listing.id },
        });
      }

      if (expiringListings.length > 0) {
        this.logger.log(`Sent expiry alerts for ${expiringListings.length} listing(s)`);
      }
    } catch (e) {
      logCronError(this.logger, 'handleExpiryAlerts', e);
    }
  }

  /**
   * Tự động chuyển tin đã quá thời gian lấy hàng thành `expired`.
   * Tin `fully_reserved` cũng được xử lý — provider có thể đã đăng nhưng hết suất trước giờ pickup.
   * Chạy mỗi 5 phút để tab "Đang mở" của provider phản ánh đúng trạng thái thực tế.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoExpire() {
    try {
      const now = new Date();
      const result = await this.prisma.foodListing.updateMany({
        where: {
          status: { in: ['active', 'fully_reserved'] },
          deletedAt: null,
          pickupEndTime: { lt: now },
        },
        data: { status: 'expired' },
      });

      if (result.count > 0) {
        this.logger.log(`Auto-expired ${result.count} listing(s) past pickup_end_time`);
      }
    } catch (e) {
      logCronError(this.logger, 'handleAutoExpire', e);
    }
  }
}
