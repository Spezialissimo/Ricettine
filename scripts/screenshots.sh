#!/usr/bin/env bash
# Regenerates the README/docs images in docs/images: builds the image, starts an isolated stack with the demo site
# enabled (the e2e overlay) and takes the shots with Playwright (e2e/screenshots.config.ts). Always tears the stack
# down with -v. Not run by CI. Images over 600 KB are compressed with pngquant (in Docker).
set -euo pipefail
cd "$(dirname "$0")/.."

export BASE_URL="${SHOTS_BASE_URL:-http://localhost:8080}"
TIMEOUT="${SHOTS_TIMEOUT:-180}"
MAX_BYTES=614400
export COMPOSE_FILE=compose.yaml:compose.build.yaml:e2e/compose.e2e.yaml
COMPOSE=(docker compose -p "${SHOTS_COMPOSE_PROJECT:-ricettine-shots}")
IMAGES=(feed-desktop recipe-desktop editor-desktop cookbook-desktop feed-mobile recipe-mobile editor-mobile recipe-desktop-en recipe-desktop-dark)

cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --build

echo "Waiting for health (max ${TIMEOUT}s)..."
deadline=$((SECONDS + TIMEOUT))
until curl -fsS "$BASE_URL/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "SCREENSHOTS FAIL: app not healthy after ${TIMEOUT}s" >&2
    "${COMPOSE[@]}" logs --tail=50 app >&2 || true
    exit 1
  fi
  sleep 3
done

mkdir -p docs/images
rm -f "${IMAGES[@]/#/docs/images/}"
(
  cd e2e
  npm ci
  npx playwright install chromium
  npx playwright test -c screenshots.config.ts
)

for name in "${IMAGES[@]}"; do
  f="docs/images/$name.png"
  [ -s "$f" ] || { echo "SCREENSHOTS FAIL: $f was not written" >&2; exit 1; }
  if [ "$(wc -c <"$f")" -gt "$MAX_BYTES" ]; then
    echo "Compressing $f"
    docker run --rm -v "$PWD/docs/images:/img" -w /img alpine:3.22 sh -c \
      "apk add --no-cache pngquant >/dev/null && pngquant --quality 65-95 --speed 1 --force --ext .png $name.png"
  fi
  [ -s "$f" ] || { echo "SCREENSHOTS FAIL: $f is empty after compression" >&2; exit 1; }
  if [ "$(wc -c <"$f")" -gt "$MAX_BYTES" ]; then
    echo "SCREENSHOTS FAIL: $f is still over 600 KB" >&2
    exit 1
  fi
done
echo "Screenshots OK: ${#IMAGES[@]} images in docs/images"
