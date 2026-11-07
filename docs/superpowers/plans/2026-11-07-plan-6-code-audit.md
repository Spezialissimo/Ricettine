# Plan 6 phase 1: code audit report, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a verified findings report on the whole codebase so the owner can mark each finding fix, skip or later. No product code changes.

**Architecture:** The lead runs the tool passes and triages the old follow-ups into one input pack per area. Six reviewer subagents audit their areas in parallel and return findings in a fixed schema. The lead then merges, dedupes, verifies Critical and High findings, and writes the report.

**Tech Stack:** jscpd, knip and depcheck (one-off via `npx`), Maven `dependency:analyze`/`dependency:tree`, `javac -Xlint:all`, and a throwaway i18n-key script.

**Spec:** `docs/superpowers/specs/2026-11-07-plan-6-code-audit-design.md`

## Global Constraints

- The audit is read-only. Nothing outside `docs/superpowers/audits/` is committed. Tool output and throwaway scripts live in the scratchpad (`$SCRATCH` below), and reproduction tests in a scratch worktree.
- The base is branch `audit/p6-report`, cut from `feat/p5-aws`. The report is pinned to `AUDIT_SHA` = `git rev-parse feat/p5-aws`, recorded in Task 1.
- Out of scope: visual and UX changes, new features, major framework upgrades.
- Categories: security, correctness, data-loss, concurrency, error-handling, duplication, verbosity, dead-code, dependencies, tests, consistency, ops, docs.
- Severities:
  - Critical: exploitable now, or loses data.
  - High: a real bug or risk under plausible use.
  - Medium: a reviewer would notice it, and it costs maintenance.
  - Low: polish.
- Every finding states a concrete cost and a concrete fix. No style nitpicks without a cost.
- Same-kind instances are bundled into one finding, with the instance list attached.
- Lean process: Opus reviews the backend-security and ops areas; Sonnet reviews the rest. Suites run quietly: check the exit code, and read the log only on failure.
- Docker: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

## Finding schema (what every reviewer returns)

```json
{ "area": "backend-security", "title": "…", "category": "concurrency", "severity": "High",
  "locations": ["backend/src/main/java/com/ricettine/common/RateLimiter.java:88"],
  "problem": "one or two sentences: what is wrong and what it costs",
  "fix": "concrete proposed fix", "size": "S|M|L", "changesBehaviour": true,
  "evidence": "how it was confirmed: code read / tool hit / repro test name",
  "followupRef": "plan-5-followups: Rate limiter #1 (or null)" }
```

Reviewers also return `dismissedFollowups: [{ "ref": "…", "reason": "…" }]` for follow-up items they checked and found already fixed or not worth doing.

## Review Focus

- **Tool false positives:** knip and jscpd hits on Angular DI, route-loaded components, Spring beans and Flyway migrations. The expected behaviour is that a reviewer reads the code before reporting. Task 2's prompt says so explicitly.
- **Stale follow-ups:** an item already fixed by a later PR. It must be dismissed with a reason, not reported (Task 1 triage).
- **Duplicate findings across areas:** for example, the same i18n issue reported by both frontend reviewers. These are merged in Task 3.
- **Severity inflation:** a Medium labelled High. The lead's verification in Task 3 downgrades it.
- **Line drift:** a reference to a line that doesn't exist at `AUDIT_SHA`. Task 3 checks every location with `git show AUDIT_SHA:<file> | sed -n '<line>p'`.

---

### Task 1: Tool passes and follow-up triage (lead)

**Files:**
- Create: `$SCRATCH/audit/tools/{jscpd,knip,depcheck,mvn-analyze,mvn-tree,javac-lint,i18n-unused}.txt`
- Create: `$SCRATCH/audit/inputs/{backend-security,backend-domain,backend-tests,frontend-app,frontend-tests-e2e,ops}.md`

- [ ] **Step 1:** Record `AUDIT_SHA` and confirm the tree is clean: `git status --porcelain` prints nothing.
- [ ] **Step 2: Duplication.** Run `npx jscpd@4 --min-tokens 60 --reporters console --ignore "**/node_modules/**,**/dist/**,**/target/**" backend/src frontend/src e2e`. Save the output to `jscpd.txt`.
- [ ] **Step 3: Frontend unused code and dependencies.** In `frontend/`, run `npx knip@5 --no-progress` and `npx depcheck@1`. Save the outputs to `knip.txt` and `depcheck.txt`. Don't add any config file to the repo; pass flags, or point a config in `$SCRATCH` at the repo with `--config`.
- [ ] **Step 4: Backend dependencies and warnings.** In `backend/`, run `./mvnw -q dependency:analyze dependency:tree -DoutputFile=$SCRATCH/audit/tools/mvn-tree.txt` and save the analyze output to `mvn-analyze.txt`. Then run `./mvnw -q compile -Dmaven.compiler.showWarnings=true -Dmaven.compiler.compilerArgument=-Xlint:all` and save the output to `javac-lint.txt`. Each Maven command must exit 0.
- [ ] **Step 5: Unused i18n keys.** Write a throwaway script, `$SCRATCH/audit/i18n_unused.py`, that flattens every `frontend/public/i18n/*.json` into dotted keys. It reports keys that appear verbatim in no file under `frontend/src`, and also keys present in one locale but missing from another. Save the output to `i18n-unused.txt`.
- [ ] **Step 6: Follow-up triage.** Read the open items in `docs/superpowers/plans/2026-11-03-plan-1-followups.md`, `2026-11-04-plan-2-followups.md`, `2026-11-04-plan-3-followups.md`, `2026-11-05-plan-4-followups.md` and `2026-11-07-plan-5-followups.md`. For each item, check the code at `AUDIT_SHA`:
  - Items that are already fixed go in `inputs/closed.md`, each with the commit or code that fixed it.
  - Items that are still open go in the area's `inputs/<area>.md`, quoted with the file name and section.
- [ ] **Step 7: Split the tool output by area.** Append each area's tool hits (filtered by path) to its input pack. Areas and paths:
  - backend-security: `auth`, `account`, `setup`, `invite`, `admin`, `common`, `config`
  - backend-domain: `recipe`, `cookbook`, `media`, `feed`, `profile`, `db/migration`
  - backend-tests: `backend/src/test`
  - frontend-app: `frontend/src/app` except `*.spec.ts`, plus `frontend/public/i18n`
  - frontend-tests-e2e: `frontend/src/**/*.spec.ts`, `frontend/src/app/testing`, `e2e/`
  - ops: `Dockerfile`, `compose*.yaml`, `deploy/`, `scripts/`, `.github/`, `infra/`, `README.md`, `CLAUDE.md`

  Check: every tool hit and every open follow-up lands in exactly one pack.

### Task 2: Six area reviews (parallel subagents)

**Interfaces:**
- Consumes: `$SCRATCH/audit/inputs/<area>.md` and `AUDIT_SHA` from Task 1.
- Produces: `$SCRATCH/audit/findings/<area>.json`, which holds `{ "findings": [Finding…], "dismissedFollowups": [...] }` in the schema above.

- [ ] **Step 1: Dispatch all six reviewers in one message.** Each prompt contains:
  - the area's paths
  - the input pack's path
  - the Global Constraints and the finding schema
  - this charter, verbatim: *"Read every file in your area in full. Report security, correctness, data-loss, concurrency and error-handling problems; duplicated, verbose or unused code; missing or weak tests; inconsistencies; stale docs. A tool hit is a lead, not a finding: confirm it in the code first (Angular DI, lazy routes, Spring beans and reflection make many hits false). For each open follow-up in your pack, return it as a finding or as a dismissal with a reason. You may run the existing suites and write throwaway reproduction tests in a scratch worktree (`git worktree add $SCRATCH/wt-<area> AUDIT_SHA`); commit nothing to the repo. Write your JSON to `<output path>` and reply only with counts by severity."*

  Models: Opus for backend-security and ops, Sonnet for the other four.
- [ ] **Step 2: Validate the outputs.** All six files parse with `python3 -m json.tool`, and every finding has all the schema fields with a valid category and severity. Re-dispatch any area whose output fails, once, with the parse error.
- [ ] **Step 3:** Remove any scratch worktrees (`git worktree list` shows only the main one) and confirm `git status --porcelain` is still empty.

### Task 3: Merge, verify and write the report (lead)

**Files:**
- Create: `docs/superpowers/audits/2026-11-07-code-audit.md`

- [ ] **Step 1: Merge.** Collapse findings that share a root cause into one finding that lists all their locations. Assign ids by category prefix, numbered by descending severity: `SEC-`, `COR-`, `DATA-`, `CONC-`, `ERR-`, `DUP-`, `VERB-`, `DEAD-`, `DEP-`, `TEST-`, `CONS-`, `OPS-`, `DOC-`.
- [ ] **Step 2: Check locations.** Every location resolves at `AUDIT_SHA`: the file exists and the line is within its length. Fix or drop any that don't.
- [ ] **Step 3: Verify.** Re-read the code behind each Critical and High finding. Confirm it, downgrade it (and say why in its evidence), or drop it. Medium and Low findings the lead doubts get the tag `unverified`.
- [ ] **Step 4: Write the report** in this order:
  1. A header with `AUDIT_SHA`, the date and the scope.
  2. A summary: a severity × area count table, the top 10 findings by severity then size, and the bulk choice "fix all Low findings", with a checkbox.
  3. The findings grouped by severity. Each finding has the schema fields in readable form plus `**Decision:** ☐ fix ☐ skip ☐ later`.
  4. Closed follow-ups (from Task 1 and the reviewers' dismissals), each with its reason.
  5. A "Bigger ideas" section for structural suggestions that are out of Plan 6 scope.
- [ ] **Step 5: Self-check.** Every follow-up item from Task 1 appears exactly once, either as a finding's `followupRef` or as closed. Check with a grep over the report for each item's title.
- [ ] **Step 6: Commit.**

```bash
git add docs/superpowers/audits/2026-11-07-code-audit.md
git commit -m "docs: plan 6 code audit report"
```

### Task 4: Hand the report to the owner

- [ ] **Step 1:** Push `audit/p6-report` and open a PR against `feat/p5-aws`, titled "Plan 6: code audit report (decisions needed)". The body holds the summary table and says that no code changes are included.
- [ ] **Step 2:** Publish the report as a private artifact page (load `artifact-design` first). Give the owner both links and the top findings in chat.
- [ ] **Step 3:** Stop. Phase 2, the fix plan, starts only after the owner marks the decisions.
