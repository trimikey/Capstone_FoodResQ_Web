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
import { PickupVerificationType } from '@foodresq/types';
import { CreateReservationDto } from './dto/create-reservation.dto';

const LOCK_TTL_MS = 10_000;   // 10s window để acquire lock và complete transaction
const QR_VALID_MINUTES = 30;

@Injectable()
export class ReservationsService {
  private readonly maxPerDay: number;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private redlock: Redlock,
    private storage: StorageService,
    private faceMatch: FaceMatchService,
    @InjectQueue('notification-push') private notifQueue: Queue,
  ) {
    this.maxPerDay = this.config.get<number>('MAX_RESERVATIONS_PER_DAY') ?? 3;
  }

  async create(receiverUserId: string, dto: CreateReservationDto) {
    // 1. Load receiver profile
    const receiver = await this.prisma.receiverProfile.findUnique({
      where: { userId: receiverUserId },
    });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

    // 2. Check daily limit
    if (receiver.reservationsToday >= this.maxPerDay) {
      throw new BadRequestException(
        `Daily reservation limit reached (max ${this.maxPerDay}/day)`,
      );
    }

    // 3. Acquire distributed lock on this listing
    const lockKey = `lock:reservation:${dto.listingId}`;
    const lock = await this.redlock
      .acquire([lockKey], LOCK_TTL_MS)
      .catch(() => {
        throw new ConflictException('Listing is busy — please try again in a few seconds');
      });

    try {
      // 4. Re-read listing inside the lock (prevent race condition)
      const [listingRow] = await this.prisma.$queryRaw<
        { id: string; quantity_remaining: number; status: string; max_per_reservation: number }[]
      >(
        Prisma.sql`
          SELECT id, quantity_remaining, status, max_per_reservation
          FROM food_listings
          WHERE id = ${dto.listingId}::uuid AND deleted_at IS NULL
        `,
      );

      if (!listingRow) throw new NotFoundException('Listing not found');
      if (listingRow.status !== 'active') {
        throw new BadRequestException('Listing is no longer active');
      }
      if (listingRow.quantity_remaining < dto.quantity) {
        throw new BadRequestException('Not enough quantity remaining');
      }
      if (dto.quantity > listingRow.max_per_reservation) {
        throw new BadRequestException(
          `Max ${listingRow.max_per_reservation} units per reservation`,
        );
      }

      // 5. Check: receiver hasn't already reserved this listing
      const existing = await this.prisma.reservation.findUnique({
        where: { listingId_receiverId: { listingId: dto.listingId, receiverId: receiver.id } },
      });
      if (existing) throw new ConflictException('You already have a reservation for this listing');

      // 6. Atomic transaction: decrement quantity + create reservation
      const qrExpiresAt = new Date(Date.now() + QR_VALID_MINUTES * 60 * 1000);

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
        message: 'Reservation confirmed. Show QR code to provider.',
      };
    } finally {
      await lock.release();
    }
  }

  private async createDeliveryAsync(reservationId: string, listingId: string) {
    const delivery = await this.prisma.delivery.create({
      data: { reservationId, status: 'pending_assignment' },
    });

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
      include: { listing: { select: { providerId: true } } },
    });

    if (!reservation) throw new NotFoundException('Invalid QR code');
    if (reservation.status !== 'confirmed') {
      throw new BadRequestException(`Reservation is already ${reservation.status}`);
    }
    if (new Date() > reservation.qrExpiresAt) {
      // Auto-expire
      await this.expire(reservation.id);
      throw new BadRequestException('QR code has expired');
    }

    // Verify scanner is the provider for this listing
    const provider = await this.prisma.providerProfile.findUnique({
      where: { userId: scannerUserId },
    });
    if (!provider || reservation.listing.providerId !== provider.id) {
      throw new ForbiddenException('Only the listing provider can scan this QR');
    }

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'picked_up',
        scannedBy: scannerUserId,
        scannedAt: new Date(),
      },
    });
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

    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.receiver.userId !== userId) {
      throw new ForbiddenException('Only the reservation owner can submit pickup proof');
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
          ? 'No face detected on the ID card photo. Keep the card flat and sharp.'
          : 'No face detected in the photo. Please retake with good lighting.',
      );
    }

    // 3. So khớp với khuôn mặt đã đăng ký — không khớp thì KHÔNG giao hàng
    const match = this.faceMatch.compare(enrolledDescriptor, liveDescriptor);
    if (!match.matched) {
      throw new ForbiddenException(
        'Face does not match the registered face for this account. Handover denied.',
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
      include: { receiver: true },
    });

    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.receiver.userId !== userId) throw new ForbiddenException();
    if (!['confirmed'].includes(reservation.status)) {
      throw new BadRequestException('Only confirmed reservations can be cancelled');
    }

    const isLateCancellation =
      reservation.createdAt.getTime() > Date.now() - 30 * 60 * 1000;

    await this.prisma.$transaction([
      // Cancel reservation
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
      }),
      // Restore quantity
      this.prisma.foodListing.update({
        where: { id: reservation.listingId },
        data: {
          quantityRemaining: { increment: Number(reservation.quantity) },
          status: 'active',
        },
      }),
      // Decrement daily count
      this.prisma.receiverProfile.update({
        where: { id: reservation.receiverId },
        data: { reservationsToday: { decrement: 1 } },
      }),
    ]);

    // Apply trust score penalty for late cancellation
    if (isLateCancellation) {
      void this.applyTrustDelta(userId, reservationId, 'late_cancellation', -10);
    }

    return { message: 'Reservation cancelled' };
  }

  async findMyReservations(userId: string, page = 1, limit = 20) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

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
    if (!receiver) throw new NotFoundException('Receiver profile not found');

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, receiverId: receiver.id },
      include: { listing: { select: { provider: { select: { id: true, userId: true } } } } },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== 'completed') {
      throw new BadRequestException('Only completed reservations can be rated');
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

  async findOne(id: string, userId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId } });
    if (!receiver) throw new NotFoundException('Receiver profile not found');

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

    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation;
  }

  private async expire(reservationId: string) {
    await this.prisma.$transaction([
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'expired' },
      }),
    ]);
  }

  private async applyTrustDelta(
    userId: string,
    referenceId: string,
    reason: string,
    delta: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const newScore = Math.min(100, Math.max(0, user.trustScore + delta));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          trustScore: newScore,
          // Auto-ban if score drops to threshold
          status: newScore <= 30 ? 'banned' : newScore <= 60 ? 'suspended' : user.status,
        },
      }),
      this.prisma.trustScoreHistory.create({
        data: {
          userId,
          delta,
          reason: reason as never,
          referenceType: 'reservation',
          referenceId,
          scoreBefore: user.trustScore,
          scoreAfter: newScore,
        },
      }),
      // Force-revoke all refresh tokens on ban
      ...(newScore <= 30
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, isRevoked: false },
              data: { isRevoked: true, revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
  }
}
