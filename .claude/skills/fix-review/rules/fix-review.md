# fix-review Rules

## Purpose

Verify fix commits address security findings without introducing new bugs or regressions. Analyzes diffs for anti-patterns like removed validation, weakened access control, reduced error handling, reordered external calls, and changed integer operations. Generates structured FIX_REVIEW_REPORT with finding status tracking.

## Best Practices

- Always compare the fix against the original finding, not just the diff in isolation
- Check for regression in adjacent code paths affected by the fix
- Verify that the fix does not merely suppress the symptom while leaving the root cause
- Look for anti-patterns that indicate incomplete or incorrect fixes
- Track partial fixes explicitly -- they are more dangerous than unfixed findings

## Integration Points

See SKILL.md for complete documentation.
