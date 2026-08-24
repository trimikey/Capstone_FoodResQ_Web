import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { SetDeliveryShiftsDto, SetWeeklyAvailabilityDto } from './dto/weekly-availability.dto';

@Injectable()
export class VolunteersService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private systemConfig: SystemConfigService,
  ) {}

  private deliverySlotAt(at: Date): { workDate: string; period: string } {
    const vn = new Date(at.getTime() + 7 * 3600_000);
    const hour = vn.getUTCHours();
    const period = hour < 6 ? 'midnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    return { workDate: vn.toISOString().slice(0, 10), period };
  }

  private async hasDeliveryShiftNow(volunteerId: string, at = new Date()): Promise<boolean> {
    const slot = this.deliverySlotAt(at);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM delivery_shift_registrations
      WHERE volunteer_id = ${volunteerId}::uuid
        AND work_date = ${slot.workDate}::date
        AND period = ${slot.period}::campaign_shift_period
      LIMIT 1
    `);
    return rows.length > 0;
  }

  private async isBusyWithCampaignShiftNow(volunteerId: string, at = new Date()): Promise<boolean> {
    const slot = this.deliverySlotAt(at);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id
      FROM campaign_volunteer_assignments a
      JOIN campaign_shifts cs ON cs.id = a.shift_id
      WHERE a.volunteer_id = ${volunteerId}::uuid
        AND a.work_date = ${slot.workDate}::date
        AND cs.period = ${slot.period}::campaign_shift_period
        AND a.status IN ('assigned', 'checked_in', 'in_progress')
        AND a.confirmation_status = 'confirmed'
      LIMIT 1
    `);
    return rows.length > 0;
  }

  private async effectiveAvailability(volunteerId: string, requestedAvailable: boolean): Promise<boolean> {
    if (!requestedAvailable) return false;
    return (await this.hasDeliveryShiftNow(volunteerId)) && !(await this.isBusyWithCampaignShiftNow(volunteerId));
  }

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

    const effectiveIsAvailable = await this.effectiveAvailability(volunteer.id, volunteer.isAvailable);
    if (effectiveIsAvailable !== volunteer.isAvailable) {
      await this.prisma.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: effectiveIsAvailable },
      });
    }

    return {
      ...volunteer,
      isAvailable: effectiveIsAvailable,
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

    const nextIsAvailable = await this.effectiveAvailability(volunteer.id, dto.isAvailable);
    if (dto.isAvailable && !nextIsAvailable) {
      const slot = this.deliverySlotAt(new Date());
      throw new BadRequestException(
        `Bạn chưa có ca giao hàng đang diễn ra hoặc đang bận ca chiến dịch (${slot.workDate}/${slot.period}). Chỉ bật nhận đơn trong khung giờ đã đăng ký.`,
      );
    }

    if (dto.lng != null && dto.lat != null) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE volunteer_profiles
        SET current_location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
            location_updated_at = NOW(),
            is_available = ${nextIsAvailable},
            updated_at = NOW()
        WHERE id = ${volunteer.id}::uuid
      `);
    } else {
      await this.prisma.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: nextIsAvailable },
      });
    }

    return { isAvailable: nextIsAvailable, message: nextIsAvailable ? 'Đã bật sẵn sàng nhận đơn' : 'Đã tắt nhận đơn' };
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

  /**
   * Cửa sổ đăng ký ca giao hàng: mở mỗi CHỦ NHẬT 12:00 trưa (giờ VN), kéo dài
   * DELIVERY_SHIFT_REG_WINDOW_HOURS giờ, đăng ký cho TUẦN KẾ TIẾP (Thứ 2 → CN).
   * Config = 0 nghĩa là luôn mở và cho đăng ký mọi ngày tương lai (tiện test/demo).
   */
  private async deliveryShiftWindow() {
    const hours = await this.systemConfig.getNumber('DELIVERY_SHIFT_REG_WINDOW_HOURS');
    const now = Date.now();
    if (hours <= 0) {
      return { alwaysOpen: true, open: true, opensAt: null as Date | null, closesAt: null as Date | null, editableFrom: null as string | null, editableTo: null as string | null };
    }
    // Chủ nhật gần nhất theo lịch VN (tính cả hôm nay nếu là CN)
    const nowVn = new Date(now + 7 * 3600_000);
    const lastSundayVn = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() - nowVn.getUTCDay()));
    // 12:00 VN của ngày CN đó, đổi về mốc UTC thật (VN = UTC+7)
    let opensAt = new Date(lastSundayVn.getTime() + 12 * 3600_000 - 7 * 3600_000);
    if (now < opensAt.getTime()) {
      // Chưa tới trưa CN tuần này → cửa sổ đang xét là của CN tuần trước
      opensAt = new Date(opensAt.getTime() - 7 * 86_400_000);
    }
    const closesAt = new Date(opensAt.getTime() + hours * 3600_000);
    // Tuần đăng ký = Thứ 2 ngay sau ngày CN mở cửa sổ → CN kế tiếp (theo lịch VN)
    const openSundayVn = new Date(opensAt.getTime() + 7 * 3600_000);
    const mondayVn = new Date(Date.UTC(openSundayVn.getUTCFullYear(), openSundayVn.getUTCMonth(), openSundayVn.getUTCDate() + 1));
    const sundayVn = new Date(mondayVn.getTime() + 6 * 86_400_000);
    return {
      alwaysOpen: false,
      open: now >= opensAt.getTime() && now < closesAt.getTime(),
      opensAt,
      closesAt,
      editableFrom: mondayVn.toISOString().slice(0, 10),
      editableTo: sundayVn.toISOString().slice(0, 10),
    };
  }

  /** Ca giao hàng đã đăng ký (từ hôm nay trở đi) + trạng thái cửa sổ đăng ký. */
  async getMyDeliveryShifts(userId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, specializations: { select: { specialization: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const window = await this.deliveryShiftWindow();
    const todayVn = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ work_date: Date; period: string }[]>(Prisma.sql`
      SELECT work_date, period::text AS period
      FROM delivery_shift_registrations
      WHERE volunteer_id = ${volunteer.id}::uuid AND work_date >= ${todayVn}::date
      ORDER BY work_date, period
    `);
    return {
      isShipper: volunteer.specializations.some((sp) => sp.specialization === 'shipper'),
      slots: rows.map((r) => ({
        workDate: r.work_date.toISOString().slice(0, 10),
        period: r.period,
      })),
      window: {
        alwaysOpen: window.alwaysOpen,
        open: window.open,
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        nextOpensAt: window.opensAt ? new Date(window.opensAt.getTime() + 7 * 86_400_000) : null,
        editableFrom: window.editableFrom,
        editableTo: window.editableTo,
      },
    };
  }

  /**
   * Ghi đè ca giao hàng trong phạm vi được phép sửa.
   * Chỉ TNV có chuyên môn shipper; chỉ khi cửa sổ đăng ký đang mở (trừ khi admin tắt).
   */
  async setMyDeliveryShifts(userId: string, dto: SetDeliveryShiftsDto) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId },
      select: { id: true, specializations: { select: { specialization: true } } },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (!volunteer.specializations.some((sp) => sp.specialization === 'shipper')) {
      throw new BadRequestException('Chỉ tình nguyện viên có chuyên môn giao hàng mới đăng ký ca giao.');
    }

    const window = await this.deliveryShiftWindow();
    if (!window.alwaysOpen && !window.open) {
      const opens = window.opensAt
        ? new Date(window.opensAt.getTime() + 7 * 86_400_000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        : '';
      throw new BadRequestException(
        `Ngoài giờ đăng ký ca. Cửa sổ kế tiếp mở lúc ${opens} (Chủ nhật 12:00 trưa).`,
      );
    }

    const todayVn = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    // Phạm vi được sửa: luôn mở → mọi ngày tương lai; có cửa sổ → đúng tuần kế tiếp.
    const from = window.alwaysOpen ? todayVn : window.editableFrom!;
    const to = window.alwaysOpen ? null : window.editableTo!;

    const unique = new Map<string, { workDate: string; period: string }>();
    for (const slot of dto.slots) {
      if (slot.workDate < from || (to && slot.workDate > to)) {
        throw new BadRequestException(
          to
            ? `Cửa sổ hiện tại chỉ đăng ký được cho tuần ${from} → ${to}.`
            : `Chỉ đăng ký được cho ngày từ hôm nay (${from}) trở đi.`,
        );
      }
      unique.set(`${slot.workDate}:${slot.period}`, slot);
    }

    await this.prisma.$transaction(async (tx) => {
      // Ghi đè trong phạm vi sửa — ca ngoài phạm vi (tuần đang chạy) giữ nguyên.
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM delivery_shift_registrations
        WHERE volunteer_id = ${volunteer.id}::uuid
          AND work_date >= ${from}::date
          ${to ? Prisma.sql`AND work_date <= ${to}::date` : Prisma.empty}
      `);
      for (const slot of unique.values()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO delivery_shift_registrations (volunteer_id, work_date, period, created_at)
          VALUES (${volunteer.id}::uuid, ${slot.workDate}::date, ${slot.period}::campaign_shift_period, NOW())
        `);
      }
    });

    return { ok: true, count: unique.size };
  }
}
