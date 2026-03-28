---
name: compliance-fix-worker
description: Fixes test failures, compliance gaps, and validation issues in the agent-studio ecosystem
---

# Compliance Fix Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that involve:

- Fixing test failures (unit, framework, integration, audit)
- Updating configuration files (agent-skill-matrix.json, routing tables, settings.json)
- Resolving validation failures (validate:full, metrics:ci, format:check)
- Fixing compliance gaps (missing skills in agent arrays, hardcoded counts, ghost entries)
- Backward compatibility fixes (dual skill name support)

## Work Procedure

1. **Read the feature description carefully.** Identify every file that needs changing and every test that must pass.

2. **Run the SPECIFIC failing tests first** to capture exact error messages:

   ```
   node --test <specific-test-file>
   ```

   Record the exact assertion failures.

3. **Write or update tests BEFORE fixing** (TDD red-green):
   - If the fix requires new test cases (e.g., testing both compressor names), add them first
   - Confirm they fail (red)
   - Then implement the fix

4. **Implement the fix.** Follow CTO directives from AGENTS.md strictly:
   - Directive 1: Both `context-compressor` AND `token-saver-context-compression` must be accepted
   - Read existing patterns in similar files before writing new code
   - Use `safeParseJSON` for all JSON parsing

5. **Run targeted tests** to confirm your fix works:

   ```
   node --test <specific-test-file>
   ```

6. **Run broader test suites** to check for regressions:

   ```
   pnpm test
   pnpm test:framework
   ```

   If either shows new failures, debug and fix before proceeding.

7. **Run validators** relevant to your changes:

   ```
   pnpm validate:full
   pnpm validate:routing
   pnpm metrics:ci
   pnpm format:check
   ```

8. **Commit** with a descriptive message.

## Example Handoff

```json
{
  "salientSummary": "Fixed agent-skill-matrix.json: added 31 missing agents, injected token-saver-context-compression into all 119 always arrays. Updated pre-tool-unified.read-safety.cjs to accept both compressor names. Updated agent count test from 110 to 119. Ran pnpm test (9000 pass/0 fail), pnpm test:framework (3250 pass/0 fail), pnpm validate:full (exit 0).",
  "whatWasImplemented": "Added 31 missing agents to agent-skill-matrix.json with correct category assignments and always arrays. Modified read-safety hook lines 168-169 to accept both 'context-compressor' and 'token-saver-context-compression'. Updated expected count constant in agent-search-compliance.test.cjs from 110 to 119.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/hooks/pre-tool-unified-read-safety.test.cjs",
        "exitCode": 0,
        "observation": "All 18 tests pass including both compressor name cases"
      },
      {
        "command": "node --test tests/audit/agent-search-compliance.test.cjs",
        "exitCode": 0,
        "observation": "Agent count matches 119, all compliance checks pass"
      },
      { "command": "pnpm test", "exitCode": 0, "observation": "9000+ tests, 0 failures" },
      { "command": "pnpm test:framework", "exitCode": 0, "observation": "3250+ tests, 0 failures" },
      { "command": "pnpm validate:full", "exitCode": 0, "observation": "All validators pass" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/hooks/pre-tool-unified-read-safety.test.cjs",
        "cases": [
          { "name": "accepts token-saver-context-compression", "verifies": "backward compat" }
        ]
      }
    ],
    "coverage": "All read-safety, compliance, and routing tests pass"
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A fix requires changing files outside the feature's scope
- A test failure has an unclear root cause after 15 minutes of investigation
- A CTO directive is ambiguous for the specific case encountered
- Fixing one area introduces failures in another that can't be resolved within this feature
