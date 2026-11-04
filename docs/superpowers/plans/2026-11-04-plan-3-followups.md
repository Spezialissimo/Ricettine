# Plan 3 follow-ups (carry into later plans)

Collected from the per-task and whole-PR reviews of Plan 3 (cookbooks). Nothing here blocks Plan 3. Items listed under "Out of scope" in the Plan 3 plan are not repeated. The plan-2 follow-ups that Plan 3 did not close stay in `2026-11-04-plan-2-followups.md`.

## Plan 4 (reading/feed/profile)
- Public cookbooks go on the owner's profile page (spec §6.2); `GET /api/cookbooks/mine` has the data shape to start from.
- The recipe page opened through a cookbook makes an extra `GET /api/c/{token}` only to label the "Back to {cookbook}" link. Pass the name through router state, or include it in the response.
- The invite expiry date uses Angular's default locale (`date: 'medium'`), not the Transloco language. Settle a date-format convention with the Italian translation.

## Before a native Android client
- The member cookbook page derives the cookbook token from `shareUrl`'s last path segment. A native client would have to do the same; consider a `shareToken` field.
- `RecipeRef` lives in `cookbook.CookbookDtos` and is used by `recipe.RecipeService.resolveAddable`, which creates a recipe↔cookbook package cycle. Move it to `recipe` (or `common`).
- `{recipeId, shareToken: ""}` is accepted as id-only. Treat any non-null `shareToken` as set.
- Creating a cookbook is not idempotent (same as recipes; see the plan-2 idempotency-key item).

## Plan 5 (hosting & CI)
- `X-Robots-Tag: noindex` on `/c/**` as well as `/r/**`.
- Members' cookbook covers are served `private, max-age=3600`, so a removed co-author can keep a cached cover for up to an hour.

## Tests to add (any time)
- Co-author invites:
  - A PASSWORD_RESET or INSTANCE_INVITE token → 404 on `/api/cookbook-invites/{t}` and `/accept`; a cookbook invite → 404 on `/api/invites/{t}`.
  - Revoking through another cookbook's id → 404.
  - An anonymous accept → 401.
  - `removeRecipes=true` leaves the person's entries in other cookbooks alone.
- A concurrency test for the 500-entry cap (two adds at 499).
- Add an own draft by its share token → 404.
- `Cache-Control: no-store` on a `/api/c/**` 404.
- The row-lock test infers blocking from a 1 s timeout and covers only `resetShareLink`. Assert the wait in `pg_locks` and cover the other write paths.
- Account deletion: assert that another owner's outstanding invite survives (the current IT can't tell the `created_by` cascade from the `cookbook_id` cascade); `GET` a cookbook with a null `addedBy` entry after a real deletion.
- `@QuietSqlErrors` couples to the Logback API, and no test shows that an unrelated SQL error still logs.
- Frontend:
  - `ParamReuseStrategy` with a different-config case.
  - Cookbook view error and empty states.
  - Escape on the reset-link dialog.
  - `cookbook.page.spec` lacks an `invites` mock (noisy rejected load).
  - The coauthors e2e asserts `'invalid'` loosely.

## Small cleanups (any time)
- Backend:
  - In `CookbookService.acceptInvite`, the managed `OneTimeToken` from `findActive` could be flushed over the JDBC claim if someone later edits it. Use a projection.
  - The `cookbookId` re-check after the claim is dead code.
  - The malformed-UUID try/catch is duplicated in `CookbookInviteController` and `CookbookMemberController`.
  - `entryDto` does an extra `find()` per add.
  - Rename `RecipeService.publicView`'s `s` parameter to `photoQuery`.
  - `CookbookMediaAccessPolicy` loads the cookbook on every image hit.
  - Fully qualified names in `CookbookIT`, `CookbookApiIT`, and on `CookbookCoverController`'s `@RequestMapping`.
  - The `CookbookCoverIT` comment "member DTOs carry no token" is true only for `cover`.
  - The member view builds `?c=` thumbs for non-published rows (unreachable today: recipes cannot be unpublished).
- Frontend:
  - The cookbook page load error has no Retry.
  - The accept page replaces the preview with an error on a transient failure (no retry).
  - `leave()` does nothing when `me()` is null.
  - In the inline create of the Add dialog, cancelling after a failed add leaves the new cookbook out of the rows.
  - The share-panel "Add to cookbook" button reuses the `reset` class.
  - The account-form template indentation.
  - The login `attempted` flag is never reset.
  - Backend field codes other than `required` / `too_long` / `invalid` fall back to `errors.validation_failed`.
  - Hardcoded colours in the cookbook styles (design pass).
  - 44 px on dialog radios is unverified.
