import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsCron } from './campaigns.cron';
import { KitchenOpsController } from './kitchen-ops.controller';
import { KitchenOpsService } from './kitchen-ops.service';
import { DishStepsService } from './dish-steps.service';
import { DishStepsController } from './dish-steps.controller';
import { WeeklyScheduleController } from './weekly-schedule.controller';
import { CampaignIncidentsController } from './campaign-incidents.controller';
import { CampaignIncidentsService } from './campaign-incidents.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/common/storage/storage.module';
import { DeliveriesModule } from '@/modules/deliveries/deliveries.module';
import { TrustModule } from '@/modules/trust/trust.module';

@Module({
  imports: [NotificationsModule, StorageModule, DeliveriesModule, TrustModule],
  controllers: [
    // Đăng ký TRƯỚC CampaignsController để 'incidents/:id/resolve' không bị route ':id/...' nuốt.
    CampaignIncidentsController,
    CampaignsController,
    KitchenOpsController,
    DishStepsController,
    WeeklyScheduleController,
  ],
  providers: [CampaignsService, CampaignsCron, KitchenOpsService, DishStepsService, CampaignIncidentsService],
})
export class CampaignsModule {}
