import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveriesService } from './deliveries.service';

/** Tác vụ định kỳ cho vòng đời đơn giao (auto-fail đơn shipper bỏ ngang). */
@Injectable()
export class DeliveriesCron {
  private readonly logger = new Logger(DeliveriesCron.name);

  constructor(private deliveries: DeliveriesService) {}

  // Mỗi 5 phút: auto-fail các đơn giao kẹt quá lâu không cập nhật trạng thái
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleStalledDeliveries() {
    try {
      const n = await this.deliveries.expireStalledDeliveries();
      if (n > 0) this.logger.log(`Auto-failed ${n} stalled delivery(ies)`);
    } catch (e) {
      this.logger.error('expireStalledDeliveries failed', e as Error);
    }
  }

  // Mỗi phút: đóng offer quá hạn + mời lại shipper cho đơn chưa ai nhận còn hiệu lực
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOfferSweep() {
    try {
      const n = await this.deliveries.sweepOffersAndRebroadcast();
      if (n > 0) this.logger.log(`Re-broadcasted ${n} unassigned delivery(ies)`);
    } catch (e) {
      this.logger.error('sweepOffersAndRebroadcast failed', e as Error);
    }
  }
}
