#!/usr/bin/env bash
# Proves the image builds for amd64 and arm64, then smoke-tests each architecture
# (the non-native one runs under QEMU, so it is slow). Nothing is pushed.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILDER="${MULTIARCH_BUILDER:-ricettine-multiarch}"
docker buildx inspect "$BUILDER" >/dev/null 2>&1 \
  || docker buildx create --name "$BUILDER" --driver docker-container >/dev/null

echo "Building linux/amd64 and linux/arm64 (no push, no load)..."
docker buildx build --builder "$BUILDER" --platform linux/amd64,linux/arm64 -f Dockerfile .

echo "Smoke: linux/arm64"
SMOKE_PLATFORM=linux/arm64 scripts/smoke.sh

echo "Smoke: linux/amd64"
SMOKE_PLATFORM=linux/amd64 SMOKE_TIMEOUT=900 scripts/smoke.sh

echo "MULTIARCH OK"
