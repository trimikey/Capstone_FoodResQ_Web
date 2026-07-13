import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DeliveriesService } from '../deliveries.service';

interface ShipperBroadcastJob {
  deliveryId: string;
  pickupLng: number;
  pickupLat: number;
}

interface DeliveryOfferTimeoutJob {
  shipperId: string;
  deliveryId: string;
  expiresAt: string;
}

@Processor('notification-push')
export class NotificationProcessor extends WorkerHost {
  constructor(private deliveriesService: DeliveriesService) {
    super();
  }

  async process(job: Job<ShipperBroadcastJob | DeliveryOfferTimeoutJob>) {
    if (job.name === 'shipper-broadcast') {
      const data = job.data as ShipperBroadcastJob;
      await this.deliveriesService.broadcastToNearbyShippers(
        data.deliveryId,
        data.pickupLng,
        data.pickupLat,
      );
    }
    if (job.name === 'delivery-offer-timeout') {
      const data = job.data as DeliveryOfferTimeoutJob;
      await this.deliveriesService.expireOfferAndOfferNext(data.deliveryId, data.shipperId);
    }
  }
}
