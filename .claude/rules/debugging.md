# Debugging Rules

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## The Four Phases

### Phase 1: Root Cause Investigation (MANDATORY)

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes

4. **Gather Evidence in Multi-Component Systems**
   - Add diagnostic instrumentation at each component boundary
   - Log what data enters/exits each component
   - Run once to gather evidence showing WHERE it breaks

5. **Trace Data Flow**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source

### Phase 2: Pattern Analysis

1. **Find Working Examples**
   - Locate similar working code
   - What works that's similar to what's broken?

2. **Compare Against References**
   - Read reference implementation COMPLETELY
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis**
   - "I think X is the root cause because Y"
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change
   - One variable at a time

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis

4. **If 3+ Fixes Failed: Question Architecture**
   - Stop attempting more fixes
   - Discuss architecture with human partner
   - Each fix revealing new problems = wrong architecture

### Phase 4: Implementation

1. **Create Failing Test Case**
   - Use the `tdd` skill for proper failing tests
   - Simplest possible reproduction
   - MUST have before fixing

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?

4. **If Fix Doesn't Work**
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1
   - If >= 3: Question the architecture (don't attempt fix #4)

## Red Flags - STOP and Follow Process

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "One more fix attempt" (when already tried 2+)
- Each fix reveals new problem in different place

## Human Partner Signals You're Doing It Wrong

- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultrathink this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

## Supporting Techniques

Available in `.claude/skills/debugging/`:
- **root-cause-tracing.md** - Trace bugs backward through call stack
- **defense-in-depth.md** - Add validation at multiple layers
- **condition-based-waiting.md** - Replace arbitrary timeouts with condition polling

## When Stuck

| Problem              | Solution                            |
|----------------------|-------------------------------------|
| Don't know how to test | Write wished-for API first       |
| Test too complicated | Design too complicated. Simplify. |
| Must mock everything | Code too coupled. Dependency injection. |
| Test setup huge      | Extract helpers. Still complex? Simplify design. |

## Related Skills

- `tdd` - For creating failing test case (Phase 4, Step 1)
- `verification-before-completion` - Verify fix worked

## Related References

- `.claude/skills/debugging/SKILL.md` - Complete debugging documentation
- `.claude/skills/debugging/root-cause-tracing.md` - Backward tracing technique
- `.claude/skills/debugging/defense-in-depth.md` - Multi-layer validation
- `.claude/skills/debugging/condition-based-waiting.md` - Condition polling patterns
