# Phase 12: Remote CI Evidence and Flake Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the new deterministic CI governance tooling into GitHub Actions so failures produce durable evidence artifacts, recent flake history can be aggregated across workflow runs, and major/minor release checks are enforced remotely without weakening existing PR gates.

**Architecture:** Keep the current Phase 11 CLIs as the single source of truth, then add thin GitHub Actions integration around them. Persist CI evidence as workflow artifacts, aggregate recent artifacts in a scheduled flake-ops workflow, and keep impacted validation advisory on fast gates while full PR and merge-queue validation remains authoritative.

**Tech Stack:** GitHub Actions YAML, Node.js 20/22, pnpm, existing `.claude/lib/ci/*` modules, `actions/upload-artifact`, `actions/download-artifact`, `actions/github-script`, existing repo validation/test/benchmark commands.

---

## Research Basis

This plan is validated by current repo structure plus recent external evidence gathered on 2026-04-17:

- Repo CI topology already separates fast push gates from full PR validation:
  - `.github/workflows/ci.yml`
  - `.github/workflows/full-validation.yml`
  - `.github/workflows/global-quality-gates.yml`
  - `.github/workflows/observability-ci.yml`
- Repo release governance already requires named remote checks via `.claude/config/required-status-checks.json`.
- Phase 11 already introduced the local primitives that should now be wired remotely:
  - `.claude/lib/ci/flake-ledger.cjs`
  - `.claude/lib/ci/failure-evidence.cjs`
  - `.claude/lib/ci/impacted-validation-planner.cjs`
  - `.claude/lib/ci/release-gate.cjs`

### External validation

- SCOUT, submitted 2026-03-24, argues for online flaky-failure triage using strict-causal features, calibrated thresholds, and millisecond-budget decisions instead of post-hoc rerun folklore:
  - https://arxiv.org/abs/2603.23054v1
- Targeted Test Selection, submitted 2025-09-12, reports that selective testing can be materially faster while still catching the large majority of failures, but only when used as a disciplined selection layer rather than a blanket replacement for full validation:
  - https://arxiv.org/abs/2509.10279
- Harness documentation, published 2026-02-08, uses a practical flake model that is directly relevant here:
  - same-commit pass/fail inconsistency
  - bounded observation window
  - automatic recovery after consecutive passes
  - explicit distinction between flaky and quarantined
  - https://developer.harness.io/docs/continuous-integration/use-ci/run-tests/test-management/ci-flaky-tests
- Recent Reddit discussion from 2026-03-10 converges on the same operational lessons:
  - environment isolation beats blind reruns
  - selector/timing symptoms are often infrastructure/state problems
  - CI needs reproducible evidence before people lose branch context
  - https://www.reddit.com/r/dev/comments/1rpotk6/how_are_people_actually_dealing_with_flaky_e2e/
- GitHub’s current artifact model supports the persistence pattern this phase needs:
  - workflow artifacts are the supported way to store debug/test outputs across jobs and after run completion
  - artifacts can be downloaded in later jobs or later runs with the appropriate token and run identifier
  - https://help.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts
  - latest changelog also notes newer non-zipped artifact support, but this phase should stay on the conservative default archive path because JSON and Markdown artifacts do not need that migration yet:
    - https://github.blog/changelog/2026-02-26-github-actions-now-supports-uploading-and-downloading-non-zipped-artifacts/

## Recommendation

### Recommended approach: additive workflow wiring plus scheduled aggregation

Use the current Phase 11 CLIs as-is, wire them into the existing workflows, and add one new scheduled workflow to aggregate recent flake artifacts and publish a triage report.

Why this is next:

- it closes the gap between local verification and remote CI behavior
- it preserves current required checks instead of replacing them
- it creates durable evidence before adding any aggressive automation such as auto-quarantine
- it aligns with the repo’s existing path-scoped workflow style

### Rejected for now: ML triage in the critical path

SCOUT and related work are useful conceptually, but this repo does not yet have the artifact history, labeled data quality, or calibration harness needed to put probabilistic triage in the blocking path. Phase 12 should prepare the data layer, not pretend it already exists.

### Rejected for now: automatic quarantine as a default reaction

Harness and community practice both distinguish tracking from quarantine. This repo should not auto-quarantine failing tests until the evidence pipeline is in place and there is an explicit tracking mechanism for re-enablement.

## Scope

### In scope

- upload per-run CI evidence artifacts on failure
- write GitHub job summaries for impacted validation and release gate output
- add a scheduled flake-ops workflow that aggregates recent artifacts into a durable report
- keep fast-gate impacted validation advisory only
- enforce release-gate checks remotely for PRs and release-facing workflows
- update docs for remote major/minor release handling

### Out of scope

- replacing `pnpm test` with selective testing on PRs
- auto-quarantining tests
- changing existing required check names without shipping and proving replacements first
- introducing a non-GitHub CI provider
- adopting an ML classifier in the blocking path

## Release posture and branch policy

- Assume PR `#176` merges first as a minor release candidate.
- Start this phase from updated `main` in a new branch such as:
  - `feature/remote-ci-evidence-and-flake-ops`
- Treat this phase as a minor release by default because it is additive workflow and tooling work.
- Only classify this phase as major if it breaks existing maintainer/operator workflows by:
  - renaming or removing required status checks
  - changing release-gate semantics so existing release branches or PR processes stop working
  - removing currently supported verification commands
- Do not update `.claude/config/required-status-checks.json` until any new remote check exists, is green in CI, and has a clear replacement relationship to the old required check set.

## File map

### Create

- `.claude/lib/ci/github-actions-summary.cjs`
- `.claude/tools/cli/ci-write-summary.cjs`
- `.claude/tools/cli/ci-artifact-index.cjs`
- `.github/workflows/ci-flake-ops.yml`
- `tests/lib/ci/github-actions-summary.test.cjs`
- `tests/tools/cli/ci-write-summary.test.cjs`
- `tests/tools/cli/ci-artifact-index.test.cjs`
- `tests/workflows/ci-flake-ops-workflow.test.cjs`
- `tests/workflows/ci-evidence-wiring.test.cjs`

### Modify

- `.github/workflows/ci.yml`
- `.github/workflows/full-validation.yml`
- `.github/workflows/global-quality-gates.yml`
- `.github/workflows/observability-ci.yml`
- `.claude/docs/RELEASE_GOVERNANCE.md`
- `README.md`
- `CHANGELOG.md`
- `package.json`
- `tests/workflows/workflow-trigger-parity.test.cjs`

## Task 1: Add GitHub summary and artifact-index helpers

**Files:**
- Create: `.claude/lib/ci/github-actions-summary.cjs`
- Create: `.claude/tools/cli/ci-write-summary.cjs`
- Create: `.claude/tools/cli/ci-artifact-index.cjs`
- Test: `tests/lib/ci/github-actions-summary.test.cjs`
- Test: `tests/tools/cli/ci-write-summary.test.cjs`
- Test: `tests/tools/cli/ci-artifact-index.test.cjs`

- [ ] **Step 1: Write failing tests for summary formatting and artifact indexing**
- [ ] **Step 2: Run targeted tests to verify they fail**
  - Run: `node --test tests/lib/ci/github-actions-summary.test.cjs tests/tools/cli/ci-write-summary.test.cjs tests/tools/cli/ci-artifact-index.test.cjs`
- [ ] **Step 3: Implement minimal helpers**
  - `github-actions-summary.cjs` should build deterministic Markdown sections for:
    - impacted validation recommendations
    - release-gate classification
    - failure-evidence artifact references
    - flake-ops summaries
  - `ci-write-summary.cjs` should write only when `GITHUB_STEP_SUMMARY` is set and fail open locally
  - `ci-artifact-index.cjs` should normalize artifact metadata so later workflows can aggregate by:
    - workflow
    - job
    - sha
    - branch
    - artifact kind
    - created time
- [ ] **Step 4: Re-run targeted tests to verify pass**
- [ ] **Step 5: Commit**
  - `git commit -m "feat(ci): add GitHub Actions summary helpers"`

## Task 2: Wire impacted validation and release-gate summaries into the fast gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Test: `tests/workflows/ci-evidence-wiring.test.cjs`

- [ ] **Step 1: Write failing workflow test**
  - Assert that `ci.yml` contains:
    - a changed-files step
    - an advisory `pnpm validate:affected` step
    - a release-gate summary step for PR-facing contexts where metadata is available
    - artifact upload for the advisory outputs
- [ ] **Step 2: Run the workflow test to verify it fails**
  - Run: `node --test tests/workflows/ci-evidence-wiring.test.cjs`
- [ ] **Step 3: Modify `ci.yml` with non-blocking advisory wiring**
  - Keep existing `lint`, `format-check`, `validate`, `validate-schemas`, `validate-commands` jobs intact
  - Add a new advisory job or post-step that:
    - computes changed files
    - runs `pnpm validate:affected --json`
    - writes a GitHub job summary
    - uploads a small artifact with the JSON output
  - Advisory means:
    - it may inform developers
    - it must not replace or weaken the existing blocking jobs
- [ ] **Step 4: Re-run the workflow test**
- [ ] **Step 5: Commit**
  - `git commit -m "feat(ci): add advisory impacted validation summaries"`

## Task 3: Capture failure evidence artifacts in authoritative validation workflows

**Files:**
- Modify: `.github/workflows/full-validation.yml`
- Modify: `.github/workflows/global-quality-gates.yml`
- Modify: `.github/workflows/observability-ci.yml`
- Test: `tests/workflows/ci-evidence-wiring.test.cjs`

- [ ] **Step 1: Extend the failing workflow test**
  - Assert that each authoritative workflow uploads unique failure artifacts on job failure
  - Assert artifact naming includes workflow/job/run identifiers to avoid upload collisions
- [ ] **Step 2: Run the workflow test and verify failure**
- [ ] **Step 3: Implement failure evidence wiring**
  - On failure, run a wrapper around `.claude/lib/ci/failure-evidence.cjs`
  - Write JSON into a deterministic workspace path such as `.claude/context/ci/failure-evidence/`
  - Upload with `actions/upload-artifact`
  - Use unique artifact names because GitHub artifact actions require idempotent names per job
  - Write a concise summary section pointing to the artifact
- [ ] **Step 4: Re-run the workflow test**
- [ ] **Step 5: Commit**
  - `git commit -m "feat(ci): upload failure evidence artifacts"`

## Task 4: Add scheduled flake-ops aggregation workflow

**Files:**
- Create: `.github/workflows/ci-flake-ops.yml`
- Modify: `tests/workflows/workflow-trigger-parity.test.cjs`
- Create: `tests/workflows/ci-flake-ops-workflow.test.cjs`

- [ ] **Step 1: Write failing workflow tests**
  - Assert the new workflow:
    - runs on a schedule and `workflow_dispatch`
    - downloads or enumerates recent CI artifacts
    - runs the flake-report or aggregation path
    - publishes a job summary
    - optionally opens or updates an issue only on actionable findings
- [ ] **Step 2: Run workflow tests to verify failure**
  - Run: `node --test tests/workflows/ci-flake-ops-workflow.test.cjs tests/workflows/workflow-trigger-parity.test.cjs`
- [ ] **Step 3: Implement `ci-flake-ops.yml`**
  - Use GitHub-native artifact retrieval instead of assuming workspace persistence between runs
  - Aggregate only a bounded recent window
  - Emit:
    - flake summary Markdown
    - machine-readable artifact index JSON
    - issue or comment automation only if the result crosses a threshold
  - Start with reporting only; do not auto-quarantine
- [ ] **Step 4: Re-run workflow tests**
- [ ] **Step 5: Commit**
  - `git commit -m "feat(ci): add scheduled flake ops workflow"`

## Task 5: Wire remote release-gate enforcement for major vs minor releases

**Files:**
- Modify: `.github/workflows/full-validation.yml`
- Modify: `.claude/docs/RELEASE_GOVERNANCE.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `tests/workflows/ci-evidence-wiring.test.cjs`

- [ ] **Step 1: Extend the failing workflow test**
  - Assert that authoritative PR validation runs the release-gate CLI
  - Assert the workflow writes a human-readable summary of:
    - detected semver class
    - migration-guide requirement
    - major/minor path decision
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement remote release-gate wiring**
  - Use `pnpm release:gate --json` or equivalent CLI invocation
  - On a major classification:
    - fail if migration notes are absent
    - keep PR-only merge discipline
  - On a minor classification:
    - keep current path, but still write summary evidence
- [ ] **Step 4: Update docs**
  - document remote gate behavior in `.claude/docs/RELEASE_GOVERNANCE.md`
  - add short operator guidance to `README.md`
  - append changelog note under `[Unreleased]`
- [ ] **Step 5: Re-run the workflow test**
- [ ] **Step 6: Commit**
  - `git commit -m "feat(release): enforce remote semver gate"`

## Task 6: Full verification and release integration

**Files:**
- Modify only if verification reveals defects

- [ ] **Step 1: Run targeted new tests**
  - Run: `node --test tests/lib/ci/github-actions-summary.test.cjs tests/tools/cli/ci-write-summary.test.cjs tests/tools/cli/ci-artifact-index.test.cjs tests/workflows/ci-evidence-wiring.test.cjs tests/workflows/ci-flake-ops-workflow.test.cjs tests/workflows/workflow-trigger-parity.test.cjs`
- [ ] **Step 2: Run repo validation**
  - Run:
    - `pnpm lint`
    - `pnpm format:check`
    - `pnpm validate`
    - `pnpm validate:schemas`
    - `pnpm validate:commands`
    - `pnpm validate:agent-skill-refs`
    - `pnpm validate:hooks:docs`
    - `pnpm agents:registry:validate`
    - `pnpm validate:status-check-governance`
- [ ] **Step 3: Run full suite**
  - Run: `pnpm test`
- [ ] **Step 4: Run benchmark slice**
  - Run: `node --test --test-concurrency=1 tests/benchmarks/telemetry-hotpath-latency.test.cjs tests/benchmarks/flight-recorder-throughput.test.cjs tests/lib/code-indexing/benchmark-fast-path.test.cjs tests/hooks/benchmarks/perf-regression-gate.test.cjs`
- [ ] **Step 5: Push branch and open/update PR**
  - Branch suggestion: `feature/remote-ci-evidence-and-flake-ops`
  - Minor-release default commit prefixes:
    - `feat(ci): ...`
    - `feat(release): ...`
    - `fix(ci): ...`
  - Do not change required status checks in `.claude/config/required-status-checks.json` unless the replacement checks already exist in the same PR and are passing remotely.
- [ ] **Step 6: Verify remote checks**
  - Existing required checks remain authoritative until explicitly replaced:
    - `CI`
    - `Full Validation`
    - `Global Quality Gates`
    - `memory-ci`
    - `memory-mvp-gate`
    - `nightly-strict-gate`
    - `creator-ecosystem-validation`
    - `validate-commands`
    - `validate-skills`

## Expected outcome

When this phase is complete:

- branch pushes will expose impacted validation recommendations without weakening fast gates
- PR and merge-queue failures will retain durable evidence artifacts
- maintainers will have a scheduled flake-ops report based on recent remote evidence rather than memory
- major vs minor release handling will be visible in CI summaries, not only local docs

## Self-check

- Spec coverage: this plan covers workflow wiring, artifact persistence, scheduled aggregation, release-gate enforcement, and release-policy constraints.
- Placeholder scan: no `TODO` or `TBD` placeholders remain.
- Scope check: this is one coherent phase because every task depends on the same architectural move, namely turning local CI governance primitives into remote workflow behavior.

