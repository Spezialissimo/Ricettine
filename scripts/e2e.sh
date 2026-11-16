#!/usr/bin/env bash
# Builds the single image, starts an isolated compose stack and runs the Playwright browser tests
# (mobile + desktop + restart projects) against it. Always tears the stack down with -v.
set -euo pipefail
cd "$(dirname "$0")/.."

export BASE_URL="${E2E_BASE_URL:-http://localhost:8080}"
export E2E_COMPOSE_PROJECT="${E2E_COMPOSE_PROJECT:-ricettine-e2e}"
TIMEOUT="${E2E_TIMEOUT:-180}"
# Exported so every nested compose call (including the restart spec) sees the same files.
# compose.e2e.yaml lifts the per-IP rate limits (all browsers share one gateway IP).
export COMPOSE_FILE=compose.yaml:compose.build.yaml:e2e/compose.e2e.yaml
COMPOSE=(docker compose -p "$E2E_COMPOSE_PROJECT")
# the Docker daemon's clock, not the host's: the two can differ (the VM's lags after the host slept)
STARTED_AT="$(docker system info --format '{{.SystemTime}}' 2>/dev/null || true)"

# Memory gate: the app container must not have been restarted or OOM-killed during the run (an OOM kill is
# otherwise only visible as unrelated connection failures). Also logs its memory use and cgroup peak.
# The peak only covers the time since the last container start.
check_memory() {
  local cid state events peak
  cid="$("${COMPOSE[@]}" ps -q app)"
  [ -n "$cid" ] || { echo "E2E FAIL: no app container to check" >&2; return 1; }
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
    echo "E2E FAIL: could not read the Docker daemon clock for the OOM event check" >&2
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
    echo "E2E FAIL: docker events did not finish within 15 s" >&2
    return 1
  fi
  wait "$events_pid" 2>/dev/null || true
  events="$(wc -l <"$events_out" | tr -d ' ')"
  rm -f "$events_out"
  if [ "$state" != "0 false" ] || [ "$events" != 0 ]; then
    echo "E2E FAIL: app container restarts/OOMKilled is '$state', OOM events since start: $events" >&2
    return 1
  fi
}

cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

# start from nothing: a crashed earlier run must not leave a used database behind
"${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --build

echo "Waiting for health (max ${TIMEOUT}s)..."
deadline=$((SECONDS + TIMEOUT))
until curl -fsS "$BASE_URL/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "E2E FAIL: app not healthy after ${TIMEOUT}s" >&2
    "${COMPOSE[@]}" logs --tail=50 app >&2 || true
    exit 1
  fi
  sleep 3
done

cd e2e
npm ci
npx playwright install chromium
if ! npx playwright test "$@"; then
  mkdir -p test-results
  "${COMPOSE[@]}" logs --no-color > test-results/compose.log 2>&1 || true
  check_memory || true
  echo "E2E FAIL: compose logs saved to e2e/test-results/compose.log" >&2
  exit 1
fi
check_memory
