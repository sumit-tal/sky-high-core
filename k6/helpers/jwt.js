import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { JWT_SECRET } from './config.js';

const ALGORITHM = 'HS256';
const TOKEN_EXPIRY_SECONDS = 3600;

/**
 * Base64url-encodes a string (no padding).
 */
const base64UrlEncode = (str) => {
  return encoding
    .b64encode(str, 'rawstd')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Generates a signed JWT for a given passenger UUID.
 * Uses HMAC-SHA256 matching the NestJS JwtModule configuration.
 */
export const generateToken = (passengerId) => {
  const now = Math.floor(Date.now() / 1000);
  const header = JSON.stringify({ alg: ALGORITHM, typ: 'JWT' });
  const payload = JSON.stringify({
    sub: passengerId,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
  });
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.hmac('sha256', JWT_SECRET, signingInput, 'base64rawurl');
  return `${signingInput}.${signature}`;
};

/**
 * Returns standard authorization headers with a JWT for the given passenger.
 */
export const authHeaders = (passengerId) => ({
  Authorization: `Bearer ${generateToken(passengerId)}`,
  'Content-Type': 'application/json',
});
