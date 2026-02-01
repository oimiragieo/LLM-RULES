# Plan: Memory, Observability, and Loop-Prevention Remediation (2026-02-01)

This plan fixes the remaining gaps from the memory/observability audits and the loop-prevention design.

**Important:** Parts of the system are already consolidated into unified hooks and _are wired today_ via `.claude/settings.json`. This plan focuses on what is still broken or misleading (paths/docs), and what is missing for loop-prevention to actually work.

---

## Current state (verified against `.claude/settings.json`)

| Component                                              | Wired? | Notes                                                                                       |
| ------------------------------------------------------ | -----: | ------------------------------------------------------------------------------------------- | ------ |
| `.claude/hooks/memory/format-memory.cjs`               |    Yes | `PostToolUse` for `Edit                                                                     | Write` |
| `.claude/hooks/routing/user-prompt-unified.cjs`        |    Yes | `UserPromptSubmit`; includes “memory reminder” + “memory health check” logic inlined        |
| `.claude/hooks/memory/memory-health-check.cjs`         |     No | Standalone script exists, but not registered; has a **wrong dashboard path** (see Phase 2)  |
| `.claude/hooks/session/memory-reminder.cjs`            |     No | **Deprecated**; intentionally not registered (consolidated into `user-prompt-unified.cjs`)  |
| `.claude/hooks/monitoring/error-tracker.cjs`           |     No | Not registerable as-is: exports `preToolUse/postToolUse` but is not a hook “command” script |
| `.claude/hooks/monitoring/metrics-collector.cjs`       |     No | Same: exports `preToolUse/postToolUse`, not a hook “command” script                         |
| `.claude/hooks/monitoring/execution-limit-monitor.cjs` |     No | Not a hook script; it’s a library used by tests/integration code                            |
| `.claude/hooks/routing/pre-task-unified.cjs`           |    Yes | Runs on `PreToolUse` for `Task`; enforces loop limits by reading `loop-state.json`          |
| `.claude/hooks/self-healing/loop-prevention.cjs`       |     No | Standalone `PreToolUse(Task)` hook that **updates** loop state, but it is not registered    |

### The core bug: loop prevention reads state, but nothing updates it

`pre-task-unified.cjs` enforces limits using `.claude/context/self-healing/loop-state.json`, but _no wired hook updates_ `spawnDepth` / `evolutionCount`. The only code that mutates those counters is inside `.claude/hooks/self-healing/loop-prevention.cjs`, which is currently **not registered**, so the counters stay at 0 and the guard is ineffective.

---

## Phase 1: Fix loop-prevention so it actually works (critical)

**Goal:** Ensure `spawnDepth` and `evolutionCount` are updated as part of the existing wired Task hook flow:

- `PreToolUse(Task)` should increment state _before_ enforcement decisions (so nesting is measurable).
- `PostToolUse(Task)` should decrement spawn depth on completion.

### Recommended approach (fits current wiring): move state updates into the unified routing hooks

1. Add a small shared module:
   - New file: `.claude/lib/self-healing/loop-state-manager.cjs`
   - Owns the state file path: `.claude/context/self-healing/loop-state.json`
   - Exposes:
     - `getState()`
     - `recordSpawn(agentType)` (increments `spawnDepth`)
     - `decrementSpawnDepth()` (best-effort clamp to 0)
     - `recordEvolution(type)` (increments `evolutionCount`)
     - `recordAction(action)` (optional, for pattern tracking)

2. Update `.claude/hooks/routing/pre-task-unified.cjs`:
   - After it decides a Task call is allowed (i.e., right before returning “allowed”), call:
     - `recordSpawn(agentType)` (or a conservative “unknown” if agentType can’t be inferred)
     - `recordAction(\`spawn:${agentType}\`)`
     - `recordEvolution(type)` if the Task prompt indicates an evolution operation (if you keep that concept)

3. Update `.claude/hooks/routing/post-task-unified.cjs`:
   - Always call `decrementSpawnDepth()` after a `Task` completes (success or failure) so nesting unwinds.

4. Keep or retire `.claude/hooks/self-healing/loop-prevention.cjs`:
   - Once the unified hooks update state, the standalone hook becomes redundant.
   - Keep it as a reference/deprecated file, or repurpose it to _only_ export pure helpers that delegate to the new manager.

### Alternative (less code, but more moving parts): register `loop-prevention.cjs`

Add `.claude/hooks/self-healing/loop-prevention.cjs` to `.claude/settings.json` under `PreToolUse` matcher `Task` **before** `pre-task-unified.cjs`.

This is only viable if you also:

- decide which hook owns enforcement to avoid double-blocking, and
- ensure spawn depth gets decremented (either by porting decrement logic into `post-task-unified.cjs`, or by adding a matching PostToolUse hook).

---

## Phase 2: Memory health check path correctness (bugfix)

`memory-health-check.cjs` currently resolves the dashboard to:

- `.claude/lib/memory-dashboard.cjs`

…but the real file lives at:

- `.claude/lib/memory/memory-dashboard.cjs`

Fix `getMemoryDashboardPath()` in:

- `.claude/hooks/memory/memory-health-check.cjs`

### Wiring decision (pick one, don’t double-run)

Because `user-prompt-unified.cjs` already runs on `UserPromptSubmit` and includes a memory-health check section, decide:

- **Option A (recommended):** Keep the inlined check only, and treat `memory-health-check.cjs` as a manual/diagnostic CLI script.
- **Option B:** Wire `memory-health-check.cjs` in `.claude/settings.json` (e.g. `UserPromptSubmit`) and remove the inlined health-check from `user-prompt-unified.cjs` to avoid drift/duplication.

---

## Phase 3: Observability hooks (wiring requires wrappers or integration)

The current monitoring “hooks” under `.claude/hooks/monitoring/` are _library-style modules_ (they export functions) and do **not** implement the stdin/stdout hook command contract used by `.claude/settings.json`.

To make them run automatically, pick one approach:

### Option A: Add hook-command wrappers (recommended)

Create small command-style hook scripts that:

- parse hook input (`.claude/lib/utils/hook-input.cjs` utilities),
- call the monitoring modules, and
- write output to stdout.

Then register the wrappers in `.claude/settings.json` (e.g. `PostToolUse` matcher `""` for broad coverage, or a narrow matcher like `Task|TaskUpdate|Bash`).

### Option B: Integrate observability into existing wired unified hooks

Add metrics/error logging into:

- `.claude/hooks/routing/pre-task-unified.cjs`
- `.claude/hooks/routing/post-task-unified.cjs`
- `.claude/hooks/reflection/unified-reflection-handler.cjs`

This avoids extra hook processes but increases complexity of the unified hooks.

---

## Phase 4: Dead code and docs alignment

1. Confirm deprecated / consolidated files are marked clearly (and not referenced by docs as “wired”):
   - `.claude/hooks/session/memory-reminder.cjs` is already marked deprecated.
   - `.claude/hooks/memory/extract-workflow-learnings.cjs` appears to be unused; either deprecate or delete.
   - Session memory hooks live in `.claude/hooks/memory/` (not `.claude/hooks/session/`).

2. Update docs to match reality:
   - `.claude/docs/HOOKS_REFERENCE.md` currently references `memory-reminder` being registered, but it is not present in `.claude/settings.json`.
   - Document where metrics are written:
     - `.claude/context/metrics/` (observability)
     - `.claude/context/memory/metrics/` (memory health)

---

## Verification checklist

- Trigger a `Task` and confirm `.claude/context/self-healing/loop-state.json` changes:
  - `spawnDepth` increments on `PreToolUse(Task)`
  - `spawnDepth` decrements on `PostToolUse(Task)`
  - `evolutionCount` increments only when appropriate
- Run `node .claude/hooks/memory/memory-health-check.cjs` and confirm it loads `.claude/lib/memory/memory-dashboard.cjs` correctly.
- Confirm docs match `.claude/settings.json` (no “wired” claims for unregistered hooks).
