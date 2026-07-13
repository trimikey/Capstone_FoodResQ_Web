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

    const stats = await this.getReceiverStats(userId);

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

    // Nếu là người nhận → kèm cờ tổ chức từ thiện để FE hiển thị nhãn đúng
    let receiver: { isCharityOrg: boolean; organizationName: string | null } | null = null;
    if (user.role === 'receiver') {
      const rp = await this.prisma.receiverProfile.findUnique({
        where: { userId },
        select: { isCharityOrg: true, organizationName: true },
      });
      if (rp) receiver = { isCharityOrg: rp.isCharityOrg, organizationName: rp.organizationName };
    }

    return { ...user, stats, volunteer, receiver };
  }

  /** Cập nhật hồ sơ cơ bản: họ tên, số điện thoại, avatar. */
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
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Số điện thoại đã được sử dụng.');
      }
      throw e;
    }
  }

  /**
   * Thống kê tác động của receiver: kg đã cứu, số đơn hoàn tất/hủy, số cửa hàng đã giúp.
   * Trả zero nếu user không phải receiver (chưa có receiver_profile).
   */
  private async getReceiverStats(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!receiver) {
      return { kgSaved: 0, completedCount: 0, cancelledCount: 0, providersHelped: 0 };
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
