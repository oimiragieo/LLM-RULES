---
name: security-worker
description: Security hardening — path normalization, UNC blocking, pattern alignment with Claude Code
---

# Security Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that harden security hooks: case-normalized path comparison, UNC path blocking, pattern alignment with Claude Code source, path traversal defenses.

## Work Procedure

1. **Read the feature description carefully.** Understand exactly which security patterns to add/modify and which CC patterns to align with.

2. **Read source files.** Before modifying:
   - Read the target hook fully (e.g., `.claude/hooks/safety/unified-pre-write-hook.cjs`)
   - Read `.factory/library/claude-code-internals.md` for CC patterns reference
   - Read `AGENTS.md` for CC protected paths and dangerous patterns lists

3. **Write tests first (red).** Create test file at `tests/hooks/<descriptive-name>.test.cjs`. Security tests must cover:
   - Positive cases (malicious paths blocked)
   - Negative cases (safe paths allowed, no over-blocking)
   - Edge cases (mixed case, encoded variants, boundary conditions)
   - Fail-closed behavior (security hooks exit 2 on violations)
   Run tests — they should FAIL (red).

4. **Implement changes.**
   - Security hooks MUST exit 2 to block. Never exit 0 for a violation.
   - Case normalization: `.toLowerCase()` before ALL regex/string comparisons on paths.
   - UNC blocking: Check for `\\` and `//` prefixes. Block both.
   - Pattern alignment: Use word boundaries (`\b`) for command patterns to avoid over-blocking.
   - ALWAYS preserve existing security checks. Only ADD new ones.

5. **Run tests (green).** All tests pass. Fix failures.

6. **Run lint.**
   ```
   pnpm lint
   npx prettier --check <modified-files>
   ```

7. **Manual verification.** Run the hook with sample malicious inputs to verify blocking behavior. Run with safe inputs to verify no over-blocking.

## Example Handoff

```json
{
  "salientSummary": "Added case-normalized path comparison to unified-pre-write-hook.cjs. All path comparisons now use .toLowerCase(). UNC paths (\\\\server and //server) blocked with descriptive error. 28 tests.",
  "whatWasImplemented": "Case normalization in checkProtectedPaths() and checkTraversal(). UNC check function added before path matching. All CC-protected paths added to pattern list.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/hooks/case-norm-unc.test.cjs", "exitCode": 0, "observation": "28 tests passing" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  }
}
```

## When to Return to Orchestrator

- A security hook has unexpected structure that doesn't match documentation
- You're unsure whether blocking a pattern would break legitimate workflows
- The hook depends on external modules not present in the codebase
