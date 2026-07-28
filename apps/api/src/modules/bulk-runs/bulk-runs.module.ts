import { Module } from '@nestjs/common';
import { BulkRunsController } from './bulk-runs.controller';
import { BulkRunsService } from './bulk-runs.service';
import { BulkRunsCron } from './bulk-runs.cron';
import { StorageModule } from '@/common/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [BulkRunsController],
  providers: [BulkRunsService, BulkRunsCron],
  exports: [BulkRunsService],
})
export class BulkRunsModule {}
