import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReservationsService } from './reservations.service';
import { logCronError, runCronDbExclusive } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời reservation (no_show / reset daily). */
@Injectable()
export class ReservationsCron {
  private readonly logger = new Logger(ReservationsCron.name);

  constructor(private reservations: ReservationsService) {}

  // Mỗi 2 phút: đánh dấu no_show các đơn quá hạn QR. Không cần chạy dày như
  // offer sweep, nên giảm nhịp để bớt tranh slot DB cron khi hệ thống bận.
  @Cron('30 */2 * * * *')
  async handleNoShows() {
    try {
      const n = await runCronDbExclusive(this.logger, 'expireNoShows', () =>
        this.reservations.expireNoShows(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Marked ${n} reservation(s) as no_show`);
    } catch (e) {
      logCronError(this.logger, 'expireNoShows', e);
    }
  }

  // Nửa đêm hằng ngày: reset hạn mức đặt chỗ/ngày
  @Cron('50 0 0 * * *')
  async handleDailyReset() {
    try {
      const didRun = await runCronDbExclusive(this.logger, 'resetDailyReservationCounters', async () => {
        await this.reservations.resetDailyReservationCounters();
        return true;
      });
      if (didRun) this.logger.log('Daily reservation counters reset');
    } catch (e) {
      logCronError(this.logger, 'resetDailyReservationCounters', e);
    }
  }
}
