import { Global, Module, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { redisClientProvider, redisSubscriberProvider } from './redis-client.provider';
import { redlockProvider } from './redlock.provider';
import { RedisKeyExpirySubscriber } from './redis-key-expiry.subscriber';
import { RedisService } from './redis.service';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

/**
 * Global module that provides Redis client, Redlock, keyspace subscriber,
 * and the RedisService utility to the entire application.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    redisClientProvider,
    redisSubscriberProvider,
    redlockProvider,
    RedisKeyExpirySubscriber,
    RedisService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisService],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly redisSubscriber: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing Redis connections…');
    await this.redisClient.quit();
    await this.redisSubscriber.quit();
  }
}
