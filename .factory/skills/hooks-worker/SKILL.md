---
name: hooks-worker
description: Hook system optimization — async conversion, consolidation, deduplication, new hook events
---

# Hooks Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that modify `.claude/settings.json` hook registrations, create new hook scripts, consolidate existing hooks, or add new hook event categories.

## Work Procedure

1. **Read the feature description carefully.** Understand exactly which hooks to modify, what safety classification to respect, and what the expected settings.json structure should be.

2. **Baseline snapshot.** Before ANY changes, read `.claude/settings.json` and record:
   - Total hook count per event category
   - Which hooks are async vs sync
   - Which hooks have timeout_ms
   - The exact matcher strings for hooks being modified

3. **Write tests first (red).** Create test file at `tests/hooks/<descriptive-name>.test.cjs`. Tests should verify:
   - settings.json structure (JSON validity, event categories present)
   - Hook classification (async/sync status per hook)
   - Matcher coverage (all tool names in combined matchers)
   - For new hooks: input/output behavior, error handling, fail-open behavior
   - For consolidated hooks: error isolation, sub-function invocation
   Run tests — they should FAIL (red).

4. **Implement changes.**
   - For settings.json edits: Read the full file, make targeted edits, write back. ALWAYS validate JSON after writing.
   - For new hook scripts: Follow established patterns from existing hooks. Use `'use strict'`, `project-root.cjs`, `safeParseJSON`, `formatResult()`. Security hooks exit 2 to block; advisory hooks exit 0.
   - For consolidated hooks: Import sub-modules with try/catch per call. Always exit 0. Respect kill-switch env vars.
   - NEVER make a security hook async. NEVER remove a security hook's ability to block.

5. **Run tests (green).** All tests pass. Fix any failures.

6. **Validate settings.json.**
   ```
   node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"
   ```

7. **Run lint and format.**
   ```
   pnpm lint
   pnpm format:check
   ```

8. **Manual verification.** For new hooks, run them manually with sample input to verify behavior. For settings.json changes, diff against baseline to confirm only intended changes were made.

## Example Handoff

```json
{
  "salientSummary": "Converted 22 advisory hooks to async:true in settings.json. Zero security hooks affected. Added timeout_ms to 40 hooks that were missing it. settings.json valid JSON with all 7 event categories preserved. Created tests/hooks/hook-async-classification.test.cjs (15 tests).",
  "whatWasImplemented": "Parsed settings.json, classified each hook by reading its source (exit 2 = blocking/sync, exit 0 = advisory/async candidate). Added async:true to 22 advisory hooks across UserPromptSubmit, PostToolUse, PostToolUseFailure. Left all 18 security/blocking hooks as sync. Added timeout_ms to 40 hooks: 5000ms for simple advisory, 10000ms for monitoring, 15000ms for file-scanning, 30000ms for cleanup.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/hooks/hook-async-classification.test.cjs",
        "exitCode": 0,
        "observation": "15 tests passing"
      },
      {
        "command": "node -e \"JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))\"",
        "exitCode": 0,
        "observation": "Valid JSON"
      },
      {
        "command": "pnpm lint",
        "exitCode": 0,
        "observation": "0 errors"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/hooks/hook-async-classification.test.cjs",
        "cases": [
          { "name": "advisory hooks have async:true", "verifies": "VAL-HO-003" },
          { "name": "security hooks do NOT have async:true", "verifies": "VAL-HO-002" },
          { "name": "all hooks have timeout_ms", "verifies": "VAL-HO-004" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A hook you need to modify doesn't exist at the expected path
- You're unsure whether a hook is security-critical or advisory
- Consolidation would require changing a hook's exit code behavior
- settings.json has an unexpected structure that doesn't match the baseline
- A hook depends on another hook's execution order and consolidation would break that dependency
