import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsCron } from './reservations.cron';
import { RedlockModule } from '@/common/redlock/redlock.module';
import { StorageModule } from '@/common/storage/storage.module';
import { FaceMatchModule } from '@/common/face-match/face-match.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { TrustModule } from '@/modules/trust/trust.module';

@Module({
  imports: [
    RedlockModule,
    StorageModule,
    FaceMatchModule,
    NotificationsModule,
    TrustModule,
    BullModule.registerQueue({ name: 'notification-push' }),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsCron],
  exports: [ReservationsService],
})
export class ReservationsModule {}
