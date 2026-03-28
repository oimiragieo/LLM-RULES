---
name: verification-worker
description: Verifies system integrity after fixes, runs regression tests, identifies remaining issues
---

# Verification Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that verify system behavior after routing, hierarchical, and creator fixes are complete. This includes memory system verification, session handoff testing, hook enforcement validation, code indexing verification, cross-area flow testing, and full regression testing.

## Work Procedure

1. **Read the feature description** — it specifies which subsystem to verify and what assertions to validate.

2. **Run baseline tests first** — Before investigating anything:

   ```
   pnpm test
   pnpm test:framework
   pnpm validate:routing
   ```

   Record results. If baseline tests fail, document failures as discovered issues.

3. **Verify the specific subsystem** — Follow the feature's verification steps:

   **For memory verification:**
   - Run `pnpm test:framework` with memory-specific tests
   - Run `pnpm metrics:memory:slo:ci` for memory SLO validation
   - Run `pnpm metrics:memory:audit` for write audit
   - If tests fail, trace the failure to determine if it's a pre-existing issue or a regression from M1-M3

   **For session handoff:**
   - Run existing handover detector tests
   - Verify session-budget-watchdog thresholds
   - Check that handoff state files are written correctly

   **For hook enforcement:**
   - Run `pnpm validate:hooks:docs`
   - Run `pnpm validate:routing`
   - Grep for raw `JSON.parse` usage (should use `safeParseJSON`)
   - Verify hooks fail-open

   **For code indexing:**
   - Run `pnpm test:code-indexing`
   - Verify BM25 health check

   **For cross-area flows:**
   - Test the specific flow described in the feature
   - Use integration test: `pnpm integration:headless`

4. **Write missing tests** — If the subsystem lacks test coverage for the assertions, write tests using `node:test`.

5. **Document findings** — For each assertion being verified:
   - PASS: test exists and passes
   - FAIL: describe what failed and why
   - BLOCKED: describe what prevents testing

6. **Run full regression** — After all verifications:
   ```
   pnpm test
   pnpm validate:full:parallel
   pnpm integration:headless
   ```

## Example Handoff

```json
{
  "salientSummary": "Verified memory system end-to-end: STM write/read round-trip works, MTM consolidation functions correctly, LTM promotion works, capacity enforcement caps MTM at 10 sessions. All 4 memory assertions PASS. Found 1 discovered issue: evictStaleLTMFiles() uses hardcoded 30-day retention instead of configurable threshold.",
  "whatWasImplemented": "Added 6 new memory verification tests covering STM round-trip, MTM consolidation, LTM promotion, capacity enforcement, memory injection budget, and graceful degradation. All existing memory tests continue to pass.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "pnpm test:framework",
        "exitCode": 0,
        "observation": "All framework tests pass including memory tests"
      },
      {
        "command": "pnpm metrics:memory:slo:ci",
        "exitCode": 0,
        "observation": "Memory SLOs within bounds: write p95 < 120ms, lock wait p95 < 40ms"
      },
      {
        "command": "pnpm metrics:memory:audit",
        "exitCode": 0,
        "observation": "No memory leaks detected"
      },
      {
        "command": "pnpm validate:full:parallel",
        "exitCode": 0,
        "observation": "Full validation suite passes"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Verified STM write creates file at expected path",
        "observed": "stm/session_current.json created with correct schema"
      },
      {
        "action": "Verified MTM cap at 10 sessions after 15 consolidations",
        "observed": "getMTMSessions().length === 10 after 15th consolidation, 5 oldest summarized to LTM"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/lib/memory/memory-tiers-verification.test.cjs",
        "cases": [
          { "name": "STM write and read round-trip", "verifies": "VAL-SYS-001" },
          { "name": "MTM consolidation from STM", "verifies": "VAL-SYS-002" },
          { "name": "LTM promotion from MTM", "verifies": "VAL-SYS-003" },
          { "name": "MTM capacity enforcement at 10", "verifies": "VAL-SYS-004" }
        ]
      }
    ]
  },
  "discoveredIssues": [
    {
      "severity": "low",
      "description": "evictStaleLTMFiles() uses hardcoded 30-day retention instead of configurable LTM_RETENTION_DAYS env var",
      "suggestedFix": "Add LTM_RETENTION_DAYS env var with 30 default in eviction function"
    }
  ]
}
```

## When to Return to Orchestrator

- Baseline tests fail with errors that appear to be regressions from M1-M3
- A subsystem is fundamentally broken (not just a bug but architectural issue)
- Test infrastructure is missing (no test runner, missing dependencies)
- Cross-area flow testing reveals that a previous milestone's fix is incomplete
