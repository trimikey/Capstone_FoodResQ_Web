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
    if (!user) throw new NotFoundException('User not found');

    const stats = await this.getReceiverStats(userId);

    return { ...user, stats };
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
        throw new BadRequestException('Phone number is already in use');
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

  async getFaceEnrollmentStatus(userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId },
      select: { faceImageUrl: true, faceDescriptor: true, idCardImageUrl: true },
    });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

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
      throw new BadRequestException('A selfie or an ID card photo is required');
    }

    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

    let selfieDescriptor: number[] | null = null;
    if (selfiePhoto) {
      selfieDescriptor = await this.faceMatch.getFaceDescriptor(selfiePhoto);
      if (!selfieDescriptor) {
        throw new BadRequestException(
          'No face detected in the selfie. Please retake with good lighting.',
        );
      }
    }

    let idCardDescriptor: number[] | null = null;
    if (idCardPhoto) {
      idCardDescriptor = await this.faceMatch.getFaceDescriptor(idCardPhoto);
      if (!idCardDescriptor) {
        throw new BadRequestException(
          'No face detected on the ID card photo. Please retake — keep the card flat and sharp.',
        );
      }
    }

    // Gửi cả hai → bắt buộc khớp chéo (chặn dùng CCCD của người khác)
    let matchDistance: number | null = null;
    if (selfieDescriptor && idCardDescriptor) {
      const result = this.faceMatch.compare(selfieDescriptor, idCardDescriptor);
      if (!result.matched) {
        throw new BadRequestException(
          'Selfie does not match the portrait on the ID card. Use your own ID card.',
        );
      }
      matchDistance = result.distance;
    }

    const [idCardUrl, faceUrl] = await Promise.all([
      idCardPhoto ? this.storage.saveImage(idCardPhoto, 'id-cards') : Promise.resolve(null),
      selfiePhoto ? this.storage.saveImage(selfiePhoto, 'faces') : Promise.resolve(null),
    ]);

    // Ưu tiên descriptor từ selfie (chất lượng tốt hơn chân dung in trên thẻ)
    await this.prisma.receiverProfile.update({
      where: { id: receiver.id },
      data: {
        ...(idCardUrl ? { idCardImageUrl: idCardUrl } : {}),
        ...(faceUrl ? { faceImageUrl: faceUrl } : {}),
        faceDescriptor: selfieDescriptor ?? idCardDescriptor!,
      },
    });

    return {
      enrolled: true,
      enrolledWith: selfiePhoto ? ('face' as const) : ('id_card' as const),
      matchDistance,
      message: 'Face enrolled successfully',
    };
  }
}
