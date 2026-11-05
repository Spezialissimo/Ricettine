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
BODY="$(mktemp)"
cleanup() {
  docker compose down -v >/dev/null 2>&1 || true
  rm -rf "$BACKUPS" "$JAR" "$BODY"
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
# avatar_info: "<status> <content-type> <sha256>" of the avatar download
avatar_info() {
  local out ct
  out="$(mktemp)"
  ct="$(curl -sS -o "$out" -w '%{http_code} %{content_type}' -b "$JAR" "$avatar")"
  echo "$ct $(shasum -a 256 <"$out" | cut -d' ' -f1)"
  rm -f "$out"
}
before="$(avatar_info)"
[[ "$before" == "200 image/"* ]] || fail "avatar before backup: $before"

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
[ "$(avatar_info)" = "$before" ] || fail "avatar differs after restore: $(avatar_info) vs $before"

echo "== failed restore must leave the data intact"
size="$(wc -c <"$dump")"
head -c $((size / 2)) "$dump" >"$BACKUPS/truncated.dump"
if deploy/restore.sh "$BACKUPS/truncated.dump" "$media" >"$BACKUPS/failed-restore.log" 2>&1; then fail "restore of a truncated dump succeeded"; fi
grep -q 'restore failed: database unchanged' "$BACKUPS/failed-restore.log" || fail "failed restore printed no recovery message: $(tail -3 "$BACKUPS/failed-restore.log")"
docker compose up -d --wait app
wait_healthy
[ "$(setup_required)" = false ] || fail "after failed restore: setupRequired is not false"
fresh_jar
code="$(json_post "$BASE/api/auth/login" '{"email":"admin@example.com","password":"correct-horse-battery"}')"
[ "$code" = 200 ] || fail "login after failed restore returned $code: $(cat "$BODY")"
[ "$(avatar_info)" = "$before" ] || fail "avatar differs after failed restore"

echo "BACKUP-RESTORE OK"
