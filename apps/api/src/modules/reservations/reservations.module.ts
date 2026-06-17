import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { RedlockModule } from '@/common/redlock/redlock.module';
import { StorageModule } from '@/common/storage/storage.module';
import { FaceMatchModule } from '@/common/face-match/face-match.module';

@Module({
  imports: [
    RedlockModule,
    StorageModule,
    FaceMatchModule,
    BullModule.registerQueue({ name: 'notification-push' }),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
