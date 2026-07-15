import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { FaceMatchService } from '@/common/face-match/face-match.service';
import { UpdateMeDto } from './dto/update-me.dto';

/**
 * Thống kê trả về cho /users/me, phạm vi trường phụ thuộc vào role.
 * Giữ union shape thay vì discriminator để các FE cũ dùng `me.stats.completedCount` không vỡ.
 */
export interface MeStats {
  kind: 'receiver' | 'provider' | 'volunteer' | 'admin';
  // Receiver
  kgSaved?: number;
  completedCount?: number;
  cancelledCount?: number;
  providersHelped?: number;
  // Provider
  listingsCount?: number;
  activeListingsCount?: number;
  completedOrdersCount?: number;
  receiversHelped?: number;
  totalKgRescued?: number;
  // Volunteer (shipper)
  deliveriesCompleted?: number;
  deliveriesInProgress?: number;
  campaignsJoined?: number;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private faceMatch: FaceMatchService,
  ) {}

  /** Hồ sơ + thống kê của người dùng đang đăng nhập (dùng cho trang Hồ sơ & Lịch sử). */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        status: true,
        trustScore: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');

    const stats = await this.getMeStats(userId, user.role);

    // Nếu là tình nguyện viên → kèm chuyên môn (chef/waiter/shipper) + hạng/điểm
    let volunteer: {
      specializations: { specialization: string; isVerified: boolean }[];
      rank: string;
      dedicationPoints: number;
    } | null = null;
    if (user.role === 'volunteer') {
      const vp = await this.prisma.volunteerProfile.findUnique({
        where: { userId },
        select: {
          rank: true,
          dedicationPoints: true,
          specializations: { select: { specialization: true, isVerified: true } },
        },
      });
      if (vp) {
        volunteer = {
          specializations: vp.specializations,
          rank: vp.rank,
          dedicationPoints: vp.dedicationPoints,
        };
      }
    }

    // Nếu là người nhận → kèm cờ tổ chức từ thiện + địa chỉ/toạ độ điểm giao
    let receiver: {
      isCharityOrg: boolean;
      organizationName: string | null;
      address: string | null;
      lng: number | null;
      lat: number | null;
    } | null = null;
    if (user.role === 'receiver') {
      const [rp] = await this.prisma.$queryRaw<
        {
          is_charity_org: boolean;
          organization_name: string | null;
          address: string | null;
          lng: number | null;
          lat: number | null;
        }[]
      >(Prisma.sql`
        SELECT is_charity_org, organization_name, address,
               ST_X(location::geometry) AS lng,
               ST_Y(location::geometry) AS lat
        FROM receiver_profiles WHERE user_id = ${userId}::uuid
      `);
      if (rp) {
        receiver = {
          isCharityOrg: rp.is_charity_org,
          organizationName: rp.organization_name,
          address: rp.address,
          lng: rp.lng !== null ? Number(rp.lng) : null,
          lat: rp.lat !== null ? Number(rp.lat) : null,
        };
      }
    }

    // Nếu là NCC → kèm địa chỉ + toạ độ cửa hàng (đã đăng ký) để FE điền sẵn khi tạo listing
    let provider: {
      id: string;
      businessName: string;
      businessType: string;
      address: string;
      contactPhone: string | null;
      taxCode: string | null;
      isVerified: boolean;
      avgRating: number | null;
      verificationStatus: string;
      avgRating: number | null;
      lng: number | null;
      lat: number | null;
    } | null = null;
    if (user.role === 'provider') {
      const rows = await this.prisma.$queryRaw<
        {
          id: string;
          business_name: string;
          business_type: string;
          address: string;
          contact_phone: string | null;
          tax_code: string | null;
          is_verified: boolean;
          verification_status: string;
          avg_rating: Prisma.Decimal | null;
          lng: number | null;
          lat: number | null;
        }[]
      >(Prisma.sql`
        SELECT id, business_name, business_type, address, contact_phone, tax_code,
               is_verified, verification_status::text AS verification_status,
               avg_rating,
               ST_X(location::geometry) AS lng,
               ST_Y(location::geometry) AS lat
        FROM provider_profiles
        WHERE user_id = ${userId}::uuid
      `);
      const r = rows[0];
      if (r) {
        provider = {
          id: r.id,
          businessName: r.business_name,
          businessType: r.business_type,
          address: r.address,
          contactPhone: r.contact_phone,
          taxCode: r.tax_code,
          isVerified: r.is_verified,
          verificationStatus: r.verification_status,
          avgRating: r.avg_rating != null ? Number(r.avg_rating) : null,
          lng: r.lng !== null ? Number(r.lng) : null,
          lat: r.lat !== null ? Number(r.lat) : null,
        };
      }
    }

    return { ...user, stats, volunteer, receiver, provider };
  }

  /**
   * Cập nhật hồ sơ: họ tên, số điện thoại, avatar; kèm địa chỉ + vị trí theo role
   * (provider: vị trí cửa hàng — dùng làm điểm lấy hàng · receiver: điểm giao mặc định).
   */
  async updateMe(userId: string, dto: UpdateMeDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl || null } : {}),
        },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          status: true,
          trustScore: true,
        },
      });

      // Địa chỉ + toạ độ nằm ở bảng profile theo role (location là geography → raw SQL)
      const hasCoords = dto.lng != null && dto.lat != null;
      if (dto.address !== undefined || hasCoords) {
        const table =
          user.role === 'provider'
            ? Prisma.raw('provider_profiles')
            : user.role === 'receiver'
              ? Prisma.raw('receiver_profiles')
              : null;
        if (table) {
          await this.prisma.$executeRaw(Prisma.sql`
            UPDATE ${table}
            SET ${dto.address !== undefined ? Prisma.sql`address = ${dto.address},` : Prisma.empty}
                ${hasCoords ? Prisma.sql`location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,` : Prisma.empty}
                updated_at = NOW()
            WHERE user_id = ${userId}::uuid
          `);
        }
      }

      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Số điện thoại đã được sử dụng.');
      }
      throw e;
    }
  }

  /**
   * Thống kê hiển thị trên trang Hồ sơ. Phạm vi trường tuỳ theo role:
   *
   * - **Receiver**: kg đã cứu, đơn hoàn tất/hủy, số cửa hàng đã gặp.
   * - **Provider**: số tin đã đăng/đang mở, đơn hoàn tất, người nhận đã giúp, tổng kg đã cứu
   *   (lấy từ `provider_profiles.total_food_rescued_kg` để khớp với ESG snapshot).
   * - **Volunteer**: số chuyến đã giao / đang chạy, số chiến dịch bếp đã tham gia (vai trò chef/waiter).
   * - **Admin**: trả zero cho tất cả chỉ số (chưa có dashboard con).
   *
   * Tất cả query là parameterized — tránh SQL injection; dùng `prisma.$queryRaw` cho phép aggregate phức tạp.
   */
  async getMeStats(userId: string, role: string): Promise<MeStats> {
    if (role === 'receiver') return this.getReceiverStats(userId);
    if (role === 'provider') return this.getProviderStats(userId);
    if (role === 'volunteer') return this.getVolunteerStats(userId);
    return { kind: 'admin' };
  }

  /**
   * Provider: tin đã đăng (kể cả draft), tin đang mở, đơn đã hoàn tất (reservation completed thuộc listing của provider),
   * người nhận distinct đã phục vụ, tổng kg đã cứu (tính trực tiếp từ reservation — không phụ thuộc snapshot ESG).
   */
  private async getProviderStats(userId: string): Promise<MeStats> {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      return {
        kind: 'provider',
        listingsCount: 0,
        activeListingsCount: 0,
        completedOrdersCount: 0,
        receiversHelped: 0,
        totalKgRescued: 0,
      };
    }

    const [row] = await this.prisma.$queryRaw<
      {
        listings_count: bigint;
        active_listings_count: bigint;
        completed_orders_count: bigint;
        receivers_helped: bigint;
        kg_rescued: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM food_listings fl WHERE fl.provider_id = ${profile.id}::uuid AND fl.deleted_at IS NULL) AS listings_count,
        (SELECT COUNT(*) FROM food_listings fl WHERE fl.provider_id = ${profile.id}::uuid AND fl.status = 'active' AND fl.deleted_at IS NULL) AS active_listings_count,
        (SELECT COUNT(*) FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id WHERE fl.provider_id = ${profile.id}::uuid AND r.status = 'completed') AS completed_orders_count,
        (SELECT COUNT(DISTINCT r.receiver_id) FROM reservations r JOIN food_listings fl ON fl.id = r.listing_id WHERE fl.provider_id = ${profile.id}::uuid AND r.status = 'completed') AS receivers_helped,
        COALESCE((
          SELECT SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0))
          FROM reservations r
          JOIN food_listings fl ON fl.id = r.listing_id
          WHERE fl.provider_id = ${profile.id}::uuid AND r.status = 'completed'
        ), 0) AS kg_rescued
    `);

    return {
      kind: 'provider',
      listingsCount: Number(row?.listings_count ?? 0),
      activeListingsCount: Number(row?.active_listings_count ?? 0),
      completedOrdersCount: Number(row?.completed_orders_count ?? 0),
      receiversHelped: Number(row?.receivers_helped ?? 0),
      totalKgRescued: Math.round(Number(row?.kg_rescued ?? 0) * 10) / 10,
    };
  }

  /**
   * Volunteer: chỉ đếm delivery mà volunteer này làm shipper (bỏ campaign cook/waiter để tránh trùng).
   * campaignsJoined = tổng số campaign assignment (cả 3 vai trò) để phản ánh mức độ tham gia.
   */
  private async getVolunteerStats(userId: string): Promise<MeStats> {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      return {
        kind: 'volunteer',
        deliveriesCompleted: 0,
        deliveriesInProgress: 0,
        campaignsJoined: 0,
      };
    }

    const [row] = await this.prisma.$queryRaw<
      {
        deliveries_completed: bigint;
        deliveries_in_progress: bigint;
        campaigns_joined: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE d.status = 'delivered') AS deliveries_completed,
        COUNT(*) FILTER (WHERE d.status IN ('pending_assignment','assigned','heading_to_provider','qc_completed','in_transit')) AS deliveries_in_progress,
        (SELECT COUNT(*) FROM campaign_volunteer_assignments cva WHERE cva.volunteer_id = ${profile.id}::uuid) AS campaigns_joined
      FROM deliveries d
      WHERE d.shipper_id = ${profile.id}::uuid
    `);

    return {
      kind: 'volunteer',
      deliveriesCompleted: Number(row?.deliveries_completed ?? 0),
      deliveriesInProgress: Number(row?.deliveries_in_progress ?? 0),
      campaignsJoined: Number(row?.campaigns_joined ?? 0),
    };
  }

  /**
   * Thống kê tác động của receiver: kg đã cứu, số đơn hoàn tất/hủy, số cửa hàng đã giúp.
   * Trả zero nếu user không phải receiver (chưa có receiver_profile).
   */
  private async getReceiverStats(userId: string): Promise<MeStats> {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!receiver) {
      return { kind: 'receiver', kgSaved: 0, completedCount: 0, cancelledCount: 0, providersHelped: 0 };
    }

    const [row] = await this.prisma.$queryRaw<
      {
        kg_saved: number | null;
        completed_count: bigint;
        cancelled_count: bigint;
        providers_helped: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(r.quantity * COALESCE(fl.weight_per_unit_kg, 0))
          FILTER (WHERE r.status = 'completed'), 0) AS kg_saved,
        COUNT(*) FILTER (WHERE r.status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE r.status = 'cancelled') AS cancelled_count,
        COUNT(DISTINCT fl.provider_id) FILTER (WHERE r.status = 'completed') AS providers_helped
      FROM reservations r
      JOIN food_listings fl ON fl.id = r.listing_id
      WHERE r.receiver_id = ${receiver.id}::uuid
    `);

    return {
      kind: 'receiver',
      kgSaved: Math.round(Number(row?.kg_saved ?? 0) * 10) / 10,
      completedCount: Number(row?.completed_count ?? 0),
      cancelledCount: Number(row?.cancelled_count ?? 0),
      providersHelped: Number(row?.providers_helped ?? 0),
    };
  }

  /**
   * Lịch sử điều chỉnh trust score (mới nhất trước), kèm progress đề xuất
   * nếu user đang ở trạng thái bị hạn chế/khoá.
   */
  async getTrustHistory(userId: string, limit = 30) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true, status: true },
    });
    if (!current) throw new NotFoundException('Không tìm thấy người dùng.');

    const items = await this.prisma.trustScoreHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        delta: true,
        reason: true,
        referenceType: true,
        referenceId: true,
        scoreBefore: true,
        scoreAfter: true,
        createdAt: true,
      },
    });

    // Khuyến nghị phục hồi: +2 mỗi đơn hoàn tất → cần bao nhiêu đơn để thoát suspended
    const RESTRICT_THRESHOLD = 60;
    const pointsNeeded =
      current.trustScore < RESTRICT_THRESHOLD ? RESTRICT_THRESHOLD - current.trustScore + 1 : 0;
    const rescuesNeeded = pointsNeeded > 0 ? Math.ceil(pointsNeeded / 2) : 0;

    return {
      score: current.trustScore,
      status: current.status,
      items,
      recommendation:
        current.status === 'suspended' && rescuesNeeded > 0
          ? `Hoàn tất ${rescuesNeeded} đơn thành công để thoát trạng thái bị hạn chế.`
          : current.status === 'banned'
            ? 'Tài khoản đã bị khoá vì điểm tin cậy quá thấp. Liên hệ hỗ trợ để được xem xét.'
            : null,
    };
  }

  async getFaceEnrollmentStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

    if (user?.role === 'volunteer') {
      const v = await this.prisma.volunteerProfile.findUnique({
        where: { userId },
        select: { faceImageUrl: true, faceDescriptor: true, idCardImageUrl: true },
      });
      if (!v) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
      return { enrolled: v.faceDescriptor !== null, faceImageUrl: v.faceImageUrl, idCardImageUrl: v.idCardImageUrl };
    }

    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { faceImageUrl: true, faceDescriptor: true, idCardImageUrl: true },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    return {
      enrolled: receiver.faceDescriptor !== null,
      faceImageUrl: receiver.faceImageUrl,
      idCardImageUrl: receiver.idCardImageUrl,
    };
  }

  /**
   * Đăng ký khuôn mặt: chỉ cần MỘT trong hai — selfie hoặc ảnh CCCD
   * (người không có CCCD vẫn đăng ký được bằng selfie).
   * Nếu gửi cả hai thì so khớp chéo selfie ↔ chân dung CCCD để tăng độ tin cậy.
   */
  async enrollFace(
    userId: string,
    idCardPhoto?: Express.Multer.File,
    selfiePhoto?: Express.Multer.File,
  ) {
    if (!idCardPhoto && !selfiePhoto) {
      throw new BadRequestException('Cần ít nhất một ảnh selfie hoặc ảnh CCCD.');
    }

    // Chỉ người nhận & tình nguyện viên cần đăng ký khuôn mặt
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'receiver' && user?.role !== 'volunteer') {
      throw new BadRequestException('Vai trò này không cần đăng ký khuôn mặt.');
    }

    let selfieDescriptor: number[] | null = null;
    if (selfiePhoto) {
      selfieDescriptor = await this.faceMatch.getFaceDescriptor(selfiePhoto);
      if (!selfieDescriptor) {
        throw new BadRequestException(
          'Không nhận diện được khuôn mặt trong ảnh selfie. Vui lòng chụp lại nơi đủ sáng.',
        );
      }
    }

    let idCardDescriptor: number[] | null = null;
    if (idCardPhoto) {
      idCardDescriptor = await this.faceMatch.getFaceDescriptor(idCardPhoto);
      if (!idCardDescriptor) {
        throw new BadRequestException(
          'Không nhận diện được khuôn mặt trên ảnh CCCD. Vui lòng chụp lại — đặt thẻ phẳng, rõ nét.',
        );
      }
    }

    // Gửi cả hai → bắt buộc khớp chéo (chặn dùng CCCD của người khác)
    let matchDistance: number | null = null;
    if (selfieDescriptor && idCardDescriptor) {
      const result = this.faceMatch.compare(selfieDescriptor, idCardDescriptor);
      if (!result.matched) {
        throw new BadRequestException(
          'Ảnh selfie không khớp với ảnh trên CCCD. Vui lòng dùng CCCD của chính bạn.',
        );
      }
      matchDistance = result.distance;
    }

    const [idCardUrl, faceUrl] = await Promise.all([
      idCardPhoto ? this.storage.saveImage(idCardPhoto, 'id-cards') : Promise.resolve(null),
      selfiePhoto ? this.storage.saveImage(selfiePhoto, 'faces') : Promise.resolve(null),
    ]);

    // Ưu tiên descriptor từ selfie (chất lượng tốt hơn chân dung in trên thẻ)
    const faceData = {
      ...(idCardUrl ? { idCardImageUrl: idCardUrl } : {}),
      ...(faceUrl ? { faceImageUrl: faceUrl } : {}),
      faceDescriptor: selfieDescriptor ?? idCardDescriptor!,
    };
    if (user.role === 'volunteer') {
      await this.prisma.volunteerProfile.update({ where: { userId }, data: faceData });
    } else {
      await this.prisma.receiverProfile.update({ where: { userId }, data: faceData });
    }

    return {
      enrolled: true,
      enrolledWith: selfiePhoto ? ('face' as const) : ('id_card' as const),
      matchDistance,
      message: 'Face enrolled successfully',
    };
  }
}
