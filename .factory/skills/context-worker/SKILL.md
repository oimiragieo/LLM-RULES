---
name: context-worker
description: Context management — pre-compact persistence, threshold alignment, microcompact/circuit breaker detection
---

# Context Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that modify context management hooks, memory consolidation, daily log infrastructure, mtime-based locking, or session-counting triggers.

## Work Procedure

1. **Read the feature description carefully.** Understand the exact behavior changes and how they integrate with existing memory infrastructure.

2. **Read source files.** Before modifying:
   - Read ALL files mentioned in the feature's preconditions and description
   - Read `AGENTS.md` for CC patterns reference and key file locations
   - Read existing tests for files being modified

3. **Write tests first (red).** Create test file at `tests/lib/memory/<descriptive-name>.test.cjs` or `tests/hooks/<name>.test.cjs`. Tests must cover:
   - Happy path (expected behavior)
   - Edge cases (missing files, empty data, corrupted input)
   - Fail-open behavior (errors caught, session not crashed)
   - Backward compatibility (existing API still works)
   Use temp directories for filesystem isolation. Run tests — they should FAIL.

4. **Implement changes.**
   - Memory operations MUST be fail-open (try/catch, exit 0)
   - Use `path.join()` for all paths (Windows compatibility)
   - Use UTC for all timestamps
   - Use `fs.appendFileSync` for daily log appends
   - Use `atomicWriteSync` for critical file updates
   - Preserve backward compatibility with existing APIs

5. **Run tests (green).** All tests pass.

6. **Run lint and format.**
   ```
   pnpm lint
   npx prettier --check <modified-files>
   ```

7. **Run related existing tests for regression.**

## Example Handoff

```json
{
  "salientSummary": "Created daily log writer with UTC timestamped entries, recursive dir creation, and fail-open behavior. Integrated into session-end hook. 18 tests.",
  "whatWasImplemented": "appendDailyLog() in memory-daily-log.cjs creates logs/YYYY/MM/YYYY-MM-DD.md directories recursively, appends timestamped bullets, sanitizes content. Session-end hook calls appendDailyLog after STM→MTM promotion.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/lib/memory/daily-log.test.cjs", "exitCode": 0, "observation": "18 tests passing" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  }
}
```

## When to Return to Orchestrator

- Session-end hook has a significantly different structure than expected
- File locking mechanism conflicts with the new approach
- Existing memory-tiers API would need breaking changes
