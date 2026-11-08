#!/usr/bin/env bash
# Backs up the database (pg_dump -Fc) and, with local storage, the media directory.
# Run from the compose directory; honours COMPOSE_FILE. Reads RICETTINE_STORAGE_TYPE, BACKUP_S3_URI
# and BACKUP_DIR from ./.env when they are not already set in the environment.
# Destination: BACKUP_S3_URI (s3://bucket/prefix/, needs the aws cli) or BACKUP_DIR (default ./backups).
# RICETTINE_STORAGE_TYPE=s3 skips the media archive (media already lives in S3).
# A failed run leaves no files behind: each artifact is written as .part and renamed once complete.
set -euo pipefail

# env_default NAME: take NAME from ./.env (not executed as shell) unless it is already set
env_default() {
  local name="$1" line value
  [ -z "${!name+x}" ] || return 0
  [ -f .env ] || return 0
  line="$(grep -E "^$name=" .env | tail -n1 || true)"
  [ -n "$line" ] || return 0
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf -v "$name" '%s' "$value"
  export "${name?}"
}
env_default RICETTINE_STORAGE_TYPE
env_default BACKUP_S3_URI
env_default BACKUP_DIR

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="ricettine-$STAMP.dump"
MEDIA="ricettine-$STAMP-media.tar.gz"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  OUT="$(mktemp -d)"
else
  mkdir -p "$BACKUP_DIR"
  OUT="$BACKUP_DIR"
fi

files=()
cleanup() {
  local status=$? f
  if [ "$status" -ne 0 ]; then
    rm -f "$OUT/$DUMP.part" "$OUT/$MEDIA.part"
    for f in ${files[@]+"${files[@]}"}; do rm -f "$OUT/$f"; done
    echo "backup failed" >&2
  fi
  if [ -n "${BACKUP_S3_URI:-}" ]; then rm -rf "$OUT"; fi
}
trap cleanup EXIT

# finish NAME: the .part file must be non-empty, then it takes its final name
finish() {
  [ -s "$OUT/$1.part" ] || { echo "$1 is empty" >&2; exit 1; }
  mv "$OUT/$1.part" "$OUT/$1"
  files+=("$1")
}

docker compose exec -T db pg_dump -U ricettine -d ricettine -Fc >"$OUT/$DUMP.part"
finish "$DUMP"

if [ "${RICETTINE_STORAGE_TYPE:-local}" = local ]; then
  docker compose exec -T app tar -C /data -czf - media >"$OUT/$MEDIA.part"
  finish "$MEDIA"
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  for f in "${files[@]}"; do
    aws s3 cp "$OUT/$f" "${BACKUP_S3_URI%/}/$f"
  done
fi
echo "backup ok: ${files[*]} -> ${BACKUP_S3_URI:-$BACKUP_DIR}"
