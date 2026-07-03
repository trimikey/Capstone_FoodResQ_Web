import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { NotificationProcessor } from './processors/notification.processor';
import { StorageModule } from '@/common/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification-push' }),
    StorageModule,
    NotificationsModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, NotificationProcessor],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
