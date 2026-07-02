---
name: hook-routing-worker
description: Hook enhancements — updatedInput for bash safety prefixes, suppressOutput for verbose blocks, denial-based routing feedback
---

# Hook Routing Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that add hook input/output capabilities (updatedInput, suppressOutput), enhance denial-based routing feedback, or integrate hooks with the routing system.

## Work Procedure

1. **Read the feature description carefully.** Understand the hook protocol fields being added and how they integrate with the routing system.

2. **Read source files.** Before modifying:
   - Read the target hook(s) fully
   - Read `.claude/lib/routing/denial-feedback-reader.cjs` for denial feedback patterns
   - Read `AGENTS.md` for CC dangerous patterns reference

3. **Write tests first (red).** Create test file at `tests/hooks/<descriptive-name>.test.cjs`. Tests must cover:
   - New output fields (updatedInput, suppressOutput) present/absent in correct conditions
   - Integration with denial log (read/write/accumulate)
   - Edge cases (empty logs, malformed data, missing files)
   - Fail-open for advisory hooks, fail-closed for security hooks
   Run tests — they should FAIL (red).

4. **Implement changes.**
   - `updatedInput`: Return in hookSpecificOutput when the hook modifies the command (e.g., prepending safety prefixes). Must not appear when no modification needed.
   - `suppressOutput`: Return `true` when verbose block messages should not inflate context. Only on block events, never on allow.
   - Denial feedback: Use `getDenialFeedback()` from denial-feedback-reader.cjs. Handle missing/corrupted log gracefully.
   - Routing integration: Follow existing patterns in `.claude/lib/routing/`.

5. **Run tests (green).** All tests pass.

6. **Run lint.**
   ```
   pnpm lint
   npx prettier --check <modified-files>
   ```

## Example Handoff

```json
{
  "salientSummary": "bash-command-validator now returns updatedInput.command with safety prefix for multi-line scripts. suppressOutput:true on blocks. 22 tests.",
  "whatWasImplemented": "updatedInput logic: detect multi-line commands missing set -e, prepend set -euo pipefail. suppressOutput:true on exit-2 blocks only. Denial feedback integration tested with seeded logs.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/hooks/bash-updated-input.test.cjs", "exitCode": 0, "observation": "22 tests passing" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  }
}
```

## When to Return to Orchestrator

- Hook output protocol doesn't support updatedInput or suppressOutput fields
- denial-feedback-reader.cjs has a different API than documented
- Routing integration requires changes to modules outside feature scope
