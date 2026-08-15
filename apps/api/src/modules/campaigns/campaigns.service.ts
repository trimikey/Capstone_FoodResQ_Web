import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { DeliveriesService } from '@/modules/deliveries/deliveries.service';
import { TrustService } from '@/modules/trust/trust.service';
import { TrustScoreReason } from '@foodresq/types';
import { DishStepsService } from './dish-steps.service';
import {
  CreateCampaignDto,
  ApplyCampaignDto,
  SubmitCampaignChangeDto,
  SendProviderRequestDto,
  SubmitProviderProposalDto,
  ReviewAssignmentDto,
  CreateDistributionDto,
  CreateShiftDto,
  UpdateShiftDto,
  AppendMenuItemDto,
  AppendSupplyItemDto,
  ReviewProviderRequestDto,
} from './dto/campaign.dto';

// State machine cho công việc của TNV trong chiến dịch
const ASSIGN_NEXT: Record<string, string> = {
  assigned: 'checked_in', // điểm danh tại bếp
  checked_in: 'in_progress', // bắt đầu làm (đầu bếp: chụp nguyên liệu)
  in_progress: 'completed', // hoàn thành (chụp kết quả: món đã nấu / đã giao)
};
// Điểm cống hiến khi hoàn thành theo vai trò
const ASSIGN_POINTS: Record<string, number> = {
  chef: 15,
  waiter: 10,
  shipper: 10,
};

const SLOT_FIELD: Record<
  string,
  { needed: keyof CampaignSlots; filled: keyof CampaignSlots }
> = {
  chef: { needed: 'chefSlotsNeeded', filled: 'chefSlotsFilled' },
  waiter: { needed: 'waiterSlotsNeeded', filled: 'waiterSlotsFilled' },
  shipper: { needed: 'shipperSlotsNeeded', filled: 'shipperSlotsFilled' },
};

const ROLE_VN: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

/** Việt Nam là UTC+7 quanh năm, không có giờ mùa hè. */
const VN_UTC_OFFSET_HOURS = 7;

/**
 * Tổ chức được mở chiến dịch sớm bao nhiêu giờ trước mốc bắt đầu.
 *
 * 12 giờ đủ để mở từ tối hôm trước cho các ca đi chợ / nhận nguyên liệu rạng sáng,
 * nhưng vẫn đủ chặt để không ai bật chiến dịch từ nhiều ngày trước rồi để TNV
 * điểm danh nhầm ngày.
 */
const CAMPAIGN_START_LEAD_HOURS = 12;

/** 95 → "1 giờ 35 phút"; 20 → "20 phút". */
function formatLateness(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/**
 * Khoảng cách tối thiểu giữa hai điểm phát trong cùng một đợt.
 *
 * Hai điểm sát nhau thì cùng phục vụ một nhóm dân cư — vừa trùng người nhận vừa làm
 * shipper chạy vòng vo. 500 m là bán kính đi bộ hợp lý ở đô thị.
 *
 * Chỉ áp dụng cho điểm ĐÃ GHIM TOẠ ĐỘ; điểm chỉ có địa chỉ chữ thì không đo được.
 */
const MIN_POINT_DISTANCE_M = 500;

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
    private dishSteps: DishStepsService,
    private trust: TrustService,
  ) {}

  /** Số ngày (theo lịch UTC) từ hôm nay đến `date`. */
  private daysUntil(date: Date): number {
    const now = new Date();
    const startToday = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const target = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    return Math.round((target - startToday) / 86_400_000);
  }

  /** Đầu ngày hôm nay (theo lịch UTC) — dùng để lọc chiến dịch đã qua hạn. */
  /**
   * `scheduledDate` (mốc ngày, lưu ở UTC 00:00) + `HH:mm` giờ VN → epoch ms.
   * VN là UTC+7 cố định, không có DST nên trừ thẳng 7 giờ là đủ.
   */
  private vnDateTimeToUtc(date: Date, hhmm: string): number {
    const day = new Date(date);
    const [h, m] = hhmm.split(':').map(Number);
    return Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      (Number.isFinite(h) ? h : 0) - VN_UTC_OFFSET_HOURS,
      Number.isFinite(m) ? m : 0,
    );
  }

  private startOfTodayUTC(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  /**
   * Kiểm tra cửa sổ điểm danh và trả về SỐ PHÚT TRỄ (0 = đúng giờ).
   *
   * Trước đây quá giờ kết thúc là chặn thẳng — TNV tới muộn không điểm danh được,
   * kéo theo không làm được bất cứ việc gì trong ngày và công sức của họ không được
   * ghi nhận. Giờ vẫn cho điểm danh, nhưng ghi nhận trễ để trừ uy tín.
   *
   * Vẫn CHẶN các trường hợp không phải "trễ" mà là sai:
   *  - Ca trực không đúng vai trò.
   *  - Ngoài khoảng ngày diễn ra chiến dịch.
   *  - Chưa tới giờ bắt đầu (điểm danh sớm không có nghĩa).
   *
   * Mốc tính trễ là giờ bắt đầu CA TRỰC nếu có, vì đó mới là giờ TNV phải có mặt;
   * không có ca thì lấy giờ bắt đầu chiến dịch.
   */
  private evaluateCheckInWindow(
    campaign: {
      scheduledDate: Date;
      endDate: Date | null;
      startTime: string;
      endTime: string;
    },
    shift: { role: string | null; startTime: string; endTime: string } | null,
    assignmentRole: string,
    workDate?: Date | null,
  ): { lateMinutes: number } {
    if (shift?.role && shift.role !== assignmentRole) {
      throw new BadRequestException(
        'Ca trực được phân công không phù hợp với vai trò của bạn.',
      );
    }

    // Dùng Asia/Ho_Chi_Minh để so sánh giờ VN
    const localNow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((p, part) => {
        if (part.type !== 'literal') p[part.type] = part.value;
        return p;
      }, {});

    const nowDate = `${localNow.year}-${localNow.month}-${localNow.day}`;
    const scheduledDate = campaign.scheduledDate.toISOString().slice(0, 10);
    const endDate = (campaign.endDate ?? campaign.scheduledDate)
      .toISOString()
      .slice(0, 10);

    if (nowDate < scheduledDate || nowDate > endDate) {
      throw new BadRequestException(
        'Chỉ có thể điểm danh trong khoảng ngày diễn ra chiến dịch.',
      );
    }

    // Đăng ký gắn với một NGÀY TRỰC cụ thể — điểm danh ngày khác là sai buổi, không
    // phải đi trễ. Cho qua thì buổi đã đăng ký vẫn tính vắng mà buổi hôm nay lại có
    // người không nằm trong danh sách, tổ chức không đối chiếu được với ai.
    if (workDate) {
      const assigned = this.toDateKey(workDate);
      if (nowDate !== assigned) {
        throw new BadRequestException(
          `Bạn đăng ký trực ngày ${assigned}, hôm nay là ${nowDate}. Chỉ điểm danh được đúng ngày trực của mình.`,
        );
      }
    }

    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const nowTotal = Number(localNow.hour) * 60 + Number(localNow.minute);
    const campaignStart = toMinutes(campaign.startTime);
    const campaignEnd = toMinutes(campaign.endTime);
    const overnight = campaignStart > campaignEnd;
    const isStartDay = nowDate === scheduledDate;

    // Điểm danh sớm hơn giờ mở chiến dịch thì chặn — chỉ áp cho NGÀY BẮT ĐẦU, vì
    // các ngày sau của chiến dịch nhiều ngày đã ở trong thời gian chạy rồi.
    if (isStartDay && nowTotal < campaignStart) {
      throw new BadRequestException(
        `Chiến dịch bắt đầu lúc ${campaign.startTime}. Chưa đến giờ điểm danh.`,
      );
    }

    // Mốc phải có mặt: giờ ca trực (nếu có), không thì giờ bắt đầu chiến dịch.
    const dueTotal = shift ? toMinutes(shift.startTime) : campaignStart;
    let lateMinutes = nowTotal - dueTotal;

    // Chiến dịch qua đêm: sau nửa đêm, `nowTotal` nhỏ hơn mốc do đã sang ngày mới.
    if (overnight && lateMinutes < 0) lateMinutes += 24 * 60;
    // Ngày thứ 2 trở đi của chiến dịch nhiều ngày: mỗi ngày lặp lại cùng khung giờ,
    // nên vẫn so trong ngày, không cộng dồn số ngày.
    return { lateMinutes: Math.max(0, lateMinutes) };
  }

  /** Khoảng cách hai toạ độ (mét) theo công thức haversine. */
  private distanceMeters(
    a: { lng: number; lat: number },
    b: { lng: number; lat: number },
  ): number {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
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
      const data = item as {
        name?: unknown;
        quantity?: unknown;
        unit?: unknown;
      };
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
      const quantity =
        typeof data.quantity === 'number'
          ? data.quantity
          : typeof data.quantity === 'string'
            ? Number(data.quantity)
            : NaN;
      if (!name || !unit || !Number.isFinite(quantity) || quantity <= 0)
        continue;
      targets.push({
        name,
        key: this.normalizeSupplyKey(name),
        targetQuantity: this.roundQuantity(quantity),
        unit,
      });
    }
    return targets;
  }

  private parseDonationQuantity(
    raw: string | null,
    expectedUnit: string,
  ): number | null {
    if (!raw) return null;
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!match) return null;
    const quantity = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const unit = match[2].trim();
    if (
      unit &&
      this.normalizeSupplyKey(unit) !== this.normalizeSupplyKey(expectedUnit)
    )
      return null;
    return quantity;
  }

  private buildSupplyProgress(
    supplyItems: unknown,
    donations: DonationForProgress[],
  ) {
    return this.parseSupplyTargets(supplyItems).map((target) => {
      const related = donations.filter(
        (d) => this.normalizeSupplyKey(d.itemName) === target.key,
      );
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
      const remainingQuantity = this.roundQuantity(
        Math.max(0, target.targetQuantity - committedQuantity),
      );
      const receivedRemainingQuantity = this.roundQuantity(
        Math.max(0, target.targetQuantity - confirmedQuantity),
      );
      return {
        name: target.name,
        unit: target.unit,
        targetQuantity: target.targetQuantity,
        pledgedQuantity: committedQuantity,
        receivedQuantity: confirmedQuantity,
        remainingQuantity,
        receivedRemainingQuantity,
        progressPercent:
          target.targetQuantity > 0
            ? Math.min(
                100,
                Math.round((committedQuantity / target.targetQuantity) * 100),
              )
            : 0,
        isTargetMet: remainingQuantity <= 0,
      };
    });
  }

  private withSupplyProgress<
    T extends { supplyItems: unknown; donations?: DonationForProgress[] },
  >(campaign: T) {
    return {
      ...campaign,
      supplyProgress: this.buildSupplyProgress(
        campaign.supplyItems,
        campaign.donations ?? [],
      ),
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
    if (!receiver)
      throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    if (!receiver.isCharityOrg) {
      throw new ForbiddenException(
        'Chỉ tổ chức từ thiện mới được gửi yêu cầu tạo chiến dịch bếp ăn.',
      );
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

    // Bản JSON dùng để HIỂN THỊ thực đơn — phải giữ `name` và `type` (bữa nào).
    // Trước đây chỗ này ghi thẳng `menuRows`, tức là lưu `customName` và ĐÁNH RƠI `type`:
    // trang quản lý đọc `name`/`type` nên món hiện tên rỗng và luôn nằm ở "Chưa phân bữa".
    const menuJson = (dto.menuItems ?? [])
      .filter((m) => m.name?.trim())
      .map((m, sortOrder) => ({
        name: m.name.trim(),
        type: m.type?.trim() || '',
        plannedServings: m.plannedServings ?? null,
        recipeId: m.recipeId ?? null,
        sortOrder,
      }));

    // supplyItems sau @Transform ở DTO đã là SupplyItemDto[] (string[] được wrap thành {name})
    const supplyJson = (dto.supplyItems ?? [])
      .filter((s) => s.name?.trim())
      .map((s) => ({
        name: s.name.trim(),
        quantity: s.quantity ?? null,
        unit: s.unit ?? null,
      }));

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
          ${JSON.stringify(menuJson)}::jsonb,
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
    void this.notifications.notifyAdmins({
      type: 'campaign',
      title: 'Yêu cầu chiến dịch mới',
      body: `Tổ chức gửi yêu cầu tạo chiến dịch "${dto.title}". Vui lòng xem & duyệt.`,
      data: { campaignId: created, status: 'draft' },
    });

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
        id: true,
        title: true,
        endDate: true,
        endTime: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    const overdueIds: string[] = [];
    const overdueMeta: Array<{ id: string; title: string; userId: string }> =
      [];
    for (const c of overdue) {
      if (!c.endDate) continue;
      // endDate + endTime (UTC) < now → đã quá khứ
      const endAt = new Date(
        `${c.endDate.toISOString().slice(0, 10)}T${c.endTime}:00Z`,
      );
      if (Number.isNaN(endAt.getTime()) || endAt.getTime() >= now.getTime())
        continue;
      overdueIds.push(c.id);
      overdueMeta.push({
        id: c.id,
        title: c.title,
        userId: c.charityReceiver.userId,
      });
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
        id: true,
        title: true,
        endDate: true,
        endTime: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    const expiredIds: string[] = [];
    const expiredMeta: Array<{ id: string; title: string; userId: string }> =
      [];
    for (const c of expired) {
      if (!c.endDate) continue;
      const endAt = new Date(
        `${c.endDate.toISOString().slice(0, 10)}T${c.endTime}:00Z`,
      );
      if (Number.isNaN(endAt.getTime()) || endAt.getTime() >= now.getTime())
        continue;
      expiredIds.push(c.id);
      expiredMeta.push({
        id: c.id,
        title: c.title,
        userId: c.charityReceiver.userId,
      });
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
        recent &&
        (recent.data as Record<string, unknown> | null)?.referenceId ===
          row.assignment_id
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
        recent &&
        (recent.data as Record<string, unknown> | null)?.referenceId ===
          row.assignment_id
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
      if (
        recentOverdue &&
        (recentOverdue.data as Record<string, unknown> | null)?.kind ===
          'deadline_quarter_passed'
      )
        continue;
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
        id: true,
        title: true,
        description: true,
        scheduledDate: true,
        endDate: true,
        kitchenAddress: true,
        imageUrls: true,
        actualServings: true,
        expectedServings: true,
        charityReceiver: {
          select: {
            organizationName: true,
            user: { select: { fullName: true } },
          },
        },
        mealDistributions: { select: { peopleServed: true } },
        assignments: {
          where: {
            status: {
              in: ['assigned', 'checked_in', 'in_progress', 'completed'],
            },
          },
          select: { id: true },
        },
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
      organizationName:
        c.charityReceiver?.organizationName ??
        c.charityReceiver?.user.fullName ??
        null,
    }));
  }

  /** Công khai (không cần đăng nhập): vài chiến dịch đang tuyển, sắp diễn ra — cho trang chủ. */
  async listPublicUpcoming(limit = 3) {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'open', scheduledDate: { gte: this.startOfTodayUTC() } },
      orderBy: { scheduledDate: 'asc' },
      take: Math.min(limit, 12),
      select: {
        id: true,
        title: true,
        description: true,
        scheduledDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        kitchenAddress: true,
        imageUrls: true,
        status: true,
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
        id: true,
        title: true,
        description: true,
        status: true,
        scheduledDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        kitchenAddress: true,
        imageUrls: true,
        chefSlotsNeeded: true,
        waiterSlotsNeeded: true,
        shipperSlotsNeeded: true,
        chefSlotsFilled: true,
        waiterSlotsFilled: true,
        shipperSlotsFilled: true,
        expectedServings: true,
        actualServings: true,
        menuItems: true,
        scheduleItems: true,
        supplyItems: true,
        charityReceiver: {
          select: {
            organizationName: true,
            user: { select: { fullName: true } },
          },
        },
        // Chỉ người đã được duyệt (không hiện pending/rejected/cancelled)
        assignments: {
          where: {
            status: {
              in: [
                'assigned',
                'checked_in',
                'in_progress',
                'completed',
                'absent',
              ],
            },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            status: true,
            shiftId: true,
            ingredientProofUrl: true,
            cookedProofUrl: true,
            distributionProofUrl: true,
            volunteer: {
              select: {
                rank: true,
                user: { select: { fullName: true, avatarUrl: true } },
              },
            },
          },
        },
        donations: {
          where: { status: { in: ['pledged', 'received'] } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            status: true,
            provider: { select: { businessName: true } },
          },
        },
        mealDistributions: {
          orderBy: { distributedAt: 'asc' },
          select: {
            id: true,
            roundLabel: true,
            servingsServed: true,
            peopleServed: true,
            leftoverServings: true,
            photoUrl: true,
            note: true,
            distributedAt: true,
            completedAt: true,
            servedBy: { select: { user: { select: { fullName: true } } } },
            feedback: {
              orderBy: { createdAt: 'desc' },
              select: { satisfaction: true, comment: true, createdAt: true },
            },
          },
        },
        experiences: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            imageUrls: true,
            rating: true,
            createdAt: true,
            volunteer: {
              select: {
                rank: true,
                user: { select: { fullName: true, avatarUrl: true } },
              },
            },
          },
        },
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
        a.ingredientProofUrl
          ? {
              url: a.ingredientProofUrl,
              kind: 'ingredient',
              by: a.volunteer.user.fullName,
            }
          : null,
        a.cookedProofUrl
          ? {
              url: a.cookedProofUrl,
              kind: 'cooked',
              by: a.volunteer.user.fullName,
            }
          : null,
        a.distributionProofUrl
          ? {
              url: a.distributionProofUrl,
              kind: 'distribution',
              by: a.volunteer.user.fullName,
            }
          : null,
      ].filter(
        (x): x is { url: string; kind: string; by: string } => x !== null,
      ),
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

    // Trang công khai chỉ khoe số đã phát THẬT — đợt mới lên kế hoạch không tính.
    const distributionSummary = c.mealDistributions
      .filter((d) => d.completedAt != null)
      .reduce(
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
        ? allFeedback.reduce((s, f) => s + f.satisfaction, 0) /
          allFeedback.length
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

    // Số chỗ ĐÃ GIỮ của từng (ca, ngày) — dùng cho lịch đăng ký theo ngày.
    const campaignDays = this.campaignDays(
      c.scheduledDate,
      c.endDate ?? c.scheduledDate,
    );
    const shiftDayTaken = new Map<string, number>();
    if (c.shifts.length > 0) {
      const taken = await this.prisma.campaignVolunteerAssignment.groupBy({
        by: ['shiftId', 'workDate'],
        where: {
          campaignId: c.id,
          shiftId: { not: null },
          status: {
            in: ['assigned', 'checked_in', 'in_progress', 'completed'],
          },
        },
        _count: { _all: true },
      });
      for (const t of taken) {
        if (!t.shiftId || !t.workDate) continue;
        shiftDayTaken.set(
          `${t.shiftId}|${this.toDateKey(t.workDate)}`,
          t._count._all,
        );
      }
    }

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
      menuItems: CampaignsService.normalizeMenuItems(c.menuItems),
      scheduleItems: Array.isArray(c.scheduleItems) ? c.scheduleItems : [],
      supplyItems: Array.isArray(c.supplyItems)
        ? (c.supplyItems as string[])
        : [],
      organizationName:
        c.charityReceiver?.organizationName ??
        c.charityReceiver?.user.fullName ??
        null,
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
        // Ca đã qua buổi cuối cùng của chiến dịch → không còn buổi nào để có mặt.
        // Trả sẵn cờ để giao diện làm mờ, thay vì mời đăng ký rồi mới báo lỗi.
        expired:
          Date.now() >
          this.vnDateTimeToUtc(c.endDate ?? c.scheduledDate, s.endTime),
        // Ca lặp lại mỗi ngày chiến dịch diễn ra; số chỗ tính riêng từng ngày nên
        // giao diện cần biết ngày nào còn trống, ngày nào đã qua giờ.
        days: campaignDays.map((day) => {
          const key = this.toDateKey(day);
          return {
            date: key,
            slotsNeeded: s.slotsNeeded,
            slotsFilled: shiftDayTaken.get(`${s.id}|${key}`) ?? 0,
            expired: Date.now() > this.vnDateTimeToUtc(day, s.endTime),
          };
        }),
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
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (campaign.status !== 'completed') {
      throw new BadRequestException(
        'Chỉ chia sẻ cảm nhận sau khi chiến dịch đã hoàn tất.',
      );
    }

    // Phải là người đã tham gia (được duyệt) chiến dịch này
    const participated =
      await this.prisma.campaignVolunteerAssignment.findFirst({
        where: {
          campaignId,
          volunteerId: volunteer.id,
          status: {
            in: ['assigned', 'checked_in', 'in_progress', 'completed'],
          },
        },
      });
    if (!participated) {
      throw new ForbiddenException(
        'Chỉ tình nguyện viên đã tham gia chiến dịch mới chia sẻ được cảm nhận.',
      );
    }

    const experience = await this.prisma.campaignExperience.upsert({
      where: {
        campaignId_volunteerId: { campaignId, volunteerId: volunteer.id },
      },
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
    return {
      id: experience.id,
      message: 'Đã chia sẻ cảm nhận của bạn. Cảm ơn bạn!',
    };
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
        charityReceiver: {
          select: {
            organizationName: true,
            user: { select: { fullName: true } },
          },
        },
        assignments: {
          select: {
            id: true,
            role: true,
            status: true,
            volunteer: {
              select: { user: { select: { fullName: true, avatarUrl: true } } },
            },
          },
        },
        donations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            status: true,
            provider: { select: { businessName: true } },
          },
        },
      },
    });
    return campaigns.map((campaign) => this.withSupplyProgress(campaign));
  }

  async myCampaigns(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
    });
    if (!receiver)
      throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: { charityReceiverId: receiver.id },
      orderBy: { createdAt: 'desc' },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            note: true,
            status: true,
            provider: { select: { businessName: true } },
          },
        },
      },
    });
    return campaigns.map((campaign) => this.withSupplyProgress(campaign));
  }

  /** Việc của tình nguyện viên: các campaign đã đăng ký + vai trò + trạng thái. */
  async myAssignments(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { volunteerId: volunteer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        shift: {
          select: {
            id: true,
            label: true,
            role: true,
            startTime: true,
            endTime: true,
          },
        },
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

    // Lấy delivery của từng campaign shipper qua campaign_provider_requests → campaign_transports
    const shipperAssignments = assignments.filter((a) => a.role === 'shipper');
    if (shipperAssignments.length === 0) return assignments;

    // Query từng campaign để tránh lỗi "uuid = text" với ANY(text[])
    const deliveryByCampaign = new Map<string, string>();
    for (const assignment of shipperAssignments) {
      const [row] = await this.prisma.$queryRaw<{ delivery_id: string }[]>`
        SELECT ct.delivery_id
        FROM campaign_provider_requests cpr
        JOIN campaign_transports ct ON ct.provider_request_id = cpr.id
        WHERE cpr.campaign_id = ${assignment.campaignId}::uuid
          AND cpr.status = 'accepted'
          AND cpr.needs_transport = true
          AND ct.delivery_id IS NOT NULL
        LIMIT 1
      `;
      if (row?.delivery_id)
        deliveryByCampaign.set(assignment.campaignId, row.delivery_id);
    }

    // Đợt phát mà shipper này được phân công đi giao. `assigneeIds` là JSONB array<uuid>
    // nên lọc bằng array_contains (Postgres `@>`), không join được bằng quan hệ.
    const distributions = await this.prisma.mealDistribution.findMany({
      where: {
        campaignId: { in: shipperAssignments.map((a) => a.campaignId) },
        assigneeIds: { array_contains: volunteer.id },
      },
      orderBy: { distributedAt: 'desc' },
      select: {
        id: true,
        campaignId: true,
        roundLabel: true,
        servingsServed: true,
        peopleServed: true,
        note: true,
        points: true,
        distributedAt: true,
        completedAt: true,
      },
    });
    const distByCampaign = new Map<string, typeof distributions>();
    for (const d of distributions) {
      const arr = distByCampaign.get(d.campaignId) ?? [];
      arr.push(d);
      distByCampaign.set(d.campaignId, arr);
    }

    return assignments.map((a) =>
      a.role === 'shipper'
        ? {
            ...a,
            deliveryId: deliveryByCampaign.get(a.campaignId) ?? null,
            distributions: (distByCampaign.get(a.campaignId) ?? []).map(
              (d) => ({
                id: d.id,
                roundLabel: d.roundLabel,
                servingsServed: d.servingsServed,
                peopleServed: d.peopleServed,
                note: d.note,
                distributedAt: d.distributedAt,
                completedAt: d.completedAt,
                points: Array.isArray(d.points) ? (d.points as unknown[]) : [],
              }),
            ),
          }
        : a,
    );
  }

  /**
   * Chi tiết 1 nhiệm vụ của TNV cho trang "Vào nhiệm vụ":
   *  - Thông tin assignment + ca + chiến dịch.
   *  - Chef/Waiter: danh sách món + 4 khâu + trạng thái hiệu lực (delegated sang DishStepsService).
   *  - Shipper: delivery info để điều hướng sang /deliveries.
   *
   * Quyền: chỉ TNV là chủ assignment mới xem được.
   */
  async getMyTaskDetail(assignmentId: string, userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignment = await this.prisma.campaignVolunteerAssignment.findUnique(
      {
        where: { id: assignmentId },
        include: {
          shift: {
            select: {
              id: true,
              label: true,
              role: true,
              startTime: true,
              endTime: true,
            },
          },
          campaign: {
            select: {
              id: true,
              title: true,
              description: true,
              kitchenAddress: true,
              scheduledDate: true,
              endDate: true,
              startTime: true,
              endTime: true,
              status: true,
              // Danh sách nguyên liệu bếp khai lúc tạo chiến dịch — đây là "số kg đã gửi
              // lúc đầu" mà shipper phải đối chiếu khi lấy hàng.
              supplyItems: true,
              charityReceiver: {
                select: {
                  organizationName: true,
                  user: { select: { fullName: true, phone: true } },
                },
              },
            },
          },
        },
      },
    );
    if (!assignment) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    if (assignment.volunteerId !== volunteer.id) {
      throw new ForbiddenException('Bạn không có quyền xem nhiệm vụ này.');
    }

    // Shipper → trả delivery info + pickup details
    if (assignment.role === 'shipper') {
      // Lấy delivery qua campaign_provider_requests → campaign_transports
      const [delivery] = await this.prisma.$queryRaw<
        {
          id: string;
          status: string;
          pickup_start_time: string | null;
          pickup_end_time: string | null;
        }[]
      >`
        SELECT d.id, d.status, cpr.pickup_start_time, cpr.pickup_end_time
        FROM deliveries d
        JOIN campaign_provider_requests cpr ON cpr.id = d.provider_request_id
        JOIN campaign_transports ct ON ct.provider_request_id = cpr.id AND ct.delivery_id = d.id
        WHERE cpr.campaign_id = ${assignment.campaignId}::uuid
          AND d.shipper_id = ${volunteer.id}::uuid
          AND cpr.status = 'accepted'
          AND cpr.needs_transport = true
        LIMIT 1
      `;
      // Các đợt phát tổ chức giao cho chính shipper này — đây mới là "việc cần làm"
      // cụ thể, thay vì chỉ một nút đổi trạng thái chung chung.
      const distributions = await this.prisma.mealDistribution.findMany({
        where: {
          campaignId: assignment.campaignId,
          assigneeIds: { array_contains: volunteer.id },
        },
        orderBy: { distributedAt: 'asc' },
        select: {
          id: true,
          roundLabel: true,
          servingsServed: true,
          peopleServed: true,
          note: true,
          points: true,
          distributedAt: true,
          completedAt: true,
          actualServings: true,
          actualPeopleServed: true,
        },
      });

      const pickupOrders = await this.listPickupOrders(
        [assignment.campaignId],
        volunteer.id,
      );

      return {
        assignment: {
          id: assignment.id,
          role: assignment.role,
          status: assignment.status,
          checkInTime: assignment.checkInTime,
          checkInLateMinutes: assignment.checkInLateMinutes,
          workDate: assignment.workDate,
          ingredientProofUrl: assignment.ingredientProofUrl,
          cookedProofUrl: assignment.cookedProofUrl,
          distributionProofUrl: assignment.distributionProofUrl,
          pointsAwarded: assignment.pointsAwarded,
          shift: assignment.shift,
        },
        campaign: assignment.campaign,
        pickupOrders,
        delivery: delivery
          ? {
              id: delivery.id,
              status: delivery.status,
              pickupStartTime: delivery.pickup_start_time,
              pickupEndTime: delivery.pickup_end_time,
            }
          : null,
        distributions: distributions.map((d) => ({
          id: d.id,
          roundLabel: d.roundLabel,
          servingsServed: d.servingsServed,
          peopleServed: d.peopleServed,
          note: d.note,
          distributedAt: d.distributedAt,
          completedAt: d.completedAt,
          actualServings: d.actualServings,
          actualPeopleServed: d.actualPeopleServed,
          points: Array.isArray(d.points) ? (d.points as unknown[]) : [],
        })),
      };
    }

    // Chef / Waiter → trả dishes + steps
    const detail = await this.dishSteps.getStepsForCampaign(
      assignment.campaignId,
      userId,
    );

    return {
      assignment: {
        id: assignment.id,
        role: assignment.role,
        status: assignment.status,
        checkInTime: assignment.checkInTime,
        checkInLateMinutes: assignment.checkInLateMinutes,
        workDate: assignment.workDate,
        ingredientProofUrl: assignment.ingredientProofUrl,
        cookedProofUrl: assignment.cookedProofUrl,
        distributionProofUrl: assignment.distributionProofUrl,
        pointsAwarded: assignment.pointsAwarded,
        shift: assignment.shift,
      },
      campaign: assignment.campaign,
      ...detail,
    };
  }

  /**
   * Các ĐƠN NGUYÊN LIỆU đã được NCC nhận của một chiến dịch, kèm mọi thứ shipper cần
   * để đi lấy: tên/địa chỉ/SĐT nhà cung cấp, ngày + khung giờ hẹn lấy, quãng đường
   * NCC → bếp, số kg đã đặt, và biên nhận (nếu đã lấy).
   *
   * Phân biệt hai loại đơn — chúng đi hai luồng khác nhau, không được trộn:
   *  - `needsTransport = true`  → có bản ghi `deliveries`, shipper chạy luồng /deliveries
   *    (ảnh QC đã bắt buộc ở bước `qc_completed`).
   *  - `needsTransport = false` → bếp tự cử TNV đi lấy. Trước đây luồng này KHÔNG có
   *    bằng chứng nào; giờ chốt bằng `campaign_ingredient_pickups` (ảnh + số kg thực nhận).
   */
  private async listPickupOrders(campaignIds: string[], volunteerId: string) {
    if (campaignIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        campaign_id: string;
        campaign_title: string;
        kitchen_address: string;
        scheduled_date: Date | null;
        pickup_start_time: string | null;
        pickup_end_time: string | null;
        needs_transport: boolean;
        demand_details: unknown;
        message: string | null;
        business_name: string;
        provider_address: string | null;
        provider_phone: string | null;
        lng: number | null;
        lat: number | null;
        distance_km: number | null;
        delivery_id: string | null;
        delivery_status: string | null;
        delivery_shipper_id: string | null;
        pickup_id: string | null;
        requested_kg: string | null;
        received_kg: string | null;
        photo_url: string | null;
        pickup_note: string | null;
        confirmed_at: Date | null;
        pickup_volunteer_id: string | null;
        pickup_by_name: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        cpr.id,
        cpr.campaign_id,
        kc.title AS campaign_title,
        kc.kitchen_address,
        cpr.scheduled_date,
        cpr.pickup_start_time,
        cpr.pickup_end_time,
        cpr.needs_transport,
        cpr.demand_details,
        cpr.message,
        pp.business_name,
        pp.address AS provider_address,
        COALESCE(pp.contact_phone, pu.phone) AS provider_phone,
        ST_X(pp.location::geometry) AS lng,
        ST_Y(pp.location::geometry) AS lat,
        ST_Distance(pp.location::geography, kc.kitchen_location::geography) / 1000 AS distance_km,
        d.id AS delivery_id,
        d.status::text AS delivery_status,
        d.shipper_id AS delivery_shipper_id,
        cip.id AS pickup_id,
        cip.requested_kg,
        cip.received_kg,
        cip.photo_url,
        cip.note AS pickup_note,
        cip.confirmed_at,
        cip.volunteer_id AS pickup_volunteer_id,
        cu.full_name AS pickup_by_name
      FROM campaign_provider_requests cpr
      JOIN provider_profiles pp ON pp.id = cpr.provider_id
      JOIN users pu ON pu.id = pp.user_id
      JOIN kitchen_campaigns kc ON kc.id = cpr.campaign_id
      LEFT JOIN deliveries d ON d.provider_request_id = cpr.id
      LEFT JOIN campaign_ingredient_pickups cip ON cip.provider_request_id = cpr.id
      LEFT JOIN volunteer_profiles cvp ON cvp.id = cip.volunteer_id
      LEFT JOIN users cu ON cu.id = cvp.user_id
      WHERE cpr.campaign_id IN (${Prisma.join(campaignIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND cpr.status = 'accepted'
      ORDER BY cpr.pickup_start_time NULLS LAST, cpr.created_at ASC
    `);

    return rows.map((r) => {
      const demand = (r.demand_details ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (v == null ? null : Number(v));
      return {
        id: r.id,
        campaignId: r.campaign_id,
        campaignTitle: r.campaign_title,
        kitchenAddress: r.kitchen_address,
        providerName: r.business_name,
        providerAddress: r.provider_address,
        providerPhone: r.provider_phone,
        lng: num(r.lng),
        lat: num(r.lat),
        /** Khoảng cách NCC → bếp (km, đường chim bay). null khi thiếu toạ độ. */
        distanceKm:
          r.distance_km == null
            ? null
            : Math.round(Number(r.distance_km) * 10) / 10,
        scheduledDate: r.scheduled_date,
        pickupStartTime: r.pickup_start_time,
        pickupEndTime: r.pickup_end_time,
        needsTransport: r.needs_transport,
        message: r.message,
        ingredientName: (demand.ingredientName as string | undefined) ?? null,
        foodCategory: (demand.foodCategory as string | undefined) ?? null,
        quantityKg: num(demand.quantityKg),
        expectedServings: num(demand.expectedServings),
        requireColdChain: demand.requireColdChain === true,
        requireQcPhoto: demand.requireQcPhoto === true,
        requireAtvstpCert: demand.requireAtvstpCert === true,
        delivery: r.delivery_id
          ? {
              id: r.delivery_id,
              status: r.delivery_status,
              /** true khi chính TNV đang xem là shipper của chuyến này. */
              isMine: r.delivery_shipper_id === volunteerId,
            }
          : null,
        pickup: r.pickup_id
          ? {
              id: r.pickup_id,
              requestedKg: num(r.requested_kg),
              receivedKg: num(r.received_kg),
              photoUrl: r.photo_url,
              note: r.pickup_note,
              confirmedAt: r.confirmed_at,
              byName: r.pickup_by_name,
              isMine: r.pickup_volunteer_id === volunteerId,
            }
          : null,
      };
    });
  }

  /**
   * Trung tâm giao hàng: tất cả đơn nguyên liệu shipper cần đi lấy, gom từ MỌI chiến dịch
   * đang chạy mà họ nhận ca — để quản lý đơn ở một chỗ thay vì phải mở từng chiến dịch.
   *
   * Chỉ lấy chiến dịch `in_progress`: chiến dịch chưa bắt đầu thì chưa điểm danh được,
   * mà chưa điểm danh thì cũng chưa xác nhận lấy hàng được.
   */
  async myPickupOrders(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        volunteerId: volunteer.id,
        role: 'shipper',
        status: { in: ['assigned', 'checked_in', 'in_progress'] },
        campaign: { status: 'in_progress' },
      },
      select: { id: true, campaignId: true, status: true },
    });
    if (assignments.length === 0) return [];

    // Điểm danh là điều kiện bắt buộc để xác nhận lấy hàng — trả kèm để FE biết nên
    // hiện nút hay hiện nhắc "điểm danh trước", thay vì để người dùng bấm rồi ăn lỗi.
    const checkedInByCampaign = new Map(
      assignments.map((a) => [
        a.campaignId,
        {
          assignmentId: a.id,
          checkedIn: ['checked_in', 'in_progress', 'completed'].includes(
            a.status,
          ),
        },
      ]),
    );

    const orders = await this.listPickupOrders(
      assignments.map((a) => a.campaignId),
      volunteer.id,
    );
    return orders.map((o) => ({
      ...o,
      assignmentId: checkedInByCampaign.get(o.campaignId)?.assignmentId ?? null,
      checkedIn: checkedInByCampaign.get(o.campaignId)?.checkedIn ?? false,
    }));
  }

  /** Lịch sử các đơn nguyên liệu shipper đã lấy — phân trang server-side. */
  async myPickupHistory(
    userId: string,
    opts: { page?: number; limit?: number } = {},
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 20, 100);

    const [total, rows] = await Promise.all([
      this.prisma.campaignIngredientPickup.count({
        where: { volunteerId: volunteer.id },
      }),
      this.prisma.campaignIngredientPickup.findMany({
        where: { volunteerId: volunteer.id },
        orderBy: { confirmedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          providerRequestId: true,
          campaignId: true,
          requestedKg: true,
          receivedKg: true,
          photoUrl: true,
          note: true,
          confirmedAt: true,
          providerRequest: {
            select: {
              pickupStartTime: true,
              pickupEndTime: true,
              scheduledDate: true,
              needsTransport: true,
              message: true,
              demandDetails: true,
              provider: {
                select: {
                  businessName: true,
                  address: true,
                  contactPhone: true,
                  user: { select: { phone: true } },
                },
              },
              campaign: {
                select: {
                  title: true,
                  kitchenAddress: true,
                  scheduledDate: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Toạ độ NCC + quãng đường về bếp nằm ở cột `geography`, Prisma không select được —
    // lấy bổ sung bằng một truy vấn raw cho đúng các đơn của trang này.
    const geo = new Map<
      string,
      { lng: number | null; lat: number | null; distanceKm: number | null }
    >();
    if (rows.length > 0) {
      const geoRows = await this.prisma.$queryRaw<
        {
          id: string;
          lng: number | null;
          lat: number | null;
          distance_km: number | null;
        }[]
      >(Prisma.sql`
        SELECT
          cpr.id,
          ST_X(pp.location::geometry) AS lng,
          ST_Y(pp.location::geometry) AS lat,
          ST_Distance(pp.location::geography, kc.kitchen_location::geography) / 1000 AS distance_km
        FROM campaign_provider_requests cpr
        JOIN provider_profiles pp ON pp.id = cpr.provider_id
        JOIN kitchen_campaigns kc ON kc.id = cpr.campaign_id
        WHERE cpr.id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.providerRequestId}::uuid`))})
      `);
      for (const g of geoRows) {
        geo.set(g.id, {
          lng: g.lng == null ? null : Number(g.lng),
          lat: g.lat == null ? null : Number(g.lat),
          distanceKm:
            g.distance_km == null
              ? null
              : Math.round(Number(g.distance_km) * 10) / 10,
        });
      }
    }

    return {
      items: rows.map((r) => {
        const req = r.providerRequest;
        const demand = (req.demandDetails ?? {}) as Record<string, unknown>;
        const num = (v: unknown) => (v == null ? null : Number(v));
        const requestedKg =
          r.requestedKg == null ? null : Number(r.requestedKg);
        const receivedKg = Number(r.receivedKg);
        const g = geo.get(r.providerRequestId);
        return {
          id: r.id,
          providerRequestId: r.providerRequestId,
          campaignId: r.campaignId,
          campaignTitle: req.campaign.title,
          campaignDate: req.campaign.scheduledDate,
          campaignTimeRange: `${req.campaign.startTime}–${req.campaign.endTime}`,
          kitchenAddress: req.campaign.kitchenAddress,
          providerName: req.provider.businessName,
          providerAddress: req.provider.address,
          providerPhone:
            req.provider.contactPhone ?? req.provider.user.phone ?? null,
          lng: g?.lng ?? null,
          lat: g?.lat ?? null,
          distanceKm: g?.distanceKm ?? null,
          needsTransport: req.needsTransport,
          message: req.message,
          ingredientName: (demand.ingredientName as string | undefined) ?? null,
          foodCategory: (demand.foodCategory as string | undefined) ?? null,
          expectedServings: num(demand.expectedServings),
          requireColdChain: demand.requireColdChain === true,
          requireQcPhoto: demand.requireQcPhoto === true,
          requireAtvstpCert: demand.requireAtvstpCert === true,
          scheduledDate: req.scheduledDate,
          pickupStartTime: req.pickupStartTime,
          pickupEndTime: req.pickupEndTime,
          requestedKg,
          receivedKg,
          shortfallKg:
            requestedKg == null
              ? 0
              : Math.round(Math.max(0, requestedKg - receivedKg) * 10) / 10,
          photoUrl: r.photoUrl,
          note: r.note,
          confirmedAt: r.confirmedAt,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Shipper xác nhận ĐÃ LẤY nguyên liệu tại NCC: bắt buộc ảnh + số kg thực nhận.
   *
   * Lý do bắt buộc cả hai: bếp đặt 30kg mà TNV chỉ lấy được 22kg thì thực đơn phải
   * tính lại NGAY, không phải lúc đã nấu dở. Chỉ bấm "xong" thì thiếu hụt chỉ lộ ra
   * khi mở bao hàng.
   *
   * KHÔNG chặn theo `needsTransport`: cờ đó chỉ nói chiến dịch có nhờ hệ thống tìm shipper
   * ngoài hay không, và chuyến đó có thể thất bại / chưa ai nhận, trong khi TNV ca sáng của
   * bếp vẫn đi lấy. Chỉ chặn đúng hai trường hợp thật sự trùng lặp (xem bên dưới).
   */
  async confirmIngredientPickup(
    providerRequestId: string,
    userId: string,
    dto: { receivedKg: number; note?: string },
    photoUrl?: string,
  ) {
    if (!photoUrl) {
      throw new BadRequestException(
        'Cần ảnh chụp nguyên liệu đã lấy để xác nhận.',
      );
    }

    const request = await this.prisma.campaignProviderRequest.findUnique({
      where: { id: providerRequestId },
      select: {
        id: true,
        campaignId: true,
        status: true,
        needsTransport: true,
        demandDetails: true,
        provider: { select: { businessName: true } },
        delivery: { select: { id: true, status: true, shipperId: true } },
        campaign: {
          select: {
            title: true,
            charityReceiver: { select: { userId: true } },
          },
        },
      },
    });
    if (!request)
      throw new NotFoundException('Không tìm thấy đơn nguyên liệu.');
    if (request.status !== 'accepted') {
      throw new BadRequestException(
        'Đơn này chưa được nhà cung cấp chấp nhận.',
      );
    }

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // Hai trường hợp trùng lặp thật sự — chốt ở đây sẽ tạo hai nguồn sự thật cho cùng
    // một lần lấy hàng:
    const activeDeliveryStatuses = [
      'assigned',
      'heading_to_provider',
      'qc_completed',
      'in_transit',
    ];
    if (request.delivery?.status === 'delivered') {
      throw new BadRequestException(
        'Đơn này đã được shipper vận chuyển giao về bếp — không cần xác nhận lại.',
      );
    }
    if (
      request.delivery &&
      request.delivery.shipperId === volunteer.id &&
      activeDeliveryStatuses.includes(request.delivery.status)
    ) {
      throw new BadRequestException(
        'Bạn đang chạy chính chuyến này ở màn giao hàng — chụp ảnh QC ở bước "Đã lấy hàng" tại đó.',
      );
    }

    // Phải là shipper của chiến dịch VÀ đã điểm danh — cùng lý do với chốt đợt phát:
    // không điểm danh thì người ở nhà vẫn "xác nhận đã lấy" được.
    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId: request.campaignId,
        volunteerId: volunteer.id,
        role: 'shipper',
      },
      select: { id: true, status: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'Bạn không phải shipper của chiến dịch này.',
      );
    }
    if (
      !['checked_in', 'in_progress', 'completed'].includes(assignment.status)
    ) {
      throw new BadRequestException(
        'Bạn cần điểm danh tại bếp trước khi xác nhận đã lấy nguyên liệu.',
      );
    }

    const demand = (request.demandDetails ?? {}) as Record<string, unknown>;
    const requestedKg =
      demand.quantityKg == null ? null : Number(demand.quantityKg);
    if (requestedKg != null && dto.receivedKg > requestedKg * 1.5) {
      throw new BadRequestException(
        `Số kg thực nhận (${dto.receivedKg}) vượt quá 150% số đã đặt (${requestedKg} kg) — kiểm tra lại con số.`,
      );
    }

    // create + unique(providerRequestId): hai người cùng bấm thì người sau nhận lỗi rõ ràng
    // thay vì ghi đè biên nhận của người trước.
    const existing = await this.prisma.campaignIngredientPickup.findUnique({
      where: { providerRequestId },
      select: { id: true, confirmedAt: true },
    });
    if (existing) {
      throw new BadRequestException('Đơn này đã được xác nhận lấy hàng rồi.');
    }

    const pickup = await this.prisma.campaignIngredientPickup.create({
      data: {
        providerRequestId,
        campaignId: request.campaignId,
        assignmentId: assignment.id,
        volunteerId: volunteer.id,
        requestedKg,
        receivedKg: dto.receivedKg,
        photoUrl,
        note: dto.note?.trim() || null,
      },
    });

    // Ảnh mới nhất cũng gắn vào assignment để trang quản lý của tổ chức thấy ngay
    // trong bộ ảnh minh chứng chung.
    await this.prisma.campaignVolunteerAssignment.update({
      where: { id: assignment.id },
      data: { ingredientProofUrl: photoUrl, ingredientProofAt: new Date() },
    });

    const shortfall =
      requestedKg == null ? 0 : Math.max(0, requestedKg - dto.receivedKg);
    void this.notifications.notify(request.campaign.charityReceiver.userId, {
      type: 'campaign',
      title:
        shortfall > 0
          ? 'Nguyên liệu về THIẾU so với đơn'
          : 'Đã lấy nguyên liệu',
      body:
        `${volunteer.user.fullName} đã lấy ${dto.receivedKg} kg` +
        (requestedKg != null ? `/${requestedKg} kg` : '') +
        ` từ ${request.provider.businessName} cho "${request.campaign.title}"` +
        (shortfall > 0
          ? ` — thiếu ${Math.round(shortfall * 10) / 10} kg.`
          : '.') +
        (dto.note?.trim() ? ` Ghi chú: ${dto.note.trim()}` : ''),
      data: {
        campaignId: request.campaignId,
        providerRequestId,
        receivedKg: dto.receivedKg,
        requestedKg,
        shortfallKg: Math.round(shortfall * 10) / 10,
      },
    });

    return {
      id: pickup.id,
      providerRequestId,
      receivedKg: Number(pickup.receivedKg),
      requestedKg,
      shortfallKg: Math.round(shortfall * 10) / 10,
      photoUrl,
      confirmedAt: pickup.confirmedAt,
    };
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
        charityReceiver: {
          select: {
            organizationName: true,
            user: { select: { fullName: true } },
          },
        },
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
          select: {
            id: true,
            customName: true,
            plannedServings: true,
            recipeId: true,
            sortOrder: true,
          },
        },
        // TẤT CẢ trạng thái (kể cả pending — quan trọng cho trang manage)
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            // Hồ sơ TNV — cần cho các API nhận volunteerId (vd chọn người phụ trách đợt phát)
            volunteerId: true,
            role: true,
            status: true,
            shiftId: true,
            workDate: true,
            checkInTime: true,
            shift: {
              select: {
                id: true,
                label: true,
                role: true,
                startTime: true,
                endTime: true,
              },
            },
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
            completedAt: true,
            completedByVolunteerId: true,
            assigneeIds: true,
            points: true,
            servedBy: { select: { user: { select: { fullName: true } } } },
            feedback: {
              orderBy: { createdAt: 'desc' },
              select: { satisfaction: true, comment: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    const assignmentIds = campaign.assignments.map(
      (assignment) => assignment.id,
    );
    const checkInLocations = new Map<string, { lng: number; lat: number }>();
    if (assignmentIds.length > 0) {
      const locations = await this.prisma.$queryRaw<
        { id: string; lng: number; lat: number }[]
      >(Prisma.sql`
        SELECT
          id,
          ST_X(check_in_location::geometry) AS lng,
          ST_Y(check_in_location::geometry) AS lat
        FROM campaign_volunteer_assignments
        WHERE id IN (${Prisma.join(assignmentIds.map((assignmentId) => Prisma.sql`${assignmentId}::uuid`))})
          AND check_in_location IS NOT NULL
      `);
      for (const location of locations) {
        checkInLocations.set(location.id, {
          lng: Number(location.lng),
          lat: Number(location.lat),
        });
      }
    }

    // participants: tất cả, kể cả pending — enriched với thông tin uy tín + lịch sử
    const participants = campaign.assignments.map((a) => ({
      id: a.id,
      // Hồ sơ TNV — khác `id` (id của bản ghi phân công). Cần cho các API nhận
      // volunteerId, ví dụ chọn người phụ trách đợt phát.
      volunteerId: a.volunteerId,
      role: a.role,
      status: a.status,
      shiftId: a.shiftId,
      workDate: a.workDate,
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
        specializations: a.volunteer.specializations.map(
          (s) => s.specialization,
        ),
        pastCampaignsCount: a.volunteer.campaignExperiences.length,
      },
    }));

    // Thống kê "đã phát" CHỈ tính các đợt đã xác nhận phát xong — đợt mới lên kế hoạch
    // chưa có suất nào tới tay người dân, tính vào là báo cáo sai.
    const distributionSummary = campaign.mealDistributions
      .filter((d) => d.completedAt != null)
      .reduce(
        (acc, d) => ({
          servingsServed: acc.servingsServed + d.servingsServed,
          peopleServed: acc.peopleServed + d.peopleServed,
          leftoverServings: acc.leftoverServings + d.leftoverServings,
        }),
        { servingsServed: 0, peopleServed: 0, leftoverServings: 0 },
      );

    // Phần đã lên kế hoạch nhưng chưa xác nhận — để tổ chức biết còn bao nhiêu đang chạy.
    const plannedSummary = campaign.mealDistributions
      .filter((d) => d.completedAt == null)
      .reduce(
        (acc, d) => ({
          rounds: acc.rounds + 1,
          servings: acc.servings + d.servingsServed,
        }),
        { rounds: 0, servings: 0 },
      );

    const fillRate = this.campaignFillRate(campaign);
    const minFillPercent = await this.systemConfig.getNumber(
      'CAMPAIGN_MIN_FILL_PERCENT',
    );

    // kitchen_location là cột geography (Unsupported trong Prisma) → đọc qua raw SQL.
    const [kitchenCoords] = await this.prisma.$queryRaw<
      { lng: number | null; lat: number | null }[]
    >(
      Prisma.sql`
        SELECT ST_X(kitchen_location::geometry) AS lng, ST_Y(kitchen_location::geometry) AS lat
        FROM kitchen_campaigns WHERE id = ${id}::uuid
      `,
    );

    // Tên các shipper được phân công — tra một lượt cho mọi đợt, tránh N+1.
    const assigneeIdsAll = [
      ...new Set(
        campaign.mealDistributions.flatMap((d) =>
          Array.isArray(d.assigneeIds) ? (d.assigneeIds as string[]) : [],
        ),
      ),
    ];
    const assigneeNameById = new Map<string, string>();
    if (assigneeIdsAll.length > 0) {
      const rows = await this.prisma.volunteerProfile.findMany({
        where: { id: { in: assigneeIdsAll } },
        select: { id: true, user: { select: { fullName: true } } },
      });
      for (const r of rows) assigneeNameById.set(r.id, r.user.fullName);
    }

    const distributions = campaign.mealDistributions.map((d) => {
      const ids = Array.isArray(d.assigneeIds)
        ? (d.assigneeIds as string[])
        : [];
      return {
        id: d.id,
        roundLabel: d.roundLabel,
        servingsServed: d.servingsServed,
        peopleServed: d.peopleServed,
        leftoverServings: d.leftoverServings,
        photoUrl: d.photoUrl,
        note: d.note,
        distributedAt: d.distributedAt,
        completedAt: d.completedAt,
        servedBy: d.servedBy.user.fullName,
        assignees: ids.map((id) => ({
          volunteerId: id,
          fullName: assigneeNameById.get(id) ?? 'TNV',
        })),
        points: Array.isArray(d.points) ? d.points : [],
        feedback: d.feedback,
      };
    });

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
      /** Nhân sự đã tuyển so với ngưỡng tối thiểu — FE dùng để khoá nút "Bắt đầu". */
      staffing: { ...fillRate, minPercent: minFillPercent },
      // Toạ độ bếp: để FE mở bản đồ ghim điểm phát ngay quanh bếp thay vì giữa thành phố.
      kitchenLng: kitchenCoords?.lng != null ? Number(kitchenCoords.lng) : null,
      kitchenLat: kitchenCoords?.lat != null ? Number(kitchenCoords.lat) : null,
      imageUrls: Array.isArray(campaign.imageUrls)
        ? (campaign.imageUrls as string[])
        : [],
      chefSlotsNeeded: campaign.chefSlotsNeeded,
      waiterSlotsNeeded: campaign.waiterSlotsNeeded,
      shipperSlotsNeeded: campaign.shipperSlotsNeeded,
      chefSlotsFilled: campaign.chefSlotsFilled,
      waiterSlotsFilled: campaign.waiterSlotsFilled,
      shipperSlotsFilled: campaign.shipperSlotsFilled,
      expectedServings: campaign.expectedServings,
      actualServings: campaign.actualServings,
      menuItems: CampaignsService.normalizeMenuItems(campaign.menuItems),
      scheduleItems: Array.isArray(campaign.scheduleItems)
        ? campaign.scheduleItems
        : [],
      supplyItems: Array.isArray(campaign.supplyItems)
        ? (campaign.supplyItems as string[])
        : [],
      organizationName:
        campaign.charityReceiver?.organizationName ??
        campaign.charityReceiver?.user.fullName ??
        null,
      participants,
      donations: campaign.donations,
      distributions,
      distributionSummary,
      plannedSummary,
      shifts: campaign.shifts,
      menuItemRefs: campaign.menuItemRefs,
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: {
        charityReceiver: {
          select: {
            organizationName: true,
            user: { select: { fullName: true } },
          },
        },
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
          select: {
            id: true,
            customName: true,
            plannedServings: true,
            recipeId: true,
            sortOrder: true,
          },
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
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // Chốt uy tín: TNV đang bị khoá/hạn chế thì không được tham gia
    if (volunteer.user.status === 'banned') {
      throw new ForbiddenException(
        'Tài khoản của bạn đang bị khoá, không thể tham gia chiến dịch.',
      );
    }
    if (volunteer.user.status === 'suspended') {
      throw new ForbiddenException(
        'Tài khoản của bạn đang bị hạn chế do uy tín thấp, không thể tham gia chiến dịch.',
      );
    }

    // Chỉ cho ứng tuyển đúng chuyên môn đã đăng ký (chef/waiter/shipper)
    const roleVN = ROLE_VN[dto.role] ?? dto.role;
    const hasRole = volunteer.specializations.some(
      (s) => s.specialization === dto.role,
    );
    if (!hasRole) {
      throw new BadRequestException(
        `Bạn chưa đăng ký chuyên môn "${roleVN}". Chỉ ứng tuyển được vai trò đúng chuyên môn của mình.`,
      );
    }

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['open', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận đăng ký.');
    }
    // Chặn đăng ký khi chiến dịch đã kết thúc hẳn.
    //
    // Mốc so sánh là NGÀY KẾT THÚC chứ không phải ngày bắt đầu: chiến dịch 12/08→14/08
    // vẫn còn hai ngày làm việc vào sáng 13/08, chặn theo `scheduledDate` là đóng cửa
    // đăng ký ngay từ ngày thứ hai.
    const lastDay = campaign.endDate ?? campaign.scheduledDate;
    if (Date.now() > this.vnDateTimeToUtc(lastDay, campaign.endTime)) {
      throw new BadRequestException(
        'Chiến dịch này đã kết thúc, không còn nhận đăng ký.',
      );
    }

    // Chiến dịch chia ca thì phải đăng ký theo ca cụ thể. Điều kiện `!dto.shiftId`
    // là bắt buộc: thiếu nó thì lối vào /shifts/:shiftId/apply — vốn LUÔN kèm shiftId
    // — cũng bị chặn, và chiến dịch có ca sẽ không nhận được đăng ký nào.
    const shiftCount = await this.prisma.campaignShift.count({
      where: { campaignId },
    });
    if (shiftCount > 0 && !dto.shiftId) {
      throw new BadRequestException(
        'Chiến dịch này có ca làm việc, vui lòng đăng ký trực tiếp theo từng ca.',
      );
    }

    const slot = SLOT_FIELD[dto.role];
    const needed = campaign[slot.needed];
    const filled = campaign[slot.filled];
    if (filled >= needed) {
      throw new BadRequestException(
        `Đã đủ tình nguyện viên vai trò ${roleVN}.`,
      );
    }

    let shiftId: string | undefined;
    // Ngày trực. Chiến dịch một ngày thì chỉ có một lựa chọn nên tự suy ra; nhiều ngày
    // thì TNV phải nói rõ trực buổi nào, nếu không tổ chức không xếp được người theo ngày.
    const campaignDays = this.campaignDays(campaign.scheduledDate, lastDay);
    let workDate: Date = campaign.scheduledDate;

    if (dto.shiftId) {
      const shift = await this.prisma.campaignShift.findUnique({
        where: { id: dto.shiftId },
      });
      if (!shift || shift.campaignId !== campaignId) {
        throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
      }
      if (shift.role && shift.role !== dto.role) {
        throw new BadRequestException(
          `Ca "${shift.label}" không phù hợp với vai trò ${roleVN}.`,
        );
      }

      if (dto.workDate) {
        const picked = campaignDays.find(
          (d) => this.toDateKey(d) === dto.workDate,
        );
        if (!picked) {
          throw new BadRequestException(
            `Ngày ${dto.workDate} không nằm trong thời gian diễn ra chiến dịch.`,
          );
        }
        workDate = picked;
      } else if (campaignDays.length > 1) {
        throw new BadRequestException(
          'Chiến dịch diễn ra nhiều ngày — hãy chọn ngày bạn trực cho ca này.',
        );
      }

      // Ca của ĐÚNG NGÀY đó đã kết thúc thì đăng ký cũng vô nghĩa: không còn buổi nào
      // để có mặt. Ca 04:30–06:00 đăng ký lúc 15:00 cùng ngày → chặn; cũng ca đó nhưng
      // chọn ngày mai → cho qua.
      if (Date.now() > this.vnDateTimeToUtc(workDate, shift.endTime)) {
        throw new BadRequestException(
          `Ca "${shift.label}" (${shift.startTime}–${shift.endTime}) ngày ` +
            `${this.toDateKey(workDate)} đã qua. Hãy chọn ngày hoặc ca khác còn diễn ra.`,
        );
      }

      // Số chỗ của ca tính THEO NGÀY: ca 2 chỗ của chiến dịch 3 ngày là 2 chỗ mỗi ngày,
      // không phải 2 chỗ cho cả đợt.
      const takenThatDay = await this.prisma.campaignVolunteerAssignment.count({
        where: {
          shiftId: shift.id,
          workDate,
          status: {
            in: ['assigned', 'checked_in', 'in_progress', 'completed'],
          },
        },
      });
      if (takenThatDay >= shift.slotsNeeded) {
        throw new BadRequestException(
          `Ca "${shift.label}" ngày ${this.toDateKey(workDate)} đã đủ người.`,
        );
      }

      shiftId = shift.id;
    }

    // findFirst chứ không findUnique: DB không có UNIQUE trên (campaign, volunteer, role)
    // — chỉ có @@index. Client Prisma cũ từng sinh ra khoá phức hợp này nên code biên
    // dịch được, nhưng nó không tồn tại trong schema lẫn database.
    //
    // Một TNV được nhận NHIỀU CA trong cùng chiến dịch (đầu bếp làm cả ngày, hoặc
    // nhận ca sơ chế + ca nấu chính). Vì vậy trùng lặp phải xét theo TỪNG CA, và
    // chỉ chặn khi ca mới CHỒNG GIỜ với ca đã nhận — không ai ở hai nơi cùng lúc.
    const existing = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId,
        volunteerId: volunteer.id,
        role: dto.role,
        // Chiến dịch không chia ca (shiftId = null) thì vẫn giữ quy tắc cũ: 1 lần/vai trò.
        shiftId: shiftId ?? null,
        // Cùng ca nhưng KHÁC NGÀY là hai suất trực khác nhau, không phải đăng ký trùng.
        ...(shiftId ? { workDate } : {}),
      },
    });
    if (existing) {
      // Chỉ rejected/cancelled được gửi lại. Slot chỉ tăng khi charity duyệt pending → assigned.
      if (existing.status === 'rejected' || existing.status === 'cancelled') {
        await this.prisma.campaignVolunteerAssignment.update({
          where: { id: existing.id },
          data: {
            status: 'pending',
            shiftId: shiftId ?? existing.shiftId,
            workDate,
            notes: null,
          },
        });
        return {
          message: `Đã gửi lại đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.`,
        };
      }
      throw new ConflictException(
        shiftId
          ? `Bạn đã đăng ký ca này ngày ${this.toDateKey(workDate)} rồi.`
          : 'Bạn đã đăng ký vai trò này rồi.',
      );
    }

    if (shiftId) {
      await this.assertShiftNotOverlapping(
        campaignId,
        volunteer.id,
        shiftId,
        workDate,
      );
    }

    await this.prisma.campaignVolunteerAssignment.create({
      data: {
        campaignId,
        volunteerId: volunteer.id,
        shiftId,
        workDate,
        role: dto.role,
        status: 'pending',
      },
    });

    return {
      message: `Đã gửi đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.`,
    };
  }

  /**
   * Chặn TNV nhận một ca chồng giờ với ca họ đã giữ chỗ trong cùng chiến dịch.
   *
   * Ca liền kề (10:00–12:00 rồi 12:00–14:00) KHÔNG tính là chồng — bàn giao xong
   * là đi tiếp được. Chỉ so khi cả hai ca có giờ hợp lệ; ca giờ hỏng thì bỏ qua
   * ở đây vì phần tạo ca đã validate riêng.
   */
  private async assertShiftNotOverlapping(
    campaignId: string,
    volunteerId: string,
    shiftId: string,
    workDate: Date,
  ): Promise<void> {
    const target = await this.prisma.campaignShift.findUnique({
      where: { id: shiftId },
      select: { startTime: true, endTime: true },
    });
    const from = this.shiftMinute(target?.startTime);
    const to = this.shiftMinute(target?.endTime);
    if (from === null || to === null) return;

    const held = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        campaignId,
        volunteerId,
        shiftId: { not: null },
        // Chỉ so với ca CÙNG NGÀY: ca sáng 13/08 và ca sáng 14/08 cùng khung giờ nhưng
        // không ai phải ở hai nơi cùng lúc, chặn là chặn nhầm.
        workDate,
        status: { in: ['pending', 'assigned', 'checked_in', 'completed'] },
      },
      select: {
        shift: { select: { label: true, startTime: true, endTime: true } },
      },
    });

    for (const a of held) {
      const s = this.shiftMinute(a.shift?.startTime);
      const e = this.shiftMinute(a.shift?.endTime);
      if (s === null || e === null) continue;
      if (from < e && s < to) {
        throw new ConflictException(
          `Ca này trùng giờ với ca "${a.shift?.label ?? 'đã đăng ký'}" bạn đã nhận. ` +
            'Bạn có thể nhận nhiều ca trong cùng chiến dịch, miễn là các ca không trùng giờ.',
        );
      }
    }
  }

  /** Cột `date` lưu ở UTC 00:00 → khoá `YYYY-MM-DD` để so sánh/hiển thị. */
  private toDateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Danh sách các ngày chiến dịch diễn ra, từ ngày bắt đầu tới ngày kết thúc. */
  private campaignDays(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate(),
    );
    // Chặn 366 ngày: dữ liệu hỏng (endDate lệch vài năm) không được biến thành vòng lặp vô tận.
    while (cursor.getTime() <= last && days.length < 366) {
      days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days.length > 0 ? days : [new Date(start)];
  }

  /** `"08:00"` / `"08:00:00"` → số phút từ 00:00; chuỗi hỏng → null. */
  private shiftMinute(t: string | null | undefined): number | null {
    if (!t) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
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
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!receiver || campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException(
        'Chỉ tổ chức tạo chiến dịch mới thao tác được.',
      );
    }
    return campaign;
  }

  /**
   * Tổ chức: bắt đầu chiến dịch (open → in_progress).
   *
   * Mở được từ `CAMPAIGN_START_LEAD_HOURS` giờ trước mốc bắt đầu cho tới hết ngày
   * diễn ra. Lý do cần khoảng mở sớm: các ca chuẩn bị (đi chợ, nhận nguyên liệu)
   * chạy từ rạng sáng, trong khi tình nguyện viên chỉ điểm danh được khi chiến dịch
   * đã `in_progress` — chốt cứng "đúng ngày" thì ca 04:30 không ai vào được.
   */
  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException(
        'Chỉ bắt đầu được chiến dịch đang ở trạng thái "Đang tuyển".',
      );
    }

    // So sánh theo NGÀY GIỜ VIỆT NAM, không phải ngày UTC: VN là UTC+7 nên từ 00:00
    // đến 07:00 giờ VN thì UTC vẫn đang ở ngày hôm trước — chiến dịch đúng ngày vẫn
    // bị chặn, đúng ngay khung giờ các ca chuẩn bị cần mở.
    const now = Date.now();
    const startAt = this.vnDateTimeToUtc(
      campaign.scheduledDate,
      campaign.startTime,
    );
    const endOfDay = this.vnDateTimeToUtc(
      campaign.endDate ?? campaign.scheduledDate,
      '23:59',
    );
    const opensAt = startAt - CAMPAIGN_START_LEAD_HOURS * 3600_000;

    if (now < opensAt) {
      throw new BadRequestException(
        `Chiến dịch bắt đầu lúc ${campaign.startTime} ngày ` +
          `${new Date(campaign.scheduledDate).toISOString().slice(0, 10)}. ` +
          `Bạn mở được từ ${CAMPAIGN_START_LEAD_HOURS} giờ trước đó (để kịp các ca chuẩn bị).`,
      );
    }
    if (now > endOfDay) {
      throw new BadRequestException(
        'Chiến dịch đã qua ngày dự kiến — không thể bắt đầu. Hãy huỷ nếu không thể tổ chức.',
      );
    }

    // Phải tuyển đủ tỉ lệ TNV tối thiểu mới cho chạy: bếp thiếu người thì nấu không
    // kịp, suất ăn hỏng và người dân chờ vô ích. Ngưỡng đọc live từ system_configs
    // để admin chỉnh mà không cần deploy.
    const fill = this.campaignFillRate(campaign);
    const minPercent = await this.systemConfig.getNumber(
      'CAMPAIGN_MIN_FILL_PERCENT',
    );
    if (minPercent > 0 && fill.needed > 0 && fill.percent < minPercent) {
      throw new BadRequestException(
        `Mới tuyển được ${fill.filled}/${fill.needed} tình nguyện viên (${fill.percent}%). ` +
          `Cần tối thiểu ${minPercent}% để bắt đầu chiến dịch — hãy chờ thêm đăng ký, ` +
          `duyệt các đăng ký đang chờ, hoặc giảm số lượng cần tuyển.`,
      );
    }

    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { status: 'in_progress' },
    });
    return this.findOne(campaignId);
  }

  /** Tỉ lệ lấp đầy nhân sự của một chiến dịch (làm tròn xuống). */
  private campaignFillRate(c: CampaignSlots): {
    filled: number;
    needed: number;
    percent: number;
  } {
    const needed =
      c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
    const filled =
      c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
    return {
      filled,
      needed,
      // Không cần tuyển ai thì coi như đủ 100% — nếu trả 0 sẽ chặn nhầm chiến dịch
      // vốn không cần TNV nào.
      percent: needed > 0 ? Math.floor((filled / needed) * 100) : 100,
    };
  }

  /** Tổ chức: huỷ chiến dịch đang tuyển (open → cancelled). Dùng khi quá hạn mà không kịp bắt đầu. */
  async cancelCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException(
        'Chỉ huỷ được chiến dịch đang ở trạng thái "Đang tuyển".',
      );
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { status: 'cancelled' },
    });
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
      throw new BadRequestException(
        'Chỉ kết thúc được chiến dịch đang diễn ra.',
      );
    }
    const today = this.startOfTodayUTC();
    const endRaw = campaign.endDate ?? campaign.scheduledDate;
    const endDate = new Date(endRaw);
    const endUtc = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate(),
      ),
    );
    const isPremature = endUtc.getTime() > today.getTime();
    if (isPremature) {
      if (opts?.earlyEndConfirmation !== 'EARLY_END') {
        throw new BadRequestException(
          'Chiến dịch chưa tới ngày kết thúc. Cần xác nhận kết thúc sớm trước khi hoàn tất.',
        );
      }
      const reason = (opts.earlyEndReason ?? '').trim();
      if (reason.length < 5) {
        throw new BadRequestException(
          'Vui lòng nhập lý do kết thúc sớm (tối thiểu 5 ký tự).',
        );
      }
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        actualServings,
        ...(isPremature
          ? { notes: `Kết thúc sớm: ${opts!.earlyEndReason!.trim()}` }
          : {}),
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
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status !== 'active') {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa ở trạng thái hoạt động.',
      );
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
    if (a.volunteerId !== volunteer.id)
      throw new ForbiddenException('Đây không phải công việc của bạn.');

    const next = ASSIGN_NEXT[a.status];
    if (!next)
      throw new BadRequestException(
        'Công việc đã hoàn tất hoặc không thể chuyển bước.',
      );
    if (a.campaign.status !== 'in_progress') {
      throw new BadRequestException(
        'Chỉ có thể cập nhật công việc khi chiến dịch đang diễn ra.',
      );
    }

    /** Số phút điểm danh trễ — chỉ tính ở bước check-in. */
    let lateMinutes = 0;
    const hasLng = location.lng !== undefined;
    const hasLat = location.lat !== undefined;
    if (hasLng !== hasLat) {
      throw new BadRequestException('Cần cả kinh độ và vĩ độ khi điểm danh.');
    }
    if (next === 'checked_in') {
      // TODO: bỏ comment khi deploy — tạm thời bỏ GPS check để test
      // if (!hasLng || !hasLat) {
      //   throw new BadRequestException('Cần vị trí GPS để điểm danh tại bếp.');
      // }
      lateMinutes = this.evaluateCheckInWindow(
        a.campaign,
        a.shift,
        a.role,
        a.workDate,
      ).lateMinutes;
      // TODO: bỏ comment khi deploy — tạm thời bỏ GPS check để test
      // const [kitchen] = await this.prisma.$queryRaw<{ within_radius: boolean }[]>(Prisma.sql`
      //   SELECT ST_DWithin(
      //     kitchen_location,
      //     ST_SetSRID(ST_MakePoint(${location.lng!}, ${location.lat!}), 4326)::geography,
      //     500
      //   ) AS within_radius
      //   FROM kitchen_campaigns
      //   WHERE id = ${a.campaignId}::uuid
      // `);
      // if (!kitchen?.within_radius) {
      //   throw new BadRequestException('Bạn cần ở trong phạm vi 500 m của bếp để điểm danh.');
      // }
    }

    const data: Prisma.CampaignVolunteerAssignmentUpdateInput = {
      status: next as never,
    };
    if (next === 'checked_in') {
      data.checkInTime = new Date();
      data.checkInLateMinutes = lateMinutes;
    }
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
        this.prisma.campaignVolunteerAssignment.update({
          where: { id: assignmentId },
          data,
        }),
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
      await tx.campaignVolunteerAssignment.update({
        where: { id: assignmentId },
        data,
      });
      if (next === 'checked_in') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE campaign_volunteer_assignments
          SET check_in_location = ST_SetSRID(ST_MakePoint(${location.lng!}, ${location.lat!}), 4326)::geography
          WHERE id = ${assignmentId}::uuid
        `);

        // Notify charity: TNV đã điểm danh cho campaign
        const campaign = await tx.kitchenCampaign.findUnique({
          where: { id: a.campaignId },
          select: {
            title: true,
            charityReceiver: { select: { userId: true } },
          },
        });
        if (campaign?.charityReceiver?.userId) {
          await tx.notification.create({
            data: {
              userId: campaign.charityReceiver.userId,
              title: lateMinutes > 0 ? 'TNV điểm danh trễ' : 'TNV đã điểm danh',
              body:
                lateMinutes > 0
                  ? `Một tình nguyện viên điểm danh TRỄ ${formatLateness(lateMinutes)} cho chiến dịch "${campaign.title}".`
                  : `Một tình nguyện viên vừa điểm danh cho chiến dịch "${campaign.title}".`,
              type: 'campaign_checkin',
              data: { campaignId: a.campaignId, lateMinutes } as never,
            },
          });
        }
      }
    });

    // Trễ quá ân hạn → trừ uy tín. Chạy SAU transaction để lỗi ghi điểm không làm
    // rớt cả lần điểm danh (TNV đã có mặt thật, không nên bị chặn vì chuyện phụ).
    let penalty = 0;
    if (next === 'checked_in' && lateMinutes > 0) {
      const grace = await this.systemConfig.getNumber('CHECKIN_GRACE_MINUTES');
      const configured = await this.systemConfig.getNumber(
        'CHECKIN_LATE_PENALTY',
      );
      if (lateMinutes > grace && configured > 0) {
        penalty = configured;
        void this.trust.applyDelta(
          userId,
          -configured,
          TrustScoreReason.LATE_CHECK_IN,
          'campaign',
          a.campaignId,
        );
        void this.notifications.notify(userId, {
          type: 'campaign',
          title: 'Điểm danh trễ — bị trừ điểm uy tín',
          body:
            `Bạn điểm danh trễ ${formatLateness(lateMinutes)} (ân hạn ${grace} phút) ` +
            `nên bị trừ ${configured} điểm uy tín. Lần sau hãy tới đúng giờ nhé.`,
          data: { campaignId: a.campaignId, lateMinutes, penalty: configured },
        });
      }
    }

    return { id: assignmentId, status: next, lateMinutes, penalty };
  }

  /** Nhà cung cấp quyên góp nguyên liệu cho chiến dịch (đang tuyển/đang diễn ra). */
  async pledgeDonation(
    campaignId: string,
    providerUserId: string,
    dto: { itemName: string; quantity: number; unit?: string; note?: string },
  ) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
    });
    if (!provider)
      throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

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
      throw new BadRequestException(
        'Chiến dịch chưa có mục tiêu nguyên liệu định lượng để nhận quyên góp.',
      );
    }
    const itemKey = this.normalizeSupplyKey(dto.itemName);
    const target = targets.find((s) => s.key === itemKey);
    if (!target) {
      throw new BadRequestException(
        'Nguyên liệu này không nằm trong danh sách mục tiêu của chiến dịch.',
      );
    }
    if (
      dto.unit &&
      this.normalizeSupplyKey(dto.unit) !== this.normalizeSupplyKey(target.unit)
    ) {
      throw new BadRequestException(`Đơn vị phải là ${target.unit}.`);
    }
    const progress = this.buildSupplyProgress(
      campaign.supplyItems,
      campaign.donations,
    );
    const itemProgress = progress.find(
      (p) => this.normalizeSupplyKey(p.name) === target.key,
    );
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
    if (!donation)
      throw new NotFoundException('Không tìm thấy khoản quyên góp.');

    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true },
    });
    if (!receiver || donation.campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException(
        'Chỉ tổ chức chủ chiến dịch mới xác nhận được.',
      );
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
  async submitChangeRequest(
    campaignId: string,
    userId: string,
    dto: SubmitCampaignChangeDto,
  ) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException(
        'Chỉ chiến dịch đang tuyển (open) mới gửi được yêu cầu thay đổi.',
      );
    }

    // lng & lat phải đi cùng nhau
    if ((dto.lng === undefined) !== (dto.lat === undefined)) {
      throw new BadRequestException(
        'Cần cung cấp cả kinh độ (lng) và vĩ độ (lat) khi đổi vị trí.',
      );
    }

    // Phải có ít nhất một trường thay đổi
    const hasChange = [
      dto.scheduledDate,
      dto.endDate,
      dto.startTime,
      dto.endTime,
      dto.kitchenAddress,
      dto.lng,
      dto.lat,
      dto.chefSlotsNeeded,
      dto.waiterSlotsNeeded,
      dto.shipperSlotsNeeded,
    ].some((v) => v !== undefined);
    if (!hasChange)
      throw new BadRequestException('Chưa có thay đổi nào được đề xuất.');

    // Khóa thay đổi cận ngày
    const lockDays = await this.systemConfig.getNumber(
      'CAMPAIGN_CHANGE_LOCK_DAYS',
    );
    const daysLeft = this.daysUntil(campaign.scheduledDate);
    if (daysLeft < lockDays) {
      throw new BadRequestException(
        `Chỉ được gửi yêu cầu thay đổi khi còn ít nhất ${lockDays} ngày trước ngày diễn ra (hiện còn ${daysLeft} ngày).`,
      );
    }
    // Ngày diễn ra mới cũng phải cách hiện tại ≥ ngưỡng
    if (
      dto.scheduledDate &&
      this.daysUntil(new Date(dto.scheduledDate)) < lockDays
    ) {
      throw new BadRequestException(
        `Ngày diễn ra mới phải cách hôm nay ít nhất ${lockDays} ngày.`,
      );
    }
    // Validate endDate hợp lệ
    if (dto.endDate) {
      const effectiveStart = dto.scheduledDate
        ? new Date(dto.scheduledDate)
        : campaign.scheduledDate;
      const proposedEnd = new Date(dto.endDate);
      if (proposedEnd < effectiveStart) {
        throw new BadRequestException('Ngày kết thúc phải >= ngày bắt đầu.');
      }
    }

    // Slot đề xuất không được nhỏ hơn số đã có người
    if (
      dto.chefSlotsNeeded !== undefined &&
      dto.chefSlotsNeeded < campaign.chefSlotsFilled
    ) {
      throw new BadRequestException(
        'Số slot Đầu bếp không thể nhỏ hơn số đã có người.',
      );
    }
    if (
      dto.waiterSlotsNeeded !== undefined &&
      dto.waiterSlotsNeeded < campaign.waiterSlotsFilled
    ) {
      throw new BadRequestException(
        'Số slot Phục vụ không thể nhỏ hơn số đã có người.',
      );
    }
    if (
      dto.shipperSlotsNeeded !== undefined &&
      dto.shipperSlotsNeeded < campaign.shipperSlotsFilled
    ) {
      throw new BadRequestException(
        'Số slot Giao hàng không thể nhỏ hơn số đã có người.',
      );
    }

    // Mỗi chiến dịch chỉ 1 yêu cầu đang chờ duyệt
    const existingPending = await this.prisma.campaignChangeRequest.findFirst({
      where: { campaignId, status: 'pending' },
    });
    if (existingPending) {
      throw new ConflictException(
        'Đã có một yêu cầu thay đổi đang chờ admin duyệt cho chiến dịch này.',
      );
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
    void this.notifications.notifyAdmins({
      type: 'campaign',
      title: 'Yêu cầu thay đổi chiến dịch',
      body: `Tổ chức đề xuất thay đổi chiến dịch "${campaign.title}". Vui lòng xem & duyệt.`,
      data: { campaignId, changeRequestId: cr.id, status: 'pending' },
    });

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
    const cr = await this.prisma.campaignChangeRequest.findUnique({
      where: { id: changeRequestId },
    });
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

  /**
   * Gợi ý NCC phù hợp cho một chiến dịch — xếp hạng theo khoảng cách thực tế từ bếp.
   *
   * KHÔNG phải AI: đây là truy vấn không gian PostGIS trên dữ liệu thật (toạ độ bếp,
   * toạ độ NCC, tin đăng còn hiệu lực). Đặt tên đúng bản chất để không ai đọc code
   * xong tưởng có mô hình học máy phía sau.
   *
   * Điều kiện một NCC được gợi ý:
   *  - Đã được admin duyệt (`verification_status = 'approved'`), tài khoản còn hoạt động.
   *  - Nằm trong bán kính bếp yêu cầu.
   *  - Còn ít nhất 1 tin đăng `active`, chưa quá giờ nhận, còn số lượng.
   *  - Nếu bếp lọc theo loại thực phẩm thì phải có tin thuộc đúng loại đó.
   */
  async suggestSuppliersForCampaign(
    campaignId: string,
    charityUserId: string,
    opts: { radiusKm?: number; category?: string } = {},
  ) {
    await this.assertOwner(campaignId, charityUserId);

    const radiusKm = Math.min(Math.max(opts.radiusKm ?? 5, 0.5), 50);
    const radiusM = radiusKm * 1000;

    const [kitchen] = await this.prisma.$queryRaw<
      { lng: number | null; lat: number | null }[]
    >(
      Prisma.sql`
        SELECT ST_X(kitchen_location::geometry) AS lng, ST_Y(kitchen_location::geometry) AS lat
        FROM kitchen_campaigns WHERE id = ${campaignId}::uuid
      `,
    );
    // Chiến dịch chưa ghim toạ độ bếp thì không có gốc để đo khoảng cách — trả rỗng
    // kèm cờ để FE hiện lời nhắc thay vì im lặng như thể không có NCC nào.
    if (kitchen?.lng == null || kitchen.lat == null) {
      return {
        radiusKm,
        kitchen: null,
        matches: [],
        reason: 'NO_KITCHEN_LOCATION' as const,
      };
    }

    const categoryFilter = opts.category
      ? Prisma.sql`AND fl.category = ${opts.category}::food_category`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        provider_id: string;
        business_name: string;
        business_type: string;
        address: string | null;
        avg_rating: string | null;
        is_verified: boolean;
        distance_m: number;
        listing_count: bigint;
        total_remaining: string | null;
        total_kg: string | null;
        lng: number;
        lat: number;
      }[]
    >(Prisma.sql`
      SELECT
        pp.id            AS provider_id,
        pp.business_name,
        pp.business_type::text AS business_type,
        pp.address,
        pp.avg_rating,
        pp.is_verified,
        ST_Distance(
          pp.location::geography,
          ST_SetSRID(ST_MakePoint(${kitchen.lng}, ${kitchen.lat}), 4326)::geography
        ) AS distance_m,
        ST_X(pp.location::geometry) AS lng,
        ST_Y(pp.location::geometry) AS lat,
        COUNT(fl.id)                             AS listing_count,
        SUM(fl.quantity_remaining)               AS total_remaining,
        SUM(fl.quantity_remaining * COALESCE(fl.weight_per_unit_kg, 0)) AS total_kg
      FROM provider_profiles pp
      JOIN users u ON u.id = pp.user_id
      JOIN food_listings fl ON fl.provider_id = pp.id
        AND fl.status = 'active'
        AND fl.deleted_at IS NULL
        AND fl.pickup_end_time > NOW()
        AND fl.quantity_remaining > 0
        ${categoryFilter}
      WHERE pp.verification_status = 'approved'
        AND pp.location IS NOT NULL
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND ST_DWithin(
          pp.location::geography,
          ST_SetSRID(ST_MakePoint(${kitchen.lng}, ${kitchen.lat}), 4326)::geography,
          ${radiusM}
        )
      GROUP BY pp.id, pp.business_name, pp.business_type, pp.address, pp.avg_rating,
               pp.is_verified, pp.location
      ORDER BY distance_m ASC
      LIMIT 10
    `);

    return {
      radiusKm,
      kitchen: { lng: Number(kitchen.lng), lat: Number(kitchen.lat) },
      reason: null,
      matches: rows.map((r) => ({
        providerId: r.provider_id,
        businessName: r.business_name,
        businessType: r.business_type,
        address: r.address,
        avgRating: r.avg_rating != null ? Number(r.avg_rating) : null,
        isVerified: r.is_verified,
        distanceKm: Math.round((r.distance_m / 1000) * 100) / 100,
        listingCount: Number(r.listing_count),
        totalRemaining:
          r.total_remaining != null ? Number(r.total_remaining) : 0,
        // Chỉ cộng được kg của tin đã khai `weight_per_unit_kg`; tin thiếu cân nặng
        // đóng góp 0 nên con số này là CẬN DƯỚI, FE phải nói rõ "ước tính tối thiểu".
        estimatedKg:
          r.total_kg != null ? Math.round(Number(r.total_kg) * 10) / 10 : 0,
        lng: Number(r.lng),
        lat: Number(r.lat),
      })),
    };
  }

  /** Charity gửi yêu cầu hợp tác đến provider → gửi notification */
  async sendProviderRequest(
    charityUserId: string,
    dto: SendProviderRequestDto,
  ) {
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
      include: {
        providerProfile: { select: { id: true, businessName: true } },
      },
    });
    if (!provider || !provider.providerProfile) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp.');
    }

    // Cam kết phi thương mại là điều kiện pháp lý để nhận thực phẩm cứu trợ —
    // chặn ở BE, không tin vào việc FE có tick hay không.
    if (dto.demandDetails && !dto.demandDetails.nonCommercialWaiver) {
      throw new BadRequestException(
        'Bếp phải xác nhận cam kết sử dụng thực phẩm cho mục đích từ thiện phi thương mại trước khi gửi yêu cầu.',
      );
    }
    if (
      dto.demandDetails?.neededFrom &&
      dto.demandDetails.neededTo &&
      dto.demandDetails.neededTo <= dto.demandDetails.neededFrom
    ) {
      throw new BadRequestException(
        'Giờ kết thúc nhận hàng phải sau giờ bắt đầu.',
      );
    }

    // Đóng dấu thời điểm cam kết để sau này còn đối chiếu khi có tranh chấp.
    const demandDetails = dto.demandDetails
      ? { ...dto.demandDetails, waiverAcceptedAt: new Date().toISOString() }
      : undefined;

    const orgName = receiver.user.fullName;
    const providerName =
      provider.providerProfile.businessName ?? provider.fullName;

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
            // Gửi lại mà không kèm chi tiết thì xoá bản cũ, tránh để NCC đọc nhầm
            // yêu cầu của lần trước.
            demandDetails: (demandDetails ??
              Prisma.DbNull) as Prisma.InputJsonValue,
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
            demandDetails: (demandDetails ??
              Prisma.DbNull) as Prisma.InputJsonValue,
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
    if (request.providerId !== profile.id)
      throw new ForbiddenException('Bạn không sở hữu yêu cầu này.');
    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Yêu cầu đang ở trạng thái "${request.status}", không thể duyệt.`,
      );
    }

    // Validate pickupTime khi accept
    if (
      action === 'accept' &&
      opts?.pickupTime &&
      !/^\d{2}:\d{2}$/.test(opts.pickupTime)
    ) {
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
      const [kitchenCoords] = await this.prisma.$queryRaw<
        { lng: number | null; lat: number | null }[]
      >(
        Prisma.sql`
          SELECT
            ST_X(kitchen_location::geometry) AS lng,
            ST_Y(kitchen_location::geometry) AS lat
          FROM kitchen_campaigns
          WHERE id = ${request.campaignId}::uuid
        `,
      );
      if (!c)
        throw new NotFoundException(
          'Không tìm thấy chiến dịch của yêu cầu này.',
        );
      if (
        (opts?.needsTransport ?? true) &&
        (kitchenCoords?.lng == null || kitchenCoords.lat == null)
      ) {
        throw new BadRequestException(
          'Chiến dịch chưa có tọa độ bếp nhận hàng hợp lệ.',
        );
      }
      campaignSnapshot = {
        ...c,
        kitchenLng: Number(kitchenCoords?.lng ?? 0),
        kitchenLat: Number(kitchenCoords?.lat ?? 0),
      };
    }

    const pickupStart = opts?.pickupTime ?? campaignSnapshot?.startTime ?? null;
    const pickupEnd = campaignSnapshot?.endTime ?? null;
    const needsTransport =
      action === 'accept' && (opts?.needsTransport ?? true);
    let pickupCoords: { lng: number; lat: number } | null = null;
    if (needsTransport) {
      const [providerCoords] = await this.prisma.$queryRaw<
        { lng: number | null; lat: number | null }[]
      >(
        Prisma.sql`
          SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
          FROM provider_profiles
          WHERE id = ${profile.id}::uuid
        `,
      );
      if (providerCoords?.lng == null || providerCoords.lat == null) {
        throw new BadRequestException(
          'Nhà cung cấp chưa có tọa độ điểm lấy hàng hợp lệ.',
        );
      }
      pickupCoords = {
        lng: Number(providerCoords.lng),
        lat: Number(providerCoords.lat),
      };
    }

    const { updated, transport } = await this.prisma.$transaction(
      async (tx) => {
        const requestUpdate = await tx.campaignProviderRequest.updateMany({
          where: { id: requestId, status: 'pending' },
          data: {
            status: newStatus,
            reviewedAt: new Date(),
            reviewedNote: note ?? null,
            scheduledDate:
              action === 'accept' ? campaignSnapshot!.scheduledDate : null,
            pickupStartTime: action === 'accept' ? pickupStart : null,
            pickupEndTime: action === 'accept' ? pickupEnd : null,
            needsTransport,
          },
        });
        if (requestUpdate.count !== 1) {
          throw new ConflictException(
            'Yêu cầu đã được xử lý bởi thao tác khác.',
          );
        }

        const updated = await tx.campaignProviderRequest.findUniqueOrThrow({
          where: { id: requestId },
          include: {
            receiver: { include: { user: { select: { fullName: true } } } },
          },
        });
        const transport = needsTransport
          ? await this.createTransportForRequest(
              tx,
              requestId,
              campaignSnapshot!,
              pickupCoords!,
            )
          : null;
        return { updated, transport };
      },
    );
    const transportId = transport?.id ?? null;

    if (transport && pickupCoords) {
      try {
        await this.deliveries.broadcastToNearbyShippers(
          transport.deliveryId,
          pickupCoords.lng,
          pickupCoords.lat,
        );
      } catch (err) {
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
    const [transport] = await tx.$queryRaw<
      { id: string; delivery_id: string }[]
    >(Prisma.sql`
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
    if (!transport)
      throw new ConflictException(
        'Không thể tạo chuyến vận chuyển cho yêu cầu này.',
      );

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
    if (!transport)
      throw new NotFoundException(
        'Không tìm thấy chuyến vận chuyển của chiến dịch này.',
      );
    if (transport.status === 'received') {
      return this.prisma.campaignTransport.findUnique({
        where: { id: transportId },
      });
    }
    if (transport.status !== 'delivered') {
      throw new BadRequestException(
        'Chỉ có thể xác nhận khi shipper đã bàn giao thực phẩm đến bếp.',
      );
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
      return this.prisma.campaignTransport.findUnique({
        where: { id: transportId },
      });
    }

    const result = await this.prisma.campaignTransport.findUnique({
      where: { id: transportId },
      include: {
        providerRequest: {
          select: {
            provider: { select: { userId: true } },
            campaign: { select: { title: true } },
          },
        },
      },
    });
    if (result?.providerRequest) {
      await this.notifications.notify(result.providerRequest.provider.userId, {
        type: 'campaign',
        title: 'Tổ chức đã xác nhận nhận hàng',
        body: `Tổ chức đã xác nhận nhận thực phẩm cho chiến dịch "${result.providerRequest.campaign.title}".`,
        data: {
          campaignId,
          transportId,
          deliveryId: transport.deliveryId,
          status: 'received',
        },
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
  async submitProviderProposal(
    charityUserId: string,
    dto: SubmitProviderProposalDto,
  ) {
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
  async reviewAssignment(
    campaignId: string,
    assignmentId: string,
    userId: string,
    dto: ReviewAssignmentDto,
  ) {
    await this.assertOwner(campaignId, userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const a = await tx.campaignVolunteerAssignment.findUnique({
        where: { id: assignmentId },
      });
      if (!a || a.campaignId !== campaignId) {
        throw new NotFoundException('Không tìm thấy đăng ký.');
      }
      if (a.status !== 'pending') {
        throw new BadRequestException(
          `Đăng ký này đã ở trạng thái "${a.status}", không thể duyệt lại.`,
        );
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
      const c = await tx.kitchenCampaign.findUnique({
        where: { id: campaignId },
      });
      if (!c) throw new NotFoundException('Không tìm thấy chiến dịch.');
      const slot = SLOT_FIELD[a.role];
      const needed = c[slot.needed];

      const hasShifts = await tx.campaignShift.count({ where: { campaignId } });
      let selectedShiftId: string | null = null;
      let selectedShiftLabel: string | null = null;
      let selectedShiftSlotsNeeded: number | null = null;
      if (hasShifts > 0) {
        selectedShiftId = dto.shiftId ?? a.shiftId;
        if (!selectedShiftId) {
          throw new BadRequestException(
            'Chiến dịch này có lịch ca, vui lòng chọn ca trước khi duyệt tình nguyện viên.',
          );
        }
        const shift = await tx.campaignShift.findUnique({
          where: { id: selectedShiftId },
        });
        if (!shift || shift.campaignId !== campaignId) {
          throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
        }
        if (shift.role && shift.role !== a.role) {
          throw new BadRequestException(
            `Ca "${shift.label}" không phù hợp với vai trò ${ROLE_VN[a.role]}.`,
          );
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
        // Sức chứa của ca tính THEO NGÀY TRỰC. Bộ đếm `slotsFilled` là tổng cộng dồn
        // qua mọi ngày: chiến dịch 3 ngày, ca 2 chỗ thì hai người ngày đầu là đầy,
        // hai ngày sau không duyệt được ai — nên phải đếm theo `workDate`.
        const takenThatDay = await tx.campaignVolunteerAssignment.count({
          where: {
            shiftId: selectedShiftId,
            workDate: a.workDate,
            status: {
              in: ['assigned', 'checked_in', 'in_progress', 'completed'],
            },
          },
        });
        if (takenThatDay >= selectedShiftSlotsNeeded) {
          throw new BadRequestException(
            `Ca "${selectedShiftLabel}"${a.workDate ? ` ngày ${this.toDateKey(a.workDate)}` : ''} đã đủ người.`,
          );
        }
        // `slotsFilled` giữ lại làm tổng lượt đã phân của ca (trang quản lý đang đọc).
        await tx.campaignShift.update({
          where: { id: selectedShiftId },
          data: { slotsFilled: { increment: 1 } },
        });
      }

      const assignment = await tx.campaignVolunteerAssignment.updateMany({
        where: { id: assignmentId, campaignId, status: 'pending' },
        data: {
          status: 'assigned',
          notes: dto.note ?? null,
          shiftId: selectedShiftId,
        },
      });
      if (assignment.count !== 1) {
        throw new BadRequestException('Đăng ký này đã được xử lý.');
      }
      const updated = await tx.campaignVolunteerAssignment.findUniqueOrThrow({
        where: { id: assignmentId },
      });

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
  async createDistribution(
    campaignId: string,
    userId: string,
    dto: CreateDistributionDto,
  ) {
    await this.assertOwner(campaignId, userId);
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, title: true, status: true, expectedServings: true },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['in_progress', 'completed'].includes(campaign.status)) {
      throw new BadRequestException(
        'Chỉ ghi nhận đợt phát khi chiến dịch đang diễn ra.',
      );
    }
    const campaignTitle = campaign.title;

    // Mỗi người nhận ít nhất 1 suất — 10 suất mà ghi 25 người là số liệu sai.
    const leftover = dto.leftoverServings ?? 0;
    if (dto.peopleServed > dto.servingsServed) {
      throw new BadRequestException(
        `Số người nhận (${dto.peopleServed}) không thể lớn hơn số suất đã phát (${dto.servingsServed}).`,
      );
    }

    // Không phát vượt số suất chiến dịch đăng ký ban đầu. Suất thừa cũng lấy từ cùng
    // mẻ nấu đó nên phải tính chung vào hạn mức.
    const target = campaign.expectedServings ?? 0;
    if (target > 0) {
      const agg = await this.prisma.mealDistribution.aggregate({
        where: { campaignId },
        _sum: { servingsServed: true, leftoverServings: true },
      });
      const used =
        (agg._sum.servingsServed ?? 0) + (agg._sum.leftoverServings ?? 0);
      const remaining = target - used;
      if (dto.servingsServed + leftover > remaining) {
        throw new BadRequestException(
          `Chiến dịch đăng ký ${target} suất, đã ghi nhận ${used} suất — chỉ còn ${Math.max(remaining, 0)} suất. ` +
            `Đợt này đang ghi ${dto.servingsServed} suất phát + ${leftover} suất thừa.`,
        );
      }
    }

    // Người phụ trách phải là TNV ĐÃ ĐƯỢC DUYỆT của CHÍNH chiến dịch này.
    // Bản cũ tự chọn assignment đầu tiên, và nếu không có thì lấy đại một
    // volunteer_profile bất kỳ trong toàn hệ thống — bản ghi "ai phát" khi đó
    // hoàn toàn vô nghĩa, có thể trỏ sang TNV của chiến dịch khác.
    const APPROVED = [
      'assigned',
      'checked_in',
      'in_progress',
      'completed',
    ] as const;

    // ── Nhiều shipper phụ trách đi phát ──────────────────────────────────────
    // Danh sách này tồn tại để ĐIỀU shipper đi giao, nên mỗi người phải vừa được
    // duyệt trong chiến dịch VỪA có vai trò shipper. Duyệt một lượt rồi so số lượng:
    // thiếu người nào là chặn cả yêu cầu, không âm thầm bỏ bớt.
    const requestedAssignees = [...new Set(dto.assigneeVolunteerIds ?? [])];
    let assignees: { volunteerId: string; userId: string; fullName: string }[] =
      [];
    if (requestedAssignees.length > 0) {
      const valid = await this.prisma.campaignVolunteerAssignment.findMany({
        where: {
          campaignId,
          volunteerId: { in: requestedAssignees },
          role: 'shipper',
          status: { in: [...APPROVED] },
        },
        select: {
          volunteerId: true,
          volunteer: {
            select: { userId: true, user: { select: { fullName: true } } },
          },
        },
      });
      const byVolunteer = new Map(
        valid.map((a) => [
          a.volunteerId,
          {
            volunteerId: a.volunteerId,
            userId: a.volunteer.userId,
            fullName: a.volunteer.user.fullName,
          },
        ]),
      );
      const missing = requestedAssignees.filter((id) => !byVolunteer.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `${missing.length} người được chọn không phải tình nguyện viên giao hàng đã được duyệt của chiến dịch này.`,
        );
      }
      // Giữ đúng thứ tự người dùng chọn — người đầu tiên đứng tên chính.
      assignees = requestedAssignees.map((id) => byVolunteer.get(id)!);
    }

    const points = (dto.points ?? []).map((p) => ({
      label: p.label.trim(),
      address: p.address.trim(),
      ...(p.lng != null && p.lat != null ? { lng: p.lng, lat: p.lat } : {}),
    }));

    // Điểm phát phải cách nhau tối thiểu MIN_POINT_DISTANCE_M. So từng cặp — số điểm
    // giới hạn 20 nên O(n²) ở đây là không đáng kể.
    const pinned = points.filter(
      (p): p is { label: string; address: string; lng: number; lat: number } =>
        typeof (p as { lng?: number }).lng === 'number' &&
        typeof (p as { lat?: number }).lat === 'number',
    );
    for (let i = 0; i < pinned.length; i += 1) {
      for (let j = i + 1; j < pinned.length; j += 1) {
        const d = this.distanceMeters(pinned[i], pinned[j]);
        if (d < MIN_POINT_DISTANCE_M) {
          throw new BadRequestException(
            `Điểm "${pinned[i].label}" và "${pinned[j].label}" chỉ cách nhau ${Math.round(d)} m — ` +
              `hai điểm phát phải cách nhau ít nhất ${MIN_POINT_DISTANCE_M} m để không phục vụ trùng một nhóm dân cư.`,
          );
        }
      }
    }

    let servedByVolunteerId =
      dto.servedByVolunteerId ?? assignees[0]?.volunteerId ?? null;
    if (servedByVolunteerId) {
      const ok = await this.prisma.campaignVolunteerAssignment.findFirst({
        where: {
          campaignId,
          volunteerId: servedByVolunteerId,
          status: { in: [...APPROVED] },
        },
        select: { id: true },
      });
      if (!ok) {
        throw new BadRequestException(
          'Người phụ trách phải là tình nguyện viên đã được duyệt của chiến dịch này.',
        );
      }
    } else {
      // Không chọn thì lấy TNV đã duyệt đầu tiên — vẫn trong phạm vi chiến dịch.
      const first = await this.prisma.campaignVolunteerAssignment.findFirst({
        where: { campaignId, status: { in: [...APPROVED] } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { volunteerId: true },
      });
      if (!first) {
        throw new BadRequestException(
          'Chiến dịch chưa có tình nguyện viên nào được duyệt — hãy duyệt ít nhất 1 đăng ký trước khi ghi nhận đợt phát.',
        );
      }
      servedByVolunteerId = first.volunteerId;
    }

    const distribution = await this.prisma.mealDistribution.create({
      data: {
        campaignId,
        servedByVolunteerId,
        assigneeIds:
          assignees.length > 0
            ? (assignees.map((a) => a.volunteerId) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        points:
          points.length > 0 ? (points as Prisma.InputJsonValue) : Prisma.DbNull,
        roundLabel: dto.roundLabel ?? null,
        servingsServed: dto.servingsServed,
        peopleServed: dto.peopleServed,
        leftoverServings: leftover,
        note: dto.note ?? null,
        distributedAt: new Date(),
      },
    });

    // Điều shipper: mỗi người được phân công nhận thông báo (lưu DB + đẩy socket).
    // Không await để lỗi gửi thông báo không làm rớt cả đợt phát vừa ghi.
    if (assignees.length > 0) {
      const round = dto.roundLabel?.trim() || 'đợt phát mới';
      const placeText =
        points.length === 0
          ? 'Chưa có điểm phát cụ thể — liên hệ tổ chức để nhận địa chỉ.'
          : points.length === 1
            ? `Điểm phát: ${points[0].label} — ${points[0].address}.`
            : `${points.length} điểm phát: ${points.map((p) => p.label).join(', ')}.`;
      for (const a of assignees) {
        void this.notifications.notify(a.userId, {
          type: 'campaign',
          title: 'Bạn được phân công đi phát suất ăn',
          body: `Chiến dịch "${campaignTitle}" — ${round}: ${dto.servingsServed} suất. ${placeText}`,
          data: {
            campaignId,
            distributionId: distribution.id,
            roundLabel: dto.roundLabel ?? null,
            servingsServed: dto.servingsServed,
            points,
          },
        });
      }
    }

    return distribution;
  }

  /**
   * Xác nhận một đợt phát đã phát xong.
   *
   * Cho phép: shipper nằm trong `assigneeIds` của đợt, HOẶC tổ chức chủ chiến dịch
   * (phòng khi shipper quên bấm / không dùng web).
   *
   * Chỉ sau bước này số suất mới được tính vào thống kê "đã phát" của chiến dịch.
   * Idempotent: bấm lại lần hai trả về nguyên trạng, không ghi đè người xác nhận đầu.
   */
  async completeDistribution(
    distributionId: string,
    userId: string,
    report: {
      actualServings?: number;
      actualPeopleServed?: number;
      note?: string;
    } = {},
  ) {
    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: distributionId },
      select: {
        id: true,
        campaignId: true,
        assigneeIds: true,
        completedAt: true,
        roundLabel: true,
        servingsServed: true,
        peopleServed: true,
        campaign: {
          select: {
            title: true,
            charityReceiver: { select: { userId: true } },
          },
        },
      },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phát.');
    if (dist.completedAt) {
      return {
        id: dist.id,
        completedAt: dist.completedAt,
        alreadyCompleted: true,
      };
    }

    // Số thực phát không được vượt số đã lên kế hoạch — hàng lấy từ đúng mẻ đó,
    // báo nhiều hơn là số liệu sai chứ không phải phát được nhiều hơn.
    const actualServings = report.actualServings ?? dist.servingsServed;
    if (actualServings < 0 || actualServings > dist.servingsServed) {
      throw new BadRequestException(
        `Số suất thực phát phải trong khoảng 0–${dist.servingsServed} (số đã lên kế hoạch).`,
      );
    }
    const actualPeople =
      report.actualPeopleServed ?? Math.min(dist.peopleServed, actualServings);
    if (actualPeople < 0 || actualPeople > actualServings) {
      throw new BadRequestException(
        `Số người nhận (${actualPeople}) không thể lớn hơn số suất đã phát (${actualServings}).`,
      );
    }

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    const assigneeIds = Array.isArray(dist.assigneeIds)
      ? (dist.assigneeIds as string[])
      : [];
    const isAssignedShipper = !!volunteer && assigneeIds.includes(volunteer.id);
    const isOwner = dist.campaign.charityReceiver.userId === userId;
    if (!isAssignedShipper && !isOwner) {
      throw new ForbiddenException(
        'Chỉ shipper được phân công đợt này hoặc tổ chức chủ chiến dịch mới xác nhận được.',
      );
    }

    // Shipper phải ĐIỂM DANH trước rồi mới chốt được đợt phát. Không có bước này thì
    // một người ở nhà vẫn bấm "đã phát xong" được, và số liệu chiến dịch mất tin cậy.
    // Tổ chức chủ chiến dịch không cần điểm danh — họ chốt hộ khi shipper quên bấm.
    if (isAssignedShipper && !isOwner) {
      const attended = await this.prisma.campaignVolunteerAssignment.findFirst({
        where: {
          campaignId: dist.campaignId,
          volunteerId: volunteer.id,
          status: { in: ['checked_in', 'in_progress', 'completed'] },
        },
        select: { id: true },
      });
      if (!attended) {
        throw new BadRequestException(
          'Bạn cần điểm danh tại bếp trước khi xác nhận đã phát xong đợt này.',
        );
      }
    }

    // updateMany + điều kiện completedAt null: hai shipper cùng bấm thì chỉ một người ghi được.
    const claimed = await this.prisma.mealDistribution.updateMany({
      where: { id: distributionId, completedAt: null },
      data: {
        completedAt: new Date(),
        completedByVolunteerId: isAssignedShipper ? volunteer.id : null,
        actualServings,
        actualPeopleServed: actualPeople,
        completionNote: report.note?.trim() || null,
      },
    });
    if (claimed.count !== 1) {
      const fresh = await this.prisma.mealDistribution.findUnique({
        where: { id: distributionId },
        select: { completedAt: true },
      });
      return {
        id: distributionId,
        completedAt: fresh?.completedAt ?? null,
        alreadyCompleted: true,
      };
    }

    // Báo tổ chức khi shipper là người xác nhận (tổ chức tự bấm thì khỏi tự báo mình).
    if (isAssignedShipper) {
      const leftover = dist.servingsServed - actualServings;
      void this.notifications.notify(dist.campaign.charityReceiver.userId, {
        type: 'campaign',
        title: 'Đợt phát đã hoàn tất',
        body:
          `${volunteer.user.fullName} báo đã phát ${actualServings}/${dist.servingsServed} suất ` +
          `cho ${actualPeople} người tại "${dist.roundLabel ?? 'đợt phát'}" ` +
          `của chiến dịch "${dist.campaign.title}".` +
          (leftover > 0 ? ` Còn dư ${leftover} suất.` : '') +
          (report.note?.trim() ? ` Ghi chú: ${report.note.trim()}` : ''),
        data: {
          campaignId: dist.campaignId,
          distributionId,
          status: 'done',
          actualServings,
          actualPeopleServed: actualPeople,
        },
      });
    }

    return {
      id: distributionId,
      completedAt: new Date(),
      alreadyCompleted: false,
      actualServings,
      actualPeopleServed: actualPeople,
      leftover: dist.servingsServed - actualServings,
    };
  }

  /**
   * Lịch sử các đợt phát mà shipper này đã đi — cho trang "Lịch sử giao hàng".
   *
   * Đợt phát KHÔNG phải là `deliveries` nên không nằm trong lịch sử giao hàng sẵn có;
   * đây là nguồn riêng để FE ghép vào cùng màn.
   */
  async myDistributionHistory(
    userId: string,
    opts: { page?: number; limit?: number } = {},
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer)
      throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 20, 100);
    const where = {
      assigneeIds: { array_contains: volunteer.id },
      completedAt: { not: null },
    } satisfies Prisma.MealDistributionWhereInput;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mealDistribution.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          roundLabel: true,
          servingsServed: true,
          peopleServed: true,
          actualServings: true,
          actualPeopleServed: true,
          completionNote: true,
          completedAt: true,
          points: true,
          campaign: { select: { id: true, title: true, kitchenAddress: true } },
        },
      }),
      this.prisma.mealDistribution.count({ where }),
    ]);

    return {
      items: rows.map((d) => ({
        id: d.id,
        campaignId: d.campaign.id,
        campaignTitle: d.campaign.title,
        kitchenAddress: d.campaign.kitchenAddress,
        roundLabel: d.roundLabel,
        plannedServings: d.servingsServed,
        actualServings: d.actualServings ?? d.servingsServed,
        actualPeopleServed: d.actualPeopleServed ?? d.peopleServed,
        leftover: d.servingsServed - (d.actualServings ?? d.servingsServed),
        completionNote: d.completionNote,
        completedAt: d.completedAt,
        points: Array.isArray(d.points) ? (d.points as unknown[]) : [],
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
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

  async updateShift(
    campaignId: string,
    shiftId: string,
    userId: string,
    dto: UpdateShiftDto,
  ) {
    await this.assertOwner(campaignId, userId);
    const shift = await this.prisma.campaignShift.findUnique({
      where: { id: shiftId },
    });
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
      throw new BadRequestException(
        `Số người cần không thể nhỏ hơn số đã phân ca (${shift.slotsFilled}).`,
      );
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
    const shift = await this.prisma.campaignShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca trực.');
    }
    // Không cho xoá ca đã có TNV đăng ký
    const assignedCount = await this.prisma.campaignVolunteerAssignment.count({
      where: {
        shiftId,
        status: {
          in: ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'],
        },
      },
    });
    if (assignedCount > 0) {
      throw new BadRequestException(
        `Ca này đang có ${assignedCount} TNV đăng ký, không thể xoá.`,
      );
    }
    await this.prisma.campaignShift.delete({ where: { id: shiftId } });
    return { id: shiftId, deleted: true };
  }

  /** Thêm món vào menu_items (jsonb). */
  async appendMenuItem(
    campaignId: string,
    userId: string,
    dto: AppendMenuItemDto,
  ) {
    const c = await this.assertOwner(campaignId, userId);
    // Chuẩn hoá luôn danh sách cũ: campaign tạo trước bản sửa lưu `customName` thay vì
    // `name`, ghi đè nguyên mảng mà không chuẩn hoá thì món cũ vẫn mất tên.
    const list = CampaignsService.normalizeMenuItems(c.menuItems);
    const next = [
      ...list,
      {
        name: dto.name.trim(),
        type: dto.type.trim(),
        plannedServings: dto.plannedServings ?? null,
        recipeId: null,
        sortOrder: list.length,
      },
    ];
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { menuItems: next },
    });
    return { menuItems: next };
  }

  /**
   * Gán bữa (sáng/trưa/tối) cho một món trong thực đơn.
   *
   * Cần cho các chiến dịch tạo trước bản sửa: `type` bị đánh rơi lúc tạo nên món nằm ở
   * "Chưa phân bữa" và không có đường nào kéo về đúng bữa — trước đây chỉ thêm món mới
   * mới chọn được bữa.
   */
  async setMenuItemMeal(
    campaignId: string,
    userId: string,
    index: number,
    type: string,
  ) {
    const c = await this.assertOwner(campaignId, userId);
    const list = CampaignsService.normalizeMenuItems(c.menuItems);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new BadRequestException('Không tìm thấy món này trong thực đơn.');
    }
    list[index] = { ...list[index], type: type.trim() };
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { menuItems: list },
    });
    return { menuItems: list };
  }

  /**
   * Đưa `menu_items` (jsonb) về một hình dạng duy nhất `{ name, type, plannedServings,
   * recipeId, sortOrder }`.
   *
   * Cột này từng có HAI người ghi với hai hình dạng khác nhau: lúc tạo chiến dịch ghi
   * `customName` (và mất `type`), còn "Thêm món" ghi `name` + `type`. Giao diện đọc
   * `name`/`type` nên món tạo từ form hiện tên rỗng. Chuẩn hoá tại chỗ đọc để dữ liệu
   * cũ hiển thị đúng mà không cần đợi migrate.
   */
  private static normalizeMenuItems(raw: unknown): Array<{
    name: string;
    type: string;
    plannedServings: number | null;
    recipeId: string | null;
    sortOrder: number;
  }> {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, i) => {
      const m = (entry ?? {}) as Record<string, unknown>;
      const name =
        typeof m.name === 'string' && m.name.trim()
          ? m.name.trim()
          : typeof m.customName === 'string'
            ? m.customName.trim()
            : '';
      return {
        name,
        type: typeof m.type === 'string' ? m.type.trim() : '',
        plannedServings:
          m.plannedServings == null ? null : Number(m.plannedServings),
        recipeId: typeof m.recipeId === 'string' ? m.recipeId : null,
        sortOrder: typeof m.sortOrder === 'number' ? m.sortOrder : i,
      };
    });
  }

  /** Thêm vật phẩm vào supply_items (jsonb). */
  async appendSupplyItem(
    campaignId: string,
    userId: string,
    dto: AppendSupplyItemDto,
  ) {
    const c = await this.assertOwner(campaignId, userId);
    const list = Array.isArray(c.supplyItems)
      ? (c.supplyItems as Array<Record<string, unknown>>)
      : [];
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
