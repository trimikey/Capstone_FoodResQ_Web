import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BulkRunsService } from './bulk-runs.service';

/** Dọn dẹp chuyến giao sỉ bị bỏ quên (yêu cầu quá 24h không duyệt / chuyến kẹt 6h). */
@Injectable()
export class BulkRunsCron {
  private readonly logger = new Logger(BulkRunsCron.name);

  constructor(private bulkRuns: BulkRunsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStalled() {
    try {
      const n = await this.bulkRuns.expireStalled();
      if (n > 0) this.logger.log(`Closed ${n} stalled bulk run(s)`);
    } catch (e) {
      this.logger.error('expireStalled (bulk runs) failed', e as Error);
    }
  }
}
