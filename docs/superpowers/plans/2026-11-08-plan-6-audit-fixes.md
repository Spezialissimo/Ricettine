# Plan 6 phase 2: audit fixes, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 51 audit findings the owner marked **fix**, as nine small stacked PRs. All other findings stay **later**.

**Architecture:** One task per PR. Each task lists the finding ids it closes. The finding text in the report is the spec for each fix: problem, proposed fix and locations. This plan adds what the report leaves open: the PR grouping, the required tests, the order, and the reviewer model.

**Tech Stack:** Spring Boot 4 / Java 25, Angular 22 + vitest, Playwright, Docker Compose, Caddy, Terraform, GitHub Actions.

**Spec:**
- Design: `docs/superpowers/specs/2026-11-07-plan-6-code-audit-design.md`
- Findings and decisions: `docs/superpowers/audits/2026-11-07-code-audit.md`. Read each finding by its id (`### SEC-1:` and so on) before fixing it.

## Global Constraints

- Fix only the findings listed in a task. Anything new you notice goes in `docs/superpowers/plans/2026-11-08-plan-6-followups.md`, not into the PR.
- No visual or UX changes (that's Plan 7). New user-visible text goes through Transloco keys in `public/i18n/en.json`.
- A finding marked "behaviour unchanged" in the report is a refactor: the existing tests must pass unchanged, apart from moving shared setup. A finding that "changes behaviour" gets a regression test that fails before the fix. Run it red first and say so in the commit message.
- Every PR passes these, run quietly (check the exit code, and read the log only on failure):
  - `cd backend && ./mvnw -q verify`
  - `cd frontend && npx ng test --watch=false && npx ng build`
  - `scripts/e2e.sh` (both the `mobile` and `desktop` projects)
  - `scripts/infra-check.sh`, when ops or infra files change
  - `scripts/smoke.sh`, when the Dockerfile or compose files change
- Docker: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
- Branches stack in task order. The first branches from `audit/p6-report`, and each later one from the previous task's branch. PR titles are `Plan 6 PR <letter>: …`. The owner merges in order.
- Commit messages end with the session's Co-Authored-By and Claude-Session lines, and PR bodies with the Claude Code footer.
- Close each finding in the report: change its Decision line to `[x] fix (PR <letter>)` in the same PR.
- Models: Sonnet implements every task. Opus reviews Tasks 1–4, the security- and data-loss-sensitive ones. Sonnet reviews Tasks 5–9. There is one review per task, and fix rounds fix merge-blocking findings only.

## Review Focus

- **Real proxies after SEC-1:** behind Caddy, and behind CloudFront → Caddy, the app must still see the real client IP. A fix that makes everyone share the proxy's IP would rate-limit all users together. Task 1 adds an IT for each case.
- **CSP vs the built SPA:** the Angular production build, Transloco's JSON loading, image previews from `blob:` URLs, and the inline styles Angular emits must all keep working under the CSP. Task 2 runs the full e2e suite and asserts no CSP console violations.
- **Failed blob write after CONC-1:** when the S3 put fails after the change, no media row and no orphaned blob may remain, and the recipe stays editable. Task 4 has an IT for this.
- **Typing during "Load latest" (DATA-3):** text typed while the fetch is in flight must survive. Task 3 adds a unit spec for this.
- **`1,000` vs `1,5` (COR-1):** the locale-style decimal comma that already works must keep working. Task 3's spec covers both.

---

### Task 1 (PR A): Security and ops quick wins. Opus review.

**Findings:** SEC-1, DATA-1, SEC-4, SEC-3, OPS-1, and the Low DEAD-1 (the rate-limiter dead code sits in the same files).

**Files:**
- `backend/src/main/resources/application.yml`
- `deploy/Caddyfile`, `deploy/aws/Caddyfile`
- `scripts/smoke.sh`, `scripts/infra-check.sh`
- `.gitignore`, `.github/workflows/ci.yml`
- `compose.yaml`, `compose.aws.yaml`
- `backend/src/main/java/com/ricettine/common/RateLimiter.java`, plus the tests that call `check()`/`hit()`
- Test: `backend/src/test/java/com/ricettine/auth/ForwardedHeaderTrustIT.java`

- [ ] **Step 1: Failing IT `ForwardedHeaderTrustIT`.**
  - `spoofedForwardedHeadersDoNotResetIpLimit`: 31 failed logins from remote address `203.0.113.7`, each with a different `X-Forwarded-For` and `Forwarded: for=` value. Expect a 429 on the 31st.
  - `trustedProxyForwardedForIsHonoured`: requests from an address in `internal-proxies` with `X-Forwarded-For: 198.51.100.1, 198.51.100.2` are keyed to the right-most untrusted address. The second client is unaffected by the first one's limit.

  Run it and confirm the first test fails.
- [ ] **Step 2: Switch to `server.forward-headers-strategy: native`.** Set `server.tomcat.remoteip.internal-proxies` to a regex for loopback plus the RFC 1918 ranges (Docker networks). Add `request_header -Forwarded` to both Caddyfiles, and fix the wrong comment in `deploy/Caddyfile`. The IT now passes.
- [ ] **Step 3: DATA-1.** In `smoke.sh`, export `COMPOSE_PROJECT_NAME="${SMOKE_PROJECT:-ricettine-smoke}"`. Add an `infra-check.sh` guard that fails when a script under `scripts/` calls `down -v` without setting a project name (via `-p` or `COMPOSE_PROJECT_NAME`).
- [ ] **Step 4: SEC-4.** Add `.env` and `backups/` to `.gitignore`.
- [ ] **Step 5: SEC-3.** Pin every `uses:` in `ci.yml` to a full commit SHA, with the tag as a trailing comment. Add `.github/dependabot.yml` for `github-actions`, weekly.
- [ ] **Step 6: OPS-1.**
  - Set `mem_limit: ${RICETTINE_MEM_LIMIT:-1g}` on `app` in `compose.yaml`, and an explicit `1g` in `compose.aws.yaml`.
  - Add a `smoke.sh` check that the JVM's MaxHeapSize is at most 80% of the limit: `docker compose exec app java -XX:+PrintFlagsFinal -version | grep MaxHeapSize`.
  - Document the variable in the README.
- [ ] **Step 7: DEAD-1.** Delete `RateLimiter.check()` and `hit()`, and point their tests at the public methods.
- [ ] **Step 8:** Run all suites, including smoke and infra-check. Commit, push, and open PR A.

### Task 2 (PR B): Response headers. Opus review.

**Findings:** SEC-5, SEC-6.

**Files:**
- `backend/src/main/java/com/ricettine/config/SecurityConfig.java`
- `frontend/angular.json` (only if inline critical CSS needs turning off)
- Tests:
  - `backend/src/test/java/com/ricettine/media/MediaNoCookieIT.java`
  - `backend/src/test/java/com/ricettine/config/SecurityHeadersIT.java`
  - `e2e/tests/csp.spec.ts`

- [ ] **Step 1: Failing ITs.**
  - `MediaNoCookieIT.avatarCarriesNoSetCookie`, with no cookies, and `withStaleSessionCookie`: no `Set-Cookie` header on an avatar GET.
  - `SecurityHeadersIT.spaAndApiCarryCspAndReferrerPolicy`: `/`, `/api/me` and `/r/x` carry `Content-Security-Policy` containing `default-src 'self'`, `object-src 'none'` and `frame-ancestors 'none'`, plus `Referrer-Policy: same-origin`.
- [ ] **Step 2: SEC-5.** Stop issuing CSRF tokens for `/media/**`, following the report's fix. A separate GET-only filter chain is preferred.
- [ ] **Step 3: SEC-6.** Use the CSP and Referrer-Policy from the report's fix. Check the production build for inline scripts and handlers (`grep -n "onload=\|<script>" dist/**/index.html`). Remove any by config (`inlineCritical: false`) rather than loosening the CSP.
- [ ] **Step 4: e2e `csp.spec.ts`.** Load home, a recipe editor with a photo preview, and a public recipe. Fail on any `console` message containing `Content-Security-Policy`. Run it in both projects.
- [ ] **Step 5:** Run all suites. Commit and open PR B.

### Task 3 (PR C): Frontend bugs. Opus review.

**Findings:** COR-1, SEC-2, DATA-3.

**Files:**
- the amount parser named in COR-1
- `frontend/src/app/core/auth.store.ts` (or wherever logout lives; see SEC-2), and the shell logout handler
- `frontend/src/app/recipes/editor/editor-store.ts`
- their `.spec.ts` files

- [ ] **Step 1: Failing specs.**
  - Amounts: `'1,000'` gives `invalid`, so the inline error shows. `'1,5'` gives 1.5. `'1,500.5'` gives `invalid`. `'1.000'` keeps its current behaviour.
  - Logout: when `POST /api/auth/logout` fails with status 0 or 500, `me()` stays set and the shell shows `errors.network_error` with a retry. A 401 still clears `me()`.
  - Conflict: `conflictText()` includes ingredient lines (`amount unit name, note`), source, times and portions. In `loadLatest()`, text typed while the fetch is pending is still in the editor, or in the backup, after it resolves.
- [ ] **Step 2:** Implement the report's fixes until the specs pass.
- [ ] **Step 3: e2e.** Extend the conflict spec: an ingredient-only edit on device 1 appears in the copy block. Add a logout-failure case: route `/api/auth/logout` to abort, and expect the user to still be shown as logged in, with an error.
- [ ] **Step 4:** Run all suites. Commit and open PR C.

### Task 4 (PR D): Backend robustness. Opus review.

**Findings:** CONC-1, ERR-1, DUP-1.

**Files:**
- `recipe/RecipeService.java`, `media/MediaService.java`
- `cookbook/CookbookService.java`
- `recipe/RecipePhotoController.java`, `account/MeController.java`
- `auth/AuthController.java`, `common/LoginAttempt.java` (or its actual location)
- Tests: `media/BlobOutsideTxIT.java`, plus the existing photo, cover and login ITs

- [ ] **Step 1: Failing ITs in `BlobOutsideTxIT`.**
  - `slowBlobWriteDoesNotBlockRecipeSave`: a `BlobStore` spy blocks `put` on a latch. While it's blocked, `PUT /api/recipes/{id}` on the same recipe completes within 2 s.
  - `failedBlobWriteLeavesNoRowAndNoBlob`: the spy throws on the second put. Expect the media row count unchanged and no stored blobs for the new id.
  - The same pair for the cookbook cover.
- [ ] **Step 2: CONC-1.** Write the blobs first, then run a short transaction that locks the row, re-checks access and the photo cap, and inserts the media row. Delete the blobs if that transaction fails. Fix the controller comments that claim a "short transaction".
- [ ] **Step 3: ERR-1.** `MeController`'s avatar upload acquires the processing slot before reading the file, as the recipe photo path does. Add `avatarUploadWaitsForSlotBeforeReading`, using the same spy approach as the existing busy IT.
- [ ] **Step 4: DUP-1.** `AuthController.login` uses `LoginAttempt.run`. The existing login and rate-limit ITs pass unchanged.
- [ ] **Step 5:** Run all suites. Commit and open PR D.

### Task 5 (PR E): AWS and CI. Sonnet review.

**Findings:** DATA-2, OPS-2, TEST-7, and the Lows TEST-19 and DOC-2.

**Files:**
- `infra/*.tf` (media bucket, backups bucket, the alarm)
- `infra/tests/*.tftest.hcl`, `infra/example.tfvars`
- `docs/deploy-aws.md` (or the actual runbook path)
- `.github/workflows/ci.yml`

- [ ] **Step 1: Failing tftest assertions.**
  - The media bucket has versioning `Enabled`, a lifecycle with `noncurrent_version_expiration.noncurrent_days == var.backup_retention_days`, and expired-delete-marker cleanup.
  - A CloudWatch alarm on the backups bucket's request metric for prefix `db/` treats missing data as breaching, uses a 26 h window, and targets the existing SNS topic.
- [ ] **Step 2:** Implement DATA-2 and OPS-2 as the report says, and document both in the runbook. Fix the `cloud-init` round-trip tftest so it compares the rendered files to fixed expected text (TEST-19). Make `example.tfvars` match the variable defaults (DOC-2).
- [ ] **Step 3: TEST-7.** Add an `infra` CI job that runs `scripts/infra-check.sh` (it includes the Terraform tests) and `scripts/backup-restore-check.sh`, using the existing job's setup.
- [ ] **Step 4:** Run `scripts/infra-check.sh` and `scripts/backup-restore-check.sh` locally. Commit and open PR E.

### Task 6 (PR F): Backend test quality. Sonnet review.

**Findings:** DUP-2, DUP-3, TEST-1, TEST-2, TEST-3, TEST-4, TEST-8, and the Lows DUP-10 and VERB-2.

**Files:**
- `backend/src/test/java/com/ricettine/IntegrationTest.java`
- New `backend/src/test/java/com/ricettine/testsupport/{TestData,Concurrently}.java`
- The ITs named in each finding

- [ ] **Step 1: DUP-3.** Move the per-class DB reset and the user bootstrap into `IntegrationTest`.
- [ ] **Step 2: DUP-2.** Add `TestData` builders for users, recipes, cookbooks and photos, and use them in place of the hand-rolled helpers.
- [ ] **Step 3: DUP-10.** Add `Concurrently.run(int threads, Callable<T>)`, which returns the results and always shuts its pool down. Use it everywhere a latch-and-pool harness appears.
- [ ] **Step 4: TEST-1.** Add an `@AfterEach` restore of the CSRF repository in `IntegrationTest`. Add `csrfRepositoryRestoredAfterTest`, which runs two ordered tests and checks that the second sees the default repository.
- [ ] **Step 5: New tests.**
  - TEST-2: positive controls and real assertions in the named profile, feed, robots and S3-timeout tests.
  - TEST-3: `visitorProfileJsonContainsNoPrivateIdsOrTokens` (string-level), and `selfViewThumbsAreServed`.
  - TEST-4: `PublicUrls` with a configured base URL and with forwarded headers. `If-None-Match` with weak, list and `*` forms.
  - TEST-8: each edge case in the finding, one test per bullet.

  These must pass against current production code. If one fails, stop and report it as a new bug; don't fix production code in this PR.
- [ ] **Step 6: VERB-2.** Fix fully qualified names, duplicate imports and import order in the test sources.
- [ ] **Step 7:** `./mvnw -q verify` passes, with the test count no lower than 320 plus the new tests. Commit and open PR F.

### Task 7 (PR G): Frontend and e2e quality. Sonnet review.

**Findings:** DUP-4, CONS-1, DUP-5, TEST-5, TEST-6, TEST-9, TEST-10, and the Lows DUP-12, DUP-13, CONS-6, VERB-4 and TEST-18.

**Files:**
- New `frontend/src/app/shared/confirm-dialog.component.ts` and `frontend/src/app/shared/sheet.ts`
- New `frontend/src/app/{account,admin,settings}/*.api.ts`
- New `frontend/src/app/testing/spec-helpers.ts`
- New `e2e/helpers/*.ts`
- The specs named in the findings

- [ ] **Step 1: DUP-4.** One `ConfirmDialogComponent`, taking title, message, confirm-label and danger flag as data, replaces the six dialogs. One `openSheet()` helper replaces the eight open-and-await-closed copies. The existing specs and e2e pass with the same i18n keys and the same DOM roles and labels.
- [ ] **Step 2: CONS-1 and DUP-12.** Add `AccountApi`, `AdminApi` and `SettingsApi`, matching the existing `*Api` style (promises via `firstValueFrom`), and use them in those pages. Extract the shared admin tab nav and the invite create/revoke logic.
- [ ] **Step 3: CONS-6 and VERB-4.** Use one `fieldErrorKey` and one i18n key set. Add an `errorKeyOf(e: unknown): string` helper and replace the 35 `errorKey(toApiError(e))` calls.
- [ ] **Step 4: DUP-13 and DUP-5.** Move the shared spec boilerplate to `testing/spec-helpers.ts`, and the shared e2e setup to `e2e/helpers/`.
- [ ] **Step 5: TEST-9.** Manually created Playwright contexts go through one helper that enables tracing and screenshots on failure.
- [ ] **Step 6: New and fixed tests.** TEST-5, TEST-6, TEST-10 and TEST-18, one spec per bullet in each finding. These must pass against current code; report any that fail as a new bug.
- [ ] **Step 7:** Run `ng test`, `ng build` and `scripts/e2e.sh`. Commit and open PR G.

### Task 8 (PR H): Low-finding cleanup. Sonnet review.

**Findings:** DEAD-2, CONS-3, CONS-5, VERB-1, DUP-6, DUP-7, DUP-8, OPS-3, DOC-1, DOC-3.

- [ ] **Step 1: Backend.**
  - CONS-3: move `RecipeRef` to the `recipe` package, and treat any non-null `shareToken` as set. Add an IT: `""` gives 404.
  - CONS-5: replace the deprecated `PAYLOAD_TOO_LARGE` and `org.springframework.lang.Nullable`, and fix names and imports.
  - VERB-1.
  - DUP-6: one `Ids.parse(String)`, which throws a 404 `ApiException`.
  - DUP-7: one token-lookup helper.
  - DUP-8: one index.html resource.
  - OPS-3: log the stale-session WARN once per session id, at DEBUG afterwards. Unit-test the dedupe.
- [ ] **Step 2: Frontend.** DEAD-2: remove the unused i18n keys and exports (confirm with knip first). DOC-1: replace `frontend/README.md` with a short pointer to the root README, and delete `.vscode` scaffolding nobody uses.
- [ ] **Step 3: DOC-3.** Update the CLAUDE.md package and command lists to match the code, and remove the test commands the README duplicates.
- [ ] **Step 4:** Run all suites. Commit and open PR H.

### Task 9 (PR I): Prettier pass. Sonnet review.

**Finding:** DEP-1.

- [ ] **Step 1:** Run `npx prettier --write .` in `frontend/`, as a single commit with no other change. Add a `format:check` npm script, and run it in the CI `frontend` job.
- [ ] **Step 2:** `npx prettier --check .` exits 0, and `ng test` and `ng build` pass. Commit and open PR I.
