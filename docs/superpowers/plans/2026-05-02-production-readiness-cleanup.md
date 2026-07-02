# Production Readiness Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current dirty worktree into a production-ready, reviewable set of changes by fixing high-risk defects, documenting any intentionally risky cleanup, and verifying the result.

**Architecture:** Work risk-first: protect runtime write guards, path handling, integration queue contracts, and validation surfaces before reviewing generated churn and docs. Preserve existing user changes; do not revert broad cleanup unless a concrete defect is found.

**Tech Stack:** Node.js CommonJS/ESM scripts, JSON Schema, markdown docs, pnpm scripts, native Windows plus WSL Cursor wrapper.

---

## File Map

- Runtime guard: `.claude/hooks/safety/write-pretool-bundle.cjs`
- Worktree guard: `.claude/hooks/safety/worktree-preflight-check.cjs`
- Integration queue: `.claude/lib/workflow/integration-queue-contract.cjs`, `.claude/schemas/integration-queue-entry.schema.json`
- Path/CWD hardening: `.claude/hooks/**`, `.claude/lib/context/**`, `.claude/lib/utils/**`, `scripts/**`
- Tooling: `eslint.config.js`, `.eslintignore`, `package.json`, `scripts/validation/validate-sync.*`
- Memory cleanup: `.claude/context/memory/**`
- Cursor workflow: `scripts/agents/run-cursor-worker.mjs`, `scripts/agents/run-cursor-worker.sh`, `tests/scripts/run-cursor-worker.test.cjs`, `docs/cursor-agent-workflow.md`
- Verification tests: all changed tests under `tests/**`

## Task 1: Runtime Write Guard And Queue Contract

**Files:**

- Modify if needed: `.claude/hooks/safety/write-pretool-bundle.cjs`
- Modify if needed: `.claude/lib/workflow/integration-queue-contract.cjs`
- Modify if needed: `.claude/schemas/integration-queue-entry.schema.json`
- Modify if needed: `tests/hooks/write-pretool-runtime-queue-guard.test.cjs`

- [ ] **Step 1: Inspect the guard behavior**

Run:

```bash
git diff -- .claude/hooks/safety/write-pretool-bundle.cjs .claude/lib/workflow/integration-queue-contract.cjs .claude/schemas/integration-queue-entry.schema.json tests/hooks/write-pretool-runtime-queue-guard.test.cjs
```

Verify that runtime queue files cannot be wiped or rewritten by unrelated agents, path normalization rejects traversal/encoded bypasses, and any allowed writers are explicitly justified.

- [ ] **Step 2: Add or repair regression coverage first**

If a behavior is not covered, add a failing test before changing implementation. Required behaviors:

- Non-owner agents cannot overwrite queue files.
- Allowed agents can append only valid entries where append-only behavior is intended.
- Percent-encoded or UNC-style path variants cannot bypass the guard.
- Malformed integration queue entries fail schema/contract validation.

Run targeted tests and confirm any new test fails before implementation:

```bash
node --test tests/hooks/write-pretool-runtime-queue-guard.test.cjs
```

- [ ] **Step 3: Patch minimally**

Fix only the runtime guard and contract code needed to satisfy the tests. Do not broaden agent allowlists unless a test documents the intended writer.

- [ ] **Step 4: Verify targeted guard tests**

Run:

```bash
node --test tests/hooks/write-pretool-runtime-queue-guard.test.cjs tests/hooks/worktree-preflight-check.test.cjs tests/hooks/unified-creator-guard-comprehensive.test.cjs
```

Expected: all pass.

## Task 2: Worktree, Project Root, And Path Safety

**Files:**

- Modify if needed: `.claude/hooks/safety/worktree-preflight-check.cjs`
- Modify if needed: `.claude/hooks/startup/worktree-prune-on-start.cjs`
- Modify if needed: `.claude/lib/context/session-id-manager.cjs`
- Modify if needed: `.claude/lib/context/shift-change-log-reader.cjs`
- Modify if needed: `.claude/lib/context/shift-change-log-writer.cjs`
- Modify if needed: `tests/hooks/project-root-cwd-audit.test.cjs`
- Modify if needed: `tests/lib/context/project-root-defaults.test.cjs`

- [ ] **Step 1: Inspect changed path-root logic**

Run representative diffs for the files above. Confirm no code now depends on ambient `process.cwd()` where subprocesses or hooks may run from another directory.

- [ ] **Step 2: Add failing tests for any uncovered path bug**

Prefer tests that set `cwd` to a temp child directory and assert project-root-derived paths still resolve inside the repo/runtime root.

- [ ] **Step 3: Patch path resolution**

Use existing project-root helpers where present. Avoid ad hoc string path checks; use `path.resolve`, `realpath`, and `path.relative` containment checks.

- [ ] **Step 4: Verify targeted path tests**

Run:

```bash
node --test tests/hooks/project-root-cwd-audit.test.cjs tests/lib/context/project-root-defaults.test.cjs tests/hooks/worktree-preflight-check.test.cjs
```

Expected: all pass.

## Task 3: Tooling And Install Surface

**Files:**

- Modify if needed: `eslint.config.js`
- Modify if needed: `.eslintignore`
- Modify if needed: `package.json`
- Modify if needed: `tests/package-json-validation.test.mjs`
- Modify if needed: `scripts/validation/validate-sync.mjs`
- Modify if needed: `scripts/validation/validate-sync.sh`

- [ ] **Step 1: Verify ESLint ignore migration**

If `.eslintignore` is deleted, confirm equivalent ignore patterns exist in flat config for `node_modules`, worktrees, generated caches, and runtime artifacts.

- [ ] **Step 2: Verify native dependency policy**

Confirm the `better-sqlite3` entry in `pnpm-workspace.yaml` `allowBuilds` is intentional and covered by package validation tests.

- [ ] **Step 3: Patch validation tests first if gaps exist**

Run:

```bash
node --test tests/package-json-validation.test.mjs
```

Add failing assertions before changing package/tooling behavior.

- [ ] **Step 4: Verify tooling**

Run:

```bash
node --test tests/package-json-validation.test.mjs
pnpm lint
```

Expected: all pass.

## Task 4: Memory Cleanup And Generated Churn

**Files:**

- Inspect: `.claude/context/memory/archive/**`
- Inspect/modify if needed: `.claude/context/memory/learnings.md`
- Inspect/modify if needed: `.claude/context/memory/archive/learnings-2026-05-01.md`
- Inspect generated: `.claude/config/skill-index.json`, `.claude/context/agent-registry.json`, `.claude/context/config/agent-skill-matrix.json`, `.claude/config/agent-config.json`

- [ ] **Step 1: Spot-check archive deletions**

For at least the largest deleted archive file, compare removed content against the new consolidated memory file. If unique operational knowledge is lost, restore or summarize it.

- [ ] **Step 2: Confirm generated files are reproducible**

Run the repo’s validation/generation scripts only if they are documented as non-destructive. If they mutate files, report that and keep the diff minimal.

- [ ] **Step 3: Verify generated consistency**

Run:

```bash
pnpm validate:index
pnpm validate:sync
pnpm validate:schemas
```

Expected: all pass.

## Task 5: Cursor Workflow Slice

**Files:**

- Modify if needed: `scripts/agents/run-cursor-worker.mjs`
- Modify if needed: `scripts/agents/run-cursor-worker.sh`
- Modify if needed: `tests/scripts/run-cursor-worker.test.cjs`
- Modify if needed: `docs/cursor-agent-workflow.md`
- Modify if needed: `docs/templates/cursor-worker-task.md`

- [ ] **Step 1: Verify safe wrapper behavior**

Run:

```bash
node --test tests/scripts/run-cursor-worker.test.cjs
node --check scripts/agents/run-cursor-worker.mjs
wsl bash -n /mnt/c/dev/projects/agent-studio/scripts/agents/run-cursor-worker.sh
```

Expected: all pass.

- [ ] **Step 2: Patch only concrete failures**

If the wrapper can expose prompt Markdown to `bash -lc`, fix it. If non-login WSL cannot find `cursor-agent`, ensure `$HOME/.local/bin` is on PATH.

## Task 6: Final Verification And Report

**Files:**

- Create/modify: `.tmp/production-readiness-cursor-report.md`

- [ ] **Step 1: Run focused tests for changed areas**

Run each targeted command from Tasks 1-5 that applies to files actually touched.

- [ ] **Step 2: Run broad validation**

Run:

```bash
pnpm validate:full
pnpm format:check
git diff --check
```

If `pnpm lint` was not already run in Task 3, run it here too.

- [ ] **Step 3: Write the report**

Write `.tmp/production-readiness-cursor-report.md` with:

- Files changed by Cursor.
- Tests/commands run with exit codes.
- Defects fixed.
- Remaining risks or files intentionally not changed.
- Any generated files that changed during validation.
