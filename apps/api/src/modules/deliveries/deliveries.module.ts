import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { NotificationProcessor } from './processors/notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification-push' }),
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, NotificationProcessor],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
