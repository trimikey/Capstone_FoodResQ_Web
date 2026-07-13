import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesCron } from './deliveries.cron';
import { NotificationProcessor } from './processors/notification.processor';
import { StorageModule } from '@/common/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { TrustModule } from '@/modules/trust/trust.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification-push' }),
    StorageModule,
    NotificationsModule,
    TrustModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, DeliveriesCron, NotificationProcessor],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
