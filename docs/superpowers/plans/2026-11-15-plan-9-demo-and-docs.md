# Plan 9 — Public demo and portfolio docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, self-resetting demo at `demo.ricettine.food`. It is isolated from real data by a second database in the same Postgres, and seeded with about 12 Italian recipes. Then add generated screenshots and recruiter-facing docs with Mermaid diagrams.

**Architecture:**
- **Site per request:** every request belongs to a *site* (`MAIN` or `DEMO`), decided once by a servlet filter at the highest precedence from the header `X-Ricettine-Site`. Only the proxy sets that header, and it is honoured only when the demo is enabled. A `ThreadLocal` holds the site.
- **Routing:** an `AbstractRoutingDataSource` sends JPA, JdbcTemplate and Spring Session JDBC to the site's database. Blob keys get a per-site prefix.
- **Demo lifecycle:** on startup the app drops and recreates `ricettine_demo`, migrates it with Flyway and seeds it from a committed fixture.
- **Read-only:** on the demo site one filter refuses every state-changing API call. The SPA auto-signs visitors in and runs the editor locally.
- **On AWS:** a second CloudFront distribution for `demo.<domain>` adds the origin custom header `X-Ricettine-Site: demo`.

**Tech Stack:** Existing: Spring Boot 4 / Java 25, Spring Session JDBC, Flyway, Postgres 17, Angular 22 (zoneless, signals, Transloco), vitest, Playwright, Terraform 1.13 with mock-provider tests, Caddy 2.10. No new runtime dependencies. Docs checks use `@mermaid-js/mermaid-cli` in Docker.

**Spec:** `docs/superpowers/specs/2026-11-15-plan-9-demo-and-docs-design.md`. Entry criteria: `2026-11-03-plan-1-followups.md` (read; nothing in it blocks this plan) and PR #47 merged to `main`.

## Delivery: 4 PRs (owner)

| PR | Branch | Tasks | Review model |
|---|---|---|---|
| 1 | `feat/p9-site-routing` | 0–4 | opus (data isolation is sensitive) |
| 2 | `feat/p9-demo-mode` | 5–11 | opus for Task 5, otherwise default |
| 3 | `feat/p9-screenshots` | 12 | default |
| 4 | `feat/p9-docs` | 13–16 | default |

Each PR branches from `main` after the previous one merges. A PR is done only when CI is green: backend, frontend, e2e on **mobile and desktop**, smoke, smoke-arm64 and infra. Lean process applies: one review per task, no widened fix rounds, quiet test output.

## Rulings (made while planning; cost if wrong)

- **The site comes from a header, not from `Host`.** CloudFront sends `Host: origin.<domain>` for both distributions, and forwarding the viewer `Host` would break the origin's TLS. So:
  - The demo distribution adds the origin custom header `X-Ricettine-Site: demo`. CloudFront overwrites any viewer value.
  - The main distribution's origin request policy doesn't forward that header, so a viewer can't inject it.
  - The self-hosted Caddyfile overwrites the header in both site blocks.

  *Cost if wrong:* one filter method.
- **Spoofing on a directly exposed port is accepted.** On a bare `docker run -p 8080` with the demo enabled, a client can pick the site itself. That's harmless: every request still uses exactly one database, sessions live in that database, and the demo is read-only. It's documented next to the existing proxy/XFF note.
- **The app creates the demo database.** The compose `POSTGRES_USER` is a superuser and there is no init-script mechanism. On every start with the demo enabled, the app runs `DROP DATABASE IF EXISTS ricettine_demo WITH (FORCE)` then `CREATE DATABASE` on the main connection, before the demo pool opens. This is the reset. *Cost if wrong:* an init script in compose and start.sh.
- **Separate certificate and distribution for the demo,** gated by `var.demo_enabled` (default `false`). The live certificate and distribution stay untouched, and each distribution has its own media cache, so no cache-key work is needed. *Cost if wrong:* an extra SAN and a CloudFront Function.
- **Main backups are unchanged.** `backup.sh`/`restore.sh` already hard-code `-d ricettine`. The demo database is never backed up.
- **The new-recipe draft uses the route key `local`, not a server id.** In the demo, `/recipes/new` goes to `/recipes/local/edit`. The store recognises `local` and builds an empty recipe in memory. The key is never sent to the server. *Cost if wrong:* a dedicated route.
- **The demo editor has no autosave, no unsaved-backup, no leave guard and no beforeunload prompt.** A persistent notice says changes aren't saved. Save and Publish show the "not saved" toast. Photos are previews only, using object URLs revoked when the editor is destroyed.
- **Visible in the demo:** browsing, "New recipe", "Edit" on own recipes, Settings > Appearance and Settings > Language.
- **Hidden in the demo:**
  - Logout.
  - Delete recipe, share-link reset, add-to-cookbook.
  - New, edit and delete cookbook; cover changes; member and invite management.
  - Settings > Profile, Password and Delete account.
  - Admin.

  Any request the UI still sends gets 403 `demo_read_only`, and the global error toast shows the demo message.
- **The demo signals reach the SPA through the existing `GET /api/setup/status`,** extended to `{setupRequired, demo, demoUrl}`. `demo` is true on the demo site. `demoUrl` is set only on the main site when a demo is configured. *Cost if wrong:* a new endpoint.
- **Auto sign-in uses `POST /api/demo/session`.** It's anonymous, demo site only, signs in as `ospite` with a 1-day session, and is rate-limited per IP under `ricettine.limits.demo-session` (default 30 per 10 min).
- **Demo users:**
  - `davide`, "Davide", with the owner's avatar.
  - `ospite`, "Ospite", without an avatar.
  - Their emails are `davide@demo.invalid` and `ospite@demo.invalid`, and their passwords are random. Login is blocked on the demo site anyway.
- **Seeded cookbook membership** is written directly with `CookbookAuthorRepository`, because the invite path needs `PublicUrls` and a request.
- **Config keys (env vars):**
  - `ricettine.demo.enabled` (`RICETTINE_DEMO_ENABLED`, default false)
  - `ricettine.demo.url` (`RICETTINE_DEMO_URL`, for example `https://demo.ricettine.food`): the main site's button target and the demo site's `PublicUrls` base
  - `ricettine.demo.database` (default `ricettine_demo`)
  - `ricettine.demo.pool-size` (default 3)

## Global Constraints

- Server-assigned ids; ProblemDetail with `code`; every UI string through Transloco, with `en.json` and `it.json` parity (`core/i18n-parity.spec.ts`); 44 px touch targets; breakpoint 768 px; Flyway-only schema, never editing V1–V9.
- **With `ricettine.demo.enabled=false`, behaviour is byte-for-byte as today.** All existing backend, frontend and e2e tests pass unchanged.
- No request touches two databases. No code path reads or writes the main database while the site is `DEMO`, or the reverse.
- Demo content is entirely Italian. Photos come only from Unsplash or Pexels, each listed in the manifest. No TheMealDB images. No scraping of websites (TheMealDB API endpoints only).
- No `LICENSE` file, and no wording suggesting the code is reusable. The owner's avatar is excluded in `CREDITS.md`.
- Private Claude memory is never quoted in docs. It's described in Claude's own words.

## Review Focus

1. **A spoofed `X-Ricettine-Site` on each entry path.**
   - Through the self-hosted Caddy and through the AWS Caddy behind the main distribution, the client value never wins.
   - A session cookie from one site is never valid on the other.
   - Tests: Task 1 (filter), Task 2 (cross-site session) and Task 4 (Caddy and Terraform).
2. **A first visit to a deep link on the demo** (`/recipes/<id>/view`, `/u/davide`, `/cookbooks/<id>`) signs in automatically and lands on that page, not on `/login`. Tests: Tasks 8 and 10.
3. **Restart while visitors have sessions.** The demo database is recreated, so their session is gone. The next API call's 401 triggers a silent auto sign-in again, not a bounce to `/login`. Tests: Tasks 8 and 10.
4. **Many tabs opening at once** (a recruiter middle-clicking links). Every tab ends up signed in. Two concurrent auto sign-ins both succeed, and the limit isn't hit by normal browsing. Tests: Tasks 5 and 8.
5. **Leaving or reloading the demo editor after edits.** There's no "unsaved changes" prompt, no restored-backup banner on the next open, and nothing is written to localStorage under the editor backup key. Test: Task 9.

---

## PR 1 — Database routing per site

### Task 0: Branch and commit the design

**Files:** `docs/superpowers/specs/2026-11-15-plan-9-demo-and-docs-design.md`, `docs/superpowers/assets/plan-9/davide-avatar.png`, this plan.

- [ ] `git switch main && git pull && git switch -c feat/p9-site-routing`. The spec, avatar and plan are untracked files carried over from `fix/aws-new-account-deploy`.
- [ ] `git add` those three paths, then `git commit -m "Plan 9: demo and docs design and plan"`.

### Task 1: Site context, filter and demo properties

**Files:**
- Create: `backend/src/main/java/com/ricettine/site/Site.java`, `SiteContext.java`, `SiteFilter.java`, `DemoProperties.java`
- Modify: `backend/src/main/resources/application.yml` (the `ricettine.demo` block)
- Test: `backend/src/test/java/com/ricettine/site/SiteFilterTest.java` (plain unit test with `MockHttpServletRequest`), `SiteContextTest.java`

**Interfaces (produced):**
- `enum Site { MAIN, DEMO; String blobPrefix(); }`: `MAIN` → `""`, `DEMO` → `"demo/"`.
- `final class SiteContext`:
  - `static Site current()` returns `MAIN` when unset.
  - `static <T> T callAs(Site, Supplier<T>)` and `static void runAs(Site, Runnable)` restore the previous value in `finally`.
  - `static void set(Site)` and `static void clear()` are package-private, for the filter.
- `@ConfigurationProperties("ricettine.demo") record DemoProperties(boolean enabled, String url, String database, int poolSize)`, with defaults `false`, `null`, `"ricettine_demo"`, `3`.
- `SiteFilter extends OncePerRequestFilter`, `@Order(Ordered.HIGHEST_PRECEDENCE)`. It sets `DEMO` iff `enabled` and the header `X-Ricettine-Site` equals `demo` (case-insensitive), otherwise `MAIN`. It clears in `finally`. The header name is a constant: `SiteFilter.HEADER`.

- [ ] **Write the tests:**
  - `demoHeaderSelectsDemoWhenEnabled`
  - `demoHeaderIgnoredWhenDisabled`
  - `unknownValueIsMain` (`"DEMO "`, `"main"`, `"x"`)
  - `contextClearedAfterRequestEvenOnException`
  - `callAsRestoresPrevious` (nested)
- [ ] Run `cd backend && ./mvnw -q test -Dtest='Site*Test'`. Expected: FAIL (classes missing).
- [ ] Implement. Register `DemoProperties` with `@EnableConfigurationProperties` (or a `@ConfigurationPropertiesScan` if the app already uses one).
- [ ] Run again. Expected: PASS.
- [ ] Commit: `Site context and demo properties`.

### Task 2: Routing DataSource, demo database lifecycle and Flyway

**Files:**
- Create: `backend/src/main/java/com/ricettine/site/SiteDataSourceConfig.java`, `SiteRoutingDataSource.java`, `DemoDatabase.java`, `JdbcUrls.java`
- Test:
  - `backend/src/test/java/com/ricettine/site/JdbcUrlsTest.java` (unit)
  - `backend/src/test/java/com/ricettine/DemoIntegrationTest.java` (base class: `extends IntegrationTest`, `@TestPropertySource(properties = {"ricettine.demo.enabled=true", "ricettine.demo.url=http://demo.test"})`, plus a helper `demo(MockHttpServletRequestBuilder)` that adds the header)
  - `backend/src/test/java/com/ricettine/site/SiteIsolationIT.java`

**Interfaces:**
- Produces:
  - `JdbcUrls.withDatabase(String jdbcUrl, String database): String` replaces the path's database name and keeps the query string. Example: `jdbc:postgresql://db:5432/ricettine?x=1` → `.../ricettine_demo?x=1`.
  - `DemoDatabase.recreate(DataSource main, String name)` runs `DROP DATABASE IF EXISTS "<name>" WITH (FORCE)` then `CREATE DATABASE "<name>"`. The name is validated against `^[a-z_][a-z0-9_]{0,62}$`.
  - Bean `DataSource dataSource` (`@Primary`) is a `SiteRoutingDataSource` whose lookup key is `SiteContext.current()` and whose default target is main. With the demo disabled, the only target is main.
  - Bean `Flyway demoFlyway` (only when enabled) migrates the demo pool and runs before the seeder (Task 7 depends on it with `@DependsOn("demoFlyway")`). Main Flyway stays Spring Boot auto-config on the primary DataSource, which resolves to main outside a request.
- Approach:
  - The main pool comes from `DataSourceProperties` exactly as auto-config would build it (Hikari).
  - The demo pool uses `JdbcUrls.withDatabase(...)`, the same credentials, `maximumPoolSize = poolSize` and the pool name `demo`.
  - `recreate` runs in the config, before the demo pool is built.
- Production code that holds a `DataSource` or `JdbcTemplate`: Spring Session JDBC, `SetupService`, `OrphanMediaCleanup`, `CookbookAccountDeletionHook`, `OneTimeTokens`, `FeedService`, `AccountService`. They all receive the routing bean, so they follow the site with no change.

- [ ] **Write `JdbcUrlsTest`:** plain URL, URL with query, URL with a trailing slash, and a URL without a database rejected (`IllegalArgumentException`).
- [ ] **Write `SiteIsolationIT`** (extends `DemoIntegrationTest`):
  - `sameUsernameExistsIndependentlyPerSite`: create `alice` on the main site through `accounts`, and `alice` with a different display name on the demo site via `SiteContext.callAs(DEMO, ...)`. `GET /api/users/alice` with and without the header returns the respective display names.
  - `mainSessionIsNotValidOnDemo`: log in on main, then `GET /api/me` with the same cookie plus the demo header returns 401.
  - `demoWritesNeverReachMain`: create a recipe as a demo user under `callAs(DEMO)`. `select count(*) from recipe` on a `JdbcTemplate` built directly on the main pool is 0.
  - `demoDatabaseIsRecreatedOnStartup`: `DemoDatabase.recreate` on a database containing a marker table leaves it empty and migrated (`flyway_schema_history` present, marker absent).
- [ ] Run `./mvnw -q verify -Dit.test=SiteIsolationIT -Dtest=JdbcUrlsTest` (or the project's IT selector). Expected: FAIL.
- [ ] Implement.
- [ ] **Truncation in tests:** `IntegrationTest.@BeforeEach` truncates through `jdbc`. In `DemoIntegrationTest` also truncate the demo database by running the same truncate inside `SiteContext.runAs(DEMO, ...)`. Expose the truncate list as a protected method rather than duplicating it.
- [ ] Run the IT and the **full** backend suite: `./mvnw -B verify`. Expected: all PASS, with existing tests unchanged.
- [ ] Commit: `Route the DataSource per site; recreate and migrate the demo database`.

### Task 3: Per-site media keys, public URLs and orphan cleanup

**Files:**
- Modify:
  - `backend/src/main/java/com/ricettine/media/MediaService.java:52-53`: `key(...)` becomes `SiteContext.current().blobPrefix() + "img/" + mediaId + "/" + v.fileName()`. Update every caller of the static method.
  - `common/PublicUrls.java`: on `DEMO`, use `DemoProperties.url()` when set.
  - `recipe/OrphanMediaCleanup.java`: the scheduled method loops `for (Site s : sites())` with `SiteContext.runAs(s, this::cleanOnce)`. `sites()` is `[MAIN]`, plus `DEMO` when enabled.
- Test: `backend/src/test/java/com/ricettine/site/SiteMediaIT.java`

- [ ] **Write the tests:**
  - `demoUploadStoredUnderDemoPrefix`: a demo user uploads a recipe photo. A file exists under `target/test-media/demo/img/<id>/`. `GET /media/<id>/thumb.jpg` with the demo header returns 200, and without the header returns 404.
  - `cleanupRunsForBothSites`: an orphan older than 24 h on each site (use the `MutableClock`) is deleted by one cleanup run.
  - `publicUrlsUseDemoUrlOnDemoSite`: a share link of a demo recipe starts with `http://demo.test/r/`.
- [ ] Run. Expected: FAIL.
- [ ] Implement.
- [ ] Run. Expected: PASS. Then `./mvnw -B verify`. Expected: PASS.
- [ ] Commit: `Per-site media keys, public URLs and orphan cleanup`.

### Task 4: Infrastructure for the demo host

**Files:**
- Modify:
  - `compose.yaml` app env: `RICETTINE_DEMO_ENABLED: ${RICETTINE_DEMO_ENABLED:-false}`, `RICETTINE_DEMO_URL: ${RICETTINE_DEMO_URL:-}`
  - `deploy/Caddyfile`: `request_header X-Ricettine-Site main` in the main block, plus an optional `{$RICETTINE_DEMO_DOMAIN}` block that sets `demo`. Caddy must skip the block when the variable is empty; if it can't, use a separate `deploy/Caddyfile.demo` imported conditionally. Validate with `caddy validate` either way.
  - `compose.https.yaml`: pass `RICETTINE_DEMO_DOMAIN`.
  - `deploy/aws/Caddyfile`: no site logic. Keep `X-Ricettine-Site` as sent by CloudFront, and add a comment explaining why.
  - `deploy/aws/start.sh`: when `DEMO_DOMAIN` is set in `config.env`, write `RICETTINE_DEMO_ENABLED=true` and `RICETTINE_DEMO_URL=https://$DEMO_DOMAIN` to `.env`.
  - `infra/terraform/variables.tf`: `demo_enabled` (bool, false) and `demo_subdomain` ("demo").
  - `infra/terraform/edge.tf`, `dns.tf`, `compute.tf` (cloud-init `config.env` gets `DEMO_DOMAIN`).
  - `infra/terraform/tests/edge.tftest.hcl`.
  - `scripts/aws-verify.sh`, `scripts/https-smoke.sh`.
  - `docs/deploy-aws.md` ("Demo site" section, with go-live and rollback).
  - `README.md` (configuration table rows).
- **Terraform**, all with `count = var.demo_enabled ? 1 : 0`:
  - `aws_acm_certificate.demo` (us-east-1) with its validation records.
  - `aws_cloudfront_distribution.demo`: a copy of `main` with `aliases = ["${var.demo_subdomain}.${var.domain_name}"]` and an origin `custom_header` that sets both `X-Origin-Verify` and `X-Ricettine-Site = "demo"`. Factor the shared settings into locals or a dynamic block rather than copy-pasting 70 lines.
  - Route 53 A and AAAA alias records.

- [ ] **Add Terraform tests** in `edge.tftest.hcl`:
  - `demo_disabled_creates_nothing`
  - `demo_distribution_sets_site_header`
  - `demo_uses_own_certificate`
  - `main_distribution_does_not_forward_site_header` (origin request policy header list excludes `X-Ricettine-Site`)
- [ ] **Extend `https-smoke.sh`** (https overlay): with `RICETTINE_DEMO_DOMAIN=demo.localhost`, `curl -k --resolve demo.localhost:443:127.0.0.1 https://demo.localhost/api/setup/status` contains `"demo":true`. A request to the main host with `-H 'X-Ricettine-Site: demo'` contains `"demo":false`.
- [ ] **Extend `aws-verify.sh`:** when `DEMO_DOMAIN` is set, check that `https://$DEMO_DOMAIN/actuator/health` is UP, that `/api/setup/status` has `"demo":true`, and that the main domain's status has `"demo":false`.
- [ ] Run `scripts/infra-check.sh` (expected PASS) and `scripts/https-smoke.sh` (expected PASS).
- [ ] **Write the "Demo site" section** in `docs/deploy-aws.md`:
  - Go-live, for the owner to run:
    1. `aws login --profile ricettine`
    2. `terraform apply -var demo_enabled=true`
    3. Redeploy the instance per the "Upgrade" section, so cloud-init or `config.env` gets `DEMO_DOMAIN`.
    4. `scripts/aws-verify.sh`
  - Rollback: `demo_enabled=false`, then apply and redeploy. Main data is untouched either way.
- [ ] Commit: `Demo host: Caddy, compose, Terraform and checks`. Open PR 1.

## PR 2 — Demo mode and content

### Task 5: Read-only demo site, auto sign-in and status

**Files:**
- Create:
  - `backend/src/main/java/com/ricettine/site/DemoReadOnlyFilter.java`
  - `backend/src/main/java/com/ricettine/site/DemoSessionController.java`
- Modify:
  - `setup/SetupController.java` (status body)
  - `common/RateLimits.java`, `config/LimitsConfig.java`, `application.yml` (`demo-session` limit)
  - `config/SecurityConfig.java` (permit `POST /api/demo/session`)
- Test: `backend/src/test/java/com/ricettine/site/DemoModeIT.java`

**Interfaces (produced):**
- `GET /api/setup/status` returns `{"setupRequired": bool, "demo": bool, "demoUrl": string|null}`.
- `POST /api/demo/session` returns 204.
  - On the demo site: it signs in as `ospite` through `AuthSessions.login(...)` and sets the session's `maxInactiveInterval` to 1 day. Rate-limited by `limits.demoSession(ip)`.
  - On the main site it returns 404.
  - If `ospite` is missing (not seeded), it returns 503 `demo_unavailable`.
- `DemoReadOnlyFilter`:
  - Runs after `SiteFilter`, before Spring Security.
  - On `DEMO`, any method other than GET, HEAD or OPTIONS is refused with 403 problem+json, `code: "demo_read_only"`.
  - Exceptions: `POST /api/demo/session` and `POST /api/auth/logout`.

- [ ] **Write `DemoModeIT`:**
  - `everyMutatingEndpointIsReadOnlyOnDemo`: parameterized over every `RequestMappingInfo` from `RequestMappingHandlerMapping` with a POST, PUT, PATCH or DELETE method, excluding the two exceptions. Fill path variables with a random UUID. Each request, with the demo header and a signed-in `ospite` session, returns 403 with code `demo_read_only`. Assert the parameter count is at least 33, so a broken discovery can't pass vacuously.
  - `sameEndpointsWorkOnMain`: a sample `POST /api/recipes` without the header returns 201.
  - `demoSessionSignsInAsOspiteForOneDay`: `/api/me` returns `ospite`, and `spring_session.max_inactive_interval` is 86400 in the demo database.
  - `demoSessionIs404OnMain`.
  - `demoSessionRateLimited`: the 31st request in a window returns 429.
  - `twoConcurrentDemoSessionsBothSucceed` (use `Concurrently`).
  - `statusReportsDemoFlags`: main gives `demo:false, demoUrl:"http://demo.test"`; demo gives `demo:true, demoUrl:null`; disabled gives `demoUrl:null`.
  - `loginAndSetupRefusedOnDemo`.
  - Seed `ospite` in the test's `@BeforeEach` under `callAs(DEMO)`. The real seeder arrives in Task 7.
- [ ] Run. Expected: FAIL.
- [ ] Implement.
- [ ] Run. Expected: PASS. Then `./mvnw -B verify`. Expected: PASS.
- [ ] Commit: `Demo site is read-only with auto sign-in`.

### Task 6: Demo content fixture (owner reviews)

**Files:**
- Create:
  - `scripts/demo-content.sh` (fetch and download; run rarely by hand; not in CI)
  - `backend/src/main/resources/demo/recipes.json`
  - `backend/src/main/resources/demo/photos.json`
  - `backend/src/main/resources/demo/images/*.jpg`
  - `backend/src/main/resources/demo/avatars/davide.jpg`
  - `CREDITS.md`
- `scripts/demo-content.sh fetch` writes the TheMealDB API output (`filter.php?a=Italian`, then `lookup.php?i=<id>`) to `$TMPDIR/ricettine-demo/raw/` as reference material for translation. It is not committed.
- `scripts/demo-content.sh photos` downloads every `photos.json` entry to `images/<file>`. It uses the source's size parameters (Unsplash `?w=1600&q=80`, Pexels `?auto=compress&w=1600`) and fails if a file is over 600 KB.

**Fixture format:**
- `recipes.json` is `{ users: [...], recipes: [...], cookbooks: [...] }`.
  - A recipe has: `key`, `author` (`davide`|`ospite`), `title`, `portions`, `prepMinutes`, `cookMinutes`, `notes`, `visibility`, `published`, `photo` (a `photos.json` key), `groups[{name, ingredients[{amount, unit, name, note}]}]`, `steps[{text}]`.
  - A cookbook has: `owner`, `name`, `description`, `visibility`, `cover` (a photo key), `recipes` (recipe keys), `authors` (usernames).
- `photos.json` maps `key` to `{file, sourceUrl, downloadUrl, photographer, license: "Unsplash License"|"Pexels License"}`.

**Content rules:**
- **Selection:** 12 of the 21 Italian meals. Exclude both "Fettuccine Alfredo" duplicates (keep at most one), "Pizza Express Margherita", "Pilchard puttanesca", "Chicken Alfredo Primavera" and "Potato Gratin with Chicken".
- **Split:**
  - `davide` authors 10 recipes and owns 3 cookbooks ("Primi della domenica", "Dolci", "Cucina veneta e lombarda").
  - `ospite` authors 2 recipes and is an author of "Primi della domenica".
  - 10 recipes are published and public, 1 is published and private, and 1 of `ospite`'s is a draft.
- **Translation:** natural Italian (informal "tu" in the steps, matching Plan 8). Measures map to the unit codes `g kg ml l tsp tbsp cup piece pinch clove slice can bunch`. Unparseable measures get `amount: null` and the measure text in `note`, in Italian.
- **Photos:** one dish photo per recipe and one cover per cookbook, all from Unsplash or Pexels, found by searching each site. Record `sourceUrl` and `photographer` exactly as shown.
- **Avatar:** `sips -Z 512 --cropToHeightWidth 1346 1346 docs/superpowers/assets/plan-9/davide-avatar.png --out .../davide.jpg -s format jpeg`, or an equivalent square crop around the face.
- **`CREDITS.md`:** TheMealDB as the recipe source (with link) and "translated and adapted"; a table of photos with photographer, source link and licence; a line saying the avatar in `demo/avatars/` is the owner's personal photo and isn't licensed for reuse.

- [ ] Write a unit test `DemoFixtureTest`:
  - Every recipe's `photo` and every cover exists in `photos.json` and as a file under `images/`.
  - Every unit is a valid `Unit` code.
  - Every `author`, `owner` and cookbook `authors` entry is a defined user.
  - Every photo has `sourceUrl`, `photographer` and `license` from the allowed two.
  - There are exactly 12 recipes.
  - Every image is ≤ 600 KB.
  - A heuristic language check: no recipe title or step contains any of `" the "`, `" and "`, `" with "`, `"minutes"`.
- [ ] Run. Expected: FAIL (no fixture).
- [ ] Produce the fixture, then run. Expected: PASS.
- [ ] **Owner checkpoint.** List the 12 titles and the photo choices in the PR description under "Owner review: content". Execution continues; the owner can swap entries before merge.
- [ ] Commit: `Demo content: 12 Italian recipes from TheMealDB with licensed photos`.

### Task 7: Seeder

**Files:**
- Create: `backend/src/main/java/com/ricettine/site/DemoSeeder.java`, `DemoFixture.java` (Jackson records matching Task 6)
- Test: `backend/src/test/java/com/ricettine/site/DemoSeederIT.java`

**Interfaces:**
- Consumes:
  - `AccountService.create(NewAccountRequest, false)` and `AccountService.setAvatar(UUID, Supplier<byte[]>)`
  - `RecipeService.create(UUID)`, the service method behind `PUT /api/recipes/{id}` with a `RecipeInput`, and `RecipeService.publish`
  - The photo path `MediaService.process(...)` then `RecipeService.addPhoto(...)`, as `RecipePhotoController` does, without the rate limit
  - `CookbookService.create`, `addRecipe`, the cover service method, and `CookbookAuthorRepository.save(new CookbookAuthor(...))`
  - A row in `instance_setup` (id 1)
- Produces: `DemoSeeder.seed()`. It runs on `ApplicationReadyEvent` when the demo is enabled, under `SiteContext.runAs(DEMO, ...)`, and logs `Demo seeded: 12 recipes, 3 cookbooks in <ms> ms`.

- [ ] **Write `DemoSeederIT`:**
  - `seedsUsersRecipesCookbooks`: counts 2/12/3 on the demo database and 0 recipes on main.
  - `davideHasAvatarOspiteDoesNot`.
  - `feedOnDemoShowsDavidesPublicRecipes`: `GET /api/feed` as `ospite` with the header returns 10 items.
  - `ospiteIsAuthorOfPrimi`.
  - `seedIsIdempotentAfterRecreate`: `DemoDatabase.recreate`, Flyway migrate, then `seed()` again gives the same counts.
  - `setupNotRequiredOnDemo`.
- [ ] Run. Expected: FAIL.
- [ ] Implement. Remove the Task 5 test-only `ospite` seeding in favour of the real seeder.
- [ ] Run `./mvnw -B verify`. Expected: PASS. Note the added context start time in the PR description (seeding processes 15 images).
- [ ] Commit: `Seed the demo database on startup`.

### Task 8: Frontend demo shell: site info, auto sign-in, banner, demo button, hidden controls

**Files:**
- Create:
  - `frontend/src/app/core/site.ts`
  - `frontend/src/app/shell/demo-banner.component.ts`
  - Specs next to each.
- Modify:
  - `core/auth.guards.ts` (`SetupStatus` returns the full status)
  - `core/auth.store.ts`, `core/auth.interceptor.ts`
  - `app.ts` (banner above the outlet)
  - `auth/login.page.ts`
  - `shell/account-menu.component.ts`
  - The write controls listed under Rulings: `recipes/view/recipe-view.page.ts`, `recipes/editor/share-panel.component.ts`, `cookbooks/cookbook.page.ts`, `cookbooks/members-panel.component.ts`, `kitchen/overview.page.ts`, `cookbooks/my-cookbooks.page.ts`, `settings/settings-layout.component.ts`
  - The global error handling, mapping `demo_read_only` to `errors.demoReadOnly`
  - `public/i18n/en.json`, `it.json`

**Interfaces:**
- `@Injectable({providedIn:'root'}) class Site`:
  - `readonly demo: Signal<boolean>`
  - `readonly demoUrl: Signal<string|null>`
  - `load(): Promise<void>`, which uses the `SetupStatus` cache
- `AuthStore.load()`: on a 401 from `/api/me` with `site.demo()`, it calls `POST /api/demo/session` and retries `/api/me` once.
- The 401 interceptor: on the demo site, instead of routing to `/login`, it re-runs `AuthStore.load()` and retries the original request once.

**i18n keys (both languages):**

| Key | Italian | English |
|---|---|---|
| `demo.banner` | "Questa è una demo: puoi esplorare e provare l'editor, ma le modifiche non vengono salvate." | "This is a demo: explore and try the editor, but changes aren't saved." |
| `demo.backToSite` | "Vai a ricettine.food" | "Go to ricettine.food" |
| `demo.credits` | "Ricette da TheMealDB, foto da Unsplash e Pexels" | "Recipes from TheMealDB, photos from Unsplash and Pexels" |
| `demo.notSaved` | "Modalità demo: non salvato" | "Demo mode: not saved" |
| `auth.tryDemo` | "Prova la demo" | "Try the demo" |
| `errors.demoReadOnly` | "Non disponibile nella demo." | "Not available in the demo." |

- [ ] **Write the specs:**
  - `site.spec.ts`: it parses the status flags.
  - `auth.store.spec.ts`: `demoAutoSignsInOn401`, `mainDoesNotCallDemoSession`, `demoRetriesMeOnce` (a second 401 leaves `me` null and makes no loop).
  - `auth.interceptor.spec.ts`: `demo401ReauthenticatesAndRetries`.
  - `demo-banner.component.spec.ts`: renders only when `demo`; the link goes to the main URL; the credits are visible.
  - `login.page.spec.ts`: the "Try the demo" link has `href = demoUrl` and is absent when null.
  - `account-menu.component.spec.ts`: no logout in demo.
  - One spec per hidden-control file asserting the control is absent in demo and present otherwise. Keep each to one test; reuse a `provideSite({demo})` test helper in `testing/`.
- [ ] Run `cd frontend && npx ng test --watch=false`. Expected: FAIL for the new specs.
- [ ] Implement.
- [ ] Run `npx ng test --watch=false`, `npx ng build` and `npm run format:check`. Expected: PASS.
- [ ] Commit: `Demo shell: auto sign-in, banner, demo button, hidden write controls`.

### Task 9: Local editor in demo

**Files:**
- Modify:
  - `frontend/src/app/recipes/new-recipe.page.ts`: in demo, `navigateByUrl('/recipes/local/edit', {replaceUrl:true})` with no API call.
  - `recipes/editor/editor-store.ts`
  - `recipes/editor/recipe-editor.page.ts`: notice, Save and Publish show the `demo.notSaved` toast, delete menu item hidden.
  - `recipes/editor/leave-editor.guard.ts`: allows leaving in demo.
  - The beforeunload hook, `PendingSaves` and `UnsavedBackup` registration are skipped in demo.
- Test: `recipes/editor/editor-store.spec.ts`, `recipe-editor.page.spec.ts`, `new-recipe.page.spec.ts`

**Interfaces:**
- `EditorStore.load(id)`:
  - When `site.demo()` and `id === 'local'`, it builds an empty recipe locally with `emptyInput()` semantics, no server call, status `idle`.
  - When `site.demo()` and `id` is a real id, it does `api.get(id)` as today.
- In demo, `update()` never triggers autosave, `uploadPhoto` sets a local preview only, `publish()` resolves `'blocked'` without a request, and `flush()` is a no-op.
- A new `readonly local: boolean` on the store, true in demo, read by the page.

- [ ] **Write the specs:**
  - `localDraftLoadsWithoutRequest` (`HttpTestingController.verify()` shows no request)
  - `demoEditsNeverSave` (advance fake timers past 5 s; no PUT)
  - `demoPhotoIsPreviewOnly` (no POST; `URL.revokeObjectURL` called on destroy)
  - `demoPublishShowsNotSaved`
  - `demoWritesNoUnsavedBackup` (localStorage has no backup key after edits; Review Focus 5)
  - `leaveGuardAllowsInDemo`
  - `newRecipeInDemoNavigatesToLocal`
  - `existingRecipeInDemoLoadsFromServerButNeverSaves`
- [ ] Run. Expected: FAIL.
- [ ] Implement. Keep the demo branches in the store few and named, for example a private `get persists()`, rather than scattering `site.demo()` checks.
- [ ] Run `npx ng test --watch=false`, `npx ng build` and `npm run format:check`. Expected: PASS.
- [ ] Commit: `Demo editor runs locally and never saves`.

### Task 10: Playwright demo specs

**Files:**
- Modify: `e2e/compose.e2e.yaml` (`RICETTINE_DEMO_ENABLED: "true"`, `RICETTINE_DEMO_URL: http://demo.localhost:8080`)
- Create: `e2e/helpers/demo.ts`, `e2e/tests/demo.spec.ts`
- `demo.ts` exports `newDemoContext(browser, project)`, which creates a context with `extraHTTPHeaders: {'X-Ricettine-Site': 'demo'}` and the project's device settings.

- [ ] **Write `demo.spec.ts`** (runs in `mobile` and `desktop`):
  - `landsOnFeedSignedInWithBanner`: Davide's recipes are visible, the banner is visible, and there's no login form.
  - `deepLinkFirstVisitLandsOnTarget`: `/u/davide` on a fresh context shows Davide's profile (Review Focus 2).
  - `editorNewRecipeTypesButNeverSaves`: type a title, wait 6 s, see the `not saved` notice. No `PUT`/`POST /api/recipes` is seen (`page.on('request')`). Reloading shows an empty editor with no restore banner (Review Focus 5).
  - `writeControlsAbsent`: no logout and no delete on a recipe; no member management or "New cookbook".
  - `sessionLossReauthenticatesSilently`: clear cookies, navigate, and still be signed in without `/login` (Review Focus 3).
  - `mainLoginShowsTryDemo`: in the normal context, `/login` has a link to `http://demo.localhost:8080`.
  - `languageSwitchWorksInDemo`.
- [ ] Run `scripts/e2e.sh`. Expected: all specs PASS in mobile and desktop, including the existing ones, which run on the main site and are unaffected by the demo being enabled.
- [ ] Commit: `e2e: demo site`.

### Task 11: PR 2 wrap-up

- [ ] Run `scripts/smoke.sh` and `scripts/backup-restore-check.sh`. Expected: PASS. The backup contains the main database only (assert it in `backup-restore-check.sh`: the restored DB has no `ricettine_demo` content, and backup runs don't touch the demo database).
- [ ] Update `README.md`'s configuration table with the demo variables (if Task 4 didn't), and `docs/deploy-aws.md` with "The demo reseeds on every restart".
- [ ] Open PR 2 with "Owner review: content" (Task 6) and the go-live steps from `docs/deploy-aws.md`.

## PR 3 — Screenshots

### Task 12: Screenshot generator

**Files:**
- Create:
  - `scripts/screenshots.sh`: builds and starts the stack like `e2e.sh`, with project `ricettine-shots` and `down -v` on exit.
  - `e2e/screenshots.config.ts`: a separate Playwright config, not run by CI.
  - `e2e/screenshots/screenshots.spec.ts`
  - `docs/images/*.png`
- Modify: `docs/development.md` (created in Task 15; if Task 15 isn't merged yet, add a short note to the README's "Development and checks" section instead).
- **Shots** (demo context, Italian unless noted, light theme), each taken after `networkidle` with images loaded:

| File | View | Viewport |
|---|---|---|
| `feed-desktop.png` | feed | 1440×900 |
| `recipe-desktop.png` | a Davide recipe with a photo (Spaghetti alla carbonara if selected) | 1440×900 |
| `editor-desktop.png` | editor on an `ospite` recipe | 1440×900 |
| `cookbook-desktop.png` | "Primi della domenica" | 1440×900 |
| `feed-mobile.png` | feed | Pixel 7 |
| `recipe-mobile.png` | recipe | Pixel 7 |
| `editor-mobile.png` | editor | Pixel 7 |
| `recipe-desktop-en.png` | recipe, English UI | 1440×900 |
| `recipe-desktop-dark.png` | recipe, dark theme | 1440×900 |

- [ ] Write the spec. Run `scripts/screenshots.sh`. Expected: 9 PNGs written, each under 600 KB (`pngquant` via Docker if needed). Look at each one with the Read tool to check it's meaningful: no spinners, no empty states.
- [ ] Add a check to `scripts/screenshots.sh` that every PNG listed in the table exists after the run.
- [ ] Commit, then open PR 3.

## PR 4 — Documentation

Every number, path, date and command in these pages is verified at writing time with `git log`, `gh pr list --state merged`, `ls` and `grep`, and never written from memory. Each Mermaid block must render (see Task 13's check).

### Task 13: Docs check, architecture, decisions and security

**Files:**
- Create:
  - `scripts/docs-check.sh`: renders every ```` ```mermaid ```` block in `README.md` and `docs/*.md` with `minlag/mermaid-cli` in Docker (pinned version), and checks every relative Markdown link and image target exists.
  - `docs/architecture.md`, `docs/decisions.md`, `docs/security.md`
- Modify: `scripts/infra-check.sh` (call `docs-check.sh`), `.github/workflows/ci.yml` (no change needed if `infra` already runs `infra-check.sh`)

**Content:**
- **`architecture.md`:**
  - A container `flowchart`: browser → CloudFront (main and demo) → Caddy → app (SPA plus `/api`) → Postgres (`ricettine`, `ricettine_demo`), plus S3.
  - Backend modules per feature package.
  - An `erDiagram` of `app_user`, `recipe`, `ingredient_group`, `ingredient`, `step`, `media`, `cookbook`, `cookbook_author`, `cookbook_entry`, `one_time_token`, generated by reading V1–V9.
  - Two `sequenceDiagram`s: invite → register → login, and demo first visit → status → auto sign-in → feed.
  - Frontend structure and i18n.
- **`decisions.md`:** ADR-style entries (Context / Decision / Consequences, 5–10 lines each):
  1. single image vs services
  2. server-assigned ids and client-agnostic API
  3. no PWA, future native Android
  4. desktop-first, responsive at 768 px
  5. single EC2 with Compose vs ECS/RDS
  6. CloudFront in front of the origin with a secret header
  7. demo isolation by routed database vs second instance vs query filtering
  8. read-only demo vs sandbox accounts
  9. demo content licensing (TheMealDB API, Unsplash/Pexels, rejected sources)
  10. sessions in Postgres
- **`security.md`:** invite-only accounts, argon2 with bounded concurrency, session cookies and CSRF, rate limits, the origin secret and trusted proxies, the robots/noindex header, media access policies, demo isolation and read-only behaviour, secrets in SSM, logs without URIs, backups.

- [ ] Write `docs-check.sh`. Run it on a scratch file with a broken Mermaid block and on one with a broken link. Expected: non-zero exit for each.
- [ ] Write the three pages. Run `scripts/docs-check.sh`. Expected: PASS.
- [ ] Commit: `Docs: architecture, decisions, security, docs check`.

### Task 14: Quality and deployment

**Files:** Create `docs/quality.md` and `docs/deployment.md`. Delete `docs/deploy-aws.md`, moving its content into `deployment.md`. Fix every link to it: `grep -rn deploy-aws.md`.

**Content:**
- **`quality.md`:**
  - The test pyramid with current counts (count `@Test`, vitest `it(` and Playwright `test(` with `grep`, and state the date).
  - Testcontainers, the mobile and desktop projects, the restart project.
  - A table of check scripts with what each proves.
  - The Plan 6 code audit (a summary of `docs/superpowers/audits/2026-11-07-code-audit.md`: categories and how many findings were fixed).
  - A CI `flowchart` that matches the jobs and `needs:` in `.github/workflows/ci.yml` exactly.
- **`deployment.md`:**
  - An AWS topology `flowchart`.
  - All sections of the old `deploy-aws.md` (cost, what Terraform builds, first deploy, upgrade, restore, rotate origin secret, demo site, teardown).
  - Self-hosting with compose and HTTPS: move the README's Configuration, HTTPS, Upgrading and Backups sections here.
  - Cost presented as "estimate as of 2026-11", using the numbers already in `deploy-aws.md`.

- [ ] Write. Run `scripts/docs-check.sh` and `scripts/infra-check.sh`. Expected: PASS.
- [ ] Commit: `Docs: quality and deployment`.

### Task 15: AI workflow, roadmap and development

**Files:** Create `docs/ai-workflow.md`, `docs/roadmap.md` and `docs/development.md`. The README's "Development and checks" moves to `development.md`, plus "Regenerating screenshots" and "Refreshing demo content".

**Content:**
- **`ai-workflow.md`:**
  - A `flowchart` of the loop: idea → brainstorm with the owner → spec → plan → subagent implementation, one task at a time → per-task review → PR → CI → merge, with follow-ups feeding the next plan.
  - What `CLAUDE.md`, memory and skills are, with examples from this repo's committed `CLAUDE.md`.
  - The owner's role (product decisions, rulings, reviews, AWS access) versus Claude's.
  - Numbers verified at writing time: commits, merged PRs, first and last commit dates, plans.
  - **"What went wrong"**, in Claude's own words and never quoting private memory:
    - Process cost grew from several reviews per task and widened fix rounds, so the owner set a lean process.
    - CI was unavailable for a period, so local scripts became the gate until it returned.
    - The code audit found issues in AI-written code (cite categories from the audit file).
    - Approaches were retracted during brainstorming: GialloZafferano content, TheMealDB photos with unclear licence, a stock photo.
  - Links to `docs/superpowers/specs`, `plans` and `audits` as the raw record.
- **`roadmap.md`:**
  - A `gantt` of Plans 1–9 with start and merge dates from `git log` on the plan files and from the merged-PR dates.
  - One line of outcome per plan.
  - "Next": the native Android client, open follow-ups (list the headings of the latest followups file), and owner-led UI polish items from Plan 7's "Later".

- [ ] Write. Run `scripts/docs-check.sh`. Expected: PASS.
- [ ] Commit: `Docs: AI workflow, roadmap, development`.

### Task 16: README

**Files:** Modify `README.md`.

**Structure:**
1. `# Ricettine` with a one-line pitch: "A self-hosted recipe app for friends and family, built end to end with Claude Code as a portfolio project".
2. Badges: CI (`ci.yml` status) and the ghcr image.
3. Links: live site and **Try the demo** (`https://demo.ricettine.food`).
4. Screenshots: desktop feed and recipe side by side, three mobile shots in a row, using `docs/images`.
5. "What this project shows": 5–7 bullets, each linking to its doc page (quality engineering, isolated demo, IaC on AWS, AI-assisted workflow, i18n, accessibility).
6. A tech stack list.
7. A three-line quick start (`docker compose up -d`) linking to `docs/deployment.md`.
8. The documentation index.
9. Credits, linking `CREDITS.md`.

There is no licence section.

- [ ] Write. Run `scripts/docs-check.sh`. Expected: PASS. Check that the README renders on GitHub by viewing the PR's rich diff, including the Mermaid diagrams on the doc pages.
- [ ] Commit, then open PR 4.
