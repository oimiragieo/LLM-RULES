<!-- Agent: security-architect | Task: #28 | Session: 2026-02-08 -->

# Router Enforcement Security Review

**Date:** 2026-02-08
**Agent:** Security Architect
**Task:** #28 - Phase 1B: Router Bypass Attack Surface
**Scope:** STRIDE threat analysis of 5 enforcement gaps in the router protocol

---

## Executive Summary

This report provides a STRIDE-based threat model for 5 enforcement gaps identified in the router protocol. The analysis covers the full attack surface of `routing-guard.cjs`, `router-state.json`, `settings.json` hook registration, and the TaskList-first enforcement mechanism. Three gaps are rated CRITICAL, one HIGH, and one MEDIUM.

**Key Finding:** The router enforcement system has a fundamentally sound design with defense-in-depth (state-reset on UserPromptSubmit, fail-closed on error, optimistic concurrency). However, **7 environment variable kill switches** can individually disable each enforcement check, and the `routing-guard.cjs` hook is **not registered** for `Edit|Write|NotebookEdit` tools in `settings.json`, creating a gap where the router self-check (Check 1) does not fire for write operations through its own matcher.

---

## Table of Contents

1. [Gap 1: routing-guard.cjs Not Triggered for Edit|Write|NotebookEdit](#gap-1)
2. [Gap 2: routing-guard.cjs Not Triggered for Read](#gap-2)
3. [Gap 3: No TaskList-First Enforcement](#gap-3)
4. [Gap 4: Stale router-state.json Across Sessions](#gap-4)
5. [Gap 5: System Prompt vs CLAUDE.md Identity Conflict](#gap-5)
6. [Environment Variable Kill Switch Inventory](#env-var-inventory)
7. [Race Condition Analysis](#race-conditions)
8. [Recommendations](#recommendations)
9. [Risk Matrix](#risk-matrix)

---

## <a name="gap-1"></a>Gap 1: routing-guard.cjs Not Triggered for Edit|Write|NotebookEdit

### Description

In `settings.json`, the `routing-guard.cjs` hook is registered for these PreToolUse matchers:

- `Bash` (line 54)
- `Glob|Grep|WebSearch` (line 63)
- `TaskCreate` (line 124)
- `Task` (via `pre-task-unified.cjs` at line 141, which duplicates routing-guard logic)

The `Edit|Write|NotebookEdit` matcher (line 68) registers `unified-creator-guard.cjs`, `unified-pre-write-hook.cjs`, and several evolution hooks -- but **NOT** `routing-guard.cjs`.

**Impact:** The Router Self-Check (Check 1) in `routing-guard.cjs` that blocks Router from using blacklisted tools (`BLACKLISTED_TOOLS = ['Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'WebSearch']`) is never invoked when the Router attempts an Edit, Write, or NotebookEdit operation.

**Mitigating Factor:** The Router Write Guard (Check 5, `checkRouterWrite`) inside `routing-guard.cjs` duplicates the write-blocking logic, but since `routing-guard.cjs` itself is never invoked for write tools, Check 5 never fires either. However, the `unified-creator-guard.cjs` and `unified-pre-write-hook.cjs` DO fire and provide some protection -- they block writes to creator artifact paths and enforce file placement rules. The `router-state.json` check for `mode === 'agent'` is done by `checkWriteAllowed()` in `router-state.cjs`, but this is only called by `checkRouterWrite()` in routing-guard, which never fires.

### STRIDE Analysis

| Threat                     | Applicable | Analysis                                                                                                                                                                                                                                                  |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | YES        | Router can impersonate an agent by directly using Write/Edit tools. Since routing-guard never fires, there is no check that `state.mode === 'agent'` or `state.taskSpawned === true`.                                                                     |
| **Tampering**              | YES        | Router can directly modify any file not protected by creator-guard or pre-write-hook. Memory files (`.claude/context/memory/`) and runtime files (`.claude/context/runtime/`) are explicitly allowed by `ALWAYS_ALLOWED_WRITE_PATTERNS` in routing-guard. |
| **Repudiation**            | NO         | Write operations are logged by post-tool hooks (`sync-memory-index.cjs`, `code-index-updater.cjs`).                                                                                                                                                       |
| **Information Disclosure** | NO         | Write operations do not disclose information.                                                                                                                                                                                                             |
| **Denial of Service**      | LOW        | Router could corrupt critical runtime files.                                                                                                                                                                                                              |
| **Elevation of Privilege** | YES        | Router can bypass the agent-spawning requirement and directly modify code, effectively operating as a developer agent without the spawn protocol. This violates the Router Iron Laws.                                                                     |

### Risk Rating: **CRITICAL**

The Router self-check is the primary enforcement mechanism that prevents the Router from using blacklisted tools. Without this check firing for write operations, the Router can bypass the entire agent-spawning requirement for Edit/Write/NotebookEdit.

---

## <a name="gap-2"></a>Gap 2: routing-guard.cjs Not Triggered for Read

### Description

The `Read` tool matcher in `settings.json` (line 102) registers only `validate-skill-invocation.cjs`. The `routing-guard.cjs` does not include `Read` in its `ALL_WATCHED_TOOLS` list, and even if it were registered, it would not check Read operations.

`Read` is in the `WHITELISTED_TOOLS` array (`['TaskUpdate', 'TaskList', 'TaskGet', 'Read', 'AskUserQuestion']`), so even if routing-guard were triggered, it would always pass.

### STRIDE Analysis

| Threat                     | Applicable | Analysis                                                                                                                                                                                                                                                   |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | NO         | Read is explicitly whitelisted for Router.                                                                                                                                                                                                                 |
| **Tampering**              | NO         | Read does not modify data.                                                                                                                                                                                                                                 |
| **Information Disclosure** | LOW        | Router can read any file, including potentially sensitive configuration. The CLAUDE.md restricts Read to "agent files / routing docs only" but there is no enforcement of this restriction. The Router can read `.env`, `config.yaml`, or any source file. |
| **Elevation of Privilege** | NO         | Read does not grant execution capabilities.                                                                                                                                                                                                                |

### Risk Rating: **LOW**

The Read tool is explicitly whitelisted for the Router in the protocol. The lack of Read-path restrictions is a design choice documented in CLAUDE.md. While the Router could read files beyond its intended scope (agent files, routing docs), this does not enable privilege escalation. The `validate-skill-invocation.cjs` hook provides complementary validation for skill-related reads.

**Note:** If sensitive files exist (API keys in `.env`, database credentials), the Router CAN read them. However, this is an information disclosure risk at the LLM layer, not a hooks enforcement gap -- the LLM has access to read any file regardless of hooks.

---

## <a name="gap-3"></a>Gap 3: No TaskList-First Enforcement

### Description

The CLAUDE.md protocol states: "FIRST ROUTING TOOL CALL MUST BE: TaskList()". The system tracks whether TaskList was called via:

1. `task-list-tracker.cjs` (PostToolUse(TaskList)) -- sets `taskListCalledSincePrompt = true` in `router-state.json`
2. `router-state.cjs` exposes `isTaskListCalledSincePrompt()` and `setTaskListCalled()`

However, there is **no PreToolUse hook** that checks `isTaskListCalledSincePrompt()` before allowing `Task()` spawning. The `pre-task-unified.cjs` hook, which fires before Task tool use, does not check this flag. The `routing-guard.cjs` also does not check this flag in any of its 8 checks (0-7).

**Impact:** The Router can spawn agents via `Task()` without first calling `TaskList()`, violating the protocol. This means the Router may miss pending tasks, duplicate work, or spawn agents for tasks already in progress.

### STRIDE Analysis

| Threat                     | Applicable | Analysis                                                                                                                                                             |
| -------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | NO         | No identity-related impact.                                                                                                                                          |
| **Tampering**              | LOW        | Could lead to duplicate task creation, but does not directly modify data.                                                                                            |
| **Repudiation**            | YES        | Without TaskList-first, the Router may not see existing tasks. If it spawns a duplicate agent, the provenance trail becomes confused -- which agent owns which work? |
| **Denial of Service**      | MEDIUM     | Duplicate agent spawns waste compute and memory resources. Under memory pressure (Check 6), this could trigger cascading failures.                                   |
| **Elevation of Privilege** | NO         | TaskList-first is a workflow control, not an authorization control.                                                                                                  |

### Risk Rating: **MEDIUM**

The `taskListCalledSincePrompt` flag is tracked but never enforced. The state infrastructure exists (setter/getter/reset) but the enforcement point (a PreToolUse check) was never wired. This is an incomplete implementation rather than a design flaw.

**Bypass Analysis:** Even if enforcement were added, calling `TaskList()` with no follow-up action satisfies the flag check. The flag merely records that TaskList was called; it does not validate that the Router acted on the results. This is by design -- the enforcement is procedural (you must look at the task list) not semantic (you must act correctly on it).

---

## <a name="gap-4"></a>Gap 4: Stale router-state.json Across Sessions

### Description

The `router-state.json` file persists on disk between sessions. If a session ends with `mode: 'agent'` and `taskSpawned: true`, a new session inherits this stale state.

**Current Mitigations:**

1. **`state-reset.cjs`** (UserPromptSubmit hook, registered first in hook chain at line 14) -- Resets state to defaults on every user prompt. This includes `mode: 'router'`, `taskSpawned: false`, `complexity: 'trivial'`, etc.
2. **`user-prompt-unified.cjs`** (UserPromptSubmit hook, registered second at line 18) -- Also calls `routerState.resetToRouterMode()` and detects session boundaries via `sessionId` comparison (ROUTING-003 fix).
3. **`state-reset.cjs`** resets the `version` field to `Date.now() % 10000` (not monotonically increasing), which is a minor issue for optimistic concurrency but not security-critical.

**Impact:** With both reset hooks firing on UserPromptSubmit, stale state is cleaned up before any routing decisions occur. The gap exists only in the theoretical scenario where both hooks fail to execute.

### STRIDE Analysis

| Threat                     | Applicable      | Analysis                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | YES (mitigated) | Stale `mode: 'agent'` state would allow the Router to use blacklisted tools (Edit, Write, Glob, etc.) without spawning an agent. The state-reset hooks mitigate this by resetting state on every prompt.                                                                                                                                       |
| **Tampering**              | YES             | **`router-state.json` can be directly modified** by any process with filesystem access. An agent (or manually edited file) could set `mode: 'agent'`, `taskSpawned: true` to bypass routing checks. The `safeJSONParse` function in `router-state.cjs` protects against prototype pollution but not against semantically invalid state values. |
| **Information Disclosure** | LOW             | The state file contains session IDs and task descriptions.                                                                                                                                                                                                                                                                                     |
| **Denial of Service**      | LOW             | Corrupting the state file would trigger `getDefaultState()` fallback (fail-safe to router mode).                                                                                                                                                                                                                                               |
| **Elevation of Privilege** | YES (mitigated) | If state were not reset, the Router would inherit agent privileges from the previous session. The double-reset (state-reset.cjs + user-prompt-unified.cjs) provides defense-in-depth.                                                                                                                                                          |

### Risk Rating: **HIGH**

While the UserPromptSubmit hooks provide strong mitigation, the state file is a shared mutable resource on the filesystem. The primary risk vectors are:

1. **Agent tampering:** A spawned agent could modify `router-state.json` to set `mode: 'agent'` permanently, effectively disabling all routing-guard checks for the Router. The `ALWAYS_ALLOWED_WRITE_PATTERNS` in routing-guard allows writes to `.claude/context/runtime/` (which includes `router-state.json`).

2. **Race condition between agents:** When multiple agents run concurrently, they may conflict on state writes. The `saveStateWithRetry` function provides optimistic concurrency control, but the double-read pattern (read, re-read, compare versions) is not truly atomic on Windows NTFS (documented in code comments).

3. **Version field weakness:** `state-reset.cjs` sets `version: Date.now() % 10000`, which can collide (same millisecond modulo) and does not monotonically increase across sessions.

---

## <a name="gap-5"></a>Gap 5: System Prompt vs CLAUDE.md Identity Conflict

### Description

The security-architect agent file defines this agent's role as "Security-First Architect & Threat Mitigation Specialist." The CLAUDE.md system prompt defines the main Claude Code session as a "ROUTER" that must only route work. When a security-architect agent is spawned, it operates within the full tool set (Read, Write, Edit, Bash, Grep, Glob, etc.), which is correct.

**The potential conflict:** If the CLAUDE.md Router directives leak into spawned agent prompts (via prompt assembly), agents may self-restrict to Router-only behavior (TaskList + Task + Read only). Conversely, if agent tool permissions are too broad, a spawned agent could modify routing infrastructure.

**Current Mitigation:** The `spawn-prompt-assembler.cjs` hook constructs agent prompts from templates, agent files, and spawn context. The assembled prompt includes the agent's identity but does NOT include the full CLAUDE.md Router directives. The agent operates under its own persona, not the Router persona.

### STRIDE Analysis

| Threat                     | Applicable | Analysis                                                                                                                                                                                                                                 |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing**               | LOW        | An agent prompt could be crafted to include Router-identity directives, causing the agent to self-restrict or behave as Router. This is prompt injection via spawn prompt, not a hooks gap.                                              |
| **Tampering**              | LOW        | Agent identity is set by the spawn prompt, which is constructed server-side by hooks.                                                                                                                                                    |
| **Elevation of Privilege** | LOW        | Agents already have full tool access. The identity conflict could cause agents to attempt Router-like behavior (spawning sub-agents when they should implement directly), but this is a prompt engineering issue, not a security bypass. |

### Risk Rating: **LOW**

This gap is a UX/behavioral concern rather than a security vulnerability. The spawn-prompt-assembler correctly scopes agent identity. No privilege escalation is possible through identity confusion alone.

---

## <a name="env-var-inventory"></a>Environment Variable Kill Switch Inventory

The following environment variables can individually disable enforcement checks. Each one represents a security override that, if set, reduces the defense surface.

| Env Var                          | Default | Values         | Disables                                              | Audit Logged                            | Used By                                     |
| -------------------------------- | ------- | -------------- | ----------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| `ROUTER_BASH_GUARD`              | `block` | block/warn/off | Check 0: Bash whitelist enforcement                   | YES (`auditSecurityOverride`)           | `routing-guard.cjs`                         |
| `ROUTER_SELF_CHECK`              | `block` | block/warn/off | Check 1: Blacklisted tools enforcement                | YES (implicit via `getEnforcementMode`) | `routing-guard.cjs`                         |
| `PLANNER_FIRST_ENFORCEMENT`      | `block` | block/warn/off | Check 2+3: Planner-first requirement                  | YES (`auditSecurityOverride`)           | `routing-guard.cjs`, `pre-task-unified.cjs` |
| `SECURITY_REVIEW_ENFORCEMENT`    | `block` | block/warn/off | Check 4: Security review requirement                  | NO (missing audit on `=off`)            | `routing-guard.cjs`, `pre-task-unified.cjs` |
| `ROUTER_WRITE_GUARD`             | `block` | block/warn/off | Check 5: Router write blocking                        | YES (`auditSecurityOverride`)           | `routing-guard.cjs`                         |
| `MEMORY_SPAWN_THROTTLING`        | `true`  | true/false     | Check 6: Memory pressure spawn blocking               | NO (no audit on `=false`)               | `routing-guard.cjs`                         |
| `SPECIALIST_ROUTING_ENFORCEMENT` | `warn`  | warn/block/off | Check 7: Specialist-first routing                     | NO (no audit on `=off`)                 | `routing-guard.cjs`                         |
| `HOOK_FAIL_OPEN`                 | unset   | true           | Error handler: fail-open instead of fail-closed       | YES (`auditLog`)                        | `routing-guard.cjs`                         |
| `ALLOW_ROUTER_WRITE`             | unset   | true           | Write guard bypass (separate from ROUTER_WRITE_GUARD) | YES (inline `console.error`)            | `router-state.cjs`                          |
| `CREATOR_GUARD`                  | `block` | block/warn/off | Creator artifact path protection                      | YES (in `unified-creator-guard.cjs`)    | `unified-creator-guard.cjs`                 |
| `TOOL_SCOPE_VALIDATOR`           | `warn`  | warn/block/off | Tool scope restriction enforcement                    | NO                                      | `pre-tool-unified.cjs`                      |
| `ROUTER_DEBUG`                   | unset   | false          | Disables debug logging (suppresses detection info)    | N/A                                     | `routing-guard.cjs`                         |

### Kill Switch Threat Assessment

**Aggregate Risk:** If an attacker (or misconfigured `.env` file) sets ALL kill switches to `off`/`false`/`true`:

- All 8 routing checks disabled
- Router can use any tool directly
- No planner-first, no security review, no write blocking
- Error handler fails open instead of closed
- Creator guard disabled

**Mitigation:** Kill switches require environment variable access, which is only available to:

1. The `.env` file (gitignored, local only)
2. Process startup configuration
3. Code that sets `process.env` before requiring hook modules

**Recommendation:** See Recommendations section for centralized kill switch monitoring.

### Audit Logging Gaps

Three kill switches lack explicit `auditSecurityOverride()` calls when set to `off`:

1. `SECURITY_REVIEW_ENFORCEMENT=off` (Check 4, line 858) -- calls `return { pass: true }` without audit
2. `MEMORY_SPAWN_THROTTLING=false` (Check 6, line 965) -- calls `return { pass: true }` without audit
3. `SPECIALIST_ROUTING_ENFORCEMENT=off` (Check 7, line 1059) -- calls `return { pass: true }` without audit

---

## <a name="race-conditions"></a>Race Condition Analysis

### State File Concurrency

`router-state.json` is shared across multiple hooks running in separate Node.js processes:

- `state-reset.cjs` (UserPromptSubmit) writes full reset
- `user-prompt-unified.cjs` (UserPromptSubmit) writes reset + sessionId + preset
- `routing-guard.cjs` (PreToolUse) reads state for routing decisions
- `task-list-tracker.cjs` (PostToolUse) writes `taskListCalledSincePrompt`
- `post-task-unified.cjs` (PostToolUse) writes `mode: 'agent'`

**Sequence Risk:**

1. UserPromptSubmit fires `state-reset.cjs` and `user-prompt-unified.cjs` sequentially (same hook chain). These both reset to router mode. Safe.
2. PreToolUse fires `routing-guard.cjs` which reads state. If this fires between two UserPromptSubmit hooks (within same chain), the state could be partially reset. Low risk because hooks in the same chain are sequential.
3. PostToolUse(Task) fires `post-task-unified.cjs` which writes `mode: 'agent'`. If the Router spawns two agents in parallel, two post-task-unified hooks could race on the state file. The `saveStateWithRetry` with optimistic concurrency (5 retries, exponential backoff) mitigates this.

**TOCTOU (Time-of-Check-Time-of-Use) Risk:**
In `routing-guard.cjs`, the cached state (`getCachedRouterState()`) is read once per invocation. Between the check and the action (process.exit), no other hook can modify the cached value. However, the disk file could change. Since the hook runs in its own process, this is not exploitable in practice.

**Windows NTFS Limitation:**
The code comments (line 556-570 in `router-state.cjs`) acknowledge that `fs.renameSync` is not truly atomic on Windows NTFS. The `atomicWriteJSONSync` utility provides best-effort atomicity. This is a known platform limitation, not a code defect.

---

## <a name="recommendations"></a>Recommendations

### CRITICAL Priority

#### R-1: Register routing-guard.cjs for Edit|Write|NotebookEdit

**Gap:** #1
**Action:** Add `routing-guard.cjs` to the `Edit|Write|NotebookEdit` PreToolUse matcher in `settings.json`. Place it BEFORE `unified-creator-guard.cjs` so the Router self-check fires first.

**Current (line 68-90):**

```json
{
  "matcher": "Edit|Write|NotebookEdit",
  "hooks": [
    { "type": "command", "command": "node .claude/hooks/routing/unified-creator-guard.cjs" },
    { "type": "command", "command": "node .claude/hooks/safety/unified-pre-write-hook.cjs" },
    ...
  ]
}
```

**Proposed:**

```json
{
  "matcher": "Edit|Write|NotebookEdit",
  "hooks": [
    { "type": "command", "command": "node .claude/hooks/routing/routing-guard.cjs" },
    { "type": "command", "command": "node .claude/hooks/routing/unified-creator-guard.cjs" },
    { "type": "command", "command": "node .claude/hooks/safety/unified-pre-write-hook.cjs" },
    ...
  ]
}
```

**Risk if not done:** Router can bypass agent-spawning requirement for write operations.
**Effort:** LOW (single settings.json change, restart required for effect)

#### R-2: Add audit logging for missing kill switch overrides

**Gap:** Environment variable inventory
**Action:** Add `auditSecurityOverride()` calls to:

- `checkSecurityReview()` when `SECURITY_REVIEW_ENFORCEMENT=off`
- `checkMemoryPressure()` when `MEMORY_SPAWN_THROTTLING=false`
- `checkSpecialistOverride()` when `SPECIALIST_ROUTING_ENFORCEMENT=off`

**Risk if not done:** Silent security override use in these checks goes undetected.
**Effort:** LOW (3 one-line additions)

### HIGH Priority

#### R-3: Validate router-state.json contents against schema

**Gap:** #4
**Action:** Add schema validation to `getState()` in `router-state.cjs`. Verify that:

- `mode` is exactly `'router'` or `'agent'` (not arbitrary strings)
- `complexity` is in `VALID_COMPLEXITY_LEVELS`
- `taskSpawned` is boolean (not truthy string like `'true'`)
- `version` is non-negative integer

If validation fails, fall back to `getDefaultState()` (fail-safe to router mode).

**Risk if not done:** Semantically invalid state could bypass routing checks.
**Effort:** MEDIUM (add validation function + tests)

#### R-4: Protect router-state.json from agent writes

**Gap:** #4
**Action:** The `ALWAYS_ALLOWED_WRITE_PATTERNS` in `routing-guard.cjs` allows writes to ALL files under `.claude/context/runtime/`. This includes `router-state.json`, `workflow-state.json`, `execution-limits.json`, and other sensitive runtime state. Consider either:

- (a) Removing `router-state.json` from the always-allowed pattern and managing it only through library functions, or
- (b) Adding write validation to `router-state.cjs` that rejects writes from non-hook processes (checking `process.env.CLAUDE_HOOK_TYPE` or similar)

**Risk if not done:** Any agent with write access can manipulate router state.
**Effort:** MEDIUM

### MEDIUM Priority

#### R-5: Implement TaskList-first enforcement in pre-task-unified.cjs

**Gap:** #3
**Action:** Add a check to `pre-task-unified.cjs` that reads `isTaskListCalledSincePrompt()` and blocks/warns if `Task()` is called before `TaskList()`.

**Enforcement mode:** `TASKLIST_FIRST_ENFORCEMENT=warn` (default warn, not block, to avoid breaking existing workflows during rollout).

**Risk if not done:** Router may spawn agents without checking existing task state.
**Effort:** LOW (add check function, read existing flag)

#### R-6: Use monotonically increasing version in state-reset.cjs

**Gap:** #4
**Action:** Replace `version: Date.now() % 10000` with reading the current version from the file and incrementing by 1 (consistent with `saveStateWithRetry` pattern). The modulo operation can cause version collisions and breaks the optimistic concurrency assumption that version numbers are monotonically increasing.

**Risk if not done:** Optimistic concurrency version collision (rare, low impact).
**Effort:** LOW

---

## <a name="risk-matrix"></a>Risk Matrix

| Gap | Description                            | Risk         | Exploitability                        | Impact                                  | Mitigation Exists                             | Recommendation |
| --- | -------------------------------------- | ------------ | ------------------------------------- | --------------------------------------- | --------------------------------------------- | -------------- |
| #1  | routing-guard not triggered for writes | **CRITICAL** | HIGH (Router can directly Edit/Write) | HIGH (bypasses agent-spawn requirement) | Partial (creator-guard, pre-write-hook)       | R-1            |
| #2  | routing-guard not triggered for Read   | **LOW**      | N/A (Read is whitelisted by design)   | LOW (info disclosure only)              | Full (Read is whitelisted)                    | None required  |
| #3  | No TaskList-first enforcement          | **MEDIUM**   | MEDIUM (Router skips TaskList)        | MEDIUM (duplicate work, missed tasks)   | Partial (flag tracked but not enforced)       | R-5            |
| #4  | Stale router-state.json                | **HIGH**     | LOW (requires file system access)     | HIGH (bypasses all routing checks)      | Strong (double-reset on UserPromptSubmit)     | R-3, R-4, R-6  |
| #5  | System prompt identity conflict        | **LOW**      | LOW (prompt engineering only)         | LOW (behavioral, not security)          | Full (spawn-prompt-assembler scopes identity) | None required  |

### Overall System Security Posture

**Strengths:**

- Fail-closed error handling (SEC-008) in routing-guard
- Defense-in-depth: state-reset + user-prompt-unified double-reset
- Optimistic concurrency control with retry on state writes
- Prototype pollution prevention (SEC-007) in JSON parsing
- Atomic file writes via temp+rename pattern
- Comprehensive violation tracking and audit logging
- Memory pressure monitoring prevents resource exhaustion

**Weaknesses:**

- 7+ environment variable kill switches with no centralized monitoring
- 3 audit logging gaps in kill switch override detection
- No schema validation on router-state.json contents
- router-state.json writable by agents via ALWAYS_ALLOWED_WRITE_PATTERNS
- routing-guard.cjs not registered for Edit|Write|NotebookEdit (Gap #1)

---

## Appendix A: Hook Registration Matrix

Complete `settings.json` PreToolUse hook coverage:

| Tool         | routing-guard | creator-guard | pre-write-hook | bash-validator | shell-injection | pre-tool-unified | pre-task-unified | skill-invocation |
| ------------ | :-----------: | :-----------: | :------------: | :------------: | :-------------: | :--------------: | :--------------: | :--------------: |
| Bash         |      YES      |       -       |       -        |      YES       |       YES       |       YES        |        -         |        -         |
| Glob         |      YES      |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |
| Grep         |      YES      |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |
| WebSearch    |      YES      |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |
| Edit         |    **NO**     |      YES      |      YES       |       -        |        -        |       YES        |        -         |        -         |
| Write        |    **NO**     |      YES      |      YES       |       -        |        -        |       YES        |        -         |        -         |
| NotebookEdit |    **NO**     |      YES      |      YES       |       -        |        -        |       YES        |        -         |        -         |
| Read         |       -       |       -       |       -        |       -        |        -        |       YES        |        -         |       YES        |
| Task         |       -       |       -       |       -        |       -        |        -        |       YES        |       YES        |        -         |
| TaskCreate   |      YES      |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |
| TaskList     |       -       |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |
| TaskUpdate   |       -       |       -       |       -        |       -        |        -        |       YES        |        -         |        -         |

**Legend:** YES = hook fires for this tool, **NO** = gap (should fire but does not), `-` = not applicable

## Appendix B: Files Analyzed

| File                    | Path                                            | Lines | Purpose                                      |
| ----------------------- | ----------------------------------------------- | ----- | -------------------------------------------- |
| routing-guard.cjs       | `.claude/hooks/routing/routing-guard.cjs`       | 1449  | Unified routing enforcement (8 checks)       |
| router-state.cjs        | `.claude/lib/routing/router-state.cjs`          | 720   | State management for router/agent mode       |
| state-reset.cjs         | `.claude/hooks/session/state-reset.cjs`         | 105   | UserPromptSubmit state reset                 |
| user-prompt-unified.cjs | `.claude/hooks/routing/user-prompt-unified.cjs` | 1533  | UserPromptSubmit analysis and reset          |
| pre-tool-unified.cjs    | `.claude/hooks/routing/pre-tool-unified.cjs`    | 598   | Wildcard PreToolUse (cleanup, limits, scope) |
| pre-task-unified.cjs    | `.claude/hooks/routing/pre-task-unified.cjs`    | 500+  | PreToolUse(Task) routing enforcement         |
| task-list-tracker.cjs   | `.claude/hooks/routing/task-list-tracker.cjs`   | 68    | PostToolUse(TaskList) flag setter            |
| settings.json           | `.claude/settings.json`                         | 273   | Hook registration matrix                     |
| router-state.json       | `.claude/context/runtime/router-state.json`     | 20    | Runtime router state                         |
| hook-input.cjs          | `.claude/lib/utils/hook-input.cjs`              | 494   | Shared hook input parsing                    |

---

_End of Security Review_
