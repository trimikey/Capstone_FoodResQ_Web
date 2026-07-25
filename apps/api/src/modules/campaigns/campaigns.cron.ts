import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';
import { logCronError } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời chiến dịch bếp ăn. */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(private campaigns: CampaignsService) {}

  // Nửa đêm hằng ngày: tự huỷ các chiến dịch 'open' đã qua ngày diễn ra
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireOverdue() {
    try {
      const n = await this.campaigns.expireOverdueCampaigns();
      if (n > 0) this.logger.log(`Auto-cancelled ${n} overdue campaign(s)`);
    } catch (e) {
      logCronError(this.logger, 'expireOverdueCampaigns', e);
    }
  }
}
