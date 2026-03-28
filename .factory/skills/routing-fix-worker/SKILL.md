---
name: routing-fix-worker
description: Fixes bugs in the agent-studio routing system (hooks, lib, state management)
---

# Routing Fix Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that fix bugs in the routing system: hooks in `.claude/hooks/routing/`, library modules in `.claude/lib/routing/`, and state management in `.claude/context/runtime/`. These are surgical fixes to specific identified bugs.

## Work Procedure

1. **Read the feature description** — it identifies the specific bug, affected files, and expected behavior.

2. **Trace the bug** — Use Grep to find the exact code locations. Read only the specific functions mentioned in the feature. Do NOT read entire 2000+ line files. For example, if fixing `resetToRouterMode()`, grep for that function name and read only that function.

3. **Read existing tests** — Check if tests already exist for this area:
   - `tests/lib/routing/` for routing lib tests
   - `tests/hooks/` for hook tests
   - `.claude/hooks/routing/*.test.cjs` for co-located hook tests

4. **Write failing tests FIRST (red)** — Create regression tests that demonstrate the bug. Tests use `node:test` built-in:

   ```javascript
   const { describe, it } = require('node:test');
   const assert = require('node:assert');
   ```

   Place tests in `tests/lib/routing/` or `tests/hooks/` matching existing conventions.

5. **Implement the fix (green)** — Make the minimal change to fix the bug. Do NOT refactor unrelated code.

6. **CRITICAL: Windows file locking** — If fixing race conditions or concurrent writes, use `proper-lockfile` (already a dependency). See `.claude/lib/heartbeat/heartbeat-sentinel.cjs` for the pattern. Never use naive `fs.openSync` locks.

7. **Run tests** — Execute `node --test tests/lib/routing/` and `node --test tests/hooks/` to verify your fix passes and no regressions.

8. **Run validation** — Execute `pnpm validate:routing` to ensure routing consistency.

9. **Manual verification** — Grep for the specific pattern you fixed to confirm no other instances remain.

## Example Handoff

```json
{
  "salientSummary": "Fixed resetToRouterMode() in router-state.cjs to preserve session-scoped fields (plannerSpawned, complexity) across prompt boundaries while still resetting transient fields. Added 3 regression tests covering spawn history preservation, complexity persistence, and transient field reset.",
  "whatWasImplemented": "Modified resetToRouterMode() to check sessionId before resetting session-scoped fields. Added TRANSIENT_FIELDS and SESSION_SCOPED_FIELDS constants to separate concerns. Updated saveStateWithRetry() to use proper-lockfile for atomic writes.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/lib/routing/router-state-reset.test.cjs",
        "exitCode": 0,
        "observation": "3 tests passing, covers spawn preservation, complexity persistence, and transient reset"
      },
      {
        "command": "node --test tests/lib/routing/",
        "exitCode": 0,
        "observation": "All 12 routing tests pass, no regressions"
      },
      {
        "command": "pnpm validate:routing",
        "exitCode": 0,
        "observation": "Routing consistency validated"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Grepped for resetToRouterMode calls across codebase",
        "observed": "Called in user-prompt-unified.core.cjs line 47 and router-state.cjs line 347. Both now use the updated function."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/lib/routing/router-state-reset.test.cjs",
        "cases": [
          {
            "name": "preserves plannerSpawned across prompt reset",
            "verifies": "VAL-RTR-001 spawn history"
          },
          {
            "name": "preserves complexity within same session",
            "verifies": "VAL-RTR-001 complexity persistence"
          },
          {
            "name": "resets transient fields to defaults",
            "verifies": "VAL-RTR-001 transient field reset"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The bug requires changes to CLAUDE.md (the router's system prompt) — that's an orchestrator decision
- The fix would change the behavior of hooks that other features depend on
- Multiple conflicting fixes are needed for the same function
- The bug is actually in a different subsystem (memory, creation, etc.)
