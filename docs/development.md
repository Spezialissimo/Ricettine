# Development

How to build, test and check the project, and how to regenerate the generated assets (screenshots and demo content). Every script builds its own isolated stack and tears it down with `-v`. Locally Docker may run on Colima: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.

## Development and checks

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker). CI: `backend`.
- Frontend: `cd frontend && npm ci && npx ng test --watch=false`, build with `npx ng build`, dev server `npx ng serve` (proxies `/api` to `localhost:8080`). CI: `frontend`. Formatting: `npm run format:check` (CI runs it), fix with `npx prettier --write .`.
- Browser e2e: `scripts/e2e.sh` (Playwright, mobile and desktop viewports, against the built image). CI: `e2e`.
- Image + stack smoke test: `scripts/smoke.sh` (builds the image, starts compose, checks health and the SPA, then tears everything down with `-v`). CI: `smoke` and `smoke-arm64`.
- Lint: `scripts/infra-check.sh` (workflows, shell scripts, Caddyfiles, Terraform with mock providers, and `scripts/docs-check.sh`: every Mermaid block in `README.md` and `docs/*.md` renders and every relative link resolves; tools run in Docker). CI: `infra`.
- Backup drill: `scripts/backup-restore-check.sh` (backup, wipe, restore, failed restore). CI: `infra`.
- HTTPS smoke test: `scripts/https-smoke.sh` (needs ports 80 and 443 free; checks both Caddy overlays). Manual.
- Multi-arch check: `scripts/multiarch-check.sh` (builds amd64 + arm64, smoke-tests both; amd64 runs under QEMU on an arm64 host). Manual.
- AWS deployment check: `scripts/aws-verify.sh <domain>` (read-only, needs the AWS CLI and credentials). Manual.

CI (`.github/workflows/ci.yml`) runs the ones marked with a job on every pull request and on pushes to `main`. What each check proves is described in [quality.md](quality.md).

## Regenerating screenshots

The images in `docs/images/` are produced by `scripts/screenshots.sh`. It builds the image, starts the demo stack as compose project `ricettine-shots`, takes the eleven README and docs images with Playwright (`e2e/screenshots.config.ts`) into `docs/images/`, compresses any image over 600 KB with pngquant (run in Docker) and tears the stack down with `-v`. It fails if an image is missing, empty or still over 600 KB after compression. It is manual and not part of CI.

Environment overrides: `SHOTS_BASE_URL` (default `http://localhost:8080`), `SHOTS_TIMEOUT` (health wait in seconds, default 180) and `SHOTS_COMPOSE_PROJECT`.

## Refreshing demo content

The demo site is seeded at every start from `backend/src/main/resources/demo` (`recipes.json`, `photos.json`, `images/`, `avatars/`). `scripts/demo-content.sh` is a maintainer helper for that fixture. Run it by hand, rarely; it is not used in CI.

- `scripts/demo-content.sh fetch` saves the TheMealDB Italian meals (raw API output only) to `$TMPDIR/ricettine-demo/raw/`. They are the starting point for the translated and adapted recipe texts.
- `scripts/demo-content.sh photos [key...]` downloads the entries of `photos.json` (all of them, or only the given keys) to `backend/src/main/resources/demo/images/`. Width is 1600 unless the entry sets `width`; Wikimedia Commons entries use the `/thumb/` form at `width` (default 960), and `"width": 0` keeps the original file. The script fails if a file is over 600 KB.

Most recipe texts are based on TheMealDB meals read through its API (translated and adapted); one is adapted from a German Wikibooks recipe and two were written for the demo to match their photo series. Dish and cookbook photos come from Unsplash and Pexels, step photos from Wikimedia Commons. Each source, author and licence is listed in [CREDITS.md](../CREDITS.md).
