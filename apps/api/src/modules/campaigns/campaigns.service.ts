import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCampaignDto, ApplyCampaignDto } from './dto/campaign.dto';

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
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCampaignDto) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

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
        ${dto.expectedServings ?? null}, 'open'::campaign_status, NOW(), NOW()
      )
      RETURNING id
    `);
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
      },
    });
  }

  async myCampaigns(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');
    return this.prisma.kitchenCampaign.findMany({
      where: { charityReceiverId: receiver.id },
      orderBy: { createdAt: 'desc' },
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
}
