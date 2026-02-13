# 009 - Seat Map Module (with Redis Caching)

## Description

Implement the seat map retrieval endpoint with Redis caching (2s TTL) for high-performance seat availability queries.

## Tasks

- [ ] Create `seat/` module, controller, service
- [ ] Implement endpoint:
  - `GET /api/v1/flights/:flightId/seats` — Return seat map with availability
- [ ] Create response DTO matching the API contract:
  ```json
  {
    "flightId": "uuid",
    "aircraft": "A320",
    "seats": [{ "id": "uuid", "row": 1, "column": "A", "status": "AVAILABLE" }]
  }
  ```
- [ ] Implement Redis caching (`seatmap:{flightId}`, TTL: 2s)
  - On cache hit: return cached JSON
  - On cache miss: query PostgreSQL, cache result, return
- [ ] Implement cache invalidation on seat state changes
- [ ] Return 404 for invalid flight IDs

## Acceptance Criteria

- Seat map is returned with correct structure
- Cached responses are served within P95 < 1s target
- Cache is invalidated when any seat state changes on the flight
- Subsequent requests within 2s are served from cache
