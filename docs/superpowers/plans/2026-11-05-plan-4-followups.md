# Plan 4 follow-ups (carry into later plans)

These come from the per-task and whole-PR reviews of Plan 4 (recipe page, feed, profile). None of them blocks Plan 4. Items in the Plan 4 plan's "Out of scope" list are not repeated here. Open items in the plan-2 and plan-3 follow-up files outside their "Plan 4" sections are still open there.

## Before a native Android client
- `ProfileRecipe` sends `status`, `visibility` and `updatedAt` to visitors as well. The first two are constant for visitors; `updatedAt` shows when a public recipe was last edited. Consider a narrower visitor shape.
- Cursor pagination, `shareToken` fields and `user_not_found` are already client-agnostic. Keep it that way when the feed is replaced.

## Accessibility (design pass)
- The shell's display-name link has `aria-label="Your profile"`, which hides the visible name (WCAG 2.5.3 Label in Name). Keep the name as the accessible name and add "(your profile)" as visually hidden text, then update the shell spec and the e2e locator.
- The editor's visibility hint is not linked to its fieldset with `aria-describedby`.
- The 44 px target of the Keep screen on checkbox is not asserted (the checkbox is 24 px; the wrapping label provides the target).
- The phone bottom nav now has 4–5 text links. Check the 44 px targets at 360 px width with Admin shown.

## Recipe page
- `displayAmount`:
  - Scaled kg and l can show "0" (0.004 kg). Clamp to 0.01.
  - A tiny unscaled non-metric amount (0.005 tsp) shows "⅛". The ruling says unscaled amounts show exactly as entered.
- `KeepScreenOnComponent`: checking, unchecking and checking again while a `request()` is pending can resolve two sentinels and leak the first one. Track the in-flight request.
- Amounts read the language through `getActiveLang()`, so they won't re-render on a runtime language switch. This only matters once language switching exists.
- `AppDatePipe` handles `null` only; `undefined` would throw.

## Feed and profile
- Split `CookbookRepository.ownedSummaries` into a visitor query and a self query, as recipes already are, so the visitor path can't be widened by a flag.
- Add a string-level IT guard that the visitor profile JSON contains none of the private recipe, draft or private cookbook ids and tokens.
- If someone leaves `/u/x` before the response arrives, `PageTitle.set` can set the next page's title. The recipe and cookbook views have the same race. Guard with a destroyed flag.
- A not-found profile keeps the generic "Profile · Ricettine" title (shared with the settings profile page).
- Clicking Home while already on `/` doesn't refresh the feed.
- `?limit=` with an empty value returns 400; no test pins it.
- `authInterceptor` injects `Router` eagerly, so any HTTP call made during Router construction would reintroduce NG0200. The title strategy now avoids it by resolving Transloco lazily.

## Tests to add (any time)
- `FeedIT.publicDraftNeverListed` needs a positive control. `ProfileIT.selfSeesAllMarked` has a vacuous `contains("")`. No IT fetches the self-view thumbs.
- The feed's `loadingMore` re-entrancy guard has no unit test, and the feed's initial-load Retry has no guard.
- The console-clean e2e (`titles.spec.ts`) was never shown failing on its own: on the old code the title assertion fails first.
- Several Plan 4 specs were written together with the code, without a separate RED run.

## Small cleanups (any time)
- `FeedService`: the `published_at is not null` filter is redundant; there are fully qualified `ArrayList` and `DateTimeException` references.
- `AppTitleStrategy`: the lazy `i18n` getter has side effects; name it `ensureI18n()`.
- Profile cookbook cards reuse the `a.recipe` class.
- `user_not_found` is out of alphabetical order in `en.json` and `api-error.ts`.
- `app.routes.ts` has a long single-line `cookbooks/:id` entry.
