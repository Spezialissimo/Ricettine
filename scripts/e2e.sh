#!/usr/bin/env bash
# Builds the single image, starts an isolated compose stack and runs the Playwright browser tests
# (mobile + desktop + restart projects) against it. Always tears the stack down with -v.
set -euo pipefail
cd "$(dirname "$0")/.."

export BASE_URL="${E2E_BASE_URL:-http://localhost:8080}"
export E2E_COMPOSE_PROJECT="${E2E_COMPOSE_PROJECT:-ricettine-e2e}"
TIMEOUT="${E2E_TIMEOUT:-180}"

cleanup() { docker compose -p "$E2E_COMPOSE_PROJECT" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

# start from nothing: a crashed earlier run must not leave a used database behind
docker compose -p "$E2E_COMPOSE_PROJECT" down -v >/dev/null 2>&1 || true
docker compose -p "$E2E_COMPOSE_PROJECT" up -d --build

echo "Waiting for health (max ${TIMEOUT}s)..."
deadline=$((SECONDS + TIMEOUT))
until curl -fsS "$BASE_URL/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "E2E FAIL: app not healthy after ${TIMEOUT}s" >&2
    docker compose -p "$E2E_COMPOSE_PROJECT" logs --tail=50 app >&2 || true
    exit 1
  fi
  sleep 3
done

cd e2e
npm ci
npx playwright install chromium
npx playwright test "$@"
