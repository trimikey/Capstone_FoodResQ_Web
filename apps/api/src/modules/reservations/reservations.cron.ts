import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from './reservations.service';
import { logCronError } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời reservation (no_show / reset daily). */
@Injectable()
export class ReservationsCron {
  private readonly logger = new Logger(ReservationsCron.name);

  constructor(private reservations: ReservationsService) {}

  // Mỗi phút: đánh dấu no_show các đơn quá hạn QR
  @Cron(CronExpression.EVERY_MINUTE)
  async handleNoShows() {
    try {
      const n = await this.reservations.expireNoShows();
      if (n > 0) this.logger.log(`Marked ${n} reservation(s) as no_show`);
    } catch (e) {
      logCronError(this.logger, 'expireNoShows', e);
    }
  }

  // Nửa đêm hằng ngày: reset hạn mức đặt chỗ/ngày
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyReset() {
    try {
      await this.reservations.resetDailyReservationCounters();
      this.logger.log('Daily reservation counters reset');
    } catch (e) {
      logCronError(this.logger, 'resetDailyReservationCounters', e);
    }
  }
}
