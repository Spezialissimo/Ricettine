# Plan 6 code audit report

- **Audited commit:** `e4bcea95d1d0b23341909f60e884960989da22cf` (branch `feat/p5-aws`, Plan 5 treated as merged)
- **Date:** 2026-11-07
- **Scope:** the whole repository: backend, frontend, unit tests, e2e, scripts, compose, Caddy, CI, Terraform
- **Design:** `docs/superpowers/specs/2026-11-07-plan-6-code-audit-design.md` · **Plan:** `docs/superpowers/plans/2026-11-07-plan-6-code-audit.md`
- **Method:**
  - Tool passes: jscpd (122 clones), knip, depcheck, `mvn dependency:analyze`, `javac -Xlint:all` and an i18n key scan.
  - Six area reviews. Opus reviewed backend security and ops; Sonnet reviewed the other four.
  - The lead merged the results, checked every `file:line`, and re-read the code behind each High finding.
  - Suites run during the audit: backend `mvn verify` (320 tests), `ng test` (421 tests), `infra-check.sh` (29 Terraform tests). All green.

## How to decide

**Decided 2026-11-08 by the owner:** fix all High and Medium findings, plus 21 cheap, reader-visible Low findings (dead code, docs, imports and names, small duplications, log noise, tests that cannot fail, the Prettier pass). The other Low findings are **later**.

- [ ] Fix all Low findings (not chosen)

## Summary

| Area | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| backend-security | 0 | 1 | 4 | 14 | 19 |
| backend-domain | 0 | 0 | 1 | 13 | 14 |
| backend-tests | 0 | 0 | 7 | 9 | 16 |
| frontend-app | 0 | 0 | 5 | 17 | 22 |
| frontend-tests-e2e | 0 | 0 | 5 | 5 | 10 |
| ops | 0 | 1 | 6 | 14 | 21 |
| **Total** | **0** | **2** | **28** | **72** | **102** |

### Top 10

- **DATA-1** (High, S): smoke.sh tears down the default compose project with -v, wiping a self-hosted stack run from the checkout
- **SEC-1** (High, M): Per-IP rate limits can be bypassed with a spoofed Forwarded or X-Forwarded-For header
- **COR-1** (Medium, S): Amount '1,000' silently saves as 1
- **DATA-2** (Medium, S): Photos on AWS have no backup or versioning, and a restored dump can point at deleted objects
- **DUP-1** (Medium, S): Login re-implements LoginAttempt.run's reserve/fail/refund logic
- **ERR-1** (Medium, S): Avatar upload reads the whole file onto the heap before waiting for a processing slot
- **OPS-1** (Medium, S): JVM heap sized to 75% of host RAM: no compose service sets a memory limit
- **SEC-2** (Medium, S): Logout signs the user out locally even when the server call failed
- **SEC-3** (Medium, S): GitHub Actions pinned to mutable major tags, including the job that holds packages:write
- **SEC-4** (Medium, S): .gitignore does not cover .env or backups/, though the README tells users to create both in the repo root

### Reading this report

- **No Critical findings.** Authentication and tokens are sound: tokens are 256-bit, stored hashed, claimed once and expiring. The session rotates on login. Unknown emails are timing-safe. The actuator exposes only health, `X-Robots-Tag` is on every response, and the frontend has no XSS sinks or subscription leaks. The error codes and validation limits match between backend and frontend.
- **The two High findings are cheap to fix:**
  - **SEC-1:** the per-IP rate limits trust client headers. It was reproduced with a throwaway test: 40 failed logins with a rotating header, and no 429.
  - **DATA-1:** `smoke.sh` can wipe a self-hosted stack started from the same folder.
- **The Medium findings worth the most:**
  - **Data loss in the editor:** after a conflict, the copy block and "Load latest" drop most of the user's edits.
  - **Edge and CloudFront:** cacheable media carry a CSRF `Set-Cookie`, and there is no CSP.
  - **Hosting:** photos on AWS have no backup or versioning, and no alert fires when backups stop.
  - **S3 writes:** they happen under a row lock and a pooled connection.
  - **Inputs:** `1,000` saves as 1.
- **Duplication** is concentrated in the tests: the backend test setup is copied into 28 classes and the e2e helpers into several specs. The frontend has six near-identical confirm dialogs. The production backend is fairly DRY: about 6% clones, mostly validators and token checks.
- **Unused code** is small: about 30 exports nothing imports, 6 i18n keys, two test-only `RateLimiter` methods, and an unused Prettier setup.

## High (2)

### DATA-1: smoke.sh tears down the default compose project with -v, wiping a self-hosted stack run from the checkout

- **Area / category / size:** ops · data-loss · S · changes behaviour
- **Where:** `scripts/smoke.sh:13`, `scripts/smoke.sh:15`, `scripts/smoke.sh:30`, `scripts/multiarch-check.sh:15`, `scripts/multiarch-check.sh:18`, `README.md:8`
- **Problem:** smoke.sh is the only stack script that sets no project name, so it uses compose's default (the directory name, `ricettine` in this checkout). README Quick start runs `docker compose up -d` in that same folder, which is the same project. Running scripts/smoke.sh (or multiarch-check.sh, which calls it twice) replaces the running app with a local build and its EXIT trap runs `docker compose down -v`, deleting the db-data and app-data volumes. That loses every recipe, user and photo. e2e.sh, https-smoke.sh and backup-restore-check.sh all set their own project name.
- **Fix:** Add `export COMPOSE_PROJECT_NAME="${SMOKE_PROJECT:-ricettine-smoke}"` next to COMPOSE_FILE in smoke.sh, as backup-restore-check.sh does. Optionally add a guard to infra-check that every script calling `down -v` sets a project.
- **Evidence:** `COMPOSE_FILE=compose.yaml:compose.build.yaml docker compose config` in the checkout prints `name: ricettine`. `grep COMPOSE_PROJECT\|-p scripts/*.sh` matches backup-restore-check, e2e and https-smoke but not smoke.sh.
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

### SEC-1: Per-IP rate limits can be bypassed with a spoofed Forwarded or X-Forwarded-For header

- **Area / category / size:** backend-security + ops · security · M · changes behaviour
- **Where:** `backend/src/main/resources/application.yml:37`, `backend/src/main/java/com/ricettine/auth/AuthController.java:55`, `backend/src/main/java/com/ricettine/auth/PasswordResetController.java:29`, `backend/src/main/java/com/ricettine/invite/PublicInviteController.java:47`, `backend/src/main/java/com/ricettine/setup/SetupController.java:43`, `backend/src/main/java/com/ricettine/account/MeController.java:52`, `backend/src/main/java/com/ricettine/account/MeController.java:78`, `deploy/Caddyfile:15`, `compose.yaml:31`, `compose.yaml:32`, `README.md:8`, `README.md:53`
- **Problem:** server.forward-headers-strategy=framework installs Spring's ForwardedHeaderFilter. It trusts the RFC 7239 `Forwarded: for=` header and the leftmost X-Forwarded-For from any client and uses them as request.getRemoteAddr(), which keys the login-ip and anonymous-auth limiters. Caddy overwrites X-Forwarded-For but passes `Forwarded` through unchanged, and Spring reads `Forwarded` first. The default compose.yaml publishes :8080 directly, so there X-Forwarded-For alone is enough. So in every shipped deployment one client can rotate the header and get unlimited login attempts across accounts (password spraying). Only the 10/15 min per-account limit remains. The deploy/Caddyfile comment claims the IP is safe.
- **Fix:** Use server.forward-headers-strategy=native, so Tomcat's RemoteIpValve trusts X-Forwarded-* only from server.tomcat.remoteip.internal-proxies and ignores `Forwarded`. Set internal-proxies to the compose network range. As defence in depth, add `header_up -Forwarded` (or `request_header -Forwarded`) to both Caddyfiles. Add an IT that sends 31 logins from one remote address with rotating `Forwarded`/X-Forwarded-For headers and expects a 429.
- **Evidence:** Reproduced at AUDIT_SHA with a throwaway IT (IpRateLimitIT setup, login-ip limit 30, setRemoteAddr fixed at 10.77.0.1). 40 failed logins with rotating `Forwarded: for=192.0.2.N` all returned 401 and none returned 429. The same happened with rotating X-Forwarded-For. IpRateLimitIT.ipLimited shows the 31st attempt is 429 without the header. Spring Web 7.0.10 ForwardedHeaderUtils.parseForwardedFor checks `Forwarded` before X-Forwarded-For. Also reported independently by the ops reviewer (default compose exposes :8080 directly; deploy/Caddyfile does not strip Forwarded). Lead confirmed both in the code.
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

## Medium (28)

### COR-1: Amount '1,000' silently saves as 1

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/amount.ts:28`
- **Problem:** parseValue() treats a comma as a decimal separator for any digit run: /^(\d+|\d*[.,]\d+)$/ then replace(',', '.'). '1,000' (one thousand g of flour, written the English way, and the UI is English-only) parses to 1 and is accepted as valid, so the recipe stores 1 g. Nothing warns the person.
- **Fix:** Reject the ambiguous form: if the text matches /^\d{1,3}(,\d{3})+$/ either treat it as a thousands separator or return 'invalid' so the inline error shows. Add a spec for '1,000', '1,5' and '1,500.5'.
- **Evidence:** Traced the regex: '1,000' -> m matches `\d*[.,]\d+` -> Number('1.000') = 1.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor state and input handling ('1,000' parses as 1)
- **Decision:** [x] fix (PR C) · [ ] skip · [ ] later

### DATA-2: Photos on AWS have no backup or versioning, and a restored dump can point at deleted objects

- **Area / category / size:** ops · data-loss · S · changes behaviour
- **Where:** `infra/terraform/storage.tf:11`, `infra/terraform/storage.tf:12`, `infra/terraform/iam.tf:28`, `infra/terraform/iam.tf:31`, `deploy/backup.sh:61`, `docs/deploy-aws.md:39`, `docs/deploy-aws.md:131`
- **Problem:** On AWS backup.sh skips media because 'media already lives in S3'. The media bucket is unversioned on purpose, so that deleted photos really disappear. The instance role holds s3:DeleteObject on it. An app bug (for example in orphan cleanup), an operator mistake or a compromised container can therefore delete every photo with no way back. A DB restore after accidental deletion also brings back rows whose S3 objects are gone. The privacy reason does not hold up either: the DB dumps already keep deleted accounts' data for backup_retention_days.
- **Fix:** Enable versioning on the media bucket with a lifecycle `noncurrent_version_expiration` equal to backup_retention_days, plus expired-delete-marker cleanup. Deletion then becomes final on the same schedule as the dumps. Document it in deploy-aws.md, and add tftest assertions.
- **Evidence:** storage.tf:11 comment 'Versioning stays off on purpose'. backup.sh:61 skips media when storage type is s3. start.sh:36 forces RICETTINE_STORAGE_TYPE=s3.
- **Decision:** [x] fix (PR E)

### DUP-1: Login re-implements LoginAttempt.run's reserve/fail/refund logic

- **Area / category / size:** backend-security · duplication · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/auth/AuthController.java:58`, `backend/src/main/java/com/ricettine/common/RateLimits.java:91`
- **Problem:** The security-critical rule ('bad_credentials keeps the reservation, success clears it, anything else refunds') exists twice: inline in AuthController.login (try/catch on ApiException and RuntimeException) and in RateLimits.LoginAttempt.run, which password change and account deletion use. If one copy is changed, the limits drift apart without anyone noticing.
- **Fix:** Give LoginAttempt a value-returning `<T> T run(Supplier<T>)`, and have login use it to return the authenticated User (throwing bad_credentials inside). Then delete the inline try/catch. failed() can become private.
- **Evidence:** Read both at AUDIT_SHA: AuthController.java:58-78 and RateLimits.java:91-110 have the same branching.
- **Decision:** [x] fix (PR D) · [ ] skip · [ ] later

### ERR-1: Avatar upload reads the whole file onto the heap before waiting for a processing slot

- **Area / category / size:** backend-security · error-handling · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/account/MeController.java:59`, `backend/src/main/java/com/ricettine/account/AccountService.java:138`, `backend/src/main/resources/application.yml:15`
- **Problem:** MeController calls file.getBytes() (up to 15 MB) before MediaService.process waits up to 30 s for one of 2 decode permits. So every queued avatar upload holds a full copy on the heap. Recipe photos and cookbook covers use the Supplier overload, which reads only once a permit is held. The application.yml comment ('never held in heap') suggests this protection applies to every upload.
- **Fix:** Make AccountService.setAvatar take Supplier<byte[]> and pass `() -> file.getBytes()` as RecipePhotoController does. A shared helper for the IOException wrapping would also remove the three copies.
- **Evidence:** MediaService.java:54 documents the Supplier overload for exactly this reason. RecipePhotoController.java:51 and CookbookCoverController.java:50 use it, and MeController.java:61 does not.
- **Decision:** [x] fix (PR D) · [ ] skip · [ ] later

### OPS-1: JVM heap sized to 75% of host RAM: no compose service sets a memory limit

- **Area / category / size:** ops · ops · S · changes behaviour
- **Where:** `Dockerfile:31`, `Dockerfile:32`, `compose.yaml:17`, `compose.aws.yaml:23`, `infra/terraform/variables.tf:26`
- **Problem:** Dockerfile sets MaxRAMPercentage=75 'from the container memory limit so it fits small hosts without OOM kills'. No compose file sets mem_limit or deploy.resources, so the container has no limit and the JVM sees the whole host. On the default t4g.small (2 GiB) the heap can grow to about 1.5 GiB. Add metaspace and threads, Postgres, Caddy, dockerd and the OS, and there is no room left. Under upload or decode load the kernel OOM killer can kill java or postgres. The smoke test checks only the flag value, not the effective max heap.
- **Fix:** Set `mem_limit` on app (for example 1g in compose.aws.yaml, and a documented default or an env-driven `${RICETTINE_MEM_LIMIT:-1g}` in compose.yaml), so 75% applies to a real limit. Extend smoke.sh to assert MaxHeapSize under the limit (`-XX:+PrintFlagsFinal | grep MaxHeapSize`).
- **Evidence:** `grep -n 'mem_limit\|resources' compose*.yaml` finds nothing. Dockerfile:31 comment states the intent.
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

### SEC-2: Logout signs the user out locally even when the server call failed

- **Area / category / size:** frontend-app · security · S · changes behaviour
- **Where:** `frontend/src/app/core/auth.store.ts:46`, `frontend/src/app/shell/shell.component.ts:67`
- **Problem:** AuthStore.logout() swallows every error from POST /api/auth/logout and then clears `me`. The comment only justifies a 401, but a network failure (status 0) or a 5xx also lands here. The UI then shows the login page while the server session cookie is still valid; reloading the page calls /api/me and signs the person straight back in. On a shared device the user believes they logged out and did not.
- **Fix:** Swallow only a 401 (session already gone). For any other error keep `me` set, return/throw an ApiError and let the shell show errors.network_error with a retry. Add a spec for the status-0 and 500 cases.
- **Evidence:** Code read: catch {} then finally { this._me.set(null) } with no status check.
- **Decision:** [x] fix (PR C) · [ ] skip · [ ] later

### SEC-3: GitHub Actions pinned to mutable major tags, including the job that holds packages:write

- **Area / category / size:** ops · security · S · behaviour unchanged
- **Where:** `.github/workflows/ci.yml:21`, `.github/workflows/ci.yml:22`, `.github/workflows/ci.yml:30`, `.github/workflows/ci.yml:43`, `.github/workflows/ci.yml:44`, `.github/workflows/ci.yml:60`, `.github/workflows/ci.yml:61`, `.github/workflows/ci.yml:72`, `.github/workflows/ci.yml:109`, `.github/workflows/ci.yml:110`, `.github/workflows/ci.yml:111`, `.github/workflows/ci.yml:112`, `.github/workflows/ci.yml:118`, `.github/workflows/ci.yml:125`
- **Problem:** Every action is referenced as @vN. The publish job runs docker/setup-qemu, setup-buildx, login, metadata and build-push with a GITHUB_TOKEN that has packages:write and the registry login. If one of those tags is moved (as in the tj-actions/changed-files incident), the attacker can push a malicious `latest` image that every self-hoster and the AWS host pull on restart.
- **Fix:** Pin every `uses:` to a full commit SHA with a `# vX.Y.Z` comment, and add Dependabot (`package-ecosystem: github-actions`) to keep them current. Optionally add `provenance: mode=max` and `sbom: true` to build-push.
- **Evidence:** `grep uses: .github/workflows/ci.yml` shows only @v3..@v6 tags. No .github/dependabot.yml.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / CI / Actions are pinned to major tags
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

### SEC-4: .gitignore does not cover .env or backups/, though the README tells users to create both in the repo root

- **Area / category / size:** ops · security · S · behaviour unchanged
- **Where:** `.gitignore:1`, `.gitignore:17`, `README.md:17`, `README.md:77`, `deploy/backup.sh:30`, `.dockerignore:1`
- **Problem:** README says to put settings, including POSTGRES_PASSWORD, in `.env` next to compose.yaml, and to run deploy/backup.sh from the repo root. The script's default BACKUP_DIR=./backups then fills with pg_dump files that hold emails and password hashes, plus media archives. Neither path is gitignored, so `git add -A` / `git commit -a` in a self-hosting checkout publishes secrets and personal data. .dockerignore also misses `.env`, `backups`, `e2e/node_modules`, `infra/terraform/.terraform`, `*.tfstate` and `.https-smoke-data.*` (BuildKit only sends COPY'd paths today, so that part is hygiene).
- **Fix:** Add `.env`, `backups/` (and `*.dump`) to .gitignore. Mirror them, plus `infra/terraform/.terraform`, `*.tfstate*`, `e2e/node_modules` and `.https-smoke-data.*`, in .dockerignore.
- **Evidence:** .gitignore lines 1-17 contain neither entry. backup.sh:30 `BACKUP_DIR="${BACKUP_DIR:-./backups}"`.
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

### TEST-1: csrf() post-processor leaks a session-backed CSRF repository into the shared filter chain

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java:160`, `backend/src/test/java/com/ricettine/IntegrationTest.java:23`, `backend/src/test/java/com/ricettine/media/UploadTooLargeIT.java:19`
- **Problem:** SecurityMockMvcRequestPostProcessors.csrf() mutates the CsrfFilter inside the cached Spring context. The only mitigation is a hand-written WebTestUtils.setCsrfTokenRepository(...) hack inside one test (PublicRecipeIT.anonymousRequestCreatesNoSession). Any other test in that context that depends on the production cookie repository (for example a future anonymous-request assertion on XSRF-TOKEN or SESSION) passes or fails depending on test order. The three real-HTTP CSRF ITs exist only because MockMvc cannot test CSRF faithfully, and the leak is documented in two places but not fixed.
- **Fix:** Restore the production repository after each test once, in IntegrationTest (@AfterEach calling WebTestUtils.setCsrfTokenRepository with CookieCsrfTokenRepository.withHttpOnlyFalse(), as the follow-up proposes), and drop the inline hack from PublicRecipeIT. Alternatively write a local csrf() RequestPostProcessor that only sets the X-XSRF-TOKEN header and cookie pair, which needs no filter mutation.
- **Evidence:** Comment in PublicRecipeIT.anonymousRequestCreatesNoSession and in UploadTooLargeIT class javadoc; plan-2 follow-up lists the same item as open.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Small cleanups / Test infrastructure (csrf() leak)
- **Decision:** [x] fix (PR F)

### TEST-2: Vacuous or missing-control assertions in profile, feed, robots and S3 timeout tests

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/feed/FeedIT.java:149`, `backend/src/test/java/com/ricettine/profile/ProfileIT.java:141`, `backend/src/test/java/com/ricettine/config/RobotsHeaderIT.java:59`, `backend/src/test/java/com/ricettine/media/S3BlobStoreTimeoutTest.java:34`, `backend/src/test/java/com/ricettine/account/AccountDeletionIT.java:149`, `backend/src/test/java/com/ricettine/config/SpaFallbackIT.java:80`
- **Problem:** (1) FeedIT.publicDraftNeverListed walks the feed and asserts a draft id is absent; it passes just as well if the feed endpoint returned nothing at all (no positive control). (2) ProfileIT.selfSeesAllMarked asserts coverThumbUrl contains(draft ? "" : "?s="); contains("") is always true, so the draft branch of that assertion checks nothing. (3) RobotsHeaderIT.mediaAndActuatorCarryIt asserts the X-Robots-Tag on /actuator/health without asserting a status, so a 500/404 with the header would pass. (4) S3BlobStoreTimeoutTest asserts only isNotNull() on the thrown exception: any failure (bad credentials, bad endpoint) satisfies it; only the 5 s preemptive timeout carries the meaning. (5) AccountDeletionIT.adminCanDeleteWhenAnotherAdminExists checks the 204 only and never that the user row is gone or the other admin remains. (6) SpaFallbackIT accepts any of 400/401/404 for the case-variant paths.
- **Fix:** (1) publish a PUBLIC recipe as well and assert it is present while the draft is absent. (2) delete the contains("") term, keep the explicit doesNotContain branch. (3) add status().isOk(). (4) assert the cause is an SdkClientException/ApiCallTimeoutException (or message contains 'timed out'). (5) assert count(*) from app_user and the remaining admin flag. (6) pin the expected status per path.
- **Evidence:** Read each assertion in context; (2) and (3) are open follow-ups, (1) is the Plan 4 follow-up, (4) the Plan 5 follow-up.
- **Follow-up:** 2026-11-05-plan-4-followups.md: Tests to add (FeedIT positive control, ProfileIT vacuous contains); 2026-11-07-plan-5-followups.md: Tests to add (actuator robots header, S3BlobStoreTimeoutTest isNotNull)
- **Decision:** [x] fix (PR F)

### TEST-3: Privacy-critical profile visibility has no raw-JSON leak guard and no self-view thumb test

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/profile/ProfileIT.java:116`, `backend/src/test/java/com/ricettine/profile/ProfileIT.java:167`
- **Problem:** visitorSeesOnlyPublic parses the JSON and checks the id arrays, so it catches a private recipe appearing in recipes[] or cookbooks[] but not a private recipe, draft, private cookbook id or share token leaking through another field (cookbook recipe lists, covers, tokens). The Plan 4 follow-up asks for a string-level guard and has not been implemented. No IT fetches the self-view thumbnails (thumbsLoadForVisitor only follows visitor URLs), so a regression where the owner's own profile cards point at 404 URLs (drafts have no ?s=) is invisible to the backend suite.
- **Fix:** In visitorSeesOnlyPublic assert the raw response body does not contain privPublished, pubDraft, privDraft, aPrivateBook ids, nor their share tokens. Add a selfThumbsLoad test that GETs coverThumbUrl of a draft and a published recipe with the owner cookie and expects 200.
- **Evidence:** ProfileIT has no assertion on getContentAsString of the visitor profile; thumbsLoadForVisitor uses profile(b, ...).
- **Follow-up:** 2026-11-05-plan-4-followups.md: Feed and profile (string-level IT guard); Tests to add (self-view thumbs)
- **Decision:** [x] fix (PR F)

### TEST-4: PublicUrls (configured base URL, X-Forwarded-* handling) and conditional-GET forms have no tests

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java:141`, `backend/src/test/java/com/ricettine/media/MediaAccessIT.java:105`, `backend/src/main/java/com/ricettine/common/PublicUrls.java:19`
- **Problem:** Share, invite and reset URLs are built by PublicUrls from ricettine.base-url or the request, and server.forward-headers-strategy is 'framework'. Every test only asserts the default 'http://localhost/...'; neither the configured override nor behind-the-proxy Host/X-Forwarded-Proto/-Host behaviour is exercised, though these links are the product's main output and an admin hands them to other people. Likewise MediaController.matches() implements weak validators, comma lists and '*', but MediaAccessIT only sends the exact ETag.
- **Fix:** Add a PublicUrlsTest (unit, MockHttpServletRequest in RequestContextHolder) for blank vs configured base with and without trailing slash, and one IT that sends X-Forwarded-Proto: https and X-Forwarded-Host and asserts the shareUrl. Parameterise etagAndNotModified over 'W/"x"', '"a", "x"' and '*'.
- **Evidence:** grep for base-url, X-Forwarded in backend/src/test returns nothing.
- **Follow-up:** 2026-11-07-plan-5-followups.md: Tests to add (If-None-Match weak, list and * forms)
- **Decision:** [x] fix (PR F)

### TEST-5: Step-photo upload remapping on insert/remove/reorder has no unit test

- **Area / category / size:** frontend-tests-e2e · tests · S · behaviour unchanged
- **Where:** `frontend/src/app/recipes/editor/editor-store.ts:353`, `frontend/src/app/recipes/editor/remap-index.ts:2`, `frontend/src/app/recipes/editor/editor-store.testing.ts:38`
- **Problem:** EditorStore.stepInserted/stepRemoved/stepMoved re-index in-flight and failed photo uploads so a photo lands on the step it was chosen for. remapIndex is also used for the active step. No spec calls any of them: steps-editor.component.spec uses fakeEditorStore, whose stepInserted/stepRemoved/stepMoved are empty stubs, and remapIndex has no spec at all. A sign error would attach an upload (or its Retry) to the wrong step, which the e2e reorder specs do not exercise because they never reorder with an upload pending.
- **Fix:** Add a remapIndex table test (move down, move up, i == from, outside range) and EditorStore specs that start an upload on step 1, then call stepInserted(0), stepRemoved, stepMoved and assert uploadFor(slot) follows; for a removed step assert the upload is dropped.
- **Evidence:** grep for stepMoved|stepInserted|stepRemoved|remapIndex across *.spec.ts finds nothing; the only hits are the empty stubs in editor-store.testing.ts.
- **Decision:** [x] fix · [ ] skip · [ ] later

### TEST-6: Frontend gaps from earlier follow-ups still untested: interceptor logout 401, ParamReuseStrategy config change, cookbook empty/error states, reset-link dialog Escape, feed re-entrancy

- **Area / category / size:** frontend-tests-e2e · tests · S · behaviour unchanged
- **Where:** `frontend/src/app/core/auth.interceptor.spec.ts:1`, `frontend/src/app/core/param-reuse-strategy.spec.ts:1`, `frontend/src/app/cookbooks/view/cookbook-view.page.spec.ts:44`, `frontend/src/app/cookbooks/cookbook.page.spec.ts:29`, `frontend/src/app/feed/feed.page.spec.ts:51`, `frontend/src/app/cookbooks/cookbook-share-panel.component.spec.ts:1`
- **Problem:** Still open: (a) authInterceptor has no spec for a 401 on POST /api/auth/logout (the interceptor only exempts GET /api/me and POST /api/auth/login, so a failed logout redirects) and none for absolute API URLs. (b) ParamReuseStrategy is tested only with same-config routes; a navigation between different route configs is not asserted. (c) CookbookViewPage tests only the 404 state, not a generic load error or an empty recipe list. (d) cookbook.page.spec mounts a CookbookApi mock without invites, so the invites load rejects silently and the noise hides real unhandled rejections. (e) Neither reset-link confirm dialog is closed with Escape in any spec. (f) The feed 'disables Load more while loading' test checks only the disabled attribute; the loadingMore guard (a second call while one is pending, and Retry double-click) has no assertion. Each is a small regression hole in code that guards navigation, data display or double submission.
- **Fix:** Add one test per item (about 6 short tests). For (f), call more.click() twice synchronously and expect page toHaveBeenCalledTimes(2) including the initial load.
- **Evidence:** grep for 'invites', 'Escape' in the cookbook specs finds nothing; feed.page.spec.ts:51 is the only loading test.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-3-followups.md: Tests to add / Frontend
- **Decision:** [x] fix · [ ] skip · [ ] later

### TEST-7: Infra lint, Terraform tests, mount-data tests, the backup/restore drill and the HTTPS overlays never run in CI

- **Area / category / size:** ops · tests · S · behaviour unchanged
- **Where:** `.github/workflows/ci.yml:16`, `scripts/infra-check.sh:1`, `scripts/backup-restore-check.sh:1`, `scripts/https-smoke.sh:1`, `CLAUDE.md:20`
- **Problem:** CI runs backend, frontend, e2e and two smokes only. These all exist but run only when someone remembers: actionlint, shellcheck, caddy validate, mount-data.test.sh, 29 terraform tests (infra-check.sh), the backup→wipe→restore drill and both Caddy overlays (https-smoke.sh, including the token-not-logged and X-Forwarded-For checks). A change to compose.yaml, the Caddyfiles, backup.sh or restore.sh can merge green and break production backups or the AWS origin. The PR-gate convention in CLAUDE.md ('automate checks instead of listing manual steps') is not applied to the ops layer.
- **Fix:** Add CI jobs `infra` (scripts/infra-check.sh; it needs only Docker) and `ops-drills` (backup-restore-check.sh and https-smoke.sh on ubuntu-latest, where ports 80, 443 and 8080 are free). Mention them in CLAUDE.md's CI line.
- **Evidence:** ci.yml jobs: backend, frontend, e2e, smoke, smoke-arm64, publish. infra-check.sh passed locally (exit 0, 'Success! 29 passed').
- **Decision:** [x] fix (PR E)

### CONC-1: Photo and cover blobs are written to S3 while a row lock and a pooled connection are held

- **Area / category / size:** backend-domain · concurrency · M · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeService.java:119`, `backend/src/main/java/com/ricettine/media/MediaService.java:71`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:155`, `backend/src/main/java/com/ricettine/recipe/RecipePhotoController.java:21`
- **Problem:** The controllers say the upload runs in a 'short transaction', but addPhoto (FOR SHARE on the recipe) and setCover (FOR UPDATE on the cookbook) do the blob puts (two objects, S3 timeouts up to 30 s each, SDK retries) inside that transaction. A slow S3 pins a Hikari connection and blocks every save/delete of that recipe (or every write on that cookbook) for the duration. A few concurrent uploads during an S3 brownout can exhaust the default 10-connection pool and stall the whole app. The timeouts added in Plan 5 bound it but do not remove it.
- **Fix:** Write the blobs first (outside the transaction, keyed by the new media id), then open the short transaction that locks the row and inserts the media row; on failure delete the blobs. The orphan cleanup already covers blobs without rows only for rows, so also delete blobs in the catch path.
- **Evidence:** Code read: MediaService.register is called from inside the @Transactional RecipeService.addPhoto / CookbookService.setCover. Plan 2 follow-up already named the symptom.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Plan 5 (S3 timeouts / addPhoto holds a FOR SHARE lock)
- **Decision:** [x] fix (PR D) · [ ] skip · [ ] later

### CONS-1: Account, admin and settings pages call HttpClient directly while feed/profile/recipes/cookbooks use *Api services

- **Area / category / size:** frontend-app · consistency · M · behaviour unchanged
- **Where:** `frontend/src/app/admin/invites.page.ts:50`, `frontend/src/app/admin/users.page.ts:53`, `frontend/src/app/auth/register.page.ts:33`, `frontend/src/app/auth/reset-password.page.ts:30`, `frontend/src/app/auth/setup.page.ts:27`, `frontend/src/app/settings/delete-account.page.ts:42`, `frontend/src/app/settings/password.page.ts:42`, `frontend/src/app/settings/profile.page.ts:72`, `frontend/src/app/core/auth.store.ts:17`
- **Problem:** Nine components/stores build URLs and declare their DTO types (`Invite`, `Created`, `User`, `Reset`) inline, with unit tests that must mock HttpClient, while four other features go through typed *Api services. Two conventions for the same job makes the codebase look unfinished and makes endpoint changes a hunt.
- **Fix:** Add AuthApi/AccountApi (register, setup, reset, password, profile, avatar, delete) and AdminApi (invites, users) in the same shape as CookbookApi; move the DTO types into *.model.ts; keep the pages thin.
- **Evidence:** grep inject(HttpClient) outside *.api.ts and core: 9 files.
- **Decision:** [x] fix · [ ] skip · [ ] later

### DATA-3: Conflict 'copy your text' block omits most of the user's edits, and Load latest discards them (plus the edits typed during its fetch)

- **Area / category / size:** frontend-app · data-loss · M · changes behaviour
- **Where:** `frontend/src/app/recipes/editor/editor-store.ts:39`, `frontend/src/app/recipes/editor/editor-store.ts:433`, `frontend/src/app/recipes/editor/editor-store.ts:441`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:75`
- **Problem:** On a 409 the page shows a textarea built by conflictText(): title, notes and step texts only. Ingredients, portions, times, source and visibility are not in it. Load latest then replaces the working copy and clears the local backup, so an ingredient-only (or details-only) edit made on the losing device is lost for good. Separately, loadLatest() awaits api.get() and then replace()+clearBackup(): anything typed in that window was written to the backup by changed() and is then wiped without being applied or backed up again.
- **Fix:** Add ingredient lines (`amount unit name, note`), source, times and portions to conflictText(). In loadLatest(), after the fetch compare autosave.dirty()/rev with the value before it; if the user typed meanwhile, keep the backup (or re-apply on top of the fetched copy) instead of clearing it.
- **Evidence:** Read conflictText() (editor-store.ts:39-43) and loadLatest() (433-438); replace() resets autosave and clearBackup() runs unconditionally after the awaited get.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / The copyable conflict block ...; Text typed while "Load latest" is fetching ...
- **Decision:** [x] fix (PR C) · [ ] skip · [ ] later

### DUP-2: Recipe/cookbook/photo fixture helpers re-implemented in about a dozen ITs

- **Area / category / size:** backend-tests · duplication · M · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/recipe/RecipeApiIT.java:50`, `backend/src/test/java/com/ricettine/recipe/RecipePhotoIT.java:50`, `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java:46`, `backend/src/test/java/com/ricettine/recipe/UploadLimitsIT.java:47`, `backend/src/test/java/com/ricettine/recipe/RecipePhotoBusyIT.java:57`, `backend/src/test/java/com/ricettine/feed/FeedIT.java:49`, `backend/src/test/java/com/ricettine/profile/ProfileIT.java:64`, `backend/src/test/java/com/ricettine/media/MediaAccessIT.java:62`, `backend/src/test/java/com/ricettine/cookbook/CookbookApiIT.java:55`, `backend/src/test/java/com/ricettine/cookbook/CookbookIT.java:62`, `backend/src/test/java/com/ricettine/cookbook/PublicCookbookIT.java:58`, `backend/src/test/java/com/ricettine/recipe/RecipePhotoIT.java:91`, `backend/src/test/java/com/ricettine/cookbook/CookbookCoverIT.java:75`, `backend/src/test/java/com/ricettine/cookbook/CookbookAccountDeletionIT.java:24`
- **Problem:** Almost every IT carries its own copy of create-recipe, save-with-body, publish, upload-photo, publishedRecipe, shareToken lookup, createCookbook and blobExists, each with slightly different signatures and return types (String id, JsonNode, String[]). The recipe JSON body literal alone is written out at least 8 times. This is what produces most of the 80 jscpd clones (the import blocks and setUp blocks are also clones). A change to the recipe payload shape or an endpoint path has to be patched in a dozen places, and the copies have already drifted (some assert status 201/200, some do not, e.g. CookbookApiIT.publishedRecipe and draftRecipe call andReturn() without asserting the status, so a failed create surfaces later as an NPE).
- **Fix:** Add one test-scope helper in com.ricettine (next to Sessions), e.g. RecipeFixtures/CookbookFixtures constructed with (MockMvc, ObjectMapper, JdbcTemplate): createDraft(cookie), save(cookie,id,version,visibility,cover,stepPhoto), publish(cookie,id,version), publishedRecipe(cookie,visibility), uploadPhoto(cookie,recipeId), shareToken(id), createCookbook(cookie,name), blobExists(BlobStore,mediaId). Every helper asserts the expected status. Keep per-test body customisation via an overload that takes the JSON string.
- **Evidence:** Read all 12 files; 3 byte-identical blobExists(), 12 methods named create/published/publishedRecipe/recipe returning an id; jscpd pack lists 15+ clones between these files, all fixture or header text.
- **Decision:** [x] fix (PR F)

### DUP-3: Per-class DB reset and user bootstrap copy-pasted into 28 test classes

- **Area / category / size:** backend-tests · duplication · M · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/IntegrationTest.java:23`, `backend/src/test/java/com/ricettine/recipe/RecipeApiIT.java:45`, `backend/src/test/java/com/ricettine/recipe/RecipePhotoIT.java:40`, `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java:35`, `backend/src/test/java/com/ricettine/cookbook/CookbookApiIT.java:36`, `backend/src/test/java/com/ricettine/cookbook/CookbookCoverIT.java:46`, `backend/src/test/java/com/ricettine/cookbook/PublicCookbookIT.java:36`, `backend/src/test/java/com/ricettine/feed/FeedIT.java:34`, `backend/src/test/java/com/ricettine/profile/ProfileIT.java:48`, `backend/src/test/java/com/ricettine/admin/AdminRoleIT.java:30`, `backend/src/test/java/com/ricettine/admin/PasswordResetIT.java:32`, `backend/src/test/java/com/ricettine/invite/InviteIT.java:27`, `backend/src/test/java/com/ricettine/auth/AuthIT.java:30`, `backend/src/test/java/com/ricettine/account/MeIT.java:44`
- **Problem:** 28 classes start with the same two statements (truncate table app_user, one_time_token, instance_setup cascade; delete from spring_session) and then create the same two or three accounts (me/other, a/b, owner/bea/carl) and log them in. The truncate list is a hard-coded table list: a new top-level table (or a table not reached by the cascade) silently leaks rows between classes until each of 28 copies is edited. A few classes forget the second statement (AccountServiceIT, SetupIT, MediaIT, MediaAccessIT, RobotsHeaderIT), so the reset is inconsistent. InviteIT also has its own login() that duplicates Sessions.login.
- **Fix:** Move the reset into IntegrationTest as a @BeforeEach (one method, both statements, or truncate every public table except flyway_schema_history discovered from information_schema) and add a small TestUsers helper (create(email, username, admin) returning user plus cookie). Delete the 28 copies. Reuse Sessions.login in InviteIT.
- **Evidence:** grep -rln 'truncate table app_user' backend/src/test returns 28 files; read each.
- **Decision:** [x] fix (PR F)

### DUP-4: Six near-identical confirm dialog components and eight copies of the open-sheet/await-closed boilerplate

- **Area / category / size:** frontend-app · duplication · M · behaviour unchanged
- **Where:** `frontend/src/app/recipes/editor/confirm-delete.dialog.ts:1`, `frontend/src/app/recipes/editor/confirm-leave.dialog.ts:1`, `frontend/src/app/recipes/editor/confirm-reset-link.dialog.ts:1`, `frontend/src/app/cookbooks/confirm-delete-cookbook.dialog.ts:1`, `frontend/src/app/cookbooks/confirm-reset-cookbook-link.dialog.ts:1`, `frontend/src/app/cookbooks/remove-member.dialog.ts:1`, `frontend/src/app/cookbooks/cookbook.page.ts:126`, `frontend/src/app/cookbooks/cookbook-share-panel.component.ts:60`, `frontend/src/app/recipes/editor/share-panel.component.ts:77`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:244`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:354`
- **Problem:** Five dialogs are the same 30-line component (title, body, Cancel, a confirm button, a copied `.danger` style block and `uid()` title id) differing only in i18n keys; remove-member is the same plus a checkbox. Each caller repeats `openEditorSheet(...)` + `(await firstValueFrom(ref.closed, { defaultValue: undefined })) === true` (8 sites). Any change to dialog behaviour (focus, a11y, danger colour) needs six edits.
- **Fix:** One ConfirmDialog component taking {titleKey, bodyKey, params, confirmKey, danger} through DIALOG_DATA, plus a helper `confirmSheet(dialog, injector, i18n, data): Promise<boolean>` next to openEditorSheet. Keep remove-member as the only specialised one (or give ConfirmDialog an optional checkbox).
- **Evidence:** Diffed the five files: only i18n keys and uid prefix differ. grep: 12 openEditorSheet call sites, 8 `closed, { defaultValue` awaits.
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-5: Duplicated e2e setup: step-photo/publish helpers, layout checks, login-as-admin-and-invite, FIXTURE path

- **Area / category / size:** frontend-tests-e2e · duplication · M · behaviour unchanged
- **Where:** `e2e/tests/share-link.spec.ts:7`, `e2e/tests/cookbook-link.spec.ts:7`, `e2e/tests/cookbook-link.spec.ts:21`, `e2e/tests/editor.spec.ts:4`, `e2e/tests/recipe-editor.spec.ts:4`, `e2e/tests/feed.spec.ts:88`, `e2e/tests/profile.spec.ts:98`, `e2e/tests/cookbooks.spec.ts:11`, `e2e/tests/cookbook-link.spec.ts:75`, `e2e/tests/auth-a11y.spec.ts:22`, `e2e/tests/avatar.spec.ts:8`, `e2e/tests/recipe-photos.spec.ts:6`, `e2e/tests/unsaved-safety.spec.ts:5`, `e2e/tests/restart.spec.ts:6`
- **Problem:** (1) addStepPhoto and the cover/step photo block are copied between share-link and cookbook-link specs (17-line jscpd clone). (2) newRecipeLink is defined identically in editor.spec and recipe-editor.spec, with the same Done-on-untouched-draft block (9-line clone). (3) The 'cards sit side by side on desktop, stack on mobile' bounding-box check is written four times (feed, profile, cookbooks, cookbook-link). (4) auth-a11y.spec repeats the admin login + createInvitePath prelude that newUserPage already holds. (5) FIXTURE is rebuilt in six files, one with a different mechanism (fileURLToPath vs import.meta.dirname); `saved` locator is redefined in two specs next to the literal 'Saved ✓' repeated about 20 times. Any change to the editor's status text or the photo buttons needs edits in many places.
- **Fix:** Move addStepPhoto, addCoverPhoto, newRecipeLink, expectSideBySide(cards)/expectStacked, expectSaved(page), FIXTURE_PHOTO and an inviteAsAdmin(browser, testInfo) helper into helpers.ts and import them. Keep behaviour identical.
- **Evidence:** jscpd pack: feed/profile 11 lines, editor/recipe-editor 9, cookbook-link/share-link 17 and 5; grep -n 'FIXTURE =' finds 6 definitions.
- **Decision:** [x] fix · [ ] skip · [ ] later

### OPS-2: Backup alerting only covers a run that fails: no alert when backups stop, and lifecycle then deletes the last good dump

- **Area / category / size:** ops · ops · M · changes behaviour
- **Where:** `deploy/aws/ricettine-backup.service:5`, `deploy/aws/backup-failed.sh:8`, `infra/terraform/storage.tf:126`, `infra/terraform/storage.tf:130`, `scripts/aws-verify.sh:63`
- **Problem:** OnFailure= emails only when ricettine-backup.service runs and fails. No alert fires if the timer is not enabled (for example a half-finished cloud-init), the host is stopped or broken, or the SNS publish itself fails (it only shows as a failed unit). Meanwhile the lifecycle rule keeps expiring dumps: after backup_retention_days plus the noncurrent window, the bucket is empty. The only freshness check (aws-verify.sh, under 26 h) is manual.
- **Fix:** Add a staleness check that does not depend on the host. For example, a CloudWatch alarm on the backups bucket's PutRequests metric (request metrics on the db/ prefix), set to alarm on missing data for 26 h and wired to the existing SNS topic. Or a tiny scheduled Lambda that runs the aws-verify step 6 logic. Optionally keep the newest N noncurrent versions (`newer_noncurrent_versions`) so expiry never removes the last dumps.
- **Evidence:** No CloudWatch alarm resources in infra/terraform. The OnFailure unit is the only alert path. The followup 'backup-failed.sh: a failed SNS publish only shows as a failed unit' is the same gap.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Small cleanups / backup-failed.sh SNS
- **Decision:** [x] fix (PR E)

### SEC-5: Public, immutable media responses carry Set-Cookie: XSRF-TOKEN; CloudFront may cache it and serve one CSRF token to everyone

- **Area / category / size:** backend-security · security · M · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/config/SecurityConfig.java:40`, `backend/src/main/java/com/ricettine/media/MediaController.java:42`, `infra/terraform/edge.tf:51`
- **Problem:** csrf.spa() loads the deferred CSRF token on every request, so any request without an XSRF-TOKEN cookie gets a Set-Cookie. That includes avatar GETs served with `Cache-Control: public, max-age=31536000, immutable`. The /media/* CloudFront behaviour forwards all cookies (origin request policy `app`) and honours the origin's caching for up to a day, so a cached avatar can hand the same XSRF-TOKEN to every viewer and overwrite their own. CSRF protection would then rest on SameSite=Lax alone. The plan-5 'Edge caching' worry was about SESSION. SESSION is not set, but XSRF-TOKEN is.
- **Fix:** Don't issue CSRF cookies on /media/**. Either add a separate SecurityFilterChain for `/media/**` (GET only, csrf disabled, same session-based authentication), or use a request handler that skips token loading on safe requests to /media/**. Add the planned edge-caching IT: an avatar GET with no cookies and with a stale SESSION cookie must carry no Set-Cookie at all.
- **Evidence:** Throwaway IT at AUDIT_SHA: GET of an avatar URL with no cookies returned 200, `Cache-Control: public, max-age=31536000, immutable` and `Set-Cookie: XSRF-TOKEN=<uuid>; Path=/`. With a stale SESSION cookie the result was the same (XSRF-TOKEN only, no SESSION cookie).
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Edge caching
- **Decision:** [x] fix (PR B)

### SEC-6: No Content-Security-Policy (and no Referrer-Policy in self-hosted mode)

- **Area / category / size:** backend-security · security · M · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/config/SecurityConfig.java:24`, `deploy/Caddyfile:16`
- **Problem:** Neither the app nor the Caddy overlays send a CSP. The AWS Managed-SecurityHeadersPolicy doesn't add one either. Spring Security's defaults give nosniff and X-Frame-Options DENY only. If any XSS gets in through user-authored recipe content, nothing contains it. A reviewer checking the headers will notice right away. Self-hosted mode also sends no Referrer-Policy on pages whose URLs carry invite, reset and share tokens. Browser defaults strip the path on cross-origin requests, so it's low risk.
- **Fix:** Add `headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")).referrerPolicy(r -> r.policy(SAME_ORIGIN)))` in SecurityConfig. Check it against the Angular build (critical-CSS inlining uses an inline onload handler, so set `inlineCritical: false` or use autoCsp). Assert the header in RobotsHeaderIT-style tests and run the e2e suite.
- **Evidence:** Throwaway IT: GET /login returned `X-Frame-Options: DENY`, with no Content-Security-Policy and no Referrer-Policy. grep finds no CSP in deploy/ or backend.
- **Decision:** [x] fix (PR B)

### TEST-8: Cookbook invite, cap and removal edge cases from the Plan 3 follow-ups are still untested

- **Area / category / size:** backend-tests · tests · M · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/cookbook/CookbookInviteIT.java:86`, `backend/src/test/java/com/ricettine/cookbook/CookbookApiIT.java:273`, `backend/src/test/java/com/ricettine/cookbook/CookbookMemberIT.java:56`, `backend/src/test/java/com/ricettine/cookbook/CookbookAccountDeletionIT.java:30`
- **Problem:** Still missing: (a) a PASSWORD_RESET or INSTANCE_INVITE token presented to /api/cookbook-invites/{t} and /accept (and a cookbook token to /api/invites/{t}); the existing cross-purpose test (PasswordResetIT.inviteTokenCannotResetPassword) covers one direction only. (b) an anonymous POST accept returns 401 (only the anonymous GET preview is tested). (c) revoking an invite through another cookbook's id is 404. (d) concurrency on the 500-entry cap (two adds at 499): cookbookFullAt500 is sequential. (e) adding your own draft by share token. (f) removeRecipes=true must leave the person's entries in other cookbooks alone (permissionsOfRemoval only checks one cookbook). (g) account deletion: another owner's outstanding invite survives (the current IT cannot tell the created_by cascade from the cookbook_id cascade). These are authorization and data-loss boundaries, not cosmetic ones.
- **Fix:** Add the seven small cases to CookbookInviteIT, CookbookApiIT, CookbookMemberIT and CookbookAccountDeletionIT using the existing CookbookIT helpers. For (d) use the race helper from the concurrency finding.
- **Evidence:** Searched the cookbook tests for each scenario; none present.
- **Follow-up:** 2026-11-04-plan-3-followups.md: Tests to add (co-author invites bullets, concurrency 500 cap, own draft by token, account deletion invite survival)
- **Decision:** [x] fix (PR F)

### TEST-9: Manually created Playwright contexts get no trace or screenshot on failure

- **Area / category / size:** frontend-tests-e2e · tests · M · behaviour unchanged
- **Where:** `e2e/tests/helpers.ts:21`, `e2e/tests/helpers.ts:78`, `e2e/playwright.config.ts:13`
- **Problem:** playwright.config sets trace: 'retain-on-failure' and screenshot: 'only-on-failure', but those options apply only to the built-in context/page fixtures. Almost every spec drives pages from newUserPage/newContext, which call browser.newContext() directly. When such a test fails in CI, the uploaded e2e-results artifact has no trace and no screenshot for the page that actually failed, so the config gives false assurance. The same specs mostly close the context only on the happy path (no try/finally), so a failing test leaks contexts and the single shared worker/browser keeps them.
- **Fix:** Build contexts through the test fixtures instead of browser.newContext: add a fixture in helpers (test.extend) that creates contexts, starts tracing (context.tracing.start) and, on testInfo.status !== expected, saves trace and screenshots to testInfo.outputPath, and always closes the contexts in teardown. Specs then drop their manual context.close() calls.
- **Evidence:** helpers.ts newContext() calls browser.newContext({baseURL, viewport,...}) and never starts tracing; 14 spec files use newUserPage; only session-expiry.spec.ts wraps the body in try/finally.
- **Decision:** [x] fix · [ ] skip · [ ] later

### TEST-10: Unsaved-text safety e2e gaps: session expiry to login to restore, logout failure, restored notice, conflict server check, step-photo retry

- **Area / category / size:** frontend-tests-e2e · tests · M · behaviour unchanged
- **Where:** `e2e/tests/unsaved-safety.spec.ts:1`, `e2e/tests/unsaved-safety.spec.ts:75`, `e2e/tests/session-expiry.spec.ts:1`
- **Problem:** The unsaved-backup feature is the app's data-loss defence but its e2e covers only offline-then-online, close tab, cover-photo retry and a conflict. Not covered end to end: session expiry while an edit is pending then re-login restoring it (session-expiry.spec only edits the profile form), logout with a failed save, the 'restored' notice after reopening, and a step-photo retry (cover only). The conflict spec never checks that device one's text is on the server before Load latest, and saved() right after goto can match a stale 'Saved' so the reload assertion carries the proof.
- **Fix:** Add a session-expiry spec on the editor (clear SESSION cookie, type, log in via next, expect text restored and saved), assert the server text in the conflict test with an expect.poll on GET /api/recipes/{id}, and parametrise the retry spec over cover and step slot.
- **Evidence:** unsaved-safety.spec.ts has 4 tests (offline, close tab, retry cover, conflict); no test touches the logout failure path or /login?next with an open editor.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Unsaved-text backup Missing e2e; Unsaved-safety e2e
- **Decision:** [x] fix · [ ] skip · [ ] later

## Low (72)

### CONC-2: Orphan cleanup and account deletion take the recipe and media locks in opposite order

- **Area / category / size:** backend-domain · concurrency · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/recipe/OrphanMediaCleanup.java:83`, `backend/src/main/java/com/ricettine/account/AccountService.java:180`, `backend/src/main/java/com/ricettine/media/MediaService.java:121`
- **Problem:** Cleanup: SELECT recipe FOR UPDATE, then delete the media row. Account deletion: deleteAllOwnedBy deletes the media rows first, then the user delete cascades to the recipe rows. Deleting an account while one of its orphan photos is being cleaned is a lock cycle; Postgres aborts one side. Cleanup logs and retries next hour, but the account deletion can fail with 500. Very rare (needs an orphan older than 24 h at that instant). The same job also stops a run after a whole batch of 500 failing heads (no keyset paging), so later orphans can starve.
- **Fix:** Make the cleanup lock the recipe row with FOR UPDATE SKIP LOCKED (skip and retry next run), or have account deletion lock the user's recipes first. Optionally page by (created_at, id) so failing heads do not block the rest.
- **Evidence:** Lock order read from the three call sites; not reproduced.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Small cleanups / Orphan-cleanup job
- **Decision:** [ ] fix · [ ] skip · [x] later

### CONC-3: lockAdmins has no ORDER BY and there is no last-admin concurrency test

- **Area / category / size:** backend-security · concurrency · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/account/UserRepository.java:18`, `backend/src/main/java/com/ricettine/account/AccountService.java:119`, `backend/src/main/java/com/ricettine/account/AccountService.java:175`
- **Problem:** Two transactions taking FOR UPDATE locks on the admin rows in different physical orders can deadlock, and the loser gets a 500. The last-admin guard depends on these locks, but no test runs two demotions or deletions concurrently.
- **Fix:** Add `order by u.id` to the query. Add an IT that demotes two admins (or deletes both) concurrently and asserts exactly one 409 last_admin.
- **Evidence:** Read at AUDIT_SHA. AdminRoleIT has only sequential cases.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / lockAdmins has no ORDER BY
- **Decision:** [ ] fix · [ ] skip · [x] later

### CONC-4: PageTitle can be set after the user already left the page

- **Area / category / size:** frontend-app · concurrency · S · changes behaviour
- **Where:** `frontend/src/app/profile/profile.page.ts:107`, `frontend/src/app/cookbooks/view/cookbook-view.page.ts:93`, `frontend/src/app/recipes/view/recipe-view.page.ts:179`, `frontend/src/app/core/page-title.ts:60`
- **Problem:** Each page awaits its API call and then calls PageTitle.set(name). If the user navigated away first, updateTitle() has already reset `dynamic`, and the late set() writes the previous page's name into the next page's tab title (until the next navigation).
- **Fix:** Give PageTitle.set an owner check (pass the page's ActivatedRouteSnapshot, ignore if it is no longer the primary leaf) or have the pages skip set() once their DestroyRef fired. One shared fix in PageTitle covers all three.
- **Evidence:** Code read: no destroyed guard in any of the three load() methods; AppTitleStrategy.updateTitle clears `dynamic` on each navigation.
- **Follow-up:** docs/superpowers/plans/2026-11-05-plan-4-followups.md: Feed and profile / If someone leaves /u/x before the response arrives ...
- **Decision:** [ ] fix · [ ] skip · [x] later

### CONS-2: Recipe and cookbook validators duplicate helpers and count length differently

- **Area / category / size:** backend-domain · consistency · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeValidator.java:45`, `backend/src/main/java/com/ricettine/recipe/RecipeValidator.java:61`, `backend/src/main/java/com/ricettine/recipe/RecipeValidator.java:138`, `backend/src/main/java/com/ricettine/cookbook/CookbookValidator.java:25`, `backend/src/main/java/com/ricettine/cookbook/CookbookValidator.java:33`, `backend/src/main/java/com/ricettine/cookbook/CookbookValidator.java:59`
- **Problem:** clean() and isVisibility() are copied between the two validators. CookbookValidator counts code points; RecipeValidator uses String.length() (UTF-16 units) in seven places. Result: an emoji-heavy recipe title is limited to 100 emoji while a cookbook name allows 100 characters, and a native client with a code-point string model sees different limits. Never exceeds the DB varchar (units >= code points), so no overflow.
- **Fix:** Move clean(), a codePoints(String) length helper and an enum check (Visibility.parse) into common/ or Visibility itself; use code points in RecipeValidator and update its tests.
- **Evidence:** Read both files.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Before a native Android client / UTF-16 vs code points
- **Decision:** [ ] fix · [ ] skip · [x] later

### CONS-3: RecipeRef lives in the cookbook package, creating a recipe to cookbook to recipe cycle; empty shareToken accepted

- **Area / category / size:** backend-domain · consistency · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/cookbook/CookbookDtos.java:50`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:8`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:218`
- **Problem:** recipe.RecipeService imports cookbook.CookbookDtos.RecipeRef while cookbook depends on recipe, so the two packages depend on each other. Separately, resolveAddable cleans shareToken, so {recipeId, shareToken: ""} is treated as id-only instead of 400 'exactly one'; clients cannot rely on the documented contract.
- **Fix:** Move RecipeRef (and resolveAddable's contract) into the recipe package; test non-null shareToken as set (blank token is invalid, not absent).
- **Evidence:** Code read.
- **Follow-up:** 2026-11-04-plan-3-followups.md: Before a native Android client / RecipeRef package cycle, shareToken "" accepted
- **Decision:** [x] fix · [ ] skip · [ ] later

### CONS-4: Token expiry mixes the JVM clock with the database now(); the Clock bean is ignored

- **Area / category / size:** backend-security · consistency · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/auth/PasswordResetService.java:48`, `backend/src/main/java/com/ricettine/invite/InviteService.java:44`, `backend/src/main/java/com/ricettine/common/OneTimeToken.java:47`, `backend/src/main/java/com/ricettine/account/User.java:39`, `backend/src/main/java/com/ricettine/setup/SetupService.java:37`, `backend/src/main/java/com/ricettine/common/OneTimeTokenRepository.java:14`
- **Problem:** expires_at is computed with Instant.now() in Java but checked against Postgres now(). BeansConfig defines a Clock (used only by RateLimits), so expiry tests have to edit rows directly, and app/DB clock skew shifts token lifetimes.
- **Fix:** Inject Clock into PasswordResetService and InviteService (and the entity constructors or factories), and pass `:now` from the Clock into the active/claim queries. Alternatively, compute expires_at in SQL (`now() + interval`). Pick one source.
- **Evidence:** Read at AUDIT_SHA.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / app clock vs DB now() for expires_at
- **Decision:** [ ] fix · [ ] skip · [x] later

### CONS-5: Fully qualified names, unsorted imports and deprecated APIs in the platform classes

- **Area / category / size:** backend-security · consistency · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/common/ApiException.java:12`, `backend/src/main/java/com/ricettine/common/ApiException.java:28`, `backend/src/main/java/com/ricettine/common/ApiException.java:34`, `backend/src/main/java/com/ricettine/config/BeansConfig.java:3`, `backend/src/main/java/com/ricettine/config/BeansConfig.java:34`, `backend/src/main/java/com/ricettine/common/ProblemAdvice.java:26`, `backend/src/main/java/com/ricettine/common/ProblemAdvice.java:74`, `backend/src/main/java/com/ricettine/common/ProblemAdvice.java:76`, `backend/src/main/java/com/ricettine/common/ProblemAdvice.java:95`, `backend/src/main/java/com/ricettine/config/SecurityConfig.java:67`, `backend/src/main/java/com/ricettine/common/RateLimits.java:131`, `backend/src/main/java/com/ricettine/auth/AppUserDetailsService.java:41`
- **Problem:** Inline FQNs (java.time.Duration even though it's imported in BeansConfig, LinkedHashMap, org.slf4j.Logger, MaxUploadSizeExceededException, java.io.IOException, java.net.InetAddress, Spring's User) and unsorted imports in BeansConfig make these classes look unfinished. javac -Xlint also reports HttpStatus.PAYLOAD_TOO_LARGE (deprecated, now CONTENT_TOO_LARGE) and org.springframework.lang.Nullable (deprecated in favour of JSpecify).
- **Fix:** Replace the FQNs with imports (alias Spring's User by importing User.withUsername statically or keep one FQN with a comment), sort the imports, use HttpStatus.CONTENT_TOO_LARGE and org.jspecify.annotations.Nullable.
- **Evidence:** Read at AUDIT_SHA, plus javac -Xlint:all output from the input pack.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Small cleanups / Fully qualified names; import order in BeansConfig
- **Decision:** [x] fix · [ ] skip · [ ] later

### CONS-6: Two fieldErrorKey functions map the same server codes to two parallel i18n key sets

- **Area / category / size:** frontend-app · consistency · S · behaviour unchanged
- **Where:** `frontend/src/app/recipes/editor/recipe-editor.page.ts:25`, `frontend/src/app/core/api-error.ts:76`, `frontend/public/i18n/en.json:1`
- **Problem:** core/api-error.ts maps field codes to errors.field.*; recipe-editor.page.ts defines another exported fieldErrorKey with its own code list mapping to editor.field.*. Two lookups, two key trees with overlapping meaning, and the editor one is exported but used only in that file.
- **Fix:** Extend errors.field.* with out_of_range/too_many/invalid_unit, use the single function, delete editor.field.* keys and the local copy.
- **Evidence:** Both functions read; the editor copy has no other importer.
- **Decision:** [x] fix · [ ] skip · [ ] later

### CONS-7: Inconsistent fake-timer cleanup and heavy 'as unknown as' casts in specs

- **Area / category / size:** frontend-tests-e2e · consistency · S · behaviour unchanged
- **Where:** `frontend/src/app/recipes/editor/photos.spec.ts:209`, `frontend/src/app/core/auth.store.spec.ts:73`, `frontend/src/app/recipes/editor/editor-store.spec.ts:297`, `frontend/src/app/recipes/editor/editor-store.testing.ts:44`
- **Problem:** Fake timers are restored via afterEach in some files and via try/finally in individual tests in others (photos.spec, auth.store.spec); a future test added without the finally would leak fake timers into later tests in the file. fakeEditorStore returns an object cast with 'as unknown as EditorStore', so adding a member the components start using gives runtime undefined rather than a compile error in the specs.
- **Fix:** Use one pattern: afterEach(() => vi.useRealTimers()) in every file that fakes timers. Type fakeEditorStore with Pick<EditorStore, ...> of the members it provides so missing members fail to compile.
- **Evidence:** grep useFakeTimers/useRealTimers: 4 files use afterEach, 2 files use try/finally per test.
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-2: Photo cap is checked outside the lock and can be overshot

- **Area / category / size:** backend-domain · correctness · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeService.java:108`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:119`, `backend/src/main/java/com/ricettine/recipe/RecipePhotoController.java:44`
- **Problem:** requirePhotoRoom counts in its own read-only transaction before decode; addPhoto holds only a shared lock, so concurrent uploads that all passed the check each insert. The cap of 150 can be exceeded by the number of in-flight uploads (bounded by the 60/10 min upload limit and the processing limiter). Nothing breaks, but the 'cap' is soft and the Javadoc does not say so.
- **Fix:** Re-check countByRecipeId inside addPhoto after taking the lock (cheap, closes most of the gap), and document that the cap is approximate, or take the write lock for exactness.
- **Evidence:** Code read.
- **Follow-up:** 2026-11-07-plan-5-followups.md: Plan 6 / Photo cap
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-3: Session stays logged in for at most 30 days from login even though the server timeout slides

- **Area / category / size:** backend-security · correctness · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/config/BeansConfig.java:34`, `backend/src/main/resources/application.yml:30`
- **Problem:** The SESSION cookie gets Max-Age=30d only when it is first written. Spring Session never rewrites it for an unchanged id, but the server-side timeout slides. Active users are therefore signed out exactly 30 days after login, which looks random to them.
- **Fix:** Pick one model. For a sliding session, drop setCookieMaxAge (browser-session cookie) or rewrite the cookie on activity via a custom HttpSessionIdResolver. For an absolute one, drop the sliding timeout and document it.
- **Evidence:** DefaultCookieSerializer is configured once, and SessionRepositoryFilter writes the cookie only when the id changes.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / 30-day session cookie
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-4: HEAD on SPA paths returns 401 for anonymous users

- **Area / category / size:** backend-security · correctness · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/config/SecurityConfig.java:35`
- **Problem:** The SPA permit matcher is GET-only, so HEAD /login (uptime monitors, link checkers) falls through to anyRequest().authenticated() and gets 401.
- **Fix:** Allow HEAD as well, either with a second regexMatcher(HttpMethod.HEAD, …) or with a method-agnostic matcher combined with the GET/HEAD check. Add a case to SpaFallbackIT.
- **Evidence:** Throwaway IT: HEAD /login returned 401.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / HEAD requests on SPA paths
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-5: Revoking a used or expired instance invite returns 204 and marks it revoked

- **Area / category / size:** backend-security · correctness · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/common/OneTimeTokenRepository.java:22`, `backend/src/main/java/com/ricettine/invite/InviteService.java:54`
- **Problem:** revoke() checks only revoked_at, so revoking a used or expired invite succeeds. revokeForCookbook (line 36) also requires used_at is null and expires_at > now(), so the two revoke paths behave differently.
- **Fix:** Add `and used_at is null and expires_at > now()` to revoke(). It then returns 404 like the cookbook path. Add an InviteIT case.
- **Evidence:** Read at AUDIT_SHA.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Revoking an already-used invite returns 204
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-6: Keep-screen-on leaks a wake-lock sentinel on a quick check, uncheck, check

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/view/keep-screen-on.component.ts:55`, `frontend/src/app/recipes/view/keep-screen-on.component.ts:44`
- **Problem:** acquire() awaits navigator.wakeLock.request() and then only tests `this.checked()`. With request #1 pending, unchecking and checking again starts request #2; both resolve with checked()=true, the second overwrites `this.sentinel` and the first is never released. Unchecking later releases only one; the screen stays on until the tab is hidden.
- **Fix:** Track the in-flight request (a token/counter) and discard a result whose token is stale, or release the previous sentinel before assigning the new one.
- **Evidence:** Code read of acquire(); no in-flight tracking.
- **Follow-up:** docs/superpowers/plans/2026-11-05-plan-4-followups.md: Recipe page / KeepScreenOnComponent
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-7: displayAmount: scaled kg/l can show 0, and unscaled amounts are snapped despite the documented 'exactly what the author wrote'

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/amount.ts:60`, `frontend/src/app/recipes/amount.ts:64`, `frontend/src/app/recipes/amount.ts:66`
- **Problem:** Scaled kg/l use num(n, 2): 0.004 kg renders '0'. For other units the 0.01 tolerance in `Math.abs(value - frac) > 0.01` makes an author-typed 0.34 show as ⅓, 0.005 tsp as ⅛, and 1.005 as 1, contradicting the function's own doc comment ('Unscaled values are exactly what the author wrote').
- **Fix:** Clamp scaled kg/l to a minimum of 0.01 (as g/ml already clamp 0.1). For unscaled values use a tiny epsilon (1e-9) for the fraction match, else num(n, 3). Add specs for those inputs.
- **Evidence:** Traced displayAmount for (0.004,'kg',scaled), (0.34,null,unscaled), (0.005,'tsp',unscaled).
- **Follow-up:** docs/superpowers/plans/2026-11-05-plan-4-followups.md: Recipe page / displayAmount
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-8: Deleting a recipe with a failed upload still asks 'Leave without this photo?'

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/editor/editor-store.ts:566`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:242`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:358`
- **Problem:** store.remove() and removeIfUntouched() leave `_uploads` untouched. After a confirmed delete, navigateByUrl('/recipes') runs leaveEditorGuard -> canLeave(): uploadsUnfinished() is still true for a failed upload that kept its file, so the user is asked about a photo of a recipe that no longer exists. Logout with an in-flight upload drops the photo without any question (same follow-up).
- **Fix:** Clear the uploads (and revoke previews) in remove()/removeIfUntouched() on success, or set a `leaving` flag that canLeave() honours.
- **Evidence:** Code read: remove() only suspends/disposes autosave and clears the backup.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / Logout with a failed or in-flight upload ...
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-9: Phone step photos force the camera and the bottom-bar photo logic disagrees with itself

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/editor/steps-editor.component.ts:37`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:164`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:251`
- **Problem:** Every step's photo-slot and the bottom bar set `capture=environment`, which on Android Chrome opens the camera directly with no gallery choice, so an existing photo cannot be attached to a step. With zero steps, attachPhoto() adds a step and uploads to step 0, but a refused file is reported on the cover slot (rejectBarPhoto).
- **Fix:** Drop `capture` from the step slots (keep one explicit camera button if wanted); in rejectBarPhoto report on the step attachPhoto would create.
- **Evidence:** Code read; capture attribute bound from [capture]="true" in both places.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Photos / Every step picker uses `capture`; With zero steps, the bar photo error shows on the cover slot
- **Decision:** [ ] fix · [ ] skip · [x] later

### COR-10: New-recipe page is not cancelled on destroy and Retry can create a second draft

- **Area / category / size:** frontend-app · correctness · S · changes behaviour
- **Where:** `frontend/src/app/recipes/new-recipe.page.ts:29`, `frontend/src/app/recipes/new-recipe.page.ts:33`
- **Problem:** start() fires from the constructor. If the user navigates away before the POST returns, the late navigateByUrl pulls them into the new draft's editor; and an empty draft is left behind. Retry after a lost response creates another draft.
- **Fix:** Keep a destroyed flag (DestroyRef) and skip the navigation when set; the leftover empty draft is already cleaned by Done/orphan rules. The idempotency key for retries stays a native-client item.
- **Evidence:** Code read.
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor state and input handling (new-recipe start() not cancelled)
- **Decision:** [ ] fix · [ ] skip · [x] later

### DATA-4: Recipe delete is never version-checked by the only client

- **Area / category / size:** backend-domain · data-loss · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeController.java:69`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:234`, `frontend/src/app/recipes/recipe.api.ts:28`
- **Problem:** The version parameter on DELETE is optional and the web client's remove() never sends it. The editor auto-deletes an empty draft on Done; if another tab or device saved content to that draft in between, the delete removes it silently. Needs two clients on one draft, so rare.
- **Fix:** Make version required on DELETE (400 like publish/reset do) and send it from RecipeApi.remove; the delete already does the 409 check when given.
- **Evidence:** Code read of both ends.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Before a native Android client / DELETE version optional race
- **Decision:** [ ] fix · [ ] skip · [x] later

### DATA-5: Outstanding invites and reset links die silently when the admin who created them deletes their account

- **Area / category / size:** backend-security · data-loss · S · changes behaviour
- **Where:** `backend/src/main/resources/db/migration/V2__users_and_tokens.sql:19`
- **Problem:** one_time_token.created_by is ON DELETE CASCADE, so links an admin already handed out stop working with no notice once that admin leaves.
- **Fix:** New migration: change the FK to ON DELETE SET NULL (the column is already nullable). Add an AccountDeletionIT case.
- **Evidence:** Read at AUDIT_SHA.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / one_time_token.created_by ON DELETE CASCADE
- **Decision:** [ ] fix · [ ] skip · [x] later

### DEAD-1: RateLimiter.check() and hit() are used only by tests

- **Area / category / size:** backend-security · dead-code · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/common/RateLimiter.java:45`, `backend/src/main/java/com/ricettine/common/RateLimiter.java:83`
- **Problem:** Production code only calls tryHit, refund and clear. check() and hit() (jscpd flags hit as a clone of tryHit) are dead weight in a security class and are what RateLimiterTest mostly tests, so the paths production actually uses get less test coverage.
- **Fix:** Delete check() and hit() and rewrite RateLimiterTest against tryHit/refund/clear.
- **Evidence:** grep '\.(check|hit)\(' finds only RateLimiterTest.
- **Decision:** [x] fix (PR A) · [ ] skip · [ ] later

### DEAD-2: Dead code: six unused i18n keys and ~30 exports nothing imports

- **Area / category / size:** frontend-app · dead-code · S · behaviour unchanged
- **Where:** `frontend/public/i18n/en.json:12`, `frontend/public/i18n/en.json:55`, `frontend/public/i18n/en.json:58`, `frontend/public/i18n/en.json:67`, `frontend/public/i18n/en.json:97`, `frontend/public/i18n/en.json:326`, `frontend/src/app/recipes/editor/autosave.ts:7`, `frontend/src/app/recipes/editor/ingredients-editor.component.ts:9`, `frontend/src/app/recipes/editor/recipe-editor.page.ts:23`, `frontend/src/app/recipes/editor/time-sheet.component.ts:10`, `frontend/src/app/auth/account-form.component.ts:13`, `frontend/src/app/core/i18n.config.ts:8`, `frontend/src/app/recipes/editor/editor-sheet.ts:7`
- **Problem:** Verified by a script (verbatim and dynamic-prefix check): common.logout, auth.loggingIn, auth.creating, settings.title, admin.createdOn and editor.details are never referenced. The knip exports (AUTOSAVE_*, MAX_* in five editor files, MIN/MAX_PORTIONS, TIME_PRESETS, DESKTOP_QUERY, isDesktop, reservedUsername, notBlank, maxTrimmed, HttpTranslocoLoader, translocoConfig, isWebUrl, RemoveMemberData, AutosaveDeps/Options, PhotoUpload, ServerIngredient) are not imported by any file, specs included, so `export` is noise. The MAX_* limits are also scattered over five component files and hand-mirrored from the backend validator (values match today).
- **Fix:** Delete the six keys; drop `export` on the unused symbols; move the recipe limits into one recipe-limits.ts next to recipe.model.ts with a comment pointing at RecipeValidator.
- **Evidence:** Script over en.json vs src; grep -rlw per symbol found only the defining file.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend (unused i18n keys)
- **Decision:** [x] fix · [ ] skip · [ ] later

### DEP-1: Prettier is installed and configured but never run; 122 files fail its own check

- **Area / category / size:** frontend-app · dependencies · S · behaviour unchanged
- **Where:** `frontend/package.json:30`, `frontend/.prettierrc:1`, `frontend/src/app/app.routes.ts:68`
- **Problem:** `prettier` is a devDependency with a .prettierrc (printWidth 100), but there is no npm script and no CI step. `npx prettier --check` reports 122 files, e.g. the 140-char cookbooks/:id route (known follow-up) and many 150+ char template lines. A reviewer sees a formatter configuration the code visibly ignores.
- **Fix:** Either run `prettier --write` once, add `format:check` to package.json and the CI frontend job, or remove prettier and .prettierrc. (The infra-check script is the natural home for the check.)
- **Evidence:** npx prettier --check "src/**/*.{ts,scss,html}" -> 122 files with issues; grep of .github, scripts, CLAUDE.md shows no use.
- **Follow-up:** docs/superpowers/plans/2026-11-05-plan-4-followups.md: Small cleanups / app.routes.ts has a long single-line entry
- **Decision:** [x] fix · [ ] skip · [ ] later

### DEP-2: Base and service images use mutable tags; the AWS host defaults to `latest`

- **Area / category / size:** ops · dependencies · S · changes behaviour
- **Where:** `Dockerfile:4`, `Dockerfile:12`, `Dockerfile:23`, `compose.yaml:3`, `compose.yaml:18`, `compose.https.yaml:5`, `compose.aws.yaml:7`, `infra/terraform/variables.tf:46`
- **Problem:** node:24-alpine, eclipse-temurin:25-jdk/jre, postgres:17-alpine and caddy:2.10-alpine are floating tags, so builds are not reproducible, and start.sh `docker compose pull` picks up new upstream images on every restart. image_tag defaults to `latest`, so a replacement host (`-replace=aws_instance.main`) can jump app versions, and with them schema migrations, without anyone deciding to.
- **Fix:** Pin the base images by digest (`image@sha256:…  # tag`), with Dependabot `docker` ecosystem updates. Make `image_tag` a required variable, or default it to a released semver.
- **Evidence:** Tags as listed. variables.tf:49 `default = "latest"`.
- **Decision:** [ ] fix · [ ] skip · [x] later

### DOC-1: frontend/README.md and .vscode are Angular scaffolding that no longer match the project

- **Area / category / size:** frontend-app · docs · S · behaviour unchanged
- **Where:** `frontend/README.md:1`, `frontend/README.md:44`, `frontend/.vscode/launch.json:12`
- **Problem:** The README is the CLI template (mentions `ng e2e`, which does not exist; browser e2e is Playwright in /e2e); launch.json still debugs tests at the Karma URL localhost:9876 although unit tests run on Vitest.
- **Fix:** Replace the README with a short project one (dev, test, build, i18n, link to e2e) or delete it; remove the Karma launch entry.
- **Evidence:** Read both files.
- **Decision:** [x] fix · [ ] skip · [ ] later

### DOC-2: example.tfvars documents wrong defaults and omits variables

- **Area / category / size:** ops · docs · S · behaviour unchanged
- **Where:** `infra/terraform/example.tfvars:12`, `infra/terraform/variables.tf:60`, `infra/terraform/variables.tf:40`, `infra/terraform/variables.tf:17`
- **Problem:** The comment says `monthly_budget_usd = 10`, but the default is 25 (and the tftest asserts 25). backup_retention_days and origin_subdomain are missing from the 'Optional, with their defaults' list.
- **Fix:** Change it to 25 and add `# backup_retention_days = 30` and `# origin_subdomain = "origin"`.
- **Evidence:** example.tfvars:12 vs variables.tf:60.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Small cleanups / example.tfvars comment
- **Decision:** [x] fix (PR E)

### DOC-3: CLAUDE.md package list and command list are stale; README repeats its test commands

- **Area / category / size:** ops · docs · S · behaviour unchanged
- **Where:** `CLAUDE.md:6`, `CLAUDE.md:9`, `CLAUDE.md:16`, `README.md:90`, `README.md:105`
- **Problem:** CLAUDE.md lists packages `account, admin, auth, invite, media, recipe, setup, config, common` but backend has cookbook, feed and profile too. Its scripts line names only e2e.sh and smoke.sh, and the commands omit backup-restore-check.sh and aws-verify.sh. README's Development and Tests sections both list the backend command, and neither mentions the backup drill alongside the other checks.
- **Fix:** Update the package list (account, admin, auth, common, config, cookbook, feed, invite, media, profile, recipe, setup), list all scripts in CLAUDE.md, and merge README's Development/Tests into one section that lists every check and says which run in CI.
- **Evidence:** `ls backend/src/main/java/com/ricettine/` shows 12 packages.
- **Follow-up:** Input pack: Docs / CLAUDE.md package list
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-6: Malformed-UUID try/catch repeated six times

- **Area / category / size:** backend-domain · duplication · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeController.java:76`, `backend/src/main/java/com/ricettine/cookbook/CookbookController.java:75`, `backend/src/main/java/com/ricettine/cookbook/CookbookController.java:91`, `backend/src/main/java/com/ricettine/cookbook/CookbookInviteController.java:42`, `backend/src/main/java/com/ricettine/cookbook/CookbookMemberController.java:27`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:255`
- **Problem:** Each copy parses a UUID and maps failure to a 404 (some also run requireMember first to keep 404-vs-403 behaviour). Six near-identical blocks, and the ordering rule (permission check before malformed-id answer) lives in comments.
- **Fix:** One helper, e.g. Ids.parse(String, String code) in common, returning a UUID or throwing the given 404; keep the requireMember-first calls explicit at the three call sites.
- **Evidence:** Read all six sites.
- **Follow-up:** 2026-11-04-plan-3-followups.md: Small cleanups / malformed-UUID try/catch
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-7: Constant-time token compare after an equality DB lookup, copied four times

- **Area / category / size:** backend-domain · duplication · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeMediaAccessPolicy.java:50`, `backend/src/main/java/com/ricettine/cookbook/CookbookMediaAccessPolicy.java:56`, `backend/src/main/java/com/ricettine/cookbook/CookbookRecipeReadGrant.java:26`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:268`
- **Problem:** Every site finds the row with WHERE share_token = ? (an index lookup, not constant time) and then compares the same token again with MessageDigest.isEqual. The second compare adds nothing and the UTF-8/MessageDigest boilerplate is copied four times. Tokens are 256-bit, so timing is not exploitable, but a reviewer will ask why the check exists. PublicRecipeController's lookup does not do it, so the code is also inconsistent.
- **Fix:** Delete the redundant compares (the lookup is the check), or extract one Tokens.matches(a, b) and use it everywhere including recipes. Prefer deleting.
- **Evidence:** Read the four sites and RecipeRepository.findByShareTokenAndStatus.
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-8: Duplicated static/index.html lookup

- **Area / category / size:** backend-security · duplication · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/config/SpaWebConfig.java:39`, `backend/src/main/java/com/ricettine/config/SpaIndexController.java:17`
- **Problem:** The classpath location of index.html is hard-coded twice, once in the resource resolver and once in the root controller.
- **Fix:** Add one `static final String INDEX = "static/index.html"` (or a shared Resource) in SpaWebConfig and use it in both places.
- **Evidence:** grep 'static/index.html'.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Duplicated static/index.html constant
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-9: Oversized-upload 413 contract tested twice over real HTTP with two different hand-rolled clients

- **Area / category / size:** backend-tests · duplication · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/account/AvatarUploadLimitIT.java:47`, `backend/src/test/java/com/ricettine/media/UploadTooLargeIT.java:54`, `backend/src/test/java/com/ricettine/auth/CsrfIT.java:21`, `backend/src/test/java/com/ricettine/auth/LogoutCsrfIT.java:47`
- **Problem:** AvatarUploadLimitIT (JDK HttpClient, 15 MB + 1 KB) and UploadTooLargeIT.oversizeUploadIs413 (Spring RestClient, 16 MB + 1) both assert that an oversized avatar PUT returns 413 with code file_too_large. Each re-implements the XSRF-cookie fetch, login and cookie parsing (cookieValue exists in three variants, lastCookie in a fourth), using two different HTTP client APIs. It costs about 30 MB of allocation per run twice and two places to update.
- **Fix:** Keep one of them (UploadTooLargeIT also covers the spool-directory case), delete AvatarUploadLimitIT or fold its blob-count assertion in, and extract a shared 'RealHttpSession' helper (bootstrap XSRF, login, send with cookies) for the four real-HTTP ITs.
- **Evidence:** Read both classes; same endpoint, same expectation, different client.
- **Decision:** [ ] fix · [ ] skip · [x] later

### DUP-10: Concurrency harness (latch + pool + collect statuses) repeated 7 times, some without finally-shutdown

- **Area / category / size:** backend-tests · duplication · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/recipe/RecipeApiIT.java:175`, `backend/src/test/java/com/ricettine/recipe/RecipeApiIT.java:204`, `backend/src/test/java/com/ricettine/setup/SetupIT.java:65`, `backend/src/test/java/com/ricettine/invite/InviteIT.java:101`, `backend/src/test/java/com/ricettine/cookbook/CookbookInviteIT.java:51`, `backend/src/test/java/com/ricettine/auth/IpRateLimitIT.java:96`, `backend/src/test/java/com/ricettine/common/RateLimiterTest.java:106`
- **Problem:** Each test builds an ExecutorService, a start latch and a list of Futures by hand. RecipeApiIT.concurrentSavesNeverProduce500 and concurrentSavesOfPopulatedRecipeGiveOne200AndOne409 are the same loop with a different setup (20+ line clone). SetupIT, IpRateLimitIT and RateLimiterTest call pool.shutdown() after the assertions rather than in finally, so a failing assertion or an exception from f.get() leaks threads into the rest of the suite.
- **Fix:** Add a tiny helper, e.g. Concurrent.race(int n, IntFunction<Callable<T>> task) returning List<T>, which owns the pool, the latch and the try/finally shutdownNow. Merge the two RecipeApiIT concurrency tests into one parameterised by the prior number of saves.
- **Evidence:** Read all seven; pattern identical.
- **Decision:** [x] fix (PR F)

### DUP-11: ImageProcessorTest: six near-identical orientation tests

- **Area / category / size:** backend-tests · duplication · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:63`, `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:76`, `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:88`, `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:179`, `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:191`
- **Problem:** Orientations 2, 3, 5, 7, 8 each repeat decode(process(jpegWithExif(400,300,n))) followed by width/height and two colour probes (the jscpd clones inside this file). Orientation 4 (vertical flip, implemented at ImageProcessor.java:285) has no test at all, which this repetition makes easy to miss.
- **Fix:** One @ParameterizedTest over (orientation, expectedWidth, expectedHeight, topLeftIsRed, ...) rows for 2-8, including 4.
- **Evidence:** ImageProcessor.orient() has case 2..8; tests cover 2,3,5,6,7,8.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Still open from Plan 1 (orientations 5/7; now done, 4 never covered)
- **Decision:** [ ] fix · [ ] skip · [x] later

### DUP-12: Admin tab navigation and invite create/revoke logic are copied between pages

- **Area / category / size:** frontend-app · duplication · S · behaviour unchanged
- **Where:** `frontend/src/app/admin/invites.page.ts:21`, `frontend/src/app/admin/users.page.ts:21`, `frontend/src/app/admin/invites.page.ts:64`, `frontend/src/app/cookbooks/members-panel.component.ts:126`
- **Problem:** The `<h1>` + tabs nav block is pasted into both admin pages; the create-invite/list/revoke signal logic (jscpd: 10 lines) is duplicated between InvitesPage and MembersPanelComponent. profile.page/cookbook-view.page load() and reset-password/setup submit() are also clones.
- **Fix:** A tiny AdminTabsComponent (or an AdminLayout route with child routes) for the nav; an InviteList helper (or reuse one component with an input for the endpoint) for the invite handling.
- **Evidence:** jscpd clones listed in the input pack, confirmed by reading.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend (duplicated admin tab nav)
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-13: Frontend spec boilerplate repeated across specs (btn, overlay, person, mount providers, overlay cleanup)

- **Area / category / size:** frontend-tests-e2e · duplication · S · behaviour unchanged
- **Where:** `frontend/src/app/cookbooks/cookbook.page.spec.ts:32`, `frontend/src/app/cookbooks/members-panel.component.spec.ts:31`, `frontend/src/app/cookbooks/cookbook-share-panel.component.spec.ts:26`, `frontend/src/app/cookbooks/accept-invite.page.spec.ts:23`, `frontend/src/app/recipes/editor/share-panel.component.spec.ts:24`, `frontend/src/app/cookbooks/view/cookbook-view.page.spec.ts:11`, `frontend/src/app/auth/register.page.spec.ts:78`, `frontend/src/app/auth/setup.page.spec.ts:18`, `frontend/src/app/recipes/editor/editor-store.spec.ts:225`, `frontend/src/app/recipes/editor/autosave.spec.ts:5`, `frontend/src/app/shell/shell.component.spec.ts:35`
- **Problem:** Five specs each define the same btn(root, text) query and overlay() lookup and the same afterEach that empties .cdk-overlay-container; person() is defined three times; register/setup/delete-account page specs repeat the same form-fill blocks (12-line clone); autosave.spec duplicates a block already in editor-store.testing.ts. A change in how buttons or overlays render touches each copy, and the copies already differ slightly (btn matches aria-label in some, not in others).
- **Fix:** Add src/app/testing/dom.ts with btn, overlay, clearOverlays and a fillForm helper, export person() fixtures from one place, and import them. Move settle() out of testing/transloco.ts into the same dom helper file.
- **Evidence:** jscpd: members-panel/cookbook.page 8 lines, cookbook-share-panel/share-panel 8, register/setup 12; grep '^const btn' hits 5 spec files.
- **Decision:** [x] fix · [ ] skip · [ ] later

### DUP-14: AWS restore is a hand-copied version of restore.sh in the docs

- **Area / category / size:** ops · duplication · S · behaviour unchanged
- **Where:** `docs/deploy-aws.md:139`, `docs/deploy-aws.md:150`, `infra/terraform/templates/cloud-init.yaml.tftpl:25`, `deploy/restore.sh:22`
- **Problem:** restore.sh is not installed on the host, so deploy-aws.md repeats its commands by hand without the input checks, the ERR message and the wait-for-healthy loop. The two copies will drift (the doc already lacks the health wait).
- **Fix:** Install deploy/restore.sh through cloud-init write_files (gzip leaves room) and reduce the doc to `sudo deploy/restore.sh /tmp/restore.dump`. Add it to the tftest round-trip map.
- **Evidence:** deploy-aws.md:139 'the restore script is not installed there, so these are its steps'.
- **Decision:** [ ] fix · [ ] skip · [x] later

### DUP-15: The two tftest files repeat about 110 lines of mocks and overrides

- **Area / category / size:** ops · duplication · S · behaviour unchanged
- **Where:** `infra/terraform/tests/core.tftest.hcl:4`, `infra/terraform/tests/core.tftest.hcl:121`, `infra/terraform/tests/edge.tftest.hcl:4`
- **Problem:** Both files declare the same mock providers, override_data and most override_resource blocks. Every new resource that needs a plan-time value has to be added twice.
- **Fix:** Move the shared overrides into `tests/mocks/aws.tfmock.hcl` (`mock_provider "aws" { source = "./tests/mocks" }`; .tfmock.hcl files accept override_* blocks) and keep only file-specific overrides inline.
- **Evidence:** `diff` of the first 125 lines shows only the header comment and a few ordering differences.
- **Decision:** [ ] fix · [ ] skip · [x] later

### ERR-2: Concurrent recipe delete during cookbook add surfaces as a 500

- **Area / category / size:** backend-domain · error-handling · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:192`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:202`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:234`, `backend/src/main/java/com/ricettine/common/ProblemAdvice.java:61`
- **Problem:** addRecipe resolves the recipe in resolveAddable (no lock) and then inserts the cookbook_entry. RecipeService.delete row-locks the recipe and deletes it. If the delete commits between resolve and insert (the insert's FK check blocks on the recipe row lock, then fails), the insert raises DataIntegrityViolationException. ProblemAdvice has no handler for it, so the client gets 500 internal_error instead of 404 recipe_not_found. Narrow window, no data loss.
- **Fix:** Catch DataIntegrityViolationException around the entry insert in addRecipe and rethrow ApiException 404 recipe_not_found, or take a share lock on the recipe row inside resolveAddable. Add a two-thread IT.
- **Evidence:** Read from code; locking order traced against V6 FKs (cookbook_entry.recipe_id ON DELETE CASCADE, no cookbook lock in RecipeService.delete). Not reproduced.
- **Decision:** [ ] fix · [ ] skip · [x] later

### ERR-3: No Retry after a failed load on some pages, inconsistent with the rest; a failed add leaves a created cookbook out of the list

- **Area / category / size:** frontend-app · error-handling · S · changes behaviour
- **Where:** `frontend/src/app/cookbooks/cookbook.page.ts:25`, `frontend/src/app/cookbooks/accept-invite.page.ts:16`, `frontend/src/app/cookbooks/accept-invite.page.ts:52`, `frontend/src/app/admin/invites.page.ts:56`, `frontend/src/app/admin/users.page.ts:89`, `frontend/src/app/cookbooks/add-to-cookbook.dialog.ts:111`
- **Problem:** Feed, profile, my recipes, my cookbooks, recipe view and cookbook view offer Retry on a failed load; the cookbook page, the accept-invite page (whose error even replaces the preview after a transient accept failure) and both admin pages do not, so a blip forces a manual reload. In the Add dialog's inline create, if the cookbook was created but addRecipe failed and the user cancels, the new cookbook is not added to the rows and the user may create a duplicate.
- **Fix:** Reuse the retry button pattern on those four pages; on accept failure keep the preview and show the error beside it; in add-to-cookbook createNew() push the row whenever state.made is set (state 'idle' if the add failed).
- **Evidence:** Templates read; only retry-capable pages bind (click)="load()".
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend (page load error has no Retry; accept page; inline create in Add dialog)
- **Decision:** [ ] fix · [ ] skip · [x] later

### ERR-4: Revoke and reset buttons have no in-flight guard; copy failure is silent

- **Area / category / size:** frontend-app · error-handling · S · changes behaviour
- **Where:** `frontend/src/app/admin/invites.page.ts:79`, `frontend/src/app/cookbooks/members-panel.component.ts:141`, `frontend/src/app/admin/users.page.ts:97`, `frontend/src/app/shared/copy-link.component.ts:44`
- **Problem:** A double click on Revoke sends two DELETEs; the second returns 404 and an error is shown for an action that succeeded. A double click on Reset password mints two links; the last response wins in the UI regardless of which token the server kept. copy() clears the 'Copied' state on failure without saying anything, so a denied clipboard looks like nothing happened.
- **Fix:** Track busy ids (a Set signal) and disable the row's button while its request runs; in copy() set a visible 'Copy failed, select the link' status.
- **Evidence:** Code read.
- **Follow-up:** docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend (revoke in-flight guard; copy failure feedback)
- **Decision:** [ ] fix · [ ] skip · [x] later

### ERR-5: backup.sh/restore.sh edge cases: stale header, partial S3 uploads, same-second collisions, silent media-delete failure

- **Area / category / size:** ops · error-handling · S · changes behaviour
- **Where:** `deploy/backup.sh:7`, `deploy/backup.sh:27`, `deploy/backup.sh:66`, `deploy/backup.sh:68`, `deploy/restore.sh:31`
- **Problem:** (1) The header says 'A failed run leaves no files behind', but in S3 mode a dump uploaded before a failed media upload stays in the bucket (README:79 admits this; the script header does not). (2) The STAMP has 1-second resolution, so two runs in the same second overwrite each other locally. (3) restore.sh runs `find /data/media -mindepth 1 -delete 2>/dev/null;` and ignores the exit code, so photos that could not be deleted survive and 'deleted' images come back, while the script reports success.
- **Fix:** (1) Fix the header comment, or upload the media archive first and the dump last so the dump marks a complete pair. (2) Refuse when the target name exists (`set -o noclobber` / check before mv). (3) Use `find … -delete && tar …` (no `;` and no stderr suppression) so a delete failure takes the existing 'media restore failed' branch.
- **Evidence:** Code as cited.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Backups (failed media delete, same-second names, header comment)
- **Decision:** [ ] fix · [ ] skip · [x] later

### OPS-3: Stale-session WARN logged on every request until the user logs in again

- **Area / category / size:** backend-security · ops · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/config/SessionConversionConfig.java:33`
- **Problem:** An unreadable attribute is returned as null but stays in spring_session. Every request on that session logs the WARN again, and with a sliding 30-day timeout that can go on for a long time after an upgrade.
- **Fix:** Log at DEBUG, or WARN once per session id with a small bounded set. Better still, remove the unreadable attribute or the session so the log stops.
- **Evidence:** Read at AUDIT_SHA. UnreadableSessionIT covers the logout behaviour, not the logging.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Sessions
- **Decision:** [x] fix · [ ] skip · [ ] later

### OPS-4: cancel-in-progress also cancels a running publish on main

- **Area / category / size:** ops · ops · S · changes behaviour
- **Where:** `.github/workflows/ci.yml:9`, `.github/workflows/ci.yml:11`, `.github/workflows/ci.yml:100`
- **Problem:** The concurrency group is the ref, with cancel-in-progress: true for every event. Two quick merges to main cancel the first pipeline, including its publish, so that commit's `sha-…` image never exists, and a cancel mid-push can leave a partial manifest list.
- **Fix:** `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- **Evidence:** ci.yml:9-11.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / CI / cancel-in-progress
- **Decision:** [ ] fix · [ ] skip · [x] later

### OPS-5: S3 backups live about twice the stated retention, and delete markers are never cleaned

- **Area / category / size:** ops · ops · S · changes behaviour
- **Where:** `infra/terraform/storage.tf:116`, `infra/terraform/storage.tf:126`, `infra/terraform/storage.tf:130`, `infra/terraform/variables.tf:40`
- **Problem:** Current dumps expire after N days, which adds a delete marker. The now-noncurrent version then lives another N days, so dumps (with deleted users' data) are kept about 2N days, not the 'Days before old database dumps expire' the variable promises. Expired-object delete markers pile up because no rule removes them.
- **Fix:** Set `noncurrent_days = 1` (versioning only has to cover the overwrite window), or document 2×. Add a second rule with `expiration { expired_object_delete_marker = true }`. Update the tftest.
- **Evidence:** storage.tf:126-132.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Backups / 2x retention, delete markers
- **Decision:** [ ] fix · [ ] skip · [x] later

### OPS-6: aws-verify.sh hard-codes the origin subdomain and region

- **Area / category / size:** ops · ops · S · behaviour unchanged
- **Where:** `scripts/aws-verify.sh:9`, `scripts/aws-verify.sh:37`
- **Problem:** The script checks `https://origin.$domain` and defaults to eu-west-1, but both are Terraform variables (origin_subdomain, region). With a non-default value, check 3 passes vacuously (the host does not exist) and the bucket checks fail.
- **Fix:** Read them from `terraform output` (add an `origin_domain` output) or accept ORIGIN_DOMAIN/AWS_REGION and document both.
- **Evidence:** aws-verify.sh:37 literal `origin.`.
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-7: Authenticated users can create unlimited drafts, cookbooks and photos-less rows; listings are unpaged

- **Area / category / size:** backend-domain · security · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeController.java:36`, `backend/src/main/java/com/ricettine/cookbook/CookbookController.java:36`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:68`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:107`
- **Problem:** Only uploads and logins are rate-limited. POST /api/recipes and POST /api/cookbooks have no per-user cap or limit, and /mine, profile and cookbook listings return every row. A script (or a retry loop, creation is not idempotent) can bloat the DB and make /mine arbitrarily large. Accounts are invite-only, so the risk is low.
- **Fix:** Add a per-user cap (e.g. 1000 recipes, 100 cookbooks, 409) or a write limit in RateLimits; page /mine if the cap is large.
- **Evidence:** Code read; RateLimits has no create bucket.
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-8: Removing a recipe from someone else's cookbook is impossible for its author; PRIVATE and link reset do not withdraw it

- **Area / category / size:** backend-domain · security · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:251`, `backend/src/main/java/com/ricettine/cookbook/CookbookEntryRepository.java:36`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:175`
- **Problem:** A PUBLISHED recipe added to another user's cookbook stays readable (text and photos) through that cookbook's link even after its author sets it PRIVATE and resets its share link; only deleting the recipe removes it. This matches the spec's 'accepted under the unlisted model', but a reviewer will notice the author has no revoke short of deletion, and recipes cannot be unpublished.
- **Fix:** Either state it in the user-facing sharing text, or let publishedRows/grantingToken also require visibility = PUBLIC or author-in-cookbook. Product decision; no code change needed if accepted.
- **Evidence:** Spec lines 98-101 and 127 read; code confirms entries ignore visibility.
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-9: Session revocation after role change, password reset or deletion is best-effort; a failure only logs WARN

- **Area / category / size:** backend-security · security · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/account/AccountService.java:106`, `backend/src/main/java/com/ricettine/account/AccountService.java:129`, `backend/src/main/java/com/ricettine/account/AccountService.java:187`, `backend/src/main/java/com/ricettine/common/AfterTransaction.java:47`
- **Problem:** Authorities are snapshotted into the session, and the only thing that revokes them is an after-commit invalidateAllSessions, which AfterTransaction swallows on failure. If that delete fails, a demoted admin keeps ROLE_ADMIN, or an attacker's session survives the victim's password reset. Because the 30-day timeout slides, it can survive indefinitely.
- **Fix:** Delete the user's spring_session rows inside the same transaction (same DataSource: `delete from spring_session where principal_name = ?` via JdbcTemplate), or log at ERROR and retry. Optionally keep a per-user `sessions_valid_after` and check it in CurrentUser.
- **Evidence:** PostCommitFailureIT exists for the logging path. No test covers a failed invalidation keeping access.
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-10: Rate-limiter edge cases: a refund can hit the next window, success clears parallel failures, and malformed bodies aren't counted

- **Area / category / size:** backend-security · security · S · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/common/RateLimiter.java:74`, `backend/src/main/java/com/ricettine/common/RateLimits.java:76`, `backend/src/main/java/com/ricettine/auth/PasswordResetController.java:29`, `backend/src/main/java/com/ricettine/invite/PublicInviteController.java:47`, `backend/src/main/java/com/ricettine/setup/SetupController.java:43`
- **Problem:** (1) refund() decrements whichever window is current, so a reservation made in window N and refunded in N+1 gives one extra attempt. (2) succeeded() calls clear() and so erases failures that other in-flight requests reserved for the same account. (3) anonymousAuth() runs inside the handler after @Valid body binding, so requests with malformed or invalid bodies are never counted. Each gives at most a few extra attempts, so impact is low.
- **Fix:** (1) Return the window start (a generation) from tryHit and refund only if it still matches. (2) In succeeded(), refund this reservation instead of clearing the key, or accept the current behaviour and document it. (3) Move the anonymous-auth check into a HandlerInterceptor or filter on the four anonymous POST paths, so it runs before binding.
- **Evidence:** Read at AUDIT_SHA.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Rate limiter (bullets 1, 3, 6)
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-11: Unsynced recipe text stays in localStorage after logout on a shared browser

- **Area / category / size:** frontend-app · security · S · changes behaviour
- **Where:** `frontend/src/app/recipes/editor/unsaved-backup.ts:117`, `frontend/src/app/shell/shell.component.ts:67`
- **Problem:** After logout the sweep keeps fresh entries (7-day TTL), tagged by user id. That is a deliberate data-loss safety net, but the tag only stops the app from re-applying another user's text; the plain JSON (private recipe titles, notes, steps) is readable from DevTools by the next person on the browser.
- **Fix:** Document the trade-off in the README/spec; optionally, on an explicit user-initiated logout that flushed cleanly there is nothing left to keep, and on an unclean one ask whether to keep the text.
- **Evidence:** Code read of sweep(); no clearing of the logged-out user's entries.
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-12: Containers run without read-only root filesystem, dropped capabilities or no-new-privileges

- **Area / category / size:** ops · security · S · changes behaviour
- **Where:** `compose.yaml:17`, `compose.yaml:2`, `compose.https.yaml:4`, `compose.aws.yaml:6`
- **Problem:** The app image runs as non-root (good), but no service sets `read_only`, `cap_drop` or `security_opt: no-new-privileges`. A reviewer checking container hardening will note it. A compromise of app or Caddy keeps a writable rootfs and the default capability set.
- **Fix:** app: `read_only: true`, `tmpfs: [/tmp]` (the upload spool lives in java.io.tmpdir), `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`. caddy: the same with `cap_add: [NET_BIND_SERVICE]`. Then run smoke and https-smoke.
- **Evidence:** No read_only/cap_drop/security_opt keys in any compose file.
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-11: Missing or weak tests in the security/platform area

- **Area / category / size:** backend-security · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/auth/LoginRateLimitIT.java:21`, `backend/src/test/java/com/ricettine/common/RateLimitsTest.java:20`, `backend/src/test/java/com/ricettine/config/RobotsHeaderIT.java:59`, `backend/src/test/java/com/ricettine/auth/IpRateLimitIT.java:120`, `backend/src/test/java/com/ricettine/config/SpaFallbackIT.java:15`
- **Problem:** (1) LoginRateLimitIT never checks that an account-limited attempt skips the hash (only the IP path does, in IpRateLimitIT.limitedBeforeHashing). (2) The 320-char key truncation is tested only with emails, which normalizeEmail already caps at 254, so the IP-key truncation (reachable via a forwarded header) is never tested. (3) RobotsHeaderIT asserts the header on /actuator/health but not the status. (4) The concurrency IT expects exactly 10/10 and would flake on a 503 busy. (5) No tests for 405 method_not_allowed, a configured ricettine.base-url in invite/reset URLs, or immutable caching of hashed bundles.
- **Fix:** Add a @MockitoSpyBean PasswordEncoder verify(never()) in LoginRateLimitIT.accountLimited. Add an RateLimitsTest case with a 400-char IP. Add `.andExpect(status().isOk())` on actuator. Count 503s as limited in the concurrency IT. Add a 405 case to SpaFallbackIT, a @TestPropertySource base-url case to InviteIT/PasswordResetIT, and a /main-x.js Cache-Control assertion (with a test resource).
- **Evidence:** grep for method_not_allowed / base-url / immutable in backend/src/test found no hits for 405, base-url or bundle caching.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Tests to add; docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Missing tests
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-12: Rate-limit gaps: account-limited login path not checked for hashing, IP key truncation untested, 10/10 concurrency assertion can flake on 503

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/auth/LoginRateLimitIT.java:53`, `backend/src/test/java/com/ricettine/common/RateLimitsTest.java:20`, `backend/src/test/java/com/ricettine/auth/IpRateLimitIT.java:96`
- **Problem:** LoginRateLimitIT.accountLimited asserts 429 but never that no password hash ran (the spy exists only in IpRateLimitIT, so the 'limit before hashing' guarantee is verified for the IP path and the password-change/delete paths but not for login-by-account). RateLimitsTest.keysLongerThan320 covers account-key truncation only; RateLimits.bound() is also applied to the IP key and that is untested. IpRateLimitIT.concurrentWrongPasswordsReachTheHashAtMostTenTimes asserts exactly 10 x 401 and 10 x 429 with 20 parallel logins through a 4-permit BoundedPasswordEncoder (10 s wait); on a starved CI runner a 503 busy would break the exact counts.
- **Fix:** Move the spy-based check into LoginRateLimitIT.accountLimited (or add a spy to the shared base). Add an ipKey truncation case to RateLimitsTest. Make the concurrency assertion tolerate busy: assert 401 + 503 <= 10 hashes and 429 count >= 10, or raise max-concurrent-hashes for that class.
- **Evidence:** Read all three; BeansConfig HASH_WAIT = 10 s, max-concurrent-hashes = 4.
- **Follow-up:** 2026-11-07-plan-5-followups.md: Tests to add (LoginRateLimitIT spy, IP-key truncation, concurrency IT exactly 10 and 10)
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-13: Timing-based negative assertions (fixed sleeps, 1 s lock-wait inference)

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/cookbook/PublicCookbookIT.java:212`, `backend/src/test/java/com/ricettine/media/ProcessingLimiterTest.java:42`, `backend/src/test/java/com/ricettine/config/BoundedPasswordEncoderTest.java:74`
- **Problem:** PublicCookbookIT.resetWaitsForTheCookbookRowLock proves 'blocked on the row lock' only by assertThrows(TimeoutException) after 1 s: it also passes if the request is slow for any other reason, and it adds a fixed second to the suite. It covers resetShareLink only, not the other write paths. ProcessingLimiterTest and BoundedPasswordEncoderTest sleep 300/200 ms to prove a third task did not start; these can only produce false passes, never false failures, so they are weak rather than flaky.
- **Fix:** In the lock test poll pg_stat_activity (wait_event_type = 'Lock', query like 'update cookbook%') until the waiter appears, bounded by a 10 s deadline, then release. For the limiter tests poll the queue length/permit count instead of sleeping, if exposed.
- **Evidence:** Read the three tests; full suite runs in about 58 s with no failures.
- **Follow-up:** 2026-11-04-plan-3-followups.md: Tests to add (row-lock test infers blocking from a 1 s timeout)
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-14: MediaIT partial-write test uses reflection and nulls; migration backfill test misplaced and leaks its schema on failure

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/media/MediaIT.java:124`, `backend/src/test/java/com/ricettine/media/MediaIT.java:131`, `backend/src/test/java/com/ricettine/media/MediaAccessIT.java:213`, `backend/src/test/java/com/ricettine/media/MediaIT.java:150`
- **Problem:** partialWriteFailureCleansUp builds MediaService with null repository and null AfterTransaction, then reads the anonymous BlobStore's private field 'm' via reflection (readField) to check it is empty; renaming the field breaks the test and a refactor that dereferences the nulls fails confusingly. The Flyway V2-to-V3 backfill test lives in MediaAccessIT (unrelated class) next to BaselineMigrationIT, opens five raw DriverManager connections, and drops its scratch schema only on the success path (the next run's 'drop if exists' hides it). MediaIT also repeats a ThrowingController test that OptimisticLockMappingIT and UploadTooLargeIT cover better (standalone MockMvc with a hand-thrown MaxUploadSizeExceededException, no real multipart).
- **Fix:** Make the failing BlobStore a named static class with a public map accessor; build MediaService with Mockito mocks instead of nulls. Move migrationBackfillsExistingAvatarKeys to BaselineMigrationIT (or a MigrationIT), use JdbcTemplate, and drop the schema in finally. Delete MediaIT.oversizedUploadRendersFileTooLarge (covered over real HTTP by UploadTooLargeIT).
- **Evidence:** Read MediaIT and MediaAccessIT in full.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Small cleanups (MediaIT nulls; media backfill schema drop not in finally)
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-15: Image size-limit boundaries untested (only far-over-cap inputs)

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:230`, `backend/src/test/java/com/ricettine/media/ImageProcessorTest.java:278`, `backend/src/main/java/com/ricettine/media/ImageProcessor.java:32`
- **Problem:** The caps are 250 MP (baseline JPEG, PNG), 50 MP (WebP, progressive JPEG). Tests use 400 MP, 56 MP and a 56 MP baseline pass; none sits exactly on the limit, so a > versus >= regression or an off-by-one in the pixel product passes. The 250 MP boundary is an open Plan 2 follow-up.
- **Fix:** Header-only fixtures at exactly cap pixels (accepted past the cap check) and cap+1 (image_too_large) for the four format/cap combinations, as a parameterised test (TestImages already has the header builders).
- **Evidence:** ImageProcessor constants at lines 32-36 versus test dimensions 20000x20000, 8000x7000.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Small cleanups (250 MP boundary test)
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-16: Blob-count helper hard-codes the storage path in two classes; Sessions.login hides failed logins

- **Area / category / size:** backend-tests · tests · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/account/MeIT.java:68`, `backend/src/test/java/com/ricettine/account/AvatarUploadLimitIT.java:31`, `backend/src/test/java/com/ricettine/IntegrationTest.java:16`, `backend/src/test/java/com/ricettine/Sessions.java:18`
- **Problem:** MeIT and AvatarUploadLimitIT count directories under the literal 'target/test-media/img' while IntegrationTest defines that path as a property and MediaIT reads it via @Value: changing the property breaks two tests silently (before == after == 0). The shared media dir is never cleaned between classes, so counts are only comparable before/after within one test. Sessions.login returns null without any status check when the login fails, so a broken fixture shows up later as a confusing 401 or NPE from cookie(null).
- **Fix:** Put blobCount() in a test helper that takes the @Value path (or give IntegrationTest a protected mediaRoot field). Add a strict Sessions.loginOrFail variant that asserts 200 and a non-null SESSION cookie and use it in setUp methods; keep the lenient one for tests that expect failure.
- **Evidence:** grep target/test-media shows the literal in MeIT:69 and AvatarUploadLimitIT:32.
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-17: Sleep-based negative assertions in the titles e2e

- **Area / category / size:** frontend-tests-e2e · tests · S · behaviour unchanged
- **Where:** `e2e/tests/titles.spec.ts:17`, `e2e/tests/titles.spec.ts:40`
- **Problem:** Two fixed waitForTimeout calls (1000 ms and 500 ms) stand in for 'nothing changes later'. They slow both projects, can pass before a late overwrite arrives on a slow CI runner, and never prove the race they guard. The second test (console-clean) was also never shown failing on its own (plan 4 follow-up): its title assertion would fail first on the old code.
- **Fix:** Replace the first sleep with an expect.poll / toHaveTitle with a short stable window assertion after waiting for the specific request (page.waitForResponse of the recipe GET plus networkidle of the title effect), and replace the second with waiting for the recipe heading then the 'load' of the logo/image requests; keep the console collector from the start of navigation.
- **Evidence:** grep -n waitForTimeout e2e/tests: titles.spec.ts:17 and :40 are the only fixed sleeps in the suite.
- **Follow-up:** docs/superpowers/plans/2026-11-05-plan-4-followups.md: Tests to add / console-clean e2e
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-18: Tests that cannot fail or assert little

- **Area / category / size:** frontend-tests-e2e · tests · S · behaviour unchanged
- **Where:** `e2e/tests/walkthrough.spec.ts:12`, `e2e/tests/walkthrough.spec.ts:57`, `e2e/tests/step-reorder.spec.ts:47`, `frontend/src/app/shell/shell.component.spec.ts:32`, `frontend/src/app/shell/shell.component.spec.ts:62`
- **Problem:** 'the project viewport applies' tests Playwright's own device config, not the app. The logout-then-login navigation check uses every() over a list that may be empty, so it is true even if the listener never fires. step-reorder's 'Step 3 moved to position 2' uses toBeAttached on a live region that is always attached. Several shell/profile specs assert only toBeTruthy() on a selector match (existence of a link), which survives broken hrefs/labels beyond the selector itself.
- **Fix:** Drop the viewport test or move it to a config sanity check; assert navigations.length >= 0 intent explicitly (e.g. expect no 'navigate' events beyond '/'); assert live-region text with toHaveText; assert hrefs/labels instead of truthiness.
- **Evidence:** walkthrough.spec.ts:12 asserts viewportSize against the project's own settings; toBeTruthy count in frontend specs is about 25.
- **Decision:** [x] fix · [ ] skip · [ ] later

### TEST-19: cloud-init round-trip tftest compares three files to themselves; count assertion is stale

- **Area / category / size:** ops · tests · S · behaviour unchanged
- **Where:** `infra/terraform/tests/core.tftest.hcl:456`, `infra/terraform/tests/core.tftest.hcl:457`, `infra/terraform/tests/core.tftest.hcl:458`, `infra/terraform/tests/core.tftest.hcl:465`, `infra/terraform/tests/core.tftest.hcl:466`
- **Problem:** The expected value for the docker drop-in, config.env and daemon.json is `f.content`, so those entries always pass, and a broken config.env (the source of REGION, IMAGE_TAG and ALERT_TOPIC_ARN for start.sh and backup-failed.sh) would not be caught. `length(write_files) >= 11` with message '9 embedded files' does not match the actual 14 entries, so a dropped file still passes.
- **Fix:** Spell out the expected config.env text (built from the mocked values), daemon.json and the drop-in. Assert `length(write_files) == 14` and fix the message.
- **Evidence:** core.tftest.hcl:456-458 map those paths to f.content.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Tests to add / tftest YAML round-trip
- **Decision:** [x] fix (PR E)

### TEST-20: Drill's avatar_info leaks its temp file when curl fails

- **Area / category / size:** ops · tests · S · behaviour unchanged
- **Where:** `scripts/backup-restore-check.sh:58`, `scripts/backup-restore-check.sh:63`
- **Problem:** Under set -e, a failing `ct=$(curl …)` exits the subshell before `rm -f "$out"`, which leaves a file in $TMPDIR on every failed drill.
- **Fix:** Create the file under $BACKUPS (already removed by cleanup), or `trap 'rm -f "$out"' RETURN`.
- **Evidence:** Lines 58-64.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Tests to add / drill avatar_info temp file
- **Decision:** [ ] fix · [ ] skip · [x] later

### VERB-1: Small cleanups: FQNs, mid-class constant, redundant queries, duplicate constants, test-only method

- **Area / category / size:** backend-domain · verbosity · S · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/recipe/RecipeService.java:104`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:140`, `backend/src/main/java/com/ricettine/recipe/RecipeService.java:199`, `backend/src/main/java/com/ricettine/feed/FeedService.java:50`, `backend/src/main/java/com/ricettine/feed/FeedCursor.java:41`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:96`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:332`, `backend/src/main/java/com/ricettine/cookbook/CookbookService.java:435`, `backend/src/main/java/com/ricettine/cookbook/CookbookMediaAccessPolicy.java:22`, `backend/src/main/java/com/ricettine/cookbook/CookbookCoverController.java:26`, `backend/src/main/java/com/ricettine/media/ImageProcessor.java:105`
- **Problem:** MAX_PHOTOS sits mid-class; java.util.HashSet, ArrayList, DateTimeException and RequestMapping are written fully qualified though importable (HashSet is already imported); publicView's parameter is named s (it is the photo query); entryDto does an extra find() of the cookbook the caller already holds; listedByOwner runs a second findAllById only to fetch share tokens that could be in SummaryRow; the post-claim cookbookId re-check in acceptInvite can never fail (the lock and the claim use the same token); CookbookMediaAccessPolicy defines CACHE and TOKEN_CACHE with identical values; ImageProcessor.isProgressiveJpeg is used only by tests.
- **Fix:** Move the constant to the top, import the types, rename the parameter, pass the Cookbook into entryDto, add shareToken to SummaryRow, delete the dead re-check, merge the constants, inline or move isProgressiveJpeg into the test.
- **Evidence:** Read each site.
- **Follow-up:** 2026-11-07-plan-5-followups.md: Small cleanups (MAX_PHOTOS); 2026-11-04-plan-3-followups.md: Small cleanups / Backend; 2026-11-05-plan-4-followups.md: Small cleanups / FeedService
- **Decision:** [x] fix · [ ] skip · [ ] later

### VERB-2: Fully qualified names, duplicate and untidy imports in test sources

- **Area / category / size:** backend-tests · verbosity · S · behaviour unchanged
- **Where:** `backend/src/test/java/com/ricettine/media/MediaAccessIT.java:14`, `backend/src/test/java/com/ricettine/media/MediaAccessIT.java:18`, `backend/src/test/java/com/ricettine/media/MediaIT.java:31`, `backend/src/test/java/com/ricettine/media/S3BlobStoreIT.java:34`, `backend/src/test/java/com/ricettine/recipe/RecipePhotoBusyIT.java:122`, `backend/src/test/java/com/ricettine/BaselineMigrationIT.java:27`, `backend/src/test/java/com/ricettine/config/SpaFallbackIT.java:29`, `backend/src/test/java/com/ricettine/cookbook/CookbookApiIT.java:79`, `backend/src/test/java/com/ricettine/cookbook/CookbookCoverIT.java:67`, `backend/src/test/java/com/ricettine/cookbook/CookbookInviteIT.java:126`, `backend/src/test/java/com/ricettine/cookbook/CookbookAccountDeletionIT.java:56`, `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java:56`
- **Problem:** MediaAccessIT imports com.ricettine.Sessions twice and orders imports randomly; MediaIT, S3BlobStoreIT, SpaFallbackIT, BaselineMigrationIT, RecipePhotoBusyIT, the cookbook ITs and PublicRecipeIT spell out org.springframework..., java.util..., org.hamcrest and com.ricettine... names inline although the imports are already available or trivially added. It makes lines 150+ characters wide and hides the actual assertion. Costs readability in the files a reviewer is most likely to open.
- **Fix:** Run an organise-imports pass (IntelliJ or google-java-format with import ordering) over backend/src/test and replace inline qualified names with imports. Optionally add the formatter plugin check to the Maven build so it stays clean.
- **Evidence:** Visual read of each file; duplicate import at MediaAccessIT lines 14 and 18.
- **Follow-up:** 2026-11-07-plan-5-followups.md: Small cleanups (FQNs in S3BlobStoreIT, RecipePhotoBusyIT, MediaAccessIT, duplicate import in MediaAccessIT); 2026-11-04-plan-3-followups.md: Small cleanups (FQNs in CookbookIT/CookbookApiIT)
- **Decision:** [x] fix (PR F)

### VERB-3: Backup is re-parsed and re-serialised in full on every keystroke

- **Area / category / size:** frontend-app · verbosity · S · behaviour unchanged
- **Where:** `frontend/src/app/recipes/editor/autosave.ts:106`, `frontend/src/app/recipes/editor/unsaved-backup.ts:88`, `frontend/src/app/recipes/editor/unsaved-backup.ts:148`
- **Problem:** Autosave.changed() calls backup.write() synchronously; write() JSON.parses every writer's entry for the recipe and JSON.stringifies the whole working copy plus entries. A long recipe (notes up to 10k chars, 100 steps x 5k chars) is hundreds of KB per key press, on the main thread, on phones.
- **Fix:** Throttle to one write per ~250 ms (trailing) and force a synchronous write on pagehide/visibilitychange and before any request is sent; keep the other tabs' entries cached instead of re-parsing.
- **Evidence:** Code read; sizes from the validator limits (backend RecipeValidator MAX_* constants).
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / write() re-parses and re-serialises ...
- **Decision:** [ ] fix · [ ] skip · [x] later

### VERB-4: `errorKey(toApiError(e))` is repeated 35 times

- **Area / category / size:** frontend-app · verbosity · S · behaviour unchanged
- **Where:** `frontend/src/app/admin/invites.page.ts:60`, `frontend/src/app/feed/feed.page.ts:78`, `frontend/src/app/cookbooks/cookbook.page.ts:110`, `frontend/src/app/core/api-error.ts:71`
- **Problem:** 35 catch blocks do the same two-call conversion from an unknown error to an i18n key.
- **Fix:** Add `errorKeyOf(e: unknown): string` to api-error.ts and use it; keep toApiError for callers that need status/fields.
- **Evidence:** grep count 35 in non-spec code.
- **Decision:** [x] fix · [ ] skip · [ ] later

### CONC-5: Editor backup/upload edge cases still open: false conflicts, silent quota loss, late upload lands on the wrong step

- **Area / category / size:** frontend-app · concurrency · M · changes behaviour
- **Where:** `frontend/src/app/recipes/editor/editor-store.ts:239`, `frontend/src/app/recipes/editor/editor-store.ts:303`, `frontend/src/app/recipes/editor/unsaved-backup.ts:88`, `frontend/src/app/recipes/editor/autosave.ts:218`
- **Problem:** Confirmed in code and still open: (1) restore() takes over another tab's live entry and clears it, so two tabs on one recipe get a false 409. (2) A reload while a save is in flight leaves a backup based on the old version, so the next visit shows a conflict for text the server already has. (3) write() on a quota error deletes this writer's older entry and nothing tells the person. (4) A failed takeover write keeps the source entry. (5) uploadPhoto() uses the slot index after Load latest replaced the working copy (uploads are not reset by replace()), so a late upload attaches to whatever step now has that index.
- **Fix:** (1) keep writerId in sessionStorage and do not auto-apply an entry written in the last few seconds by a different writer. (2) write the response version into the backup base after each successful save, and treat baseVersion === server.version-1 with identical content as 'already saved'. (3) on quota failure sweep, retry once, then show a quiet hint. (5) drop uploads in replace() (or key them by an epoch).
- **Evidence:** Read editor-store.ts restore()/uploadPhoto()/replace(), unsaved-backup.write(), autosave.send().
- **Follow-up:** docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup (takeover; failed takeover write; quota write; reload with save in flight); Photos (upload finishing during a conflict)
- **Decision:** [ ] fix · [ ] skip · [x] later

### DATA-6: Restoring an older dump over a newer schema leaves an unbootable app

- **Area / category / size:** ops · data-loss · M · changes behaviour
- **Where:** `deploy/restore.sh:25`, `deploy/restore.sh:26`, `README.md:88`
- **Problem:** `pg_restore --clean` drops only objects that are in the dump. Tables added by later migrations stay, and flyway_schema_history goes back to the old version. At startup Flyway re-runs the newer migrations against tables that already exist and fails, so restore.sh ends with 'app not healthy'. It is documented, but the script could refuse instead of breaking the stack.
- **Fix:** Before stopping the app, compare the dump's max flyway version (restore just `flyway_schema_history` into a temp schema, or `pg_restore -a -t flyway_schema_history -f -`) with the live one, and refuse with a clear message when the dump is older. Or recreate schema `public` in the same transaction by piping `pg_restore -f -` into `psql -1` after `DROP SCHEMA public CASCADE; CREATE SCHEMA public`.
- **Evidence:** README:88 documents it as unsupported.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Backups / older dump over a newer schema
- **Decision:** [ ] fix · [ ] skip · [x] later

### DUP-16: Listing rule (PUBLISHED + PUBLIC) is written three times

- **Area / category / size:** backend-domain · duplication · M · behaviour unchanged
- **Where:** `backend/src/main/java/com/ricettine/feed/FeedService.java:44`, `backend/src/main/java/com/ricettine/recipe/RecipeRepository.java:29`, `backend/src/main/java/com/ricettine/cookbook/CookbookRepository.java:29`
- **Problem:** The rule that decides what is publicly listed is hand-written as raw SQL in FeedService, JPQL in RecipeRepository.listedByAuthor and again (cookbook visibility) in ownedSummaries. The spec calls these the costliest bugs; a change must be made in three places and the feed's raw SQL uses string literals ('PUBLISHED', 'PUBLIC') that bypass the enums. FeedService also keeps a redundant 'published_at is not null'.
- **Fix:** Express the feed with a RecipeRepository keyset query (JPQL or a Specification shared with listedByAuthor), or at minimum share the predicate constants; drop the redundant filter.
- **Evidence:** Read the three queries; ix_recipe_feed (V9) matches the feed order.
- **Follow-up:** 2026-11-05-plan-4-followups.md: Small cleanups / FeedService
- **Decision:** [ ] fix · [ ] skip · [x] later

### OPS-7: CI builds the image three times per PR, with no Maven cache reuse

- **Area / category / size:** ops · ops · M · behaviour unchanged
- **Where:** `Dockerfile:16`, `Dockerfile:19`, `.github/workflows/ci.yml:67`, `.github/workflows/ci.yml:87`, `.github/workflows/ci.yml:96`, `.github/workflows/ci.yml:132`, `scripts/e2e.sh:34`, `scripts/e2e.sh:35`
- **Problem:** e2e, smoke and smoke-arm64 each run `docker compose up --build` from a cold builder. The `--mount=type=cache` Maven cache is never exported, so every build downloads all dependencies again, and publish's `cache-to: type=gha` does not store cache mounts. The e2e job also runs `npm ci` and `playwright install` in the workflow, then again in e2e.sh. Given the CI billing lock earlier this month, wasted minutes cost something real.
- **Fix:** Build the amd64 image once in a job with docker/build-push-action (`cache-from/to: type=gha`, `outputs: type=docker,dest=…`), upload it as an artifact and `docker load` it in e2e and smoke. Or at least give the compose builds a gha cache. Drop the duplicate install from either the workflow or e2e.sh (skip when `CI` is set).
- **Evidence:** Dockerfile:16/19 cache mounts. ci.yml:67 and e2e.sh:34-35 both install.
- **Follow-up:** docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / CI / --mount=type=cache isn't exported
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-13: Image processing has no run-time bound

- **Area / category / size:** backend-domain · security · M · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/media/ProcessingLimiter.java:31`, `backend/src/main/java/com/ricettine/media/ImageProcessor.java:43`
- **Problem:** The limiter bounds waiting for a permit (30 s) but not how long a task holds one. A 15 MB PNG/JPEG near the 250 MP cap decodes for many seconds even when subsampled; with 2 permits a few such uploads from one invited user can make every other upload 503 for minutes. Heap is bounded; CPU time is not.
- **Fix:** Run the task on a bounded executor with a future timeout (e.g. 20 s), release the permit and answer 503/413 on timeout, or lower MAX_PIXELS for PNG toward the WebP cap.
- **Evidence:** Code read. Not measured.
- **Follow-up:** 2026-11-04-plan-2-followups.md: Plan 5 / Image processing has no time bound
- **Decision:** [ ] fix · [ ] skip · [x] later

### SEC-14: Setup is open to whoever reaches a fresh instance first, and reopens when the last user deletes their account

- **Area / category / size:** backend-security · security · M · changes behaviour
- **Where:** `backend/src/main/java/com/ricettine/setup/SetupService.java:35`, `backend/src/main/java/com/ricettine/account/AccountService.java:184`
- **Problem:** POST /api/setup/admin is anonymous and needs no secret, so on a newly deployed public instance (AWS) anyone who gets there before the owner becomes admin. AccountService.delete clears instance_setup when the last user leaves, which reopens that window on a live, public URL.
- **Fix:** Optionally require a one-time setup token: generate it at startup when setup is required, log it once, and have the setup page ask for it. Or document the window in the deploy runbook. Owner decision.
- **Evidence:** Read at AUDIT_SHA. SetupIT covers only the race between two setups, not who is allowed to do setup.
- **Decision:** [ ] fix · [ ] skip · [x] later

### TEST-21: e2e coverage gap: no password-reset or admin user-management flow

- **Area / category / size:** frontend-tests-e2e · tests · M · behaviour unchanged
- **Where:** `e2e/tests/walkthrough.spec.ts:69`, `frontend/src/app/auth/reset-password.page.ts:1`, `frontend/src/app/admin/users.page.ts:1`
- **Problem:** The reset-password page and admin users page (disable/delete actions) are exercised only by mocked unit specs; e2e only checks a non-admin cannot reach /admin/users. A wiring break between SPA, CSRF and backend (the kind the walkthrough already caught once for logout) would pass CI.
- **Fix:** Add one e2e: admin creates a reset link for a user from /admin/users, the user opens it, sets a password and logs in with it; and one for an admin action on a user.
- **Evidence:** grep -il 'reset' e2e/tests finds only walkthrough/auth-a11y mentions of the login form; no spec opens /admin/users as admin.
- **Decision:** [ ] fix · [ ] skip · [x] later

## Closed or dismissed follow-ups (110)

Follow-up items from plans 1–5 that the reviewers found already fixed, out of scope (Plan 7 UI pass, Plan 5 Task 12 deploy checks), or not worth doing. Open items that are still real appear above with a **Follow-up** line.

### backend-security (13)

- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Rate limiter / IPv4-mapped IPv6 addresses aren't collapsed**: Not reachable: Tomcat on the JDK reports IPv4 peers as dotted quads, and Caddy writes plain addresses. Once the spoofing finding is fixed, no client-controlled value reaches ipKey.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Rate limiter / LRU can evict a live counter under 50k-key churn**: Churning 50k account keys needs 50k argon2 hashes at 4 at a time (about 20 min), which is longer than the 15-min window, so eviction gains nothing. The real churn vector is IP spoofing, which is covered by the High finding.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Rate limiter / wall clock, not monotonic**: An NTP step shifts at most one window. The injected Clock is what makes the limiter testable (MutableClock). Not worth changing.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Uploads (UploadDirectoryConfig vs Tomcat)**: The premise is wrong: Tomcat 11.0.27 Request.parseParts calls mkdirs only when Context.createUploadTargets is true, and it defaults to false. Without the filter, a tmp cleaner deleting the spool dir would break uploads. Keep it.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Dependencies (Apache 4 HTTP client)**: Closed: the dependency tree shows only httpclient5 (input pack).
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 2 entry criteria / Move OneTimeToken to common**: Done: OneTimeToken, OneTimeTokenRepository and OneTimeTokens are in com.ricettine.common.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / Session upgrade hazard**: Mitigated: SessionConversionConfig turns undeserializable attributes into a logged-out session (UnreadableSessionIT). The remaining log noise is a separate Low finding.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Product decisions / admins can create reset links for any user**: Report only (owner decision). Still true at AUDIT_SHA: AdminUserController.createReset has no target restriction. Acceptable while admins are fully trusted.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Plan 3 / OptimisticLockException mapped globally to recipe_conflict**: Fixed: ProblemAdvice.handleOptimisticLock maps only com.ricettine.recipe.Recipe to recipe_conflict and everything else to conflict (OptimisticLockMappingIT).
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Backend / malformed-UUID try/catch duplicated**: Belongs to backend-domain (cookbook package). Still present at CookbookInviteController.java:46-53, CookbookMemberController.java:32-39 and CookbookController.java:78-85, next to RecipeController.parse/CookbookController.parse. Left to that reviewer.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Backend / acceptInvite managed token + cookbookId re-check dead code**: Belongs to backend-domain (CookbookService). Still present: CookbookService.java:327 loads a managed OneTimeToken entity, and the check at :332 is dead because both values come from the same immutable row. Left to that reviewer.
- **Focus item: server side of logout**: No server issue. POST /api/auth/logout is handled by Spring's LogoutFilter: it invalidates the JDBC session (AuthIT.logoutEndsSession checks the old cookie gets 401), returns 204 even without a session, and re-arms CSRF (LogoutCsrfIT). A request without a valid XSRF token gets 403 and the session stays alive, which is correct server behaviour. The frontend finding (signing out locally on failure) is what leaves a live cookie behind.
- **Focus item: X-Robots-Tag on /r/** and /c/****: Verified as applied: RobotsHeaderFilter is a HIGHEST_PRECEDENCE @Component covering every response, including error and async dispatches. RobotsHeaderIT asserts it on /r/x, /c/x, the API 404, the security 401, media and actuator.

### backend-domain (24)

- **2026-11-07-plan-5-followups.md: Plan 6 / Media 304**: Confirmed in MediaController:63 (304 precedes the blob check) but harmless: the access policy has already passed, nothing leaks, and a 404 would cost a storage HEAD per revalidation.
- **2026-11-03-plan-1-followups.md: Plan 2 entry criteria / image decode memory**: Done: ImageProcessor subsamples toward the target, caps pixels per format and ProcessingLimiter bounds concurrency.
- **2026-11-03-plan-1-followups.md: Plan 2 entry criteria / media ownership and Cache-Control**: Done: media table (V3), per-kind MediaAccessPolicy, no public cache for non-avatar media.
- **2026-11-03-plan-1-followups.md: Plan 2 entry criteria / image_too_large code**: Done: ImageProcessor.tooLarge() returns 413 image_too_large.
- **2026-11-03-plan-1-followups.md: Plan 2 entry criteria / ICC profiles**: Still true but accepted: JPEG output is metadata-free by design (EXIF/location privacy); the colour shift is cosmetic.
- **2026-11-04-plan-2-followups.md: Plan 5 / S3 timeouts, upload cap and rate limit, ETag/304, multipart limits**: Done: S3Timeouts, MAX_PHOTOS + RateLimits.upload, ETag + 304 in MediaController, multipart settings in application.yml. The remaining lock-held-during-S3 issue is raised as a finding.
- **2026-11-04-plan-2-followups.md: Plan 5 / noindex on /r/****: Outside backend-domain (edge/config); not checked here.
- **2026-11-04-plan-2-followups.md: Plan 5 / processing timeout**: Still open; raised as a finding.
- **2026-11-04-plan-2-followups.md: Before a native Android client / Retry-After on 503**: Done: ProcessingLimiter.busy() sets retryAfter and ProblemAdvice emits the header.
- **2026-11-04-plan-2-followups.md: Before a native Android client / DELETE version optional race**: Raised as a finding (the web client never sends the version).
- **2026-11-04-plan-2-followups.md: Before a native Android client / UTF-16 vs code points**: Raised as a consistency finding; not a bug (never exceeds DB length).
- **2026-11-04-plan-2-followups.md: Before a native Android client / idempotent create**: Feature work for a future client; folded into the unlimited-creation finding only as context.
- **2026-11-04-plan-2-followups.md: Small cleanups / Backend images and media (gray+alpha, CMYK with ICC, isWebp, 250 MP test, backfill, MediaIT nulls)**: isWebp no longer exists; the rest are cosmetic or test-area items not reproduced here. 'Every media GET does a DB lookup' is the access check and is intended.
- **2026-11-04-plan-2-followups.md: Small cleanups / Orphan-cleanup job**: Lock-order and batch-stall items raised as a finding; initialDelay is harmless (re-check under lock makes startup runs safe); 'readable by token until the job runs' needs a 256-bit media id and is accepted.
- **2026-11-04-plan-2-followups.md: Small cleanups / Recipe backend delete without lock**: Closed: RecipeService.delete uses ownedForUpdate (row lock).
- **2026-11-04-plan-3-followups.md: Before a native Android client / RecipeRef package cycle, shareToken empty**: Raised as a finding.
- **2026-11-04-plan-3-followups.md: Plan 5 / members' cover max-age=3600**: Closed: CookbookMediaAccessPolicy.CACHE is now private, no-cache.
- **2026-11-04-plan-3-followups.md: Small cleanups / Backend (entryDto extra find, publicView param, CookbookMediaAccessPolicy per hit, ?c= thumbs)**: entryDto and param name raised in the cleanup finding. Per-hit cookbook load is the access check (one PK lookup) and is accepted. ?c= thumbs for non-published rows are unreachable because recipes cannot be unpublished; harmless.
- **2026-11-04-plan-3-followups.md: Small cleanups / managed OneTimeToken flushed over JDBC claim**: Hypothetical: nothing edits the entity today; not worth a change.
- **2026-11-05-plan-4-followups.md: Before a native Android client / ProfileRecipe visitor shape**: Not a bug today: visitors see constant status/visibility and an updatedAt of a recipe that is public anyway.
- **2026-11-05-plan-4-followups.md: Feed and profile / ownedSummaries split**: The flag comes only from self = viewer equals profile owner in ProfileService; verified safe. A string-level visitor IT is a test-area item.
- **2026-11-05-plan-4-followups.md: Feed and profile / ?limit= empty 400**: Behaviour is correct (NumberFormatException maps to 400 validation_failed); only a pinning test is missing.
- **2026-11-05-plan-4-followups.md: Small cleanups / FeedService**: Raised in the listing-rule and cleanup findings.
- **2026-11-05-plan-4-followups.md: Accessibility and frontend items; 2026-11-04-plan-2-followups.md frontend editor/photos/step reorder/backup items; 2026-11-04-plan-3-followups.md Frontend items**: Plan 7 handover (UI/accessibility) or frontend-area scope.

### backend-tests (9)

- **2026-11-03-plan-1-followups.md / 2026-11-04-plan-2-followups.md: hibernate jdbc.error=OFF scoping**: Resolved: IntegrationTest no longer sets it. QuietSqlErrors (extension that restores the previous level) is applied per method in MeIT, InviteIT and AccountServiceIT only. The plan-3 note that no test proves an unrelated SQL error still logs is cosmetic.
- **2026-11-03-plan-1-followups.md: image tests alpha/gray/CMYK, pixel-limit rejection; plan-2: orientations 5/7**: Done: transparentPng, grayscale, cmykJpeg, overPixelCapIs413, orientation5/7 tests exist. Remaining gaps (orientation 4, exact boundaries) are raised as findings.
- **2026-11-04-plan-2-followups.md: @TestPropertySource creates 3 extra Spring contexts**: Measured: a full mvn verify (exit 0, 320 tests, about 58 s wall) starts 7 contexts (base, RANDOM_PORT group, IpRateLimitIT, RecipePhotoBusyIT, UploadLimitsIT/PostCommitFailureIT spy, OptimisticLockMappingIT, AccountDeletionIT), each starting in 0.3 to 0.9 s after the first (2.5 s). Merging them would save a few seconds and complicate the tests; not worth it.
- **2026-11-04-plan-2-followups.md: import order in MeIT, PasswordResetIT**: Folded into the 'Fully qualified names, duplicate and untidy imports' finding.
- **2026-11-07-plan-5-followups.md: extra Spring context from the BlobStore spy in UploadLimitsIT**: Not an extra cost: PostCommitFailureIT declares the same @MockitoSpyBean BlobStore, so both classes share one cached context. Total contexts measured at 7 (see above).
- **2026-11-07-plan-5-followups.md: Tests to add - YAML round-trip tftest compares config to itself; drill avatar_info temp file leak**: Out of this area (infra/scripts, not backend/src/test); belongs to the infra reviewer.
- **2026-11-04-plan-3-followups.md: Tests to add - Cache-Control no-store on a /api/c/** 404**: Already covered: PublicCookbookIT and PublicRecipeIT assert Cache-Control no-store (containsString) on unknown-token 404s (PublicRecipeIT.unknownMalformedAndDraftTokensAre404); the cookbook 404 case at PublicCookbookIT line 122/133 asserts it on success only, so only the cookbook 404 variant remains and is a one-liner already implied by ProblemAdvice behaviour.
- **2026-11-05-plan-4-followups.md: ?limit= empty value returns 400, no test pins it**: Low value: FeedIT.badCursorOrLimit pins 0, 51 and 'abc' as 400; empty string follows the same code path as 'abc' (type conversion failure).
- **Plan 7 handover: any visual/UX/accessibility follow-ups in plan 4 and plan 2 files**: Plan 7 handover (frontend and styling items, not backend tests).

### frontend-app (44)

- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: media.ts accepts //host refs**: Resolved: mediaUrl() accepts only '/media/...' (no '..') or a bare id matching /^[A-Za-z0-9._-]+$/; '//host/x' matches neither.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend: hidden file input isn't keyboard-focusable**: Resolved: the picker button opens a hidden input (tabindex -1), so the control is a real button.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend: the spinner has no label**: Plan 7 handover (accessibility): settings/profile.page.ts:39 still has an unlabelled role=progressbar.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Small cleanups / Frontend: the shell has no logout control**: Resolved: shell.component.ts has a logout button.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 2 entry criteria: Form accessibility / autocomplete, aria-describedby**: Resolved in account-form, login and settings forms (aria-invalid, aria-describedby, autocomplete, invalid-login message).
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Plan 3 / The public recipe page reads the token once from the route snapshot**: Resolved by ParamReuseStrategy (a param change creates a fresh component), which also covers the editor; reading the snapshot once is now safe.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Plan 4 / title subscription can overwrite the recipe title**: Resolved by AppTitleStrategy + PageTitle (the remaining late-set race is returned as a finding).
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Auth interceptor absolute API URLs ignored**: Not a defect: isExempt() ignores any URL not starting with /api/ and the app only uses relative URLs; nothing to fix beyond what the code already states.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: badge colours hardcoded**: Plan 7 handover (colours/styling).
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: an existing empty draft is also auto-deleted on Done**: Dismissed: an empty draft (no text, photo, steps) holds nothing to lose; removeIfUntouched re-checks the server copy at the known version first.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: an offline empty draft makes Done fail repeatedly**: Dismissed: safe failure (error shown, nothing deleted); UX wording only, Plan 7 handover.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: the `requested` highlight persists until the next Publish**: Dismissed: missing() filters requested by current completeness, so a section clears as soon as it is complete; only still-missing sections stay highlighted.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: Ctrl+Enter and Next step do nothing silently at max limits**: Plan 7 handover (UX feedback); no data effect.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: the amount bounds mirror check needs a look**: Checked against RecipeValidator: amount in (0, 1,000,000], max 3 decimals, title 200, notes 10,000, source 500, group 100, ingredient name/note 200, step 5,000, 20/200/100 counts, minutes 10,080, portions 1-100 all match the frontend.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: saved-clears-actionError effect; unsavedInput not cleared once fixed**: Dismissed: fixing the input triggers a save which clears the message; the header status ('invalid'/'unnamedIngredient') is derived from hasUnsavedInput() and stays correct meanwhile.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor: no spec asserts the rest of a recipe saves while a nameless row holds data**: Tests-only item for the frontend-tests reviewer; no code defect.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Editor accessibility (glyph-only buttons, identical aria-labels)**: Plan 7 handover (accessibility). The glyph-only buttons now have names; identical labels for same-named rows remain.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Photos: thumbnail load error keeps the preview until destroy**: Dismissed: benign, the preview image stays instead of a broken image.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Photos: stale done upload entries remain after a drop**: Dismissed: harmless state (the entry is removed by previewLoaded or replaced by the next upload in that slot).
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Step reorder items**: Plan 7 handover (accessibility/motion/visual); keyboard reorder via ArrowUp/ArrowDown is implemented now.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Small cleanups / Share and public page e2e items**: E2E-only items for the e2e reviewer; no frontend code defect.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / The restored notice lingers after a save**: Plan 7 handover (UX copy/state); no data effect.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / There is no indicator during 5xx retries**: Plan 7 handover (UX); the retries themselves are correct.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Unsaved-text backup / Missing e2e**: E2E-only item for the e2e reviewer.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Still open from Plan 1 / Backup sweep**: Resolved: sweep() removes non-JSON, non-object and empty values, drops malformed/expired/future-dated entries (parseEntries, FUTURE_SKEW_MS); app.config pulls UnsavedBackup into the main chunk deliberately and it is small.
- **docs/superpowers/plans/2026-11-04-plan-2-followups.md: Still open from Plan 1 / Auth-form accessibility**: Resolved in the current templates (see Plan 1 form accessibility entry).
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Plan 4 bullets (profile cookbooks, extra GET /api/c/{token}, invite date locale)**: Done: the profile page lists cookbooks, PublicRecipe carries cookbookName, AppDatePipe formats with the Transloco language.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Before a native Android client / shareUrl last path segment**: Deferred to the native client: needs a backend `shareToken` field; the web app works with tokenFromShareUrl and the member views.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: leave() does nothing when me() is null**: Dismissed: unreachable, the members panel renders only inside the authGuard shell where me() is set.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: share-panel button reuses the reset class**: Plan 7 handover (styling).
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: account-form template indentation**: Covered by the Prettier finding; no separate cost.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: login `attempted` flag is never reset**: Dismissed: UX only (errors keep showing live while typing); no correctness effect.
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: field codes other than required/too_long/invalid fall back to validation_failed**: Dismissed: verified the cookbook and feed validators emit only those three; the recipe editor has its own wider mapping (consistency returned as a finding).
- **docs/superpowers/plans/2026-11-04-plan-3-followups.md: Small cleanups / Frontend: hardcoded colours in cookbook styles; 44 px on dialog radios**: Plan 7 handover (colours/layout).
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Accessibility (design pass) items**: Plan 7 handover: shell profile link aria-label (shell.component.ts:39), visibility hint describedby (recipe-editor.page.ts:131), 44 px checks.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Recipe page / AppDatePipe handles null only**: Dismissed: all inputs are typed string|Date|null; no call site can pass undefined.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Recipe page / amounts read the language via getActiveLang**: Dismissed: availableLangs is ['en'] and no switcher exists; revisit when a second language is added.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Feed and profile / A not-found profile keeps the generic title**: Dismissed: cosmetic.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Feed and profile / Clicking Home while on / doesn't refresh the feed**: Dismissed: product behaviour, not a defect (the feed has no pull-to-refresh by design).
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Feed and profile / authInterceptor injects Router eagerly**: Dismissed: guarded by the lazy TranslocoService resolution in AppTitleStrategy (explained in its comment); no current HTTP call runs during Router construction.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Small cleanups / AppTitleStrategy lazy i18n getter has side effects**: Dismissed: naming only; the side effect is documented in the getter's comment.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Small cleanups / a.recipe class reuse on profile cookbook cards**: Plan 7 handover (styling).
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Small cleanups / user_not_found order in en.json and api-error.ts**: Dismissed: cosmetic; the code list is verified in sync with en.json and with the codes the backend emits, in both directions.
- **docs/superpowers/plans/2026-11-05-plan-4-followups.md: Small cleanups / app.routes.ts long line**: Folded into the Prettier finding.

### frontend-tests-e2e (10)

- **plan-2-followups: Small cleanups / Auth interceptor specs (pending reset, second expiry, 401 on logout)**: Partly closed: auth.interceptor.spec.ts now covers a repeated redirect after a rejected navigation. The 401-on-logout and absolute URL cases remain and are reported in the bundled frontend gaps finding.
- **plan-2-followups: Small cleanups / editor 'No spec asserts that the rest of a recipe saves while a nameless row holds data'**: Closed: editor-store.spec.ts:405 saves a title with a nameless amount row, asserts autosave is clean, the row is not sent and survives a reload.
- **plan-2-followups: Step reorder test bullets (repeated announcement, reduced-motion CSS, single-step attributes only, hidden handle gap, keyboard reorder)**: Plan 7 handover (CSS, motion and 44 px handle gap); keyboard reorder is now implemented and tested (steps-editor spec ArrowUp/ArrowDown, e2e).
- **plan-2-followups: Share and public page e2e bounding-box assertions and resetLink mock type**: Plan 7 handover for the layout assertions; the vi.fn resetLink mock type is untyped test code with no behavioural cost.
- **plan-2-followups: Unsaved-text backup 'Missing e2e' and Unsaved-safety e2e bullets**: Not dismissed: reported as a finding (unsaved-text safety e2e gaps).
- **plan-3-followups: Tests to add / Frontend: ParamReuseStrategy different-config, cookbook view error and empty states, Escape on reset-link dialog, cookbook.page.spec invites mock**: Not dismissed: still open, reported in the frontend gaps finding.
- **plan-3-followups: Tests to add / Frontend: coauthors e2e asserts 'invalid' loosely**: Still open but cosmetic: e2e/tests/coauthors.spec.ts:45 uses toContainText('invalid') on an alert whose text is fixed; low value to tighten, fold into the duplication cleanup if touched.
- **plan-4-followups: Tests to add / feed loadingMore guard and Retry guard**: Not dismissed: reported in the frontend gaps finding (initial-load Retry works and is tested; the re-entrancy guards are not).
- **plan-4-followups: Tests to add / console-clean e2e never shown failing**: Reported inside the sleep-based assertions finding (titles.spec); not independently reproducible without editing the app.
- **plan-4-followups: Tests to add / specs written without a separate RED run**: Note only: the frontend suite is 421 passing tests in 51 files with thorough store coverage; nothing actionable.

### ops (10)

- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 5 Task 12 (all bullets: edge compression, backup-failure email E2E, cmp on AL2023, S3BlobStoreRealIT, EBS snapshots/CloudWatch)**: Out of scope: deploy-time checks, gated on the owner's AWS deploy.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / CI / no major.minor semver aliases**: New feature, not a defect: nothing consumes minor tags yet. One line (`type=semver,pattern={{major}}.{{minor}}`) when the first release is cut.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Plan 6 / Caddy / origin-secret matcher not constant-time**: Not exploitable: 48-char random secret, network jitter far above the comparison timing, and 443 only reachable from the CloudFront prefix list.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Small cleanups / infra-check.sh empty files array**: Unreachable: the find over scripts/ and deploy/ always matches infra-check.sh itself, so the array is never empty. infra-check.sh ran green.
- **docs/superpowers/plans/2026-11-07-plan-5-followups.md: Small cleanups / stale local latest image**: Not a code issue: compose.yaml has no build key and README's Upgrading section uses `docker compose pull`. compose.build.yaml tags ricettine:local, so it never shadows the ghcr image.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / publish to ghcr, README pull path**: Done: compose.yaml uses ghcr.io/spezialissimo/ricettine, the publish job pushes it, and README:64 documents pull.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / arm64 image only exercised locally**: Done: CI job smoke-arm64 runs on ubuntu-24.04-arm (ci.yml:91-97).
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / proxy docs, tokens in logs**: Done: README:51-53, both Caddyfiles drop uri and headers from logs, and https-smoke asserts it.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / Maven 401 metadata warnings**: Resolved: the pom declares no extra repositories, and the green CI run 42097345964 has no 401/red-gate lines.
- **docs/superpowers/plans/2026-11-03-plan-1-followups.md: Plan 5 / Dockerfile dependency:resolve || true**: Done: Dockerfile:16 now runs `dependency:go-offline` with no `|| true`.

## Bigger ideas (out of Plan 6 scope)
- Run `scripts/infra-check.sh` and the backup/restore drill in CI (see TEST under ops). Consider a lint job that runs Prettier and knip once the code is formatted.
- Replace Java-serialized sessions with a JSON serializer. `SessionConversionConfig` mitigates the upgrade hazard today, but it doesn't remove it.
- A shared `ConfirmDialog` and a sheet helper on the frontend, and shared IT fixtures (`TestData` builders) on the backend. These are the larger refactors behind the DUP findings.
- Pin GitHub Actions to SHAs, with Dependabot keeping them current.
