# Plan 5 follow-ups (carry into later plans)

These items come from the per-task and whole-PR reviews of Plan 5 (hosting & CI, PRs #19–#25). None of them blocks Plan 5. Items in the Plan 5 "Out of scope" list are not repeated here. Open items in the plan-1 to plan-4 follow-up files outside their "Plan 5" sections are still open there.

## Plan 5 Task 12 (AWS deployment, owner-gated, after Plans 6 and 7)
- Verify after deploy:
  - Edge compression of the SPA bundles: `curl -H 'Accept-Encoding: br' -I https://<domain>/main-*.js`. CachingDisabled may not compress. If so, add a cached behaviour for the hashed assets, or accept it.
  - The backup-failure email end to end: deliberately fail one backup. Confirm the SNS subscription first.
  - That `cmp` (diffutils) is present on AL2023. `mount-data.sh` refuses to format without it.
- Run `S3BlobStoreRealIT` against the real media bucket. This closes the plan-1 S3 item.
- Optional, as the owner decides: daily EBS snapshots (declined for now), and a CloudWatch alarms stack.

## Plan 6 (code audit): worth a look
- **Rate limiter** (`common/RateLimiter`, `RateLimits`):
  - A refund after the window rolls over decrements the new window: at most one extra attempt per race. A window generation token would fix it.
  - IPv4-mapped IPv6 addresses aren't collapsed to the IPv4 key.
  - `succeeded()` clears other in-flight failure reservations on the same account.
  - The LRU can evict a live counter under 50k-key churn; evict expired windows first.
  - It uses the wall clock, not a monotonic clock.
  - Anonymous-auth requests are counted after `@Valid`, so malformed bodies aren't counted.
- **Photo cap:** it isn't re-checked under the recipe row lock, so concurrent uploads can overshoot 150 by a few.
- **Media:** a 304 is decided before checking that the variant exists, so a hand-built ETag for a missing variant gets 304 instead of 404. Nothing leaks.
- **Sessions:** a stale-session WARN is logged per request per attribute until the user logs in again. Dedupe it or lower the level.
- **Dependencies:** the Apache 4 HTTP client may still be on the classpath beside `apache5-client`. Check `dependency:tree`.
- **Uploads:** `UploadDirectoryConfig` re-creates the spool dir, but Tomcat already does this itself. Keep it or delete it.
- **Edge caching:** add an IT asserting that avatar responses never carry `Set-Cookie`, even with a stale `SESSION` cookie. CloudFront would cache one for up to a day.
- **Backups:**
  - Restoring an older dump over a newer schema is unsupported. It's documented; consider a schema drop before restore.
  - A failed media delete before the untar is silent.
  - Two runs in the same second share file names.
  - The `backup.sh` header comment still says "a failed run leaves no files behind", which isn't true in S3 mode.
  - On S3, backups live up to about 2× retention (current plus noncurrent expiry), and delete markers aren't cleaned up.
- **CI:**
  - `--mount=type=cache` isn't exported to the GHA cache, so CI image builds re-download Maven dependencies.
  - Actions are pinned to major tags, not SHAs.
  - `cancel-in-progress` can cancel an in-flight publish.
  - There are no `major.minor` semver aliases.
- **Caddy:** the origin-secret header matcher isn't constant-time (negligible).

## Tests to add (any time)
- `LoginRateLimitIT`: spy on hashing for the account path.
- IP-key truncation in `RateLimitsTest`.
- The concurrency IT asserts exactly 10 and 10, and would flake if a 503 busy occurred.
- `If-None-Match` weak, list and `*` forms.
- The actuator robots-header test asserts no status.
- `S3BlobStoreTimeoutTest` asserts `isNotNull`, not the timeout type.
- The YAML round-trip tftest compares `config.env`, `daemon.json` and the docker drop-in to themselves.
- The temp file in the drill's `avatar_info` leaks if curl aborts.

## Small cleanups (any time)
- Fully qualified names: `Duration` in `ApiException` and `S3BlobStoreIT`; `header()` in `RecipePhotoBusyIT`; MockMvc matchers in `MediaAccessIT`.
- A duplicate import in `MediaAccessIT`.
- The import order in `BeansConfig`.
- `MAX_PHOTOS` declared mid-class in `RecipeService`.
- An extra Spring context from the `BlobStore` spy in `UploadLimitsIT`.
- `infra-check.sh`: an empty `files` array under `set -u` on bash 3.2.
- `example.tfvars` comment says `monthly_budget_usd = 10`; the default is 25.
- `backup-failed.sh`: a failed SNS publish only shows as a failed unit.
- People who keep running the old `docker compose up --build` keep a stale local `latest` image. The README's `pull` path avoids it.
