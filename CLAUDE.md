# Ricettine

Self-hosted recipe app: Spring Boot 4 (Java 25) backend + Angular 22 frontend, shipped as one Docker image with Postgres via `compose.yaml`. The backend serves the built SPA and `/api`.

## Layout
- `backend/` — Maven, package `com.ricettine.<feature>` (account, admin, auth, invite, media, recipe, setup, config, common). Flyway migrations in `src/main/resources/db/migration` (`V<n>__name.sql`; never edit an applied one). Integration tests extend `IntegrationTest` (Testcontainers).
- `frontend/` — standalone Angular, vitest unit tests, Transloco i18n in `public/i18n` (all UI text goes through keys).
- `e2e/` — Playwright, projects `mobile`, `desktop`, `restart`, run against the built image.
- `scripts/` — `e2e.sh`, `smoke.sh` (each builds the image and tears its stack down with `-v`).
- `docs/superpowers/` — spec, plans and follow-ups. Read on demand, not every session.

## Commands
- Backend tests: `cd backend && ./mvnw verify` (needs Docker)
- Frontend tests / build: `cd frontend && npx ng test --watch=false` / `npx ng build`
- Frontend dev: `cd frontend && npx ng serve` (proxies `/api` to `localhost:8080`)
- Browser e2e: `scripts/e2e.sh` · Smoke: `scripts/smoke.sh` · HTTPS (Caddy overlays): `scripts/https-smoke.sh` · Lint workflows, shell, Caddyfiles: `scripts/infra-check.sh` · Multi-arch: `scripts/multiarch-check.sh`
- `compose.yaml` is image-only (published image); scripts export `COMPOSE_FILE=compose.yaml:compose.build.yaml` to build locally
- Locally Docker runs on Colima: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`

CI (`.github/workflows/ci.yml`) runs backend, frontend, e2e, smoke and smoke-arm64 on every PR, and `publish` on pushes to main and `v*` tags.

## Conventions
- Small PRs, one feature slice each. Every PR has backend integration tests plus Playwright specs that pass in both `mobile` and `desktop`. Automate checks instead of listing manual steps.
- Desktop-first, responsive (breakpoint 768 px). No offline/PWA machinery: a future mobile client would be native Android.
- APIs are client-agnostic JSON. Ids are assigned by the server, never by the client.
- Visual polish is deferred: keep UI functional and accessible (44 px touch targets, labels, i18n).
- Before starting a new plan, read `docs/superpowers/plans/2026-11-03-plan-1-followups.md`.
