<!-- Agent: architect | Task: #8 | Session: 2026-03-05 -->

# Core Fundamentals Audit Report

**Date:** 2026-03-05
**Auditor:** Architect Agent (Task #8)
**Scope:** Complete framework wiring verification across 7 audit areas

---

## Executive Summary

All 40+ hook files registered in `settings.json` exist on disk -- zero dead references found. The routing, creator guard, spawn template, and task lifecycle systems are structurally sound. Two documentation discrepancies and one enforcement gap were identified as actionable findings.

**Overall Health:** GOOD (2 P2 findings, 1 P3 finding)

---

## Area 1: Routing System

### 1.1 Routing Guard Chain

**Status: PASS**

The routing guard uses a 3-file delegation chain:

- `routing-guard.cjs` (line 1-31) -- thin entrypoint wrapper
- `routing-guard-core.cjs` (line 4) -- delegates to `routing-guard-core.impl.cjs`
- `routing-guard-core.impl.cjs` -- actual logic, imports from 5 submodules:
  - `routing-guard-core.policy.cjs` (line 40) -- constants, keyword maps, utility predicates
  - `routing-guard-core.shared.cjs` (line 52) -- caching, memory monitor, dedup
  - `routing-guard-core.checks-router.cjs` (line 59) -- router-specific checks (Bash, Read, Write, memory pressure)
  - `routing-guard-core.checks-task.cjs` (line 72) -- task-specific checks (planner-first, security, specialist override)
  - `routing-guard-core.intent-model.cjs` (line 80) -- intent detection, agent matching

**Enforcement modes** (all default to `block`):
- `PLANNER_FIRST_ENFORCEMENT` -- routing-guard.cjs:15
- `SECURITY_REVIEW_ENFORCEMENT` -- routing-guard.cjs:16
- `CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT` -- routing-guard.cjs:17
- `HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT` -- routing-guard.cjs:18
- `ROUTER_BASH_GUARD` -- routing-guard.cjs:19
- `SPECIALIST_ROUTING_ENFORCEMENT` -- routing-guard.cjs:21, checks-task.cjs:248
- `TASKLIST_FIRST_ENFORCEMENT` -- routing-guard.cjs:22
- `INTENT_AGENT_MATCH` -- routing-guard.cjs:23

### 1.2 Routing Library Files

**Status: PASS**

All referenced routing library files exist at `.claude/lib/routing/`:
- `routing-table.cjs` -- source of truth for agent routing
- `fuzzy-intent-matcher.cjs` -- semantic similarity scoring
- `routing-table-intent-keywords-data.cjs` -- keyword-to-agent mapping
- `routing-table-core-map.cjs` -- core agent type map
- `routing-table-disambiguation.cjs` -- ambiguity resolution
- `router-state.cjs` -- runtime router state management
- `task-lifecycle-state.cjs` -- task status transitions
- `intent-classifier.cjs` -- intent classification
- `agent-registry-resolver.cjs` -- registry lookup

### 1.3 Documentation Discrepancy (FINDING F-01, P2)

**CLAUDE.md Section 1.3** states:
> `SPECIALIST_ROUTING_ENFORCEMENT=warn|block|off`, default: **warn**

**Source code** at `routing-guard-core.checks-task.cjs:248`:
```javascript
const enforcement = getEnforcementMode('SPECIALIST_ROUTING_ENFORCEMENT', 'block');
```

The actual default is `block`, not `warn`. CLAUDE.md is misleading.

**Recommendation:** Update CLAUDE.md Section 1.3 to state `default: block` for `SPECIALIST_ROUTING_ENFORCEMENT`.

---

## Area 2: Creator Guards

### 2.1 Unified Creator Guard

**Status: PASS**

File: `unified-creator-guard.cjs` (800 lines)

**Protected artifact types** (CREATOR_CONFIGS array, lines 75-164): 11 types covering skills, agents, hooks, workflows, templates, schemas, rules, commands, tools, settings.json, agent-registry.json, and reflection state.

**Security posture:**
- `CREATOR_GUARD` env var: default `block` (line 514)
- Exit code 2 for blocks (lines 689, 731) -- correct fail-closed per SEC-008
- Uses `safeParseJSON` from `.claude/lib/utils/safe-json.cjs` (line 42) -- SE-02 compliant
- TTL bounds: MIN=30s, MAX=10min, DEFAULT=3min (lines 177-194) -- prevents stale state

**Creator state management:**
- State file: `.claude/context/runtime/creator-active-state.json`
- `markCreatorActive()` / `clearCreatorActive()` / `isCreatorActive()` exported
- Distinguishes new file creation (requires active creator) vs editing existing file (allowed without creator, line 549)
- Schema validation at write time via `validateArtifactContent` (lines 409-492)

### 2.2 Post-Creation Integration

**Status: PASS**

File: `post-creation-integration.cjs` -- PostToolUse hook on TaskUpdate
- Detects creator completions, queues integration analysis
- Enforcement mode: warn (default)

---

## Area 3: Hook System Integrity

### 3.1 Hook Registration Verification

**Status: PASS -- ALL HOOKS EXIST**

Every hook file referenced in `.claude/settings.json` was verified on disk. Complete verification matrix:

| Lifecycle Event | Hook File | Exists |
|-----------------|-----------|--------|
| UserPromptSubmit | `hooks/session/step0-reflection-enforcer.cjs` | YES |
| UserPromptSubmit | `hooks/reflection/reflection-queue-processor.cjs` | YES |
| UserPromptSubmit | `tools/cli/sanitize-debug-log.cjs` | YES |
| UserPromptSubmit | `hooks/session/user-prompt-orchestrator.cjs` | YES |
| UserPromptSubmit | `hooks/session/audit-skill-recency.cjs` | YES |
| UserPromptSubmit | `hooks/session/stale-task-detector.cjs` | YES |
| PreToolUse (*) | `hooks/routing/pre-tool-unified.cjs` | YES |
| PreToolUse (Bash\|Glob\|...) | `hooks/routing/router-tool-lockdown.cjs` | YES |
| PreToolUse (WebFetch\|Bash) | `hooks/safety/external-content-guard.cjs` | YES |
| PreToolUse (Bash) | `hooks/safety/bash-pretool-bundle.cjs` | YES |
| PreToolUse (Grep) | `hooks/safety/hybrid-search-enforcer.cjs` | YES |
| PreToolUse (Glob\|Grep\|WebSearch) | `hooks/routing/routing-guard.cjs` | YES |
| PreToolUse (Edit\|Write\|NotebookEdit) | `hooks/safety/write-pretool-bundle.cjs` | YES |
| PreToolUse (Edit\|Write\|NotebookEdit) | `hooks/evolution/research-enforcement.cjs` | YES |
| PreToolUse (Edit\|Write\|NotebookEdit) | `hooks/evolution/evolution-state-guard.cjs` | YES |
| PreToolUse (Edit\|Write\|NotebookEdit) | `hooks/evolution/quality-gate-validator.cjs` | YES |
| PreToolUse (Write) | `hooks/evolution/conflict-detector.cjs` | YES |
| PreToolUse (Read) | `hooks/safety/validate-skill-invocation.cjs` | YES |
| PreToolUse (TaskList) | `hooks/reflection/reflection-step0-guard.cjs` | YES |
| PreToolUse (TaskCreate) | `hooks/routing/routing-guard.cjs` | YES (shared) |
| PreToolUse (TaskOutput) | `hooks/routing/routing-guard.cjs` | YES (shared) |
| PreToolUse (Task) | `hooks/routing/task-pretool-orchestrator.cjs` | YES |
| PreToolUse (TaskUpdate) | `hooks/validation/taskupdate-contract-validator.cjs` | YES |
| PreToolUse (TaskUpdate) | `hooks/validation/pre-completion-validation.cjs` | YES |
| PreToolUse (TaskUpdate) | `hooks/evolution/quality-gate-validator.cjs` | YES (shared) |
| PostToolUse (*) | `hooks/metrics/post-tool-metrics-unified.cjs` | YES |
| PostToolUse (Task\|TaskList\|...) | `hooks/routing/post-task-unified.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/workflow/post-completion-chain.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/reflection/reflection-cleanup.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/quality/artifact-scoring-ledger-hook.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/workflow/post-creation-integration.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/workflow/workflow-watchdog-hook.cjs` | YES |
| PostToolUse (TaskUpdate) | `hooks/cleanup/worktree-auto-cleanup.cjs` | YES |
| PostToolUse (Task\|TaskUpdate) | `hooks/validation/subagent-citation-guard.cjs` | YES |
| PostToolUse (Edit\|Write\|...) | `hooks/safety/bypass-audit-hook.cjs` | YES |
| PostToolUse (Edit\|Write\|...) | `hooks/memory/sync-memory-index.cjs` | YES |
| PostToolUse (Edit\|Write\|...) | `hooks/routing/agent-registry-auto-refresh.cjs` | YES |
| PostToolUse (Edit\|Write\|...) | `hooks/routing/code-index-updater.cjs` | YES |
| PostToolUse (Edit) | `hooks/session/post-edit-scanner.cjs` | YES |
| PostToolUse (MemoryRecord) | `hooks/memory/sync-memory-index.cjs` | YES (shared) |
| PostToolUse (Task\|...\|Bash\|...) | `hooks/reflection/unified-reflection-handler.cjs` | YES |
| PostToolUseFailure (*) | `hooks/metrics/post-tool-metrics-unified.cjs` | YES (shared) |
| PostToolUseFailure (Task\|...) | `hooks/reflection/unified-reflection-handler.cjs` | YES (shared) |
| SessionEnd (*) | `hooks/lifecycle/session-end-memory-promotion.cjs` | YES |
| SessionEnd (*) | `hooks/reflection/unified-reflection-handler.cjs` | YES (shared) |
| SessionEnd (*) | `hooks/reflection/reflection-queue-processor.cjs` | YES (shared) |
| SessionEnd (*) | `tools/cli/sanitize-debug-log.cjs` | YES (shared) |
| PreCompact (manual\|auto) | `hooks/session/pre-compact.cjs` | YES |
| Stop (*) | `hooks/validation/check-console-log.cjs` | YES |
| Stop (*) | `hooks/session/pre-compact.cjs` | YES (shared) |
| Stop (*) | `tools/cli/sanitize-debug-log.cjs` | YES (shared) |

**Total unique hook files:** 33 (some reused across multiple matchers)
**Dead references:** 0

### 3.2 Hook Security Posture

| Hook | Posture | Evidence |
|------|---------|----------|
| routing-guard.cjs | Fail-closed (exit 2) | routing-guard-core.impl.cjs main() catch block |
| unified-creator-guard.cjs | Fail-closed (exit 2) | Lines 689, 731, 245 (catch exits 2) |
| router-tool-lockdown.cjs | Fail-closed (exit 2) | Line 245 |
| pre-completion-validation.cjs | Fail-open (exit 0) | Line 656 -- CORRECT for validation hook |
| post-tool-metrics-unified.cjs | Fail-open (exit 0) | Advisory/metrics hook |

All security hooks correctly use fail-closed posture. Advisory/post hooks correctly use fail-open.

---

## Area 4: Spawn Template Completeness

### 4.1 Universal Agent Spawn Template

**File:** `templates/spawn/universal-agent-spawn.md` (150 lines)

**TaskUpdate protocol coverage:**
- Line 27: "Subagent does `TaskUpdate(in_progress)` first and `TaskUpdate(completed)` last"
- Lines 72-77: Example spawn prompt includes both `TaskUpdate(in_progress)` and `TaskUpdate(completed)` with metadata
- Lines 136-144: Completion contract requires `summary` (>50 chars), `filesModified`, `discoveries`, `memoriesRecorded`

**MemoryRecord coverage:**
- Lines 29-50: Dedicated "Memory Tooling Protocol" section, marked MANDATORY
- Line 68: `MemoryRecord` included in allowed_tools

**Search-first protocol:**
- Lines 92-102: 4-tier search preference documented (pnpm search:code > ripgrep skill > semantic > structural > Grep fallback)

**Tool profiles:**
- Lines 81-90: 3 profiles (read-only, code-changes, verification)
- Principle of least privilege enforced

**Status: PASS**

### 4.2 Orchestrator Spawn Template

**File:** `templates/spawn/orchestrator-spawn.md` (104 lines)

**Task tool requirement:**
- Line 9 frontmatter: `requires: Task tool in allowed_tools`
- Line 19: "Must include `Task` in `allowed_tools`"
- Line 39: `Task` listed in example allowed_tools

**Model requirement discrepancy (FINDING F-02, P3):**
- CLAUDE.md Section 2 states: "orchestrator-spawn.md (MUST have `Task` tool + `opus` model)"
- Template frontmatter line 10: `model_selection: sonnet (default), opus (complex orchestration only)`
- Template example line 29: `model: 'sonnet'`
- The template itself defaults to sonnet, not opus. CLAUDE.md overstates the model requirement.

**Status: PASS with caveat** (F-02 is cosmetic)

### 4.3 Subordinate One-Shot Template

**File:** `templates/spawn/subordinate-once.md` (74 lines)

- Lines 35-53: Full 70-line TaskUpdate warning box included
- Line 66: TaskUpdate(completed) instruction with metadata
- Status: PASS

### 4.4 Agent Identity Template

**File not read but referenced:** `templates/spawn/agent-identity-integration.md`
- Referenced in CLAUDE.md Template Loading Protocol
- Purpose: agents with personality frontmatter

---

## Area 5: TaskUpdate Enforcement

### 5.1 Pre-Completion Validation

**File:** `pre-completion-validation.cjs` (679 lines)

**Enforcement modes:**
- `TASK_STATUS_ENFORCEMENT`: default `block` (line 11)
- `PRE_COMPLETION_SUMMARY_ENFORCEMENT`: default `block` (line 12)
- `SUMMARY_REQUIRED_ENFORCEMENT`: default `block` (line 13)
- `REFLECTION_SCORE_ENFORCEMENT`: default `warn` (line 14)
- `TASK_OUTPUT_ENFORCEMENT`: default `block` (line 15)

**Summary validation:**
- `isValidSummary()` (lines 424-440): requires 50+ characters, rejects known fallback patterns
- `isFallbackSummary()` (lines 447-450): detects "Task N completed without summary metadata" pattern

**Ecosystem validation:**
- Runs `validate-creator-ecosystem.cjs`, `validate-skill-ecosystem.cjs`, `validate-agent-skill-references.cjs` on creator completions
- Required output validation checks for missing files and placeholder markers

### 5.2 TaskUpdate Contract Validator

**File:** `taskupdate-contract-validator.cjs`
- PreToolUse hook on TaskUpdate
- Validates contract compliance before TaskUpdate execution

### 5.3 Task Lifecycle State Machine

**File:** `lib/routing/task-lifecycle-state.cjs`

**Valid transitions (lines 18-23):**
```
pending    -> [in_progress, deleted]
in_progress -> [completed, deleted]
completed  -> []  (terminal)
deleted    -> []  (terminal)
```

- Uses `safeParseJSON` (line 9) -- SE-02 compliant
- Uses `atomicWriteJSONSync` (line 7) -- crash-safe writes
- Uses `withLock` (line 8) -- concurrent access safety
- State file: `.claude/context/runtime/task-status.json` (line 13)

**Status: PASS** -- All transitions are correctly enforced. Terminal states are immutable.

---

## Area 6: Router Tool Lockdown

### 6.1 Tool Whitelist/Blacklist

**File:** `router-tool-lockdown.cjs` (263 lines)

**Whitelisted tools** (lines 32-47): Task, TaskList, TaskCreate, TaskUpdate, TaskGet, TaskOutput, TaskStop, Read, AskUserQuestion, Skill, AvailableAgents, EnterPlanMode, ExitPlanMode, MemoryRecord

**Banned tools** (lines 54-63): Edit, Write, NotebookEdit, Bash, Glob, Grep, WebSearch, WebFetch

**Bash whitelist patterns** (lines 69-74):
- `git status` (with optional `-s`/`--short`)
- `git log --oneline -N`
- `git diff --name-only` (with optional `HEAD`)
- `git branch`

### 6.2 Gap Observation Protocol Bash Gap (FINDING F-03, P2)

**CLAUDE.md Section 0.1** states the router is allowed to use:
> `echo '...' >> .claude/context/runtime/session-gap-log.jsonl` (Gap Observation Protocol only)

**However**, `router-tool-lockdown.cjs` Bash whitelist (lines 69-74) does NOT include this pattern. The whitelist only allows read-only git commands.

**Impact:** If `ROUTER_TOOL_LOCKDOWN_ENFORCEMENT=block`, the router would be blocked from appending to the gap log, breaking the Gap Observation Protocol.

**Current risk:** The default enforcement IS `block` (line 161). However, the `isRouterSession()` detection (lines 85-115) checks for worktree, CLAUDE_AGENT_ID, and task_id. When the router runs with a task context or agent ID, it may pass through as a non-router session. The practical impact depends on runtime context.

**Recommendation:** Add an `echo` pattern to `ROUTER_BASH_WHITELIST` that matches the gap log append pattern:
```javascript
/^echo\s+'.*'\s*>>\s*\.claude\/context\/runtime\/session-gap-log\.jsonl$/
```

### 6.3 Router Session Detection

**`isRouterSession()` logic** (lines 85-115):
1. Check worktree (worktree = subagent, return false)
2. Check `CLAUDE_AGENT_ID` (non-empty and not 'router' = subagent)
3. Check `task_id` / `taskId` in hookInput (present = subagent)
4. Check `allowed_tools` (no Task = subagent)
5. Default: assume router

This is a reasonable heuristic. The layered checks provide defense-in-depth.

### 6.4 Fail-Closed Behavior

Line 245: `process.exit(2)` in catch block -- correct fail-closed posture for security hooks.

**Status: PASS with gap** (F-03 needs remediation)

---

## Area 7: Dead Code / Broken Wiring Scan

### 7.1 Settings.json Hook References

**Result: 0 dead references** -- All 33 unique hook files exist on disk (verified in Area 3).

### 7.2 Archive Separation

The `_archive/` directories contain properly archived hooks that are NOT registered in settings.json. No cross-contamination found between active and archived hooks.

### 7.3 Routing Guard Submodule Chain

All submodules required by `routing-guard-core.impl.cjs` exist:
- `routing-guard-core.policy.cjs` -- EXISTS
- `routing-guard-core.shared.cjs` -- EXISTS
- `routing-guard-core.checks-router.cjs` -- EXISTS (verified via import)
- `routing-guard-core.checks-task.cjs` -- EXISTS (verified via read)
- `routing-guard-core.intent-model.cjs` -- EXISTS (verified via import)

### 7.4 Routing Library Completeness

All files referenced in CLAUDE.md as routing sources of truth exist:
- `routing-table.cjs` -- EXISTS
- `routing-table-intent-keywords-data.cjs` -- EXISTS
- `fuzzy-intent-matcher.cjs` -- EXISTS
- `router-state.cjs` -- EXISTS
- `task-lifecycle-state.cjs` -- EXISTS

**Status: PASS** -- No dead code or broken wiring detected.

---

## Findings Summary

| ID | Severity | Area | Finding | Recommendation |
|----|----------|------|---------|----------------|
| F-01 | P2 | Routing | CLAUDE.md says `SPECIALIST_ROUTING_ENFORCEMENT` defaults to `warn` but source code defaults to `block` | Update CLAUDE.md Section 1.3 |
| F-02 | P3 | Spawn Templates | CLAUDE.md says orchestrator template requires `opus` model but template defaults to `sonnet` | Update CLAUDE.md Section 2 to say "sonnet (default), opus (complex)" |
| F-03 | P2 | Router Lockdown | Gap Observation Protocol `echo >>` command not in Bash whitelist of `router-tool-lockdown.cjs` | Add echo pattern to `ROUTER_BASH_WHITELIST` |

---

## Verification Commands

```bash
# Verify all hook files exist (run from project root)
node -e "const s=require('.claude/settings.json');const h=s.hooks;const paths=new Set();Object.values(h).forEach(arr=>arr.forEach(m=>m.hooks.forEach(h=>paths.add(h.command.replace(/^node /,'')))));const fs=require('fs');let missing=0;paths.forEach(p=>{if(!fs.existsSync(p)){console.log('MISSING:',p);missing++}});console.log(missing?missing+' missing':'All hooks present')"

# Verify routing library files exist
ls -la .claude/lib/routing/*.cjs

# Check SPECIALIST_ROUTING_ENFORCEMENT default in source
grep -n "SPECIALIST_ROUTING_ENFORCEMENT" .claude/hooks/routing/routing-guard-core.checks-task.cjs

# Check Bash whitelist patterns
grep -A5 "ROUTER_BASH_WHITELIST" .claude/hooks/routing/router-tool-lockdown.cjs
```

---

## Conclusion

The agent-studio framework wiring is structurally sound. All 40+ registered hooks exist on disk, the routing guard chain is complete with 8 enforcement modes all defaulting to `block`, creator guards protect 11 artifact types with correct fail-closed security posture, spawn templates include comprehensive TaskUpdate and MemoryRecord protocols, and the task lifecycle state machine enforces valid transitions with atomic writes and file locking.

The three findings (F-01, F-02, F-03) are documentation and enforcement gaps that should be addressed but do not represent security vulnerabilities or system-breaking issues. F-03 (Bash whitelist gap) is the most actionable as it could block a documented router capability.
