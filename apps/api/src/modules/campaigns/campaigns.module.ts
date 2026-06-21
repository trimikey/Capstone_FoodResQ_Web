import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
