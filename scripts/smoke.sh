#!/usr/bin/env bash
# Builds the single image, starts the compose stack and checks the basics.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${SMOKE_BASE_URL:-http://localhost:8080}"
TIMEOUT="${SMOKE_TIMEOUT:-180}"

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "SMOKE FAIL: $*" >&2; docker compose logs --tail=50 app >&2 || true; exit 1; }

docker compose up -d --build

echo "Waiting for health (max ${TIMEOUT}s)..."
deadline=$((SECONDS + TIMEOUT))
until curl -fsS "$BASE/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; do
  [ "$SECONDS" -lt "$deadline" ] || fail "app not healthy after ${TIMEOUT}s"
  sleep 3
done

curl -fsS "$BASE/" | grep -q '<app-root' || fail "/ does not contain <app-root"
status="$(curl -fsS "$BASE/api/setup/status")"
[ "$status" = '{"setupRequired":true}' ] || fail "unexpected /api/setup/status: $status"
curl -fsS "$BASE/r/anything" | grep -q '<app-root' || fail "/r/anything is not index HTML"

echo "SMOKE OK"
