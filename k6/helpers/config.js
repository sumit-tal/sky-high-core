/**
 * Shared configuration for k6 load tests.
 * All environment variables can be overridden via k6 --env flags.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3010';
export const JWT_SECRET = __ENV.JWT_SECRET || 'test-jwt-secret';
export const FLIGHT_INDEX = parseInt(__ENV.FLIGHT_INDEX || '0', 10);
