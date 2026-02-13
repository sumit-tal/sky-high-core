/**
 * Redis key pattern prefixes and TTL configuration for the SkyHigh system.
 */

/** TTL values in seconds */
export const REDIS_TTL = {
  SEAT_LOCK: 5,
  WAITLIST_LOCK: 5,
  SEAT_HOLD: 120,
  SEAT_MAP_CACHE: 2,
  RATE_LIMIT: 2,
} as const;

/** Redis key prefixes */
export const REDIS_KEY_PREFIX = {
  SEAT_LOCK: 'lock:seat',
  WAITLIST_LOCK: 'lock:waitlist',
  SEAT_HOLD: 'hold',
  SEAT_MAP_CACHE: 'seatmap',
  RATE_LIMIT: 'ratelimit',
} as const;

/**
 * Builds typed Redis keys from their constituent parts.
 */
export const RedisKey = {
  seatLock: (seatId: string): string => `${REDIS_KEY_PREFIX.SEAT_LOCK}:${seatId}`,
  waitlistLock: (flightId: string): string => `${REDIS_KEY_PREFIX.WAITLIST_LOCK}:${flightId}`,
  seatHold: (seatId: string): string => `${REDIS_KEY_PREFIX.SEAT_HOLD}:${seatId}`,
  seatMapCache: (flightId: string): string => `${REDIS_KEY_PREFIX.SEAT_MAP_CACHE}:${flightId}`,
  rateLimit: (ip: string): string => `${REDIS_KEY_PREFIX.RATE_LIMIT}:${ip}`,
} as const;

/** Keyspace notification channel for expired keys */
export const REDIS_EXPIRED_CHANNEL = '__keyevent@0__:expired';

/** Injection tokens */
export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER';
export const REDLOCK_INSTANCE = 'REDLOCK_INSTANCE';
