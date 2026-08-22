import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampaignsService } from './campaigns.service';
import { DishStepsService } from './dish-steps.service';
import { logCronError, runCronDbExclusive } from '@/common/utils/cron-error';

/** Tác vụ định kỳ cho vòng đời chiến dịch bếp ăn. */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(
    private campaigns: CampaignsService,
    private dishSteps: DishStepsService,
  ) {}

  /** Mỗi phút: mở/đóng tuyển và tự bắt đầu chiến dịch đủ 100% từng ca. */
  @Cron('5 * * * * *')
  async handleRecruitmentLifecycle() {
    try {
      const result = await runCronDbExclusive(this.logger, 'advanceRecruitmentLifecycle', () =>
        this.campaigns.advanceRecruitmentLifecycle(),
      );
      if (result && result.started > 0) this.logger.log(`Auto-started ${result.started} campaign(s)`);
    } catch (e) {
      logCronError(this.logger, 'advanceRecruitmentLifecycle', e);
    }
  }

  // Nửa đêm: giữ chiến dịch thiếu người ở trạng thái chờ dời lịch/huỷ, không tự huỷ.
  @Cron('20 0 0 * * *')
  async handleExpireOverdue() {
    try {
      const n = await runCronDbExclusive(this.logger, 'expireOverdueCampaigns', () =>
        this.campaigns.expireOverdueCampaigns(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Kept ${n} understaffed campaign(s) blocked from starting`);
    } catch (e) {
      logCronError(this.logger, 'expireOverdueCampaigns', e);
    }
  }

  /**
   * Mỗi giờ: tự chuyển các chiến dịch 'in_progress' đã qua endDate + endTime
   * sang 'completed'. Tránh tình trạng campaign "vẫn đang chạy" sau khi
   * đã qua ngày kết thúc (khi charity quên bấm nút "Hoàn tất").
   */
  @Cron('35 0 * * * *')
  async handleAutoComplete() {
    try {
      const n = await runCronDbExclusive(this.logger, 'autoCompleteExpiredCampaigns', () =>
        this.campaigns.autoCompleteExpiredCampaigns(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Auto-completed ${n} expired campaign(s)`);
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
  @Cron('25 */5 * * * *')
  async handleNudgeUpcomingTasks() {
    try {
      const n = await runCronDbExclusive(this.logger, 'nudgeUpcomingTasks', () =>
        this.campaigns.nudgeUpcomingTasks(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Nudged ${n} volunteer assignment(s)`);
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
  @Cron('45 0 * * * *')
  async handleMarkAbsentVolunteers() {
    try {
      const n = await runCronDbExclusive(this.logger, 'markAbsentVolunteers', () =>
        this.campaigns.markAbsentVolunteers(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Marked ${n} volunteer assignment(s) as absent`);
    } catch (e) {
      logCronError(this.logger, 'markAbsentVolunteers', e);
    }
  }

  /**
   * Mỗi 30 giây: mở khoá các khâu (step) đủ điều kiện.
   * Điều kiện: đến `scheduled_time` (giờ VN) VÀ khâu trước cùng món đã `done`.
   */
  @Cron('10,40 * * * * *')
  async handleAutoOpenDishSteps() {
    try {
      const n = await runCronDbExclusive(this.logger, 'autoOpenAvailableSteps', () =>
        this.dishSteps.autoOpenAvailableSteps(),
      );
      if (typeof n === 'number' && n > 0) this.logger.log(`Auto-opened ${n} dish step(s)`);
    } catch (e) {
      logCronError(this.logger, 'autoOpenAvailableSteps', e);
    }
  }
}
