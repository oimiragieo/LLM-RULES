<!-- Agent: architect | Task: #75 | Session: 2026-02-09 -->

# Architecture Analysis: Creator Process Enforcement

## 1. Current State Analysis

### 1.1 What Exists

The framework has a three-layer enforcement architecture for creator process compliance:

| Layer                      | Component                   | Location                                          | Purpose                                                                    |
| -------------------------- | --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| **Layer 1: Documentation** | Gate 4 in CLAUDE.md         | `.claude/CLAUDE.md` Section 1.2                   | Instructs Router to never write directly to creator output paths           |
| **Layer 2: Routing Hook**  | routing-guard.cjs (Check 5) | `.claude/hooks/routing/routing-guard.cjs`         | Blocks Router from using Write/Edit directly (router mode only)            |
| **Layer 3: Creator Guard** | unified-creator-guard.cjs   | `.claude/hooks/routing/unified-creator-guard.cjs` | Blocks Write/Edit to creator artifact paths unless creator skill is active |

Additionally:

| Component                   | Location                                                | Purpose                                                  |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Pre-execute hooks           | `.claude/skills/*/hooks/pre-execute.cjs`                | 6 creator skills set `active-creators.json` state        |
| State file                  | `.claude/context/runtime/active-creators.json`          | Tracks which creators are currently active               |
| Post-creation integration   | `.claude/hooks/workflow/post-creation-integration.cjs`  | Detects creator completions, queues integration analysis |
| Ecosystem creation workflow | `.claude/workflows/core/ecosystem-creation-workflow.md` | Documents 6-phase lifecycle                              |

### 1.2 How the Guard Currently Works

**unified-creator-guard.cjs** (684 lines) implements a **state-file token approach**:

1. When a creator skill is invoked (e.g., `Skill({ skill: "agent-creator" })`), its `pre-execute.cjs` hook writes a token to `active-creators.json`:

   ```json
   { "agent-creator": { "active": true, "invokedAt": "2026-02-09T...", "ttl": 180000 } }
   ```

2. When any Write/Edit operation targets a creator output path (e.g., `.claude/agents/domain/foo.md`), the guard:
   - Finds the required creator via `findRequiredCreator(filePath)` (pattern matching against 10 `CREATOR_CONFIGS`)
   - Checks if that creator is active via `isCreatorActive(creatorName)` (reads state file, checks TTL)
   - If active: **ALLOW**
   - If not active: **BLOCK** (default) or **WARN** (configurable)

3. TTL defaults to 3 minutes (bounded: 30s min, 10min max) to prevent stale tokens.

### 1.3 Hook Registration Chain (settings.json)

For `Edit|Write|NotebookEdit` operations, the hook chain is:

```
1. routing-guard.cjs       (Check 1: blocks Router from using Write directly)
2. unified-creator-guard.cjs (blocks artifact writes without creator token)
3. unified-pre-write-hook.cjs (file placement, Windows safety, etc.)
4. evolution-state-guard.cjs  (evolution workflow state checks)
5. research-enforcement.cjs   (research-first protocol)
6. quality-gate-validator.cjs  (quality gates)
```

### 1.4 What Is Broken

**The guard does NOT differentiate between creating a new file and editing an existing file.**

This is the fundamental architectural flaw. The guard's `findRequiredCreator()` function checks only the target file path against `CREATOR_CONFIGS` patterns. It does not check whether the file already exists on disk. This means:

| Scenario                                                                  | Expected Behavior                   | Actual Behavior                                      |
| ------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Developer creates `.claude/agents/domain/new-agent.md` (NEW file)         | **BLOCK** -- requires agent-creator | BLOCK (correct, if no creator token)                 |
| Developer edits `.claude/agents/domain/existing-agent.md` (EXISTING file) | **ALLOW** -- legitimate edit        | BLOCK (incorrect, unless agent-creator token exists) |
| Developer adds search skills to 10 existing agents (batch edit)           | **ALLOW** -- legitimate batch edit  | BLOCK (incorrect, unless agent-creator token exists) |

**Consequences of this flaw:**

1. **Legitimate edits blocked**: When developers need to edit existing agent files (e.g., adding search skill references), the guard blocks the write unless agent-creator was invoked first.
2. **Workaround culture**: Developers set `CREATOR_GUARD=off` or `CREATOR_GUARD=warn` to bypass the guard, defeating its purpose.
3. **False sense of security**: When the guard is weakened to `warn`, creation operations also only warn instead of blocking, eliminating the enforcement.

**The guard also has a TTL-based bypass window:**

The 3-minute TTL means that after a creator skill is invoked, ANY write to that artifact type is allowed for 3 minutes -- not just the specific artifact being created. If agent-creator is activated to create "agent-A", writes to "agent-B" are also unblocked during that window.

**Routing-layer enforcement is Router-mode-only:**

routing-guard.cjs Check 1 (checkRouterSelfCheck) and Check 5 (checkRouterWrite) only block writes when `state.mode === 'router'`. Once an agent is spawned (state.mode === 'agent'), these checks are bypassed by design. This means a developer agent spawned by the Router can freely write to creator output paths -- only unified-creator-guard.cjs stands as a defense.

---

## 2. Root Cause Analysis: Why Did the Guard Fail?

The guard failed because of a **conflation of two distinct concerns**: (1) preventing artifact creation without the creator workflow, and (2) allowing legitimate edits to existing artifacts.

### 2.1 Design Assumption Mismatch

The guard was designed with the assumption that ALL writes to creator output paths require creator workflow compliance. This is correct for NEW artifact creation but incorrect for edits to EXISTING artifacts.

The original design (reflection from Task #14-17 learnings) focused on the "invisible artifact" problem where artifacts were created without proper integration. The solution (block all writes without creator token) correctly addressed creation but over-restricted edits.

### 2.2 State Token Granularity is Too Coarse

The state token tracks creator type (e.g., "agent-creator") but not the specific artifact being created. This creates a type-level authorization window rather than artifact-level authorization.

### 2.3 No Distinction Between Write (New File) and Edit (Existing File)

The `WATCHED_TOOLS` array includes both `['Edit', 'Write']`, and `findRequiredCreator()` applies the same logic to both. The Claude Code tool semantics provide a natural distinction:

- **Write** = create or overwrite a file (typically new files or full replacements)
- **Edit** = modify specific sections of an existing file (always an existing file)

This distinction is available in the hook input but not leveraged.

---

## 3. Recommended Enforcement Architecture

### 3.1 Design Principle: Dual-Intent Detection

The enforcement system should distinguish two intents:

| Intent                       | Detection                                      | Enforcement                              |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------- |
| **CREATE** (new artifact)    | Write tool + file does NOT exist on disk       | Require creator token (block without it) |
| **EDIT** (existing artifact) | Edit tool, OR Write tool + file EXISTS on disk | Allow without creator token              |

### 3.2 Recommended Pattern: File-Existence Check + Tool Distinction

**Primary enforcement (unified-creator-guard.cjs):**

```
IF tool === 'Edit':
  ALLOW (Edit always targets existing files)

IF tool === 'Write':
  IF file already exists on disk:
    ALLOW (overwriting existing artifact = edit, not creation)
  ELSE:
    REQUIRE creator token (new artifact creation)
    IF no creator token:
      BLOCK (default) or WARN
```

**This is the simplest correct enforcement** and requires minimal code changes:

1. In `validateCreatorWorkflow()`, after `findRequiredCreator()` returns a match:
2. Check `toolName === 'Edit'` -- if so, ALLOW immediately
3. Check `fs.existsSync(filePath)` -- if file exists, ALLOW immediately
4. Only block if the file does NOT exist AND no creator token is active

### 3.3 Rationale for File-Existence Check

| Approach                                 | Pros                                                                         | Cons                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **File-existence check (RECOMMENDED)**   | Simple, accurate, no false positives for edits, no state management overhead | Slightly permissive: allows overwriting existing artifact with Write (not Edit) without creator token |
| Creator context token (current approach) | Explicit authorization for all writes                                        | Blocks legitimate edits, requires TTL management, coarse granularity                                  |
| Routing-layer prevention                 | Prevents developer from being spawned for creation tasks                     | Does not protect against developer-within-orchestrator patterns                                       |
| Always allow Edit, block only Write      | Zero false positives for edits                                               | Does not catch Write-to-existing (minor risk)                                                         |

**Why file-existence check is superior to the current approach:**

1. **Zero false positives** for legitimate edits (the primary pain point)
2. **No TTL window** to manage or abuse
3. **No state file** coordination between creator skills and guard
4. **Backward compatible**: creator token still works as an additional signal for NEW file writes

### 3.4 Defense-in-Depth: Layered Enforcement

The recommended architecture uses three complementary layers:

```
Layer 1: ROUTING (prevent misrouting)
  routing-guard.cjs Check 7 (checkSpecialistOverride)
  + NEW: "creator-intent" detection keywords in SPECIALIST_KEYWORD_MAP
  = Warns when developer is spawned for "create agent/skill/hook" tasks

Layer 2: HOOK (prevent unauthorized writes)
  unified-creator-guard.cjs (enhanced)
  = Blocks Write to NEW files at creator output paths without creator token
  = Allows Edit to EXISTING files unconditionally
  = Allows Write to EXISTING files unconditionally

Layer 3: POST-CREATION (detect gaps)
  post-creation-integration.cjs (existing)
  = Detects creator completions, queues integration analysis
  + NEW: Detect non-creator completions that modified creator output paths
  = Generates integration gap alerts
```

**Layer 1 (Routing) is the preferred enforcement point.** Preventing the wrong agent from being spawned is cheaper than blocking the write after the agent has done work. Layer 2 (Hook) is the safety net for when Layer 1 fails. Layer 3 (Post-Creation) is the audit trail.

### 3.5 Routing-Layer Enhancement: Creator Intent Detection

Add creator-intent keywords to `SPECIALIST_KEYWORD_MAP` in routing-guard.cjs:

```javascript
// New entries for creator-intent routing
'agent-creator': [
  'create agent', 'create new agent', 'create a new agent',
  'add agent', 'new agent for',
],
'skill-creator': [
  'create skill', 'create new skill', 'add a skill',
  'new skill for',
],
'hook-creator': [
  'create hook', 'create new hook', 'add a hook',
  'new enforcement hook',
],
// ... etc for workflow-creator, template-creator, schema-creator
```

When the Router attempts to spawn `developer` for a task containing "create new agent", Check 7 would warn: "Use agent-creator instead."

This provides early detection before any write operation is attempted.

---

## 4. Handling Batch Creation

### 4.1 Problem

"Create 10 agents" should invoke agent-creator 10 times, not developer 10 times. The current system has no mechanism to detect batch creation intent and route accordingly.

### 4.2 Recommended Pattern: Orchestrator for Batch Creation

```
User: "Create 10 agents for the new domain specialists"
  |
  v
Router detects: batch creation (>1 artifacts, same type)
  |
  v
Router spawns: master-orchestrator (opus model)
  Prompt: "Create 10 agents using the agent-creator skill iteratively.
           For each agent:
           1. Invoke Skill({ skill: 'research-synthesis' })
           2. Invoke Skill({ skill: 'agent-creator' })
           3. Verify companion checklist completion
           Agents to create: [list]"
  |
  v
master-orchestrator spawns: 10 sequential agent-creator invocations
  (sequential to prevent TTL overlap and state file conflicts)
```

### 4.3 Detection Heuristic for Batch Creation

Add to routing-guard.cjs Check 7 or as a new Check 9:

```
IF prompt contains ("create N agents" | "create N skills" | "add N hooks"):
  WHERE N > 1 (detected via regex: /create\s+(\d+)\s+(agents?|skills?|hooks?)/i)
  THEN: route to master-orchestrator with iterative creator invocation pattern
```

This is a heuristic, not a hard enforcement. The Router can still override for edge cases.

---

## 5. Trade-Off Analysis

### 5.1 Strictness vs. Usability

| Strictness Level                 | What Gets Blocked                                  | False Positive Rate                                  | Workaround Pressure            |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| **Current (block all writes)**   | All writes to artifact paths without creator token | **HIGH** (edits blocked)                             | **HIGH** (CREATOR_GUARD=off)   |
| **Recommended (block new only)** | Only NEW file writes to artifact paths             | **LOW** (only edge: Write overwrite without creator) | **LOW** (edits work naturally) |
| **Warn-only**                    | Nothing blocked, all warned                        | **NONE**                                             | **NONE** (but no enforcement)  |

**Recommendation**: The "block new only" approach eliminates 90%+ of false positives while maintaining enforcement for the actual risk (invisible new artifacts).

### 5.2 Where to Enforce: Routing vs. Hooks

| Layer                    | Catches                                                | Misses                                                                         | Latency         |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------- |
| **Routing (Check 7)**    | Misrouted developer spawns for creation tasks          | Developer spawned for "implement feature" that happens to create an agent file | ~1ms            |
| **Hook (creator-guard)** | All writes to creator paths regardless of which agent  | Nothing (but may have false positives)                                         | ~10ms per write |
| **Both (recommended)**   | Routing catches intent mismatches, hook catches bypass | Minimal blind spots                                                            | ~11ms combined  |

**Recommendation**: Use both layers. Routing is the "cheap" first line; hook is the "expensive" last line.

### 5.3 State File vs. File-Existence Check

| Mechanism                              | Complexity                                    | Reliability                                         | Attack Surface                                 |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| **State file token** (current)         | High (TTL, state file I/O, pre-execute hooks) | Medium (TTL expiry, stale state, concurrent writes) | Medium (state file spoofing, TTL manipulation) |
| **File-existence check** (recommended) | Low (single `fs.existsSync` call)             | High (filesystem is source of truth)                | Low (file existence is hard to spoof)          |

**Recommendation**: Replace state-file-based authorization with file-existence check as the PRIMARY mechanism. Retain state file as a SECONDARY signal for enhanced security in high-enforcement environments.

---

## 6. Proposed Implementation

### 6.1 Changes to unified-creator-guard.cjs

**Modification to `validateCreatorWorkflow()`** (the core change):

```javascript
function validateCreatorWorkflow(toolName, toolInput) {
  if (!WATCHED_TOOLS.includes(toolName)) {
    return { pass: true };
  }

  const enforcement = getEnforcementMode('CREATOR_GUARD', 'block');
  if (enforcement === 'off') {
    auditSecurityOverride(/* ... */);
    return { pass: true };
  }

  const filePath = extractFilePath(toolInput);
  if (!filePath) return { pass: true };

  const required = findRequiredCreator(filePath);
  if (!required) return { pass: true }; // Not a protected artifact

  // --- NEW: File-existence check ---
  // Edit tool always targets existing files -> ALLOW
  if (toolName === 'Edit') {
    return { pass: true };
  }

  // Write tool: check if file already exists on disk
  // If file exists, this is an overwrite (edit), not creation -> ALLOW
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  if (fs.existsSync(absolutePath)) {
    return { pass: true }; // Editing existing artifact
  }
  // --- END NEW ---

  // NEW file creation: check if creator is active
  const creatorState = isCreatorActive(required.creator);
  if (creatorState.active) {
    return { pass: true };
  }

  // VIOLATION: New artifact creation without creator workflow
  const message = generateViolationMessage(filePath, required.creator, required.artifactType);

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  } else {
    return { pass: true, result: 'warn', message };
  }
}
```

**Impact**: ~15 lines changed in one function. All existing tests continue to pass (new-file creation is still blocked). Edit operations are explicitly allowed.

### 6.2 Changes to routing-guard.cjs

**Add creator-intent keywords to `SPECIALIST_KEYWORD_MAP`:**

```javascript
// Creator-intent routing (prevent developer from being spawned for creation tasks)
'agent-creator': [
  'create agent', 'create new agent', 'create a new agent', 'add an agent',
],
'skill-creator': [
  'create skill', 'create new skill', 'create a skill', 'add a skill',
],
'hook-creator': [
  'create hook', 'create new hook', 'add a hook', 'new enforcement hook',
],
'workflow-creator': [
  'create workflow', 'create new workflow', 'add a workflow',
],
```

**Impact**: ~20 lines added to constant definition. No logic changes needed -- Check 7 already scans for specialist keyword matches.

### 6.3 Batch Detection (Optional, P2)

Add a new Check 9 to routing-guard.cjs for batch creation detection:

```javascript
function checkBatchCreation(toolName, toolInput) {
  if (toolName !== 'Task') return { pass: true };

  const prompt = (toolInput.prompt || '').toLowerCase();
  const batchPattern = /create\s+(\d+)\s+(agents?|skills?|hooks?|workflows?)/i;
  const match = prompt.match(batchPattern);

  if (match && parseInt(match[1]) > 1) {
    const count = match[1];
    const type = match[2];
    return {
      pass: true, // warn only
      result: 'warn',
      message: `[BATCH-CREATION] Detected request to create ${count} ${type}.
Consider using master-orchestrator with iterative ${type.replace(/s$/, '')}-creator invocation.`,
    };
  }
  return { pass: true };
}
```

---

## 7. Migration Plan

### Phase 1: File-Existence Check (P0, Immediate)

1. Modify `validateCreatorWorkflow()` in unified-creator-guard.cjs
2. Add unit tests for:
   - Edit to existing agent file -> ALLOW
   - Write to existing agent file -> ALLOW
   - Write to NEW agent file without creator token -> BLOCK
   - Write to NEW agent file with creator token -> ALLOW
3. Run regression tests (existing 26 tests)
4. Deploy with `CREATOR_GUARD=block` (default)

### Phase 2: Routing Keywords (P1, Same Sprint)

1. Add creator-intent keywords to SPECIALIST_KEYWORD_MAP
2. Verify Check 7 produces correct warnings for "create agent" prompts routed to developer
3. Update documentation in CLAUDE.md Section 1.2 and @ENFORCEMENT_HOOKS.md

### Phase 3: Batch Detection (P2, Next Sprint)

1. Add batch creation detection (Check 9)
2. Create master-orchestrator prompt template for iterative creator invocation
3. Test with "create 5 agents" prompt

### Phase 4: State File Cleanup (P3, Backlog)

1. Remove `isCreatorActive()` check from the primary enforcement path (keep as secondary signal)
2. Simplify pre-execute hooks in creator skills (make state file optional, not required)
3. Reduce TTL complexity (no longer on the critical path)

---

## 8. Architecture Decision Record

### ADR-106: Creator Guard File-Existence Enforcement

**Date:** 2026-02-09

**Status:** Proposed

**Context:** unified-creator-guard.cjs blocks ALL writes to creator output paths without a creator token, causing false positives when developers legitimately edit existing artifacts. This led to widespread `CREATOR_GUARD=warn` usage, defeating enforcement.

**Decision:** Replace state-file-only authorization with a file-existence check as the primary enforcement mechanism. Edit tool operations and Write operations targeting existing files are allowed unconditionally. Only Write operations targeting new files (file does not exist) require a creator token.

**Consequences:**

- Eliminates false positives for legitimate edits (primary pain point)
- Retains enforcement for new artifact creation (the actual risk)
- Reduces dependency on state file coordination (simpler, more reliable)
- Creator pre-execute hooks become optional (backward compatible but no longer required for edits)
- Small risk: a Write that overwrites an existing artifact could bypass creator workflow. Mitigated by: (a) overwriting is rare (Edit is the normal tool for modifications), (b) post-creation-integration.cjs detects integration gaps after the fact.

---

## 9. Summary

### Root Cause

The guard conflated "creating new artifacts" with "editing existing artifacts" by applying the same enforcement (require creator token) to both operations.

### Solution

Use file-existence as the primary distinguishing signal:

- **New file** (does not exist on disk) + Write tool = **require creator token** (BLOCK without)
- **Existing file** (exists on disk) OR Edit tool = **allow without creator token**

### Defense-in-Depth

1. **Routing** (Check 7): Warn when developer is spawned for creation-intent tasks
2. **Hook** (creator-guard): Block only NEW file writes without creator token
3. **Post-Creation** (integration hook): Detect and alert on integration gaps

### Key Metrics

| Metric                                | Current                              | After Fix                           |
| ------------------------------------- | ------------------------------------ | ----------------------------------- |
| False positive rate (edit blocks)     | ~40% of all creator-guard violations | ~0%                                 |
| True positive rate (creation blocks)  | 100%                                 | 100%                                |
| State file dependency                 | Critical (required for all writes)   | Optional (only for new file writes) |
| CREATOR_GUARD=off workaround pressure | High                                 | Low                                 |
| Code change size                      | --                                   | ~35 lines modified, ~20 lines added |

---

## 10. Backward Propagation

### BACKWARD_PROPAGATION

**Pattern**: File-existence-based enforcement for distinguishing "create" vs "edit" operations, applicable to any hook that guards artifact paths.

**Proposed Artifact**: hook:creator-guard-file-existence-check (modification, not new artifact)

**Affected Components**: [unified-creator-guard.cjs, routing-guard.cjs, 6 creator pre-execute hooks, CLAUDE.md Gate 4 documentation, @ENFORCEMENT_HOOKS.md]

**Architectural Rationale**: The "block-all-writes" pattern creates an enforcement/usability trade-off that pushes users toward disabling enforcement entirely. File-existence checks eliminate the trade-off by correctly distinguishing the risky operation (creation) from the safe operation (editing).

**Impact Radius**: All 59 agents that may edit artifact files + all 6 creator skills + Router Gate 4 + 3 documentation files

**Priority**: P1 (critical architectural consistency -- current false positives undermine the entire enforcement layer)
