import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';
import { DishStepsService } from './dish-steps.service';
import { logCronError } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời chiến dịch bếp ăn. */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(
    private campaigns: CampaignsService,
    private dishSteps: DishStepsService,
  ) {}

  // Nửa đêm hằng ngày: tự huỷ các chiến dịch 'open' đã qua endDate + endTime
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpireOverdue() {
    try {
      const n = await this.campaigns.expireOverdueCampaigns();
      if (n > 0) this.logger.log(`Auto-cancelled ${n} overdue campaign(s)`);
    } catch (e) {
      logCronError(this.logger, 'expireOverdueCampaigns', e);
    }
  }

  /**
   * Mỗi giờ: tự chuyển các chiến dịch 'in_progress' đã qua endDate + endTime
   * sang 'completed'. Tránh tình trạng campaign "vẫn đang chạy" sau khi
   * đã qua ngày kết thúc (khi charity quên bấm nút "Hoàn tất").
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoComplete() {
    try {
      const n = await this.campaigns.autoCompleteExpiredCampaigns();
      if (n > 0) this.logger.log(`Auto-completed ${n} expired campaign(s)`);
    } catch (e) {
      logCronError(this.logger, 'autoCompleteExpiredCampaigns', e);
    }
  }

  /**
   * Nhắc việc cho TNV:
   *  - Ca sắp đến hạn trong [now, now+30 min]: gửi notification 'campaign_urgent'
   *    kind='deadline_30min' để họ chuẩn bị tới bếp.
   *  - Ca đã kết thúc quá 15 phút mà assignment vẫn 'assigned'/'checked_in':
   *    gửi kind='deadline_quarter_passed' (cảnh báo quá hạn).
   * Chạy mỗi 5 phút.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleNudgeUpcomingTasks() {
    try {
      const n = await this.campaigns.nudgeUpcomingTasks();
      if (n > 0) this.logger.log(`Nudged ${n} volunteer assignment(s)`);
    } catch (e) {
      logCronError(this.logger, 'nudgeUpcomingTasks', e);
    }
  }

  /**
   * Mỗi giờ: đánh vắng TNV đã được duyệt nhưng hết ngày trực vẫn không điểm danh.
   *
   * Chạy theo giờ chứ không nửa đêm: chiến dịch nhiều ngày có ca kết thúc từ sáng,
   * để tới nửa đêm mới chốt thì suốt cả ngày danh sách vẫn báo "đủ người".
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleMarkAbsentVolunteers() {
    try {
      const n = await this.campaigns.markAbsentVolunteers();
      if (n > 0) this.logger.log(`Marked ${n} volunteer assignment(s) as absent`);
    } catch (e) {
      logCronError(this.logger, 'markAbsentVolunteers', e);
    }
  }

  /**
   * Mỗi 30 giây: mở khoá các khâu (step) đủ điều kiện.
   * Điều kiện: đến `scheduled_time` (giờ VN) VÀ khâu trước cùng món đã `done`.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleAutoOpenDishSteps() {
    try {
      const n = await this.dishSteps.autoOpenAvailableSteps();
      if (n > 0) this.logger.log(`Auto-opened ${n} dish step(s)`);
    } catch (e) {
      logCronError(this.logger, 'autoOpenAvailableSteps', e);
    }
  }
}
