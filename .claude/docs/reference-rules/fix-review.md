# Fix Review

Every security fix must be verified to not introduce regressions.

## Required Checks on Every Fix Diff

- Removed or weakened input validation → FAIL
- Access control checks moved after business logic → FAIL
- Error handling reduced (fewer catch blocks, swallowed exceptions) → FAIL
- External calls reordered (auth check now after data fetch) → FAIL
- Integer operations changed (signed↔unsigned, truncation added) → FAIL
- New code paths bypass existing security controls → FAIL

## Process

1. Read the original finding
2. Read the fix diff
3. Verify each check above explicitly
4. Produce FIX_REVIEW_REPORT with pass/fail per finding

## When to invoke

`Skill({ skill: 'fix-review' })` — after any security fix is committed
