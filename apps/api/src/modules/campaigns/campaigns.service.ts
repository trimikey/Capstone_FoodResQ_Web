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
import { CreateCampaignDto, ApplyCampaignDto } from './dto/campaign.dto';

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
  ) {}

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
        expected_servings, status, created_at, updated_at
      ) VALUES (
        ${receiver.id}::uuid, ${dto.title}, ${dto.description ?? null}, ${dto.kitchenAddress},
        ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
        ${dto.scheduledDate}::date, ${dto.startTime}, ${dto.endTime},
        ${dto.chefSlotsNeeded ?? 0}, ${dto.waiterSlotsNeeded ?? 0}, ${dto.shipperSlotsNeeded ?? 0},
        ${dto.expectedServings ?? null}, 'draft'::campaign_status, NOW(), NOW()
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

  async listOpen() {
    return this.prisma.kitchenCampaign.findMany({
      where: { status: { in: ['open', 'in_progress'] } },
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
      include: { specializations: { select: { specialization: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

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

    const slot = SLOT_FIELD[dto.role];
    const needed = campaign[slot.needed] as number;
    const filled = campaign[slot.filled] as number;
    if (filled >= needed) {
      throw new BadRequestException(`Đã đủ tình nguyện viên vai trò ${roleVN}.`);
    }

    const existing = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { campaignId_volunteerId_role: { campaignId, volunteerId: volunteer.id, role: dto.role } },
    });
    if (existing) throw new ConflictException('Bạn đã đăng ký vai trò này rồi.');

    await this.prisma.$transaction([
      this.prisma.campaignVolunteerAssignment.create({
        data: { campaignId, volunteerId: volunteer.id, role: dto.role, status: 'assigned' },
      }),
      this.prisma.kitchenCampaign.update({
        where: { id: campaignId },
        data: { [slot.filled]: { increment: 1 } },
      }),
    ]);

    return { message: `Đăng ký vai trò ${roleVN} thành công.` };
  }

  /** Lưu ảnh minh chứng (nguyên liệu / món đã nấu / đã giao) của TNV. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'campaign-proofs');
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
}
