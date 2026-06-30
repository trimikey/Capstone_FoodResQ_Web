import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SetAvailabilityDto } from './dto/set-availability.dto';

@Injectable()
export class VolunteersService {
  constructor(private prisma: PrismaService) {}

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
}
