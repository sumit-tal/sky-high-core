#!/usr/bin/env bash
#
# Run k6 load tests against the Docker Compose environment.
#
# Prerequisites:
#   - k6 installed (https://k6.io/docs/get-started/installation/)
#   - Docker Compose services running: docker compose up -d
#   - Database seeded: npm run seed
#
# Usage:
#   ./k6/run-load-tests.sh              # Run all tests
#   ./k6/run-load-tests.sh seat-map     # Run only seat map test
#   ./k6/run-load-tests.sh seat-hold    # Run only seat hold test
#   ./k6/run-load-tests.sh e2e          # Run only e2e check-in test
#   ./k6/run-load-tests.sh abuse        # Run only abuse detection test
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3010}"
JWT_SECRET="${JWT_SECRET:-test-jwt-secret}"

K6_ENV_FLAGS="-e BASE_URL=${BASE_URL} -e JWT_SECRET=${JWT_SECRET}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
  if ! command -v k6 &> /dev/null; then
    log_error "k6 is not installed. Install it from https://k6.io/docs/get-started/installation/"
    exit 1
  fi
  log_info "Checking if the application is reachable at ${BASE_URL}..."
  if ! curl -sf "${BASE_URL}/health" > /dev/null 2>&1; then
    log_error "Application is not reachable at ${BASE_URL}/health"
    log_error "Make sure Docker Compose is running: docker compose up -d"
    exit 1
  fi
  log_info "Application is healthy."
}

run_test() {
  local test_name="$1"
  local test_file="$2"
  log_info "Running ${test_name}..."
  echo "---"
  # shellcheck disable=SC2086
  k6 run ${K6_ENV_FLAGS} "${SCRIPT_DIR}/${test_file}"
  local exit_code=$?
  echo "---"
  if [ $exit_code -eq 0 ]; then
    log_info "${test_name}: PASSED"
  else
    log_error "${test_name}: FAILED (exit code ${exit_code})"
  fi
  return $exit_code
}

main() {
  check_prerequisites
  local target="${1:-all}"
  local failed=0
  case "${target}" in
    seat-map)
      run_test "Seat Map Retrieval Load Test" "seat-map-load-test.js" || failed=1
      ;;
    seat-hold)
      run_test "Seat Hold Acquisition Load Test" "seat-hold-load-test.js" || failed=1
      ;;
    e2e)
      run_test "End-to-End Check-In Load Test" "e2e-checkin-load-test.js" || failed=1
      ;;
    abuse)
      run_test "Abuse Detection Load Test" "abuse-detection-load-test.js" || failed=1
      ;;
    all)
      log_info "Running all load tests sequentially..."
      echo ""
      run_test "Seat Map Retrieval Load Test" "seat-map-load-test.js" || failed=1
      echo ""
      run_test "Seat Hold Acquisition Load Test" "seat-hold-load-test.js" || failed=1
      echo ""
      run_test "End-to-End Check-In Load Test" "e2e-checkin-load-test.js" || failed=1
      echo ""
      run_test "Abuse Detection Load Test" "abuse-detection-load-test.js" || failed=1
      ;;
    *)
      log_error "Unknown test target: ${target}"
      echo "Usage: $0 [seat-map|seat-hold|e2e|abuse|all]"
      exit 1
      ;;
  esac
  echo ""
  if [ $failed -eq 0 ]; then
    log_info "All load tests PASSED!"
  else
    log_error "Some load tests FAILED."
    exit 1
  fi
}

main "$@"
