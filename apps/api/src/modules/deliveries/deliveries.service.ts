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

const OFFER_EXPIRY_MINUTES = 2;
const BROADCAST_RADIUS_M = 5000; // 5km
const MAX_OFFERS_PER_DELIVERY = 5;

interface NearbyShipper {
  id: string;
  distance_m: number;
}

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notification-push') private notifQueue: Queue,
  ) {}

  // Called after reservation created with requestDelivery=true
  async broadcastToNearbyShippers(deliveryId: string, pickupLng: number, pickupLat: number) {
    // Find up to 5 nearest available shippers with 'shipper' specialization
    const shippers = await this.prisma.$queryRaw<NearbyShipper[]>(Prisma.sql`
      SELECT
        vp.id,
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
  }

  async acceptOffer(deliveryId: string, shipperUserId: string) {
    const volunteer = await this.prisma.volunteerProfile.findUnique({
      where: { userId: shipperUserId },
    });
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== 'pending') throw new BadRequestException(`Offer is already ${offer.status}`);
    if (new Date() > offer.expiresAt) throw new BadRequestException('Offer has expired');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'pending_assignment') {
      throw new ConflictException('Delivery already assigned to another shipper');
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
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

    const offer = await this.prisma.shipperTaskOffer.findUnique({
      where: { deliveryId_shipperId: { deliveryId, shipperId: volunteer.id } },
    });

    if (!offer || offer.status !== 'pending') {
      throw new BadRequestException('No pending offer found');
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
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipperId !== volunteer.id) throw new ForbiddenException();

    const transitions: Record<string, string> = {
      assigned: 'heading_to_provider',
      heading_to_provider: 'qc_completed',
      qc_completed: 'in_transit',
      in_transit: 'delivered',
    };

    if (transitions[delivery.status] !== newStatus) {
      throw new BadRequestException(
        `Invalid transition: ${delivery.status} → ${newStatus}`,
      );
    }

    const updateData: Prisma.DeliveryUpdateInput = { status: newStatus as never };

    if (newStatus === 'qc_completed' && proofUrl) {
      updateData.qcPhotoUrl = proofUrl;
      updateData.qcPhotoAt = new Date();
    }
    if (newStatus === 'delivered' && proofUrl) {
      updateData.deliveryProofUrl = proofUrl;
      updateData.deliveryProofAt = new Date();
      updateData.deliveredAt = new Date();

      // Mark reservation as completed + award dedication points
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
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

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
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

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
}
