import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL } from './helpers/config.js';
import { authHeaders } from './helpers/jwt.js';
import { fetchFlight, fetchAvailableSeats, generatePassengerId } from './helpers/api.js';

/**
 * End-to-End Check-In Load Test
 *
 * Target: 100 concurrent virtual users
 * Threshold: P95 total flow time < 5 seconds (excluding payment wait)
 * Duration: 2 minutes
 *
 * Full flow per iteration: hold seat → add baggage → confirm check-in.
 * Uses under-limit baggage (≤25kg) to avoid payment gating and measure
 * the core check-in path latency.
 */

const e2eFlowDuration = new Trend('e2e_flow_duration', true);
const e2eFlowFailRate = new Rate('e2e_flow_fail_rate');
const holdStepDuration = new Trend('hold_step_duration', true);
const confirmStepDuration = new Trend('confirm_step_duration', true);

export const options = {
  scenarios: {
    e2e_checkin_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '2m',
    },
  },
  thresholds: {
    e2e_flow_duration: ['p(95)<5000'],
    e2e_flow_fail_rate: ['rate<0.10'],
    hold_step_duration: ['p(95)<1000'],
    confirm_step_duration: ['p(95)<3000'],
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
  const passengerId = generatePassengerId(__VU + 2000);
  const headers = authHeaders(passengerId);
  const flowStart = Date.now();
  let flowFailed = false;
  // Step 1: Hold a random available seat
  const randomSeatIndex = Math.floor(Math.random() * data.seatIds.length);
  const seatId = data.seatIds[randomSeatIndex];
  const holdPayload = JSON.stringify({
    flightId: data.flightId,
    seatId: seatId,
  });
  const holdRes = http.post(`${BASE_URL}/api/v1/check-ins`, holdPayload, {
    headers,
    tags: { name: 'E2E_hold_seat' },
  });
  holdStepDuration.add(holdRes.timings.duration);
  const holdPassed = check(holdRes, {
    'hold: status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  });
  if (holdRes.status !== 201) {
    flowFailed = true;
    e2eFlowDuration.add(Date.now() - flowStart);
    e2eFlowFailRate.add(true);
    sleep(0.5);
    return;
  }
  const checkIn = JSON.parse(holdRes.body);
  const checkInId = checkIn.id;
  // Step 2: Confirm check-in with under-limit baggage (no payment needed)
  const baggageWeight = Math.floor(Math.random() * 20) + 1;
  const confirmPayload = JSON.stringify({
    baggageWeight: baggageWeight,
    action: 'CONFIRM',
  });
  const confirmRes = http.patch(
    `${BASE_URL}/api/v1/check-ins/${checkInId}`,
    confirmPayload,
    {
      headers,
      tags: { name: 'E2E_confirm_checkin' },
    },
  );
  confirmStepDuration.add(confirmRes.timings.duration);
  const confirmPassed = check(confirmRes, {
    'confirm: status is 200': (r) => r.status === 200,
    'confirm: status is COMPLETED': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body);
      return body.status === 'COMPLETED';
    },
  });
  if (!confirmPassed) {
    flowFailed = true;
  }
  const flowEnd = Date.now();
  e2eFlowDuration.add(flowEnd - flowStart);
  e2eFlowFailRate.add(flowFailed);
  // Cleanup: cancel the check-in to free the seat for other VUs
  http.del(`${BASE_URL}/api/v1/check-ins/${checkInId}`, null, {
    headers,
    tags: { name: 'E2E_cleanup_cancel' },
  });
  sleep(0.5);
}
