import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redlock from 'redlock';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => {
        return new Redis(config.getOrThrow<string>('REDIS_URL'));
      },
      inject: [ConfigService],
    },
    {
      provide: Redlock,
      useFactory: (redis: Redis) => {
        return new Redlock([redis], {
          driftFactor: 0.01,
          retryCount: 3,
          retryDelay: 200,
          retryJitter: 100,
        });
      },
      inject: ['REDIS_CLIENT'],
    },
  ],
  exports: [Redlock, 'REDIS_CLIENT'],
})
export class RedlockModule {}
