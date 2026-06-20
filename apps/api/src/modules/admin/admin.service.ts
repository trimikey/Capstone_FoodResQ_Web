import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  ReviewVerificationDto,
  ResolveReportDto,
  SetUserStatusDto,
  AdminCreateCampaignDto,
  AdminUpdateCampaignDto,
  AdminCreateUserDto,
} from './dto/admin.dto';

const SLOT_FIELD: Record<string, { needed: keyof Prisma.KitchenCampaignUpdateInput; filled: keyof Prisma.KitchenCampaignUpdateInput }> = {
  chef: { needed: 'chefSlotsNeeded', filled: 'chefSlotsFilled' },
  waiter: { needed: 'waiterSlotsNeeded', filled: 'waiterSlotsFilled' },
  shipper: { needed: 'shipperSlotsNeeded', filled: 'shipperSlotsFilled' },
};
const ROLE_VN: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

interface FrequentCancellerRow {
  id: string;
  full_name: string;
  email: string;
  status: string;
  trust_score: number;
  cancelled: number;
  no_show: number;
  total: number;
  last_reason: string | null;
}

type ProfileType = 'provider' | 'volunteer' | 'receiver';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private systemConfig: SystemConfigService,
  ) {}

  /** Cấu hình hệ thống (admin chỉnh được). */
  getConfigs() {
    return this.systemConfig.getAll();
  }

  setConfig(key: string, value: number, userId: string) {
    return this.systemConfig.set(key, value, userId);
  }

  /** Số liệu tổng quan cho dashboard admin. */
  async getStats() {
    const [users, providers, volunteers, receivers, listingsActive, reservations, pendingReports] =
      await this.prisma.$transaction([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.providerProfile.count(),
        this.prisma.volunteerProfile.count(),
        this.prisma.receiverProfile.count(),
        this.prisma.foodListing.count({ where: { status: 'active', deletedAt: null } }),
        this.prisma.reservation.count(),
        this.prisma.report.count({ where: { status: 'pending' } }),
      ]);

    const pendingVerifications = await this.countPendingVerifications();

    return {
      users,
      providers,
      volunteers,
      receivers,
      listingsActive,
      reservations,
      pendingReports,
      pendingVerifications,
    };
  }

  /**
   * Tổng quan dashboard — TẤT CẢ số liệu thật, gộp trong 1 lần gọi.
   * kg cứu trợ, CO2 tránh, danh mục, xu hướng 6 tháng, trạng thái quyên góp, khiếu nại.
   */
  async getOverview() {
    const CO2_PER_KG = 2.5;

    const [agg] = await this.prisma.$queryRaw<{ kg: number | null; meals: bigint; people: bigint }[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)) FILTER (WHERE r.status = 'completed'), 0) AS kg,
        COUNT(*) FILTER (WHERE r.status = 'completed') AS meals,
        COUNT(DISTINCT r.receiver_id) FILTER (WHERE r.status = 'completed') AS people
      FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id
    `);

    const catRows = await this.prisma.$queryRaw<{ category: string; kg: number | null }[]>(Prisma.sql`
      SELECT fl.category::text AS category,
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)) FILTER (WHERE r.status = 'completed'), 0) AS kg
      FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id
      GROUP BY fl.category
      ORDER BY kg DESC
    `);

    const trendRows = await this.prisma.$queryRaw<{ ym: string; kg: number | null }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS ym,
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0)) FILTER (WHERE r.status = 'completed'), 0) AS kg
      FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id
      WHERE r.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY 1 ORDER BY 1
    `);

    const statusRows = await this.prisma.$queryRaw<{ status: string; c: bigint }[]>(Prisma.sql`
      SELECT status::text AS status, COUNT(*) AS c FROM reservations GROUP BY status
    `);

    const [reportRow] = await this.prisma.$queryRaw<{ total: bigint; pending: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM reports
    `);

    const stats = await this.getStats();
    const newUsers = await this.prisma.user.count({
      where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    });
    const kg = Math.round(Number(agg?.kg ?? 0) * 10) / 10;
    const statusCount = (s: string) => Number(statusRows.find((r) => r.status === s)?.c ?? 0);

    return {
      ...stats,
      newUsers,
      kgRescued: kg,
      co2SavedKg: Math.round(kg * CO2_PER_KG * 10) / 10,
      mealsServed: Number(agg?.meals ?? 0),
      peopleHelped: Number(agg?.people ?? 0),
      categories: catRows
        .map((c) => ({ category: c.category, kg: Math.round(Number(c.kg ?? 0) * 10) / 10 }))
        .filter((c) => c.kg > 0),
      trend: trendRows.map((t) => ({ ym: t.ym, kg: Math.round(Number(t.kg ?? 0) * 10) / 10 })),
      donations: {
        confirmed: statusCount('confirmed'),
        pickedUp: statusCount('picked_up'),
        completed: statusCount('completed'),
        cancelled: statusCount('cancelled') + statusCount('no_show') + statusCount('expired'),
      },
      reports: { total: Number(reportRow?.total ?? 0), pending: Number(reportRow?.pending ?? 0) },
    };
  }

  /** Tất cả chiến dịch bếp ăn (mọi trạng thái) cho admin quản lý. */
  async listCampaigns(status?: string) {
    const rows = await this.prisma.kitchenCampaign.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { scheduledDate: 'desc' },
      select: {
        id: true,
        title: true,
        kitchenAddress: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        status: true,
        expectedServings: true,
        chefSlotsNeeded: true,
        waiterSlotsNeeded: true,
        shipperSlotsNeeded: true,
        chefSlotsFilled: true,
        waiterSlotsFilled: true,
        shipperSlotsFilled: true,
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true } } } },
        _count: { select: { assignments: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      kitchenAddress: c.kitchenAddress,
      scheduledDate: c.scheduledDate,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
      expectedServings: c.expectedServings,
      charity: c.charityReceiver.organizationName || c.charityReceiver.user.fullName,
      slotsNeeded: c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded,
      slotsFilled: c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled,
      volunteers: c._count.assignments,
    }));
  }

  /** Chi tiết một chiến dịch + danh sách tình nguyện viên (vai trò, điểm danh, trạng thái). */
  async getCampaignDetail(id: string) {
    const c = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: {
        charityReceiver: { select: { organizationName: true, user: { select: { fullName: true, phone: true } } } },
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            status: true,
            checkInTime: true,
            checkOutTime: true,
            pointsAwarded: true,
            volunteer: { select: { user: { select: { fullName: true, phone: true, avatarUrl: true } } } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Không tìm thấy chiến dịch.');

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      kitchenAddress: c.kitchenAddress,
      scheduledDate: c.scheduledDate,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
      expectedServings: c.expectedServings,
      actualServings: c.actualServings,
      charity: c.charityReceiver.organizationName || c.charityReceiver.user.fullName,
      charityPhone: c.charityReceiver.user.phone,
      slots: {
        chef: { needed: c.chefSlotsNeeded, filled: c.chefSlotsFilled },
        waiter: { needed: c.waiterSlotsNeeded, filled: c.waiterSlotsFilled },
        shipper: { needed: c.shipperSlotsNeeded, filled: c.shipperSlotsFilled },
      },
      assignments: c.assignments.map((a) => ({
        id: a.id,
        role: a.role,
        status: a.status,
        checkInTime: a.checkInTime,
        checkOutTime: a.checkOutTime,
        pointsAwarded: a.pointsAwarded,
        fullName: a.volunteer.user.fullName,
        phone: a.volunteer.user.phone,
        avatarUrl: a.volunteer.user.avatarUrl,
      })),
    };
  }

  /** Danh sách tổ chức/người nhận để chọn chủ chiến dịch khi admin tạo. */
  async listCharities() {
    const rows = await this.prisma.receiverProfile.findMany({
      select: { id: true, organizationName: true, isCharityOrg: true, user: { select: { fullName: true } } },
      take: 200,
    });
    return rows
      .map((r) => ({ id: r.id, name: r.organizationName || r.user.fullName, isCharityOrg: r.isCharityOrg }))
      .sort((a, b) => Number(b.isCharityOrg) - Number(a.isCharityOrg));
  }

  /** Danh sách tình nguyện viên đầy đủ cho trang quản lý. */
  async listVolunteersDetailed() {
    const rows = await this.prisma.volunteerProfile.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        isAvailable: true,
        dedicationPoints: true,
        rank: true,
        vehicleType: true,
        avgRating: true,
        verificationStatus: true,
        user: { select: { id: true, fullName: true, email: true, phone: true, status: true, avatarUrl: true } },
        specializations: { select: { specialization: true, isVerified: true } },
        _count: { select: { campaignAssignments: true, deliveries: true } },
      },
    });
    return rows.map((v) => ({
      volunteerId: v.id,
      userId: v.user.id,
      fullName: v.user.fullName,
      email: v.user.email,
      phone: v.user.phone,
      accountStatus: v.user.status,
      avatarUrl: v.user.avatarUrl,
      isAvailable: v.isAvailable,
      dedicationPoints: v.dedicationPoints,
      rank: v.rank,
      vehicleType: v.vehicleType,
      avgRating: v.avgRating ? Number(v.avgRating) : null,
      verificationStatus: v.verificationStatus,
      specializations: v.specializations.map((s) => ({ specialization: s.specialization, isVerified: s.isVerified })),
      campaigns: v._count.campaignAssignments,
      deliveries: v._count.deliveries,
    }));
  }

  /** Danh sách TNV để gán (lọc theo chuyên môn nếu có). */
  async listVolunteersForAssign(role?: string) {
    const rows = await this.prisma.volunteerProfile.findMany({
      where: role ? { specializations: { some: { specialization: role as never } } } : {},
      select: {
        id: true,
        user: { select: { fullName: true } },
        specializations: { select: { specialization: true, isVerified: true } },
      },
      take: 200,
    });
    return rows.map((v) => ({
      volunteerId: v.id,
      fullName: v.user.fullName,
      specializations: v.specializations.map((s) => s.specialization),
    }));
  }

  /** Admin tạo chiến dịch (gán cho một tổ chức/người nhận). */
  async adminCreateCampaign(dto: AdminCreateCampaignDto) {
    const charity = await this.prisma.receiverProfile.findUnique({ where: { id: dto.charityReceiverId } });
    if (!charity) throw new NotFoundException('Không tìm thấy tổ chức/người nhận được chọn.');

    const lng = dto.lng ?? 106.6297;
    const lat = dto.lat ?? 10.8231;
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO kitchen_campaigns (
        charity_receiver_id, title, description, kitchen_address, kitchen_location,
        scheduled_date, start_time, end_time,
        chef_slots_needed, waiter_slots_needed, shipper_slots_needed,
        expected_servings, status, created_at, updated_at
      ) VALUES (
        ${dto.charityReceiverId}::uuid, ${dto.title}, ${dto.description ?? null}, ${dto.kitchenAddress},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${dto.scheduledDate}::date, ${dto.startTime}, ${dto.endTime},
        ${dto.chefSlotsNeeded ?? 0}, ${dto.waiterSlotsNeeded ?? 0}, ${dto.shipperSlotsNeeded ?? 0},
        ${dto.expectedServings ?? null}, 'open'::campaign_status, NOW(), NOW()
      )
      RETURNING id
    `);
    return this.getCampaignDetail(row.id);
  }

  /** Admin sửa thông tin chiến dịch (các trường scalar; không đụng toạ độ bếp). */
  async adminUpdateCampaign(id: string, dto: AdminUpdateCampaignDto) {
    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    const data: Prisma.KitchenCampaignUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.kitchenAddress !== undefined) data.kitchenAddress = dto.kitchenAddress;
    if (dto.scheduledDate !== undefined) data.scheduledDate = new Date(dto.scheduledDate);
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.endTime !== undefined) data.endTime = dto.endTime;
    if (dto.expectedServings !== undefined) data.expectedServings = dto.expectedServings;
    // Không cho hạ slot cần xuống dưới số đã có người
    if (dto.chefSlotsNeeded !== undefined) {
      if (dto.chefSlotsNeeded < campaign.chefSlotsFilled) throw new BadRequestException('Số slot Đầu bếp không thể nhỏ hơn số đã có người.');
      data.chefSlotsNeeded = dto.chefSlotsNeeded;
    }
    if (dto.waiterSlotsNeeded !== undefined) {
      if (dto.waiterSlotsNeeded < campaign.waiterSlotsFilled) throw new BadRequestException('Số slot Phục vụ không thể nhỏ hơn số đã có người.');
      data.waiterSlotsNeeded = dto.waiterSlotsNeeded;
    }
    if (dto.shipperSlotsNeeded !== undefined) {
      if (dto.shipperSlotsNeeded < campaign.shipperSlotsFilled) throw new BadRequestException('Số slot Giao hàng không thể nhỏ hơn số đã có người.');
      data.shipperSlotsNeeded = dto.shipperSlotsNeeded;
    }

    await this.prisma.kitchenCampaign.update({ where: { id }, data });
    return this.getCampaignDetail(id);
  }

  /** Admin gán một TNV vào chiến dịch theo vai trò (kiểm tra slot + trùng; chuyên môn bỏ qua nếu override). */
  async adminAssignVolunteer(campaignId: string, volunteerId: string, role: string, override = false) {
    const slot = SLOT_FIELD[role];
    if (!slot) throw new BadRequestException('Vai trò không hợp lệ.');

    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { id: volunteerId },
      include: { specializations: { select: { specialization: true } }, user: { select: { id: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy tình nguyện viên.');
    if (!override && !volunteer.specializations.some((s) => s.specialization === role)) {
      throw new BadRequestException(`Tình nguyện viên này không có chuyên môn "${ROLE_VN[role]}". Bật "gán vượt chuyên môn" nếu vẫn muốn gán.`);
    }

    const campaign = await this.prisma.kitchenCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    const needed = campaign[slot.needed as keyof typeof campaign] as number;
    const filled = campaign[slot.filled as keyof typeof campaign] as number;
    if (filled >= needed) throw new BadRequestException(`Đã đủ tình nguyện viên vai trò ${ROLE_VN[role]}.`);

    const existing = await this.prisma.campaignVolunteerAssignment.findUnique({
      where: { campaignId_volunteerId_role: { campaignId, volunteerId, role: role as never } },
    });
    if (existing) throw new ConflictException('Tình nguyện viên đã được gán vai trò này.');

    await this.prisma.$transaction([
      this.prisma.campaignVolunteerAssignment.create({
        data: { campaignId, volunteerId, role: role as never, status: 'assigned' },
      }),
      this.prisma.kitchenCampaign.update({ where: { id: campaignId }, data: { [slot.filled]: { increment: 1 } } }),
    ]);

    void this.notifications.notify(volunteer.user.id, {
      type: 'campaign',
      title: 'Bạn được phân công',
      body: `Quản trị viên đã phân công bạn vai trò ${ROLE_VN[role]} cho chiến dịch "${campaign.title}".`,
      data: { campaignId, role },
    });

    return this.getCampaignDetail(campaignId);
  }

  /** Admin gỡ một phân công khỏi chiến dịch. */
  async adminUnassignVolunteer(assignmentId: string) {
    const a = await this.prisma.campaignVolunteerAssignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Không tìm thấy phân công.');
    const slot = SLOT_FIELD[a.role];

    await this.prisma.$transaction([
      this.prisma.campaignVolunteerAssignment.delete({ where: { id: assignmentId } }),
      this.prisma.kitchenCampaign.update({ where: { id: a.campaignId }, data: { [slot.filled]: { decrement: 1 } } }),
    ]);

    return this.getCampaignDetail(a.campaignId);
  }

  /** Admin đổi trạng thái chiến dịch (giám sát: mở/đang chạy/hoàn tất/huỷ). */
  async setCampaignStatus(id: string, status: string, _userId: string) {
    const allowed = ['draft', 'open', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) throw new BadRequestException('Trạng thái không hợp lệ.');
    const campaign = await this.prisma.kitchenCampaign.findUnique({
      where: { id },
      include: { charityReceiver: { select: { userId: true } } },
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');

    await this.prisma.kitchenCampaign.update({ where: { id }, data: { status: status as never } });

    const STATUS_VN: Record<string, string> = {
      draft: 'nháp', open: 'đang tuyển', in_progress: 'đang diễn ra', completed: 'đã hoàn tất', cancelled: 'đã huỷ',
    };
    void this.notifications.notify(campaign.charityReceiver.userId, {
      type: 'campaign',
      title: 'Cập nhật chiến dịch',
      body: `Chiến dịch "${campaign.title}" được quản trị viên chuyển sang trạng thái: ${STATUS_VN[status] ?? status}.`,
      data: { campaignId: id, status },
    });

    return { id, status };
  }

  /** Đơn nhận gần đây nhất cho bảng quản lý quyên góp. */
  async listRecentReservations(limit = 10) {
    const rows = await this.prisma.reservation.findMany({
      take: Math.min(limit, 50),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        quantity: true,
        createdAt: true,
        listing: {
          select: {
            title: true,
            category: true,
            quantityUnit: true,
            provider: { select: { businessName: true } },
          },
        },
        receiver: { select: { user: { select: { fullName: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      quantity: r.quantity,
      createdAt: r.createdAt,
      title: r.listing.title,
      category: r.listing.category,
      quantityUnit: r.listing.quantityUnit,
      provider: r.listing.provider.businessName,
      receiver: r.receiver.user.fullName,
    }));
  }

  /**
   * Người dùng hay huỷ / không đến — gộp đếm theo receiver, sắp xếp giảm dần.
   * Giúp admin phát hiện người lạm dụng (đặt rồi bỏ, giữ suất của người khác).
   */
  async listFrequentCancellers() {
    const rows = await this.prisma.$queryRaw<FrequentCancellerRow[]>(Prisma.sql`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.status::text AS status,
        u.trust_score,
        COUNT(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE r.status = 'no_show')::int AS no_show,
        COUNT(*)::int AS total,
        (
          SELECT r2.cancellation_reason
          FROM reservations r2
          WHERE r2.receiver_id = rp.id AND r2.cancellation_reason IS NOT NULL
          ORDER BY r2.cancelled_at DESC NULLS LAST
          LIMIT 1
        ) AS last_reason
      FROM reservations r
      JOIN receiver_profiles rp ON rp.id = r.receiver_id
      JOIN users u ON u.id = rp.user_id
      GROUP BY u.id, u.full_name, u.email, u.status, u.trust_score, rp.id
      HAVING COUNT(*) FILTER (WHERE r.status IN ('cancelled', 'no_show')) > 0
      ORDER BY COUNT(*) FILTER (WHERE r.status IN ('cancelled', 'no_show')) DESC, u.trust_score ASC
      LIMIT 50
    `);

    return rows.map((r) => {
      const badCount = r.cancelled + r.no_show;
      return {
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        status: r.status,
        trustScore: r.trust_score,
        cancelled: r.cancelled,
        noShow: r.no_show,
        total: r.total,
        cancelRate: r.total > 0 ? Math.round((badCount / r.total) * 100) : 0,
        lastReason: r.last_reason,
      };
    });
  }

  private async countPendingVerifications() {
    const [p, v] = await this.prisma.$transaction([
      this.prisma.providerProfile.count({ where: { verificationStatus: 'pending' } }),
      this.prisma.volunteerProfile.count({ where: { verificationStatus: 'pending' } }),
    ]);
    return p + v;
  }

  /** Danh sách hồ sơ chờ duyệt (provider + volunteer) — gộp về một mảng thống nhất. */
  async listVerifications() {
    const providers = await this.prisma.providerProfile.findMany({
      where: { verificationStatus: 'pending' },
      select: {
        id: true,
        businessName: true,
        businessType: true,
        address: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const volunteers = await this.prisma.volunteerProfile.findMany({
      where: { verificationStatus: 'pending' },
      select: {
        id: true,
        vehicleType: true,
        vehiclePlate: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true, phone: true } },
        specializations: { select: { specialization: true, isVerified: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return [
      ...providers.map((p) => ({
        type: 'provider' as ProfileType,
        profileId: p.id,
        userId: p.user.id,
        fullName: p.user.fullName,
        email: p.user.email,
        phone: p.user.phone,
        detail: `${p.businessName} · ${p.businessType} · ${p.address}`,
        createdAt: p.createdAt,
      })),
      ...volunteers.map((v) => ({
        type: 'volunteer' as ProfileType,
        profileId: v.id,
        userId: v.user.id,
        fullName: v.user.fullName,
        email: v.user.email,
        phone: v.user.phone,
        detail: `TNV · ${v.vehicleType ?? 'chưa rõ xe'} ${v.vehiclePlate ?? ''} · ${v.specializations.map((s) => s.specialization).join(', ') || 'chưa có chuyên môn'}`,
        createdAt: v.createdAt,
      })),
    ].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  /** Duyệt/từ chối hồ sơ. Approved → kích hoạt tài khoản + verify chuyên môn shipper (nếu TNV). */
  async reviewVerification(
    type: ProfileType,
    profileId: string,
    adminUserId: string,
    dto: ReviewVerificationDto,
  ) {
    const status = dto.decision; // 'approved' | 'rejected'
    const now = new Date();
    let targetUserId = '';

    if (type === 'provider') {
      const profile = await this.prisma.providerProfile.findUnique({ where: { id: profileId } });
      if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ cửa hàng.');
      targetUserId = profile.userId;
      await this.prisma.$transaction([
        this.prisma.providerProfile.update({
          where: { id: profileId },
          data: {
            verificationStatus: status,
            isVerified: status === 'approved',
            verifiedAt: status === 'approved' ? now : null,
            verifiedBy: adminUserId,
          },
        }),
        this.prisma.user.update({
          where: { id: profile.userId },
          data: { status: status === 'approved' ? 'active' : 'suspended' },
        }),
      ]);
    } else if (type === 'volunteer') {
      const profile = await this.prisma.volunteerProfile.findUnique({ where: { id: profileId } });
      if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
      targetUserId = profile.userId;
      await this.prisma.$transaction([
        this.prisma.volunteerProfile.update({
          where: { id: profileId },
          data: { verificationStatus: status, verifiedAt: status === 'approved' ? now : null, verifiedBy: adminUserId },
        }),
        this.prisma.user.update({
          where: { id: profile.userId },
          data: { status: status === 'approved' ? 'active' : 'suspended' },
        }),
        // Duyệt TNV → xác minh luôn các chuyên môn (cho phép nhận đơn shipper)
        ...(status === 'approved'
          ? [
              this.prisma.volunteerSpecializationEntry.updateMany({
                where: { volunteerId: profileId },
                data: { isVerified: true, verifiedAt: now },
              }),
            ]
          : []),
      ]);
    } else {
      throw new BadRequestException('Loại hồ sơ không được hỗ trợ.');
    }

    await this.audit(adminUserId, `verification_${status}`, type, profileId, { note: dto.note });
    if (targetUserId) {
      await this.notifications.notify(targetUserId, {
        type: 'verification',
        title: status === 'approved' ? 'Hồ sơ đã được duyệt' : 'Hồ sơ bị từ chối',
        body:
          status === 'approved'
            ? 'Tài khoản của bạn đã được kích hoạt. Bắt đầu sử dụng FoodResQ ngay!'
            : `Hồ sơ chưa đạt yêu cầu.${dto.note ? ' Lý do: ' + dto.note : ''}`,
        data: { decision: status },
      });
    }
    return { message: status === 'approved' ? 'Đã duyệt hồ sơ' : 'Đã từ chối hồ sơ' };
  }

  /** Danh sách báo cáo theo trạng thái. */
  async listReports(status?: string) {
    const reports = await this.prisma.report.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { reporter: { select: { fullName: true, email: true } } },
    });
    return reports;
  }

  async resolveReport(id: string, adminUserId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Không tìm thấy báo cáo.');

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: dto.status,
        resolverId: adminUserId,
        resolutionNote: dto.resolutionNote ?? null,
        resolvedAt: new Date(),
      },
    });
    await this.audit(adminUserId, `report_${dto.status}`, 'report', id, {});
    return updated;
  }

  async listUsers(role?: string, q?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role ? { role: role as never } : {}),
        ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        trustScore: true,
        avatarUrl: true,
        createdAt: true,
        volunteerProfile: {
          select: { specializations: { select: { specialization: true, isVerified: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // Gắn mảng chuyên môn TNV (chef/waiter/shipper) phẳng để FE dễ render
    return users.map(({ volunteerProfile, ...u }) => ({
      ...u,
      specializations: volunteerProfile?.specializations ?? [],
    }));
  }

  /** Admin tạo tài khoản mới (tạo user + profile theo role, không cấp token). */
  async adminCreateUser(dto: AdminCreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email này đã được đăng ký.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role as never,
          phone: dto.phone ?? null,
          status: 'active',
        },
      });
      if (dto.role === 'receiver') {
        await tx.receiverProfile.create({ data: { userId: created.id, address: dto.address ?? null } });
      } else if (dto.role === 'volunteer') {
        const vp = await tx.volunteerProfile.create({ data: { userId: created.id } });
        if (dto.volunteerRole) {
          await tx.volunteerSpecializationEntry.create({
            data: { volunteerId: vp.id, specialization: dto.volunteerRole as never },
          });
        }
      } else if (dto.role === 'provider') {
        await tx.providerProfile.create({
          data: {
            userId: created.id,
            businessName: dto.businessName ?? dto.fullName,
            businessType: 'other' as never,
            address: dto.address ?? '',
          },
        });
      }
      return created;
    });

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, status: user.status };
  }

  /** Đổi trạng thái tài khoản. Ban → thu hồi toàn bộ refresh token (CLAUDE.md §2.5). */
  async setUserStatus(id: string, adminUserId: string, dto: SetUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    if (user.role === 'admin') throw new BadRequestException('Không thể đổi trạng thái tài khoản admin');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: dto.status } }),
      ...(dto.status === 'banned'
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId: id, isRevoked: false },
              data: { isRevoked: true, revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
    await this.audit(adminUserId, `user_${dto.status}`, 'user', id, {});
    return { message: 'Đã cập nhật trạng thái tài khoản' };
  }

  private async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { actorId, action, targetType, targetId, payload: payload as never },
    });
  }
}
