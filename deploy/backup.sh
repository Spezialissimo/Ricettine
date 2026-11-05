#!/usr/bin/env bash
# Backs up the database (pg_dump -Fc) and, with local storage, the media directory.
# Run from the compose directory; honours COMPOSE_FILE. Reads ./.env if present.
# Destination: BACKUP_S3_URI (s3://bucket/prefix/, needs the aws cli) or BACKUP_DIR (default ./backups).
# RICETTINE_STORAGE_TYPE=s3 skips the media archive (media already lives in S3).
set -euo pipefail

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="ricettine-$STAMP.dump"
MEDIA="ricettine-$STAMP-media.tar.gz"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  OUT="$(mktemp -d)"
  trap 'rm -rf "$OUT"' EXIT
else
  mkdir -p "$BACKUP_DIR"
  OUT="$BACKUP_DIR"
fi

docker compose exec -T db pg_dump -U ricettine -d ricettine -Fc >"$OUT/$DUMP"
[ -s "$OUT/$DUMP" ] || { echo "backup failed: $DUMP is empty" >&2; exit 1; }
files=("$DUMP")

if [ "${RICETTINE_STORAGE_TYPE:-local}" = local ]; then
  docker compose exec -T app tar -C /data -czf - media >"$OUT/$MEDIA"
  [ -s "$OUT/$MEDIA" ] || { echo "backup failed: $MEDIA is empty" >&2; exit 1; }
  files+=("$MEDIA")
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  for f in "${files[@]}"; do
    aws s3 cp "$OUT/$f" "${BACKUP_S3_URI%/}/$f"
  done
fi
echo "backup ok: ${files[*]} -> ${BACKUP_S3_URI:-$BACKUP_DIR}"
