import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { ReviewVerificationDto, ResolveReportDto, SetUserStatusDto } from './dto/admin.dto';

type ProfileType = 'provider' | 'volunteer' | 'receiver';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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
      if (!profile) throw new NotFoundException('Provider profile not found');
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
      if (!profile) throw new NotFoundException('Volunteer profile not found');
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
      throw new BadRequestException('Unsupported verification type');
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
    if (!report) throw new NotFoundException('Report not found');

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
    return this.prisma.user.findMany({
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
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Đổi trạng thái tài khoản. Ban → thu hồi toàn bộ refresh token (CLAUDE.md §2.5). */
  async setUserStatus(id: string, adminUserId: string, dto: SetUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
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
