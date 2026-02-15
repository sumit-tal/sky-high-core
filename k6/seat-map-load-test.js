import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL } from './helpers/config.js';
import { authHeaders } from './helpers/jwt.js';
import { fetchFlight, generatePassengerId } from './helpers/api.js';

/**
 * Seat Map Retrieval Load Test
 *
 * Target: 500 concurrent virtual users
 * Threshold: P95 response time < 1 second
 * Duration: 2 minutes
 *
 * Validates that the Redis-cached seat map endpoint performs
 * within latency targets under high read concurrency.
 */

const seatMapDuration = new Trend('seat_map_duration', true);
const seatMapFailRate = new Rate('seat_map_fail_rate');

export const options = {
  scenarios: {
    seat_map_load: {
      executor: 'constant-vus',
      vus: 500,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    seat_map_duration: ['p(95)<1000'],
    seat_map_fail_rate: ['rate<0.01'],
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

export default function run(data) {
  const passengerId = generatePassengerId(__VU);
  const headers = authHeaders(passengerId);
  const res = http.get(`${BASE_URL}/api/v1/flights/${data.flightId}/seats`, {
    headers,
    tags: { name: 'GET_seat_map' },
  });
  seatMapDuration.add(res.timings.duration);
  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has seats array': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.seats);
    },
    'response has flightId': (r) => {
      const body = JSON.parse(r.body);
      return body.flightId === data.flightId;
    },
  });
  seatMapFailRate.add(!passed);
  sleep(0.1);
}
