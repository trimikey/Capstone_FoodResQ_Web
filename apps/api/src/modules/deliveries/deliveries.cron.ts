import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeliveriesService } from './deliveries.service';
import { logCronError, runCronDbExclusive } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời đơn giao (auto-fail đơn shipper bỏ ngang). */
@Injectable()
export class DeliveriesCron {
  private readonly logger = new Logger(DeliveriesCron.name);

  constructor(private deliveries: DeliveriesService) {}

  // Mỗi 5 phút: auto-fail các đơn giao kẹt quá lâu không cập nhật trạng thái
  @Cron('35 */5 * * * *')
  async handleStalledDeliveries() {
    try {
      const n = await runCronDbExclusive(this.logger, 'expireStalledDeliveries', () =>
        this.deliveries.expireStalledDeliveries(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Auto-failed ${n} stalled delivery(ies)`);
    } catch (e) {
      logCronError(this.logger, 'expireStalledDeliveries', e);
    }
  }

  // Mỗi 30s: đóng offer quá hạn + mời lại shipper cho đơn chưa ai nhận còn hiệu lực.
  // Chạy dày để thu hẹp "khoảng chết" giữa lúc đợt offer cũ hết hạn (TTL 2 phút)
  // và đợt mời lại — nếu quét theo phút, shipper có thể thấy trống tới ~60s.
  @Cron('20,50 * * * * *')
  async handleOfferSweep() {
    try {
      const n = await runCronDbExclusive(this.logger, 'sweepOffersAndRebroadcast', () =>
        this.deliveries.sweepOffersAndRebroadcast(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Re-broadcasted ${n} unassigned delivery(ies)`);
    } catch (e) {
      logCronError(this.logger, 'sweepOffersAndRebroadcast', e);
    }
  }
}
