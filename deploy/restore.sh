#!/usr/bin/env bash
# Usage: restore.sh <dump> [media.tar.gz]
# Restores a backup made by backup.sh into the running compose stack (the db service must be up).
# Run from the compose directory; honours COMPOSE_FILE. Replaces the current data.
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <dump> [media.tar.gz]" >&2
  exit 2
fi
DUMP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
MEDIA=""
[ $# -lt 2 ] || MEDIA="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
[ -s "$DUMP" ] || { echo "dump not found or empty: $1" >&2; exit 1; }
[ -z "$MEDIA" ] || [ -s "$MEDIA" ] || { echo "media archive not found or empty: $2" >&2; exit 1; }

on_error() {
  echo "restore failed: database unchanged, app left stopped; start it with: docker compose up -d app" >&2
}
trap on_error ERR

docker compose up -d --wait db
docker compose stop app
# one transaction: a bad dump rolls back instead of leaving a half-dropped database
docker compose exec -T db pg_restore -U ricettine -d ricettine --clean --if-exists --no-owner \
  --single-transaction --exit-on-error <"$DUMP"
trap - ERR
if [ -n "$MEDIA" ]; then
  # replace, not merge: photos deleted after the backup must not come back
  docker compose run --rm --no-deps -T --entrypoint sh app -c \
    'find /data/media -mindepth 1 -delete 2>/dev/null; tar -C /data -xzf -' <"$MEDIA" \
    || { echo "media restore failed: database was restored, media is incomplete; app left stopped" >&2; exit 1; }
fi
docker compose up -d app

deadline=$((SECONDS + ${RESTORE_TIMEOUT:-180}))
# the image defines a healthcheck
until [ "$(docker compose ps --format '{{.Health}}' app)" = healthy ]; do
  [ "$SECONDS" -lt "$deadline" ] || { echo "app not healthy after restore" >&2; exit 1; }
  sleep 3
done
echo "restore ok"
