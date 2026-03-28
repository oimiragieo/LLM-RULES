---
name: reflection-worker
description: Fixes reflection system, evolution triggers, token reporting, and hook registration
---

# Reflection Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:

- Reflection score tracker calibration and normalization
- Hook registration in settings.json
- Token reporting pipeline fixes
- TokenAccountant persistence
- Evolution trigger behavior
- RECE reflection loop verification

## Work Procedure

1. **Read the feature description and CTO Directive #2 from AGENTS.md.**

2. **For score tracker work:** Before ANY changes to `reflection-score-tracker.cjs`:
   - Read `.claude/agents/core/reflection-agent.md` to determine the ACTUAL scoring rubric
   - Note the scale (0-1 vs 1-10) the prompt asks for
   - Read existing score entries in reflection-log.jsonl to see what the LLM actually outputs
   - Design normalization that handles BOTH scales defensively

3. **Write tests first (red):**
   - Create test cases for 0-1 scale input
   - Create test cases for 1-10 scale input
   - Create test cases for mixed-scale input
   - Create test cases for edge cases (0, 1, 10, NaN, undefined)
   - Confirm all fail

4. **Implement the fix (green):**
   - Add normalization logic: `if (score <= 1.0) normalizedScore = score * 10`
   - Update LOW_SCORE_THRESHOLD to match the rubric's Critical Fail boundary
   - Ensure protected agents are excluded
   - Ensure cooldown is respected

5. **For hook registration:** When registering hooks in settings.json:
   - Read the existing hook format carefully
   - Match the exact structure (event, command, matcher patterns)
   - Verify the hook file exists and is parseable
   - Test that the hook fires on the correct event

6. **For token reporting:** When fixing post-pipeline-token-report.cjs:
   - Add structural detection (remaining tasks count, explicit metadata flag)
   - Keep keyword detection as FALLBACK only
   - Add unit test for non-keyword pipeline completion
   - Add unit test for false-positive prevention

7. **For TokenAccountant persistence:**
   - Use atomic writes (write-to-temp + rename)
   - Handle corrupted file gracefully (try-catch, empty init)
   - Handle missing file gracefully (create on first write)
   - Add load() method that reads from disk

8. **Run all reflection-related tests:**

   ```
   node --test tests/hooks/reflection-*.test.cjs
   node --test tests/lib/reflection-score-tracker.test.cjs
   ```

9. **Run broader suites** for regression check:

   ```
   pnpm test:framework
   ```

10. **Commit** with descriptive message.

## Example Handoff

```json
{
  "salientSummary": "Fixed reflection-score-tracker.cjs: added defensive normalization (scores <= 1.0 multiplied by 10), calibrated LOW_SCORE_THRESHOLD to 4.0 (matching Critical Fail < 0.4 rubric = 4.0 on 1-10 scale). Registered force-step0-execution.cjs and reflection-data-aggregator.cjs in settings.json. Fixed token report to use structural pipelineComplete detection. Added disk persistence to TokenAccountant with atomic writes.",
  "whatWasImplemented": "Score normalization in reflection-score-tracker.cjs handles 0-1 and 1-10 scales. Two hooks registered. Token report uses metadata.pipelineComplete as primary signal. TokenAccountant persists to .claude/context/metrics/token-usage.json with write-to-temp+rename.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/lib/reflection-score-tracker.test.cjs",
        "exitCode": 0,
        "observation": "All tests pass including both scale normalization"
      },
      { "command": "pnpm test:framework", "exitCode": 0, "observation": "0 failures" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/lib/reflection-score-tracker.test.cjs",
        "cases": [
          { "name": "normalizes 0-1 scores to 1-10", "verifies": "CTO directive #2" },
          { "name": "passes through 1-10 scores unchanged", "verifies": "1-10 scale handling" },
          { "name": "handles mixed scale entries", "verifies": "defensive normalization" }
        ]
      }
    ],
    "coverage": "Score tracker, token report, and accountant persistence all covered"
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Reflection-agent's rubric is ambiguous about scoring scale
- settings.json structure is unclear for hook registration
- Token reporting requires changes to the task creation pipeline (outside scope)
