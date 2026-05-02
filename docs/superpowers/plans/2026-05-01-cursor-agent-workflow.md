# Cursor Agent Worker Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, repeatable way to delegate bounded coding tasks to Cursor Agent through WSL.

**Architecture:** A small Node ESM runner resolves a prompt file under the workspace, converts host paths to WSL paths, and invokes `cursor-agent` through `wsl bash -lc` with `spawnSync` and `shell: false`. Documentation and a reusable task template define the human process around planning, Cursor implementation, mini-agent audit, and Codex verification.

**Tech Stack:** Node.js ESM, WSL, Cursor Agent CLI, Node's built-in test runner.

---

Production-safe delegation: **Codex plans -> Cursor implements through WSL -> mini agents audit -> Codex verifies**.

## Tasks

- [x] **Step 1: Write failing runner tests** in `tests/scripts/run-cursor-worker.test.cjs` for CLI parsing, prompt path safety, WSL path conversion, invocation construction, unsafe model rejection, and dry-run behavior.
- [x] **Step 2: Verify red state** with `node --test tests/scripts/run-cursor-worker.test.cjs`; expected failure is missing runner module or missing runner behavior.
- [x] **Step 3: Implement the runner** in `scripts/agents/run-cursor-worker.mjs` with exported helpers, explicit prompt requirement, `spawnSync`, `shell: false`, `windowsHide: true`, safe model validation, and dry-run JSON output.
- [x] **Step 4: Add workflow documentation** in `docs/cursor-agent-workflow.md` with process, commands, responsibilities, and safety notes.
- [x] **Step 5: Add reusable prompt template** in `docs/templates/cursor-worker-task.md` with goal, scope, allowed files, TDD steps, acceptance criteria, verification commands, final response requirements, and forbidden actions.
- [x] **Step 6: Verify green state** with the targeted test, syntax check, formatter check, and final local verification.

## Verification commands (exact)

```bash
node --test tests/scripts/run-cursor-worker.test.cjs
node --check scripts/agents/run-cursor-worker.mjs
pnpm format:check
```

Expect: tests and syntax check exit `0`. `pnpm format:check` should pass for touched files once formatted.

## Notes

- `package.json` was not modified; invoke the runner with `node scripts/agents/run-cursor-worker.mjs ...`.
- `--trust` and `--force` are explicit opt-ins for headless coding runs, not defaults.
