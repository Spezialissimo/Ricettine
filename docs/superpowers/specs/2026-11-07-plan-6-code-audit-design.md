# Plan 6: code audit (design)

## Why

Ricettine is about to go public, and the owner will point prospective employers at it during a job search. The code has to hold up to a skeptical reviewer, so this audit finds what such a reviewer would flag, and then fixes what the owner chooses.

## Goals

1. **Correctness and risk.** Find security holes, data-loss paths, races, and weak error handling.
2. **Quality.** Find duplicated code, verbose code, and unused code: classes, methods, endpoints, components, i18n keys, CSS, dependencies and scripts. Also flag readability and consistency problems. Improve what can be improved safely.
3. **Close the open follow-ups.** For every item in `docs/superpowers/plans/2026-11-07-plan-5-followups.md` ("Plan 6", "Tests to add", "Small cleanups"), and for the still-open items in the plan-1 to plan-4 follow-up files, either confirm it as a finding or dismiss it with a reason.

## Owner decisions

- **Base:** treat Plan 5 PRs #19–#25 as merged. Plan 6 branches from `feat/p5-aws`, which contains all of them.
- **Report before change:** the audit is read-only. It produces a findings report, and the owner picks which findings get fixed. No code changes until then.
- **Scope:** code quality as well as risk, covering repetition, verbosity, unused code and general quality.

## Non-goals and anti-goals

- No visual or UX changes. Those belong to Plan 7, the owner-led UI pass.
- No new features and no major framework upgrades.
- No architecture rewrite. Bigger structural ideas go in the report as suggestions only.
- **Anti-goal:** "cleanup" that changes behaviour without anyone noticing. A refactor must keep behaviour the same, and the existing tests prove it. Fixing a real bug is a behaviour change, so it gets a regression test.
- **Anti-goal:** a report padded with style nitpicks. Each finding states a concrete cost (risk, confusion, duplication) and a concrete fix.

## Scope

The whole repository at `feat/p5-aws`, about 33k lines:

| Area | Contents |
|---|---|
| Backend: security and platform | `auth`, `account`, `setup`, `invite`, `admin`, `common` (rate limiter, errors), `config`, sessions, CSRF, uploads |
| Backend: domain | `recipe`, `cookbook`, `media`, `feed`, `profile`, Flyway migrations, queries and transactions |
| Backend tests | `backend/src/test`: coverage gaps, duplicated setup, slow or flaky patterns, the extra Spring contexts |
| Frontend app | `frontend/src/app`: services, components, routing, state, i18n keys, styles |
| Frontend tests and e2e | vitest specs, Playwright specs and helpers |
| Ops | `Dockerfile`, the compose files, `deploy/` (Caddy), `scripts/`, `.github/workflows/ci.yml`, `infra/` (Terraform) |

## How the audit runs (builder's calls, stated)

**Tool-assisted passes first, run once without adding anything to the repo:**
- Duplication: `jscpd` over Java and TypeScript (via `npx`).
- Unused code: `knip` for the frontend (via `npx`); IntelliJ-style unused detection approximated with `javac -Xlint:all` warnings and grep for unreferenced public members in the backend.
- Unused i18n keys: a throwaway script that compares `public/i18n/*.json` keys with the keys used in templates and code. The script stays in the scratchpad.
- Dependencies: `./mvnw dependency:analyze` and `dependency:tree`, plus `npx depcheck` for the frontend.

**Old follow-ups:** the lead triages the plan-1 to plan-5 follow-up files against the code before the reviewers start. Each open item goes to the reviewer for its area, and items already fixed are listed as closed in the report.

**Running things during the audit:** reviewers may run the existing suites, and may write throwaway reproduction tests in a scratch worktree to confirm a suspected bug. Nothing from that work is committed. Reproducing a Critical or High finding is the preferred way to verify it.

Tool output is raw input. A tool hit becomes a finding only after someone reads the code and confirms it.

**Then one reviewer subagent per area (six in total), each reading its area in full.** Opus reviews the two sensitive areas, backend security and ops. Sonnet reviews the other four. This follows the owner's lean-process preference. Each reviewer gets the tool output for its area and the relevant follow-up items, and returns structured findings.

**Verification:** the lead re-reads the code behind every Critical and High finding before it enters the report. Lower findings go in as the reviewer stated them and are marked unverified-by-lead only if the lead had doubts.

## The report

A committed file, `docs/superpowers/audits/2026-11-07-code-audit.md`, on branch `audit/p6-report`, opened as a PR so the owner can comment line by line. It is also published as a private artifact page for easier reading.

The report is pinned to the commit SHA it audited, so its `file:line` references stay valid even if the branch moves.

Same-kind instances are bundled into one finding, for example "23 unused i18n keys" with the list attached, so the owner decides per finding and not per instance. The report also offers a bulk choice, "fix all Low findings", that the owner can take or override.

Each finding has:
- an id (`SEC-3`, `DUP-7`, and so on)
- area, category and severity
- `file:line` locations
- what is wrong and what it costs, in one or two sentences
- the proposed fix and its rough size (S/M/L)
- whether the fix changes behaviour
- an empty **Decision** field for the owner: fix, skip, or later

**Categories:** security, correctness, data-loss, concurrency, error-handling, duplication, verbosity, dead-code, dependencies, tests, consistency, ops.

**Severities:**
- **Critical:** exploitable now, or loses data.
- **High:** a real bug or risk under plausible use.
- **Medium:** a quality problem that a reviewer would notice and that costs maintenance.
- **Low:** a polish item.

The report opens with a one-screen summary: counts by severity and area, the top 10 findings, and the dismissed follow-up items with their reasons.

## After the owner decides

The owner marks each finding. The lead then writes the Plan 6 implementation plan (superpowers:writing-plans), grouping the chosen fixes into small PRs by area, stacked on `feat/p5-aws` or on `main` if Plan 5 has merged by then. Each PR:
- keeps refactors behaviour-preserving, with the existing ITs, unit tests and e2e as the safety net
- adds a regression IT or unit test for each bug fix, plus a Playwright spec when the bug shows in the UI
- passes the local suites (`./mvnw verify`, `ng test`, `ng build`, `scripts/e2e.sh`, `scripts/infra-check.sh` when ops files change), and CI once the billing lock is lifted

**Infra findings can be fixed.** The Terraform has never been applied, so a fix carries no live risk. Infra PRs are verified with `scripts/infra-check.sh` and the existing `terraform test` files.

**Stale docs are findings.** For example, CLAUDE.md's package list is missing `cookbook`, `feed` and `profile`. Such fixes are part of the docs PR.

## Left to the builder

- The exact tool flags, and how the tool output is split across reviewers.
- Which findings to merge when several reviewers report the same thing.
- The PR grouping in the implementation plan, as long as each PR stays one area and reviewable.
