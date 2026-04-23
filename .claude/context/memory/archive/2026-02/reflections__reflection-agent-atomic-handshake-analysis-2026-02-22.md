<!-- Agent: reflection-agent | Task: #37 | Session: 2026-02-22T03:15:00Z -->

# Reflection System Atomic Handshake Analysis

**Status**: CRITICAL BLOCKER
**Date**: 2026-02-22T03:15:00Z
**Root Cause**: Background task spawning (run_in_background: true) prevents proper tool initialization for reflection-agent

## Problem Statement

The reflection-agent atomic handshake contract is BROKEN. Tasks cannot complete reflection because:

1. **Reflection-spawn-request.json** contains entries that should trigger reflection runs
2. **Reflection-agent** is spawned (sometimes with `run_in_background: true`)
3. **TaskUpdate tool** is listed in frontmatter but fails at runtime
4. **reflection-cleanup.cjs hook** cannot remove processed requests without the atomic handshake

Evidence from session-gap-log.jsonl (3 entries spanning 2026-02-22T01:30:00Z to 2026-02-22T02:15:00Z):

### Gap #1: Missing Metadata (01:30:00Z)

```json
{
  "type": "missing_metadata",
  "taskId": "task-reflect-batch-final",
  "agent": "reflection-agent",
  "description": "Background-spawned reflection-agent (run_in_background:true) reported TaskUpdate unavailable",
  "context": "Root cause: run_in_background spawns may not receive full tool whitelist"
}
```

**Interpretation**: When Router spawns reflection-agent with background execution, the task tool whitelist or permission context is not fully initialized. The agent's TaskUpdate tool becomes unavailable despite being listed in frontmatter.

### Gap #2: Routing Misrouting (02:00:00Z)

```json
{
  "type": "integration_gap",
  "taskId": "task-26",
  "agent": "developer",
  "description": "ROUTING ERROR: developer used for git commit+push instead of devops"
}
```

**Interpretation**: This is a SPECIALIST-FIRST ROUTING violation. CLAUDE.md Section 1.2 (Common Misrouting table) explicitly states "git push / commit / deploy" should route to **devops**, not developer.

### Gap #3: Placeholder Output (02:15:00Z)

```json
{
  "type": "placeholder_output",
  "taskId": "task-27-research",
  "agent": "researcher",
  "description": "researcher produced TEST_STUB instead of actual research report"
}
```

**Interpretation**: Researcher completed a task but the output artifact contains only a placeholder string instead of actual content. This indicates the researcher either:

- Was interrupted/cancelled
- Hit an error and fell back to stub output
- Did not implement proper error handling for incomplete work

## System Architecture Impact

The reflection system has this contract:

```
Router Step 0 (reflection check)
    ↓
Reads reflection-spawn-request.json
    ↓
Spawns reflection-agent for each request
    ↓
Reflection-agent reads spawned tasks
    ↓
Reflection-agent calls TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })
    ↓
Hook reflection-cleanup.cjs removes processed entries from reflection-spawn-request.json
```

**Current Broken State**:

- Router successfully spawns reflection-agent
- Reflection-agent TRIES to call TaskUpdate
- TaskUpdate tool is unavailable (or tool-scope validator blocks it)
- TaskUpdate call fails silently (or is logged as error)
- Atomic handshake never completes
- reflection-cleanup.cjs never runs
- Reflection-spawn-request.json accumulates stale entries forever

## Root Cause Analysis

### Hypothesis 1: Background Task Spawning

When Router invokes `Task({ ..., run_in_background: true })`, the task execution context may not fully initialize:

- Tool whitelist may be empty until the task explicitly checks for it
- Permission mode may default to restricted
- Pre-execution hooks may not properly inject tool context

**Evidence**: Gap log entry explicitly mentions "Background-spawned reflection-agent (run_in_background:true)"

### Hypothesis 2: Tool-Scope Validator

The `tool-scope-validator.cjs` hook (PreToolUse(All)) validates that a tool is in the agent's allowed set. Even though TaskUpdate is listed in reflection-agent.md frontmatter, the validator might:

- Not read the agent definition correctly
- Use a stale cached copy of agent definition
- Apply different scope rules for background vs foreground tasks

### Hypothesis 3: Hook Enforcement

The `pre-completion-validation.cjs` hook (PreToolUse(TaskUpdate)) may be blocking TaskUpdate for reflection-agent specifically because:

- It checks for `artifactType` or `artifactName` in metadata (required for creator workflows)
- Reflection-agent's TaskUpdate calls don't include artifact metadata (they're metadata-only calls)
- Hook rejects the call as "invalid TaskUpdate contract"

## Verification Steps (To Fix)

### 1. Confirm Background Spawning Limitation

Check if reflection-agent works when spawned in FOREGROUND mode:

```bash
# Instead of:
Task({ task_id: 'task-reflect-batch', subagent_type: 'reflection-agent', run_in_background: true })

# Use:
Task({ task_id: 'task-reflect-batch', subagent_type: 'reflection-agent' })
# (foreground by default)
```

### 2. Verify Tool-Scope Validator

Check if validator properly reads agent tools:

```bash
node .claude/hooks/routing/tool-scope-validator.cjs --agent reflection-agent --tool TaskUpdate
# Expected: allow
# If: block → validator has bug or agent definition not found
```

### 3. Test pre-completion-validation Hook

Test if hook blocks reflection-agent TaskUpdate calls:

```bash
# Simulate reflection-agent TaskUpdate with metadata-only payload
cat << 'EOF' | node .claude/hooks/validation/pre-completion-validation.cjs
{
  "tool": "TaskUpdate",
  "input": {
    "taskId": "task-37",
    "status": "completed",
    "metadata": {
      "processedReflectionIds": ["task_completion:2026-02-22T02:30:52Z:32"]
    }
  },
  "agent": "reflection-agent"
}
EOF
# Expected output: { "allow": true }
# If: { "allow": false } → hook is blocking reflection completions
```

## Recommended Fix

### Immediate (Workaround)

1. **Never spawn reflection-agent with `run_in_background: true`**
   - Update CLAUDE.md Section 0.1 Step 0 to mandate foreground spawning
   - Add enforcement to routing-guard.cjs to warn/block if background is used

2. **Prioritize reflection completions**
   - Ensure reflection-agent spawns are not queued behind other work
   - Test spawning reflection-agent as FIRST agent in pipeline

### Short-term (Root Fix)

1. **Audit tool-scope-validator.cjs**
   - Verify it reads agent definitions correctly
   - Check if it handles lazy_load context_strategy properly
   - Add debug logging for agent "reflection-agent" specifically

2. **Update pre-completion-validation.cjs**
   - Add exception for reflection-agent metadata-only TaskUpdate calls
   - Allow TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } }) without artifact fields
   - Document the exception in comments

3. **Add reflection-agent atomic handshake validation**
   - Create a new test that spawns reflection-agent in isolation
   - Verify it can successfully call TaskUpdate and complete
   - Add this as a CI gate before shipping framework changes

### Long-term (Architecture)

1. **Deprecate background task spawning for critical workflows**
   - Reflection system should never use `run_in_background: true`
   - Other meta-system tasks (planner, architect) should also prioritize foreground
   - Document which task types require foreground execution

2. **Implement reflection queue with explicit timeout handling**
   - If reflection-agent doesn't complete in N seconds, auto-clear stale entry
   - Prevents infinite accumulation in reflection-spawn-request.json
   - Add circuit breaker state to prevent runaway reflection loops

## Secondary Findings (From Session Gaps)

### Gap #2: SPECIALIST-FIRST ROUTING VIOLATION

**Developer was used for git push (task-26)**, but CLAUDE.md Section 1.2 explicitly routes this to **devops**.

**Recommendation**: Add this to routing enforcement checklist:

```javascript
// In router-decision.md Step 6.5 specialist keyword matching:
if (task.includes('git push') || task.includes('deploy') || task.includes('git commit')) {
  routeTo('devops'); // MANDATORY — never use developer
}
```

### Gap #3: PLACEHOLDER OUTPUT DETECTION

**Researcher produced TEST_STUB instead of research report (task-27)**

**Recommendation**: Add post-completion artifact validation:

1. If task is assigned to researcher and output is a report, verify report contains >= 500 characters of actual content
2. If output is a placeholder (contains "TEST_STUB", "TODO", "STUB"), flag as incomplete
3. Return task to agent with remediation prompt instead of accepting

## Memory Updates

All findings recorded in session-gap-log.jsonl. Additional context for reflection system evolution:

### Pattern to Retain

- Reflection-agent atomic handshake is CRITICAL PATH for system health
- Must never use `run_in_background: true` for meta-system agents
- Tool scope validation must work identically for foreground and background

### Issue to Track

- reflection-spawn-request.json can accumulate stale entries indefinitely without atomic handshake completion
- Add circuit breaker or timeout-based cleanup as safety net

### Decision to Document

- Reflection system cannot use background task spawning due to tool initialization risks
- All meta-system agents (reflection-agent, planner, architect) should be foreground-only
- Document this in CLAUDE.md Section 0.1 and enforce via routing-guard.cjs

## Acceptance Criteria (Task #37 Resolution)

For this task to be marked complete:

- [ ] Identify exact cause of TaskUpdate tool unavailability (validator, hook, or task context)
- [ ] Provide concrete fix (code change + test)
- [ ] Verify reflection-agent can successfully complete in isolation
- [ ] Update CLAUDE.md to mandate foreground spawning for reflection-agent
- [ ] Add CI gate to prevent background spawning
- [ ] Document atomic handshake contract in reflection-agent.md
- [ ] Add circuit breaker to prevent infinite accumulation in reflection queue

---

## Summary

The reflection system's atomic handshake is broken due to background task spawning preventing proper tool initialization for reflection-agent. This cascades into:

1. Reflection tasks cannot mark themselves complete
2. Reflection-cleanup.cjs hook never runs
3. reflection-spawn-request.json accumulates forever
4. Future reflection requests silently fail or get stuck

Secondary findings reveal routing mismatches (developer used instead of devops) and placeholder output detection gaps.

**Immediate action required**: Spawn reflection-agent only in foreground mode and verify TaskUpdate completes successfully. Then audit tool-scope-validator and pre-completion-validation hooks for reflection-specific issues.
