#!/usr/bin/env bash
# Lints CI workflows (actionlint), shell scripts (shellcheck), Caddyfiles and the Terraform stack.
# Each tool runs in Docker; stops at the first failure. Terraform runs with mock providers only (no AWS access).
set -euo pipefail
cd "$(dirname "$0")/.."

ACTIONLINT_IMAGE="rhysd/actionlint:1.7.7"
SHELLCHECK_IMAGE="koalaman/shellcheck:v0.10.0"
TERRAFORM_IMAGE="hashicorp/terraform:1.13.5"
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

echo "mount-data test..."
bash deploy/aws/mount-data.test.sh

echo "terraform guards..."
TF=infra/terraform
if grep -rnE 'resource[[:space:]]+"aws_(db_instance|rds_|lb|alb|ecs_|nat_gateway|vpc_endpoint)' "$TF" --include='*.tf'; then
  echo "forbidden resource type (RDS, ELB/ALB, ECS, NAT gateway or VPC endpoint) found" >&2
  exit 1
fi
# tftest cannot read lifecycle: assert prevent_destroy on the data volume here
awk '/resource "aws_ebs_volume" "data"/{f=1} f&&/prevent_destroy[[:space:]]*=[[:space:]]*true/{ok=1} f&&/^}/{exit} END{exit !ok}' "$TF/compute.tf" \
  || { echo "aws_ebs_volume.data must set lifecycle { prevent_destroy = true }" >&2; exit 1; }
# CloudFront only accepts a us-east-1 certificate: the ACM certificate must use the aliased provider
awk '/resource "aws_acm_certificate" "main"/{f=1} f&&/provider[[:space:]]*=[[:space:]]*aws\.us_east_1/{ok=1} f&&/^}/{exit} END{exit !ok}' "$TF/edge.tf" \
  || { echo "aws_acm_certificate.main must set provider = aws.us_east_1" >&2; exit 1; }

echo "terraform fmt/validate/test..."
# `terraform init` only downloads providers; validate and test use mock providers, never real credentials.
tf() { docker run --rm -v "$PWD":/repo -w "/repo/$TF" -e TF_IN_AUTOMATION=1 "$TERRAFORM_IMAGE" "$@"; }
tf fmt -check -recursive -diff
tf init -backend=false -input=false >/dev/null
tf validate
tf test

echo "INFRA CHECK OK"
