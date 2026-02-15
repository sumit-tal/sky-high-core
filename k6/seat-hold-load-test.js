import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL } from './helpers/config.js';
import { authHeaders } from './helpers/jwt.js';
import { fetchFlight, fetchAvailableSeats, generatePassengerId } from './helpers/api.js';

/**
 * Seat Hold Acquisition Load Test
 *
 * Target: 200 concurrent virtual users
 * Threshold: P95 response time < 500ms
 * Duration: 2 minutes
 *
 * Validates that the Redlock-based seat hold mechanism performs
 * within latency targets under concurrent write pressure.
 * Each VU picks a random available seat and attempts to hold it.
 * Expects a mix of 201 (success) and 409 (contention) responses.
 */

const seatHoldDuration = new Trend('seat_hold_duration', true);
const seatHoldFailRate = new Rate('seat_hold_fail_rate');
const seatHoldContentionRate = new Rate('seat_hold_contention_rate');

export const options = {
  scenarios: {
    seat_hold_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    seat_hold_duration: ['p(95)<500'],
    seat_hold_fail_rate: ['rate<0.05'],
  },
};

export function setup() {
  const passengerId = generatePassengerId(1);
  const flight = fetchFlight(passengerId);
  if (!flight) {
    throw new Error('Setup failed: could not fetch flight data');
  }
  const availableSeats = fetchAvailableSeats(flight.id, passengerId);
  if (availableSeats.length === 0) {
    throw new Error('Setup failed: no available seats found');
  }
  return {
    flightId: flight.id,
    seatIds: availableSeats.map((s) => s.id),
  };
}

export default function run(data) {
  const passengerId = generatePassengerId(__VU + 1000);
  const headers = authHeaders(passengerId);
  const randomSeatIndex = Math.floor(Math.random() * data.seatIds.length);
  const seatId = data.seatIds[randomSeatIndex];
  const payload = JSON.stringify({
    flightId: data.flightId,
    seatId: seatId,
  });
  const res = http.post(`${BASE_URL}/api/v1/check-ins`, payload, {
    headers,
    tags: { name: 'POST_seat_hold' },
  });
  seatHoldDuration.add(res.timings.duration);
  const isSuccess = res.status === 201;
  const isContention = res.status === 409;
  const isExpectedResponse = isSuccess || isContention;
  const passed = check(res, {
    'status is 201 or 409': () => isExpectedResponse,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  seatHoldFailRate.add(!isExpectedResponse);
  seatHoldContentionRate.add(isContention);
  if (isSuccess) {
    const body = JSON.parse(res.body);
    const checkInId = body.id;
    if (checkInId) {
      http.del(`${BASE_URL}/api/v1/check-ins/${checkInId}`, null, {
        headers,
        tags: { name: 'DELETE_cancel_hold' },
      });
    }
  }
  sleep(0.5);
}
