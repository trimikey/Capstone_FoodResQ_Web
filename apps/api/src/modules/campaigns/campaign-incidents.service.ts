import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { CampaignsService } from './campaigns.service';

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
    private campaigns: CampaignsService,
  ) {}

  async report(
    campaignId: string,
    userId: string,
    dto: {
      context: IncidentContext;
      referenceId?: string;
      reasonCode: string;
      detail?: string;
      canContinue?: boolean;
      delayMinutes?: number;
    },
    photo?: Express.Multer.File,
  ) {
    const canContinue = dto.canContinue !== false;
    if (!canContinue && !dto.referenceId) {
      throw new BadRequestException('Không tiếp tục được thì phải cho biết đang dở đơn / đợt phát nào.');
    }
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
          select: {
            demandDetails: true,
            pickupAssigneeIds: true,
            ingredientPickup: { select: { id: true } },
            provider: { select: { businessName: true } },
          },
        });
        if (!req) throw new BadRequestException('Đơn nguyên liệu không thuộc chiến dịch này.');
        if (!canContinue && req.ingredientPickup) {
          throw new BadRequestException('Đơn này đã được xác nhận lấy hàng — không cần đổi người đi lấy.');
        }
        const d = (req.demandDetails ?? {}) as Record<string, unknown>;
        referenceLabel = `${(d.ingredientName as string | undefined) ?? 'nguyên liệu'} tại ${req.provider.businessName}`;
      } else {
        const dist = await this.prisma.mealDistribution.findFirst({
          where: { id: dto.referenceId, campaignId },
          select: { roundLabel: true, completedAt: true },
        });
        if (!dist) throw new BadRequestException('Đợt phát không thuộc chiến dịch này.');
        if (!canContinue && dist.completedAt) {
          throw new BadRequestException('Đợt phát này đã chốt xong — không cần đổi người.');
        }
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
        canContinue,
        delayMinutes: canContinue ? (dto.delayMinutes ?? null) : null,
      },
    });

    // Không đi tiếp được → gỡ shipper khỏi việc NGAY: việc về "chờ phân công" để tổ chức
    // đổi người, và không còn treo trong danh sách việc của người đã báo.
    if (!canContinue && dto.referenceId) {
      await this.releaseVolunteer(campaignId, volunteer.id, dto.context, dto.referenceId);
    }

    // Báo tổ chức NGAY — sự cố trên đường cần xử lý trong vài phút, không đợi mở trang.
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: canContinue
        ? `Sự cố khi ${CONTEXT_VN[dto.context]}: ${reasonLabel}`
        : `CẦN ĐỔI SHIPPER — ${reasonLabel}`,
      body:
        `${volunteer.user.fullName}${volunteer.user.phone ? ` (${volunteer.user.phone})` : ''} báo sự cố` +
        (referenceLabel ? ` — ${referenceLabel}` : '') +
        ` ở chiến dịch "${campaign.title}".` +
        (detail ? ` Mô tả: ${detail}` : '') +
        (canContinue
          ? dto.delayMinutes
            ? ` Vẫn tiếp tục, dự kiến trễ khoảng ${dto.delayMinutes} phút.`
            : ' Vẫn tiếp tục.'
          : ' Shipper KHÔNG thể tiếp tục — việc đã trở về chờ phân công, vào trang quản lý để đổi người.'),
      data: { campaignId, incidentId: incident.id, context: dto.context, reasonCode: dto.reasonCode },
    });

    return { ...incident, reasonLabel };
  }

  /** Gỡ người báo sự cố khỏi đơn nguyên liệu / đợt phát (không xoá lịch sử). */
  private async releaseVolunteer(
    campaignId: string,
    volunteerId: string,
    context: IncidentContext,
    referenceId: string,
  ) {
    if (context === 'pickup') {
      // pickup_assignee_ids lưu ASSIGNMENT id — gỡ mọi ca của người này trong chiến dịch.
      const mine = await this.prisma.campaignVolunteerAssignment.findMany({
        where: { campaignId, volunteerId },
        select: { id: true },
      });
      const mineIds = new Set(mine.map((a) => a.id));
      const req = await this.prisma.campaignProviderRequest.findUnique({
        where: { id: referenceId },
        select: { pickupAssigneeIds: true },
      });
      const ids = Array.isArray(req?.pickupAssigneeIds) ? (req!.pickupAssigneeIds as string[]) : [];
      await this.prisma.campaignProviderRequest.update({
        where: { id: referenceId },
        data: { pickupAssigneeIds: ids.filter((id) => !mineIds.has(id)) },
      });
      return;
    }
    // Đợt phát: assignee_ids lưu VOLUNTEER id; người đứng tên chính chuyển cho người còn lại.
    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: referenceId },
      select: { assigneeIds: true, servedByVolunteerId: true },
    });
    const ids = Array.isArray(dist?.assigneeIds) ? (dist!.assigneeIds as string[]) : [];
    const remaining = ids.filter((id) => id !== volunteerId);
    await this.prisma.mealDistribution.update({
      where: { id: referenceId },
      data: {
        assigneeIds: remaining,
        ...(dist?.servedByVolunteerId === volunteerId && remaining[0]
          ? { servedByVolunteerId: remaining[0] }
          : {}),
      },
    });
  }

  /**
   * Tổ chức ĐỔI SHIPPER cho việc bị bỏ dở vì sự cố, rồi khép sự cố.
   * - Đơn nguyên liệu: `ids` là assignment id — dùng lại luồng phân công sẵn có (kiểm tra
   *   ca phủ khung giờ lấy hàng, báo shipper mới).
   * - Đợt phát: `ids` là volunteer_profile id — phải là TNV giao hàng & phục vụ đã duyệt.
   */
  async reassign(incidentId: string, userId: string, ids: string[]) {
    const incident = await this.prisma.campaignIncident.findUnique({
      where: { id: incidentId },
      include: {
        campaign: { select: { id: true, title: true, charityReceiver: { select: { userId: true } } } },
      },
    });
    if (!incident) throw new NotFoundException('Không tìm thấy sự cố.');
    if (incident.campaign.charityReceiver.userId !== userId) {
      throw new ForbiddenException('Chỉ tổ chức chủ chiến dịch mới đổi được người.');
    }
    if (!incident.referenceId) {
      throw new BadRequestException('Sự cố này không gắn với đơn / đợt phát cụ thể nào để đổi người.');
    }
    const uniqueIds = [...new Set(ids)];
    let names: string[] = [];

    if (incident.context === 'pickup') {
      const req = await this.prisma.campaignProviderRequest.findUnique({
        where: { id: incident.referenceId },
        select: { pickupAssigneeIds: true },
      });
      const current = Array.isArray(req?.pickupAssigneeIds) ? (req!.pickupAssigneeIds as string[]) : [];
      await this.campaigns.assignRequestPickup(incident.referenceId, userId, {
        assignmentIds: [...new Set([...current, ...uniqueIds])],
      });
      const rows = await this.prisma.campaignVolunteerAssignment.findMany({
        where: { id: { in: uniqueIds } },
        select: { volunteer: { select: { user: { select: { fullName: true } } } } },
      });
      names = rows.map((r) => r.volunteer.user.fullName);
    } else {
      names = await this.assignDistribution(incident.campaignId, incident.referenceId, uniqueIds);
    }

    await this.prisma.campaignIncident.update({
      where: { id: incidentId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        actionTaken: 'reassigned',
        resolvedNote: `Đã đổi sang ${names.join(', ')}`,
      },
    });
    return { id: incidentId, status: 'resolved', actionTaken: 'reassigned', reassignedTo: names };
  }

  /**
   * Tổ chức phân công (thêm) người đi phát cho một đợt — dùng khi đợt bị bỏ trống vì
   * shipper trả việc, kể cả khi sự cố đã bị đóng mà chưa đổi người. Khép luôn các sự cố
   * "không thể tiếp tục" còn mở của đợt này.
   */
  async reassignDistributionByOwner(distributionId: string, userId: string, ids: string[]) {
    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: distributionId },
      select: { campaignId: true, campaign: { select: { charityReceiver: { select: { userId: true } } } } },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phát.');
    if (dist.campaign.charityReceiver.userId !== userId) {
      throw new ForbiddenException('Chỉ tổ chức chủ chiến dịch mới phân công được.');
    }
    const names = await this.assignDistribution(dist.campaignId, distributionId, [...new Set(ids)]);
    await this.prisma.campaignIncident.updateMany({
      where: { referenceId: distributionId, context: 'distribution', status: 'open', canContinue: false },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        actionTaken: 'reassigned',
        resolvedNote: `Đã đổi sang ${names.join(', ')}`,
      },
    });
    return { id: distributionId, assignedTo: names };
  }

  /** Thêm người đi phát cho đợt (TNV giao hàng & phục vụ đã duyệt), báo người mới. */
  private async assignDistribution(campaignId: string, distributionId: string, uniqueIds: string[]) {
    const dist = await this.prisma.mealDistribution.findFirst({
      where: { id: distributionId, campaignId },
      select: {
        assigneeIds: true,
        completedAt: true,
        roundLabel: true,
        servedByVolunteerId: true,
        campaign: { select: { title: true } },
      },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phát.');
    if (dist.completedAt) throw new BadRequestException('Đợt phát đã chốt xong — không cần đổi người.');
    const valid = await this.prisma.campaignVolunteerAssignment.findMany({
      where: {
        campaignId,
        volunteerId: { in: uniqueIds },
        role: { in: [...OPS_ROLES] },
        status: { in: ['assigned', 'checked_in', 'in_progress', 'completed'] },
      },
      select: { volunteerId: true, volunteer: { select: { userId: true, user: { select: { fullName: true } } } } },
    });
    const byId = new Map(valid.map((v) => [v.volunteerId, v]));
    const missing = uniqueIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new BadRequestException('Người thay phải là TNV giao hàng & phục vụ đã được duyệt của chiến dịch này.');
    }
    const current = Array.isArray(dist.assigneeIds) ? (dist.assigneeIds as string[]) : [];
    await this.prisma.mealDistribution.update({
      where: { id: distributionId },
      data: {
        assigneeIds: [...new Set([...current, ...uniqueIds])],
        // Người đứng tên chính đã bị gỡ (không còn trong danh sách) → chuyển cho người mới.
        ...(current.includes(dist.servedByVolunteerId) ? {} : { servedByVolunteerId: uniqueIds[0] }),
      },
    });
    for (const id of uniqueIds) {
      void this.notifications.notify(byId.get(id)!.volunteer.userId, {
        type: 'campaign',
        title: 'Bạn được phân công đi phát thay',
        body: `Tổ chức giao bạn đợt "${dist.roundLabel ?? 'đợt phát'}" của chiến dịch "${dist.campaign.title}". Vào "Việc của tôi" để xem điểm phát.`,
        data: { campaignId, distributionId },
      });
    }
    return uniqueIds.map((id) => byId.get(id)!.volunteer.user.fullName);
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
      canContinue: r.canContinue,
      delayMinutes: r.delayMinutes,
      actionTaken: r.actionTaken,
      status: r.status,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      createdAt: r.createdAt,
      reporterVolunteerId: r.volunteerId,
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
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedNote: trimmed,
        actionTaken: incident.canContinue ? 'continued' : 'resolved',
      },
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
