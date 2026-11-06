#!/usr/bin/env bash
# Starts (or updates) the stack: reads the secrets from SSM, writes /opt/ricettine/.env, then pulls and starts.
# Runs on the host as root through ricettine.service; needs the instance profile (AWS CLI) and Docker.
set -euo pipefail
cd /opt/ricettine

# Non-secret settings written by cloud-init: REGION, DOMAIN_NAME, ORIGIN_DOMAIN, MEDIA_BUCKET, IMAGE_TAG
# shellcheck disable=SC1091
. ./config.env

get_param() {
  local attempt=0
  while [ "$attempt" -lt 6 ]; do
    attempt=$((attempt + 1))
    aws ssm get-parameter --with-decryption --region "$REGION" --name "$1" \
      --query Parameter.Value --output text && return 0
    sleep 5
  done
  echo "start: could not read SSM parameter $1" >&2
  return 1
}

# Read on every boot: Postgres only applies the password when its volume is first created, so it must never change.
POSTGRES_PASSWORD="$(get_param /ricettine/postgres-password)"
ORIGIN_SECRET="$(get_param /ricettine/origin-secret)"

umask 077
tmp="$(mktemp .env.XXXXXX)"
cat >"$tmp" <<ENV
COMPOSE_FILE=compose.yaml:compose.aws.yaml
RICETTINE_VERSION=$IMAGE_TAG
RICETTINE_DOMAIN=$DOMAIN_NAME
ORIGIN_DOMAIN=$ORIGIN_DOMAIN
ORIGIN_SECRET=$ORIGIN_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
RICETTINE_STORAGE_TYPE=s3
RICETTINE_STORAGE_S3_BUCKET=$MEDIA_BUCKET
RICETTINE_STORAGE_S3_REGION=$REGION
RICETTINE_DATA_DIR=/srv/ricettine
ENV
mv "$tmp" .env

docker compose pull
docker compose up -d
