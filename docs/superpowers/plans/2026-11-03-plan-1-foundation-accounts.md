# Plan 1 — Foundation & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable Ricettine instance: one Docker image (Spring Boot API + Angular SPA) plus Postgres, with first-run admin setup, invite-only registration, session login, profile editing with avatar, admin password resets, account deletion, and EXIF-safe image storage on local disk or S3.

**Architecture:** Maven Spring Boot app in `backend/`, Angular app in `frontend/`. Code is organized by feature package, not by layer. A multi-stage Dockerfile builds both and puts the Angular build into Spring's `static/`, so one process serves `/api/**`, `/media/**` and the SPA (with deep-link fallback). Sessions are server-side in Postgres (Spring Session JDBC). Images go through one `MediaService`: validate, auto-orient, strip metadata, resize, then store via a `BlobStore` interface (local filesystem or S3-compatible).

**Tech Stack:** Java 25, Spring Boot 4.x (Web MVC, Security, Data JPA, Validation, Session JDBC), Flyway, PostgreSQL 17, Testcontainers, `metadata-extractor` + `Thumbnailator` (images), AWS SDK v2 S3, Angular (latest stable ≥ 21; standalone components, signals, Vitest), Angular CDK, Transloco (runtime i18n), Docker (multi-arch buildx).

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md`

## Roadmap (this plan is 1 of 5)
1. **Foundation & accounts** (this plan): §3, §8, §9.1, §9.2 basics.
2. Recipes & mobile editor: §4, §5 (drafts, autosave, offline text + photo queue, drag handles, chips).
3. Cookbooks: §6 (lists, links, co-author invite URLs, leave/remove).
4. Reading & discovery: §7, rest of §3 (recipe page, scaling, keep-screen-on, feed, profile page).
5. Hosting: §9.2 polish (Caddy example, upgrade docs), §9.3 AWS (Terraform, EC2, S3, CloudFront, Route 53, backups), CI.

## Global Constraints
- Java 25, Spring Boot 4.x, PostgreSQL 17, Angular ≥ 21, Node 24 LTS. Use the Maven wrapper (`./mvnw`); don't depend on a global Maven.
- Base Java package `com.ricettine`. Feature packages: `account`, `auth`, `setup`, `invite`, `admin`, `media`, `common`, `config`.
- All primary keys are `UUID`. All user-facing tokens are 32 bytes from `SecureRandom`, base64url without padding (43 chars), and are **stored only as SHA-256 hashes**.
- No AWS-specific code outside `media/S3BlobStore.java`.
- Zero required config: the image must start against the compose Postgres with no env vars beyond the DB connection that compose provides.
- All schema changes go through Flyway migrations in `backend/src/main/resources/db/migration`. No `ddl-auto` other than `validate`.
- API errors are RFC 9457 `ProblemDetail` with an extra `code` property (snake_case string). The frontend maps `code` to i18n keys and never shows raw server messages.
- All UI strings come from Transloco `frontend/public/i18n/en.json`. No hardcoded copy in templates.
- Passwords: 10–128 chars, hashed with Spring's `DelegatingPasswordEncoder` (bcrypt default).
- Username: `^[a-z0-9_]{3,30}$`, stored lowercase, unique, not in the reserved set `{admin, api, media, r, c, setup, login, logout, register, reset, settings, invite, me, new}`.
- Email: trimmed, stored lowercase, unique, max 254.
- Image upload: max 15 MB; accepted types JPEG, PNG, WebP (detected by content sniffing, not by extension). Output is always JPEG with no metadata.
- Invite links: single-use, expire after 7 days. Password-reset links: single-use, expire after 24 hours.
- Mobile-first: every screen must work at 360 px width with touch targets ≥ 44 px.

## Review Focus
1. **Phone photo orientation:** an iPhone JPEG with EXIF `Orientation=6` must come out upright after metadata stripping, not sideways. (Test in Task 5.)
2. **First-run race:** two concurrent `POST /api/setup/admin` calls must not create two admins. The second gets `409 setup_already_done`. (Test in Task 3.)
3. **Invite reuse:** a used, expired or revoked invite can't register a second account, including two simultaneous registrations with the same token. (Test in Task 6.)
4. **Case and whitespace in identities:** `" Davide@X.com "` and `davide@x.com` are the same account for registration and login. `Davide_1` is rejected as a username, not silently lowercased into a collision. (Test in Task 3/4.)
5. **Bad uploads:** a 20 MB file, a PDF renamed `.jpg`, or a HEIC file returns a 4xx with codes `file_too_large` / `unsupported_image`, never a 500, and leaves no blob behind. (Test in Task 5.)

---

### Task 0: Toolchain

The machine currently has no Java, Node or Docker.

- [ ] **Step 1: Install tools**

```bash
brew install --cask temurin@25
brew install node@24 colima docker docker-buildx docker-compose
colima start --cpu 4 --memory 6
```

- [ ] **Step 2: Verify**

Run: `java -version && node -v && docker run --rm hello-world`
Expected: Java 25, Node v24.x, the "Hello from Docker!" message. (Testcontainers needs Docker. With Colima, set `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` in your shell profile if tests can't find Docker.)

No commit.

---

### Task 1: Backend skeleton with Postgres, Flyway, test harness

**Files:**
- Create: `backend/` via Spring Initializr (Maven, Java 25, Boot 4.x, deps: web, security, data-jpa, validation, flyway, postgresql, session-jdbc, actuator, testcontainers, spring-security-test)
- Create: `backend/src/main/java/com/ricettine/RicettineApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/db/migration/V1__baseline.sql` (Spring Session JDBC tables for PostgreSQL, copied from `org/springframework/session/jdbc/schema-postgresql.sql`)
- Create: `backend/src/test/java/com/ricettine/IntegrationTest.java`
- Create: `backend/src/test/java/com/ricettine/HealthIT.java`

**Interfaces:**
- Produces: abstract `IntegrationTest`, annotated `@SpringBootTest @AutoConfigureMockMvc @Testcontainers`, with a static `@Container @ServiceConnection PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine")` shared across tests (singleton container pattern) and a `protected MockMvc mvc`. Every later backend test extends it.
- Produces: config prefix `ricettine.*` (bound in later tasks).

- [ ] **Step 1: Generate the project** (Initializr, as above), set `spring.jpa.hibernate.ddl-auto: validate`, `spring.jpa.open-in-view: false`, `spring.session.jdbc.initialize-schema: never`, `server.forward-headers-strategy: framework`, `management.endpoints.web.exposure.include: health`. Default datasource: `jdbc:postgresql://localhost:5432/ricettine`, user/password `ricettine`.
- [ ] **Step 2: Write failing test** `HealthIT.healthIsUp`: `GET /actuator/health` → 200, `$.status == "UP"`, without authentication.
- [ ] **Step 3: Run** `cd backend && ./mvnw verify -Dit.test=HealthIT` → FAIL (401 because Security locks everything, or the missing migration).
- [ ] **Step 4: Add** `V1__baseline.sql` and a minimal `config/SecurityConfig` that permits `/actuator/health` (fleshed out in Task 4). Configure failsafe so `*IT` classes run in `verify`.
- [ ] **Step 5: Run** `./mvnw verify` → PASS.
- [ ] **Step 6: Commit** `feat(backend): spring boot skeleton with postgres, flyway and test harness`.

---

### Task 2: SPA serving with deep-link fallback

**Files:**
- Create: `backend/src/main/java/com/ricettine/config/SpaWebConfig.java`
- Create: `backend/src/test/resources/static/index.html` (contains `<title>ricettine-test-index</title>`)
- Test: `backend/src/test/java/com/ricettine/config/SpaFallbackIT.java`

**Interfaces:**
- Produces: any `GET` not under `/api/`, `/media/`, `/actuator/` and without a file extension in its last segment returns `static/index.html`.

- [ ] **Step 1: Failing tests** in `SpaFallbackIT`:
  - `rootServesIndex`: `GET /` → 200, body contains `ricettine-test-index`.
  - `deepLinkServesIndex`: `GET /r/abc123` and `GET /settings/profile` → 200 with index.
  - `unknownApiIs404Json`: `GET /api/nope` → 404, `Content-Type: application/problem+json`.
  - `missingAssetIs404`: `GET /missing.js` → 404 (not index).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `SpaWebConfig implements WebMvcConfigurer` with a resource handler whose `PathResourceResolver.getResource` falls back to `index.html` under the rules above. Permit these paths in `SecurityConfig`. Set `spring.mvc.problemdetails.enabled: true`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): serve SPA with deep-link fallback`.

---

### Task 3: Users and first-run setup

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__users_and_tokens.sql`
- Create: `account/User.java`, `account/UserRepository.java`, `account/Identity.java` (email/username normalization + validation), `account/AccountDtos.java`
- Create: `common/ApiException.java`, `common/ProblemAdvice.java`
- Create: `setup/SetupController.java`, `setup/SetupService.java`
- Test: `account/IdentityTest.java` (unit), `setup/SetupIT.java`

**Interfaces:**
- Schema `V2`:
  - `app_user(id uuid pk, email varchar(254) not null unique, username varchar(30) not null unique, display_name varchar(80) not null, password_hash varchar(255) not null, is_admin boolean not null default false, avatar_key varchar(100), created_at timestamptz not null)`
  - `one_time_token(id uuid pk, purpose varchar(32) not null, token_hash char(64) not null unique, user_id uuid references app_user(id) on delete cascade, created_by uuid references app_user(id) on delete cascade, expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null)`
  - `instance_setup(id smallint pk check (id = 1), completed_at timestamptz not null)`. Inserting row 1 is the race guard for setup.
- Produces: `record MeDto(UUID id, String email, String username, String displayName, String avatarUrl, boolean admin)`; `record NewAccountRequest(String email, String password, String username, String displayName)` (Bean Validation: `displayName` 1–80 chars after trim).
- Produces: `Identity.normalizeEmail(String): String` (trim + lowercase, throws `ApiException(400,"invalid_email")`); `Identity.validateUsername(String): String` (returns it unchanged, or throws `400 invalid_username` / `400 username_reserved`; it does **not** lowercase, so uppercase input is invalid).
- Produces: `class ApiException extends RuntimeException { ApiException(HttpStatus status, String code) }`, rendered by `ProblemAdvice` as ProblemDetail with `code`. Bean Validation failures render `400 validation_failed` with a `fields` map.
- Produces: `AccountService.create(NewAccountRequest req, boolean admin): User` in `account/AccountService.java` (normalizes, validates password length, maps unique violations to `409 email_taken` / `409 username_taken`).
- Produces: `GET /api/setup/status` → `{"setupRequired": boolean}`; `POST /api/setup/admin` (body `NewAccountRequest`) → 201 `MeDto` and an authenticated session (`AuthSessions.login(User, request, response)` from Task 4; wire it in at the end of Task 4 if doing tasks in order, and until then just return 201).

- [ ] **Step 1: Failing unit tests** `IdentityTest`: `" Davide@X.com "` → `"davide@x.com"`; `"not-an-email"` → `invalid_email`; `"Davide_1"` → `invalid_username`; `"ab"` → `invalid_username`; `"api"` → `username_reserved`; `"davide_1"` → ok.
- [ ] **Step 2: Failing IT** `SetupIT`:
  - `statusRequiredWhenNoUsers` → `setupRequired: true`.
  - `createsAdminOnce`: POST → 201, `$.admin == true`. A second POST → `409`, `$.code == "setup_already_done"`. Status → `false`.
  - `concurrentSetupCreatesOneAdmin`: 5 parallel POSTs (different emails) → exactly one 201, and `userRepository.count() == 1`.
  - `rejectsShortPassword`: 9-char password → `400 password_too_short`.
  - Clean the tables between tests (`@BeforeEach` truncating `app_user, one_time_token, instance_setup`).
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** `SetupService.createAdmin` runs in one transaction: insert into `instance_setup` (a PK conflict → `409 setup_already_done`), then `AccountService.create(req, true)`.
- [ ] **Step 5: Run** `./mvnw verify` → PASS.
- [ ] **Step 6: Commit** `feat(backend): users and first-run admin setup`.

---

### Task 4: Session auth (login, logout, me, CSRF)

**Files:**
- Modify: `config/SecurityConfig.java`
- Create: `auth/AuthController.java`, `auth/AuthSessions.java`, `auth/AppUserDetailsService.java`, `auth/CurrentUser.java`
- Test: `auth/AuthIT.java`, `auth/CsrfIT.java`

**Interfaces:**
- Produces: `AuthSessions.login(User user, HttpServletRequest req, HttpServletResponse res)`, which sets the SecurityContext, saves it via `HttpSessionSecurityContextRepository`, and rotates the session id. `AuthSessions.invalidateAllSessions(UUID userId)` uses `FindByIndexNameSessionRepository` with the principal name set to the user id as a string.
- Produces: `CurrentUser.id(): UUID` and `CurrentUser.require(): User` (throws `401 not_authenticated`). The principal name is the user's UUID string.
- Produces: `POST /api/auth/login {email,password}` → 200 `MeDto` | `401 bad_credentials`; `POST /api/auth/logout` → 204; `GET /api/me` → 200 `MeDto` | 401.
- Security rules: `/api/setup/**`, `/api/auth/login`, `GET /api/invites/*`, `POST /api/invites/*/register`, `POST /api/password-resets/*`, `/media/**`, the SPA and `/actuator/health` are public. `/api/admin/**` requires `ROLE_ADMIN`. All other `/api/**` require authentication. Unauthenticated `/api/**` → 401 ProblemDetail (no redirects, no login page, no HTTP Basic).
- CSRF: cookie-based, readable by the SPA (cookie `XSRF-TOKEN`, header `X-XSRF-TOKEN`, Angular's defaults). Use Spring Security's SPA CSRF support (`csrf(c -> c.spa())` if present in the Boot 4 security version, else the documented `CookieCsrfTokenRepository.withHttpOnlyFalse()` + `SpaCsrfTokenRequestHandler` pattern).
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when the request is HTTPS. Session timeout 30 days.

- [ ] **Step 1: Failing tests** `AuthIT` (using `.with(csrf())`):
  - `loginWithAnyCaseEmail`: user `davide@x.com` logs in with `" DAVIDE@x.com"` → 200, then `GET /api/me` with the same session → 200, `$.username`.
  - `wrongPasswordIs401`: `$.code == "bad_credentials"`. An unknown email gives the same response.
  - `meWithoutSessionIs401Json`.
  - `logoutEndsSession`: after logout, `/api/me` → 401.
  - `adminEndpointForbiddenForNonAdmin`: `GET /api/admin/users` as a non-admin → 403.
  - `setupLogsInAdmin`: after `POST /api/setup/admin`, `/api/me` → 200 (wires Task 3 to `AuthSessions.login`).
- [ ] **Step 2: Failing test** `CsrfIT` with a real HTTP client (`@SpringBootTest(webEnvironment = RANDOM_PORT)` + `RestClient`): a POST to `/api/auth/login` without the token → 403. `GET /api/setup/status` sets an `XSRF-TOKEN` cookie, and resending it as `X-XSRF-TOKEN` → not 403.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** `./mvnw verify` → PASS.
- [ ] **Step 6: Commit** `feat(backend): session login, logout, me and csrf`.

---

### Task 5: Media pipeline and blob storage

**Files:**
- Create: `media/BlobStore.java`, `media/LocalBlobStore.java`, `media/S3BlobStore.java`, `media/StorageConfig.java`, `media/MediaService.java`, `media/ImageProcessor.java`, `media/MediaController.java`, `media/ImageVariant.java`
- Create: `backend/src/test/resources/images/` fixtures: `orientation-6.jpg` (EXIF Orientation=6, GPS tags present, landscape pixels 400×300), `plain.png`, `fake.jpg` (a PDF), `sample.heic`
- Test: `media/ImageProcessorTest.java`, `media/LocalBlobStoreTest.java`, `media/S3BlobStoreIT.java` (MinIO Testcontainer), `media/MediaIT.java`

**Interfaces:**
- Produces: `interface BlobStore { void put(String key, byte[] data, String contentType); Optional<byte[]> get(String key); void delete(String key); }`. Keys look like `img/{random-token}/{variant}.jpg`.
- Config: `ricettine.storage.type: local|s3` (default `local`); `ricettine.storage.local.path` (default `./data/media`); `ricettine.storage.s3.bucket`, `.region`, `.endpoint` (optional, for MinIO), and `.path-style` (default false). Credentials come from the standard AWS default chain.
- Produces: `enum ImageVariant { AVATAR(256), THUMB(480), DISPLAY(1600) }`, the longest edge in px, never upscaling.
- Produces: `ImageProcessor.process(byte[] input, Set<ImageVariant> variants): Map<ImageVariant, byte[]>`. Steps: sniff the type (JPEG/PNG/WebP by magic bytes, else `415 unsupported_image`); read EXIF orientation with `metadata-extractor` and rotate/flip the pixels; resize with Thumbnailator; encode JPEG at quality 0.85 with no metadata. Register a WebP ImageIO reader (e.g. `org.sejda.imageio:webp-imageio` or TwelveMonkeys) for WebP input.
- Produces: `MediaService.store(byte[] input, Set<ImageVariant> variants): String`, which returns a media id (the random token) and writes each variant. `MediaService.delete(String mediaId)`. `MediaService.url(String mediaId, ImageVariant v): String` returns `/media/{mediaId}/{variant-lowercase}.jpg`.
- Produces: `GET /media/{mediaId}/{variant}.jpg` → 200 `image/jpeg`, `Cache-Control: public, max-age=31536000, immutable` | 404. (Plan 2 adds access rules for recipe photos; avatars are public.)
- Upload limit: `spring.servlet.multipart.max-file-size: 15MB` and `max-request-size: 16MB`. Exceeding it → `413 file_too_large` (handled in `ProblemAdvice`).

- [ ] **Step 1: Failing unit tests** `ImageProcessorTest`:
  - `appliesExifOrientationThenStrips`: `orientation-6.jpg` → the DISPLAY output is 300×400 (portrait), and `metadata-extractor` finds no EXIF directory and no GPS directory in the output.
  - `neverUpscales`: a 400×300 input with THUMB → 400×300.
  - `downscalesLongestEdge`: a 3000×2000 generated image with DISPLAY → 1600×1067.
  - `rejectsPdfDisguisedAsJpeg` and `rejectsHeic` → `ApiException` with code `unsupported_image`.
- [ ] **Step 2: Failing tests** `LocalBlobStoreTest` (temp dir: put/get/delete round trip; get of a missing key → empty; a key containing `..` → `IllegalArgumentException`) and `S3BlobStoreIT` (MinIO container `minio/minio`: the same round trip).
- [ ] **Step 3: Failing IT** `MediaIT`: store via `MediaService` → `GET` the url returns JPEG bytes with the immutable cache header; an unknown id → 404.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement.** **Step 6: Run** `./mvnw verify` → PASS.
- [ ] **Step 7: Commit** `feat(backend): image pipeline with exif orientation, stripping, local and s3 storage`.

---

### Task 6: Instance invites and registration

**Files:**
- Create: `common/Tokens.java`, `invite/InviteService.java`, `invite/AdminInviteController.java`, `invite/PublicInviteController.java`
- Test: `common/TokensTest.java`, `invite/InviteIT.java`

**Interfaces:**
- Produces: `Tokens.newToken(): String` (43 chars, base64url) and `Tokens.hash(String token): String` (SHA-256 lowercase hex, 64 chars).
- Produces: `enum TokenPurpose { INSTANCE_INVITE, PASSWORD_RESET }` in `common/` (Plan 3 adds `COOKBOOK_INVITE`). `OneTimeTokenRepository`, plus a method that atomically claims a token: `UPDATE one_time_token SET used_at = now() WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING *`. Zero rows → invalid.
- Produces (admin): `POST /api/admin/invites` → 201 `{"id","url","expiresAt"}`, where `url = {ricettine.base-url}/invite/{token}` (`ricettine.base-url` defaults to deriving from the request, via `ServletUriComponentsBuilder.fromCurrentContextPath()`). `GET /api/admin/invites` lists the active ones (`id, createdAt, expiresAt`; the token is never shown again). `DELETE /api/admin/invites/{id}` → 204 (sets `revoked_at`).
- Produces (public): `GET /api/invites/{token}` → 200 `{"expiresAt"}` | `404 invite_invalid`. `POST /api/invites/{token}/register` (body `NewAccountRequest`) → 201 `MeDto` and a logged-in session | `404 invite_invalid`.
- The claim and the account creation happen in one transaction, so a failed registration (e.g. `username_taken`) does not burn the invite.

- [ ] **Step 1: Failing tests** `TokensTest` (length 43, URL-safe charset, two calls differ, hash is 64 hex chars and deterministic).
- [ ] **Step 2: Failing IT** `InviteIT`:
  - `adminCreatesInviteAndUserRegisters` → 201, `$.admin == false`, `/api/me` works.
  - `inviteIsSingleUse` → the second registration with the same token → `404 invite_invalid`.
  - `concurrentRegistrationUsesInviteOnce`: 2 parallel registrations (different emails) → exactly one 201.
  - `expiredInviteInvalid` (set `expires_at` in the past via the repository) and `revokedInviteInvalid`.
  - `failedRegistrationKeepsInvite`: first try with a taken username → 409. Retry with a free username → 201.
  - `nonAdminCannotCreateInvite` → 403.
  - `tokenNotStoredInPlaintext`: the DB `token_hash` doesn't equal the token from the url.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(backend): invite-only registration`.

---

### Task 7: Profile, password, avatar, admin password reset, account deletion

**Files:**
- Create: `account/MeController.java`, `account/AccountDeletionHook.java`, `admin/AdminUserController.java`, `auth/PasswordResetController.java`
- Modify: `account/AccountService.java`
- Test: `account/MeIT.java`, `admin/PasswordResetIT.java`, `account/AccountDeletionIT.java`

**Interfaces:**
- Produces: `PATCH /api/me {displayName?, username?}` → `MeDto` (same validation and 409s as registration). `PUT /api/me/password {currentPassword, newPassword}` → 204 | `400 bad_credentials`. Changing the password keeps the current session and invalidates the user's other sessions.
- Produces: `PUT /api/me/avatar` (multipart `file`) → `MeDto` with `avatarUrl` = the AVATAR variant url. The old avatar media is deleted. `DELETE /api/me/avatar` → `MeDto` with `avatarUrl: null`.
- Produces: `GET /api/admin/users` → `[{id, username, displayName, email, admin, createdAt}]`. `POST /api/admin/users/{id}/password-reset` → 201 `{"url","expiresAt"}` (`{base-url}/reset/{token}`, 24h). `POST /api/password-resets/{token} {newPassword}` → 204 | `404 reset_invalid`, and invalidates all of that user's sessions.
- Produces: `interface AccountDeletionHook { void beforeDelete(UUID userId); }`. `AccountService.delete(UUID userId)` calls every hook bean (Plans 2/3 add hooks that delete recipe photos and owned cookbooks), deletes the avatar media, deletes the user (FK cascades remove tokens), and invalidates their sessions.
- Produces: `DELETE /api/me {password}` → 204 | `400 bad_credentials` | `409 last_admin` (the only admin can't delete their account while other users exist; if they're the only user, deletion is allowed and the instance returns to setup-required by also clearing `instance_setup`).

- [ ] **Step 1: Failing IT** `MeIT`: rename (display name), change username (a taken one → 409), change password (the old one stops working for login), avatar upload (`orientation-6.jpg` → `avatarUrl` serves a 256-px-long-edge JPEG), avatar replace deletes the old blob (`BlobStore.get(oldKey)` empty), upload of `fake.jpg` → `415 unsupported_image` and no new blob.
- [ ] **Step 2: Failing IT** `PasswordResetIT`: an admin creates a reset link; the user sets a new password → 204; the old session for that user → 401; the new password logs in; the link is single-use; an expired link → 404.
- [ ] **Step 3: Failing IT** `AccountDeletionIT`: wrong password → 400. Success → 204, the user row is gone, their session → 401, the avatar blob is gone, and a registered test `AccountDeletionHook` bean was called with the user id. As sole admin with another user present → `409 last_admin`. As the only user → 204, and `/api/setup/status` → `setupRequired: true`.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement.** **Step 6: Run** → PASS.
- [ ] **Step 7: Commit** `feat(backend): profile, avatar, admin password reset and account deletion`.

---

### Task 8: Frontend skeleton, core services, i18n

**Files:**
- Create: `frontend/` via `npx @angular/cli@latest new frontend --style=scss --routing --ssr=false` (standalone, zoneless if offered, Vitest)
- Create: `frontend/proxy.conf.json` (`/api`, `/media` → `http://localhost:8080`)
- Create: `frontend/src/app/core/api-error.ts`, `core/auth.store.ts`, `core/auth.guards.ts`, `core/i18n.config.ts`, `core/media.ts`
- Create: `frontend/public/i18n/en.json`
- Create: `frontend/src/app/shell/shell.component.ts` (top bar + mobile bottom nav placeholder), `frontend/src/styles/_tokens.scss` (colors, spacing, 44px touch target mixin; palette from the mockups: ink `#2b2622`, accent `#c8553d`, background `#f4f1ec`)
- Test: specs beside each file

**Interfaces:**
- Produces: `type ApiError = { status: number; code: string; fields?: Record<string,string> }`. `toApiError(e: unknown): ApiError` maps `HttpErrorResponse` with a ProblemDetail body, and maps network failures to `{status: 0, code: 'network_error'}`. `errorKey(e: ApiError): string` returns `errors.${code}`, falling back to `errors.unknown`.
- Produces: `@Injectable({providedIn:'root'}) class AuthStore` with `readonly me: Signal<Me | null>`, `readonly ready: Signal<boolean>`, `load(): Promise<void>` (GET `/api/me`; 401 → null), `login(email, password): Promise<void>`, `logout(): Promise<void>`, `setMe(me: Me)`. `type Me` mirrors `MeDto`.
- Produces: guards `authGuard` (→ `/login?next=<url>`), `adminGuard`, `guestGuard`, and `setupGuard` (if `GET /api/setup/status` says required, every route except `/setup` redirects to `/setup`).
- Produces: `provideHttpClient(withXsrfConfiguration({}))` defaults (XSRF-TOKEN / X-XSRF-TOKEN), and an `APP_INITIALIZER`-equivalent (`provideAppInitializer`) that runs `AuthStore.load()`.
- Produces: Transloco configured with `availableLangs: ['en']`, `defaultLang: 'en'`, loader from `/i18n/{lang}.json`. Keys are namespaced (`errors.*`, `auth.*`, `setup.*`, `settings.*`, `admin.*`, `common.*`). `en.json` contains an `errors.*` entry for every backend code in this plan.

- [ ] **Step 1: Failing specs**: `toApiError` maps a ProblemDetail `{code:'email_taken'}` with status 409, and maps status 0 to `network_error`. `AuthStore.load` sets `me` from a 200 and `null` on a 401 (HttpTestingController). `authGuard` redirects to `/login?next=%2Fsettings` when `me` is null. `setupGuard` redirects to `/setup` when status says required. A spec asserts every `errors.*` code listed in the backend (keep a `KNOWN_ERROR_CODES` array in `api-error.ts`) exists in `en.json`.
- [ ] **Step 2: Run** `cd frontend && npx ng test --watch=false` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. `npx ng build` succeeds.
- [ ] **Step 5: Commit** `feat(frontend): angular skeleton with auth store, guards, error mapping and i18n`.

---

### Task 9: Frontend public screens: setup, login, register via invite, reset password

**Files:**
- Create: `frontend/src/app/auth/setup.page.ts`, `auth/login.page.ts`, `auth/register.page.ts`, `auth/reset-password.page.ts`, `auth/account-form.component.ts` (shared email/username/displayName/password fields with client-side validation matching the Global Constraints)
- Modify: `frontend/src/app/app.routes.ts` → `/setup`, `/login`, `/invite/:token`, `/reset/:token`, `/` (placeholder home: "Hi {displayName}" + logout, replaced in Plan 4)
- Test: specs beside each page

**Interfaces:**
- Consumes: `AuthStore`, `toApiError`, `errorKey` (Task 8). Backend endpoints from Tasks 3, 4, 6 and 7.
- Behavior: after a successful setup or registration, `AuthStore.setMe(me)` and navigate to `/`. Login honors `?next=` (only same-origin paths starting with `/`). Register first calls `GET /api/invites/:token`; on 404 it shows the `invite.invalid` message instead of the form. Field-level server errors (`email_taken`, `username_taken`, `invalid_username`, `username_reserved`, `password_too_short`) show under the matching field. Others show in a form-level alert.
- Inputs use `type="email"`, `autocomplete` attributes (`username`, `new-password`, `current-password`) and `autocapitalize="none"` for email/username.

- [ ] **Step 1: Failing specs**: the login page shows `errors.bad_credentials` on a 401. `next=//evil.com` is ignored (navigates to `/`). The register page with an invalid token shows the invalid message and no form. A `username_taken` error renders under the username field. The username field rejects `Davide` client-side with the `errors.invalid_username` text.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check:** run the backend (`./mvnw spring-boot:run` against `docker run -p 5432:5432 -e POSTGRES_USER=ricettine -e POSTGRES_PASSWORD=ricettine -e POSTGRES_DB=ricettine postgres:17-alpine`) and `npx ng serve --proxy-config proxy.conf.json`. In the browser's 360-px device mode, complete setup, log out, log in.
- [ ] **Step 6: Commit** `feat(frontend): setup, login, invite registration and password reset screens`.

---

### Task 10: Frontend settings and admin screens

**Files:**
- Create: `frontend/src/app/settings/profile.page.ts` (display name, username, avatar via `<input type="file" accept="image/jpeg,image/png,image/webp">` without `capture`, so the phone offers both camera and gallery), `settings/password.page.ts`, `settings/delete-account.page.ts`
- Create: `frontend/src/app/admin/invites.page.ts`, `admin/users.page.ts`
- Create: `frontend/src/app/shared/copy-link.component.ts` (shows a URL, a "Copy" button using `navigator.clipboard`, and "Share" via `navigator.share` when available)
- Modify: `app.routes.ts` → `/settings/profile`, `/settings/password`, `/settings/delete`, `/admin/invites`, `/admin/users`; links in the shell (admin links only when `me.admin`)
- Test: specs beside each

**Interfaces:**
- Consumes: Task 7 and Task 6 endpoints; `AuthStore.setMe` after profile or avatar changes.
- Behavior: Delete-account requires typing the current password, and shows `errors.last_admin` on 409. On success, `AuthStore` is cleared → `/login` (or `/setup` if the backend now reports setup required). The avatar upload shows a spinner and maps `file_too_large` / `unsupported_image`. Before uploading, the client rejects files > 15 MB with the same `errors.file_too_large` message. The invites page: "Create invite" → shows `CopyLinkComponent` with the url and its expiry, lists active invites with "Revoke". The users page: list, plus a "Reset password" action → `CopyLinkComponent`.

- [ ] **Step 1: Failing specs**: the profile page saves the display name and updates the shell's name via `AuthStore`. A client-side 16 MB file shows `errors.file_too_large` and makes no request. Delete-account with a 409 shows the last-admin message. The invites page renders the url from a mocked 201 and removes the row after revoke. Admin nav links are hidden for non-admins.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check** on a real phone over LAN (`ng serve --host 0.0.0.0`): upload a portrait photo taken with the phone camera as the avatar. It shows upright.
- [ ] **Step 6: Commit** `feat(frontend): profile, password, account deletion and admin screens`.

---

### Task 11: Single image and zero-config compose

**Files:**
- Create: `Dockerfile` (stage 1 `node:24-alpine`: `npm ci && npx ng build` → `dist/frontend/browser`; stage 2 `eclipse-temurin:25-jdk`: `./mvnw -DskipTests package` with the frontend output copied to `backend/src/main/resources/static/` before packaging; stage 3 `eclipse-temurin:25-jre`: non-root user, `VOLUME /data`, `ENV RICETTINE_STORAGE_LOCAL_PATH=/data/media`, `EXPOSE 8080`, healthcheck on `/actuator/health`)
- Create: `.dockerignore`, `compose.yaml`, `README.md` (quick start: `docker compose up -d` → open `http://localhost:8080` → create the admin; configuration env table; upgrade = `docker compose pull && docker compose up -d`)
- Create: `scripts/smoke.sh`
- Modify: `.gitignore` (`backend/target`, `frontend/node_modules`, `frontend/dist`, `data/`)

**Interfaces:**
- `compose.yaml`: service `db` (`postgres:17-alpine`, volume `db-data`, env `POSTGRES_USER/DB=ricettine`, `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-ricettine}`, healthcheck `pg_isready`, **no published port**); service `app` (`build: .` and `image: ghcr.io/spezialissimo/ricettine:latest`, `depends_on: db: condition: service_healthy`, `SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/ricettine`, user/password matching, volume `app-data:/data`, port `8080:8080`).
- `scripts/smoke.sh`: `docker compose up -d --build`, waits for health, then `curl`s: `/` contains `<app-root`, `/api/setup/status` returns `{"setupRequired":true}`, and `/r/anything` returns index HTML. Exits non-zero on any failure, then runs `docker compose down -v`.

- [ ] **Step 1: Write** `scripts/smoke.sh` and run it → FAIL (no Dockerfile).
- [ ] **Step 2: Implement** the Dockerfile and compose. Verify `docker buildx build --platform linux/amd64,linux/arm64 .` succeeds (the hosted EC2 is arm64).
- [ ] **Step 3: Run** `scripts/smoke.sh` → exits 0.
- [ ] **Step 4: Manual check:** `docker compose up -d`, then complete setup and create an invite in the browser. `docker compose restart app` → still logged in (JDBC sessions) and the avatar still loads (volume).
- [ ] **Step 5: Commit** `feat: single docker image and zero-config compose`.
