import http from 'k6/http';
import { BASE_URL, FLIGHT_INDEX } from './config.js';
import { authHeaders } from './jwt.js';

const DEFAULT_PASSENGER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Fetches the list of flights and returns the flight at FLIGHT_INDEX.
 * Caches the result in a shared variable per VU iteration.
 */
export const fetchFlight = (passengerId = DEFAULT_PASSENGER_ID) => {
  const res = http.get(`${BASE_URL}/api/v1/flights?page=1&limit=10`, {
    headers: authHeaders(passengerId),
  });
  if (res.status !== 200) {
    console.error(`Failed to fetch flights: ${res.status} ${res.body}`);
    return null;
  }
  const body = JSON.parse(res.body);
  const flights = body.data || [];
  if (flights.length === 0) {
    console.error('No flights found in seed data');
    return null;
  }
  const index = Math.min(FLIGHT_INDEX, flights.length - 1);
  return flights[index];
};

/**
 * Fetches the seat map for a given flight and returns all AVAILABLE seats.
 */
export const fetchAvailableSeats = (flightId, passengerId = DEFAULT_PASSENGER_ID) => {
  const res = http.get(`${BASE_URL}/api/v1/flights/${flightId}/seats`, {
    headers: authHeaders(passengerId),
  });
  if (res.status !== 200) {
    console.error(`Failed to fetch seats: ${res.status} ${res.body}`);
    return [];
  }
  const body = JSON.parse(res.body);
  const seats = body.seats || [];
  return seats.filter((s) => s.status === 'AVAILABLE');
};

/**
 * Fetches the list of passengers from the flights API.
 * Since there's no passenger list endpoint, we use pre-seeded UUIDs.
 * Each VU generates a unique passenger UUID based on its VU ID.
 */
export const generatePassengerId = (vuId) => {
  const hex = vuId.toString(16).padStart(12, '0');
  return `00000000-0000-0000-0000-${hex}`;
};
