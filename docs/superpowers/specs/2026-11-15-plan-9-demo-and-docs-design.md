# Plan 9: public demo and portfolio documentation (design)

## Why

Ricettine exists to show recruiters and the engineers they forward it to how the owner builds software. Today they can do neither of the two things that would convince them. They can't try the app, because sign-up is invite-only. They also can't quickly see how it is built, because the README is an operator manual. This plan adds a public, self-resetting demo at `demo.ricettine.food`, and documentation aimed at those readers.

Success: a recruiter goes from the README or CV to `ricettine.food`, clicks "Try the demo", and is browsing a full-looking Italian recipe app within seconds. An engineer finds architecture, decisions, quality strategy, deployment and an honest account of the AI-assisted workflow, each with diagrams, within two clicks of the README.

## Goals

1. **A demo with no friction.** `demo.ricettine.food` signs visitors in automatically and lands them on the home feed.
2. **Strict isolation.** Demo visitors never see real data, and real users never see demo data.
3. **Nothing to moderate.** Demo visitors cannot persist anything.
4. **Documentation that sells the engineering.** It ships with screenshots that are generated, not hand-made.

## Non-goals and anti-goals

- No per-visitor sandbox accounts and no writable demo. A writable demo was considered and rejected because of abuse and moderation risk.
- No second EC2 instance or JVM. The owner chose to keep the AWS cost the same.
- No visual redesign. Screenshots show the app as it is.
- **Anti-goal:** any path through which a demo request reads or writes the main database, or the reverse. A bug that leaks real recipes into the demo is worse than having no demo.
- **Anti-goal:** content the owner has no right to publish. GialloZafferano was rejected for this reason. Scraping any website is out.
- **Anti-goal:** documentation that oversells. The AI-workflow page includes what went wrong.

## Owner decisions

- **Demo approach:** read-only, with the recipe editor usable but not saving ("Demo mode: not saved").
- **Isolation:** a second database in the same Postgres, chosen by hostname on the server. The client never chooses the database.
- **Hostnames:** `demo.ricettine.food` goes straight to the home feed, signed in automatically. The `ricettine.food` login page gets a "Try the demo" button that links there.
- **Content:** Italian recipes from TheMealDB, taken through its official API and translated so the content is entirely Italian, with no English recipes. Most recipes belong to a seeded user `davide`, display name "Davide". The demo visitor's own account owns a few.
- **Documentation:** a README with screenshots linking to topic pages, with Mermaid diagrams. The AI-workflow page includes the messy parts.
- **Delivery:** four small PRs, in the order below.
- **Photos:** recipe and cookbook photos come from Unsplash or Pexels, not TheMealDB. On 2026-11-15 none of the 21 Italian TheMealDB meals had `strCreativeCommonsConfirmed` set, so the rights to their photos are unclear.
- **Editor:** demo visitors can also start a **new** recipe in the editor. It is a browser-only draft that is never sent to the server.
- **Avatars:**
  - Davide's avatar is the owner's own photo at `docs/superpowers/assets/plan-9/davide-avatar.png`. Crop it to a square around the face and move or derive it into the fixture.
  - The demo visitor's account has **no** avatar image and uses the app's initials fallback.
  - A stock photo was rejected because its licence was unknown.
- **AI-workflow page:** it describes the owner's private Claude memory and process notes in Claude's own words. It never quotes them, and it links only to material already committed in the repository.

## Part 1: database routing per host (PR 1)

**Behaviour**
- Each request belongs to a *site*, either `main` or `demo`. The site is decided once per request, from a value only trusted infrastructure can set. A request for any unknown host is `main`.
- `main` uses the existing `ricettine` database. `demo` uses `ricettine_demo` in the same Postgres server. The demo site is enabled only by configuration (for example `RICETTINE_DEMO_HOST`). Without it, the app behaves exactly as today with a single database, so other self-hosters are unaffected.
- Everything database-backed follows the site. That covers JPA repositories, Spring Session JDBC (sessions and cookies are per host already) and the rate-limit keys if they're stored. Flyway migrates both databases at startup, and startup fails if either migration fails.
- Background work has no request. `OrphanMediaCleanup` (the only `@Scheduled` job) runs once per database. Any `AfterTransaction` or after-commit work runs on the site of the transaction that scheduled it.
- **Media:** demo blobs live under a separate key prefix in the same bucket, or a separate directory for local storage. `PublicUrls` produces the demo host's base URL on the demo site.
- **Backups:** `deploy/backup.sh` and `restore.sh` cover only the main database. The demo database is disposable.

**Infrastructure.** The production path today is CloudFront → Caddy, with an origin secret header → app.
- Add `demo.ricettine.food` to the ACM certificate, a CloudFront alias or a second distribution, and Route 53 records.
- The site signal must reach the app without trusting the viewer. Examples: a CloudFront origin custom header set per distribution or alias, which Caddy passes through and strips from client input; or the viewer `Host` forwarded and matched by Caddy.
- The CloudFront media cache key must not let a response for one site be served on the other.
- `compose*.yaml` and `deploy/aws/start.sh` create `ricettine_demo` when it is missing.
- `deploy/Caddyfile` (self-hosted HTTPS) gets an optional demo site block.
- `infra-check.sh` and the Terraform tests cover the new resources.

**Tests**
- Integration tests prove that a request on the demo host reads and writes only the demo database, and the reverse. Use the same entity ids or usernames in both databases to show they are distinct.
- A spoofed client header cannot select the demo site, or the main site from the demo host.
- Sessions created on one site are not valid on the other.
- The cleanup job processes both databases.
- With the demo unconfigured, behaviour is unchanged: the existing tests pass untouched.

## Part 2: demo mode and content (PR 2)

**Demo site behaviour**
- **Auto sign-in:** a visitor with no session on the demo host is signed in as the demo user and sees the home feed. There is no login page there. The setup, sign-up, invite acceptance, password reset and admin routes are unavailable on the demo site.
- **Short sessions:** demo sessions expire after 1 day, not 30 (builder's call), and session creation is rate-limited per client IP, so crawlers can't fill the session table.
- **Read-only:** the backend refuses every state-changing request from the demo site with 403 and a stable error code, for example `demo_read_only`. The rule lives in one place, a filter or interceptor keyed on the site, not on per-controller checks. The one exception is anything the visitor needs to browse, such as a language preference if it is stored server-side. Logout is hidden.
- **The UI:**
  - A persistent banner, i18n in Italian and English, says it's a demo, that changes aren't saved, and links back to `ricettine.food`.
  - Write controls (create, delete, settings changes, uploads) are hidden or disabled.
  - The recipe editor opens and accepts input, both on existing recipes and on a new one. Saving or autosaving shows "Demo mode: not saved" and sends nothing.
  - **New recipes:** today "New recipe" first calls `POST /api/recipes` to get a server-assigned id (`frontend/src/app/recipes/recipe.api.ts`). On the demo site it opens a browser-only draft with no id instead. This doesn't break the "ids are assigned by the server" convention, because the draft is never persisted. The editor store, autosave and photo picker must work in that "no id" state.
  - **Photos in the editor:** a photo picked in the editor is previewed locally (an object URL) and never uploaded.
  - The draft is discarded when the visitor leaves the editor. Keeping it per tab is the builder's call.
- **On `ricettine.food`:** the login page shows "Prova la demo" / "Try the demo" linking to the demo host, but only when a demo host is configured. The frontend learns this from an existing or new public config endpoint.

**Content**
- **Source:** TheMealDB official API (`filter.php?a=Italian`, then `lookup.php`). Their terms allow copying and modifying API content with attribution, and forbid scraping the website.
- **Selection:**
  - Pick about 12 of the 21 Italian recipes.
  - Drop duplicates (two "Fettuccine Alfredo"), branded ones ("Pizza Express Margherita") and off-tone ones ("Pilchard puttanesca").
  - TheMealDB photos are **not** used.
- **Photos:**
  - Each chosen recipe gets one good-looking photo of that dish from Unsplash or Pexels. Both licences allow free use.
  - A committed manifest lists each photo's source page URL, photographer and licence. Cookbook covers come from the same sources and are listed in the same manifest.
  - Claude picks the photos during plan execution. The owner can swap any of them.
- **The import tool** is a script under `scripts/` that the owner runs rarely and the app never runs at startup.
  - It fetches recipe data from the TheMealDB API and downloads the photos listed in the manifest.
  - It writes a committed fixture: recipe JSON and downsized images, matching the app's own variant sizes.
  - It maps ingredients and measures onto the app's ingredient and unit model.
- **Translation:** Claude translates every title, ingredient, step and cookbook text into natural Italian during plan execution, and the owner skims the result. No English text remains in the content.
- **People:**
  - `davide` ("Davide") owns about 10 recipes and 2–3 cookbooks.
  - The demo visitor's account (for example "Ospite") owns 2 recipes and is a member of one of Davide's cookbooks, so sharing is visible.
  - The split shows feed, profiles and cookbooks working.
  - Davide's avatar is the owner's photo. Ospite has none.
- **Seeding:** on startup with the demo site enabled, the demo database is wiped and reseeded from the fixture, and the setup is marked complete. A restart always returns the demo to the same state. Seeding is idempotent and safe if two starts overlap. Seed through the domain services or repositories so the data is valid by construction, and put photos through the normal media path.
- **Credits:**
  - TheMealDB is credited as the recipe source in a visible spot in the app on the demo site (banner or footer), and in `CREDITS.md` at the repo root, with a link back.
  - `CREDITS.md` also lists each photo with its photographer, source page and licence.

**Tests**
- Integration tests: every mutating endpoint returns 403 `demo_read_only` on the demo site. Use one parameterized test over the mapped handlers, so a new endpoint is covered automatically. Also cover auto sign-in, blocked routes, the session timeout and seeding (counts, owners, idempotency).
- Playwright, in both `mobile` and `desktop`: visiting the demo host lands on the feed, signed in, with the banner. The editor accepts input and shows "not saved". Write controls are absent. The main login page shows the demo button.
- The e2e stack needs the demo host. Use a second hostname such as `demo.localhost` mapped in the test setup.

## Part 3: screenshot generator (PR 3)

- A Playwright script (`scripts/screenshots.sh` plus a spec outside the CI suites) starts the built image with the demo enabled, visits the demo site and writes PNGs to `docs/images/`.
- **Set:** desktop and mobile views of the feed, a recipe, the editor and a cookbook, in Italian. It also takes one English UI shot to show i18n.
- The PNGs are committed so the README renders on GitHub. Regenerating them is one command, documented in `docs/development.md`.
- An optional short GIF or video of the editor is the builder's call, if it is cheap with Playwright's video recording.

## Part 4: documentation (PR 4)

**README.md** (concise, the recruiter-facing entry):
- A one-line pitch.
- Badges: CI, container image.
- Links to the live site and the demo.
- Screenshots.
- A "what this project shows" list.
- A short tech list.
- A quick start.
- An index of the doc pages.

The current operator content (configuration, HTTPS, upgrading, backups) moves to the doc pages and stays accurate.

**Pages under `docs/`** (with Mermaid diagrams that render on GitHub):

| Page | Contents | Diagrams |
|---|---|---|
| `architecture.md` | Stack (Spring Boot 4 / Java 25, Angular 22, Postgres, Caddy, Docker), modules per feature, single-image design, host-routed demo database | container `flowchart`, `erDiagram` from the Flyway schema, `sequenceDiagram` for invite → sign-up → login and for the demo auto sign-in |
| `decisions.md` | ADR-style entries: single image vs services, server-assigned ids and client-agnostic API (future Android), no PWA, desktop-first, single EC2 vs ECS/RDS, host-routed demo database vs a second instance vs query filtering, read-only demo vs sandbox, TheMealDB content | none required |
| `quality.md` | Test pyramid and counts, Testcontainers, Playwright mobile and desktop, smoke/arm64/HTTPS/multi-arch/backup-restore drills, infra lint and Terraform tests, the Plan 6 code audit | CI pipeline `flowchart` matching `.github/workflows/ci.yml` |
| `deployment.md` | Merges and replaces `docs/deploy-aws.md`: Terraform, CloudFront → Caddy → app, S3, backups, alerts and budget, publishing the image, the demo site, the approximate monthly cost (stated as an estimate with its date) | AWS topology `flowchart` |
| `ai-workflow.md` | How it was built with Claude Code: CLAUDE.md, memory, skills (brainstorm → spec → plan → subagent execution → review → PR), the owner's role versus Claude's, numbers (commits, PRs, days, plans), and the messy parts (retracted approaches, the lean-process rules introduced after costly runs, CI outages, the audit's findings about AI-written code), with links to `docs/superpowers/` as raw evidence | workflow `flowchart` |
| `roadmap.md` | Plans 1–9 with their dates and outcomes, and what's next (native Android client and open follow-ups) | `gantt` |
| `development.md` | The current "Development and checks" content, plus regenerating screenshots and the demo fixture | none required |
| `security.md` | Invite-only auth, sessions, argon2, rate limits, the origin secret, demo isolation and read-only, secrets handling, backups | none required |

Plus `CREDITS.md`. **No `LICENSE` file:** the owner chose to keep the code all rights reserved for now, so there is no license badge, and the docs must not imply that the code may be reused.

**Facts must be checked.** Every number, command and claim is verified against the repository, `gh` and `git log` at the time of writing, not recalled from memory.

## Constraints

- These project conventions apply: small PRs, backend integration tests and Playwright specs passing in `mobile` and `desktop`, i18n for all UI text, 44 px touch targets, no edits to applied Flyway migrations, and green CI as the gate.
- PR 1 must not change behaviour for single-site deployments. PR 2 depends on PR 1, and PR 3 on PR 2. PR 4 can start any time, but its screenshots come from PR 3.
- The same EC2 instance (t4g.small) carries both sites. Watch app and Postgres memory, and keep the demo database's connection pool small.

## Builder's calls already made (owner may override)

- **Self-hosted demo:** support is minimal, for parity only: creating the database in compose and an optional block in `deploy/Caddyfile`. There is no HTTPS-smoke coverage for it, and the README doesn't present it as a feature for self-hosters.
- **Base branch:** Plan 9 branches from `main` after PR #47 (AWS deploy fixes) merges.
- **Going live is in scope for PRs 1–2.** The plan includes the Terraform apply and redeploy steps for the owner to run (`aws login --profile ricettine`), an `aws-verify.sh` check for the demo host, and a rollback note: remove the demo host config and alias, then redeploy.

## Left to the builder

- The routing mechanism, for example `AbstractRoutingDataSource` with a request-scoped site and a context holder carried into transactions and async work.
- How the site signal crosses CloudFront → Caddy → app.
- The exact demo session timeout and rate limit.
- The fixture format.
- Which 12 recipes, within the rules above.
- Diagram detail.
