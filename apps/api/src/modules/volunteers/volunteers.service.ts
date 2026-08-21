import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { SetWeeklyAvailabilityDto } from './dto/weekly-availability.dto';

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
    const receiverUserId = active?.reservation?.receiver.userId;
    if (receiverUserId) {
      this.gateway.emitToUser(receiverUserId, 'delivery:location', {
        reservationId: active.reservationId,
        lng,
        lat,
      });
    }

    return { ok: true };
  }

  /**
   * Lịch rảnh hằng tuần TNV tự khai (lưới 7 ngày × 4 ca).
   *
   * Dùng raw SQL thay vì Prisma model: bảng vừa được thêm, môi trường dev có thể
   * chưa chạy `prisma generate` xong. Truy vấn vẫn tham số hoá đầy đủ.
   */
  async getMyWeeklyAvailability(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const rows = await this.prisma.$queryRaw<
      { day_of_week: number; period: string; updated_at: Date }[]
    >(Prisma.sql`
      SELECT day_of_week, period::text AS period, updated_at
      FROM volunteer_availability
      WHERE volunteer_id = ${volunteer.id}::uuid
      ORDER BY day_of_week, period
    `);

    return {
      slots: rows.map((r) => ({ dayOfWeek: r.day_of_week, period: r.period })),
      // Lịch rảnh rất nhanh lỗi thời (khai rảnh sáng T7 rồi đi làm thêm mà không sửa)
      // — FE hiển thị mốc này để nhắc TNV rà lại.
      updatedAt: rows.reduce<Date | null>(
        (latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest),
        null,
      ),
    };
  }

  /** Ghi đè TOÀN BỘ lịch rảnh — đơn giản hơn diff từng ô và luôn khớp với UI lưới. */
  async setMyWeeklyAvailability(userId: string, dto: SetWeeklyAvailabilityDto) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    // Khử trùng lặp: cùng một ô gửi hai lần sẽ vi phạm ràng buộc UNIQUE.
    const unique = new Map<string, { dayOfWeek: number; period: string }>();
    for (const slot of dto.slots) {
      unique.set(`${slot.dayOfWeek}:${slot.period}`, slot);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM volunteer_availability WHERE volunteer_id = ${volunteer.id}::uuid
      `);
      for (const slot of unique.values()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO volunteer_availability (volunteer_id, day_of_week, period, created_at, updated_at)
          VALUES (${volunteer.id}::uuid, ${slot.dayOfWeek}, ${slot.period}::campaign_shift_period, NOW(), NOW())
        `);
      }
    });

    return { ok: true, count: unique.size };
  }
}
