import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock, { Lock } from 'redlock';
import { REDIS_CLIENT, REDIS_TTL, REDLOCK_INSTANCE } from './redis.constants';

/**
 * Utility service wrapping common Redis and Redlock operations.
 * Provides typed helpers for seat holds, seat map caching,
 * rate limiting, and distributed locking.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDLOCK_INSTANCE) private readonly redlock: Redlock,
  ) {}

  // ── Generic key operations ──────────────────────────────────────────

  /**
   * Set a key with an expiration in seconds.
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Get the value of a key.
   */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /**
   * Delete one or more keys.
   */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    return this.redis.del(...keys);
  }

  /**
   * Check whether a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Get the remaining TTL of a key in seconds (-2 if key doesn't exist, -1 if no TTL).
   */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  // ── Seat hold operations ────────────────────────────────────────────

  /**
   * Place a seat hold with the configured TTL.
   * The value stored is the passenger ID holding the seat.
   */
  async setSeatHold(seatHoldKey: string, passengerId: string, ttlSeconds: number = REDIS_TTL.SEAT_HOLD): Promise<void> {
    await this.redis.set(seatHoldKey, passengerId, 'EX', ttlSeconds);
  }

  /**
   * Retrieve the passenger ID currently holding a seat.
   */
  async getSeatHold(seatHoldKey: string): Promise<string | null> {
    return this.redis.get(seatHoldKey);
  }

  /**
   * Release a seat hold only if the current holder matches (CAS pattern).
   * Returns true if the hold was released, false otherwise.
   */
  async releaseSeatHoldIfOwner(seatHoldKey: string, passengerId: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, seatHoldKey, passengerId);
    return result === 1;
  }

  // ── Seat map cache operations ───────────────────────────────────────

  /**
   * Cache a seat map JSON string with a short TTL.
   */
  async setSeatMapCache(cacheKey: string, data: string, ttlSeconds: number = REDIS_TTL.SEAT_MAP_CACHE): Promise<void> {
    await this.redis.set(cacheKey, data, 'EX', ttlSeconds);
  }

  /**
   * Retrieve a cached seat map.
   */
  async getSeatMapCache(cacheKey: string): Promise<string | null> {
    return this.redis.get(cacheKey);
  }

  // ── Rate limiting (sorted set / sliding window) ─────────────────────

  /**
   * Add a request timestamp to the rate-limit sorted set and return
   * the current count within the window.
   */
  async addRateLimitEntry(rateLimitKey: string, nowMs: number, windowMs: number): Promise<number> {
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(rateLimitKey, 0, nowMs - windowMs);
    pipeline.zadd(rateLimitKey, nowMs.toString(), `${nowMs}`);
    pipeline.zcard(rateLimitKey);
    pipeline.pexpire(rateLimitKey, windowMs);
    const results = await pipeline.exec();
    if (!results || !results[2]) {
      return 0;
    }
    const [err, count] = results[2];
    if (err) {
      this.logger.error(`Rate limit pipeline error: ${err.message}`);
      return 0;
    }
    return count as number;
  }

  // ── Distributed locking (Redlock) ───────────────────────────────────

  /**
   * Acquire a distributed lock.
   * @returns The Lock instance (call lock.release() when done).
   */
  async acquireLock(resource: string, ttlMs: number): Promise<Lock> {
    return this.redlock.acquire([resource], ttlMs);
  }

  /**
   * Release a previously acquired lock.
   */
  async releaseLock(lock: Lock): Promise<void> {
    await lock.release();
  }

  // ── Health check ────────────────────────────────────────────────────

  /**
   * Ping Redis to verify connectivity.
   */
  async ping(): Promise<string> {
    return this.redis.ping();
  }
}
