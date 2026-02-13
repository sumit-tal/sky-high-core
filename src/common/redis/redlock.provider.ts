import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock from 'redlock';
import { REDIS_CLIENT, REDLOCK_INSTANCE } from './redis.constants';

const REDLOCK_RETRY_COUNT = 3;
const REDLOCK_RETRY_DELAY_MS = 200;
const REDLOCK_RETRY_JITTER_MS = 100;

/**
 * Provides a Redlock instance backed by the primary Redis client.
 * Used for distributed locking on seats and waitlist operations.
 */
export const redlockProvider: Provider = {
  provide: REDLOCK_INSTANCE,
  inject: [REDIS_CLIENT],
  useFactory: (redisClient: Redis): Redlock => {
    return new Redlock([redisClient], {
      retryCount: REDLOCK_RETRY_COUNT,
      retryDelay: REDLOCK_RETRY_DELAY_MS,
      retryJitter: REDLOCK_RETRY_JITTER_MS,
      automaticExtensionThreshold: 500,
    });
  },
};
