#!/usr/bin/env bash
# Restore drill: builds the image, creates an admin and an avatar, backs up with deploy/backup.sh,
# wipes every volume, restores with deploy/restore.sh and checks the data is back.
# Needs port 8080 free. Always tears its stack down with -v.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${BACKUP_CHECK_PROJECT:-ricettine-backup-check}"
BASE="http://localhost:8080"
TIMEOUT="${SMOKE_TIMEOUT:-180}"
export COMPOSE_FILE=compose.yaml:compose.build.yaml
export COMPOSE_PROJECT_NAME="$PROJECT"
unset RICETTINE_STORAGE_TYPE BACKUP_S3_URI || true

BACKUPS="$(mktemp -d)"
JAR="$(mktemp)"
cleanup() {
  docker compose down -v >/dev/null 2>&1 || true
  rm -rf "$BACKUPS" "$JAR"
}
trap cleanup EXIT
fail() { echo "BACKUP-RESTORE FAIL: $*" >&2; docker compose logs --no-color --tail=40 app >&2 || true; exit 1; }

wait_healthy() {
  local deadline=$((SECONDS + TIMEOUT))
  until curl -fsS "$BASE/actuator/health" 2>/dev/null | grep -q '"status":"UP"'; do
    [ "$SECONDS" -lt "$deadline" ] || fail "app not healthy after ${TIMEOUT}s"
    sleep 3
  done
}
xsrf() { awk '$6 == "XSRF-TOKEN" { t = $7 } END { print t }' "$JAR"; }
fresh_jar() { : >"$JAR"; curl -fsS -o /dev/null -c "$JAR" "$BASE/api/setup/status"; [ -n "$(xsrf)" ] || fail "no XSRF-TOKEN cookie"; }
# json_post <url> <json>: prints the HTTP status, body goes to $BODY
BODY="$(mktemp)"
json_post() {
  curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST -H 'Content-Type: application/json' \
    -H "X-XSRF-TOKEN: $(xsrf)" -d "$2" "$1"
}
setup_required() { curl -fsS "$BASE/api/setup/status" | grep -o '"setupRequired":[a-z]*' | cut -d: -f2; }

docker compose down -v >/dev/null 2>&1 || true
docker compose up -d --build
wait_healthy
[ "$(setup_required)" = true ] || fail "fresh stack: setupRequired is not true"

echo "== create admin and avatar"
fresh_jar
code="$(json_post "$BASE/api/setup/admin" '{"email":"admin@example.com","password":"correct-horse-battery","username":"owner","displayName":"Admin"}')"
[ "$code" = 201 ] || fail "setup/admin returned $code: $(cat "$BODY")"
code="$(curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR" -c "$JAR" -X PUT -H "X-XSRF-TOKEN: $(xsrf)" \
  -F "file=@e2e/fixtures/portrait-orientation6.jpg;type=image/jpeg" "$BASE/api/me/avatar")"
[ "$code" = 200 ] || fail "avatar upload returned $code: $(cat "$BODY")"
avatar="$(grep -o '"avatarUrl":"[^"]*"' "$BODY" | cut -d'"' -f4)"
[ -n "$avatar" ] || fail "no avatarUrl in $(cat "$BODY")"
case "$avatar" in http*) ;; *) avatar="$BASE$avatar" ;; esac
[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" "$avatar")" = 200 ] || fail "avatar not served before backup"

echo "== backup"
BACKUP_DIR="$BACKUPS" deploy/backup.sh
dump="$(find "$BACKUPS" -name 'ricettine-*.dump' | head -n1)"
media="$(find "$BACKUPS" -name 'ricettine-*-media.tar.gz' | head -n1)"
[ -s "$dump" ] || fail "no dump written"
[ -s "$media" ] || fail "no media archive written"

echo "== wipe"
docker compose down -v
docker compose up -d
wait_healthy
[ "$(setup_required)" = true ] || fail "wiped stack: setupRequired is not true"

echo "== restore"
deploy/restore.sh "$dump" "$media"
[ "$(setup_required)" = false ] || fail "after restore: setupRequired is not false"
fresh_jar
code="$(json_post "$BASE/api/auth/login" '{"email":"admin@example.com","password":"correct-horse-battery"}')"
[ "$code" = 200 ] || fail "login after restore returned $code: $(cat "$BODY")"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" "$avatar")" = 200 ] || fail "avatar not served after restore"
rm -f "$BODY"

echo "BACKUP-RESTORE OK"
