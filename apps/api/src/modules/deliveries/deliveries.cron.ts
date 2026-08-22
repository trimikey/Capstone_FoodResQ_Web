import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveriesService } from './deliveries.service';
import { logCronError } from '@/common/utils/cron-error';

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
      logCronError(this.logger, 'expireStalledDeliveries', e);
    }
  }

  // Mỗi 30s: huỷ đơn không ai nhận đúng hạn (đơn ngay hết cửa sổ chờ / đơn hẹn giờ
  // quá giờ hẹn). Hệ mời tuần tự cũ đã gỡ — shipper tự chọn đơn trong ca của mình.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleUnclaimedSweep() {
    try {
      const n = await this.deliveries.expireUnclaimedDeliveries();
      if (n > 0) this.logger.log(`Expired ${n} unclaimed delivery(ies)`);
    } catch (e) {
      logCronError(this.logger, 'expireUnclaimedDeliveries', e);
    }
  }
}
