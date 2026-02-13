import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

/**
 * Provides the primary Redis client used for commands (get, set, del, etc.).
 */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number): number => Math.min(times * 200, 2000),
      enableReadyCheck: true,
      lazyConnect: false,
    });
  },
};

/**
 * Provides a dedicated Redis client for pub/sub subscriptions.
 * A separate connection is required because a subscribed client
 * cannot issue regular commands.
 */
export const redisSubscriberProvider: Provider = {
  provide: REDIS_SUBSCRIBER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number): number => Math.min(times * 200, 2000),
      enableReadyCheck: true,
      lazyConnect: false,
    });
  },
};
