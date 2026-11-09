# Plan 6 follow-ups

## PR A (security and ops quick wins)
- Trust in forwarded headers now follows the compose topology (`RICETTINE_TRUSTED_PROXIES`): direct `:8080` trusts no proxy; the Caddy overlays trust RFC 1918. The application.yml default is now `(?!)` (trust nothing), so a bare `java -jar` or `docker run -p 8080:8080` believes no `X-Forwarded-*` header; compose.yaml, compose.https.yaml and compose.aws.yaml set the value explicitly, and the two ITs that need a loopback proxy set it themselves. Native Linux is not safe by itself: IPv6 clients (docker-proxy), rootless Docker and localhost traffic arrive from a gateway address.

## PR B (response headers)
- The CSP keeps `style-src 'unsafe-inline'` (Angular emits inline styles). Tightening it needs a nonce or autoCsp; deferred.
- Production build sets `optimization.styles.inlineCritical: false`, so the Beasties inline `<script>` and media-swap `<link>` are gone and index.html has no inline script. Re-check `grep "<script>" dist/frontend/browser/index.html` after Angular upgrades.
- Chromium reports violations as "Content Security Policy" (spaces), not the hyphenated header name; csp.spec.ts matches both spellings.
- The Caddyfiles only set HSTS (and the AWS one nothing on responses), so they do not conflict with the app's CSP. `scripts/https-smoke.sh` was not run (Caddyfiles untouched).

## PR C (frontend bugs)
- COR-1: `'1,000'` style text (1-3 digits, then comma groups of exactly 3, optional `.fraction`) is now invalid. A leading 0 (`0,500`) stays a decimal, and `1,50` / `1,5` stay decimals. A locale-aware choice (thousands separator accepted) is still open.
- DATA-3: `conflictText()` appends portions only when not the default 1, so a change back to 1 portion is not shown in the conflict copy block (`EditorStore._server` exists; the copy block just never compares portions against it). Group names are included as lines above their ingredients.
- DATA-3: when text is typed while Load latest is fetching, the store now stays in the conflict (the typed text remains in the editor and backup) instead of replacing; the person presses Load latest again. A smarter merge on top of the fetched copy was not attempted.
- SEC-2: the failed-logout error and Retry render inside the sticky top bar; the shell has no visual-polish pass yet (Plan 7).

## PR D (backend robustness)
- CONC-1: avatars still write their blobs inside the swap transaction (`AccountService.swapAvatar` -> `MediaService.register`). The finding names only recipe photos and covers; the same `storeThen` pattern would move avatars out of it. The old `register` is kept for avatars and tests.
- CONC-1: `addPhoto` now takes `FOR UPDATE` on the recipe instead of `FOR SHARE`, so the photo cap re-check serialises concurrent uploads (two share-locked uploads could both pass a count of 149). Uploads to one recipe now queue for the short transaction only.
- DUP-1: `LoginAttempt.failed()` stays public because `RateLimitsTest` calls it; making it private means changing that test.
- If the JVM dies between a blob write and the row insert, the blobs are orphaned with no row. `OrphanMediaCleanup` sweeps unreferenced `RECIPE` media rows older than 24 h, not blobs without rows; a sweep of `img/` keys with no `media` row is still open.
- CONC-1: if the connection drops during commit after the DB has committed, `storeThen` sees a failure and deletes the blobs of the committed row. A recipe photo row then becomes unreferenced and is swept within about 24 h. A cookbook cover keeps `cover_media_id` pointing at a row whose blobs were deleted, so it shows broken until replaced: the cleanup only sweeps `kind='RECIPE'`, and the old cover's after-commit delete never runs, so its blobs are orphaned.

## PR E (AWS and CI)
- TEST-7: only the `infra` job was added (infra-check.sh plus backup-restore-check.sh). The finding's `ops-drills` job with `https-smoke.sh` (Caddy overlays, ports 80/443) is not wired yet, and the CLAUDE.md CI line names only `infra`. The brief scoped PR E to the two scripts.
- OPS-2: the stale alarm is a CloudWatch alarm, not the optional `newer_noncurrent_versions` guard, so lifecycle can still expire the last dumps if the alarm is ignored. The alarm fires between the first apply and the first dump (missing data breaches); documented in the runbook.
- OPS-2: S3 request metrics on `db/` bill as custom CloudWatch metrics (about 0.30 USD per month); inside the 25 USD budget default but not zero.
- DATA-2: versioning also applies to avatars and photos replaced in place; storage grows by what is deleted within `backup_retention_days`. There is no tested restore procedure for photos beyond the documented `list-object-versions` steps (never run against real AWS).
- The Terraform has still never been applied; the `aws_s3_bucket_metric` resource and the alarm dimensions (`BucketName`, `FilterId`) are checked by mock tests only.

## PR G (frontend and e2e quality)

- TEST-9's premise is only half true on Playwright 1.64: `trace: 'retain-on-failure'` and `screenshot: 'only-on-failure'` already cover contexts made with `browser.newContext` (checked with a throwaway spec: a failing test with a manual context keeps `trace.zip` and a screenshot, and starting tracing again by hand throws "Tracing has been already started"). What was real is the leak: such contexts are never closed. PR G adds a `test` in `e2e/helpers/test.ts` whose auto fixture closes the contexts a test opened, pass or fail, and drops the manual end-of-test `close()` calls.
- CONS-6: the editor used to map an unknown field code to "This value is not valid"; it now uses the shared `fieldErrorKey`, which maps it to `errors.validation_failed`. Server field codes are all in `KNOWN_FIELD_ERROR_CODES`, so this only matters for a future code.

## Deferred review minors (final whole-branch review)

### PR A
- `ForwardedHeaderTrustIT` spoof test runs over MockMvc, so it never exercises the valve against an untrusted peer.
- `internal-proxies` omits IPv6 ULA and 100.64/10 (custom Docker address pools); the Caddy overlays also miss IPv6 ULA (fail-safe: clients share one bucket).
- The infra-check `down -v` guard misses `--volumes`, and its `COMPOSE_PROJECT_NAME` match is loose.
- The RFC 1918 regex is duplicated in compose.https.yaml and compose.aws.yaml (drift risk).

### PR B
- The `pageerror` listener in csp.spec cannot see CSP violations, and the registration pages are not covered (an `addInitScript` for `securitypolicyviolation` would).
- SecurityHeadersIT does not assert headers on a `/media` response.
- Import order in SecurityConfig is off; csp.spec does not guarantee the blob preview is exercised.
- HEAD `/media/**` now hits the main chain (it may set the XSRF cookie on HEAD); the non-GET IT does not prove session involvement.

### PR C
- Load latest / Use saved returns early with no visible feedback; the comment is wrong for the Use saved path.
- Invalid typed amounts are not in the conflict copy block (they stay in the backup); the logout button is not disabled while the request is in flight.
- The commit message says `network_error` for a 5xx logout failure, and the shell spec only tests status 0.

### PR D
- `CountingFile` is duplicated in AvatarBusyIT and RecipePhotoBusyIT.
- A deadlock between the account-delete cascade and `addPhoto` was possible before and still is (Postgres aborts one; the cleanup runs).
- The landed-but-failed IT covers the photo path only; `MediaService` line 140 has a long Javadoc line.

### PR E
- The infra job runs lint and the drill in one job, so a lint failure hides the drill result; `example.tfvars` alignment.

### PR F
- TEST-8(g) only half-disambiguates `created_by` from the `cookbook_id` cascade (it needs an invite created by a co-author).
- AccountServiceIT has an empty `@BeforeEach clean()`; PublicRecipeIT keeps an inline `restoreCsrfRepository()`; RecipeApiIT concurrent payload 5/6 should be 2/3.

### PR G
- The walkthrough navigation assertion passes vacuously when the list is empty.
- Core auth.store, guards and i18n still inject `HttpClient` (no AuthApi in the brief); the invite DTOs sit in `shared/invite-list.ts`.
- The param-reuse-strategy spec does not discriminate the custom strategy; commit b1281c0's message is stale.

### PR H
- The DEBUG-after-first-WARN branch is untested.
- `Tokens.matches("", "")` is true (callers guard non-empty); long line in RecipeMediaAccessPolicy:50.
