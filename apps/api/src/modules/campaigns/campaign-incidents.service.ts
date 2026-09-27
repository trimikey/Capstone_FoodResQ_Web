import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';

/**
 * Báo sự cố của shipper trong CHIẾN DỊCH — lúc đi lấy nguyên liệu tại NCC hoặc lúc đi
 * phát suất ăn. Không đụng luồng giao hàng đơn lẻ (deliveries): sự cố ở đây chỉ để tổ
 * chức nắm ngay và xử lý (đổi người, đổi điểm, báo NCC…), không tự đổi trạng thái đơn.
 */

export type IncidentContext = 'pickup' | 'distribution';

/** Lý do chọn sẵn — FE dùng cùng bộ mã. 'other' = nhập tay (bắt buộc có mô tả). */
export const INCIDENT_REASONS: Record<IncidentContext, Record<string, string>> = {
  pickup: {
    provider_closed: 'NCC đóng cửa / không liên lạc được',
    provider_shortage: 'NCC thiếu hàng, không đủ số lượng',
    bad_quality: 'Nguyên liệu kém chất lượng / hư hỏng',
    vehicle_broken: 'Xe hỏng giữa đường',
    traffic_weather: 'Kẹt xe, mưa ngập — sẽ đến trễ',
    accident: 'Gặp tai nạn / va chạm',
    other: 'Sự cố khác',
  },
  distribution: {
    food_damaged: 'Suất ăn bị đổ, hỏng trên đường',
    point_unavailable: 'Không vào được điểm phát / bị cấm tụ tập',
    crowd_disorder: 'Quá đông người, mất trật tự',
    vehicle_broken: 'Xe hỏng giữa đường',
    traffic_weather: 'Kẹt xe, mưa ngập — sẽ đến trễ',
    accident: 'Gặp tai nạn / va chạm',
    other: 'Sự cố khác',
  },
};

const CONTEXT_VN: Record<IncidentContext, string> = {
  pickup: 'đi lấy nguyên liệu',
  distribution: 'đi phát suất ăn',
};

/** Ca vận hành (phục vụ/giao hàng đã gộp) — chỉ những người này đi lấy hàng / đi phát. */
const OPS_ROLES = ['shipper', 'waiter'] as const;

@Injectable()
export class CampaignIncidentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  async report(
    campaignId: string,
    userId: string,
    dto: { context: IncidentContext; referenceId?: string; reasonCode: string; detail?: string },
    photo?: Express.Multer.File,
  ) {
    const reasons = INCIDENT_REASONS[dto.context];
    if (!reasons) throw new BadRequestException('Loại việc không hợp lệ.');
    const reasonLabel = reasons[dto.reasonCode];
    if (!reasonLabel) throw new BadRequestException('Lý do sự cố không hợp lệ.');
    const detail = dto.detail?.trim() || undefined;
    if (dto.reasonCode === 'other' && !detail) {
      throw new BadRequestException('Chọn "Sự cố khác" thì cần mô tả ngắn chuyện gì đang xảy ra.');
    }

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { fullName: true, phone: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, title: true, status: true, charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    // Chỉ người đang trực ca vận hành của chính chiến dịch này mới báo được.
    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId,
        volunteerId: volunteer.id,
        role: { in: [...OPS_ROLES] },
        status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Bạn không trực ca giao hàng & phục vụ nào của chiến dịch này.');
    }

    // Việc được báo phải thuộc chiến dịch (không tin id client gửi).
    let referenceLabel: string | null = null;
    if (dto.referenceId) {
      if (dto.context === 'pickup') {
        const req = await this.prisma.campaignProviderRequest.findFirst({
          where: { id: dto.referenceId, campaignId },
          select: { demandDetails: true, provider: { select: { businessName: true } } },
        });
        if (!req) throw new BadRequestException('Đơn nguyên liệu không thuộc chiến dịch này.');
        const d = (req.demandDetails ?? {}) as Record<string, unknown>;
        referenceLabel = `${(d.ingredientName as string | undefined) ?? 'nguyên liệu'} tại ${req.provider.businessName}`;
      } else {
        const dist = await this.prisma.mealDistribution.findFirst({
          where: { id: dto.referenceId, campaignId },
          select: { roundLabel: true },
        });
        if (!dist) throw new BadRequestException('Đợt phát không thuộc chiến dịch này.');
        referenceLabel = dist.roundLabel ?? 'đợt phát';
      }
    }

    const photoUrl = photo ? await this.storage.saveImage(photo, 'campaign-incidents') : null;
    const incident = await this.prisma.campaignIncident.create({
      data: {
        campaignId,
        volunteerId: volunteer.id,
        context: dto.context,
        referenceId: dto.referenceId ?? null,
        reasonCode: dto.reasonCode,
        detail: detail ?? null,
        photoUrl,
      },
    });

    // Báo tổ chức NGAY — sự cố trên đường cần xử lý trong vài phút, không đợi mở trang.
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: `Sự cố khi ${CONTEXT_VN[dto.context]}: ${reasonLabel}`,
      body:
        `${volunteer.user.fullName}${volunteer.user.phone ? ` (${volunteer.user.phone})` : ''} báo sự cố` +
        (referenceLabel ? ` — ${referenceLabel}` : '') +
        ` ở chiến dịch "${campaign.title}".` +
        (detail ? ` Mô tả: ${detail}` : ''),
      data: { campaignId, incidentId: incident.id, context: dto.context, reasonCode: dto.reasonCode },
    });

    return { ...incident, reasonLabel };
  }

  /** Danh sách sự cố — tổ chức chủ chiến dịch thấy hết, TNV chỉ thấy sự cố của mình. */
  async list(campaignId: string, userId: string) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    const isOwner = campaign.charityReceiver.userId === userId;
    let volunteerId: string | undefined;
    if (!isOwner) {
      const v = await this.prisma.volunteerProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!v) throw new ForbiddenException('Bạn không có quyền xem sự cố của chiến dịch này.');
      volunteerId = v.id;
    }
    const rows = await this.prisma.campaignIncident.findMany({
      where: { campaignId, ...(volunteerId ? { volunteerId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { volunteer: { select: { user: { select: { fullName: true, phone: true } } } } },
    });
    return rows.map((r) => ({
      id: r.id,
      context: r.context,
      referenceId: r.referenceId,
      reasonCode: r.reasonCode,
      reasonLabel: INCIDENT_REASONS[r.context as IncidentContext]?.[r.reasonCode] ?? r.reasonCode,
      detail: r.detail,
      photoUrl: r.photoUrl,
      status: r.status,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      createdAt: r.createdAt,
      reporterName: r.volunteer.user.fullName,
      reporterPhone: r.volunteer.user.phone,
    }));
  }

  /** Tổ chức đánh dấu đã xử lý (kèm cách xử lý) — báo lại người đã báo sự cố. */
  async resolve(incidentId: string, userId: string, note?: string) {
    const incident = await this.prisma.campaignIncident.findUnique({
      where: { id: incidentId },
      include: {
        campaign: { select: { title: true, charityReceiver: { select: { userId: true } } } },
        volunteer: { select: { userId: true } },
      },
    });
    if (!incident) throw new NotFoundException('Không tìm thấy sự cố.');
    if (incident.campaign.charityReceiver.userId !== userId) {
      throw new ForbiddenException('Chỉ tổ chức chủ chiến dịch mới xử lý được sự cố.');
    }
    if (incident.status === 'resolved') return { id: incident.id, status: 'resolved' };

    const trimmed = note?.trim() || null;
    await this.prisma.campaignIncident.update({
      where: { id: incidentId },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedNote: trimmed },
    });
    const reasonLabel =
      INCIDENT_REASONS[incident.context as IncidentContext]?.[incident.reasonCode] ?? incident.reasonCode;
    void this.notifications.notify(incident.volunteer.userId, {
      type: 'campaign',
      title: 'Tổ chức đã xử lý sự cố bạn báo',
      body: `"${reasonLabel}" ở chiến dịch "${incident.campaign.title}" đã được xử lý.${trimmed ? ` Ghi chú: ${trimmed}` : ''}`,
      data: { campaignId: incident.campaignId, incidentId },
    });
    return { id: incidentId, status: 'resolved' };
  }
}
