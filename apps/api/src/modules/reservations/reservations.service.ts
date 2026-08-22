import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import Redlock from 'redlock';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { FaceMatchService } from '@/common/face-match/face-match.service';
import { SystemConfigService } from '@/common/system-config/system-config.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TrustService } from '@/modules/trust/trust.service';
import { PickupVerificationType, TrustScoreReason } from '@foodresq/types';
import { CreateReservationDto } from './dto/create-reservation.dto';
import type { RateTarget } from './dto/rate-reservation.dto';

const LOCK_TTL_MS = 10_000;   // 10s window để acquire lock và complete transaction

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redlock: Redlock,
    private storage: StorageService,
    private faceMatch: FaceMatchService,
    private systemConfig: SystemConfigService,
    private notifications: NotificationsService,
    private trust: TrustService,
    @InjectQueue('notification-push') private notifQueue: Queue,
  ) {}

  /** Số phút từ 00:00 theo giờ VN của một thời điểm — để so với khung giờ mở cửa. */
  private minuteOfDayVN(d: Date): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  }

  /** 420 → "07:00" */
  private formatMinute(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }

  /** Định dạng giờ VN (HH:mm dd/MM) cho thông báo lỗi hiển thị tới người dùng. */
  private formatVN(d: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(d);
  }

  /** Ngày YYYY-MM-DD theo giờ VN — so cửa sổ ngày khi có daily window. */
  private dateKeyVN(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${day}`;
  }

  async create(receiverUserId: string, dto: CreateReservationDto) {
    // 1. Load receiver profile
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: receiverUserId },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    // 1b. eKYC bắt buộc với cá nhân: tài khoản social login (Google) bỏ qua bước
    // selfie lúc đăng ký → chặn tại đây, FE sẽ bật modal đăng ký khuôn mặt.
    if (!receiver.isCharityOrg && !receiver.faceDescriptor) {
      throw new BadRequestException(
        'FACE_NOT_ENROLLED: Bạn cần đăng ký khuôn mặt trước khi đặt chỗ (dùng để đối chiếu khi nhận hàng).',
      );
    }

    // 2. Check daily limit (đọc cấu hình live từ system_configs)
    const maxPerDay = await this.systemConfig.getNumber('MAX_RESERVATIONS_PER_DAY');
    if (receiver.reservationsToday >= maxPerDay) {
      throw new BadRequestException(
        `Bạn đã đạt giới hạn ${maxPerDay} lượt đặt chỗ trong ngày. Vui lòng quay lại vào ngày mai.`,
      );
    }

    // 2b. Yêu cầu giao tận nơi → phải xác định được ĐIỂM GIAO: hoặc người đặt chọn
    // riêng cho đơn này (đang nằm viện, ở nhà người thân…), hoặc lấy địa chỉ hồ sơ.
    // Không có điểm giao thì shipper không điều hướng được.
    const customDestination = dto.deliveryLng != null && dto.deliveryLat != null
      ? { lng: dto.deliveryLng, lat: dto.deliveryLat, address: dto.deliveryAddress?.trim() || null }
      : null;
    if (dto.requestDelivery) {
      if ((dto.deliveryLng == null) !== (dto.deliveryLat == null)) {
        throw new BadRequestException('Điểm giao cần cả kinh độ và vĩ độ. Vui lòng chọn lại vị trí trên bản đồ.');
      }
      if (customDestination && !customDestination.address) {
        throw new BadRequestException('Vui lòng nhập địa chỉ mô tả cho điểm giao đã chọn để tình nguyện viên tìm được.');
      }
      if (!customDestination) {
        const [loc] = await this.prisma.$queryRaw<{ has_location: boolean }[]>(Prisma.sql`
          SELECT (location IS NOT NULL) AS has_location
          FROM receiver_profiles WHERE id = ${receiver.id}::uuid
        `);
        if (!receiver.address || !loc?.has_location) {
          throw new BadRequestException(
            'Vui lòng cập nhật địa chỉ nhận hàng trong hồ sơ, hoặc chọn điểm giao trên bản đồ cho đơn này.',
          );
        }
      }
      // Giao tận nơi dành cho người KHÓ DI CHUYỂN → bắt buộc ảnh bằng chứng
      // (bệnh, chấn thương…). Shipper xem ảnh này trong popup lời mời trước khi
      // quyết định nhận đơn — không có ảnh thì shipper không có gì để đối chiếu.
      if (!dto.deliveryEvidenceUrl?.trim()) {
        throw new BadRequestException(
          'Vui lòng tải ảnh bằng chứng khó di chuyển (giấy khám bệnh, ảnh chấn thương…) khi yêu cầu tình nguyện viên giao tận nơi.',
        );
      }

      // Chốt chặn thực tế: TNV chạy xe máy đi giao MỘT suất ăn, không thể vượt
      // hàng chục km. Shipper chỉ được tìm trong bán kính quanh ĐIỂM LẤY, nên nếu
      // không kiểm ở đây thì người nhận ở xa vẫn đặt được và shipper nhận đơn xong
      // mới phát hiện quãng đường vô lý — rồi bỏ chuyến.
      const maxDistanceKm = await this.systemConfig.getNumber('MAX_DELIVERY_DISTANCE_KM');
      const [distanceRow] = await this.prisma.$queryRaw<{ distance_km: number | null }[]>(Prisma.sql`
        SELECT ROUND((ST_Distance(fl.pickup_location::geography, dest.geo::geography) / 1000)::numeric, 2)::float8
                 AS distance_km
        FROM food_listings fl
        CROSS JOIN LATERAL (
          SELECT ${customDestination
            ? Prisma.sql`ST_SetSRID(ST_MakePoint(${customDestination.lng}, ${customDestination.lat}), 4326)::geography`
            : Prisma.sql`(SELECT location FROM receiver_profiles WHERE id = ${receiver.id}::uuid)`} AS geo
        ) dest
        WHERE fl.id = ${dto.listingId}::uuid
      `);
      const distanceKm = distanceRow?.distance_km ?? null;
      if (distanceKm != null && distanceKm > maxDistanceKm) {
        throw new BadRequestException(
          `Điểm giao cách nơi lấy hàng ${distanceKm} km, vượt giới hạn ${maxDistanceKm} km cho một chuyến giao. `
          + 'Vui lòng chọn điểm giao gần hơn hoặc chọn "Tôi sẽ tự đến lấy".',
        );
      }

      // Hẹn giờ giao: shipper cần thời gian di chuyển nên tối thiểu 30 phút nữa,
      // và không được vượt quá giờ đóng nhận hàng của tin (quá giờ là quán đóng).
      if (dto.deliveryScheduledAt) {
        const scheduledAt = new Date(dto.deliveryScheduledAt);
        if (scheduledAt.getTime() < Date.now() + 30 * 60_000) {
          throw new BadRequestException('Giờ hẹn giao phải cách hiện tại ít nhất 30 phút.');
        }
        const [windowRow] = await this.prisma.$queryRaw<{ pickup_end_time: Date }[]>(Prisma.sql`
          SELECT pickup_end_time FROM food_listings WHERE id = ${dto.listingId}::uuid
        `);
        if (windowRow && scheduledAt > windowRow.pickup_end_time) {
          throw new BadRequestException(
            'Giờ hẹn giao vượt quá khung giờ nhận hàng của tin. Vui lòng chọn giờ sớm hơn.',
          );
        }
      }
    }

    // 3. Acquire distributed lock on this listing
    const lockKey = `lock:reservation:${dto.listingId}`;
    const lock = await this.redlock
      .acquire([lockKey], LOCK_TTL_MS)
      .catch(() => {
        throw new ConflictException('Có người đang đặt món này. Vui lòng thử lại sau vài giây.');
      });

    try {
      // 4. Re-read listing inside the lock (prevent race condition)
      const [listingRow] = await this.prisma.$queryRaw<
        {
          id: string;
          quantity_remaining: number;
          status: string;
          max_per_reservation: number;
          pickup_start_time: Date;
          pickup_end_time: Date;
          expiry_time: Date;
          daily_start_minute: number | null;
          daily_end_minute: number | null;
        }[]
      >(
        Prisma.sql`
          SELECT id, quantity_remaining, status, max_per_reservation,
                 pickup_start_time, pickup_end_time, expiry_time,
                 daily_start_minute, daily_end_minute
          FROM food_listings
          WHERE id = ${dto.listingId}::uuid AND deleted_at IS NULL
        `,
      );

      if (!listingRow) throw new NotFoundException('Không tìm thấy tin thực phẩm.');
      if (listingRow.status !== 'active') {
        throw new BadRequestException('Tin thực phẩm này không còn nhận đặt.');
      }

      // Chỉ cho đặt TRONG khung giờ nhận hàng. QR chỉ hiệu lực 30 phút — nếu đặt
      // lúc 2h sáng (cửa hàng chưa mở) thì QR hết hạn trước khi mở cửa → bị đánh
      // no_show oan. Vì vậy chặn từ đầu, báo rõ khung giờ cho người dùng.
      const nowTs = new Date();
      const { daily_start_minute: dayStart, daily_end_minute: dayEnd } = listingRow;
      const hasDailyWindow = dayStart != null && dayEnd != null;

      if (nowTs > listingRow.pickup_end_time || nowTs > listingRow.expiry_time) {
        throw new BadRequestException(
          'Đã quá giờ nhận hàng của tin này. Vui lòng chọn thực phẩm khác còn trong giờ nhận.',
        );
      }

      if (hasDailyWindow) {
        // Khi provider có khai báo giờ mở/đóng hằng ngày, daily window là thẩm quyền
        // cho GIỜ trong ngày. Mốc absolute chỉ giữ vai trò giới hạn khoảng NGÀY và hạn
        // cứng, để các listing cũ từng lưu lệch UTC không bị chặn oan.
        const today = this.dateKeyVN(nowTs);
        const startDate = this.dateKeyVN(listingRow.pickup_start_time);
        const endDate = this.dateKeyVN(listingRow.pickup_end_time);
        if (today < startDate) {
          throw new BadRequestException(
            `Chưa đến ngày nhận hàng. Cửa hàng nhận từ ${this.formatMinute(dayStart)}–${this.formatMinute(dayEnd)}.`,
          );
        }
        if (today > endDate) {
          throw new BadRequestException(
            'Đã quá ngày nhận hàng của tin này. Vui lòng chọn thực phẩm khác còn trong giờ nhận.',
          );
        }

        const nowMinute = this.minuteOfDayVN(nowTs);
        if (nowMinute < dayStart || nowMinute >= dayEnd) {
          throw new BadRequestException(
            `Ngoài giờ nhận hàng của cửa hàng (${this.formatMinute(dayStart)}–${this.formatMinute(dayEnd)}). Vui lòng quay lại trong khung giờ này.`,
          );
        }
      } else if (nowTs < listingRow.pickup_start_time) {
        // Tin cũ không có daily window vẫn dùng đúng mốc tuyệt đối đã lưu.
        throw new BadRequestException(
          `Chưa đến giờ nhận hàng. Bạn có thể đặt từ ${this.formatVN(listingRow.pickup_start_time)} nhé!`,
        );
      }

      if (listingRow.quantity_remaining < dto.quantity) {
        throw new BadRequestException('Số lượng còn lại không đủ.');
      }
      if (dto.quantity > listingRow.max_per_reservation) {
        throw new BadRequestException(
          `Tối đa ${listingRow.max_per_reservation} phần cho mỗi lượt đặt.`,
        );
      }

      // 5. Chỉ chặn nếu đang còn 1 đơn ĐANG XỬ LÝ cho listing này.
      // Đơn đã hoàn tất/huỷ/hết hạn thì cho đặt lại bình thường.
      const activeExisting = await this.prisma.reservation.findFirst({
        where: {
          listingId: dto.listingId,
          receiverId: receiver.id,
          status: { in: ['confirmed', 'picked_up'] },
        },
      });
      if (activeExisting) {
        throw new ConflictException('Bạn đang có một đơn đặt chỗ chưa hoàn tất cho mặt hàng này. Vui lòng hoàn tất hoặc huỷ đơn cũ trước.');
      }

      // 6. Atomic transaction: decrement quantity + create reservation
      const qrValidMinutes = await this.systemConfig.getNumber('QR_VALIDITY_MINUTES');
      const qrExpiresAt = new Date(Date.now() + qrValidMinutes * 60 * 1000);

      const reservation = await this.prisma.$transaction(async (tx) => {
        // Decrement quantity — use SELECT FOR UPDATE equivalent via raw SQL
        await tx.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET
            quantity_remaining = quantity_remaining - ${dto.quantity},
            status = CASE
              WHEN quantity_remaining - ${dto.quantity} <= 0 THEN 'fully_reserved'::listing_status
              ELSE status
            END,
            updated_at = NOW()
          WHERE id = ${dto.listingId}::uuid
        `);

        // Create reservation with crypto QR token
        const [newReservation] = await tx.$queryRaw<{ id: string; qr_token: string }[]>(
          Prisma.sql`
            INSERT INTO reservations (
              listing_id, receiver_id, quantity, status,
              qr_token, qr_expires_at, receiver_notes, delivery_evidence_url,
              delivery_address, delivery_location, delivery_scheduled_at, created_at, updated_at
            ) VALUES (
              ${dto.listingId}::uuid,
              ${receiver.id}::uuid,
              ${dto.quantity},
              'confirmed'::reservation_status,
              encode(gen_random_bytes(32), 'hex'),
              ${qrExpiresAt.toISOString()}::timestamptz,
              ${dto.receiverNotes ?? null},
              ${dto.requestDelivery ? (dto.deliveryEvidenceUrl ?? null) : null},
              ${dto.requestDelivery
                ? (customDestination ? customDestination.address : (dto.deliveryAddress?.trim() || null))
                : null},
              ${dto.requestDelivery && customDestination
                ? Prisma.sql`ST_SetSRID(ST_MakePoint(${customDestination.lng}, ${customDestination.lat}), 4326)::geography`
                : Prisma.sql`NULL`},
              ${dto.requestDelivery && dto.deliveryScheduledAt
                ? Prisma.sql`${new Date(dto.deliveryScheduledAt).toISOString()}::timestamptz`
                : Prisma.sql`NULL`},
              NOW(), NOW()
            )
            RETURNING id, qr_token
          `,
        );

        // Increment receiver's daily count
        await tx.receiverProfile.update({
          where: { id: receiver.id },
          data: { reservationsToday: { increment: 1 } },
        });

        return newReservation;
      });

      // 7. If delivery requested — create delivery row (async, don't block response)
      if (dto.requestDelivery && reservation) {
        // Fire-and-forget nhưng PHẢI log: trước đây lỗi ở đây (Redis down, cột DB
        // thiếu…) biến mất im lặng — người dùng vẫn thấy "đặt chỗ thành công" và
        // màn theo dõi quay vòng "đang tìm TNV" dù chưa từng có ai được mời.
        void this.createDeliveryAsync(reservation.id, dto.listingId).catch((err: unknown) => {
          this.logger.error(
            `Không khởi tạo được chuyến giao cho đơn ${reservation.id}: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
        });
      }

      return {
        reservationId: reservation?.id,
        qrToken: reservation?.qr_token,
        qrExpiresAt,
        message: 'Đặt chỗ thành công! Trình mã QR cho nhà cung cấp để nhận hàng.',
      };
    } finally {
      await lock.release();
    }
  }

  private async createDeliveryAsync(reservationId: string, listingId: string) {
    const delivery = await this.prisma.delivery.create({
      data: { reservationId, status: 'pending_assignment' },
    });

    // Ghi sẵn toạ độ điểm lấy (từ listing) + điểm giao (vị trí người nhận) + khoảng cách lấy→giao.
    // Để FE theo dõi đơn vẽ được bản đồ thật thay vì toạ độ giả.
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE deliveries d
      -- COALESCE: điểm giao riêng của đơn thắng địa chỉ mặc định trong hồ sơ.
      SET pickup_location   = fl.pickup_location,
          delivery_location = COALESCE(r.delivery_location, rp.location),
          distance_km = CASE
            WHEN fl.pickup_location IS NOT NULL AND COALESCE(r.delivery_location, rp.location) IS NOT NULL
            THEN ROUND((ST_Distance(fl.pickup_location::geography, COALESCE(r.delivery_location, rp.location)::geography) / 1000)::numeric, 2)
            ELSE NULL END
      FROM reservations r
      JOIN food_listings fl ON fl.id = ${listingId}::uuid
      LEFT JOIN receiver_profiles rp ON rp.id = r.receiver_id
      WHERE d.id = ${delivery.id}::uuid AND r.id = ${reservationId}::uuid
    `);

    // Get listing pickup coordinates for proximity search
    const [listing] = await this.prisma.$queryRaw<
      { lng: number; lat: number }[]
    >(Prisma.sql`
      SELECT ST_X(pickup_location::geometry) AS lng,
             ST_Y(pickup_location::geometry) AS lat
      FROM food_listings WHERE id = ${listingId}::uuid
    `);

    if (listing) {
      // MÔ HÌNH MỚI: không mời tuần tự 15s nữa. Báo cho các TNV đã đăng ký CA phủ
      // thời điểm giao (giao ngay = bây giờ; hẹn giờ = giờ hẹn) để họ mở Trung tâm
      // giao hàng và tự chọn đơn. Khoảng cách lọc lúc họ xem danh sách (GPS tươi).
      const reservationRow = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { deliveryScheduledAt: true, listing: { select: { title: true } } },
      });
      const targetAt = reservationRow?.deliveryScheduledAt ?? new Date();
      const vn = new Date(targetAt.getTime() + 7 * 3600_000);
      const hour = vn.getUTCHours();
      const period = hour < 6 ? 'midnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      const workDate = vn.toISOString().slice(0, 10);
      const onDuty = await this.prisma.$queryRaw<{ user_id: string }[]>(Prisma.sql`
        SELECT DISTINCT vp.user_id
        FROM delivery_shift_registrations reg
        JOIN volunteer_profiles vp ON vp.id = reg.volunteer_id
        JOIN users u ON u.id = vp.user_id
        WHERE reg.work_date = ${workDate}::date
          AND reg.period = ${period}::campaign_shift_period
          AND u.status = 'active'
        LIMIT 50
      `);
      const scheduledNote = reservationRow?.deliveryScheduledAt
        ? ` (hẹn giao ${new Date(reservationRow.deliveryScheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`
        : '';
      for (const shipper of onDuty) {
        void this.notifications.notify(shipper.user_id, {
          type: 'delivery',
          title: 'Đơn giao mới trong ca của bạn',
          body: `"${reservationRow?.listing.title ?? 'Suất ăn'}"${scheduledNote} đang chờ shipper. Mở Trung tâm giao hàng để nhận đơn.`,
          data: { deliveryId: delivery.id, kind: 'delivery_available' },
        });
      }
    } else {
      // Tin đăng thiếu pickup_location → không thể tìm shipper quanh điểm lấy.
      this.logger.error(
        `Tin đăng ${listingId} không có toạ độ điểm lấy — bỏ qua broadcast cho delivery ${delivery.id}.`,
      );
    }
  }

  async scanQr(qrToken: string, scannerUserId: string) {
    const normalizedToken = qrToken.trim().replace(/[\s-]/g, '').toLowerCase();
    const include = {
      listing: { select: { providerId: true, title: true, quantityUnit: true } },
      receiver: {
        select: {
          userId: true,
          faceImageUrl: true,
          idCardImageUrl: true,
          idCardNumber: true,
          faceDescriptor: true,
          user: { select: { fullName: true, phone: true, avatarUrl: true } },
        },
      },
    } as const;
    const reservation = normalizedToken.length === 64
      ? await this.prisma.reservation.findUnique({
          where: { qrToken: normalizedToken },
          include,
        })
      : await this.resolveReservationByShortQrCode(normalizedToken);

    if (!reservation) throw new NotFoundException('Mã QR không hợp lệ.');
    // QR của GIAO SỈ thuộc về một điểm phát trên tuyến, dùng khi shipper phát hàng cho
    // người dân — không phải mã bàn giao tại cửa hàng. NCC quét nhầm sẽ đẩy sai trạng thái.
    if (reservation.bulkRunStopId) {
      throw new BadRequestException(
        'Đây là mã của một điểm phát trong chuyến giao sỉ — tình nguyện viên dùng khi phát hàng, không quét tại cửa hàng.',
      );
    }
    // Cho quét LẠI khi đơn đã 'picked_up' nhưng CHƯA hoàn tất (provider mất phiên → quét lại để tiếp tục đối chiếu).
    // Chỉ chặn khi đơn đã rời pha lấy hàng (completed/cancelled/expired/no_show).
    if (reservation.status === 'confirmed') {
      if (new Date() > reservation.qrExpiresAt) {
        await this.expire(reservation.id); // Auto-expire
        throw new BadRequestException('Mã QR đã hết hạn. Vui lòng tạo lại đặt chỗ.');
      }
    } else if (reservation.status !== 'picked_up') {
      throw new BadRequestException('Đơn này không còn ở trạng thái chờ lấy hàng (có thể đã hoàn tất hoặc đã huỷ).');
    }

    // Verify scanner is the provider for this listing
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: scannerUserId },
    });
    if (!provider || reservation.listing.providerId !== provider.id) {
      throw new ForbiddenException('Chỉ nhà cung cấp của tin này mới quét được mã QR.');
    }

    const verificationImageUrl =
      reservation.receiver.faceImageUrl ?? reservation.receiver.idCardImageUrl;
    const verificationImageAvailable = !!verificationImageUrl;

    // Lần quét đầu (confirmed → picked_up) mới đổi trạng thái + thông báo; quét lại thì idempotent.
    let status: string = reservation.status;
    // Nếu DB có URL ảnh đăng ký, chuyển trạng thái để provider đối chiếu trực tiếp.
    // FE sẽ chỉ cho confirm sau khi ảnh load thành công; storage có thể là local /uploads
    // hoặc object storage nên không fs.stat() tại đây.
    if (reservation.status === 'confirmed' && verificationImageAvailable) {
      const updated = await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'picked_up',
          scannedBy: scannerUserId,
          scannedAt: new Date(),
        },
      });
      status = updated.status;

      void this.notifications.notify(reservation.receiver.userId, {
        type: 'reservation',
        title: 'Đã xác nhận lấy hàng',
        body: `Đơn "${reservation.listing.title}" đã được nhà cung cấp xác nhận bàn giao.`,
        data: { reservationId: reservation.id, status: 'picked_up' },
      });
    }

    return {
      id: reservation.id,
      status,
      quantity: reservation.quantity,
      listing: { title: reservation.listing.title, quantityUnit: reservation.listing.quantityUnit },
      receiver: {
        fullName: reservation.receiver.user.fullName,
        phone: reservation.receiver.user.phone,
        avatarUrl: reservation.receiver.user.avatarUrl,
        faceImageUrl: reservation.receiver.faceImageUrl,
        idCardImageUrl: reservation.receiver.idCardImageUrl,
        idCardNumber: reservation.receiver.idCardNumber,
        enrolled: reservation.receiver.faceDescriptor !== null,
        verificationImageAvailable,
      },
    };
  }

  private async resolveReservationByShortQrCode(shortCode: string) {
    if (!/^[0-9a-f]{6,16}$/.test(shortCode)) {
      throw new BadRequestException('Mã nhập tay chỉ gồm 6-16 ký tự hex.');
    }

    const matches = await this.prisma.reservation.findMany({
      where: { qrToken: { endsWith: shortCode } },
      include: {
        listing: { select: { providerId: true, title: true, quantityUnit: true } },
        receiver: {
          select: {
            userId: true,
            faceImageUrl: true,
            idCardImageUrl: true,
            idCardNumber: true,
            faceDescriptor: true,
            user: { select: { fullName: true, phone: true, avatarUrl: true } },
          },
        },
      },
      take: 2,
    });

    if (matches.length > 1) {
      throw new BadRequestException('Mã nhập tay bị trùng. Vui lòng quét QR hoặc nhập mã đầy đủ.');
    }

    return matches[0] ?? null;
  }

  /**
   * Provider xác nhận đã bàn giao đúng người sau khi đối chiếu ảnh đăng ký bằng mắt.
   * Thay cho việc receiver tự chụp ảnh: quét QR (picked_up) → provider xác nhận → completed.
   */
  async confirmPickupByProvider(reservationId: string, scannerUserId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: { select: { providerId: true, title: true } },
        receiver: { select: { userId: true, faceImageUrl: true, idCardImageUrl: true } },
      },
    });

    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.status !== 'picked_up') {
      throw new BadRequestException('Đơn chưa được quét QR hoặc đã hoàn tất trước đó.');
    }

    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: scannerUserId },
    });
    if (!provider || reservation.listing.providerId !== provider.id) {
      throw new ForbiddenException('Chỉ nhà cung cấp của đơn này mới xác nhận được.');
    }

    // Lưu lại ảnh đăng ký đã dùng để đối chiếu làm bằng chứng bàn giao
    const proofUrl = reservation.receiver.faceImageUrl ?? reservation.receiver.idCardImageUrl ?? null;
    if (!proofUrl) {
      throw new BadRequestException(
        'Ảnh khuôn mặt xác minh không còn khả dụng. Yêu cầu người nhận cập nhật lại selfie trước khi giao.',
      );
    }
    const verificationType: PickupVerificationType | null = reservation.receiver.faceImageUrl
      ? PickupVerificationType.FACE
      : reservation.receiver.idCardImageUrl
        ? PickupVerificationType.ID_CARD
        : null;

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'completed',
        pickupProofUrl: proofUrl,
        pickupProofAt: new Date(),
        pickupVerificationType: verificationType,
      },
    });

    // Hoàn tất rescue thành công → +2 trust score (CLAUDE.md §9)
    void this.applyTrustDelta(reservation.receiver.userId, reservationId, TrustScoreReason.SUCCESSFUL_RESCUE, 2);

    void this.notifications.notify(reservation.receiver.userId, {
      type: 'reservation',
      title: 'Đã nhận hàng thành công',
      body: `Đơn "${reservation.listing.title}" đã hoàn tất. Cảm ơn bạn đã chung tay cứu trợ thực phẩm!`,
      data: { reservationId, status: 'completed' },
    });

    return { reservationId: updated.id, status: updated.status };
  }

  /**
   * Receiver xác minh danh tính khi lấy hàng bằng ảnh khuôn mặt hoặc CCCD.
   * Ảnh chụp tại chỗ được so khớp với khuôn mặt đã đăng ký (face enrollment) —
   * không khớp thì từ chối, không cho hoàn tất giao/nhận.
   * Chỉ hợp lệ sau khi provider đã quét QR (status = picked_up) → chuyển completed.
   */
  async submitPickupProof(
    reservationId: string,
    userId: string,
    verificationType: PickupVerificationType,
    photo: Express.Multer.File,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { receiver: true },
    });

    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.receiver.userId !== userId) {
      throw new ForbiddenException('Chỉ chủ đơn mới được gửi ảnh xác minh.');
    }
    if (reservation.status !== 'picked_up') {
      throw new BadRequestException(
        'Pickup proof can only be submitted after the provider has scanned your QR code',
      );
    }

    // 1. Phải có khuôn mặt đã đăng ký để đối chiếu
    const enrolledDescriptor = reservation.receiver.faceDescriptor as number[] | null;
    if (!enrolledDescriptor) {
      throw new BadRequestException(
        'FACE_NOT_ENROLLED: You must enroll your face (ID card + selfie) before pickup verification',
      );
    }

    // 2. Trích khuôn mặt từ ảnh chụp tại chỗ (selfie hoặc chân dung trên CCCD)
    const liveDescriptor = await this.faceMatch.getFaceDescriptor(photo);
    if (!liveDescriptor) {
      throw new BadRequestException(
        verificationType === PickupVerificationType.ID_CARD
          ? 'Không nhận diện được khuôn mặt trên ảnh CCCD. Đặt thẻ phẳng và rõ nét.'
          : 'Không nhận diện được khuôn mặt trong ảnh. Vui lòng chụp lại nơi đủ sáng.',
      );
    }

    // 3. So khớp với khuôn mặt đã đăng ký — không khớp thì KHÔNG giao hàng
    const match = this.faceMatch.compare(enrolledDescriptor, liveDescriptor);
    if (!match.matched) {
      throw new ForbiddenException(
        'Khuôn mặt không khớp với khuôn mặt đã đăng ký. Không thể bàn giao.',
      );
    }

    const proofUrl = await this.storage.saveImage(photo, 'pickup-proofs');

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'completed',
        pickupProofUrl: proofUrl,
        pickupProofAt: new Date(),
        pickupVerificationType: verificationType,
      },
    });

    // Hoàn tất rescue thành công → +2 trust score (CLAUDE.md §9)
    void this.applyTrustDelta(userId, reservationId, TrustScoreReason.SUCCESSFUL_RESCUE, 2);

    return {
      reservationId: updated.id,
      status: updated.status,
      pickupProofUrl: proofUrl,
      verificationType,
      matchDistance: match.distance,
      message: 'Identity verified. Reservation completed.',
    };
  }

  async cancel(reservationId: string, userId: string, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        receiver: true,
        listing: { select: { pickupEndTime: true, title: true } },
        delivery: {
          select: { id: true, status: true, shipperId: true, shipper: { select: { userId: true } } },
        },
      },
    });

    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.receiver.userId !== userId) throw new ForbiddenException();
    if (!['confirmed'].includes(reservation.status)) {
      throw new BadRequestException('Chỉ huỷ được đơn đang ở trạng thái đã xác nhận.');
    }

    // Đơn giao hàng: shipper ĐÃ lấy hàng thì không huỷ được nữa (hàng đã rời bếp)
    if (reservation.delivery && ['qc_completed', 'in_transit'].includes(reservation.delivery.status)) {
      throw new BadRequestException(
        'Tình nguyện viên đã lấy hàng và đang trên đường giao — không thể huỷ lúc này.',
      );
    }

    // Huỷ trễ = còn dưới 30 phút trước giờ kết thúc nhận hàng (CLAUDE.md §9)
    const isLateCancellation =
      reservation.listing.pickupEndTime.getTime() - Date.now() < 30 * 60 * 1000;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      // Cancel reservation
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
      }),
      // Restore quantity safely using LEAST to avoid exceeding quantityTotal
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET
          quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(reservation.quantity)}),
          status = 'active'::listing_status,
          updated_at = NOW()
        WHERE id = ${reservation.listingId}::uuid
      `),
      // Decrement daily count (guard gt:0 để không âm sau lúc reset nửa đêm)
      this.prisma.receiverProfile.updateMany({
        where: { id: reservation.receiverId, reservationsToday: { gt: 0 } },
        data: { reservationsToday: { decrement: 1 } },
      }),
    ];

    // Đơn giao chưa lấy hàng: đóng delivery + thu hồi mọi lời mời + giải phóng shipper
    if (reservation.delivery) {
      ops.push(
        this.prisma.delivery.update({
          where: { id: reservation.delivery.id },
          data: { status: 'failed', failedReason: 'Người nhận đã huỷ đơn.' },
        }),
        this.prisma.shipperTaskOffer.updateMany({
          where: { deliveryId: reservation.delivery.id, status: 'pending' },
          data: { status: 'expired', respondedAt: new Date() },
        }),
      );
      if (reservation.delivery.shipperId) {
        ops.push(
          this.prisma.volunteerProfile.update({
            where: { id: reservation.delivery.shipperId },
            data: { isAvailable: true },
          }),
        );
      }
    }

    await this.prisma.$transaction(ops);

    // Báo cho shipper đang trên đường đến lấy biết đơn đã bị huỷ
    if (reservation.delivery?.shipper?.userId) {
      void this.notifications.notify(reservation.delivery.shipper.userId, {
        type: 'delivery',
        title: 'Đơn giao đã bị huỷ',
        body: `Người nhận đã huỷ đơn "${reservation.listing.title}". Bạn có thể nhận đơn khác.`,
        data: { deliveryId: reservation.delivery.id, status: 'failed' },
      });
    }

    // Apply trust score penalty for late cancellation
    if (isLateCancellation) {
      const penalty = await this.systemConfig.getNumber('RESERVATION_LATE_CANCEL_PENALTY');
      if (penalty > 0) {
        void this.applyTrustDelta(userId, reservationId, TrustScoreReason.LATE_CANCELLATION, -penalty);
      }
    }

    return { message: 'Reservation cancelled' };
  }

  /** Provider huỷ đơn của người nhận — không phạt trust của người nhận (lỗi của provider, không phải receiver).
   *  Chỉ cho phép khi đơn ở 'confirmed' và provider là chủ listing.
   *  Hoàn quantity + daily count, đóng delivery (nếu có), không broadcast lại shipper.
   */
  async providerCancel(reservationId: string, providerUserId: string, reason?: string) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { userId: providerUserId } });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: { select: { providerId: true, title: true } },
        receiver: { select: { userId: true } },
        delivery: {
          select: { id: true, status: true, shipperId: true, shipper: { select: { userId: true } } },
        },
      },
    });
    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.listing.providerId !== provider.id) {
      throw new ForbiddenException('Bạn không phải chủ tin đăng của đơn này.');
    }
    if (reservation.status !== 'confirmed') {
      throw new BadRequestException(
        'Chỉ huỷ được đơn ở trạng thái "Đã xác nhận". Đơn đã chuyển sang giao nhận — liên hệ người nhận để xử lý.',
      );
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason ? `[Provider] ${reason}` : '[Provider] Đơn bị nhà cung cấp huỷ.',
        },
      }),
      // Hoàn số lượng cho listing (LEAST để không vượt total)
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET
          quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(reservation.quantity)}),
          status = 'active'::listing_status,
          updated_at = NOW()
        WHERE id = ${reservation.listingId}::uuid
      `),
      // Trả daily count cho receiver
      this.prisma.receiverProfile.updateMany({
        where: { id: reservation.receiverId, reservationsToday: { gt: 0 } },
        data: { reservationsToday: { decrement: 1 } },
      }),
    ];

    // Nếu có delivery, đóng + thu hồi offer pending (không phạt shipper)
    if (reservation.delivery) {
      ops.push(
        this.prisma.delivery.update({
          where: { id: reservation.delivery.id },
          data: { status: 'failed', failedReason: 'Nhà cung cấp đã huỷ đơn.' },
        }),
        this.prisma.shipperTaskOffer.updateMany({
          where: { deliveryId: reservation.delivery.id, status: 'pending' },
          data: { status: 'expired', respondedAt: new Date() },
        }),
      );
      if (reservation.delivery.shipperId) {
        ops.push(
          this.prisma.volunteerProfile.update({
            where: { id: reservation.delivery.shipperId },
            data: { isAvailable: true },
          }),
        );
      }
    }

    await this.prisma.$transaction(ops);

    // Báo cho người nhận
    void this.notifications.notify(reservation.receiver.userId, {
      type: 'reservation',
      title: 'Đơn đã bị nhà cung cấp huỷ',
      body: `Đơn "${reservation.listing.title}" đã bị nhà cung cấp huỷ${reason ? `: ${reason}` : ''}. Bạn không bị trừ điểm uy tín.`,
      data: { reservationId, status: 'cancelled', cancelledByProvider: true },
    });

    // Báo cho shipper nếu đã nhận
    if (reservation.delivery?.shipper?.userId) {
      void this.notifications.notify(reservation.delivery.shipper.userId, {
        type: 'delivery',
        title: 'Đơn giao đã bị huỷ bởi nhà cung cấp',
        body: `Đơn "${reservation.listing.title}" đã bị huỷ — bạn có thể nhận đơn khác.`,
        data: { deliveryId: reservation.delivery.id, status: 'failed' },
      });
    }

    return {
      message: 'Đã huỷ đơn và hoàn số lượng cho tin đăng.',
      reservationId,
      quantityRestored: Number(reservation.quantity),
    };
  }

  /** Trạng thái được coi là "đang xử lý" — phần còn lại thuộc lịch sử. */
  private static readonly ACTIVE_STATUSES = ['confirmed', 'picked_up'] as const;

  async findMyReservations(
    userId: string,
    page = 1,
    limit = 20,
    group?: 'active' | 'history',
  ) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    // Lọc theo tab NGAY TẠI DB. Trước đây FE tải 20 đơn mới nhất rồi tự lọc, nên
    // đơn đang xử lý nằm ngoài 20 đơn đó thì biến mất khỏi giao diện.
    const active = [...ReservationsService.ACTIVE_STATUSES];
    const statusFilter =
      group === 'active' ? { in: active }
      : group === 'history' ? { notIn: active }
      : undefined;

    const [items, total, activeCount, historyCount, completedAgg, noShowCount, cancelledCount] =
      await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where: {
          receiverId: receiver.id,
          ...(statusFilter ? { status: statusFilter as never } : {}),
        },
        include: {
          listing: {
            select: {
              title: true,
              pickupAddress: true,
              imageUrls: true,
              category: true,
              quantityUnit: true,
              weightPerUnitKg: true,
              // FE cần để cảnh báo huỷ trễ (< 30 phút trước giờ kết thúc nhận → -10 điểm)
              pickupEndTime: true,
              provider: { select: { id: true, businessName: true, userId: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reservation.count({
        where: {
          receiverId: receiver.id,
          ...(statusFilter ? { status: statusFilter as never } : {}),
        },
      }),
      // Đếm THEO TOÀN BỘ đơn, không theo trang — để nhãn tab luôn đúng dù đang ở trang mấy
      this.prisma.reservation.count({
        where: { receiverId: receiver.id, status: { in: active as never } },
      }),
      this.prisma.reservation.count({
        where: { receiverId: receiver.id, status: { notIn: active as never } },
      }),
      // Thống kê cho FE: tổng đơn đã nhận + tổng số phần đã cứu + số lần không đến
      this.prisma.reservation.aggregate({
        where: { receiverId: receiver.id, status: 'completed' },
        _count: true,
        _sum: { quantity: true },
      }),
      this.prisma.reservation.count({
        where: { receiverId: receiver.id, status: 'no_show' },
      }),
      // Đơn đã huỷ: người dùng tự huỷ HOẶC hệ thống huỷ (không tìm được TNV giao).
      // Trước đây không đếm nên thẻ thống kê thiếu hẳn một nhóm mà danh sách vẫn hiện.
      this.prisma.reservation.count({
        where: { receiverId: receiver.id, status: 'cancelled' },
      }),
    ]);

    // Ratings là quan hệ đa hình (referenceType/referenceId) — query riêng rồi gắn cờ ratedScore
    const ratings = await this.prisma.rating.findMany({
      where: {
        referenceType: 'reservation',
        referenceId: { in: items.map((r) => r.id) },
        raterId: userId,
      },
      select: { referenceId: true, score: true },
    });
    const ratingByRes = new Map(ratings.map((rt) => [rt.referenceId, rt.score]));

    const itemsWithRating = items.map((r) => ({
      ...r,
      ratedScore: ratingByRes.get(r.id) ?? null,
    }));

    return {
      items: itemsWithRating,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      counts: {
        active: activeCount,
        history: historyCount,
        /** Tổng số đơn từ trước tới nay, không phụ thuộc bộ lọc đang xem. */
        allOrders: activeCount + historyCount,
        completed: completedAgg._count,
        cancelled: cancelledCount,
        noShow: noShowCount,
        portionsSaved: Number(completedAgg._sum.quantity ?? 0),
      },
    };
  }

  /** Provider: xem các đơn đặt trên listings do mình đăng. */
  async findProviderReservations(providerUserId: string, page = 1, limit = 20) {
    const provider = await this.prisma.providerProfile.findUnique({ where: { userId: providerUserId } });
    if (!provider) throw new NotFoundException('Không tìm thấy hồ sơ nhà cung cấp.');

    // Loại các reservation ghi sổ của GIAO SỈ: chúng gắn với một điểm phát trên tuyến,
    // người nhận là tài khoản hệ thống, và NCC đã bàn giao cả lô cho shipper từ trước —
    // không có gì để quét QR hay xử lý. Để lẫn vào đây chỉ làm nhiễu danh sách đơn thật.
    const where = { listing: { providerId: provider.id }, bulkRunStopId: null };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        include: {
          receiver: {
            select: {
              id: true,
              user: { select: { fullName: true, phone: true, avatarUrl: true } },
            },
          },
          listing: {
            select: {
              id: true,
              title: true,
              imageUrls: true,
              category: true,
              quantityUnit: true,
              weightPerUnitKg: true,
              pickupAddress: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Receiver đánh giá nhà cung cấp sau khi nhận hàng (đơn completed). */
  async rateReservation(
    reservationId: string,
    userId: string,
    score: number,
    comment?: string,
    target: RateTarget = 'provider',
  ) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, receiverId: receiver.id },
      include: {
        listing: { select: { provider: { select: { id: true, userId: true } } } },
        delivery: { select: { shipperId: true, shipper: { select: { userId: true } } } },
      },
    });
    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.status !== 'completed') {
      throw new BadRequestException('Chỉ đánh giá được đơn đã hoàn tất.');
    }

    // Chỉ đánh giá được shipper nếu đơn thực sự có người giao — đơn tự đến lấy thì không.
    if (target === 'shipper' && !reservation.delivery?.shipperId) {
      throw new BadRequestException('Đơn này không có tình nguyện viên giao hàng để đánh giá.');
    }

    const rateeUserId =
      target === 'shipper'
        ? reservation.delivery!.shipper!.userId
        : reservation.listing.provider.userId;

    const rating = await this.prisma.rating.upsert({
      where: {
        referenceType_referenceId_raterId_rateeId: {
          referenceType: 'reservation',
          referenceId: reservationId,
          raterId: userId,
          rateeId: rateeUserId,
        },
      },
      update: { score, comment: comment ?? null },
      create: {
        referenceType: 'reservation',
        referenceId: reservationId,
        raterId: userId,
        rateeId: rateeUserId,
        score,
        comment: comment ?? null,
      },
    });

    // Cập nhật avgRating của đúng bên được đánh giá
    const agg = await this.prisma.rating.aggregate({
      where: { referenceType: 'reservation', rateeId: rateeUserId },
      _avg: { score: true },
    });
    if (target === 'shipper') {
      await this.prisma.volunteerProfile.update({
        where: { id: reservation.delivery!.shipperId! },
        data: { avgRating: agg._avg.score ?? null },
      });
    } else {
      await this.prisma.providerProfile.update({
        where: { id: reservation.listing.provider.id },
        data: { avgRating: agg._avg.score ?? null },
      });
    }

    return { id: rating.id, score: rating.score, target, message: 'Cảm ơn bạn đã đánh giá!' };
  }

  /**
   * Cron: xử lý các đơn `confirmed` đã quá hạn QR.
   *
   * Đơn TỰ ĐẾN LẤY (không có delivery row) → `no_show`: hoàn số lượng listing,
   * trả daily count, phạt trust −20 (CLAUDE.md §9).
   *
   * Đơn GIAO HÀNG được xử lý khác:
   * - Đang giao (assigned → in_transit): KHÔNG đụng tới — QR lúc này là mã xác nhận
   *   nhận hàng, không phải deadline đến lấy; vòng đời do delivery quyết định
   *   (delivered → completed, failed → xử lý riêng).
   * - Chưa ai nhận (pending_assignment) quá hạn → `expired` KHÔNG phạt trust
   *   (không phải lỗi người nhận): hoàn số lượng, trả daily count, đóng delivery.
   */
  async expireNoShows(): Promise<number> {
    const now = new Date();
    // Đơn TỰ ĐẾN LẤY = chưa từng có delivery, HOẶC delivery đã bị huỷ (người nhận
    // bấm "Tự đến lấy trực tiếp"). Trước đây chỉ lọc `delivery: null` nên nhóm thứ hai
    // rơi khỏi cả hai truy vấn và nằm 'confirmed' vĩnh viễn, giữ suất ăn không ai nhận được.
    const overdue = await this.prisma.reservation.findMany({
      where: {
        status: 'confirmed',
        qrExpiresAt: { lt: now },
        OR: [
          { delivery: { is: null } },
          { delivery: { status: 'cancelled' } },
        ],
      },
      include: { receiver: { select: { id: true, userId: true } } },
      take: 200,
    });

    for (const r of overdue) {
      await this.prisma.$transaction([
        this.prisma.reservation.update({
          where: { id: r.id },
          data: { status: 'no_show' },
        }),
        this.prisma.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET
            quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(r.quantity)}),
            status = 'active'::listing_status,
            updated_at = NOW()
          WHERE id = ${r.listingId}::uuid
        `),
        this.prisma.receiverProfile.update({
          where: { id: r.receiverId },
          data: { reservationsToday: { decrement: 1 } },
        }),
      ]);
      const noShowPenalty = await this.systemConfig.getNumber('RESERVATION_NO_SHOW_PENALTY');
      if (noShowPenalty > 0) {
        await this.applyTrustDelta(r.receiver.userId, r.id, TrustScoreReason.NO_SHOW, -noShowPenalty);
      }
    }

    // Đơn giao hàng quá hạn mà chưa có shipper nào nhận → hết hạn nhẹ nhàng, không phạt.
    // Gồm cả delivery đã 'failed' (phòng trường hợp reservation chưa kịp đóng theo) —
    // không nhóm nào được phép kẹt 'confirmed' vĩnh viễn.
    const unassigned = await this.prisma.reservation.findMany({
      where: {
        status: 'confirmed',
        qrExpiresAt: { lt: now },
        delivery: { status: { in: ['pending_assignment', 'failed'] } },
      },
      include: { delivery: { select: { id: true, status: true } } },
      take: 200,
    });

    for (const r of unassigned) {
      await this.prisma.$transaction([
        this.prisma.reservation.update({
          where: { id: r.id },
          data: { status: 'expired' },
        }),
        // Chỉ đóng delivery khi nó còn đang tìm shipper — đơn đã 'failed' thì giữ
        // nguyên lý do thất bại gốc thay vì ghi đè.
        ...(r.delivery!.status === 'pending_assignment'
          ? [this.prisma.delivery.update({
              where: { id: r.delivery!.id },
              data: { status: 'failed', failedReason: 'Không tìm được tình nguyện viên giao hàng trong thời gian hiệu lực.' },
            })]
          : []),
        this.prisma.$executeRaw(Prisma.sql`
          UPDATE food_listings
          SET
            quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(r.quantity)}),
            status = 'active'::listing_status,
            updated_at = NOW()
          WHERE id = ${r.listingId}::uuid
        `),
        // updateMany + gt:0 để không âm counter khi đơn hết hạn sau lúc reset nửa đêm
        this.prisma.receiverProfile.updateMany({
          where: { id: r.receiverId, reservationsToday: { gt: 0 } },
          data: { reservationsToday: { decrement: 1 } },
        }),
      ]);
    }

    return overdue.length + unassigned.length;
  }

  /** Cron: reset bộ đếm đặt chỗ trong ngày của tất cả receiver (chạy lúc nửa đêm). */
  async resetDailyReservationCounters(): Promise<void> {
    await this.prisma.receiverProfile.updateMany({
      where: { reservationsToday: { gt: 0 } },
      data: { reservationsToday: 0 },
    });
  }

  async findOne(id: string, userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const reservation = await this.prisma.reservation.findFirst({
      where: { id, receiverId: receiver.id },
      include: {
        listing: {
          include: {
            provider: {
              select: {
                id: true,
                userId: true, // cần để đối chiếu rateeId khi tra đã đánh giá chưa
                businessName: true,
                address: true,
                contactPhone: true,
                avgRating: true,
              },
            },
          },
        },
        delivery: {
          include: {
            shipper: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    avatarUrl: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');

    // Rating là quan hệ đa hình (referenceType/referenceId) nên không include được —
    // query riêng để FE biết đã đánh giá chưa mà không hỏi lại. Một đơn có thể có hai
    // đánh giá: cho cửa hàng và cho shipper, phân biệt bằng rateeId.
    const ratings = await this.prisma.rating.findMany({
      where: { referenceType: 'reservation', referenceId: id, raterId: userId },
      select: { score: true, rateeId: true },
    });
    const providerUserId = reservation.listing.provider.userId;
    const shipperUserId = reservation.delivery?.shipper?.userId ?? null;

    return {
      ...reservation,
      ratedScore: ratings.find((r) => r.rateeId === providerUserId)?.score ?? null,
      ratedShipperScore:
        shipperUserId != null
          ? ratings.find((r) => r.rateeId === shipperUserId)?.score ?? null
          : null,
    };
  }

  /** Đơn hết hạn QR → expired + hoàn số lượng listing + trả daily count (không phạt trust). */
  private async expire(reservationId: string) {
    const r = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { quantity: true, listingId: true, receiverId: true },
    });
    if (!r) return;
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'expired' },
      }),
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE food_listings
        SET
          quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(r.quantity)}),
          status = 'active'::listing_status,
          updated_at = NOW()
        WHERE id = ${r.listingId}::uuid
      `),
      this.prisma.receiverProfile.updateMany({
        where: { id: r.receiverId, reservationsToday: { gt: 0 } },
        data: { reservationsToday: { decrement: 1 } },
      }),
    ]);
  }

  /** Uỷ quyền cho TrustService dùng chung (giữ wrapper để không đổi các call-site cũ). */
  private applyTrustDelta(
    userId: string,
    referenceId: string,
    reason: TrustScoreReason,
    delta: number,
  ) {
    return this.trust.applyDelta(userId, delta, reason, 'reservation', referenceId);
  }
}
