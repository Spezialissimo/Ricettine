# Plan 6 follow-ups

## PR A (security and ops quick wins)
- Trust in forwarded headers now follows the compose topology (`RICETTINE_TRUSTED_PROXIES`): direct `:8080` trusts no proxy; the Caddy overlays trust RFC 1918. The application.yml default (RFC 1918) still applies to dev and a bare `java -jar` run that is published directly, so do not expose that to the internet without a proxy. Native Linux is not safe by itself: IPv6 clients (docker-proxy), rootless Docker and localhost traffic arrive from a gateway address.

## PR B (response headers)
- The CSP keeps `style-src 'unsafe-inline'` (Angular emits inline styles). Tightening it needs a nonce or autoCsp; deferred.
- Production build sets `optimization.styles.inlineCritical: false`, so the Beasties inline `<script>` and media-swap `<link>` are gone and index.html has no inline script. Re-check `grep "<script>" dist/frontend/browser/index.html` after Angular upgrades.
- Chromium reports violations as "Content Security Policy" (spaces), not the hyphenated header name; csp.spec.ts matches both spellings.
- The Caddyfiles only set HSTS (and the AWS one nothing on responses), so they do not conflict with the app's CSP. `scripts/https-smoke.sh` was not run (Caddyfiles untouched).

## PR C (frontend bugs)
- COR-1: `'1,000'` style text (1-3 digits, then comma groups of exactly 3, optional `.fraction`) is now invalid. A leading 0 (`0,500`) stays a decimal, and `1,50` / `1,5` stay decimals. A locale-aware choice (thousands separator accepted) is still open.
- DATA-3: `conflictText()` appends portions only when not the default 1 (the store has no server copy to compare against), so a change back to 1 portion is not in the copy block. Group names are included as lines above their ingredients.
- DATA-3: when text is typed while Load latest is fetching, the store now stays in the conflict (the typed text remains in the editor and backup) instead of replacing; the person presses Load latest again. A smarter merge on top of the fetched copy was not attempted.
- SEC-2: the failed-logout error and Retry render inside the sticky top bar; the shell has no visual-polish pass yet (Plan 7).
