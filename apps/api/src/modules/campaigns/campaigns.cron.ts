import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';

/** Tác vụ định kỳ cho vòng đời chiến dịch bếp ăn. */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(private campaigns: CampaignsService) {}

  /** Lỗi mất kết nối DB (Prisma P1xxx) → log gọn 1 dòng, tránh spam stack mỗi lần chạy. */
  private logTaskError(task: string, e: unknown) {
    const code = (e as { code?: string }).code;
    if (typeof code === 'string' && code.startsWith('P1')) {
      this.logger.warn(`${task}: tạm thời không kết nối được DB (${code}) — sẽ thử lại lần chạy sau.`);
    } else {
      this.logger.error(`${task} failed`, e as Error);
    }
  }

  // Nửa đêm hằng ngày: tự huỷ các chiến dịch 'open' đã qua ngày diễn ra
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireOverdue() {
    try {
      const n = await this.campaigns.expireOverdueCampaigns();
      if (n > 0) this.logger.log(`Auto-cancelled ${n} overdue campaign(s)`);
    } catch (e) {
      this.logTaskError('expireOverdueCampaigns', e);
    }
  }
}
