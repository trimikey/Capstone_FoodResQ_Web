import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsCron } from './campaigns.cron';
import { KitchenOpsController } from './kitchen-ops.controller';
import { KitchenOpsService } from './kitchen-ops.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [CampaignsController, KitchenOpsController],
  providers: [CampaignsService, CampaignsCron, KitchenOpsService],
})
export class CampaignsModule {}
