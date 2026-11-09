# Ricettine

Self-hosted recipe app: Spring Boot 4 (Java 25) backend + Angular 22 frontend, shipped as one Docker image with Postgres via `compose.yaml`. The backend serves the built SPA and `/api`.

## Layout
- `backend/` — Maven, package `com.ricettine.<feature>` (account, admin, auth, common, config, cookbook, feed, invite, media, profile, recipe, setup). Flyway migrations in `src/main/resources/db/migration` (`V<n>__name.sql`; never edit an applied one). Integration tests extend `IntegrationTest` (Testcontainers).
- `frontend/` — standalone Angular, vitest unit tests, Transloco i18n in `public/i18n` (all UI text goes through keys).
- `e2e/` — Playwright, projects `mobile`, `desktop`, `restart`, run against the built image.
- `scripts/` — `e2e.sh`, `smoke.sh`, `https-smoke.sh`, `multiarch-check.sh`, `backup-restore-check.sh` (each builds the image and tears its stack down with `-v`), `infra-check.sh` (lint, runs its tools in Docker), `aws-verify.sh` (read-only checks of a deployed AWS stack, needs AWS credentials).
- `deploy/`, `infra/` — backup/restore scripts and Caddyfile, plus `deploy/aws/` (start.sh, systemd units, mount scripts); Terraform for AWS. `compose*.yaml` overlays at the root.
- `docs/superpowers/` — spec, plans and follow-ups. Read on demand, not every session.

## Commands
- Backend/frontend tests, dev server and every check script with what it covers: README "Development and checks" (backend `./mvnw verify` needs Docker; frontend `npx ng test --watch=false` and `npx ng build`). Formatting: `cd frontend && npm run format:check`; fix with `npx prettier --write .`.
- Scripts you will run most: `scripts/e2e.sh` (Playwright, needs the built image) · `scripts/smoke.sh` · `scripts/infra-check.sh` (workflows, shell, Caddyfiles, Terraform with mock providers) · `scripts/backup-restore-check.sh` (backup, wipe, restore drill).
- `compose.yaml` is image-only (published image); scripts export `COMPOSE_FILE=compose.yaml:compose.build.yaml` to build locally
- Locally Docker runs on Colima: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`

CI (`.github/workflows/ci.yml`) runs backend, frontend, e2e, smoke, smoke-arm64 and infra (`infra-check.sh` plus the backup/restore drill) on every PR; `https-smoke.sh`, `multiarch-check.sh` and `aws-verify.sh` are manual, and `publish` on pushes to main and `v*` tags.

## Conventions
- Small PRs, one feature slice each. Every PR has backend integration tests plus Playwright specs that pass in both `mobile` and `desktop`. Automate checks instead of listing manual steps.
- Desktop-first, responsive (breakpoint 768 px). No offline/PWA machinery: a future mobile client would be native Android.
- APIs are client-agnostic JSON. Ids are assigned by the server, never by the client.
- Visual polish is deferred: keep UI functional and accessible (44 px touch targets, labels, i18n).
- Before starting a new plan, read `docs/superpowers/plans/2026-11-03-plan-1-followups.md`.
