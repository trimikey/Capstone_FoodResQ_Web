import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { NotificationProcessor } from './processors/notification.processor';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification-push' }),
    StorageModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, NotificationProcessor],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
