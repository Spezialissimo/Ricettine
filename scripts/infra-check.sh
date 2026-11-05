#!/usr/bin/env bash
# Lints CI workflows (actionlint) and shell scripts (shellcheck). Each tool runs in Docker; stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."

ACTIONLINT_IMAGE="rhysd/actionlint:1.7.7"
SHELLCHECK_IMAGE="koalaman/shellcheck:v0.10.0"
CADDY_IMAGE="caddy:2.10-alpine" # same tag as compose.https.yaml / compose.aws.yaml

echo "actionlint..."
docker run --rm -v "$PWD":/repo -w /repo "$ACTIONLINT_IMAGE" -color .github/workflows/*.yml

echo "shellcheck..."
# find instead of globstar: macOS ships bash 3.2
files=()
while IFS= read -r f; do files+=("$f"); done < <(find scripts deploy -name '*.sh' -type f 2>/dev/null | sort)
docker run --rm -v "$PWD":/mnt -w /mnt "$SHELLCHECK_IMAGE" "${files[@]}"

echo "caddy validate..."
docker run --rm -v "$PWD/deploy":/deploy:ro -e RICETTINE_DOMAIN=example.com \
  "$CADDY_IMAGE" caddy validate --config /deploy/Caddyfile --adapter caddyfile
docker run --rm -v "$PWD/deploy":/deploy:ro -e ORIGIN_DOMAIN=origin.example.com -e ORIGIN_SECRET=dummy \
  "$CADDY_IMAGE" caddy validate --config /deploy/aws/Caddyfile --adapter caddyfile

echo "INFRA CHECK OK"
