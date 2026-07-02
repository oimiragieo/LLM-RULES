---
name: prompt-cache-worker
description: Prompt assembler optimization — sorting, memoization, cache-break detection, integration tests
---

# Prompt Cache Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that modify the prompt assembler pipeline (.claude/lib/spawn/), add caching/memoization layers, or create cache-break detection modules.

## Work Procedure

1. **Read the feature description carefully.** Understand which prompt assembler files to modify and what the expected behavior is.

2. **Read existing code.** Before any changes, read ALL files in .claude/lib/spawn/ to understand the full assembly pipeline. Pay special attention to:
   - `prompt-assembler.cjs` — main entry (assembleSpawnPrompt, buildBasePrompt)
   - `prompt-assembler-sections.cjs` — section builders (buildToolsSection, buildSkillsSection, injectSections)
   - `prompt-assembler-data.cjs` — data loading (filterAndDescribeTools, getSkillsByAgent, caches)
   - How sections are concatenated in injectSections() — this order is critical for cache

3. **Write tests first (red).** Create test files. Tests should use mocks for tool-manifest.json and skill-index.json to avoid dependency on disk state. Use node:test and node:assert. Tests should verify:
   - Determinism (same inputs → same outputs)
   - Ordering (alphabetical)
   - Memoization hits/misses (call counters)
   - Cache invalidation (changed inputs → fresh output)
   Run tests — they should FAIL (red).

4. **Implement changes.** Key patterns:
   - Sorting: `.sort((a, b) => a.name.localeCompare(b.name))` after filtering
   - Memoization: `Map<string, string>` with JSON.stringify key or custom hash
   - Hashing: `crypto.createHash('sha256').update(content).digest('hex')`
   - Flight recorder: `require('../monitoring/flight-recorder.cjs').record()`
   - IMPORTANT: All changes must be backward-compatible — existing callers must work unchanged

5. **Run tests (green).** All tests pass.

6. **Verify no regressions.** Run any existing spawn-related tests.

7. **Lint and format.**
   ```
   pnpm lint
   pnpm format:check
   ```

## Example Handoff

```json
{
  "salientSummary": "Added alphabetical sorting to filterAndDescribeTools() and getSkillsByAgent(). Eliminated duplicate TaskUpdate contract from buildBasePrompt() (kept in buildToolsSection()). Created tests/lib/spawn/prompt-sorting.test.cjs with 12 tests verifying deterministic ordering and single contract.",
  "whatWasImplemented": "In prompt-assembler-data.cjs: added .sort((a,b) => a.name.localeCompare(b.name)) after tool filtering and after skill tier grouping. In prompt-assembler.cjs: removed TaskUpdate contract block from Patch 4 (agent protocol injection) since it already exists in buildToolsSection(). Created test file with mocked tool-manifest and skill-index.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/lib/spawn/prompt-sorting.test.cjs", "exitCode": 0, "observation": "12 tests passing" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  },
  "tests": {
    "added": [{ "file": "tests/lib/spawn/prompt-sorting.test.cjs", "cases": [
      { "name": "tools sorted alphabetically", "verifies": "VAL-PC-001" },
      { "name": "skills sorted within tiers", "verifies": "VAL-PC-002" },
      { "name": "TaskUpdate contract appears once", "verifies": "VAL-PC-005" }
    ]}]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- assembleSpawnPrompt() signature or return type needs to change
- Memoization invalidation logic is unclear for a specific section
- Flight recorder module doesn't exist or has different API than expected
- Existing tests break and the fix isn't obvious
