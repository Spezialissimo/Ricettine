# Plan 2 follow-ups (carry into later plans)

Collected from the per-task and per-PR reviews of Plan 2 (SDD ledger). Nothing here blocks Plan 2; each item names the plan that should pick it up. Items listed under "Out of scope" in the Plan 2 plan are not repeated.

## Plan 3 (cookbooks)
- `OptimisticLockException` is mapped globally to `recipe_conflict`. Scope that mapping to recipes (or give cookbooks their own code) before cookbooks add versioned entities.
- The public recipe page (`/r/:token`) reads the token once from the route snapshot. Subscribe to `paramMap` before cookbooks link between recipes, or navigating from one recipe to another shows stale content. The editor has the same pattern (route id read once).

## Plan 4 (reading/feed/profile)
- The app-name title subscription can overwrite the recipe title on the public page. Move titles to a `TitleStrategy` (or an effect) and add an e2e `toHaveTitle` check.

## Plan 5 (hosting & CI)
- Configure S3 API-call timeouts. `addPhoto` holds a `FOR SHARE` lock and a DB connection while writing blobs, so a hung S3 call pins both.
- Add a per-recipe photo upload cap and rate limiting on uploads (only the global processing limiter exists today).
- Add `X-Robots-Tag: noindex` on `/r/**` (and a `noindex` meta on the page) before any public deployment.
- Tokenized photo responses are `private, no-cache` without an `ETag`. Add a strong ETag and answer 304.
- Spring multipart buffers each upload (to disk by default) before the controller runs. Set the temp location and limits for the 2 GB host.
- Image processing has no time bound: PNG/JPEG CPU time grows with source size even when subsampled. Consider a processing timeout.

## Before a native Android client
- Make `version` required on `DELETE /api/recipes/{id}` (it is optional now) and send it from the web `RecipeApi.remove`. This closes the GET-then-DELETE race when an empty draft is auto-deleted.
- Creating a recipe is not idempotent: a retry after a lost response can create a second draft. Add a client-supplied idempotency key.
- `Retry-After` is missing on the 503 returned when the image processing limiter is busy. Clients need it to back off.
- Too many decimals on an amount returns `out_of_range`; consider a distinct `too_precise` code. Length limits count UTF-16 units in the validator but the DB columns count code points; make both count code points so clients with different string models agree.

## Small cleanups (any time)
- Backend, images and media:
  - Gray+alpha PNG still goes through `Graphics2D` (possible darkening, slow loop).
  - CMYK with an ICC profile is accepted; only profile-less CMYK is rejected.
  - `isWebp` duplicates the sniff magic check.
  - Add a 250 MP boundary test.
  - The media backfill's schema drop is not in a `finally`.
  - The `MediaIT` partial-write test passes nulls for repo/after (fragile).
  - Every media GET does a DB lookup.
- Orphan-cleanup job:
  - Lock order against account deletion: use `SKIP LOCKED`.
  - The batch loop can stall behind 500 failing heads: use keyset paging.
  - It runs at startup: add `initialDelay`.
  - Unreferenced uploads stay readable by share token until the job runs.
- Recipe backend: `delete` loads the recipe without a lock.
- Test infrastructure:
  - The `csrf()` helper leaks a session-backed CSRF repository into the shared filter chain. Add a restore in `IntegrationTest` (`@AfterEach`).
  - Fix the import order in `AccountService`, `PasswordResetService`, `MeIT`, `PasswordResetIT`.
  - Per-class `@TestPropertySource` creates 3 extra Spring contexts; use a shared property or `IntegrationTest`.
- Auth interceptor: add specs for a pending reset, a second expiry, and a 401 on logout. Absolute API URLs are ignored by the interceptor (documented only in a comment).
- Editor state and input handling:
  - The new-recipe `start()` is not cancelled on destroy (a late navigate can fire).
  - `'1,000'` parses as 1 (undocumented).
  - Badge colours are hardcoded (use tokens in the design pass).
  - An existing (not brand-new) empty draft is also auto-deleted on Done.
  - An offline empty draft makes Done fail repeatedly (safe, but confusing).
  - The `requested` highlight persists until the next Publish.
  - Ctrl+Enter and "Next step" do nothing silently at the max limits.
  - The amount bounds mirror check needs a look.
  - The saved-clears-`actionError` effect can dismiss the Done `unsavedInput` warning.
  - `unsavedInput` is not cleared once the input is fixed, and its message should derive from `hasUnsavedInput()`.
  - No spec asserts that the rest of a recipe saves while a nameless row holds data.
- Editor accessibility: glyph-only buttons (`⋯`, portions −/+) lack accessible names; same-named rows share identical aria-labels.
- Photos:
  - A thumbnail load error keeps the preview until destroy.
  - Every step picker uses `capture`, so phones get no gallery choice.
  - With zero steps, the bar photo error shows on the cover slot.
  - An upload finishing during a conflict is orphaned silently on Load latest.
  - Stale `done` upload entries remain after a drop.
- Step reorder:
  - A repeated identical announcement is not re-announced.
  - No test for the reduced-motion CSS.
  - The single-step spec checks attributes only.
  - A hidden handle leaves a 44 px gap.
  - Enter/Space on the handle do nothing (keyboard reorder).
- Share and public page: the share-link e2e lacks side-by-side/stacked bounding-box assertions; the `resetLink` mock has the wrong return type.
- Unsaved-text backup:
  - A tab opening a recipe takes over another tab's entry until that tab writes again.
  - The restored notice lingers after a save.
  - There is no indicator during 5xx retries.
  - A failed takeover write keeps the source entry, so refused text can return after Load latest when storage is full.
  - Malformed backup entries are never pruned.
- Unsaved-safety e2e: `saved()` right after `goto` can match an idle "Saved ✓" (the reload assertion is the real proof); the conflict spec does not check device 1's text on the server before Load latest; there is no step-photo retry e2e (the retry spec uses the cover photo; step retry is covered by unit specs).
