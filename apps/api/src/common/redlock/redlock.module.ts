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
        const url = config.getOrThrow<string>('REDIS_URL');
        const redis = new Redis(url, {
          maxRetriesPerRequest: null,
          retryStrategy: (times) => {
            if (times > 100) return null; // stop after 100 retries
            return Math.min(times * 200, 2000);
          },
          reconnectOnError: (err) => {
            const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
            return targetErrors.some((e) => err.message.includes(e));
          },
        });
        redis.on('error', (err) => {
          console.error('[Redis] Connection error:', err.message);
        });
        redis.on('ready', () => {
          console.log('[Redis] Connected successfully');
        });
        return redis;
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
          automaticExtensionThreshold: 500,
        });
      },
      inject: ['REDIS_CLIENT'],
    },
  ],
  exports: [Redlock, 'REDIS_CLIENT'],
})
export class RedlockModule {}
