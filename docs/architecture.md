# Architecture

Ricettine is one Spring Boot application that serves the Angular single-page app and a JSON API under `/api`. It runs next to a Postgres container, built as one Docker image and started with Compose. This page describes what is in the repository today.

## Containers

On AWS the stack is one EC2 instance running three containers (Caddy, the app, Postgres), behind CloudFront. Self-hosters run the same image with `compose.yaml`, optionally with their own Caddy (`compose.https.yaml`).

```mermaid
flowchart LR
  browser([Browser])
  subgraph edge[CloudFront]
    main[main distribution]
    demo[demo distribution<br/>adds X-Ricettine-Site: demo]
  end
  subgraph ec2[EC2 instance, Docker Compose]
    caddy[Caddy<br/>checks X-Origin-Verify]
    app[app: Spring Boot<br/>SPA + /api + /media]
    subgraph pg[Postgres]
      db1[(ricettine)]
      db2[(ricettine_demo)]
    end
  end
  s3[(S3 media bucket)]

  browser --> main
  browser --> demo
  main --> caddy
  demo --> caddy
  caddy --> app
  app --> db1
  app --> db2
  app --> s3
```

- `/media/*` has its own CloudFront cache behaviour (it honours the origin's `Cache-Control`, at most one day); all other paths are not cached (`infra/terraform/edge.tf`).
- The demo database exists only when `RICETTINE_DEMO_ENABLED=true`. It is dropped, recreated and migrated at every start.
- Without S3 settings the app stores images on a local volume (`RICETTINE_STORAGE_TYPE=local`).
- Database dumps go from the host to a separate S3 bucket (`deploy/backup.sh`, a systemd timer).

## Site routing

Both sites run in the same JVM. Every request gets a site, `MAIN` or `DEMO`, from the `X-Ricettine-Site` header (`SiteFilter`). It is `DEMO` only when the demo is enabled and the header says `demo`. The application `DataSource` is a router (`SiteRoutingDataSource`) over two Hikari pools, one per database, and picks the pool from the current site. Blob keys of the demo live under the `demo/` prefix. The header is trusted, so only the edge sets it: the demo CloudFront distribution adds it, the main one never forwards it from viewers, and the self-host Caddyfile overwrites it. See [decisions](decisions.md#7-demo-isolation-by-routed-database) and [security](security.md#demo-isolation-and-read-only-behaviour).

## Backend modules

Package `com.ricettine.<feature>` under `backend/src/main/java`. Each feature owns its controllers, services, entities and repositories.

| Package | Responsibility |
| --- | --- |
| `account` | Users, `/api/me`, avatars, account deletion hooks |
| `admin` | Admin-only user management |
| `auth` | Login, sessions, password reset |
| `common` | Errors (problem+json), one-time tokens, rate limits, ids |
| `config` | Security chain, headers, password encoder, SPA serving |
| `cookbook` | Cookbooks, co-authors, entries, cookbook invites, public cookbook links |
| `feed` | Cursor-paged feed of public recipes |
| `invite` | Admin-created invites and registration |
| `media` | Image processing, blob stores (local, S3), per-kind access policies |
| `profile` | User profile pages |
| `recipe` | Recipes, ingredients, steps, photos, share links, orphan photo cleanup |
| `setup` | First-run admin setup and `/api/setup/status` |
| `site` | Site routing, demo database, demo seeder, read-only filter, guest sign-in |

Database migrations are Flyway files in `backend/src/main/resources/db/migration` (`V1` to `V9`).

## Data model

Core tables, from migrations `V1` to `V9`. Ids are UUIDs assigned by the server; `media.id` is a random string. Spring Session keeps its own tables (`spring_session*`) and is left out.

```mermaid
erDiagram
  app_user ||--o{ recipe : "author_id"
  app_user ||--o{ media : "owner_id"
  app_user ||--o{ cookbook : "owner_id"
  app_user ||--o{ cookbook_author : "user_id"
  app_user ||--o{ one_time_token : "user_id, created_by"
  recipe ||--o{ ingredient_group : has
  ingredient_group ||--o{ ingredient : has
  recipe ||--o{ step : has
  recipe ||--o{ media : "recipe_id"
  media o|--o{ step : "photo_media_id"
  media o|--o{ recipe : "cover_media_id"
  media o|--o{ cookbook : "cover_media_id"
  cookbook ||--o{ cookbook_author : has
  cookbook ||--o{ cookbook_entry : has
  recipe ||--o{ cookbook_entry : "recipe_id"
  cookbook o|--o{ one_time_token : "cookbook_id"

  app_user {
    uuid id PK
    string email UK
    string username UK
    string display_name
    string password_hash
    boolean is_admin
  }
  recipe {
    uuid id PK
    uuid author_id FK
    string status "DRAFT or PUBLISHED"
    string visibility "PRIVATE or PUBLIC"
    string share_token UK
    long version
    timestamptz published_at
  }
  ingredient_group {
    uuid id PK
    uuid recipe_id FK
    int position
  }
  ingredient {
    uuid id PK
    uuid group_id FK
    numeric amount
    string unit
    string name
  }
  step {
    uuid id PK
    uuid recipe_id FK
    int position
    string text
    string photo_media_id FK
  }
  media {
    string id PK
    uuid owner_id FK
    string kind "AVATAR, RECIPE or COOKBOOK"
    uuid recipe_id FK
    uuid cookbook_id FK
  }
  cookbook {
    uuid id PK
    uuid owner_id FK
    string name
    string visibility
    string share_token UK
    string cover_media_id FK
  }
  cookbook_author {
    uuid cookbook_id PK
    uuid user_id PK
  }
  cookbook_entry {
    uuid cookbook_id PK
    uuid recipe_id PK
    uuid added_by FK
  }
  one_time_token {
    uuid id PK
    string purpose
    string token_hash UK
    uuid user_id FK
    uuid cookbook_id FK
    timestamptz expires_at
    timestamptz used_at
    timestamptz revoked_at
  }
```

Notes:

- Tokens (invites, password resets, cookbook invites) are stored only as SHA-256 hashes in `one_time_token`.
- A recipe's `version` is used for optimistic locking: a save or publish with a stale version is refused with 409.
- Deleting a media row sets the referencing columns to null (`ON DELETE SET NULL`); `V5` and `V7` index those columns so that delete does not scan whole tables.
- `V9` adds a partial index for the feed: published, public recipes ordered by `published_at, id`.

## Flow: invite, register, login

The first visitor of a fresh install creates the admin through `/api/setup/admin`. Everyone else needs an invite.

```mermaid
sequenceDiagram
  actor Admin
  actor Guest as Invited person
  participant SPA as Angular app
  participant API as Spring Boot
  participant DB as Postgres

  Admin->>SPA: create invite
  SPA->>API: POST /api/admin/invites
  API->>DB: store SHA-256 of token, expiry
  API-->>SPA: link with the raw token (shown once)
  Admin-->>Guest: sends the link

  Guest->>SPA: open /invite/token
  SPA->>API: GET /api/invites/token
  API->>DB: look up hash, check expiry, used, revoked
  API-->>SPA: invite is valid
  Guest->>SPA: choose username and password
  SPA->>API: POST /api/invites/token/register
  API->>DB: create user (argon2 hash), mark token used
  API-->>SPA: 201, SESSION cookie set

  Note over Guest,API: later visits
  Guest->>SPA: email and password
  SPA->>API: POST /api/auth/login
  API->>DB: rate-limit check, load user, verify hash
  API-->>SPA: 200, SESSION cookie set
```

## Flow: demo first visit

On the demo site nobody has to sign in. The app asks which site it is, signs in the guest account `ospite` when it is the demo, and shows the feed.

```mermaid
sequenceDiagram
  actor V as Visitor
  participant CF as CloudFront (demo)
  participant API as Spring Boot
  participant DB as ricettine_demo
  participant SPA as Angular app

  V->>CF: GET /
  CF->>API: adds X-Ricettine-Site: demo
  API-->>V: SPA files
  V->>SPA: app starts
  SPA->>API: GET /api/setup/status
  API-->>SPA: demo true, setupRequired false
  SPA->>API: POST /api/demo/session
  API->>DB: load user ospite
  API-->>SPA: 204, SESSION cookie (1 day)
  SPA->>API: GET /api/me
  API-->>SPA: guest user
  SPA->>API: GET /api/feed
  API->>DB: published public recipes
  API-->>SPA: first page, next cursor
```

If a later request gets a 401 (sessions are lost when the demo database is recreated), the SPA starts the guest session again and retries once (`auth.interceptor.ts`). Every other write is refused with 403 `demo_read_only`.

## Frontend

`frontend/` is a standalone-component Angular app (no NgModules), built with `ng build` into the static files the backend serves.

- `src/app/core`: auth store, route guards, HTTP interceptor (XSRF header, session expiry), site and setup status, theme, language.
- Feature folders: `auth`, `feed`, `recipes` (editor, viewer), `cookbooks`, `kitchen` (the author's own recipes), `profile`, `settings`, `admin`, plus `shell` (top bar, account menu, demo banner) and `shared`.
- Routes live in `app.routes.ts`; the heavy pages are lazy-loaded. Public pages (`/r/:token`, `/c/:token`) sit outside the signed-in shell.
- Unit tests are vitest specs next to the code. Browser tests are Playwright specs in `e2e/tests`, run in a `mobile` and a `desktop` project against the built image.

### Internationalisation

All UI text goes through Transloco keys, with files in `frontend/public/i18n` for English (`en.json`) and Italian (`it.json`). A unit test (`i18n-parity.spec.ts`) fails when the two files do not have the same keys. The choice (System, English or Italian) is kept per browser; System follows the browser language and falls back to English.
