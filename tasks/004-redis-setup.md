# 004 - Redis Client & Redlock Setup

## Description

Configure the Redis client provider, set up Redlock for distributed locking, and establish the Redis keyspace notification subscriber.

## Tasks

- [ ] Create Redis client provider in `common/redis/`
  - Configure connection using `REDIS_URL` environment variable
  - Export as a NestJS provider
- [ ] Set up Redlock instance with the Redis client
  - Configure retry settings for lock acquisition
- [ ] Define Redis key patterns as constants:
  - `lock:seat:{seatId}` — Seat lock (TTL: 5s)
  - `lock:waitlist:{flightId}` — Waitlist lock (TTL: 5s)
  - `hold:{seatId}` — Seat hold (TTL: 120s)
  - `seatmap:{flightId}` — Seat map cache (TTL: 2s)
  - `ratelimit:{ip}` — Rate limiter sorted set (TTL: 2s)
- [ ] Set up Redis keyspace notification subscriber
  - Subscribe to `__keyevent@0__:expired` channel
  - Parse expired key to identify hold expirations (`hold:{seatId}`)
- [ ] Create utility methods for common Redis operations

## Acceptance Criteria

- Redis client connects successfully on application startup
- Redlock can acquire and release locks
- Keyspace notification subscriber receives expiry events
- All key patterns are defined as typed constants
