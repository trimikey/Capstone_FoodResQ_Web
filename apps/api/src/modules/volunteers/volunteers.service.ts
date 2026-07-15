import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SetAvailabilityDto } from './dto/set-availability.dto';

@Injectable()
export class VolunteersService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  /** Hồ sơ tình nguyện viên + vị trí hiện tại (geography đọc qua raw). */
  async getMe(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        isAvailable: true,
        dedicationPoints: true,
        rank: true,
        vehicleType: true,
        vehiclePlate: true,
        avgRating: true,
        verificationStatus: true,
        locationUpdatedAt: true,
        specializations: {
          select: { specialization: true, isVerified: true },
        },
      },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const [loc] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
      Prisma.sql`
        SELECT ST_X(current_location::geometry) AS lng,
               ST_Y(current_location::geometry) AS lat
        FROM volunteer_profiles WHERE id = ${volunteer.id}::uuid
      `,
    );

    const isShipper = volunteer.specializations.some(
      (s) => s.specialization === 'shipper' && s.isVerified,
    );

    return {
      ...volunteer,
      avgRating: volunteer.avgRating ? Number(volunteer.avgRating) : null,
      isShipper,
      currentLocation: loc?.lng != null ? { lng: Number(loc.lng), lat: Number(loc.lat) } : null,
    };
  }

  /** Bật/tắt sẵn sàng nhận đơn + cập nhật vị trí hiện tại. */
  async setAvailability(userId: string, dto: SetAvailabilityDto) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    if (dto.isAvailable && (dto.lng == null || dto.lat == null)) {
      throw new BadRequestException('Vị trí (lng, lat) là bắt buộc khi bật sẵn sàng');
    }

    // eKYC bắt buộc trước khi nhận nhiệm vụ: tài khoản social login (Google)
    // chưa có khuôn mặt gốc thì không được bật sẵn sàng nhận đơn.
    if (dto.isAvailable && !volunteer.faceDescriptor) {
      throw new BadRequestException(
        'FACE_NOT_ENROLLED: Bạn cần đăng ký khuôn mặt trước khi bật nhận đơn (dùng để xác minh khi giao nhận).',
      );
    }

    if (dto.lng != null && dto.lat != null) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE volunteer_profiles
        SET current_location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
            location_updated_at = NOW(),
            is_available = ${dto.isAvailable},
            updated_at = NOW()
        WHERE id = ${volunteer.id}::uuid
      `);
    } else {
      await this.prisma.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: dto.isAvailable },
      });
    }

    return { isAvailable: dto.isAvailable, message: dto.isAvailable ? 'Đã bật sẵn sàng nhận đơn' : 'Đã tắt nhận đơn' };
  }

  /** Cập nhật vị trí hiện tại (dùng cho theo dõi đơn giao trực tiếp). */
  async updateLocation(userId: string, lng: number, lat: number) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE volunteer_profiles
      SET current_location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          location_updated_at = NOW(), updated_at = NOW()
      WHERE id = ${volunteer.id}::uuid
    `);

    // Đẩy vị trí trực tiếp tới người nhận của đơn đang giao (nếu có) để bản đồ theo dõi cập nhật real-time.
    const active = await this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      select: {
        reservationId: true,
        reservation: { select: { receiver: { select: { userId: true } } } },
      },
    });
    const receiverUserId = active?.reservation.receiver.userId;
    if (receiverUserId) {
      this.gateway.emitToUser(receiverUserId, 'delivery:location', {
        reservationId: active.reservationId,
        lng,
        lat,
      });
    }

    return { ok: true };
  }
}
