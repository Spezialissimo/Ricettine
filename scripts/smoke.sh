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

# Memory gate: the app container must not have been restarted or OOM-killed during the run (an OOM kill is
# otherwise only visible as unrelated connection failures). Also logs its memory use and cgroup peak.
# The peak only covers the time since the last container start.
check_memory() {
  local cid state events peak
  cid="$(docker compose ps -q app)"
  [ -n "$cid" ] || { echo "SMOKE FAIL: no app container to check" >&2; return 1; }
  docker stats --no-stream --format 'app memory: {{.MemUsage}} ({{.MemPerc}})' "$cid" || true
  peak="$(docker exec "$cid" cat /sys/fs/cgroup/memory.peak 2>/dev/null || true)"
  if [[ "$peak" =~ ^[0-9]+$ ]]; then echo "app memory.peak: $((peak / 1048576)) MiB"; fi
  # Code cache and metaspace use, to size the JVM caps. The JRE image has no jcmd, so a throwaway JDK container
  # attaches to the JVM by its host PID (same uid and gid as the app, or the attach files are unreachable). Best-effort: never fails the gate.
  local jdk_image="eclipse-temurin:25-jdk" hostpid ids
  hostpid="$(docker inspect -f '{{.State.Pid}}' "$cid" 2>/dev/null || true)"
  ids="$(docker exec "$cid" bash -c 'echo "$(id -u):$(id -g)"' 2>/dev/null || true)"
  if [[ "$hostpid" =~ ^[0-9]+$ ]] && [ "$hostpid" -gt 0 ] && [[ "$ids" =~ ^[0-9]+:[0-9]+$ ]]; then
    docker run --rm --pid host --user "$ids" "$jdk_image" jcmd "$hostpid" Compiler.codecache 2>&1 \
      | grep -E '^CodeCache|^CodeHeap|rror|xception' | sed 's/^/app jcmd codecache: /' || true
    docker run --rm --pid host --user "$ids" "$jdk_image" jcmd "$hostpid" VM.metaspace scale=m 2>&1 \
      | grep -E 'Total Usage|Committed|Reserved|Non-Class|Class:|rror|xception' | sed 's/^/app jcmd metaspace: /' || true
  fi
  state="$(docker inspect -f '{{.RestartCount}} {{.State.OOMKilled}}' "$cid")"
  # OOM events since the start. Both bounds come from the daemon's clock (the Docker VM's clock can lag the host's,
  # e.g. after the Mac slept, and `docker events --until <future>` would then wait for it). The call is also bounded
  # by a deadline (macOS has no `timeout`); not finishing in time fails the gate instead of blocking it.
  local until_t events_out events_pid waited=0
  until_t="$(docker system info --format '{{.SystemTime}}' 2>/dev/null || true)"
  if [ -z "$STARTED_AT" ] || [ -z "$until_t" ]; then
    echo "SMOKE FAIL: could not read the Docker daemon clock for the OOM event check" >&2
    return 1
  fi
  events_out="$(mktemp)"
  docker events --since "$STARTED_AT" --until "$until_t" --filter "container=$cid" --filter event=oom >"$events_out" 2>/dev/null &
  events_pid=$!
  while kill -0 "$events_pid" 2>/dev/null && [ "$waited" -lt 15 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$events_pid" 2>/dev/null; then
    kill "$events_pid" 2>/dev/null || true
    wait "$events_pid" 2>/dev/null || true
    rm -f "$events_out"
    echo "SMOKE FAIL: docker events did not finish within 15 s" >&2
    return 1
  fi
  wait "$events_pid" 2>/dev/null || true
  events="$(wc -l <"$events_out" | tr -d ' ')"
  rm -f "$events_out"
  if [ "$state" != "0 false" ] || [ "$events" != 0 ]; then
    echo "SMOKE FAIL: app container restarts/OOMKilled is '$state', OOM events since start: $events" >&2
    return 1
  fi
}

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT
# the Docker daemon's clock, not the host's: the two can differ (the VM's lags after the host slept)
STARTED_AT="$(docker system info --format '{{.SystemTime}}' 2>/dev/null || true)"

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
[ "$status" = '{"setupRequired":true,"demo":false,"demoUrl":null}' ] || fail "unexpected /api/setup/status: $status"
curl -fsS "$BASE/r/anything" | grep -q '<app-root' || fail "/r/anything is not index HTML"

heap="$(docker compose exec -T app java -XX:+PrintFlagsFinal -version 2>/dev/null | grep -w MaxRAMPercentage || true)"
[[ "$heap" == *"= 60"* ]] || fail "JVM MaxRAMPercentage is not 60: $heap"

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

check_memory || exit 1

echo "SMOKE OK${PLATFORM:+ ($PLATFORM)}"
