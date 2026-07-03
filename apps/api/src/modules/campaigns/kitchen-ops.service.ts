import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { StorageService } from '@/common/storage/storage.service';
import {
  AddMenuItemDto,
  ApplyShiftDto,
  CreateDistributionDto,
  CreateMealFeedbackDto,
  CreateSafetyLogDto,
  CreateShiftDto,
} from './dto/kitchen.dto';

const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };
const SAFETY_RESULT_VN: Record<string, string> = { pass: 'Đạt', warning: 'Cảnh báo', fail: 'Không đạt' };

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

  /** Lấy hồ sơ TNV và xác nhận đã được phân công vai trò `role` trong chiến dịch. */
  private async assertAssignedAs(campaignId: string, userId: string, role: 'chef' | 'waiter') {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      include: { user: { select: { status: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status === 'banned' || volunteer.user.status === 'suspended') {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế, không thể thao tác.');
    }
    const assignment = await this.prisma.campaignVolunteerAssignment.findFirst({
      where: { campaignId, volunteerId: volunteer.id, role },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        `Bạn cần được phân công vai trò "${ROLE_VN[role]}" trong chiến dịch này để thao tác.`,
      );
    }
    return volunteer;
  }

  // ── Ca làm việc ──────────────────────────────────────────────────────────────

  async createShift(campaignId: string, userId: string, dto: CreateShiftDto) {
    await this.assertCampaignOwner(campaignId, userId);
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('Giờ kết thúc ca phải sau giờ bắt đầu.');
    }
    return this.prisma.campaignShift.create({
      data: {
        campaignId,
        label: dto.label,
        role: dto.role ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
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

  /** TNV ứng tuyển vào một ca cụ thể. Bị giới hạn 1 assignment / vai trò / chiến dịch (unique). */
  async applyToShift(campaignId: string, shiftId: string, userId: string, dto: ApplyShiftDto) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      include: {
        specializations: { select: { specialization: true } },
        user: { select: { status: true } },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (volunteer.user.status === 'banned' || volunteer.user.status === 'suspended') {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế, không thể đăng ký.');
    }

    const shift = await this.prisma.campaignShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.campaignId !== campaignId) {
      throw new NotFoundException('Không tìm thấy ca làm việc.');
    }

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    if (!campaign || !['open', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận đăng ký.');
    }

    const role = shift.role ?? dto.role;
    if (!role) throw new BadRequestException('Ca này là ca chung, vui lòng chọn vai trò bạn muốn đăng ký.');

    const roleVN = ROLE_VN[role] ?? role;
    if (!volunteer.specializations.some((s) => s.specialization === role)) {
      throw new BadRequestException(`Bạn chưa đăng ký chuyên môn "${roleVN}".`);
    }
    if (shift.slotsFilled >= shift.slotsNeeded) {
      throw new BadRequestException(`Ca "${shift.label}" đã đủ người.`);
    }

    const existing = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { campaignId_volunteerId_role: { campaignId, volunteerId: volunteer.id, role } },
    });
    if (existing) throw new ConflictException('Bạn đã đăng ký vai trò này trong chiến dịch rồi.');

    await this.prisma.$transaction([
      this.prisma.campaignVolunteerAssignment.create({
        data: { campaignId, volunteerId: volunteer.id, shiftId, role, status: 'assigned' },
      }),
      this.prisma.campaignShift.update({
        where: { id: shiftId },
        data: { slotsFilled: { increment: 1 } },
      }),
    ]);

    return { message: `Đăng ký ca "${shift.label}" (${roleVN}) thành công.` };
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
    if (!['open', 'in_progress'].includes(campaign.status)) {
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
    if (!['open', 'in_progress', 'completed'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch không ở trạng thái cho phép ghi phân phát.');
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

  async addFeedback(distributionId: string, dto: CreateMealFeedbackDto) {
    const dist = await this.prisma.mealDistribution.findUnique({
      where: { id: distributionId },
      select: { id: true },
    });
    if (!dist) throw new NotFoundException('Không tìm thấy đợt phân phát.');
    return this.prisma.mealFeedback.create({
      data: { distributionId, satisfaction: dto.satisfaction, comment: dto.comment ?? null },
    });
  }

  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaign-proofs');
  }
}
