import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { BASE_URL } from './helpers/config.js';
import { authHeaders } from './helpers/jwt.js';
import { fetchFlight, generatePassengerId } from './helpers/api.js';

/**
 * Abuse Detection Load Test
 *
 * Simulates bot-like traffic exceeding the rate limit threshold
 * (>50 requests within a 2-second sliding window from a single source).
 * Verifies that 429 Too Many Requests responses trigger correctly under load.
 *
 * Strategy:
 * - Scenario 1 (burst): A single VU sends rapid-fire requests to trigger 429s.
 * - Scenario 2 (distributed): Multiple VUs send requests at normal pace to
 *   verify they are NOT rate-limited (each VU has a unique source identity).
 */

const rateLimited429Count = new Counter('rate_limited_429_count');
const rateLimitedRate = new Rate('rate_limited_triggered');
const normalRequestSuccessRate = new Rate('normal_request_success_rate');

export const options = {
  scenarios: {
    abuse_burst: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 200,
      maxDuration: '30s',
      exec: 'burstTraffic',
    },
    normal_traffic: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      startTime: '35s',
      exec: 'normalTraffic',
    },
  },
  thresholds: {
    rate_limited_429_count: ['count>10'],
    rate_limited_triggered: ['rate>0.50'],
    normal_request_success_rate: ['rate>0.95'],
  },
};

export function setup() {
  const passengerId = generatePassengerId(1);
  const flight = fetchFlight(passengerId);
  if (!flight) {
    throw new Error('Setup failed: could not fetch flight data');
  }
  return { flightId: flight.id };
}

/**
 * Burst traffic scenario: sends >50 requests in rapid succession
 * from a single VU to trigger the rate limiter.
 */
export function burstTraffic(data) {
  const passengerId = generatePassengerId(9999);
  const headers = authHeaders(passengerId);
  const res = http.get(`${BASE_URL}/api/v1/flights/${data.flightId}/seats`, {
    headers,
    tags: { name: 'ABUSE_burst_request' },
  });
  const is429 = res.status === 429;
  const is200 = res.status === 200;
  check(res, {
    'burst: status is 200 or 429': () => is200 || is429,
  });
  if (is429) {
    rateLimited429Count.add(1);
    check(res, {
      'burst: 429 has retry-after header': (r) => {
        const retryAfter = r.headers['Retry-After'] || r.headers['retry-after'];
        return retryAfter !== undefined && retryAfter !== null;
      },
    });
  }
  rateLimitedRate.add(is429);
}

/**
 * Normal traffic scenario: multiple VUs send requests at a reasonable pace.
 * Each VU should stay under the rate limit and receive 200 responses.
 */
export function normalTraffic(data) {
  const passengerId = generatePassengerId(__VU + 5000);
  const headers = authHeaders(passengerId);
  const res = http.get(`${BASE_URL}/api/v1/flights/${data.flightId}/seats`, {
    headers,
    tags: { name: 'ABUSE_normal_request' },
  });
  const isSuccess = res.status === 200;
  check(res, {
    'normal: status is 200': () => isSuccess,
  });
  normalRequestSuccessRate.add(isSuccess);
  sleep(1);
}
