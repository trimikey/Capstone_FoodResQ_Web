import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { logCronError, runCronDbExclusive } from '@/common/utils/cron-error';

@Injectable()
export class ListingsCron {
  private readonly logger = new Logger(ListingsCron.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron('5 */5 * * * *')
  async handleAutoExpire() {
    try {
      const result = await runCronDbExclusive(this.logger, 'listings.handleAutoExpire', () =>
        this.prisma.foodListing.updateMany({
        where: {
          status: { in: ['active', 'fully_reserved'] },
          pickupEndTime: { lt: new Date() },
          deletedAt: null,
        },
        data: { status: 'expired' },
        }),
      );
      if (result && result.count > 0)
        this.logger.log(`Auto-expired ${result.count} listing(s)`);
    } catch (e) {
      logCronError(this.logger, 'handleAutoExpire', e);
    }
  }

  @Cron('55 */30 * * * *')
  async handleExpiryAlerts() {
    try {
      const sent = await runCronDbExclusive(this.logger, 'listings.handleExpiryAlerts', async () => {
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

        return expiringListings.length;
      });

      if (typeof sent === 'number' && sent > 0) this.logger.log(`Sent expiry alerts for ${sent} listing(s)`);
    } catch (e) {
      logCronError(this.logger, 'handleExpiryAlerts', e);
    }
  }
}
