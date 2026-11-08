# Plan 6 follow-ups

## PR A (security and ops quick wins)
- Trust in forwarded headers now follows the compose topology (`RICETTINE_TRUSTED_PROXIES`): direct `:8080` trusts no proxy; the Caddy overlays trust RFC 1918. The application.yml default (RFC 1918) still applies to dev and a bare `java -jar` run that is published directly, so do not expose that to the internet without a proxy. Native Linux is not safe by itself: IPv6 clients (docker-proxy), rootless Docker and localhost traffic arrive from a gateway address.

## PR B (response headers)
- The CSP keeps `style-src 'unsafe-inline'` (Angular emits inline styles). Tightening it needs a nonce or autoCsp; deferred.
- Production build sets `optimization.styles.inlineCritical: false`, so the Beasties inline `<script>` and media-swap `<link>` are gone and index.html has no inline script. Re-check `grep "<script>" dist/frontend/browser/index.html` after Angular upgrades.
- Chromium reports violations as "Content Security Policy" (spaces), not the hyphenated header name; csp.spec.ts matches both spellings.
- The Caddyfiles only set HSTS (and the AWS one nothing on responses), so they do not conflict with the app's CSP. `scripts/https-smoke.sh` was not run (Caddyfiles untouched).
