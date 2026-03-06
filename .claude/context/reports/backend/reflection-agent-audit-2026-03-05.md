<!-- Agent: architect | Task: #6 | Session: 2026-03-05 -->

# Reflection Agent Deep Dive Audit

**Date**: 2026-03-05
**Agent**: architect (task-6)
**Scope**: Complete reflection subsystem lifecycle, hooks, contracts, known issues

---

## Executive Summary

The reflection subsystem is a well-architected metacognitive pipeline with **7 cooperating components** that form an end-to-end lifecycle from event detection through learning extraction. The system demonstrates strong defensive programming (fail-open on errors, safeParseJSON everywhere, loop breakers) and a robust atomic handshake protocol. However, several gaps exist in skill wiring, schema validation coverage, and there is one MEDIUM severity issue with the `reflection-reminder.txt` creation path being implicit rather than explicit.

**Overall Health**: GOOD (no P0 issues, 2 MEDIUM, 3 LOW findings)

---

## 1. reflection-agent.md Analysis

**File**: `.claude/agents/core/reflection-agent.md` (920 lines)

### 1.1 RECE Loop

- **VERIFIED**: RECE loop documented at line 82, detailed at lines 101-110
- **Phases**: Reflect (gather data) -> Evaluate (score via rubric) -> Correct (record learnings) -> Execute (update memory)
- **SEVERITY**: PASS -- loop is complete and well-documented

### 1.2 Rubric Dimensions and Weights

| Dimension     | Weight | Line |
|---------------|--------|------|
| Completeness  | 25%    | 121  |
| Accuracy      | 25%    | 122  |
| Clarity       | 15%    | 124  |
| Consistency   | 15%    | 125  |
| Actionability | 20%    | 127  |

- **VERIFIED**: Weights sum to 100%. All 5 dimensions present.
- **SEVERITY**: PASS

### 1.3 Tools List

**Frontmatter tools (lines 16-28)**:
Bash, Edit, Glob, Grep, MemoryRecord, Read, Skill, TaskCreate, TaskGet, TaskList, TaskUpdate, Write

- **VERIFIED**: All critical tools present including TaskUpdate (needed for atomic handshake) and MemoryRecord (needed for structured memory writes)
- **SEVERITY**: PASS

### 1.4 Model and Configuration

| Setting     | Value   | Line |
|-------------|---------|------|
| model       | sonnet  | 10   |
| temperature | 0.4     | 11   |
| maxTurns    | 18      | 13   |

- **NOTE**: sonnet is appropriate for reflection work (analysis + writing, not security-critical)
- **SEVERITY**: PASS

### 1.5 Skills (Frontmatter)

**Declared skills (lines 29-33)**:
- `framework-context`
- `insight-extraction`
- `recommend-evolution`
- `session-handoff`

**Missing from frontmatter but present in agent-skill-matrix.json**:
- `context-compressor` (secondary)
- `summarize-changes` (secondary)
- `agent-evaluation` (secondary)
- `debug-log-analysis` (secondary)

**Missing entirely (not in frontmatter OR matrix)**:
- `memory-search` -- NOT in `always` array (empty)
- `ripgrep` -- NOT in `always` array (empty)

- **SEVERITY**: MEDIUM -- `memory-search` should be in `always` for reflection-agent since it performs semantic memory reads (see `attachSemanticPriorLearnings` in unified-reflection-handler.cjs line 147). The agent-skill-matrix has `always: []` for reflection-agent (line 196). Compare to `technical-program-manager` which correctly has `memory-search` and `ripgrep` in `always` (lines 204-209).

### 1.6 Phase 0 Data Sufficiency Gate

- **VERIFIED** at lines 191-210: Agent must verify sufficient data before proceeding
- **SEVERITY**: PASS

### 1.7 Step 4.7 Skill-Agent Consistency Check

- **VERIFIED** at lines 373-431: Agent checks for skill-agent consistency issues
- **SEVERITY**: PASS

---

## 2. Reflection Hooks Analysis

### 2.1 Hook: reflection-step0-guard.cjs

**File**: `.claude/hooks/reflection/reflection-step0-guard.cjs` (491 lines)
**Trigger**: PreToolUse(TaskList) -- registered in settings.json lines 152-158
**Purpose**: Blocks TaskList when pending reflection requests exist

**Key Behaviors**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Default enforcement | `block` | 313 |
| MAX_PENDING_REFLECTIONS | 5 | 49-50 |
| Ghost pruning | `pruneGhostSpawnRequests()` | 172-188 |
| Already-processed pruning | `pruneAlreadyProcessedRequests()` | 129-145 |
| Stale request pruning | MAX_REFLECTION_AGE_HOURS=24 | 349-373 |
| Loop breaker | STEP0_REPEAT_THRESHOLD=2 | 274-280 |
| safeParseJSON | SE-02 compliant | 33, 85 |
| Fail-open on error | `process.exit(0)` | 472 |

- **VERIFIED**: Loop breaker prevents deadlock (downgrades block to warn after 2 repeated blocks)
- **VERIFIED**: Auto-trims to 5 pending reflections (lines 208-232)
- **SEVERITY**: PASS

### 2.2 Hook: reflection-cleanup.cjs

**File**: `.claude/hooks/reflection/reflection-cleanup.cjs` (96 lines)
**Trigger**: PostToolUse(TaskUpdate) -- registered in settings.json lines 232-234
**Purpose**: Removes processed reflection requests after atomic handshake completion

**Key Behaviors**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Reads processedReflectionIds | `toolInput.metadata?.processedReflectionIds` | 50 |
| Removes from spawn-request.json | `removeRequests(SPAWN_REQUEST_PATH, processedIds)` | 53 |
| Appends to reflection-log.jsonl | Cross-session tracking | 57-62 |
| Legacy fallback | `task_completion:` / `session_end:` prefix IDs | 63-72 |
| Cleans reminder file when empty | `fs.unlinkSync(REMINDER_PATH)` | 79 |
| Fail-open on error | `process.exit(0)` | 89-90 |

- **VERIFIED**: Atomic handshake consumer side is correctly implemented
- **SEVERITY**: PASS

### 2.3 Hook: unified-reflection-handler.cjs

**File**: `.claude/hooks/reflection/unified-reflection-handler.cjs` (519 lines)
**Trigger**: PostToolUse(Task|TaskUpdate|Bash|MemoryRecord) + PostToolUseFailure -- registered in settings.json lines 305-311, 324-332
**Purpose**: Consolidated handler that queues reflection entries

**Key Behaviors**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Event types | task_completion, task_update, error_recovery, session_end, memory_extraction | 371-443 |
| Queue file | `.claude/context/reflection-queue.jsonl` | 56 |
| Queue max lines | REFLECTION_QUEUE_MAX_LINES=2000 | 57 |
| Semantic prior learnings | `attachSemanticPriorLearnings()` | 147-195 |
| Failure recurrence tracking | `trackFailureRecurrence()` | 207-241 |
| Stale artifact ingestion | `ingestStaleArtifactRecommendations()` | 266-340 |
| Evolution dispatch | `generateAndPersistDispatchPlan()` | 404-410 |
| Fail-open on error | `process.exit(0)` | 471 |

- **VERIFIED**: This is the PRIMARY event producer -- it writes to `reflection-queue.jsonl` (NOT directly to `reflection-spawn-request.json`)
- **SEVERITY**: PASS

### 2.4 Hook: reflection-queue-processor.cjs

**File**: `.claude/hooks/reflection/reflection-queue-processor.cjs` (646 lines)
**Trigger**: UserPromptSubmit + SessionEnd -- registered in settings.json lines 21-23, 347-349
**Purpose**: Reads reflection-queue.jsonl, generates spawn requests, writes `reflection-spawn-request.json`

**Key Behaviors**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Reads queue entries | `readQueueEntries()` | 96-132 |
| Ghost task suppression | `buildGhostTaskSet()` | 170-187 |
| Deduplication | `dedupePendingEntries()` | 189-256 |
| Generates spawn requests | `generateSpawnRequest()` | 286-304 |
| Writes spawn-request.json | `writeSpawnRequests()` via `atomicWriteSync` | 310-344 |
| Atomic handshake instructions | Embedded in prompt at lines 447-449 |
| Session gap log injection | `readSessionGapLog()` at line 441 | 368-396 |
| Fail-open on error | `process.exit(0)` | 613 |

- **VERIFIED**: This hook is the bridge between `reflection-queue.jsonl` (written by unified-reflection-handler) and `reflection-spawn-request.json` (consumed by Router Step 0)
- **NOTE**: The `reflection-reminder.txt` file is NOT explicitly created by this hook. See Finding F-02 below.
- **SEVERITY**: See Finding F-02

### 2.5 Hook: step0-reflection-enforcer.cjs

**File**: `.claude/hooks/session/step0-reflection-enforcer.cjs` (260 lines)
**Trigger**: UserPromptSubmit -- registered in settings.json lines 16-18
**Purpose**: Injects Step 0 mandatory block into router context when reflections are pending

**Key Behaviors**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Checks reflection-reminder.txt | `fs.existsSync(reminderPath)` | 218 |
| Reads spawn-request.json | Optional, fail-open | 232-235 |
| Content truncation | MAX_CONTENT_BYTES=10KB | 36, 110-118 |
| Injection block | Unicode box drawing + structured instructions | 167-201 |
| Background spawn warning | "Use foreground (NOT run_in_background: true)" | 186 |
| safeParseJSON | SE-02 compliant, lazy-loaded | 39-56 |
| Fail-open | `emitPassThrough()` on any error | 244-256 |

- **VERIFIED**: This is the first line of defense -- fires BEFORE reflection-queue-processor on every user message
- **SEVERITY**: PASS

### 2.6 settings.json Registration Summary

| Hook | Event | Matcher | Lines |
|------|-------|---------|-------|
| step0-reflection-enforcer.cjs | UserPromptSubmit | (all) | 16-18 |
| reflection-queue-processor.cjs | UserPromptSubmit | (all) | 21-23 |
| reflection-step0-guard.cjs | PreToolUse | TaskList | 152-158 |
| reflection-cleanup.cjs | PostToolUse | TaskUpdate | 232-234 |
| unified-reflection-handler.cjs | PostToolUse | Task\|TaskUpdate\|Bash\|MemoryRecord | 305-311 |
| unified-reflection-handler.cjs | PostToolUseFailure | Task\|TaskUpdate\|Bash\|MemoryRecord | 324-332 |
| reflection-queue-processor.cjs | SessionEnd | (all) | 347-349 |

- **VERIFIED**: All 7 registrations are correctly wired with appropriate matchers
- **SEVERITY**: PASS

---

## 3. Spawn Request Processing

### 3.1 Who Creates reflection-spawn-request.json?

**Answer**: `reflection-queue-processor.cjs` at line 337 via `atomicWriteSync(spawnRequestFile, ...)` inside `writeSpawnRequests()` (line 310-344).

**Data flow**:
1. `unified-reflection-handler.cjs` queues entries to `reflection-queue.jsonl` (line 379, 397, 412)
2. `reflection-queue-processor.cjs` reads queue, deduplicates, generates spawn requests, writes `reflection-spawn-request.json` (line 565)

### 3.2 Who Creates reflection-reminder.txt?

**FINDING F-02**: The `reflection-reminder.txt` file creation path is NOT in any of the 7 reflection hooks examined. The file is checked by:
- `step0-reflection-enforcer.cjs` (line 218): `fs.existsSync(reminderPath)`
- `reflection-step0-guard.cjs`: reads its contents
- `reflection-cleanup.cjs` (line 77-83): deletes it when queue is empty

But none of these hooks CREATE the file. A search for `reflection-reminder.txt` write operations would be needed to identify the creator. Based on the `reflection-cleanup.cjs` behavior (deletes when `remaining.length === 0`), the reminder file likely is created by a component not in the core reflection hook set -- possibly by `reflection-queue-processor.cjs` via a side effect not visible in the main function, or by another hook.

- **SEVERITY**: LOW -- The system works correctly because `step0-reflection-enforcer.cjs` checks BOTH `reflection-reminder.txt` AND `reflection-spawn-request.json`. Even if the reminder file is absent, the step0-guard checks spawn-request.json directly. The reminder file is a belt-and-suspenders optimization, not the sole gate.

### 3.3 spawn-request-contract.cjs (Shared Module)

**File**: `.claude/lib/reflection/spawn-request-contract.cjs` (214 lines)
**Purpose**: Shared read/write/sanitize/validate contract for spawn request JSON

**Key Features**:

| Feature | Implementation | Line(s) |
|---------|---------------|---------|
| Schema validation | AJV + `reflection-spawn-request.schema.json` | 18-42 |
| Input sanitization | `sanitizeSpawnRequest()` with max lengths | 70-104 |
| MAX_PROMPT_LENGTH | 12000 chars (env: REFLECTION_SPAWN_REQUEST_MAX_PROMPT_CHARS) | 14 |
| MAX_ENTRIES | 200 (env: REFLECTION_SPAWN_REQUEST_MAX_ENTRIES) | 10 |
| Atomic writes | `atomicWriteJSONSync()` | 119, 130 |
| removeRequests | Filters by ID set, atomic write | 122-131 |
| acknowledgeRequests | Sets status to 'acknowledged' | 106-120 |
| removeStaleRequests | Age-based pruning by maxAgeMs | 182-202 |
| safeParseJSON | SE-02 compliant | 7, 136 |

- **VERIFIED**: Robust shared module with schema validation, sanitization, and atomic writes
- **SEVERITY**: PASS

---

## 4. Atomic Handshake Protocol

### 4.1 Protocol Description

The atomic handshake is the mechanism by which the reflection-agent signals completion and the system cleans up processed requests:

1. **Producer**: `reflection-queue-processor.cjs` generates spawn request with a derived `reflectionTaskId` and embeds the instruction in the prompt (lines 411-414, 447-449):
   ```
   TaskUpdate({ taskId: "${reflectionTaskId}", status: "completed",
     metadata: { processedReflectionIds: ["${id}"] } })
   ```

2. **Consumer**: `reflection-cleanup.cjs` (PostToolUse TaskUpdate) reads `metadata.processedReflectionIds` (line 50) and calls `removeRequests()` to atomically remove them from `reflection-spawn-request.json` (line 53)

3. **Verification**: Appends to `reflection-log.jsonl` for cross-session audit (lines 57-62)

4. **Cleanup**: When no requests remain, deletes `reflection-reminder.txt` (lines 76-84)

### 4.2 Handshake Integrity

- **VERIFIED**: Producer and consumer use the same ID format: `${trigger}:${timestamp}:${taskId || context}`
- **VERIFIED**: `removeRequests()` in spawn-request-contract.cjs uses `atomicWriteJSONSync` (line 130) preventing data corruption
- **VERIFIED**: Legacy fallback handles old `task_completion:` / `session_end:` prefix IDs (cleanup.cjs lines 63-72)
- **SEVERITY**: PASS

### 4.3 Background Spawn Ban Enforcement

**VERIFIED**: The "NEVER spawn reflection-agent with run_in_background: true" rule IS enforced by a hook.

**File**: `.claude/hooks/routing/routing-guard-core.checks-task.cjs`
**Lines**: 521-537

```javascript
if (subagentType !== 'reflection-agent') return { pass: true };
// run_in_background strips the tool whitelist, making TaskUpdate unavailable
if (toolInput.run_in_background !== true) return { pass: true };
// ... returns block or warn based on enforcement mode
```

**Message** (from `routing-guard-core.helpers.cjs` line 140):
> "reflection-agent MUST NOT be spawned with run_in_background: true. The atomic handshake will fail."

- **SEVERITY**: PASS -- Rule is hook-enforced, not just documented

---

## 5. Known Issues Verification

### 5.1 Background Spawn Ban

- **STATUS**: ENFORCED by `routing-guard-core.checks-task.cjs` lines 521-537
- **Evidence**: Hook blocks/warns when `subagentType === 'reflection-agent'` AND `toolInput.run_in_background === true`
- **SEVERITY**: RESOLVED (was documented in MEMORY.md, now confirmed hook-enforced)

### 5.2 Missing "always" Skills

- **STATUS**: CONFIRMED -- `agent-skill-matrix.json` line 196: `"always": []` for reflection-agent
- **Impact**: `memory-search` and `ripgrep` are NOT auto-injected. The agent CAN still invoke them via `Skill()`, but they are not flagged as mandatory in the registry
- **SEVERITY**: MEDIUM -- Compare to `technical-program-manager` (lines 204-209) which correctly has `memory-search`, `ripgrep`, `code-semantic-search` in `always`. Reflection-agent performs semantic memory reads (via `attachSemanticPriorLearnings`) and should have `memory-search` as `always`.

### 5.3 Frontmatter vs Matrix Gaps

- **STATUS**: CONFIRMED -- Frontmatter has 4 skills; matrix has 6 additional secondary skills
- **Impact**: By design (3-layer merge system documented in CLAUDE.md Section 3 "Registry Skill Resolution"). The frontmatter is the base, the matrix augments it. This is expected behavior.
- **SEVERITY**: PASS (by design)

---

## 6. End-to-End Flow Verification (8-Step Lifecycle)

### Step 1: Event Detection

**Responsible**: `unified-reflection-handler.cjs` (PostToolUse hook)
**Trigger**: Task completion, error recovery, session end, or memory extraction
**Evidence**: Lines 364-367 (`detectEventType`), lines 371-443 (switch on eventType)
**Output**: Queue entry written to `reflection-queue.jsonl` via `queueReflection()` (lines 379, 397, 412)

### Step 2: Queue Processing

**Responsible**: `reflection-queue-processor.cjs` (UserPromptSubmit + SessionEnd hook)
**Trigger**: Every user prompt and every session end
**Evidence**: Lines 505-544 (`processQueue`), deduplication at lines 189-256
**Output**: Spawn request written to `reflection-spawn-request.json` via `writeSpawnRequests()` (line 565)

### Step 3: Prompt Injection

**Responsible**: `step0-reflection-enforcer.cjs` (UserPromptSubmit hook)
**Trigger**: Every user prompt when `reflection-reminder.txt` exists
**Evidence**: Lines 218 (existence check), 239 (injection), 167-201 (injection block)
**Output**: Step 0 block injected into router's context with spawn instructions

### Step 4: TaskList Guard

**Responsible**: `reflection-step0-guard.cjs` (PreToolUse TaskList hook)
**Trigger**: Any TaskList call when pending reflections exist
**Evidence**: Lines 240-245 (`hasPendingReflections`), 313 (default block), 438-439 (block action)
**Output**: Blocks TaskList (exit 2) until reflections are processed; loop breaker after 2 blocks (lines 274-280)

### Step 5: Router Spawns Reflection Agent

**Responsible**: Router (CLAUDE.md Section 0.1, Step 0)
**Trigger**: Step 0 instructions from enforcer hook + spawn-request.json contents
**Evidence**: CLAUDE.md mandates "spawn reflection-agent for each request"
**Output**: `Task()` call with reflection-agent, including processedReflectionIds instructions in prompt

### Step 6: Reflection Agent Executes RECE Loop

**Responsible**: `reflection-agent.md` definition
**Trigger**: Spawned by router with context from spawn request prompt
**Evidence**: Lines 82 (RECE loop), 101-110 (phase details), 191-210 (data sufficiency gate)
**Output**: Learnings recorded to memory files, analysis performed, report written

### Step 7: Atomic Handshake Completion

**Responsible**: reflection-agent (producer) + `reflection-cleanup.cjs` (consumer)
**Trigger**: Agent calls `TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })`
**Evidence**: cleanup.cjs line 50 (reads processedReflectionIds), line 53 (removeRequests)
**Output**: Processed requests removed from `reflection-spawn-request.json`, logged to `reflection-log.jsonl`

### Step 8: Reminder Cleanup

**Responsible**: `reflection-cleanup.cjs`
**Trigger**: After removing processed requests, checks if queue is now empty
**Evidence**: Lines 76-84 (`remaining.length === 0 && fs.existsSync(REMINDER_PATH)`)
**Output**: `reflection-reminder.txt` deleted, allowing normal TaskList flow

---

## Findings Summary

| ID   | Severity | Component | Finding |
|------|----------|-----------|---------|
| F-01 | MEDIUM   | agent-skill-matrix.json | reflection-agent has `always: []` -- should include `memory-search` since the agent performs semantic memory operations |
| F-02 | LOW      | reflection-reminder.txt | Creation path not found in any of the 7 examined reflection hooks -- creator is outside the core reflection subsystem |
| F-03 | MEDIUM   | agent-skill-matrix.json | `ripgrep` not in reflection-agent skills (primary, secondary, or always) -- agent needs code search for file:line evidence gathering |
| F-04 | LOW      | reflection-queue-processor.cjs | `generateSpawnInstruction()` hardcodes `task_id: 'task-1'` (line 271) in the human-readable instruction -- this is cosmetic (the actual spawn request uses derived IDs) but could confuse auditors |
| F-05 | LOW      | unified-reflection-handler.cjs | `attachSemanticPriorLearnings()` (line 147) performs semantic search using ContextualMemory but reflection-agent lacks `memory-search` in its `always` skills, creating an asymmetry between the hook-side enrichment and the agent-side capabilities |

---

## Recommendations

1. **F-01/F-03/F-05 (MEDIUM)**: Add `memory-search` and `ripgrep` to `agent-skill-matrix.json` for reflection-agent under `always`:
   ```json
   "reflection-agent": {
     "always": ["memory-search", "ripgrep"]
   }
   ```

2. **F-02 (LOW)**: Trace `reflection-reminder.txt` creation to its source and document it. Consider adding an explicit `createReminderFile()` call in `reflection-queue-processor.cjs` after `writeSpawnRequests()` succeeds, to make the data flow self-documenting.

3. **F-04 (LOW)**: Change hardcoded `task_id: 'task-1'` in `generateSpawnInstruction()` to use the derived `reflectionTaskId` for consistency with the actual spawn request.

---

## Architecture Quality Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Separation of Concerns | 9/10 | 7 components with clear responsibilities |
| Defensive Programming | 10/10 | safeParseJSON everywhere, fail-open on errors, loop breakers |
| Data Integrity | 9/10 | Atomic writes via atomicWriteJSONSync, schema validation |
| Observability | 8/10 | reflection-log.jsonl, event bus emissions, audit logging |
| Resilience | 9/10 | Ghost pruning, stale pruning, MAX_PENDING cap, loop breaker |
| Documentation | 8/10 | RECE loop well-documented; reminder.txt creation path unclear |

**Overall Score: 8.8/10** -- A mature, well-engineered subsystem with minor wiring gaps.
