---
name: requesting-code-review
description: Dispatch code-reviewer agent for two-stage review. Use after completing implementation tasks.
version: 1.1.0
category: 'Development Workflow'
agents: [developer, code-reviewer]
tags: [code-review, git, diff, pull-request, review-request]
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Task]
best_practices:
  - Capture BASE_SHA and HEAD_SHA before review
  - Provide full context to reviewer
  - Request review at mandatory checkpoints
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Requesting Code Review

Dispatch code-reviewer subagent to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code-reviewer subagent:**

Use Task tool with code-reviewer type, fill template at `code-reviewer.md`

**Placeholders:**

- `{WHAT_WAS_IMPLEMENTED}` - What you just built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DESCRIPTION}` - Brief summary

**3. Act on feedback:**

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Task Tool Template

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'Code review for {DESCRIPTION}',
  prompt: `You are the CODE-REVIEWER agent.

## Instructions
1. Read your agent definition: .claude/agents/specialized/code-reviewer.md
2. Read memory: .claude/context/memory/learnings.md

## Review Request

### What Was Implemented
{WHAT_WAS_IMPLEMENTED}

### Requirements/Plan
{PLAN_OR_REQUIREMENTS}

### Git Range to Review
**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

Run these commands to see the changes:
\`\`\`bash
git diff --stat {BASE_SHA}..{HEAD_SHA}
git diff {BASE_SHA}..{HEAD_SHA}
\`\`\`

## Memory Protocol
Record findings to .claude/context/memory/learnings.md when done.
`,
});
```

## Integration with Workflows

**Subagent-Driven Development:**

- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**

- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**

- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md

## Iron Laws

1. **ALWAYS** capture BASE_SHA and HEAD_SHA before dispatching a review — without the exact commit range, the reviewer cannot produce accurate diff analysis.
2. **NEVER** skip code review because a change "seems simple" — small changes introduce the same classes of bugs as large ones; the author cannot see their own blind spots.
3. **ALWAYS** fix Critical issues before proceeding to the next task — unfixed critical issues compound and become harder to isolate as more code is layered on top.
4. **NEVER** argue with technically correct reviewer feedback — push back only when you have codebase evidence showing the reviewer lacks context or is factually wrong.
5. **ALWAYS** request review at every mandatory checkpoint (after each subagent task, after major features, before merge) — review requested too late cannot prevent compounding errors.

## Anti-Patterns

| Anti-Pattern                                                        | Why It Fails                                                                                              | Correct Approach                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Skipping review for "small" changes                                 | Small changes introduce the same classes of bugs as large ones; "simple" is subjective and unreliable     | Request review at every mandatory checkpoint regardless of perceived complexity                          |
| Dispatching reviewer without git SHAs                               | Reviewer cannot produce an accurate diff without a commit range; the review is inaccurate or incomplete   | Capture BASE_SHA and HEAD_SHA before every review dispatch                                               |
| Proceeding past Critical issues                                     | Critical issues compound; later tasks build on broken foundations that are expensive to fix retroactively | Fix all Critical issues before advancing to the next task                                                |
| Treating reviewer feedback as optional                              | Optional review degrades code quality over time and compounds technical debt that can't be traced         | Follow severity escalation: Critical → fix now, Important → fix before next task, Minor → note for later |
| Requesting review after batches of tasks instead of after each task | Errors from Task 1 contaminate Tasks 2–N; reviewers cannot isolate which task introduced which issue      | Review after each individual task before starting the next one                                           |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
