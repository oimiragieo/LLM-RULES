---
name: memory-discipline-worker
description: Memory index discipline — cap enforcement, pruning, archival, health reporting
---

# Memory Discipline Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that enforce size/line caps on markdown memory files, add pruning logic, archive overflow content, or report memory health.

## Work Procedure

1. **Read the feature description carefully.** Understand which files are affected and what the expected caps are (25KB / 200 lines).

2. **Read source files.** Before modifying:
   - Read `.claude/lib/memory/memory-rotator.cjs` fully (current rotation logic)
   - Read `.claude/lib/memory/memory-paths.cjs` for canonical path definitions
   - Read `AGENTS.md` for CC patterns reference

3. **Write tests first (red).** Create test file at `tests/lib/memory/<descriptive-name>.test.cjs`. Tests should cover:
   - Files over KB cap are pruned
   - Files over line cap are pruned
   - Both caps enforced independently
   - Archive file created with removed content
   - Warning line appended after truncation
   - [PERMANENT] sections preserved
   - Edge cases: empty files, missing files, files under cap
   Use temp directories for isolation. Run tests — they should FAIL.

4. **Implement changes.**
   - Add line-count enforcement alongside existing KB enforcement
   - Lower the KB threshold from 40KB to 25KB
   - Preserve [PERMANENT] sections during pruning
   - Append truncation warning after pruning
   - Archive pruned content with timestamp in filename

5. **Run tests (green).** All tests pass.

6. **Run lint and format.**
   ```
   pnpm lint
   npx prettier --check <modified-files>
   ```

7. **Run existing memory tests for regression.**
   ```
   node --test tests/lib/memory/memory-rotator.test.cjs
   ```

## Example Handoff

```json
{
  "salientSummary": "Added 25KB/200-line dual cap enforcement to memory-rotator.cjs. Preserved [PERMANENT] sections during pruning. Archive file created for overflow. 24 tests.",
  "whatWasImplemented": "enforceMemoryCaps() function in memory-rotator.cjs enforces both 25KB and 200-line caps. Prunes oldest non-[PERMANENT] sections. Archives to .claude/context/memory/archive/<name>-YYYY-MM-DD.md. Appends warning line.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/lib/memory/memory-cap-enforcement.test.cjs", "exitCode": 0, "observation": "24 tests passing" },
      { "command": "node --test tests/lib/memory/memory-rotator.test.cjs", "exitCode": 0, "observation": "Existing tests still pass" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  }
}
```

## When to Return to Orchestrator

- memory-rotator.cjs has a significantly different structure than expected
- [PERMANENT] section format is different than assumed
- Archive directory doesn't exist and can't be created
