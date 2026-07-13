import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { NotificationsGateway } from '@/modules/notifications/notifications.gateway';
import { TrustService } from '@/modules/trust/trust.service';

const OFFER_EXPIRY_MINUTES = 10;
const BROADCAST_RADIUS_M = 5000; // 5km
const MAX_OFFERS_PER_DELIVERY = 5;
// Đơn giao không có cập nhật trạng thái quá số giờ này → coi như shipper bỏ ngang, auto-fail
const DELIVERY_STALL_HOURS = 6;

interface NearbyShipper {
  id: string;
  user_id: string;
  distance_m: number;
}

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @InjectQueue('notification-push') private notifQueue: Queue,
    private gateway: NotificationsGateway,
    private trust: TrustService,
  ) {}

  /** Lưu ảnh proof (QC/giao hàng) của shipper, trả về URL. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'delivery-proofs');
  }

  private async notifyTaskOffer(shipper: NearbyShipper, deliveryId: string, expiresAt: Date) {
    void this.notifQueue.add(
      'delivery-offer-timeout',
      { shipperId: shipper.id, deliveryId, expiresAt },
      { delay: OFFER_EXPIRY_MINUTES * 60 * 1000, removeOnComplete: true },
    );
    this.gateway.emitToUser(shipper.user_id, 'delivery:offer', { deliveryId });
  }

  private async offerNextNearestShipper(deliveryId: string, pickupLng: number, pickupLat: number) {
    const [delivery] = await this.prisma.$queryRaw<{ id: string; status: string; shipper_id: string | null }[]>(Prisma.sql`
      SELECT id, status, shipper_id
      FROM deliveries
      WHERE id = ${deliveryId}::uuid
    `);
    if (!delivery || delivery.status !== 'pending_assignment' || delivery.shipper_id != null) return null;

    await this.prisma.shipperTaskOffer.updateMany({
      where: {
        deliveryId,
        status: 'pending',
        expiresAt: { lte: new Date() },
      },
      data: {
        status: 'expired',
        respondedAt: new Date(),
        rejectReason: 'Offer timeout',
      },
    });

    const shippers = await this.prisma.$queryRaw<NearbyShipper[]>(Prisma.sql`
      SELECT
        vp.id,
        vp.user_id AS user_id,
        ST_Distance(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography
        ) AS distance_m
      FROM volunteer_profiles vp
      JOIN users u ON u.id = vp.user_id
      JOIN volunteer_specializations vs ON vs.volunteer_id = vp.id
        AND vs.specialization = 'shipper'
        AND vs.is_verified = TRUE
      LEFT JOIN shipper_task_offers existing
        ON existing.delivery_id = ${deliveryId}::uuid
       AND existing.shipper_id = vp.id
      WHERE vp.is_available = TRUE
        AND vp.verification_status = 'approved'
        AND vp.current_location IS NOT NULL
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND existing.id IS NULL
        AND ST_DWithin(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography,
          ${BROADCAST_RADIUS_M}
      )
      ORDER BY distance_m ASC
      LIMIT 1
    `);

    const shipper = shippers[0];
    if (!shipper) return null;

    const expiresAt = new Date(Date.now() + OFFER_EXPIRY_MINUTES * 60 * 1000);

    const inserted = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO shipper_task_offers (delivery_id, shipper_id, status, expires_at)
      VALUES (${deliveryId}::uuid, ${shipper.id}::uuid, 'pending'::offer_status, ${expiresAt.toISOString()}::timestamptz)
      ON CONFLICT (delivery_id, shipper_id) DO NOTHING
    `);
    if (inserted !== 1) return null;

    await this.notifyTaskOffer(shipper, deliveryId, expiresAt);
    return shipper;
  }

  // Called after reservation created with requestDelivery=true. Kept as public API for the queue processor.
  async broadcastToNearbyShippers(deliveryId: string, pickupLng: number, pickupLat: number) {
    await this.offerNextNearestShipper(deliveryId, pickupLng, pickupLat);
  }

  async acceptOffer(deliveryId: string, shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer) throw new NotFoundException('Không tìm thấy lời mời giao hàng.');
    if (offer.status !== 'pending') throw new BadRequestException('Lời mời này không còn hiệu lực (đã được phản hồi hoặc hết hạn).');
    if (new Date() > offer.expiresAt) throw new BadRequestException('Lời mời giao hàng đã hết hạn.');

    await this.prisma.$transaction(async (tx) => {
      const assigned = await tx.delivery.updateMany({
        where: {
          id: deliveryId,
          status: 'pending_assignment',
          shipperId: null,
        },
        data: {
          shipperId: volunteer.id,
          status: 'assigned',
          assignedAt: new Date(),
        },
      });

      if (assigned.count !== 1) {
        throw new ConflictException('Đơn này đã được shipper khác nhận.');
      }

      const accepted = await tx.shipperTaskOffer.updateMany({
        where: { id: offer.id, status: 'pending' },
        data: { status: 'accepted', respondedAt: new Date() },
      });
      if (accepted.count !== 1) {
        throw new ConflictException('Lời mời này không còn hiệu lực.');
      }

      await tx.shipperTaskOffer.updateMany({
        where: { deliveryId, id: { not: offer.id }, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      });

      await tx.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: false },
      });
    });

    return this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { reservation: { include: { listing: true } } },
    });
  }

  async rejectOffer(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer || offer.status !== 'pending') {
      throw new BadRequestException('Không có lời mời giao hàng nào đang chờ.');
    }

    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);

    await this.prisma.$transaction(async (tx) => {
      const rejected = await tx.shipperTaskOffer.updateMany({
        where: { id: offer.id, status: 'pending' },
        data: { status: 'rejected', respondedAt: new Date(), rejectReason: reason ?? 'Shipper bỏ qua' },
      });
      if (rejected.count !== 1) {
        throw new BadRequestException('Lời mời này không còn hiệu lực.');
      }
    });

    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.offerNextNearestShipper(deliveryId, coords.pickupLng, coords.pickupLat);
    }

    return { message: 'Offer rejected' };
  }

  async expireOfferAndOfferNext(deliveryId: string, shipperId: string) {
    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId } },
      select: { id: true, status: true, expiresAt: true },
    });
    if (!offer || offer.status !== 'pending' || offer.expiresAt > new Date()) return;

    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);

    const expired = await this.prisma.shipperTaskOffer.updateMany({
      where: { id: offer.id, status: 'pending' },
      data: { status: 'expired', respondedAt: new Date(), rejectReason: 'Offer timeout' },
    });
    if (expired.count !== 1) return;

    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.offerNextNearestShipper(deliveryId, coords.pickupLng, coords.pickupLat);
    }
  }

  async updateStatus(
    deliveryId: string,
    shipperUserId: string,
    newStatus: string,
    proofUrl?: string,
    qrToken?: string,
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        reservation: { select: { id: true, qrToken: true, receiver: { select: { userId: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();

    const transitions: Record<string, string> = {
      assigned: 'heading_to_provider',
      heading_to_provider: 'qc_completed',
      qc_completed: 'in_transit',
      in_transit: 'delivered',
    };

    if (transitions[delivery.status] !== newStatus) {
      throw new BadRequestException('Không thể chuyển sang trạng thái này từ trạng thái hiện tại của đơn.');
    }

    const updateData: Prisma.DeliveryUpdateInput = { status: newStatus as never };

    if (newStatus === 'qc_completed' && proofUrl) {
      updateData.qcPhotoUrl = proofUrl;
      updateData.qcPhotoAt = new Date();
    }
    if (newStatus === 'delivered') {
      // Bàn giao đúng người: shipper phải quét mã QR trên màn hình của người nhận.
      // Không kiểm tra qr_expires_at — QR của đơn giao là mã xác nhận bàn giao,
      // giao hàng thường lâu hơn 30 phút hiệu lực gốc.
      if (!qrToken) {
        throw new BadRequestException(
          'Cần quét mã QR trên màn hình của người nhận để xác nhận bàn giao đúng người.',
        );
      }
      if (qrToken.trim() !== delivery.reservation.qrToken) {
        throw new BadRequestException(
          'Mã QR không khớp với đơn này. Hãy quét mã trong trang theo dõi đơn của người nhận.',
        );
      }

      updateData.deliveredAt = new Date();
      if (proofUrl) {
        updateData.deliveryProofUrl = proofUrl;
        updateData.deliveryProofAt = new Date();
      }

      // Mark reservation as completed + award dedication points (ảnh proof là tùy chọn)
      await this.prisma.$transaction([
        this.prisma.reservation.update({
          where: { id: delivery.reservationId },
          data: { status: 'completed' },
        }),
        this.prisma.volunteerProfile.update({
          where: { id: volunteer.id },
          data: { isAvailable: true, dedicationPoints: { increment: 5 } },
        }),
        this.prisma.dedicationPointsHistory.create({
          data: {
            volunteerId: volunteer.id,
            delta: 5,
            reason: 'delivery_completed',
            referenceType: 'delivery',
            referenceId: deliveryId,
            pointsBefore: volunteer.dedicationPoints,
            pointsAfter: volunteer.dedicationPoints + 5,
          },
        }),
      ]);

      // Giải cứu thành công → +2 trust cho người nhận (đồng nhất với luồng tự đến lấy)
      void this.trust.applyDelta(
        delivery.reservation.receiver.userId,
        2,
        'successful_rescue',
        'reservation',
        delivery.reservation.id,
      );
    }

    return this.prisma.delivery.update({ where: { id: deliveryId }, data: updateData });
  }

  /** Shipper huỷ nhận đơn TRƯỚC khi lấy hàng → đơn quay lại 'chờ nhận' + báo shipper khác. */
  async cancelAssignment(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();
    if (!['assigned', 'heading_to_provider'].includes(delivery.status)) {
      throw new BadRequestException('Chỉ huỷ được khi chưa lấy hàng. Sau khi đã lấy hàng, hãy báo giao thất bại.');
    }

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { shipperId: null, status: 'pending_assignment', assignedAt: null },
      }),
      this.prisma.shipperTaskOffer.updateMany({
        where: { deliveryId, shipperId: volunteer.id, status: 'accepted' },
        data: { status: 'rejected', rejectReason: reason ?? 'Shipper huỷ nhận đơn', respondedAt: new Date() },
      }),
    ]);

    // Mời lại các shipper khác gần điểm lấy hàng
    const coords = (await this.getDeliveryCoords([deliveryId])).get(deliveryId);
    if (coords?.pickupLng != null && coords?.pickupLat != null) {
      await this.broadcastToNearbyShippers(deliveryId, coords.pickupLng, coords.pickupLat);
    }
    return { id: deliveryId, status: 'pending_assignment' };
  }

  /** Shipper báo giao THẤT BẠI (sau khi đã lấy hàng) — bắt buộc lý do. */
  async failDelivery(deliveryId: string, shipperUserId: string, reason?: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');
    if (!reason || !reason.trim()) throw new BadRequestException('Vui lòng nhập lý do giao thất bại.');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();
    if (!['qc_completed', 'in_transit'].includes(delivery.status)) {
      throw new BadRequestException('Chỉ báo thất bại sau khi đã lấy hàng (QC xong).');
    }

    await this.prisma.$transaction([
      this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'failed', failedReason: reason.trim() } }),
      this.prisma.volunteerProfile.update({ where: { id: volunteer.id }, data: { isAvailable: true } }),
      // Đóng luôn reservation — nếu để 'confirmed' thì đơn treo vĩnh viễn (không cron nào xử lý)
      this.prisma.reservation.update({
        where: { id: delivery.reservationId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: `Giao hàng thất bại: ${reason.trim()}`,
        },
      }),
    ]);
    return { id: deliveryId, status: 'failed' };
  }

  /**
   * Cron: auto-fail các đơn giao KẸT — shipper đã nhận nhưng không cập nhật trạng thái
   * quá DELIVERY_STALL_HOURS giờ (bỏ ngang giữa chừng).
   * - Chưa lấy hàng (assigned/heading_to_provider): hàng vẫn ở provider → hoàn số lượng listing.
   * - Đã lấy hàng (qc_completed/in_transit): hàng đã rời bếp → không hoàn số lượng.
   * - Giải phóng shipper (is_available=true); reservation đang `confirmed` → `expired`
   *   (không phạt trust người nhận — không phải lỗi của họ).
   */
  async expireStalledDeliveries(): Promise<number> {
    const cutoff = new Date(Date.now() - DELIVERY_STALL_HOURS * 60 * 60 * 1000);
    const stalled = await this.prisma.delivery.findMany({
      where: {
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
        updatedAt: { lt: cutoff },
      },
      include: {
        reservation: { select: { id: true, status: true, quantity: true, listingId: true } },
      },
      take: 100,
    });

    for (const d of stalled) {
      const beforePickup = d.status === 'assigned' || d.status === 'heading_to_provider';
      const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.delivery.update({
          where: { id: d.id },
          data: {
            status: 'failed',
            failedReason: `Tự động huỷ: đơn không được cập nhật trạng thái trong ${DELIVERY_STALL_HOURS} giờ.`,
          },
        }),
      ];
      if (d.shipperId) {
        ops.push(
          this.prisma.volunteerProfile.update({
            where: { id: d.shipperId },
            data: { isAvailable: true },
          }),
        );
      }
      if (d.reservation.status === 'confirmed') {
        ops.push(
          this.prisma.reservation.update({
            where: { id: d.reservation.id },
            data: { status: 'expired' },
          }),
        );
      }
      if (beforePickup) {
        ops.push(
          this.prisma.$executeRaw(Prisma.sql`
            UPDATE food_listings
            SET
              quantity_remaining = LEAST(quantity_total, quantity_remaining + ${Number(d.reservation.quantity)}),
              status = 'active'::listing_status,
              updated_at = NOW()
            WHERE id = ${d.reservation.listingId}::uuid
          `),
        );
      }
      await this.prisma.$transaction(ops);
    }

    return stalled.length;
  }

  /**
   * Cron: (1) đóng các offer `pending` đã quá hạn thành `expired`;
   * (2) đơn `pending_assignment` còn hiệu lực (reservation chưa hết hạn QR)
   * mà không còn offer nào đang chờ → phát lại lời mời cho các shipper gần đó
   * (kể cả shipper đã bỏ lỡ lần trước — trừ người đã từ chối).
   */
  async sweepOffersAndRebroadcast(): Promise<number> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE shipper_task_offers
      SET status = 'expired'::offer_status, responded_at = NOW()
      WHERE status = 'pending' AND expires_at < NOW()
    `);

    const stuck = await this.prisma.$queryRaw<
      { id: string; plng: number | null; plat: number | null }[]
    >(Prisma.sql`
      SELECT d.id,
             ST_X(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plng,
             ST_Y(COALESCE(d.pickup_location, fl.pickup_location)::geometry) AS plat
      FROM deliveries d
      JOIN reservations r ON r.id = d.reservation_id
      JOIN food_listings fl ON fl.id = r.listing_id
      WHERE d.status = 'pending_assignment'
        AND r.status = 'confirmed'
        AND r.qr_expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM shipper_task_offers o
          WHERE o.delivery_id = d.id AND o.status = 'pending'
        )
      LIMIT 20
    `);

    for (const d of stuck) {
      if (d.plng != null && d.plat != null) {
        await this.broadcastToNearbyShippers(d.id, Number(d.plng), Number(d.plat));
      }
    }

    return stuck.length;
  }

  /** Lấy toạ độ lấy hàng / giao hàng (cột geography) cho danh sách delivery. */
  private async getDeliveryCoords(ids: string[]) {
    if (ids.length === 0) return new Map<string, { pickupLng: number | null; pickupLat: number | null; deliveryLng: number | null; deliveryLat: number | null }>();
    const rows = await this.prisma.$queryRaw<
      { id: string; plng: number | null; plat: number | null; dlng: number | null; dlat: number | null }[]
    >(Prisma.sql`
      SELECT id,
        ST_X(pickup_location::geometry) AS plng, ST_Y(pickup_location::geometry) AS plat,
        ST_X(delivery_location::geometry) AS dlng, ST_Y(delivery_location::geometry) AS dlat
      FROM deliveries WHERE id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
    `);
    return new Map(
      rows.map((r) => [r.id, { pickupLng: r.plng, pickupLat: r.plat, deliveryLng: r.dlng, deliveryLat: r.dlat }]),
    );
  }

  async getMyActiveDelivery(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      include: {
        reservation: {
          include: {
            listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
            receiver: {
              select: { address: true, user: { select: { fullName: true, phone: true } } },
            },
          },
        },
      },
    });
    if (!delivery) return null;
    const coords = (await this.getDeliveryCoords([delivery.id])).get(delivery.id) ?? null;
    return { ...delivery, coords };
  }

  /** Lịch sử giao hàng của shipper (đã giao / thất bại) — phân trang server-side. */
  async getMyDeliveryHistory(shipperUserId: string, opts: { page?: number; limit?: number } = {}) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({ where: { userId: shipperUserId } });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 20, 100);
    const where: Prisma.DeliveryWhereInput = {
      shipperId: volunteer.id,
      status: { in: ['delivered', 'failed'] },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ deliveredAt: 'desc' }, { updatedAt: 'desc' }],
        include: {
          reservation: {
            include: {
              listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
              receiver: { include: { user: { select: { fullName: true } } } },
            },
          },
        },
      }),
      this.prisma.delivery.count({ where }),
    ]);

    return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** Bảng thành tích shipper (kiểu dashboard tài xế Grab/Xanh SM). */
  async getMyStats(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
      select: { id: true, dedicationPoints: true, rank: true, avgRating: true },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [delivered, failed, todayDelivered, kmAgg] = await this.prisma.$transaction([
      this.prisma.delivery.count({ where: { shipperId: volunteer.id, status: 'delivered' } }),
      this.prisma.delivery.count({ where: { shipperId: volunteer.id, status: 'failed' } }),
      this.prisma.delivery.count({
        where: { shipperId: volunteer.id, status: 'delivered', deliveredAt: { gte: startOfToday } },
      }),
      this.prisma.delivery.aggregate({
        where: { shipperId: volunteer.id, status: 'delivered' },
        _sum: { distanceKm: true },
      }),
    ]);

    const attempts = delivered + failed;
    return {
      totalDelivered: delivered,
      todayDelivered,
      totalFailed: failed,
      completionRate: attempts > 0 ? Math.round((delivered / attempts) * 100) : null,
      totalKm: Math.round(Number(kmAgg._sum.distanceKm ?? 0) * 10) / 10,
      dedicationPoints: volunteer.dedicationPoints,
      rank: volunteer.rank,
      avgRating: volunteer.avgRating != null ? Number(volunteer.avgRating) : null,
    };
  }

  /** Người nhận theo dõi đơn giao của mình: trạng thái + vị trí shipper trực tiếp. */
  async getTrackingForReceiver(reservationId: string, receiverUserId: string) {
    const receiver = await this.prisma.receiverProfile.findUnique({ where: { userId: receiverUserId }, select: { id: true } });
    if (!receiver) throw new NotFoundException('Không tìm thấy hồ sơ người nhận.');

    const delivery = await this.prisma.delivery.findUnique({
      where: { reservationId },
      include: {
        reservation: { select: { receiverId: true, listing: { select: { title: true, pickupAddress: true } } } },
        shipper: { select: { id: true, user: { select: { fullName: true, phone: true } } } },
      },
    });
    if (!delivery) throw new NotFoundException('Đơn này chưa có thông tin giao hàng.');
    if (delivery.reservation.receiverId !== receiver.id) throw new ForbiddenException();

    let coords = (await this.getDeliveryCoords([delivery.id])).get(delivery.id) ?? null;

    // Fallback: đơn cũ chưa được ghi sẵn toạ độ vào deliveries → lấy trực tiếp
    // từ listing (điểm lấy) và receiver_profiles (điểm giao) để FE vẫn vẽ được bản đồ.
    if (
      coords == null ||
      coords.pickupLng == null || coords.pickupLat == null ||
      coords.deliveryLng == null || coords.deliveryLat == null
    ) {
      const [fb] = await this.prisma.$queryRaw<
        { plng: number | null; plat: number | null; dlng: number | null; dlat: number | null }[]
      >(Prisma.sql`
        SELECT
          ST_X(fl.pickup_location::geometry) AS plng, ST_Y(fl.pickup_location::geometry) AS plat,
          ST_X(rp.location::geometry) AS dlng, ST_Y(rp.location::geometry) AS dlat
        FROM reservations r
        JOIN food_listings fl ON fl.id = r.listing_id
        LEFT JOIN receiver_profiles rp ON rp.id = r.receiver_id
        WHERE r.id = ${reservationId}::uuid
      `);
      if (fb) {
        coords = {
          pickupLng: coords?.pickupLng ?? fb.plng,
          pickupLat: coords?.pickupLat ?? fb.plat,
          deliveryLng: coords?.deliveryLng ?? fb.dlng,
          deliveryLat: coords?.deliveryLat ?? fb.dlat,
        };
      }
    }

    let shipperLocation: { lng: number; lat: number } | null = null;
    if (delivery.shipperId) {
      const [row] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(Prisma.sql`
        SELECT ST_X(current_location::geometry) AS lng, ST_Y(current_location::geometry) AS lat
        FROM volunteer_profiles WHERE id = ${delivery.shipperId}::uuid
      `);
      if (row?.lng != null && row?.lat != null) shipperLocation = { lng: row.lng, lat: row.lat };
    }

    return {
      status: delivery.status,
      distanceKm: delivery.distanceKm != null ? Number(delivery.distanceKm) : null,
      listingTitle: delivery.reservation.listing.title,
      pickupAddress: delivery.reservation.listing.pickupAddress,
      coords,
      shipper: delivery.shipper
        ? { name: delivery.shipper.user.fullName, phone: delivery.shipper.user.phone, location: shipperLocation }
        : null,
    };
  }

  async getMyPendingOffers(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const offers = await this.prisma.shipperTaskOffer.findMany({
      where: {
        shipperId: volunteer.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      include: {
        delivery: {
          include: {
            reservation: {
              include: {
                listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
                receiver: { select: { address: true } },
              },
            },
          },
        },
      },
      orderBy: { offeredAt: 'asc' },
    });

    const coordsMap = await this.getDeliveryCoords(offers.map((o) => o.deliveryId));
    return offers.map((o) => ({ ...o, delivery: { ...o.delivery, coords: coordsMap.get(o.deliveryId) ?? null } }));
  }
}
