# 006 - Global Exception Filter (RFC 7807)

## Description

Implement a global exception filter that formats all error responses according to the RFC 7807 Problem Details specification.

## Tasks

- [ ] Create global exception filter in `common/filters/`
  - Catch all exceptions (HttpException, TypeORM errors, unknown errors)
  - Format responses as RFC 7807 Problem Details JSON:
    ```json
    {
      "type": "https://skyhigh.com/problems/<type-suffix>",
      "title": "<Human-readable title>",
      "status": <HTTP status code>,
      "detail": "<Specific error message>",
      "instance": "<Request path>"
    }
    ```
- [ ] Define standard error types as constants:
  - `seat-already-held` (409)
  - `hold-expired` (410)
  - `payment-required` (402)
  - `flight-not-found` (404)
  - `seat-not-found` (404)
  - `checkin-not-found` (404)
  - `already-checked-in` (409)
  - `already-on-waitlist` (409)
  - `cancellation-not-allowed` (403)
  - `rate-limit-exceeded` (429)
  - `unauthorized` (401)
- [ ] Create custom exception classes for each domain error
- [ ] Register the filter globally in `main.ts`

## Acceptance Criteria

- All error responses conform to RFC 7807 format
- Each domain error maps to the correct HTTP status and type suffix
- Unhandled exceptions return a generic 500 error in RFC 7807 format
