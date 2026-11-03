# Ricettine — Design (Proof of Concept)

Date: 2026-11-03
Status: Draft for approval

Notation: **[decided]** = the owner chose this. **[call]** = a designer's call made during brainstorming; acceptable to the owner unless they push back, and open to a builder's challenge with good reason.

## 1. Intent

A web app for the owner and their girlfriend to write down and keep the recipes they cook. Today recipes come from random places and mostly never get written down. The app should make capturing a recipe *while cooking, on a phone* easy enough that it actually happens.

Long-term (not now) this may become a platform sold to food influencers to host their recipes. That future must not drive features in this phase, but the design must not close the door on it: multi-user from day one, public recipes and cookbooks, user profiles, i18n-ready, self-hostable and cloud-hostable from the same artifact.

**This phase is a proof of concept.** The two of them will use it daily for a while to discover what's broken or missing. A "real release" (GDPR work, social login, calories, polish) comes later.

**Success:** they actually use it for their cooking for several weeks; adding a recipe mid-cook on a phone feels quick; sharing a recipe by link just works; the shared cookbook between their two accounts works as they expect.

**Anti-goals (failure even if it technically works):**
- An editor that is painful on a phone with messy hands (tiny targets, fiddly drag, losing typed text when the phone locks).
- Private (unlisted) recipes or cookbooks showing up in listings, drafts leaking, guessable links, or photo EXIF leaking location.
- A hosting setup that costs real money for two users, or self-hosting that needs more than one command.

## 2. Scope

### In scope for the PoC
- Accounts: email + password, display name, profile picture, username. Invite-only signup.
- Recipes with: title, cover photo (thumbnail), portions, structured ingredients with groups, numbered steps each with optional photo, source, prep time, cook time, notes.
- Drafts + publish.
- Recipe and cookbook visibility: public (listed) / private (unlisted, link-only). Everything published has a shareable link.
- Portion scaling on the recipe page.
- "Keep screen on" toggle on the recipe page (cooking mode).
- Cookbooks: unlimited personal lists of recipes, optionally co-authored, shareable read-only by link.
- Home feed: public recipes, newest first.
- Minimal profile page: list of the user's recipes.
- Single Docker image + Postgres via docker compose; hosted on AWS (lean).
- i18n-ready UI (English only shipped).

### Explicitly out of scope (later)
- Calorie estimation (but the ingredient data model must support it — see §4.3).
- Tags and filtering; search.
- Social login (Google etc.).
- Password reset by email; open-signup toggle; one-click self-host templates (Unraid, CasaOS, marketplace…).
- Unit conversion (cups ↔ grams). Scaling yes, conversion no.
- Full GDPR compliance work (consent, DPA, privacy policy, formal export). Cheap enablers are in scope (§8).
- Feed algorithm / personalization. Feed is deliberately trivial and isolated so it can be replaced **[decided]**.
- Link preview cards for source URLs **[call]**.
- Comments, likes, follows, monetization.

## 3. Users, accounts, instance

- **[decided]** Each person has their own account. Email + password login.
- **[decided]** Invite-only signup for now.
- **[call]** An instance has one or more **instance admins**. On first start of a fresh install, the first account created becomes the admin (via a one-time setup screen shown only when no users exist). Admins create invite links (single-use, with expiry, e.g. 7 days). A user registers via the invite link.
- **[call]** Without email configured, an admin can reset a user's password from an admin screen (generates a one-time reset link the admin passes on). No outgoing email is required to run the app.
- Profile: display name, username (unique, URL-safe, used in profile URLs), profile picture.
- **[decided]** Profile page shows the list of recipes the user wrote — nothing more for now. Visitors see only that user's *public* recipes **[decided]**, plus their public cookbooks **[call]**. The user themselves sees all of theirs (private and drafts marked).
- **[call]** Users can delete their account; this deletes their recipes, photos, and memberships. Cookbooks they own are deleted too (the confirmation names them). Recipes of theirs disappear from other people's cookbooks.

## 4. Recipes

### 4.1 Fields
| Field | Required to publish | Notes |
|---|---|---|
| Title | Yes | |
| Cover photo | No | Placeholder image shown when missing. May become required for public recipes in a later release. |
| Portions | Always present | Integer ≥ 1, **defaults to 1** **[decided]**. "How many the written amounts serve." |
| Ingredients | At least 1 | Structured, grouped — §4.3 |
| Steps | At least 1 | Ordered; text + optional single photo each **[decided]** |
| Prep time, cook time | No | Minutes |
| Source | No | Free text; if it is a URL, rendered as a link |
| Notes | No | Free text |
| Visibility | Always present | private / public |

### 4.2 Drafts and publishing — [decided]
- A recipe starts as a **draft**, visible only to its author. Drafts can be saved with any field empty.
- **Publish** validates the "required to publish" fields.
- After publishing, the recipe has its chosen visibility. **[call]** Edits to a published recipe are saved and visible immediately (no separate draft-of-a-published-recipe). Autosave applies to published recipes too.
- **[call]** A draft cannot be added to cookbooks and has no working share link until published.
- **[call] A published recipe can never become invalid.** The editor prevents removing the last ingredient or the last step of a published recipe, and shows the title as required. The server also rejects such a save (400) as a backstop. A published recipe is never silently turned back into a draft, and there is no versioning.
- **[call] Concurrent edits** (only the author edits, so this means the same author on two devices, or a stale offline replay): recipes carry a version number (optimistic locking). If a save is based on an outdated version, the server rejects it. The editor then shows "This recipe was changed by {name}" and keeps the user's unsaved text visible and copyable, never discarding it, alongside a reload action. No merging.
- **[call] Editor header:** "Done" closes the editor, since everything is already autosaved. A draft shows a **Publish** button, which runs the validation. A "Delete draft" action sits in an overflow menu. A brand-new draft left completely empty is discarded when the editor is closed. (The mockups' "Cancel/Save" labels are superseded by this.)

### 4.3 Ingredients — [decided: amount + unit + name]
- Each ingredient: `amount` (decimal, optional — "salt to taste"), `unit` (optional, from a fixed list), `name` (free text, required), optional short `note` ("finely chopped") **[call]**.
- Ingredients are organized in ordered **groups** with an optional group name ("For the ragù"). A recipe with no explicit groups has one unnamed group.
- **[call]** Units come from a fixed, extensible list (g, kg, ml, l, tsp, tbsp, cup, piece, pinch, clove, slice, can, …) stored as codes, displayed via i18n. Fixed codes make scaling and future calorie calculation tractable; free-text units would not.
- **Calories later:** the design must allow attaching an optional reference to a food database entry per ingredient (e.g. a nullable `food_id`) and unit-to-gram conversion data, without migrating existing data destructively. Nothing of this is built now.
- **Scaling:** on the recipe page a portions stepper multiplies all amounts by `chosen / portions`. Ingredients without amount are unchanged. **[call]** Display rounding: sensible fractions/decimals (e.g. 0.33 cup → "⅓ cup", 333.33 g → "335 g"); exact rules left to builder.

### 4.4 Steps
- Ordered list; each step has text and at most one photo **[decided]**.
- Reorder via a **drag handle** on each step **[decided]** (drag starts only from the handle so scrolling never moves steps). Must work on touch.

### 4.5 Visibility and links — [decided: "private" means unlisted]
"Private" works like an unlisted YouTube video: hidden from listings, open to anyone who has the link.
- **Every published recipe, public or private, is visible to anyone with its link**, including logged-out visitors.
- **Public:** additionally listed in the home feed and on the author's profile page.
- **Private (unlisted):** listed nowhere: not in the feed, not on the profile page (except to the author themselves). It can only be reached through its link, or through a cookbook that contains it.
- **[call]** Links use an unguessable random token (e.g. `/r/{token}`), never a sequential id, because "private" depends on the link being unguessable. Photo URLs must be unguessable too.
- **[call]** The author can **reset the share link**, which invalidates the old one. The token is therefore separate from the recipe's internal id, and photo URLs tied to the old link stop working (or are authorized per request).
- Switching a recipe between public and private has no side effects on cookbooks, so no confirmation is needed.

## 5. Recipe editor (mobile-first) — [decided, from mockups]

Mockups: `docs/superpowers/mockups/editor-mobile-v2.html`, `docs/superpowers/mockups/editor-chips.html` (v1 superseded).

- **One scrolling page:** cover photo → title → detail chips → visibility switch → ingredients (groups) → steps → notes.
- **Detail chips** for portions, prep time, cook time, source. Unfilled chips show as dashed placeholders ("+ Prep time"). Tapping opens a bottom sheet:
  - Portions: large − / + stepper.
  - Times: one-tap presets (5m, 10m, 15m, 30m, 45m, 1h, 1h30, 2h) plus custom h/min; prep and cook share a sheet with tabs.
  - Source: single text field.
- **Fixed bottom action bar** while editing: "📷 Photo" (opens the camera directly and attaches the photo to the current step) and "+ Next step" (adds a step and focuses it). Large touch targets.
- **Autosave** continuously (debounced), with a visible "Saved ✓" state. Typed text must survive the phone locking, the tab being backgrounded, or a flaky or missing connection **[decided]**. *Revised 2026-11-03 [decided]: photos are online-only with a visible retry on failure, and recipes can't be created offline; the web app is not the long-term mobile client (a native Android app would be), so heavy offline machinery is out of scope.* Unsaved edits and not-yet-uploaded photos are kept in the browser (e.g. IndexedDB) and retried automatically until the server confirms them. A step shows its photo immediately from the local copy, with a small "uploading…" or "waiting for connection" state. Publishing waits until pending uploads finish.
- Tap a step's text to edit; delete lives in the step's edit state.
- Works on desktop too, but phone is the primary design target.

## 6. Cookbooks — [decided]

### 6.1 Concept
A cookbook is **just a list of recipes**: e.g. "Desserts", "Recipes to try out". Every user can create as many as they want. A cookbook *references* recipes and doesn't own them; a recipe can be in any number of cookbooks. **[call]** Cookbook fields: name, optional description, optional cover photo, visibility.

### 6.2 Visibility and links
Same model as recipes:
- **Every cookbook can be shared by link.** Anyone with the link sees it **read-only**, including logged-out visitors.
- **Public:** additionally listed on its owner's profile page. **[call]** The home feed stays recipes-only.
- **Private (unlisted):** reachable only via the link, listed nowhere else (except to its owner and co-authors in their own "My cookbooks").
- Any cookbook, public or private, can contain both public and private recipes. A private recipe inside a cookbook is reachable by anyone with the cookbook's link; that's accepted under the unlisted model.
- **[call]** Cookbook links use an unguessable, resettable token, as recipes do.

### 6.3 Owner and co-authors
- The creator is the **owner**: manages co-authors, visibility, name/description/cover, can reset the link, can delete the cookbook.
- A cookbook can be **shared/co-authored**: the owner adds other users as **authors**, who can add and remove recipes just as the owner does. There's no "reader" role; read-only access is the link.
- **[call]** Any recipe the person can open (their own, any public recipe, any private recipe they have the link to) can be added. Drafts can't be added. Each cookbook entry records who added it.
- **[decided] Co-author invites:** the owner creates a co-author **invite URL** and sends it however they like.
  - A logged-in user opening it sees an **accept** window and becomes an author when they accept.
  - A logged-out user is asked to log in first, then sees the accept window.
  - A person without an account would register from the invite; **this case is ignored for now** (out of scope for the PoC).
  - **[call]** Invite links are single-use, expire (e.g. 7 days), and can be revoked by the owner. Authors can leave at any time.
- **[call]** One owner per cookbook in this phase. The owner can't leave; they can delete the cookbook instead. Ownership transfer is later.

### 6.4 Leaving or being removed — [decided]
- When an author leaves or is removed, **the recipes they added stay** by default. The leave/remove confirmation has a checkbox, "Also remove the recipes they added", to take them out.
- **[call]** Under the unlisted model there's no leak reason to treat their private recipes differently, so the checkbox covers all recipes they added, public and private.

### 6.5 Editing other people's recipes
**[decided]** Only a recipe's author can edit it. Being in a cookbook grants no rights over a recipe's content. A per-cookbook "co-authors can edit each other's recipes" setting was discussed and dropped for now; it may return later, so keep recipe permission checks in one place where a cookbook-based rule could be added.

## 7. Recipe page and feed

- **Recipe page:** cover, title, author, detail chips, ingredients with a portions stepper for scaling, numbered steps with photos, notes, source.
- **[decided] Cooking mode** = a "Keep screen on" toggle on the recipe page (Screen Wake Lock API; silently unavailable on browsers without it).
- **Home feed [decided]:** all public, published recipes, newest first, paginated. Keep it trivially simple and isolated behind its own endpoint/component so it can be replaced later.
- **[call]** Logged-in navigation also gives access to: my recipes (including drafts), my cookbooks, profile/settings, admin (for admins).

## 8. Privacy and GDPR groundwork

Full GDPR compliance is later **[decided]**, but these cheap enablers are in scope **[call]**:
- Strip EXIF metadata (especially GPS) from every uploaded image, server-side.
- Host the AWS deployment in an EU region.
- Account deletion removes the user's data and image files (not just soft-deletes rows).
- Keep user-owned data easy to locate per user (clean foreign keys to the user) so a data export can be added later.
- Passwords hashed with a modern algorithm (bcrypt/argon2).

## 9. Technical architecture

### 9.1 Stack
- **[decided]** Backend: Java + Spring (Spring Boot). Frontend: Angular.
- **[call]** Database: PostgreSQL. Schema migrations versioned and applied automatically at startup (Flyway or Liquibase).
- **[call]** Spring Boot serves the built Angular app and the REST API from **one container image**. One deployable artifact.
- **[call]** Image storage behind an interface with two implementations: local filesystem (default) and S3-compatible object storage (config switch). Images resized server-side to a few sizes (thumbnail, display) and EXIF-stripped on upload. Upload size limit (e.g. 15 MB raw) to accept modern phone photos.
- **[call]** Auth: session-based auth suited to a same-origin SPA (cookie, CSRF protection) — exact mechanism left to builder.
- **[decided]** i18n-ready: all UI strings externalized from day one, English only shipped; Italian next. Units and server-generated messages also go through i18n.
- No AWS-specific code in the application except the optional S3 storage adapter.

### 9.2 Self-hosting — [decided: one-command, zero required config]
- `docker compose up` with the app image + Postgres runs a working instance with **zero required configuration**: sensible defaults, local disk storage in a volume, first-run admin setup screen, no default passwords.
- Configuration via environment variables (DB connection, storage backend, base URL, etc.).
- Upgrading = pull new image + restart; migrations run automatically and must be safe.
- HTTPS: **[call]** documented with a reverse proxy example (e.g. Caddy) in the compose setup or docs; the app itself speaks HTTP behind a proxy.
- One-click platform templates are later.

### 9.3 Hosted deployment on AWS — [decided: lean]
- Owner wants AWS (partly for CV value) at minimal cost.
- One small EC2 instance (e.g. t4g.small, ARM — so the image must be built for arm64 as well as amd64) running the *same* docker compose setup, Postgres on the instance with an EBS volume.
- Photos in **S3**, served through **CloudFront** **[call]**. Photos must not be publicly guessable (signed URLs or app-proxied access — builder's choice, but the invariant holds).
- Domain/DNS via Route 53 **[call]**.
- Infrastructure as code (Terraform or AWS CDK — builder's choice). Target ≈ $5–15/month.
- **[call]** Nightly Postgres backup (pg_dump) to S3; EU region.
- Explicitly not: ECS/Fargate, RDS, load balancer (cost). The app must stay portable so moving to those later is deployment-only.

## 10. Quality expectations — [call]
- Automated tests for the backend domain rules, especially visibility and permission rules (§4.5, §6): private items never appear in listings, drafts are author-only, only owners and co-authors can change a cookbook. These are the costliest bugs.
- API-level tests for authorization (who can see/edit what).
- Frontend: tests for the editor's core flows; manual check on a real phone.
- CI building the multi-arch image.

## 11. Left to the builder
- Package structure, API shape, exact entity design (within the rules above).
- Auth mechanism details, rate limiting, session lifetime.
- UI component library and visual styling (mockups are wireframes, not visual design).
- Drag-and-drop library; image processing library; rounding rules for scaled amounts.
- Terraform vs CDK; CI provider.
- Pagination style for the feed.
