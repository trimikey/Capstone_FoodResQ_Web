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
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { CreateCampaignDto, ApplyCampaignDto, SubmitCampaignChangeDto } from './dto/campaign.dto';

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

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private systemConfig: SystemConfigService,
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

    const [row] = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO kitchen_campaigns (
        charity_receiver_id, title, description, kitchen_address, kitchen_location,
        scheduled_date, start_time, end_time,
        chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
        expected_servings, image_urls, menu_items, schedule_items, supply_items,
        status, created_at, updated_at
      ) VALUES (
        ${receiver.id}::uuid, ${dto.title}, ${dto.description ?? null}, ${dto.kitchenAddress},
        ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
        ${dto.scheduledDate}::date, ${dto.startTime}, ${dto.endTime},
        ${dto.chefSlotsNeeded ?? 0}, ${dto.waiterSlotsNeeded ?? 0}, ${dto.shipperSlotsNeeded ?? 0},
        ${dto.expectedServings ?? null}, ${JSON.stringify(dto.imageUrls ?? [])}::jsonb,
        ${JSON.stringify(dto.menuItems ?? [])}::jsonb,
        ${JSON.stringify(dto.scheduleItems ?? [])}::jsonb,
        ${JSON.stringify(dto.supplyItems ?? [])}::jsonb,
        'draft'::campaign_status, NOW(), NOW()
      )
      RETURNING id
    `);

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
        data: { campaignId: row.id, status: 'draft' },
      });
    }

    return this.findOne(row.id);
  }

  /**
   * Tự động huỷ chiến dịch 'open' đã qua ngày diễn ra (tổ chức chưa bấm "Bắt đầu").
   * Chạy định kỳ qua CampaignsCron. 'in_progress' không đụng tới (để tổ chức kết thúc & nhập số suất).
   */
  async expireOverdueCampaigns(): Promise<number> {
    const overdue = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'open', scheduledDate: { lt: this.startOfTodayUTC() } },
      select: { id: true, title: true, charityReceiver: { select: { userId: true } } },
    });
    if (overdue.length === 0) return 0;

    await this.prisma.kitchenCampaign.updateMany({
      where: { id: { in: overdue.map((c) => c.id) } },
      data: { status: 'cancelled' },
    });

    for (const c of overdue) {
      void this.notifications.notify(c.charityReceiver.userId, {
        type: 'campaign',
        title: 'Chiến dịch đã quá hạn',
        body: `Chiến dịch "${c.title}" đã qua ngày diễn ra mà chưa được bắt đầu nên đã tự động huỷ.`,
        data: { campaignId: c.id, status: 'cancelled' },
      });
    }
    return overdue.length;
  }

  /** Danh sách chiến dịch ĐÃ HOÀN THÀNH (success stories) — cho mục "câu chuyện thành công". */
  async listCompleted() {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: { status: 'completed' },
      orderBy: { scheduledDate: 'desc' },
      take: 50,
      select: {
        id: true, title: true, description: true, scheduledDate: true, kitchenAddress: true,
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
        scheduledDate: true, startTime: true, endTime: true,
        kitchenAddress: true, imageUrls: true, status: true,
        charityReceiver: { select: { organizationName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      scheduledDate: r.scheduledDate,
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
        scheduledDate: true, startTime: true, endTime: true, kitchenAddress: true, imageUrls: true,
        chefSlotsNeeded: true, waiterSlotsNeeded: true, shipperSlotsNeeded: true,
        chefSlotsFilled: true, waiterSlotsFilled: true, shipperSlotsFilled: true,
        expectedServings: true, actualServings: true, menuItems: true, scheduleItems: true, supplyItems: true,
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        // Chỉ người đã được duyệt (không hiện pending/rejected/cancelled)
        assignments: {
          where: { status: { in: ['assigned', 'checked_in', 'in_progress', 'completed', 'absent'] } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, role: true, status: true,
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
      },
    });
    if (!c || !['open', 'in_progress', 'completed'].includes(c.status)) {
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
    return this.prisma.kitchenCampaign.findMany({
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
  }

  async myCampaigns(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    return this.prisma.kitchenCampaign.findMany({
      where: { charityReceiverId: receiver.id },
      orderBy: { createdAt: 'desc' },
      include: {
        donations: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, itemName: true, quantity: true, note: true, status: true, provider: { select: { businessName: true } } },
        },
      },
    });
  }

  /** Việc của tình nguyện viên: các campaign đã đăng ký + vai trò + trạng thái. */
  async myAssignments(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    return this.prisma.campaignVolunteerAssignment.findMany({
      where: { volunteerId: volunteer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            kitchenAddress: true,
            scheduledDate: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: {
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        assignments: {
          select: {
            id: true,
            role: true,
            status: true,
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
    return campaign;
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

    const slot = SLOT_FIELD[dto.role];
    const needed = campaign[slot.needed] as number;
    const filled = campaign[slot.filled] as number;
    if (filled >= needed) {
      throw new BadRequestException(`Đã đủ tình nguyện viên vai trò ${roleVN}.`);
    }

    const existing = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { campaignId_volunteerId_role: { campaignId, volunteerId: volunteer.id, role: dto.role } },
    });
    if (existing) {
      // Cho đăng ký lại nếu lần trước bị từ chối/huỷ; còn pending/đã duyệt thì chặn.
      if (existing.status === 'rejected' || existing.status === 'cancelled') {
        await this.prisma.campaignVolunteerAssignment.update({
          where: { id: existing.id },
          data: { status: 'pending', notes: null },
        });
        return { message: `Đã gửi lại đăng ký vai trò ${roleVN}. Vui lòng chờ quản trị viên duyệt.` };
      }
      throw new ConflictException('Bạn đã đăng ký vai trò này rồi.');
    }

    // Đăng ký vào trạng thái 'pending' — CHỜ admin duyệt mới được nhận (không tăng slot ngay).
    await this.prisma.campaignVolunteerAssignment.create({
      data: { campaignId, volunteerId: volunteer.id, role: dto.role, status: 'pending' },
    });

    return { message: `Đã gửi đăng ký vai trò ${roleVN}. Vui lòng chờ quản trị viên duyệt.` };
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

  /** Tổ chức: bắt đầu chiến dịch (open → in_progress) khi tới ngày diễn ra. */
  async startCampaign(campaignId: string, userId: string) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'open') {
      throw new BadRequestException('Chỉ bắt đầu được chiến dịch đang ở trạng thái "Đang tuyển".');
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

  /** Tổ chức: kết thúc chiến dịch + nhập số suất thực tế (in_progress → completed). */
  async completeCampaign(campaignId: string, userId: string, actualServings: number) {
    const campaign = await this.assertOwner(campaignId, userId);
    if (campaign.status !== 'in_progress') {
      throw new BadRequestException('Chỉ kết thúc được chiến dịch đang diễn ra.');
    }
    await this.prisma.kitchenCampaign.update({
      where: { id: campaignId },
      data: { status: 'completed', actualServings },
    });
    return this.findOne(campaignId);
  }

  /**
   * TNV chuyển bước công việc của mình: assigned → checked_in → in_progress → completed.
   * Đính kèm ảnh minh chứng theo bước/vai trò; hoàn thành thì cộng điểm cống hiến.
   */
  async advanceTask(assignmentId: string, userId: string, proofUrl?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const a = await this.prisma.campaignVolunteerAssignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Không tìm thấy công việc.');
    if (a.volunteerId !== volunteer.id) throw new ForbiddenException('Đây không phải công việc của bạn.');

    const next = ASSIGN_NEXT[a.status];
    if (!next) throw new BadRequestException('Công việc đã hoàn tất hoặc không thể chuyển bước.');

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

    await this.prisma.campaignVolunteerAssignment.update({ where: { id: assignmentId }, data });
    return { id: assignmentId, status: next };
  }

  /** Nhà cung cấp quyên góp nguyên liệu cho chiến dịch (đang tuyển/đang diễn ra). */
  async pledgeDonation(campaignId: string, providerUserId: string, dto: { itemName: string; quantity?: string; note?: string }) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { userId: providerUserId } });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id: campaignId },
      include: { charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    if (!['open', 'in_progress'].includes(campaign.status)) {
      throw new BadRequestException('Chiến dịch này không còn nhận quyên góp.');
    }

    const donation = await this.prisma.campaignDonation.create({
      data: {
        campaignId,
        providerId: provider.id,
        itemName: dto.itemName,
        quantity: dto.quantity ?? null,
        note: dto.note ?? null,
        status: 'pledged',
      },
    });

    // Báo cho tổ chức chủ chiến dịch
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: 'Có quyên góp nguyên liệu mới',
      body: `"${provider.businessName}" muốn góp ${dto.quantity ? dto.quantity + ' ' : ''}${dto.itemName} cho chiến dịch "${campaign.title}".`,
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
      dto.scheduledDate, dto.startTime, dto.endTime, dto.kitchenAddress,
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
}
