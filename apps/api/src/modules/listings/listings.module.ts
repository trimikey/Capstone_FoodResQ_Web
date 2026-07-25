import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingsCron } from './listings.cron';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingsCron],
  exports: [ListingsService],
})
export class ListingsModule {}
