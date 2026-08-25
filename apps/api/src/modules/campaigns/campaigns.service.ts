import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, CampaignShiftPeriod, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { DeliveriesService } from '@/modules/deliveries/deliveries.service';
import { TrustService } from '@/modules/trust/trust.service';
import { TrustScoreReason } from '@foodresq/types';
import { DishStepsService } from './dish-steps.service';
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

/**
 * Vai trò VẬN HÀNH — phục vụ và giao hàng đã gộp làm một.
 *
 * Cùng một tình nguyện viên: ca sáng đi lấy nguyên liệu, ca chiều chia suất rồi đi phát.
 * Tách hai vai trò chỉ tạo ra tình huống có người trực đúng khung giờ mà hệ thống vẫn
 * báo "không có shipper nào". Đầu bếp thì giữ riêng — họ phải đứng bếp.
 */
const OPS_ROLES = ['shipper', 'waiter'] as const;

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

/** Việt Nam là UTC+7 quanh năm, không có giờ mùa hè. */
const VN_UTC_OFFSET_HOURS = 7;

/**
 * Tổ chức được mở chiến dịch sớm bao nhiêu giờ trước mốc bắt đầu.
 * Giá trị mặc định 12 giờ đủ để mở từ tối hôm trước cho các ca đi chợ / nhận
 * nguyên liệu rạng sáng, nhưng vẫn đủ chặt để không ai bật chiến dịch từ
 * nhiều ngày trước rồi để TNV điểm danh nhầm ngày.
 * Giá trị thực tế được đọc từ system_configs `CAMPAIGN_START_LEAD_HOURS`.
 */
const SHIFT_PERIODS: Record<CampaignShiftPeriod, {
  label: string;
  startTime: string;
  endTime: string;
  endDayOffset: number;
  order: number;
}> = {
  midnight: { label: 'Ca khuya', startTime: '00:00', endTime: '06:00', endDayOffset: 0, order: 0 },
  morning: { label: 'Ca sáng', startTime: '06:00', endTime: '12:00', endDayOffset: 0, order: 1 },
  afternoon: { label: 'Ca chiều', startTime: '12:00', endTime: '18:00', endDayOffset: 0, order: 2 },
  evening: { label: 'Ca tối', startTime: '18:00', endTime: '00:00', endDayOffset: 1, order: 3 },
};

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

interface DonationDemandDetails {
  ingredientName?: string;
  quantityKg?: number;
  expectedServings?: number;
  /** NGÀY bếp cần nhận nguyên liệu (YYYY-MM-DD) — thành scheduled_date khi NCC nhận đơn. */
  neededDate?: string;
  neededFrom?: string;
  neededTo?: string;
  requireAtvstpCert?: boolean;
  requireColdChain?: boolean;
  requireQcPhoto?: boolean;
  nonCommercialWaiver?: boolean;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

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
    const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    campaign: { scheduledDate: Date; endDate: Date | null; startTime: string; endTime: string },
    shift: { role: string | null; startTime: string; endTime: string } | null,
    assignmentRole: string,
    workDate?: Date | null,
    allowEarly = false,
  ): { lateMinutes: number } {
    if (shift?.role && shift.role !== assignmentRole) {
      throw new BadRequestException('Ca trực được phân công không phù hợp với vai trò của bạn.');
    }

    // Dùng Asia/Ho_Chi_Minh để so sánh giờ VN
    const localNow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date()).reduce<Record<string, string>>((p, part) => {
      if (part.type !== 'literal') p[part.type] = part.value;
      return p;
    }, {});

    const nowDate = `${localNow.year}-${localNow.month}-${localNow.day}`;
    const scheduledDate = campaign.scheduledDate.toISOString().slice(0, 10);
    const endDate = (campaign.endDate ?? campaign.scheduledDate).toISOString().slice(0, 10);

    if ((!allowEarly && nowDate < scheduledDate) || nowDate > endDate) {
      throw new BadRequestException('Chỉ có thể điểm danh trong khoảng ngày diễn ra chiến dịch.');
    }

    // Đăng ký gắn với một NGÀY TRỰC cụ thể — điểm danh ngày khác là sai buổi, không
    // phải đi trễ. Cho qua thì buổi đã đăng ký vẫn tính vắng mà buổi hôm nay lại có
    // người không nằm trong danh sách, tổ chức không đối chiếu được với ai.
    if (workDate) {
      const assigned = this.toDateKey(workDate);
      if (nowDate !== assigned && (!allowEarly || nowDate > assigned)) {
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
    if (!allowEarly && isStartDay && nowTotal < campaignStart) {
      throw new BadRequestException(
        `Chiến dịch bắt đầu lúc ${campaign.startTime}. Chưa đến giờ điểm danh.`,
      );
    }

    // Mốc phải có mặt: giờ ca trực (nếu có), không thì giờ bắt đầu chiến dịch.
    const dueTotal = shift ? toMinutes(shift.startTime) : campaignStart;
    const assignedDate = workDate ? this.toDateKey(workDate) : scheduledDate;
    if (allowEarly && (nowDate < assignedDate || (nowDate === assignedDate && nowTotal < dueTotal))) {
      return { lateMinutes: 0 };
    }

    let lateMinutes = nowTotal - dueTotal;

    // Chiến dịch qua đêm: sau nửa đêm, `nowTotal` nhỏ hơn mốc do đã sang ngày mới.
    if (overnight && lateMinutes < 0) lateMinutes += 24 * 60;
    // Ngày thứ 2 trở đi của chiến dịch nhiều ngày: mỗi ngày lặp lại cùng khung giờ,
    // nên vẫn so trong ngày, không cộng dồn số ngày.
    return { lateMinutes: Math.max(0, lateMinutes) };
  }

  /** Khoảng cách hai toạ độ (mét) theo công thức haversine. */
  private distanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
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

  private ensureCampaignCanReceiveFood(campaign: {
    status: string;
    scheduledDate: Date;
    endDate: Date | null;
    endTime: string;
    operationEndAt?: Date | null;
  }) {
    if (!['approved', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận quyên góp.');
    }
    const endAt = campaign.operationEndAt?.getTime()
      ?? this.vnDateTimeToUtc(campaign.endDate ?? campaign.scheduledDate, campaign.endTime);
    if (Date.now() > endAt) {
      throw new BadRequestException('Chiến dịch đã quá thời gian nhận nguyên liệu.');
    }
  }

  private resolveTargetByName(supplyItems: unknown, itemName: string): SupplyTarget | null {
    const key = this.normalizeSupplyKey(itemName);
    return this.parseSupplyTargets(supplyItems).find((target) => target.key === key) ?? null;
  }

  private async createDonationFromAcceptedRequest(
    tx: Prisma.TransactionClient,
    input: {
      campaignId: string;
      providerId: string;
      providerName: string;
      requestId: string;
      note?: string;
      campaign: { supplyItems: unknown; donations: DonationForProgress[] };
      demandDetails: DonationDemandDetails | null;
    },
  ) {
    const details = input.demandDetails;
    if (!details?.ingredientName || details.quantityKg == null) return null;

    const target = this.resolveTargetByName(input.campaign.supplyItems, details.ingredientName);
    const itemName = target?.name ?? details.ingredientName.trim();
    const unit = target?.unit ?? 'kg';
    const quantity = this.roundQuantity(Number(details.quantityKg));
    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    if (target) {
      const progress = this.buildSupplyProgress(input.campaign.supplyItems, input.campaign.donations);
      const itemProgress = progress.find((p) => this.normalizeSupplyKey(p.name) === target.key);
      const remaining = itemProgress?.remainingQuantity ?? target.targetQuantity;
      if (quantity > remaining) {
        throw new BadRequestException(
          `Yêu cầu chỉ còn thiếu ${remaining} ${target.unit} ${target.name}; provider không thể chấp nhận góp vượt số còn thiếu.`,
        );
      }
    }

    const duplicate = await tx.campaignDonation.findFirst({
      where: {
        campaignId: input.campaignId,
        providerId: input.providerId,
        itemName,
        status: 'pledged',
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        `${input.providerName} đã có một cam kết "${itemName}" đang chờ tổ chức xác nhận.`,
      );
    }

    return tx.campaignDonation.create({
      data: {
        campaignId: input.campaignId,
        providerId: input.providerId,
        itemName,
        quantity: `${quantity} ${unit}`,
        note: input.note?.trim()
          ? `${input.note.trim()} | Tạo từ request ${input.requestId}`
          : `Tạo từ request ${input.requestId}`,
        status: 'pledged',
        // Khoá nối thật thay cho chuỗi chữ trong note: đây là CÙNG một lô hàng với đơn
        // nguyên liệu, nên lịch đi nhận và việc xác nhận thực nhận phải do đơn đó quản.
        providerRequestId: input.requestId,
      },
    });
  }

  /** Tổ chức gửi kế hoạch hoàn chỉnh để admin duyệt trước khi mở tuyển. */
  async create(userId: string, dto: CreateCampaignDto) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true, isCharityOrg: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    if (!receiver.isCharityOrg) {
      throw new ForbiddenException('Chỉ tổ chức từ thiện mới được gửi yêu cầu tạo chiến dịch bếp ăn.');
    }

    if (!dto.menuItems?.length) throw new BadRequestException('Chiến dịch phải có ít nhất một món.');
    if (!dto.shifts?.length) throw new BadRequestException('Chiến dịch phải có ít nhất một định biên ca.');

    // @MinLength đếm cả khoảng trắng nên "     " (5 dấu cách) vẫn lọt: chiến dịch lên
    // danh sách công khai với tiêu đề rỗng và địa chỉ bếp không geocode được.
    if (dto.title.trim().length < 5) {
      throw new BadRequestException('Tiêu đề phải có ít nhất 5 ký tự (không tính khoảng trắng).');
    }
    if (dto.kitchenAddress.trim().length < 5) {
      throw new BadRequestException('Địa chỉ bếp phải có ít nhất 5 ký tự (không tính khoảng trắng).');
    }

    const periods = [...new Set(dto.shifts.map((s) => s.period))]
      .sort((a, b) => SHIFT_PERIODS[a].order - SHIFT_PERIODS[b].order);
    for (let i = 1; i < periods.length; i += 1) {
      if (SHIFT_PERIODS[periods[i]].order !== SHIFT_PERIODS[periods[i - 1]].order + 1) {
        throw new BadRequestException('Các ca vận hành phải liên tiếp, không được bỏ trống ca ở giữa.');
      }
    }
    const duplicateStaffing = new Set<string>();
    for (const s of dto.shifts) {
      const key = `${s.period}:${s.role}`;
      if (duplicateStaffing.has(key)) {
        throw new BadRequestException(`Định biên ${SHIFT_PERIODS[s.period].label} / ${ROLE_VN[s.role]} bị trùng.`);
      }
      duplicateStaffing.add(key);
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
      .map((s) => ({ name: s.name.trim(), quantity: s.quantity ?? null, unit: s.unit ?? null }));

    // Validate & default endDate (>= scheduledDate, mặc định = scheduledDate nếu bỏ trống)
    const startDateObj = new Date(`${dto.scheduledDate}T00:00:00Z`);
    const nowVn = new Date(Date.now() + 7 * 3600_000);
    const tomorrowVn = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + 1));
    if (dto.scheduledDate < tomorrowVn.toISOString().slice(0, 10)) {
      throw new BadRequestException('Ngày vận hành phải từ ngày mai trở đi.');
    }
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

    const firstPeriod = SHIFT_PERIODS[periods[0]];
    const lastPeriod = SHIFT_PERIODS[periods[periods.length - 1]];
    const operationStartMinute = this.shiftMinute(firstPeriod.startTime)!;
    const operationEndMinute = this.shiftMinute(lastPeriod.endTime)! + lastPeriod.endDayOffset * 1440;
    for (const item of dto.scheduleItems ?? []) {
      const parsedMinute = this.shiftMinute(item.time);
      const scheduleMinute = parsedMinute === 0 && operationEndMinute === 1440 && operationStartMinute > 0
        ? 1440
        : parsedMinute;
      if (
        scheduleMinute === null
        || scheduleMinute < operationStartMinute
        || scheduleMinute > operationEndMinute
      ) {
        throw new BadRequestException(
          `Mốc "${item.label}" lúc ${item.time} nằm ngoài các ca vận hành đã chọn.`,
        );
      }
    }
    const operationStartAt = new Date(this.vnDateTimeToUtc(startDateObj, firstPeriod.startTime));
    const operationEndDate = new Date(endDateObj);
    operationEndDate.setUTCDate(operationEndDate.getUTCDate() + lastPeriod.endDayOffset);
    const operationEndAt = new Date(this.vnDateTimeToUtc(operationEndDate, lastPeriod.endTime));
    const recruitmentStartAt = new Date(dto.recruitmentStartAt);
    const recruitmentEndAt = new Date(dto.recruitmentEndAt);
    if (recruitmentStartAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Thời gian mở tuyển không được ở quá khứ.');
    }
    if (recruitmentStartAt >= recruitmentEndAt) {
      throw new BadRequestException('Thời gian mở tuyển phải trước thời gian đóng tuyển.');
    }
    const recruitmentBufferMs = operationStartAt.getTime() - recruitmentEndAt.getTime();
    if (recruitmentBufferMs < 6 * 3600_000) {
      throw new BadRequestException(
        'Ca đầu tiên phải bắt đầu sau thời gian đóng tuyển ít nhất 6 giờ.',
      );
    }
    // Cột hiện lưu theo giờ nguyên và schema lịch sử giới hạn tối đa 48 giờ.
    // Lấy phần giờ trọn vẹn để không ghi nhận lớn hơn khoảng cách thực tế.
    const recruitmentBufferHours = Math.min(48, Math.floor(recruitmentBufferMs / 3600_000));

    const campaignDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / 86_400_000) + 1;
    // Chặn độ dài chiến dịch: slot tổng = slot/ngày × số ngày, cột smallint tràn ở
    // 32768 → endDate gõ nhầm sang năm sau sẽ nổ 500 lúc INSERT thay vì báo lỗi rõ.
    if (campaignDays > 30) {
      throw new BadRequestException('Chiến dịch tối đa 30 ngày. Vui lòng kiểm tra lại ngày kết thúc.');
    }
    const neededByRole = (role: 'chef' | 'waiter' | 'shipper') =>
      dto.shifts!.filter((s) => s.role === role).reduce((sum, s) => sum + s.slotsNeeded, 0) * campaignDays;

    await this.assertLeadTime(dto.scheduledDate, endDateStr);

    const created = await this.prisma.$transaction(async (tx) => {
      // INSERT campaign (raw SQL vì cần ST_SetSRID cho geography)
      // 4 cột operation_start_at / operation_end_at / recruitment_start_at /
      // recruitment_end_at đã được add trực tiếp vào DB (NOT NULL, no default) nhưng
      // chưa có trong schema.prisma — Prisma raw SQL không tự fill cho mình nên phải
      // truyền tường minh, không thì PG báo 23502 not-null violation.
      //   operation_*        = ngày diễn ra thực sự (scheduledDate + start/end time)
      //   recruitment_*      = cửa sổ tuyển TNV; mở ngay, đóng sau prep_time_minutes (24h)
      //   recruitment_buffer = 24 (mặc định trong schema.sql), recruitment_status = 'scheduled'
      const [row] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO kitchen_campaigns (
          charity_receiver_id, title, description, kitchen_address, kitchen_location,
          scheduled_date, end_date, start_time, end_time,
          operation_start_at, operation_end_at,
          recruitment_start_at, recruitment_end_at, recruitment_buffer_hours, recruitment_status,
          chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
          expected_servings, image_urls, menu_items, schedule_items, supply_items,
          status, created_at, updated_at
        ) VALUES (
          ${receiver.id}::uuid, ${dto.title.trim()}, ${dto.description?.trim() || null}, ${dto.kitchenAddress.trim()},
          ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
          ${dto.scheduledDate}::date, ${endDateStr}::date, ${firstPeriod.startTime}, ${lastPeriod.endTime},
          ${operationStartAt}, ${operationEndAt},
          ${recruitmentStartAt}, ${recruitmentEndAt}, ${recruitmentBufferHours}, 'scheduled'::recruitment_status,
          ${neededByRole('chef')}, ${neededByRole('waiter')}, ${neededByRole('shipper')},
          ${dto.expectedServings ?? null}, ${JSON.stringify(dto.imageUrls ?? [])}::jsonb,
          ${JSON.stringify(menuJson)}::jsonb,
          ${JSON.stringify(dto.scheduleItems ?? [])}::jsonb,
          ${JSON.stringify(supplyJson)}::jsonb,
          'pending_approval'::campaign_status, NOW(), NOW()
        )
        RETURNING id
      `);

      // INSERT shifts (bảng thật, mỗi shift 1 row)
      if (dto.shifts?.length) {
        await tx.campaignShift.createMany({
          data: dto.shifts.map((s) => ({
            campaignId: row.id,
            label: s.label.trim() || `${SHIFT_PERIODS[s.period].label} — ${ROLE_VN[s.role]}`,
            role: s.role,
            period: s.period,
            startTime: SHIFT_PERIODS[s.period].startTime,
            endTime: SHIFT_PERIODS[s.period].endTime,
            endDayOffset: SHIFT_PERIODS[s.period].endDayOffset,
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
      data: { campaignId: created, status: 'pending_approval' },
    });

    return this.findOne(created);
  }

  /**
   * Tự động huỷ chiến dịch 'open' đã qua ngày diễn ra + giờ kết thúc
   * (dùng `endDate` để hỗ trợ campaign nhiều ngày).
   * Chạy định kỳ qua CampaignsCron.
   */
  /**
   * Đánh VẮNG các TNV đã được duyệt nhưng hết ngày trực vẫn không điểm danh.
   *
   * Trạng thái `absent` có sẵn trong enum nhưng trước đây KHÔNG chỗ nào ghi vào:
   * người đăng ký rồi không tới cứ nằm mãi ở `assigned`, không mất uy tín, và tổ chức
   * nhìn danh sách vẫn tưởng đủ người. Điều đó làm hỏng luôn ràng buộc tỉ lệ tuyển
   * tối thiểu — đủ 50% trên giấy trong khi bếp thực tế thiếu người.
   *
   * Mốc chốt là hết ngày trực (23:59 giờ VN) chứ không phải hết giờ ca: TNV tới muộn
   * vẫn điểm danh được cả ngày (xem `evaluateCheckInWindow`), chốt sớm hơn là đánh
   * vắng người đang trên đường.
   */
  async markAbsentVolunteers(): Promise<number> {
    // Cuối ngày trực theo giờ VN = 17:00Z cùng ngày (VN = UTC+7).
    const cutoff = new Date(Date.now() - 7 * 3600_000);
    const todayVn = cutoff.toISOString().slice(0, 10);

    const stale = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        status: 'assigned',
        checkInTime: null,
        workDate: { lt: new Date(`${todayVn}T00:00:00Z`) },
        campaign: { status: { in: ['in_progress', 'completed'] } },
      },
      select: {
        id: true,
        role: true,
        workDate: true,
        shiftId: true,
        volunteer: { select: { userId: true, user: { select: { fullName: true } } } },
        campaign: {
          select: { id: true, title: true, charityReceiver: { select: { userId: true } } },
        },
      },
      take: 500,
    });
    if (stale.length === 0) return 0;

    const marked = await this.prisma.campaignVolunteerAssignment.updateMany({
      where: { id: { in: stale.map((a) => a.id) }, status: 'assigned', checkInTime: null },
      data: { status: 'absent' },
    });
    if (marked.count === 0) return 0;

    // Người vắng KHÔNG còn chiếm chỗ nữa: ma trận đủ người đã loại họ ra, nếu bộ đếm
    // slot vẫn giữ thì tổ chức không duyệt được người thay cho những ngày còn lại
    // ("đã đủ Đầu bếp" trong khi thực tế đang trống).
    for (const a of stale) {
      const slot = SLOT_FIELD[a.role];
      if (!slot) continue;
      await this.prisma.kitchenCampaign.update({
        where: { id: a.campaign.id },
        data: { [slot.filled]: { decrement: 1 } },
      });
      if (a.shiftId) {
        await this.prisma.campaignShift.update({
          where: { id: a.shiftId },
          data: { slotsFilled: { decrement: 1 } },
        });
      }
    }

    const penalty = await this.systemConfig.getNumber('VOLUNTEER_NO_SHOW_PENALTY');
    // Gom theo chiến dịch: bếp thiếu 4 người thì nhận MỘT thông báo, không phải bốn.
    const byCampaign = new Map<string, { title: string; charityUserId: string; names: string[] }>();

    for (const a of stale) {
      if (penalty > 0) {
        void this.trust.applyDelta(
          a.volunteer.userId,
          -penalty,
          TrustScoreReason.VOLUNTEER_NO_SHOW,
          'campaign',
          a.campaign.id,
        );
      }
      void this.notifications.notify(a.volunteer.userId, {
        type: 'campaign',
        title: 'Bạn bị đánh vắng',
        body:
          `Bạn đã đăng ký ca ${a.workDate ? `ngày ${this.toDateKey(a.workDate)} ` : ''}` +
          `của chiến dịch "${a.campaign.title}" nhưng không điểm danh.` +
          (penalty > 0 ? ` Bạn bị trừ ${penalty} điểm uy tín.` : ''),
        data: { campaignId: a.campaign.id, assignmentId: a.id, status: 'absent' },
      });

      const entry = byCampaign.get(a.campaign.id) ?? {
        title: a.campaign.title,
        charityUserId: a.campaign.charityReceiver.userId,
        names: [],
      };
      entry.names.push(a.volunteer.user.fullName);
      byCampaign.set(a.campaign.id, entry);
    }

    for (const [campaignId, c] of byCampaign) {
      void this.notifications.notify(c.charityUserId, {
        type: 'campaign',
        title: `${c.names.length} tình nguyện viên vắng mặt`,
        body:
          `Chiến dịch "${c.title}": ${c.names.slice(0, 5).join(', ')}` +
          (c.names.length > 5 ? ` và ${c.names.length - 5} người khác` : '') +
          ' đã được duyệt nhưng không điểm danh.',
        data: { campaignId, absentCount: c.names.length },
      });
    }

    return marked.count;
  }

  /**
   * Xoá chiến dịch chờ duyệt đã HẾT Ý NGHĨA — dọn rác cho DB.
   *
   * Hai điều kiện, dính một là xoá: chờ duyệt quá N ngày (admin bỏ quên), hoặc đã
   * qua giờ kết thúc vận hành mà vẫn chưa được duyệt (duyệt nữa cũng vô ích).
   *
   * Chỉ đụng `pending_approval` — trạng thái này chưa mở tuyển nên chưa kéo theo
   * TNV, quyên góp hay đơn NCC nào; các trạng thái khác là lịch sử vận hành, xoá là
   * mất số liệu thống kê. Assignments không cascade theo schema nên xoá phòng thủ
   * trước (bình thường phải rỗng).
   */
  async purgeStalePendingCampaigns(now = new Date()): Promise<number> {
    const days = await this.systemConfig.getNumber('CAMPAIGN_PENDING_PURGE_DAYS');
    if (days <= 0) return 0;

    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const stale = await this.prisma.kitchenCampaign.findMany({
      where: {
        status: 'pending_approval',
        OR: [{ createdAt: { lte: cutoff } }, { operationEndAt: { lt: now } }],
      },
      select: {
        id: true, title: true, createdAt: true, operationEndAt: true,
        charityReceiver: { select: { userId: true } },
      },
      take: 100,
    });
    if (stale.length === 0) return 0;

    const ids = stale.map((c) => c.id);
    await this.prisma.$transaction([
      this.prisma.campaignVolunteerAssignment.deleteMany({ where: { campaignId: { in: ids } } }),
      this.prisma.kitchenCampaign.deleteMany({ where: { id: { in: ids }, status: 'pending_approval' } }),
    ]);

    for (const c of stale) {
      const reason =
        c.operationEndAt < now
          ? 'đã qua ngày diễn ra mà chưa được duyệt'
          : `chờ duyệt quá ${days} ngày`;
      void this.notifications.notify(c.charityReceiver.userId, {
        type: 'campaign',
        title: 'Chiến dịch chờ duyệt đã bị xoá',
        body: `Chiến dịch "${c.title}" ${reason} nên hệ thống đã xoá. Bạn có thể tạo lại với lịch mới bất cứ lúc nào.`,
        data: { campaignTitle: c.title, purged: true },
      });
    }
    this.logger.log(`purgeStalePendingCampaigns: đã xoá ${ids.length} chiến dịch chờ duyệt quá hạn`);
    return ids.length;
  }

  async expireOverdueCampaigns(): Promise<number> {
    const now = new Date();
    const overdue = await this.prisma.kitchenCampaign.findMany({
      // Lọc thêm recruitmentStatus: nếu không, chiến dịch đã bị đánh dấu hết hạn sẽ
      // được "đánh dấu lại" mỗi lần cron chạy và tổ chức nhận cùng một thông báo
      // thiếu người mỗi đêm, mãi mãi.
      where: {
        status: 'approved',
        operationStartAt: { lte: now },
        recruitmentStatus: { not: 'expired_understaffed' },
      },
      select: {
        id: true, title: true,
        charityReceiver: { select: { userId: true } },
        assignments: {
          where: { status: { in: ['pending', 'assigned'] } },
          select: { volunteer: { select: { userId: true } } },
        },
      },
    });
    const overdueIds = overdue.map((campaign) => campaign.id);
    if (overdueIds.length === 0) return 0;

    await this.prisma.kitchenCampaign.updateMany({
      where: { id: { in: overdueIds }, status: 'approved' },
      data: { recruitmentStatus: 'expired_understaffed' },
    });

    for (const c of overdue) {
      void this.notifications.notify(c.charityReceiver.userId, {
        type: 'campaign',
        title: 'Chiến dịch không đủ điều kiện bắt đầu',
        body: `Chiến dịch "${c.title}" vẫn thiếu nhân sự. Vui lòng gửi yêu cầu dời lịch hoặc huỷ chiến dịch.`,
        data: { campaignId: c.id, recruitmentStatus: 'expired_understaffed' },
      });
      // TNV đã đăng ký/được duyệt cũng phải biết: trước đây chỉ tổ chức nhận tin, còn
      // họ vẫn thấy ca "đã duyệt" trong Việc của tôi và có thể đến bếp cho một chiến
      // dịch không bao giờ chạy.
      for (const userId of new Set(c.assignments.map((a) => a.volunteer.userId))) {
        void this.notifications.notify(userId, {
          type: 'campaign',
          title: 'Chiến dịch chưa thể bắt đầu',
          body: `Chiến dịch "${c.title}" không tuyển đủ người nên chưa thể bắt đầu. Vui lòng chờ tổ chức dời lịch hoặc thông báo tiếp theo.`,
          data: { campaignId: c.id, recruitmentStatus: 'expired_understaffed' },
        });
      }
    }
    return overdueIds.length;
  }

  /**
   * Tự động hoàn tất các chiến dịch 'in_progress' đã qua operationEndAt.
   *
   * Lưu ý: không tự nhập actualServings — để null (campaign thực sự chạy
   * đến cuối vẫn dùng nút "Hoàn tất" ở UI charity). Cron chỉ đóng các
   * campaign "bị bỏ quên" không ai nhấn kết thúc.
   */
  async autoCompleteExpiredCampaigns(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'in_progress', operationEndAt: { lt: now } },
      select: {
        id: true, title: true, operationEndAt: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    const expiredIds = expired.map((campaign) => campaign.id);
    if (expiredIds.length === 0) return 0;

    await this.prisma.kitchenCampaign.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'completed' },
    });

    for (const c of expired) {
      void this.notifications.notify(c.charityReceiver.userId, {
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
        // Chỉ đợt đã chốt, ưu tiên số thực tế shipper báo (1 suất = 1 người).
        mealDistributions: {
          where: { completedAt: { not: null } },
          select: { peopleServed: true, actualPeopleServed: true },
        },
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
      peopleServed: c.mealDistributions.reduce((s, d) => s + (d.actualPeopleServed ?? d.peopleServed), 0),
      volunteers: c.assignments.length,
      experienceCount: c._count.experiences,
      organizationName: c.charityReceiver?.organizationName ?? c.charityReceiver?.user.fullName ?? null,
    }));
  }

  /** Công khai (không cần đăng nhập): vài chiến dịch đang tuyển, sắp diễn ra — cho trang chủ. */
  async listPublicUpcoming(limit = 3) {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: {
        status: 'approved',
        recruitmentStatus: { in: ['open', 'staffed'] },
        scheduledDate: { gte: this.startOfTodayUTC() },
      },
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
        recruitmentStatus: true, recruitmentStartAt: true, recruitmentEndAt: true,
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
            actualServings: true, actualPeopleServed: true,
            photoUrl: true, note: true, distributedAt: true, completedAt: true,
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
    if (c.status === 'pending_approval') {
      throw new NotFoundException('Chiến dịch đang chờ duyệt.');
    }
    if (!['approved', 'in_progress', 'completed'].includes(c.status)) {
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
      // Đợt đã chốt: hiển thị số shipper BÁO THẬT thay vì số kế hoạch —
      // kế hoạch 100 mà chỉ phát được 80 thì khoe 100 là báo cáo sai.
      servingsServed: d.completedAt ? (d.actualServings ?? d.servingsServed) : d.servingsServed,
      peopleServed: d.completedAt ? (d.actualPeopleServed ?? d.peopleServed) : d.peopleServed,
      leftoverServings: d.leftoverServings,
      photoUrl: d.photoUrl,
      note: d.note,
      distributedAt: d.distributedAt,
      servedBy: d.servedBy.user.fullName,
      feedback: d.feedback,
    }));

    // Trang công khai chỉ khoe số đã phát THẬT — đợt mới lên kế hoạch không tính,
    // đợt đã chốt lấy số shipper báo thực tế (fallback kế hoạch cho bản ghi cũ).
    const distributionSummary = c.mealDistributions
      .filter((d) => d.completedAt != null)
      .reduce(
        (acc, d) => ({
          servingsServed: acc.servingsServed + (d.actualServings ?? d.servingsServed),
          peopleServed: acc.peopleServed + (d.actualPeopleServed ?? d.peopleServed),
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

    // Số chỗ ĐÃ GIỮ của từng (ca, ngày) — dùng cho lịch đăng ký theo ngày.
    const campaignDays = this.campaignDays(c.scheduledDate, c.endDate ?? c.scheduledDate);
    const shiftDayTaken = new Map<string, number>();
    if (c.shifts.length > 0) {
      const taken = await this.prisma.campaignVolunteerAssignment.groupBy({
        by: ['shiftId', 'workDate'],
        where: {
          campaignId: c.id,
          shiftId: { not: null },
          status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
        },
        _count: { _all: true },
      });
      for (const t of taken) {
        if (!t.shiftId || !t.workDate) continue;
        shiftDayTaken.set(`${t.shiftId}|${this.toDateKey(t.workDate)}`, t._count._all);
      }
    }

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      recruitmentStatus: c.recruitmentStatus,
      recruitmentStartAt: c.recruitmentStartAt,
      recruitmentEndAt: c.recruitmentEndAt,
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
        // Ca đã qua buổi cuối cùng của chiến dịch → không còn buổi nào để có mặt.
        // Trả sẵn cờ để giao diện làm mờ, thay vì mời đăng ký rồi mới báo lỗi.
        expired: Date.now() > this.vnDateTimeToUtc(c.endDate ?? c.scheduledDate, s.endTime),
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
    const now = new Date();
    const campaigns = await this.prisma.kitchenCampaign.findMany({
      // Chiến dịch đã được admin duyệt phải xuất hiện để TNV biết lịch sắp mở tuyển.
      // Trước đây chỉ lấy recruitmentStatus='open', khiến campaign 'scheduled' bị ẩn
      // hoàn toàn và campaign 'staffed' (đủ ngưỡng nhưng vẫn được tuyển thêm) cũng biến mất.
      where: {
        OR: [
          { status: 'in_progress' },
          {
            status: 'approved',
            recruitmentStatus: { in: ['scheduled', 'open', 'staffed'] },
            recruitmentEndAt: { gt: now },
            scheduledDate: { gte: today },
          },
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
          select: {
            id: true,
            itemName: true,
            quantity: true,
            note: true,
            status: true,
            createdAt: true,
            receivedAt: true,
            pickupDate: true,
            pickupStartTime: true,
            pickupEndTime: true,
            // DS assignment id shipper được cử đi nhận — FE tự tra tên qua
            // `assignments` bên dưới (JSONB không join được bằng quan hệ).
            pickupAssigneeIds: true,
            // NCC kèm địa chỉ + SĐT để tổ chức/TNV liên hệ đi lấy hàng
            provider: { select: { businessName: true, address: true, contactPhone: true } },
          },
        },
        // TNV đã được duyệt vào ca — nguồn để phân công đi nhận quyên góp
        // (FE lọc tiếp theo ngày trực + khung giờ trùng ca).
        assignments: {
          where: { status: { in: ['assigned', 'checked_in', 'in_progress'] }, shiftId: { not: null } },
          select: {
            id: true,
            role: true,
            status: true,
            workDate: true,
            shiftId: true,
            shift: { select: { label: true, startTime: true, endTime: true, endDayOffset: true } },
            volunteer: { select: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
      },
    });
    return campaigns.map((campaign) => this.withSupplyProgress(campaign));
  }

  /**
   * Lời mời nhận ca mà TNV đang có (đọc từ notifications, chưa đọc).
   *
   * Không tạo bảng riêng: lời mời vốn CHỈ là thông báo, không phải phân công. Ở đây
   * chỉ lọc lại và bồi thêm dữ liệu ca để TNV bấm một chạm là đăng ký được.
   * Đã lọc bỏ lời mời cho ca mà TNV đã đăng ký rồi, hoặc chiến dịch đã đóng.
   */
  async getMyShiftInvites(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // KHÔNG lọc theo isRead: mở chuông thông báo là mọi thứ thành "đã đọc", lời mời
    // sẽ biến mất dù TNV chưa hề phản hồi. Cờ đúng là `dismissedAt` — chỉ được ghi
    // khi họ bấm nhận hoặc bỏ qua.
    const rows = await this.prisma.notification.findMany({
      where: { userId, type: 'campaign' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, body: true, data: true, createdAt: true },
    });

    const invites = rows
      .map((n) => ({ notification: n, data: n.data as Record<string, unknown> }))
      .filter((r) =>
        r.data?.kind === 'shift_invite'
        && typeof r.data.campaignId === 'string'
        && !r.data.dismissedAt,
      );
    if (invites.length === 0) return [];

    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: {
        id: { in: [...new Set(invites.map((i) => i.data.campaignId as string))] },
        status: { in: ['approved', 'in_progress'] },
      },
      select: { id: true, title: true, kitchenAddress: true, recruitmentEndAt: true },
    });
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    // Ca đã đăng ký rồi thì không mời lại — TNV bấm "Nhận ca" sẽ bị chặn ở apply().
    const taken = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        volunteerId: volunteer.id,
        status: { in: ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'] },
      },
      select: { campaignId: true, shiftId: true, workDate: true },
    });
    const takenKeys = new Set(
      taken.map((a) => `${a.campaignId}:${a.shiftId ?? ''}:${this.toDateKey(a.workDate ?? new Date(0))}`),
    );

    // Gộp lời mời trùng cho cùng một ca: giờ đã chặn gửi trùng ở inviteVolunteersToShift,
    // nhưng dữ liệu cũ vẫn còn các cặp y hệt nhau — hiện hai thẻ giống nhau thì nhận một
    // cái xong cái kia vẫn nằm đó, TNV tưởng còn ca chưa trả lời. Giữ lời mời mới nhất
    // (rows đã sắp xếp createdAt desc) để lời nhắn kèm theo là bản cập nhật nhất.
    const seen = new Set<string>();

    return invites.flatMap((i) => {
      const campaign = campaignById.get(i.data.campaignId as string);
      if (!campaign) return [];
      const shiftId = typeof i.data.shiftId === 'string' ? i.data.shiftId : null;
      const workDate = typeof i.data.workDate === 'string' ? i.data.workDate : null;
      if (!workDate) return [];
      const key = `${campaign.id}:${shiftId ?? ''}:${workDate}:${typeof i.data.period === 'string' ? i.data.period : ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      if (takenKeys.has(`${campaign.id}:${shiftId ?? ''}:${workDate}`)) return [];
      // Hết hạn tuyển thì lời mời cũng vô nghĩa.
      if (new Date() >= campaign.recruitmentEndAt) return [];

      return [{
        notificationId: i.notification.id,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        kitchenAddress: campaign.kitchenAddress,
        workDate,
        period: typeof i.data.period === 'string' ? i.data.period : null,
        shiftId,
        message: i.notification.body,
        invitedAt: i.notification.createdAt,
        recruitmentEndAt: campaign.recruitmentEndAt,
      }];
    });
  }

  /**
   * TNV chấp nhận lời mời → vào THẲNG ca, không qua bước tổ chức duyệt lại.
   *
   * Lý do bỏ bước duyệt: tổ chức đã CHỦ ĐỘNG chọn đích danh người này khi gửi lời mời,
   * TNV bấm nhận là bên còn lại đồng ý — hai bên đã đồng thuận thì bắt tổ chức duyệt
   * thêm lần nữa chỉ làm chậm việc lấp ca đang thiếu người. (Đăng ký TỰ PHÁT vẫn giữ
   * nguyên luồng chờ duyệt, vì lúc đó tổ chức chưa biết người đăng ký là ai.)
   *
   * Đổi lại phải xác thực chặt: chỉ chấp nhận khi có lời mời THẬT còn hiệu lực gửi
   * đúng người, đúng ca, đúng ngày — nếu không ai cũng tự đẩy mình vào ca được.
   */
  async acceptShiftInvite(campaignId: string, userId: string, notificationId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true, status: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status !== 'active') {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế.');
    }

    // 1) Lời mời phải có thật, thuộc về chính người này và chưa dùng.
    const invite = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, data: true },
    });
    const data = (invite?.data ?? {}) as Record<string, unknown>;
    if (!invite || data.kind !== 'shift_invite' || data.campaignId !== campaignId) {
      throw new BadRequestException('Lời mời không hợp lệ.');
    }
    if (data.dismissedAt) {
      throw new BadRequestException('Bạn đã phản hồi lời mời này rồi.');
    }
    const shiftId = typeof data.shiftId === 'string' ? data.shiftId : null;
    const workDateKey = typeof data.workDate === 'string' ? data.workDate : null;
    if (!shiftId || !workDateKey) {
      throw new BadRequestException('Lời mời thiếu thông tin ca. Vui lòng vào chiến dịch đăng ký thủ công.');
    }

    // 2) Chiến dịch và ca phải còn nhận người.
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true, title: true, status: true, recruitmentEndAt: true,
        scheduledDate: true, endDate: true,
        charityReceiver: { select: { userId: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['approved', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch không còn nhận tình nguyện viên.');
    }
    if (new Date() >= campaign.recruitmentEndAt) {
      throw new BadRequestException('Đã hết hạn nhận người cho chiến dịch này.');
    }

    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
    }
    if (!shift.role) {
      throw new BadRequestException('Ca này chưa gán vai trò cụ thể — vui lòng đăng ký thủ công.');
    }

    const workDate = this.campaignDays(
      campaign.scheduledDate,
      campaign.endDate ?? campaign.scheduledDate,
    ).find((d) => this.toDateKey(d) === workDateKey);
    if (!workDate) {
      throw new BadRequestException('Ngày trực không nằm trong thời gian diễn ra chiến dịch.');
    }

    const shiftEndDate = new Date(workDate);
    shiftEndDate.setUTCDate(shiftEndDate.getUTCDate() + (shift.endDayOffset ?? 0));
    if (Date.now() > this.vnDateTimeToUtc(shiftEndDate, shift.endTime)) {
      throw new BadRequestException('Ca này đã qua giờ diễn ra.');
    }

    // 3) Không nhận hai ca chồng giờ, kể cả ở chiến dịch khác.
    await this.assertShiftNotOverlapping(campaignId, volunteer.id, shift.id, workDate);
    await this.assertNoActiveDeliveryInShift(volunteer.id, shift.period, workDateKey);

    const alreadyIn = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId, volunteerId: volunteer.id, shiftId: shift.id, workDate,
        status: { in: ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'] },
      },
      select: { id: true },
    });
    if (alreadyIn) {
      throw new ConflictException('Bạn đã có mặt trong ca này rồi.');
    }

    const slot = SLOT_FIELD[shift.role];
    await this.prisma.$transaction(async (tx) => {
      // Khoá hàng ca để hai người cùng bấm nhận không vượt quá số chỗ.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM campaign_shifts WHERE id = ${shift.id}::uuid FOR UPDATE
      `);
      const takenThatDay = await tx.campaignVolunteerAssignment.count({
        where: {
          shiftId: shift.id,
          workDate,
          status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
        },
      });
      if (takenThatDay >= shift.slotsNeeded) {
        throw new ConflictException('Ca này vừa đủ người trước khi bạn kịp nhận.');
      }

      await tx.campaignVolunteerAssignment.create({
        data: {
          campaignId,
          volunteerId: volunteer.id,
          role: shift.role as never,
          shiftId: shift.id,
          workDate,
          // Cả hai bên đã đồng ý → vào thẳng trạng thái đã xếp và đã xác nhận.
          status: 'assigned',
          confirmationStatus: 'confirmed',
          confirmedAt: new Date(),
          notes: 'Nhận qua lời mời của tổ chức',
        },
      });
      await tx.kitchenCampaign.update({
        where: { id: campaignId },
        data: { [slot.filled]: { increment: 1 } },
      });
      await tx.campaignShift.update({
        where: { id: shift.id },
        data: { slotsFilled: { increment: 1 } },
      });
      await tx.notification.update({
        where: { id: invite.id },
        data: {
          isRead: true,
          readAt: new Date(),
          // Cờ ĐÃ PHẢN HỒI — khác isRead (chỉ là đã xem). Lời mời biến mất khỏi
          // danh sách chờ nhờ cờ này, không phải vì người dùng liếc qua chuông.
          data: { ...data, dismissedAt: new Date().toISOString(), dismissedBy: 'accepted' },
        },
      });
    });

    await this.refreshRecruitmentStatus(campaignId);

    const roleVN = ROLE_VN[shift.role] ?? shift.role;
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: 'Tình nguyện viên đã nhận lời mời',
      body:
        `${volunteer.user.fullName} đã nhận ca ${roleVN} (${shift.label}) ngày `
        + `${workDateKey} của chiến dịch "${campaign.title}". Người này đã được xếp vào ca.`,
      data: { campaignId, shiftId: shift.id, workDate: workDateKey, kind: 'invite_accepted' },
    });

    return { ok: true, shiftLabel: shift.label, workDate: workDateKey };
  }

  /**
   * TNV bỏ qua một lời mời — đánh dấu đã phản hồi để nó không hiện lại.
   *
   * Tách khỏi "đánh dấu đã đọc" của chuông thông báo: đọc thông báo không có nghĩa
   * là đã quyết định, còn bỏ qua thì có.
   */
  async dismissShiftInvite(userId: string, notificationId: string) {
    const invite = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, data: true },
    });
    const data = (invite?.data ?? {}) as Record<string, unknown>;
    if (!invite || data.kind !== 'shift_invite') {
      throw new NotFoundException('Không tìm thấy lời mời.');
    }
    await this.prisma.notification.update({
      where: { id: invite.id },
      data: {
        isRead: true,
        readAt: new Date(),
        data: { ...data, dismissedAt: new Date().toISOString(), dismissedBy: 'declined' },
      },
    });
    return { ok: true };
  }

  /**
   * Chặn nhận ca bếp khi đang cầm một đơn giao chưa xong trong đúng khung giờ đó.
   *
   * Mặt còn lại của luật "đã xác nhận ca bếp thì không nhận đơn giao lẻ". Trước đây chỉ
   * có một chiều, nên chỉ cần nhận đơn TRƯỚC rồi nhận ca bếp SAU là kẹt hai chỗ cùng lúc
   * mà không gì cản.
   */
  private async assertNoActiveDeliveryInShift(
    volunteerId: string,
    period: CampaignShiftPeriod | string | null,
    workDateKey: string,
  ) {
    if (!period) return;
    const busy = await this.deliveries.hasActiveDeliveryInSlot(volunteerId, {
      workDate: workDateKey,
      period,
    });
    if (busy) {
      const label = SHIFT_PERIODS[period as CampaignShiftPeriod]?.label ?? period;
      throw new BadRequestException(
        `Bạn đang có một đơn giao chưa hoàn tất rơi vào ${label} ngày ${workDateKey}. `
        + 'Hãy giao xong đơn đó trước khi nhận ca này.',
      );
    }
  }

  /**
   * Báo cáo tổng hợp một chiến dịch cho TỔ CHỨC chủ bếp — nguồn số liệu của trang
   * "Báo cáo": suất ăn đã phát, kg nguyên liệu về bếp, TNV tham gia theo vai trò và
   * chuỗi thời gian để vẽ biểu đồ.
   */
  async getCampaignReport(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);

    const [distributions, pickups, donations, assignments] = await Promise.all([
      this.prisma.mealDistribution.findMany({
        where: { campaignId, completedAt: { not: null } },
        select: {
          roundLabel: true, servingsServed: true, actualServings: true,
          actualPeopleServed: true, peopleServed: true, completedAt: true,
        },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.campaignIngredientPickup.findMany({
        where: { campaignId },
        select: { receivedKg: true, confirmedAt: true },
        orderBy: { confirmedAt: 'asc' },
      }),
      this.prisma.campaignDonation.findMany({
        where: { campaignId, status: 'received' },
        select: { itemName: true, quantity: true, receivedAt: true, providerRequestId: true },
      }),
      this.prisma.campaignVolunteerAssignment.findMany({
        where: {
          campaignId,
          status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
          confirmationStatus: 'confirmed',
        },
        select: { role: true, volunteerId: true, status: true },
      }),
    ]);

    // Suất ăn: ưu tiên số THỰC TẾ shipper chốt; kế hoạch chỉ là dự phòng cho đợt cũ.
    const servingsSeries = distributions.map((d) => ({
      label: d.roundLabel ?? 'Đợt phát',
      at: d.completedAt,
      servings: d.actualServings ?? d.servingsServed,
      people: d.actualPeopleServed ?? d.peopleServed,
    }));
    const totalServings = servingsSeries.reduce((sum, d) => sum + d.servings, 0);
    const totalPeople = servingsSeries.reduce((sum, d) => sum + d.people, 0);

    // Kg nguyên liệu về bếp theo NGÀY (giờ VN) — nguồn là sổ ký nhận; khoản góp thẳng
    // (không qua đơn) cộng thêm nếu ghi số kg đọc được.
    const kgByDay = new Map<string, number>();
    const dayKey = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    for (const pk of pickups) {
      const key = dayKey(pk.confirmedAt);
      kgByDay.set(key, (kgByDay.get(key) ?? 0) + Number(pk.receivedKg));
    }
    for (const don of donations) {
      if (don.providerRequestId) continue; // đã tính qua sổ ký nhận của đơn
      const kg = this.parseDonationQuantity(don.quantity, 'kg');
      if (kg != null && don.receivedAt) {
        const key = dayKey(don.receivedAt);
        kgByDay.set(key, (kgByDay.get(key) ?? 0) + kg);
      }
    }
    const kgSeries = [...kgByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({ date, kg: Math.round(kg * 10) / 10 }));
    const totalKg = Math.round(kgSeries.reduce((sum, r) => sum + r.kg, 0) * 10) / 10;

    // TNV: đếm NGƯỜI duy nhất theo vai trò (một người trực nhiều ca vẫn là một người).
    const byRole = new Map<string, Set<string>>();
    for (const a of assignments) {
      const set = byRole.get(a.role) ?? new Set<string>();
      set.add(a.volunteerId);
      byRole.set(a.role, set);
    }
    const volunteersByRole = [...byRole.entries()].map(([role, set]) => ({
      role,
      count: set.size,
    }));
    const uniqueVolunteers = new Set(assignments.map((a) => a.volunteerId)).size;

    return {
      campaign: { id: campaign.id, title: campaign.title, status: campaign.status },
      totals: {
        servings: totalServings,
        people: totalPeople,
        kgReceived: totalKg,
        volunteers: uniqueVolunteers,
        distributionRounds: servingsSeries.length,
      },
      servingsSeries,
      kgSeries,
      volunteersByRole,
    };
  }

  /**
   * Báo cáo GỘP toàn tổ chức — mọi chiến dịch của charity cộng lại, cho dashboard
   * Tổng quan. Suất ăn gộp theo NGÀY (gộp theo từng đợt sẽ nổ nhãn khi có nhiều
   * chiến dịch); phần còn lại cùng cách tính với báo cáo từng chiến dịch.
   */
  async getCharityOverviewReport(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: { charityReceiverId: receiver.id },
      select: { id: true, status: true, operationEndAt: true },
    });
    const ids = campaigns.map((c) => c.id);
    if (ids.length === 0) {
      return {
        totals: { servings: 0, people: 0, kgReceived: 0, volunteers: 0, campaigns: 0 },
        servingsSeries: [], kgSeries: [], volunteersByRole: [], campaignsByOutcome: [],
      };
    }

    // Kết cục chiến dịch cho biểu đồ tròn: thành công / hủy / quá hạn (đã qua mốc
    // kết thúc mà chưa từng chạy xong — kể cả còn treo chờ duyệt).
    const nowTs = Date.now();
    const outcome = { completed: 0, cancelled: 0, expired: 0 };
    for (const c of campaigns) {
      if (c.status === 'completed') outcome.completed += 1;
      else if (c.status === 'cancelled') outcome.cancelled += 1;
      else if (c.operationEndAt.getTime() < nowTs) outcome.expired += 1;
    }

    const [distributions, pickups, donations, assignments] = await Promise.all([
      this.prisma.mealDistribution.findMany({
        where: { campaignId: { in: ids }, completedAt: { not: null } },
        select: { servingsServed: true, actualServings: true, actualPeopleServed: true, peopleServed: true, completedAt: true },
      }),
      this.prisma.campaignIngredientPickup.findMany({
        where: { campaignId: { in: ids } },
        select: { receivedKg: true, confirmedAt: true },
      }),
      this.prisma.campaignDonation.findMany({
        where: { campaignId: { in: ids }, status: 'received', providerRequestId: null },
        select: { quantity: true, receivedAt: true },
      }),
      this.prisma.campaignVolunteerAssignment.findMany({
        where: {
          campaignId: { in: ids },
          status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
          confirmationStatus: 'confirmed',
        },
        select: { role: true, volunteerId: true },
      }),
    ]);

    const dayKey = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

    const servingsByDay = new Map<string, { servings: number; people: number }>();
    for (const d of distributions) {
      const key = dayKey(d.completedAt!);
      const row = servingsByDay.get(key) ?? { servings: 0, people: 0 };
      row.servings += d.actualServings ?? d.servingsServed;
      row.people += d.actualPeopleServed ?? d.peopleServed;
      servingsByDay.set(key, row);
    }
    const servingsSeries = [...servingsByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, r]) => ({ date, ...r }));

    const kgByDay = new Map<string, number>();
    for (const pk of pickups) {
      const key = dayKey(pk.confirmedAt);
      kgByDay.set(key, (kgByDay.get(key) ?? 0) + Number(pk.receivedKg));
    }
    for (const don of donations) {
      const kg = this.parseDonationQuantity(don.quantity, 'kg');
      if (kg != null && don.receivedAt) {
        const key = dayKey(don.receivedAt);
        kgByDay.set(key, (kgByDay.get(key) ?? 0) + kg);
      }
    }
    const kgSeries = [...kgByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({ date, kg: Math.round(kg * 10) / 10 }));

    const byRole = new Map<string, Set<string>>();
    for (const a of assignments) {
      const set = byRole.get(a.role) ?? new Set<string>();
      set.add(a.volunteerId);
      byRole.set(a.role, set);
    }

    return {
      totals: {
        servings: servingsSeries.reduce((sum, r) => sum + r.servings, 0),
        people: servingsSeries.reduce((sum, r) => sum + r.people, 0),
        kgReceived: Math.round(kgSeries.reduce((sum, r) => sum + r.kg, 0) * 10) / 10,
        volunteers: new Set(assignments.map((a) => a.volunteerId)).size,
        campaigns: ids.length,
      },
      servingsSeries,
      kgSeries,
      volunteersByRole: [...byRole.entries()].map(([role, set]) => ({ role, count: set.size })),
      campaignsByOutcome: [
        { key: 'completed', count: outcome.completed },
        { key: 'cancelled', count: outcome.cancelled },
        { key: 'expired', count: outcome.expired },
      ],
    };
  }

  /**
   * Thống kê phía NHÀ CUNG CẤP: từng chiến dịch họ đã cung cấp — kg đặt, kg ký nhận
   * thực tế, số đơn — kèm chuỗi kg theo ngày để vẽ biểu đồ.
   */
  async getProviderSupplyStats(providerUserId: string) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: { id: true },
    });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

    const requests = await this.prisma.campaignProviderRequest.findMany({
      where: { providerId: provider.id, status: 'accepted', campaignId: { not: '00000000-0000-0000-0000-000000000000' } },
      select: {
        id: true, campaignId: true, demandDetails: true,
        campaign: { select: { title: true, status: true, scheduledDate: true } },
        ingredientPickup: { select: { receivedKg: true, confirmedAt: true } },
      },
    });

    const byCampaign = new Map<string, {
      campaignId: string; title: string; status: string; scheduledDate: Date;
      orderedKg: number; receivedKg: number; orders: number; lastDeliveredAt: Date | null;
    }>();
    const kgByDay = new Map<string, number>();
    const dayKey = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

    for (const r of requests) {
      const demand = (r.demandDetails ?? {}) as Record<string, unknown>;
      const ordered = demand.quantityKg == null ? 0 : Number(demand.quantityKg) || 0;
      const received = r.ingredientPickup ? Number(r.ingredientPickup.receivedKg) : 0;
      const row = byCampaign.get(r.campaignId) ?? {
        campaignId: r.campaignId, title: r.campaign.title, status: r.campaign.status,
        scheduledDate: r.campaign.scheduledDate, orderedKg: 0, receivedKg: 0, orders: 0,
        lastDeliveredAt: null,
      };
      row.orderedKg += ordered;
      row.receivedKg += received;
      row.orders += 1;
      if (r.ingredientPickup) {
        const at = r.ingredientPickup.confirmedAt;
        if (!row.lastDeliveredAt || at > row.lastDeliveredAt) row.lastDeliveredAt = at;
        const key = dayKey(at);
        kgByDay.set(key, (kgByDay.get(key) ?? 0) + received);
      }
      byCampaign.set(r.campaignId, row);
    }

    const campaigns = [...byCampaign.values()]
      .map((row) => ({
        ...row,
        orderedKg: Math.round(row.orderedKg * 10) / 10,
        receivedKg: Math.round(row.receivedKg * 10) / 10,
      }))
      .sort((a, b) => b.receivedKg - a.receivedKg);

    return {
      totals: {
        campaigns: campaigns.length,
        orders: requests.length,
        orderedKg: Math.round(campaigns.reduce((sum, c) => sum + c.orderedKg, 0) * 10) / 10,
        receivedKg: Math.round(campaigns.reduce((sum, c) => sum + c.receivedKg, 0) * 10) / 10,
      },
      campaigns,
      kgSeries: [...kgByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, kg]) => ({ date, kg: Math.round(kg * 10) / 10 })),
    };
  }

  /** Việc của tình nguyện viên: các campaign đã đăng ký + vai trò + trạng thái. */
  async myAssignments(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { volunteerId: volunteer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true, period: true, endDayOffset: true } },
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

    // Khoản quyên góp TNV này được phân công đi nhận — `pickupAssigneeIds` là
    // JSONB array<uuid> nên lấy theo campaign rồi lọc bằng JS (không join được).
    const donationPickupRows = await this.prisma.campaignDonation.findMany({
      where: {
        campaignId: { in: [...new Set(assignments.map((a) => a.campaignId))] },
        pickupDate: { not: null },
      },
      select: {
        id: true,
        itemName: true,
        quantity: true,
        status: true,
        pickupDate: true,
        pickupStartTime: true,
        pickupEndTime: true,
        pickupAssigneeIds: true,
        provider: { select: { businessName: true, address: true, contactPhone: true } },
      },
    });
    const pickupsByAssignment = new Map<string, typeof donationPickupRows>();
    for (const d of donationPickupRows) {
      const ids = Array.isArray(d.pickupAssigneeIds) ? (d.pickupAssigneeIds as string[]) : [];
      for (const assignmentId of ids) {
        pickupsByAssignment.set(assignmentId, [...(pickupsByAssignment.get(assignmentId) ?? []), d]);
      }
    }

    // Đơn nguyên liệu NCC mà tổ chức cử shipper này đi nhận — cùng cơ chế JSONB.
    const requestPickupRows = await this.prisma.campaignProviderRequest.findMany({
      where: {
        campaignId: { in: [...new Set(assignments.map((a) => a.campaignId))] },
        status: 'accepted',
      },
      select: {
        id: true,
        scheduledDate: true,
        pickupStartTime: true,
        pickupEndTime: true,
        pickupAssigneeIds: true,
        demandDetails: true,
        provider: { select: { businessName: true, address: true, contactPhone: true } },
      },
    });
    const requestPickupsByAssignment = new Map<string, Array<Record<string, unknown>>>();
    for (const r of requestPickupRows) {
      const ids = Array.isArray(r.pickupAssigneeIds) ? (r.pickupAssigneeIds as string[]) : [];
      if (ids.length === 0) continue;
      const demand = (r.demandDetails ?? {}) as Record<string, unknown>;
      const item = {
        id: r.id,
        ingredientName: (demand.ingredientName as string | undefined) ?? null,
        quantityKg: demand.quantityKg == null ? null : Number(demand.quantityKg),
        pickupDate: r.scheduledDate,
        pickupStartTime: r.pickupStartTime?.slice(0, 5) ?? null,
        pickupEndTime: r.pickupEndTime?.slice(0, 5) ?? null,
        provider: r.provider,
      };
      for (const assignmentId of ids) {
        requestPickupsByAssignment.set(assignmentId, [
          ...(requestPickupsByAssignment.get(assignmentId) ?? []),
          item,
        ]);
      }
    }

    const withPickups = <T extends { id: string }>(a: T) => ({
      ...a,
      donationPickups: pickupsByAssignment.get(a.id) ?? [],
      requestPickups: requestPickupsByAssignment.get(a.id) ?? [],
    });

    // Lấy delivery của từng campaign shipper qua campaign_provider_requests → campaign_transports
    const shipperAssignments = assignments.filter((a) =>
      OPS_ROLES.includes(a.role as (typeof OPS_ROLES)[number]),
    );
    if (shipperAssignments.length === 0) return assignments.map(withPickups);

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
      if (row?.delivery_id) deliveryByCampaign.set(assignment.campaignId, row.delivery_id);
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
        actualServings: true,
        actualPeopleServed: true,
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
      OPS_ROLES.includes(a.role as (typeof OPS_ROLES)[number])
        ? {
            ...withPickups(a),
            deliveryId: deliveryByCampaign.get(a.campaignId) ?? null,
            distributions: (distByCampaign.get(a.campaignId) ?? []).map((d) => ({
              id: d.id,
              roundLabel: d.roundLabel,
              // Đợt đã chốt trả số THỰC TẾ (1 suất = 1 người) — thẻ nhiệm vụ
              // hiển thị "X suất · Đã phát xong" phải là số shipper báo thật.
              servingsServed: d.completedAt ? (d.actualServings ?? d.servingsServed) : d.servingsServed,
              peopleServed: d.completedAt ? (d.actualPeopleServed ?? d.peopleServed) : d.peopleServed,
              note: d.note,
              distributedAt: d.distributedAt,
              completedAt: d.completedAt,
              points: Array.isArray(d.points) ? (d.points as unknown[]) : [],
            })),
          }
        : withPickups(a),
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
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignment = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true } },
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
            // Danh sách món ăn — shipper dùng để QC trước khi xác nhận đã lấy hàng.
            menuItems: true,
            charityReceiver: {
              select: { organizationName: true, user: { select: { fullName: true, phone: true } } },
            },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    if (assignment.volunteerId !== volunteer.id) {
      throw new ForbiddenException('Bạn không có quyền xem nhiệm vụ này.');
    }

    // Shipper → trả delivery info + pickup details
    if (assignment.role === 'shipper') {
      // Lấy delivery qua campaign_provider_requests → campaign_transports
      const [delivery] = await this.prisma.$queryRaw<{ id: string; status: string; pickup_start_time: string | null; pickup_end_time: string | null }[]>`
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
      const distributions = await this.myAssignedDistributions(assignment.campaignId, volunteer.id);

      const pickupOrders = await this.listPickupOrders([assignment.campaignId], volunteer.id);

      return {
        assignment: {
          id: assignment.id,
          role: assignment.role,
          status: assignment.status,
          confirmationStatus: assignment.confirmationStatus,
          confirmedAt: assignment.confirmedAt,
          checkInTime: assignment.checkInTime,
          checkInLateMinutes: assignment.checkInLateMinutes,
          workDate: assignment.workDate,
          ingredientProofUrl: assignment.ingredientProofUrl,
          cookedProofUrl: assignment.cookedProofUrl,
          distributionProofUrl: assignment.distributionProofUrl,
          pointsAwarded: assignment.pointsAwarded,
          shift: assignment.shift,
        },
        campaign: {
          ...assignment.campaign,
          // Chuẩn hoá menuItems từ jsonb
          menuItems: CampaignsService.normalizeMenuItems(assignment.campaign.menuItems as unknown as Prisma.JsonValue),
        },
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
    const detail = await this.dishSteps.getStepsForCampaign(assignment.campaignId, userId);

    // Phục vụ cũng được điều đi phát suất ăn như shipper — không trả đợt phát thì màn
    // nhiệm vụ của họ chỉ có bảng 4 khâu nấu ăn, vốn là việc của bếp chứ không phải
    // việc của phục vụ.
    const distributions =
      assignment.role === 'waiter'
        ? await this.myAssignedDistributions(assignment.campaignId, volunteer.id)
        : [];

    // Phục vụ cũng nhận được đơn đi lấy nguyên liệu (hai vai trò vận hành đã gộp).
    // Không trả về đây thì tổ chức phân công xong mà người được phân không thấy việc.
    const waiterPickupOrders =
      assignment.role === 'waiter'
        ? await this.listPickupOrders([assignment.campaignId], volunteer.id)
        : [];

    return {
      assignment: {
        id: assignment.id,
        role: assignment.role,
        status: assignment.status,
        confirmationStatus: assignment.confirmationStatus,
        confirmedAt: assignment.confirmedAt,
        checkInTime: assignment.checkInTime,
        checkInLateMinutes: assignment.checkInLateMinutes,
        workDate: assignment.workDate,
        ingredientProofUrl: assignment.ingredientProofUrl,
        cookedProofUrl: assignment.cookedProofUrl,
        distributionProofUrl: assignment.distributionProofUrl,
        pointsAwarded: assignment.pointsAwarded,
        shift: assignment.shift,
      },
      campaign: {
        ...assignment.campaign,
        // Chuẩn hoá menuItems từ jsonb
        menuItems: CampaignsService.normalizeMenuItems(assignment.campaign.menuItems as unknown as Prisma.JsonValue),
      },
      ...detail,
      ...(assignment.role === 'waiter' ? { pickupOrders: waiterPickupOrders } : {}),
      ...(assignment.role === 'waiter'
        ? {
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
          }
        : {}),
    };
  }

  /** Các đợt phát tổ chức phân công cho chính TNV này (shipper hoặc phục vụ). */
  private myAssignedDistributions(campaignId: string, volunteerId: string) {
    return this.prisma.mealDistribution.findMany({
      where: { campaignId, assigneeIds: { array_contains: volunteerId } },
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
    const rows = await this.prisma.$queryRaw<{
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
    }[]>(Prisma.sql`
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
        distanceKm: r.distance_km == null ? null : Math.round(Number(r.distance_km) * 10) / 10,
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
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        volunteerId: volunteer.id,
        // Phục vụ và giao hàng đã gộp làm một vai trò vận hành: ca phục vụ được cử đi
        // lấy nguyên liệu thì cũng phải thấy đơn ở Trung tâm giao hàng, nếu không họ
        // nhận thông báo phân công mà bấm vào chẳng có gì.
        role: { in: [...OPS_ROLES] },
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
        { assignmentId: a.id, checkedIn: ['checked_in', 'in_progress', 'completed'].includes(a.status) },
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
  async myPickupHistory(userId: string, opts: { page?: number; limit?: number } = {}) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 20, 100);

    const [total, rows] = await Promise.all([
      this.prisma.campaignIngredientPickup.count({ where: { volunteerId: volunteer.id } }),
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
    const geo = new Map<string, { lng: number | null; lat: number | null; distanceKm: number | null }>();
    if (rows.length > 0) {
      const geoRows = await this.prisma.$queryRaw<
        { id: string; lng: number | null; lat: number | null; distance_km: number | null }[]
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
          distanceKm: g.distance_km == null ? null : Math.round(Number(g.distance_km) * 10) / 10,
        });
      }
    }

    return {
      items: rows.map((r) => {
        const req = r.providerRequest;
        const demand = (req.demandDetails ?? {}) as Record<string, unknown>;
        const num = (v: unknown) => (v == null ? null : Number(v));
        const requestedKg = r.requestedKg == null ? null : Number(r.requestedKg);
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
          providerPhone: req.provider.contactPhone ?? req.provider.user.phone ?? null,
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
          shortfallKg: requestedKg == null ? 0 : Math.round(Math.max(0, requestedKg - receivedKg) * 10) / 10,
          photoUrl: r.photoUrl,
          note: r.note,
          confirmedAt: r.confirmedAt,
        };
      }),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
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
      throw new BadRequestException('Cần ảnh chụp nguyên liệu đã lấy để xác nhận.');
    }

    const request = await this.prisma.campaignProviderRequest.findUnique({
      where: { id: providerRequestId },
      select: {
        id: true,
        campaignId: true,
        status: true,
        needsTransport: true,
        demandDetails: true,
        provider: { select: { businessName: true, userId: true } },
        delivery: { select: { id: true, status: true, shipperId: true } },
        campaign: {
          select: { title: true, charityReceiver: { select: { userId: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Không tìm thấy đơn nguyên liệu.');
    if (request.status !== 'accepted') {
      throw new BadRequestException('Đơn này chưa được nhà cung cấp chấp nhận.');
    }

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // Hai trường hợp trùng lặp thật sự — chốt ở đây sẽ tạo hai nguồn sự thật cho cùng
    // một lần lấy hàng:
    const activeDeliveryStatuses = ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'];
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

    // Phải trực ca vận hành của chiến dịch VÀ đã điểm danh — cùng lý do với chốt đợt
    // phát: không điểm danh thì người ở nhà vẫn "xác nhận đã lấy" được.
    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId: request.campaignId,
        volunteerId: volunteer.id,
        role: { in: [...OPS_ROLES] },
      },
      select: { id: true, status: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Bạn không trực ca vận hành nào của chiến dịch này.');
    }
    if (!['checked_in', 'in_progress', 'completed'].includes(assignment.status)) {
      throw new BadRequestException(
        'Bạn cần điểm danh tại bếp trước khi xác nhận đã lấy nguyên liệu.',
      );
    }

    const demand = (request.demandDetails ?? {}) as Record<string, unknown>;
    const requestedKg = demand.quantityKg == null ? null : Number(demand.quantityKg);
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

    // Đồng bộ sổ trạng thái vận chuyển: hàng đã về bếp → 'delivered' để tab
    // "Giao & nhận hàng" hiện form chốt kg cho tổ chức (chốt xong NCC được báo).
    // Gồm cả transport failed/cancelled từ thời còn pool search — biên nhận là
    // bằng chứng hàng đã về thật.
    const now = new Date();
    await this.prisma.campaignTransport.updateMany({
      where: { providerRequestId, status: { in: ['pending', 'failed', 'cancelled'] } },
      data: { status: 'delivered', pickedUpAt: now, deliveredAt: now, failedAt: null, failureReason: null },
    });

    const shortfall = requestedKg == null ? 0 : Math.max(0, requestedKg - dto.receivedKg);

    // Ký nhận cho NHÀ CUNG CẤP: hàng rời kho của họ là phải biết ai lấy, bao nhiêu,
    // lúc nào — kèm ảnh làm bằng chứng. Trước đây chỉ tổ chức được báo, NCC giao hàng
    // xong không nhận được dòng nào.
    void this.notifications.notify(request.provider.userId, {
      type: 'provider_request',
      title: `Đã giao ${dto.receivedKg} kg cho chiến dịch "${request.campaign.title}"`,
      body:
        `Người lấy: ${volunteer.user.fullName} — ký nhận lúc ` +
        `${now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. ` +
        `Số lượng: ${dto.receivedKg} kg` +
        (requestedKg != null ? ` trên đơn ${requestedKg} kg` : '') +
        (shortfall > 0 ? ` (thiếu ${Math.round(shortfall * 10) / 10} kg)` : '') +
        '. Có ảnh xác nhận kèm theo trong đơn.',
      data: {
        providerRequestId,
        campaignId: request.campaignId,
        receivedKg: dto.receivedKg,
        pickedBy: volunteer.user.fullName,
        pickedAt: now.toISOString(),
        photoUrl,
      },
    });

    void this.notifications.notify(request.campaign.charityReceiver.userId, {
      type: 'campaign',
      title: shortfall > 0 ? 'Nguyên liệu về THIẾU so với đơn' : 'Đã lấy nguyên liệu',
      body:
        `${volunteer.user.fullName} đã lấy ${dto.receivedKg} kg` +
        (requestedKg != null ? `/${requestedKg} kg` : '') +
        ` từ ${request.provider.businessName} cho "${request.campaign.title}"` +
        (shortfall > 0 ? ` — thiếu ${Math.round(shortfall * 10) / 10} kg.` : '.') +
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
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        shifts: {
          orderBy: { startTime: 'asc' },
          select: {
            id: true,
            label: true,
            role: true,
            startTime: true,
            endTime: true,
            period: true,
            endDayOffset: true,
            needsReview: true,
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
            // Hồ sơ TNV — cần cho các API nhận volunteerId (vd chọn người phụ trách đợt phát)
            volunteerId: true,
            role: true,
            status: true,
            confirmationStatus: true,
            confirmedAt: true,
            shiftId: true,
            workDate: true,
            checkInTime: true,
            shift: { select: { id: true, label: true, role: true, startTime: true, endTime: true, endDayOffset: true } },
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
                faceImageUrl: true,
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
            // Lịch đi nhận + DS shipper được cử — tab "Giao & nhận hàng" cần đủ
            // để tổ chức biết ai đi nhận và xác nhận số lượng thực nhận.
            pickupDate: true,
            pickupStartTime: true,
            pickupEndTime: true,
            pickupAssigneeIds: true,
            // Có giá trị = khoản này đi kèm một đơn nguyên liệu; FE gộp vào thẻ đơn đó
            // thay vì hiện thành lô riêng.
            providerRequestId: true,
            provider: { select: { businessName: true, address: true, contactPhone: true } },
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
            actualServings: true,
            actualPeopleServed: true,
            photoUrl: true,
            note: true,
            distributedAt: true,
            completedAt: true,
            completedByVolunteerId: true,
            assigneeIds: true,
            points: true,
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
      // Hồ sơ TNV — khác `id` (id của bản ghi phân công). Cần cho các API nhận
      // volunteerId, ví dụ chọn người phụ trách đợt phát.
      volunteerId: a.volunteerId,
      role: a.role,
      status: a.status,
      confirmationStatus: a.confirmationStatus,
      confirmedAt: a.confirmedAt,
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
        faceImageUrl: a.volunteer.faceImageUrl,
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

    // Thống kê "đã phát" CHỈ tính các đợt đã xác nhận phát xong — đợt mới lên kế hoạch
    // chưa có suất nào tới tay người dân, tính vào là báo cáo sai. Đợt đã chốt lấy số
    // shipper BÁO THỰC TẾ (fallback số kế hoạch cho bản ghi cũ không có actual).
    const distributionSummary = campaign.mealDistributions
      .filter((d) => d.completedAt != null)
      .reduce(
        (acc, d) => ({
          servingsServed: acc.servingsServed + (d.actualServings ?? d.servingsServed),
          peopleServed: acc.peopleServed + (d.actualPeopleServed ?? d.peopleServed),
          leftoverServings: acc.leftoverServings + d.leftoverServings,
        }),
        { servingsServed: 0, peopleServed: 0, leftoverServings: 0 },
      );

    // Phần đã lên kế hoạch nhưng chưa xác nhận — để tổ chức biết còn bao nhiêu đang chạy.
    const plannedSummary = campaign.mealDistributions
      .filter((d) => d.completedAt == null)
      .reduce(
        (acc, d) => ({ rounds: acc.rounds + 1, servings: acc.servings + d.servingsServed }),
        { rounds: 0, servings: 0 },
      );

    const fillRate = this.campaignFillRate(campaign);
    const minFillPercent = await this.systemConfig.getNumber('CAMPAIGN_MIN_FILL_PERCENT');

    // kitchen_location là cột geography (Unsupported trong Prisma) → đọc qua raw SQL.
    const [kitchenCoords] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
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
      const ids = Array.isArray(d.assigneeIds) ? (d.assigneeIds as string[]) : [];
      return {
        id: d.id,
        roundLabel: d.roundLabel,
        servingsServed: d.servingsServed,
        peopleServed: d.peopleServed,
        // Số shipper báo thực tế lúc chốt — FE ưu tiên hiển thị khi đợt đã xong.
        actualServings: d.actualServings,
        actualPeopleServed: d.actualPeopleServed,
        leftoverServings: d.leftoverServings,
        photoUrl: d.photoUrl,
        note: d.note,
        distributedAt: d.distributedAt,
        completedAt: d.completedAt,
        servedBy: d.servedBy.user.fullName,
        assignees: ids.map((id) => ({ volunteerId: id, fullName: assigneeNameById.get(id) ?? 'TNV' })),
        points: Array.isArray(d.points) ? (d.points as unknown[]) : [],
        feedback: d.feedback,
      };
    });

    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      recruitmentStatus: campaign.recruitmentStatus,
      operationStartAt: campaign.operationStartAt,
      operationEndAt: campaign.operationEndAt,
      recruitmentStartAt: campaign.recruitmentStartAt,
      recruitmentEndAt: campaign.recruitmentEndAt,
      recruitmentBufferHours: campaign.recruitmentBufferHours,
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
      imageUrls: Array.isArray(campaign.imageUrls) ? (campaign.imageUrls as string[]) : [],
      chefSlotsNeeded: campaign.chefSlotsNeeded,
      waiterSlotsNeeded: campaign.waiterSlotsNeeded,
      shipperSlotsNeeded: campaign.shipperSlotsNeeded,
      chefSlotsFilled: campaign.chefSlotsFilled,
      waiterSlotsFilled: campaign.waiterSlotsFilled,
      shipperSlotsFilled: campaign.shipperSlotsFilled,
      expectedServings: campaign.expectedServings,
      actualServings: campaign.actualServings,
      menuItems: CampaignsService.normalizeMenuItems(campaign.menuItems),
      scheduleItems: Array.isArray(campaign.scheduleItems) ? campaign.scheduleItems : [],
      supplyItems: Array.isArray(campaign.supplyItems) ? (campaign.supplyItems as string[]) : [],
      organizationName: campaign.charityReceiver?.organizationName ?? campaign.charityReceiver?.user.fullName ?? null,
      participants,
      donations: campaign.donations,
      distributions,
      distributionSummary,
      plannedSummary,
      shifts: campaign.shifts,
      menuItemRefs: campaign.menuItemRefs,
      // Dish steps để tổ chức theo dõi quy trình bếp + duyệt ảnh QC.
      // getStepsForCampaign trả {dishes, cookingTeam, safetyLogs} — FE khai báo
      // dishSteps là DishProcessItem[] nên chỉ lấy .dishes.
      dishSteps: campaign.status === 'in_progress'
        ? (await this.dishSteps.getStepsForCampaign(id, userId)).dishes
        : [],
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
    const now = new Date();
    const recruitmentStatusAcceptsApplications = ['open', 'staffed'].includes(
      campaign.recruitmentStatus,
    ) || (
      campaign.recruitmentStatus === 'scheduled'
      && now >= campaign.recruitmentStartAt
    );
    if (
      campaign.status !== 'approved'
      || !recruitmentStatusAcceptsApplications
      || now < campaign.recruitmentStartAt
      || now >= campaign.recruitmentEndAt
    ) {
      throw new BadRequestException('Chiến dịch hiện không trong thời gian nhận đăng ký.');
    }
    // Chặn đăng ký khi chiến dịch đã kết thúc hẳn.
    //
    // Mốc so sánh là NGÀY KẾT THÚC chứ không phải ngày bắt đầu: chiến dịch 12/08→14/08
    // vẫn còn hai ngày làm việc vào sáng 13/08, chặn theo `scheduledDate` là đóng cửa
    // đăng ký ngay từ ngày thứ hai.
    const lastDay = campaign.endDate ?? campaign.scheduledDate;
    if (Date.now() > this.vnDateTimeToUtc(lastDay, campaign.endTime)) {
      throw new BadRequestException('Chiến dịch này đã kết thúc, không còn nhận đăng ký.');
    }

    // Chiến dịch chia ca thì phải đăng ký theo ca cụ thể. Điều kiện `!dto.shiftId`
    // là bắt buộc: thiếu nó thì lối vào /shifts/:shiftId/apply — vốn LUÔN kèm shiftId
    // — cũng bị chặn, và chiến dịch có ca sẽ không nhận được đăng ký nào.
    const shiftCount = await this.prisma.campaignShift.count({ where: { campaignId } });
    if (shiftCount > 0 && !dto.shiftId) {
      throw new BadRequestException('Chiến dịch này có ca làm việc, vui lòng đăng ký trực tiếp theo từng ca.');
    }

    let shiftId: string | undefined;
    // Ngày trực. Chiến dịch một ngày thì chỉ có một lựa chọn nên tự suy ra; nhiều ngày
    // thì TNV phải nói rõ trực buổi nào, nếu không tổ chức không xếp được người theo ngày.
    const campaignDays = this.campaignDays(campaign.scheduledDate, lastDay);
    let workDate: Date = campaign.scheduledDate;

    if (dto.shiftId) {
      const shift = await this.prisma.campaignShift.findUnique({ where: { id: dto.shiftId } });
      if (!shift || shift.campaignId !== campaignId) {
        throw new BadRequestException('Ca trực không thuộc chiến dịch này.');
      }
      if (shift.role && shift.role !== dto.role) {
        throw new BadRequestException(`Ca "${shift.label}" không phù hợp với vai trò ${roleVN}.`);
      }

      if (dto.workDate) {
        const picked = campaignDays.find((d) => this.toDateKey(d) === dto.workDate);
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
      const shiftEndDate = new Date(workDate);
      shiftEndDate.setUTCDate(shiftEndDate.getUTCDate() + (shift.endDayOffset ?? 0));
      if (Date.now() > this.vnDateTimeToUtc(shiftEndDate, shift.endTime)) {
        throw new BadRequestException(
          `Ca "${shift.label}" (${shift.startTime}–${shift.endTime}) ngày `
            + `${this.toDateKey(workDate)} đã qua. Hãy chọn ngày hoặc ca khác còn diễn ra.`,
        );
      }

      // Số chỗ của ca tính THEO NGÀY: ca 2 chỗ của chiến dịch 3 ngày là 2 chỗ mỗi ngày,
      // không phải 2 chỗ cho cả đợt.
      const takenThatDay = await this.prisma.campaignVolunteerAssignment.count({
        where: {
          shiftId: shift.id,
          workDate,
          confirmationStatus: 'confirmed',
          status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
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
            status: 'pending', shiftId: shiftId ?? existing.shiftId, workDate, notes: null,
            confirmationStatus: 'pending', confirmedAt: null,
          },
        });
        return { message: `Đã gửi lại đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.` };
      }
      throw new ConflictException(
        shiftId
          ? `Bạn đã đăng ký ca này ngày ${this.toDateKey(workDate)} rồi.`
          : 'Bạn đã đăng ký vai trò này rồi.',
      );
    }

    if (shiftId) {
      await this.assertShiftNotOverlapping(campaignId, volunteer.id, shiftId, workDate);
      const shiftRow = await this.prisma.campaignShift.findUnique({
        where: { id: shiftId },
        select: { period: true },
      });
      await this.assertNoActiveDeliveryInShift(
        volunteer.id,
        shiftRow?.period ?? null,
        this.toDateKey(workDate),
      );
    }

    await this.prisma.campaignVolunteerAssignment.create({
      data: {
        campaignId, volunteerId: volunteer.id, shiftId, workDate, role: dto.role,
        status: 'pending', confirmationStatus: 'pending',
      },
    });

    return { message: `Đã gửi đăng ký vai trò ${roleVN}. Vui lòng chờ tổ chức duyệt.` };
  }

  /** TNV xác nhận lại ca sau khi tổ chức duyệt; chỉ ca confirmed mới tính vào readiness. */
  async confirmAssignment(
    assignmentId: string,
    userId: string,
    decision: 'confirmed' | 'declined',
  ) {
    const assignment = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        volunteer: { select: { userId: true, user: { select: { fullName: true } } } },
        campaign: {
          select: {
            id: true,
            status: true,
            recruitmentEndAt: true,
            title: true,
            charityReceiver: { select: { userId: true } },
          },
        },
        shift: { select: { id: true, label: true, period: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Không tìm thấy đăng ký.');
    if (assignment.volunteer.userId !== userId) {
      throw new ForbiddenException('Bạn chỉ được xác nhận ca của chính mình.');
    }
    if (assignment.status !== 'assigned') {
      throw new BadRequestException('Chỉ xác nhận được ca đã được tổ chức duyệt.');
    }
    // Xác nhận mới là lúc ca thành cam kết thật — chặn ở đây, không chỉ ở lúc nhận lời mời.
    if (decision === 'confirmed' && assignment.workDate) {
      await this.assertNoActiveDeliveryInShift(
        assignment.volunteerId,
        assignment.shift?.period ?? null,
        this.toDateKey(assignment.workDate),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Cùng khoá với tác vụ auto-start: xác nhận/huỷ và quyết định bắt đầu không thể chen ngang nhau.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM kitchen_campaigns WHERE id = ${assignment.campaignId}::uuid FOR UPDATE
      `);
      const lockedCampaign = await tx.kitchenCampaign.findUnique({
        where: { id: assignment.campaignId },
        select: { status: true, recruitmentEndAt: true },
      });
      if (!lockedCampaign || lockedCampaign.status !== 'approved') {
        throw new BadRequestException('Chiến dịch đã bắt đầu hoặc đã kết thúc.');
      }
      if (new Date() >= lockedCampaign.recruitmentEndAt) {
        throw new BadRequestException('Đã hết hạn xác nhận ca. Tổ chức cần gia hạn tuyển hoặc dời lịch.');
      }

      if (decision === 'confirmed') {
        const updated = await tx.campaignVolunteerAssignment.updateMany({
          where: { id: assignmentId, status: 'assigned', confirmationStatus: 'pending' },
          data: { confirmationStatus: 'confirmed', confirmedAt: new Date() },
        });
        if (updated.count === 0 && assignment.confirmationStatus !== 'confirmed') {
          throw new ConflictException('Ca này đã được cập nhật bởi một yêu cầu khác.');
        }
      } else {
        const updated = await tx.campaignVolunteerAssignment.updateMany({
          where: { id: assignmentId, status: 'assigned', confirmationStatus: { in: ['pending', 'confirmed'] } },
          data: { confirmationStatus: 'declined', confirmedAt: null, status: 'cancelled' },
        });
        if (updated.count === 0) throw new ConflictException('Ca này đã được cập nhật bởi một yêu cầu khác.');
        const slot = SLOT_FIELD[assignment.role];
        await tx.kitchenCampaign.update({
          where: { id: assignment.campaignId },
          data: { [slot.filled]: { decrement: 1 } },
        });
        if (assignment.shiftId) {
          await tx.campaignShift.update({
            where: { id: assignment.shiftId },
            data: { slotsFilled: { decrement: 1 } },
          });
        }
      }
    });
    await this.refreshRecruitmentStatus(assignment.campaignId);

    // TNV bỏ ca là tổ chức HỤT người — phải báo ngay để còn kịp tuyển bù trước hạn.
    // Trước đây chỉ có refreshRecruitmentStatus bắn "Đã mở tuyển" khi chuỗi trạng thái
    // đổi, tổ chức đọc xong tưởng tin vui chứ không biết vừa mất một người.
    if (decision === 'declined') {
      const roleVN = ROLE_VN[assignment.role] ?? assignment.role;
      const shiftPart = assignment.shift?.label ? ` (${assignment.shift.label})` : '';
      void this.notifications.notify(assignment.campaign.charityReceiver.userId, {
        type: 'campaign',
        title: 'Tình nguyện viên bỏ ca',
        body:
          `${assignment.volunteer.user.fullName} đã từ chối ca ${roleVN}${shiftPart} `
          + `của chiến dịch "${assignment.campaign.title}". Vị trí này đã được mở lại để tuyển bù.`,
        data: { campaignId: assignment.campaignId, assignmentId, status: 'declined' },
      });
    }

    return { id: assignmentId, confirmationStatus: decision };
  }

  /**
   * Chặn TNV nhận một ca chồng giờ với mọi ca họ đã giữ chỗ, kể cả ở chiến dịch khác.
   *
   * Ca liền kề (10:00–12:00 rồi 12:00–14:00) KHÔNG tính là chồng — bàn giao xong
   * là đi tiếp được. Chỉ so khi cả hai ca có giờ hợp lệ; ca giờ hỏng thì bỏ qua
   * ở đây vì phần tạo ca đã validate riêng.
   */
  private async assertShiftNotOverlapping(
    _campaignId: string,
    volunteerId: string,
    shiftId: string,
    workDate: Date,
    opts?: {
      /** Bỏ qua chính bản ghi đang được duyệt — không tự trùng với mình. */
      excludeAssignmentId?: string;
      /** Danh sách status coi là "đang giữ chỗ" (mặc định: pending + đã nhận). */
      statuses?: AssignmentStatus[];
      /** true = thông điệp cho tổ chức đang duyệt (thay vì cho TNV đăng ký). */
      orgView?: boolean;
      /**
       * Client dùng để truy vấn. Gọi TRONG `$transaction` thì PHẢI truyền `tx`:
       * query bằng client ngoài sẽ xin thêm một connection từ pool trong khi
       * transaction vẫn đang giữ connection của nó — đủ vài lượt duyệt đồng thời
       * là cạn pool, transaction quá hạn 5s và ném P2028.
       */
      client?: Prisma.TransactionClient;
    },
  ): Promise<void> {
    const db = opts?.client ?? this.prisma;
    const target = await db.campaignShift.findUnique({
      where: { id: shiftId },
      select: { startTime: true, endTime: true, endDayOffset: true },
    });
    const from = this.shiftMinute(target?.startTime);
    const toBase = this.shiftMinute(target?.endTime);
    const to = toBase === null ? null : toBase + (target?.endDayOffset ?? 0) * 1440;
    if (from === null || to === null) return;

    const targetDay = new Date(Date.UTC(
      workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(),
    ));
    const rangeStart = new Date(targetDay.getTime() - 86_400_000);
    const rangeEnd = new Date(targetDay.getTime() + 86_400_000);
    const held = await db.campaignVolunteerAssignment.findMany({
      where: {
        volunteerId,
        shiftId: { not: null },
        ...(opts?.excludeAssignmentId ? { id: { not: opts.excludeAssignmentId } } : {}),
        // Lấy thêm ngày kề để phát hiện ca tối kéo qua 00:00.
        workDate: { gte: rangeStart, lte: rangeEnd },
        status: {
          in: opts?.statuses ?? ['pending', 'assigned', 'checked_in', 'in_progress', 'completed'],
        },
      },
      select: {
        workDate: true,
        shift: { select: { label: true, startTime: true, endTime: true, endDayOffset: true } },
        campaign: { select: { title: true } },
      },
    });

    const targetStartAt = targetDay.getTime() + from * 60_000;
    const targetEndAt = targetDay.getTime() + to * 60_000;
    for (const a of held) {
      const s = this.shiftMinute(a.shift?.startTime);
      const eBase = this.shiftMinute(a.shift?.endTime);
      const e = eBase === null ? null : eBase + (a.shift?.endDayOffset ?? 0) * 1440;
      if (s === null || e === null || !a.workDate) continue;
      const heldDay = Date.UTC(
        a.workDate.getUTCFullYear(), a.workDate.getUTCMonth(), a.workDate.getUTCDate(),
      );
      const heldStartAt = heldDay + s * 60_000;
      const heldEndAt = heldDay + e * 60_000;
      if (targetStartAt < heldEndAt && heldStartAt < targetEndAt) {
        throw new ConflictException(
          opts?.orgView
            ? `TNV này đã nhận ca "${a.shift?.label ?? 'khác'}" (${a.shift?.startTime}–${a.shift?.endTime}` +
                ` ngày ${this.toDateKey(a.workDate)}, chiến dịch "${a.campaign?.title ?? ''}") trùng giờ` +
                ' với ca đang duyệt — không thể phân vào ca này.'
            : `Ca này trùng giờ với ca "${a.shift?.label ?? 'đã đăng ký'}" bạn đã nhận. ` +
                'Bạn có thể nhận nhiều ca liền kề, miễn là các ca không trùng thời gian.',
        );
      }
    }
  }

  /**
   * Các ràng buộc form tạo chiến dịch cần biết để chặn NGAY tại ô nhập.
   *
   * Không để FE hardcode: các số này nằm trong `system_configs` cho admin chỉnh, hardcode
   * lại ở FE thì admin đổi xong giao diện vẫn cho nhập rồi mới báo lỗi từ server.
   * `/admin/configs` chỉ admin gọi được nên tổ chức cần lối riêng, chỉ lộ đúng phần cần.
   */
  async getCreateConstraints() {
    const [multiDayLeadDays, minFillPercent, changeLockDays, allowEarlyStart] = await Promise.all([
      this.systemConfig.getNumber('MULTIDAY_CAMPAIGN_LEAD_DAYS'),
      this.systemConfig.getNumber('CAMPAIGN_MIN_FILL_PERCENT'),
      this.systemConfig.getNumber('CAMPAIGN_CHANGE_LOCK_DAYS'),
      this.systemConfig.getNumber('CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN'),
    ]);
    // Ngày sớm nhất cho chiến dịch dài ngày — tính sẵn ở server để FE không phải
    // cộng ngày theo múi giờ máy người dùng.
    const earliest = new Date(Date.now() + 7 * 3600_000);
    earliest.setUTCDate(earliest.getUTCDate() + multiDayLeadDays);
    return {
      multiDayLeadDays,
      multiDayEarliestStartDate: earliest.toISOString().slice(0, 10),
      minFillPercent,
      changeLockDays,
      // Admin bật "Cho phép bắt đầu/điểm danh sớm" thì FE phải hiện nút Bắt đầu
      // TRƯỚC giờ vận hành — nếu không, cấu hình bật mà giao diện vẫn giấu nút.
      allowEarlyStart: allowEarlyStart === 1,
    };
  }

  /**
   * Chiến dịch DÀI NGÀY phải được tạo trước một khoảng, chiến dịch trong ngày thì không.
   *
   * Lý do phân biệt: bếp một buổi có thể mở gấp khi vừa xin được thực phẩm — chặn lại
   * là bỏ phí đồ ăn, đúng thứ hệ thống sinh ra để cứu. Còn chiến dịch 3 ngày cần tuyển
   * đủ TNV cho TỪNG buổi và đặt nguyên liệu theo ngày; mở sát giờ thì ngày đầu có người
   * còn hai ngày sau bỏ trống.
   *
   * So sánh bằng CHUỖI ngày `YYYY-MM-DD` theo giờ VN, không dùng `Date` trừ nhau: mốc
   * ngày lưu ở UTC 00:00 nên từ 00:00–07:00 giờ VN, `new Date()` vẫn đang ở ngày hôm
   * trước và mọi phép trừ lệch đúng một ngày.
   */
  private async assertLeadTime(startDate: string, endDate: string): Promise<void> {
    if (endDate <= startDate) return; // gói gọn trong 1 ngày → cho tạo ngay

    const leadDays = await this.systemConfig.getNumber('MULTIDAY_CAMPAIGN_LEAD_DAYS');
    if (leadDays <= 0) return;

    const earliest = new Date(Date.now() + 7 * 3600_000); // hôm nay theo giờ VN
    earliest.setUTCDate(earliest.getUTCDate() + leadDays);
    const earliestStr = earliest.toISOString().slice(0, 10);

    if (startDate < earliestStr) {
      throw new BadRequestException(
        `Chiến dịch kéo dài nhiều ngày phải được tạo trước ít nhất ${leadDays} ngày ` +
          `— sớm nhất có thể bắt đầu là ${earliestStr}. ` +
          'Nếu cần tổ chức ngay, hãy đặt ngày kết thúc trùng ngày bắt đầu (chiến dịch trong ngày).',
      );
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
    const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
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
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId }, select: { id: true } });
    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!receiver || campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException('Chỉ tổ chức tạo chiến dịch mới thao tác được.');
    }
    return campaign;
  }

  /** Cấu hình cần cho tính toán readiness — đọc NGOÀI transaction rồi truyền vào. */
  private async readStaffingConfig(): Promise<{
    minimumFillPercent: number;
    allowEarlyStartAndCheckIn: number;
  }> {
    const [minimumFillPercent, allowEarlyStartAndCheckIn] = await Promise.all([
      this.systemConfig.getNumber('CAMPAIGN_MIN_FILL_PERCENT'),
      this.systemConfig.getNumber('CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN'),
    ]);
    return { minimumFillPercent, allowEarlyStartAndCheckIn };
  }

  /**
   * TNV đã khai rảnh đúng ca này, để tổ chức chủ động mời khi ca thiếu người.
   *
   * Đây là DANH SÁCH GỢI Ý, không phải người đã nhận việc: lịch rảnh chỉ là khai báo
   * ý định nên phải loại sẵn người đã đăng ký ca đó và người đang bị khoá tài khoản.
   */
  async getAvailableVolunteersForShift(
    campaignId: string,
    userId: string,
    workDate: string,
    period: string,
    role?: string,
  ) {
    await this.assertOwner(campaignId, userId);
    // ISODOW: 1 = Thứ 2 … 7 = Chủ nhật, khớp cột day_of_week.
    const isoDow = new Date(`${workDate}T00:00:00+07:00`).getUTCDay();
    const dayOfWeek = isoDow === 0 ? 7 : isoDow;

    return this.prisma.$queryRaw<
      { volunteerId: string; fullName: string; phone: string | null; specializations: string[] }[]
    >(Prisma.sql`
      SELECT vp.id            AS "volunteerId",
             u.full_name      AS "fullName",
             u.phone          AS phone,
             COALESCE(ARRAY_AGG(DISTINCT vs.specialization::text)
                        FILTER (WHERE vs.specialization IS NOT NULL), '{}') AS specializations
      FROM volunteer_availability va
      JOIN volunteer_profiles vp ON vp.id = va.volunteer_id
      JOIN users u ON u.id = vp.user_id
      LEFT JOIN volunteer_specializations vs ON vs.volunteer_id = vp.id
      WHERE va.day_of_week = ${dayOfWeek}
        AND va.period = ${period}::campaign_shift_period
        AND u.status = 'active'
        AND vp.verification_status = 'approved'
        -- Đã đăng ký/được duyệt vào chính ngày này rồi thì không mời lại.
        AND NOT EXISTS (
          SELECT 1 FROM campaign_volunteer_assignments a
          WHERE a.volunteer_id = vp.id
            AND a.campaign_id = ${campaignId}::uuid
            AND a.work_date = ${workDate}::date
            AND a.status IN ('pending', 'assigned', 'checked_in', 'in_progress', 'completed')
        )
      GROUP BY vp.id, u.full_name, u.phone
      HAVING ${role ?? null}::text IS NULL
          OR ${role ?? null}::text = ANY(ARRAY_AGG(vs.specialization::text))
      ORDER BY u.full_name
      LIMIT 50
    `);
  }

  /**
   * Tổ chức gửi LỜI MỜI tới TNV đã khai rảnh khung giờ này.
   *
   * Cố ý chỉ là thông báo kèm link, KHÔNG tạo phân công: lịch rảnh là khai báo ý
   * định, tự gán sẽ tạo ra người bị xếp việc mà không hay biết rồi bị đánh vắng oan.
   * TNV vẫn tự bấm đăng ký và tổ chức vẫn duyệt như luồng bình thường.
   */
  async inviteVolunteersToShift(
    campaignId: string,
    userId: string,
    dto: { volunteerIds: string[]; workDate: string; period: string; message?: string; shiftId?: string },
  ) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (!['approved', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chỉ mời được tình nguyện viên cho chiến dịch đang tuyển hoặc đang chạy.');
    }
    if (dto.volunteerIds.length === 0) {
      throw new BadRequestException('Chưa chọn tình nguyện viên nào để mời.');
    }

    // Kiểm tra LẠI lịch rảnh ngay trước khi gửi, không tin danh sách tổ chức đang mở.
    // Danh sách gợi ý được cache 60s và TNV có thể bỏ tick bất cứ lúc nào, nên nếu chỉ
    // dựa vào volunteerIds thì sẽ gửi lời mời cho đúng khung họ vừa báo bận.
    const isoDow = new Date(`${dto.workDate}T00:00:00+07:00`).getUTCDay();
    const dayOfWeek = isoDow === 0 ? 7 : isoDow;
    const volunteers = await this.prisma.$queryRaw<{ id: string; userId: string }[]>(Prisma.sql`
      SELECT vp.id, vp.user_id AS "userId"
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      JOIN volunteer_availability va
        ON va.volunteer_id = vp.id
       AND va.day_of_week = ${dayOfWeek}
       AND va.period = ${dto.period}::campaign_shift_period
      WHERE vp.id IN (${Prisma.join(dto.volunteerIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND u.status = 'active'
    `);
    const skipped = dto.volunteerIds.length - volunteers.length;
    if (volunteers.length === 0) {
      throw new BadRequestException(
        'Những người bạn chọn vừa bỏ khung giờ này khỏi lịch rảnh (hoặc tài khoản bị khoá). '
        + 'Vui lòng tải lại danh sách để xem ai còn rảnh.',
      );
    }

    // Không gửi lại lời mời TNV đang còn treo cho đúng ca đó: tổ chức bấm mời hai lần
    // (hoặc mời lại người vẫn còn trong danh sách gợi ý) sẽ đẻ ra hai thông báo y hệt
    // nhau bên TNV — nhận một cái thì cái còn lại vẫn nằm đó, tưởng còn ca chưa trả lời.
    // Khoá trùng tính theo chiến dịch + ngày + ca + shiftId: cùng ngày cùng khung giờ
    // nhưng khác shift (khác vai trò) vẫn là hai lời mời hợp lệ.
    const pending = await this.prisma.$queryRaw<{ userId: string }[]>(Prisma.sql`
      SELECT DISTINCT n.user_id AS "userId"
      FROM notifications n
      WHERE n.user_id IN (${Prisma.join(volunteers.map((v) => Prisma.sql`${v.userId}::uuid`))})
        AND n.type = 'campaign'
        AND n.data->>'kind' = 'shift_invite'
        AND n.data->>'campaignId' = ${campaignId}
        AND n.data->>'workDate' = ${dto.workDate}
        AND n.data->>'period' = ${dto.period}
        AND COALESCE(n.data->>'shiftId', '') = ${dto.shiftId ?? ''}
        AND n.data->>'dismissedAt' IS NULL
    `);
    const pendingUserIds = new Set(pending.map((p) => p.userId));
    const targets = volunteers.filter((v) => !pendingUserIds.has(v.userId));
    const duplicated = volunteers.length - targets.length;
    if (targets.length === 0) {
      throw new BadRequestException(
        'Những người bạn chọn đều đang có lời mời cho đúng ca này và chưa trả lời. '
        + 'Hãy đợi họ phản hồi thay vì gửi thêm.',
      );
    }

    const periodLabel = SHIFT_PERIODS[dto.period as CampaignShiftPeriod]?.label ?? dto.period;
    const dateLabel = new Date(`${dto.workDate}T00:00:00+07:00`).toLocaleDateString('vi-VN');
    const note = dto.message?.trim();

    for (const v of targets) {
      void this.notifications.notify(v.userId, {
        type: 'campaign',
        title: 'Lời mời tham gia ca trực',
        body:
          `Chiến dịch "${campaign.title}" đang cần người cho ${periodLabel} ngày ${dateLabel} `
          + `— khung giờ bạn đã khai là rảnh.${note ? ` Lời nhắn từ tổ chức: ${note}` : ''} `
          + 'Vào mục "Chiến dịch → Việc của tôi" để nhận hoặc bỏ qua ca này.',
        data: {
          campaignId,
          workDate: dto.workDate,
          period: dto.period,
          shiftId: dto.shiftId ?? null,
          campaignTitle: campaign.title,
          kind: 'shift_invite',
        },
      });
    }

    // Báo rõ số người bị bỏ qua để tổ chức biết danh sách đã cũ, không tưởng đã mời đủ.
    return { invited: targets.length, skipped, duplicated };
  }

  /** Mức sẵn sàng được tính theo từng ngày + ca + vai trò, chỉ tính người đã xác nhận. */
  async getStaffingReadiness(campaignId: string) {
    return this.getStaffingReadinessWith(this.prisma, campaignId);
  }

  /**
   * @param config Cấu hình đã đọc SẴN. BẮT BUỘC truyền khi `client` là transaction
   *   client: SystemConfigService query bằng `this.prisma` (connection NGOÀI tx),
   *   mà pooler chạy `connection_limit=1` — transaction đang giữ connection duy
   *   nhất nên query đó nằm chờ vô hạn, tới khi tx hết hạn 5s và pool timeout
   *   (lỗi P2028 "Transaction already closed", 120s).
   */
  private async getStaffingReadinessWith(
    client: Prisma.TransactionClient,
    campaignId: string,
    config?: { minimumFillPercent: number; allowEarlyStartAndCheckIn: number },
  ) {
    const campaign = await client.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        scheduledDate: true,
        endDate: true,
        recruitmentStatus: true,
        recruitmentStartAt: true,
        recruitmentEndAt: true,
        recruitmentBufferHours: true,
        operationStartAt: true,
        operationEndAt: true,
        shifts: {
          orderBy: [{ startTime: 'asc' }, { role: 'asc' }],
          select: {
            id: true, label: true, role: true, period: true, startTime: true, endTime: true,
            endDayOffset: true, slotsNeeded: true, needsReview: true,
          },
        },
        assignments: {
          where: {
            status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
          },
          select: {
            id: true, volunteerId: true, shiftId: true, workDate: true, role: true,
            confirmationStatus: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    const { minimumFillPercent, allowEarlyStartAndCheckIn } =
      config ?? (await this.readStaffingConfig());
    const days = this.campaignDays(campaign.scheduledDate, campaign.endDate ?? campaign.scheduledDate);
    const matrix = days.flatMap((day) => campaign.shifts.map((shift) => {
      const dayKey = this.toDateKey(day);
      const assignedForCell = campaign.assignments.filter((a) =>
        a.shiftId === shift.id && this.toDateKey(a.workDate ?? campaign.scheduledDate) === dayKey,
      );
      const assigned = assignedForCell.length;
      const confirmed = assignedForCell.filter(
        (assignment) => assignment.confirmationStatus === 'confirmed',
      ).length;
      const valid = !!shift.period && !!shift.role && !shift.needsReview;
      const minimumRequired = Math.ceil(shift.slotsNeeded * minimumFillPercent / 100);
      const fillPercent = shift.slotsNeeded > 0
        ? Math.min(100, Math.floor(confirmed / shift.slotsNeeded * 100))
        : 100;
      return {
        workDate: dayKey,
        shiftId: shift.id,
        label: shift.label,
        period: shift.period,
        role: shift.role,
        startTime: shift.startTime,
        endTime: shift.endTime,
        endDayOffset: shift.endDayOffset,
        minRequired: shift.slotsNeeded,
        minimumRequired,
        fillPercent,
        assigned,
        confirmed,
        missing: Math.max(0, shift.slotsNeeded - confirmed),
        ready: valid && confirmed >= shift.slotsNeeded,
        eligibleToStart: valid && confirmed >= minimumRequired,
        needsReview: !valid,
      };
    }));
    const required = matrix.reduce((sum, row) => sum + row.minRequired, 0);
    const assigned = matrix.reduce((sum, row) => sum + Math.min(row.assigned, row.minRequired), 0);
    const confirmed = matrix.reduce((sum, row) => sum + Math.min(row.confirmed, row.minRequired), 0);
    const assignedVolunteers = new Set(campaign.assignments.map((a) => a.volunteerId));
    const confirmedVolunteers = new Set(
      campaign.assignments
        .filter((assignment) => assignment.confirmationStatus === 'confirmed')
        .map((assignment) => assignment.volunteerId),
    );
    return {
      recruitmentStatus: campaign.recruitmentStatus,
      recruitmentStartAt: campaign.recruitmentStartAt,
      recruitmentEndAt: campaign.recruitmentEndAt,
      recruitmentBufferHours: campaign.recruitmentBufferHours,
      operationStartAt: campaign.operationStartAt,
      operationEndAt: campaign.operationEndAt,
      requiredShiftSlots: required,
      assignedShiftSlots: assigned,
      confirmedShiftSlots: confirmed,
      assignedUniqueVolunteers: assignedVolunteers.size,
      confirmedUniqueVolunteers: confirmedVolunteers.size,
      // Giữ trường cũ để không phá client cũ; ý nghĩa vẫn là số TNV đã xác nhận.
      uniqueVolunteers: confirmedVolunteers.size,
      minimumFillPercent,
      eligibleToStart: matrix.length > 0 && matrix.every((row) => row.eligibleToStart),
      canStartNow: matrix.length > 0
        && matrix.every((row) => row.eligibleToStart)
        && (allowEarlyStartAndCheckIn === 1 || new Date() >= campaign.operationStartAt),
      ready: matrix.length > 0 && matrix.every((row) => row.ready),
      matrix,
    };
  }

  /** Đồng bộ trạng thái tuyển từ thời gian thực và ma trận định biên. */
  async refreshRecruitmentStatus(campaignId: string, now = new Date()) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: { charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (campaign.status !== 'approved') return campaign.recruitmentStatus;
    const readiness = await this.getStaffingReadiness(campaignId);
    const next = now < campaign.recruitmentStartAt
      ? 'scheduled'
      : readiness.eligibleToStart
        ? (now >= campaign.recruitmentEndAt ? 'closed_ready' : 'staffed')
        : (now >= campaign.recruitmentEndAt ? 'expired_understaffed' : 'open');
    if (next !== campaign.recruitmentStatus) {
      await this.prisma.kitchenCampaign.update({
        where: { id: campaignId },
        data: { recruitmentStatus: next },
      });
      const messages: Partial<Record<typeof next, { title: string; body: string }>> = {
        open: { title: 'Đã mở tuyển tình nguyện viên', body: `Chiến dịch "${campaign.title}" đang nhận đăng ký theo từng ca.` },
        staffed: { title: 'Đã đủ ngưỡng nhân sự tối thiểu', body: `Chiến dịch "${campaign.title}" đã đạt tối thiểu ${readiness.minimumFillPercent}% ở từng ca/vai trò. Bạn có thể tiếp tục tuyển đến hạn.` },
        closed_ready: { title: 'Chiến dịch đủ điều kiện bắt đầu', body: `Chiến dịch "${campaign.title}" đã đạt ngưỡng ${readiness.minimumFillPercent}% ở từng ca/vai trò.` },
        expired_understaffed: { title: 'Hết hạn tuyển nhưng còn thiếu người', body: `Chiến dịch "${campaign.title}" không thể bắt đầu; hãy gia hạn trong giới hạn, dời lịch hoặc huỷ.` },
      };
      const message = messages[next];
      if (message) {
        void this.notifications.notify(campaign.charityReceiver.userId, {
          type: 'campaign', ...message, data: { campaignId, recruitmentStatus: next },
        });
      }
    }
    return next;
  }

  async extendRecruitment(campaignId: string, userId: string, recruitmentEndAt: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'approved') {
      throw new BadRequestException('Chỉ gia hạn tuyển cho chiến dịch đã duyệt và chưa bắt đầu.');
    }
    const nextEnd = new Date(recruitmentEndAt);
    if (nextEnd <= campaign.recruitmentEndAt) {
      throw new BadRequestException('Hạn tuyển mới phải muộn hơn hạn hiện tại.');
    }
    const latest = new Date(campaign.operationStartAt.getTime() - campaign.recruitmentBufferHours * 3600_000);
    if (nextEnd > latest) {
      throw new BadRequestException(
        `Hạn tuyển mới phải cách ca đầu tiên ít nhất ${campaign.recruitmentBufferHours} giờ.`,
      );
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { recruitmentEndAt: nextEnd },
    });
    await this.refreshRecruitmentStatus(campaignId);
    const related = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { campaignId, status: { in: ['pending', 'assigned'] } },
      select: { volunteer: { select: { userId: true } } },
    });
    for (const recipient of new Set(related.map((item) => item.volunteer.userId))) {
      void this.notifications.notify(recipient, {
        type: 'campaign',
        title: 'Chiến dịch đã gia hạn tuyển',
        body: `Chiến dịch "${campaign.title}" đã gia hạn thời gian tuyển. Hãy kiểm tra lại đăng ký và xác nhận ca của bạn.`,
        data: { campaignId, recruitmentEndAt: nextEnd.toISOString() },
      });
    }
    return this.findOne(campaignId);
  }

  /** Tự mở/đóng tuyển và tự bắt đầu đúng giờ. Gọi lặp lại an toàn từ cron. */
  async advanceRecruitmentLifecycle(now = new Date()): Promise<{ refreshed: number; started: number }> {
    const campaigns = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'approved' },
      select: { id: true, operationStartAt: true },
    });
    // Đọc cấu hình MỘT LẦN, NGOÀI transaction — xem chú thích ở
    // getStaffingReadinessWith: query bằng client ngoài trong tx sẽ treo tới khi
    // tx hết hạn (P2028) vì pooler chỉ cấp 1 connection.
    const staffingConfig = await this.readStaffingConfig();
    let refreshed = 0;
    let started = 0;
    for (const campaign of campaigns) {
      await this.refreshRecruitmentStatus(campaign.id, now);
      refreshed += 1;
      if (now < campaign.operationStartAt) continue;
      const didStart = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM kitchen_campaigns WHERE id = ${campaign.id}::uuid FOR UPDATE
        `);
        const current = await tx.kitchenCampaign.findUnique({
          where: { id: campaign.id },
          select: { status: true, operationStartAt: true },
        });
        if (!current || current.status !== 'approved' || now < current.operationStartAt) return false;
        const readiness = await this.getStaffingReadinessWith(tx, campaign.id, staffingConfig);
        if (!readiness.eligibleToStart) {
          await tx.kitchenCampaign.update({
            where: { id: campaign.id },
            data: { recruitmentStatus: 'expired_understaffed' },
          });
          return false;
        }
        // Đạt ngưỡng admin nhưng chưa đủ 100%: chờ tổ chức xác nhận bắt đầu thủ
        // công. Chỉ trường hợp đủ toàn bộ định biên mới tự động bắt đầu.
        if (!readiness.ready) {
          await tx.kitchenCampaign.update({
            where: { id: campaign.id },
            data: { recruitmentStatus: 'closed_ready' },
          });
          return false;
        }
        await tx.kitchenCampaign.update({
          where: { id: campaign.id },
          data: { status: 'in_progress', recruitmentStatus: 'closed_ready' },
        });
        return true;
      });
      if (didStart) {
        started += 1;
        const startedCampaign = await this.prisma.kitchenCampaign.findUnique({
          where: { id: campaign.id },
          select: {
            title: true,
            charityReceiver: { select: { userId: true } },
            assignments: {
              where: { confirmationStatus: 'confirmed', status: 'assigned' },
              select: { volunteer: { select: { userId: true } } },
            },
          },
        });
        if (startedCampaign) {
          const recipients = new Set([
            startedCampaign.charityReceiver.userId,
            ...startedCampaign.assignments.map((a) => a.volunteer.userId),
          ]);
          for (const recipient of recipients) {
            void this.notifications.notify(recipient, {
              type: 'campaign',
              title: 'Chiến dịch đã bắt đầu',
              body: `Chiến dịch "${startedCampaign.title}" đã tự động bắt đầu đúng lịch.`,
              data: { campaignId: campaign.id, status: 'in_progress', auto: true },
            });
          }
        }
      }
    }
    return { refreshed, started };
  }

  /** Tổ chức xác nhận bắt đầu khi đã tới lịch và từng ca/vai trò đạt ngưỡng admin. */
  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'approved') {
      throw new BadRequestException('Chỉ chiến dịch đã duyệt và chưa bắt đầu mới thực hiện được.');
    }
    const readiness = await this.getStaffingReadiness(campaignId);
    if (!readiness.eligibleToStart) {
      throw new BadRequestException(
        `Mỗi ca/vai trò phải đạt tối thiểu ${readiness.minimumFillPercent}% nhân sự đã xác nhận.`,
      );
    }
    const allowEarlyStart = (await this.systemConfig.getNumber('CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN')) === 1;
    if (!allowEarlyStart && new Date() < campaign.operationStartAt) {
      throw new BadRequestException('Chưa tới thời gian vận hành của chiến dịch.');
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { status: 'in_progress', recruitmentStatus: 'closed_ready' },
    });
    const recipients = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { campaignId, confirmationStatus: 'confirmed', status: 'assigned' },
      select: { volunteer: { select: { userId: true } } },
    });
    for (const recipient of new Set([userId, ...recipients.map((item) => item.volunteer.userId)])) {
      void this.notifications.notify(recipient, {
        type: 'campaign',
        title: 'Chiến dịch đã bắt đầu',
        body: `Chiến dịch "${campaign.title}" đã được tổ chức xác nhận bắt đầu.`,
        data: { campaignId, status: 'in_progress', auto: false },
      });
    }
    return this.findOne(campaignId);
  }

  /** Tỉ lệ lấp đầy nhân sự của một chiến dịch (làm tròn xuống). */
  private campaignFillRate(c: CampaignSlots): { filled: number; needed: number; percent: number } {
    const needed = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
    const filled = c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
    return {
      filled,
      needed,
      // Không cần tuyển ai thì coi như đủ 100% — nếu trả 0 sẽ chặn nhầm chiến dịch
      // vốn không cần TNV nào.
      percent: needed > 0 ? Math.floor((filled / needed) * 100) : 100,
    };
  }

  /**
   * Tổ chức huỷ chiến dịch trước khi bắt đầu.
   *
   * Huỷ KHÔNG chỉ là đổi status: mọi đăng ký TNV và khoản quyên góp đang treo phải
   * được đóng lại và báo cho người liên quan. Trước đây chỉ đổi mỗi status nên TNV
   * đã xác nhận ca vẫn thấy việc trong "Việc của tôi", vẫn bị tính là bận (không
   * đăng ký được ca chiến dịch khác vì trùng giờ), và NCC vẫn giữ hàng chờ giao.
   */
  async cancelCampaign(campaignId: string, userId: string, reason?: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (!['pending_approval', 'approved'].includes(campaign.status)) {
      throw new BadRequestException('Chỉ huỷ được chiến dịch chưa bắt đầu.');
    }
    const cancelReason = reason?.trim();
    const reasonSuffix = cancelReason ? ` Lý do: ${cancelReason}` : '';

    const { volunteerUserIds, providerUserIds } = await this.prisma.$transaction(async (tx) => {
      const affectedAssignments = await tx.campaignVolunteerAssignment.findMany({
        where: { campaignId, status: { in: ['pending', 'assigned'] } },
        select: { id: true, volunteer: { select: { userId: true } } },
      });
      const affectedDonations = await tx.campaignDonation.findMany({
        where: { campaignId, status: 'pledged' },
        select: { id: true, provider: { select: { userId: true } } },
      });

      await tx.kitchenCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'cancelled',
          recruitmentStatus: 'closed_ready',
          ...(cancelReason ? { notes: `Tổ chức huỷ: ${cancelReason}` } : {}),
        },
      });
      if (affectedAssignments.length > 0) {
        await tx.campaignVolunteerAssignment.updateMany({
          where: { id: { in: affectedAssignments.map((a) => a.id) } },
          data: { status: 'cancelled', confirmationStatus: 'declined', confirmedAt: null },
        });
      }
      if (affectedDonations.length > 0) {
        await tx.campaignDonation.updateMany({
          where: { id: { in: affectedDonations.map((d) => d.id) } },
          data: { status: 'cancelled' },
        });
      }
      // Chiến dịch đã đóng: bộ đếm slot về 0 để không còn bản ghi nào "treo" chỗ.
      await tx.kitchenCampaign.update({
        where: { id: campaignId },
        data: { chefSlotsFilled: 0, waiterSlotsFilled: 0, shipperSlotsFilled: 0 },
      });
      await tx.campaignShift.updateMany({ where: { campaignId }, data: { slotsFilled: 0 } });

      return {
        volunteerUserIds: [...new Set(affectedAssignments.map((a) => a.volunteer.userId))],
        providerUserIds: [...new Set(affectedDonations.map((d) => d.provider.userId))],
      };
    });

    for (const volunteerUserId of volunteerUserIds) {
      void this.notifications.notify(volunteerUserId, {
        type: 'campaign',
        title: 'Chiến dịch đã bị huỷ',
        body: `Chiến dịch "${campaign.title}" đã bị tổ chức huỷ. Ca bạn đăng ký được gỡ khỏi lịch, bạn không cần đến bếp.${reasonSuffix}`,
        data: { campaignId, status: 'cancelled' },
      });
    }
    for (const providerUserId of providerUserIds) {
      void this.notifications.notify(providerUserId, {
        type: 'campaign',
        title: 'Chiến dịch đã bị huỷ',
        body: `Chiến dịch "${campaign.title}" đã bị huỷ. Khoản quyên góp bạn đăng ký được đóng lại, bạn không cần chuẩn bị hàng.${reasonSuffix}`,
        data: { campaignId, status: 'cancelled' },
      });
    }

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

    /** Số phút điểm danh trễ — chỉ tính ở bước check-in. */
    let lateMinutes = 0;
    const hasLng = location.lng !== undefined;
    const hasLat = location.lat !== undefined;
    if (hasLng !== hasLat) {
      throw new BadRequestException('Cần cả kinh độ và vĩ độ khi điểm danh.');
    }
    if (next === 'checked_in') {
      const allowEarly = (await this.systemConfig.getNumber('CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN')) === 1;
      lateMinutes = this.evaluateCheckInWindow(a.campaign, a.shift, a.role, a.workDate, allowEarly).lateMinutes;

      // Kiểm tra vị trí: bán kính lấy từ `system_configs` để admin bật/tắt được.
      // Trước đây khối này bị comment kèm "TODO: bỏ comment khi deploy" — nghĩa là
      // điểm danh từ nhà vẫn qua, trong khi mọi bằng chứng phía sau (ảnh nguyên liệu,
      // số kg, đợt phát) đều dựng trên giả định "đã điểm danh = đã có mặt".
      // Đặt CHECKIN_GPS_RADIUS_M = 0 để tắt hẳn khi chạy demo / máy không có GPS.
      const radiusM = await this.systemConfig.getNumber('CHECKIN_GPS_RADIUS_M');
      if (radiusM > 0) {
        if (!hasLng || !hasLat) {
          throw new BadRequestException('Cần vị trí GPS để điểm danh tại bếp.');
        }
        const [kitchen] = await this.prisma.$queryRaw<{ within_radius: boolean | null }[]>(Prisma.sql`
          SELECT ST_DWithin(
            kitchen_location,
            ST_SetSRID(ST_MakePoint(${location.lng!}, ${location.lat!}), 4326)::geography,
            ${radiusM}
          ) AS within_radius
          FROM kitchen_campaigns
          WHERE id = ${a.campaignId}::uuid
        `);
        // `within_radius` null = bếp chưa có toạ độ. Chặn ở đây là phạt TNV vì lỗi
        // khai thiếu của tổ chức, nên cho qua và ghi log.
        if (kitchen?.within_radius === null) {
          this.logger.warn(
            `Chiến dịch ${a.campaignId} chưa có toạ độ bếp — bỏ qua kiểm tra GPS khi điểm danh.`,
          );
        } else if (!kitchen?.within_radius) {
          throw new BadRequestException(
            `Bạn cần ở trong phạm vi ${radiusM} m quanh bếp để điểm danh.`,
          );
        }
      }
    }

    const data: Prisma.CampaignVolunteerAssignmentUpdateInput = { status: next as never };
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

        // Notify charity: TNV đã điểm danh cho campaign
        const campaign = await tx.kitchenCampaign.findUnique({
          where: { id: a.campaignId },
          select: { title: true, charityReceiver: { select: { userId: true } } },
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
      const configured = await this.systemConfig.getNumber('CHECKIN_LATE_PENALTY');
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
            `Bạn điểm danh trễ ${formatLateness(lateMinutes)} (ân hạn ${grace} phút) `
            + `nên bị trừ ${configured} điểm uy tín. Lần sau hãy tới đúng giờ nhé.`,
          data: { campaignId: a.campaignId, lateMinutes, penalty: configured },
        });
      }
    }

    return { id: assignmentId, status: next, lateMinutes, penalty };
  }

  /** Nhà cung cấp quyên góp nguyên liệu cho chiến dịch (đang tuyển/đang diễn ra). */
  async pledgeDonation(campaignId: string, providerUserId: string, dto: { itemName: string; quantity: number; unit?: string; note?: string }) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: providerUserId },
      select: {
        id: true,
        businessName: true,
        verificationStatus: true,
        isVerified: true,
        user: { select: { status: true } },
      },
    });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');
    if (provider.user.status !== 'active' || provider.verificationStatus !== 'approved' || !provider.isVerified) {
      throw new ForbiddenException('Nhà cung cấp cần được duyệt và đang hoạt động trước khi quyên góp.');
    }

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: {
        charityReceiver: { select: { userId: true } },
        donations: {
          select: { itemName: true, quantity: true, status: true, providerId: true },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    this.ensureCampaignCanReceiveFood(campaign);
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
    const duplicate = campaign.donations.find(
      (d) => d.providerId === provider.id && d.status === 'pledged' && this.normalizeSupplyKey(d.itemName) === target.key,
    );
    if (duplicate) {
      throw new BadRequestException(
        `Bạn đã có cam kết ${target.name} đang chờ tổ chức xác nhận. Hãy chờ xác nhận trước khi gửi thêm.`,
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
      body:
        `${provider.businessName} đã hứa góp ${quantity} ${target.unit} ${target.name} `
        + `cho chiến dịch "${campaign.title}". Còn thiếu sau cam kết: `
        + `${this.roundQuantity(Math.max(0, remaining - quantity))} ${target.unit}. `
        + 'Vui lòng xác nhận khi đã nhận hàng.',
      data: { campaignId, donationId: donation.id, status: 'pledged', itemName: target.name, quantity, unit: target.unit },
    });

    return this.findOne(campaignId);
  }

  /**
   * Lịch sử NHẬN NGUYÊN LIỆU của tổ chức, nhóm theo từng chiến dịch.
   *
   * Tab "Lịch sử đơn" trước đây nhúng trang lịch sử đặt chỗ của người nhận cá nhân —
   * tổ chức từ thiện không đặt chỗ mà nhận hàng qua quyên góp / yêu cầu NCC, nên tab
   * luôn rỗng và mọi chỉ số đều bằng 0.
   */
  async getMyIntakeHistory(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true, isCharityOrg: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    if (!receiver.isCharityOrg) {
      throw new ForbiddenException('Chỉ tổ chức từ thiện mới xem được lịch sử nhận nguyên liệu.');
    }

    const donations = await this.prisma.campaignDonation.findMany({
      where: { campaign: { charityReceiverId: receiver.id }, status: 'received' },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        itemName: true,
        quantity: true,
        note: true,
        receivedAt: true,
        campaign: { select: { id: true, title: true, scheduledDate: true, status: true } },
        provider: { select: { businessName: true, address: true, contactPhone: true } },
      },
    });

    // Gom theo chiến dịch — tổ chức nhìn theo "chiến dịch nào đã nhận những gì".
    const byCampaign = new Map<string, {
      campaignId: string;
      campaignTitle: string;
      scheduledDate: Date;
      campaignStatus: string;
      items: Array<{
        id: string;
        itemName: string;
        quantity: string | null;
        note: string | null;
        receivedAt: Date | null;
        providerName: string;
        providerAddress: string | null;
        providerPhone: string | null;
      }>;
    }>();

    for (const d of donations) {
      const entry = byCampaign.get(d.campaign.id) ?? {
        campaignId: d.campaign.id,
        campaignTitle: d.campaign.title,
        scheduledDate: d.campaign.scheduledDate,
        campaignStatus: d.campaign.status,
        items: [],
      };
      entry.items.push({
        id: d.id,
        itemName: d.itemName,
        quantity: d.quantity,
        note: d.note,
        receivedAt: d.receivedAt,
        providerName: d.provider.businessName,
        providerAddress: d.provider.address,
        providerPhone: d.provider.contactPhone,
      });
      byCampaign.set(d.campaign.id, entry);
    }

    const campaigns = [...byCampaign.values()];
    return {
      campaigns,
      summary: {
        totalItems: donations.length,
        totalCampaigns: campaigns.length,
        // Số NCC khác nhau đã từng giao hàng cho tổ chức này.
        totalProviders: new Set(donations.map((d) => d.provider.businessName)).size,
      },
    };
  }

  /** Tổ chức xác nhận đã nhận nguyên liệu quyên góp (pledged → received). */
  async confirmDonation(donationId: string, charityUserId: string, dto: { note?: string } = {}) {
    const donation = await this.prisma.campaignDonation.findUnique({
      where: { id: donationId },
      include: {
        campaign: { select: { id: true, charityReceiverId: true, title: true, status: true } },
        provider: { select: { userId: true, businessName: true } },
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
    // Cùng lý do như phân công: lô đi kèm đơn nguyên liệu được chốt một lần khi tổ chức
    // xác nhận nhận chuyến, không xác nhận lần hai ở đây.
    if (donation.providerRequestId) {
      throw new BadRequestException(
        'Khoản này đi cùng đơn nguyên liệu từ NCC — xác nhận số kg thực nhận ngay trên đơn đó.',
      );
    }
    // Chiến dịch đã huỷ/kết thúc thì không xác nhận nhận hàng được nữa — pledgeDonation
    // đã chặn ở đầu vào (ensureCampaignCanReceiveFood) nhưng nhánh xác nhận thì chưa.
    if (!['approved', 'in_progress'].includes(donation.campaign.status)) {
      throw new BadRequestException('Chiến dịch đã huỷ hoặc đã kết thúc — không xác nhận nhận nguyên liệu được nữa.');
    }

    const note = dto.note?.trim();
    await this.prisma.campaignDonation.update({
      where: { id: donationId },
      data: {
        status: 'received',
        receivedAt: new Date(),
        note: note ? [donation.note, `Xác nhận nhận hàng: ${note}`].filter(Boolean).join('\n') : donation.note,
      },
    });

    void this.notifications.notify(donation.provider.userId, {
      type: 'campaign',
      title: 'Quyên góp đã được nhận',
      body:
        `Tổ chức đã xác nhận nhận ${donation.quantity ?? ''} ${donation.itemName} `
        + `cho chiến dịch "${donation.campaign.title}".`
        + (note ? ` Ghi chú: ${note}` : ' Cảm ơn bạn!'),
      data: { campaignId: donation.campaign.id, donationId, status: 'received' },
    });

    return { id: donationId, status: 'received' };
  }

  /**
   * Tổ chức phân công SHIPPER đi nhận khoản quyên góp đã hứa của NCC — nhận được
   * NHIỀU shipper cùng lúc (hàng nặng/cồng kềnh cần vài người đi cùng).
   *
   * RÀNG BUỘC (chống lệch lịch): chỉ nhận vai trò Giao hàng; TỪNG shipper phải
   * trực đúng NGÀY và ca phải phủ TRỌN khung giờ lấy hàng — server validate lại
   * dù FE đã lọc, vì dữ liệu ca có thể đổi giữa lúc mở form và lúc bấm gửi.
   */
  async assignDonationPickup(
    donationId: string,
    charityUserId: string,
    dto: { assignmentIds: string[]; pickupDate: string; pickupStartTime: string; pickupEndTime: string },
  ) {
    const donation = await this.prisma.campaignDonation.findUnique({
      where: { id: donationId },
      include: {
        campaign: { select: { id: true, charityReceiverId: true, title: true } },
        provider: { select: { businessName: true, address: true, contactPhone: true } },
      },
    });
    if (!donation) throw new NotFoundException('Không tìm thấy khoản quyên góp.');

    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true },
    });
    if (!receiver || donation.campaign.charityReceiverId !== receiver.id) {
      throw new ForbiddenException('Chỉ tổ chức chủ chiến dịch mới phân công được.');
    }
    // Khoản sinh ra từ đơn nguyên liệu dùng CHUNG chuyến với đơn đó. Cho phân công
    // riêng ở đây thì tổ chức có thể cử hai shipper khác nhau đi lấy cùng một lô.
    if (donation.providerRequestId) {
      throw new BadRequestException(
        'Khoản này đi cùng đơn nguyên liệu từ NCC — hãy phân công shipper ở mục "Đơn nguyên liệu từ NCC".',
      );
    }
    if (donation.status !== 'pledged') {
      throw new BadRequestException('Chỉ phân công đi nhận khi khoản góp đang chờ nhận hàng.');
    }

    const assignmentIds = [...new Set(dto.assignmentIds)];
    const currentIds = Array.isArray(donation.pickupAssigneeIds)
      ? (donation.pickupAssigneeIds as string[])
      : [];
    // Idempotent: cùng lịch + cùng danh sách shipper → không ghi lại, không notify
    // lần nữa (chặn double-click / bấm phân công nhiều lần gây spam thông báo).
    const scheduleUnchanged =
      donation.pickupDate?.toISOString().slice(0, 10) === dto.pickupDate &&
      donation.pickupStartTime === dto.pickupStartTime &&
      donation.pickupEndTime === dto.pickupEndTime;
    if (
      scheduleUnchanged &&
      currentIds.length === assignmentIds.length &&
      assignmentIds.every((id) => currentIds.includes(id))
    ) {
      return {
        id: donationId,
        pickupDate: donation.pickupDate,
        pickupStartTime: donation.pickupStartTime,
        pickupEndTime: donation.pickupEndTime,
        pickupAssigneeIds: assignmentIds,
        unchanged: true,
      };
    }

    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { id: { in: assignmentIds } },
      include: {
        shift: { select: { label: true, startTime: true, endTime: true, endDayOffset: true } },
        volunteer: { select: { userId: true, user: { select: { fullName: true } } } },
      },
    });
    if (assignments.length !== assignmentIds.length) {
      throw new NotFoundException('Có phân công TNV không tồn tại.');
    }

    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const pickupStart = toMinutes(dto.pickupStartTime);
    let pickupEnd = toMinutes(dto.pickupEndTime);
    if (pickupEnd <= pickupStart) pickupEnd += 1440;

    for (const assignment of assignments) {
      const name = assignment.volunteer.user.fullName;
      if (assignment.campaignId !== donation.campaign.id) {
        throw new BadRequestException(`${name} không thuộc chiến dịch này.`);
      }
      // Đi nhận hàng là việc VẬN HÀNH (giao hàng hoặc phục vụ) — chỉ đầu bếp phải ở bếp.
      if (!OPS_ROLES.includes(assignment.role as (typeof OPS_ROLES)[number])) {
        throw new BadRequestException(`${name} đang trực ca Đầu bếp — không phân công đi nhận hàng được.`);
      }
      if (!['assigned', 'checked_in', 'in_progress'].includes(assignment.status)) {
        throw new BadRequestException(`${name} chưa được duyệt vào ca (hoặc đã kết thúc), không thể phân công.`);
      }
      if (!assignment.shift || !assignment.workDate) {
        throw new BadRequestException(`Phân công của ${name} chưa gắn ca/ngày trực cụ thể.`);
      }
      const workDateKey = assignment.workDate.toISOString().slice(0, 10);
      if (workDateKey !== dto.pickupDate) {
        throw new BadRequestException(
          `${name} trực ngày ${workDateKey}, không trùng ngày lấy hàng ${dto.pickupDate}.`,
        );
      }
      // Khung lấy hàng phải nằm trọn trong ca (ca tối có thể vắt qua 00:00)
      const shiftStart = toMinutes(assignment.shift.startTime);
      const shiftEnd = toMinutes(assignment.shift.endTime) + (assignment.shift.endDayOffset ?? 0) * 1440;
      if (pickupStart < shiftStart || pickupEnd > shiftEnd) {
        throw new BadRequestException(
          `Khung giờ lấy hàng phải nằm trong ca "${assignment.shift.label}" `
          + `(${assignment.shift.startTime}-${assignment.shift.endTime}) của ${name}.`,
        );
      }
    }

    const updated = await this.prisma.campaignDonation.update({
      where: { id: donationId },
      data: {
        pickupDate: new Date(`${dto.pickupDate}T00:00:00Z`),
        pickupStartTime: dto.pickupStartTime,
        pickupEndTime: dto.pickupEndTime,
        pickupAssigneeIds: assignmentIds,
      },
      select: {
        id: true,
        pickupDate: true,
        pickupStartTime: true,
        pickupEndTime: true,
        pickupAssigneeIds: true,
      },
    });

    // Lịch không đổi → chỉ báo shipper MỚI; lịch đổi → báo lại tất cả để cập nhật giờ.
    for (const assignment of assignments) {
      if (scheduleUnchanged && currentIds.includes(assignment.id)) continue;
      void this.notifications.notify(assignment.volunteer.userId, {
        type: 'campaign',
        title: 'Bạn được phân công đi nhận quyên góp',
        body:
          `Nhận ${donation.quantity ?? ''} ${donation.itemName} từ ${donation.provider.businessName} `
          + `cho chiến dịch "${donation.campaign.title}" — ${dto.pickupDate} `
          + `${dto.pickupStartTime}-${dto.pickupEndTime} (trong ca "${assignment.shift!.label}").`
          + (assignments.length > 1 ? ` Đi cùng ${assignments.length - 1} shipper khác.` : '')
          + (donation.provider.address ? ` Địa chỉ NCC: ${donation.provider.address}.` : '')
          + (donation.provider.contactPhone ? ` SĐT: ${donation.provider.contactPhone}.` : ''),
        data: { campaignId: donation.campaign.id, donationId, assignmentId: assignment.id },
      });
    }

    // Shipper bị rút khỏi danh sách → báo hủy để không đi nhận nhầm.
    const removedIds = currentIds.filter((id) => !assignmentIds.includes(id));
    if (removedIds.length > 0) {
      const removed = await this.prisma.campaignVolunteerAssignment.findMany({
        where: { id: { in: removedIds } },
        select: { id: true, volunteer: { select: { userId: true } } },
      });
      for (const assignment of removed) {
        void this.notifications.notify(assignment.volunteer.userId, {
          type: 'campaign',
          title: 'Hủy phân công đi nhận quyên góp',
          body:
            `Bạn không còn được phân công đi nhận ${donation.itemName} từ `
            + `${donation.provider.businessName} cho chiến dịch "${donation.campaign.title}".`,
          data: { campaignId: donation.campaign.id, donationId, assignmentId: assignment.id },
        });
      }
    }

    return updated;
  }

  /**
   * Tổ chức phân công SHIPPER CỦA CHIẾN DỊCH đi nhận ĐƠN NGUYÊN LIỆU đã được NCC
   * chấp nhận — thay cho vòng tìm shipper toàn hệ thống (ride-hailing).
   *
   * Khung giờ lấy dùng đúng lịch hẹn đã chốt trên đơn (scheduledDate +
   * pickupStartTime/EndTime); TỪNG shipper phải trực đúng ngày và ca phủ trọn
   * khung giờ đó. Nếu vòng tìm shipper hệ thống còn đang chạy thì DỪNG nó lại —
   * hai luồng cùng đi lấy một đơn sẽ giẫm chân nhau.
   */
  async assignRequestPickup(requestId: string, charityUserId: string, dto: { assignmentIds: string[] }) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: charityUserId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ tổ chức.');

    const request = await this.prisma.campaignProviderRequest.findUnique({
      where: { id: requestId },
      include: {
        campaign: { select: { id: true, title: true } },
        provider: { select: { businessName: true, address: true, contactPhone: true } },
        transport: { select: { id: true, status: true, deliveryId: true } },
      },
    });
    if (!request || request.receiverId !== receiver.id) {
      throw new NotFoundException('Không tìm thấy đơn yêu cầu của tổ chức.');
    }
    if (request.status !== 'accepted') {
      throw new BadRequestException('Chỉ phân công khi NCC đã chấp nhận đơn.');
    }
    if (!request.scheduledDate || !request.pickupStartTime || !request.pickupEndTime) {
      throw new BadRequestException('Đơn chưa có lịch hẹn lấy hàng để đối chiếu ca trực.');
    }

    const pickupDateKey = request.scheduledDate.toISOString().slice(0, 10);
    const pickupStartStr = request.pickupStartTime.slice(0, 5);
    const pickupEndStr = request.pickupEndTime.slice(0, 5);

    const assignmentIds = [...new Set(dto.assignmentIds)];
    const currentIds = Array.isArray(request.pickupAssigneeIds)
      ? (request.pickupAssigneeIds as string[])
      : [];
    // Idempotent: danh sách không đổi → không ghi lại, không notify lần nữa
    // (chặn double-click / gửi trùng gây spam thông báo cho shipper).
    if (
      currentIds.length === assignmentIds.length &&
      assignmentIds.every((id) => currentIds.includes(id))
    ) {
      return { id: requestId, pickupAssigneeIds: assignmentIds, unchanged: true };
    }
    const assignments = await this.prisma.campaignVolunteerAssignment.findMany({
      where: { id: { in: assignmentIds } },
      include: {
        shift: { select: { label: true, startTime: true, endTime: true, endDayOffset: true } },
        volunteer: { select: { userId: true, user: { select: { fullName: true } } } },
      },
    });
    if (assignments.length !== assignmentIds.length) {
      throw new NotFoundException('Có phân công TNV không tồn tại.');
    }

    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    const pickupStart = toMinutes(pickupStartStr);
    let pickupEnd = toMinutes(pickupEndStr);
    if (pickupEnd <= pickupStart) pickupEnd += 1440;

    for (const assignment of assignments) {
      const name = assignment.volunteer.user.fullName;
      if (assignment.campaignId !== request.campaign.id) {
        throw new BadRequestException(`${name} không thuộc chiến dịch này.`);
      }
      if (!OPS_ROLES.includes(assignment.role as (typeof OPS_ROLES)[number])) {
        throw new BadRequestException(`${name} đang trực ca Đầu bếp — không phân công đi nhận hàng được.`);
      }
      if (!['assigned', 'checked_in', 'in_progress'].includes(assignment.status)) {
        throw new BadRequestException(`${name} chưa được duyệt vào ca (hoặc đã kết thúc), không thể phân công.`);
      }
      if (!assignment.shift || !assignment.workDate) {
        throw new BadRequestException(`Phân công của ${name} chưa gắn ca/ngày trực cụ thể.`);
      }
      const workDateKey = assignment.workDate.toISOString().slice(0, 10);
      if (workDateKey !== pickupDateKey) {
        throw new BadRequestException(
          `${name} trực ngày ${workDateKey}, không trùng ngày lấy hàng ${pickupDateKey}.`,
        );
      }
      const shiftStart = toMinutes(assignment.shift.startTime);
      const shiftEnd = toMinutes(assignment.shift.endTime) + (assignment.shift.endDayOffset ?? 0) * 1440;
      if (pickupStart < shiftStart || pickupEnd > shiftEnd) {
        throw new BadRequestException(
          `Khung giờ lấy hàng (${pickupStartStr}-${pickupEndStr}) phải nằm trong ca `
          + `"${assignment.shift.label}" (${assignment.shift.startTime}-${assignment.shift.endTime}) của ${name}.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.campaignProviderRequest.update({
        where: { id: requestId },
        data: { pickupAssigneeIds: assignmentIds },
      });
      // Vòng tìm shipper hệ thống còn chạy → dừng lại, tránh 2 luồng cùng đi lấy.
      if (request.transport && request.transport.status === 'pending' && request.transport.deliveryId) {
        await tx.shipperTaskOffer.updateMany({
          where: { deliveryId: request.transport.deliveryId, status: 'pending' },
          data: { status: 'expired', respondedAt: new Date() },
        });
        await tx.delivery.updateMany({
          where: { id: request.transport.deliveryId, status: 'pending_assignment' },
          data: { status: 'failed', failedReason: 'Tổ chức đã tự phân công shipper của chiến dịch đi nhận.' },
        });
        await tx.campaignTransport.update({
          where: { id: request.transport.id },
          data: { status: 'cancelled', failureReason: 'Tổ chức đã tự phân công shipper của chiến dịch đi nhận.' },
        });
      }
    });

    // Chỉ báo cho shipper MỚI được thêm — người giữ nguyên không bị notify lặp.
    for (const assignment of assignments) {
      if (currentIds.includes(assignment.id)) continue;
      void this.notifications.notify(assignment.volunteer.userId, {
        type: 'campaign',
        title: 'Bạn được phân công đi nhận nguyên liệu',
        body:
          `Nhận nguyên liệu từ ${request.provider.businessName} cho chiến dịch `
          + `"${request.campaign.title}" — ${pickupDateKey} ${pickupStartStr}-${pickupEndStr} `
          + `(trong ca "${assignment.shift!.label}").`
          + (assignments.length > 1 ? ` Đi cùng ${assignments.length - 1} shipper khác.` : '')
          + (request.provider.address ? ` Địa chỉ NCC: ${request.provider.address}.` : '')
          + (request.provider.contactPhone ? ` SĐT: ${request.provider.contactPhone}.` : ''),
        data: { campaignId: request.campaign.id, providerRequestId: requestId, assignmentId: assignment.id },
      });
    }

    // Shipper bị rút khỏi danh sách → báo hủy để không đi nhận nhầm.
    const removedIds = currentIds.filter((id) => !assignmentIds.includes(id));
    if (removedIds.length > 0) {
      const removed = await this.prisma.campaignVolunteerAssignment.findMany({
        where: { id: { in: removedIds } },
        select: { id: true, volunteer: { select: { userId: true } } },
      });
      for (const assignment of removed) {
        void this.notifications.notify(assignment.volunteer.userId, {
          type: 'campaign',
          title: 'Hủy phân công đi nhận nguyên liệu',
          body:
            `Bạn không còn được phân công đi nhận nguyên liệu từ ${request.provider.businessName} `
            + `cho chiến dịch "${request.campaign.title}" (${pickupDateKey} ${pickupStartStr}-${pickupEndStr}).`,
          data: { campaignId: request.campaign.id, providerRequestId: requestId, assignmentId: assignment.id },
        });
      }
    }

    return { id: requestId, pickupAssigneeIds: assignmentIds };
  }

  /**
   * Tổ chức gửi YÊU CẦU thay đổi chiến dịch (giờ/ngày, địa chỉ+vị trí, số slot TNV).
   * Không áp dụng ngay — tạo bản ghi chờ admin duyệt. Chỉ cho gửi khi còn ≥ ngưỡng
   * CAMPAIGN_CHANGE_LOCK_DAYS ngày tới ngày diễn ra, và mỗi chiến dịch chỉ 1 yêu cầu pending.
   */
  async submitChangeRequest(campaignId: string, userId: string, dto: SubmitCampaignChangeDto) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'approved') {
      throw new BadRequestException('Chỉ chiến dịch đã duyệt và chưa bắt đầu mới gửi được yêu cầu thay đổi.');
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
    // Ngày bắt đầu/kết thúc SAU thay đổi phải hợp lệ. So bằng chuỗi YYYY-MM-DD để
    // không dính lệch múi giờ. Trước đây chỉ kiểm khi có endDate, nên dời riêng ngày
    // bắt đầu ra sau ngày kết thúc cũ vẫn lọt: admin duyệt xong là chiến dịch có
    // operationEnd < operationStart và cron auto-complete ngay lập tức.
    const nextStartKey = (dto.scheduledDate ?? this.toDateKey(campaign.scheduledDate)).slice(0, 10);
    const nextEndKey = (
      dto.endDate ?? this.toDateKey(campaign.endDate ?? campaign.scheduledDate)
    ).slice(0, 10);
    if (nextEndKey < nextStartKey) {
      throw new BadRequestException(
        dto.endDate
          ? 'Ngày kết thúc phải >= ngày bắt đầu.'
          : `Ngày bắt đầu mới (${nextStartKey}) vượt quá ngày kết thúc hiện tại (${nextEndKey}). Hãy đề xuất cả ngày kết thúc mới.`,
      );
    }

    // Ràng buộc báo trước cũng phải áp ở đây: tạo chiến dịch 1 ngày cho ngày mai rồi
    // xin kéo dài thành 3 ngày là lách được đúng luật vừa đặt ở lúc tạo.
    await this.assertLeadTime(nextStartKey, nextEndKey);

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

    const [kitchen] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
      Prisma.sql`
        SELECT ST_X(kitchen_location::geometry) AS lng, ST_Y(kitchen_location::geometry) AS lat
        FROM kitchen_campaigns WHERE id = ${campaignId}::uuid
      `,
    );
    // Chiến dịch chưa ghim toạ độ bếp thì không có gốc để đo khoảng cách — trả rỗng
    // kèm cờ để FE hiện lời nhắc thay vì im lặng như thể không có NCC nào.
    if (kitchen?.lng == null || kitchen.lat == null) {
      return { radiusKm, kitchen: null, matches: [], reason: 'NO_KITCHEN_LOCATION' as const };
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
        totalRemaining: r.total_remaining != null ? Number(r.total_remaining) : 0,
        // Chỉ cộng được kg của tin đã khai `weight_per_unit_kg`; tin thiếu cân nặng
        // đóng góp 0 nên con số này là CẬN DƯỚI, FE phải nói rõ "ước tính tối thiểu".
        estimatedKg: r.total_kg != null ? Math.round(Number(r.total_kg) * 10) / 10 : 0,
        lng: Number(r.lng),
        lat: Number(r.lat),
      })),
    };
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
      throw new BadRequestException('Giờ kết thúc nhận hàng phải sau giờ bắt đầu.');
    }
    // Ngày cần nhận không được ở quá khứ (so theo ngày VN).
    if (dto.demandDetails?.neededDate) {
      const todayVn = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      if (dto.demandDetails.neededDate < todayVn) {
        throw new BadRequestException('Ngày cần nhận nguyên liệu không được ở quá khứ.');
      }
    }

    // Đóng dấu thời điểm cam kết để sau này còn đối chiếu khi có tranh chấp.
    const demandDetails = dto.demandDetails
      ? { ...dto.demandDetails, waiverAcceptedAt: new Date().toISOString() }
      : undefined;

    const orgName = receiver.user.fullName;
    const providerName = provider.providerProfile.businessName ?? provider.fullName;

    // CHỈ ghi đè khi đơn cũ còn PENDING (gửi lại = sửa lời đề nghị đang chờ).
    // Trước đây upsert theo (campaignId, providerId) bất kể trạng thái: đặt gạo xong
    // quay lại đặt thêm thịt từ CÙNG một NCC là đơn gạo bị ghi đè mất — một chiến
    // dịch vì thế chỉ đặt được đúng một món từ mỗi nhà cung cấp.
    const campaignId = dto.campaignId ?? '00000000-0000-0000-0000-000000000000';
    const existing = await this.prisma.campaignProviderRequest.findFirst({
      where: { campaignId, providerId: provider.providerProfile.id, status: 'pending' },
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
            demandDetails: (demandDetails ?? Prisma.DbNull) as Prisma.InputJsonValue,
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
            demandDetails: (demandDetails ?? Prisma.DbNull) as Prisma.InputJsonValue,
          },
        });

    // Gửi notification cho provider — nêu rõ món + số kg để NCC không phải mở app
    // mới biết đơn hỏi gì (một chiến dịch giờ có thể gửi nhiều đơn tới cùng NCC).
    const askedItem = dto.demandDetails?.ingredientName
      ? `${dto.demandDetails.ingredientName}${dto.demandDetails.quantityKg ? ` (${dto.demandDetails.quantityKg} kg)` : ''}`
      : null;
    await this.notifications.notify(provider.id, {
      type: 'provider_request',
      title: askedItem ? `Yêu cầu nguyên liệu: ${askedItem}` : 'Yêu cầu hợp tác mới',
      body: `Tổ chức "${orgName}" muốn hợp tác cung cấp thực phẩm cho chiến dịch.${
        askedItem ? ` Món cần: ${askedItem}.` : ''
      }${dto.message ? ` Ghi chú: ${dto.message}` : ''}`,
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
        // Kèm biên nhận để NCC thấy bếp đã xác nhận nhận bao nhiêu (giao thành công)
        transport: {
          select: {
            id: true,
            status: true,
            deliveryId: true,
            receivedAt: true,
            receiptNote: true,
            failureReason: true,
          },
        },
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
      select: {
        id: true,
        businessName: true,
        address: true,
        verificationStatus: true,
        isVerified: true,
        user: { select: { status: true } },
      },
    });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ provider.');
    if (profile.user.status !== 'active' || profile.verificationStatus !== 'approved' || !profile.isVerified) {
      throw new ForbiddenException('Nhà cung cấp cần được duyệt và đang hoạt động trước khi phản hồi yêu cầu.');
    }

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
      status: string;
      endDate: Date | null;
      kitchenAddress: string;
      kitchenLng: number;
      kitchenLat: number;
      supplyItems: unknown;
      donations: DonationForProgress[];
    } | null = null;
    if (action === 'accept') {
      const c = await this.prisma.kitchenCampaign.findUnique({
        where: { id: request.campaignId },
        select: {
          id: true,
          title: true,
          scheduledDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          operationEndAt: true,
          status: true,
          kitchenAddress: true,
          supplyItems: true,
          donations: { select: { itemName: true, quantity: true, status: true } },
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
      this.ensureCampaignCanReceiveFood(c);
      // Không còn vòng tìm shipper hệ thống cho đơn nguyên liệu → không cần tọa độ
      // để định tuyến delivery nữa (tổ chức phân công shipper chiến dịch đi nhận).
      campaignSnapshot = {
        ...c,
        kitchenLng: Number(kitchenCoords?.lng ?? 0),
        kitchenLat: Number(kitchenCoords?.lat ?? 0),
      };
    }

    // Ưu tiên NGÀY + KHUNG GIỜ bếp đã khai trong đơn (demandDetails); NCC có thể
    // đề xuất giờ khác qua opts.pickupTime; cuối cùng mới fallback về giờ chiến dịch.
    const demand = (request.demandDetails ?? {}) as DonationDemandDetails;
    const pickupStart = opts?.pickupTime ?? demand.neededFrom ?? campaignSnapshot?.startTime ?? null;
    const pickupEnd = demand.neededTo ?? campaignSnapshot?.endTime ?? null;
    const pickupScheduledDate = demand.neededDate
      ? new Date(`${demand.neededDate}T00:00:00Z`)
      : campaignSnapshot?.scheduledDate ?? null;
    const needsTransport = action === 'accept' && (opts?.needsTransport ?? true);

    const { updated, transport, donation } = await this.prisma.$transaction(async (tx) => {
      const requestUpdate = await tx.campaignProviderRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewedNote: note ?? null,
          scheduledDate: action === 'accept' ? pickupScheduledDate : null,
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
      const donation = action === 'accept'
        ? await this.createDonationFromAcceptedRequest(tx, {
            campaignId: request.campaignId,
            providerId: profile.id,
            providerName: profile.businessName,
            requestId,
            note,
            campaign: campaignSnapshot!,
            demandDetails: (request.demandDetails as DonationDemandDetails | null) ?? null,
          })
        : null;
      // Luôn tạo transport khi accept — đây là SỔ TRẠNG THÁI cho tab "Giao & nhận
      // hàng" (chờ phân công → shipper xác nhận lấy → bếp chốt kg → báo NCC),
      // KHÔNG còn tạo delivery/pool search shipper hệ thống nữa.
      const transport = action === 'accept'
        ? await this.createTransportForRequest(tx, requestId)
        : null;
      return { updated, transport, donation };
    });
    const transportId = transport?.id ?? null;

    // 3) Notify charity
    const receiverUser = await this.prisma.receiverProfile.findUnique({
      where: { id: request.receiverId },
      select: { userId: true },
    });
    if (receiverUser) {
      const pickupDateStr = pickupScheduledDate
        ? pickupScheduledDate.toISOString().slice(0, 10)
        : '';
      const pickupTimeStr = pickupStart ?? '';
      const pickupEndStr = pickupEnd ?? '';

      let body: string;
      let title: string;
      if (action === 'reject') {
        title = 'Nhà cung cấp từ chối hợp tác';
        body = `${profile.businessName} đã từ chối yêu cầu hợp tác cho chiến dịch "${campaignSnapshot?.title ?? 'chiến dịch'}". Lý do: ${note ?? 'Không có'}`;
      } else {
        // Đồng bộ với luồng phân phát: KHÔNG tìm shipper hệ thống — tổ chức tự
        // phân công shipper của chiến dịch có ca phủ khung giờ lấy hàng.
        title = 'Nhà cung cấp đã chấp nhận — phân công shipper chiến dịch đến lấy';
        body =
          `${profile.businessName ?? 'Nhà cung cấp'} đã đồng ý`
          + (donation ? ` và cam kết ${donation.quantity ?? ''} ${donation.itemName}` : '')
          + `. Lịch lấy hàng: ${pickupTimeStr}${pickupEndStr ? `–${pickupEndStr}` : ''} ngày ${pickupDateStr}. `
          + 'Vào tab "Giao & nhận hàng" để phân công shipper của chiến dịch đi nhận.';
      }

      await this.notifications.notify(receiverUser.userId, {
        type: 'charity_notification',
        title,
        body,
        data: {
          requestId,
          providerRequestId: requestId,
          transportId,
          donationId: donation?.id ?? null,
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

  /**
   * Tạo (hoặc reset khi NCC chấp nhận lại) SỔ TRẠNG THÁI vận chuyển cho một đơn
   * nguyên liệu. KHÔNG còn tạo delivery / vòng tìm shipper hệ thống — đồng bộ với
   * luồng phân phát: tổ chức phân công shipper CHIẾN DỊCH có ca phủ khung giờ
   * (assignRequestPickup), shipper xác nhận lấy hàng (confirmIngredientPickup →
   * transport 'delivered'), bếp chốt kg (confirmTransportReceipt → 'received').
   */
  private async createTransportForRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<{ id: string; deliveryId: string | null }> {
    // `provider_request_id` là UNIQUE — đơn thất bại rồi gửi lại sẽ đụng bản ghi
    // cũ (23505), nên TÁI SỬ DỤNG: reset về trạng thái ban đầu thay vì insert.
    const existing = await tx.campaignTransport.findUnique({
      where: { providerRequestId: requestId },
      select: { id: true, deliveryId: true },
    });
    if (existing) {
      if (existing.deliveryId) {
        // Bản ghi cũ từ thời còn pool search: dọn offer + đóng delivery cũ để
        // không shipper hệ thống nào còn thấy chuyến này.
        await tx.shipperTaskOffer.updateMany({
          where: { deliveryId: existing.deliveryId, status: 'pending' },
          data: { status: 'expired', respondedAt: new Date() },
        });
        await tx.delivery.updateMany({
          where: { id: existing.deliveryId, status: 'pending_assignment' },
          data: { status: 'failed', failedReason: 'Chuyển sang shipper chiến dịch đi nhận.' },
        });
      }
      await tx.campaignTransport.update({
        where: { id: existing.id },
        data: {
          deliveryId: null,
          status: 'pending',
          assignedAt: null,
          pickedUpAt: null,
          deliveredAt: null,
          receivedAt: null,
          failedAt: null,
          failureReason: null,
          receivedByUserId: null,
          receiptNote: null,
          receiptPhotoUrl: null,
          lastBroadcastAt: null,
        },
      });
      return { id: existing.id, deliveryId: null };
    }

    const transport = await tx.campaignTransport.create({
      data: { providerRequestId: requestId, status: 'pending' },
      select: { id: true },
    });
    return { id: transport.id, deliveryId: null };
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
      select: { id: true, status: true, deliveryId: true, providerRequestId: true },
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

    // Đóng luôn khoản ghi sổ kho của CÙNG lô hàng này.
    //
    // Xác nhận chuyến chỉ nói "hàng đã về bếp"; số kg vào mục tiêu nguyên liệu lại nằm ở
    // campaign_donations. Trước đây hai bước tách rời nên tổ chức phải bấm xác nhận hai
    // lần cho một lô, quên bước sau là tiến độ nguyên liệu đứng im dù hàng đã về.
    await this.prisma.campaignDonation.updateMany({
      where: { providerRequestId: transport.providerRequestId, status: 'pledged' },
      data: { status: 'received', receivedAt: new Date() },
    });

    const result = await this.prisma.campaignTransport.findUnique({
      where: { id: transportId },
      include: {
        providerRequest: {
          select: { provider: { select: { userId: true } }, campaign: { select: { title: true } } },
        },
      },
    });
    if (result?.providerRequest) {
      // Kèm số lượng tổ chức báo + giờ chốt + người lấy — NCC cần đối chiếu sổ sách,
      // một câu "đã xác nhận nhận hàng" trống trơn không dùng làm gì được.
      // Bảng ký nhận không khai quan hệ volunteer trong Prisma — tra tên qua hồ sơ.
      const pickupRow = await this.prisma.campaignIngredientPickup.findUnique({
        where: { providerRequestId: transport.providerRequestId },
        select: { receivedKg: true, confirmedAt: true, volunteerId: true },
      });
      const pickerProfile = pickupRow
        ? await this.prisma.volunteerProfile.findUnique({
            where: { id: pickupRow.volunteerId },
            select: { user: { select: { fullName: true } } },
          })
        : null;
      const confirmedAtVn = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      await this.notifications.notify(result.providerRequest.provider.userId, {
        type: 'campaign',
        title: 'Tổ chức đã xác nhận nhận hàng',
        body:
          `Tổ chức xác nhận đã nhận thực phẩm cho chiến dịch "${result.providerRequest.campaign.title}" lúc ${confirmedAtVn}.` +
          (pickupRow ? ` Số lượng ký nhận: ${Number(pickupRow.receivedKg)} kg — người lấy: ${pickerProfile?.user.fullName ?? 'TNV'}.` : '') +
          (dto.note?.trim() ? ` Ghi chú của bếp: ${dto.note.trim()}` : ''),
        data: {
          campaignId, transportId, deliveryId: transport.deliveryId, status: 'received',
          receivedKg: pickupRow ? Number(pickupRow.receivedKg) : null,
          pickedBy: pickerProfile?.user.fullName ?? null,
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
            // Ai đang giao — tổ chức cần biết tên/SĐT shipper của chuyến
            delivery: {
              select: {
                shipper: { select: { user: { select: { fullName: true, phone: true } } } },
              },
            },
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
        // Từ chối vẫn nêu tên ca cho rõ — TNV có thể đã đăng ký nhiều ca.
        const rejectedShift = a.shiftId
          ? await tx.campaignShift.findUnique({ where: { id: a.shiftId }, select: { label: true } })
          : null;
        return {
          updated,
          notifyUserId: vol?.userId ?? null,
          shiftLabel: rejectedShift?.label ?? null,
        };
      }

      // action === 'approved' -> check role slot and, when campaign has shifts, assign a concrete shift.
      const c = await tx.kitchenCampaign.findUnique({ where: { id: campaignId } });
      if (!c) throw new NotFoundException('Không tìm thấy chiến dịch.');
      // Chiến dịch phải còn sống mới duyệt được. Thiếu chốt này thì tổ chức mở lại tab
      // đăng ký cũ và bấm duyệt cho một chiến dịch đã huỷ/đã xong: TNV nhận thông báo
      // "cần xác nhận" nhưng confirmAssignment chỉ chạy khi status='approved' nên slot
      // bị giữ vĩnh viễn, không có đường trả lại.
      if (!['approved', 'in_progress'].includes(c.status)) {
        throw new BadRequestException('Chiến dịch không còn nhận tình nguyện viên (đã huỷ, đã kết thúc hoặc chưa được duyệt).');
      }
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
        // Khoá đúng ca để hai lượt duyệt đồng thời không cùng chiếm "slot cuối".
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM campaign_shifts WHERE id = ${selectedShiftId}::uuid FOR UPDATE
        `);
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

      // Chống trùng giờ khi DUYỆT: TNV có thể đã được nhận ca khác (kể cả ở
      // chiến dịch khác) sau khi họ gửi đăng ký này, hoặc tổ chức đổi sang ca
      // khác lúc duyệt (dto.shiftId). Chỉ so với ca ĐÃ NHẬN — các đăng ký
      // pending khác chưa giữ chỗ thật; loại trừ chính bản ghi đang duyệt.
      if (selectedShiftId && a.workDate) {
        await this.assertShiftNotOverlapping(campaignId, a.volunteerId, selectedShiftId, a.workDate, {
          excludeAssignmentId: assignmentId,
          statuses: ['assigned', 'checked_in', 'in_progress', 'completed'],
          orgView: true,
          // Đang trong $transaction → dùng chính tx, không mượn connection khác.
          client: tx,
        });
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
            status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
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
          status: 'assigned', notes: dto.note ?? null, shiftId: selectedShiftId,
          confirmationStatus: 'pending', confirmedAt: null,
        },
      });
      if (assignment.count !== 1) {
        throw new BadRequestException('Đăng ký này đã được xử lý.');
      }
      const updated = await tx.campaignVolunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });

      const vol = await tx.volunteerProfile.findUnique({
        where: { id: a.volunteerId },
        select: { userId: true },
      });

      return {
        updated,
        notifyUserId: vol?.userId ?? null,
        shiftLabel: selectedShiftLabel,
      };
    });

    // Ngữ cảnh cho thông báo: cùng một TNV có thể được duyệt NHIỀU ca trong một
    // chiến dịch, nên phải nói rõ ca nào ngày nào — nếu không các thông báo trông
    // y hệt nhau và người nhận tưởng bị gửi lặp.
    const campaignForNotify = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { title: true },
    });
    const shiftPart = result.shiftLabel ? `ca "${result.shiftLabel}"` : 'ca đã đăng ký';
    const datePart = result.updated.workDate
      ? ` ngày ${this.toDateKey(result.updated.workDate)}`
      : '';
    const campaignPart = campaignForNotify?.title ? ` của chiến dịch "${campaignForNotify.title}"` : '';

    if (result.notifyUserId) {
      if (dto.action === 'rejected') {
        await this.notifications.notify(result.notifyUserId, {
          type: 'campaign',
          title: 'Đăng ký bị từ chối',
          body:
            `Rất tiếc, tổ chức không thể nhận bạn vào ${shiftPart}${datePart}${campaignPart}.`
            + `${dto.note ? ` Lý do: ${dto.note}` : ''}`,
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
          title: 'Đăng ký được duyệt — cần xác nhận',
          body:
            `Bạn đã được nhận vào ${shiftPart}${datePart}${campaignPart} `
            + `với vai trò ${ROLE_VN[result.updated.role]}. `
            + 'Hãy xác nhận ca để được tính vào nhân sự chính thức.',
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
      select: { id: true, title: true, status: true, expectedServings: true },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['in_progress', 'completed'].includes(campaign.status)) {
      throw new BadRequestException('Chỉ ghi nhận đợt phát khi chiến dịch đang diễn ra.');
    }
    const campaignTitle = campaign.title;

    // QUY TẮC: 1 suất = 1 người nhận. Số người KHÔNG nhập tay nữa — luôn ép bằng
    // số suất (dto.peopleServed chỉ còn để tương thích client cũ, bị bỏ qua).
    const leftover = dto.leftoverServings ?? 0;

    // Không phát vượt số suất chiến dịch đăng ký ban đầu. Suất thừa cũng lấy từ cùng
    // mẻ nấu đó nên phải tính chung vào hạn mức.
    const target = campaign.expectedServings ?? 0;
    if (target > 0) {
      const agg = await this.prisma.mealDistribution.aggregate({
        where: { campaignId },
        _sum: { servingsServed: true, leftoverServings: true },
      });
      const used = (agg._sum.servingsServed ?? 0) + (agg._sum.leftoverServings ?? 0);
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
    const APPROVED = ['assigned', 'checked_in', 'in_progress', 'completed'] as const;

    // ── Người phụ trách đi phát ──────────────────────────────────────────────
    // Nhận cả shipper VÀ phục vụ: đợt phát tại chỗ (phát ngay ở bếp / một điểm gần)
    // là việc của phục vụ, chỉ cho shipper thì phục vụ không có việc nào để làm.
    // Đầu bếp không nằm trong danh sách — họ phải ở bếp lo mẻ tiếp theo.
    // Duyệt một lượt rồi so số lượng: thiếu người nào là chặn cả yêu cầu, không
    // âm thầm bỏ bớt.
    const requestedAssignees = [...new Set(dto.assigneeVolunteerIds ?? [])];
    let assignees: { volunteerId: string; userId: string; fullName: string }[] = [];
    if (requestedAssignees.length > 0) {
      const valid = await this.prisma.campaignVolunteerAssignment.findMany({
        where: {
          campaignId,
          volunteerId: { in: requestedAssignees },
          role: { in: [...OPS_ROLES] },
          status: { in: [...APPROVED] },
        },
        select: {
          volunteerId: true,
          volunteer: { select: { userId: true, user: { select: { fullName: true } } } },
        },
      });
      const byVolunteer = new Map(
        valid.map((a) => [
          a.volunteerId,
          { volunteerId: a.volunteerId, userId: a.volunteer.userId, fullName: a.volunteer.user.fullName },
        ]),
      );
      const missing = requestedAssignees.filter((id) => !byVolunteer.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `${missing.length} người được chọn không phải TNV giao hàng / phục vụ đã được duyệt của chiến dịch này.`,
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
        typeof (p as { lng?: number }).lng === 'number' && typeof (p as { lat?: number }).lat === 'number',
    );
    for (let i = 0; i < pinned.length; i += 1) {
      for (let j = i + 1; j < pinned.length; j += 1) {
        const d = this.distanceMeters(pinned[i], pinned[j]);
        if (d < MIN_POINT_DISTANCE_M) {
          throw new BadRequestException(
            `Điểm "${pinned[i].label}" và "${pinned[j].label}" chỉ cách nhau ${Math.round(d)} m — `
            + `hai điểm phát phải cách nhau ít nhất ${MIN_POINT_DISTANCE_M} m để không phục vụ trùng một nhóm dân cư.`,
          );
        }
      }
    }

    let servedByVolunteerId = dto.servedByVolunteerId ?? assignees[0]?.volunteerId ?? null;
    if (servedByVolunteerId) {
      const ok = await this.prisma.campaignVolunteerAssignment.findFirst({
        where: { campaignId, volunteerId: servedByVolunteerId, status: { in: [...APPROVED] } },
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
        points: points.length > 0 ? (points as Prisma.InputJsonValue) : Prisma.DbNull,
        roundLabel: dto.roundLabel ?? null,
        servingsServed: dto.servingsServed,
        // 1 suất = 1 người — ép server-side, không tin client
        peopleServed: dto.servingsServed,
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
          body:
            `Chiến dịch "${campaignTitle}" — ${round}: ${dto.servingsServed} suất. ${placeText}`,
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
    report: { actualServings?: number; actualPeopleServed?: number; note?: string } = {},
    proofPhotoUrl?: string,
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
          select: { title: true, charityReceiver: { select: { userId: true } } },
        },
      },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phát.');
    if (dist.completedAt) {
      return { id: dist.id, completedAt: dist.completedAt, alreadyCompleted: true };
    }

    // Số thực phát không được vượt số đã lên kế hoạch — hàng lấy từ đúng mẻ đó,
    // báo nhiều hơn là số liệu sai chứ không phải phát được nhiều hơn.
    const actualServings = report.actualServings ?? dist.servingsServed;
    if (actualServings < 0 || actualServings > dist.servingsServed) {
      throw new BadRequestException(
        `Số suất thực phát phải trong khoảng 0–${dist.servingsServed} (số đã lên kế hoạch).`,
      );
    }
    // QUY TẮC: 1 suất = 1 người nhận — số người luôn bằng số suất thực phát,
    // không cho nhập/sửa tay nữa (report.actualPeopleServed bị bỏ qua, chỉ giữ
    // để client cũ không vỡ).
    const actualPeople = actualServings;

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true } } },
    });
    const assigneeIds = Array.isArray(dist.assigneeIds) ? (dist.assigneeIds as string[]) : [];
    // Phục vụ cũng được điều đi phát, nên xét theo DANH SÁCH PHÂN CÔNG chứ không theo vai trò.
    const isAssignee = !!volunteer && assigneeIds.includes(volunteer.id);
    const isOwner = dist.campaign.charityReceiver.userId === userId;
    if (!isAssignee && !isOwner) {
      throw new ForbiddenException(
        'Chỉ TNV được phân công đợt này hoặc tổ chức chủ chiến dịch mới xác nhận được.',
      );
    }

    // TNV phải ĐIỂM DANH trước rồi mới chốt được đợt phát. Không có bước này thì
    // một người ở nhà vẫn bấm "đã phát xong" được, và số liệu chiến dịch mất tin cậy.
    // Tổ chức chủ chiến dịch không cần điểm danh — họ chốt hộ khi shipper quên bấm.
    if (isAssignee && !isOwner) {
      const attended = await this.prisma.campaignVolunteerAssignment.findFirst({
        where: {
          campaignId: dist.campaignId,
          volunteerId: volunteer!.id,
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
        completedByVolunteerId: isAssignee ? volunteer!.id : null,
        actualServings,
        actualPeopleServed: actualPeople,
        completionNote: report.note?.trim() || null,
        ...(proofPhotoUrl ? { photoUrl: proofPhotoUrl } : {}),
      },
    });
    if (claimed.count !== 1) {
      const fresh = await this.prisma.mealDistribution.findUnique({
        where: { id: distributionId },
        select: { completedAt: true },
      });
      return { id: distributionId, completedAt: fresh?.completedAt ?? null, alreadyCompleted: true };
    }

    // Báo tổ chức khi TNV được phân công là người xác nhận (tổ chức tự bấm thì khỏi tự báo mình).
    if (isAssignee) {
      const leftover = dist.servingsServed - actualServings;
      void this.notifications.notify(dist.campaign.charityReceiver.userId, {
        type: 'campaign',
        title: 'Đợt phát đã hoàn tất',
        body:
          `${volunteer!.user.fullName} báo đã phát ${actualServings}/${dist.servingsServed} suất `
          + `cho ${actualPeople} người tại "${dist.roundLabel ?? 'đợt phát'}" `
          + `của chiến dịch "${dist.campaign.title}".`
          + (leftover > 0 ? ` Còn dư ${leftover} suất.` : '')
          + (report.note?.trim() ? ` Ghi chú: ${report.note.trim()}` : ''),
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
  async myDistributionHistory(userId: string, opts: { page?: number; limit?: number } = {}) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

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
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /**
   * Tính lại `chef/waiter/shipperSlotsNeeded` từ danh sách ca hiện tại.
   *
   * Định biên cấp chiến dịch chỉ được tính MỘT LẦN lúc tạo (Σ slot mỗi ca × số ngày),
   * trong khi ma trận đủ người lại đọc thẳng từ bảng ca. Thêm/sửa/xoá ca mà không
   * tính lại thì hai hệ thống lệch nhau: ma trận đòi 4 đầu bếp nhưng cổng duyệt chỉ
   * cho qua 2 → chiến dịch không bao giờ đủ điều kiện bắt đầu.
   */
  private async syncCampaignSlotsFromShifts(campaignId: string): Promise<void> {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { scheduledDate: true, endDate: true },
    });
    if (!campaign) return;
    const dayCount = this.campaignDays(
      campaign.scheduledDate,
      campaign.endDate ?? campaign.scheduledDate,
    ).length;
    const shifts = await this.prisma.campaignShift.findMany({
      where: { campaignId },
      select: { role: true, slotsNeeded: true },
    });
    const totalFor = (role: 'chef' | 'waiter' | 'shipper') =>
      shifts.filter((s) => s.role === role).reduce((sum, s) => sum + s.slotsNeeded, 0) * dayCount;
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: {
        chefSlotsNeeded: totalFor('chef'),
        waiterSlotsNeeded: totalFor('waiter'),
        shipperSlotsNeeded: totalFor('shipper'),
      },
    });
  }

  /** Ca trực CRUD. */
  async addShift(campaignId: string, userId: string, dto: CreateShiftDto) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'pending_approval') throw new BadRequestException('Không sửa ca sau khi đã gửi duyệt. Hãy gửi yêu cầu dời lịch.');
    const period = (Object.entries(SHIFT_PERIODS) as Array<[CampaignShiftPeriod, typeof SHIFT_PERIODS[CampaignShiftPeriod]]>)
      .find(([, p]) => p.startTime === dto.startTime && p.endTime === dto.endTime)?.[0];
    if (!period || !dto.role) throw new BadRequestException('Ca phải thuộc một trong bốn khung cố định và có vai trò cụ thể.');
    const duplicate = await this.prisma.campaignShift.findFirst({
      where: { campaignId, period, role: dto.role },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`Định biên ${SHIFT_PERIODS[period].label} / ${ROLE_VN[dto.role]} đã tồn tại.`);
    }
    const created = await this.prisma.campaignShift.create({
      data: {
        campaignId,
        label: dto.label.trim(),
        role: dto.role ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
        period,
        endDayOffset: SHIFT_PERIODS[period].endDayOffset,
        slotsNeeded: dto.slotsNeeded,
      },
    });
    await this.syncCampaignSlotsFromShifts(campaignId);
    return created;
  }

  async updateShift(campaignId: string, shiftId: string, userId: string, dto: UpdateShiftDto) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'pending_approval') throw new BadRequestException('Không sửa định biên sau khi đã gửi duyệt.');
    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca trực.');
    }
    const finalStart = dto.startTime ?? shift.startTime;
    const finalEnd = dto.endTime ?? shift.endTime;
    const period = (Object.entries(SHIFT_PERIODS) as Array<[CampaignShiftPeriod, typeof SHIFT_PERIODS[CampaignShiftPeriod]]>)
      .find(([, p]) => p.startTime === finalStart && p.endTime === finalEnd)?.[0];
    if (!period) throw new BadRequestException('Ca phải thuộc một trong bốn khung 6 giờ cố định.');
    if (dto.slotsNeeded !== undefined && dto.slotsNeeded < shift.slotsFilled) {
      throw new BadRequestException(`Số người cần không thể nhỏ hơn số đã phân ca (${shift.slotsFilled}).`);
    }
    const updated = await this.prisma.campaignShift.update({
      where: { id: shiftId },
      data: {
        label: dto.label?.trim(),
        role: dto.role ?? undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        period,
        endDayOffset: SHIFT_PERIODS[period].endDayOffset,
        slotsNeeded: dto.slotsNeeded,
      },
    });
    await this.syncCampaignSlotsFromShifts(campaignId);
    return updated;
  }

  async deleteShift(campaignId: string, shiftId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'pending_approval') throw new BadRequestException('Không xoá ca sau khi đã gửi duyệt.');
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
    await this.syncCampaignSlotsFromShifts(campaignId);
    return { id: shiftId, deleted: true };
  }

  /** Thêm món vào menu_items (jsonb). */
  async appendMenuItem(campaignId: string, userId: string, dto: AppendMenuItemDto) {
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
      data: { menuItems: next as unknown as Prisma.InputJsonValue },
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
  async setMenuItemMeal(campaignId: string, userId: string, index: number, type: string) {
    const c = await this.assertOwner(campaignId, userId);
    const list = CampaignsService.normalizeMenuItems(c.menuItems);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new BadRequestException('Không tìm thấy món này trong thực đơn.');
    }
    list[index] = { ...list[index], type: type.trim() };
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { menuItems: list as unknown as Prisma.InputJsonValue },
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
    id: string;
    name: string;
    type: string;
    plannedServings: number | null;
    recipeId: string | null;
    sortOrder: number;
  }> {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, i) => {
      const m = (entry ?? {}) as Record<string, unknown>;
      const name = typeof m.name === 'string' && m.name.trim()
        ? m.name.trim()
        : typeof m.customName === 'string'
          ? m.customName.trim()
          : '';
      const sortOrder = typeof m.sortOrder === 'number' ? m.sortOrder : i;
      return {
        id: `menu-${sortOrder}`,
        name,
        type: typeof m.type === 'string' ? m.type.trim() : '',
        plannedServings: m.plannedServings == null ? null : Number(m.plannedServings),
        recipeId: typeof m.recipeId === 'string' ? m.recipeId : null,
        sortOrder,
      };
    });
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

  /** Thống kê toàn hệ thống — cho trang /campaigns overview. */
  async getSystemStats() {
    const [total, completed, active] = await Promise.all([
      this.prisma.kitchenCampaign.count({ where: {} }),
      this.prisma.kitchenCampaign.count({ where: { status: 'completed' } }),
      this.prisma.kitchenCampaign.count({ where: { status: { in: ['approved', 'in_progress'] } } }),
    ]);

    // Suất ăn đã phát: sum(actualServings) của chiến dịch completed
    const servingsAgg = await this.prisma.kitchenCampaign.aggregate({
      where: { status: 'completed' },
      _sum: { actualServings: true },
    });
    const mealsServed = Number(servingsAgg._sum?.actualServings ?? 0);

    // "Người được phục vụ" = người NHẬN suất ăn từ các đợt phát ĐÃ CHỐT, ưu tiên
    // số thực tế (1 suất = 1 người). Bản cũ đếm số TNV distinct — sai ngữ nghĩa:
    // đó là người ĐI phục vụ, không phải người được phục vụ.
    const distRows = await this.prisma.mealDistribution.findMany({
      where: { completedAt: { not: null } },
      select: { peopleServed: true, actualPeopleServed: true },
    });
    const peopleServed = distRows.reduce((s, d) => s + (d.actualPeopleServed ?? d.peopleServed), 0);

    // Tỉ lệ hoàn thành
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      mealsServed,
      peopleServed,
      completedCampaigns: completed,
      completionRate,
      totalCampaigns: total,
      activeCampaigns: active,
    };
  }

  /** Tổ chức duyệt bước "Sẵn sàng xuất phát" của một món (delegate sang DishStepsService). */
  async approveDishFinalStep(campaignId: string, userId: string, menuItemId: string) {
    return this.dishSteps.approveDishFinalStep(campaignId, userId, menuItemId);
  }

  /** Tổ chức từ chối bước "Sẵn sàng xuất phát" của một món (delegate sang DishStepsService). */
  async rejectDishFinalStep(campaignId: string, userId: string, menuItemId: string, reason: string) {
    return this.dishSteps.rejectDishFinalStep(campaignId, userId, menuItemId, reason);
  }

  async getMyStats(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const where = { charityReceiverId: receiver.id };
    const completedWhere = { ...where, status: 'completed' as const };

    const [total, completed, active, servingsAgg, distributionsAgg] = await Promise.all([
      this.prisma.kitchenCampaign.count({ where }),
      this.prisma.kitchenCampaign.count({ where: completedWhere }),
      this.prisma.kitchenCampaign.count({ where: { ...where, status: { in: ['approved', 'in_progress'] } } }),
      this.prisma.kitchenCampaign.aggregate({
        where: completedWhere,
        _sum: { actualServings: true },
      }),
      // Chỉ đợt đã chốt; ưu tiên số thực tế shipper báo. Không dùng aggregate vì
      // _sum không COALESCE được actual ?? planned.
      this.prisma.mealDistribution.findMany({
        where: { campaign: where, completedAt: { not: null } },
        select: { peopleServed: true, actualPeopleServed: true },
      }),
    ]);

    const mealsServed = Number(servingsAgg._sum?.actualServings ?? 0);
    const peopleServed = distributionsAgg.reduce(
      (s, d) => s + (d.actualPeopleServed ?? d.peopleServed),
      0,
    );
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      mealsServed,
      peopleServed,
      completedCampaigns: completed,
      completionRate,
      totalCampaigns: total,
      activeCampaigns: active,
    };
  }
}
