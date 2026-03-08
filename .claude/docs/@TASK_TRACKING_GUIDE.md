# Task Tracking Guide

**Source:** CLAUDE.md Sections 5.5-5.6
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete guide to TaskUpdate protocol, iron laws, verification patterns, agent responsibility checklist, and common failures with fixes.

---

## CONTENT

### Iron Laws

Use `TaskCreate`/`TaskList`/`TaskUpdate` for trackable progress.

**Iron Laws:**

- Never complete without summary
- Always update on discovery
- Always TaskList after completion

### TaskUpdate Protocol Example

```javascript
TaskCreate({
  subject: 'Phase 1.1: Backup tdd skill',
  description: 'Copy .claude/skills/tdd to .claude.archive/',
  activeForm: 'Backing up tdd skill',
});

TaskUpdate({ taskId: '2', addBlockedBy: ['1'] });

TaskList();

TaskUpdate({ taskId: '1', status: 'in_progress' });
// ... work ...
TaskUpdate({
  taskId: '1',
  status: 'completed',
  metadata: {
    summary: 'Backed up tdd skill successfully',
    filesModified: ['.claude.archive/skills/tdd/SKILL.md'],
  },
});
```

### Why TaskUpdate is MANDATORY

Spawned agents MUST call `TaskUpdate({ status: "completed" })` when finished. Without this:

| Symptom                           | Root Cause                   | Impact                       |
| --------------------------------- | ---------------------------- | ---------------------------- |
| Tasks stuck "in_progress" forever | Agent didn't call TaskUpdate | Router can't track progress  |
| Duplicate work assigned           | Task appears available       | Wasted compute, conflicts    |
| Progress invisible to user        | No completion metadata       | User cannot verify work done |
| Blocked tasks never unblock       | Dependencies never resolve   | Workflow stalls              |

### Verification Pattern

After spawning agents, Router should:

1. Wait for agent completion (context returns)
2. Run `TaskList()` to check task status
3. If task still "in_progress" after agent context closed, log warning
4. Consider re-spawning or escalating stuck tasks

### Agent Responsibility Checklist

```
[ ] FIRST action: TaskUpdate({ taskId: "X", status: "in_progress" })
[ ] LAST action before completion: TaskUpdate({ taskId: "X", status: "completed", metadata: {...} })
[ ] THEN: TaskList() to check for more work
```

### Common Failures and Fixes

1. **Agent exits early on error**
   - **Problem:** No completion update
   - **Fix:** Wrap in try/catch, update with error status

   ```javascript
   try {
     // ... work ...
     TaskUpdate({ taskId: '1', status: 'completed', metadata: {...} });
   } catch (error) {
     TaskUpdate({
       taskId: '1',
       status: 'completed',  // Still mark complete
       metadata: {
         error: error.message,
         status: 'failed'
       }
     });
   }
   ```

2. **Agent forgets TaskUpdate**
   - **Problem:** Focus on work, forgot protocol
   - **Fix:** Warning box in spawn template, checklist reminder
   - **Prevention:** 70-line warning box in universal-agent-spawn.md

3. **Agent context limit reached**
   - **Problem:** Truncated before TaskUpdate
   - **Fix:** Summarize sooner, use context-compressor skill
   - **Prevention:** Monitor token usage, compress context proactively

### Enforcement Hooks

**Pre-spawn hook:** `pre-task-unified.cjs`

- Blocks spawn without TaskCreate
- Validates task ID in spawn prompt
- Default: `block`

**Post-spawn hook:** `post-task-unified.cjs`

- Detects tasks not updated after 1 hour
- Auto-escalates stuck tasks
- Logs to audit trail
- **Worktree Garbage Collection**: Automatically executes `git clean -fd` within subagent worktrees upon receiving `TaskUpdate({ status: "completed" })` (or inferred completion) to purge untracked artifacts and prevent `Directory not empty` removal failures.
- Default: `warn`

### Escalation Thresholds

- **1 hour without TaskUpdate:** Auto-escalate
- Duration tracked since `task.startedAt`
- Logged to separate escalation file for monitoring

---

## RELATED REFERENCES

- **@ENFORCEMENT_HOOKS.md** - pre-spawn-task-validator.cjs and post-spawn-task-updater.cjs
- **CLAUDE.md Section 2** - Golden-Path Example (shows TaskUpdate in spawn prompts)
- **CLAUDE.md Section 5.6** - Agent Spawning Verification (PROC-005)

---

## BACK TO MAIN

See **CLAUDE.md** Sections 5.5-5.6 for inline summary.
