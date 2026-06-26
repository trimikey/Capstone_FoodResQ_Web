import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { SystemConfigModule } from './common/system-config/system-config.module';
import { RedlockModule } from './common/redlock/redlock.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { ReportsModule } from './modules/reports/reports.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EsgModule } from './modules/esg/esg.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),

    // BullMQ — connect to Redis via env
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
      inject: [ConfigService],
    }),

    PrismaModule,
    SystemConfigModule,
    RedlockModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    ReservationsModule,
    DeliveriesModule,
    ReportsModule,
    VolunteersModule,
    AdminModule,
    NotificationsModule,
    EsgModule,
    CampaignsModule,
    UploadsModule,
  ],
})
export class AppModule {}
