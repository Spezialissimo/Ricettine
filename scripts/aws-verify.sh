#!/usr/bin/env bash
# Read-only checks of a deployed Ricettine on AWS. Usage: scripts/aws-verify.sh <domain>
# Needs curl and the AWS CLI with credentials (the owner's SSO profile). Optional:
#   VERIFY_TOKEN_PHOTO_URL  full URL of a private photo, to check CloudFront does not cache it
#   AWS_REGION              region of the buckets (default eu-west-1)
set -uo pipefail

domain="${1:?usage: aws-verify.sh <domain>}"
region="${AWS_REGION:-eu-west-1}"
failures=0

pass() { echo "ok   $1"; }
fail() { echo "FAIL $1" >&2; failures=$((failures + 1)); }
warn() { echo "warn $1"; }

headers() { curl -sS -m 20 -D - -o /dev/null "$@" | tr -d '\r' | tr '[:upper:]' '[:lower:]'; }

# 1. health through CloudFront, with the security headers
body="$(curl -sS -m 20 "https://$domain/actuator/health" || true)"
case "$body" in
  *'"status":"UP"'*) pass "health is UP" ;;
  *) fail "health is not UP: $body" ;;
esac
hdrs="$(headers "https://$domain/actuator/health" || true)"
for h in x-robots-tag strict-transport-security; do
  if grep -q "^$h:" <<<"$hdrs"; then pass "$h present"; else fail "$h missing"; fi
done

# 2. plain http redirects
code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "http://$domain/" || true)"
case "$code" in
  301 | 308) pass "http redirects ($code)" ;;
  *) fail "http answered $code, expected 301 or 308" ;;
esac

# 3. the origin is not reachable from here (security group: 443 only from CloudFront)
if curl -sS -m 10 -o /dev/null "https://origin.$domain/" 2>/dev/null; then
  fail "https://origin.$domain/ answered: the origin must only accept CloudFront"
else
  pass "origin does not answer directly"
fi

# 4. unknown media is a 404 (not a 403 or 5xx)
code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "https://$domain/media/nope/thumb.jpg" || true)"
if [ "$code" = "404" ]; then pass "unknown media is 404"; else fail "unknown media answered $code, expected 404"; fi

# 5. both buckets block all public access
account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ -z "$account" ]; then
  fail "no AWS credentials: cannot check buckets and backups"
else
  for bucket in "ricettine-media-$account" "ricettine-backups-$account"; do
    cfg="$(aws s3api get-public-access-block --bucket "$bucket" --region "$region" \
      --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
      --output text 2>/dev/null || true)"
    if [ "$(echo "$cfg" | tr -s '[:space:]' ' ' | sed 's/ $//')" = "True True True True" ]; then
      pass "$bucket blocks all public access"
    else
      fail "$bucket public access block is not all true ($cfg)"
    fi
  done

  # 6. a backup less than 26 h old
  newest="$(aws s3api list-objects-v2 --bucket "ricettine-backups-$account" --prefix db/ --region "$region" \
    --query 'sort_by(Contents,&LastModified)[-1].LastModified' --output text 2>/dev/null || true)"
  if [ -z "$newest" ] || [ "$newest" = "None" ]; then
    warn "no backup yet under db/ (expected on the first day; the timer runs at 03:00 UTC)"
  else
    # LastModified looks like 2026-11-07T03:00:12+00:00; drop the offset and fraction, read it as UTC
    stamp="${newest%%+*}"
    stamp="${stamp%%.*}"
    stamp="${stamp%Z}"
    if epoch="$(date -u -d "$stamp" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%S' "$stamp" +%s 2>/dev/null)"; then
      age=$(($(date -u +%s) - epoch))
      if [ "$age" -lt $((26 * 3600)) ]; then pass "newest backup is $((age / 3600)) h old"; else fail "newest backup is $((age / 3600)) h old (limit 26 h)"; fi
    else
      warn "could not parse backup timestamp: $newest"
    fi
  fi
fi

# 7. private photos are not cached at the edge
if [ -n "${VERIFY_TOKEN_PHOTO_URL:-}" ]; then
  headers "$VERIFY_TOKEN_PHOTO_URL" >/dev/null || true
  second="$(headers "$VERIFY_TOKEN_PHOTO_URL" | grep '^x-cache:' || true)"
  case "$second" in
    *'hit from cloudfront'*) fail "private photo was served from the CloudFront cache: $second" ;;
    *) pass "private photo is not cached ($second)" ;;
  esac
else
  warn "VERIFY_TOKEN_PHOTO_URL not set: skipped the private-photo cache check"
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "AWS VERIFY OK"
