import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { FaceMatchModule } from '@/common/face-match/face-match.module';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [
    PassportModule,
    FaceMatchModule,
    StorageModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, FirebaseAdminService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
