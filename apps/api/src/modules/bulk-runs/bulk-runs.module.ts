import { Module } from '@nestjs/common';
import { BulkRunsController } from './bulk-runs.controller';
import { BulkRunsService } from './bulk-runs.service';
import { BulkRunsCron } from './bulk-runs.cron';
import { StorageModule } from '@/common/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { TrustModule } from '@/modules/trust/trust.module';

@Module({
  imports: [StorageModule, NotificationsModule, TrustModule],
  controllers: [BulkRunsController],
  providers: [BulkRunsService, BulkRunsCron],
  exports: [BulkRunsService],
})
export class BulkRunsModule {}
