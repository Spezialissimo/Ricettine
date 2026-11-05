# Plan 5 — Hosting & CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ricettine runs on the internet safely and cheaply. The image is published multi-arch to ghcr, so self-hosters upgrade with `docker compose pull`. An optional Caddy overlay adds HTTPS. One Terraform stack runs the same compose setup on a small ARM EC2 in an EU region, behind CloudFront, with photos in S3 and a nightly `pg_dump` to S3. The app gains the hardening a public deployment needs: rate limits, `noindex`, ETags, S3 timeouts, and sessions that survive upgrades.

**Architecture:** The app stays cloud-agnostic. It speaks plain HTTP behind a proxy, and the existing S3 adapter is its only AWS-specific code. All public traffic goes **viewer → CloudFront → Caddy on EC2 (HTTPS, origin secret) → app**. The app keeps serving `/media/**` itself, so its access policies and unguessable tokens still decide every photo read. CloudFront caches only responses the app marks `public` (avatars). Postgres and Caddy state live on a separate encrypted EBS volume, and media lives in a private S3 bucket. Infrastructure is Terraform in `infra/terraform`. It is checked offline with `terraform test` and mock providers, so no AWS account is touched until the owner approves.

**Tech Stack:** Existing (Spring Boot 4.1.2, Java 25, Postgres 17, Angular 22, Playwright). New: Caddy 2 (official image), Terraform ≥ 1.9 with the AWS provider 6.x (run through the `hashicorp/terraform` Docker image), GitHub Actions `docker/*` actions, `rhysd/actionlint` and `koalaman/shellcheck` images. No new Java or npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md`: §9.2 (self-hosting), §9.3 (AWS), §8 (EU region), §10 (multi-arch CI), and §1 anti-goals (cost, one command, guessable links). Entry criteria: the "Plan 5 (hosting & CI)" sections of `2026-11-03-plan-1-followups.md`, `2026-11-04-plan-2-followups.md` and `2026-11-04-plan-3-followups.md`, plus Plan 4's deferred `/u/**` rate-limit and noindex items (its "Out of scope" list).

## Delivery: 7 small PRs
Each PR gets its own branch, stacked on the previous one. **CI does not run** (the Actions account is locked). The gate is the local suites, run quietly with the exit code checked: `./mvnw verify`, `ng test --watch=false`, `ng build`, `scripts/e2e.sh`, plus the PR's own check script. Every PR description says "CI did not run (Actions account locked); local gate: …" and lists the commands and their results.

| PR | Branch | Tasks | Result | Whole-PR review |
|---|---|---|---|---|
| A | `feat/p5-rate-limits` | 1–2 | Login, auth-form, upload and profile rate limits; per-recipe photo cap; `Retry-After` | **opus** (security) |
| B | `feat/p5-serving` | 3–4 | `noindex` everywhere; media ETag/304; members' covers revalidate | no |
| C | `feat/p5-robustness` | 5 | S3 timeouts, multipart config, unreadable sessions become "logged out" | no |
| D | `feat/p5-image` | 6–7 | Published multi-arch image, `docker compose pull` upgrade path, CI publish job | no |
| E | `feat/p5-https` | 8 | `compose.https.yaml` + Caddy, documented and smoke-tested | no |
| F | `feat/p5-backup` | 9 | `deploy/backup.sh` / `restore.sh` with a tested restore drill | no |
| G | `feat/p5-aws` | 10–11 | Terraform stack + runbook + post-apply verify script | **opus** (infra security) |

Task 12 is not a PR. It is the owner-gated apply.

**Sequencing (owner decision, 2026-11-05):** PRs A–G merge first. Terraform is built and checked offline, but nothing is applied. Two separate plans follow before any deployment:
- **Plan 6, code audit.** It covers the whole codebase, including this plan's proxy and Terraform code.
- **Plan 7, UI update, led by the owner.**
  - The owner walks through the running app (local stack, both layouts) and gives feedback page by page.
  - The feedback is collected into a list, and Plan 7 is written from that list and then executed.
  - Nothing is redesigned before the owner's feedback.

Task 12 (the AWS deployment) starts only after Plans 6 and 7 are merged. The owner wants the deployment live for a few months while job hunting, so Task 12 is sized for that: a $10 budget alert, a teardown section and a credits-aware cost table.

## Rulings (made while planning; cost if wrong)
- **CloudFront fronts the whole site, and the app still serves photos.** One distribution has the domain as its alias and Caddy on EC2 as its origin. `/media/*` has a cache behaviour that honours the origin's `Cache-Control`, and everything else is uncached. Recipe and cookbook photos are already `private`, so CloudFront never stores them. Avatars are `public, immutable`, so they are cached at the edge with max TTL capped at 1 day (account deletion then clears the edge within a day). This keeps §4.5 (unguessable photo URLs, link reset revokes) with zero new app code, and keeps the app portable. *Cost if wrong:* if direct S3→CloudFront signed URLs are wanted later, that is a new `MediaUrlSigner` in the S3 adapter plus an OAC origin, about one PR.
- **CloudFront → origin is HTTPS to `origin.<domain>`.** Caddy gets a Let's Encrypt cert through HTTP-01, so port 80 is open to the world. Caddy uses port 80 only for ACME and a redirect. Port 443 is open only to the CloudFront origin-facing managed prefix list. Caddy also rejects any request without the secret `X-Origin-Verify` header (403), because other people's CloudFront distributions share that prefix list. No SSH: access is through SSM Session Manager. *Cost if wrong:* a CloudFront VPC origin needs a private subnet plus NAT (+$32/month), so it's rejected on cost.
- **The client IP for rate limits is `request.getRemoteAddr()`**, after Spring's `forward-headers-strategy: framework`, which reads the first `X-Forwarded-For` value. Each proxy config makes that value trustworthy. Self-host Caddy ignores the client's incoming XFF and sends the peer IP (Caddy's default for untrusted peers). The AWS Caddyfile overwrites XFF with the IP part of `CloudFront-Viewer-Address`, a header the viewer cannot set. Without a proxy (plain zero-config `:8080`), XFF can be spoofed, so **per-account limits never depend on the IP**. *Cost if wrong:* a `ricettine.security.client-ip-header` property.
- **Rate limits live in memory, per instance** (one instance by design). Each limiter is a fixed window over a bounded LRU of **50 000 keys**, so key churn cannot exhaust memory. The limits are restarted fresh on deploy, which is accepted. *Cost if wrong:* a Postgres-backed limiter behind the same interface.
- **`noindex` covers everything, not just `/r/**`, `/c/**`, `/u/**`.** Every response carries `X-Robots-Tag: noindex, nofollow`, and `index.html` has `<meta name="robots" content="noindex, nofollow">`. The instance is invite-only, so nothing on it is meant for search engines. There is **no** `robots.txt` `Disallow`, because a disallowed crawler never sees the noindex. *Cost if wrong:* a path list in one filter, once the influencer platform wants indexing.
- **Unreadable sessions mean logged out.** Sessions stay Java-serialized. A deserialization failure (e.g. after a Spring Security bump) yields a missing attribute, so the request gets 401 and the SPA routes to login. It never turns into a 500 loop. *Cost if wrong:* a JSON serializer plus a one-time `spring_session` wipe migration.
- **No image-processing timeout** (plan-2 "consider" item). The 2-permit limiter, the 15 MB cap and the 250 MP cap already bound the work. The item stays in the plan-2 file. *Cost if wrong:* a `Future.get(timeout)` around the decode.
- **Image publishing while Actions is blocked:** `scripts/publish-image.sh` builds and pushes the same tags that the CI `publish` job would. It pushes to a public registry, so the implementer **asks the owner before running it**. The owner logs in to ghcr and makes the package public once.
- **Compose split:** `compose.yaml` becomes image-only (`ghcr.io/spezialissimo/ricettine:${RICETTINE_VERSION:-latest}`), so `docker compose up -d` pulls and needs no toolchain. `compose.build.yaml` adds `build: .` and the local tag `ricettine:local`. Scripts export `COMPOSE_FILE=compose.yaml:compose.build.yaml` so every nested compose call (including the e2e `restart` project) sees both files. Service, volume and project names are unchanged, so existing installs keep their data.
- **Terraform state is local** (`infra/terraform/terraform.tfstate`, gitignored, and it holds secrets). The runbook tells the owner to keep a copy. *Cost if wrong:* an `s3` backend block and `terraform init -migrate-state`.
- **Region default `eu-west-1`**, validated to start with `eu-`. **Instance `t4g.small`** (2 GiB). See the cost table in Task 10; whether to buy a 1-year Savings Plan is the owner's billing call, outside IaC.
- **Terraform creates the Route 53 hosted zone** (`aws_route53_zone.main`) and outputs its four `name_servers`. The owner buys the domain at any registrar (GoDaddy, Porkbun, Cloudflare…). There is no AWS account yet, so nothing exists to import. The first deploy is two steps:
  1. `terraform apply -target=aws_route53_zone.main`, then the owner sets the registrar's custom nameservers to the output.
  2. Once `dig NS <domain>` shows the Route 53 servers, a full `terraform apply`. The ACM DNS validation needs the delegation.

  A free `*.cloudfront.net` address alone was rejected: the origin still needs a hostname with a certificate, and Let's Encrypt refuses `*.amazonaws.com` names. *Cost if wrong:* switching to an existing zone is a `data` source and one `moved`/`removed` block.
- **Spend alarm:** `aws_budgets_budget` with a monthly COST limit of `var.monthly_budget_usd` (default 10), with `cost_types.include_credit = false` so it shows gross spend while credits hide the bill. It emails `var.alert_email` at 80 % ACTUAL and 100 % FORECASTED. The first two budgets are free.
- **Secrets go to SSM Parameter Store (SecureString)**, not user-data: the Postgres password and the origin secret (both `random_password`). The instance reads them at boot.
- **The backup host can't delete backups:** the instance role has `s3:PutObject` on the backups bucket but no Delete, and old dumps expire through a lifecycle rule. Media bucket versioning is off, because a deleted account's photos must actually disappear (§3, §8).
- **Plan 4 follow-ups pulled in:** none touch what Plan 5 builds, so they stay in their file. **Pulled from "Before a native Android client":** `Retry-After` on the existing 503 `busy` responses. The 429 plumbing makes it one line each. Every other Android item stays possible: all new errors are JSON ProblemDetail with a `code`, and nothing new is web-only.

## Global Constraints
- All Plan 1–4 Global Constraints still hold:
  - Server-assigned ids.
  - ProblemDetail + `code`.
  - Every UI string goes through Transloco `en.json`.
  - 44 px targets.
  - Flyway-only schema (next is `V10`).
  - A denied read is a 404 that never reveals existence.
- **Self-hosting stays one command with zero required config:** `docker compose up -d` on a fresh checkout (or with only `compose.yaml` downloaded) serves `http://localhost:8080` with first-run setup. HTTPS, S3 and backups are opt-in overlays and variables.
- **429 contract:** status 429, `code: "too_many_attempts"`, header `Retry-After: <seconds>` (integer, ≥ 1), and the same seconds in a `retryAfter` ProblemDetail property. The 503 `busy` responses gain `Retry-After: 10`. `too_many_attempts` and `too_many_photos` go into `KNOWN_ERROR_CODES` and `en.json`.
- **Limits** (all in `ricettine.limits.*`, defaults below):

  | Name | Key | Counts | Limit / window |
  |---|---|---|---|
  | `login-account` | normalized email (known or not) | failed logins | 10 / 15 min |
  | `login-ip` | client IP | failed logins | 30 / 15 min |
  | `anonymous-auth` | client IP | every POST to `/api/setup/**`, `/api/invites/*/register`, `/api/password-resets/*` | 30 / 15 min |
  | `uploads` | user id | every photo upload (recipe, cookbook cover, avatar) | 60 / 10 min |
  | `profile` | user id | `GET /api/users/*/profile` | 120 / 1 min |

  A successful login clears that account's counter. Limits are checked **before** any password hash or image decode.
- **Per-recipe photo cap: 150** `media` rows with that `recipe_id`, orphans included (100 steps + cover + headroom). Upload 151 → 409 `too_many_photos`.
- **Never log tokens:** no proxy access logs (Caddy's default, with no `log` directive), and CloudFront standard logging stays off. Invite, reset and share tokens sit in URL paths.
- **AWS invariants:**
  - EU region only.
  - No ECS, RDS, ELB/ALB/NLB or NAT gateway.
  - Both buckets: all four public-access blocks on, owner-enforced, SSE-S3, a TLS-only bucket policy.
  - EBS volumes encrypted; IMDSv2 required; no port 22.
  - 443 open only from the CloudFront prefix list.
- **Target cost ≈ $5–15/month**, sized in Task 10's table.
- Shell scripts pass `shellcheck`. Workflows pass `actionlint`. Terraform passes `fmt -check`, `validate` and `test`. All of these run in Docker through `scripts/infra-check.sh` (nothing is installed on the host). Docker runs on Colima: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

## Review Focus
1. **Spoofed `X-Forwarded-For` behind each proxy** must not reset per-IP limits: rotating XFF values through self-host Caddy, or through the AWS Caddyfile with a fixed `CloudFront-Viewer-Address`, still hits 429 on the 31st request. Tested in Task 8 (`https-smoke.sh`).
2. **An existing install upgrading** with `git pull && docker compose pull && docker compose up -d` keeps its data: the same project, service and volume names, and the old `build:`-tagged image replaced by the ghcr one. Tested in Task 6 (`smoke.sh` asserts `docker compose config --volumes` = `app-data db-data` and that the app service image is the ghcr name).
3. **A private or tokenized photo is never served from the edge cache to someone else.** Every non-avatar media response carries `private` (Task 4 IT `everyNonAvatarResponseIsPrivate`). The `/media/*` cache policy keeps cookies out of the key with min/default TTL 0 (Task 11 test). `aws-verify.sh` fetches a tokenized photo twice and asserts no `Hit from cloudfront` (Task 11).
4. **Instance reboot or replacement** must not reformat the data volume or lose Postgres. `deploy/aws/mount-data.sh` runs `mkfs` only when `blkid` finds no filesystem. Tested with stubbed `blkid`/`mkfs`/`mount` in `deploy/aws/mount-data.test.sh` (Task 10).
5. **A legitimate user after an attack on their account** gets 429 with an honest `Retry-After` and can log in once the window passes. The login form shows the message, not a generic error. Tested in Task 1 (`accountWindowExpires`, using an injected `Clock`) and Task 2 (e2e).

---

## PR A — Rate limits (`feat/p5-rate-limits`)

### Task 1: Rate limiter and auth limits

**Files:**
- Create: `backend/src/main/java/com/ricettine/common/RateLimiter.java`, `common/RateLimits.java`, `config/LimitsConfig.java`
- Modify:
  - `common/ApiException.java` (`retryAfter`)
  - `common/ProblemAdvice.java` (write the `Retry-After` header and the `retryAfter` property)
  - `auth/AuthController.java`, `setup/SetupController.java`, `invite/PublicInviteController.java`, `auth/PasswordResetController.java`
  - `config/BoundedPasswordEncoder.java`, `media/ProcessingLimiter.java` (`Retry-After: 10` on 503)
  - `application.yml` (`ricettine.limits.*`)
- Test: `common/RateLimiterTest.java`, `auth/LoginRateLimitIT.java`, `auth/IpRateLimitIT.java`; Create `e2e/compose.e2e.yaml`; Modify `IntegrationTest.java`, `scripts/e2e.sh`; extend `recipe/RecipePhotoBusyIT.java` (Retry-After)

**Interfaces:**
- `final class RateLimiter`:
  - `RateLimiter(int limit, Duration window, int maxKeys, Clock clock)`.
  - `Optional<Duration> check(String key)` returns the time until the window resets when the key is at its limit, and empty otherwise. It does not count.
  - `void hit(String key)` counts one event.
  - `void clear(String key)`.
  - Thread-safe. Fixed window per key, with keys in an access-ordered LRU capped at `maxKeys`.
- `@Component class RateLimits` holds the five named limiters from Global Constraints, built from `LimitsConfig` (`@ConfigurationProperties("ricettine.limits")`, with each entry `{limit, window}`).
  - Methods: `void checkLogin(String ip, String email)`, `void loginFailed(String ip, String email)`, `void loginSucceeded(String email)`, `void anonymousAuth(String ip)` (check, then hit), `void upload(UUID userId)` (check, then hit), `void profile(UUID userId)` (check, then hit).
  - Each throws `ApiException(429, "too_many_attempts").retryAfter(d)`.
- `ApiException retryAfter(Duration d)`. ProblemAdvice writes `Retry-After` as the ceiling in whole seconds (minimum 1) and the `retryAfter` property.

- [ ] **Step 1: Failing unit tests** `RateLimiterTest` (with a mutable test `Clock`):
  - `limit=3`: three `hit`s, then `check` is present, with a duration equal to the time left in the window.
  - After the window, `check` is empty.
  - `clear` resets.
  - With `maxKeys=2`, a third key evicts the least recently used.
  - 8 threads × 1000 `hit`s on one key give a count of exactly 8000. Expose `int count(String key)` package-private for this.
- [ ] **Step 2: Failing ITs:**
  - `LoginRateLimitIT`:
    - `accountLimited`: 10 bad passwords for `a@x` from 10 different `remoteAddr`s, then the 11th with the **correct** password → 429 `too_many_attempts`, a `Retry-After` header > 0 and ≤ 900, and `$.retryAfter` equal to it.
    - `successClears`: 9 failures, 1 success, then 9 more failures → none of them is 429.
    - `unknownEmailCountsToo`: 11 attempts on a non-existent email → 429 (same behaviour, so existence isn't revealed).
    - `limitedBeforeHashing`: once limited, the request doesn't reach the encoder (a spied `PasswordEncoder` sees no `matches` call).
    - `accountWindowExpires`: uses a `@TestConfiguration` replacing the `Clock` bean (or an `IntegrationTest`-level mutable clock if one exists; otherwise add one for the whole IT base so no new context is created). Advance 15 min → login succeeds.
  - `IpRateLimitIT` (limits overridden back to 30, see Step 4):
    - `ipLimited`: 30 failures from one IP over 30 different emails, then a 31st with a new email → 429.
    - `anonymousAuthLimited`: 30 `POST /api/password-resets/{random}` from one IP (404s), then the 31st → 429. A different IP → 404.
  - Extend `RecipePhotoBusyIT`: the 503 `busy` response has `Retry-After: 10`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. A `Clock` bean (`Clock.systemUTC()`) is added to `BeansConfig` if missing.
  - Tests set `remoteAddr` with `.with(r -> { r.setRemoteAddr("10.0.0.x"); return r; })` and use unique emails and IPs per test, because the limiter is shared across the context.
  - **Keep the existing suites green:** all MockMvc requests come from `127.0.0.1`, and the suite registers far more than 30 users.
    - `IntegrationTest` gets one inherited `@TestPropertySource` that sets `ricettine.limits.login-ip.limit` and `ricettine.limits.anonymous-auth.limit` to `100000`. This keeps one shared context, and the account, upload and profile limits stay at their defaults.
    - The two IP-limit tests (`ipLimited` and the anonymous-auth test) live together in `IpRateLimitIT`, which overrides both limits back to 30. That makes exactly one extra context.
  - **e2e:** create `e2e/compose.e2e.yaml`, which sets `RICETTINE_LIMITS_LOGINIP_LIMIT` and `RICETTINE_LIMITS_ANONYMOUSAUTH_LIMIT` to `100000` on `app`. `scripts/e2e.sh` adds it to every compose call. Every Playwright request comes from one Docker gateway IP.
- [ ] **Step 5:** `./mvnw verify` → green (quiet, exit 0).
- [ ] **Step 6:** Commit `feat(security): rate limits for login and anonymous auth forms`.

### Task 2: Upload and profile limits, photo cap, UI message (+ e2e)

**Files:**
- Modify:
  - `recipe/RecipePhotoController.java` (or `RecipeService.addPhoto`: limit, then cap, then decode)
  - `cookbook/CookbookCoverController.java`, `account/MeController.java` (avatar)
  - `profile/ProfileController.java`
  - `media/MediaRepository.java` (`long countByRecipeId(UUID)`)
- Modify frontend: `core/api-error.ts` (`too_many_attempts`, `too_many_photos`), `public/i18n/en.json`
  - `errors.too_many_attempts` = "Too many attempts. Please wait a few minutes and try again."
  - `errors.too_many_photos` = "This recipe has too many photos. Remove some before adding more."
- Test: `recipe/UploadLimitsIT.java`, `profile/ProfileRateLimitIT.java`; Create `e2e/tests/rate-limit.spec.ts`

- [ ] **Step 1: Failing ITs:**
  - `UploadLimitsIT`:
    - `uploadsLimitedPerUser`: 60 uploads with a 1×1 JPEG from `TestImages` spread over recipe photos, a cover and an avatar, then the 61st → 429. A second user → 201/200.
    - `photoCapPerRecipe`: insert 150 `media` rows for one recipe with `JdbcTemplate`, then the next upload → 409 `too_many_photos`. No blob is written: the `BlobStore` spy sees no `put`.
  - `ProfileRateLimitIT`: 120 profile GETs, then the 121st → 429; a different user → 200.
- [ ] **Step 2: Failing frontend spec:** `api-error.spec` maps both new codes to their keys (the existing keys-in-sync spec covers `en.json`).
- [ ] **Step 3: Failing e2e** `rate-limit.spec.ts` (mobile and desktop, a fresh email per project): 11 logins with a wrong password → the login form shows "Too many attempts. Please wait a few minutes and try again." (role `alert` or the form's existing error region).
- [ ] **Step 4:** Run → FAIL. **Step 5:** Implement. **Step 6:** `./mvnw verify`, `ng test`, `ng build`, `scripts/e2e.sh` → green.
- [ ] **Step 7:** Commit `feat: upload and profile rate limits, per-recipe photo cap`. Open PR A (opus whole-PR review).

---

## PR B — Serving headers (`feat/p5-serving`)

### Task 3: noindex everywhere (+ e2e)

**Files:**
- Create: `backend/src/main/java/com/ricettine/config/RobotsHeaderFilter.java` (a `OncePerRequestFilter`, ordered before Spring Security, so 401/404 responses carry it too)
- Modify: `frontend/src/index.html` (robots meta)
- Test: `config/RobotsHeaderIT.java`; Create `e2e/tests/noindex.spec.ts`

- [ ] **Step 1: Failing IT** `RobotsHeaderIT`: `X-Robots-Tag: noindex, nofollow` on each of these: `GET /`, `/r/x`, `/c/x`, `/u/x` (SPA), `/api/r/doesnotexist` (404), `/api/feed` anonymous (401), a granted `/media/...` image, and `/actuator/health`. `GET /robots.txt` → 404 (no Disallow file).
- [ ] **Step 2: Failing e2e** `noindex.spec.ts` (mobile and desktop): open a published recipe's `/r/` link and a cookbook's `/c/` link. The navigation response has the header `x-robots-tag: noindex, nofollow`, and `meta[name="robots"]` has content `noindex, nofollow`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat: noindex on every response`.

### Task 4: Media ETag and 304; members' covers revalidate

**Files:**
- Modify: `media/MediaController.java`, `cookbook/CookbookMediaAccessPolicy.java` (`CACHE` → `"private, no-cache"`)
- Test: extend `media/MediaAccessIT.java`, `cookbook/CookbookCoverIT.java`

**Interfaces:**
- Media responses carry a strong `ETag: "{mediaId}.{variant}"` (lowercase variant). Media blobs are immutable per id: a new upload means a new id.
- The order is: policy check (deny → 404), then `If-None-Match` match → 304 with the same `ETag` and `Cache-Control` and no body, **without loading the blob**. Otherwise 200 as today.

- [ ] **Step 1: Failing ITs:**
  - `etagAndNotModified`: a token-granted recipe photo → 200 with an `ETag`. Repeating with `If-None-Match` → 304 with the `ETag` and `private, no-cache`. A `BlobStore` spy sees no second `get`.
  - `notModifiedStillChecksAccess`: after the owner resets the share link, the old `?s=` with the right `If-None-Match` → 404, not 304.
  - `differentUploadsDifferentEtags`.
  - `everyNonAvatarResponseIsPrivate`: recipe photos (owner, token, cookbook grant) and cookbook covers (member, token) all have a `Cache-Control` starting with `private`. Avatars are `public`.
  - `CookbookCoverIT`: a member's cover → `private, no-cache`. A removed co-author's next request → 404.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify`, `scripts/e2e.sh` → green.
- [ ] **Step 5:** Commit `feat(media): ETag and 304; cookbook covers revalidate`. Open PR B.

---

## PR C — Robustness (`feat/p5-robustness`)

### Task 5: S3 timeouts, multipart config, unreadable sessions

**Files:**
- Modify: `media/S3BlobStore.java`, `media/StorageConfig.java` (timeouts from properties)
- Modify: `application.yml`:
  - `ricettine.storage.s3.api-call-timeout: PT30S`, `api-call-attempt-timeout: PT10S`, `connection-timeout: PT5S`.
  - `spring.servlet.multipart.file-size-threshold: 0` and `location: ${java.io.tmpdir}/ricettine-uploads`, created at startup.
  - `server.tomcat.max-swallow-size: 16MB`.
- Create: `config/SessionConversionConfig.java` (a `springSessionConversionService` bean: the serializing converter plus a deserializing converter that logs one WARN line and returns `null` on any failure)
- Modify: `README.md` (new S3 timeout variables in the configuration table)
- Test: `media/S3BlobStoreTimeoutTest.java`, `auth/UnreadableSessionIT.java`, `media/S3BlobStoreRealIT.java`, extend `media/MediaIT.java`

**Interfaces:**
- `S3BlobStore.create(String bucket, String region, String endpoint, boolean pathStyle, S3Timeouts t)`, with `record S3Timeouts(Duration apiCall, Duration attempt, Duration connect)`. Wired to `ClientOverrideConfiguration.apiCallTimeout/apiCallAttemptTimeout` and the HTTP client `connectionTimeout`. Retries stay at the SDK default.

- [ ] **Step 1: Failing tests:**
  - `S3BlobStoreTimeoutTest`: a `ServerSocket` on a random port that accepts and never answers. A store with timeouts 1 s / 500 ms / 500 ms → `put` throws within 3 s (`assertTimeoutPreemptively(Duration.ofSeconds(5), …)`).
  - `UnreadableSessionIT`: log in and grab the `SESSION` cookie. Overwrite every `spring_session_attributes.attribute_bytes` row of that session with `{0x00, 0x01}` through `JdbcTemplate`. `GET /api/me` with the cookie → 401 `not_authenticated` (not 500). A fresh login with the same browser cookie jar → 200.
  - `MediaIT.oversizeUploadIs413`: a 16 MB + 1 byte multipart → 413 `file_too_large` (pins the existing contract under the new multipart config).
  - `S3BlobStoreRealIT` is `@EnabledIfEnvironmentVariable(named = "RICETTINE_S3_IT_BUCKET", matches = ".+")`. With the default credential chain against real AWS, it runs put/get/delete under `it-check/{uuid}` and checks that a missing key → empty. It is skipped locally. Task 12 runs it (closes the plan-1 "re-test S3 against real AWS" item).
- [ ] **Step 2:** Run → FAIL (the real IT is skipped). **Step 3:** Implement. **Step 4:** `./mvnw verify`, `scripts/e2e.sh` → green.
- [ ] **Step 5:** Commit `feat: S3 timeouts, multipart limits, unreadable sessions log out`. Open PR C.

---

## PR D — Published multi-arch image (`feat/p5-image`)

### Task 6: Compose split, upgrade path, multi-arch smoke

**Files:**
- Modify:
  - `compose.yaml` (image-only, `${RICETTINE_VERSION:-latest}`; the `build:` key moves out)
  - `Dockerfile`:
    - Replace `dependency:resolve || true` with `dependency:go-offline` (no `|| true`; if a plugin cannot resolve offline, use `dependency:resolve-plugins dependency:resolve`, still with no `|| true`).
    - Add the label `org.opencontainers.image.source=https://github.com/Spezialissimo/Ricettine`.
  - `scripts/e2e.sh` (`export COMPOSE_FILE=compose.yaml:compose.build.yaml:e2e/compose.e2e.yaml`), `scripts/smoke.sh` (`export COMPOSE_FILE=compose.yaml:compose.build.yaml`)
  - `README.md` (Quick start, Upgrading, `RICETTINE_VERSION`), `CLAUDE.md` (Commands)
- Create:
  - `compose.build.yaml` (`app: { build: ., image: ricettine:local }`)
  - `scripts/multiarch-check.sh`
  - `scripts/publish-image.sh`
- Modify `smoke.sh` to support `SMOKE_PLATFORM` (sets `DOCKER_DEFAULT_PLATFORM`) and assert the running architecture.

**Interfaces:**
- `smoke.sh` adds these checks:
  - `docker compose -f compose.yaml config --volumes` sorted = `app-data db-data`.
  - `docker compose -f compose.yaml config --images` contains `ghcr.io/spezialissimo/ricettine:latest`.
  - When `SMOKE_PLATFORM` is set, `docker compose exec -T app uname -m` = `aarch64` for `linux/arm64` or `x86_64` for `linux/amd64`.
- `multiarch-check.sh`:
  1. `docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile .`, using a `docker-container` builder that it creates if missing. No push, no load: this proves both platforms build.
  2. `SMOKE_PLATFORM=linux/arm64 scripts/smoke.sh`.
  3. `SMOKE_PLATFORM=linux/amd64 SMOKE_TIMEOUT=900 scripts/smoke.sh` (QEMU on Colima).
- `publish-image.sh [version]`: buildx `--platform linux/amd64,linux/arm64 --push` with tags `latest` and `sha-<short>`, plus `<version>` when given. It refuses to run with a dirty tree or off `main`. It ends with an anonymous check: `DOCKER_CONFIG=$(mktemp -d) docker buildx imagetools inspect ghcr.io/spezialissimo/ricettine:latest` lists both platforms.
- README "Upgrading": `docker compose pull && docker compose up -d`. Migrations run on startup. Pin a version with `RICETTINE_VERSION=x.y.z` in `.env`. A "Building from source" note covers `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

- [ ] **Step 1: Failing check:** add the new `smoke.sh` assertions first and run `scripts/smoke.sh` → FAIL on the image-name assertion.
- [ ] **Step 2:** Implement the compose split, Dockerfile and scripts. **Step 3:** `shellcheck` every script through `scripts/infra-check.sh` (introduced in Task 7; until then, run `docker run --rm -v "$PWD":/mnt koalaman/shellcheck:stable scripts/*.sh`).
- [ ] **Step 4:** `scripts/multiarch-check.sh` → exit 0. Then `scripts/e2e.sh` → green (it now builds through `compose.build.yaml`).
- [ ] **Step 5:** Commit `feat: publishable multi-arch image; compose pull upgrade path`.
- [ ] **Step 6: Owner gate.** Ask the owner: "OK to push `ghcr.io/spezialissimo/ricettine:latest` (amd64 + arm64) with `scripts/publish-image.sh`? You need `docker login ghcr.io` with a PAT that has `write:packages`, and afterwards the package must be set to public once." Run it only on a yes. Record the anonymous-inspect output in the PR.

### Task 7: CI publish job and infra checks

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/infra-check.sh` (it grows in Tasks 8–11)

**Interfaces:**
- `ci.yml`:
  - `on.push` gains `tags: ['v*']`.
  - New job `smoke-arm64` (`runs-on: ubuntu-24.04-arm`, `scripts/smoke.sh`). Its comment closes the plan-1 arm64 item.
  - New job `publish`:
    - `if: github.event_name == 'push'`, `needs: [backend, frontend, e2e, smoke, smoke-arm64]`, `permissions: { contents: read, packages: write }`.
    - Steps: `docker/setup-qemu-action@v3`, `docker/setup-buildx-action@v3`, `docker/login-action@v3` (ghcr, `GITHUB_TOKEN`), `docker/metadata-action@v5` (tags: `latest` on main, `type=semver,pattern={{version}}` on tags, `type=sha`), and `docker/build-push-action@v6` (`platforms: linux/amd64,linux/arm64`, `push: true`, `cache-from/to: type=gha`).
  - The existing jobs export `COMPOSE_FILE` through the scripts, so nothing else changes.
- `infra-check.sh` runs `actionlint` (`rhysd/actionlint:latest` pinned by version) on `.github/workflows` and `shellcheck` on `scripts/*.sh deploy/**/*.sh`. Each tool runs in Docker; the script exits non-zero on the first failure.

- [ ] **Step 1:** Write `infra-check.sh` and run it on the current tree → green (a baseline).
- [ ] **Step 2:** Edit `ci.yml`. **Step 3:** `scripts/infra-check.sh` → green. If you break a key on purpose (e.g. `needs: [nope]`), it must turn red. Revert the break.
- [ ] **Step 4:** Commit `ci: multi-arch publish to ghcr and arm64 smoke`. Open PR D. The description says the publish job has never run, because Actions is blocked. It was verified with actionlint and its local equivalent `publish-image.sh`.

---

## PR E — HTTPS with Caddy (`feat/p5-https`)

### Task 8: Caddy overlays and HTTPS smoke

**Files:**
- Create:
  - `compose.https.yaml`:
    - The `caddy` service: `caddy:2.10-alpine`, pinned. Ports `80`, `443`, `443/udp`. Volumes `caddy-data` and `caddy-config`. It mounts `deploy/Caddyfile`. `RICETTINE_DOMAIN: ${RICETTINE_DOMAIN:?Set RICETTINE_DOMAIN}`.
    - The `app` service: `ports: !reset []` and `RICETTINE_BASE_URL: https://${RICETTINE_DOMAIN}`.
  - `deploy/Caddyfile`: site `{$RICETTINE_DOMAIN}`, `encode zstd gzip`, an HSTS header (`max-age=31536000`), `reverse_proxy app:8080`, no `log`.
  - `deploy/aws/Caddyfile`, for the origin behind CloudFront:
    - The site is `{$ORIGIN_DOMAIN}`.
    - A request without `X-Origin-Verify: {$ORIGIN_SECRET}` → 403, and so is a request without `CloudFront-Viewer-Address`.
    - `reverse_proxy app:8080` with `header_up X-Forwarded-For <ip part of CloudFront-Viewer-Address>` (strip the trailing `:port`, IPv4 or IPv6) and `header_up -X-Origin-Verify`.
    - No `log`.
  - `compose.aws.yaml` (used by Task 10; created here so the smoke can exercise it):
    - The `caddy` service mounts `deploy/aws/Caddyfile` and gets `ORIGIN_DOMAIN`/`ORIGIN_SECRET` from `.env`.
    - Volumes are bind-mounted under `${RICETTINE_DATA_DIR:-/srv/ricettine}` (`db`, `caddy`) through `driver_opts`.
    - S3 env passthrough: `RICETTINE_STORAGE_TYPE`, `RICETTINE_STORAGE_S3_BUCKET`, `RICETTINE_STORAGE_S3_REGION`.
  - `scripts/https-smoke.sh`
- Modify: `README.md` (an "HTTPS" section: DNS A record, ports 80/443, the one command, no access logs on purpose because tokens are in paths, plus a note for people who run their own proxy: set `X-Forwarded-For`/`-Proto` and disable access logs)

**Interfaces:**
- `https-smoke.sh` runs two rounds with `COMPOSE_FILE` including `compose.build.yaml`, `RICETTINE_DOMAIN=localhost` and a unique project name; the stack is torn down with `-v` in a trap. Caddy uses its internal CA for `localhost`, so `curl -k` is used. Checks:
  - **Self-host** (`compose.yaml:compose.build.yaml:compose.https.yaml`):
    - `http://localhost/` → 308 to `https://`.
    - `https://localhost/actuator/health` UP, with `Strict-Transport-Security` and `X-Robots-Tag`.
    - Nothing listens on `:8080` (curl fails).
    - Create the admin through `/api/setup` (CSRF cookie flow with a curl cookie jar). The `Set-Cookie: SESSION` has `Secure`. An admin invite's URL starts with `https://localhost/`.
    - 31 `POST /api/password-resets/{random}`, each with a different spoofed `X-Forwarded-For` → the 31st is 429.
    - `docker compose logs caddy` doesn't contain the random token used above.
  - **AWS origin** (`compose.yaml:compose.build.yaml:compose.aws.yaml`, with `ORIGIN_DOMAIN=localhost`, a test secret, `RICETTINE_DATA_DIR` = a temp dir and local storage):
    - No secret → 403. Secret but no `CloudFront-Viewer-Address` → 403. Both → 200.
    - 31 password-reset POSTs with a fixed `CloudFront-Viewer-Address: 203.0.113.7:4444` and rotating XFF → the 31st is 429.
    - 31 with rotating `CloudFront-Viewer-Address` (`203.0.113.N:1`) → no 429.
    - The IPv6 form `2001:db8::5:443` is accepted, so the strip works.
- `infra-check.sh` adds `caddy validate` (in the `caddy` image) for both Caddyfiles with dummy env.

- [ ] **Step 1:** Write `https-smoke.sh` → FAIL (the files don't exist yet). **Step 2:** Implement. **Step 3:** `scripts/https-smoke.sh`, `scripts/infra-check.sh`, `scripts/smoke.sh` → exit 0 (the base stack is unchanged).
- [ ] **Step 4:** Commit `feat: optional HTTPS with Caddy; CloudFront origin config`. Open PR E.

---

## PR F — Backups (`feat/p5-backup`)

### Task 9: Backup and restore scripts with a restore drill

**Files:**
- Create: `deploy/backup.sh`, `deploy/restore.sh`, `scripts/backup-restore-check.sh`
- Modify: `README.md` ("Backups" section, with a nightly `cron` example for self-hosters)

**Interfaces:**
- `deploy/backup.sh` runs from the compose directory and honours `COMPOSE_FILE`.
  - It writes `ricettine-{UTC yyyyMMdd'T'HHmmss'Z'}.dump` (`docker compose exec -T db pg_dump -U ricettine -d ricettine -Fc`).
  - When `RICETTINE_STORAGE_TYPE` is local (the default), it also writes `…-media.tar.gz` (`docker compose exec -T app tar -C /data -czf - media`).
  - The destination is `BACKUP_S3_URI` (`aws s3 cp`, with an `s3://…/` prefix) or else `BACKUP_DIR` (default `./backups`).
  - Exit non-zero on any failure (`set -euo pipefail`). A zero-byte dump is a failure.
- `deploy/restore.sh <dump> [media.tar.gz]`:
  1. Stop `app`.
  2. `pg_restore --clean --if-exists --no-owner -d ricettine`.
  3. Untar the media into `/data` (a one-off `app` container: `docker compose run --rm --no-deps -T app tar …`).
  4. Start `app` and wait for health.
- `backup-restore-check.sh`:
  1. Build-and-up an isolated project.
  2. Set up an admin and upload an avatar through the API.
  3. `backup.sh` into a temp dir.
  4. `down -v`, then up again: `setupRequired` is true.
  5. `restore.sh`: `setupRequired` false, the admin logs in, and the avatar URL → 200.
  6. Tear down `-v`.

- [ ] **Step 1:** Write the check → FAIL. **Step 2:** Implement. **Step 3:** `scripts/backup-restore-check.sh` and `scripts/infra-check.sh` → exit 0.
- [ ] **Step 4:** Commit `feat: backup and restore scripts with a restore drill`. Open PR F.

---

## PR G — AWS with Terraform (`feat/p5-aws`)

### Task 10: Core stack — network, instance, data volume, buckets, bootstrap

**Files** (all under `infra/terraform/` unless noted):
- Create: `versions.tf`, `providers.tf` (default `var.region` and an `aws.us_east_1` alias for ACM), `variables.tf`, `outputs.tf`
- Create: `network.tf`, `compute.tf`, `iam.tf`, `storage.tf`, `secrets.tf`, `templates/cloud-init.yaml.tftpl`
- Create: `deploy/aws/mount-data.sh`, `deploy/aws/mount-data.test.sh`, `deploy/aws/ricettine.service`, `deploy/aws/ricettine-backup.service`, `deploy/aws/ricettine-backup.timer`, `deploy/aws/start.sh` (fetches SSM params, writes `.env`, runs `docker compose pull && up -d`)
- Create: `infra/terraform/tests/core.tftest.hcl`, `docs/deploy-aws.md` (runbook)
- Modify: `.gitignore` (`infra/terraform/.terraform/`, `*.tfstate*`, `*.tfvars` except `example.tfvars`), `scripts/infra-check.sh` (terraform `fmt -check -recursive`, `init -backend=false`, `validate`, `test`; `mount-data.test.sh`; a grep guard that fails on `resource "aws_(db_instance|rds_|lb|alb|ecs_|nat_gateway)`)

**Interfaces:**
- **Variables:**
  - `region` (default `"eu-west-1"`, validation `startswith(var.region, "eu-")`).
  - `domain_name` (required).
  - `origin_subdomain` (default `"origin"`).
  - `instance_type` (default `"t4g.small"`, validation `startswith(…, "t4g.")`).
  - `data_volume_gb` (default 20).
  - `backup_retention_days` (default 30).
  - `image_tag` (default `"latest"`).
  - `alert_email` (required).
  - `monthly_budget_usd` (default 10).
- **Budget:** `aws_budgets_budget` as in Rulings, in `budget.tf`.
- **Network:**
  - A `/16` VPC with one public subnet and an IGW. No NAT.
  - The SG allows ingress 80/tcp from `0.0.0.0/0` and `::/0`, and 443/tcp from `data.aws_ec2_managed_prefix_list` `com.amazonaws.global.cloudfront.origin-facing`. Egress is all.
- **Compute:**
  - AL2023 arm64 AMI from SSM `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64`, with `lifecycle.ignore_changes = [ami, user_data]` so a new AMI never replaces the host by surprise.
  - `metadata_options.http_tokens = "required"`. Encrypted root of 8 GiB.
  - An EIP, so the origin record stays stable.
  - `aws_ebs_volume.data`: gp3, encrypted, `prevent_destroy`, in the same AZ. Attached as `/dev/sdf`.
- **IAM:** the instance profile gets:
  - `AmazonSSMManagedInstanceCore`.
  - Media bucket: `s3:GetObject/PutObject/DeleteObject` on `arn/*`.
  - Backups bucket: `s3:PutObject` on `arn/db/*` only.
  - `ssm:GetParameter(s)` on `/ricettine/*`.
- **Storage:** `media` and `backups` buckets with the invariants from Global Constraints. The backups bucket expires objects after `backup_retention_days`.
- **Secrets:** `random_password` for Postgres (32) and the origin secret (48), saved as SecureString `/ricettine/postgres-password` and `/ricettine/origin-secret`.
- **Cloud-init** (`templatefile`):
  1. Install `docker`. Install the compose plugin as a pinned version, downloaded for `aarch64` and checked against its sha256.
  2. Run `mount-data.sh` (label `ricettine-data` → `/srv/ricettine`, fstab by `LABEL`, `nofail`).
  3. Write `/opt/ricettine/` (`compose.yaml`, `compose.aws.yaml`, `deploy/aws/Caddyfile` and `deploy/backup.sh`, each embedded with `file()` from the repo) and the systemd units.
  4. Enable `ricettine.service` and `ricettine-backup.timer` (`OnCalendar=*-*-* 03:00:00 UTC`, `Persistent=true`, `BACKUP_S3_URI=s3://<backups>/db/`).
- **Outputs:** `instance_id`, `origin_ip`, `media_bucket`, `backups_bucket`, `ssm_session_command`.
- **Cost table** (in `docs/deploy-aws.md`, eu-west-1, on-demand, approximate; the runbook says to confirm with the AWS calculator):

  | Item | $/month |
  |---|---|
  | t4g.small | ~12–13.5 |
  | Public IPv4 (EIP) | ~3.6 |
  | EBS gp3 8 + 20 GiB | ~2.3 |
  | Route 53 zone | 0.5 |
  | S3 + CloudFront (free tier) | ~0–1 |

  - The total is ≈ $18–21/month on-demand.
  - A new AWS account (opened after 15 July 2025) gets $100 in credits at sign-up and up to $100 more for onboarding tasks. The credits expire 12 months after the account opens. That's roughly 4–5 months of this stack on the first $100, or 9–10 months on $200.
  - The domain registration is separate and probably not covered.
  - The runbook advises choosing the **paid plan** at sign-up, or upgrading before month 6. The free plan closes the account after 6 months or when the credits run out, whichever comes first. The paid plan still uses the credits first.
  - A 1-year Savings Plan (≈ $13–15 total) is only worth considering after the credits.
  - `t4g.micro` (≈ $12 total) is documented as not recommended: JVM + Postgres + Caddy in 1 GiB.

- [ ] **Step 1: Failing tests:**
  - `mount-data.test.sh`, with PATH-stubbed `blkid`, `mkfs.ext4`, `mount` and `e2label` that record calls: when blkid reports a filesystem, mkfs is never called; when blkid reports none, mkfs is called once with `-L ricettine-data`. Running twice is idempotent (the fstab line appears once).
  - `core.tftest.hcl`: `mock_provider "aws"` and `mock_provider "random"`, with `override_data` for the AMI parameter, prefix list and AZs. `command = plan` asserts:
    - Both buckets have all four public-access blocks true.
    - The SG has no rule on port 22, and 443 only references the prefix list.
    - The root and data volumes are encrypted, and the data volume has `prevent_destroy` (asserted through `terraform validate` plus a grep in `infra-check.sh`, because tftest can't read lifecycle).
    - IMDSv2 is required.
    - The backups lifecycle expiration = `var.backup_retention_days`.
    - The rendered IAM policy JSON has no `s3:DeleteObject` on the backups bucket.
    - The rendered user-data contains `ricettine-backup.timer` and no plaintext secret (it doesn't contain the mocked password value).
    - `region = "us-east-1"` → `expect_failures = [var.region]`.
    - The budget: limit = `var.monthly_budget_usd`, `include_credit = false`, two notifications (80 ACTUAL, 100 FORECASTED) to `var.alert_email`.
- [ ] **Step 2:** `scripts/infra-check.sh` → FAIL. **Step 3:** Implement. **Step 4:** `scripts/infra-check.sh` → exit 0.
- [ ] **Step 5:** Commit `feat(infra): core AWS stack (EC2, EBS, S3, IAM, bootstrap)`.

### Task 11: Edge — ACM, CloudFront, Route 53, post-apply verify

**Files:**
- Create: `infra/terraform/edge.tf`, `infra/terraform/dns.tf`, `infra/terraform/tests/edge.tftest.hcl`, `scripts/aws-verify.sh`, `infra/terraform/example.tfvars`
- Modify: `docs/deploy-aws.md`, `README.md` (a link to the runbook)

**Runbook sections** (`docs/deploy-aws.md`):
1. **Account setup** (owner, once):
   - Create the AWS account on the paid plan; see the credits note in the cost table.
   - Turn on MFA for the root user, then never use root again.
   - Create an IAM Identity Center user with `AdministratorAccess` and use it through `aws configure sso`.
   - Do the onboarding tasks for the second $100.
   - Buy the domain at any registrar.
2. **First deploy:** the two-step zone delegation from Rulings, then the full apply.
3. **Upgrade:** `docker compose pull && up -d` through SSM, with `image_tag` pinning.
4. **Restore from S3.**
5. **Rotate the origin secret.**
6. **Cost and budget.**
7. **Teardown:**
   - Take a final `backup.sh` to a local `BACKUP_DIR` and download the latest S3 dump.
   - Lift `prevent_destroy` on the data volume, then `terraform destroy`.
   - Buckets set `force_destroy = false`, so empty them first, deliberately.
   - Remove the registrar's NS records.
   - Check the Billing console the next day.

**Interfaces:**
- **Zone:** `aws_route53_zone.main` for `domain_name`. Output `name_servers`.
- **ACM:** in `aws.us_east_1`, a certificate for `domain_name`, DNS-validated through `aws_route53_zone.main`.
- **Distribution:**
  - Alias `domain_name`. `price_class = "PriceClass_100"`, IPv6 on, logging off.
  - Origin: `{origin_subdomain}.{domain_name}`, `https-only`, TLSv1.2, with the custom header `X-Origin-Verify` = the origin secret.
  - Default behaviour:
    - All methods, `redirect-to-https`, compress.
    - Managed `CachingDisabled` cache policy and managed `SecurityHeadersPolicy` response headers.
    - A custom origin request policy that forwards all cookies and all query strings, plus the header whitelist `Accept, Accept-Language, Content-Type, If-None-Match, If-Modified-Since, Origin, Referer, User-Agent, X-XSRF-TOKEN, CloudFront-Viewer-Address`.
  - Ordered behaviour `/media/*` (GET/HEAD): a custom cache policy with min 0, default 0, max 86400; query strings all in the key; no cookies or headers in the key; gzip/brotli off (JPEG). Same origin request policy.
- **DNS:** A/AAAA alias `domain_name` → distribution; A `origin.<domain>` → EIP.
- **Env:** `.env` on the host gets `RICETTINE_BASE_URL=https://{domain_name}`, `ORIGIN_DOMAIN`, and the S3 settings (written by `start.sh`).
- **`aws-verify.sh <domain>`** (read-only; needs AWS CLI credentials, run by the owner or with their go):
  - `https://<domain>/actuator/health` UP, with `x-robots-tag` and `strict-transport-security`.
  - `http://` → 301/308.
  - `https://origin.<domain>/` from this machine fails (SG: connect timeout ≤ 10 s).
  - `/media/nope/thumb.jpg` → 404.
  - `aws s3api get-public-access-block` on both buckets is all true.
  - The newest object under `db/` is < 26 h old (skipped with a warning on the first day).
  - When `VERIFY_TOKEN_PHOTO_URL` is given, two GETs → the second `x-cache` is not `Hit from cloudfront`.

- [ ] **Step 1: Failing test** `edge.tftest.hcl` (mock providers) asserts:
  - The origin protocol is `https-only` and the custom header name is `X-Origin-Verify`.
  - The viewer policy is `redirect-to-https`.
  - The `/media/*` cache policy: max TTL ≤ 86400, default TTL 0, cookie behaviour `none`.
  - The default behaviour uses the CachingDisabled policy id.
  - The origin request whitelist contains `CloudFront-Viewer-Address` and `X-XSRF-TOKEN`.
  - The certificate provider is the us-east-1 alias.
  - `logging_config` is absent.
  - The zone is created for `var.domain_name` and the `name_servers` output exists.
  - The validation records and aliases point at `aws_route53_zone.main`.
- [ ] **Step 2:** `scripts/infra-check.sh` → FAIL. **Step 3:** Implement (`aws-verify.sh` gets shellcheck only; it can't run without the deployment). **Step 4:** `scripts/infra-check.sh` → exit 0, then the full local gate (`./mvnw verify`, `ng test`, `ng build`, `scripts/e2e.sh`) as regression.
- [ ] **Step 5:** Commit `feat(infra): CloudFront, ACM and Route 53; post-apply verify`. Open PR G (opus whole-PR review).

---

## Task 12: Owner-gated deployment (no PR)
Starts only after Plans 6 (audit) and 7 (owner-led UI update) are merged. Nothing in this task runs without the owner's explicit yes at each gate.
- [ ] **Gate 1:** The owner has done the runbook's "Account setup":
  - the account on the paid plan, root MFA, an SSO profile in their shell;
  - the domain bought.

  Ask for:
  - the domain;
  - the alert email;
  - confirmation that the ghcr image is published and public (Task 6 Step 6).
- [ ] With credentials: `terraform init` and `terraform plan -target=aws_route53_zone.main -out=zone.bin` (read-only). Show it to the owner.
- [ ] **Gate 2:** Ask "Create the hosted zone?" Only on a yes: `terraform apply zone.bin`. Then:
  1. Give the owner the four `name_servers` to set at their registrar.
  2. Wait until `dig NS <domain> +short` lists them.
- [ ] `terraform plan -var-file=prod.tfvars -out=plan.bin` (read-only). Summarise it for the owner: resource counts by type, anything not matching Global Constraints, and the expected monthly cost against the remaining credits.
- [ ] **Gate 3:** Ask "Apply this plan?" Only on a yes: `terraform apply plan.bin`. Confirm that the budget alert email subscription arrived.
- [ ] After DNS and the certificate settle: `scripts/aws-verify.sh <domain>`. Also run `RICETTINE_S3_IT_BUCKET=<media bucket> ./mvnw -Dit.test=S3BlobStoreRealIT verify` with the owner's credentials (closes the plan-1 S3 item). Then do the first-run setup in a browser.
- [ ] The next morning: `aws-verify.sh` again (the backup is now < 26 h old), plus a restore drill per the runbook into a local stack.

---

## Out of scope (later)
- Auto-scaling, multi-instance, ECS/RDS/ALB (spec §9.3); blue/green deploys; a CloudWatch alarms stack (the runbook names it as a next step).
- CloudFront signed URLs or OAC for photos (see Rulings).
- A Postgres-backed or distributed rate limiter; a CAPTCHA.
- A JSON session serializer (see Rulings).
- A remote Terraform state backend.
- One-click self-host templates (spec §2).
- An image-processing timeout (stays in the plan-2 follow-ups).
- Everything else still open in the plan-1 to plan-4 follow-up files outside their "Plan 5" sections. The plan-1 Maven 401 metadata warning item can only be confirmed on the first real CI run, so it stays open.
