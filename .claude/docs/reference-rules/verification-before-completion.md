---
paths:
  - .claude/skills/verification-before-completion/**
---

# Verification Before Completion Rules

## Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim                 | Requires                         | Not Sufficient                |
| --------------------- | -------------------------------- | ----------------------------- |
| Tests pass            | Test command output: 0 failures  | Previous run, "should pass"   |
| Linter clean          | `pnpm lint:fix` output: 0 errors | Partial check, extrapolation  |
| Format clean          | `pnpm format` output: no changes | Visual inspection, assumption |
| Build succeeds        | Build command: exit 0            | Linter passing                |
| Bug fixed             | Test original symptom: passes    | Code changed, assumed fixed   |
| Regression test works | Red-green cycle verified         | Test passes once              |
| Requirements met      | Line-by-line checklist           | Tests passing                 |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- **ANY wording implying success without having run verification**

## Key Patterns

**Tests:**

```
CORRECT: [Run test command] [See: 34/34 pass] "All tests pass"
WRONG: "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**

```
CORRECT: Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
WRONG: "I've written a regression test" (without red-green verification)
```

**Lint and Format (BLOCKING GATE):**

```
CORRECT: [Run pnpm lint:fix] [See: 0 errors] [Run pnpm format] [See: no changes] "Lint and format clean"
WRONG: "Code looks formatted" / "No obvious lint issues"
```

**Requirements:**

```
CORRECT: Re-read plan → Create checklist → Verify each → Report gaps or completion
WRONG: "Tests pass, phase complete"
```

## When To Apply

**ALWAYS before:**

- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task

## Anti-Patterns

- Claiming success before running verification
- Using words that imply completion without evidence
- Trusting previous run results
- Partial verification (linter but not compiler)
- Different wording to avoid rule detection

## The Bottom Line

No shortcuts for verification. Run the command. Read the output. THEN claim the result.

This is non-negotiable.

## Related Skills

- `tdd` - Test-driven development (includes verification)
- `qa-workflow` - Systematic QA validation
- `checklist-generator` - Quality checklists for validation

## Related References

- `.claude/skills/verification-before-completion/SKILL.md` - Complete verification documentation
- `.claude/rules/testing.md` - Code quality gates section
- `.claude/rules/tdd.md` - Pre-completion requirements
