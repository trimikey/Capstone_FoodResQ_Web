import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignDishStep, CampaignMenuStepStatus } from '@prisma/client';
import { UserRole } from '@foodresq/types';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

/**
 * Quy trình 4 khâu cố định — sinh tự động cho mỗi món trong chiến dịch.
 * Giờ dự kiến (HH:mm, giờ VN) truyền từ setup của bếp trưởng (admin ORG).
 */
export const FIXED_DISH_STEPS = [
  { order: 1, name: 'Sơ chế' },
  { order: 2, name: 'Nấu' },
  { order: 3, name: 'Trình bày' },
  { order: 4, name: 'Sẵn sàng phát xuất' },
] as const;

/** VN là UTC+7 cố định, không có giờ mùa hè. */
const VN_UTC_OFFSET_HOURS = 7;

/** VN là UTC+7 cố định — so sánh HH:mm trực tiếp (cả 2 cùng timezone VN). */
function vnHhmmToTotalMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m; // 06:00 → 360, 17:00 → 1020
}

/**
 * Mốc thời gian của chiến dịch, đủ để neo `scheduledTime` (chỉ có HH:mm) vào một
 * ngày cụ thể.
 */
export interface CampaignTiming {
  /** Cột DATE — Prisma trả về nửa đêm UTC của ngày đó. */
  scheduledDate: Date;
  endDate: Date | null;
  startTime: string;
  endTime: string;
}

/**
 * Đổi `HH:mm` (giờ VN) của một khâu thành mốc UTC tuyệt đối.
 *
 * `scheduledTime` không mang ngày, nên chỉ so giờ-trong-ngày thì chiến dịch qua đêm
 * bị hiểu sai: chiến dịch 18:00 hôm nay → 12:00 trưa mai có khâu "12:00" thuộc NGÀY MAI,
 * nhưng so HH:mm đơn thuần lại coi là đã tới giờ ngay từ trưa hôm nay.
 *
 * Quy tắc neo ngày: chỉ những chiến dịch mà khung giờ tự vắt qua nửa đêm
 * (`endTime <= startTime`) mới có khâu thuộc ngày kế tiếp — và chỉ khâu nào có giờ
 * NHỎ HƠN `startTime` mới bị đẩy sang ngày sau.
 *
 * Cố ý KHÔNG suy ra từ `endDate > scheduledDate`: chiến dịch nhiều ngày thường lặp
 * lại cùng khung giờ mỗi ngày (vd 06:00–17:00 trong 3 ngày) chứ không vắt qua đêm,
 * mà bộ 4 khâu chỉ tồn tại một lần cho mỗi món — đẩy ngày ở trường hợp đó sẽ khoá
 * khâu sai.
 */
export function stepDueAtUtc(campaign: CampaignTiming, scheduledTime: string): Date {
  const startMin = vnHhmmToTotalMinutes(campaign.startTime);
  const endMin = vnHhmmToTotalMinutes(campaign.endTime);
  const stepMin = vnHhmmToTotalMinutes(scheduledTime);

  const wrapsMidnight = endMin <= startMin;
  const dayOffset = wrapsMidnight && stepMin < startMin ? 1 : 0;

  // scheduledDate là cột DATE → nửa đêm UTC của ngày VN đó. Giờ VN quy về UTC
  // bằng cách trừ đi offset.
  const vnMidnightUtcMs = Date.UTC(
    campaign.scheduledDate.getUTCFullYear(),
    campaign.scheduledDate.getUTCMonth(),
    campaign.scheduledDate.getUTCDate(),
  );
  return new Date(
    vnMidnightUtcMs +
      dayOffset * 86_400_000 +
      (stepMin - VN_UTC_OFFSET_HOURS * 60) * 60_000,
  );
}

@Injectable()
export class DishStepsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private systemConfig: SystemConfigService,
  ) {}

  /**
   * Toggle test/vận hành sớm của admin (CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN):
   * bật thì các khâu nấu KHÔNG phải chờ đến giờ dự kiến — chỉ còn ràng buộc
   * "khâu trước hoàn thành" (và duyệt ảnh QC cho khâu 4).
   */
  private async allowEarlySteps(): Promise<boolean> {
    return (await this.systemConfig.getNumber('CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN')) === 1;
  }

  /** Khẳng định `userId` là TNV có phân công chef/waiter đang hoạt động trong campaign. */
  private async assertAssignedVolunteer(campaignId: string, userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: { select: { status: true } },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status !== 'active') {
      throw new ForbiddenException('Tài khoản của bạn chưa ở trạng thái hoạt động.');
    }

    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId,
        volunteerId: volunteer.id,
        role: { in: ['chef', 'waiter', 'shipper'] },
        status: { in: ['assigned', 'checked_in', 'in_progress'] },
      },
      select: { id: true, role: true, status: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Bạn chưa được phân công vào chiến dịch này.');
    }
    return { volunteer, assignment };
  }

  /** Khẳng định `userId` là tổ chức chủ chiến dịch (để quản lý menu + steps). */
  private async assertCampaignOwner(campaignId: string, userId: string) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: { charityReceiver: { select: { id: true, userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!receiver || campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException('Chỉ tổ chức tạo chiến dịch mới thao tác được.');
    }
    return campaign;
  }

  /**
   * Tạo 4 step cố định cho 1 menu item. Nếu đã có thì bỏ qua (idempotent).
   * Gọi tự động khi charity thêm món vào thực đơn, hoặc bằng endpoint thủ công.
   */
  async ensureStepsForMenuItem(
    campaignId: string,
    menuItemId: string,
    scheduledTimes: string[],
  ): Promise<CampaignDishStep[]> {
    if (scheduledTimes.length !== FIXED_DISH_STEPS.length) {
      throw new BadRequestException(
        `Cần đúng ${FIXED_DISH_STEPS.length} giờ dự kiến cho 4 khâu (Sơ chế, Nấu, Trình bày, Sẵn sàng).`,
      );
    }
    for (const t of scheduledTimes) {
      if (!/^\d{2}:\d{2}$/.test(t)) {
        throw new BadRequestException(`Giờ dự kiến không hợp lệ: "${t}" (định dạng HH:mm).`);
      }
    }

    const existing = await this.prisma.campaignDishStep.findMany({
      where: { campaignId, menuItemId },
      orderBy: { stepOrder: 'asc' },
    });
    if (existing.length === FIXED_DISH_STEPS.length) return existing;

    // Nếu partial (ví dụ seed dở) thì xóa + tạo lại cho clean
    if (existing.length > 0) {
      await this.prisma.campaignDishStep.deleteMany({ where: { campaignId, menuItemId } });
    }

    const data = FIXED_DISH_STEPS.map((step, idx) => ({
      campaignId,
      menuItemId,
      stepOrder: step.order,
      stepName: step.name,
      scheduledTime: scheduledTimes[idx],
    }));
    await this.prisma.campaignDishStep.createMany({ data });
    return this.prisma.campaignDishStep.findMany({
      where: { campaignId, menuItemId },
      orderBy: { stepOrder: 'asc' },
    });
  }

  /** Tổ chức thiết lập / cập nhật giờ dự kiến 4 khâu cho 1 món. */
  async setScheduledTimes(
    campaignId: string,
    userId: string,
    menuItemId: string,
    scheduledTimes: string[],
  ) {
    await this.assertCampaignOwner(campaignId, userId);
    const menuItem = await this.prisma.campaignMenuItem.findUnique({ where: { id: menuItemId } });
    if (!menuItem || menuItem.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy món trong chiến dịch này.');
    }
    return this.ensureStepsForMenuItem(campaignId, menuItemId, scheduledTimes);
  }

  /**
   * Tính trạng thái thực tế của 1 step dựa trên giờ hiện tại + trạng thái khâu trước.
   * Trả về CampaignMenuStepStatus mới, không nhất thiết khác status hiện tại trong DB
   * (nếu đã done thì giữ nguyên).
   *
   * `campaign` cần thiết để neo `scheduledTime` (chỉ có HH:mm) vào đúng ngày —
   * xem `stepDueAtUtc`.
   */
  computeEffectiveStatus(
    step: Pick<CampaignDishStep, 'status' | 'scheduledTime'>,
    prevStepDone: boolean,
    isFirstStep: boolean,
    campaign: CampaignTiming,
    /** true (toggle admin bật) = bỏ ràng buộc "đến giờ dự kiến" — dùng để test. */
    ignoreSchedule = false,
  ): CampaignMenuStepStatus {
    if (step.status === 'done') return 'done';
    const onTime = ignoreSchedule || Date.now() >= stepDueAtUtc(campaign, step.scheduledTime).getTime();
    const prevOk = isFirstStep || prevStepDone;
    if (onTime && prevOk) return 'available';
    return 'locked';
  }

  /**
   * Cron: mở khoá các step đủ điều kiện (đến giờ + khâu trước done).
   * Được gọi mỗi 30 giây từ `CampaignsCron`.
   */
  async autoOpenAvailableSteps(): Promise<number> {
    const nowMs = Date.now();
    const earlyOk = await this.allowEarlySteps();
    // Cửa sổ ngày VN: hôm qua → hôm nay. Chiến dịch qua đêm (18:00 hôm qua →
    // 12:00 trưa nay) có `scheduledDate` là HÔM QUA nhưng vẫn đang chạy, nên chỉ
    // lấy đúng ngày hôm nay sẽ bỏ sót. Điều kiện đến-giờ thật sự do
    // `stepDueAtUtc` quyết định, query này chỉ để giới hạn số bản ghi.
    const nowVn = new Date(nowMs + VN_UTC_OFFSET_HOURS * 3_600_000);
    const todayVnStart = new Date(
      Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()),
    );
    const windowStart = new Date(todayVnStart.getTime() - 86_400_000);
    const windowEnd = new Date(todayVnStart.getTime() + 86_400_000);

    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: {
        status: { in: ['in_progress', 'approved'] },
        scheduledDate: { gte: windowStart, lt: windowEnd },
      },
      select: {
        id: true,
        scheduledDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
      },
    });
    if (campaigns.length === 0) return 0;
    const timingById = new Map(campaigns.map((c) => [c.id, c]));

    const allSteps = await this.prisma.campaignDishStep.findMany({
      where: { campaignId: { in: campaigns.map((c) => c.id) }, status: { in: ['locked', 'available'] } },
      orderBy: [{ menuItemId: 'asc' }, { stepOrder: 'asc' }],
    });

    // Group theo menu_item → prev done?
    const byMenu = new Map<string, typeof allSteps>();
    for (const s of allSteps) {
      const arr = byMenu.get(s.menuItemId) ?? [];
      arr.push(s);
      byMenu.set(s.menuItemId, arr);
    }

    const toOpen: { id: string }[] = [];
    for (const [, steps] of byMenu) {
      let prevDone = true; // step 1 không cần khâu trước
      for (const s of steps) {
        const timing = timingById.get(s.campaignId);
        // Bỏ qua nếu không tra được campaign — không đủ dữ liệu để neo ngày.
        // Toggle test của admin bật → coi như luôn đến giờ.
        const onTime = earlyOk || (timing ? nowMs >= stepDueAtUtc(timing, s.scheduledTime).getTime() : false);
        // Chỉ mở nếu đến giờ VÀ khâu trước đã done.
        if (onTime && prevDone && s.status === 'locked') {
          toOpen.push({ id: s.id });
        }
        // prevDone cho vòng lặp kế tiếp dựa trên DB status hiện tại
        // (không tính các step vừa push vào toOpen vì chưa commit).
        // Khâu QC (3) done nhưng ảnh chưa được tổ chức duyệt → khâu 4 vẫn khoá.
        prevDone =
          s.status === 'done' && (s.stepOrder !== 3 || s.reviewStatus === 'approved');
      }
    }

    if (toOpen.length === 0) return 0;
    const result = await this.prisma.campaignDishStep.updateMany({
      where: { id: { in: toOpen.map((x) => x.id) }, status: { in: ['locked'] } },
      data: { status: 'available', openedAt: new Date() },
    });
    return result.count;
  }

  /**
   * TNV tick "xong" 1 khâu. Validate:
   *  - Đúng khâu + món thuộc campaign mà user là chef/waiter.
   *  - Step phải `available` (đủ 2 đk AND: đến giờ + khâu trước done).
   *  - Bắt buộc có ảnh bằng chứng.
   * Sau khi tick done: tự động mở khoá step tiếp theo (nếu đến giờ).
   */
  async completeStep(
    campaignId: string,
    userId: string,
    stepId: string,
    proof: Express.Multer.File | undefined,
    note: string | undefined,
  ) {
    if (!proof) {
      throw new BadRequestException('Vui lòng chụp ảnh bằng chứng trước khi xác nhận hoàn thành khâu.');
    }
    const { volunteer } = await this.assertAssignedVolunteer(campaignId, userId);

    const step = await this.prisma.campaignDishStep.findUnique({
      where: { id: stepId },
      include: {
        menuItem: { select: { id: true, campaignId: true } },
      },
    });
    if (!step || step.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy khâu này trong chiến dịch.');
    }

    // Lấy timing để computeEffectiveStatus
    const campaignTiming = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { scheduledDate: true, endDate: true, startTime: true, endTime: true },
    });
    if (!campaignTiming) {
      throw new NotFoundException('Không tìm thấy chiến dịch.');
    }

    // Tính lại trạng thái hiệu lực (đến giờ + khâu trước done?). Khâu 4 còn đòi
    // thêm: ảnh QC khâu 3 phải được TỔ CHỨC duyệt rồi mới được làm.
    const prevStep = await this.prisma.campaignDishStep.findFirst({
      where: { menuItemId: step.menuItemId, stepOrder: step.stepOrder - 1 },
      select: { status: true, reviewStatus: true },
    });
    const prevOk =
      prevStep?.status === 'done' &&
      (step.stepOrder !== 4 || prevStep.reviewStatus === 'approved');
    const earlyOk = await this.allowEarlySteps();
    const effective = this.computeEffectiveStatus(step, prevOk, step.stepOrder === 1, campaignTiming, earlyOk);
    if (effective === 'locked') {
      throw new BadRequestException(
        step.stepOrder === 4 && prevStep?.status === 'done' && prevStep.reviewStatus !== 'approved'
          ? 'Ảnh QC của món này đang chờ tổ chức duyệt — được duyệt xong mới xác nhận sẵn sàng phát xuất.'
          : 'Khâu này chưa thể thực hiện — chưa đến giờ hoặc khâu trước chưa hoàn thành.',
      );
    }
    if (step.status === 'done') {
      throw new BadRequestException('Khâu này đã được hoàn thành trước đó.');
    }

    const proofUrl = await this.storage.saveImage(proof, 'dish-step-proofs');

    const isQcStep = step.stepOrder === 3;
    const updated = await this.prisma.campaignDishStep.update({
      where: { id: stepId },
      data: {
        status: 'done',
        completedAt: new Date(),
        completedByVolunteerId: volunteer.id,
        proofUrl,
        note: note ?? null,
        openedAt: step.openedAt ?? new Date(),
        // Khâu QC: ảnh vừa up phải chờ tổ chức duyệt (kể cả khi chụp lại sau khi bị từ chối)
        ...(isQcStep ? { reviewStatus: 'pending', reviewedAt: null, reviewNote: null } : {}),
      },
    });

    if (isQcStep) {
      // Báo tổ chức vào duyệt ảnh QC — khâu 4 bị khoá cho tới khi duyệt.
      const menuItem = await this.prisma.campaignMenuItem.findUnique({
        where: { id: step.menuItemId },
        select: { customName: true, recipe: { select: { name: true } } },
      });
      const dishName = menuItem?.customName ?? menuItem?.recipe?.name ?? 'Món chưa đặt tên';
      await this.notifications.notifyCampaignOwner(campaignId, {
        type: 'campaign',
        title: `Ảnh QC món "${dishName}" đang chờ duyệt`,
        body:
          `Bếp đã hoàn tất khâu QC và tải ảnh lên. Vào tab "Quy trình bếp" để duyệt — `
          + `món chỉ được chuyển sang "Sẵn sàng phát xuất" sau khi bạn duyệt ảnh.`,
        data: { campaignId, stepId, menuItemId: step.menuItemId },
      });
    } else {
      // Tự động mở khoá step kế tiếp (nếu đã đến giờ). Khâu sau QC không tự mở —
      // phải chờ tổ chức duyệt ảnh (reviewQcStep sẽ mở).
      const nextStep = await this.prisma.campaignDishStep.findFirst({
        where: { menuItemId: step.menuItemId, stepOrder: step.stepOrder + 1 },
        select: { id: true, scheduledTime: true, status: true },
      });
      if (nextStep && nextStep.status !== 'done') {
        const now = Math.floor((Date.now() + VN_UTC_OFFSET_HOURS * 3_600_000) / 60_000) % (24 * 60);
        const scheduled = vnHhmmToTotalMinutes(nextStep.scheduledTime);
        if (earlyOk || now >= scheduled) {
          await this.prisma.campaignDishStep.update({
            where: { id: nextStep.id },
            data: { status: 'available', openedAt: new Date() },
          });
        }
      }
    }

    // Nếu là khâu cuối (sẵn sàng phát xuất) → đánh dấu assignment hoàn thành (nếu chef)
    if (step.stepOrder === 4) {
      await this.maybeCompleteAssignment(campaignId, volunteer.id);
    }

    return updated;
  }

  /** Nếu tất cả step cuối (order=4) của các món đã done → set assignment = completed. */
  private async maybeCompleteAssignment(campaignId: string, volunteerId: string) {
    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId, volunteerId, role: 'chef', status: { in: ['checked_in', 'in_progress'] } },
    });
    if (!assignment) return;
    const pendingLastSteps = await this.prisma.campaignDishStep.count({
      where: {
        campaignId,
        menuItem: { campaignId },
        stepOrder: 4,
        status: { not: 'done' },
      },
    });
    if (pendingLastSteps === 0) {
      await this.prisma.campaignVolunteerAssignment.update({
        where: { id: assignment.id },
        data: { status: 'completed' },
      });
    }
  }

  /**
   * TỔ CHỨC duyệt / từ chối ẢNH khâu QC (stepOrder=3) mà chef đã tải lên.
   *
   *  - approve: reviewStatus='approved' → khâu 4 "Sẵn sàng phát xuất" được mở
   *    (tự mở luôn nếu đã đến giờ); báo chef.
   *  - reject:  reviewStatus='rejected' + lưu lý do; khâu 3 quay về `available`
   *    để chef chụp lại (chụp lại xong tự về 'pending' chờ duyệt lần nữa); báo chef.
   */
  async reviewQcStep(
    campaignId: string,
    userId: string,
    stepId: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    await this.assertCampaignOwner(campaignId, userId);

    const step = await this.prisma.campaignDishStep.findUnique({
      where: { id: stepId },
      include: {
        menuItem: { select: { customName: true, recipe: { select: { name: true } } } },
        completedByVolunteer: { select: { userId: true } },
      },
    });
    if (!step || step.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy khâu này trong chiến dịch.');
    }
    if (step.stepOrder !== 3) {
      throw new BadRequestException('Chỉ khâu QC (khâu 3) mới cần tổ chức duyệt ảnh.');
    }
    if (step.status !== 'done' || step.reviewStatus !== 'pending') {
      throw new BadRequestException('Khâu này không ở trạng thái chờ duyệt ảnh.');
    }

    const dishName = step.menuItem.customName ?? step.menuItem.recipe?.name ?? 'Món chưa đặt tên';
    const chefUserId = step.completedByVolunteer?.userId ?? null;

    if (action === 'approve') {
      const updated = await this.prisma.campaignDishStep.update({
        where: { id: stepId },
        data: { reviewStatus: 'approved', reviewedAt: new Date(), reviewNote: null },
      });

      // Mở luôn khâu 4 nếu đã đến giờ — chef không phải chờ cron.
      const finalStep = await this.prisma.campaignDishStep.findFirst({
        where: { menuItemId: step.menuItemId, stepOrder: 4 },
        select: { id: true, scheduledTime: true, status: true },
      });
      if (finalStep && finalStep.status === 'locked') {
        const campaignTiming = await this.prisma.kitchenCampaign.findUnique({
          where: { id: campaignId },
          select: { scheduledDate: true, endDate: true, startTime: true, endTime: true },
        });
        const earlyOk = await this.allowEarlySteps();
        if (
          earlyOk ||
          (campaignTiming && Date.now() >= stepDueAtUtc(campaignTiming, finalStep.scheduledTime).getTime())
        ) {
          await this.prisma.campaignDishStep.update({
            where: { id: finalStep.id },
            data: { status: 'available', openedAt: new Date() },
          });
        }
      }

      if (chefUserId) {
        void this.notifications.notify(chefUserId, {
          type: 'campaign',
          title: `Ảnh QC món "${dishName}" đã được duyệt`,
          body: 'Tổ chức đã duyệt ảnh QC — bạn có thể xác nhận "Sẵn sàng phát xuất" khi đến giờ.',
          data: { campaignId, stepId, menuItemId: step.menuItemId },
        });
      }
      return { id: updated.id, reviewStatus: updated.reviewStatus, dishName };
    }

    // reject
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối để chef biết cần chụp/kiểm tra lại gì.');
    }
    const updated = await this.prisma.campaignDishStep.update({
      where: { id: stepId },
      data: {
        reviewStatus: 'rejected',
        reviewedAt: new Date(),
        reviewNote: trimmed,
        // Trả khâu 3 về available để chef làm lại — ảnh cũ vẫn giữ để đối chiếu.
        status: 'available',
      },
    });
    if (chefUserId) {
      void this.notifications.notify(chefUserId, {
        type: 'campaign',
        title: `Ảnh QC món "${dishName}" bị từ chối`,
        body: `Tổ chức từ chối ảnh QC: ${trimmed}. Vui lòng kiểm tra lại món và chụp ảnh mới.`,
        data: { campaignId, stepId, menuItemId: step.menuItemId },
      });
    }
    return { id: updated.id, reviewStatus: updated.reviewStatus, dishName };
  }

  /**
   * Tổ chức duyệt step cuối (sẵn sàng phát xuất) của một món.
   * Chef đã tick "Sẵn sàng phát xuất" → tổ chức kiểm tra và duyệt.
   * Sau khi duyệt → món có thể chuyển sang phân phát.
   */
  async approveDishFinalStep(
    campaignId: string,
    userId: string,
    menuItemId: string,
  ) {
    await this.assertCampaignOwner(campaignId, userId);

    const step = await this.prisma.campaignDishStep.findFirst({
      where: { campaignId, menuItemId, stepOrder: 4 },
      include: { menuItem: { select: { customName: true } } },
    });
    if (!step) {
      throw new NotFoundException('Không tìm thấy bước "Sẵn sàng phát xuất" của món này.');
    }
    if (step.status !== 'available') {
      throw new BadRequestException('Bước này chưa được chef tick hoặc đã được duyệt trước đó.');
    }

    const updated = await this.prisma.campaignDishStep.update({
      where: { id: step.id },
      data: {
        status: 'done',
      },
    });

    return { id: updated.id, status: updated.status, menuItemName: step.menuItem.customName };
  }

  /**
   * Tổ chức từ chối step cuối của một món (món chưa đạt yêu cầu).
   * Gửi notification cho chef để làm lại.
   */
  async rejectDishFinalStep(
    campaignId: string,
    userId: string,
    menuItemId: string,
    reason: string,
  ) {
    await this.assertCampaignOwner(campaignId, userId);

    const step = await this.prisma.campaignDishStep.findFirst({
      where: { campaignId, menuItemId, stepOrder: 4 },
      include: { menuItem: { select: { customName: true } } },
    });
    if (!step) {
      throw new NotFoundException('Không tìm thấy bước "Sẵn sàng phát xuất" của món này.');
    }

    // Reset về available để chef làm lại
    const updated = await this.prisma.campaignDishStep.update({
      where: { id: step.id },
      data: {
        status: 'available',
      },
    });

    // Gửi notification cho chef để thông báo bị từ chối
    try {
      await this.notifications.notifyCampaignOwner(campaignId, {
        type: 'campaign.qc_failure',
        title: `Món "${step.menuItem.customName}" chưa được duyệt`,
        body: `Tổ chức từ chối: ${reason}`,
      });
    } catch {
      // best-effort notification
    }

    return { id: updated.id, status: updated.status, menuItemName: step.menuItem.customName };
  }

  /**
   * Nguyên liệu / thực phẩm đang có sẵn cho chiến dịch — gồm 2 nguồn:
   *
   *  1. `requested` — từ `Campaign.supplyItems` (charity khai báo lúc đăng ký).
   *     Ví dụ: { name: "Gạo", unit: "kg", quantity: 15 }
   *     Đây là nhu cầu ban đầu, có ngay từ khi tạo campaign.
   *
   *  2. `received` (group theo itemName) + `donations` (chi tiết) — từ
   *     `CampaignDonation` đã được charity xác nhận nhận (`status = 'received'`).
   *     Đây là thực tế kho bếp đang có: provider góp + charity đã nhận.
   *
   * Trả về:
   *   - requested:  danh sách nguyên liệu đăng ký (để bếp trưởng biết cần bao nhiêu)
   *   - items:      group theo itemName từ donations
   *   - donations:  danh sách donation đầy đủ (chi tiết từng lượt góp)
   *   - total:      tổng số donation đã nhận
   */
  async getCampaignSupplies(campaignId: string) {
    // 1. Lấy campaign trước để đọc supplyItems + chắc chắn campaign tồn tại
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, supplyItems: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign không tồn tại.');
    }

    // 2. Parse supplyItems (charity khai báo lúc đăng ký)
    //    Schema: [{ name: string, unit?: string, quantity?: number }, ...]
    type RequestedSupply = { name: string; unit: string | null; quantity: number | null };
    const rawRequested = (campaign.supplyItems as unknown) ?? [];
    const requested: RequestedSupply[] = Array.isArray(rawRequested)
      ? (rawRequested as Array<Record<string, unknown>>)
          .map((it) => ({
            name: typeof it?.name === 'string' ? it.name.trim() : '',
            unit: typeof it?.unit === 'string' ? (it.unit as string) : null,
            quantity:
              typeof it?.quantity === 'number'
                ? it.quantity
                : typeof it?.quantity === 'string' && it.quantity.trim() !== ''
                  ? Number(it.quantity)
                  : null,
          }))
          .filter((it) => it.name.length > 0)
      : [];

    // 3. Donations đã nhận
    const donations = await this.prisma.campaignDonation.findMany({
      where: { campaignId, status: 'received' },
      orderBy: [{ itemName: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        itemName: true,
        quantity: true,
        note: true,
        receivedAt: true,
        provider: {
          select: {
            id: true,
            businessName: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    type Group = {
      itemName: string;
      entries: number;
      quantities: string[];
    };
    const byItem = new Map<string, Group>();
    for (const d of donations) {
      const g = byItem.get(d.itemName) ?? {
        itemName: d.itemName,
        entries: 0,
        quantities: [],
      };
      g.entries += 1;
      if (d.quantity) g.quantities.push(d.quantity);
      byItem.set(d.itemName, g);
    }

    return {
      requested,
      total: donations.length,
      items: Array.from(byItem.values()),
      donations,
    };
  }

  /**
   * Bếp trưởng / TNV QC đánh dấu 1 khâu fail chất lượng (ngắt khẩn cấp).
   * Hành vi:
   *   - Set qcFailedAt + qcFailedByVolunteerId + qcFailureReason.
   *   - Không xoá step, không ảnh hưởng step khác / món khác.
   *   - Gửi notification khẩn cho charity owner qua NotificationsGateway.
   * Điều kiện:
   *   - User là chef/waiter đang assigned vào campaign.
   *   - Step đang `available` (chưa done, chưa fail).
   */
  async flagStepQualityFail(
    campaignId: string,
    userId: string,
    stepId: string,
    reason: string,
  ) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('Vui lòng nhập lý do ngắt khẩn cấp.');
    }
    if (trimmed.length > 500) {
      throw new BadRequestException('Lý do tối đa 500 ký tự.');
    }

    const { volunteer } = await this.assertAssignedVolunteer(campaignId, userId);

    const step = await this.prisma.campaignDishStep.findUnique({
      where: { id: stepId },
      include: {
        menuItem: {
          select: { id: true, customName: true, recipe: { select: { name: true } } },
        },
      },
    });
    if (!step || step.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy khâu này trong chiến dịch.');
    }
    if (step.status === 'done') {
      throw new BadRequestException('Khâu này đã hoàn thành — không thể đánh dấu fail.');
    }
    if (step.qcFailedAt) {
      throw new BadRequestException('Khâu này đã được đánh dấu fail trước đó.');
    }

    const dishName =
      step.menuItem.customName ?? step.menuItem.recipe?.name ?? 'Món chưa đặt tên';

    const updated = await this.prisma.campaignDishStep.update({
      where: { id: stepId },
      data: {
        qcFailedAt: new Date(),
        qcFailedByVolunteerId: volunteer.id,
        qcFailureReason: trimmed,
      },
    });

    // Gửi notification khẩn cho charity owner (best-effort, không block).
    await this.notifications.notifyCampaignOwner(campaignId, {
      type: 'campaign.qc_failure',
      title: `⚠️ Ngắt khẩn cấp: ${dishName}`,
      body: `Bếp trưởng đã báo QC không đạt ở khâu "${step.stepName}". Lý do: ${trimmed}. Vui lòng xem và đưa ra phương án xử lý.`,
      data: {
        campaignId,
        stepId,
        dishId: step.menuItemId,
        dishName,
        stepOrder: step.stepOrder,
        stepName: step.stepName,
        reason: trimmed,
        reportedByVolunteerId: volunteer.id,
      },
    });

    return updated;
  }

  /** Trả về danh sách món + 4 step kèm trạng thái hiệu lực cho 1 campaign. */
  async getStepsForCampaign(campaignId: string, currentUserId?: string) {
    const campaignTiming = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { scheduledDate: true, endDate: true, startTime: true, endTime: true },
    });

    // Lấy menu items trước để check nếu cần auto-generate steps
    const menuItems = await this.prisma.campaignMenuItem.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, dishSteps: { select: { id: true } } },
    });

    // Nếu món nào chưa có step thì tự sinh với giờ mặc định.
    const defaultTimes = ['08:00', '09:00', '10:30', '11:30'];
    for (const mi of menuItems) {
      if (mi.dishSteps.length === 0) {
        await this.ensureStepsForMenuItem(campaignId, mi.id, defaultTimes);
      }
    }

    // Query đầy đủ sau khi đảm bảo steps tồn tại
    const reloaded = await this.prisma.campaignMenuItem.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
      include: {
        recipe: {
          select: {
            id: true,
            name: true,
            description: true,
            instructions: true,
            prepMinutes: true,
            cookMinutes: true,
            difficulty: true,
            imageUrls: true,
            ingredients: {
              select: { name: true, quantity: true },
            },
          },
        },
        dishSteps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            completedByVolunteer: {
              select: { user: { select: { fullName: true, avatarUrl: true } } },
            },
            qcFailedByVolunteer: {
              select: { user: { select: { fullName: true, avatarUrl: true } } },
            },
          },
        },
      },
    });

    // ── Đội bếp: tất cả chef trong campaign ───────────────────────────────
    const teamAssignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { campaignId, role: 'chef', status: { not: 'cancelled' } },
      select: {
        id: true,
        volunteer: {
          select: {
            id: true,
            user: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
        shift: { select: { id: true, label: true, startTime: true, endTime: true } },
      },
    });
    const cookingTeam = teamAssignments.map((a) => ({
      assignmentId: a.id,
      volunteerId: a.volunteer.id,
      userId: a.volunteer.user.id,
      fullName: a.volunteer.user.fullName,
      avatarUrl: a.volunteer.user.avatarUrl,
      shift: a.shift,
      isMe: currentUserId ? a.volunteer.user.id === currentUserId : false,
    }));

    // ── Safety logs: 5 bản ghi gần nhất ─────────────────────────────────
    const safetyLogs = await this.prisma.kitchenSafetyLog.findMany({
      where: { campaignId },
      orderBy: { checkedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        checkType: true,
        measuredValue: true,
        result: true,
        photoUrl: true,
        note: true,
        checkedAt: true,
        checkedBy: {
          select: { user: { select: { fullName: true } } },
        },
      },
    });

    function mapDish(mi: typeof reloaded[number]) {
      return {
        id: mi.id,
        name: mi.customName ?? mi.recipe?.name ?? 'Món chưa đặt tên',
        recipe: mi.recipe,
        plannedServings: mi.plannedServings,
        steps: mi.dishSteps,
      };
    }

    // Tính status hiệu lực (DB có thể đang 'locked' vì cron chưa chạy).
    if (!campaignTiming) {
      return {
        dishes: reloaded.map(mapDish),
        cookingTeam,
        safetyLogs,
      };
    }
    const earlyOk = await this.allowEarlySteps();
    return {
      dishes: reloaded.map((mi) => {
        const stepsWithStatus = mi.dishSteps.map((s, idx) => {
          const prev = mi.dishSteps[idx - 1];
          // Khâu 4 chỉ mở khi khâu QC (3) done VÀ ảnh đã được tổ chức duyệt.
          const prevOk =
            prev?.status === 'done' && (prev.stepOrder !== 3 || prev.reviewStatus === 'approved');
          const effective = this.computeEffectiveStatus(
            s,
            prevOk,
            idx === 0,
            campaignTiming,
            earlyOk,
          );
          return { ...s, effectiveStatus: effective };
        });
        return {
          id: mi.id,
          name: mi.customName ?? mi.recipe?.name ?? 'Món chưa đặt tên',
          recipe: mi.recipe,
          plannedServings: mi.plannedServings,
          steps: stepsWithStatus,
        };
      }),
      cookingTeam,
      safetyLogs,
    };
  }

  /** Lịch tuần: phân biệt volunteer (cá nhân) vs tổ chức.
   * - Volunteer: chỉ trả campaigns đã ĐƯỢC ASSIGN, kèm thông tin ca trực.
   * - Tổ chức: trả tất cả campaigns của tổ chức.
   * - Không có userId (chưa login): trả rỗng.
   */
  async getWeeklySchedule(weekStart: Date, userId?: string, role?: string) {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

    // Nếu chưa login → trả lịch trống
    if (!userId) {
      return { weekStart, isPersonalView: false, days: [] };
    }

    // Xác định role của user — dùng `role` được truyền từ controller
    if (!role) return { weekStart, isPersonalView: false, days: [] };

    // ── Volunteer (TNV) ─────────────────────────────────────────────────────
    if (role === UserRole.VOLUNTEER) {
      // Lấy volunteerProfile trước — volunteerId trong assignment là VolunteerProfile UUID
      const volunteer = await this.prisma.volunteerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!volunteer) return { weekStart, isPersonalView: true, days: [] };

      // Lấy assignments của volunteer trong tuần này.
      // CHỈ lấy ca thật: chờ duyệt + đã được nhận. Đăng ký bị TỪ CHỐI / đã hủy
      // không phải lịch làm việc — trước đây lấy tất nên lịch hiện cả ca rejected.
      // Lọc theo NGÀY TRỰC (workDate) — chiến dịch nhiều ngày mà lọc theo
      // scheduledDate thì mọi ca dồn hết vào ngày đầu tiên.
      const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
        where: {
          volunteerId: volunteer.id,
          status: { in: ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'] },
          campaign: { status: { in: ['approved', 'in_progress', 'completed'] } },
          OR: [
            { workDate: { gte: weekStart, lt: weekEnd } },
            { workDate: null, campaign: { scheduledDate: { gte: weekStart, lt: weekEnd } } },
          ],
        },
        include: {
          shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true } },
          campaign: {
            select: { id: true, title: true, scheduledDate: true, status: true },
          },
        },
      });

      if (assignments.length === 0) {
        return { weekStart, isPersonalView: true, days: [] };
      }

      // Gom theo ngày trực (fallback ngày chiến dịch cho bản ghi cũ không có workDate)
      const byDay = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const dayKey = (a.workDate ?? a.campaign.scheduledDate).toISOString().slice(0, 10);
        const arr = byDay.get(dayKey) ?? [];
        arr.push(a);
        byDay.set(dayKey, arr);
      }

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getTime() + i * 86_400_000);
        const key = d.toISOString().slice(0, 10);
        const dayAssignments = byDay.get(key) ?? [];
        return {
          date: key,
          campaigns: dayAssignments.map((a) => ({
            id: a.id,                          // assignmentId — dùng làm React key
            campaignId: a.campaign.id,         // campaign UUID — dùng cho link
            title: a.campaign.title,
            status: a.campaign.status,
            role: a.role,
            // Trạng thái duyệt của chính ca này — FE phân biệt "Chờ duyệt" với ca đã nhận.
            assignmentStatus: a.status,
            shift: a.shift
              ? {
                  id: a.shift.id,
                  label: a.shift.label,
                  startTime: a.shift.startTime,
                  endTime: a.shift.endTime,
                }
              : null,
          })),
        };
      });

      return { weekStart, isPersonalView: true, days };
    }

    // ── Tổ chức (CHARITY) ───────────────────────────────────────────────────
    if (role === UserRole.RECEIVER) {
      const receiver = await this.prisma.receiverProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!receiver) return { weekStart, isPersonalView: false, days: [] };

      const campaigns = await this.prisma.kitchenCampaign.findMany({
        where: {
          charityReceiverId: receiver.id,
          scheduledDate: { gte: weekStart, lt: weekEnd },
          status: { in: ['approved', 'in_progress', 'completed'] },
        },
        select: { id: true, title: true, scheduledDate: true, status: true },
      });

      const byDay = new Map<string, typeof campaigns>();
      for (const c of campaigns) {
        const dayKey = c.scheduledDate.toISOString().slice(0, 10);
        const arr = byDay.get(dayKey) ?? [];
        arr.push(c);
        byDay.set(dayKey, arr);
      }

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getTime() + i * 86_400_000);
        const key = d.toISOString().slice(0, 10);
        const dayCampaigns = byDay.get(key) ?? [];
        return {
          date: key,
          campaigns: dayCampaigns.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
          })),
        };
      });

      return { weekStart, isPersonalView: false, days };
    }

    // Các role khác (ADMIN, PROVIDER, ...) → trả lịch trống
    return { weekStart, isPersonalView: false, days: [] };
  }
}
