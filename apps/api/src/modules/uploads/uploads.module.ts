import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadsController } from './uploads.controller';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [
    StorageModule,
    MulterModule.register({
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  ],
  controllers: [UploadsController],
})
export class UploadsModule {}
