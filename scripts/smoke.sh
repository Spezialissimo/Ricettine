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
# own project name: `down -v` below must never touch a developer's real stack (and its volumes)
export COMPOSE_PROJECT_NAME="${SMOKE_PROJECT:-ricettine-smoke}"

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "SMOKE FAIL: $*" >&2; docker compose logs --tail=50 app >&2 || true; exit 1; }

# compose.yaml alone must be image-only and pull the published image
plain="$(docker compose -f compose.yaml config)"
[[ "$plain" != *$'\n'*" build:"* ]] || fail "compose.yaml has a build: key"
[ "$(docker compose -f compose.yaml config --volumes | sort | tr '\n' ' ')" = 'app-data db-data ' ] || fail "compose.yaml volumes are not app-data, db-data"
images="$(docker compose -f compose.yaml config --images)"
[[ $'\n'"$images"$'\n' == *$'\nghcr.io/spezialissimo/ricettine:latest\n'* ]] \
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
[[ "$heap" == *"= 75"* ]] || fail "JVM MaxRAMPercentage is not 75: $heap"

# the JVM heap must leave headroom inside the container memory limit (mem_limit on app in compose.yaml)
limit_bytes="$(docker inspect --format '{{.HostConfig.Memory}}' "$(docker compose ps -q app)")"
[ "$limit_bytes" -gt 0 ] || fail "app has no memory limit (mem_limit)"
max_heap="$(docker compose exec -T app java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -w MaxHeapSize | awk '{print $4}')"
[[ "$max_heap" =~ ^[0-9]+$ ]] || fail "could not read the JVM MaxHeapSize: $max_heap"
[ $((max_heap * 100)) -le $((limit_bytes * 80)) ] || fail "JVM MaxHeapSize $max_heap exceeds 80% of the $limit_bytes byte memory limit"

# Direct :8080 has no trusted proxy: a rotating X-Forwarded-For must not dodge the per-IP login limit (30).
jar="$(mktemp)"
curl -fsS -c "$jar" -o /dev/null "$BASE/api/setup/status"
xsrf="$(awk '$6=="XSRF-TOKEN"{print $7}' "$jar")"
rm -f "$jar"
[ -n "$xsrf" ] || fail "no XSRF-TOKEN cookie"
last=""
for i in $(seq 1 31); do
  last="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $xsrf" -H "Cookie: XSRF-TOKEN=$xsrf" \
    -H "X-Forwarded-For: 192.0.2.$i" -H "Forwarded: for=198.51.100.$i" \
    -d '{"email":"nobody-'"$i"'@example.com","password":"wrong-password-1"}')"
done
[ "$last" = 429 ] || fail "31st login with rotating X-Forwarded-For returned $last, expected 429 (forwarded headers trusted on direct :8080)"

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
