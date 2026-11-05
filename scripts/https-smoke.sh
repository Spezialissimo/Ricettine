#!/usr/bin/env bash
# Builds the image and checks the optional Caddy overlays in two rounds:
#   1. self-host HTTPS (compose.https.yaml)   2. AWS origin behind CloudFront (compose.aws.yaml)
# Caddy uses its internal CA for localhost, hence curl -k. Needs ports 80 and 443 free.
# Always tears its stacks down with -v.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${HTTPS_SMOKE_PROJECT:-ricettine-https-smoke}"
TIMEOUT="${SMOKE_TIMEOUT:-180}"
ORIGIN_SECRET_VALUE="smoke-origin-secret"
DATA_DIR=""
RESET_BODY='{"newPassword":"correct-horse-battery"}'

export RICETTINE_DOMAIN=localhost
dc() { docker compose -p "$PROJECT" "$@"; }

cleanup() {
  dc down -v >/dev/null 2>&1 || true
  # postgres owns files inside the bind mount; remove through a container
  if [ -n "$DATA_DIR" ] && [ -d "$DATA_DIR" ]; then
    docker run --rm -v "$DATA_DIR":/d alpine sh -c 'rm -rf /d/* /d/.[!.]*' >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR" || true
  fi
}
trap cleanup EXIT

fail() {
  echo "HTTPS SMOKE FAIL: $*" >&2
  dc logs --no-color --tail=40 app caddy >&2 || true
  exit 1
}

wait_for() { # url, description, extra curl args...
  local url="$1" what="$2"; shift 2
  local deadline=$((SECONDS + TIMEOUT)) body
  until body="$(curl -ksS "$@" "$url" 2>/dev/null)" && [[ "$body" == *'"status":"UP"'* ]]; do
    [ "$SECONDS" -lt "$deadline" ] || fail "$what not healthy after ${TIMEOUT}s"
    sleep 3
  done
}

JAR="$(mktemp)"
trap 'rm -f "$JAR"; cleanup' EXIT

xsrf() { awk '$6 == "XSRF-TOKEN" { t = $7 } END { print t }' "$JAR"; }

# post_status <url> <json> [extra curl args...]: POST JSON with the CSRF header, prints the HTTP status
post_status() {
  local url="$1" json="$2"; shift 2
  curl -ks -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST \
    -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(xsrf)" "$@" -d "$json" "$url"
}

# first_429 <count> <url> <generator function printing curl args, one per line>: index of the first 429, or 0
first_429() {
  local count="$1" url="$2" gen="$3" i code arg args
  for i in $(seq 1 "$count"); do
    args=()
    # the generator prints one curl argument per line (header values contain spaces; bash 3.2 has no mapfile)
    while IFS= read -r arg; do args+=("$arg"); done < <("$gen" "$i")
    code="$(post_status "$url/api/password-resets/$(openssl rand -hex 16)" "$RESET_BODY" "${args[@]}")"
    if [ "$code" = 429 ]; then echo "$i"; return; fi
    [ "$code" != 403 ] || fail "request $i was rejected with 403"
  done
  echo 0
}

# ---------------------------------------------------------------- round 1: self-host HTTPS
echo "== round 1: self-host HTTPS"
export COMPOSE_FILE=compose.yaml:compose.build.yaml:compose.https.yaml
dc down -v >/dev/null 2>&1 || true
dc up -d --build
wait_for https://localhost/actuator/health "https://localhost"

redirect="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost/)"
[ "$redirect" = "308 https://localhost/" ] || fail "http://localhost/ -> '$redirect', expected 308 https://localhost/"

headers="$(curl -ksSD - -o /dev/null https://localhost/actuator/health)"
headers="$(printf '%s' "$headers" | tr '[:upper:]' '[:lower:]')"
[[ "$headers" == *"strict-transport-security: max-age=31536000"* ]] || fail "no HSTS header"
[[ "$headers" == *"x-robots-tag:"* ]] || fail "no X-Robots-Tag header"

if curl -s --max-time 3 -o /dev/null http://localhost:8080/; then fail "app is still published on :8080"; fi

# CSRF cookie, then create the admin through Caddy
curl -ks -o /dev/null -c "$JAR" https://localhost/api/setup/status
[ -n "$(xsrf)" ] || fail "no XSRF-TOKEN cookie"
setup_headers="$(mktemp)"
setup_body="$(mktemp)"
code="$(curl -ks -o "$setup_body" -D "$setup_headers" -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST \
  -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(xsrf)" \
  -d '{"email":"admin@example.com","password":"correct-horse-battery","username":"owner","displayName":"Admin"}' \
  https://localhost/api/setup/admin)"
[ "$code" = 201 ] || fail "setup/admin returned $code: $(cat "$setup_body")"
rm -f "$setup_body"
session_cookie="$(grep -i '^set-cookie: SESSION=' "$setup_headers" || true)"
rm -f "$setup_headers"
[[ "$session_cookie" == *[Ss]ecure* ]] || fail "SESSION cookie is not Secure: $session_cookie"

invite="$(curl -ks -b "$JAR" -c "$JAR" -X POST -H 'Content-Type: application/json' -H "X-XSRF-TOKEN: $(xsrf)" \
  https://localhost/api/admin/invites)"
[[ "$invite" == *'"url":"https://localhost/'* ]] || fail "invite url does not start with https://localhost/: $invite"

# the setup POST used 1 of the 30 anonymous-auth slots, so the 30th reset is the 31st request
spoof() { printf '%s\n' -H "X-Forwarded-For: 198.51.100.$1"; }
first="$(first_429 31 https://localhost spoof)"
[ "$first" = 30 ] || fail "spoofed X-Forwarded-For: first 429 at reset #$first, expected #30 (31st anonymous request)"

token="$(openssl rand -hex 24)"
post_status "https://localhost/api/password-resets/$token" "$RESET_BODY" >/dev/null
logs="$(dc logs --no-color caddy 2>&1)"
[[ "$logs" != *"$token"* ]] || fail "caddy logs contain a request token"
echo "round 1 ok"

# ---------------------------------------------------------------- round 2: AWS origin
echo "== round 2: AWS origin behind CloudFront"
dc down -v >/dev/null 2>&1 || true
DATA_DIR="$(mktemp -d "$PWD/.https-smoke-data.XXXXXX")"
mkdir "$DATA_DIR/db" "$DATA_DIR/caddy"
export RICETTINE_DATA_DIR="$DATA_DIR"
export ORIGIN_DOMAIN=localhost ORIGIN_SECRET="$ORIGIN_SECRET_VALUE" RICETTINE_STORAGE_TYPE=local
export COMPOSE_FILE=compose.yaml:compose.build.yaml:compose.aws.yaml
dc up -d --build
SECRET_H="X-Origin-Verify: $ORIGIN_SECRET_VALUE"
VIEWER_H="CloudFront-Viewer-Address: 203.0.113.7:4444"
wait_for https://localhost/actuator/health "origin" -H "$SECRET_H" -H "$VIEWER_H"

status_of() { curl -ks -o /dev/null -w '%{http_code}' "$@" https://localhost/actuator/health; }
[ "$(status_of)" = 403 ] || fail "no secret should be 403"
[ "$(status_of -H "$VIEWER_H")" = 403 ] || fail "viewer address without secret should be 403"
[ "$(status_of -H 'X-Origin-Verify: wrong' -H "$VIEWER_H")" = 403 ] || fail "wrong secret should be 403"
[ "$(status_of -H "$SECRET_H")" = 403 ] || fail "secret without CloudFront-Viewer-Address should be 403"
[ "$(status_of -H "$SECRET_H" -H "$VIEWER_H")" = 200 ] || fail "secret and viewer address should be 200"

: >"$JAR"
curl -ks -o /dev/null -c "$JAR" -H "$SECRET_H" -H "$VIEWER_H" https://localhost/api/setup/status
[ -n "$(xsrf)" ] || fail "no XSRF-TOKEN cookie via origin"

fixed() { printf '%s\n' -H "$SECRET_H" -H "$VIEWER_H" -H "X-Forwarded-For: 198.51.100.$1"; }
first="$(first_429 31 https://localhost fixed)"
[ "$first" = 31 ] || fail "fixed viewer address: first 429 at #$first, expected #31"

rotating() { printf '%s\n' -H "$SECRET_H" -H "CloudFront-Viewer-Address: 192.0.2.$1:1"; }
first="$(first_429 31 https://localhost rotating)"
[ "$first" = 0 ] || fail "rotating viewer addresses were limited at #$first"

# IPv6: the :port is stripped, so different ports share one key
v6() { printf '%s\n' -H "$SECRET_H" -H "CloudFront-Viewer-Address: 2001:db8::5:$((443 + $1))"; }
first="$(first_429 31 https://localhost v6)"
[ "$first" = 31 ] || fail "IPv6 viewer address: first 429 at #$first, expected #31 (port not stripped?)"

# Caddy must not log tokens
token="$(openssl rand -hex 24)"
post_status "https://localhost/api/password-resets/$token" "$RESET_BODY" -H "$SECRET_H" -H "CloudFront-Viewer-Address: 203.0.113.99:1" >/dev/null
logs="$(dc logs --no-color caddy 2>&1)"
[[ "$logs" != *"$token"* ]] || fail "caddy logs contain a request token"
echo "round 2 ok"

echo "HTTPS SMOKE OK"
