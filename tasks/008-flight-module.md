# 008 - Flight Module (Read-Only)

## Description

Implement the flight module with read-only endpoints for listing and retrieving flight details.

## Tasks

- [ ] Create `flight/` module, controller, service
- [ ] Implement endpoints:
  - `GET /api/v1/flights` — List flights with pagination (query params: page, limit)
  - `GET /api/v1/flights/:flightId` — Get flight details (includes aircraft type info)
- [ ] Create response DTOs
- [ ] Return 404 (RFC 7807 `flight-not-found`) for invalid flight IDs

## Acceptance Criteria

- `GET /api/v1/flights` returns paginated flight list
- `GET /api/v1/flights/:flightId` returns flight details with aircraft type
- Invalid flight ID returns 404 in RFC 7807 format
