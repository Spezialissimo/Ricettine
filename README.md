# Ricettine

A self-hosted recipe app for friends and family. One image, one Postgres, no required configuration.

## Quick start

```sh
docker compose up -d
```

This pulls the published image (`compose.yaml` needs no toolchain, and can be downloaded on its own). Open <http://localhost:8080> and create the admin account. That's it: the first visitor to a fresh install is guided through setup, and the admin can then invite other people with single-use links.

Data lives in two named volumes: `db-data` (Postgres) and `app-data` (uploaded images, mounted at `/data`).

## More documentation

Configuration, HTTPS, upgrading, backups and hosting on AWS: [docs/deployment.md](docs/deployment.md).

## Development and checks

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker). CI: `backend`.
- Frontend: `cd frontend && npm ci && npx ng test --watch=false`, build with `npx ng build`, dev server `npx ng serve` (proxies `/api` to `localhost:8080`). CI: `frontend`. Formatting: `npm run format:check` (CI runs it), fix with `npx prettier --write .`.
- Browser e2e: `scripts/e2e.sh` (Playwright, mobile and desktop viewports, against the built image). CI: `e2e`.
- Image + stack smoke test: `scripts/smoke.sh` (builds the image, starts compose, checks health and the SPA, then tears everything down with `-v`). CI: `smoke` and `smoke-arm64`.
- Regenerating screenshots: `scripts/screenshots.sh` (builds the image, starts the demo stack as project `ricettine-shots`, takes the nine README/docs images with `e2e/screenshots.config.ts` into `docs/images/`, compresses any over 600 KB with pngquant in Docker, tears down with `-v`). Manual, not in CI.
- Lint: `scripts/infra-check.sh` (workflows, shell scripts, Caddyfiles, Terraform with mock providers, and `scripts/docs-check.sh`: every Mermaid block in `README.md` and `docs/*.md` renders and every relative link resolves; tools run in Docker). CI: `infra`.
- Backup drill: `scripts/backup-restore-check.sh` (backup, wipe, restore, failed restore). CI: `infra`.
- HTTPS smoke test: `scripts/https-smoke.sh` (needs ports 80 and 443 free; checks both Caddy overlays). Manual.
- Multi-arch check: `scripts/multiarch-check.sh` (builds amd64 + arm64, smoke-tests both; amd64 runs under QEMU on an arm64 host). Manual.
- AWS deployment check: `scripts/aws-verify.sh <domain>` (read-only, needs the AWS CLI and credentials). Manual.

CI (`.github/workflows/ci.yml`) runs the ones marked with a job on every pull request and on pushes to `main`.
