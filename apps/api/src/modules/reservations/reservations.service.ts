import {
  Injectable,
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
import { PickupVerificationType } from '@foodresq/types';
import { CreateReservationDto } from './dto/create-reservation.dto';

const LOCK_TTL_MS = 10_000;   // 10s window để acquire lock và complete transaction

@Injectable()
export class ReservationsService {
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

  async create(receiverUserId: string, dto: CreateReservationDto) {
    // 1. Load receiver profile
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: receiverUserId },
    });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    // 2. Check daily limit (đọc cấu hình live từ system_configs)
    const maxPerDay = await this.systemConfig.getNumber('MAX_RESERVATIONS_PER_DAY');
    if (receiver.reservationsToday >= maxPerDay) {
      throw new BadRequestException(
        `Bạn đã đạt giới hạn ${maxPerDay} lượt đặt chỗ trong ngày. Vui lòng quay lại vào ngày mai.`,
      );
    }

    // 2b. Yêu cầu giao tận nơi → phải có địa chỉ + toạ độ trong hồ sơ,
    // nếu không delivery sẽ không có điểm giao (shipper không điều hướng được).
    if (dto.requestDelivery) {
      const [loc] = await this.prisma.$queryRaw<{ has_location: boolean }[]>(Prisma.sql`
        SELECT (location IS NOT NULL) AS has_location
        FROM receiver_profiles WHERE id = ${receiver.id}::uuid
      `);
      if (!receiver.address || !loc?.has_location) {
        throw new BadRequestException(
          'Vui lòng cập nhật địa chỉ nhận hàng trong hồ sơ trước khi yêu cầu tình nguyện viên giao tận nơi.',
        );
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
        }[]
      >(
        Prisma.sql`
          SELECT id, quantity_remaining, status, max_per_reservation,
                 pickup_start_time, pickup_end_time, expiry_time
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
      if (nowTs < listingRow.pickup_start_time) {
        throw new BadRequestException(
          `Chưa đến giờ nhận hàng. Bạn có thể đặt từ ${this.formatVN(listingRow.pickup_start_time)} nhé!`,
        );
      }
      if (nowTs > listingRow.pickup_end_time || nowTs > listingRow.expiry_time) {
        throw new BadRequestException(
          'Đã quá giờ nhận hàng của tin này. Vui lòng chọn thực phẩm khác còn trong giờ nhận.',
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
              qr_token, qr_expires_at, receiver_notes, created_at, updated_at
            ) VALUES (
              ${dto.listingId}::uuid,
              ${receiver.id}::uuid,
              ${dto.quantity},
              'confirmed'::reservation_status,
              encode(gen_random_bytes(32), 'hex'),
              ${qrExpiresAt.toISOString()}::timestamptz,
              ${dto.receiverNotes ?? null},
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
        void this.createDeliveryAsync(reservation.id, dto.listingId);
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
      SET pickup_location   = fl.pickup_location,
          delivery_location = rp.location,
          distance_km = CASE
            WHEN fl.pickup_location IS NOT NULL AND rp.location IS NOT NULL
            THEN ROUND((ST_Distance(fl.pickup_location::geography, rp.location::geography) / 1000)::numeric, 2)
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
      await this.notifQueue.add(
        'shipper-broadcast',
        { deliveryId: delivery.id, pickupLng: listing.lng, pickupLat: listing.lat },
        { delay: 0, removeOnComplete: true, attempts: 3 },
      );
    }
  }

  async scanQr(qrToken: string, scannerUserId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { qrToken },
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
    });

    if (!reservation) throw new NotFoundException('Mã QR không hợp lệ.');
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

    // Lần quét đầu (confirmed → picked_up) mới đổi trạng thái + thông báo; quét lại thì idempotent.
    let status: string = reservation.status;
    if (reservation.status === 'confirmed') {
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

    // Trả kèm thẻ thông tin người nhận để provider đối chiếu trực tiếp (không cần receiver chụp lại)
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
      },
    };
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
    void this.applyTrustDelta(reservation.receiver.userId, reservationId, 'successful_rescue', 2);

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
    void this.applyTrustDelta(userId, reservationId, 'successful_rescue', 2);

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
      void this.applyTrustDelta(userId, reservationId, 'late_cancellation', -10);
    }

    return { message: 'Reservation cancelled' };
  }

  async findMyReservations(userId: string, page = 1, limit = 20) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where: { receiverId: receiver.id },
        include: {
          listing: {
            select: {
              title: true,
              pickupAddress: true,
              imageUrls: true,
              category: true,
              quantityUnit: true,
              weightPerUnitKg: true,
              provider: { select: { id: true, businessName: true, userId: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reservation.count({ where: { receiverId: receiver.id } }),
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

    return { items: itemsWithRating, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Receiver đánh giá nhà cung cấp sau khi nhận hàng (đơn completed). */
  async rateReservation(
    reservationId: string,
    userId: string,
    score: number,
    comment?: string,
  ) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, receiverId: receiver.id },
      include: { listing: { select: { provider: { select: { id: true, userId: true } } } } },
    });
    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt chỗ.');
    if (reservation.status !== 'completed') {
      throw new BadRequestException('Chỉ đánh giá được đơn đã hoàn tất.');
    }

    const rateeUserId = reservation.listing.provider.userId;

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

    // Cập nhật avgRating của provider
    const agg = await this.prisma.rating.aggregate({
      where: { referenceType: 'reservation', rateeId: rateeUserId },
      _avg: { score: true },
    });
    await this.prisma.providerProfile.update({
      where: { id: reservation.listing.provider.id },
      data: { avgRating: agg._avg.score ?? null },
    });

    return { id: rating.id, score: rating.score, message: 'Cảm ơn bạn đã đánh giá!' };
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
    const overdue = await this.prisma.reservation.findMany({
      where: { status: 'confirmed', qrExpiresAt: { lt: now }, delivery: { is: null } },
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
      await this.applyTrustDelta(r.receiver.userId, r.id, 'no_show', -20);
    }

    // Đơn giao hàng quá hạn mà chưa có shipper nào nhận → hết hạn nhẹ nhàng, không phạt
    const unassigned = await this.prisma.reservation.findMany({
      where: {
        status: 'confirmed',
        qrExpiresAt: { lt: now },
        delivery: { status: 'pending_assignment' },
      },
      include: { delivery: { select: { id: true } } },
      take: 200,
    });

    for (const r of unassigned) {
      await this.prisma.$transaction([
        this.prisma.reservation.update({
          where: { id: r.id },
          data: { status: 'expired' },
        }),
        this.prisma.delivery.update({
          where: { id: r.delivery!.id },
          data: { status: 'failed', failedReason: 'Không tìm được tình nguyện viên giao hàng trong thời gian hiệu lực.' },
        }),
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
    return reservation;
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
  private applyTrustDelta(userId: string, referenceId: string, reason: string, delta: number) {
    return this.trust.applyDelta(userId, delta, reason, 'reservation', referenceId);
  }
}
