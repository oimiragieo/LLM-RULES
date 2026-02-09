<!-- Agent: planner | Task: #75 | Session: 2026-02-09 -->

# Plan: Creator Process Enforcement System

## Executive Summary

When a user requested "create 10 agents," the Router bypassed the entire creator workflow -- spawning developer agents who wrote agent files directly. This produced 10 invisible agents missing from catalogs, registries, and routing tables. This plan designs a multi-layer enforcement system that makes it structurally impossible to create artifacts without following the creator process.

## Root Cause Analysis

### What Happened

1. User said "create 10 agents" (batch creation request)
2. Router classified this as a **development task** (coding work)
3. Router spawned **developer** agents (not creator-aware agents)
4. Developer agents wrote directly to `.claude/agents/**/*.md`
5. `unified-creator-guard.cjs` either:
   - Was in `warn` mode (allowed the writes with warnings)
   - Was bypassed because `routing-guard.cjs` allowed the spawn first
6. No post-creation validation caught the missing integration steps

### Why It Happened -- 5 Root Causes

**RC-1: No creator intent detection at the routing layer.**
The `intent-agent-match.cjs` hook has categories for security, testing, architecture, documentation, deployment, and planning -- but **zero categories for artifact creation**. Keywords like "create agent", "create skill", "create hook" are not detected.

**RC-2: No creator intent detection in the specialist keyword map.**
The `routing-guard.cjs` `SPECIALIST_KEYWORD_MAP` has 25 specialist agent entries with contextual phrases -- but **no entries for any creator skill**. There is no "agent-creator", "skill-creator", "hook-creator" category with trigger phrases like "create agent", "create skill", etc.

**RC-3: The write-level guard fires too late.**
`unified-creator-guard.cjs` blocks writes to protected paths, but by the time a developer agent is writing to `.claude/agents/`, the routing decision has already been made. The guard can block the write, but it cannot redirect the work to the correct creator skill. The developer simply fails and the user gets no result.

**RC-4: TTL window is too narrow for batch operations.**
The `active-creators.json` state file uses a 3-minute TTL. For batch operations (10 agents), each creator invocation would need its own TTL window. The current system assumes one-at-a-time creation.

**RC-5: No post-creation compliance validation.**
`post-completion-chain.cjs` only handles workflow phase advancement. There is no hook that checks whether a completed task that created artifacts actually followed the creator process (catalog entry, registry update, CLAUDE.md update, agent assignment).

### Defense-in-Depth Gap Analysis

| Layer | Component | Current State | Gap |
|-------|-----------|---------------|-----|
| **Routing** | intent-agent-match.cjs | No creator intent category | No detection |
| **Routing** | routing-guard.cjs SPECIALIST_KEYWORD_MAP | No creator keywords | No enforcement |
| **Routing** | router-decision.md Step 0 | Relies on LLM judgment | No hook enforcement |
| **Pre-Write** | unified-creator-guard.cjs | Blocks writes (when in block mode) | Fires too late; cannot redirect |
| **Pre-Write** | active-creators.json TTL | 3-minute window | Too narrow for batch ops |
| **Post-Task** | post-completion-chain.cjs | Workflow phases only | No creator compliance check |
| **Post-Task** | (none) | Does not exist | No compliance validation |
| **Memory** | CLAUDE.md Gate 4 | Well-documented | Not machine-enforced at routing |

## Multi-Layer Enforcement Design

### Layer 1: Routing Intent Detection (PREVENT)

**Goal:** Detect artifact creation intent BEFORE the Router selects an agent, and force routing through creator skills.

#### 1A. Add creator intent category to intent-agent-match.cjs

**File:** `.claude/hooks/routing/intent-agent-match.cjs`
**Change:** Add a new `creation` intent category to `INTENT_PATTERNS`:

```javascript
creation: {
  keywords: [
    'create agent', 'create skill', 'create hook', 'create workflow',
    'create template', 'create schema', 'create command', 'create rule',
    'create tool', 'new agent', 'new skill', 'new hook', 'new workflow',
    'add agent', 'add skill', 'build agent', 'make agent',
    'restore agent', 'restore skill', 'restore hook', 'restore workflow',
  ],
  agents: ['general-purpose'], // Creators are skills, not agent types
  weight: 15, // Highest weight -- creator intent overrides everything
  note: 'Must invoke creator skill, not spawn developer',
},
```

**Behavior change:** When creation intent is detected and the spawned agent is `developer`, the hook emits a **blocking** warning: "Artifact creation detected. Use creator skill via general-purpose agent, not developer."

#### 1B. Add creator keywords to routing-guard.cjs SPECIALIST_KEYWORD_MAP

**File:** `.claude/hooks/routing/routing-guard.cjs`
**Change:** Add creator entries to SPECIALIST_KEYWORD_MAP:

```javascript
'agent-creator': [
  'create agent', 'create an agent', 'new agent', 'add agent',
  'build agent', 'make agent', 'restore agent', 'create agents',
  'create 10 agents', 'create multiple agents', 'batch create agents',
],
'skill-creator': [
  'create skill', 'create a skill', 'new skill', 'add skill',
  'build skill', 'restore skill', 'create skills',
],
'hook-creator': [
  'create hook', 'create a hook', 'new hook', 'add hook',
  'build hook', 'create hooks',
],
'workflow-creator': [
  'create workflow', 'create a workflow', 'new workflow',
  'add workflow', 'create workflows',
],
'template-creator': [
  'create template', 'create a template', 'new template',
],
'schema-creator': [
  'create schema', 'create a schema', 'new schema',
],
```

**Behavior change:** When a developer spawn prompt contains any creator keyword, Check 7 (specialist override) triggers. In `block` mode, this prevents the spawn entirely. In `warn` mode (current default), it emits a highly visible warning.

**Enforcement mode change:** Change `SPECIALIST_ROUTING_ENFORCEMENT` default from `warn` to `block` specifically for creator keywords. This requires a targeted check -- creator keywords should block while other specialist overrides can remain as warnings.

#### 1C. Add creator intent detection to user-prompt-unified.cjs (or a new pre-routing hook)

**File:** `.claude/hooks/routing/user-prompt-unified.cjs` (or new hook)
**Change:** During UserPromptSubmit processing, scan the user's prompt for creation intent keywords. If detected, set a flag in `router-state.json`:

```javascript
routerState.setState({
  creatorIntentDetected: true,
  detectedCreatorType: 'agent-creator', // or skill-creator, etc.
  requiredCreatorSkill: 'agent-creator',
});
```

**Effect:** Downstream hooks (routing-guard.cjs) can check this flag and enforce creator routing regardless of what the Router's LLM decides.

### Layer 2: Spawn-Level Enforcement (BLOCK)

**Goal:** If Layer 1 fails and a developer is spawned for creator work, block the spawn at the Task() hook level.

#### 2A. Add Check 9 to routing-guard.cjs: Creator Intent Guard

**File:** `.claude/hooks/routing/routing-guard.cjs`
**Change:** Add a new check function `checkCreatorIntentGuard`:

```javascript
function checkCreatorIntentGuard(toolName, toolInput) {
  if (toolName !== 'Task') return { pass: true };

  const state = getCachedRouterState();
  if (!state.creatorIntentDetected) return { pass: true };

  // Creator intent was detected in user prompt
  // Check if this spawn is a creator-aware agent
  const prompt = (toolInput.prompt || '').toLowerCase();
  const hasCreatorSkill = (
    prompt.includes('skill-creator') ||
    prompt.includes('agent-creator') ||
    prompt.includes('hook-creator') ||
    prompt.includes('workflow-creator') ||
    prompt.includes('template-creator') ||
    prompt.includes('schema-creator') ||
    prompt.includes('creator skill')
  );

  if (hasCreatorSkill) return { pass: true };

  // Spawning a non-creator agent for a creator task
  const enforcement = getEnforcementMode('CREATOR_ROUTING_ENFORCEMENT', 'block');
  if (enforcement === 'off') return { pass: true };

  const message = `[CREATOR ROUTING VIOLATION] Creator intent detected: ${state.detectedCreatorType}
  You are spawning a non-creator agent. Artifact creation MUST use creator skills.
  Spawn a general-purpose agent with: Skill({ skill: "${state.requiredCreatorSkill}" })`;

  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
  return { pass: true, result: 'warn', message };
}
```

**New env var:** `CREATOR_ROUTING_ENFORCEMENT=block|warn|off` (default: block)

#### 2B. Strengthen unified-creator-guard.cjs for batch operations

**File:** `.claude/hooks/routing/unified-creator-guard.cjs`
**Changes:**

1. **TTL extension for batch operations:** When a creator is active and writes multiple artifacts, each write resets the TTL. Add a `refreshCreatorTTL()` call in the "allow" path:

```javascript
if (creatorState.active) {
  // Refresh TTL on each successful write to support batch operations
  markCreatorActive(required.creator, creatorState.artifactName);
  return { pass: true };
}
```

2. **Batch mode detection:** If `router-state.json` has `batchCreation: true`, extend the base TTL to 10 minutes (the maximum).

3. **Creator chain validation:** Track which specific creator is active and validate it matches the artifact being written. An active `skill-creator` should not allow writing to `.claude/agents/`.

### Layer 3: Post-Creation Compliance Validation (DETECT)

**Goal:** After a task completes, verify that creator process steps were actually followed.

#### 3A. Create new hook: creator-compliance-validator.cjs

**File:** `.claude/hooks/validation/creator-compliance-validator.cjs`
**Trigger:** PreToolUse(TaskUpdate) when status === "completed"
**Registration:** Add to settings.json TaskUpdate matcher

**Logic:**

```
1. Read task metadata for completed task
2. Check if task involved artifact creation (metadata.filesCreated matching creator paths)
3. If artifact creation detected, validate:
   a. Was a creator skill invoked? (check active-creators.json history)
   b. Does the artifact have a catalog entry? (check relevant catalog)
   c. Does the artifact have an agent assignment? (check agent-registry.json)
   d. Was CLAUDE.md updated? (check git diff or timestamp)
   e. Was a research report generated? (check research-reports directory)
4. If any validation fails:
   - In block mode: Prevent task completion (status stays in_progress)
   - In warn mode: Allow completion but emit loud warning
   - Queue missing integrations to integration-queue.jsonl
```

**Compliance checklist per artifact type:**

| Artifact Type | Must-Have Checks |
|---------------|-----------------|
| Agent | agent-registry.json entry, routing keyword in routing-table.cjs, CLAUDE.md mention |
| Skill | skill-catalog.md entry, at least one agent assigned |
| Hook | settings.json registration, @ENFORCEMENT_HOOKS.md entry |
| Workflow | @WORKFLOW_AGENT_MAP.md entry, agent assignment |
| Template | template-catalog.md entry |
| Schema | schema-catalog.md entry |

**New env var:** `CREATOR_COMPLIANCE_ENFORCEMENT=block|warn|off` (default: warn initially, promote to block after validation)

#### 3B. Enhance pre-completion-validation.cjs

**File:** `.claude/hooks/validation/pre-completion-validation.cjs`
**Change:** Add creator compliance as an additional validation gate. Before allowing task completion, check if the task's `filesCreated` metadata includes any protected artifact paths. If so, delegate to creator-compliance-validator logic.

### Layer 4: Documentation and Memory Reinforcement (EDUCATE)

**Goal:** Make the creator process so clear in documentation that even an LLM "forgetting" enforcement is unlikely.

#### 4A. Update CLAUDE.md Gate 4 with batch creation guidance

**File:** `.claude/CLAUDE.md`
**Change:** Add explicit guidance for batch creation scenarios:

```markdown
### Batch Artifact Creation (e.g., "create 10 agents")

When user requests multiple artifacts:
1. Router MUST spawn a PLANNER first (complexity: HIGH)
2. Planner creates tasks with Target Agent: general-purpose + creator skill
3. Each task invokes the appropriate creator skill
4. NEVER spawn multiple developers to write artifacts in parallel

Example (CORRECT):
User: "Create 10 new agents for different domains"
Router: → Spawn PLANNER to design agent creation plan
PLANNER: → Creates 10 tasks, each targeting general-purpose with agent-creator skill
Each Task: → Invokes Skill({ skill: "agent-creator" }) per agent
```

#### 4B. Add creator routing keywords to @AGENT_ROUTING_TABLE.md

**File:** `.claude/docs/@AGENT_ROUTING_TABLE.md`
**Change:** Add a "Creator Skills" section with explicit routing:

```markdown
### Artifact Creation (MANDATORY ROUTING)

| User Request | WRONG | CORRECT |
|---|---|---|
| "create agent" | developer | general-purpose + agent-creator skill |
| "create skill" | developer | general-purpose + skill-creator skill |
| "create hook" | developer | general-purpose + hook-creator skill |
| "create 10 agents" | 10 developers | planner -> 10 general-purpose + agent-creator |
```

#### 4C. Update spawn template for creator awareness

**File:** `.claude/templates/spawn/universal-agent-spawn.md`
**Change:** Add a creator detection reminder to the universal spawn template:

```markdown
## Creator Workflow Awareness
If your task involves creating artifacts (agents, skills, hooks, workflows, templates, schemas):
- You MUST invoke the appropriate creator skill: Skill({ skill: "<type>-creator" })
- Direct writes to artifact paths will be BLOCKED by unified-creator-guard.cjs
- The creator skill handles all post-creation integration (catalogs, registries, CLAUDE.md)
```

## Implementation Tasks

### Phase 0: Research and Planning (COMPLETE - this document)

- [x] **0.1** Read current enforcement hooks (unified-creator-guard, routing-guard, post-completion-chain)
- [x] **0.2** Read creator workflow (ecosystem-creation-workflow, agent-creator SKILL.md)
- [x] **0.3** Read router decision workflow (router-decision.md)
- [x] **0.4** Analyze root causes and design enforcement layers
- [x] **0.5** Document plan with specific implementation tasks

**Success Criteria:** Plan document exists with root cause analysis, 4-layer design, and numbered tasks.

---

### Phase 1: Routing Layer Enforcement (Tasks 1.1-1.4)

**Purpose:** Detect artifact creation intent at the routing layer and prevent misrouting to developer agents.
**Dependencies:** None
**Estimated time:** 3-4 hours
**Commit Checkpoint:** After Phase 1 (10+ files will be modified across all phases)

- [ ] **1.1** Add `creation` intent category to intent-agent-match.cjs (~30 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/routing/intent-agent-match.cjs`
  - Add creator keywords with weight 15 (highest priority)
  - Add logic to warn/block when developer is spawned for creator work
  - **Verify:** Run existing intent-agent-match tests + new tests for creator intent

- [ ] **1.2** Add creator keywords to routing-guard.cjs SPECIALIST_KEYWORD_MAP (~30 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/routing/routing-guard.cjs`
  - Add 6 creator entries (agent, skill, hook, workflow, template, schema) with contextual phrases
  - Include batch creation phrases ("create 10 agents", "create multiple agents")
  - **Verify:** Run existing routing-guard tests + new tests for creator specialist override

- [ ] **1.3** Add creator intent flag to user-prompt-unified.cjs (~45 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/routing/user-prompt-unified.cjs`
  - Scan user prompt for creation intent at UserPromptSubmit time
  - Set `creatorIntentDetected` and `detectedCreatorType` in router-state.json
  - **Verify:** Test that creator intent is detected for various phrasings

- [ ] **1.4** Add Check 9 (Creator Intent Guard) to routing-guard.cjs (~45 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/routing/routing-guard.cjs`
  - New function: `checkCreatorIntentGuard(toolName, toolInput)`
  - Reads `creatorIntentDetected` from cached router state
  - Blocks Task() spawn if creator intent detected but spawn lacks creator skill reference
  - New env var: `CREATOR_ROUTING_ENFORCEMENT=block|warn|off` (default: block)
  - **Verify:** Test that developer spawns are blocked when creator intent is active

**Phase 1 Verification Gate:**
```
1. All existing routing-guard tests pass (91+ tests)
2. All existing intent-agent-match tests pass
3. New creator enforcement tests pass (minimum 15 new tests)
4. Manual test: simulate "create agent" prompt and verify creator intent detected
```

**Success Criteria:** Creator intent detected at routing layer; developer spawns blocked for creator work.

---

### Phase 2: Write-Level and Spawn Enforcement (Tasks 2.1-2.3)

**Purpose:** Strengthen write-level guards and add batch operation support.
**Dependencies:** Phase 1
**Estimated time:** 2-3 hours

- [ ] **2.1** Add TTL refresh for batch operations in unified-creator-guard.cjs (~45 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/routing/unified-creator-guard.cjs`
  - Refresh TTL on each successful write (prevent timeout during batch creates)
  - Add batch mode detection from router-state.json
  - Add creator type cross-validation (skill-creator cannot write to agents/ directory)
  - **Verify:** Test TTL refresh, batch mode, and cross-validation

- [ ] **2.2** Add router-state.json fields for creator tracking (~30 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - Files: `.claude/lib/routing/router-state.cjs`, `.claude/hooks/session/state-reset.cjs`
  - Add fields: `creatorIntentDetected`, `detectedCreatorType`, `requiredCreatorSkill`, `batchCreation`
  - Add to state-reset.cjs to clear on each new prompt
  - **Verify:** Test state management for new fields

- [ ] **2.3** Ensure CREATOR_GUARD default is `block` (not `warn`) (~15 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - File: `.claude/hooks/routing/unified-creator-guard.cjs`
  - Verify default enforcement mode is `block`
  - If currently `warn` in any configuration, update to `block`
  - Document override in `.env.example`
  - **Verify:** Confirm default is block; test that writes to protected paths are blocked

**Phase 2 Verification Gate:**
```
1. All existing unified-creator-guard tests pass (26+ tests)
2. New batch operation tests pass (minimum 8 new tests)
3. Creator cross-validation test: skill-creator active, attempt agent write -> blocked
4. TTL refresh test: write 10 artifacts sequentially without timeout
```

**Success Criteria:** Batch operations supported; write-level guard blocks unauthorized writes; creator type cross-validation works.

---

### Phase 3: Post-Creation Compliance Validation (Tasks 3.1-3.3)

**Purpose:** Detect when artifacts are created without proper process and block premature task completion.
**Dependencies:** Phase 2
**Estimated time:** 3-4 hours

**Commit Checkpoint:** Commit Phase 1-2 changes before starting Phase 3.

- [ ] **3.1** Create creator-compliance-validator.cjs hook (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `hook-creator`, `verification-before-completion`
  - File: `.claude/hooks/validation/creator-compliance-validator.cjs`
  - Trigger: PreToolUse(TaskUpdate) when status === "completed"
  - Check filesCreated metadata for protected artifact paths
  - Validate catalog entries, registry entries, CLAUDE.md references
  - Env var: `CREATOR_COMPLIANCE_ENFORCEMENT=warn|block|off` (default: warn)
  - **Verify:** Test with mock task completions with/without proper creator process

- [ ] **3.2** Register creator-compliance-validator in settings.json (~15 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - File: `.claude/settings.json`
  - Add to TaskUpdate PreToolUse matcher (after pre-completion-validation.cjs)
  - **Verify:** Confirm hook fires on TaskUpdate with status=completed

- [ ] **3.3** Enhance pre-completion-validation.cjs with creator awareness (~45 min)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - File: `.claude/hooks/validation/pre-completion-validation.cjs`
  - Add check: if filesCreated contains protected paths, require creator compliance
  - Delegate detailed validation to creator-compliance-validator
  - **Verify:** Test integration between pre-completion and creator compliance

**Phase 3 Verification Gate:**
```
1. New compliance validator tests pass (minimum 12 new tests)
2. Integration test: create artifact without creator -> task completion blocked/warned
3. Integration test: create artifact with creator -> task completion allowed
4. Existing pre-completion tests still pass
```

**Success Criteria:** Task completion blocked/warned when artifacts created without proper creator process.

---

### Phase 4: Documentation and Memory Updates (Tasks 4.1-4.4)

**Purpose:** Update documentation to reinforce creator process and prevent future bypasses.
**Dependencies:** Phase 3
**Estimated time:** 1-2 hours

- [ ] **4.1** Update CLAUDE.md Gate 4 with batch creation guidance (~30 min)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`, `verification-before-completion`
  - File: `.claude/CLAUDE.md`
  - Add batch artifact creation section to Gate 4
  - Add explicit anti-pattern examples for "create N agents"
  - **Verify:** Grep for "batch" in CLAUDE.md confirms addition

- [ ] **4.2** Update @AGENT_ROUTING_TABLE.md with creator routing (~20 min)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`, `verification-before-completion`
  - File: `.claude/docs/@AGENT_ROUTING_TABLE.md`
  - Add "Artifact Creation (MANDATORY ROUTING)" section
  - Add WRONG/CORRECT table for each artifact type
  - **Verify:** Grep confirms creator routing entries exist

- [ ] **4.3** Update router-decision.md Step 0 with hook enforcement reference (~20 min)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`, `verification-before-completion`
  - File: `.claude/workflows/core/router-decision.md`
  - Reference new Check 9 (Creator Intent Guard) in routing-guard.cjs
  - Add note about UserPromptSubmit creator intent detection
  - **Verify:** Grep confirms creator enforcement references exist

- [ ] **4.4** Record learnings and decisions in memory files (~15 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Files: `.claude/context/memory/learnings.md`, `.claude/context/memory/decisions.md`
  - Add learning: "Creator process bypass root cause analysis"
  - Add ADR: "ADR-091: Creator Routing Enforcement"
  - **Verify:** Memory files updated with new entries

**Phase 4 Verification Gate:**
```
1. CLAUDE.md has batch creation guidance in Gate 4
2. @AGENT_ROUTING_TABLE.md has creator routing section
3. router-decision.md references Check 9
4. Memory files updated with learnings and ADR
```

**Success Criteria:** All documentation reflects new enforcement system.

---

### Phase 5: Integration Testing (Tasks 5.1-5.2)

**Purpose:** End-to-end validation of the enforcement system.
**Dependencies:** Phase 4
**Estimated time:** 1-2 hours

- [ ] **5.1** Run full test suite (~30 min)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `qa-workflow`, `verification-before-completion`
  - Commands: `pnpm test`, `pnpm lint:fix`, `pnpm format`
  - **Verify:** All tests pass, lint clean, format clean

- [ ] **5.2** Scenario testing for bypass prevention (~1 hour)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `qa-workflow`, `verification-before-completion`
  - Test scenarios:
    1. "Create an agent" -> verify creator routing enforced
    2. "Create 10 agents" -> verify planner-first then creator routing
    3. Developer spawned with "create agent" in prompt -> verify specialist override blocks
    4. Direct write to `.claude/agents/` without creator -> verify unified-creator-guard blocks
    5. Task completion with artifact but no catalog entry -> verify compliance validator warns
  - **Verify:** All 5 scenarios produce expected enforcement behavior

**Phase 5 Verification Gate:**
```
1. pnpm test: 0 failures
2. pnpm lint:fix: 0 errors
3. pnpm format: no changes
4. All 5 bypass scenarios correctly enforced
```

**Success Criteria:** Full test suite passes; all bypass scenarios blocked.

---

### Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction.

**Tasks:**

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Success Criteria:**

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

## Files to Create

| File | Purpose |
|------|---------|
| `.claude/hooks/validation/creator-compliance-validator.cjs` | Post-creation compliance validation |

## Files to Modify

| File | Change |
|------|--------|
| `.claude/hooks/routing/intent-agent-match.cjs` | Add `creation` intent category |
| `.claude/hooks/routing/routing-guard.cjs` | Add creator keywords to SPECIALIST_KEYWORD_MAP + Check 9 |
| `.claude/hooks/routing/unified-creator-guard.cjs` | TTL refresh + batch mode + creator cross-validation |
| `.claude/hooks/routing/user-prompt-unified.cjs` | Creator intent detection at UserPromptSubmit |
| `.claude/lib/routing/router-state.cjs` | New creator tracking fields |
| `.claude/hooks/session/state-reset.cjs` | Reset new creator fields |
| `.claude/hooks/validation/pre-completion-validation.cjs` | Creator compliance awareness |
| `.claude/settings.json` | Register creator-compliance-validator |
| `.claude/CLAUDE.md` | Batch creation guidance in Gate 4 |
| `.claude/docs/@AGENT_ROUTING_TABLE.md` | Creator routing section |
| `.claude/workflows/core/router-decision.md` | Check 9 reference |
| `.claude/context/memory/learnings.md` | Bypass root cause learning |
| `.claude/context/memory/decisions.md` | ADR-091 |

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| False positive: legitimate developer edits to agent files blocked | Medium | Low | CREATOR_GUARD only blocks new file creation, not edits to existing files. Add `isNewFile` check. |
| Performance: additional hook checks slow down every Task() spawn | Low | Medium | Creator intent check is O(1) keyword scan, negligible overhead (<1ms) |
| TTL refresh creates infinite creator window | Medium | Low | Keep MAX_TTL_MS at 10 minutes; refresh resets but cannot exceed max |
| Compliance validator blocks task completion for false positive | Medium | Medium | Start in `warn` mode (CREATOR_COMPLIANCE_ENFORCEMENT=warn); promote to block after 1 week |
| Batch operations overwhelm router state | Low | Low | Router state is file-based, handles sequential operations fine; true parallelism would need mutex |

## Complexity Assessment

| Dimension | Assessment |
|-----------|-----------|
| Complexity | STANDARD (6-8 files modified, 1 file created, well-scoped) |
| Workflow Type | FEATURE (new enforcement capability) |
| Confidence | 0.85 |
| Risk Level | MEDIUM (modifying enforcement hooks requires careful testing) |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 0 (Research) | 5 | Complete | N/A |
| 1 (Routing) | 4 | 3-4 hours | Partial (1.1 and 1.2 parallel) |
| 2 (Write Guards) | 3 | 2-3 hours | Partial (2.1 and 2.2 parallel) |
| 3 (Compliance) | 3 | 3-4 hours | No (sequential) |
| 4 (Documentation) | 4 | 1-2 hours | Yes (all parallel) |
| 5 (Testing) | 2 | 1-2 hours | No (sequential) |
| FINAL (Reflection) | 3 | 30 min | N/A |
| **Total** | **24** | **~12-16 hours** | |

## Enforcement Mode Rollout Strategy

| Hook/Check | Initial Mode | Target Mode | Promotion Criteria |
|------------|-------------|-------------|-------------------|
| intent-agent-match creation category | warn | block | 0 false positives in 3 sessions |
| SPECIALIST_KEYWORD_MAP creator entries | warn (existing default) | block | Review after routing-guard promotion |
| Check 9: Creator Intent Guard | block | block | Start at block (most critical gap) |
| unified-creator-guard TTL refresh | block (existing) | block | N/A (enhancement, not new check) |
| creator-compliance-validator | warn | block | 0 false positives in 1 week |

## Decision Record

**ADR-091: Creator Routing Enforcement**

**Date:** 2026-02-09
**Status:** Proposed
**Context:** Router bypassed creator workflow when user requested batch agent creation, routing to developer agents instead of creator skills.
**Decision:** Implement 4-layer enforcement: routing intent detection, spawn-level blocking, post-creation compliance validation, and documentation updates.
**Rationale:** Defense-in-depth prevents bypass at any single layer. Each layer addresses a different failure mode: intent detection (Layer 1), spawn blocking (Layer 2), compliance validation (Layer 3), and education (Layer 4).
**Consequences:** Creator process violations become structurally impossible through hook enforcement. Legitimate developer edits to existing artifacts remain unaffected. Batch operations supported through TTL refresh mechanism.
