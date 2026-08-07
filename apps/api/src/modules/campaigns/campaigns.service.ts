import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { DeliveriesService } from '@/modules/deliveries/deliveries.service';
import { CreateCampaignDto, ApplyCampaignDto, SubmitCampaignChangeDto, SendProviderRequestDto, SubmitProviderProposalDto, ReviewAssignmentDto, CreateDistributionDto, CreateShiftDto, UpdateShiftDto, AppendMenuItemDto, AppendSupplyItemDto, ReviewProviderRequestDto } from './dto/campaign.dto';

// State machine cho công việc của TNV trong chiến dịch
const ASSIGN_NEXT: Record<string, string> = {
  assigned: 'checked_in',   // điểm danh tại bếp
  checked_in: 'in_progress', // bắt đầu làm (đầu bếp: chụp nguyên liệu)
  in_progress: 'completed',  // hoàn thành (chụp kết quả: món đã nấu / đã giao)
};
// Điểm cống hiến khi hoàn thành theo vai trò
const ASSIGN_POINTS: Record<string, number> = { chef: 15, waiter: 10, shipper: 10 };

const SLOT_FIELD: Record<string, { needed: keyof CampaignSlots; filled: keyof CampaignSlots }> = {
  chef: { needed: 'chefSlotsNeeded', filled: 'chefSlotsFilled' },
  waiter: { needed: 'waiterSlotsNeeded', filled: 'waiterSlotsFilled' },
  shipper: { needed: 'shipperSlotsNeeded', filled: 'shipperSlotsFilled' },
};

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

interface CampaignSlots {
  chefSlotsNeeded: number;
  waiterSlotsNeeded: number;
  shipperSlotsNeeded: number;
  chefSlotsFilled: number;
  waiterSlotsFilled: number;
  shipperSlotsFilled: number;
}

interface SupplyTarget {
  name: string;
  key: string;
  targetQuantity: number;
  unit: string;
}

interface DonationForProgress {
  itemName: string;
  quantity: string | null;
  status: string;
}

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private systemConfig: SystemConfigService,
    private deliveries: DeliveriesService,
  ) {}

  /** Số ngày (theo lịch UTC) từ hôm nay đến `date`. */
  private daysUntil(date: Date): number {
    const now = new Date();
    const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return Math.round((target - startToday) / 86_400_000);
  }

  /** Đầu ngày hôm nay (theo lịch UTC) — dùng để lọc chiến dịch đã qua hạn. */
  private startOfTodayUTC(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private assertWithinCheckInWindow(
    campaign: { scheduledDate: Date; endDate: Date | null; startTime: string; endTime: string },
    shift: { role: string | null; startTime: string; endTime: string } | null,
    assignmentRole: string,
  ) {
    if (shift?.role && shift.role !== assignmentRole) {
      throw new BadRequestException('Ca trực được phân công không phù hợp với vai trò của bạn.');
    }

    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
    const localDate = `${local.year}-${local.month}-${local.day}`;
    const scheduledDate = campaign.scheduledDate.toISOString().slice(0, 10);
    const endDate = (campaign.endDate ?? campaign.scheduledDate).toISOString().slice(0, 10);

    if (localDate < scheduledDate || localDate > endDate) {
      throw new BadRequestException('Chỉ có thể điểm danh trong ngày chiến dịch được phân công.');
    }
  }

  private normalizeSupplyKey(value: string): string {
    return value.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private parseSupplyTargets(raw: unknown): SupplyTarget[] {
    if (!Array.isArray(raw)) return [];
    const targets: SupplyTarget[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const data = item as { name?: unknown; quantity?: unknown; unit?: unknown };
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
      const quantity =
        typeof data.quantity === 'number'
          ? data.quantity
          : typeof data.quantity === 'string'
            ? Number(data.quantity)
            : NaN;
      if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0) continue;
      targets.push({
        name,
        key: this.normalizeSupplyKey(name),
        targetQuantity: this.roundQuantity(quantity),
        unit,
      });
    }
    return targets;
  }

  private parseDonationQuantity(raw: string | null, expectedUnit: string): number | null {
    if (!raw) return null;
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) return null;
    const quantity = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const unit = match[2].trim();
    if (unit && this.normalizeSupplyKey(unit) !== this.normalizeSupplyKey(expectedUnit)) return null;
    return quantity;
  }

  private buildSupplyProgress(supplyItems: unknown, donations: DonationForProgress[]) {
    return this.parseSupplyTargets(supplyItems).map((target) => {
      const related = donations.filter((d) => this.normalizeSupplyKey(d.itemName) === target.key);
      const pledgedQuantity = related.reduce((sum, d) => {
        if (!['pledged', 'received'].includes(d.status)) return sum;
        return sum + (this.parseDonationQuantity(d.quantity, target.unit) ?? 0);
      }, 0);
      const receivedQuantity = related.reduce((sum, d) => {
        if (d.status !== 'received') return sum;
        return sum + (this.parseDonationQuantity(d.quantity, target.unit) ?? 0);
      }, 0);
      const committedQuantity = this.roundQuantity(pledgedQuantity);
      const confirmedQuantity = this.roundQuantity(receivedQuantity);
      const remainingQuantity = this.roundQuantity(Math.max(0, target.targetQuantity - committedQuantity));
      const receivedRemainingQuantity = this.roundQuantity(Math.max(0, target.targetQuantity - confirmedQuantity));
      return {
        name: target.name,
        unit: target.unit,
        targetQuantity: target.targetQuantity,
        pledgedQuantity: committedQuantity,
        receivedQuantity: confirmedQuantity,
        remainingQuantity,
        receivedRemainingQuantity,
        progressPercent: target.targetQuantity > 0 ? Math.min(100, Math.round((committedQuantity / target.targetQuantity) * 100)) : 0,
        isTargetMet: remainingQuantity <= 0,
      };
    });
  }

  private withSupplyProgress<T extends { supplyItems: unknown; donations?: DonationForProgress[] }>(campaign: T) {
    return {
      ...campaign,
      supplyProgress: this.buildSupplyProgress(campaign.supplyItems, campaign.donations ?? []),
    };
  }

  /**
   * Tổ chức từ thiện gửi YÊU CẦU tạo chiến dịch → tạo ở trạng thái 'draft' (chờ duyệt).
   * Admin duyệt (draft → open) thì chiến dịch mới hiển thị công khai & nhận TNV.
   */
  async create(userId: string, dto: CreateCampaignDto) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true, isCharityOrg: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    if (!receiver.isCharityOrg) {
      throw new ForbiddenException('Chỉ tổ chức từ thiện mới được gửi yêu cầu tạo chiến dịch bếp ăn.');
    }

    // Validate ca trực trước khi INSERT (nếu giờ kết thúc <= bắt đầu → fail-fast)
    if (dto.shifts?.length) {
      for (const [i, s] of dto.shifts.entries()) {
        if (s.endTime <= s.startTime) {
          throw new BadRequestException(
            `Ca thứ ${i + 1} "${s.label}": giờ kết thúc phải sau giờ bắt đầu (${s.startTime} → ${s.endTime}).`,
          );
        }
      }
    }

    // Chỉ lưu menu/supply có name (tránh row rỗng)
    const menuRows = (dto.menuItems ?? [])
      .filter((m) => m.name?.trim())
      .map((m, sortOrder) => ({
        customName: m.name.trim(),
        plannedServings: m.plannedServings ?? null,
        recipeId: m.recipeId ?? null,
        sortOrder,
      }));

    // supplyItems sau @Transform ở DTO đã là SupplyItemDto[] (string[] được wrap thành {name})
    const supplyJson = (dto.supplyItems ?? [])
      .filter((s) => s.name?.trim())
      .map((s) => ({ name: s.name.trim(), quantity: s.quantity ?? null, unit: s.unit ?? null }));

    // Validate & default endDate (>= scheduledDate, mặc định = scheduledDate nếu bỏ trống)
    const startDateObj = new Date(`${dto.scheduledDate}T00:00:00Z`);
    let endDateObj: Date;
    if (dto.endDate) {
      endDateObj = new Date(`${dto.endDate}T00:00:00Z`);
      if (Number.isNaN(endDateObj.getTime())) {
        throw new BadRequestException('Ngày kết thúc không hợp lệ.');
      }
      if (endDateObj < startDateObj) {
        throw new BadRequestException('Ngày kết thúc phải >= ngày bắt đầu.');
      }
    } else {
      endDateObj = startDateObj;
    }
    const endDateStr = endDateObj.toISOString().slice(0, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      // INSERT campaign (raw SQL vì cần ST_SetSRID cho geography)
      const [row] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO kitchen_campaigns (
          charity_receiver_id, title, description, kitchen_address, kitchen_location,
          scheduled_date, end_date, start_time, end_time,
          chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
          expected_servings, image_urls, menu_items, schedule_items, supply_items,
          status, created_at, updated_at
        ) VALUES (
          ${receiver.id}::uuid, ${dto.title}, ${dto.description ?? null}, ${dto.kitchenAddress},
          ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
          ${dto.scheduledDate}::date, ${endDateStr}::date, ${dto.startTime}, ${dto.endTime},
          ${dto.chefSlotsNeeded ?? 0}, ${dto.waiterSlotsNeeded ?? 0}, ${dto.shipperSlotsNeeded ?? 0},
          ${dto.expectedServings ?? null}, ${JSON.stringify(dto.imageUrls ?? [])}::jsonb,
          ${JSON.stringify(menuRows)}::jsonb,
          ${JSON.stringify(dto.scheduleItems ?? [])}::jsonb,
          ${JSON.stringify(supplyJson)}::jsonb,
          'draft'::campaign_status, NOW(), NOW()
        )
        RETURNING id
      `);

      // INSERT shifts (bảng thật, mỗi shift 1 row)
      if (dto.shifts?.length) {
        await tx.campaignShift.createMany({
          data: dto.shifts.map((s) => ({
            campaignId: row.id,
            label: s.label.trim(),
            role: s.role ?? null,
            startTime: s.startTime,
            endTime: s.endTime,
            slotsNeeded: s.slotsNeeded,
          })),
        });
      }

      // INSERT menu items (bảng thật) — recipeId sẽ null tới khi FE bổ sung picker
      if (menuRows.length) {
        await tx.campaignMenuItem.createMany({
          data: menuRows.map((m) => ({
            campaignId: row.id,
            customName: m.customName,
            plannedServings: m.plannedServings,
            recipeId: m.recipeId,
            sortOrder: m.sortOrder,
          })),
        });
      }

      return row.id;
    });

    // Báo cho tất cả admin có yêu cầu chiến dịch cần duyệt
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', deletedAt: null },
      select: { id: true },
    });
    for (const a of admins) {
      void this.notifications.notify(a.id, {
        type: 'campaign',
        title: 'Yêu cầu chiến dịch mới',
        body: `Tổ chức gửi yêu cầu tạo chiến dịch "${dto.title}". Vui lòng xem & duyệt.`,
        data: { campaignId: created, status: 'draft' },
      });
    }

    return this.findOne(created);
  }

  /**
   * Tự động huỷ chiến dịch 'open' đã qua ngày diễn ra + giờ kết thúc
   * (dùng `endDate` để hỗ trợ campaign nhiều ngày).
   * Chạy định kỳ qua CampaignsCron.
   */
  async expireOverdueCampaigns(): Promise<number> {
    const now = new Date();
    const overdue = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'open', endDate: { not: null } },
      select: {
        id: true, title: true, endDate: true, endTime: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    const overdueIds: string[] = [];
    const overdueMeta: Array<{ id: string; title: string; userId: string }> = [];
    for (const c of overdue) {
      if (!c.endDate) continue;
      // endDate + endTime (UTC) < now → đã quá khứ
      const endAt = new Date(`${c.endDate.toISOString().slice(0, 10)}T${c.endTime}:00Z`);
      if (Number.isNaN(endAt.getTime()) || endAt.getTime() >= now.getTime()) continue;
      overdueIds.push(c.id);
      overdueMeta.push({ id: c.id, title: c.title, userId: c.charityReceiver.userId });
    }
    if (overdueIds.length === 0) return 0;

    await this.prisma.kitchenCampaign.updateMany({
      where: { id: { in: overdueIds } },
      data: { status: 'cancelled' },
    });

    for (const c of overdueMeta) {
      void this.notifications.notify(c.userId, {
        type: 'campaign',
        title: 'Chiến dịch đã quá hạn',
        body: `Chiến dịch "${c.title}" đã qua ngày diễn ra mà chưa được bắt đầu nên đã tự động huỷ.`,
        data: { campaignId: c.id, status: 'cancelled' },
      });
    }
    return overdueIds.length;
  }

  /**
   * Tự động hoàn tất các chiến dịch 'in_progress' đã qua endDate + endTime.
   * Lý do: trước đây campaign chỉ có scheduledDate + endTime trong ngày,
   * → qua ngày vẫn ở trạng thái "đang chạy" mãi. Cron này đảm bảo campaign
   * tự đóng lại khi kết thúc thời gian diễn ra.
   *
   * Lưu ý: không tự nhập actualServings — để null (campaign thực sự chạy
   * đến cuối vẫn dùng nút "Hoàn tất" ở UI charity). Cron chỉ đóng các
   * campaign "bị bỏ quên" không ai nhấn kết thúc.
   */
  async autoCompleteExpiredCampaigns(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'in_progress', endDate: { not: null } },
      select: {
        id: true, title: true, endDate: true, endTime: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    const expiredIds: string[] = [];
    const expiredMeta: Array<{ id: string; title: string; userId: string }> = [];
    for (const c of expired) {
      if (!c.endDate) continue;
      const endAt = new Date(`${c.endDate.toISOString().slice(0, 10)}T${c.endTime}:00Z`);
      if (Number.isNaN(endAt.getTime()) || endAt.getTime() >= now.getTime()) continue;
      expiredIds.push(c.id);
      expiredMeta.push({ id: c.id, title: c.title, userId: c.charityReceiver.userId });
    }
    if (expiredIds.length === 0) return 0;

    await this.prisma.kitchenCampaign.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'completed' },
    });

    for (const c of expiredMeta) {
      void this.notifications.notify(c.userId, {
        type: 'campaign',
        title: 'Chiến dịch đã được tự kết thúc',
        body: `Chiến dịch "${c.title}" đã qua ngày kết thúc nên hệ thống tự chuyển sang trạng thái hoàn tất.`,
        data: { campaignId: c.id, status: 'completed', auto: true },
      });
    }
    return expiredIds.length;
  }

  /**
   * Nhắc việc TNV:
   *  1. Ca sắp đến hạn trong [now, now+30 min]: gửi kind='deadline_30min'.
   *  2. Ca đã kết thúc quá 15 phút mà assignment vẫn 'assigned'/'checked_in':
   *     gửi kind='deadline_quarter_passed'.
   * Tránh spam: mỗi assignment + kind chỉ nhắc 1 lần / 6 giờ (dựa vào bảng notifications đã có).
   * Trả về tổng số notification đã gửi.
   */
  async nudgeUpcomingTasks(): Promise<number> {
    // 1) Ca sắp đến hạn trong 30 phút tới
    const upcoming = await this.prisma.$queryRaw<
      {
        assignment_id: string;
        volunteer_user_id: string;
        campaign_id: string;
        campaign_title: string;
        shift_id: string | null;
        shift_start_time: string | null;
        shift_label: string | null;
        assignment_role: string;
      }[]
    >(Prisma.sql`
      SELECT
        a.id          AS assignment_id,
        u.id          AS volunteer_user_id,
        c.id          AS campaign_id,
        c.title       AS campaign_title,
        s.id          AS shift_id,
        s.start_time  AS shift_start_time,
        s.label       AS shift_label,
        a.role        AS assignment_role
      FROM campaign_volunteer_assignments a
      JOIN kitchen_campaigns c ON c.id = a.campaign_id
      LEFT JOIN campaign_shifts s ON s.id = a.shift_id
      JOIN volunteer_profiles vp ON vp.id = a.volunteer_id
      JOIN users u ON u.id = vp.user_id
      WHERE c.status = 'in_progress'
        AND a.status IN ('assigned', 'checked_in')
        AND s.start_time IS NOT NULL
        AND (s.start_time::time - LOCALTIME) BETWEEN INTERVAL '0 minute' AND INTERVAL '30 minute'
        AND u.deleted_at IS NULL
      LIMIT 200;
    `);

    let sent = 0;

    for (const row of upcoming) {
      // Không gửi nếu đã có thông báo cùng kind trong 6 giờ qua
      const recent = await this.prisma.notification.findFirst({
        where: {
          userId: row.volunteer_user_id,
          type: 'campaign_urgent',
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      // dùng JSON path data.kind (nếu đã có recent cùng reference)
      const recentRef =
        recent && (recent.data as Record<string, unknown> | null)?.referenceId === row.assignment_id
          ? recent
          : null;
      if (recentRef) continue;

      await this.notifications.notify(row.volunteer_user_id, {
        type: 'campaign_urgent',
        title: 'Sắp đến giờ ca của bạn',
        body: `Ca "${row.shift_label ?? 'trực chiến dịch'}" tại "${row.campaign_title}" bắt đầu lúc ${row.shift_start_time}. Hãy sẵn sàng tới bếp.`,
        data: {
          kind: 'deadline_30min',
          assignmentId: row.assignment_id,
          referenceId: row.assignment_id,
          campaignId: row.campaign_id,
          shiftId: row.shift_id,
        },
      });
      sent += 1;
    }

    // 2) Ca đã kết thúc > 15 phút mà chưa hoàn thành
    const overdue = await this.prisma.$queryRaw<
      {
        assignment_id: string;
        volunteer_user_id: string;
        campaign_id: string;
        campaign_title: string;
        shift_id: string | null;
        shift_end_time: string | null;
        shift_label: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        a.id          AS assignment_id,
        u.id          AS volunteer_user_id,
        c.id          AS campaign_id,
        c.title       AS campaign_title,
        s.id          AS shift_id,
        s.end_time    AS shift_end_time,
        s.label       AS shift_label
      FROM campaign_volunteer_assignments a
      JOIN kitchen_campaigns c ON c.id = a.campaign_id
      LEFT JOIN campaign_shifts s ON s.id = a.shift_id
      JOIN volunteer_profiles vp ON vp.id = a.volunteer_id
      JOIN users u ON u.id = vp.user_id
      WHERE c.status = 'in_progress'
        AND a.status IN ('assigned', 'checked_in')
        AND s.end_time IS NOT NULL
        AND (LOCALTIME - s.end_time::time) BETWEEN INTERVAL '15 minute' AND INTERVAL '6 hour'
        AND u.deleted_at IS NULL
      LIMIT 200;
    `);

    for (const row of overdue) {
      const recent = await this.prisma.notification.findFirst({
        where: {
          userId: row.volunteer_user_id,
          type: 'campaign_urgent',
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      const recentRef =
        recent && (recent.data as Record<string, unknown> | null)?.referenceId === row.assignment_id
          ? recent
          : null;
      // Chỉ nhắc nếu CHƯA nhắc quá hạn cho assignment này trong 6h
      const recentOverdue = await this.prisma.notification.findFirst({
        where: {
          userId: row.volunteer_user_id,
          type: 'campaign_urgent',
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });
      if (recentOverdue && (recentOverdue.data as Record<string, unknown> | null)?.kind === 'deadline_quarter_passed') continue;
      void recentRef;

      await this.notifications.notify(row.volunteer_user_id, {
        type: 'campaign_urgent',
        title: 'Ca trực đã quá hạn',
        body: `Ca "${row.shift_label ?? 'trực chiến dịch'}" tại "${row.campaign_title}" kết thúc lúc ${row.shift_end_time}. Bạn chưa cập nhật hoàn thành — vui lòng xử lý.`,
        data: {
          kind: 'deadline_quarter_passed',
          assignmentId: row.assignment_id,
          referenceId: row.assignment_id,
          campaignId: row.campaign_id,
          shiftId: row.shift_id,
        },
      });
      sent += 1;
    }

    return sent;
  }

  /** Danh sách chiến dịch ĐÃ HOÀN THÀNH (success stories) — cho mục "câu chuyện thành công". */
  async listCompleted() {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'completed' },
      orderBy: { scheduledDate: 'desc' },
      take: 50,
      select: {
        id: true, title: true, description: true, scheduledDate: true, endDate: true, kitchenAddress: true,
        imageUrls: true, actualServings: true, expectedServings: true,
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        mealDistributions: { select: { peopleServed: true } },
        assignments: { where: { status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] } }, select: { id: true } },
        _count: { select: { experiences: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      scheduledDate: c.scheduledDate,
      kitchenAddress: c.kitchenAddress,
      imageUrls: Array.isArray(c.imageUrls) ? (c.imageUrls as string[]) : [],
      actualServings: c.actualServings,
      peopleServed: c.mealDistributions.reduce((s, d) => s + d.peopleServed, 0),
      volunteers: c.assignments.length,
      experienceCount: c._count.experiences,
      organizationName: c.charityReceiver?.organizationName ?? c.charityReceiver?.user.fullName ?? null,
    }));
  }

  /** Công khai (không cần đăng nhập): vài chiến dịch đang tuyển, sắp diễn ra — cho trang chủ. */
  async listPublicUpcoming(limit = 3) {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'open', scheduledDate: { gte: this.startOfTodayUTC() } },
      orderBy: { scheduledDate: 'asc' },
      take: Math.min(limit, 12),
      select: {
        id: true, title: true, description: true,
        scheduledDate: true, endDate: true, startTime: true, endTime: true,
        kitchenAddress: true, imageUrls: true, status: true,
        charityReceiver: { select: { organizationName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      scheduledDate: r.scheduledDate,
      endDate: r.endDate ?? null,
      startTime: r.startTime,
      endTime: r.endTime,
      kitchenAddress: r.kitchenAddress,
      imageUrls: Array.isArray(r.imageUrls) ? (r.imageUrls as string[]) : [],
      status: r.status,
      organizationName: r.charityReceiver?.organizationName ?? null,
    }));
  }

  /**
   * Công khai: chi tiết một chiến dịch (cho trang chi tiết ngoài). Mở/đang diễn ra/đã hoàn tất.
   * Khi 'completed' → trả thêm dữ liệu "success story": người tham gia, phân phát + feedback,
   * thư viện ảnh minh chứng, cảm nhận của TNV.
   */
  async getPublicDetail(id: string) {
    const c = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, status: true,
        scheduledDate: true, endDate: true, startTime: true, endTime: true, kitchenAddress: true, imageUrls: true,
        chefSlotsNeeded: true, waiterSlotsNeeded: true, shipperSlotsNeeded: true,
        chefSlotsFilled: true, waiterSlotsFilled: true, shipperSlotsFilled: true,
        expectedServings: true, actualServings: true, menuItems: true, scheduleItems: true, supplyItems: true,
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        // Chỉ người đã được duyệt (không hiện pending/rejected/cancelled)
        assignments: {
          where: { status: { in: ['assigned', 'checked_in', 'in_progress', 'completed', 'absent'] } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, role: true, status: true, shiftId: true,
            ingredientProofUrl: true, cookedProofUrl: true, distributionProofUrl: true,
            volunteer: { select: { rank: true, user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
        donations: {
          where: { status: { in: ['pledged', 'received'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, itemName: true, quantity: true, status: true, provider: { select: { businessName: true } } },
        },
        mealDistributions: {
          orderBy: { distributedAt: 'asc' },
          select: {
            id: true, roundLabel: true, servingsServed: true, peopleServed: true, leftoverServings: true,
            photoUrl: true, note: true, distributedAt: true,
            servedBy: { select: { user: { select: { fullName: true } } } },
            feedback: { orderBy: { createdAt: 'desc' }, select: { satisfaction: true, comment: true, createdAt: true } },
          },
        },
        experiences: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, content: true, imageUrls: true, rating: true, createdAt: true,
            volunteer: { select: { rank: true, user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
        shifts: {
          orderBy: { startTime: 'asc' },
          select: {
            id: true, label: true, role: true, startTime: true, endTime: true,
            slotsNeeded: true, slotsFilled: true,
          },
        },
      },
    });
    if (!c) {
      throw new NotFoundException('Không tìm thấy chiến dịch.');
    }
    if (c.status === 'draft') {
      throw new NotFoundException('Chiến dịch đang chờ duyệt.');
    }
    if (!['open', 'in_progress', 'completed'].includes(c.status)) {
      throw new NotFoundException('Không tìm thấy chiến dịch.');
    }

    const participants = c.assignments.map((a) => ({
      id: a.id,
      role: a.role,
      status: a.status,
      fullName: a.volunteer.user.fullName,
      avatarUrl: a.volunteer.user.avatarUrl,
      rank: a.volunteer.rank,
    }));

    // Thư viện ảnh minh chứng từ các bước của TNV (nguyên liệu / món nấu / phân phát)
    const proofGallery = c.assignments.flatMap((a) =>
      [
        a.ingredientProofUrl ? { url: a.ingredientProofUrl, kind: 'ingredient', by: a.volunteer.user.fullName } : null,
        a.cookedProofUrl ? { url: a.cookedProofUrl, kind: 'cooked', by: a.volunteer.user.fullName } : null,
        a.distributionProofUrl ? { url: a.distributionProofUrl, kind: 'distribution', by: a.volunteer.user.fullName } : null,
      ].filter((x): x is { url: string; kind: string; by: string } => x !== null),
    );

    const distributions = c.mealDistributions.map((d) => ({
      id: d.id,
      roundLabel: d.roundLabel,
      servingsServed: d.servingsServed,
      peopleServed: d.peopleServed,
      leftoverServings: d.leftoverServings,
      photoUrl: d.photoUrl,
      note: d.note,
      distributedAt: d.distributedAt,
      servedBy: d.servedBy.user.fullName,
      feedback: d.feedback,
    }));

    const distributionSummary = c.mealDistributions.reduce(
      (acc, d) => ({
        servingsServed: acc.servingsServed + d.servingsServed,
        peopleServed: acc.peopleServed + d.peopleServed,
        leftoverServings: acc.leftoverServings + d.leftoverServings,
      }),
      { servingsServed: 0, peopleServed: 0, leftoverServings: 0 },
    );

    const allFeedback = c.mealDistributions.flatMap((d) => d.feedback);
    const avgSatisfaction =
      allFeedback.length > 0
        ? allFeedback.reduce((s, f) => s + f.satisfaction, 0) / allFeedback.length
        : null;

    const experiences = c.experiences.map((e) => ({
      id: e.id,
      content: e.content,
      imageUrls: Array.isArray(e.imageUrls) ? (e.imageUrls as string[]) : [],
      rating: e.rating,
      createdAt: e.createdAt,
      fullName: e.volunteer.user.fullName,
      avatarUrl: e.volunteer.user.avatarUrl,
      rank: e.volunteer.rank,
    }));

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      scheduledDate: c.scheduledDate,
      endDate: c.endDate ?? null,
      startTime: c.startTime,
      endTime: c.endTime,
      kitchenAddress: c.kitchenAddress,
      chefSlotsNeeded: c.chefSlotsNeeded,
      waiterSlotsNeeded: c.waiterSlotsNeeded,
      shipperSlotsNeeded: c.shipperSlotsNeeded,
      chefSlotsFilled: c.chefSlotsFilled,
      waiterSlotsFilled: c.waiterSlotsFilled,
      shipperSlotsFilled: c.shipperSlotsFilled,
      expectedServings: c.expectedServings,
      actualServings: c.actualServings,
      imageUrls: Array.isArray(c.imageUrls) ? (c.imageUrls as string[]) : [],
      menuItems: Array.isArray(c.menuItems) ? c.menuItems : [],
      scheduleItems: Array.isArray(c.scheduleItems) ? c.scheduleItems : [],
      supplyItems: Array.isArray(c.supplyItems) ? (c.supplyItems as string[]) : [],
      organizationName: c.charityReceiver?.organizationName ?? c.charityReceiver?.user.fullName ?? null,
      participants,
      donations: c.donations,
      proofGallery,
      distributions,
      distributionSummary,
      avgSatisfaction,
      feedbackCount: allFeedback.length,
      experiences,
      shifts: c.shifts.map((s) => ({
        id: s.id,
        label: s.label,
        role: s.role,
        startTime: s.startTime,
        endTime: s.endTime,
        slotsNeeded: s.slotsNeeded,
        slotsFilled: s.slotsFilled,
      })),
      supplyProgress: this.buildSupplyProgress(c.supplyItems, c.donations),
    };
  }

  /** Lưu ảnh cảm nhận của TNV → trả URL để gắn vào experience. */
  async saveExperienceImage(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaign-experiences');
  }

  /**
   * TNV chia sẻ cảm nhận/trải nghiệm sau khi chiến dịch hoàn tất.
   * Điều kiện: chiến dịch đã 'completed' và TNV có tham gia (đã được duyệt). Mỗi TNV 1 bài / chiến dịch (cập nhật nếu gửi lại).
   */
  async addExperience(
    campaignId: string,
    userId: string,
    dto: { content: string; rating?: number; imageUrls?: string[] },
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (campaign.status !== 'completed') {
      throw new BadRequestException('Chỉ chia sẻ cảm nhận sau khi chiến dịch đã hoàn tất.');
    }

    // Phải là người đã tham gia (được duyệt) chiến dịch này
    const participated = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId,
        volunteerId: volunteer.id,
        status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
      },
    });
    if (!participated) {
      throw new ForbiddenException('Chỉ tình nguyện viên đã tham gia chiến dịch mới chia sẻ được cảm nhận.');
    }

    const experience = await this.prisma.campaignExperience.upsert({
      where: { campaignId_volunteerId: { campaignId, volunteerId: volunteer.id } },
      create: {
        campaignId,
        volunteerId: volunteer.id,
        content: dto.content,
        imageUrls: dto.imageUrls ?? [],
        rating: dto.rating ?? null,
      },
      update: {
        content: dto.content,
        imageUrls: dto.imageUrls ?? [],
        rating: dto.rating ?? null,
      },
    });
    return { id: experience.id, message: 'Đã chia sẻ cảm nhận của bạn. Cảm ơn bạn!' };
  }

  async listOpen() {
    const today = this.startOfTodayUTC();
    const campaigns = await this.prisma.kitchenCampaign.findMany({
      // 'open' chỉ tính khi chưa qua ngày; 'in_progress' (đang diễn ra) vẫn hiển thị
      where: {
        OR: [
          { status: 'in_progress' },
          { status: 'open', scheduledDate: { gte: today } },
        ],
      },
      orderBy: { scheduledDate: 'asc' },
      include: {
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        assignments: {
          select: {
            id: true,
            role: true,
            status: true,
            volunteer: { select: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
        donations: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, itemName: true, quantity: true, status: true, provider: { select: { businessName: true } } },
        },
      },
    });
    return campaigns.map((campaign) => this.withSupplyProgress(campaign));
  }

  async myCampaigns(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: { charityReceiverId: receiver.id },
      orderBy: { createdAt: 'desc' },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, itemName: true, quantity: true, note: true, status: true, provider: { select: { businessName: true } } },
        },
      },
    });
    return campaigns.map((campaign) => this.withSupplyProgress(campaign));
  }

  /** Việc của tình nguyện viên: các campaign đã đăng ký + vai trò + trạng thái. */
  async myAssignments(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    return this.prisma.campaignVolunteerAssignment.findMany({
      where: { volunteerId: volunteer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true } },
        campaign: {
          select: {
            id: true,
            title: true,
            kitchenAddress: true,
            scheduledDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Chi tiết chiến dịch cho trang QUẢN LÝ của charity.
   * Bao gồm TẤT CẢ assignment (kể cả pending) để có thể duyệt TNV.
   * Khác với getPublicDetail: trả về pending assignments + bỏ proofGallery/experiences.
   */
  async getManageDetail(id: string, userId: string) {
    await this.assertOwner(id, userId);
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: {
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        shifts: {
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            label: true,
            role: true,
            startTime: true,
            endTime: true,
            slotsNeeded: true,
            slotsFilled: true,
          },
        },
        menuItemRefs: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, customName: true, plannedServings: true, recipeId: true, sortOrder: true },
        },
        // TẤT CẢ trạng thái (kể cả pending — quan trọng cho trang manage)
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            status: true,
            shiftId: true,
            checkInTime: true,
            shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true } },
            ingredientProofUrl: true,
            cookedProofUrl: true,
            distributionProofUrl: true,
            notes: true,
            createdAt: true,
            volunteer: {
              select: {
                rank: true,
                dedicationPoints: true,
                avgRating: true,
                isAvailable: true,
                vehicleType: true,
                vehiclePlate: true,
                specializations: { select: { specialization: true } },
                campaignExperiences: { select: { id: true } },
                user: {
                  select: {
                    fullName: true,
                    avatarUrl: true,
                    phone: true,
                    trustScore: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        donations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            note: true,
            status: true,
            createdAt: true,
            receivedAt: true,
            provider: { select: { businessName: true } },
          },
        },
        mealDistributions: {
          orderBy: { distributedAt: 'desc' },
          select: {
            id: true,
            roundLabel: true,
            servingsServed: true,
            peopleServed: true,
            leftoverServings: true,
            photoUrl: true,
            note: true,
            distributedAt: true,
            servedBy: { select: { user: { select: { fullName: true } } } },
            feedback: { orderBy: { createdAt: 'desc' }, select: { satisfaction: true, comment: true, createdAt: true } },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    const assignmentIds = campaign.assignments.map((assignment) => assignment.id);
    const checkInLocations = new Map<string, { lng: number; lat: number }>();
    if (assignmentIds.length > 0) {
      const locations = await this.prisma.$queryRaw<{ id: string; lng: number; lat: number }[]>(Prisma.sql`
        SELECT
          id,
          ST_X(check_in_location::geometry) AS lng,
          ST_Y(check_in_location::geometry) AS lat
        FROM campaign_volunteer_assignments
        WHERE id IN (${Prisma.join(assignmentIds.map((assignmentId) => Prisma.sql`${assignmentId}::uuid`))})
          AND check_in_location IS NOT NULL
      `);
      for (const location of locations) {
        checkInLocations.set(location.id, { lng: Number(location.lng), lat: Number(location.lat) });
      }
    }

    // participants: tất cả, kể cả pending — enriched với thông tin uy tín + lịch sử
    const participants = campaign.assignments.map((a) => ({
      id: a.id,
      role: a.role,
      status: a.status,
      shiftId: a.shiftId,
      checkInTime: a.checkInTime,
      checkInLocation: checkInLocations.get(a.id) ?? null,
      shift: a.shift,
      notes: a.notes,
      createdAt: a.createdAt,
      fullName: a.volunteer.user.fullName,
      avatarUrl: a.volunteer.user.avatarUrl,
      rank: a.volunteer.rank,
      // Thông tin TNV chi tiết cho charity duyệt
      volunteer: {
        fullName: a.volunteer.user.fullName,
        avatarUrl: a.volunteer.user.avatarUrl,
        phone: a.volunteer.user.phone,
        trustScore: a.volunteer.user.trustScore,
        userStatus: a.volunteer.user.status,
        rank: a.volunteer.rank,
        dedicationPoints: a.volunteer.dedicationPoints,
        avgRating: a.volunteer.avgRating ? Number(a.volunteer.avgRating) : null,
        isAvailable: a.volunteer.isAvailable,
        vehicleType: a.volunteer.vehicleType,
        vehiclePlate: a.volunteer.vehiclePlate,
        specializations: a.volunteer.specializations.map((s) => s.specialization),
        pastCampaignsCount: a.volunteer.campaignExperiences.length,
      },
    }));

    // distributionSummary
    const distributionSummary = campaign.mealDistributions.reduce(
      (acc, d) => ({
        servingsServed: acc.servingsServed + d.servingsServed,
        peopleServed: acc.peopleServed + d.peopleServed,
        leftoverServings: acc.leftoverServings + d.leftoverServings,
      }),
      { servingsServed: 0, peopleServed: 0, leftoverServings: 0 },
    );

    const distributions = campaign.mealDistributions.map((d) => ({
      id: d.id,
      roundLabel: d.roundLabel,
      servingsServed: d.servingsServed,
      peopleServed: d.peopleServed,
      leftoverServings: d.leftoverServings,
      photoUrl: d.photoUrl,
      note: d.note,
      distributedAt: d.distributedAt,
      servedBy: d.servedBy.user.fullName,
      feedback: d.feedback,
    }));

    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      scheduledDate: campaign.scheduledDate,
      endDate: campaign.endDate ?? null,
      startTime: campaign.startTime,
      endTime: campaign.endTime,
      kitchenAddress: campaign.kitchenAddress,
      imageUrls: Array.isArray(campaign.imageUrls) ? (campaign.imageUrls as string[]) : [],
      chefSlotsNeeded: campaign.chefSlotsNeeded,
      waiterSlotsNeeded: campaign.waiterSlotsNeeded,
      shipperSlotsNeeded: campaign.shipperSlotsNeeded,
      chefSlotsFilled: campaign.chefSlotsFilled,
      waiterSlotsFilled: campaign.waiterSlotsFilled,
      shipperSlotsFilled: campaign.shipperSlotsFilled,
      expectedServings: campaign.expectedServings,
      actualServings: campaign.actualServings,
      menuItems: Array.isArray(campaign.menuItems) ? campaign.menuItems : [],
      scheduleItems: Array.isArray(campaign.scheduleItems) ? campaign.scheduleItems : [],
      supplyItems: Array.isArray(campaign.supplyItems) ? (campaign.supplyItems as string[]) : [],
      organizationName: campaign.charityReceiver?.organizationName ?? campaign.charityReceiver?.user.fullName ?? null,
      participants,
      donations: campaign.donations,
      distributions,
      distributionSummary,
      shifts: campaign.shifts,
      menuItemRefs: campaign.menuItemRefs,
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: {
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        shifts: {
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            label: true,
            role: true,
            startTime: true,
            endTime: true,
            slotsNeeded: true,
            slotsFilled: true,
          },
        },
        menuItemRefs: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, customName: true, plannedServings: true, recipeId: true, sortOrder: true },
        },
        assignments: {
          select: {
            id: true,
            role: true,
            status: true,
            shiftId: true,
            volunteer: { select: { user: { select: { fullName: true } } } },
          },
        },
        donations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            note: true,
            status: true,
            createdAt: true,
            provider: { select: { businessName: true } },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    return this.withSupplyProgress(campaign);
  }

  /** Volunteer ứng tuyển 1 vai trò trong campaign nếu còn slot. */
  async apply(campaignId: string, userId: string, dto: ApplyCampaignDto) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      include: {
        specializations: { select: { specialization: true } },
        user: { select: { status: true } },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // Chốt uy tín: TNV đang bị khoá/hạn chế thì không được tham gia
    if (volunteer.user.status === 'banned') {
      throw new ForbiddenException('Tài khoản của bạn đang bị khoá, không thể tham gia chiến dịch.');
    }
    if (volunteer.user.status === 'suspended') {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế do uy tín thấp, không thể tham gia chiến dịch.');
    }

    // Chỉ cho ứng tuyển đúng chuyên môn đã đăng ký (chef/waiter/shipper)
    const roleVN = ROLE_VN[dto.role] ?? dto.role;
    const hasRole = volunteer.specializations.some((s) => s.specialization === dto.role);
    if (!hasRole) {
      throw new BadRequestException(
        `Bạn chưa đăng ký chuyên môn "${roleVN}". Chỉ ứng tuyển được vai trò đúng chuyên môn của mình.`,
      );
    }

    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['open', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận đăng ký.');
    }
    // Chặn đăng ký khi chiến dịch đã qua ngày diễn ra (kẹt ở 'open' vì tổ chức chưa bắt đầu)
    if (this.daysUntil(campaign.scheduledDate) < 0) {
      throw new BadRequestException('Chiến dịch này đã qua ngày diễn ra, không còn nhận đăng ký.');
    }

    const shiftCount = await this.prisma.campaignShift.count({ where: { campaignId } });
    if (shiftCount > 0) {
      throw new BadRequestException('Chiến dịch này có ca làm việc, vui lòng đăng ký trực tiếp theo từng ca.');
    }

    const slot = SLOT_FIELD[dto.role];
    const needed = campaign[slot.needed] as number;
    const filled = campaign[slot.filled] as number;
    if (filled >= needed) {
      throw new BadRequestException(`Đã đủ tình nguyện viên vai trò ${roleVN}.`);
    }

    let shiftId: string | undefined;
    if (dto.shiftId) {
      const shift = await this.prisma.campaignShift.findUnique({ where: { id: dto.shiftId } });
      if (!shift || shift.campaignId !== campaignId) {
        throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
      }
      if (shift.role && shift.role !== dto.role) {
        throw new BadRequestException(`Ca "${shift.label}" không phù hợp với vai trò ${roleVN}.`);
      }
      shiftId = shift.id;
    }

    // findFirst chứ không findUnique: DB không có UNIQUE trên (campaign, volunteer, role)
    // — chỉ có @@index. Client Prisma cũ từng sinh ra khoá phức hợp này nên code biên
    // dịch được, nhưng nó không tồn tại trong schema lẫn database.
    const existing = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId, volunteerId: volunteer.id, role: dto.role },
    });
    if (existing) {
      // Chỉ rejected/cancelled được gửi lại. Slot chỉ tăng khi charity duyệt pending → assigned.
      if (existing.status === 'rejected' || existing.status === 'cancelled') {
        await this.prisma.campaignVolunteerAssignment.update({
          where: { id: existing.id },
          data: { status: 'pending', shiftId: shiftId ?? existing.shiftId, notes: null },
        });
        return { message: `Đã gửi lại đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.` };
      }
      throw new ConflictException('Bạn đã đăng ký vai trò này rồi.');
    }

    await this.prisma.campaignVolunteerAssignment.create({
      data: { campaignId, volunteerId: volunteer.id, shiftId, role: dto.role, status: 'pending' },
    });

    return { message: `Đã gửi đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.` };
  }

  /** Lưu ảnh minh chứng (nguyên liệu / món đã nấu / đã giao) của TNV. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaign-proofs');
  }

  /** Lưu ảnh đại diện chiến dịch → trả URL để gắn vào imageUrls khi tạo. */
  async saveCampaignImage(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaigns');
  }

  /** Kiểm tra quyền sở hữu chiến dịch (charity owner). */
  private async assertOwner(campaignId: string, userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId }, select: { id: true } });
    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!receiver || campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException('Chỉ tổ chức tạo chiến dịch mới thao tác được.');
    }
    return campaign;
  }

  /** Tổ chức: bắt đầu chiến dịch (open → in_progress) CHỈ khi đã tới đúng ngày diễn ra. */
  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException('Chỉ bắt đầu được chiến dịch đang ở trạng thái "Đang tuyển".');
    }
    // Chỉ cho phép bắt đầu khi scheduledDate = hôm nay (UTC). Không cho bắt đầu sớm
    // cũng như không cho bắt đầu khi đã quá ngày (lúc đó phải dùng cancel).
    const today = this.startOfTodayUTC();
    const scheduled = new Date(campaign.scheduledDate);
    const scheduledUtc = new Date(Date.UTC(
      scheduled.getUTCFullYear(), scheduled.getUTCMonth(), scheduled.getUTCDate(),
    ));
    if (scheduledUtc.getTime() > today.getTime()) {
      const fmt = scheduledUtc.toISOString().slice(0, 10);
      throw new BadRequestException(
        `Chiến dịch dự kiến diễn ra vào ngày ${fmt}. Bạn chỉ có thể bắt đầu vào đúng ngày đó.`,
      );
    }
    if (scheduledUtc.getTime() < today.getTime()) {
      throw new BadRequestException('Chiến dịch đã qua ngày dự kiến — không thể bắt đầu. Hãy huỷ nếu không thể tổ chức.');
    }
    await this.prisma.kitchenCampaign.update({ where: { id: campaignId }, data: { status: 'in_progress' } });
    return this.findOne(campaignId);
  }

  /** Tổ chức: huỷ chiến dịch đang tuyển (open → cancelled). Dùng khi quá hạn mà không kịp bắt đầu. */
  async cancelCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException('Chỉ huỷ được chiến dịch đang ở trạng thái "Đang tuyển".');
    }
    await this.prisma.kitchenCampaign.update({ where: { id: campaignId }, data: { status: 'cancelled' } });
    return this.findOne(campaignId);
  }

  /** Tổ chức: kết thúc chiến dịch + nhập số suất thực tế (in_progress → completed).
   *  Nếu chưa tới ngày kết thúc (endDate hoặc scheduledDate) thì bắt buộc gửi
   *  `earlyEndConfirmation: 'EARLY_END'` + `earlyEndReason` để chứng minh user
   *  đã chủ động xác nhận kết thúc sớm (popup cảnh báo ở FE).
   */
  async completeCampaign(
    campaignId: string,
    userId: string,
    actualServings: number,
    opts?: { earlyEndConfirmation?: 'EARLY_END'; earlyEndReason?: string },
  ) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'in_progress') {
      throw new BadRequestException('Chỉ kết thúc được chiến dịch đang diễn ra.');
    }
    const today = this.startOfTodayUTC();
    const endRaw = campaign.endDate ?? campaign.scheduledDate;
    const endDate = new Date(endRaw);
    const endUtc = new Date(Date.UTC(
      endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(),
    ));
    const isPremature = endUtc.getTime() > today.getTime();
    if (isPremature) {
      if (opts?.earlyEndConfirmation !== 'EARLY_END') {
        throw new BadRequestException(
          'Chiến dịch chưa tới ngày kết thúc. Cần xác nhận kết thúc sớm trước khi hoàn tất.',
        );
      }
      const reason = (opts.earlyEndReason ?? '').trim();
      if (reason.length < 5) {
        throw new BadRequestException('Vui lòng nhập lý do kết thúc sớm (tối thiểu 5 ký tự).');
      }
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        actualServings,
        ...(isPremature ? { notes: `Kết thúc sớm: ${opts!.earlyEndReason!.trim()}` } : {}),
      },
    });
    return this.findOne(campaignId);
  }

  /**
   * TNV chuyển bước công việc của mình: assigned → checked_in → in_progress → completed.
   * Đính kèm ảnh minh chứng theo bước/vai trò; hoàn thành thì cộng điểm cống hiến.
   */
  async advanceTask(
    assignmentId: string,
    userId: string,
    location: { lng?: number; lat?: number },
    proofUrl?: string,
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      include: { user: { select: { status: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status !== 'active') {
      throw new ForbiddenException('Tài khoản của bạn chưa ở trạng thái hoạt động.');
    }

    const a = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        shift: { select: { role: true, startTime: true, endTime: true } },
        campaign: {
          select: {
            status: true,
            scheduledDate: true,
            endDate: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Không tìm thấy công việc.');
    if (a.volunteerId !== volunteer.id) throw new ForbiddenException('Đây không phải công việc của bạn.');

    const next = ASSIGN_NEXT[a.status];
    if (!next) throw new BadRequestException('Công việc đã hoàn tất hoặc không thể chuyển bước.');
    if (a.campaign.status !== 'in_progress') {
      throw new BadRequestException('Chỉ có thể cập nhật công việc khi chiến dịch đang diễn ra.');
    }

    const hasLng = location.lng !== undefined;
    const hasLat = location.lat !== undefined;
    if (hasLng !== hasLat) {
      throw new BadRequestException('Cần cả kinh độ và vĩ độ khi điểm danh.');
    }
    if (next === 'checked_in') {
      if (!hasLng || !hasLat) {
        throw new BadRequestException('Cần vị trí GPS để điểm danh tại bếp.');
      }
      this.assertWithinCheckInWindow(a.campaign, a.shift, a.role);
      const [kitchen] = await this.prisma.$queryRaw<{ within_radius: boolean }[]>(Prisma.sql`
        SELECT ST_DWithin(
          kitchen_location,
          ST_SetSRID(ST_MakePoint(${location.lng!}, ${location.lat!}), 4326)::geography,
          500
        ) AS within_radius
        FROM kitchen_campaigns
        WHERE id = ${a.campaignId}::uuid
      `);
      if (!kitchen?.within_radius) {
        throw new BadRequestException('Bạn cần ở trong phạm vi 500 m của bếp để điểm danh.');
      }
    }

    const data: Prisma.CampaignVolunteerAssignmentUpdateInput = { status: next as never };
    if (next === 'checked_in') data.checkInTime = new Date();
    if (next === 'in_progress' && proofUrl) {
      data.ingredientProofUrl = proofUrl;
      data.ingredientProofAt = new Date();
    }
    if (next === 'completed') {
      data.checkOutTime = new Date();
      if (proofUrl) {
        if (a.role === 'shipper') {
          data.distributionProofUrl = proofUrl;
          data.distributionProofAt = new Date();
        } else {
          data.cookedProofUrl = proofUrl;
          data.cookedProofAt = new Date();
        }
      }
      const pts = ASSIGN_POINTS[a.role] ?? 10;
      data.pointsAwarded = pts;
      await this.prisma.$transaction([
        this.prisma.campaignVolunteerAssignment.update({ where: { id: assignmentId }, data }),
        this.prisma.volunteerProfile.update({
          where: { id: volunteer.id },
          data: { dedicationPoints: { increment: pts } },
        }),
        this.prisma.dedicationPointsHistory.create({
          data: {
            volunteerId: volunteer.id,
            delta: pts,
            reason: 'campaign_completed',
            referenceType: 'campaign',
            referenceId: a.campaignId,
            pointsBefore: volunteer.dedicationPoints,
            pointsAfter: volunteer.dedicationPoints + pts,
          },
        }),
      ]);
      return { id: assignmentId, status: next, pointsAwarded: pts };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.campaignVolunteerAssignment.update({ where: { id: assignmentId }, data });
      if (next === 'checked_in') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE campaign_volunteer_assignments
          SET check_in_location = ST_SetSRID(ST_MakePoint(${location.lng!}, ${location.lat!}), 4326)::geography
          WHERE id = ${assignmentId}::uuid
        `);
      }
    });
    return { id: assignmentId, status: next };
  }

  /** Nhà cung cấp quyên góp nguyên liệu cho chiến dịch (đang tuyển/đang diễn ra). */
  async pledgeDonation(campaignId: string, providerUserId: string, dto: { itemName: string; quantity: number; unit?: string; note?: string }) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { userId: providerUserId } });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: {
        charityReceiver: { select: { userId: true } },
        donations: {
          select: { itemName: true, quantity: true, status: true },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['open', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận quyên góp.');
    }
    const targets = this.parseSupplyTargets(campaign.supplyItems);
    if (targets.length === 0) {
      throw new BadRequestException('Chiến dịch chưa có mục tiêu nguyên liệu định lượng để nhận quyên góp.');
    }
    const itemKey = this.normalizeSupplyKey(dto.itemName);
    const target = targets.find((s) => s.key === itemKey);
    if (!target) {
      throw new BadRequestException('Nguyên liệu này không nằm trong danh sách mục tiêu của chiến dịch.');
    }
    if (dto.unit && this.normalizeSupplyKey(dto.unit) !== this.normalizeSupplyKey(target.unit)) {
      throw new BadRequestException(`Đơn vị phải là ${target.unit}.`);
    }
    const progress = this.buildSupplyProgress(campaign.supplyItems, campaign.donations);
    const itemProgress = progress.find((p) => this.normalizeSupplyKey(p.name) === target.key);
    const remaining = itemProgress?.remainingQuantity ?? target.targetQuantity;
    const quantity = this.roundQuantity(dto.quantity);
    if (quantity > remaining) {
      throw new BadRequestException(
        remaining > 0
          ? `Chỉ còn cần ${remaining} ${target.unit} ${target.name}. Vui lòng nhập số lượng không vượt quá phần còn thiếu.`
          : `${target.name} đã đạt đủ mục tiêu nguyên liệu.`,
      );
    }

    const donation = await this.prisma.campaignDonation.create({
      data: {
        campaignId,
        providerId: provider.id,
        itemName: target.name,
        quantity: `${quantity} ${target.unit}`,
        note: dto.note ?? null,
        status: 'pledged',
      },
    });

    // Báo cho tổ chức chủ chiến dịch
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: 'Có quyên góp nguyên liệu mới',
      body: `"${provider.businessName}" muốn góp ${quantity} ${target.unit} ${target.name} cho chiến dịch "${campaign.title}".`,
      data: { campaignId, donationId: donation.id },
    });

    return this.findOne(campaignId);
  }

  /** Tổ chức xác nhận đã nhận nguyên liệu quyên góp (pledged → received). */
  async confirmDonation(donationId: string, charityUserId: string) {
    const donation = await this.prisma.campaignDonation.findUnique({
      where: { id: donationId },
      include: {
        campaign: { select: { charityReceiverId: true, title: true } },
        provider: { select: { userId: true } },
      },
    });
    if (!donation) throw new NotFoundException('Không tìm thấy khoản quyên góp.');

    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId: charityUserId }, select: { id: true } });
    if (!receiver || donation.campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException('Chỉ tổ chức chủ chiến dịch mới xác nhận được.');
    }
    if (donation.status !== 'pledged') {
      throw new BadRequestException('Khoản quyên góp này đã được xử lý.');
    }

    await this.prisma.campaignDonation.update({
      where: { id: donationId },
      data: { status: 'received', receivedAt: new Date() },
    });

    void this.notifications.notify(donation.provider.userId, {
      type: 'campaign',
      title: 'Quyên góp đã được nhận',
      body: `Tổ chức đã xác nhận nhận "${donation.itemName}" cho chiến dịch "${donation.campaign.title}". Cảm ơn bạn!`,
      data: { donationId },
    });

    return { id: donationId, status: 'received' };
  }

  /**
   * Tổ chức gửi YÊU CẦU thay đổi chiến dịch (giờ/ngày, địa chỉ+vị trí, số slot TNV).
   * Không áp dụng ngay — tạo bản ghi chờ admin duyệt. Chỉ cho gửi khi còn ≥ ngưỡng
   * CAMPAIGN_CHANGE_LOCK_DAYS ngày tới ngày diễn ra, và mỗi chiến dịch chỉ 1 yêu cầu pending.
   */
  async submitChangeRequest(campaignId: string, userId: string, dto: SubmitCampaignChangeDto) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException('Chỉ chiến dịch đang tuyển (open) mới gửi được yêu cầu thay đổi.');
    }

    // lng & lat phải đi cùng nhau
    if ((dto.lng === undefined) !== (dto.lat === undefined)) {
      throw new BadRequestException('Cần cung cấp cả kinh độ (lng) và vĩ độ (lat) khi đổi vị trí.');
    }

    // Phải có ít nhất một trường thay đổi
    const hasChange = [
      dto.scheduledDate, dto.endDate, dto.startTime, dto.endTime, dto.kitchenAddress,
      dto.lng, dto.lat, dto.chefSlotsNeeded, dto.waiterSlotsNeeded, dto.shipperSlotsNeeded,
    ].some((v) => v !== undefined);
    if (!hasChange) throw new BadRequestException('Chưa có thay đổi nào được đề xuất.');

    // Khóa thay đổi cận ngày
    const lockDays = await this.systemConfig.getNumber('CAMPAIGN_CHANGE_LOCK_DAYS');
    const daysLeft = this.daysUntil(campaign.scheduledDate);
    if (daysLeft < lockDays) {
      throw new BadRequestException(
        `Chỉ được gửi yêu cầu thay đổi khi còn ít nhất ${lockDays} ngày trước ngày diễn ra (hiện còn ${daysLeft} ngày).`,
      );
    }
    // Ngày diễn ra mới cũng phải cách hiện tại ≥ ngưỡng
    if (dto.scheduledDate && this.daysUntil(new Date(dto.scheduledDate)) < lockDays) {
      throw new BadRequestException(`Ngày diễn ra mới phải cách hôm nay ít nhất ${lockDays} ngày.`);
    }
    // Validate endDate hợp lệ
    if (dto.endDate) {
      const effectiveStart = dto.scheduledDate ? new Date(dto.scheduledDate) : campaign.scheduledDate;
      const proposedEnd = new Date(dto.endDate);
      if (proposedEnd < effectiveStart) {
        throw new BadRequestException('Ngày kết thúc phải >= ngày bắt đầu.');
      }
    }

    // Slot đề xuất không được nhỏ hơn số đã có người
    if (dto.chefSlotsNeeded !== undefined && dto.chefSlotsNeeded < campaign.chefSlotsFilled) {
      throw new BadRequestException('Số slot Đầu bếp không thể nhỏ hơn số đã có người.');
    }
    if (dto.waiterSlotsNeeded !== undefined && dto.waiterSlotsNeeded < campaign.waiterSlotsFilled) {
      throw new BadRequestException('Số slot Phục vụ không thể nhỏ hơn số đã có người.');
    }
    if (dto.shipperSlotsNeeded !== undefined && dto.shipperSlotsNeeded < campaign.shipperSlotsFilled) {
      throw new BadRequestException('Số slot Giao hàng không thể nhỏ hơn số đã có người.');
    }

    // Mỗi chiến dịch chỉ 1 yêu cầu đang chờ duyệt
    const existingPending = await this.prisma.campaignChangeRequest.findFirst({
      where: { campaignId, status: 'pending' },
    });
    if (existingPending) {
      throw new ConflictException('Đã có một yêu cầu thay đổi đang chờ admin duyệt cho chiến dịch này.');
    }

    const cr = await this.prisma.campaignChangeRequest.create({
      data: {
        campaignId,
        requestedByUserId: userId,
        status: 'pending',
        reason: dto.reason ?? null,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        kitchenAddress: dto.kitchenAddress ?? null,
        lng: dto.lng ?? null,
        lat: dto.lat ?? null,
        chefSlotsNeeded: dto.chefSlotsNeeded ?? null,
        waiterSlotsNeeded: dto.waiterSlotsNeeded ?? null,
        shipperSlotsNeeded: dto.shipperSlotsNeeded ?? null,
      },
    });

    // Báo cho admin có yêu cầu cần duyệt
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', deletedAt: null },
      select: { id: true },
    });
    for (const a of admins) {
      void this.notifications.notify(a.id, {
        type: 'campaign',
        title: 'Yêu cầu thay đổi chiến dịch',
        body: `Tổ chức đề xuất thay đổi chiến dịch "${campaign.title}". Vui lòng xem & duyệt.`,
        data: { campaignId, changeRequestId: cr.id, status: 'pending' },
      });
    }

    return cr;
  }

  /** Tổ chức xem lịch sử yêu cầu thay đổi của chiến dịch mình. */
  async listChangeRequests(campaignId: string, userId: string) {
    await this.assertOwner(campaignId, userId);
    return this.prisma.campaignChangeRequest.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Tổ chức huỷ yêu cầu thay đổi đang chờ duyệt của mình. */
  async cancelChangeRequest(changeRequestId: string, userId: string) {
    const cr = await this.prisma.campaignChangeRequest.findUnique({ where: { id: changeRequestId } });
    if (!cr) throw new NotFoundException('Không tìm thấy yêu cầu thay đổi.');
    await this.assertOwner(cr.campaignId, userId);
    if (cr.status !== 'pending') {
      throw new BadRequestException('Chỉ huỷ được yêu cầu đang chờ duyệt.');
    }
    await this.prisma.campaignChangeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'cancelled' },
    });
    return { id: changeRequestId, status: 'cancelled' };
  }

  /** Charity gửi yêu cầu hợp tác đến provider → gửi notification */
  async sendProviderRequest(charityUserId: string, dto: SendProviderRequestDto) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: {
        id: true,
        user: { select: { fullName: true } },
      },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    const provider = await this.prisma.user.findFirst({
      where: { providerProfile: { id: dto.providerId } },
      include: { providerProfile: { select: { id: true, businessName: true } } },
    });
    if (!provider || !provider.providerProfile) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp.');
    }

    const orgName = receiver.user.fullName;
    const providerName = provider.providerProfile.businessName ?? provider.fullName;

    // Tìm request đã tồn tại cho (campaignId, providerId) để upsert thủ công.
    // Tránh dùng prisma.upsert() vì Postgres cần full unique constraint cho ON CONFLICT,
    // còn DB hiện chỉ có partial unique index (loại trừ zero-UUID) → upsert báo 42P10.
    const campaignId = dto.campaignId ?? '00000000-0000-0000-0000-000000000000';
    const existing = await this.prisma.campaignProviderRequest.findFirst({
      where: { campaignId, providerId: provider.providerProfile.id },
      select: { id: true },
    });

    const request = existing
      ? await this.prisma.campaignProviderRequest.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            message: dto.message,
            durationMonths: dto.durationMonths,
            listingIds: dto.listingIds ? JSON.stringify(dto.listingIds) : null,
            reviewedAt: null,
            reviewedNote: null,
          },
        })
      : await this.prisma.campaignProviderRequest.create({
          data: {
            campaignId,
            receiverId: receiver.id,
            providerId: provider.providerProfile.id,
            message: dto.message,
            durationMonths: dto.durationMonths ?? 1,
            status: 'pending',
            listingIds: dto.listingIds ? JSON.stringify(dto.listingIds) : null,
          },
        });

    // Gửi notification cho provider
    await this.notifications.notify(provider.id, {
      type: 'provider_request',
      title: 'Yêu cầu hợp tác mới',
      body: `Tổ chức "${orgName}" muốn hợp tác cung cấp thực phẩm cho chiến dịch.${
        dto.message ? ` Ghi chú: ${dto.message}` : ''
      }`,
      data: { requestId: request.id, charityUserId, providerId: provider.id },
    });

    return {
      message: `Đã gửi yêu cầu đến ${providerName}`,
      requestId: request.id,
      providerId: provider.id,
    };
  }

  /** Provider: lấy danh sách request nhận được */
  async listMyProviderRequests(providerUserId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ provider.');

    return this.prisma.campaignProviderRequest.findMany({
      where: { providerId: profile.id },
      include: {
        receiver: {
          include: { user: { select: { fullName: true, email: true } } },
        },
        campaign: { select: { id: true, title: true, scheduledDate: true } },
        transport: { select: { id: true, status: true, deliveryId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Provider: chấp nhận hoặc từ chối request.
   * Khi accept:
   *   - Ghi nhận pickupTime/date vào request (copy từ campaign nếu không truyền).
   *   - Nếu needsTransport=true → tạo Delivery + campaign_transports + broadcast shipper gần nhất.
   *   - Notify charity với thông tin giờ lấy + có/không cần shipper.
   * Khi reject: notify charity kèm note.
   */
  async reviewProviderRequest(
    providerUserId: string,
    requestId: string,
    action: 'accept' | 'reject',
    note?: string,
    opts?: { pickupTime?: string; needsTransport?: boolean },
  ) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: { id: true, businessName: true, address: true },
    });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ provider.');

    const request = await this.prisma.campaignProviderRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu.');
    if (request.providerId !== profile.id) throw new ForbiddenException('Bạn không sở hữu yêu cầu này.');
    if (request.status !== 'pending') {
      throw new BadRequestException(`Yêu cầu đang ở trạng thái "${request.status}", không thể duyệt.`);
    }

    // Validate pickupTime khi accept
    if (action === 'accept' && opts?.pickupTime && !/^\d{2}:\d{2}$/.test(opts.pickupTime)) {
      throw new BadRequestException('pickupTime phải đúng định dạng HH:mm.');
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    // Lấy thông tin campaign để lấy default ngày/giờ (cho accept)
    let campaignSnapshot: {
      id: string;
      title: string;
      scheduledDate: Date;
      startTime: string;
      endTime: string;
      kitchenAddress: string;
      kitchenLng: number;
      kitchenLat: number;
    } | null = null;
    if (action === 'accept') {
      const c = await this.prisma.kitchenCampaign.findUnique({
        where: { id: request.campaignId },
        select: {
          id: true,
          title: true,
          scheduledDate: true,
          startTime: true,
          endTime: true,
          kitchenAddress: true,
        },
      });
      const [kitchenCoords] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
        Prisma.sql`
          SELECT
            ST_X(kitchen_location::geometry) AS lng,
            ST_Y(kitchen_location::geometry) AS lat
          FROM kitchen_campaigns
          WHERE id = ${request.campaignId}::uuid
        `,
      );
      if (!c) throw new NotFoundException('Không tìm thấy chiến dịch của yêu cầu này.');
      if ((opts?.needsTransport ?? true) && (kitchenCoords?.lng == null || kitchenCoords.lat == null)) {
        throw new BadRequestException('Chiến dịch chưa có tọa độ bếp nhận hàng hợp lệ.');
      }
      campaignSnapshot = {
        ...c,
        kitchenLng: Number(kitchenCoords?.lng ?? 0),
        kitchenLat: Number(kitchenCoords?.lat ?? 0),
      };
    }

    const pickupStart = opts?.pickupTime ?? campaignSnapshot?.startTime ?? null;
    const pickupEnd = campaignSnapshot?.endTime ?? null;
    const needsTransport = action === 'accept' && (opts?.needsTransport ?? true);
    let pickupCoords: { lng: number; lat: number } | null = null;
    if (needsTransport) {
      const [providerCoords] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
        Prisma.sql`
          SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
          FROM provider_profiles
          WHERE id = ${profile.id}::uuid
        `,
      );
      if (providerCoords?.lng == null || providerCoords.lat == null) {
        throw new BadRequestException('Nhà cung cấp chưa có tọa độ điểm lấy hàng hợp lệ.');
      }
      pickupCoords = { lng: Number(providerCoords.lng), lat: Number(providerCoords.lat) };
    }

    const { updated, transport } = await this.prisma.$transaction(async (tx) => {
      const requestUpdate = await tx.campaignProviderRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewedNote: note ?? null,
          scheduledDate: action === 'accept' ? campaignSnapshot!.scheduledDate : null,
          pickupStartTime: action === 'accept' ? pickupStart : null,
          pickupEndTime: action === 'accept' ? pickupEnd : null,
          needsTransport,
        },
      });
      if (requestUpdate.count !== 1) {
        throw new ConflictException('Yêu cầu đã được xử lý bởi thao tác khác.');
      }

      const updated = await tx.campaignProviderRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { receiver: { include: { user: { select: { fullName: true } } } } },
      });
      const transport = needsTransport
        ? await this.createTransportForRequest(tx, requestId, campaignSnapshot!, pickupCoords!)
        : null;
      return { updated, transport };
    });
    const transportId = transport?.id ?? null;

    if (transport && pickupCoords) {
      try {
        await this.deliveries.broadcastToNearbyShippers(transport.deliveryId, pickupCoords.lng, pickupCoords.lat);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[campaigns] broadcastToNearbyShippers failed:', err);
      }
    }

    // 3) Notify charity
    const receiverUser = await this.prisma.receiverProfile.findUnique({
      where: { id: request.receiverId },
      select: { userId: true },
    });
    if (receiverUser) {
      const pickupDateStr = campaignSnapshot
        ? campaignSnapshot.scheduledDate.toISOString().slice(0, 10)
        : '';
      const pickupTimeStr = pickupStart ?? '';
      const pickupEndStr = pickupEnd ?? '';

      let body: string;
      let title: string;
      if (action === 'reject') {
        title = 'Nhà cung cấp từ chối hợp tác';
        body = `Nhà cung cấp đã từ chối. Lý do: ${note ?? 'Không có'}`;
      } else if (opts?.needsTransport ?? true) {
        title = 'Nhà cung cấp đã chấp nhận — hệ thống tìm TNV giao hàng';
        body = `${profile.businessName ?? 'Nhà cung cấp'} đã đồng ý. TNV đến lấy lúc ${pickupTimeStr}${pickupEndStr ? `–${pickupEndStr}` : ''} ngày ${pickupDateStr}. Hệ thống đang tìm tình nguyện viên giao hàng.`;
      } else {
        title = 'Nhà cung cấp đã chấp nhận — TNV của bạn đến lấy';
        body = `${profile.businessName ?? 'Nhà cung cấp'} đã đồng ý. TNV của bạn đến lấy lúc ${pickupTimeStr}${pickupEndStr ? `–${pickupEndStr}` : ''} ngày ${pickupDateStr}.`;
      }

      await this.notifications.notify(receiverUser.userId, {
        type: 'charity_notification',
        title,
        body,
        data: {
          requestId,
          providerRequestId: requestId,
          transportId,
          campaignId: campaignSnapshot?.id,
          action,
          pickupDate: pickupDateStr,
          pickupTime: pickupTimeStr,
          needsTransport: opts?.needsTransport ?? true,
        },
      });
    }

    return { ...updated, transportId };
  }

  private async createTransportForRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
    campaign: {
      id: string;
      title: string;
      scheduledDate: Date;
      startTime: string;
      endTime: string;
      kitchenAddress: string;
      kitchenLng: number;
      kitchenLat: number;
    },
    pickup: { lng: number; lat: number },
  ): Promise<{ id: string; deliveryId: string }> {
    const [transport] = await tx.$queryRaw<{ id: string; delivery_id: string }[]>(Prisma.sql`
      WITH created_delivery AS (
        INSERT INTO deliveries (
          provider_request_id, status, pickup_location, delivery_location, distance_km, created_at, updated_at
        ) VALUES (
          ${requestId}::uuid,
          'pending_assignment'::delivery_status,
          ST_SetSRID(ST_MakePoint(${pickup.lng}, ${pickup.lat}), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${campaign.kitchenLng}, ${campaign.kitchenLat}), 4326)::geography,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${pickup.lng}, ${pickup.lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${campaign.kitchenLng}, ${campaign.kitchenLat}), 4326)::geography
          ) / 1000,
          NOW(), NOW()
        )
        RETURNING id
      )
      INSERT INTO campaign_transports (
        provider_request_id, delivery_id, status, created_at, updated_at
      )
      SELECT ${requestId}::uuid, id, 'pending', NOW(), NOW()
      FROM created_delivery
      RETURNING id, delivery_id
    `);
    if (!transport) throw new ConflictException('Không thể tạo chuyến vận chuyển cho yêu cầu này.');

    return { id: transport.id, deliveryId: transport.delivery_id };
  }

  /** Charity: xem danh sách request đã gửi */
  async confirmTransportReceipt(
    campaignId: string,
    transportId: string,
    charityUserId: string,
    dto: { note?: string; receiptPhotoUrl?: string },
  ) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    const transport = await this.prisma.campaignTransport.findFirst({
      where: {
        id: transportId,
        providerRequest: { campaignId, receiverId: receiver.id },
      },
      select: { id: true, status: true, deliveryId: true },
    });
    if (!transport) throw new NotFoundException('Không tìm thấy chuyến vận chuyển của chiến dịch này.');
    if (transport.status === 'received') {
      return this.prisma.campaignTransport.findUnique({ where: { id: transportId } });
    }
    if (transport.status !== 'delivered') {
      throw new BadRequestException('Chỉ có thể xác nhận khi shipper đã bàn giao thực phẩm đến bếp.');
    }

    const received = await this.prisma.campaignTransport.updateMany({
      where: { id: transportId, status: 'delivered' },
      data: {
        status: 'received',
        receivedAt: new Date(),
        receivedByUserId: charityUserId,
        receiptNote: dto.note?.trim() || null,
        receiptPhotoUrl: dto.receiptPhotoUrl?.trim() || null,
      },
    });
    if (received.count !== 1) {
      return this.prisma.campaignTransport.findUnique({ where: { id: transportId } });
    }

    const result = await this.prisma.campaignTransport.findUnique({
      where: { id: transportId },
      include: {
        providerRequest: {
          select: { provider: { select: { userId: true } }, campaign: { select: { title: true } } },
        },
      },
    });
    if (result?.providerRequest) {
      await this.notifications.notify(result.providerRequest.provider.userId, {
        type: 'campaign',
        title: 'Tổ chức đã xác nhận nhận hàng',
        body: `Tổ chức đã xác nhận nhận thực phẩm cho chiến dịch "${result.providerRequest.campaign.title}".`,
        data: { campaignId, transportId, deliveryId: transport.deliveryId, status: 'received' },
      });
    }
    return result;
  }

  async listMySentRequests(charityUserId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    return this.prisma.campaignProviderRequest.findMany({
      where: { receiverId: receiver.id },
      include: {
        provider: {
          include: {
            user: { select: { fullName: true, email: true } },
          },
        },
        campaign: { select: { id: true, title: true, scheduledDate: true } },
        transport: {
          select: {
            id: true,
            status: true,
            deliveryId: true,
            assignedAt: true,
            pickedUpAt: true,
            deliveredAt: true,
            receivedAt: true,
            failedAt: true,
            failureReason: true,
            receiptNote: true,
            receiptPhotoUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Charity đề xuất thêm 1 NCC mới (khi chưa có NCC nào trong hệ thống)
   * hoặc muốn gia hạn 1 NCC hiện có thêm 1 tháng.
   * → Lưu vào ProviderProposal, admin review.
   */
  async submitProviderProposal(charityUserId: string, dto: SubmitProviderProposalDto) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    const durationMonths = dto.durationMonths ?? 1;

    const proposal = await this.prisma.providerProposal.create({
      data: {
        proposedByUserId: charityUserId,
        businessName: dto.businessName.trim(),
        contactName: dto.contactName?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        contactEmail: dto.contactEmail?.trim(),
        address: dto.address?.trim(),
        note: dto.note?.trim(),
        durationMonths,
      },
      select: { id: true, status: true, durationMonths: true, createdAt: true },
    });

    return {
      ...proposal,
      message: `Đã ghi nhận đề xuất NCC "${dto.businessName}" — admin sẽ duyệt trong 24h. Thời hạn đề xuất: ${durationMonths} tháng.`,
    };
  }

  // ─── Manage endpoints ──────────────────────────────────────────────────────

  /**
   * Tổ chức duyệt / từ chối 1 đăng ký TNV.
   * - Duyệt: pending → assigned, tăng slot_filled cho role tương ứng (transactional).
   * - Từ chối: pending → rejected, không thay đổi slot.
   * Không cho duyệt khi slot đã đầy (fail-fast).
   */
  async reviewAssignment(campaignId: string, assignmentId: string, userId: string, dto: ReviewAssignmentDto) {
    await this.assertOwner(campaignId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const a = await tx.campaignVolunteerAssignment.findUnique({ where: { id: assignmentId } });
      if (!a || a.campaignId !== campaignId) {
        throw new NotFoundException('Không tìm thấy đăng ký.');
      }
      if (a.status !== 'pending') {
        throw new BadRequestException(`Đăng ký này đã ở trạng thái "${a.status}", không thể duyệt lại.`);
      }

      if (dto.action === 'rejected') {
        const updated = await tx.campaignVolunteerAssignment.update({
          where: { id: assignmentId },
          data: { status: 'rejected', notes: dto.note ?? null },
        });
        const vol = await tx.volunteerProfile.findUnique({
          where: { id: a.volunteerId },
          select: { userId: true },
        });
        return { updated, notifyUserId: vol?.userId ?? null };
      }

      // action === 'approved' -> check role slot and, when campaign has shifts, assign a concrete shift.
      const c = await tx.kitchenCampaign.findUnique({ where: { id: campaignId } });
      if (!c) throw new NotFoundException('Không tìm thấy chiến dịch.');
      const slot = SLOT_FIELD[a.role];
      const needed = c[slot.needed] as number;

      const hasShifts = await tx.campaignShift.count({ where: { campaignId } });
      let selectedShiftId: string | null = null;
      let selectedShiftLabel: string | null = null;
      let selectedShiftSlotsNeeded: number | null = null;
      if (hasShifts > 0) {
        selectedShiftId = dto.shiftId ?? a.shiftId;
        if (!selectedShiftId) {
          throw new BadRequestException('Chiến dịch này có lịch ca, vui lòng chọn ca trước khi duyệt tình nguyện viên.');
        }
        const shift = await tx.campaignShift.findUnique({ where: { id: selectedShiftId } });
        if (!shift || shift.campaignId !== campaignId) {
          throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
        }
        if (shift.role && shift.role !== a.role) {
          throw new BadRequestException(`Ca "${shift.label}" không phù hợp với vai trò ${ROLE_VN[a.role]}.`);
        }
        selectedShiftId = shift.id;
        selectedShiftLabel = shift.label;
        selectedShiftSlotsNeeded = shift.slotsNeeded;
      }

      const campaignCapacity = await tx.kitchenCampaign.updateMany({
        where: { id: campaignId, [slot.filled]: { lt: needed } },
        data: { [slot.filled]: { increment: 1 } },
      });
      if (campaignCapacity.count !== 1) {
        throw new BadRequestException(
          `Đã đủ ${ROLE_VN[a.role]} cho chiến dịch này. Hãy tăng số slot hoặc chờ admin duyệt.`,
        );
      }

      if (selectedShiftId && selectedShiftSlotsNeeded !== null) {
        const shiftCapacity = await tx.campaignShift.updateMany({
          where: { id: selectedShiftId, slotsFilled: { lt: selectedShiftSlotsNeeded } },
          data: { slotsFilled: { increment: 1 } },
        });
        if (shiftCapacity.count !== 1) {
          throw new BadRequestException(`Ca "${selectedShiftLabel}" đã đủ người.`);
        }
      }

      const assignment = await tx.campaignVolunteerAssignment.updateMany({
        where: { id: assignmentId, campaignId, status: 'pending' },
        data: { status: 'assigned', notes: dto.note ?? null, shiftId: selectedShiftId },
      });
      if (assignment.count !== 1) {
        throw new BadRequestException('Đăng ký này đã được xử lý.');
      }
      const updated = await tx.campaignVolunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });

      const vol = await tx.volunteerProfile.findUnique({
        where: { id: a.volunteerId },
        select: { userId: true },
      });

      return { updated, notifyUserId: vol?.userId ?? null };
    });

    if (result.notifyUserId) {
      if (dto.action === 'rejected') {
        await this.notifications.notify(result.notifyUserId, {
          type: 'campaign',
          title: 'Đăng ký bị từ chối',
          body: `Rất tiếc, tổ chức không thể nhận bạn vào ca này.${dto.note ? ` Lý do: ${dto.note}` : ''}`,
          data: {
            campaignId,
            assignmentId,
            shiftId: result.updated.shiftId,
            status: result.updated.status,
          },
        });
      } else {
        await this.notifications.notify(result.notifyUserId, {
          type: 'campaign',
          title: 'Đăng ký được duyệt',
          body: `Bạn đã được nhận vào chiến dịch với vai trò ${ROLE_VN[result.updated.role]}. Hẹn gặp bạn tại bếp!`,
          data: {
            campaignId,
            assignmentId,
            shiftId: result.updated.shiftId,
            status: result.updated.status,
          },
        });
      }
    }

    return result.updated;
  }

  /**
   * Tổ chức ghi nhận 1 đợt phát suất ăn. ServedByVolunteerId lấy từ currentUser
   * (charity userId → tìm volunteerProfile liên kết qua user chung;
   * nếu charity user không có volunteer profile thì fallback về 1 volunteer
   * đã được duyệt của campaign để giữ ràng buộc FK).
   */
  async createDistribution(campaignId: string, userId: string, dto: CreateDistributionDto) {
    await this.assertOwner(campaignId, userId);
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['in_progress', 'completed'].includes(campaign.status)) {
      throw new BadRequestException('Chỉ ghi nhận đợt phát khi chiến dịch đang diễn ra.');
    }

    // Tìm 1 volunteer đã được duyệt để gán "servedBy" (đảm bảo FK không null).
    // Ưu tiên waiter > shipper > chef; nếu chưa có ai thì lấy assignment đầu tiên.
    let servedByVolunteerId: string | null = null;
    const a = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId, status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { volunteerId: true },
    });
    if (a) servedByVolunteerId = a.volunteerId;

    // Nếu vẫn chưa có (campaign chưa có TNV nào được duyệt), tạo 1 "ghost" record
    // thông qua volunteer profile gắn với charity user nếu có.
    if (!servedByVolunteerId) {
      const ghost = await this.prisma.volunteerProfile.findFirst({ select: { id: true } });
      if (!ghost) throw new BadRequestException('Chưa có tình nguyện viên nào để ghi nhận. Hãy duyệt ít nhất 1 đăng ký trước.');
      servedByVolunteerId = ghost.id;
    }

    return this.prisma.mealDistribution.create({
      data: {
        campaignId,
        servedByVolunteerId,
        roundLabel: dto.roundLabel ?? null,
        servingsServed: dto.servingsServed,
        peopleServed: dto.peopleServed,
        leftoverServings: dto.leftoverServings ?? 0,
        note: dto.note ?? null,
        distributedAt: new Date(),
      },
    });
  }

  /** Ca trực CRUD. */
  async addShift(campaignId: string, userId: string, dto: CreateShiftDto) {
    await this.assertOwner(campaignId, userId);
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu.');
    }
    return this.prisma.campaignShift.create({
      data: {
        campaignId,
        label: dto.label.trim(),
        role: dto.role ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotsNeeded: dto.slotsNeeded,
      },
    });
  }

  async updateShift(campaignId: string, shiftId: string, userId: string, dto: UpdateShiftDto) {
    await this.assertOwner(campaignId, userId);
    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca trực.');
    }
    if (dto.endTime && dto.startTime && dto.endTime <= dto.startTime) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu.');
    }
    const finalStart = dto.startTime ?? shift.startTime;
    const finalEnd = dto.endTime ?? shift.endTime;
    if (finalEnd <= finalStart) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu.');
    }
    if (dto.slotsNeeded !== undefined && dto.slotsNeeded < shift.slotsFilled) {
      throw new BadRequestException(`Số người cần không thể nhỏ hơn số đã phân ca (${shift.slotsFilled}).`);
    }
    return this.prisma.campaignShift.update({
      where: { id: shiftId },
      data: {
        label: dto.label?.trim(),
        role: dto.role ?? undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        slotsNeeded: dto.slotsNeeded,
      },
    });
  }

  async deleteShift(campaignId: string, shiftId: string, userId: string) {
    await this.assertOwner(campaignId, userId);
    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca trực.');
    }
    // Không cho xoá ca đã có TNV đăng ký
    const assignedCount = await this.prisma.campaignVolunteerAssignment.count({
      where: { shiftId, status: { in: ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'] } },
    });
    if (assignedCount > 0) {
      throw new BadRequestException(`Ca này đang có ${assignedCount} TNV đăng ký, không thể xoá.`);
    }
    await this.prisma.campaignShift.delete({ where: { id: shiftId } });
    return { id: shiftId, deleted: true };
  }

  /** Thêm món vào menu_items (jsonb). */
  async appendMenuItem(campaignId: string, userId: string, dto: AppendMenuItemDto) {
    const c = await this.assertOwner(campaignId, userId);
    const list = Array.isArray(c.menuItems) ? (c.menuItems as Array<Record<string, unknown>>) : [];
    const next = [
      ...list,
      {
        name: dto.name.trim(),
        type: dto.type.trim(),
        plannedServings: dto.plannedServings ?? null,
      },
    ];
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { menuItems: next as unknown as Prisma.InputJsonValue },
    });
    return { menuItems: next };
  }

  /** Thêm vật phẩm vào supply_items (jsonb). */
  async appendSupplyItem(campaignId: string, userId: string, dto: AppendSupplyItemDto) {
    const c = await this.assertOwner(campaignId, userId);
    const list = Array.isArray(c.supplyItems) ? (c.supplyItems as Array<Record<string, unknown>>) : [];
    const next = [
      ...list,
      {
        name: dto.name.trim(),
        quantity: dto.quantity ?? null,
        unit: dto.unit ?? null,
      },
    ];
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { supplyItems: next as unknown as Prisma.InputJsonValue },
    });
    return { supplyItems: next };
  }
}
