# Deep Dive Audit: Memory System & Core Application

**Audit Date:** 2026-01-31  
**Last Updated:** 2026-02-01  
**Scope:** Memory system, hook wiring, core fundamentals.  
**Standard:** 100% audit — list everything not wired or that won’t work, with clear “what” and “why.”

---

## Executive Summary

- **Loop prevention** is fixed and wired (pre-task-unified updates state; post-task-unified decrements).
- **Router Write Guard** is wired (**Fixed: 2026-02-01**): `router-write-guard.cjs` runs on PreToolUse `Edit|Write|NotebookEdit` to block Router writes without a spawned Task.
- **NotebookEdit consistency** is wired (**Fixed: 2026-02-01**): PostToolUse now uses matcher `Edit|Write|NotebookEdit`, so format-memory / enforce-claude-md-update / code-index-updater run after notebook edits.
- **SessionStart does not exist** in the hook schema. “Session-start” behaviors must be implemented via `UserPromptSubmit`.
- **Memory activation (best-effort)**: SessionEnd now triggers embedding generation and memory maintenance (non-blocking; depends on ChromaDB availability).

---

## 1. Hook Wiring: What Runs vs What Exists

### 1.1 Wired hooks (in `.claude/settings.json`)

These are the only hooks that run. All paths are relative to the project root; commands are `node .claude/hooks/...`.

| Event            | Matcher                 | Hooks |
|------------------|-------------------------|------|
| UserPromptSubmit | `""`                    | state-reset.cjs, user-prompt-unified.cjs, post-creation-reminder.cjs, memory-health-check.cjs |
| PreToolUse       | `""`                    | execution-limit-monitor-hook.cjs |
| PreToolUse       | Bash                    | windows-null-sanitizer, routing-guard, bash-command-validator |
| PreToolUse       | Glob\|Grep\|WebSearch   | routing-guard |
| PreToolUse       | Edit\|Write\|NotebookEdit | file-placement-guard, write-size-validator, routing-guard, router-write-guard, unified-creator-guard, tdd-check, plan-evolution-guard, unified-evolution-guard |
| PreToolUse       | Read                    | validate-skill-invocation |
| PreToolUse       | TaskCreate              | routing-guard |
| PreToolUse       | Task                    | spawn-prompt-assembler, spawn-prompt-validator, pre-spawn-tool-validator, tool-availability-validator, pre-task-unified |
| PreToolUse       | TaskUpdate              | pre-completion-validation |
| PreToolUse       | Skill                   | skill-invocation-tracker |
| PostToolUse      | `""`                    | metrics-collector-hook, error-tracker-hook, anomaly-detector |
| PostToolUse      | Task                    | auto-rerouter, post-task-unified |
| PostToolUse      | Edit\|Write\|NotebookEdit | format-memory, enforce-claude-md-update, code-index-updater |
| PostToolUse      | Task\|TaskUpdate\|Bash  | unified-reflection-handler |
| SessionEnd       | `""`                    | unified-reflection-handler, reflection-queue-processor |

---

## 2. Critical Gaps (Won’t Work or Missing Enforcement)

### 2.1 Router write guard (wired)

- **File:** `hooks/safety/router-write-guard.cjs`
- **Purpose:** PreToolUse(Edit|Write|NotebookEdit). Blocks or warns when the Router uses Edit/Write/NotebookEdit **without** having spawned a Task (enforces “Router delegates to agents”).
- **Current state (Fixed: 2026-02-01):** Wired in `settings.json`.

### 2.2 PostToolUse matcher: NotebookEdit (wired)

- **Current state (Fixed: 2026-02-01):** PostToolUse uses matcher **`Edit|Write|NotebookEdit`**.
- **Effect:** After a **NotebookEdit** tool run, these hooks run: format-memory, enforce-claude-md-update, code-index-updater.

### 2.3 No SessionStart (or equivalent) event

- **Observation:** `settings.json` has UserPromptSubmit, PreToolUse, PostToolUse, SessionEnd. There is **no SessionStart** (or “first user message”) event.
- **Impact:** Hooks that were authored to run on “SessionStart” will never run as standalone hooks and must be folded into `UserPromptSubmit` (or otherwise invoked).

---

## 3. Memory System: What’s Wired vs Best-Effort vs Manual

### 3.1 Memory hooks (wired)

- **memory-health-check.cjs** — UserPromptSubmit. Full health check with tier monitoring + smart pruning + metrics.
- **format-memory.cjs** — PostToolUse `Edit|Write|NotebookEdit`. Formats memory/reports/plans files.

### 3.2 SessionEnd memory activations (best-effort)

These run from `unified-reflection-handler.cjs` on SessionEnd, and are intentionally non-blocking:

- **Embedding generation** — Attempts to write embeddings for modified memory markdown files into ChromaDB (requires ChromaDB availability).
- **Maintenance scheduler** — Runs daily maintenance and weekly maintenance when due.

---

## 4. Critical fixes

| # | Issue | Status |
|---|------|--------|
| 1 | router-write-guard.cjs not wired | ✅ Fixed (2026-02-01) |
| 2 | PostToolUse excludes NotebookEdit | ✅ Fixed (2026-02-01) |
| 3 | SessionStart missing | Open (by design; document/implement via UserPromptSubmit) |
