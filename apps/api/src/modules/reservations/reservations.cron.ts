import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from './reservations.service';

/** Tác vụ định kỳ cho vòng đời reservation (no_show / reset daily). */
@Injectable()
export class ReservationsCron {
  private readonly logger = new Logger(ReservationsCron.name);

  constructor(private reservations: ReservationsService) {}

  /** Lỗi mất kết nối DB (Prisma P1xxx) → log gọn 1 dòng, tránh spam cả stack mỗi phút. */
  private logTaskError(task: string, e: unknown) {
    const code = (e as { code?: string }).code;
    if (typeof code === 'string' && code.startsWith('P1')) {
      this.logger.warn(`${task}: tạm thời không kết nối được DB (${code}) — sẽ thử lại lần chạy sau.`);
    } else {
      this.logger.error(`${task} failed`, e as Error);
    }
  }

  // Mỗi phút: đánh dấu no_show các đơn quá hạn QR
  @Cron(CronExpression.EVERY_MINUTE)
  async handleNoShows() {
    try {
      const n = await this.reservations.expireNoShows();
      if (n > 0) this.logger.log(`Marked ${n} reservation(s) as no_show`);
    } catch (e) {
      this.logTaskError('expireNoShows', e);
    }
  }

  // Nửa đêm hằng ngày: reset hạn mức đặt chỗ/ngày
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyReset() {
    try {
      await this.reservations.resetDailyReservationCounters();
      this.logger.log('Daily reservation counters reset');
    } catch (e) {
      this.logTaskError('resetDailyReservationCounters', e);
    }
  }
}
