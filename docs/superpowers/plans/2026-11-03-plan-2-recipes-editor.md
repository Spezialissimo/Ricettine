# Plan 2 — Recipes & Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users write recipes in a **desktop browser first**, and comfortably in a phone browser too: one editor with structured ingredients, numbered steps with photos, drafts, autosave that doesn't lose typed text, publish, and a share link that opens a read-only recipe page.

**Architecture:** A recipe is saved as a **whole document** (`PUT /api/recipes/{id}` with an optimistic-lock `version`); the server replaces its groups, ingredients and steps in one transaction. The backend assigns recipe ids. The API is client-agnostic JSON so a future native Android app can use it unchanged; mobile-web-specific machinery is kept minimal (owner: a real mobile app would be native, not a web app). Recipe photos are rows in a new `media` table owned by a user and a recipe. `GET /media/...` checks access per kind: avatars stay public; recipe photos need the author's session or the recipe's current share token (`?s=`). Resetting the link therefore kills old photo URLs too.

**Tech Stack:** Existing (Spring Boot 4.1.2, Java 25, Postgres 17, Flyway, Angular 22.2 zoneless, Transloco, Playwright). Added: `@angular/cdk` drag-drop and dialog (already installed). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md` (§4, §5, plus the §7 recipe page without scaling or keep-screen-on). Scope change vs spec §5 [owner, 2026-11-03]: offline durability is reduced to keeping unsaved *text* in the browser and retrying; no offline photo queue, no starting recipes offline (a future Android app would own real offline support). This plan also carries the "Plan 2 entry criteria" from `docs/superpowers/plans/2026-11-03-plan-1-followups.md`.

## Delivery: 6 small PRs
Each PR is its own branch off `main`, opened when the previous PR is merged. If the previous one isn't merged yet, stack on its branch and set the PR base to it. A PR is done only when it is green in CI (backend, frontend, e2e on **mobile and desktop**, smoke) and contains backend ITs plus Playwright e2e specs for its feature. No manual checks in PR test plans. Visual polish is out of scope: screens must be functional and easy to use, not pretty.

**Target [owner, 2026-11-03]:** the main focus is a web app that works well on **desktop**, with an interface that is also easy to use in a **phone browser**. Every screen in this plan is responsive with two layouts (see Global Constraints). The desktop e2e project asserts the desktop layout, and the mobile project asserts the phone layout.

| PR | Branch | Tasks | User-visible result |
|---|---|---|---|
| A | `feat/p2-foundations` | 1–4 | Expired sessions land on login; big photos don't exhaust memory |
| B | `feat/p2-recipe-editor` | 5–8 | Create, autosave and publish a recipe (text only); "My recipes" list |
| C | `feat/p2-recipe-photos` | 9–10 | Cover and step photos |
| D | `feat/p2-step-reorder` | 11 | Drag steps by their handle |
| E | `feat/p2-share-page` | 12–13 | Share link, link reset, read-only recipe page at `/r/{token}` |
| F | `feat/p2-unsaved-safety` | 14–15 | Typed text survives a lost connection or a closed tab; failed photo uploads can be retried |

## Global Constraints
- All Plan 1 Global Constraints still hold: UUID PKs; ProblemDetail + `code`; every UI string via Transloco `frontend/public/i18n/en.json`; 44 px touch targets; Flyway-only schema; the 15 MB / JPEG-PNG-WebP image rule; no AWS code outside `media/S3BlobStore.java`.
- Responsive layout: breakpoint **768 px** (`$bp-desktop` token in `styles/_tokens.scss`).
  - **≥ 768 px (desktop):** the shell has a top navigation bar (My recipes, + New recipe, Settings, Admin) and content is centered at max-width 1100 px.
  - **< 768 px (phone):** the shell has a compact top bar plus a bottom navigation.
  - Touch targets stay ≥ 44 px in both layouts.
  - Remove the README note saying the UI isn't responsive.
- New error codes must be added to `KNOWN_ERROR_CODES` in `frontend/src/app/core/api-error.ts` and to `en.json` (a spec enforces this): `recipe_not_found`, `recipe_conflict`, `recipe_incomplete`, `invalid_unit`, `photo_not_in_recipe`.
- Recipe limits (server-validated, 400 `validation_failed` with `fields`; the client mirrors them):
  - Title ≤ 200 chars; portions integer 1–100, default **1**; prep and cook minutes 0–10080.
  - Source ≤ 500; notes ≤ 10 000.
  - ≤ 20 ingredient groups, group name ≤ 100; ≤ 200 ingredients total; ingredient name 1–200, note ≤ 200; amount null or 0 < amount ≤ 1 000 000 with ≤ 3 decimals.
  - ≤ 100 steps, step text ≤ 5 000.
- Units are fixed codes, stored as text, displayed via `units.{code}` i18n keys: `g, kg, ml, l, tsp, tbsp, cup, piece, pinch, clove, slice, can, bunch`. Unknown code → 400 `invalid_unit`.
- Amount input accepts `0.5`, `0,5`, `1/2`, `1 1/2`, `½`, `¼`, `¾` and stores a decimal. Empty means no amount ("salt to taste").
- Publishing requires a non-blank title, ≥ 1 ingredient and ≥ 1 step (spec §4.1). Otherwise 400 `recipe_incomplete` with `fields` ⊆ {`title`, `ingredients`, `steps`}. The same rule applies to every save of an already-published recipe (spec §4.2: a published recipe can never become invalid).
- Visibility: `PRIVATE` (unlisted, link-only) | `PUBLIC`; default `PRIVATE`. Status: `DRAFT` | `PUBLISHED`. Drafts are author-only, have no working link, and cannot be added to cookbooks (Plan 3).
- Share token: `Tokens.newToken()`, stored in plaintext (it is the link, like an unlisted video id, not an account credential), unique, created with the recipe. Links work only while the recipe is published.
- Recipe photo URLs: `/media/{mediaId}/{variant}.jpg?s={shareToken}` for readers, without `s` for the author. Cache header `private, max-age=3600` for recipe media; avatars keep `public, max-age=31536000, immutable`. A denied request returns 404 (never reveal existence).
- Recipe photo variants: `THUMB` (480) and `DISPLAY` (1600).
- Autosave: debounce 800 ms after the last change, at most 5 s between saves while typing. One request in flight at a time. The "Saved ✓" indicator shows only after the server confirms.
- Image processing: decode with source subsampling (Task 2). At most `ricettine.media.max-concurrent-processing` (default **2**) concurrent processings; wait up to 30 s, then 503 `busy`.

## Review Focus
1. **Connection drops or the tab is closed with unsent text:** reopening the editor restores the text and saves it. A photo upload that fails is never silently dropped (it shows a retry). Tested in Task 15 (`unsaved text survives closing the tab`, `failed upload can be retried`).
2. **The same recipe is open on two devices:** a stale save is rejected, nothing is silently overwritten, and the losing side keeps its text visible. Tested in Task 5 (`staleVersionIs409`) and Task 15 (`conflict keeps my text`).
3. **Link reset:** the old recipe link and the old photo URLs stop working; the new ones work. Tested in Task 12 (`resetInvalidatesOldLinkAndPhotos`) and Task 13 (e2e).
4. **Large or simultaneous phone photos (48–200 MP, several at once):** processed without exhausting the heap; overload gives 503 `busy`, not 500 or OOM. Tested in Task 2 (`subsamplesLargeImages`, `boundsConcurrentProcessing`).
5. **Emptying a published recipe:** clearing the title or removing the last step or ingredient is rejected with a clear message, and nothing already saved is lost. Tested in Task 5 (`publishedRecipeCannotBecomeIncomplete`) and Task 8 (e2e).

---

## PR A — Foundations (`feat/p2-foundations`)

### Task 1: Move one-time tokens to `common`; scope SQL-error log silencing

Mechanical. No behavior change.

**Files:**
- Move: `backend/src/main/java/com/ricettine/invite/OneTimeToken.java` and `OneTimeTokenRepository.java` → `backend/src/main/java/com/ricettine/common/`
- Modify: every importer (`invite/*`, `auth/PasswordResetService`, `account/AccountService`, `common/OneTimeTokens`)
- Modify: `backend/src/test/java/com/ricettine/IntegrationTest.java` (remove the global `logging.level.org.hibernate.orm.jdbc.error=OFF`)
- Modify: the conflict tests that expect unique violations (`AccountServiceIT`, `InviteIT`, `MeIT`; find them with `grep -rl "_taken" backend/src/test`): add `@TestPropertySource(properties = "logging.level.org.hibernate.orm.jdbc.error=OFF")` per class

- [ ] **Step 1:** Move the classes and fix imports. `cd backend && ./mvnw verify` → green, with no unique-violation WARN lines in output.
- [ ] **Step 2:** Commit `refactor(backend): move one-time tokens to common, scope SQL error log silencing`.

### Task 2: Subsampled decode and bounded image processing

**Files:**
- Modify: `backend/src/main/java/com/ricettine/media/ImageProcessor.java`, `media/MediaService.java`
- Create: `backend/src/main/java/com/ricettine/media/ProcessingLimiter.java`
- Modify: `backend/src/main/resources/application.yml` (`ricettine.media.max-concurrent-processing: 2`)
- Test: `media/ImageProcessorTest.java`, `media/ProcessingLimiterTest.java`

**Interfaces:**
- Produces: `static int ImageProcessor.subsampleFactor(int width, int height, int targetLongEdge)` = `max(1, floor(max(width, height) / (2 * targetLongEdge)))`, where `targetLongEdge` is the largest requested variant. The image is decoded with `ImageReadParam.setSourceSubsampling(f, f, 0, 0)`, so the decoded long edge stays ≥ 2× the largest variant.
- Produces: `ProcessingLimiter.run(Supplier<T>)`, a fair `Semaphore` with `permits` from config, `tryAcquire(30, SECONDS)`, otherwise `ApiException(503, "busy")`, released in `finally`. `MediaService.store` wraps `processor.process` with it.
- The `MAX_PIXELS` cap is raised to 250 000 000. It is checked against header dimensions before decoding, as today.

- [ ] **Step 1: Failing tests:**
  - `subsampleFactor(8000, 6000, 1600) == 2`, `(4000, 3000, 1600) == 1`, `(16000, 12000, 480) == 16`.
  - `subsamplesLargeImages`: a generated 8000×6000 JPEG processed for `{THUMB, DISPLAY}` → DISPLAY is 1600×1200, and the decoded intermediate never exceeds 3200 px on its long edge (assert via a package-private hook or the factor reported in a `ProcessedImage` record — implementer's choice, but the assertion must be real).
  - Orientation tests still pass on subsampled input (an orientation-6 8000×6000 fixture → DISPLAY 1200×1600).
  - Follow-up coverage: orientations 5 and 7 (pixel-checked like 6); a PNG with alpha → flattened onto white (corner pixel ≈ white); a grayscale JPEG → RGB output without darkening (mean within ±3 of the input); a CMYK JPEG → 415 `unsupported_image` (documented behavior); over `MAX_PIXELS` → 413 `image_too_large` (new code; add it to frontend `KNOWN_ERROR_CODES` and `en.json`).
  - `ProcessingLimiterTest.boundsConcurrentProcessing`: 2 permits, 3 concurrent tasks blocking on a latch → the third waits. With a 100 ms wait override → `busy`. A task that throws releases its permit.
- [ ] **Step 2:** Run `./mvnw verify -Dtest=ImageProcessorTest,ProcessingLimiterTest` → FAIL.
- [ ] **Step 3:** Implement. Make the limiter's wait configurable for tests (`ricettine.media.processing-wait`, default `30s`).
- [ ] **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(media): subsampled decode and bounded concurrent processing`.

### Task 3: Media registry and per-kind access

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__media.sql`
- Create: `media/Media.java` (entity), `media/MediaRepository.java`, `media/MediaKind.java`, `media/MediaAccessPolicy.java` (interface), `media/AvatarAccessPolicy.java`
- Modify: `media/MediaService.java`, `media/MediaController.java`, `account/AccountService.java` (avatar store/delete go through the new API)
- Test: `media/MediaAccessIT.java`; existing `MediaIT`, `MeIT` stay green

**Interfaces:**
- Schema `V3`: `media(id varchar(64) primary key, owner_id uuid not null references app_user(id) on delete cascade, kind varchar(16) not null, recipe_id uuid null, created_at timestamptz not null)`. `recipe_id` gets its FK in V4 (Task 5). Backfill: `insert into media(id, owner_id, kind, created_at) select avatar_key, id, 'AVATAR', now() from app_user where avatar_key is not null`.
- Produces: `enum MediaKind { AVATAR, RECIPE }`.
- Produces: `MediaService.store(byte[] input, Set<ImageVariant> variants, UUID ownerId, MediaKind kind, UUID recipeIdOrNull): String`, which writes the blobs, then the row. The existing rollback cleanup is kept. The old `store(byte[], Set)` is removed. `MediaService.delete(String mediaId)` deletes the row and the blobs (blobs after commit via `AfterTransaction`).
- Produces: `interface MediaAccessPolicy { MediaKind kind(); Optional<String> cacheControl(Media m, HttpServletRequest req); }`. An empty result means denied (→ 404). `AvatarAccessPolicy` always grants `public, max-age=31536000, immutable`. `MediaController` looks up the row (unknown id → 404) and dispatches to the policy bean for its kind (no policy for the kind → 404).

- [ ] **Step 1: Failing ITs** `MediaAccessIT`: an uploaded avatar is served anonymously with the immutable header. A `RECIPE`-kind row inserted directly (no policy yet) → 404 for everyone. An unknown id → 404. The migration backfills an existing `avatar_key` (insert a user with `avatar_key` and blobs before migration, using a Flyway `target` test or by asserting a row exists for an avatar uploaded before the new code path — implementer's choice, but prove the backfill SQL runs).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(media): media registry with per-kind access policy`.

### Task 4: Frontend handles expired sessions globally (+ e2e)

**Files:**
- Create: `frontend/src/app/core/auth.interceptor.ts` (+ spec)
- Modify: `frontend/src/app/app.config.ts` (register via `withInterceptors`)
- Create: `e2e/tests/session-expiry.spec.ts`

**Interfaces:**
- Produces: `authInterceptor: HttpInterceptorFn`. On a 401 from any `/api/` request except `GET /api/me` and `POST /api/auth/login`, it calls `AuthStore.setMe(null)` and navigates to `/login?next=<current router url>` (unless already on a guest page). It rethrows the error.

- [ ] **Step 1: Failing specs:** a 401 on `PATCH /api/me` → `me()` becomes null and the router navigates to `/login?next=%2Fsettings%2Fprofile`. A 401 on `GET /api/me` → no navigation. A 403 → no navigation.
- [ ] **Step 2: Failing e2e** `session-expiry.spec.ts` (runs in mobile and desktop): log in as a fresh user (`newUserPage` helper), open `/settings/profile`, `context.clearCookies({ name: 'SESSION' })`, change the display name and save → URL becomes `/login?next=%2Fsettings%2Fprofile`. Log in → back on `/settings/profile`.
- [ ] **Step 3:** Run (`ng test`, `scripts/e2e.sh`) → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): global handling of expired sessions`. Open PR A.

---

## PR B — Recipe editor, text only (`feat/p2-recipe-editor`)

### Task 5: Recipe schema, service and API

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__recipes.sql`
- Create in `backend/src/main/java/com/ricettine/recipe/`: `Recipe.java`, `IngredientGroup.java`, `Ingredient.java`, `Step.java` (entities), `RecipeRepository.java`, `RecipeStatus.java`, `Visibility.java`, `Unit.java`, `RecipeDtos.java`, `RecipeValidator.java`, `RecipeService.java`, `RecipeController.java`
- Test: `recipe/RecipeValidatorTest.java`, `recipe/RecipeApiIT.java`

**Interfaces:**
- Schema `V4`:
  - `recipe(id uuid pk, author_id uuid not null fk app_user on delete cascade, status varchar(16) not null, visibility varchar(16) not null, title varchar(200), portions int not null default 1 check (portions between 1 and 100), prep_minutes int check (prep_minutes between 0 and 10080), cook_minutes int (same check), source varchar(500), notes text, cover_media_id varchar(64) null fk media(id) on delete set null, share_token varchar(43) not null unique, version bigint not null, created_at, updated_at, published_at timestamptz null)`, index `(author_id, updated_at desc)`.
  - `ingredient_group(id uuid pk, recipe_id fk recipe on delete cascade, position int not null, name varchar(100))`.
  - `ingredient(id uuid pk, group_id fk ingredient_group on delete cascade, position int not null, amount numeric(10,3), unit varchar(16), name varchar(200) not null, note varchar(200))`.
  - `step(id uuid pk, recipe_id fk recipe on delete cascade, position int not null, text varchar(5000) not null default '', photo_media_id varchar(64) null fk media(id) on delete set null)`.
  - `alter table media add constraint fk_media_recipe foreign key (recipe_id) references recipe(id) on delete set null`.
- Produces DTOs (in `RecipeDtos`):
  - `record IngredientDto(BigDecimal amount, String unit, String name, String note)`, `record GroupDto(String name, List<IngredientDto> ingredients)`, `record PhotoDto(String mediaId, String thumbUrl, String displayUrl)`, `record StepDto(String text, PhotoDto photo)`.
  - `record RecipeDto(UUID id, String status, String visibility, String title, int portions, Integer prepMinutes, Integer cookMinutes, String source, String notes, PhotoDto cover, List<GroupDto> groups, List<StepDto> steps, long version, String shareUrl, Instant createdAt, Instant updatedAt, Instant publishedAt)`. `shareUrl` is null until Task 12.
  - `record RecipeInput(long version, String title, int portions, Integer prepMinutes, Integer cookMinutes, String source, String notes, String visibility, String coverMediaId, List<GroupDto> groups, List<StepInput> steps)` with `record StepInput(String text, String photoMediaId)`. Photo ids must be null until Task 9.
  - `record RecipeSummary(UUID id, String title, String status, String visibility, String coverThumbUrl, Instant updatedAt)`.
- Endpoints (all authenticated; any recipe not owned by the caller → 404 `recipe_not_found`):
  - `POST /api/recipes` (no body) → 201 `RecipeDto` + `Location: /api/recipes/{id}`: an empty draft with a server-generated UUID (portions 1, PRIVATE, version 0).
  - `GET /api/recipes/mine` → `List<RecipeSummary>`, `updatedAt` desc.
  - `GET /api/recipes/{id}` → `RecipeDto`.
  - `PUT /api/recipes/{id}` (`RecipeInput`) → 200 `RecipeDto` with `version + 1`. `input.version != stored.version` → 409 `recipe_conflict`. Validation per Global Constraints. If the recipe is PUBLISHED and the result would be incomplete → 400 `recipe_incomplete`. Groups, ingredients and steps are replaced wholesale. Positions follow list order. Strings are trimmed; empty → null (except step text → `''`). A group with no name and no ingredients is dropped.
  - `POST /api/recipes/{id}/publish {version}` → 200 `RecipeDto` (status PUBLISHED, `publishedAt` set once) | 400 `recipe_incomplete` | 409.
  - `DELETE /api/recipes/{id}` → 204.
- `RecipeValidator.validate(RecipeInput): Map<String,String>` (field → code) and `RecipeValidator.missingForPublish(...)`: `Set<String>` ⊆ {title, ingredients, steps}.

- [ ] **Step 1: Failing unit tests** `RecipeValidatorTest`:
  - Each limit at its boundary: 200-char title ok, 201 rejected; portions 0 and 101 rejected; amount 0 rejected, 0.001 ok, 1000000.0001 rejected; 101 steps rejected; unit `"oz"` → `invalid_unit`.
  - `missingForPublish` returns exactly the missing set.
- [ ] **Step 2: Failing ITs** `RecipeApiIT`:
  - `createAssignsIdAndEmptyDraft` (server id, Location header, defaults).
  - `otherUsersRecipeIs404` (GET, PUT, DELETE, publish).
  - `saveReplacesChildrenInOrder`.
  - `staleVersionIs409` (two PUTs with the same version → second 409, stored content = first).
  - `publishRequiresTitleIngredientStep` (`fields` exact).
  - `publishedRecipeCannotBecomeIncomplete` (PUT with zero steps → 400 and the stored recipe unchanged).
  - `mineIsNewestFirstAndOwnOnly`.
  - `accountDeletionDeletesRecipes` (FK cascade).
  - `anonymousIs401`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (`RecipeService` `@Transactional`; version check + increment in the service, using `@Version` or manually; it must produce 409 not 500 on a concurrent update). **Step 5:** `./mvnw verify` → green.
- [ ] **Step 6:** Commit `feat(recipe): recipe schema, validation and document API`.

### Task 6: Frontend recipe model, API client and "My recipes"

**Files:**
- Create in `frontend/src/app/recipes/`: `recipe.model.ts`, `recipe.api.ts`, `amount.ts` (+ spec), `my-recipes.page.ts` (+ spec)
- Modify: `app.routes.ts` (`/recipes` → MyRecipesPage, `/recipes/new` → creates and redirects, `/recipes/:id/edit` → editor, Task 7). `shell/shell.component.ts` becomes responsive per Global Constraints, with a nav item "My recipes" and a primary "+ New recipe" action. `/` redirects to `/recipes` (the placeholder home goes away; Plan 4 brings the feed).
- My recipes: a card grid on desktop (3–4 columns, mockup `desktop-v1.html` §3), a single list on the phone.
- Modify: `frontend/public/i18n/en.json` (`recipes.*`, `units.*`), `core/api-error.ts` (new codes)

**Interfaces:**
- Produces `recipe.model.ts`: TS types mirroring Task 5 DTOs (`Recipe`, `RecipeInput`, `RecipeSummary`, `Group`, `Ingredient`, `Step`, `Photo`). `UNITS = ['g','kg','ml','l','tsp','tbsp','cup','piece','pinch','clove','slice','can','bunch'] as const`. `toInput(r: Recipe): RecipeInput`.
- Produces `RecipeApi` (root service): `create(): Promise<Recipe>`, `get(id)`, `save(id, input): Promise<Recipe>`, `publish(id, version)`, `remove(id)`, `mine(): Promise<RecipeSummary[]>`.
- Modify `core/media.ts`: `mediaUrl` accepts only refs starting with `/media/` (or bare ids) and returns null for anything else, including `//host/...` and absolute URLs (spec: that case + existing cases).
- Produces `amount.ts`: `parseAmount(text: string): number | null | 'invalid'` and `formatAmount(n: number | null): string`. These are pure functions.
- `/recipes/new` calls `create()` and navigates to `/recipes/{returned id}/edit` with `replaceUrl`. While the request is pending, it shows a spinner; on failure, an error with a retry button.
- The My recipes list shows title (or the `recipes.untitled` text), a Draft/Private/Public badge and the cover thumb when present. Tapping an item opens the editor. Empty state links to New recipe.

- [ ] **Step 1: Failing specs:**
  - `parseAmount`: `'0.5'→0.5`, `'0,5'→0.5`, `'1/2'→0.5`, `'1 1/2'→1.5`, `'½'→0.5`, `'¾'→0.75`, `''→null`, `'abc'→'invalid'`, `'0'→'invalid'`, `'1/0'→'invalid'`.
  - `formatAmount(0.5)` → `'0.5'` (fraction display is Plan 4).
  - MyRecipesPage renders badges from a mocked list and links to `/recipes/{id}/edit`. The new-recipe route calls `create()` and redirects to the returned id.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `ng test`, `ng build` → green.
- [ ] **Step 5:** Commit `feat(frontend): recipe model, API client and my recipes list`.

### Task 7: Editor page — details, chips, notes, autosave

**Files:**
- Create in `frontend/src/app/recipes/editor/`: `recipe-editor.page.ts`, `editor-store.ts` (signal store holding the working `RecipeInput`), `autosave.ts`, `detail-chips.component.ts`, `portions-sheet.component.ts`, `time-sheet.component.ts`, `source-sheet.component.ts` (+ specs)

**Interfaces:**
- Produces `EditorStore` (provided per editor page): `recipe: Signal<RecipeInput>`, `status: Signal<'idle'|'saving'|'saved'|'error'|'conflict'|'offline'>`, `update(fn: (r: RecipeInput) => RecipeInput): void`, `load(id): Promise<void>`, `flush(): Promise<void>`.
- Produces `Autosave` (used by EditorStore). It saves via `RecipeApi.save` per the Global Constraints timing (debounce 800 ms, max 5 s, one request in flight; newer changes made during a flight are sent next with the returned version).
  - On 409 → status `conflict`; the editor shows a banner (`editor.conflict`) with the user's unsaved title, step texts and notes in a read-only, copyable block, plus a "Load latest" button that reloads from the server.
  - On 400 `recipe_incomplete` → status `error` with the field message; local content is kept.
  - On a network error → status `offline`, and the save retries when `window` fires `online`. Full offline durability is Task 14.
- Accessibility for every editor field (applies to Tasks 7, 8, 10): visible `<label>`; error text outside the label, linked with `aria-describedby`; `aria-invalid` set when invalid. Specs assert both on the title field and on an invalid amount.
- **Desktop layout (≥ 768 px), per mockup `docs/superpowers/mockups/desktop-v1.html` (owner-approved):** two columns.
  - Left column: cover, title, chips, visibility, ingredients, notes. Right column: steps.
  - The header holds Done / Publish / overflow, plus a "Saved ✓" indicator. Steps get "+ Add step" and per-step photo buttons inline; there's no fixed bottom bar.
  - Keyboard: **Ctrl/Cmd+Enter** in a step adds the next step and focuses it.
- **Phone layout (< 768 px):** a single column in the order below (from mockups `docs/superpowers/mockups/editor-mobile-v2.html` and `editor-chips.html`), with the fixed bottom bar (📷 Photo / + Next step).
- Page content: cover placeholder (wired in Task 10), title input, chips, Private/Public switch, ingredients (Task 8), steps (Task 8), notes textarea, fixed bottom bar.
  - The header has "Done" (flush, then go to `/recipes`; a brand-new draft that is still completely empty is deleted on Done), "Publish" (drafts only; Task 8) and an overflow menu with "Delete" (confirm dialog; deletes the recipe and goes to `/recipes`).
- Chips: unfilled chips are dashed (`+ Prep time`) and open a CDK `Dialog`: a centered dialog on desktop, a bottom sheet on the phone.
  - Portions: −/+ stepper, 1–100.
  - Times: a tab per prep/cook, presets 5m, 10m, 15m, 30m, 45m, 1h, 1h30, 2h, plus custom h/min.
  - Source: a text field.
  - Changes apply immediately (no OK needed); "Done" closes the sheet.

- [ ] **Step 1: Failing specs:**
  - `Autosave` with fake timers: 3 edits within 500 ms → one save after 800 ms. Continuous edits every 300 ms for 6 s → saves at least every 5 s. An edit during an in-flight save → a second save with the new version. A 409 → status `conflict`, and no further saves until "Load latest".
  - Time sheet: preset `30m` sets `prepMinutes: 30`; custom `1 h 20 min` → 80.
  - Portions stepper doesn't go below 1 or above 100.
  - Done on an empty new draft calls `remove`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `ng test`, `ng build` → green.
- [ ] **Step 5:** Commit `feat(frontend): recipe editor details, chips and autosave`.

### Task 8: Ingredients and steps editors, publish (+ e2e)

**Files:**
- Create in `frontend/src/app/recipes/editor/`: `ingredients-editor.component.ts`, `steps-editor.component.ts` (+ specs)
- Modify: `recipe-editor.page.ts` (bottom bar wiring, Publish)
- Create: `e2e/tests/recipe-editor.spec.ts`; Modify: `e2e/tests/helpers.ts` (`createRecipe(page, data)` helper for later specs)

**Interfaces:**
- Ingredients: each row has amount (text, parsed with `parseAmount`; invalid → inline `editor.amountInvalid`), unit (native `<select>` of `UNITS` + "no unit"), name, optional note. Actions: "+ ingredient" per group, "+ group", and delete row/group.
- Steps: numbered; each step has a textarea (autosize). "+ Next step" (phone bottom bar; desktop: inline "+ Add step" button or Ctrl/Cmd+Enter) adds a step and focuses it, scrolled into view. Tapping a step reveals its actions (delete; photo actions come in Task 10).
- Published recipe: the delete action on the last ingredient and on the last step is disabled with a hint (`editor.needsOne`), and an empty title shows `errors.recipe_incomplete` under the field.
- Publish (drafts): flush, then `RecipeApi.publish`. On `recipe_incomplete` → highlight the missing sections, scroll to the first, and show the message. On success → status chip shows Published; the Publish button disappears.

- [ ] **Step 1: Failing specs:** delete is disabled on the last step and last ingredient of a published recipe. "+ Next step" and Ctrl+Enter append and focus. Publish with a missing step highlights the steps section.
- [ ] **Step 2: Failing e2e** `recipe-editor.spec.ts` (mobile and desktop, a fresh user per project):
  - Layout: on desktop, the steps column sits to the right of the ingredients (`boundingBox().x` of the steps heading > ingredients heading's x + 300) and no bottom bar is visible. On mobile, steps are below the ingredients and the bottom bar is visible.
  - Desktop project: add steps with Ctrl+Enter. Mobile project: add steps with "+ Next step".
  - New recipe: title; portions sheet to 4; prep preset 30m; source "Nonna"; two ingredient groups (`500 g minced beef`, `1/2 l milk`); 3 steps via "+ Next step"; notes.
  - Wait for "Saved ✓", reload → every value is restored (amount shows 0.5).
  - Publish without steps → error shown on the steps section. Add a step, publish → Published. My recipes shows it with the Private badge.
  - On the published recipe, the last-step delete is disabled.
  - Done on an untouched new draft → not listed in My recipes.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `ng test`, `ng build`, `scripts/e2e.sh` → green.
- [ ] **Step 6:** Commit `feat(frontend): ingredient groups, steps and publishing`. Open PR B.

---

## PR C — Photos (`feat/p2-recipe-photos`)

### Task 9: Recipe photo upload, access, cleanup

**Files:**
- Create: `recipe/RecipePhotoController.java`, `recipe/RecipeMediaAccessPolicy.java`, `recipe/RecipeDeletionHook.java` (implements `AccountDeletionHook`), `recipe/OrphanMediaCleanup.java`
- Modify: `recipe/RecipeService.java` (photo ids in `RecipeInput`; cover/step references), `RicettineApplication` (`@EnableScheduling` if absent)
- Test: `recipe/RecipePhotoIT.java`

**Interfaces:**
- **Note (PR A fix wave):** `MediaService.store(...)` no longer exists. Storing is now two steps: `ProcessedUpload process(byte[] input, Set<ImageVariant> variants)` (limiter + decode/resize/encode, no DB; it **must be called outside any transaction**, and throws `IllegalStateException` if one is active), then `String register(ProcessedUpload upload, UUID ownerId, MediaKind kind, UUID recipeIdOrNull)` inside the short transaction that also checks the recipe (blobs + row, cleanup on failure or rollback). So the photo endpoint must not wrap `process` in a `@Transactional` method. Also, account deletion now calls `MediaService.deleteAllOwnedBy(userId)` centrally (rows of every kind, blobs after commit). `RecipeDeletionHook` therefore need not delete media; keep it only for non-media recipe data, or drop it.
- `POST /api/recipes/{id}/photos` (multipart `file`) → 201 `PhotoDto`. It stores `MediaKind.RECIPE` media with `{THUMB, DISPLAY}`, owner = caller, recipe = id. The recipe must be the caller's (else 404). The photo is not referenced until a save puts its id in `coverMediaId` or a step's `photoMediaId`.
- `RecipeService.save`: every referenced media id must be RECIPE media of this recipe, else 400 `photo_not_in_recipe`. Media that was referenced before the save and is no longer referenced by any cover or step after it is deleted (`MediaService.delete`, blobs after commit).
- `DELETE /api/recipes/{id}`: deletes all the recipe's media rows and blobs (blobs after commit).
- `RecipeDeletionHook.beforeDelete(userId)`: collects the user's RECIPE media ids and deletes them via `MediaService.delete`. The rows go with the cascade and the blobs after commit.
- `RecipeMediaAccessPolicy` (kind RECIPE) grants `private, max-age=3600` if the caller is the media owner, or if `?s=` equals the recipe's `share_token` and the recipe is PUBLISHED. Otherwise it denies (404).
- `OrphanMediaCleanup`: `@Scheduled(fixedDelayString = "${ricettine.media.orphan-cleanup-interval:PT1H}")` deletes RECIPE media older than 24 h that are referenced by no cover and no step (an upload that was never saved). The age is configurable for tests (`ricettine.media.orphan-min-age`, default `PT24H`).
- `PhotoDto` URLs for the author have no `s` parameter (reader URLs come in Task 12).

- [ ] **Step 1: Failing ITs** `RecipePhotoIT`:
  - Upload → 201 with both URLs. The author GETs them (200, `private, max-age=3600`). Another logged-in user and an anonymous caller → 404.
  - Referencing another recipe's photo → 400 `photo_not_in_recipe`.
  - Replacing a step photo deletes the old blob. Removing the cover deletes its blob.
  - Deleting the recipe deletes all photo blobs.
  - Account deletion deletes recipe photo blobs.
  - Orphan cleanup with min-age 0 deletes an unreferenced upload and keeps referenced ones.
  - A disguised PDF → 415 `unsupported_image`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(recipe): recipe photos with owner-scoped access and cleanup`.

### Task 10: Cover and step photos in the editor (+ e2e)

**Files:**
- Create: `frontend/src/app/recipes/editor/photo-picker.component.ts` (+ spec)
- Modify: `recipe-editor.page.ts`, `steps-editor.component.ts`, `recipe.api.ts` (`uploadPhoto(id, file): Promise<Photo>`)
- Create: `e2e/tests/recipe-photos.spec.ts`

**Interfaces:**
- `PhotoPicker`: a hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`, triggered by an accessible button.
  - Inputs: `capture: boolean` (step photos set `capture="environment"` so the camera opens straight away; the cover doesn't).
  - Output: `picked(file)`. Files > 15 MB are rejected client-side with `errors.file_too_large`.
- **Desktop:** dropping an image file onto a step (or the cover) uploads it there, with a visible drop-zone highlight on dragover. Each step also has inline "Add photo".
- Phone bottom bar "📷 Photo" attaches to the step currently focused or last tapped (or the last step if none). Each step's action row also has "Add photo" / "Replace" / "Remove". The cover area has the same actions.
- While uploading, the step shows the local image (object URL) with a "Uploading…" label; on success it swaps to the server `thumbUrl` and saves the reference through `EditorStore.update`. Failures show `errorKey`.

- [ ] **Step 1: Failing specs:** the picker rejects 16 MB client-side. A step upload shows "Uploading…", then the thumb, and puts `photoMediaId` into the store. Remove clears the reference.
- [ ] **Step 2: Failing e2e** `recipe-photos.spec.ts` (mobile and desktop):
  - Create a recipe (`createRecipe` helper). Add a cover from `fixtures/portrait-orientation6.jpg`. Add a photo to step 2: on mobile via "📷 Photo" after focusing step 2; on desktop by dropping the file onto step 2 (dispatch `drop` with a `DataTransfer` built in `page.evaluateHandle`).
  - Wait "Saved ✓", reload → both images render, and the cover renders portrait (`naturalHeight > naturalWidth`).
  - Remove the step photo, reload → gone.
  - A cover URL fetched from a new anonymous context → 404.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): cover and step photos`. Open PR C.

---

## PR D — Step reorder (`feat/p2-step-reorder`)

### Task 11: Drag steps by their handle (+ e2e)

**Files:**
- Modify: `frontend/src/app/recipes/editor/steps-editor.component.ts` (+ spec)
- Create: `e2e/tests/step-reorder.spec.ts`

**Interfaces:**
- Uses `@angular/cdk/drag-drop` `cdkDropList` + `cdkDrag` with `cdkDragHandle` on a ⠿ handle button. The handle has `aria-label` = `editor.reorderStep` with the step number, is 44 px, and has `touch-action: none`. Dragging starts only from the handle. Drop → `moveItemInArray` on the store's steps → autosave.
- Keyboard alternative on the focused handle: ArrowUp / ArrowDown moves the step by one, and an `aria-live` region announces the new position.

- [ ] **Step 1: Failing specs:** a `drop` event from index 2 to 1 reorders store steps. ArrowUp on step 3's handle moves it to position 2. Dragging the text area does not start a drag (`cdkDragHandle` present).
- [ ] **Step 2: Failing e2e** `step-reorder.spec.ts` (mobile and desktop):
  - A recipe with steps A, B, C. Drag C's handle above B (`locator.dragTo`, or mouse down/move/up in steps) → order A, C, B. Wait "Saved ✓", reload → A, C, B.
  - Dragging from C's text onto A → order unchanged.
  - Keyboard: focus B's handle, press ArrowUp → B, A, C after reload.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): reorder steps by drag handle`. Open PR D.

---

## PR E — Share link and recipe page (`feat/p2-share-page`)

### Task 12: Public recipe API and link reset

**Files:**
- Create: `recipe/PublicRecipeController.java`, `recipe/PublicRecipeDtos.java`
- Modify: `recipe/RecipeService.java` (`shareUrl`, reset), `recipe/RecipeController.java`, `config/SecurityConfig.java` (`GET /api/r/*` permitAll)
- Test: `recipe/PublicRecipeIT.java`

**Interfaces:**
- `RecipeDto.shareUrl` = `{PublicUrls.base}/r/{shareToken}` when PUBLISHED, else null.
- `POST /api/recipes/{id}/share-link/reset` → 200 `RecipeDto` with a new token (author only; works on drafts too, although their link is inactive).
- `GET /api/r/{token}` (public) → 200 `PublicRecipe` | 404 `recipe_not_found` (unknown token, or the recipe is a draft).
  - `record PublicRecipe(String title, AuthorDto author, int portions, Integer prepMinutes, Integer cookMinutes, String source, String notes, PhotoDto cover, List<GroupDto> groups, List<PublicStepDto> steps, Instant publishedAt, boolean viewerIsAuthor)`.
  - `record AuthorDto(String username, String displayName, String avatarUrl)`.
  - `record PublicStepDto(String text, PhotoDto photo)`.
  - Photo URLs carry `?s={token}`.
- Response headers: `Cache-Control: no-store` for `/api/r/*` (link reset must take effect immediately).

- [ ] **Step 1: Failing ITs** `PublicRecipeIT`:
  - An anonymous caller reads a published PRIVATE recipe and a published PUBLIC recipe by token. A draft's token → 404.
  - Photos load anonymously with `?s=` and → 404 without it.
  - `resetInvalidatesOldLinkAndPhotos`: after reset, the old token → 404 and old photo URLs with the old `s` → 404; the new token and photos → 200.
  - `viewerIsAuthor` is true only for the author's session.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(recipe): public recipe by link and link reset`.

### Task 13: Share panel and read-only recipe page (+ e2e)

**Files:**
- Create: `frontend/src/app/recipes/view/recipe-view.page.ts` (+ spec), `frontend/src/app/recipes/editor/share-panel.component.ts` (+ spec)
- Modify: `app.routes.ts` (`r/:token` → RecipeViewPage, **outside** the authGuard shell but under `setupGuard`), `recipe.api.ts` (`byToken(token)`, `resetLink(id)`)
- Create: `e2e/tests/share-link.spec.ts`

**Interfaces:**
- Share panel (editor, published recipes only): `CopyLinkComponent` with `shareUrl`, plus "Reset link" behind a confirm dialog (`editor.resetLinkConfirm`), which updates the shown link. Drafts show `editor.publishToShare`.
- Recipe page (`/r/:token`), readable when logged out. Desktop: ingredients in a sticky left column beside the steps. Phone: stacked.
  - Cover, title, author (avatar + display name), chips (portions, prep, cook, source as a link when it is a URL).
  - Ingredients by group with amount (`formatAmount`) + `units.{code}` + name + note.
  - Numbered steps with photos (`DISPLAY` variant, `loading="lazy"`), notes.
  - Not-found state for 404 (`recipes.notFound`).
  - When `viewerIsAuthor`, an "Edit" link to the editor.
  - Scaling and keep-screen-on are Plan 4.

- [ ] **Step 1: Failing specs:** the recipe page renders groups, units via i18n, steps and photos from a mocked `PublicRecipe`. A 404 shows the not-found state. A source starting with `http` renders as an `<a rel="noopener noreferrer">`. The share panel's reset confirms, then shows the new URL.
- [ ] **Step 2: Failing e2e** `share-link.spec.ts` (mobile and desktop):
  - The author publishes a recipe with a step photo and copies the link (read it from the copy-link component).
  - A new anonymous context opens it → sees the title, ingredients, steps and the photo loaded (`naturalWidth > 0`); no Edit link. The author's context → Edit link visible.
  - The author resets the link → the old link in the anonymous context shows not-found, the old photo URL → 404, and the new link works.
  - A draft's editor shows "publish to share".
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): share link and read-only recipe page`. Open PR E.

---

## PR F — Unsaved-edit safety (`feat/p2-unsaved-safety`)

Deliberately small. A future native app would own real offline support.

### Task 14: Keep unsaved text locally; retry uploads

**Files:**
- Create: `frontend/src/app/recipes/editor/unsaved-backup.ts` (+ spec)
- Modify: `editor/editor-store.ts`, `editor/autosave.ts`, `editor/photo-picker` wiring in `recipe-editor.page.ts` / `steps-editor.component.ts`

**Interfaces:**
- `UnsavedBackup` (root service) uses `localStorage` key `ricettine.unsaved.{recipeId}` → `{ input: RecipeInput, baseVersion: number, savedAt: number }`. Every read and write is wrapped in try/catch; if storage is unavailable, the editor behaves exactly as without it.
  - `Autosave` writes the backup on every change before sending, and deletes it after a successful save, unless a newer change arrived meanwhile.
- On editor load, if a backup exists:
  - `baseVersion` equals the server `version` → apply the backup and save it.
  - The server is newer → conflict banner (Task 7) with the backup's text in the copyable block.
- Network errors: status `offline`; retry after 2 s, 5 s, 15 s, then every 30 s, and immediately on `online` and on `visibilitychange` → visible.
- Photo uploads stay online-only. A failed upload keeps the local preview on the step with "Upload failed — Retry" (retry re-sends the same file). Publish is disabled while any upload is in progress or failed (`editor.waitingForUploads`). Leaving the page with a failed upload asks for confirmation (`beforeunload`).

- [ ] **Step 1: Failing specs:**
  - An edit while the network fails → backup written, status `offline`; an `online` event → saved, backup deleted.
  - A backup with the same base version at load → applied and saved.
  - A backup with an older base version → conflict status, backup text exposed.
  - An edit during an in-flight save isn't erased by the older response.
  - Throwing `localStorage` → the editor still saves.
  - A failed upload shows Retry; retry succeeds → reference set; Publish disabled meanwhile.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `ng test`, `ng build` → green.
- [ ] **Step 5:** Commit `feat(frontend): keep unsaved recipe text and retry failed uploads`.

### Task 15: Unsaved-edit and conflict e2e

**Files:**
- Create: `e2e/tests/unsaved-safety.spec.ts`

- [ ] **Step 1: Write the e2e specs** (mobile and desktop):
  - `text typed offline saves when back online`: open a recipe, `context.setOffline(true)`, type step text → status shows offline. `setOffline(false)` → "Saved ✓". Reload → text present.
  - `unsaved text survives closing the tab`: offline, type text, `page.close()`. Open a new page in the same context (online) on the editor URL → text present, then "Saved ✓"; a reload shows it from the server.
  - `failed upload can be retried`: route `POST **/photos` to abort once (`page.route`), add a step photo → "Upload failed — Retry"; Publish disabled. Click Retry → photo saved; Publish enabled.
  - `conflict keeps my text`: the same user in two contexts opens one recipe. Context 1 edits step 1 → saved. Context 2 (stale) edits step 1 → conflict banner with context 2's text in the copyable block. "Load latest" → context 1's text.
- [ ] **Step 2:** Run `scripts/e2e.sh` → any failure is a bug in Task 14: fix it there (with a spec), not in the test.
- [ ] **Step 3:** All green (`ng test`, `ng build`, `./mvnw verify`, `scripts/e2e.sh`).
- [ ] **Step 4:** Commit `test(e2e): unsaved text, upload retry and conflict`. Open PR F.

---

## Out of scope (later plans)
- Scaling, fraction display, keep-screen-on, feed and profile listings → Plan 4.
- Cookbooks, and photo access through a cookbook link → Plan 3 (adds a `MediaAccessPolicy` rule).
- Tags, search, calories, unit conversion → after the trial. Calories will add a nullable `ingredient.food_id` column and unit→gram data in a later migration; nothing here blocks that.
- Real offline support (offline photo queue, creating recipes offline, PWA/service worker) → not planned for the web app; a future native Android app would own it. The API stays client-agnostic for that app; note that it uses cookie sessions + CSRF today, so a native client will need token auth later.
- Blobs left without a `media` row after a JVM crash between blob write and commit → documented in follow-ups. Only rows without references are cleaned.
