import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BulkRunsService } from './bulk-runs.service';
import { logCronError, runCronDbExclusive } from '@/common/utils/cron-error';

/** Dọn dẹp chuyến giao sỉ bị bỏ quên (yêu cầu quá 24h không duyệt / chuyến kẹt 6h). */
@Injectable()
export class BulkRunsCron {
  private readonly logger = new Logger(BulkRunsCron.name);

  constructor(private bulkRuns: BulkRunsService) {}

  @Cron('40 */10 * * * *')
  async handleStalled() {
    try {
      const n = await runCronDbExclusive(this.logger, 'bulkRuns.expireStalled', () =>
        this.bulkRuns.expireStalled(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Closed ${n} stalled bulk run(s)`);
    } catch (e) {
      logCronError(this.logger, 'expireStalled (bulk runs)', e);
    }
  }
}
