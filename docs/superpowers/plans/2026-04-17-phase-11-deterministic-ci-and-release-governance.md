# Phase 11 Plan: Deterministic CI and Release Governance

Date: 2026-04-17
Owner: Codex planning pass
Status: Proposed
Branch context: `fix/release-readiness-hardening` (PR #176 already open)

## 1. Executive Summary

The current release-readiness hardening branch is in the right state to finish as a non-breaking release candidate, but the next engineering slice should not be another broad feature drop. The highest-leverage next step is a focused Phase 11 that makes CI outcomes more deterministic, adds explicit flake governance, preserves fast-path validation on `feature/**`, `fix/**`, and `refactor/**` branches, and formalizes semver-aware release handling so major releases require stronger evidence than minor ones.

This plan is grounded in:

- Current repo CI topology:
  - fast gate on pushes to `main`, `feature/**`, `fix/**`, `refactor/**` in `.github/workflows/ci.yml`
  - PR/merge-queue full suite in `.github/workflows/full-validation.yml`
  - PR + `main` quality sweep in `.github/workflows/global-quality-gates.yml`
  - governance baseline in `.claude/config/required-status-checks.json`
- Current repo semver posture:
  - `CHANGELOG.md` states Semantic Versioning
  - `.claude/tools/cli/semver-bump-calculator.cjs` already exists and should be promoted from utility to release gate
- Current external evidence:
  - AgentCompass argues for structured post-deployment workflow evaluation with categorization, scoring, and memory over repeated runs: <https://arxiv.org/abs/2509.14647v1>
  - ToolMisuseBench argues that agent reliability improves when tool failures are evaluated under deterministic replay, explicit budgets, and misuse classification: <https://arxiv.org/abs/2604.01508v1>
  - Recent Reddit engineering threads converge on the same operational advice: isolate environments, remove timing assumptions, profile before parallelizing more, and do not let retries become policy:
    - <https://www.reddit.com/r/dev/comments/1rpotk6/how_are_people_actually_dealing_with_flaky_e2e/>
    - <https://www.reddit.com/r/devops/comments/1qr00b5/our_cicd_testing_is_so_slow_devs_just_ignore/>

## 2. Why This Slice Is Next

The repo already has:

- a large Node test surface
- multiple validation layers
- merge-queue aware workflows
- semver tooling primitives
- recent evidence of timing-sensitive and hook-contract regressions

The failure mode now is not lack of features. The failure mode is trust erosion if CI becomes slower, noisier, or semver decisions remain informal. Research and community evidence both point in the same direction: deterministic evaluation and explicit recovery classification outperform ad hoc retries and post hoc manual reasoning.

## 3. Scope Decision

### In Scope

- CI determinism and flake containment
- impacted-scope validation planning without weakening PR safety
- semver-aware release gating for major vs minor changes
- documentation and operator workflow updates for release execution

### Out of Scope

- migrating away from the Node built-in test runner
- introducing a new CI provider
- rewriting the test framework
- broad UX/frontend work not directly tied to release or validation flows
- large routing/modeling feature work unrelated to CI or release governance

## 4. Spec

## 4.1 Product-Level Goal

Make the next release cycle measurably safer by ensuring:

1. engineers can tell whether a failure is a product regression, a test defect, or an environment issue
2. PR validation remains fast on branch pushes without masking risk
3. major releases require explicit migration evidence and stronger review gates than minor releases

## 4.2 Deliverables

### D1. Flake Ledger and Failure Classification

Add a repo-native flake ledger that records:

- failing test identifier
- file path
- failure fingerprint
- run context
- retry count if any
- category:
  - `product_regression`
  - `test_defect`
  - `env_nondeterminism`
  - `unknown`

Expected output surfaces:

- machine-readable JSON artifact under `.claude/context/` or another repo-approved diagnostics path
- human-readable summary command for maintainers

### D2. Deterministic CI Evidence Artifacts

Add structured CI artifacts for failing suites:

- node version
- workflow/job name
- changed files
- test order or shard metadata if applicable
- timing summary
- seed or replay metadata where available

This follows the same principle as ToolMisuseBench: make recovery and diagnosis replayable, not anecdotal.

### D3. Impacted Validation Planner

Introduce a narrow planner that maps changed paths to:

- targeted test files
- targeted validation commands
- recommended benchmark slices

Rules:

- this planner may add targeted checks on branch pushes
- it must not replace full validation on PRs or merge queue
- if the planner cannot classify a change safely, it must fall back to the current full local verification guidance

### D4. Semver Release Gate

Promote the existing semver tooling into a documented release contract:

- minor release path:
  - additive or bug-fix changes only
  - no migration guide required unless operator steps change
  - conventional commit types: `fix`, `feat`, `perf`, `docs`, `refactor` as appropriate
- major release path:
  - breaking schema, CLI, agent, skill, hook, or contract changes
  - explicit migration notes required
  - semver bump evidence required
  - PR review must include breaking-surface checklist
  - merge only through PR after all required gates pass

### D5. Release Runbook Update

Update docs so maintainers have one clear sequence for:

- branch naming
- local verification
- PR creation
- required remote checks
- major vs minor release decision points

## 5. TDD Execution Plan

Every implementation step below follows strict RED -> GREEN -> REFACTOR.

## 5.1 Slice A: Flake Ledger Contract

### RED

Add failing tests for:

- ledger file creation
- failure classification schema validation
- duplicate failure fingerprint coalescing
- unknown-category fallback
- malformed prior ledger recovery

Suggested test targets:

- `tests/lib/ci/flake-ledger.test.cjs`
- `tests/tools/cli/flake-report.test.cjs`

### GREEN

Implement:

- `/.claude/lib/ci/flake-ledger.cjs`
- `/.claude/tools/cli/flake-report.cjs`

### REFACTOR

- extract stable fingerprint helpers
- align artifact path handling with existing validation/reporting utilities
- document JSON schema if the ledger becomes a durable contract

## 5.2 Slice B: CI Failure Evidence Capture

### RED

Add failing tests for:

- evidence payload includes branch/ref, node version, and changed files
- artifact generation is fail-open when CI metadata is missing
- no secrets are written into artifacts

Suggested test targets:

- `tests/lib/ci/failure-evidence.test.cjs`

### GREEN

Implement:

- `/.claude/lib/ci/failure-evidence.cjs`
- wiring in any relevant scripts or workflow-facing CLI wrappers

### REFACTOR

- normalize env reads
- centralize redaction
- keep output stable for downstream tooling

## 5.3 Slice C: Impacted Validation Planner

### RED

Add failing tests for:

- route changes trigger routing validation
- hook/docs changes trigger hooks-doc sync validation
- agent/skill changes trigger agent-skill and registry checks
- benchmark-sensitive files map to benchmark slices
- unknown changes degrade to conservative recommendations

Suggested test targets:

- `tests/lib/ci/impacted-validation-planner.test.cjs`
- `tests/tools/cli/validate-affected.test.cjs`

### GREEN

Implement:

- `/.claude/lib/ci/impacted-validation-planner.cjs`
- `/.claude/tools/cli/validate-affected.cjs`

### REFACTOR

- keep matching rules declarative
- document false-negative avoidance as the governing design constraint

## 5.4 Slice D: Semver Gate

### RED

Add failing tests for:

- breaking change classification requires major path
- additive change remains minor
- docs-only change does not demand major bump
- missing migration guide fails major-release validation
- conventional commit footer `BREAKING CHANGE:` is recognized when required

Suggested test targets:

- `tests/tools/cli/release-gate.test.cjs`
- extend existing semver calculator coverage where appropriate

### GREEN

Implement:

- `/.claude/tools/cli/release-gate.cjs`
- or extend the semver calculator + validator wrapper if that preserves cohesion better

### REFACTOR

- avoid duplicating semver diff logic already present in `.claude/lib/artifacts/semver-diff.cjs`
- keep policy config externalized where practical

## 5.5 Slice E: Documentation and Operator Workflow

### RED

Use doc-sync or validation tests where possible. If no doc tests exist, validation is manual plus existing repo validators.

### GREEN

Update:

- `README.md`
- `CHANGELOG.md`
- release or workflow docs under `.claude/docs/`

### REFACTOR

- compress wording
- avoid duplicating existing workflow docs

## 6. Verification Matrix

Minimum local verification for this slice:

- `pnpm lint`
- `pnpm format:check`
- `pnpm validate`
- `pnpm validate:schemas`
- `pnpm validate:commands`
- `pnpm validate:agent-skill-refs`
- `pnpm validate:hooks:docs`
- `pnpm agents:registry:validate`
- `pnpm validate:status-check-governance`
- `pnpm test`

Additional targeted verification expected as features land:

- new CI/CLI tests
- targeted benchmark slices if planner logic touches performance-sensitive paths

## 7. Release Rules

These rules are anchored to the current repo configuration, not generic Git advice.

### 7.1 Branching

Use a branch name that triggers fast CI automatically:

- `feature/**`
- `fix/**`
- `refactor/**`

Do not invent a new branch namespace for release work unless workflows are updated first.

### 7.2 Minor Release Path

Use this path when changes are additive, compatibility-preserving, or pure bug fixes.

Required:

- conventional commit aligned with scope
- changelog update
- local verification matrix green
- PR opened
- remote checks green:
  - `CI`
  - `Full Validation`
  - `Global Quality Gates`
  - required checks from `.claude/config/required-status-checks.json`:
    - `memory-ci`
    - `memory-mvp-gate`
    - `nightly-strict-gate`
    - `creator-ecosystem-validation`
    - `validate-commands`
    - `validate-skills`

### 7.3 Major Release Path

Use this path when any public contract or operator workflow breaks compatibility.

Required in addition to the minor path:

- explicit semver-major classification evidence
- migration guide
- changelog section that calls out breaking changes
- PR description with rollback plan
- merge only through PR after all gates pass

Strong recommendation:

- keep major-release work on a `feature/**` branch so existing CI still triggers
- use merge queue where appropriate because `pull_request` + `merge_group` are already wired for the full validation workflows

## 8. Research Notes That Affect Scope

The external research does not justify a platform rewrite. It justifies stronger determinism and evaluation discipline.

### AgentCompass Implication

AgentCompass emphasizes post-deployment monitoring, error categorization, thematic clustering, scoring, and dual memory for recurring issues. The repo analogue is a flake ledger plus structured failure evidence, not a new agent framework.

Source:

- <https://arxiv.org/abs/2509.14647v1>

### ToolMisuseBench Implication

ToolMisuseBench emphasizes deterministic replay, explicit retry/call budgets, and fault-specific recovery analysis. The repo analogue is classification of CI/test failures and replayable evidence capture for tool and test misuse, not blind retry loops.

Source:

- <https://arxiv.org/abs/2604.01508v1>

### Reddit Operations Signal

Recent engineering discussion repeatedly identifies the same root causes:

- shared state
- environment drift
- timing assumptions
- selector brittleness
- over-parallelization before profiling

That validates this plan’s emphasis on:

- determinism before more parallelism
- failure classification before retry policy
- split fast-path vs full-path checks without deleting the full-path

Sources:

- <https://www.reddit.com/r/dev/comments/1rpotk6/how_are_people_actually_dealing_with_flaky_e2e/>
- <https://www.reddit.com/r/devops/comments/1qr00b5/our_cicd_testing_is_so_slow_devs_just_ignore/>

## 9. Recommended Order of Execution

1. Close out PR #176 and wait for all remote checks to turn green.
2. Open a new `feature/**` or `fix/**` branch for Phase 11 so fast CI triggers by default.
3. Implement Slice A and Slice B first.
4. Implement Slice C after failure evidence exists, so planner outcomes can be audited.
5. Implement Slice D before merging the slice, so release policy ships with the capability.
6. Finish with doc updates and a release runbook pass.

## 10. Exit Criteria

Phase 11 is done when:

- the repo records and summarizes flaky/failure evidence deterministically
- engineers can run an impacted-validation planner locally
- PR workflows still preserve full validation on PR and merge queue
- semver policy is explicit and test-backed
- major and minor release paths are documented and enforceable

## 11. Recommendation

Proceed with this as a minor, compatibility-preserving engineering initiative unless implementation of the release gate itself introduces a breaking operator contract. The slice should be treated as release-infrastructure hardening, not a product-surface feature.
