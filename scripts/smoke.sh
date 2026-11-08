#!/usr/bin/env bash
# Builds the single image, starts the compose stack and checks the basics.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${SMOKE_BASE_URL:-http://localhost:8080}"
TIMEOUT="${SMOKE_TIMEOUT:-180}"

# SMOKE_PLATFORM=linux/arm64|linux/amd64 runs (and builds) the stack for that architecture.
PLATFORM="${SMOKE_PLATFORM:-}"
[ -z "$PLATFORM" ] || export DOCKER_DEFAULT_PLATFORM="$PLATFORM"
# the local build overlay; the published compose.yaml alone is checked below
export COMPOSE_FILE=compose.yaml:compose.build.yaml

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "SMOKE FAIL: $*" >&2; docker compose logs --tail=50 app >&2 || true; exit 1; }

# compose.yaml alone must be image-only and pull the published image
plain="$(docker compose -f compose.yaml config)"
echo "$plain" | grep -q '^ *build:' && fail "compose.yaml has a build: key"
[ "$(docker compose -f compose.yaml config --volumes | sort | tr '\n' ' ')" = 'app-data db-data ' ] || fail "compose.yaml volumes are not app-data, db-data"
docker compose -f compose.yaml config --images | grep -qx 'ghcr.io/spezialissimo/ricettine:latest' \
  || fail "compose.yaml does not use ghcr.io/spezialissimo/ricettine:latest"

# a cached postgres image may lack the requested platform; fetch it explicitly
[ -z "$PLATFORM" ] || docker compose pull --quiet db
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

heap="$(docker compose exec -T app java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -w MaxRAMPercentage || true)"
echo "$heap" | grep -q '= 75' || fail "JVM MaxRAMPercentage is not 75: $heap"

if [ -n "$PLATFORM" ]; then
  case "$PLATFORM" in
    linux/arm64) want=aarch64 ;;
    linux/amd64) want=x86_64 ;;
    *) fail "unsupported SMOKE_PLATFORM: $PLATFORM" ;;
  esac
  arch="$(docker compose exec -T app uname -m | tr -d '\r')"
  [ "$arch" = "$want" ] || fail "running architecture is $arch, expected $want"
fi

echo "SMOKE OK${PLATFORM:+ ($PLATFORM)}"
