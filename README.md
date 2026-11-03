# Ricettine

A self-hosted recipe app for friends and family. One image, one Postgres, no required configuration.

## Quick start

```sh
docker compose up -d
```

Open <http://localhost:8080> and create the admin account. That's it: the first visitor to a fresh install is guided through setup, and the admin can then invite other people with single-use links.

Data lives in two named volumes: `db-data` (Postgres) and `app-data` (uploaded images, mounted at `/data`).

## Configuration

Everything is optional. Set variables in a `.env` file next to `compose.yaml` or in the `app` service's `environment`.

| Variable | Default | Description |
| --- | --- | --- |
| `RICETTINE_BASE_URL` | derived from the request | Public URL of the app, e.g. `https://recipes.example.com`. **Set this in production**: otherwise invite and password-reset links are built from the request `Host` header. |
| `POSTGRES_PASSWORD` | `ricettine` | Database password (used by both `db` and `app` in `compose.yaml`). Postgres is not published to the host. **Only applied when the `db-data` volume is first created**: changing it later does not change the existing database's password (change it inside Postgres with `ALTER USER ricettine PASSWORD '...'` and then update the variable). |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://db:5432/ricettine` | JDBC URL, if you use your own Postgres. |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | `ricettine` | Database credentials. |
| `RICETTINE_STORAGE_TYPE` | `local` | Image storage: `local` or `s3`. |
| `RICETTINE_STORAGE_LOCAL_PATH` | `/data/media` | Directory for `local` storage (inside the `app-data` volume). |
| `RICETTINE_STORAGE_S3_BUCKET` | - | Bucket name (required when type is `s3`). |
| `RICETTINE_STORAGE_S3_REGION` | SDK default | S3 region. |
| `RICETTINE_STORAGE_S3_ENDPOINT` | AWS | Custom endpoint for S3-compatible stores (MinIO, R2, ...). |
| `RICETTINE_STORAGE_S3_PATH_STYLE` | `false` | Use path-style addressing (needed by most S3-compatible stores). |
| `RICETTINE_SECURITY_MAX_CONCURRENT_HASHES` | `4` | Password hashes (login, sign-up, password change) computed at once; each needs ~16 MB. Extra requests wait up to 10 s, then get "busy, try again". |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=75` | JVM options. The default sizes the heap to 75% of the container memory limit. |

## Upgrading

The image is built from source on your machine (no published image yet; one will come with CI in a later release). To upgrade, update the checkout and rebuild:

```sh
git pull && docker compose up -d --build
```

Database migrations run automatically on startup. Your data stays in the `db-data` and `app-data` volumes.

## Development

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker).
- Frontend: `cd frontend && npm ci && npx ng serve` (proxies `/api` to `localhost:8080`).
- Image + stack smoke test: `scripts/smoke.sh` (builds the image, starts compose, checks health and the SPA, then tears everything down with `-v`).

## Tests

- Backend: `cd backend && ./mvnw verify` (Java 25; integration tests need Docker).
- Frontend: `cd frontend && npx ng test --watch=false`.
- Smoke: `scripts/smoke.sh`.
- Browser e2e: `scripts/e2e.sh` (Playwright, mobile and desktop viewports).
