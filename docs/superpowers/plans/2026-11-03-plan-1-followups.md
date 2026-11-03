# Plan 1 follow-ups (carry into later plans)

Collected from the per-task and whole-branch reviews of Plan 1. Nothing here blocks Plan 1; each item names the plan that should pick it up.

## Plan 2 (recipes & editor): entry criteria
- Image decode memory: decode with `ImageReadParam.setSourceSubsampling` toward the largest requested variant and bound concurrent image processing. A 50–60 MP photo currently costs about 350–420 MB of transient memory, and the offline photo queue will upload several photos at once.
- Media ownership: add a `media` table (owner, recipe) for access checks on private-recipe photos and for garbage-collecting orphans. Drop `Cache-Control: public, immutable` for non-public media (`MediaController`).
- Frontend: add a global 401 interceptor that clears `AuthStore.me` and routes to `/login?next=`. Autosave depends on it.
- Move `OneTimeToken` / `OneTimeTokenRepository` from `invite` to `common` (before Plan 3 adds `COOKBOOK_INVITE`).
- Scope `logging.level.org.hibernate.orm.jdbc.error=OFF` in `IntegrationTest` to the conflict tests only; it currently hides all SQL errors.
- Image tests: alpha/gray/CMYK inputs, orientations 5/7, the pixel-limit rejection. Consider an `image_too_large` code instead of `unsupported_image` above 60 MP. ICC profiles are dropped (slight P3 colour shift).
- Form accessibility: `aria-describedby` / `aria-invalid`, errors outside `<label>`, `autocomplete="email"` on registration, a feedback message for an invalid login submit, per-field `validation_failed` messages (the display-name error lacks a `fields` map).
- `media.ts` accepts `//host` refs; tighten it.

## Plan 3 (cookbooks)
- The account-deletion confirmation must name owned cookbooks (spec §3); `AccountDeletionHook` may need a `describe(userId)` companion.
- Hooks must defer blob deletes via `AfterTransaction.afterCommit` (already documented on the interface).

## Plan 5 (hosting & CI)
- Publish the image to ghcr, then switch the README upgrade path back to `docker compose pull`.
- Login rate limiting (argon2 is about 16 MB / 100 ms per attempt; concurrency is already bounded at 4).
- Re-test S3 storage against real AWS S3 (tests use `adobe/s3mock`, pinned to 5.2.3).
- Run the amd64 image (only built so far, never executed).
- Session upgrade hazard: sessions are Java-serialized; plan for clearing `spring_session` on major Spring Security bumps, or a JSON serializer.
- Proxy docs: invite/reset tokens appear in URL paths, so keep them out of access logs.
- Maven prints 401 metadata warnings for the flyway/red-gate repos; check CI tolerates them.
- `Dockerfile` has `dependency:resolve || true` in the cache-warm layer.

## Small cleanups (any time)
- `one_time_token.created_by ON DELETE CASCADE`: invites die when their admin leaves. Consider `SET NULL`.
- Revoking an already-used invite returns 204 (make it 404); app clock vs DB `now()` for `expires_at`.
- `lockAdmins` has no `ORDER BY`; there is no concurrency test for last-admin.
- 30-day session cookie is absolute while the server timeout slides.
- Duplicated `static/index.html` constant; HEAD requests on SPA paths return 401 for anonymous users.
- Frontend: the revoke button has no in-flight guard; the hidden file input isn't keyboard-focusable; the spinner has no label; copy failure gives no feedback; the admin tab nav is duplicated; there are unused i18n keys; the shell has no logout control (Plan 4 replaces home).
- Missing tests: 404/405/415 codes, configured `ricettine.base-url`, immutable bundle caching, afterRollback avatar cleanup.

## Product decisions for the owner
- Admins can create a password-reset link for any user, including other admins and themselves. That's acceptable while admins are fully trusted; revisit before opening to other people.
