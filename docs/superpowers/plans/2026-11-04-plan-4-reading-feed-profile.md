# Plan 4 — Recipe Page, Feed and Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reading a recipe while cooking gets portion scaling with kitchen fractions and a "Keep screen on" toggle. Logged-in users land on a home feed of public recipes. Every user has a minimal profile page listing their recipes and public cookbooks. Private items never leak into either listing.

**Architecture:** The feed is its own package, `com.ricettine.feed`, with one keyset-paginated endpoint and its own SQL. It reads the `recipe` table and nothing else depends on it, so it can be replaced. The profile is a new package, `com.ricettine.profile`, that composes two listing methods: one in `recipe` and one in `cookbook`. Each listing method owns its visibility filter and has ITs. Listed items link to the existing token pages (`/r/{token}`, `/c/{token}`), so no new read path or photo grant is added. Page titles move to an Angular `TitleStrategy`. Scaling and fraction display are pure frontend functions.

**Tech Stack:** Existing (Spring Boot 4.1.2, Java 25, Postgres 17, Flyway, Angular 22.2 zoneless, Transloco, Playwright). No new dependencies. Screen Wake Lock API (`navigator.wakeLock`).

**Spec:** `docs/superpowers/specs/2026-11-03-ricettine-design.md` §3 (profile), §4.3 (scaling), §4.5 (listing rules), §6.2 (public cookbooks on the profile), §7 (recipe page, cooking mode, feed). Entry criteria: the "Plan 4" sections of `2026-11-04-plan-3-followups.md` and `2026-11-04-plan-2-followups.md`, plus the Plan 1 "shell has no logout control" leftover (see Rulings).

## Delivery: 4 small PRs
Each PR gets its own branch, stacked on the previous one. A PR is done only when it is green in CI (backend, frontend, e2e on **mobile and desktop**, smoke) and contains backend ITs plus Playwright specs for its feature. No manual checks.

| PR | Branch | Tasks | User-visible result | Whole-PR review |
|---|---|---|---|---|
| A | `feat/p4-entry-criteria` | 1–2 | Correct page titles, locale-aware dates, no extra request for "Back to {cookbook}" | no |
| B | `feat/p4-recipe-page` | 3–4 | Portion scaling with fractions; Keep screen on | no |
| C | `feat/p4-feed` | 5–6 | Home feed of public recipes, paginated; Home nav | **opus** (listing visibility) |
| D | `feat/p4-profile` | 7–8 | Profile page `/u/{username}` for visitors and self | **opus** (listing visibility) |

## Rulings (made while planning; cost if wrong)
- **Listings link to share tokens.** Feed and profile items carry the recipe's `shareToken` (and a public cookbook's), and open the existing `/r/` and `/c/` pages. Someone who saw a public recipe keeps its link after the author makes it private. This is the unlisted model, and the author can reset the link to revoke it. The editor says this next to the visibility switch (Task 6). *Cost if wrong:* one PR to add a by-id read path for PUBLIC items plus a photo grant.
- **Feed and profile need a session** (401 for anonymous callers): the instance is invite-only and the feed is the logged-in home. `/r/` and `/c/` stay public. *Cost if wrong:* one `permitAll` line per endpoint, and the routes move out of the shell.
- **Feed order is `published_at DESC, id DESC`.** A recipe published as private and switched to public later appears at its original publish time. *Cost if wrong:* a `listed_at` column and a migration.
- **The profile lists owned cookbooks only**, not co-authored ones (spec §6.2 "its owner's profile page"); the self view includes private ones. No pagination on the profile (My recipes has none either). *Cost if wrong:* one query change; pagination reuses the feed cursor scheme.
- **The logged-in home moves from `/recipes` to `/` (the feed).** `expectHome` in the e2e helpers changes accordingly. *Cost if wrong:* a single redirect line.
- **Plan 1 "shell has no logout control" is already closed:** the shell has had "Log out" in its top bar on both layouts since Plan 2. Task 6 pins it with an e2e test that logs out from the feed. *Cost if wrong:* none.
- **Rounding applies only to scaled amounts.** Unscaled amounts show exactly as entered, with fraction glyphs for exact kitchen fractions. *Cost if wrong:* a one-line change in `displayAmount`.
- **PR B's backend IT pins the amount-precision contract** that scaling depends on. PR B has no other backend change.

## Global Constraints
- All Plan 1–3 Global Constraints still hold:
  - UUID PKs assigned by the server.
  - ProblemDetail + `code`.
  - Every UI string goes through Transloco `frontend/public/i18n/en.json`.
  - 44 px touch targets.
  - Flyway-only schema (`V9`+, never edit an applied migration).
  - Breakpoint 768 px with the desktop top nav / phone bottom nav shell.
  - A denied read returns 404 and never reveals that the item exists.
- New error code `user_not_found` goes into `KNOWN_ERROR_CODES` (`frontend/src/app/core/api-error.ts`) and `en.json`.
- **Listing rule (spec §4.5, §6.2):** a listing that someone other than the owner sees contains only `status = 'PUBLISHED' AND visibility = 'PUBLIC'` recipes and `visibility = 'PUBLIC'` cookbooks. A PUBLIC draft is not listed. The owner's own profile view lists all their recipes and owned cookbooks, with `status` and `visibility` included so the UI can mark them.
- Feed and profile responses send `Cache-Control: no-store`, so a public→private switch takes effect on the next load.
- Feed pagination: `limit` 1–50 (default 20, the web uses 20). The `cursor` is opaque base64url of `{publishedAt epoch micros}:{id}`. A malformed cursor or an out-of-range limit → 400 `validation_failed` with `fields` `{cursor|limit: 'invalid'}`. `nextCursor` is null on the last page.
- Thumb URLs in listings carry the grant that already exists: `?s={recipeShareToken}` for recipe covers, `?c={cookbookToken}` for cookbook covers.
- Keep the "Before a native Android client" items in both follow-up files possible: JSON-only, cursor pagination (no page numbers tied to the web), `shareToken` fields (they also answer the plan-3 Android item for cookbooks), and server ids.
- **Date convention** (closes the plan-3 item): every displayed date goes through `AppDatePipe` (`appDate`), which formats with `Intl.DateTimeFormat(activeLang, …)`. `'date'` → `{ dateStyle: 'medium' }`; `'dateTime'` → `{ dateStyle: 'medium', timeStyle: 'short' }`. Angular's `DatePipe` is no longer used.
- **Title convention:** `"{page} · Ricettine"`, or `"Ricettine"` when a route has no title. Static titles are i18n keys in route `title`. Dynamic pages call `PageTitle.set(text)`.

## Review Focus
1. **A recipe or cookbook switched public → private** leaves the feed and other people's view of the profile on the next request (no caching). Tested in Task 5 (`switchingToPrivateDelists`) and Task 7 (`profileHidesPrivateAfterSwitch`).
2. **A draft whose visibility is set to PUBLIC** before it is published is never listed. Tested in Task 5 (`publicDraftNeverListed`) and Task 7.
3. **Feed ties and inserts between pages:** recipes with the same `published_at`, and a recipe published between two page loads, give no duplicates and no skips. Tested in Task 5 (`tiesAreNeitherSkippedNorRepeated`).
4. **Scaling extremes:** an amount without a value stays unchanged. Tiny scaled amounts never display as "0". 1 000 000 × 100 doesn't overflow the display. Portions stay within 1–100. Tested in Task 3 (`displayAmount` and stepper specs).
5. **Wake lock lifecycle:** the browser drops the lock when the tab is hidden, so it is re-acquired when the tab is visible again while the toggle is on. A rejected request unchecks the toggle silently. Leaving the page releases the lock. Tested in Task 4 (`keep-screen-on` spec).

---

## PR A — Entry criteria (`feat/p4-entry-criteria`)

### Task 1: TitleStrategy and date convention (+ e2e)

**Files:**
- Create: `frontend/src/app/core/page-title.ts` (`AppTitleStrategy`, `PageTitle`) (+ spec), `frontend/src/app/shared/app-date.pipe.ts` (+ spec)
- Modify: `app.ts` (drop the title subscription), `app.config.ts` (`{ provide: TitleStrategy, useExisting: AppTitleStrategy }`), `app.routes.ts` (a `title` i18n key on every static route), `recipes/view/recipe-view.page.ts` and `cookbooks/view/cookbook-view.page.ts` (use `PageTitle`; drop `Title`/`DestroyRef` restore), `shared/copy-link.component.ts`, `admin/invites.page.ts`, `cookbooks/members-panel.component.ts` (`appDate: 'dateTime'`), `en.json` (`titles.*`)
- Create: `e2e/tests/titles.spec.ts`

**Interfaces:**
- `@Injectable({providedIn:'root'}) class AppTitleStrategy extends TitleStrategy`: `updateTitle(snapshot)` takes `buildTitle(snapshot)` (an i18n key or undefined), clears any dynamic title, and re-renders whenever the Transloco language or translations change.
- `@Injectable({providedIn:'root'}) class PageTitle { set(text: string | null): void }`: overrides the route title until the next navigation; `null` falls back to the route title.
- `@Pipe({name:'appDate'}) class AppDatePipe` (impure, follows the active language): `transform(value: string | Date | null, style: 'date' | 'dateTime' = 'date'): string`; null → `''`.

- [ ] **Step 1: Failing specs:**
  - The strategy sets `"My recipes · Ricettine"` for a route with `title: 'titles.myRecipes'` and `"Ricettine"` for a route without one.
  - `PageTitle.set('Tiramisù')` → `"Tiramisù · Ricettine"`; the next navigation drops it.
  - A late app-name emission doesn't overwrite a dynamic title: emit translations after `set` and expect the dynamic title to stay.
  - `appDate` with `en` and `'2026-11-04T10:00:00Z'` → `"Nov 4, 2026"`; `'dateTime'` includes the time; null → `''`.
- [ ] **Step 2: Failing e2e** `titles.spec.ts` (mobile and desktop):
  - `/login` `toHaveTitle('Log in · Ricettine')`.
  - After login, `/cookbooks` `toHaveTitle('Cookbooks · Ricettine')`.
  - A published recipe's `/r/` link `toHaveTitle('{title} · Ricettine')`, and it is still that after 1 s (the app-name race).
  - Going back to `/recipes` → `'My recipes · Ricettine'`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `ng test`, `ng build`, `scripts/e2e.sh` → green (quiet, exit codes checked).
- [ ] **Step 6:** Commit `feat(frontend): page titles via TitleStrategy, locale-aware dates`.

### Task 2: Cookbook name on a recipe opened through a cookbook (+ e2e)

**Files:**
- Modify: `recipe/RecipeDtos.java` (`PublicRecipe` gains `@JsonInclude(NON_NULL) String cookbookName` as its last component), `recipe/RecipeService.java` (`publishedPublicView(UUID id, String photoQuery, UUID viewerId, String cookbookName)`; `publicByToken` passes null), `cookbook/PublicCookbookController.java` (or `CookbookService`, wherever the recipe-through-cookbook call is made: pass the cookbook name)
- Modify: `frontend/src/app/recipes/recipe.model.ts` (`cookbookName?: string`), `recipes/view/recipe-view.page.ts` (drop the `byToken` call and the `cookbookName` signal; read `r.cookbookName`; on 404 the Back link uses `cookbooks.back`)
- Test: extend `cookbook/PublicCookbookIT.java`, `recipe/PublicRecipeIT.java`; extend `e2e/tests/cookbook-link.spec.ts`

- [ ] **Step 1: Failing ITs:**
  - `recipeThroughCookbookCarriesCookbookName`: `GET /api/c/{t}/recipes/{id}` → `$.cookbookName` equals the cookbook name.
  - `PublicRecipeIT`: `GET /api/r/{t}` has no `cookbookName` key (`doesNotExist()`).
- [ ] **Step 2: Failing spec:** RecipeViewPage with `via: 'cookbook'` calls `recipeByToken` once and never calls `byToken`, and shows "Back to Desserts" from `cookbookName`.
- [ ] **Step 3: Failing e2e** (extend `cookbook-link.spec.ts`): count requests matching `/api/c/{token}$` while the recipe-through-cookbook page loads → 0, and the "Back to {name}" link is visible.
- [ ] **Step 4:** Run → FAIL. **Step 5:** Implement. **Step 6:** `./mvnw verify`, `ng test`, `scripts/e2e.sh` → green.
- [ ] **Step 7:** Commit `feat: cookbook name on recipes opened through a cookbook`. Open PR A.

---

## PR B — Recipe page for cooking (`feat/p4-recipe-page`)

### Task 3: Fraction display and portion scaling (+ e2e)

**Files:**
- Modify: `frontend/src/app/recipes/amount.ts` (add `displayAmount`, `scaleAmount`; keep `formatAmount` for the editor) (+ spec)
- Create: `frontend/src/app/recipes/view/portions-stepper.component.ts` (+ spec)
- Modify: `recipes/view/recipe-view.page.ts` (+ spec), `en.json` (`recipes.scale.*`)
- Test: `backend/src/test/java/com/ricettine/recipe/PublicRecipeIT.java` (`amountsKeepThreeDecimals`); Create: `e2e/tests/scaling.spec.ts`

**Interfaces:**
- `scaleAmount(amount: number | null, written: number, chosen: number): number | null`: `null` stays null; otherwise `amount * chosen / written`.
- `displayAmount(n: number | null, unit: Unit | null, opts: { scaled: boolean; locale: string }): string`. Rules (spec §4.3, builder's call):
  - `null` → `''`.
  - **Metric units** `g`, `ml`, applied when `scaled`: n < 10 → 1 decimal, trailing zero dropped; 10 ≤ n < 100 → integer; 100 ≤ n < 1000 → nearest 5; n ≥ 1000 → nearest 10. Never below the smallest shown step: 0.04 g → `"0.1"`.
  - `kg`, `l`, applied when `scaled`: 2 decimals, trailing zeros dropped.
  - **Every other unit and no unit** (tsp, tbsp, cup, piece, pinch, clove, slice, can, bunch, none): whole part plus the fractional part snapped to the nearest of `0, ⅛, ¼, ⅓, ½, ⅔, ¾, 1`, written `"1⅓"` (no space), `"⅓"` when the whole part is 0. A positive value never shows as 0 (it snaps up to `⅛`). n ≥ 20 → integer. Unscaled values are snapped only when within 0.01 of a fraction; otherwise they show as decimals.
  - Decimals and grouping use `Intl.NumberFormat(locale)` (`en`: `"1,000,000"`, `"0.5"`).
- `PortionsStepperComponent` (inputs `value`, `min = 1`, `max = 100`; output `valueChange`): − / + buttons, each 44 px with names `recipes.scale.fewer` / `recipes.scale.more`, disabled at the bounds. Output `<span role="status">` shows `editor.chips.serves`. When `value !== written`, a `recipes.scale.reset` button returns to the written portions.
- Recipe page: the stepper sits in the ingredients section header and replaces the static "serves" chip there. Amounts render through `displayAmount(scaleAmount(...), unit, { scaled: chosen !== written, locale })`. The chosen value resets when another recipe loads.

- [ ] **Step 1: Failing unit tests** `amount.spec.ts`:
  - `displayAmount(1/3,'cup',{scaled:true})` → `'⅓'`; `333.33,'g'` → `'335'`; `1.5,'tsp'` → `'1½'`; `0.04,'g'` → `'0.1'`; `0.01,'tsp'` → `'⅛'`; `2.678,'kg'` → `'2.68'`; `22.4,'piece'` → `'22'`; `1_000_000*100,'g'` → `'100,000,000'`; `333,'g',{scaled:false}` → `'333'`; `0.5,'cup',{scaled:false}` → `'½'`; `0.3,'cup',{scaled:false}` → `'0.3'`; `null` → `''`.
  - `scaleAmount(200, 4, 6)` → 300; `scaleAmount(null, 4, 6)` → null.
- [ ] **Step 2: Failing specs:**
  - The stepper disables − at 1 and + at 100 and emits on click.
  - The recipe page with portions 4 and `200 g` flour, after +2 clicks, shows `300 g`, keeps `salt` with no amount unchanged, and Reset brings back `200 g`.
- [ ] **Step 3: Failing IT** `amountsKeepThreeDecimals`: save an ingredient amount `0.333`, publish, `GET /api/r/{t}` → `$.groups[0].ingredients[0].amount == 0.333` and `$.portions` present.
- [ ] **Step 4: Failing e2e** `scaling.spec.ts` (mobile and desktop):
  - Through the editor, publish a recipe with portions 3, `1 cup` milk, `1000 g` sugar and `salt` with no amount. Extend `NewRecipeData` ingredients to accept `{ name, amount?, unit? }` and fill the editor's amount and unit fields.
  - Open the `/r/` link and press − twice (serves 1) → `⅓ cup`, `335 g` (the spec's example), `salt` unchanged.
  - Press + until it serves 9 → `3 cup`, `3,000 g`.
  - Reset → `1 cup`, `1,000 g`.
  - The stepper buttons are ≥ 44 px (`boundingBox`).
- [ ] **Step 5:** Run → FAIL. **Step 6:** Implement. **Step 7:** All green.
- [ ] **Step 8:** Commit `feat(frontend): portion scaling with kitchen fractions`.

### Task 4: Keep screen on (+ e2e)

**Files:**
- Create: `frontend/src/app/recipes/view/keep-screen-on.component.ts` (+ spec)
- Modify: `recipes/view/recipe-view.page.ts`, `en.json` (`recipes.keepScreenOn`)
- Create: `e2e/tests/keep-screen-on.spec.ts`

**Interfaces:**
- `KeepScreenOnComponent` (standalone, no inputs): renders nothing when `!('wakeLock' in navigator)`. Otherwise it renders a 44 px checkbox labelled `recipes.keepScreenOn`.
  - Checking it calls `navigator.wakeLock.request('screen')`. A rejection unchecks it, with no message and no console error.
  - Unchecking it releases the sentinel.
  - While checked, `document` `visibilitychange` → `visible` with no live sentinel (or the sentinel's `release` event fired) requests again.
  - Destroy releases the lock and removes the listeners.
- Placement: in the recipe page header area, beside the author row, on both layouts (both `/r/` and `/c/…/r/`).

- [ ] **Step 1: Failing spec** (fake `navigator.wakeLock` with call counters):
  - Absent API → no checkbox in the DOM.
  - Check → one `request('screen')`; uncheck → `release()` called.
  - A rejected request → checkbox unchecked.
  - Hidden, then visible while checked → a second `request`.
  - Destroy → release.
- [ ] **Step 2: Failing e2e** `keep-screen-on.spec.ts` (mobile and desktop): `context.addInitScript` installs a fake `navigator.wakeLock` that records calls on `window.__wl`.
  - Open a published recipe's `/r/` link, check "Keep screen on" → `__wl.requests === 1`.
  - Uncheck → `__wl.releases === 1`.
  - A second context whose init script deletes `navigator.wakeLock` → the checkbox is absent and the recipe still renders.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): keep screen on while cooking`. Open PR B.

---

## PR C — Home feed (`feat/p4-feed`)

### Task 5: Feed endpoint

**Files:**
- Create: `backend/src/main/resources/db/migration/V9__feed_index.sql`
- Create in `backend/src/main/java/com/ricettine/feed/`: `FeedController.java`, `FeedService.java`, `FeedCursor.java`, `FeedDtos.java`
- Test: `feed/FeedCursorTest.java`, `feed/FeedIT.java`

**Interfaces:**
- `V9`: `CREATE INDEX ix_recipe_feed ON recipe (published_at DESC, id DESC) WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC';`
- `GET /api/feed?cursor=&limit=` (authenticated) → `FeedPage`, `Cache-Control: no-store`.
  - `record FeedItem(UUID id, String title, AuthorDto author, String shareToken, String coverThumbUrl, Instant publishedAt)`. `author` reuses `recipe.RecipeDtos.AuthorDto`. `coverThumbUrl` = THUMB URL + `?s={shareToken}` (URL-encoded), or null.
  - `record FeedPage(List<FeedItem> items, String nextCursor)`.
- `FeedService.page(String cursor, int limit): FeedPage`: one `JdbcTemplate` query joining `app_user`, with the listing rule in its `WHERE` and keyset `(published_at, id) < (:at, :id)`. It fetches `limit + 1` rows to decide `nextCursor`. Package-private apart from the controller. No other package calls it.
- `FeedCursor.encode(Instant, UUID): String` / `decode(String): Optional<Key>` (base64url without padding, `{micros}:{uuid}`; anything else → empty → 400).

- [ ] **Step 1: Failing unit test** `FeedCursorTest`: round trip; `"x"`, `""`, a base64 of `"1:not-a-uuid"`, and a negative micros value → empty.
- [ ] **Step 2: Failing ITs** `FeedIT` (seed through the recipe API, adjust `published_at` with `JdbcTemplate` where order matters):
  - `listsOnlyPublishedPublicNewestFirst`: user A has PUBLIC published, PRIVATE published, PUBLIC draft (`publicDraftNeverListed`), PRIVATE draft; user B has PUBLIC published. Only the two public published appear, newest first, with author username and `shareToken`.
  - `switchingToPrivateDelists`: a listed recipe saved with `visibility PRIVATE` → gone on the next GET; back to PUBLIC → back.
  - `paginatesWithCursor`: 5 recipes, `limit=2` → 2, 2, 1 with the last `nextCursor` null; no id repeated.
  - `tiesAreNeitherSkippedNorRepeated`: 3 recipes with an identical `published_at`, `limit=2` → all 3 exactly once. A recipe published between page 1 and page 2 doesn't appear on page 2 and nothing is skipped.
  - `coverThumbLoadsWithItsToken`: the item's `coverThumbUrl` → 200.
  - `badCursorOrLimit`: `cursor=garbage` → 400 `fields.cursor`; `limit=0` and `limit=51` → 400 `fields.limit`.
  - `deletedAuthorsRecipesVanish`: delete user B's account → B's recipe is gone from the feed.
  - `anonymousIs401`; the response has `Cache-Control: no-store`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `./mvnw verify` → green.
- [ ] **Step 6:** Commit `feat(feed): public recipe feed endpoint with cursor pagination`.

### Task 6: Home feed page, Home nav, private hint (+ e2e)

**Files:**
- Create in `frontend/src/app/feed/`: `feed.model.ts`, `feed.api.ts`, `feed.page.ts` (+ specs)
- Modify:
  - `app.routes.ts`: the shell's `''` child → `FeedPage` (`title: 'titles.home'`), replacing the redirect to `recipes`.
  - `shell/shell.component.ts`: a "Home" link first in both navs, `routerLinkActiveOptions exact`; the logo links to `/`.
  - `recipes/editor/recipe-editor.page.ts`: under the visibility fieldset, `editor.privateHint` when PRIVATE and `editor.publicHint` when PUBLIC.
  - `en.json`: `feed.*`, `nav.home`, `titles.home`, `editor.privateHint`, `editor.publicHint`.
- Modify: `e2e/tests/helpers.ts` (`expectHome` asserts URL `/$` and heading `Latest recipes`; add `apiPublishRecipe(page, { title, visibility }): Promise<{ id, shareToken }>`, which uses `page.request` with the `XSRF-TOKEN` cookie as the `X-XSRF-TOKEN` header). Update every e2e that asserted landing on `/recipes` after login (`walkthrough`, `restart`, `auth.setup` if needed).
- Create: `e2e/tests/feed.spec.ts`

**Interfaces:**
- `FeedApi.page(cursor?: string): Promise<FeedPage>` (limit 20).
- Feed page:
  - Heading `feed.title` ("Latest recipes").
  - Cards with cover thumb (placeholder when null), title linking to `/r/{shareToken}`, `recipes.by` author, and `publishedAt | appDate`. Desktop: grid. Phone: list.
  - "Load more" (`feed.more`, 44 px) when `nextCursor` is set. It appends, is disabled while loading, and a failure shows `errorKey` with Retry while keeping the loaded items.
  - Empty state `feed.empty` with a link to `/recipes/new`.
  - Load error with Retry.
- Hints: `editor.privateHint` = "Hidden from the home feed and your profile. Anyone with the link can still open it; reset the link to revoke it." and `editor.publicHint` = "Listed on the home feed and your profile once published."

- [ ] **Step 1: Failing specs:**
  - The feed page renders cards linking to `/r/{token}`.
  - "Load more" appears only with `nextCursor`, appends page 2 and passes the cursor.
  - A page-2 failure keeps page 1 and shows Retry.
  - Empty state.
  - The shell renders Home in both navs.
  - The editor shows the private hint for PRIVATE.
- [ ] **Step 2: Failing e2e** `feed.spec.ts` (mobile and desktop, fresh users per project):
  - Login lands on `/` with "Latest recipes", `toHaveTitle('Home · Ricettine')`.
  - User A publishes a PUBLIC "Feed-pub-{stamp}" and a PRIVATE "Feed-priv-{stamp}" through the editor, and keeps a PUBLIC draft "Feed-draft-{stamp}". User B's feed shows only "Feed-pub". Clicking it opens the recipe page.
  - A switches "Feed-pub" to PRIVATE in the editor (the private hint is visible) → B reloads → gone.
  - Pagination: B creates 21 PUBLIC recipes with `apiPublishRecipe` → the first page shows 20 and "Load more"; clicking it shows the 21st (the oldest), with no title repeated.
  - Layout: on desktop the first two cards sit side by side; on mobile they stack.
  - Logout from the feed works on both layouts (`logOut`): this closes the Plan 1 leftover.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** `ng test`, `ng build`, `scripts/e2e.sh` → green.
- [ ] **Step 6:** Commit `feat(frontend): home feed`. Open PR C.

---

## PR D — Profile (`feat/p4-profile`)

### Task 7: Profile endpoint

**Files:**
- Create in `backend/src/main/java/com/ricettine/profile/`: `ProfileController.java`, `ProfileService.java`, `ProfileDtos.java`
- Modify: `recipe/RecipeService.java` (+ `RecipeRepository` query), `cookbook/CookbookService.java` (+ `CookbookRepository` query); add the `user_not_found` code to frontend `core/api-error.ts` and `en.json`
- Test: `profile/ProfileIT.java`

**Interfaces:**
- `RecipeService.listedByAuthor(UUID authorId, boolean includeUnlisted): List<ProfileRecipe>`.
  - `includeUnlisted=false`: the listing rule, ordered `published_at DESC, id DESC`.
  - `true`: every recipe of the author, ordered `updated_at DESC, id ASC` (as `mine`).
  - Thumbs carry `?s={shareToken}` only for PUBLISHED recipes; drafts in the self view get the plain session URL.
- `CookbookService.listedByOwner(UUID ownerId, boolean includeUnlisted): List<ProfileCookbook>`.
  - `false`: PUBLIC only. `true`: all owned. Ordered `updated_at DESC, id ASC`.
  - Thumbs carry `?c={token}`.
- DTOs:
  - `ProfileRecipe(UUID id, String title, String status, String visibility, String shareToken, String coverThumbUrl, Instant publishedAt, Instant updatedAt)` in `RecipeDtos`. `shareToken` is null for drafts.
  - `ProfileCookbook(UUID id, String name, String visibility, int recipeCount, String shareToken, String coverThumbUrl)` in `CookbookDtos`.
  - `record ProfileDto(AuthorDto person, boolean self, List<ProfileRecipe> recipes, List<ProfileCookbook> cookbooks)` in `ProfileDtos`.
- `GET /api/users/{username}/profile` (authenticated) → `ProfileDto`, `Cache-Control: no-store`. `self` = the caller is that user; `includeUnlisted = self`. Unknown username → 404 `user_not_found`. Matching is exact: usernames are lowercase by construction, so `Alice` → 404.

- [ ] **Step 1: Failing ITs** `ProfileIT`:
  - Fixture: A has PUBLIC published, PRIVATE published, PUBLIC draft and PRIVATE draft recipes, plus a PUBLIC and a PRIVATE owned cookbook. A co-authors B's PUBLIC cookbook.
  - `visitorSeesOnlyPublic`: B viewing A → one recipe, one cookbook (A's PUBLIC); `self=false`; no draft, no private item, not B's cookbook.
  - `selfSeesAllMarked`: A viewing A → 4 recipes with status and visibility, 2 cookbooks; `self=true`; drafts have null `shareToken`.
  - `profileHidesPrivateAfterSwitch`: A switches the public recipe and the public cookbook to PRIVATE → B's next GET lists neither.
  - `thumbsLoadForVisitor`: the visitor's recipe and cookbook `coverThumbUrl` → 200 when GET anonymously.
  - `unknownUserIs404` (and `Alice` for `alice`); `anonymousIs401`; `Cache-Control: no-store`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `./mvnw verify` → green.
- [ ] **Step 5:** Commit `feat(profile): profile endpoint with visitor and self views`.

### Task 8: Profile page and links to it (+ e2e)

**Files:**
- Create in `frontend/src/app/profile/`: `profile.model.ts`, `profile.api.ts`, `profile.page.ts` (+ specs)
- Modify:
  - `app.routes.ts`: `u/:username` → `ProfilePage` inside the authGuard shell. The title is dynamic via `PageTitle` (the display name).
  - `shell/shell.component.ts`: the display name in the top bar becomes a link to `/u/{me.username}` (accessible name `nav.profile`).
  - `feed/feed.page.ts`: the author name links to `/u/{username}`.
  - `recipes/view/recipe-view.page.ts`: the author name links to `/u/{username}` only when logged in.
  - `en.json`: `profile.*`, `nav.profile`.
- Create: `e2e/tests/profile.spec.ts`

**Interfaces:**
- `ProfileApi.get(username): Promise<Profile>`.
- Profile page:
  - Header with avatar and display name, plus `@username`.
  - Section "Recipes" (`profile.recipes`): visitor items link to `/r/{shareToken}`. In the self view, drafts link to `/recipes/{id}/edit`, published items link to `/r/{shareToken}`, and each item shows the existing `recipes.status.*` badge (Draft / Private / Public).
  - Section "Cookbooks" (`profile.cookbooks`), shown only when non-empty: visitor items link to `/c/{shareToken}`. Self items link to `/cookbooks/{id}` with a Private/Public badge.
  - Empty states: `profile.noRecipes` (visitor), `recipes.empty` (self).
  - 404 → `profile.notFound`.
  - Desktop: grid. Phone: list.

- [ ] **Step 1: Failing specs:**
  - The visitor view renders `/r/` links without badges.
  - The self view renders badges, and a draft links to the editor.
  - The cookbooks section is hidden when empty.
  - Not-found state.
  - The shell's name links to `/u/{username}`.
- [ ] **Step 2: Failing e2e** `profile.spec.ts` (mobile and desktop, fresh users):
  - A publishes PUBLIC "Prof-pub" and PRIVATE "Prof-priv", keeps draft "Prof-draft", and creates a PUBLIC cookbook "Prof-book-pub" and a PRIVATE "Prof-book-priv". Use the UI for at least one of each kind; `apiPublishRecipe` is fine for the rest.
  - B opens A's profile from A's name on the feed → sees "Prof-pub" and "Prof-book-pub" only. Opening "Prof-book-pub" reaches the cookbook page. `toHaveTitle` contains A's display name.
  - A clicks their own name in the shell → sees all five with Draft / Private / Public badges; the draft opens the editor.
  - A makes "Prof-book-pub" PRIVATE → B reloads → gone.
  - `/u/nobody_{stamp}` → not-found state.
  - Layout: desktop side by side, mobile stacked.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** All green.
- [ ] **Step 6:** Commit `feat(frontend): profile page`. Open PR D.

---

## Out of scope (later plans)
- Feed personalization, search, tags, filters (spec §2); infinite scroll (the feed has "Load more").
- Pagination on the profile page; listing co-authored cookbooks on a profile.
- A by-id public read path for PUBLIC items (see Rulings).
- Anonymous access to the feed and profiles.
- Remembering the chosen portions across visits; unit conversion (spec §2).
- `X-Robots-Tag: noindex` on `/u/**`, and rate limits: with the Plan 5 items.
- Everything still open in the plan-2 and plan-3 follow-up files outside their "Plan 4" sections.
