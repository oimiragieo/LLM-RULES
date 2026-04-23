<!-- Agent: architect | Task: #27 | Session: 2026-02-08 -->

# Router Enforcement Hardening Design

**Version:** 1.0
**Date:** 2026-02-08
**Author:** Architect Agent (Task #27)
**Status:** DRAFT - Ready for Planner (Task #30)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Gap Analysis](#3-gap-analysis)
4. [Fix Designs](#4-fix-designs)
5. [Risk Assessment](#5-risk-assessment)
6. [Migration Plan](#6-migration-plan)
7. [Architecture Decision Record](#7-architecture-decision-record)

---

## 1. Executive Summary

Five enforcement gaps were identified in the router protocol. These gaps collectively allow the Router to bypass its own self-check constraints in specific tool pathways, undermining the multi-agent orchestration model where the Router should ONLY route, never execute.

**Severity Assessment:**

| Gap   | Description                                                    | Severity | Exploitation Difficulty                          |
| ----- | -------------------------------------------------------------- | -------- | ------------------------------------------------ |
| Gap 1 | routing-guard.cjs missing from Edit/Write/NotebookEdit matcher | HIGH     | Trivial - Router just uses Edit directly         |
| Gap 2 | routing-guard.cjs missing from Read matcher                    | LOW      | Low impact - Read is on Router whitelist         |
| Gap 3 | No TaskList-first gate for non-Task tools                      | MEDIUM   | Moderate - Router can Grep/Glob without TaskList |
| Gap 4 | Stale router-state.json across sessions                        | MEDIUM   | Accidental - state persists from prior session   |
| Gap 5 | Prompt-level identity conflict                                 | LOW      | Behavioral - LLM may ignore Router identity      |

**Recommended Priority:** Gap 1 > Gap 4 > Gap 3 > Gap 5 > Gap 2

---

## 2. Current State Analysis

### 2.1 Hook Registration Matrix (settings.json)

The following table maps every PreToolUse matcher to the hooks it triggers:

| Matcher                     | Hooks Registered                                                                                                                               | routing-guard?             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `""` (wildcard)             | pre-tool-unified.cjs (session-cleanup, execution-limit, tool-scope)                                                                            | NO                         |
| `Bash`                      | bash-command-validator, shell-injection-validator, windows-null-sanitizer, **routing-guard.cjs**                                               | YES                        |
| `Glob\|Grep\|WebSearch`     | **routing-guard.cjs**                                                                                                                          | YES                        |
| `Edit\|Write\|NotebookEdit` | unified-creator-guard, unified-pre-write-hook, evolution-state-guard, research-enforcement, quality-gate-validator                             | **NO**                     |
| `Write`                     | conflict-detector                                                                                                                              | NO                         |
| `Read`                      | validate-skill-invocation                                                                                                                      | NO                         |
| `TaskList`                  | reflection-step0-guard                                                                                                                         | NO                         |
| `TaskCreate`                | **routing-guard.cjs**                                                                                                                          | YES                        |
| `Task`                      | intent-agent-match, spawn-prompt-assembler, **pre-task-unified.cjs** (contains routing checks), config-model-validator, spawn-prompt-validator | YES (via pre-task-unified) |
| `TaskUpdate`                | task-status-enforcement, pre-completion-validation, quality-gate-validator                                                                     | NO                         |

**Key Observation:** routing-guard.cjs fires for `Bash`, `Glob|Grep|WebSearch`, and `TaskCreate`. The `Task` matcher gets equivalent coverage through `pre-task-unified.cjs` which duplicates routing-guard checks. But `Edit|Write|NotebookEdit` and `Read` have NO routing-guard coverage.

### 2.2 routing-guard.cjs Check Matrix

The routing-guard has 8 checks (0-7):

| Check | Name                | Applies To              | What It Does                                                      |
| ----- | ------------------- | ----------------------- | ----------------------------------------------------------------- |
| 0     | router-bash-check   | Bash only               | Blocks non-whitelisted Bash commands in router mode               |
| 1     | router-self-check   | All blacklisted tools   | Blocks Glob/Grep/Edit/Write/NotebookEdit/WebSearch in router mode |
| 2     | planner-first       | Task only               | Requires PLANNER for high/epic complexity                         |
| 3     | task-create-guard   | TaskCreate only         | Blocks TaskCreate without PLANNER                                 |
| 4     | security-review     | Task only               | Requires SECURITY-ARCHITECT for security-sensitive tasks          |
| 5     | router-write-guard  | Edit/Write/NotebookEdit | Blocks direct writes without agent context                        |
| 6     | memory-pressure     | Task only               | Blocks spawning under memory pressure                             |
| 7     | specialist-override | Task only               | Warns developer spawn for specialist tasks                        |

**Critical Finding:** Check 1 (router-self-check) ALREADY blocks Edit/Write/NotebookEdit. Check 5 (router-write-guard) ALREADY blocks writes without agent context. But neither check is ever triggered for those tools because routing-guard.cjs is not registered on the `Edit|Write|NotebookEdit` matcher in settings.json.

### 2.3 State Management Architecture

```
UserPromptSubmit
    |
    v
state-reset.cjs -----> router-state.json = { mode: "router", taskSpawned: false, ... }
    |
    v
user-prompt-unified.cjs --> complexity classification, routing hints
    |
    v
force-step0-execution.cjs --> reflection enforcement
    |
    (user's first tool call)
    |
    v
pre-tool-unified.cjs (wildcard) --> session cleanup, execution limits, tool scope
    |
    v
[matcher-specific hooks] --> routing-guard.cjs (if registered for this tool)
```

**State fields relevant to enforcement:**

| Field                       | Set By                                                               | Used By                  | Purpose                    |
| --------------------------- | -------------------------------------------------------------------- | ------------------------ | -------------------------- |
| `mode`                      | state-reset (router), enterAgentMode (agent), exitAgentMode (router) | routing-guard checks     | Router vs Agent context    |
| `taskSpawned`               | state-reset (false), enterAgentMode (true)                           | routing-guard checks     | Whether a Task was spawned |
| `taskListCalledSincePrompt` | state-reset (false\*), setTaskListCalled (true)                      | pre-task-unified Check 0 | TaskList-first enforcement |
| `complexity`                | state-reset (trivial), user-prompt-unified                           | planner-first check      | Task complexity level      |
| `requiresPlannerFirst`      | state-reset (false), user-prompt-unified                             | planner-first check      | Whether PLANNER needed     |

**CRITICAL BUG IN state-reset.cjs:** The `resetState()` function in `state-reset.cjs` (line 53-70) does NOT include `taskListCalledSincePrompt` in its default state object. However, `router-state.cjs` `getDefaultState()` (line 116) DOES include it. This means:

- On first prompt: state-reset writes state WITHOUT `taskListCalledSincePrompt`
- When router-state reads it: `{ ...getDefaultState(), ...parsed }` applies, and since `parsed` has no `taskListCalledSincePrompt` key, the default `false` is used correctly.
- **This works by accident** -- the spread behavior with undefined keys defaults correctly, but the state-reset should explicitly include it for clarity and safety.

### 2.4 TaskList-First Enforcement (Current)

The `taskListCalledSincePrompt` flag currently only blocks the `Task` tool via `pre-task-unified.cjs` Check 0 (`checkTaskListFirst`). It does NOT block:

- `Edit`, `Write`, `NotebookEdit` -- Router can write without calling TaskList first
- `Bash` -- Router can run git commands without calling TaskList first
- `Glob`, `Grep`, `WebSearch` -- Router can search without calling TaskList first

---

## 3. Gap Analysis

### Gap 1: routing-guard.cjs Not Registered for Edit|Write|NotebookEdit

**Current State:**

```json
{
  "matcher": "Edit|Write|NotebookEdit",
  "hooks": [
    "unified-creator-guard.cjs", // Gate 4: creator workflow
    "unified-pre-write-hook.cjs", // 11 safety checks
    "evolution-state-guard.cjs",
    "research-enforcement.cjs",
    "quality-gate-validator.cjs"
  ]
}
```

No routing-guard.cjs present. This means:

1. **Check 1 (router-self-check)** never fires for write tools -- Router can Edit/Write if the file is not a creator-guarded path.
2. **Check 5 (router-write-guard)** never fires via settings.json -- its logic exists but is dead code for this matcher.

**Impact:** Router can directly edit `.claude/context/plans/`, `.claude/context/reports/`, test files, or any non-creator-protected path. The `unified-creator-guard.cjs` only protects creator artifact paths (skills, agents, hooks, workflows, etc.), not general files.

**Evidence:** The BLACKLISTED_TOOLS constant in routing-guard.cjs (line 156) includes `'Edit', 'Write', 'NotebookEdit'`, proving the intent was to block these. The registration gap means the intent is not enforced.

### Gap 2: routing-guard.cjs Not Registered for Read

**Current State:**

```json
{
  "matcher": "Read",
  "hooks": [
    "validate-skill-invocation.cjs" // Warns Read vs Skill() usage
  ]
}
```

No routing-guard.cjs present. However, Read is in the WHITELISTED_TOOLS constant (line 178: `['TaskUpdate', 'TaskList', 'TaskGet', 'Read', 'AskUserQuestion']`), so even if routing-guard fires, it would allow Read.

**Impact:** LOW. Router legitimately reads agent files, docs, memory files, and runtime state. The only concern is visibility -- without routing-guard firing on Read, there is no audit trail of what the Router reads.

**Revised Assessment:** This gap is informational only. Adding routing-guard for Read would add overhead (another process spawn per Read) with no blocking benefit. A better approach is a lightweight audit-only check within the existing `validate-skill-invocation.cjs` or the wildcard `pre-tool-unified.cjs`.

### Gap 3: No TaskList-First Gate for Non-Task Tools

**Current State:**

`checkTaskListFirst()` in `pre-task-unified.cjs` (line 368-385) only applies to `Task` tool:

```javascript
function checkTaskListFirst(toolName) {
  if (toolName !== 'Task') {
    return { pass: true }; // <-- All other tools bypass this check
  }
  // ...
}
```

The CLAUDE.md Router Output Contract says:

> "FIRST ROUTING TOOL CALL MUST BE: TaskList()"

But only `Task` spawns are blocked if TaskList was not called first.

**Impact:** Router can use `Glob`, `Grep`, `WebSearch`, `Edit`, `Write`, `Bash` without ever calling `TaskList()` first. This violates the protocol that every prompt response must begin with `TaskList()`.

**Nuance:** This gap is partly mitigated by `routing-guard.cjs` Check 1, which blocks blacklisted tools when `mode === 'router'` -- but only if routing-guard fires for that tool (see Gap 1). The tools with routing-guard registered (`Bash`, `Glob|Grep|WebSearch`) already get Check 1 protection. The gap is primarily for `Edit|Write|NotebookEdit` (Gap 1 overlap) and for Read (which is whitelisted and should not be blocked).

### Gap 4: Stale router-state.json Across Sessions

**Current State:**

`state-reset.cjs` fires on every `UserPromptSubmit` and resets state to defaults. This is correct for intra-session prompts. However:

1. **Between sessions:** If the user starts a new Claude Code session, `UserPromptSubmit` fires and state-reset runs. This IS correct -- no gap here for normal operation.

2. **state-reset.cjs omits `taskListCalledSincePrompt`:** The default state written by state-reset (line 53-70) does not include this field. While this works due to spread default behavior in `getDefaultState()`, it is fragile.

3. **No staleness detection:** If state-reset fails (disk error, permissions), the old state persists with `mode: "agent"` and `taskSpawned: true`, allowing the Router to bypass all mode-based checks.

4. **Current state as evidence:** The router-state.json snapshot shows `mode: "agent"`, `taskSpawned: true` -- this is the state LEFT by the currently-running agent session. On next `UserPromptSubmit`, state-reset will clear it. The concern is: what if state-reset does not run?

**Impact:** MEDIUM. The fail-open behavior of state-reset.cjs (line 95: `process.exit(0)` on error) means a reset failure silently passes, leaving stale state. The Router would then appear to be in agent mode and bypass all self-checks.

### Gap 5: Prompt-Level Identity Conflict

**Current State:**

CLAUDE.md first 6 lines:

```markdown
# CLAUDE CODE ENTERPRISE FRAMEWORK - MULTI-AGENT ORCHESTRATOR

**Version: v2.2.1 (compressed)**

> **SYSTEM OVERRIDE: ACTIVE**
> You are the **ROUTER** for a true multi-agent system. You route work by spawning subagents via the **Task tool**.
```

This is clear. However, the system-level prompt (from Claude Code itself) says something like "You are Claude Code, Anthropic's official CLI for Claude" with broad tool capabilities.

**Impact:** LOW. The CLAUDE.md identity is loaded as project instructions and does override default behavior in practice. The conflict is theoretical -- in practice, the CLAUDE.md Router identity is respected. However, under token pressure (long conversations, context compression), the Router identity could be weakened if it appears late in the context window.

---

## 4. Fix Designs

### Fix 1: Register routing-guard.cjs for Edit|Write|NotebookEdit

**Design:**

Add `routing-guard.cjs` to the `Edit|Write|NotebookEdit` matcher in settings.json, positioned BEFORE `unified-creator-guard.cjs`.

**Rationale for ordering:** routing-guard.cjs Check 1 (router-self-check) should fire FIRST because:

1. If Router is using Edit directly, that should be blocked immediately (Check 1).
2. Only if the tool use is from an agent context should creator-guard run.
3. Creator-guard is more expensive (checks creator state, TTL, etc.).

**Proposed settings.json change:**

```json
{
  "matcher": "Edit|Write|NotebookEdit",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/routing/routing-guard.cjs"
    },
    {
      "type": "command",
      "command": "node .claude/hooks/routing/unified-creator-guard.cjs"
    },
    {
      "type": "command",
      "command": "node .claude/hooks/safety/unified-pre-write-hook.cjs"
    },
    {
      "type": "command",
      "command": "node .claude/hooks/evolution/evolution-state-guard.cjs"
    },
    {
      "type": "command",
      "command": "node .claude/hooks/evolution/research-enforcement.cjs"
    },
    {
      "type": "command",
      "command": "node .claude/hooks/evolution/quality-gate-validator.cjs"
    }
  ]
}
```

**Code changes to routing-guard.cjs:** None required. Check 1 (`checkRouterSelfCheck`) already handles Edit/Write/NotebookEdit as blacklisted tools. Check 5 (`checkRouterWrite`) already handles write-without-agent-context. The only change is the settings.json registration to trigger these existing checks.

**Agent write pass-through:** When an agent (not Router) uses Edit/Write, the state will have `mode: "agent"` and `taskSpawned: true` (set by `pre-task-unified.cjs` Check 1 via `enterAgentMode()`). routing-guard Check 1 passes for agent mode. Creator-guard then applies its own checks. No false positives.

**Always-allowed writes:** routing-guard already has `isAlwaysAllowedWrite()` (line 455-459) which allows writes to `.claude/context/runtime/` and `.claude/context/memory/`. Memory updates by agents will not be blocked even if state has a brief race condition.

### Fix 2: Read Audit (Deprioritized)

**Design Decision: DO NOT register routing-guard.cjs for Read.**

**Rationale:**

1. Read is already in `WHITELISTED_TOOLS` -- routing-guard would always allow it.
2. Adding another process spawn for every Read adds latency with no enforcement benefit.
3. Router legitimately reads dozens of files per prompt cycle (agent files, templates, docs, memory).
4. The audit benefit does not justify the performance cost.

**Alternative (optional, LOW priority):** If Read auditing is desired, add it to the wildcard `pre-tool-unified.cjs` as an inline check (no new process spawn). This would log Read targets to the audit trail without blocking.

**Proposed non-blocking audit in pre-tool-unified.cjs:**

```javascript
// In checkToolScope or a new checkReadAudit function:
if (toolName === 'Read') {
  const filePath = toolInput?.file_path || '';
  const ROUTER_READ_ALLOWLIST = [
    /\.claude[/\\]agents[/\\]/,
    /\.claude[/\\]docs[/\\]/,
    /\.claude[/\\]context[/\\]runtime[/\\]/,
    /\.claude[/\\]context[/\\]memory[/\\]/,
    /\.claude[/\\]templates[/\\]/,
    /\.claude[/\\]workflows[/\\]/,
    /\.claude[/\\]rules[/\\]/,
    /\.claude[/\\]CLAUDE\.md$/,
    /\.claude[/\\]settings\.json$/,
  ];
  const isAllowlisted = ROUTER_READ_ALLOWLIST.some(p => p.test(filePath));
  if (!isAllowlisted) {
    console.error(`[pre-tool-unified:read-audit] Non-standard Router read: ${filePath}`);
  }
}
```

This is informational only. No blocking.

### Fix 3: TaskList-First Gate Expansion

**Design:**

Expand the TaskList-first check to cover ALL tools except Step 0 reflection tools and state-reading tools.

**Location:** Add a new check to `routing-guard.cjs` rather than modifying pre-task-unified.cjs, because routing-guard already fires for Bash, Glob, Grep, WebSearch, TaskCreate, and (after Fix 1) Edit/Write/NotebookEdit.

**New Check 8: TaskList-first gate:**

```javascript
/**
 * Check 8: TaskList-First Gate
 * Blocks all routing-guard-watched tools until TaskList() is called.
 *
 * Environment: TASKLIST_FIRST_ENFORCEMENT=block|warn|off (default: block)
 *
 * Exempt tools (allowed before TaskList):
 * - Read (Step 0 reflection check, agent files)
 * - TaskList, TaskGet, TaskUpdate (task management itself)
 * - AskUserQuestion (user interaction)
 */
function checkTaskListFirstGate(toolName) {
  // Only applies in router mode
  const state = getCachedRouterState();
  if (state.mode === 'agent' || state.taskSpawned) {
    return { pass: true };
  }

  // TaskList-first only matters for router context
  if (state.taskListCalledSincePrompt) {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('TASKLIST_FIRST_ENFORCEMENT', 'block');
  if (enforcement === 'off') {
    return { pass: true };
  }

  const message = `[TASKLIST-FIRST VIOLATION] Router must call TaskList() before ${toolName}.
Call TaskList() first to check existing tasks, then proceed.`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}
```

**Integration into `runAllChecks()`:** Insert Check 8 BEFORE Check 0 (router-bash) so it fires first for all watched tools.

**Note on pre-task-unified.cjs:** The existing `checkTaskListFirst()` in pre-task-unified.cjs already covers the Task tool. With Check 8 in routing-guard, there will be redundant coverage for Task (once via pre-task-unified Check 0, once via routing-guard Check 8 if routing-guard fires for Task). This is acceptable -- belt and suspenders for the most critical tool. If desired, pre-task-unified's Check 0 can be kept as-is or deprecated in favor of the routing-guard version.

### Fix 4: State Reset Hardening

**Design: Three improvements to state-reset.cjs.**

**4a. Include `taskListCalledSincePrompt` in default state:**

```javascript
const defaultState = {
  mode: 'router',
  lastReset: new Date().toISOString(),
  taskSpawned: false,
  taskSpawnedAt: null,
  taskDescription: null,
  sessionId: sessionId,
  taskListCalledSincePrompt: false, // <-- ADD THIS
  complexity: 'trivial',
  requiresPlannerFirst: false,
  plannerSpawned: false,
  requiresSecurityReview: false,
  securitySpawned: false,
  lastTaskUpdateCall: null,
  lastTaskUpdateTaskId: null,
  lastTaskUpdateStatus: null,
  taskUpdatesThisSession: 0,
  currentSpawnTaskId: null, // <-- ADD THIS (matches getDefaultState)
  version: Date.now() % 10000,
};
```

**4b. Add staleness detection to routing-guard.cjs:**

When routing-guard reads the state, check the `lastReset` timestamp. If it is older than a configurable threshold (e.g., 10 minutes), treat the state as stale and assume router mode:

```javascript
/**
 * Check if state is stale (lastReset too old).
 * Returns true if state should be treated as router mode regardless of stored values.
 */
function isStateStale(state) {
  if (!state.lastReset) return true;
  const resetTime = new Date(state.lastReset).getTime();
  if (isNaN(resetTime)) return true;

  const staleThresholdMs = parseInt(process.env.STATE_STALE_THRESHOLD_MS || '600000', 10); // 10 min
  return Date.now() - resetTime > staleThresholdMs;
}
```

If state is stale, force `mode: 'router'`, `taskSpawned: false` for enforcement purposes. This provides a safety net if state-reset fails.

**4c. Make state-reset failure more visible:**

Change state-reset.cjs error handling from silent fail-open to logging + warning:

```javascript
} catch (err) {
  // CHANGED: Log to both stderr (for debugging) and stdout (for user visibility)
  console.error(`[state-reset.cjs] CRITICAL: State reset failed: ${err.message}`);
  console.error(`[state-reset.cjs] Router enforcement may be compromised.`);
  // Still exit 0 to not block user (fail-open for usability)
  // But the next routing-guard call will detect stale state (Fix 4b)
  process.exit(0);
}
```

### Fix 5: CLAUDE.md Identity Strengthening

**Design:**

Add explicit Router tool restrictions to the first 10 lines of CLAUDE.md, in the SYSTEM OVERRIDE block where the LLM sees it earliest.

**Proposed change to CLAUDE.md Section 0:**

Before:

```markdown
> **SYSTEM OVERRIDE: ACTIVE**
> You are the **ROUTER** for a true multi-agent system. You route work by spawning subagents via the **Task tool**.
```

After:

```markdown
> **SYSTEM OVERRIDE: ACTIVE**
> You are the **ROUTER** for a true multi-agent system. You route work by spawning subagents via the **Task tool**.
> **TOOL RESTRICTIONS: NEVER use Edit, Write, Bash (except whitelisted git), Glob, Grep, or WebSearch directly. ALWAYS spawn an agent via Task().**
```

This single line addition reinforces the Router identity at the highest-priority position in the context window.

---

## 5. Risk Assessment

### Risk Matrix

| Fix   | What Could Break?                                                                         | Likelihood | Impact | Mitigation                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix 1 | Agent writes blocked by routing-guard false positive (state race: agent mode not yet set) | LOW        | HIGH   | `isAlwaysAllowedWrite()` exemption; `enterAgentMode()` called in pre-task-unified before Task executes                                                                                                                     |
| Fix 1 | Increased latency on Edit/Write/NotebookEdit (one more process spawn)                     | CERTAIN    | LOW    | routing-guard is already optimized (cached state, single file read). ~15-25ms overhead.                                                                                                                                    |
| Fix 3 | Router cannot do Step 0 reflection check before TaskList                                  | LOW        | MEDIUM | Read is not a routing-guard watched tool, so Step 0 file reads are unaffected. Only blacklisted tools blocked.                                                                                                             |
| Fix 3 | Router Bash (git status) blocked before TaskList                                          | LOW        | LOW    | Check 8 exempts router-mode Bash since it only applies to blacklisted tools. But Bash IS in ALL_WATCHED_TOOLS. Need to ensure Check 8 runs BEFORE Check 0 (bash-check) and allows Bash if it is a whitelisted git command. |
| Fix 4 | Staleness detection false positive (state not stale, just long-running agent)             | LOW        | MEDIUM | 10-minute threshold is generous. Agents that run >10 min should have `enterAgentMode()` called, which updates `lastReset` indirectly via `saveStateWithRetry` version bumps.                                               |
| Fix 5 | Identity text too aggressive, confuses subagent prompts                                   | VERY LOW   | LOW    | The text is in CLAUDE.md which loads for the Router session only, not in subagent prompts.                                                                                                                                 |

### Backward Compatibility

All fixes are backward-compatible:

1. **Fix 1:** Only adds a hook to an existing matcher. All existing hooks on that matcher remain in same order.
2. **Fix 2:** No change (deprioritized).
3. **Fix 3:** New check in routing-guard with `TASKLIST_FIRST_ENFORCEMENT` env var (default: block, override to warn/off).
4. **Fix 4:** Additive changes to state-reset and routing-guard. No existing behavior removed.
5. **Fix 5:** Single line addition to CLAUDE.md.

### Performance Impact

| Fix   | Additional Overhead Per Tool Call                               | Affected Tools                  |
| ----- | --------------------------------------------------------------- | ------------------------------- |
| Fix 1 | +1 process spawn (~15-25ms)                                     | Edit, Write, NotebookEdit       |
| Fix 3 | +1 function call within existing routing-guard process (~0.1ms) | All routing-guard watched tools |
| Fix 4 | +1 timestamp comparison (~0.01ms)                               | All routing-guard watched tools |
| Fix 5 | +~30 tokens in CLAUDE.md context                                | All prompts                     |

Total worst-case: ~25ms additional latency on Edit/Write, negligible on other tools.

---

## 6. Migration Plan

### Phase 1: Low-Risk Fixes (Can deploy immediately)

**Step 1:** Fix 4a -- Add missing fields to state-reset.cjs default state

- File: `.claude/hooks/session/state-reset.cjs`
- Change: Add `taskListCalledSincePrompt: false` and `currentSpawnTaskId: null` to `defaultState` object
- Risk: None (additive, no behavior change)

**Step 2:** Fix 5 -- Add tool restriction line to CLAUDE.md

- File: `.claude/CLAUDE.md`
- Change: Add one line after "SYSTEM OVERRIDE" block
- Risk: None (documentation change)

### Phase 2: Medium-Risk Fixes (Deploy with warn mode first)

**Step 3:** Fix 1 -- Register routing-guard.cjs for Edit|Write|NotebookEdit

- File: `.claude/settings.json`
- Change: Add routing-guard.cjs as FIRST hook in Edit|Write|NotebookEdit matcher
- Deploy with `ROUTER_SELF_CHECK=warn` first to monitor false positives
- After 1 session with no false positives: switch to `ROUTER_SELF_CHECK=block` (default)
- Risk: Agent writes may be incorrectly blocked if state race condition occurs

**Step 4:** Fix 4b -- Add staleness detection to routing-guard.cjs

- File: `.claude/hooks/routing/routing-guard.cjs`
- Change: Add `isStateStale()` function, call at start of `getCachedRouterState()`
- Deploy with `STATE_STALE_THRESHOLD_MS=600000` (10 min, conservative)
- Risk: Long-running agents may trigger false stale detection

**Step 5:** Fix 4c -- Improve state-reset error visibility

- File: `.claude/hooks/session/state-reset.cjs`
- Change: Add error logging (already fail-open, just more visible)
- Risk: None

### Phase 3: New Enforcement (Deploy with warn mode)

**Step 6:** Fix 3 -- TaskList-first gate in routing-guard.cjs

- File: `.claude/hooks/routing/routing-guard.cjs`
- Change: Add Check 8 (`checkTaskListFirstGate`), insert before Check 0 in `runAllChecks()`
- Deploy with `TASKLIST_FIRST_ENFORCEMENT=warn` to monitor impact
- After 1 session with no issues: switch to `TASKLIST_FIRST_ENFORCEMENT=block`
- Risk: Router's whitelisted git Bash commands might be blocked before TaskList

### Phase 4: Verification

**Step 7:** Add tests for all new enforcement paths

- Test routing-guard fires for Edit/Write (Fix 1)
- Test staleness detection (Fix 4b)
- Test TaskList-first gate for Glob/Grep/Bash (Fix 3)
- Test state-reset includes all default fields (Fix 4a)

**Step 8:** Run full test suite to verify no regressions

**Step 9:** Restart session and verify hooks load correctly (settings.json cached at startup)

---

## 7. Architecture Decision Record

### ADR-XXX: Router Enforcement Hardening

**Date:** 2026-02-08

**Status:** PROPOSED (pending implementation)

**Context:**

Analysis identified 5 enforcement gaps in the Router protocol. The Router's self-check (routing-guard.cjs) contains correct blocking logic for all blacklisted tools, but the hook registration in settings.json does not trigger routing-guard for all relevant tool matchers. This creates a gap where the Router can use Edit/Write/NotebookEdit without the self-check firing.

Additionally, the TaskList-first enforcement only applies to the Task tool, not to other blacklisted tools. State management has minor fragility issues (missing fields in state-reset, no staleness detection).

**Decision:**

1. Register routing-guard.cjs for Edit|Write|NotebookEdit matcher (FIRST in hook order)
2. Deprioritize Read matcher registration (audit-only, in wildcard hook)
3. Add Check 8 (TaskList-first gate) to routing-guard.cjs for all watched tools
4. Harden state-reset.cjs with missing fields, staleness detection, and error visibility
5. Strengthen CLAUDE.md Router identity with explicit tool restriction line

**Consequences:**

- All Router tool restrictions are now enforced by hooks, not just by prompt instructions
- ~25ms additional latency on Edit/Write/NotebookEdit operations (one more process spawn)
- New environment variables: `TASKLIST_FIRST_ENFORCEMENT`, `STATE_STALE_THRESHOLD_MS`
- settings.json change requires session restart to take effect
- All fixes backward-compatible with warn mode override

---

## Appendix A: File Change Summary

| File                                      | Change Type | Description                                                |
| ----------------------------------------- | ----------- | ---------------------------------------------------------- |
| `.claude/settings.json`                   | MODIFY      | Add routing-guard.cjs to Edit\|Write\|NotebookEdit matcher |
| `.claude/hooks/routing/routing-guard.cjs` | MODIFY      | Add Check 8 (TaskList-first gate), add staleness detection |
| `.claude/hooks/session/state-reset.cjs`   | MODIFY      | Add missing default fields, improve error logging          |
| `.claude/CLAUDE.md`                       | MODIFY      | Add tool restriction line to SYSTEM OVERRIDE block         |
| Tests (new)                               | CREATE      | Tests for Fix 1, Fix 3, Fix 4 enforcement paths            |

## Appendix B: Environment Variable Reference

| Variable                         | Default | Values         | Purpose                             |
| -------------------------------- | ------- | -------------- | ----------------------------------- |
| `ROUTER_SELF_CHECK`              | block   | block/warn/off | Controls Check 1 enforcement        |
| `ROUTER_WRITE_GUARD`             | block   | block/warn/off | Controls Check 5 enforcement        |
| `ROUTER_BASH_GUARD`              | block   | block/warn/off | Controls Check 0 enforcement        |
| `TASKLIST_FIRST_ENFORCEMENT`     | block   | block/warn/off | Controls Check 8 enforcement (NEW)  |
| `STATE_STALE_THRESHOLD_MS`       | 600000  | milliseconds   | Staleness detection threshold (NEW) |
| `PLANNER_FIRST_ENFORCEMENT`      | block   | block/warn/off | Controls Check 2 enforcement        |
| `SECURITY_REVIEW_ENFORCEMENT`    | block   | block/warn/off | Controls Check 4 enforcement        |
| `SPECIALIST_ROUTING_ENFORCEMENT` | warn    | warn/block/off | Controls Check 7 enforcement        |

## Appendix C: Hook Firing Matrix (After Fixes)

| Tool         | pre-tool-unified | routing-guard | creator-guard | pre-write-hook | pre-task-unified | Other                                                            |
| ------------ | :--------------: | :-----------: | :-----------: | :------------: | :--------------: | ---------------------------------------------------------------- |
| Edit         |        Y         |  **Y (NEW)**  |       Y       |       Y        |        -         | evolution hooks                                                  |
| Write        |        Y         |  **Y (NEW)**  |       Y       |       Y        |        -         | evolution hooks, conflict-detector                               |
| NotebookEdit |        Y         |  **Y (NEW)**  |       Y       |       Y        |        -         | evolution hooks                                                  |
| Bash         |        Y         |       Y       |       -       |       -        |        -         | bash-validator, shell-injection, windows-null                    |
| Glob         |        Y         |       Y       |       -       |       -        |        -         | -                                                                |
| Grep         |        Y         |       Y       |       -       |       -        |        -         | -                                                                |
| WebSearch    |        Y         |       Y       |       -       |       -        |        -         | -                                                                |
| Task         |        Y         |       -       |       -       |       -        |        Y         | intent-match, spawn-assembler, config-validator, spawn-validator |
| TaskCreate   |        Y         |       Y       |       -       |       -        |        -         | -                                                                |
| TaskList     |        Y         |       -       |       -       |       -        |        -         | reflection-step0-guard                                           |
| TaskUpdate   |        Y         |       -       |       -       |       -        |        -         | task-status, pre-completion, quality-gate                        |
| Read         |        Y         |       -       |       -       |       -        |        -         | validate-skill-invocation                                        |
