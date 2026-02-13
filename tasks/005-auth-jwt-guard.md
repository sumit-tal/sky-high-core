# 005 - JWT Authentication Guard

## Description

Implement JWT validation guard and `@CurrentUser` decorator. The service validates JWTs issued by an external IdP — it does not issue tokens.

## Tasks

- [ ] Create JWT auth guard in `common/guards/`
  - Validate `Authorization: Bearer <token>` header
  - Verify token signature using `JWT_SECRET`
  - Extract claims: `sub` (passenger UUID), `iat`, `exp`
  - Return 401 (RFC 7807 format) for missing/invalid/expired tokens
- [ ] Create `@CurrentUser` decorator in `common/decorators/`
  - Extracts passenger ID from the validated JWT payload
- [ ] Apply guard globally (except `/health` endpoint)
- [ ] Create a utility to generate test JWTs for development/testing

## Acceptance Criteria

- Requests without a valid JWT receive 401 in RFC 7807 format
- Requests with a valid JWT have `passengerId` available via `@CurrentUser`
- `/health` endpoint is accessible without authentication
