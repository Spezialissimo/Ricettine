# Ricettine

A self-hosted recipe app for friends and family. One image, one Postgres, no required configuration.

## Quick start

```sh
docker compose up -d
```

This pulls the published image (`compose.yaml` needs no toolchain, and can be downloaded on its own). Open <http://localhost:8080> and create the admin account. That's it: the first visitor to a fresh install is guided through setup, and the admin can then invite other people with single-use links.

Data lives in two named volumes: `db-data` (Postgres) and `app-data` (uploaded images, mounted at `/data`).

## Configuration

Everything is optional. Set variables in a `.env` file next to `compose.yaml` or in the `app` service's `environment`.

| Variable | Default | Description |
| --- | --- | --- |
| `RICETTINE_BASE_URL` | derived from the request | Public URL of the app, e.g. `https://recipes.example.com`. **Set this in production**: otherwise invite and password-reset links are built from the request `Host` header. |
| `RICETTINE_VERSION` | `latest` | Image tag to run, e.g. `1.2.0`. See Upgrading. |
| `POSTGRES_PASSWORD` | `ricettine` | Database password (used by both `db` and `app` in `compose.yaml`). Postgres is not published to the host. **Only applied when the `db-data` volume is first created**: changing it later does not change the existing database's password (change it inside Postgres with `ALTER USER ricettine PASSWORD '...'` and then update the variable). |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://db:5432/ricettine` | JDBC URL, if you use your own Postgres. |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | `ricettine` | Database credentials. |
| `RICETTINE_STORAGE_TYPE` | `local` | Image storage: `local` or `s3`. |
| `RICETTINE_STORAGE_LOCAL_PATH` | `/data/media` | Directory for `local` storage (inside the `app-data` volume). |
| `RICETTINE_STORAGE_S3_BUCKET` | - | Bucket name (required when type is `s3`). |
| `RICETTINE_STORAGE_S3_REGION` | SDK default | S3 region. |
| `RICETTINE_STORAGE_S3_ENDPOINT` | AWS | Custom endpoint for S3-compatible stores (MinIO, R2, ...). |
| `RICETTINE_STORAGE_S3_PATH_STYLE` | `false` | Use path-style addressing (needed by most S3-compatible stores). |
| `RICETTINE_STORAGE_S3_API_CALL_TIMEOUT` | `PT30S` | Overall time limit for one S3 call, retries included (ISO-8601 duration). |
| `RICETTINE_STORAGE_S3_API_CALL_ATTEMPT_TIMEOUT` | `PT10S` | Time limit for a single S3 attempt. |
| `RICETTINE_STORAGE_S3_CONNECTION_TIMEOUT` | `PT5S` | Time limit for opening the connection to S3. |
| `RICETTINE_SECURITY_MAX_CONCURRENT_HASHES` | `4` | Password hashes (login, sign-up, password change) computed at once; each needs ~16 MB. Extra requests wait up to 10 s, then get "busy, try again". |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=75` | JVM options. The default sizes the heap to 75% of the container memory limit. |

## Upgrading

Images are published by CI to `ghcr.io/spezialissimo/ricettine` on every push to `main` (`latest`, `sha-...`) and on `v*` tags (semver), for amd64 and arm64. To upgrade:

```sh
docker compose pull && docker compose up -d
```

Database migrations run automatically on startup. Your data stays in the `db-data` and `app-data` volumes. To pin a version, set `RICETTINE_VERSION=x.y.z` in `.env` (default `latest`).

### Building from source

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

## Development

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker).
- Frontend: `cd frontend && npm ci && npx ng serve` (proxies `/api` to `localhost:8080`).
- Multi-arch check: `scripts/multiarch-check.sh` (builds amd64 + arm64, smoke-tests both; amd64 runs under QEMU on an arm64 host).
- Image + stack smoke test: `scripts/smoke.sh` (builds the image, starts compose, checks health and the SPA, then tears everything down with `-v`).

## Tests

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker).
- Frontend: `cd frontend && npx ng test --watch=false`.
- Smoke: `scripts/smoke.sh`.
- Browser e2e: `scripts/e2e.sh` (Playwright, mobile and desktop viewports).

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and on pushes to `main`.
