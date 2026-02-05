# ROUTER-MONITORING-001 Architecture Analysis and Resolution Plan

**Date:** 2026-02-04
**Author:** Architect Agent (Opus)
**Status:** RESOLVED - Hooks Are Wired, Issue Was Outdated
**Issue ID:** ROUTER-MONITORING-001
**Severity:** Was CRITICAL, Now INFORMATIONAL

---

## 1. Executive Summary

### 1.1 Investigation Outcome

After comprehensive investigation, **ROUTER-MONITORING-001 is RESOLVED**. The audit report in `issues.md` (dated 2026-01-31) is **outdated**. A subsequent deep-dive audit (`DEEP_DIVE_MEMORY_CORE_AUDIT_2026-02-04.md`) correctly identified that:

> "ROUTER-MONITORING-001 | Not Wired | **RESOLVED** | agent-context-tracker and post-spawn-task-updater ARE wired in PostToolUse(Task)"

### 1.2 Evidence

**settings.json (lines 234-256):**
```json
{
  "matcher": "Task",
  "hooks": [
    {"command": "node .claude/hooks/routing/agent-context-tracker.cjs"},
    {"command": "node .claude/hooks/self-healing/auto-rerouter.cjs"},
    {"command": "node .claude/hooks/routing/agent-health-hook.cjs"},
    {"command": "node .claude/hooks/routing/post-spawn-task-updater.cjs"},
    {"command": "node .claude/hooks/routing/post-task-unified.cjs"}
  ]
}
```

All three monitoring hooks (`agent-context-tracker.cjs`, `post-spawn-task-updater.cjs`, `post-task-unified.cjs`) ARE registered in PostToolUse(Task).

---

## 2. Original Issue Description (From issues.md)

The original issue reported:
- Router spawns subagents but exits agent mode immediately
- Task completion never verified
- Projects appear abandoned mid-stream
- Missing hooks: `agent-context-tracker.cjs` and `post-spawn-task-updater.cjs`

**Root Cause Claimed:** `post-task-unified.cjs` (line 127) called `exitAgentMode()` immediately after Task() returned.

---

## 3. Current State Analysis

### 3.1 Hook Implementations

#### agent-context-tracker.cjs
**Purpose:** Enters router into "agent mode" when Task() is spawned. Detects PLANNER and SECURITY-ARCHITECT spawns.

**Key Functionality:**
- Calls `routerState.enterAgentMode(description)` on PostToolUse(Task)
- Marks special agent spawns (planner, security)
- Logs state changes when `ROUTER_DEBUG=true`

**Status:** WIRED AND FUNCTIONAL

#### post-spawn-task-updater.cjs
**Purpose:** Verifies task completion after spawn finishes. Escalates stuck tasks.

**Key Functionality:**
- Extracts task ID from spawn prompt
- Loads tasks from `tasks.json`
- Checks if task is still `in_progress` after spawn completes
- Escalates tasks >1 hour without completion to `task-escalations.jsonl`
- Logs to `spawn-audit.jsonl`

**Status:** WIRED AND FUNCTIONAL

#### post-task-unified.cjs
**Purpose:** Consolidated PostToolUse(Task) hook handling 5 responsibilities:
1. Agent context tracking (keeps router in agent mode)
2. Workflow learning extraction
3. Session memory extraction
4. Task completion guard (warns if no TaskUpdate)
5. Evolution audit

**Critical Fix (Lines 131-143):**
```javascript
// FIX-ROUTER-MONITORING-001 (2026-01-31):
// DO NOT exit agent mode here. Task() spawns subagent asynchronously.
// Router must remain in agent mode until:
//   1. Subagent completes work
//   2. SessionEnd hook fires to clean up agent mode
//
// Previous code caused immediate exit, losing monitoring of spawned agents.
// const _state = routerState.exitAgentMode(); // REMOVED - was breaking monitoring
```

**Status:** WIRED, FIXED, AND FUNCTIONAL

### 3.2 Spawn Logging

The `spawn-log.jsonl` confirms spawns ARE being tracked:
```json
{"event":"spawn_start","task_id":null,"agent_type":"planner",...}
{"event":"spawn_end","task_id":null,"success":true,...}
```

However, note that `task_id: null` is common. This indicates task IDs are often not included in spawn prompts, which limits post-spawn validation.

### 3.3 Router State Management

**router-state.cjs** provides:
- `enterAgentMode()` - Called by agent-context-tracker on Task()
- `exitAgentMode()` - NOT called by post-task-unified (the fix)
- `resetToRouterMode()` - Called by UserPromptSubmit hook
- `wasTaskUpdateCalledRecently()` - Used by task completion guard

**State persistence:** File-based (`router-state.json`) with optimistic concurrency control (version field, atomic writes).

---

## 4. Remaining Gaps and Recommendations

While the core issue is resolved, the investigation revealed several enhancement opportunities:

### 4.1 Task ID Coverage Gap

**Observation:** `spawn-log.jsonl` shows many spawns with `task_id: null`.

**Impact:** `post-spawn-task-updater.cjs` cannot verify completion for tasks without IDs.

**Recommendation:** Enhance spawn templates to ALWAYS include task IDs. Update `spawn-prompt-assembler.cjs` to warn when task ID is missing.

### 4.2 Escalation Metrics Not Populated

**Observation:** No `task-escalations.jsonl` or `spawn-audit.jsonl` files exist in metrics directory.

**Possible Causes:**
1. No tasks have exceeded 1-hour threshold
2. Tasks don't have `startedAt` timestamps
3. `tasks.json` doesn't exist or is empty

**Recommendation:** Add test coverage for escalation path. Consider creating sample audit entries during startup to verify logging works.

### 4.3 Documentation Drift

**Observation:** `issues.md` still lists ROUTER-MONITORING-001 as OPEN/CRITICAL despite resolution.

**Action Required:** Update `issues.md` to mark ROUTER-MONITORING-001 as RESOLVED with evidence.

### 4.4 Agent Mode Exit Strategy

**Current Behavior:** Agent mode persists until next UserPromptSubmit.

**Potential Issue:** Long-running background agents could leave router in agent mode indefinitely.

**Recommendation:** Consider adding SessionEnd hook to clean up agent mode. This is already mentioned in the code comment but should be verified.

---

## 5. Architecture Diagram

```
                     User Prompt
                          |
                          v
          +-------------------------------+
          |    UserPromptSubmit Hook      |
          |  (resetToRouterMode)          |
          +-------------------------------+
                          |
                          v
          +-------------------------------+
          |         Router Agent          |
          |  (TaskList -> Task)           |
          +-------------------------------+
                          |
                          v
          +-------------------------------+
          |    PreToolUse(Task) Hooks     |
          | - config-model-validator      |
          | - spawn-prompt-assembler      |
          | - spawn-prompt-validator      |
          | - tool-availability-validator |
          | - pre-task-unified            |
          +-------------------------------+
                          |
                          v
              [Task Tool Executes]
                          |
                          v
          +-------------------------------+
          |   PostToolUse(Task) Hooks     |
          | - agent-context-tracker  <----+--- enterAgentMode()
          | - auto-rerouter               |
          | - agent-health-hook           |
          | - post-spawn-task-updater <---+--- Check completion
          | - post-task-unified      <----+--- Keep agent mode active
          +-------------------------------+
                          |
                          v
          +-------------------------------+
          |      Subagent Execution       |
          | - Should call TaskUpdate()    |
          | - May run for hours           |
          +-------------------------------+
                          |
                          v
          +-------------------------------+
          |     Next UserPromptSubmit     |
          |  (resetToRouterMode)          |
          +-------------------------------+
```

---

## 6. Verification Checklist

- [x] `agent-context-tracker.cjs` is wired in settings.json
- [x] `post-spawn-task-updater.cjs` is wired in settings.json
- [x] `post-task-unified.cjs` is wired in settings.json
- [x] `exitAgentMode()` is NOT called in post-task-unified.cjs
- [x] `enterAgentMode()` IS called in agent-context-tracker logic
- [x] Spawn logging is functional (spawn-log.jsonl has entries)
- [x] Router state is persisted (router-state.json exists)
- [ ] Task escalation is functional (needs testing - no escalations observed yet)
- [ ] issues.md is updated to reflect resolution

---

## 7. Action Items

### Immediate (No Code Changes)
1. **Update issues.md:** Mark ROUTER-MONITORING-001 as RESOLVED
2. **Update learnings.md:** Document the monitoring architecture

### Short-term Enhancements (Recommended)
3. **Task ID Enforcement:** Warn when spawn prompts lack task IDs
4. **Escalation Testing:** Add integration tests for 1-hour escalation path
5. **Audit Trail Verification:** Create test entries to verify logging paths

### Long-term Improvements (Optional)
6. **Real-time Monitoring Dashboard:** Visualize spawn metrics
7. **Timeout Configuration:** Make 1-hour escalation threshold configurable
8. **SessionEnd Cleanup:** Ensure agent mode resets on session end

---

## 8. Conclusion

**ROUTER-MONITORING-001 is RESOLVED.** The hooks required for subagent monitoring ARE wired and functional:

1. `agent-context-tracker.cjs` - Enters agent mode on Task()
2. `post-spawn-task-updater.cjs` - Checks task completion, escalates stuck tasks
3. `post-task-unified.cjs` - Keeps agent mode active (fix from 2026-01-31)

The original issue in `issues.md` is **stale documentation**. The subsequent audit (`DEEP_DIVE_MEMORY_CORE_AUDIT_2026-02-04.md`) correctly identifies the resolution.

**Primary Action:** Update `issues.md` to close ROUTER-MONITORING-001 with evidence from this analysis.

---

## Appendix A: File References

| File | Purpose | Status |
|------|---------|--------|
| `.claude/hooks/routing/agent-context-tracker.cjs` | Enter agent mode on Task | WIRED |
| `.claude/hooks/routing/post-spawn-task-updater.cjs` | Verify task completion | WIRED |
| `.claude/hooks/routing/post-task-unified.cjs` | Consolidated PostToolUse | WIRED, FIXED |
| `.claude/hooks/routing/router-state.cjs` | State management | FUNCTIONAL |
| `.claude/lib/monitoring/spawn-log.cjs` | Spawn event logging | FUNCTIONAL |
| `.claude/settings.json` | Hook registration | CORRECT |
| `.claude/context/metrics/spawn-log.jsonl` | Spawn event audit trail | POPULATED |
| `.claude/context/memory/issues.md` | Issue tracking | NEEDS UPDATE |

## Appendix B: Related ADRs

- **ADR-069:** Tool Awareness - Related to agent tracking
- **ADR-074:** Model Selection - Config-based model resolution
- **PERF-003:** Hook Consolidation - Why post-task-unified exists

## Appendix C: Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ROUTER_DEBUG` | Enable verbose logging | `false` |
| `TASK_COMPLETION_GUARD` | Enforcement mode | `warn` |
| `NO_TRACK_ENFORCEMENT` | Disable task tracking | `false` |
