# Recovery Action Types

This document defines the recovery actions available and the decision tree for selecting them.

## Recovery Actions

### ROLLBACK

**Definition**: Revert to last known good state (git commit).

**When to Use**:

- Build is broken and last good commit is known
- Code is in an unrecoverable state
- Multiple files corrupted or in inconsistent state

**Execution**:

```bash
git reset --hard <last_good_commit>
```

**Preconditions**:

- `last_good_commit` must be recorded in build history
- Project must be in a git repository

**Post-Action**:

- Re-attempt the task with a different approach
- Record the rollback in attempt history

---

### RETRY

**Definition**: Attempt the task again with the same or different approach.

**When to Use**:

- Verification failed but attempt count < 3
- Unknown error with attempt count < 2
- Transient errors (network, timing)

**Attempt Thresholds**:
| Failure Type | Max Attempts |
|--------------|--------------|
| VERIFICATION_FAILED | 3 |
| UNKNOWN | 2 |
| BROKEN_BUILD | 1 (then rollback) |

**Execution**:

1. Record the failed attempt with approach description
2. Analyze what went wrong
3. Generate a DIFFERENT approach
4. Re-attempt with new approach

**Guidance for Different Approach**:

- If library failed, try a different library
- If pattern failed, try a different pattern
- If complex approach failed, try simpler implementation

---

### SKIP

**Definition**: Mark the task as stuck and move to the next task.

**When to Use**:

- Circular fix detected (same approach tried 3+ times)
- Verification failed after 3 attempts
- Task is blocking progress on other tasks

**Execution**:

1. Mark subtask as "stuck" in attempt history
2. Record reason for skipping
3. Continue with next subtask
4. Escalate for human review

**Post-Action**:

- Stuck tasks are collected for human review
- Other tasks can continue if not dependent

---

### ESCALATE

**Definition**: Request human intervention.

**When to Use**:

- Build broken with no good commit to rollback to
- Unknown error persists after max attempts
- Circular fix detected
- Critical path blocked

**Execution**:

1. Mark subtask as "stuck" with escalation flag
2. Generate detailed context:
   - Previous attempts and approaches
   - Error messages
   - Files involved
   - Dependencies
3. Present to human for resolution

**Escalation Report Format**:

```markdown
## Stuck Subtask: [subtask_id]

### Summary

[Brief description of what went wrong]

### Attempts Made

1. Attempt 1: [approach] - [result]
2. Attempt 2: [approach] - [result]
3. Attempt 3: [approach] - [result]

### Error Details

[Last error message]

### Files Involved

- [file1]
- [file2]

### Recommended Actions

- [ ] Review error logs
- [ ] Check external dependencies
- [ ] Consider alternative approach
```

---

### CONTINUE

**Definition**: Save current progress and continue in a new session.

**When to Use**:

- Context exhausted mid-task
- Session interrupted but progress was made
- Need to checkpoint and resume later

**Execution**:

1. Commit any pending changes
2. Record current progress in attempt history
3. Save context state for recovery
4. Mark subtask as "in_progress" (not failed)

---

## Decision Tree

```
┌─────────────────────────┐
│    Failure Occurred     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Classify Failure Type  │
└───────────┬─────────────┘
            │
    ┌───────┴───────┬──────────────┬──────────────┬──────────────┐
    ▼               ▼              ▼              ▼              ▼
┌────────┐    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐
│BROKEN  │    │VERIFIC-  │   │CIRCULAR  │   │CONTEXT   │   │UNKNOWN  │
│BUILD   │    │ATION     │   │FIX       │   │EXHAUSTED │   │         │
└────┬───┘    └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬────┘
     │             │              │              │              │
     ▼             ▼              ▼              ▼              ▼
┌─────────┐  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│Has good │  │Attempts  │   │          │   │          │   │Attempts  │
│commit?  │  │< 3?      │   │  SKIP +  │   │ CONTINUE │   │< 2?      │
└────┬────┘  └────┬─────┘   │ ESCALATE │   │          │   └────┬─────┘
     │            │         └──────────┘   └──────────┘        │
  Y──┴──N      Y──┴──N                                      Y──┴──N
  │     │      │     │                                      │     │
  ▼     ▼      ▼     ▼                                      ▼     ▼
ROLL  ESCA   RETRY  SKIP                                  RETRY ESCA
BACK  LATE         +ESCA                                       LATE
```

## Attempt Count Tracking

Track attempts across sessions using persistent storage:

```json
{
  "subtasks": {
    "subtask-001": {
      "attempts": [
        {
          "session": 1,
          "timestamp": "2026-01-24T10:00:00Z",
          "approach": "Using async/await pattern",
          "success": false,
          "error": "Test failed: expected 200 got 404"
        },
        {
          "session": 1,
          "timestamp": "2026-01-24T10:15:00Z",
          "approach": "Using callback pattern",
          "success": false,
          "error": "Test failed: expected 200 got 500"
        }
      ],
      "status": "failed"
    }
  },
  "stuck_subtasks": []
}
```

## Recovery Hints

After multiple failed attempts, provide hints to guide the next approach:

```
Previous attempts: 2

Attempt 1: Using async/await pattern - FAILED
  Error: Test failed: expected 200 got 404

Attempt 2: Using callback pattern - FAILED
  Error: Test failed: expected 200 got 500

IMPORTANT: Try a DIFFERENT approach than previous attempts
Consider: different library, different pattern, or simpler implementation
```
