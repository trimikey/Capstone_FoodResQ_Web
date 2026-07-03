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

const OFFER_EXPIRY_MINUTES = 2;
const BROADCAST_RADIUS_M = 5000; // 5km
const MAX_OFFERS_PER_DELIVERY = 5;

interface NearbyShipper {
  id: string;
  user_id: string;
  distance_m: number;
}

/** Kết quả theo dõi đơn giao cho receiver — KHỚP contract FE mobile (useDeliveryTracking). */
export interface DeliveryTrackingResult {
  status: string;
  distanceKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  coords: {
    pickupLng: number | null;
    pickupLat: number | null;
    deliveryLng: number | null;
    deliveryLat: number | null;
  } | null;
  shipper: {
    name: string;
    phone: string | null;
    location: { lng: number; lat: number } | null;
  } | null;
}

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @InjectQueue('notification-push') private notifQueue: Queue,
    private gateway: NotificationsGateway,
  ) {}

  /** Lưu ảnh proof (QC/giao hàng) của shipper, trả về URL. */
  async saveProofPhoto(photo: Express.Multer.File): Promise<string> {
    return this.storage.saveImage(photo, 'delivery-proofs');
  }

  // Called after reservation created with requestDelivery=true
  async broadcastToNearbyShippers(deliveryId: string, pickupLng: number, pickupLat: number) {
    // Find up to 5 nearest available shippers with 'shipper' specialization
    const shippers = await this.prisma.$queryRaw<NearbyShipper[]>(Prisma.sql`
      SELECT
        vp.id,
        vp.user_id AS user_id,
        ST_Distance(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography
        ) AS distance_m
      FROM volunteer_profiles vp
      JOIN volunteer_specializations vs ON vs.volunteer_id = vp.id
        AND vs.specialization = 'shipper'
        AND vs.is_verified = TRUE
      WHERE vp.is_available = TRUE
        AND vp.current_location IS NOT NULL
        AND ST_DWithin(
          vp.current_location::geography,
          ST_MakePoint(${pickupLng}, ${pickupLat})::geography,
          ${BROADCAST_RADIUS_M}
        )
      ORDER BY distance_m ASC
      LIMIT ${MAX_OFFERS_PER_DELIVERY}
    `);

    if (shippers.length === 0) return;

    const expiresAt = new Date(Date.now() + OFFER_EXPIRY_MINUTES * 60 * 1000);

    // Insert offers + queue push notifications in one transaction
    await this.prisma.$transaction(async (tx) => {
      for (const shipper of shippers) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO shipper_task_offers (delivery_id, shipper_id, status, expires_at)
          VALUES (${deliveryId}::uuid, ${shipper.id}::uuid, 'pending'::offer_status, ${expiresAt.toISOString()}::timestamptz)
          ON CONFLICT (delivery_id, shipper_id) DO NOTHING
        `);
      }
    });

    // Push notifications (fire-and-forget, not blocking)
    for (const shipper of shippers) {
      void this.notifQueue.add(
        'task-offer',
        { shipperId: shipper.id, deliveryId, expiresAt },
        { delay: 0, removeOnComplete: true },
      );
    }

    // Realtime: bật popup nhận đơn ngay trên app shipper (không phải chờ poll 15s)
    for (const shipper of shippers) {
      this.gateway.emitToUser(shipper.user_id, 'delivery:offer', { deliveryId });
    }
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

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Không tìm thấy đơn giao hàng.');
    if (delivery.status !== 'pending_assignment') {
      throw new ConflictException('Đơn đã được tình nguyện viên khác nhận.');
    }

    // Atomic: accept this offer + expire all others + assign shipper
    await this.prisma.$transaction([
      this.prisma.shipperTaskOffer.update({
        where: { id: offer.id },
        data: { status: 'accepted', respondedAt: new Date() },
      }),
      this.prisma.shipperTaskOffer.updateMany({
        where: { deliveryId, id: { not: offer.id }, status: 'pending' },
        data: { status: 'expired', respondedAt: new Date() },
      }),
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          shipperId: volunteer.id,
          status: 'assigned',
          assignedAt: new Date(),
        },
      }),
      this.prisma.volunteerProfile.update({
        where: { id: volunteer.id },
        data: { isAvailable: false },
      }),
    ]);

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

    await this.prisma.shipperTaskOffer.update({
      where: { id: offer.id },
      data: { status: 'rejected', respondedAt: new Date(), rejectReason: reason ?? null },
    });

    return { message: 'Offer rejected' };
  }

  async updateStatus(
    deliveryId: string,
    shipperUserId: string,
    newStatus: string,
    proofUrl?: string,
  ) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
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
    }

    return this.prisma.delivery.update({ where: { id: deliveryId }, data: updateData });
  }

  async getMyActiveDelivery(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    return this.prisma.delivery.findFirst({
      where: {
        shipperId: volunteer.id,
        status: { in: ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'] },
      },
      include: {
        reservation: {
          include: {
            listing: { select: { title: true, pickupAddress: true, imageUrls: true } },
            receiver: {
              include: { user: { select: { fullName: true, phone: true } } },
            },
          },
        },
      },
    });
  }

  async getMyPendingOffers(shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Không tìm thấy hồ sơ tình nguyện viên.');

    return this.prisma.shipperTaskOffer.findMany({
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
              },
            },
          },
        },
      },
      orderBy: { offeredAt: 'asc' },
    });
  }

  /**
   * Receiver theo dõi đơn giao của CHÍNH MÌNH theo reservationId.
   * Trả trạng thái đơn + toạ độ lấy/giao + vị trí hiện tại của shipper.
   * Cột geography đọc qua $queryRaw + ST_X/ST_Y (Prisma không đọc trực tiếp).
   */
  async trackByReservation(
    reservationId: string,
    receiverUserId: string,
  ): Promise<DeliveryTrackingResult> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: { select: { title: true, pickupAddress: true } },
        receiver: { select: { userId: true } },
        delivery: {
          include: {
            shipper: { include: { user: { select: { fullName: true, phone: true } } } },
          },
        },
      },
    });

    if (!reservation) throw new NotFoundException('Không tìm thấy đơn đặt.');
    if (reservation.receiver.userId !== receiverUserId) {
      throw new ForbiddenException('Bạn không có quyền xem đơn này.');
    }

    const listingTitle = reservation.listing.title;
    const pickupAddress = reservation.listing.pickupAddress;
    const delivery = reservation.delivery;

    // Chưa có đơn giao → đang chờ phân tài xế.
    if (!delivery) {
      return {
        status: 'pending_assignment',
        distanceKm: null,
        listingTitle,
        pickupAddress,
        coords: null,
        shipper: null,
      };
    }

    // Toạ độ lấy/giao của đơn (geography → lng/lat qua ST_X/ST_Y trên ::geometry).
    const [coordsRow] = await this.prisma.$queryRaw<
      { plng: number | null; plat: number | null; dlng: number | null; dlat: number | null }[]
    >(Prisma.sql`
      SELECT
        ST_X(pickup_location::geometry) AS plng,
        ST_Y(pickup_location::geometry) AS plat,
        ST_X(delivery_location::geometry) AS dlng,
        ST_Y(delivery_location::geometry) AS dlat
      FROM deliveries
      WHERE id = ${delivery.id}::uuid
    `);

    const coords = {
      pickupLng: coordsRow?.plng != null ? Number(coordsRow.plng) : null,
      pickupLat: coordsRow?.plat != null ? Number(coordsRow.plat) : null,
      deliveryLng: coordsRow?.dlng != null ? Number(coordsRow.dlng) : null,
      deliveryLat: coordsRow?.dlat != null ? Number(coordsRow.dlat) : null,
    };

    // Thông tin shipper + vị trí hiện tại (chỉ khi đã gán shipper).
    let shipper: DeliveryTrackingResult['shipper'] = null;
    if (delivery.shipper) {
      const [locRow] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>(
        Prisma.sql`
          SELECT ST_X(current_location::geometry) AS lng, ST_Y(current_location::geometry) AS lat
          FROM volunteer_profiles
          WHERE id = ${delivery.shipper.id}::uuid AND current_location IS NOT NULL
        `,
      );
      const location =
        locRow && locRow.lng != null && locRow.lat != null
          ? { lng: Number(locRow.lng), lat: Number(locRow.lat) }
          : null;
      shipper = {
        name: delivery.shipper.user.fullName,
        phone: delivery.shipper.user.phone ?? null,
        location,
      };
    }

    return {
      status: delivery.status,
      distanceKm: delivery.distanceKm != null ? Number(delivery.distanceKm) : null,
      listingTitle,
      pickupAddress,
      coords,
      shipper,
    };
  }
}
