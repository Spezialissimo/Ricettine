# Plan 3 — Cookbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users keep recipes in cookbooks: personal lists of their own and other people's published recipes, shareable read-only by an unguessable, resettable link, and co-authored by other users invited through a single-use invite link.

**Architecture:** New `com.ricettine.cookbook` package. A cookbook *references* recipes (`cookbook_entry`) and never owns them. Members are the owner (`cookbook.owner_id`) plus co-authors (`cookbook_author`). The public read path is `/api/c/{token}`, and a recipe opened through a cookbook is served by `/api/c/{token}/recipes/{recipeId}` with photo URLs carrying `?c={cookbookToken}`. Recipe share tokens are therefore never exposed through a cookbook, and a cookbook link reset kills every URL that came from it. Recipe read permission stays in one place in the `recipe` package (`RecipeReadGrant`), and the cookbook package plugs a rule into it (spec §6.5).

**Tech Stack:** Existing (Spring Boot 4.1.2, Java 25, Postgres 17, Flyway, Angular 22.2 zoneless, Transloco, `@angular/cdk` dialog, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md` §6 (cookbooks), §3 (account deletion names owned cookbooks), §4.5 (links). Also carries the "Plan 3 (cookbooks)" and "Still open from Plan 1 follow-ups" sections of `docs/superpowers/plans/2026-11-04-plan-2-followups.md` as entry criteria (PR A).

## Delivery: 5 small PRs
Each PR is its own branch, stacked on the previous one until that one is merged (the repo auto-deletes merged branches, so bases retarget). A PR is done only when it is green in CI (backend, frontend, e2e on **mobile and desktop**, smoke) and contains backend ITs plus Playwright specs for its feature. No manual checks in PR test plans. Visual polish is out of scope.

| PR | Branch | Tasks | User-visible result | Whole-PR review |
|---|---|---|---|---|
| A | `feat/p3-entry-criteria` | 1–2 | Accessible auth forms; cleaner errors and backups | no |
| B | `feat/p3-cookbooks` | 3–4 | Create cookbooks, add own and others' recipes, remove, rename, delete | no |
| C | `feat/p3-cookbook-link` | 5–7 | Share a cookbook by link (read-only, logged out too), reset it, cover photo | **opus** (access rules) |
| D | `feat/p3-coauthors` | 8–9 | Invite co-authors by link, accept, leave, remove (optionally with their recipes) | **opus** (access + data loss) |
| E | `feat/p3-account-deletion` | 10 | Account deletion names the cookbooks it will delete | **opus** (data loss) |

## Global Constraints
- All Plan 1 and Plan 2 Global Constraints still hold: UUID PKs assigned by the server; ProblemDetail + `code`; every UI string via Transloco `frontend/public/i18n/en.json`; 44 px touch targets; Flyway-only schema (`V6`+, never edit an applied one); breakpoint 768 px with the desktop top nav / phone bottom nav shell; a denied read returns 404 (never reveal existence).
- New error codes go into `KNOWN_ERROR_CODES` in `frontend/src/app/core/api-error.ts` and `en.json` (a spec enforces this): `conflict`, `cookbook_not_found`, `cookbook_owner_only`, `cookbook_full`, `cookbook_authors_full`, `cookbook_invites_full`, `cookbook_invite_invalid`, `already_member`, `owner_cannot_leave`.
- Cookbook limits (400 `validation_failed` with `fields`; the client mirrors them). Lengths count **Unicode code points** (`String.codePointCount`), not UTF-16 units, on both server and client:
  - name: trimmed, 1–100; description: trimmed, ≤ 1000, empty → null; visibility `PRIVATE` | `PUBLIC`, default `PRIVATE`.
  - ≤ 500 entries per cookbook (409 `cookbook_full`); ≤ 20 co-authors (409 `cookbook_authors_full`); ≤ 20 outstanding invites per cookbook (409 `cookbook_invites_full`). No cap on the number of cookbooks (spec: unlimited).
- Roles: `OWNER` (exactly one, the creator) and `AUTHOR`. Members = owner + authors.
  - Members: read the cookbook and its share link, add and remove any entry, upload nothing.
  - Owner only: rename / description / visibility, cover, reset link, invites, remove authors, delete.
  - A non-member gets 404 `cookbook_not_found` from `/api/cookbooks/{id}/**`; a member calling an owner-only action gets 403 `cookbook_owner_only`.
- Adding a recipe takes a `RecipeRef {recipeId?, shareToken?}` with exactly one set (else 400 `validation_failed`). It resolves to a PUBLISHED recipe that the caller can open: by `shareToken` (any published recipe with that token), or by `recipeId` when the caller is its author or it is `PUBLIC`. Anything else, drafts included, is 404 `recipe_not_found`. Adding a recipe that is already there is a no-op answering 200 (new entry: 201). Each entry records `added_by` and `added_at`; entries list newest added first.
- Cookbook share token: `Tokens.newToken()`, plaintext, unique, created with the cookbook, always active (cookbooks have no draft state). `shareUrl = {PublicUrls.base}/c/{token}`. Reset by the owner only. Resetting a *recipe's* link does not affect cookbooks that contain it.
- Photo URLs reached through a cookbook: `/media/{id}/{variant}.jpg?c={cookbookToken}`. Granted only while the token is current, the media's recipe is PUBLISHED and is an entry of that cookbook (recipe photos), or the media is that cookbook's cover. Cache header for `?c=` grants: `private, no-cache`. Session grants (owner of the media, or member for covers): `private, max-age=3600`.
- `/api/c/**` responses: `Cache-Control: no-store`.
- Co-author invites: `TokenPurpose.COOKBOOK_INVITE` one-time tokens (hashed, as instance invites), single-use, expire after **7 days**, revocable by the owner. The invite URL is `{base}/cookbook-invite/{token}`, returned once at creation. Accepting requires a session; registering from a cookbook invite is out of scope (spec §6.3).
- Cookbooks are **not versioned**: metadata edits are PATCH, last write wins; entry and member operations are individually idempotent. All `DELETE`s work without a version.
- Keep "Before a native Android client" (plan-2 follow-ups) possible: JSON-only APIs, no web-only parameters, server ids, idempotent add.

## Review Focus
1. **Cookbook link reset:** the old cookbook link, the recipe pages opened through it and every `?c=` photo URL from it stop working at once; the new link works; the recipes' own `/r/` links are unaffected. Tested in Task 5 (`resetInvalidatesOldCookbookLinkAndPhotos`) and Task 6 (e2e).
2. **A cookbook token is not a skeleton key:** `?c=` never opens a photo of a recipe that is not (or no longer) in that cookbook, and `/api/c/{token}/recipes/{id}` 404s for such a recipe. Tested in Task 5 (`cookbookTokenOpensOnlyItsOwnRecipes`, `removedEntryClosesAccess`).
3. **Guessing a recipe id:** adding someone else's private recipe, or any draft, by `recipeId` is 404, even for a member of a cookbook that already contains it. Tested in Task 3 (`addByIdRequiresAuthorOrPublic`).
4. **Leave/remove with "Also remove the recipes they added":** only that person's entries leave the cookbook; no recipe is ever deleted; unchecked keeps everything. Tested in Task 8 (`removeAuthorOptionallyTakesTheirEntries`).
5. **Invite misuse:** an invite accepted twice (two users at once), after expiry, after revocation, or by an existing member grants nothing and, for the existing-member case, stays usable. Tested in Task 8 (`inviteIsSingleUseUnderConcurrency`, `alreadyMemberKeepsInvite`).

---

## PR A — Entry criteria (`feat/p3-entry-criteria`)

### Task 1: Backend: scoped conflict code, per-test SQL-error silencing

**Files:**
- Modify: `backend/src/main/java/com/ricettine/common/ProblemAdvice.java`
- Create: `backend/src/test/java/com/ricettine/QuietSqlErrors.java` (JUnit 5 extension + annotation)
- Modify: `MeIT`, `InviteIT`, `AccountServiceIT` (drop the class-wide `@TestPropertySource` logging property; annotate only the tests that expect a unique violation)
- Test: `backend/src/test/java/com/ricettine/common/OptimisticLockMappingIT.java`

**Interfaces:**
- `ProblemAdvice.handleOptimisticLock`: code `recipe_conflict` only when the exception is an `ObjectOptimisticLockingFailureException` whose `getPersistentClassName()` is `com.ricettine.recipe.Recipe`; otherwise code `conflict`. Status stays 409.
- `@QuietSqlErrors` (method or class level): sets the Logback logger `org.hibernate.orm.jdbc.error` to `OFF` before the test and restores the previous level after it.
- ICC profiles stay dropped (documented in `ImageProcessor` javadoc); EXIF orientations 5 and 7 are already tested (`ImageProcessorTest`), so that follow-up is closed.

- [ ] **Step 1: Failing IT** `OptimisticLockMappingIT`: a test-only controller (in the test source set) throws `ObjectOptimisticLockingFailureException(Recipe.class, id)` → 409 `recipe_conflict`; with `Object.class` → 409 `conflict`; a plain `OptimisticLockException` → 409 `conflict`. Also add `conflict` to the frontend `KNOWN_ERROR_CODES` and `en.json`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement both pieces. **Step 4:** `./mvnw verify` quietly, exit 0, and the log of the three ITs shows no unique-violation ERROR lines while an unrelated SQL error elsewhere would still log.
- [ ] **Step 5:** Commit `refactor(backend): scope recipe_conflict code and SQL error silencing`.

### Task 2: Frontend: auth-form accessibility, backup sweep, fresh components per route param (+ e2e)

**Files:**
- Modify: `frontend/src/app/auth/login.page.ts`, `register.page.ts`, `setup.page.ts`, `reset-password.page.ts`, `account-form.component.ts` (+ specs)
- Modify: `frontend/src/app/recipes/editor/unsaved-backup.ts` (+ spec)
- Create: `frontend/src/app/core/param-reuse-strategy.ts` (+ spec); Modify: `app.config.ts`
- Create: `e2e/tests/auth-a11y.spec.ts`

**Interfaces:**
- Auth forms: every invalid field has `aria-invalid="true"` and an error element outside its `<label>`, linked with `aria-describedby`. Registration and setup email inputs have `autocomplete="email"`. Submitting the login form with empty fields shows `auth.fillBoth` in a `role="alert"`. A `validation_failed` response with a `fields` map shows the error under each named field (`errors.field.{code}`, falling back to `errors.validation_failed`).
- `UnsavedBackup.sweep()`: removes a key whenever its value fails `JSON.parse`, is not a plain object, or keeps no entry; drops entries whose `savedAt` is more than 1 minute in the future.
- `ParamReuseStrategy extends BaseRouteReuseStrategy`: `shouldReuseRoute(future, curr)` returns false when the route configs match but `future.params` differs from `curr.params`, so a param change creates a fresh component (fixes the plan-2 follow-up for `/r/:token` and the editor; also covers the cookbook routes added later). Registered with `{ provide: RouteReuseStrategy, useClass: ParamReuseStrategy }`.

- [ ] **Step 1: Failing specs:**
  - Login: empty submit → alert `auth.fillBoth`, both inputs `aria-invalid="true"` with `aria-describedby` pointing at an existing element.
  - Register: a 400 `validation_failed` with `fields: {displayName: 'validation_failed'}` → message under the display-name field only; email input has `autocomplete="email"`.
  - Sweep: `'{broken'`, `'{}'`, `'[]'`, `'"x"'` are removed; a future `savedAt` (now + 1 h) is removed; a valid entry is kept.
  - `ParamReuseStrategy`: navigating `/r/a` → `/r/b` in a `RouterTestingHarness` creates a new component instance (constructor counter = 2); `/recipes` → `/recipes` reuses.
- [ ] **Step 2: Failing e2e** `auth-a11y.spec.ts` (mobile and desktop): log out, submit an empty login form → the alert is visible and the email input has `aria-invalid="true"`; type a wrong password → `errors.bad_credentials` text visible; the registration page (fresh invite via `createInvitePath`) email input has `autocomplete="email"`.
- [ ] **Step 3:** Run (`npx ng test --watch=false`, `scripts/e2e.sh`) → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): accessible auth forms, stricter backup sweep, fresh pages per route param`. Open PR A.

---

## PR B — Cookbooks (`feat/p3-cookbooks`)

### Task 3: Cookbook schema, service and member API

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__cookbooks.sql`
- Create in `backend/src/main/java/com/ricettine/cookbook/`: `Cookbook.java`, `CookbookAuthor.java`, `CookbookEntry.java` (entities), `CookbookRepository.java`, `CookbookEntryRepository.java`, `CookbookAuthorRepository.java`, `CookbookRole.java`, `CookbookDtos.java`, `CookbookValidator.java`, `CookbookService.java`, `CookbookController.java`
- Modify: `recipe/RecipeService.java` (add `resolveAddable`)
- Test: `cookbook/CookbookValidatorTest.java`, `cookbook/CookbookApiIT.java`

**Interfaces:**
- Schema `V6`:
  - `cookbook(id uuid pk, owner_id uuid not null references app_user(id) on delete cascade, name varchar(100) not null, description varchar(1000), visibility varchar(16) not null, share_token varchar(43) not null unique, created_at timestamptz not null, updated_at timestamptz not null)`, index `(owner_id)`.
  - `cookbook_author(cookbook_id uuid references cookbook(id) on delete cascade, user_id uuid references app_user(id) on delete cascade, joined_at timestamptz not null, primary key (cookbook_id, user_id))`, index `(user_id)`.
  - `cookbook_entry(cookbook_id uuid references cookbook(id) on delete cascade, recipe_id uuid references recipe(id) on delete cascade, added_by uuid null references app_user(id) on delete set null, added_at timestamptz not null, primary key (cookbook_id, recipe_id))`, indexes `(recipe_id)`, `(added_by)`, `(cookbook_id, added_at desc)`.
- Produces DTOs (`CookbookDtos`):
  - `record PersonDto(String username, String displayName, String avatarUrl)` (null when the person deleted their account).
  - `record CookbookSummary(UUID id, String name, String visibility, String role, int recipeCount, String coverThumbUrl, Instant updatedAt)`; `coverThumbUrl` stays null until Task 7.
  - `record CookbookEntryDto(UUID recipeId, String title, PersonDto author, PersonDto addedBy, Instant addedAt, boolean mine, String coverThumbUrl)`; `mine` = the caller authored the recipe; `coverThumbUrl` stays null until Task 5.
  - `record CookbookDto(UUID id, String name, String description, String visibility, String role, PersonDto owner, List<PersonDto> authors, String shareUrl, PhotoDto cover, List<CookbookEntryDto> recipes, Instant updatedAt)`; `shareUrl` null until Task 5, `cover` null until Task 7.
  - `record CookbookInput(String name, String description, String visibility)`; `record RecipeRef(UUID recipeId, String shareToken)`.
- Endpoints (authenticated):
  - `POST /api/cookbooks` (`CookbookInput`, name required) → 201 `CookbookDto` + `Location: /api/cookbooks/{id}`.
  - `GET /api/cookbooks/mine` → `List<CookbookSummary>` of cookbooks the caller owns or co-authors, `updatedAt` desc then id.
  - `GET /api/cookbooks/{id}` → `CookbookDto` (members).
  - `PATCH /api/cookbooks/{id}` (`CookbookInput`, null field = unchanged) → `CookbookDto` (owner).
  - `DELETE /api/cookbooks/{id}` → 204 (owner).
  - `POST /api/cookbooks/{id}/recipes` (`RecipeRef`) → 201 `CookbookEntryDto` | 200 existing entry (members). Locks the cookbook row (`PESSIMISTIC_WRITE`) before the 500-entry check.
  - `DELETE /api/cookbooks/{id}/recipes/{recipeId}` → 204, also when absent (members).
  - Every change bumps `cookbook.updated_at`.
- `RecipeService.resolveAddable(RecipeRef ref, UUID viewerId): UUID` per Global Constraints (`recipe` package owns the rule; `cookbook` calls it).
- `CookbookService.requireMember(UUID cookbookId, UUID userId): CookbookRole` and `requireOwner(...)`, the single place for cookbook permission checks (Tasks 5, 7, 8 reuse them).
- `CookbookValidator.validate(CookbookInput, boolean creating): Map<String,String>` (field → code).

- [ ] **Step 1: Failing unit tests** `CookbookValidatorTest`: name of 100 code points ok (use an emoji string, 100 × `"🍝"`, which is 200 UTF-16 units), 101 rejected; blank name rejected on create, null allowed on patch; description 1000 ok, 1001 rejected; visibility `"SECRET"` rejected.
- [ ] **Step 2: Failing ITs** `CookbookApiIT`:
  - `createAssignsIdOwnerAndPrivate` (Location header, role OWNER, PRIVATE default).
  - `nonMemberGets404` (GET, PATCH, DELETE, add, remove).
  - `mineListsOwnedNewestFirst`.
  - `addOwnPublishedByIdAndOthersByToken`: own published recipe by id → 201; another user's PRIVATE published recipe by its share token → 201; the same again → 200 and one entry; entries newest first with `addedBy` = caller.
  - `addByIdRequiresAuthorOrPublic`: another user's PRIVATE recipe by id → 404; another user's PUBLIC recipe by id → 201; a draft by id or token (own or other) → 404; both or neither ref fields → 400.
  - `removeEntryIsIdempotent`; `cookbookFullAt500` (insert 500 entries via `JdbcTemplate`, the 501st → 409 `cookbook_full`).
  - `deletingRecipeRemovesItsEntries`; `deletingCookbookKeepsRecipes`.
  - `anonymousIs401`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `./mvnw verify` → green.
- [ ] **Step 6:** Commit `feat(cookbook): cookbook schema and member API`.

### Task 4: My cookbooks, cookbook page, add to cookbook (+ e2e)

**Files:**
- Create in `frontend/src/app/cookbooks/`: `cookbook.model.ts`, `cookbook.api.ts`, `my-cookbooks.page.ts`, `cookbook.page.ts`, `cookbook-form.dialog.ts`, `confirm-delete-cookbook.dialog.ts`, `add-to-cookbook.dialog.ts` (+ specs)
- Modify: `app.routes.ts` (`cookbooks` → MyCookbooksPage, `cookbooks/:id` → CookbookPage, both in the authGuard shell), `shell/shell.component.ts` (nav item "Cookbooks" in both layouts), `recipes/editor/recipe-editor.page.ts` (Add to cookbook), `recipes/view/recipe-view.page.ts` (Add to cookbook), `en.json` (`cookbooks.*`), `core/api-error.ts`
- Create: `e2e/tests/cookbooks.spec.ts`; Modify: `e2e/tests/helpers.ts` (`createCookbook(page, name)`, `publishRecipe(page, data)` returning `{ editorUrl, shareUrl }`)

**Interfaces:**
- `cookbook.model.ts`: TS types mirroring Task 3 DTOs. `CookbookApi` (root): `create(input)`, `mine()`, `get(id)`, `patch(id, input)`, `remove(id)`, `addRecipe(id, ref): Promise<{ entry: CookbookEntry; created: boolean }>` (201 vs 200), `removeRecipe(id, recipeId)`.
- My cookbooks: a card grid on desktop, a list on the phone (as My recipes); each item shows name, recipe count, a role badge (`cookbooks.roleOwner` / `cookbooks.roleAuthor`) and a Private/Public badge. "+ New cookbook" opens `CookbookFormDialog` (name, description, visibility) → create → navigate to `/cookbooks/{id}`. Empty state invites creating one.
- Cookbook page: name, description, badges; recipe list (title, author display name, "added by", own recipes link to their editor, others' titles are plain text until Task 6); a "Remove" button per entry (44 px, accessible name includes the title). Owner only: "Edit" (same dialog, PATCH) and "Delete cookbook" (confirm dialog naming the cookbook; on success → `/cookbooks`).
- `AddToCookbookDialog` (input `ref: RecipeRef`): lists `mine()` with an "Add" button per cookbook; after the call the row shows `cookbooks.added` (201) or `cookbooks.alreadyIn` (200); errors show `errorKey`. It also has "+ New cookbook" (create, then add).
  - Editor entry point: a button "Add to cookbook" in the share panel area, only for published recipes (`ref = {recipeId}`); drafts show `cookbooks.publishFirst` instead.
  - Recipe page `/r/:token`: "Add to cookbook" when the visitor is logged in (`AuthStore.me()` not null), `ref = {shareToken: token}`; hidden when logged out.

- [ ] **Step 1: Failing specs:** MyCookbooksPage renders role badges and links to `/cookbooks/{id}`; the create dialog validates a blank name and a 101-code-point name client-side; CookbookPage hides Edit/Delete for role AUTHOR; `AddToCookbookDialog` shows "Added" on 201 and "Already in this cookbook" on 200; the editor shows the publish-first hint on a draft.
- [ ] **Step 2: Failing e2e** `cookbooks.spec.ts` (mobile and desktop, fresh users per project):
  - Layout: on desktop My cookbooks items sit side by side (second card's `boundingBox().x` > first's x); on mobile they stack.
  - User A creates "Desserts", publishes "Tiramisù" (`publishRecipe`), adds it from the editor → the cookbook page lists it with "added by" A.
  - User B publishes a PRIVATE "Panna cotta"; A opens B's `/r/` link → Add to cookbook → "Desserts" → listed, author B. Adding again → "Already in this cookbook".
  - A draft's editor shows the publish-first hint and no Add button.
  - A renames the cookbook → the new name shows in My cookbooks. A removes "Panna cotta" → gone; B's recipe still opens by its link. A deletes the cookbook → gone from My cookbooks; "Tiramisù" still in My recipes.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `ng test`, `ng build`, `scripts/e2e.sh` → green.
- [ ] **Step 6:** Commit `feat(frontend): cookbooks list, cookbook page and add to cookbook`. Open PR B.

---

## PR C — Cookbook link and cover (`feat/p3-cookbook-link`)

### Task 5: Cookbook link, public read, recipes through a cookbook, photo rule

**Files:**
- Create: `recipe/RecipeReadGrant.java` (interface), `cookbook/CookbookRecipeReadGrant.java`, `cookbook/PublicCookbookController.java`
- Modify: `recipe/RecipeMediaAccessPolicy.java`, `recipe/RecipeService.java` (`publicView(Recipe, String photoQuery, UUID viewerId)` extracted from `publicByToken`), `cookbook/CookbookService.java`, `cookbook/CookbookController.java`, `cookbook/CookbookDtos.java`, `config/SecurityConfig.java` (`GET /api/c/**` permitAll)
- Test: `cookbook/PublicCookbookIT.java`

**Interfaces:**
- `interface RecipeReadGrant { boolean grants(UUID recipeId, HttpServletRequest req); }` in `recipe`. `RecipeMediaAccessPolicy` grants `private, no-cache` when any `RecipeReadGrant` bean returns true, after the existing owner and `?s=` rules. `CookbookRecipeReadGrant` returns true iff `req.getParameter("c")` is a current cookbook token (constant-time comparison after lookup) whose cookbook has an entry for `recipeId` and that recipe is PUBLISHED (one SQL query).
- `CookbookDto.shareUrl` = `{base}/c/{token}`; `CookbookEntryDto.coverThumbUrl` = the recipe's THUMB URL with `?c={token}` (members' page uses the same grant).
- `POST /api/cookbooks/{id}/share-link/reset` → `CookbookDto` with a new token (owner).
- `GET /api/c/{token}` → `PublicCookbook` | 404 `cookbook_not_found`:
  - `record PublicCookbook(String name, String description, PersonDto owner, List<PersonDto> authors, PhotoDto cover, List<PublicCookbookEntry> recipes, String viewerRole, UUID cookbookId)`; `viewerRole` is `OWNER` / `AUTHOR` / null; `cookbookId` only for members (else omitted, `@JsonInclude(NON_NULL)`).
  - `record PublicCookbookEntry(UUID recipeId, String title, PersonDto author, String coverThumbUrl)`.
- `GET /api/c/{token}/recipes/{recipeId}` → `PublicRecipe` (existing record) with every photo URL carrying `?c={token}` | 404 `recipe_not_found` when the recipe is not an entry of that cookbook (malformed id too).
- Both public endpoints answer `Cache-Control: no-store`.

- [ ] **Step 1: Failing ITs** `PublicCookbookIT`:
  - An anonymous caller reads a PRIVATE cookbook by token with a PRIVATE recipe of another user in it; opens that recipe through `/api/c/{token}/recipes/{id}`; its step photo loads with `?c=` (200, `private, no-cache`) and 404s without it. Unknown token → 404.
  - `cookbookTokenOpensOnlyItsOwnRecipes`: a recipe not in the cookbook → 404 from the recipe endpoint, and its photo with `?c=` → 404.
  - `removedEntryClosesAccess`: after removing the entry, the recipe endpoint and its photo URL with `?c=` → 404.
  - `resetInvalidatesOldCookbookLinkAndPhotos`: after reset, the old token → 404 for the cookbook, the recipe and the photo; the new token works; the recipe's own `/api/r/{shareToken}` still 200.
  - `recipeLinkResetKeepsCookbookAccess`: resetting the recipe's link leaves the cookbook path working.
  - `viewerRole` and `cookbookId` are present only for members; author reset attempt → 403 `cookbook_owner_only`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(cookbook): share link, public read and photo access through a cookbook`.

### Task 6: Public cookbook page, recipes through it, share panel (+ e2e)

**Files:**
- Create: `frontend/src/app/cookbooks/view/cookbook-view.page.ts` (+ spec), `cookbooks/cookbook-share-panel.component.ts` (+ spec)
- Modify: `app.routes.ts` (`c/:token` → CookbookViewPage and `c/:token/r/:recipeId` → `RecipeViewPage` with `data: { via: 'cookbook' }`, both outside the authGuard shell, under `setupGuard`), `recipes/view/recipe-view.page.ts` (load by cookbook when `via === 'cookbook'`; a "Back to {cookbook}" link), `cookbooks/cookbook.page.ts` (entries link to `/c/{token}/r/{recipeId}`; thumbs; share panel), `cookbook.api.ts` (`byToken`, `recipeByToken`, `resetLink`)
- Create: `e2e/tests/cookbook-link.spec.ts`

**Interfaces:**
- `CookbookSharePanel`: `CopyLinkComponent` with `shareUrl` for every member; "Reset link" behind a confirm dialog (`cookbooks.resetLinkConfirm`) for the owner only.
- Cookbook view (`/c/:token`), readable logged out: cover, name, description, owner and co-authors, recipe cards (thumb, title, author) linking to `/c/:token/r/:recipeId`. Desktop: card grid; phone: list. Not-found state (`cookbooks.notFound`). Members see an "Open in my cookbooks" link to `/cookbooks/{cookbookId}`.
- Recipe page via cookbook: same rendering as `/r/:token`; not-found state on 404; no "Add to cookbook" (out of scope, see below).

- [ ] **Step 1: Failing specs:** the cookbook view renders entries with links to `/c/t/r/{id}` and a not-found state on 404; RecipeViewPage with `via: 'cookbook'` calls `recipeByToken('t', id)`; the share panel hides Reset for an author.
- [ ] **Step 2: Failing e2e** `cookbook-link.spec.ts` (mobile and desktop):
  - User B publishes a PRIVATE recipe with a step photo; user A adds it to a PRIVATE cookbook and copies the cookbook link from the share panel.
  - An anonymous context opens the link → sees the cookbook and the recipe card; opens the recipe → title, steps and the photo loaded (`naturalWidth > 0`); "Back" returns to the cookbook. Then opens a second recipe of the cookbook from the list → its own title shows (fresh content).
  - A resets the cookbook link → the anonymous context's old cookbook URL and old recipe URL show not-found; the old photo URL → 404 (`request.get`); the new link works.
  - B's own `/r/` link still works.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): public cookbook page and recipes through a cookbook link`.

### Task 7: Cookbook cover photo (+ e2e)

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__cookbook_cover.sql`, `cookbook/CookbookMediaAccessPolicy.java`, `cookbook/CookbookCoverController.java`
- Modify: `media/MediaKind.java` (`COOKBOOK`), `media/Media.java` + `MediaService.register` (`cookbookId`), `cookbook/CookbookService.java` (cover set/remove; delete removes cover media), `cookbook/Cookbook.java`
- Modify frontend: `cookbooks/cookbook.page.ts` (owner: cover via the existing `PhotoPicker`, Remove), `cookbook.api.ts` (`setCover`, `removeCover`), My cookbooks and cookbook view show the cover thumb
- Test: `cookbook/CookbookCoverIT.java`; e2e: extend `e2e/tests/cookbook-link.spec.ts` with a `cover` test

**Interfaces:**
- `V7`: `alter table media add column cookbook_id uuid null references cookbook(id) on delete set null`; `alter table cookbook add column cover_media_id varchar(64) null references media(id) on delete set null`; partial index on `cookbook(cover_media_id)`.
- `PUT /api/cookbooks/{id}/cover` (multipart `file`, owner) → `CookbookDto`. Processes `{THUMB, DISPLAY}` outside any transaction (as `AccountService.setAvatar`), then in one short transaction registers `MediaKind.COOKBOOK` media (owner = caller, cookbook = id), swaps the reference and deletes the old cover media (blobs after commit). `DELETE /api/cookbooks/{id}/cover` → `CookbookDto`. `DELETE /api/cookbooks/{id}` deletes the cover media too. Uploads are never left unreferenced, so no orphan job is needed.
- `CookbookMediaAccessPolicy` (kind COOKBOOK): `private, max-age=3600` for a member's session; `private, no-cache` when `?c=` is the cookbook's current token; else denied. Cover URLs carry `?c=` in `PublicCookbook` and none in member DTOs; `CookbookSummary.coverThumbUrl` is filled.

- [ ] **Step 1: Failing ITs** `CookbookCoverIT`: owner uploads → 200 `CookbookDto` whose `cover` has both URLs; a member and the owner GET it (session); an anonymous caller only with the current `?c=`; after a link reset the old `?c=` → 404; an author upload → 403 `cookbook_owner_only`; replacing deletes the old blob; deleting the cookbook deletes the cover blob; a disguised PDF → 415 `unsupported_image`.
- [ ] **Step 2: Failing e2e** (`cover`, mobile and desktop): the owner sets a cover from `fixtures/portrait-orientation6.jpg` → visible on the cookbook page and in My cookbooks; an anonymous context sees it on the cookbook link (`naturalWidth > 0`); Remove → gone after reload.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(cookbook): cookbook cover photo`. Open PR C.

---

## PR D — Co-authors (`feat/p3-coauthors`)

### Task 8: Co-author invites, accept, leave and remove

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__cookbook_invites.sql`, `cookbook/CookbookInviteService.java`, `cookbook/CookbookInviteController.java`, `cookbook/CookbookMemberController.java`
- Modify: `common/TokenPurpose.java` (`COOKBOOK_INVITE`), `common/OneTimeToken.java` (+ `cookbookId`), `common/OneTimeTokens.java` (claim returns `cookbookId`), `cookbook/CookbookService.java`
- Test: `cookbook/CookbookInviteIT.java`, `cookbook/CookbookMemberIT.java`

**Interfaces:**
- `V8`: `alter table one_time_token add column cookbook_id uuid null references cookbook(id) on delete cascade`; index on it.
- Owner endpoints:
  - `POST /api/cookbooks/{id}/invites` → 201 `CookbookInviteCreated(UUID id, String url, Instant expiresAt)`.
  - `GET /api/cookbooks/{id}/invites` → `List<CookbookInviteDto(UUID id, Instant createdAt, Instant expiresAt)>`, outstanding only.
  - `DELETE /api/cookbooks/{id}/invites/{inviteId}` → 204; unknown, used or already revoked → 404 `cookbook_invite_invalid`.
- Invitee endpoints (authenticated):
  - `GET /api/cookbook-invites/{token}` → `CookbookInvitePreview(String cookbookName, PersonDto owner, Instant expiresAt)` without consuming | 404 `cookbook_invite_invalid` (unknown, used, revoked, expired).
  - `POST /api/cookbook-invites/{token}/accept` → 200 `CookbookSummary`. Claims the token with `OneTimeTokens.claim` (atomic), then adds a `cookbook_author` row in the same transaction. Caller already owner or author → 409 `already_member` and the transaction rolls back, so the invite stays usable. 20 authors already → 409 `cookbook_authors_full` (also rolled back).
- Members:
  - `DELETE /api/cookbooks/{id}/authors/{userId}?removeRecipes={bool, default false}` → 204. Allowed for the owner (any author) and for an author on themselves (leave). Target is the owner → 409 `owner_cannot_leave`. An author targeting someone else → 403 `cookbook_owner_only`. A non-author target → 404 `cookbook_not_found`. With `removeRecipes=true`, deletes the cookbook's entries with `added_by = userId`; recipes are never deleted.
  - `CookbookDto.authors` lists co-authors (username, display name, avatar); the owner's view also needs their user id for removal, so `PersonDto` gains `UUID id` (null for anonymous viewers in `PublicCookbook`).

- [ ] **Step 1: Failing ITs** `CookbookInviteIT`:
  - Create → preview → accept → the invitee's `mine()` has the cookbook with role AUTHOR; the invitee can add and remove entries but PATCH → 403.
  - `inviteIsSingleUseUnderConcurrency`: two users accept the same token from two threads → exactly one 200, one 404; one author row.
  - Expired (set `expires_at` in the past via SQL), revoked, and used tokens → 404 on preview and accept.
  - `alreadyMemberKeepsInvite`: the owner accepts → 409 `already_member`; another user can then still accept.
  - Non-owner create/list/revoke → 403 (member) / 404 (non-member); 21st outstanding invite → 409 `cookbook_invites_full`; deleting the cookbook deletes its invites.
- [ ] **Step 2: Failing ITs** `CookbookMemberIT`:
  - `removeAuthorOptionallyTakesTheirEntries`: author C added two recipes, owner A one. Removing C with `removeRecipes=false` keeps all three; re-invite C, remove with `true` → only A's entry remains; all three recipes still exist.
  - An author leaves (self) → no longer a member (404 on GET); the owner leaving → 409 `owner_cannot_leave`; an author removing another author → 403.
  - `authorsFullAt20`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `./mvnw verify` → green.
- [ ] **Step 6:** Commit `feat(cookbook): co-author invites, leave and remove`.

### Task 9: Co-author UI: invite, accept, leave, remove (+ e2e)

**Files:**
- Create in `frontend/src/app/cookbooks/`: `members-panel.component.ts`, `accept-invite.page.ts`, `remove-member.dialog.ts` (+ specs)
- Modify: `app.routes.ts` (`cookbook-invite/:token` → AcceptInvitePage **inside** the authGuard shell, so a logged-out visitor goes to `/login?next=/cookbook-invite/{token}` and returns), `cookbooks/cookbook.page.ts`, `cookbook.api.ts` (`createInvite`, `invites`, `revokeInvite`, `previewInvite`, `acceptInvite`, `removeAuthor(id, userId, removeRecipes)`), `en.json`
- Create: `e2e/tests/coauthors.spec.ts`

**Interfaces:**
- Members panel on the cookbook page: owner and co-authors with avatars. Owner: "Invite co-author" → shows the new URL in a `CopyLinkComponent` with its expiry; outstanding invites with "Revoke"; "Remove" per author. Author: "Leave cookbook".
- `RemoveMemberDialog` (input: person, `self: boolean`): text `cookbooks.removeConfirm` / `cookbooks.leaveConfirm` naming the person or cookbook, a checkbox `cookbooks.alsoRemoveRecipes` ("Also remove the recipes they added" / "…I added"), unchecked by default. Leaving navigates to `/cookbooks`.
- Accept page: preview (cookbook name, owner) with "Accept" and "Not now"; accept → `/cookbooks/{id}`; `already_member` → `errors.already_member` with a link to `/cookbooks`; invalid → `errors.cookbook_invite_invalid`.

- [ ] **Step 1: Failing specs:** the panel shows invite/revoke/remove for the owner and only Leave for an author; the dialog passes `removeRecipes` from the checkbox; the accept page shows the preview and routes to the cookbook on accept; invalid shows the error.
- [ ] **Step 2: Failing e2e** `coauthors.spec.ts` (mobile and desktop):
  - A creates "Weeknight", invites; B is logged out, opens the invite URL → login page → logs in → accept window → Accept → B sees "Weeknight" with the Co-author badge.
  - B adds a recipe of their own; A sees it with "added by" B.
  - Reusing the invite URL (user C) → invalid message.
  - A removes B with the checkbox ticked → B's recipe leaves "Weeknight"; B's My cookbooks no longer lists it; B's recipe still in B's My recipes.
  - Second round: A invites B again, B accepts and adds a recipe, B leaves with the checkbox unticked → the recipe stays in "Weeknight".
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): co-author invites, accept, leave and remove`. Open PR D.

---

## PR E — Account deletion with cookbooks (`feat/p3-account-deletion`)

### Task 10: Deletion removes and names owned cookbooks (+ e2e)

**Files:**
- Modify: `frontend/src/app/settings/delete-account.page.ts` (+ spec), `en.json`, `cookbooks/cookbook.page.ts` / view (render a null `addedBy` as `cookbooks.formerMember`)
- Modify (only if a test shows it is needed): `account/AccountService.java`
- Test: `cookbook/CookbookAccountDeletionIT.java`; Create: `e2e/tests/account-deletion-cookbooks.spec.ts`

**Interfaces:**
- The confirmation lists owned cookbooks by name from `CookbookApi.mine()` filtered to `role === 'OWNER'` (`settings.deleteCookbooks`, one list item per name). With none, the list is absent. A failed `mine()` shows `settings.deleteCookbooksUnknown` and keeps the form usable. No new endpoint: the client-agnostic `GET /api/cookbooks/mine` already answers it.
- Deletion relies on FK cascades plus `MediaService.deleteAllOwnedBy` (covers are COOKBOOK media owned by the owner); `AccountDeletionHook` stays as is unless the IT fails.

- [ ] **Step 1: Failing IT** `CookbookAccountDeletionIT` (A owns "A-book" with a cover; A co-authors B's "B-book"; A's recipe R1 is in "B-book"; A added B's recipe R2 to "B-book"): deleting A → "A-book" and its invites are gone and its cover blobs deleted after commit; "B-book" survives without A as author; R1 is gone from "B-book"; R2 stays in "B-book" with `addedBy` null.
- [ ] **Step 2: Failing spec + e2e** (mobile and desktop): the spec renders two owned names and skips an AUTHOR cookbook. E2e: a fresh user owns "Soups" and co-authors another user's cookbook → the delete page names "Soups" only; deleting → the other user's cookbook still opens and no longer lists the deleted user as co-author.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green (`./mvnw verify`, `ng test`, `ng build`, `scripts/e2e.sh`).
- [ ] **Step 6:** Commit `feat: account deletion names and removes owned cookbooks`. Open PR E.

---

## Out of scope (later plans)
- Public cookbooks on the profile page, the home feed, scaling and keep-screen-on → Plan 4.
- Registering a new account from a co-author invite (spec §6.3: ignored for the PoC); ownership transfer; more than one owner.
- Manual ordering of cookbook entries (newest added first only); pagination of cookbooks and entries (bounded at 500 entries).
- "Add to cookbook" from a recipe opened through a cookbook link (`/c/:token/r/:id`): the viewer has no recipe reference they could add with. Add it only together with a `RecipeRef` variant `{cookbookToken, recipeId}`.
- Cookbook versioning / conflict detection (edits are last-write-wins).
- Idempotency key for `POST /api/cookbooks`, rate limits and `X-Robots-Tag: noindex` on `/c/**` → with the plan-2 "Before a native Android client" and Plan 5 items.
