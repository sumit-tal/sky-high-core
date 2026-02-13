import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { REDIS_EXPIRED_CHANNEL, REDIS_KEY_PREFIX, REDIS_SUBSCRIBER } from './redis.constants';

/** Event payload emitted when a seat hold expires */
export interface SeatHoldExpiredEvent {
  readonly seatId: string;
  readonly key: string;
}

export const SEAT_HOLD_EXPIRED_EVENT = 'seat.hold.expired';

/**
 * Subscribes to Redis keyspace notifications for expired keys.
 * When a `hold:{seatId}` key expires, it emits a domain event
 * so downstream handlers can release the seat or reassign from waitlist.
 */
@Injectable()
export class RedisKeyExpirySubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisKeyExpirySubscriber.name);

  constructor(
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe(REDIS_EXPIRED_CHANNEL);
    this.logger.log(`Subscribed to ${REDIS_EXPIRED_CHANNEL}`);
    this.subscriber.on('message', (channel: string, key: string) => {
      if (channel !== REDIS_EXPIRED_CHANNEL) {
        return;
      }
      this.handleExpiredKey(key);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe(REDIS_EXPIRED_CHANNEL);
    this.logger.log(`Unsubscribed from ${REDIS_EXPIRED_CHANNEL}`);
  }

  private handleExpiredKey(key: string): void {
    const holdPrefix = `${REDIS_KEY_PREFIX.SEAT_HOLD}:`;
    if (!key.startsWith(holdPrefix)) {
      return;
    }
    const seatId = key.slice(holdPrefix.length);
    this.logger.debug(`Seat hold expired: seatId=${seatId}`);
    const event: SeatHoldExpiredEvent = { seatId, key };
    this.eventEmitter.emit(SEAT_HOLD_EXPIRED_EVENT, event);
  }
}
