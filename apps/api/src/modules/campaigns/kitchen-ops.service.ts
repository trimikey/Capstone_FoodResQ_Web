import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssignmentRole, UserRole } from '@foodresq/types';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import {
  AddMenuItemDto,
  ApplyShiftDto,
  CreateBeneficiaryFeedbackDto,
  CreateDistributionDto,
  CreateMealFeedbackDto,
  CreateSafetyLogDto,
  CreateShiftDto,
} from './dto/kitchen.dto';

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };
const SAFETY_RESULT_VN: Record<string, string> = { pass: 'Đạt', warning: 'Cảnh báo', fail: 'Không đạt' };
const ACTIVE_WORK_ASSIGNMENT_STATUSES = ['assigned', 'checked_in', 'in_progress'] as const;

/**
 * Các thao tác vận hành bếp mở rộng quanh một chiến dịch:
 * - Thực đơn liên kết công thức (chef)
 * - Nhật ký an toàn thực phẩm HACCP-lite (chef)
 * - Phân phát suất ăn theo đợt + phản hồi (waiter)
 * - Ca làm việc (chung)
 */
@Injectable()
export class KitchenOpsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private systemConfig: SystemConfigService,
  ) {}

  /** Lấy chiến dịch và đảm bảo `userId` là tổ chức từ thiện chủ chiến dịch. */
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

  /** Lấy hồ sơ TNV và xác nhận có phân công đang hoạt động cho vai trò trong chiến dịch. */
  private async assertAssignedAs(campaignId: string, userId: string, role: 'chef' | 'waiter') {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { status: true } },
        specializations: {
          where: { specialization: role, isVerified: true },
          select: { id: true },
        },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status !== 'active') {
      throw new ForbiddenException('Tài khoản của bạn chưa ở trạng thái hoạt động, không thể thao tác.');
    }
    if (volunteer.specializations.length === 0) {
      throw new ForbiddenException(`Chuyên môn "${ROLE_VN[role]}" của bạn chưa được xác minh.`);
    }

    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: {
        campaignId,
        volunteerId: volunteer.id,
        role,
        status: { in: [...ACTIVE_WORK_ASSIGNMENT_STATUSES] },
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        `Bạn cần có phân công ${ROLE_VN[role]} đang hoạt động trong chiến dịch này để thao tác.`,
      );
    }
    return volunteer;
  }

  // ── Ca làm việc ──────────────────────────────────────────────────────────────

  async createShift(campaignId: string, userId: string, dto: CreateShiftDto) {
    const campaign = await this.assertCampaignOwner(campaignId, userId);
    if (campaign.status !== 'pending_approval') throw new BadRequestException('Không thêm ca sau khi chiến dịch đã được gửi duyệt.');
    const fixed = [
      ['midnight', '00:00', '06:00', 0], ['morning', '06:00', '12:00', 0],
      ['afternoon', '12:00', '18:00', 0], ['evening', '18:00', '00:00', 1],
    ] as const;
    const period = fixed.find(([, start, end]) => start === dto.startTime && end === dto.endTime);
    if (!period || !dto.role) throw new BadRequestException('Ca phải thuộc một trong bốn khung cố định và có vai trò cụ thể.');
    return this.prisma.campaignShift.create({
      data: {
        campaignId,
        label: dto.label,
        role: dto.role ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
        period: period[0],
        endDayOffset: period[3],
        slotsNeeded: dto.slotsNeeded,
      },
    });
  }

  async listShifts(campaignId: string) {
    return this.prisma.campaignShift.findMany({
      where: { campaignId },
      orderBy: { startTime: 'asc' },
      include: {
        assignments: {
          select: {
            id: true,
            role: true,
            status: true,
            volunteer: { select: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
      },
    });
  }

  /**
   * Legacy shift-application entry point. Assignment approval and slot counting are
   * owned by CampaignsService so this service intentionally no longer writes assignments.
   */
  async resolveShiftApplication(
    campaignId: string,
    shiftId: string,
    dto: ApplyShiftDto,
  ): Promise<{ role: AssignmentRole; shiftId: string }> {
    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca làm việc.');
    }
    const role = shift.role ?? dto.role;
    if (!role) {
      throw new BadRequestException('Ca này là ca chung, vui lòng chọn vai trò bạn muốn đăng ký.');
    }
    return { role: role as AssignmentRole, shiftId: shift.id };
  }

  // ── Thực đơn liên kết công thức ──────────────────────────────────────────────

  async addMenuItem(campaignId: string, userId: string, dto: AddMenuItemDto) {
    await this.assertCampaignOwner(campaignId, userId);
    if (!dto.recipeId && !dto.customName) {
      throw new BadRequestException('Cần chọn một công thức hoặc nhập tên món tự do.');
    }
    if (dto.recipeId) {
      const recipe = await this.prisma.recipe.findFirst({
        where: { id: dto.recipeId, deletedAt: null },
        select: { id: true },
      });
      if (!recipe) throw new NotFoundException('Không tìm thấy công thức.');
    }

    const [item] = await this.prisma.$transaction([
      this.prisma.campaignMenuItem.create({
        data: {
          campaignId,
          recipeId: dto.recipeId ?? null,
          customName: dto.customName ?? null,
          plannedServings: dto.plannedServings ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { recipe: { select: { name: true, servings: true, difficulty: true } } },
      }),
      ...(dto.recipeId
        ? [this.prisma.recipe.update({ where: { id: dto.recipeId }, data: { timesUsed: { increment: 1 } } })]
        : []),
    ]);
    return item;
  }

  async listMenuItems(campaignId: string) {
    return this.prisma.campaignMenuItem.findMany({
      where: { campaignId },
      orderBy: { sortOrder: 'asc' },
      include: {
        recipe: { select: { id: true, name: true, servings: true, difficulty: true, imageUrls: true } },
      },
    });
  }

  async removeMenuItem(itemId: string, userId: string) {
    const item = await this.prisma.campaignMenuItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Không tìm thấy món trong thực đơn.');
    await this.assertCampaignOwner(item.campaignId, userId);
    await this.prisma.$transaction([
      this.prisma.campaignMenuItem.delete({ where: { id: itemId } }),
      ...(item.recipeId
        ? [
            this.prisma.recipe.update({
              where: { id: item.recipeId },
              data: { timesUsed: { decrement: 1 } },
            }),
          ]
        : []),
    ]);
    return { id: itemId, deleted: true };
  }

  // ── Nhật ký an toàn thực phẩm (chef) ─────────────────────────────────────────

  async createSafetyLog(
    campaignId: string,
    userId: string,
    dto: CreateSafetyLogDto,
    photoUrl?: string,
  ) {
    const volunteer = await this.assertAssignedAs(campaignId, userId, 'chef');
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: { charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['approved', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chỉ ghi nhật ký ATTP khi chiến dịch đang chuẩn bị/diễn ra.');
    }

    const log = await this.prisma.kitchenSafetyLog.create({
      data: {
        campaignId,
        checkedByVolunteerId: volunteer.id,
        checkType: dto.checkType,
        measuredValue: dto.measuredValue ?? null,
        result: dto.result ?? 'pass',
        photoUrl: photoUrl ?? null,
        note: dto.note ?? null,
      },
    });

    // Cảnh báo tổ chức chủ chiến dịch nếu kết quả không đạt/cảnh báo
    if (log.result === 'warning' || log.result === 'fail') {
      void this.notifications.notify(campaign.charityReceiver.userId, {
        type: 'campaign',
        title: `Cảnh báo an toàn thực phẩm: ${SAFETY_RESULT_VN[log.result]}`,
        body: `Chiến dịch "${campaign.title}" có một mục kiểm tra ATTP kết quả "${SAFETY_RESULT_VN[log.result]}". Vui lòng kiểm tra.`,
        data: { campaignId, safetyLogId: log.id, result: log.result },
      });
    }
    return log;
  }

  async listSafetyLogs(campaignId: string) {
    return this.prisma.kitchenSafetyLog.findMany({
      where: { campaignId },
      orderBy: { checkedAt: 'desc' },
      include: { checkedBy: { select: { user: { select: { fullName: true } } } } },
    });
  }

  // ── Phân phát suất ăn (waiter) ───────────────────────────────────────────────

  async createDistribution(
    campaignId: string,
    userId: string,
    dto: CreateDistributionDto,
    photoUrl?: string,
  ) {
    const volunteer = await this.assertAssignedAs(campaignId, userId, 'waiter');
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['approved', 'in_progress', 'completed'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch không ở trạng thái cho phép ghi phân phát.');
    }
    if (dto.servingsServed <= 0 || dto.peopleServed <= 0) {
      throw new BadRequestException('Số suất và số người nhận phải lớn hơn 0.');
    }
    if (dto.peopleServed > dto.servingsServed) {
      throw new BadRequestException('Số người nhận không thể lớn hơn số suất đã phát.');
    }
    if ((dto.leftoverServings ?? 0) < 0) {
      throw new BadRequestException('Số suất còn dư không được âm.');
    }
    if ((dto.lng === undefined) !== (dto.lat === undefined)) {
      throw new BadRequestException('Cần cả kinh độ (lng) và vĩ độ (lat) khi gắn vị trí phát.');
    }

    const dist = await this.prisma.mealDistribution.create({
      data: {
        campaignId,
        servedByVolunteerId: volunteer.id,
        roundLabel: dto.roundLabel ?? null,
        servingsServed: dto.servingsServed,
        peopleServed: dto.peopleServed,
        leftoverServings: dto.leftoverServings ?? 0,
        photoUrl: photoUrl ?? null,
        note: dto.note ?? null,
      },
    });

    // Cột location là geography → set qua raw SQL khi có toạ độ
    if (dto.lng !== undefined && dto.lat !== undefined) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE meal_distributions
        SET location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography
        WHERE id = ${dist.id}::uuid
      `);
    }
    return dist;
  }

  async listDistributions(campaignId: string) {
    const rows = await this.prisma.mealDistribution.findMany({
      where: { campaignId },
      orderBy: { distributedAt: 'desc' },
      include: {
        servedBy: { select: { user: { select: { fullName: true } } } },
        _count: { select: { feedback: true } },
      },
    });
    return rows.map((r) => ({
      ...r,
      servedByName: r.servedBy.user.fullName,
      feedbackCount: r._count.feedback,
    }));
  }

  /** Tổng hợp số liệu phân phát của chiến dịch (cho dashboard). */
  async distributionSummary(campaignId: string) {
    const agg = await this.prisma.mealDistribution.aggregate({
      where: { campaignId },
      _sum: { servingsServed: true, peopleServed: true, leftoverServings: true },
      _count: true,
    });
    return {
      rounds: agg._count,
      totalServings: agg._sum.servingsServed ?? 0,
      totalPeople: agg._sum.peopleServed ?? 0,
      totalLeftover: agg._sum.leftoverServings ?? 0,
    };
  }

  /**
   * Phản hồi vận hành do waiter nhập tại điểm phát (không định danh người thụ hưởng).
   * Phản hồi có xác thực danh tính người nhận dùng {@link submitBeneficiaryFeedback}.
   */
  async addFeedback(distributionId: string, userId: string, dto: CreateMealFeedbackDto) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true, volunteerProfile: { select: { id: true } } },
    });
    if (!actor || actor.status !== 'active') {
      throw new ForbiddenException('Tài khoản của bạn chưa ở trạng thái hoạt động.');
    }
    if (actor.role !== UserRole.VOLUNTEER || !actor.volunteerProfile) {
      throw new ForbiddenException('Chỉ tình nguyện viên được phân công mới có thể ghi nhận phản hồi tại điểm phát.');
    }

    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: distributionId },
      select: { id: true, campaignId: true, servedByVolunteerId: true },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phân phát.');
    if (dist.servedByVolunteerId !== actor.volunteerProfile.id) {
      throw new ForbiddenException('Chỉ waiter đã ghi nhận đợt phát này mới có thể nhập phản hồi.');
    }
    return this.prisma.mealFeedback.create({
      data: { distributionId, satisfaction: dto.satisfaction, comment: dto.comment?.trim() || null },
    });
  }

  // ── QR nhận suất ăn + phản hồi có xác thực người thụ hưởng ───────────────────

  /** Người nhận cá nhân đang hoạt động (tổ chức từ thiện không phải người thụ hưởng). */
  private async assertIndividualReceiver(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true, isCharityOrg: true, user: { select: { status: true, role: true } } },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    if (receiver.user.status !== 'active' || receiver.user.role !== UserRole.RECEIVER) {
      throw new ForbiddenException('Tài khoản của bạn chưa ở trạng thái hoạt động.');
    }
    if (receiver.isCharityOrg) {
      throw new ForbiddenException('Tài khoản tổ chức không thể nhận suất ăn với vai trò người thụ hưởng.');
    }
    return receiver;
  }

  /**
   * Cấp mã QR nhận suất ăn cấp tài khoản cho người nhận. Mã cũ chưa dùng bị vô hiệu
   * ngay để mỗi thời điểm chỉ có một mã còn hiệu lực.
   */
  async issueHandoffQr(userId: string) {
    const receiver = await this.assertIndividualReceiver(userId);
    const validMinutes = await this.systemConfig.getNumber('HANDOFF_QR_VALIDITY_MINUTES');
    const expiresAt = new Date(Date.now() + validMinutes * 60 * 1000);

    const token = await this.prisma.$transaction(async (tx) => {
      await tx.receiverHandoffQr.updateMany({
        where: { receiverId: receiver.id, consumedAt: null, qrExpiresAt: { gt: new Date() } },
        data: { qrExpiresAt: new Date() },
      });
      const [row] = await tx.$queryRaw<{ id: string; qr_token: string; qr_expires_at: Date }[]>(Prisma.sql`
        INSERT INTO receiver_handoff_qr_tokens (receiver_id, qr_token, qr_expires_at)
        VALUES (
          ${receiver.id}::uuid,
          encode(gen_random_bytes(32), 'hex'),
          ${expiresAt.toISOString()}::timestamptz
        )
        RETURNING id, qr_token, qr_expires_at
      `);
      return row;
    });

    return { id: token.id, qrToken: token.qr_token, expiresAt: token.qr_expires_at };
  }

  /**
   * Waiter quét QR của người nhận tại một đợt phân phát để lập biên nhận có kiểm chứng.
   * Quét lại cùng người nhận tại cùng đợt phát trả về biên nhận đã có (không tạo trùng).
   */
  async scanHandoff(campaignId: string, distributionId: string, userId: string, qrToken: string) {
    const volunteer = await this.assertAssignedAs(campaignId, userId, 'waiter');

    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: distributionId },
      select: { id: true, campaignId: true },
    });
    if (!dist || dist.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy đợt phân phát trong chiến dịch này.');
    }

    const token = await this.prisma.receiverHandoffQr.findUnique({
      where: { qrToken },
      select: { id: true, receiverId: true, qrExpiresAt: true, consumedAt: true },
    });
    if (!token) throw new NotFoundException('Mã QR không hợp lệ.');

    const existing = await this.prisma.mealHandoff.findUnique({
      where: { distributionId_receiverId: { distributionId, receiverId: token.receiverId } },
      include: { feedback: { select: { id: true } } },
    });
    if (existing) return { ...existing, alreadyRecorded: true };

    if (token.consumedAt) throw new BadRequestException('Mã QR này đã được sử dụng.');
    if (token.qrExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Mã QR đã hết hạn, người nhận cần làm mới mã.');
    }

    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { id: token.receiverId },
      select: { isCharityOrg: true, user: { select: { status: true, role: true } } },
    });
    if (!receiver || receiver.user.status !== 'active' || receiver.user.role !== UserRole.RECEIVER) {
      throw new ForbiddenException('Tài khoản người nhận không ở trạng thái hoạt động.');
    }
    if (receiver.isCharityOrg) {
      throw new ForbiddenException('Tài khoản tổ chức không thể nhận suất ăn với vai trò người thụ hưởng.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.receiverHandoffQr.updateMany({
          where: { id: token.id, consumedAt: null, qrExpiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) {
          const recorded = await tx.mealHandoff.findUnique({
            where: { distributionId_receiverId: { distributionId, receiverId: token.receiverId } },
            include: { feedback: { select: { id: true } } },
          });
          if (recorded) return { ...recorded, alreadyRecorded: true };
          throw new ConflictException('Mã QR này vừa được sử dụng, vui lòng yêu cầu người nhận làm mới mã.');
        }
        const handoff = await tx.mealHandoff.create({
          data: {
            distributionId,
            receiverId: token.receiverId,
            scannedByVolunteerId: volunteer.id,
            qrTokenId: token.id,
          },
        });
        return { ...handoff, alreadyRecorded: false };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Người nhận này đã được ghi nhận tại đợt phát này.');
      }
      throw e;
    }
  }

  /** Biên nhận của chính người nhận, kèm trạng thái đã gửi phản hồi hay chưa. */
  async listMyHandoffs(userId: string) {
    const receiver = await this.assertIndividualReceiver(userId);
    const rows = await this.prisma.mealHandoff.findMany({
      where: { receiverId: receiver.id },
      orderBy: { servedAt: 'desc' },
      take: 50,
      include: {
        feedback: { select: { id: true, satisfaction: true, comment: true, createdAt: true } },
        distribution: {
          select: {
            id: true,
            roundLabel: true,
            distributedAt: true,
            campaign: { select: { id: true, title: true, kitchenAddress: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      servedAt: r.servedAt,
      distributionId: r.distributionId,
      roundLabel: r.distribution.roundLabel,
      distributedAt: r.distribution.distributedAt,
      campaign: r.distribution.campaign,
      hasSubmitted: r.feedback !== null,
      myFeedback: r.feedback,
    }));
  }

  /** Người nhận gửi đúng một phản hồi cho biên nhận của chính mình. */
  async submitBeneficiaryFeedback(
    handoffId: string,
    userId: string,
    dto: CreateBeneficiaryFeedbackDto,
  ) {
    const receiver = await this.assertIndividualReceiver(userId);
    const handoff = await this.prisma.mealHandoff.findUnique({
      where: { id: handoffId },
      select: { id: true, receiverId: true },
    });
    if (!handoff) throw new NotFoundException('Không tìm thấy biên nhận suất ăn.');
    if (handoff.receiverId !== receiver.id) {
      throw new ForbiddenException('Bạn chỉ có thể gửi phản hồi cho suất ăn mình đã nhận.');
    }

    try {
      return await this.prisma.beneficiaryFeedback.create({
        data: { handoffId, satisfaction: dto.satisfaction, comment: dto.comment?.trim() || null },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Bạn đã gửi phản hồi cho suất ăn này.');
      }
      throw e;
    }
  }

  /** Tổng hợp phản hồi có xác thực của chiến dịch — không lộ danh tính người nhận. */
  async beneficiaryFeedbackSummary(campaignId: string) {
    const [handoffCount, agg] = await Promise.all([
      this.prisma.mealHandoff.count({ where: { distribution: { campaignId } } }),
      this.prisma.beneficiaryFeedback.aggregate({
        where: { handoff: { distribution: { campaignId } } },
        _avg: { satisfaction: true },
        _count: { _all: true },
      }),
    ]);
    const avg = agg._avg.satisfaction;
    return {
      verifiedHandoffs: handoffCount,
      feedbackCount: agg._count._all,
      avgSatisfaction: avg === null ? null : Number(avg.toFixed(2)),
    };
  }

  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaign-proofs');
  }
}
