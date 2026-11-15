# Plan 7 feedback (owner walkthrough)

Collected page by page while the owner walks through the running app (local stack `ricettine-plan7`, both layouts).
Plan 7 is written from this list once the walkthrough is done. Items marked *default* were proposed and not objected
to; the owner may still revisit them.

## Shell / top bar

- The bar is taller (about 64 px). Plain text links on the left; the filled "+ New recipe" pill (44 px) sits on the
  right, just before the account control, not among the links.
- Nav items: **Discover** (was Home, the public feed at `/`) and **My kitchen** (replaces My recipes and Cookbooks).
- Settings and Admin leave the bar. The user's name with avatar opens an account menu: View profile, Settings,
  Admin (admins only), Log out. A failed logout shows its error and Retry inside the menu, not under the bar.
- Admin becomes part of Settings, not its own top-level area. Round 2 (owner: the admin page was confusing, two
  levels of tabs with a heading between them): Settings has one navigation in two groups, **Account** (Profile,
  Password, Delete account) and **Administration** (Invites, Users; admins only). Sidebar on desktop, chips above
  the page on the phone. Invites and Users have their own h1 and a one-line explanation; Create invite is a
  normal-size button.
- Round 3 (owner): a line separates the Settings menu from the page: vertical between sidebar and page on
  desktop, horizontal under the chips on the phone.
- Round 3 (owner): the group titles (Account, Administration) looked like links. They are now dark, bold,
  uppercase with wide tracking, and on desktop have a rule under them; the links stay regular weight.
- Round 2: the account menu's arrow is a bigger chevron (20 px) that flips when the menu is open.
- Phone: top bar has the logo and the account menu; the bottom bar has three items: Discover, a larger round "+"
  in the middle (new recipe), My kitchen.
- "+ New" is for recipes only (owner confirmed); new cookbooks are created from My kitchen.

## My kitchen (new page, replaces `/recipes` and `/cookbooks`)

- YouTube-style tabs: **Overview**, **Recipes**, **Cookbooks**. Each tab is clickable.
- Overview shows a few of my recipes and a few of my cookbooks, each section with a "Show more" that switches to
  the matching tab.
- *Default:* tabs are routes (`/kitchen`, `/kitchen/recipes`, `/kitchen/cookbooks`) so links and Back work; the old
  `/recipes` and `/cookbooks` redirect there. Cookbook and editor URLs stay as they are.
- *Default:* Overview shows the 4 most recently edited recipes (drafts included, marked) and 4 cookbooks (one row on
  a wide desktop); "Show more" appears when a section is not empty. The Cookbooks tab includes cookbooks shared with
  me as co-author, marked Co-author.
- Round 2 (owner): all create buttons look the same (one filled accent `.btn-primary`), and an empty list always
  shows its message first and the button below ("Create your first recipe" / "Create your first cookbook"), on
  the Overview and on both tabs. Overview section headers hold only the title and "Show more". With cookbooks,
  "+ New cookbook" sits above the list on the Cookbooks tab.
- New cookbook lives on the Overview (empty state) and the Cookbooks tab. There is no extra New recipe
  button in My kitchen: the shell's "+ New recipe" is always there (the empty state still offers one).

## Status

- Shell, account menu, My kitchen and Settings tabs: implemented on `feat/p7-shell-kitchen` (frontend only; the
  existing `/api/recipes/mine` and `/api/cookbooks/mine` already return newest-first and include co-authored
  cookbooks). Old `/recipes`, `/cookbooks` and `/admin/*` URLs redirect.

## Carried over from the code audit (Plan 7 handover)

See `docs/superpowers/audits/2026-11-07-code-audit.md` (around lines 1090–1156); folded in when the plan is written.

## Palette (owner: "I don't love the general palette")

- Explored nine rounds of previews (static HTML, contrast-checked). The old terracotta failed WCAG AA for white on
  buttons and terracotta text on white (4.4:1), and its red was too close to the error red.
- Chosen: **V1w-d "pistachio"**. One green (`#477035`) for buttons and the top bar; the top bar text is white and
  the "+ New recipe" pill is white with green text; flour-white page; **no green text** anywhere (headings and links
  are dark; the current tab/section is marked with a green line); red only for errors and destructive actions;
  Draft badge neutral grey, Public badge a soft green tint with dark text.
- Every colour is a token in `styles/_tokens.scss` and reaches components as a CSS variable (`var(--name)`); no
  hardcoded colours remain in components. The component-style budget warning went from 4 kB to 6 kB (variable names
  are longer than hex codes; the error limit stays 8 kB).

## Dark mode (owner request)

- Chosen: **Dark 2**: dark page and cards, light text, the same pistachio buttons, a deeper green top bar
  (`#24361c`) with a light green-grey pill, light red for error text; filled destructive buttons keep the dark red.
- *Default:* follows the device (`prefers-color-scheme`), plus Settings > Appearance: System / Light / Dark, kept per
  browser in localStorage (a convenience; unreadable storage falls back to System). Applied in `main.ts` before
  Angular starts, so a chosen theme is there on first paint (no inline script: the CSP forbids it).

## Recipe editor

- Owner: the Share section on a draft ("Publish to get a share link", "Publish the recipe to add it to a cookbook.")
  is useless. A draft now shows no Share section at all; it appears once the recipe is published (link, Reset
  link, Add to cookbook). The two hint strings are removed from i18n.
- Owner: make it possible to drag and drop pictures. The cover and each step already took a dropped photo, but
  nothing said so, and a drop next to a target opened the image in the tab (leaving the editor). Now: while a
  photo is dragged over the page, the cover and every step get a dashed outline and a "Drop photo here" label; a
  drop elsewhere is refused (no navigation) and the editor says "Drop the photo on the cover or on a step."; an
  empty cover says "or drag a photo here" on devices with a mouse or trackpad.
- Owner: while creating or editing a recipe, the "+ New recipe" action is hidden, and on the phone the shell's
  bottom navigation is hidden altogether (the editor's own bottom bar moves to the screen edge). The editor
  routes carry `data: { editor: true }`.
- Owner: drag and drop "doesn't work at all". A real browser-level file drag (CDP `Input.dispatchDragEvent`, as
  from Finder) did work in Chromium, so the failing cases were drops the code ignored silently: files reported only
  in `items` (Safari, the macOS Photos app), drops with no readable file, and images dragged out of a web page
  (a link, no file). Now files are read from `files` or `items`, and every unusable drop says why. Covered by a
  real-drag e2e test (desktop).
- Owner: paste images. Pasting an image while writing a step sets that step's photo; anywhere else it sets the
  cover. Text pastes and pastes inside dialogs are untouched. The cover hint reads "or drag or paste a photo here".
- Owner: images dragged out of a web page must work. The browser hands over the image's address, not the file,
  and cannot download it itself (CORS, and our CSP). New `POST /api/recipes/{id}/photos/from-url {url}`: the
  server downloads the image (`media/RemoteImageFetcher`) and processes it like an upload, under the same owner
  check, upload rate limit and photo cap. SSRF guards: http/https on default ports only, no user info; every
  resolved address must be public (`PublicAddresses`: loopback, private, link-local/metadata, CGNAT, ULA,
  multicast, reserved, documentation, and IPv6 forms embedding IPv4), checked inside the HTTP client's DNS
  resolver so the connection uses exactly the checked addresses (no DNS rebinding), and again on each of at most
  3 redirects; no proxy, cookies or credentials; 5 s connect, 10 s read, 20 s total; 200 + `image/*` only;
  15 MB hard cap; a refused response is cancelled, not drained. `ricettine.remote-images.allow-private-addresses`
  (test-only, set in the e2e overlay) lifts the address and port checks.
- The editor takes the `<img>` from the dragged page markup (a linked image's `text/uri-list` is the page, not the
  image), reads embedded `data:` images in the browser without a request, and sends web addresses to the server.
  Over a step's text box an image becomes the photo, while a bare link is still typed in as text and a plain text
  selection is left to the browser. A failed download offers Retry with the same address.
- Consequence to note: the server now makes outbound requests on a user's behalf (the remote site sees the
  server's IP). Invite-only instance; the request is authenticated and rate limited.
- Owner (phone editor): Notes now sit above Steps, so the step list comes last, next to its bottom bar. The bar's
  main button reads "+ Add step" while the recipe has no steps and "+ Next step" after. (Desktop keeps its two
  columns: notes left, steps right.)
- Owner (editor, round 2):
  - Prep time and Cook time are two separate sheets (no tabs), each titled for its time.
  - Source is a plain labelled text field, not a pill (a long link wrapped badly in a pill).
  - Photos: Replace and Remove are icon buttons on the image, shown on hover/keyboard focus where there is a
    pointer and always on touch screens; while a photo is dragged over the page the image shows "Drop to
    replace". A step without a photo has a camera icon button; the empty cover keeps "Add cover photo".
  - Each step is a bordered card. Delete step is a trash icon under the move handle, named "Delete step N",
    and asks for confirmation (the shared confirm dialog now interpolates its title too). On a published
    recipe the last step's delete shows dimmed, next to the "needs at least one" hint.
  - Phone: the bottom bar holds Preview and Publish (Publish leaves the header); "Add step" is inside the Steps
    section on both layouts. The bar's Photo button is gone (each step has its own camera button).
  - Preview (eye icon next to Publish on desktop, in the bar on the phone) saves like Done, then opens
    `/recipes/:id/preview`: the reader's recipe page in a preview mode (banner, "Back to editor", no reader
    actions), loaded from the owner API, so drafts can be previewed.
  - General: prefer icons to text buttons. A small inline-SVG icon set (`shared/icon.component.ts`) and a
    44 px `.icon-btn`; every icon button has an aria-label and a matching tooltip.
- Owner (round 3):
  - Recipe page: the source is a plain "Source: site ↗" line, not a pill; a web link shows its host name only
    and links to the full address (title shows it in full).
  - Preview: "Back to editor" moved from the top bar into the preview banner, which is sticky under the top
    bar (the sticky ingredients column on desktop starts below both).
  - Photo overlay: the whole photo darkens and Replace / Remove sit centred, in the app's white icon-button
    style (Remove red). Hover or keyboard focus shows them; on touch screens a tap on the photo toggles them.
  - Delete step: the step card has a header row: move handle, number, then the trash icon right after the
    number (owner placed it there), text and photo below at full width.

## Recipe page (reader view and preview)

- Owner: empty steps must not count. Steps with neither text nor a photo are left out of the recipe page and the
  numbering has no gaps. (Read as the recipe page; the screenshot was the editor's step header.)
- Owner: "Prezzemolo , tritato" had a space before the comma. The comma is now part of the name text.
- Owner layout. Desktop: the title across the top, then a sticky (keyboard-scrollable) side column with the chips,
  source, author and ingredients, beside the main column with the photo, then the steps and notes. Phone: title,
  chips, source, author, then the photo, the ingredients and the steps (CSS order on one column).
- Both: each step is a bordered card, as in the editor.
- Owner sketch (desktop): a header card: title top-left, actions top-right (Share, Add to cookbook, Edit; Keep
  screen on where supported), chips / source / author on the left, the photo on the right. Below: the
  ingredients card (sticky) beside the steps. Phone: title, details, author, actions, photo, ingredients, steps.
- Owner: Share and Reset link leave the editor. The recipe page has a Share button for every reader (a sheet
  with the link, Copy and Share); the author also gets Reset link there (confirmed; the page then moves to the
  new link). Through a cookbook link, Share shares that cookbook link and offers no reset. In the preview,
  Share appears once the recipe is published. The editor's panel keeps only Add to cookbook.
- Process (owner): during iteration, tests are written and run only after the owner approves the result.
  Pending test updates: recipe-view.page.spec (layout, share sheet, reset), share-panel.component.spec (now Add
  to cookbook only), share-link.spec (share/reset moved to the recipe page; sticky column), recipe-view.spec
  (new layout).
- Owner (round 2 on the recipe page):
  - Desktop: the details column is only as wide as its content (at most 40%); the photo fills the rest (no gap),
    cropped to 3:2, so the header card grows taller instead.
  - "Ingredients" is a section title like "Steps", above its card; the selector reads "Serves N − +" (joined
    buttons), Reset after a change.
  - Phone (owner sketch): the photo with the title over its bottom edge (dark fade) and a ⋯ menu in its corner
    (Add to cookbook, Edit, Share); then chips, source, author, Keep screen on; then ingredients and steps.
    Without a photo: the title and the ⋯ button on one line. Desktop keeps the visible buttons.
  - Keep screen on moved from the action buttons to the details, after the author (both layouts).
- Owner: the recipe page's top bar differed from the app's (shared pages sit outside the shell so anonymous
  readers can open them, and kept their own minimal bar). The shell's top bar and phone bottom bar are now shared
  components (`shell/top-bar`, `shell/bottom-nav`) used by the shell and by the recipe and cookbook link pages:
  signed in, the same bar (Discover, My kitchen, + New recipe, account menu) and the phone bottom bar; signed
  out, the same green bar with the logo and Log in.
- Owner (phone): the ingredients card is full width again; the title and all the details (prep, cook, source,
  author) sit over the photo's bottom edge on a dark fade (the photo is taller, 3:4, to fit them); Keep screen on
  sits below the photo. Desktop unchanged (details back to normal colours in the card).
- Pending test updates (in addition to the earlier list): shell.component.spec (bars moved into components),
  recipe-view / cookbook-view specs (shared bar), recipes.spec (shell layout checks).
- Fix (owner): the on-photo colours had been put on the shared title / chip classes and leaked into the desktop
  card (white on white). All on-photo styles now live in a phone-only media query. Phone photo: edge to edge
  across the screen, 4:3 (it was a tall 3:4).
- Owner (phone): no bottom bar any more. A ☰ menu sits before the logo and opens a panel from the left
  (Discover, My kitchen, New recipe; closes on Escape, a tap outside or navigation; focus moves into it and back
  to ☰)." New recipe is only in the ☰ panel on the phone (owner: no separate "+"). Applies to the app and
  the shared recipe / cookbook pages. The editor keeps its own Preview / Publish bar. `bottom-nav` removed.
- Pending test updates (add): recipes.spec / shell spec (no bottom nav; ☰ panel), e2e that used the
  "Sections" bottom navigation (recipe-photos "no bottom navigation" test, kitchen.spec, restart.spec).
- Owner: the ☰ panel shows the Ricettine logo (green text on the white panel, links to Discover) beside its
  close button. The servings selector has no Reset. Ingredient group titles are bigger (1.15rem, bold, a thin
  rule under them) so they stand apart from the ingredients.
- Tried a line under the servings selector; owner did not like it, reverted.
- Owner asked for a better servings control: one pill "− N servings +" beside the Ingredients title (the card holds only ingredients); while scaled away from the written number the pill gets a soft green fill and green border (no green text).
  Then (owner): the pill moved back inside the ingredients card, at the top, centred horizontally.
- Owner: on the phone, Keep screen on is a checkable item in the ⋯ menu (with Add to cookbook, Edit, Share);
  desktop keeps the checkbox in the card. The wake-lock logic moved into a `ScreenWakeLock` service provided by
  the recipe page, so both controls share one state. Pending test update: keep-screen-on.component.spec (now
  needs the service provided).
- Owner: the light background had a yellow tint; the light neutrals now have a faint green tint (bg #f6f8f5, border #e1e6df, subtle #eef2ec, placeholders and Draft badge to match); text contrast unchanged (ink 15.2:1, muted 5.9:1 on bg).
- Owner (Settings): the avatar's Choose photo (a <label>) and Remove photo are aligned (the label lost the form-label margin); the selected settings item is a light green fill with dark text (phone chips and desktop sidebar), like the changed servings pill.
- Owner (Settings): Choose photo (a <label>) and Remove photo are aligned; the selected settings item is a light green fill with dark text (phone chips and desktop sidebar), like the changed servings pill.
- Owner: My kitchen recipe cards opened the editor. They now open the recipe as readers see it, at
  `/recipes/:id/view` (owner API, works for drafts, no preview banner): Edit is on the page, Share and Add to
  cookbook once published.
- Owner: the editor's "← Done" was confusing. It is gone; a "Save" button sits at the top right: it saves
  everything, then opens the recipe (an untouched new draft is discarded and leads back to My kitchen).
  Autosave and the leave guard are unchanged. Pending test updates: recipe-editor / editor e2e and helpers that
  click "Done" (leaveUntouchedDraft, many specs), My kitchen card href, recipe-cards spec.
- Owner: the editor opens only from the recipe page's Edit (and "+ New recipe", and the preview's Back to
  editor). Profile: own drafts open `/recipes/:id/view`. Cookbook page: the per-entry Edit button is gone; own
  entries in a cookbook without a link open their recipe page. Recipe page chips: space between emoji and text.
  Pending test updates: profile.spec (draft opens the view), cookbook.page.spec / cookbooks e2e (no Edit button).
- Owner: a cookbook opens in a view, like a recipe. `/cookbooks/:id`: a header card (name, owner, badges,
  description; Share and Edit; the cover) and its recipes. Share (everyone) uses the shared share sheet
  (generalised from the recipe one), with Reset link for the owner. Edit opens `/cookbooks/:id/edit`: name and
  visibility, cover and Delete (owner), members, removing recipes; "Save" returns to the view. The old in-page
  share panel (`cookbook-share-panel`) is removed. Pending test updates: cookbook.page.spec (view vs edit),
  cookbooks / coauthors / cookbook-link / account-deletion e2e (edit route, share sheet), the removed panel's spec.
- Owner: the cookbook edit page edits name, description and visibility in place (no dialog); Save validates (name required, limits as on the server), stores what changed and returns to the view. Co-authors see the name only. The edit page title reads "Edit cookbook".
- Owner: the cookbook edit page's cover is shown at the view's 3:2 crop (max 560 px wide) instead of a 260 px-high strip. The cookbook view lists its recipes as bigger cards (a 4:3 photo on top, title, author), 1 / 2 / 3 per row by width; the photo is the 480 px recipe thumbnail.
- Owner: new cookbook view. A banner like a book cover: the cover photo (4:3 phone, 21:8 desktop) with the name,
  a facts line ("12 recipes · by Ann and Bob · Private", names joined with Intl.ListFormat) and Share / Edit
  over its bottom edge on a dark fade; without a cover, the same row in a plain card. Then the description
  (max 65ch) and the recipe cards. The Owner / Visibility badges are gone from the view (the facts line says it).

## Later (owner: "add it to the plan so I can do it later")

- **Cookbook collage cover.** A cookbook without a cover shows a collage of its recipes' photos instead of the
  plain header card: 4+ photos as a 2×2 grid, 3 as one large and two small, 1–2 adapted, none the striped
  placeholder. Pure layout, nothing generated or stored, so it follows the recipes as they change.
  - Cookbook view: no backend work (the page already has every entry's photo).
  - My kitchen cookbook cards: the summary carries only the cookbook's own cover, so `GET /api/cookbooks/mine`
    must also return the first few (e.g. 4) entry thumbnails (`CookbookSummary.collageThumbUrls`), in
    entry order, respecting the same media access rules; backend change + integration test, then the card
    uses the same collage component.
- Owner: the recipe page's main photo is framed like the cookbook banner: on the phone inside the page margins, rounded, with a thin border (no longer edge to edge / flush with the top bar); on desktop the photo in the card gets the same border.
- Owner: "there shouldn't be 2 different endpoints for the same content". One address per content:
  - Cookbook: the one view is its share link `/c/:token`, for readers, members and the owner (banner, description,
    recipe cards; Share for everyone with Reset link for the owner, Edit for members). `/cookbooks/:id` forwards
    there (fallback view only for a cookbook without a share link); `/cookbooks/:id/edit` is the edit page.
    The banner and the card grid are shared components (`cookbook-hero`, `cookbook-recipe-cards`). The
    visibility is no longer in the facts line on the view (the share-link API does not return it).
  - Recipe: `/recipes/:id/view` is only for drafts (no share link yet); a published recipe forwards to `/r/:token`.
  - Kept on purpose: `/c/:token/r/:recipeId` (a recipe opened through a cookbook): readers who only have the
    cookbook link get the recipe through it, so it cannot become `/r/:token` without exposing private links.
  - The recipe page's "Back to the cookbook" is removed.
- Owner: a saved but unpublished recipe said nothing on its page. The draft view now has a sticky banner "Draft: only you can see this recipe." with Publish (on success the page moves to the share link; an incomplete recipe gets a message pointing to Edit).
