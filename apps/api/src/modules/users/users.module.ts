import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { StorageModule } from '@/common/storage/storage.module';
import { FaceMatchModule } from '@/common/face-match/face-match.module';

@Module({
  imports: [StorageModule, FaceMatchModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
