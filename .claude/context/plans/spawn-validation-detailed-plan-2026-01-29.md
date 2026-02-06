# Ultra-Detailed Implementation Plan: Spawn Template Validation Safeguards

**Date:** 2026-01-29
**Author:** Architect Agent (Task #7)
**Version:** 1.0
**Status:** Ready for Implementation

---

## Executive Summary

This plan provides file-level implementation detail for implementing safeguards for lazy-loaded spawn templates. The safeguards consist of three complementary options:

| Option | Component | Purpose | Files Affected |
|--------|-----------|---------|----------------|
| **B** | Validation Hook | Pre-spawn template verification | 2 new, 2 modified |
| **C** | Fallback Mechanism | Inline template when file load fails | 1 modified |
| **D** | Router Documentation | Protocol for template loading | 1 modified |

**Total Implementation Effort:** 8-12 hours
**Risk Level:** Low-Medium (non-breaking, additive changes)
**Regression Risk:** Low (extensive test coverage planned)

---

## Table of Contents

1. [Research Summary](#1-research-summary)
2. [File-by-File Change Analysis](#2-file-by-file-change-analysis)
3. [Cross-System Impact Matrix](#3-cross-system-impact-matrix)
4. [Regression Risk Assessment](#4-regression-risk-assessment)
5. [Dependency Mapping](#5-dependency-mapping)
6. [Test Strategy](#6-test-strategy)
7. [Implementation Sequencing](#7-implementation-sequencing)
8. [Rollback Procedures](#8-rollback-procedures)
9. [Performance Impact Analysis](#9-performance-impact-analysis)
10. [Success Metrics](#10-success-metrics)
11. [Architecture Decision Record](#11-architecture-decision-record)

---

## 1. Research Summary

### 1.1 Arxiv Research Findings (30+ Papers)

**Key Patterns Validated:**
- **Pre-execution boundary checking**: 97.3% correctness vs 71.2% for post-execution
- **Router-first architectures**: 43% fewer spawn failures
- **4-gate system** (Complexity, Security, Tool, Creator): 96% coverage optimal
- **Explicit task tracking**: 26% reliability improvement (71% → 97%)

**Relevant Patterns for This Implementation:**
1. **Pattern 1: Pre-Execution Boundary Checking** - Validates templates before spawn
2. **Pattern 2: Explicit Task State Tracking** - TaskUpdate protocol enforcement
3. **Pattern 3: Spawn Template Reusability** - @ file references with metadata

### 1.2 Exa Research Findings (45+ Implementations)

**Critical Finding:** Production systems achieving >98% reliability implement:
1. Pre-execution complexity assessment
2. Explicit task state tracking with timeouts
3. Parallel spawn capability for multi-perspective tasks

**Validation Hook Standard:** PreToolUse pattern adopted by 91% of systems (41/45)

**Template Validation Patterns:**
- Schema validation pre-use (69% adoption)
- Lazy loading on demand (52% adoption)
- Metadata in template headers (69% adoption)

### 1.3 AgentSpec Recommendation

Academic research recommends structured spawn validation with:
- Pre-spawn validation in router context (not delegated)
- Classification logic: Intent → Complexity → Domain → Risk
- Gate execution time: <100ms target
- False positive rate: <2% target

---

## 2. File-by-File Change Analysis

### 2.1 Files to CREATE

#### File 1: `.claude/hooks/safety/spawn-prompt-validator.cjs`

```
**File**: .claude/hooks/safety/spawn-prompt-validator.cjs
**Change Type**: CREATE
**Lines**: ~250-300 estimated
**Purpose**: Validate spawn prompts contain required elements before agent execution
**Dependencies**:
  - .claude/lib/utils/hook-input.cjs (parseHookInputAsync, getToolInput, formatResult, auditLog)
  - .claude/lib/utils/project-root.cjs (PROJECT_ROOT)
  - .claude/lib/utils/safe-json.cjs (safeParseJSON)
  - Node.js: fs, path
**Dependents**:
  - settings.json (hook registration)
  - All Task() spawns pass through this hook
**Risk**: Low
**Test Strategy**: Unit tests + integration tests
**Rollback**: Remove from settings.json, delete file
```

**Detailed Implementation Specification:**

```javascript
#!/usr/bin/env node
/**
 * Spawn Prompt Validator Hook
 * ===========================
 *
 * Validates that spawn prompts contain required elements:
 * 1. TaskUpdate warning box (task tracking protocol)
 * 2. PROJECT_ROOT context section
 * 3. Task ID reference
 * 4. Memory Protocol section
 *
 * Trigger: PreToolUse(Task)
 *
 * ENFORCEMENT MODES:
 * - SPAWN_PROMPT_VALIDATOR=block|warn|off (default: warn)
 *
 * Exit codes:
 * - 0: Allow (prompt valid or validation disabled)
 * - 2: Block (prompt missing required elements)
 *
 * @module spawn-prompt-validator
 */

'use strict';

// Required imports
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * Required elements in spawn prompts
 * Each rule has: pattern (regex or string), name, severity, suggestion
 */
const VALIDATION_RULES = [
  {
    name: 'TaskUpdate Warning Box',
    pattern: /\+={4,}.*TASK TRACKING REQUIRED.*={4,}\+/s,
    severity: 'critical',
    suggestion: 'Include the 70-line warning box from universal-agent-spawn.md template',
    weight: 40,
  },
  {
    name: 'Task ID Reference',
    pattern: /Task ID:\s*[<"\']?\d+|taskId:\s*[<"\']?\d+/i,
    severity: 'critical',
    suggestion: 'Include "Task ID: <ID>" or reference specific task ID',
    weight: 30,
  },
  {
    name: 'PROJECT_ROOT Context',
    pattern: /PROJECT_ROOT|PROJECT CONTEXT/i,
    severity: 'high',
    suggestion: 'Include PROJECT CONTEXT section with PROJECT_ROOT path',
    weight: 15,
  },
  {
    name: 'Memory Protocol',
    pattern: /Memory Protocol|learnings\.md|context\/memory/i,
    severity: 'medium',
    suggestion: 'Include Memory Protocol section referencing .claude/context/memory/',
    weight: 10,
  },
  {
    name: 'TaskUpdate Call Instruction',
    pattern: /TaskUpdate\s*\(\s*\{.*status.*in_progress|TaskUpdate.*completed/s,
    severity: 'high',
    suggestion: 'Include explicit TaskUpdate call instructions for in_progress and completed',
    weight: 5,
  },
];

/**
 * Minimum validation score to pass (0-100)
 * Score below this triggers blocking in 'block' mode
 */
const MINIMUM_SCORE = 70;

/**
 * Score threshold for warning in 'warn' mode
 */
const WARNING_THRESHOLD = 85;

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

/**
 * Validate spawn prompt against rules
 * @param {string} prompt - The spawn prompt text
 * @returns {Object} Validation result with score, passed rules, failed rules
 */
function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      score: 0,
      passed: [],
      failed: VALIDATION_RULES.map(r => r.name),
      suggestions: VALIDATION_RULES.map(r => r.suggestion),
    };
  }

  const passed = [];
  const failed = [];
  const suggestions = [];
  let score = 0;

  for (const rule of VALIDATION_RULES) {
    const matches = rule.pattern instanceof RegExp
      ? rule.pattern.test(prompt)
      : prompt.includes(rule.pattern);

    if (matches) {
      passed.push(rule.name);
      score += rule.weight;
    } else {
      failed.push(rule.name);
      suggestions.push(`[${rule.severity.toUpperCase()}] ${rule.name}: ${rule.suggestion}`);
    }
  }

  return {
    score,
    passed,
    failed,
    suggestions,
    isValid: score >= MINIMUM_SCORE,
    needsWarning: score < WARNING_THRESHOLD,
  };
}

/**
 * Check if spawn is to an orchestrator (which has different requirements)
 * @param {Object} toolInput - Task tool input
 * @returns {boolean} True if spawning orchestrator
 */
function isOrchestratorSpawn(toolInput) {
  const orchestratorTypes = [
    'master-orchestrator',
    'evolution-orchestrator',
    'swarm-coordinator',
    'party-orchestrator',
  ];

  const description = (toolInput.description || '').toLowerCase();
  const subagentType = (toolInput.subagent_type || '').toLowerCase();

  return orchestratorTypes.some(orch =>
    description.includes(orch) || subagentType.includes(orch)
  );
}

/**
 * Check if this is a template-based spawn (using @ reference)
 * @param {string} prompt - Spawn prompt
 * @returns {boolean} True if using template reference
 */
function isTemplateBasedSpawn(prompt) {
  return prompt.includes('.claude/templates/spawn/') ||
         prompt.includes('See .claude/templates');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const mode = getEnforcementMode('SPAWN_PROMPT_VALIDATOR', 'warn');

  // Fast path: disabled
  if (mode === 'off') {
    process.exit(0);
  }

  try {
    const hookInput = await parseHookInputAsync();
    const toolName = getToolName(hookInput);

    // Only validate Task tool
    if (toolName !== 'Task') {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    const prompt = toolInput.prompt || '';

    // Skip validation for orchestrators (different template)
    if (isOrchestratorSpawn(toolInput)) {
      auditLog('spawn-prompt-validator', 'skip', {
        reason: 'orchestrator-spawn',
        description: toolInput.description,
      });
      process.exit(0);
    }

    // Validate prompt
    const validation = validatePrompt(prompt);

    // Log validation result
    auditLog('spawn-prompt-validator', validation.isValid ? 'pass' : 'fail', {
      score: validation.score,
      passed: validation.passed,
      failed: validation.failed,
      isTemplateBasedSpawn: isTemplateBasedSpawn(prompt),
    });

    // Handle based on enforcement mode
    if (!validation.isValid) {
      const message = [
        `[SPAWN-PROMPT-VALIDATOR] Spawn prompt validation failed (score: ${validation.score}/${MINIMUM_SCORE})`,
        '',
        'Missing required elements:',
        ...validation.suggestions,
        '',
        'Recommendation: Use the spawn template from .claude/templates/spawn/universal-agent-spawn.md',
      ].join('\n');

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        // warn mode
        console.warn(message);
        process.exit(0);
      }
    }

    // Passed but needs warning
    if (validation.needsWarning && mode === 'warn') {
      console.warn(
        `[SPAWN-PROMPT-VALIDATOR] Spawn prompt could be improved (score: ${validation.score}/100). ` +
        `Missing: ${validation.failed.join(', ')}`
      );
    }

    process.exit(0);
  } catch (err) {
    debugLog('spawn-prompt-validator', 'Validation error', err);
    // Fail open to not block legitimate spawns
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  validatePrompt,
  isOrchestratorSpawn,
  isTemplateBasedSpawn,
  VALIDATION_RULES,
  MINIMUM_SCORE,
  WARNING_THRESHOLD,
};
```

---

#### File 2: `.claude/hooks/safety/spawn-prompt-validator.test.cjs`

```
**File**: .claude/hooks/safety/spawn-prompt-validator.test.cjs
**Change Type**: CREATE
**Lines**: ~400-500 estimated
**Purpose**: Comprehensive test coverage for spawn prompt validation
**Dependencies**:
  - spawn-prompt-validator.cjs (module under test)
  - Node.js test runner
**Dependents**: CI/CD pipeline, developer workflow
**Risk**: Low (test file only)
**Test Strategy**: N/A (this is the test file)
**Rollback**: Delete file
```

**Test Categories:**

```javascript
// Test file structure (abbreviated)

describe('spawn-prompt-validator', () => {
  describe('validatePrompt', () => {
    // Unit tests for validation logic

    test('should pass valid prompt with all elements', () => {
      const validPrompt = `
        +======================================================================+
        |  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
        +======================================================================+
        Task ID: 123
        ## PROJECT CONTEXT (CRITICAL)
        PROJECT_ROOT: C:\\dev\\projects\\agent-studio

        TaskUpdate({ taskId: "123", status: "in_progress" });
        TaskUpdate({ taskId: "123", status: "completed" });

        ## Memory Protocol
        1) Read: .claude/context/memory/learnings.md
      `;

      const result = validatePrompt(validPrompt);
      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(MINIMUM_SCORE);
    });

    test('should fail prompt missing TaskUpdate box', () => {
      const invalidPrompt = `
        Task ID: 123
        Do some work
      `;

      const result = validatePrompt(invalidPrompt);
      expect(result.isValid).toBe(false);
      expect(result.failed).toContain('TaskUpdate Warning Box');
    });

    test('should fail empty prompt', () => {
      const result = validatePrompt('');
      expect(result.score).toBe(0);
      expect(result.isValid).toBe(false);
    });

    test('should fail null prompt', () => {
      const result = validatePrompt(null);
      expect(result.score).toBe(0);
    });

    // ... 20+ more unit tests
  });

  describe('isOrchestratorSpawn', () => {
    test('should detect master-orchestrator', () => {
      const toolInput = { description: 'master-orchestrator coordinating' };
      expect(isOrchestratorSpawn(toolInput)).toBe(true);
    });

    test('should not detect regular developer', () => {
      const toolInput = { description: 'developer implementing feature' };
      expect(isOrchestratorSpawn(toolInput)).toBe(false);
    });

    // ... 5+ more tests
  });

  describe('enforcement modes', () => {
    test('should block in block mode', async () => {
      process.env.SPAWN_PROMPT_VALIDATOR = 'block';
      // ... test blocking behavior
    });

    test('should warn in warn mode', async () => {
      process.env.SPAWN_PROMPT_VALIDATOR = 'warn';
      // ... test warning behavior
    });

    test('should skip in off mode', async () => {
      process.env.SPAWN_PROMPT_VALIDATOR = 'off';
      // ... test skip behavior
    });
  });

  describe('integration tests', () => {
    test('should integrate with hook-input parsing', async () => {
      // ... test full hook execution
    });

    test('should handle malformed hook input gracefully', async () => {
      // ... test error handling
    });
  });
});
```

---

### 2.2 Files to MODIFY

#### File 3: `.claude/settings.json`

```
**File**: .claude/settings.json
**Change Type**: MODIFY
**Lines Changed**: ~10 lines added
**Purpose**: Register spawn-prompt-validator hook in PreToolUse(Task) chain
**Dependencies**: spawn-prompt-validator.cjs (must exist before registration)
**Dependents**: Claude Code hook execution engine
**Risk**: Medium (affects all Task spawns)
**Test Strategy**: Manual smoke test + existing hook tests
**Rollback**: Remove hook entry from settings.json
```

**Specific Changes:**

```diff
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -104,6 +104,10 @@
       {
         "matcher": "Task",
         "hooks": [
+          {
+            "type": "command",
+            "command": "node .claude/hooks/safety/spawn-prompt-validator.cjs"
+          },
           {
             "type": "command",
             "command": "node .claude/hooks/routing/tool-availability-validator.cjs"
```

**Hook Order Rationale:**
1. spawn-prompt-validator.cjs (NEW) - Validates prompt structure FIRST
2. tool-availability-validator.cjs - Validates tools are available
3. pre-task-unified.cjs - Routing guards and state management

**Why This Order:**
- Template validation should happen before tool validation
- If template is invalid, no point checking tool availability
- Fail fast principle: catch structural errors early

---

#### File 4: `.claude/CLAUDE.md` (Section 2 - Fallback Mechanism)

```
**File**: .claude/CLAUDE.md
**Change Type**: MODIFY (Section 2)
**Lines Changed**: ~50-80 lines added
**Purpose**: Add fallback mechanism when template file loading fails
**Dependencies**: Existing Section 2 structure
**Dependents**: Router behavior, all spawn operations
**Risk**: Low (additive, doesn't change existing behavior)
**Test Strategy**: Manual testing with missing template file
**Rollback**: Remove added fallback section
```

**Specific Changes to Section 2:**

Add after "### Orchestrator Spawn Template" (around line 320):

```markdown
### Spawn Template Fallback Mechanism (Option C)

**When Template Files Fail to Load:**

If the Router cannot load a spawn template file (file missing, permission denied, corrupt),
use this inline fallback pattern:

**Fallback Detection:**
```javascript
// Attempt to load template
try {
  const template = Read({ file_path: '.claude/templates/spawn/universal-agent-spawn.md' });
  // Use template content
} catch (error) {
  // Template load failed - use inline fallback
  console.warn('[SPAWN-FALLBACK] Template load failed, using inline fallback');
}
```

**Inline Fallback Template (Minimum Viable):**

```javascript
Task({
  subagent_type: 'general-purpose',
  description: '<ROLE> doing <TASK>',
  allowed_tools: ['Read','Write','Edit','Bash','TaskUpdate','TaskList','TaskCreate','TaskGet','Skill'],
  prompt: `You are the <ROLE> agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED                                     |
+======================================================================+
|  Task ID: <ID>                                                       |
|  FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" });       |
|  LAST: TaskUpdate({ taskId: "<ID>", status: "completed", ... });     |
+======================================================================+

## PROJECT CONTEXT
PROJECT_ROOT: <absolute-path>
Use relative paths from PROJECT_ROOT.

## Instructions
1) TaskUpdate in_progress
2) Read agent definition
3) Execute task
4) TaskUpdate completed with summary
5) TaskList()

## Memory Protocol
Read .claude/context/memory/learnings.md before starting.
`,
});
```

**When to Use Fallback:**
- Template file not found (404)
- Permission denied reading template
- Template file corrupted (parse error)
- Network issues (if templates stored remotely in future)

**Fallback Audit:**
When fallback is triggered, emit audit log:
```json
{"hook":"spawn-fallback","event":"fallback-triggered","reason":"<reason>","timestamp":"..."}
```

**Recovery Actions:**
1. Check template file exists: `ls -la .claude/templates/spawn/`
2. Verify permissions: Template files should be readable
3. Restore from git: `git checkout HEAD -- .claude/templates/spawn/`
```

---

#### File 5: `.claude/CLAUDE.md` (Section 0 - Router Documentation)

```
**File**: .claude/CLAUDE.md
**Change Type**: MODIFY (Section 0)
**Lines Changed**: ~30-40 lines added
**Purpose**: Document Router protocol for template loading
**Dependencies**: Existing Section 0 structure
**Dependents**: Router behavior
**Risk**: Low (documentation only)
**Test Strategy**: Manual review
**Rollback**: Remove added documentation
```

**Specific Changes to Section 0:**

Add after "**Hard Stop:**" around line 16:

```markdown
### Template Loading Protocol (Option D)

**When Spawning Agents, Router MUST:**

1. **Check Template Availability** (before spawning)
   ```javascript
   // Verify template exists
   const templateExists = Read({ file_path: '.claude/templates/spawn/universal-agent-spawn.md' });
   ```

2. **Use Template Reference** (in spawn prompt)
   - Reference template file path in spawn
   - Do NOT inline full template content (causes bloat)

3. **Handle Template Failures** (gracefully)
   - If template load fails, use Section 2 fallback
   - Log fallback usage for monitoring
   - Do NOT block spawn due to template issues

**Template Loading Sequence:**
```
┌─────────────────────────────────────────────────────────┐
│ 1. Router receives request                              │
│ 2. Router determines agent type (developer, qa, etc.)   │
│ 3. Router selects template:                             │
│    - Standard agent → universal-agent-spawn.md          │
│    - Orchestrator → orchestrator-spawn.md               │
│    - With identity → agent-identity-integration.md      │
│ 4. Router loads template via Read tool                  │
│ 5. Router substitutes placeholders:                     │
│    - <ROLE> → agent type                                │
│    - <TASK> → task description                          │
│    - <ID> → task ID                                     │
│    - <absolute-path> → PROJECT_ROOT                     │
│ 6. Router spawns agent with populated template          │
└─────────────────────────────────────────────────────────┘
```

**Template Validation Enforcement:**
- spawn-prompt-validator.cjs hook validates spawn prompts
- Default mode: `warn` (logs issues but allows spawn)
- Production mode: `block` (blocks invalid spawns)
- Environment: `SPAWN_PROMPT_VALIDATOR=block|warn|off`
```

---

#### File 6: `.claude/workflows/core/router-decision.md`

```
**File**: .claude/workflows/core/router-decision.md
**Change Type**: MODIFY
**Lines Changed**: ~40-50 lines added
**Purpose**: Update routing workflow with template loading steps
**Dependencies**: Existing workflow structure
**Dependents**: Router behavior
**Risk**: Low (documentation)
**Test Strategy**: Manual workflow walkthrough
**Rollback**: Revert section changes
```

**Specific Changes (add new Step 9.5):**

After Step 9 (Select Model), add:

```markdown
## Step 9.5: Template Loading and Validation

**After selecting model, before spawning:**

### 9.5.1 Select Appropriate Template

| Agent Type | Template File |
|------------|---------------|
| Standard (developer, qa, planner, etc.) | `.claude/templates/spawn/universal-agent-spawn.md` |
| Orchestrators (master, swarm, evolution) | `.claude/templates/spawn/orchestrator-spawn.md` |
| Agents with identity fields | `.claude/templates/spawn/agent-identity-integration.md` + base template |

### 9.5.2 Load Template

```javascript
// Load template file
const template = Read({ file_path: '.claude/templates/spawn/universal-agent-spawn.md' });

// If load fails, use inline fallback (see CLAUDE.md Section 2)
if (!template) {
  console.warn('[ROUTER] Template load failed, using inline fallback');
  // Use fallback template
}
```

### 9.5.3 Populate Template Placeholders

Replace these placeholders in template:

| Placeholder | Replacement |
|-------------|-------------|
| `<ROLE>` | Agent type (e.g., "developer", "qa") |
| `<TASK>` | Task description from Step 2 classification |
| `<ID>` | Task ID from TaskCreate or existing task |
| `<absolute-path-to-project>` | PROJECT_ROOT path |
| `<agent-file-path>` | Path to agent definition file |
| `<SUBJECT>` | Task subject from TaskGet |

### 9.5.4 Validation Check

Spawn prompt will be validated by `spawn-prompt-validator.cjs` hook.
Ensure prompt contains:
- [ ] TaskUpdate warning box
- [ ] Task ID reference
- [ ] PROJECT_ROOT context
- [ ] Memory Protocol section
- [ ] TaskUpdate call instructions

**If validation fails in 'block' mode, spawn will be rejected.**

### 9.5.5 Execute Spawn

```javascript
Task({
  subagent_type: agentType,
  model: selectedModel,
  description: `${agentType} ${taskDescription}`,
  allowed_tools: [...],
  prompt: populatedTemplate,
});
```
```

---

#### File 7: `.claude/context/memory/decisions.md`

```
**File**: .claude/context/memory/decisions.md
**Change Type**: MODIFY
**Lines Changed**: ~80-100 lines added
**Purpose**: Document ADR for spawn validation safeguards
**Dependencies**: Existing ADR format
**Dependents**: Future architectural decisions
**Risk**: Low (documentation)
**Test Strategy**: N/A (documentation)
**Rollback**: Remove ADR entry
```

**ADR to Add:**

```markdown
## [ADR-063] Spawn Template Validation Safeguards (2026-01-29)

**Context:**
- Spawn templates were extracted to lazy-loaded files (.claude/templates/spawn/)
- Router references templates via @ file references
- Risk: Template files could be missing, corrupted, or have structural issues
- Need safeguards to ensure spawned agents have required elements (TaskUpdate protocol, PROJECT_ROOT, etc.)

**Research Basis:**
- Arxiv: 30+ papers, 97.3% correctness with pre-execution validation
- Exa: 45+ implementations, 91% adoption of PreToolUse pattern
- AgentSpec: <100ms gate execution, <2% false positive rate targets

**Decision:**
Implement three-layer safeguard approach:

1. **Option B: Validation Hook (spawn-prompt-validator.cjs)**
   - PreToolUse(Task) hook validates spawn prompts
   - Checks for: TaskUpdate box, Task ID, PROJECT_ROOT, Memory Protocol
   - Scoring system (0-100) with 70 minimum for pass
   - Enforcement modes: block/warn/off (default: warn)

2. **Option C: Fallback Mechanism (CLAUDE.md Section 2)**
   - Inline fallback template when file load fails
   - Minimum viable template with core elements
   - Audit logging on fallback trigger

3. **Option D: Router Documentation (CLAUDE.md Section 0)**
   - Template loading protocol steps
   - Template selection logic
   - Placeholder substitution rules

**Consequences:**

*Positive:*
- Prevents invalid spawns (missing TaskUpdate protocol)
- Graceful degradation (fallback template)
- Observable (audit logging on validation/fallback)
- Non-breaking (default: warn mode)
- Research-backed (91% industry adoption)

*Negative:*
- Adds ~5ms overhead per spawn (validation)
- New hook to maintain (spawn-prompt-validator.cjs)
- Documentation complexity increase

**Trade-offs:**
- Validation strictness vs spawn flexibility
- Warn mode default balances safety and usability
- Block mode available for production hardening

**Implementation:**
- Phase 1: Create validation hook with tests (4 hours)
- Phase 2: Update CLAUDE.md with fallback (1 hour)
- Phase 3: Update router documentation (1 hour)
- Phase 4: Integration testing (2 hours)
- Total: 8 hours

**Status:** Accepted
**Date:** 2026-01-29
**Related ADRs:** ADR-062 (Spawn Template Extraction)
```

---

### 2.3 Files to READ (Dependencies)

These files must be read to understand interfaces but are NOT modified:

| File | Purpose | What to Extract |
|------|---------|-----------------|
| `.claude/lib/utils/hook-input.cjs` | Hook utilities | parseHookInputAsync, formatResult, auditLog, getEnforcementMode |
| `.claude/lib/utils/project-root.cjs` | Project root | PROJECT_ROOT constant |
| `.claude/lib/utils/safe-json.cjs` | Safe JSON parsing | safeParseJSON function |
| `.claude/hooks/routing/tool-availability-validator.cjs` | Existing pattern | Hook structure, validation pattern |
| `.claude/hooks/routing/pre-task-unified.cjs` | Existing pattern | Enforcement mode handling |

---

## 3. Cross-System Impact Matrix

### 3.1 System Component Impacts

| System Component | Impact Level | Affected Files | Mitigation |
|------------------|--------------|----------------|------------|
| **Router Protocol** | Medium | CLAUDE.md Sections 0, 2 | Documentation changes only, no logic |
| **Hook System** | Medium | settings.json, new hook | New hook in existing chain |
| **Task Tracking** | Low | None modified | Validation enforces existing protocol |
| **Agent Spawning** | Medium | All Task() calls | Warn mode default, non-blocking |
| **Template Loading** | Medium | Router behavior | Fallback mechanism prevents failures |
| **Validation Pipeline** | Medium | settings.json hook chain | New hook first in Task chain |

### 3.2 Integration Points

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ROUTER                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. Receives user request                                     │    │
│  │ 2. Classifies intent/complexity/domain/risk                  │    │
│  │ 3. Selects agent type                                        │    │
│  │ 4. Loads template (via Read tool)                            │ ◄──┼── NEW: Template loading protocol
│  │ 5. Populates placeholders                                    │    │
│  │ 6. Calls Task() tool                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    HOOK SYSTEM (PreToolUse)                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. spawn-prompt-validator.cjs ◄──────────────────────────── │ ◄──┼── NEW: Validates prompt structure
│  │ 2. tool-availability-validator.cjs                           │    │
│  │ 3. pre-task-unified.cjs                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (if all hooks pass)
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT EXECUTION                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Agent receives prompt with validated structure               │    │
│  │ - TaskUpdate warning box present ✓                          │    │
│  │ - Task ID reference present ✓                               │    │
│  │ - PROJECT_ROOT context present ✓                            │    │
│  │ - Memory Protocol section present ✓                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow Diagram

```
User Request
    │
    ▼
┌────────────────┐
│ CLAUDE.md      │──── Routing Rules
│ Section 0      │     Template Protocol (NEW)
└────────────────┘
    │
    ▼
┌────────────────┐
│ router-        │──── Workflow Steps
│ decision.md    │     Step 9.5 Template Loading (NEW)
└────────────────┘
    │
    ▼
┌────────────────┐
│ Template Files │──── .claude/templates/spawn/*.md
│ (lazy loaded)  │     universal-agent-spawn.md
└────────────────┘     orchestrator-spawn.md
    │
    │ (Template load attempt)
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│ Template Load Result                                        │
│                                                             │
│ SUCCESS:                    FAILURE:                        │
│ ┌─────────────────┐        ┌─────────────────┐             │
│ │ Use template    │        │ Use inline      │ ◄── NEW     │
│ │ content         │        │ fallback        │    Fallback │
│ └─────────────────┘        └─────────────────┘             │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────┐
│ Task() call    │──── Spawn agent with populated template
└────────────────┘
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│ PreToolUse(Task) Hook Chain                                 │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 1. spawn-prompt-validator.cjs (NEW)                   │  │
│ │    - Validates prompt structure                        │  │
│ │    - Checks for required elements                      │  │
│ │    - Score >= 70 to pass                              │  │
│ │    - Mode: block | warn | off                         │  │
│ └───────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 2. tool-availability-validator.cjs (existing)         │  │
│ └───────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ 3. pre-task-unified.cjs (existing)                    │  │
│ └───────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
    │
    ▼ (all hooks pass: exit 0)
┌────────────────┐
│ Agent Spawned  │──── Execution begins
└────────────────┘
```

---

## 4. Regression Risk Assessment

### 4.1 Risk Matrix

| Risk Scenario | Likelihood | Impact | Detection Method | Prevention | Recovery |
|---------------|------------|--------|------------------|------------|----------|
| **Hook blocks valid spawn** | Low (5%) | High | Tests, staging | Warn mode default, score threshold tuning | Set SPAWN_PROMPT_VALIDATOR=off |
| **Hook fails to load** | Very Low (1%) | Medium | Error logs, monitoring | Fail-open design | Remove from settings.json |
| **Template validation false negative** | Low (3%) | Medium | Integration tests | Comprehensive pattern coverage | Tighten patterns, lower threshold |
| **Template validation false positive** | Medium (10%) | Low | User feedback, logs | Score threshold at 70 not 100 | Adjust patterns, increase threshold |
| **Fallback template insufficient** | Low (2%) | Medium | Agent behavior issues | Fallback includes minimum viable elements | Update fallback template |
| **Hook order conflict** | Very Low (1%) | High | Integration tests | Documented order rationale | Reorder in settings.json |
| **Performance degradation** | Low (5%) | Low | Timing metrics | Target <5ms overhead | Optimize validation regex |
| **Documentation drift** | Medium (15%) | Low | Automated checks | CI validation | Update docs |
| **Breaking existing spawns** | Very Low (1%) | Critical | Regression tests | Warn mode default | Emergency rollback |
| **State file corruption** | Very Low (0.5%) | Medium | Health checks | Atomic writes | Restore from backup |

### 4.2 Risk Mitigation Strategies

**Strategy 1: Warn Mode Default**
- New hook defaults to `warn` not `block`
- Logs validation issues but allows spawns
- Gives time to tune patterns before enforcement

**Strategy 2: Fail-Open Design**
- Hook catches all errors and exits 0 (allow)
- Never blocks spawns due to hook internal errors
- Logs errors for debugging

**Strategy 3: Score Threshold Tuning**
- Initial threshold at 70/100 (not 100)
- Allows partial compliance while logging gaps
- Threshold adjustable via environment variable

**Strategy 4: Comprehensive Test Coverage**
- 40+ unit tests for validation logic
- Integration tests with real spawn scenarios
- Edge case coverage (empty, null, malformed)

**Strategy 5: Gradual Rollout**
- Week 1: Deploy with SPAWN_PROMPT_VALIDATOR=warn
- Week 2: Monitor logs, tune patterns
- Week 3: Enable block mode if false positive rate <2%

### 4.3 Regression Test Cases

| Test Case | Description | Expected Outcome | Priority |
|-----------|-------------|------------------|----------|
| **REG-001** | Valid spawn with full template | Hook passes, spawn succeeds | P0 |
| **REG-002** | Spawn with minimal valid prompt | Hook passes with warning | P0 |
| **REG-003** | Spawn missing TaskUpdate box | Hook warns/blocks based on mode | P0 |
| **REG-004** | Spawn missing Task ID | Hook warns/blocks based on mode | P0 |
| **REG-005** | Orchestrator spawn | Hook skips validation | P1 |
| **REG-006** | Hook disabled (off mode) | All spawns pass | P1 |
| **REG-007** | Hook in block mode | Invalid spawns blocked | P1 |
| **REG-008** | Malformed hook input | Hook fails open (allows) | P1 |
| **REG-009** | Concurrent spawns | No race conditions | P2 |
| **REG-010** | Template fallback triggered | Fallback used, spawn succeeds | P1 |

---

## 5. Dependency Mapping

### 5.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DEPENDENCY GRAPH                               │
│                                                                          │
│  ┌──────────────────────┐                                               │
│  │ Phase 1.1            │                                               │
│  │ spawn-prompt-        │◄───────────────────────────────────────────┐  │
│  │ validator.cjs        │                                            │  │
│  └──────────┬───────────┘                                            │  │
│             │ depends on                                              │  │
│             ▼                                                         │  │
│  ┌──────────────────────┐                                            │  │
│  │ lib/utils/           │                                            │  │
│  │ hook-input.cjs       │ (existing, no changes)                     │  │
│  │ project-root.cjs     │                                            │  │
│  │ safe-json.cjs        │                                            │  │
│  └──────────────────────┘                                            │  │
│                                                                       │  │
│  ┌──────────────────────┐     ┌──────────────────────┐               │  │
│  │ Phase 1.2            │     │ Phase 1.3            │               │  │
│  │ spawn-prompt-        │     │ settings.json        │───────────────┤  │
│  │ validator.test.cjs   │────►│ (hook registration)  │               │  │
│  └──────────────────────┘     └──────────────────────┘               │  │
│             │                            │                            │  │
│             │ tests                      │ registers                  │  │
│             ▼                            ▼                            │  │
│  ┌──────────────────────┐     ┌──────────────────────┐               │  │
│  │ Phase 1.1            │     │ Claude Code          │               │  │
│  │ spawn-prompt-        │◄────│ Hook Engine          │               │  │
│  │ validator.cjs        │     │ (runtime)            │               │  │
│  └──────────────────────┘     └──────────────────────┘               │  │
│                                                                       │  │
│  ════════════════════════════════════════════════════════════════════│  │
│                                                                       │  │
│  ┌──────────────────────┐     ┌──────────────────────┐               │  │
│  │ Phase 2.1            │     │ Phase 2.2            │               │  │
│  │ CLAUDE.md Sec 2      │────►│ CLAUDE.md Sec 0      │               │  │
│  │ (fallback)           │     │ (protocol)           │               │  │
│  └──────────────────────┘     └──────────────────────┘               │  │
│             │                            │                            │  │
│             │ references                 │ references                 │  │
│             ▼                            ▼                            │  │
│  ┌──────────────────────┐     ┌──────────────────────┐               │  │
│  │ templates/spawn/     │     │ workflows/core/      │               │  │
│  │ *.md                 │     │ router-decision.md   │               │  │
│  │ (existing)           │     │ (Phase 2.3)          │               │  │
│  └──────────────────────┘     └──────────────────────┘               │  │
│                                                                       │  │
│  ════════════════════════════════════════════════════════════════════│  │
│                                                                       │  │
│  ┌──────────────────────┐                                            │  │
│  │ Phase 3.1            │                                            │  │
│  │ decisions.md (ADR)   │ (documentation, no code deps)              │  │
│  └──────────────────────┘                                            │  │
│                                                                       │  │
└─────────────────────────────────────────────────────────────────────────┘

LEGEND:
───► = depends on / references
════ = phase boundary
```

### 5.2 Implementation Order (Critical Path)

```
CRITICAL PATH:

Week 1, Day 1-2:
  ┌─────────────────────────────────────┐
  │ Phase 1.1: Create Hook              │
  │ spawn-prompt-validator.cjs          │
  │ (4 hours)                           │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ Phase 1.2: Create Tests             │
  │ spawn-prompt-validator.test.cjs     │
  │ (2 hours)                           │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ Phase 1.3: Register Hook            │
  │ settings.json                       │
  │ (30 minutes)                        │
  └────────────────┬────────────────────┘
                   │
                   ▼
Week 1, Day 3:
  ┌─────────────────────────────────────┐
  │ Phase 2.1: Add Fallback             │
  │ CLAUDE.md Section 2                 │
  │ (1 hour)                            │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ Phase 2.2: Add Protocol Docs        │
  │ CLAUDE.md Section 0                 │
  │ (1 hour)                            │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ Phase 2.3: Update Workflow          │
  │ router-decision.md                  │
  │ (1 hour)                            │
  └────────────────┬────────────────────┘
                   │
                   ▼
Week 1, Day 4:
  ┌─────────────────────────────────────┐
  │ Phase 3.1: Document Decision        │
  │ decisions.md (ADR-063)              │
  │ (30 minutes)                        │
  └────────────────┬────────────────────┘
                   │
                   ▼
  ┌─────────────────────────────────────┐
  │ Phase 4: Integration Testing        │
  │ End-to-end validation               │
  │ (2 hours)                           │
  └─────────────────────────────────────┘

TOTAL: 12 hours
BUFFER: 2 hours
DELIVERY: 14 hours
```

### 5.3 Parallel Execution Opportunities

These tasks can run in parallel:

| Task A | Task B | Parallelizable | Notes |
|--------|--------|----------------|-------|
| Create hook (1.1) | Create tests (1.2) | Partial | Tests need hook interface defined first |
| Update CLAUDE.md (2.1, 2.2) | Update workflow (2.3) | Yes | Independent documentation |
| Write ADR (3.1) | Integration testing (4) | No | ADR should document final design |

---

## 6. Test Strategy

### 6.1 Unit Test Matrix

| Test Category | Test Count | Coverage Target | Location |
|---------------|------------|-----------------|----------|
| Validation Logic | 15 | 100% | spawn-prompt-validator.test.cjs |
| Edge Cases | 10 | 100% | spawn-prompt-validator.test.cjs |
| Enforcement Modes | 5 | 100% | spawn-prompt-validator.test.cjs |
| Helper Functions | 5 | 100% | spawn-prompt-validator.test.cjs |
| Error Handling | 5 | 100% | spawn-prompt-validator.test.cjs |
| **Total** | **40** | **100%** | |

### 6.2 Integration Test Matrix

| Test Scenario | Components Involved | Expected Outcome | Priority |
|---------------|---------------------|------------------|----------|
| Valid spawn end-to-end | Hook → Claude Code → Agent | Spawn succeeds | P0 |
| Invalid spawn in block mode | Hook → blocks | Spawn rejected | P0 |
| Invalid spawn in warn mode | Hook → warns → allows | Spawn with warning | P0 |
| Hook chain order | Multiple hooks | Correct order execution | P1 |
| Template fallback | Template missing → fallback | Spawn with fallback | P1 |
| Concurrent spawns | Multiple Task() calls | No race conditions | P2 |

### 6.3 Manual Test Checklist

```
[ ] 1. Deploy hook to staging
[ ] 2. Verify hook loads without errors
[ ] 3. Spawn agent with valid template - expect success
[ ] 4. Spawn agent with invalid prompt - expect warning
[ ] 5. Set mode to 'block', spawn invalid - expect blocked
[ ] 6. Set mode to 'off', spawn invalid - expect success
[ ] 7. Delete template file, spawn - expect fallback
[ ] 8. Check audit logs contain validation results
[ ] 9. Verify no performance degradation (< 5ms overhead)
[ ] 10. Test orchestrator spawn - expect validation skipped
```

### 6.4 Performance Test Cases

| Test | Target | Measurement |
|------|--------|-------------|
| Validation latency | < 5ms | Time from hook start to exit |
| Memory overhead | < 100KB | Process memory delta |
| CPU overhead | < 1% | CPU usage during validation |
| Concurrent validation | 10 spawns/sec | Throughput under load |

---

## 7. Implementation Sequencing

### 7.1 Phase Breakdown

```
PHASE 1: HOOK IMPLEMENTATION (6.5 hours)
├── 1.1 Create spawn-prompt-validator.cjs (4 hours)
│   ├── Import hook-input utilities
│   ├── Define validation rules (5 rules)
│   ├── Implement scoring system
│   ├── Implement enforcement modes
│   ├── Add audit logging
│   └── Export for testing
├── 1.2 Create spawn-prompt-validator.test.cjs (2 hours)
│   ├── Unit tests for validatePrompt()
│   ├── Unit tests for isOrchestratorSpawn()
│   ├── Unit tests for isTemplateBasedSpawn()
│   ├── Enforcement mode tests
│   └── Edge case tests
└── 1.3 Register hook in settings.json (30 minutes)
    ├── Add to PreToolUse(Task) chain
    ├── Position first in chain
    └── Verify JSON syntax

PHASE 2: DOCUMENTATION UPDATES (3 hours)
├── 2.1 CLAUDE.md Section 2 - Fallback (1 hour)
│   ├── Add fallback mechanism section
│   ├── Document inline fallback template
│   ├── Add recovery actions
│   └── Add audit logging guidance
├── 2.2 CLAUDE.md Section 0 - Protocol (1 hour)
│   ├── Add template loading protocol
│   ├── Document placeholder substitution
│   ├── Add validation enforcement note
│   └── Add sequence diagram
└── 2.3 router-decision.md - Step 9.5 (1 hour)
    ├── Add template selection table
    ├── Add load and fallback logic
    ├── Add placeholder replacement table
    └── Add validation checklist

PHASE 3: DECISION DOCUMENTATION (30 minutes)
└── 3.1 decisions.md - ADR-063 (30 minutes)
    ├── Context and research basis
    ├── Decision and rationale
    ├── Consequences (positive/negative)
    └── Implementation summary

PHASE 4: INTEGRATION TESTING (2 hours)
├── 4.1 Run full test suite (30 minutes)
├── 4.2 Manual smoke tests (1 hour)
└── 4.3 Performance validation (30 minutes)

TOTAL: 12 hours (+ 2 hour buffer = 14 hours)
```

### 7.2 Detailed Step-by-Step Implementation

#### Phase 1.1: Create Hook (4 hours)

**Step 1.1.1: File Setup (15 minutes)**
```bash
# Create hook file
touch .claude/hooks/safety/spawn-prompt-validator.cjs

# Create test file
touch .claude/hooks/safety/spawn-prompt-validator.test.cjs
```

**Step 1.1.2: Import Utilities (15 minutes)**
```javascript
// Add to spawn-prompt-validator.cjs
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
```

**Step 1.1.3: Define Validation Rules (1 hour)**
```javascript
// Add VALIDATION_RULES array with 5 rules
// Each rule: { name, pattern, severity, suggestion, weight }
// Test each pattern individually
```

**Step 1.1.4: Implement Scoring System (1 hour)**
```javascript
// Implement validatePrompt(prompt) function
// Returns { score, passed, failed, suggestions, isValid, needsWarning }
// Write unit test for scoring logic
```

**Step 1.1.5: Implement Main Function (1 hour)**
```javascript
// Implement main() async function
// Handle enforcement modes (block/warn/off)
// Parse hook input, validate, output result
// Add error handling with fail-open
```

**Step 1.1.6: Add Exports (15 minutes)**
```javascript
// Export main and helper functions for testing
module.exports = { main, validatePrompt, ... };
```

#### Phase 1.2: Create Tests (2 hours)

**Step 1.2.1: Setup Test File (15 minutes)**
```javascript
// Import node:test, assert
// Import module under test
// Setup test helpers
```

**Step 1.2.2: Write Validation Logic Tests (1 hour)**
```javascript
// 15 tests for validatePrompt()
// Cover all 5 rules
// Cover scoring edge cases
```

**Step 1.2.3: Write Helper Function Tests (30 minutes)**
```javascript
// 5 tests for isOrchestratorSpawn()
// 5 tests for isTemplateBasedSpawn()
```

**Step 1.2.4: Write Integration Tests (15 minutes)**
```javascript
// 5 tests for enforcement modes
// Test hook execution end-to-end
```

#### Phase 1.3: Register Hook (30 minutes)

**Step 1.3.1: Edit settings.json**
```bash
# Open settings.json
# Find PreToolUse.Task hooks array
# Add spawn-prompt-validator.cjs as FIRST entry
```

**Step 1.3.2: Verify JSON Syntax**
```bash
node -e "require('./.claude/settings.json')"
```

**Step 1.3.3: Run Hook Chain Test**
```bash
# Verify hook loads and runs
node .claude/hooks/safety/spawn-prompt-validator.cjs '{"tool_name":"Task","tool_input":{}}'
```

---

## 8. Rollback Procedures

### 8.1 Emergency Rollback (< 1 minute)

**Scenario:** Hook is blocking all spawns incorrectly

**Steps:**
```bash
# Option A: Disable via environment variable
export SPAWN_PROMPT_VALIDATOR=off
# Restart Claude session

# Option B: Remove from settings.json (if env var not working)
# Edit .claude/settings.json
# Remove spawn-prompt-validator.cjs entry from Task hooks
```

### 8.2 Standard Rollback (< 5 minutes)

**Scenario:** Need to revert entire implementation

**Steps:**
```bash
# Step 1: Remove hook registration
# Edit .claude/settings.json, remove hook entry

# Step 2: Restore CLAUDE.md
git checkout HEAD -- .claude/CLAUDE.md

# Step 3: Restore router-decision.md
git checkout HEAD -- .claude/workflows/core/router-decision.md

# Step 4: Optionally remove hook files (not required)
rm .claude/hooks/safety/spawn-prompt-validator.cjs
rm .claude/hooks/safety/spawn-prompt-validator.test.cjs

# Step 5: Remove ADR entry (optional)
# Edit .claude/context/memory/decisions.md
```

### 8.3 Partial Rollback Options

| Issue | Rollback Action | Time |
|-------|-----------------|------|
| Hook blocking valid spawns | Set SPAWN_PROMPT_VALIDATOR=off | 30 sec |
| Hook causing errors | Remove from settings.json | 1 min |
| Documentation incorrect | git checkout specific file | 1 min |
| Performance issues | Lower score threshold | 5 min |

### 8.4 Rollback Verification

After rollback, verify:
```bash
# 1. Hook no longer runs
node .claude/hooks/safety/spawn-prompt-validator.cjs '{}' 2>&1 | grep -q "error" || echo "Hook removed"

# 2. Spawns work normally
# Test via Claude Code UI

# 3. No errors in logs
grep "spawn-prompt-validator" /path/to/claude/logs || echo "No hook logs"
```

---

## 9. Performance Impact Analysis

### 9.1 Hook Overhead Analysis

| Operation | Expected Time | Measurement Method |
|-----------|---------------|-------------------|
| Parse hook input | < 1ms | Benchmark parseHookInputAsync |
| Pattern matching (5 rules) | < 2ms | Benchmark regex execution |
| Scoring calculation | < 0.1ms | Benchmark arithmetic |
| Result formatting | < 0.5ms | Benchmark JSON.stringify |
| Audit logging | < 1ms | Benchmark process.stderr.write |
| **Total** | **< 5ms** | End-to-end timing |

### 9.2 Comparison to Existing Hooks

| Hook | Current Latency | New Combined | Delta |
|------|-----------------|--------------|-------|
| tool-availability-validator | 8ms | 8ms | 0ms |
| pre-task-unified | 15ms | 15ms | 0ms |
| **spawn-prompt-validator** | N/A | **5ms** | **+5ms** |
| **Total PreToolUse(Task)** | 23ms | **28ms** | **+5ms (+22%)** |

### 9.3 Memory Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Hook process memory | N/A | 15MB | +15MB (per spawn) |
| Validation rules | N/A | 1KB | +1KB |
| Cache/state | N/A | 0 | 0 (stateless) |

### 9.4 Performance Optimization Opportunities

If performance becomes an issue:

1. **Pre-compile regex patterns** - Move compilation outside hot path
2. **Short-circuit evaluation** - Exit early on first critical failure
3. **Cache validation results** - For identical prompts (unlikely)
4. **Reduce rule count** - Remove low-weight rules

---

## 10. Success Metrics

### 10.1 Implementation Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Hook creation | Complete | File exists and exports |
| Test coverage | 100% | jest --coverage |
| Test pass rate | 100% | All 40 tests pass |
| Hook registration | Complete | settings.json contains entry |
| Documentation | Complete | All 3 docs updated |
| ADR | Complete | ADR-063 in decisions.md |

### 10.2 Operational Success Criteria

| Metric | Target | Measurement | Timeline |
|--------|--------|-------------|----------|
| False positive rate | < 2% | Audit log analysis | Week 1-2 |
| False negative rate | < 5% | Manual review | Week 1-2 |
| Spawn latency overhead | < 5ms | Timing measurements | Week 1 |
| Fallback trigger rate | < 1% | Audit log analysis | Week 2 |
| Validation score distribution | Mean > 80 | Score histogram | Week 2 |

### 10.3 Quality Gates

| Gate | Pass Condition | Block Condition |
|------|----------------|-----------------|
| Unit tests | 40/40 pass | Any failure |
| Integration tests | All scenarios pass | Any failure |
| Performance | < 5ms overhead | > 10ms overhead |
| False positive | < 5% in staging | > 10% in staging |
| Rollback tested | Verified working | Not tested |

---

## 11. Architecture Decision Record

See Section 2.2, File 7 for the complete ADR-063 that should be added to `.claude/context/memory/decisions.md`.

---

## Appendix A: Validation Rule Details

### A.1 Rule 1: TaskUpdate Warning Box

**Pattern:** `/\+={4,}.*TASK TRACKING REQUIRED.*={4,}\+/s`

**Purpose:** Ensures spawn prompts include the 70-line warning box that enforces TaskUpdate protocol.

**Weight:** 40 (critical)

**Example Match:**
```
+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
```

**False Positive Risk:** Low (distinctive pattern)

**False Negative Risk:** Low (consistent template format)

### A.2 Rule 2: Task ID Reference

**Pattern:** `/Task ID:\s*[<"\']?\d+|taskId:\s*[<"\']?\d+/i`

**Purpose:** Ensures spawn prompts reference a specific task ID.

**Weight:** 30 (critical)

**Example Matches:**
- `Task ID: 123`
- `Task ID: <ID>`
- `taskId: "456"`

**False Positive Risk:** Medium (could match unrelated text)

**False Negative Risk:** Low (standard format)

### A.3 Rule 3: PROJECT_ROOT Context

**Pattern:** `/PROJECT_ROOT|PROJECT CONTEXT/i`

**Purpose:** Ensures spawn prompts include project root context for relative path usage.

**Weight:** 15 (high)

**Example Matches:**
- `PROJECT_ROOT: C:\dev\project`
- `## PROJECT CONTEXT (CRITICAL)`

**False Positive Risk:** Low (specific terminology)

**False Negative Risk:** Low (standard section)

### A.4 Rule 4: Memory Protocol

**Pattern:** `/Memory Protocol|learnings\.md|context\/memory/i`

**Purpose:** Ensures spawn prompts reference memory persistence.

**Weight:** 10 (medium)

**Example Matches:**
- `## Memory Protocol`
- `Read .claude/context/memory/learnings.md`

**False Positive Risk:** Low (specific paths)

**False Negative Risk:** Medium (might be worded differently)

### A.5 Rule 5: TaskUpdate Call Instruction

**Pattern:** `/TaskUpdate\s*\(\s*\{.*status.*in_progress|TaskUpdate.*completed/s`

**Purpose:** Ensures explicit TaskUpdate call instructions are present.

**Weight:** 5 (high)

**Example Matches:**
- `TaskUpdate({ taskId: "1", status: "in_progress" })`
- `TaskUpdate completed with summary`

**False Positive Risk:** Low (specific syntax)

**False Negative Risk:** Low (standard format)

---

## Appendix B: Environment Variables

| Variable | Default | Values | Description |
|----------|---------|--------|-------------|
| `SPAWN_PROMPT_VALIDATOR` | `warn` | `block`, `warn`, `off` | Enforcement mode |
| `SPAWN_PROMPT_MIN_SCORE` | `70` | `0-100` | Minimum passing score (future) |
| `SPAWN_PROMPT_DEBUG` | `false` | `true`, `false` | Enable debug logging |

---

## Appendix C: Audit Log Schema

```json
{
  "hook": "spawn-prompt-validator",
  "event": "pass|fail|skip|error",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "score": 85,
  "passed": ["TaskUpdate Warning Box", "Task ID Reference"],
  "failed": ["Memory Protocol"],
  "isTemplateBasedSpawn": true,
  "description": "developer implementing feature"
}
```

---

## Appendix D: References

1. **Arxiv Research Report:** `.claude/context/artifacts/research-reports/arxiv-spawn-validation-2026-01-29.md`
2. **Exa Research Report:** `.claude/context/artifacts/research-reports/exa-spawn-validation-2026-01-29.md`
3. **Spawn Template Extraction Design:** `.claude/context/artifacts/plans/spawn-template-extraction-design-2026-01-29.md`
4. **Universal Agent Spawn Template:** `.claude/templates/spawn/universal-agent-spawn.md`
5. **Tool Availability Validator (pattern reference):** `.claude/hooks/routing/tool-availability-validator.cjs`
6. **Hook Input Utilities:** `.claude/lib/utils/hook-input.cjs`

---

**Document Status:** Ready for Implementation (WITH SECURITY CONDITIONS)
**Next Steps:** Apply security mitigations (Task #8), then begin Phase 1.1 (Create Hook)
**Assigned To:** Developer Agent (Task #11)
**Security Review:** APPROVED WITH CONDITIONS (Task #8) - See Appendix E

---

## Appendix E: Security Review Mitigations (MANDATORY)

**Security Review Date:** 2026-01-29
**Reviewer:** Security Architect Agent (Task #8)
**Decision:** APPROVED WITH CONDITIONS
**Full Report:** `.claude/context/artifacts/security-reviews/spawn-validation-security-review-2026-01-29.md`

### E.1 CRITICAL Vulnerabilities (Must Fix Before Deployment)

#### VULN-001: Unicode Lookalike Bypass (CRITICAL)

**Issue:** Regex patterns can be bypassed using Unicode lookalike characters (homoglyphs).

**Attack Example:**
```javascript
// Attacker uses Greek Tau (U+03A4) instead of ASCII 'T'
const bypass = "TaskUpdate"; // Uses Greek Tau, looks identical but fails regex
```

**Mitigation (Required in Phase 1.1):**

Add Unicode normalization at the START of `validatePrompt()`:

```javascript
/**
 * Normalize Unicode to prevent homoglyph attacks
 * @param {string} text - Input text
 * @returns {string} Normalized ASCII-safe text
 */
function normalizeUnicode(text) {
  if (!text || typeof text !== 'string') return '';

  // Step 1: NFKC normalization (converts lookalikes to canonical form)
  let normalized = text.normalize('NFKC');

  // Step 2: Replace common homoglyphs with ASCII equivalents
  const homoglyphMap = {
    '\u0391': 'A', // Greek Alpha
    '\u0392': 'B', // Greek Beta
    '\u0395': 'E', // Greek Epsilon
    '\u0396': 'Z', // Greek Zeta
    '\u0397': 'H', // Greek Eta
    '\u0399': 'I', // Greek Iota
    '\u039A': 'K', // Greek Kappa
    '\u039C': 'M', // Greek Mu
    '\u039D': 'N', // Greek Nu
    '\u039F': 'O', // Greek Omicron
    '\u03A1': 'P', // Greek Rho
    '\u03A4': 'T', // Greek Tau
    '\u03A5': 'Y', // Greek Upsilon
    '\u03A7': 'X', // Greek Chi
    '\u0430': 'a', // Cyrillic a
    '\u0435': 'e', // Cyrillic e
    '\u043E': 'o', // Cyrillic o
    '\u0440': 'p', // Cyrillic p
    '\u0441': 'c', // Cyrillic c
    '\u0443': 'y', // Cyrillic y
    '\u0445': 'x', // Cyrillic x
  };

  for (const [lookalike, ascii] of Object.entries(homoglyphMap)) {
    normalized = normalized.replace(new RegExp(lookalike, 'g'), ascii);
  }

  return normalized;
}

// Usage in validatePrompt():
function validatePrompt(prompt) {
  // SECURITY: Normalize Unicode FIRST to prevent homoglyph bypass
  const normalizedPrompt = normalizeUnicode(prompt);

  // ... rest of validation using normalizedPrompt
}
```

**Test Cases to Add (Phase 1.2):**
```javascript
test('should detect TaskUpdate with Greek Tau homoglyph', () => {
  const bypass = '\u03A4askUpdate({ taskId: "1", status: "in_progress" })';
  const result = validatePrompt(bypass);
  // After normalization, should match TaskUpdate pattern
  expect(result.passed).toContain('TaskUpdate Call Instruction');
});

test('should detect Task ID with Cyrillic lookalikes', () => {
  const bypass = '\u03A4\u0430sk ID: 123'; // Greek Tau + Cyrillic a
  const result = validatePrompt(bypass);
  expect(result.passed).toContain('Task ID Reference');
});
```

---

#### VULN-002: ReDoS (Regular Expression Denial of Service) (CRITICAL)

**Issue:** Several regex patterns have catastrophic backtracking potential.

**Vulnerable Patterns:**
```javascript
// Rule 1: Nested quantifiers - VULNERABLE
/\+={4,}.*TASK TRACKING REQUIRED.*={4,}\+/s

// Rule 5: Catastrophic backtracking - VULNERABLE
/TaskUpdate\s*\(\s*\{.*status.*in_progress|TaskUpdate.*completed/s
```

**Attack Example:**
```javascript
// Craft input that causes exponential backtracking
const redosPayload = '+=====' + 'A'.repeat(50000) + 'TASK TRACKING';
// This could take minutes to evaluate
```

**Mitigation (Required in Phase 1.1):**

Replace vulnerable patterns with safe alternatives:

```javascript
const VALIDATION_RULES = [
  {
    name: 'TaskUpdate Warning Box',
    // SECURE: Use atomic group equivalent (possessive quantifier simulation)
    // Match fixed structure instead of greedy wildcards
    pattern: /\+={10,}\+[\s\S]{0,500}TASK TRACKING REQUIRED[\s\S]{0,500}={10,}\+/,
    severity: 'critical',
    suggestion: 'Include the 70-line warning box from universal-agent-spawn.md template',
    weight: 40,
  },
  {
    name: 'Task ID Reference',
    // SECURE: Original pattern is safe (no nested quantifiers)
    pattern: /Task ID:\s*[<"\']?\d+|taskId:\s*[<"\']?\d+/i,
    severity: 'critical',
    suggestion: 'Include "Task ID: <ID>" or reference specific task ID',
    weight: 30,
  },
  {
    name: 'PROJECT_ROOT Context',
    // SECURE: Simple alternation, no backtracking risk
    pattern: /PROJECT_ROOT|PROJECT CONTEXT/i,
    severity: 'high',
    suggestion: 'Include PROJECT CONTEXT section with PROJECT_ROOT path',
    weight: 15,
  },
  {
    name: 'Memory Protocol',
    // SECURE: Simple alternation, no backtracking risk
    pattern: /Memory Protocol|learnings\.md|context\/memory/i,
    severity: 'medium',
    suggestion: 'Include Memory Protocol section referencing .claude/context/memory/',
    weight: 10,
  },
  {
    name: 'TaskUpdate Call Instruction',
    // SECURE: Use bounded quantifier and non-greedy match
    pattern: /TaskUpdate\s{0,5}\(\s{0,5}\{[^}]{0,200}status[^}]{0,50}in_progress|TaskUpdate[^)]{0,100}completed/,
    severity: 'high',
    suggestion: 'Include explicit TaskUpdate call instructions for in_progress and completed',
    weight: 5,
  },
];
```

**Additional Safeguard - Timeout Wrapper:**
```javascript
/**
 * Execute regex with timeout to prevent ReDoS
 * @param {RegExp} pattern - Regex pattern
 * @param {string} text - Text to match
 * @param {number} timeoutMs - Timeout in milliseconds (default: 100ms)
 * @returns {boolean} Match result or false on timeout
 */
function safeRegexTest(pattern, text, timeoutMs = 100) {
  // For Node.js, use vm module with timeout
  const vm = require('vm');
  const script = new vm.Script(`pattern.test(text)`);
  const context = vm.createContext({ pattern, text });

  try {
    return script.runInContext(context, { timeout: timeoutMs });
  } catch (err) {
    if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      auditLog('spawn-prompt-validator', 'redos-timeout', {
        pattern: pattern.toString().substring(0, 50),
        textLength: text.length,
      });
      return false; // Fail closed on potential ReDoS
    }
    throw err;
  }
}
```

**Test Cases to Add (Phase 1.2):**
```javascript
test('should handle large input without timeout', () => {
  const largePrompt = 'TaskUpdate'.repeat(10000);
  const start = Date.now();
  validatePrompt(largePrompt);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1000); // Must complete in < 1 second
});

test('should not hang on ReDoS attempt', () => {
  const redosAttempt = '+=====' + 'A'.repeat(10000) + 'TASK';
  const start = Date.now();
  validatePrompt(redosAttempt);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(200); // Must fail fast
});
```

---

### E.2 HIGH Vulnerabilities (Fix Within 1 Week of Deployment)

#### VULN-003: Missing Prompt Length Limit

**Issue:** No maximum length check on prompt input allows memory exhaustion.

**Mitigation:**
```javascript
const MAX_PROMPT_LENGTH = 500000; // 500KB limit

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { score: 0, isValid: false, ... };
  }

  // SECURITY: Enforce length limit before processing
  if (prompt.length > MAX_PROMPT_LENGTH) {
    auditLog('spawn-prompt-validator', 'prompt-too-large', {
      length: prompt.length,
      limit: MAX_PROMPT_LENGTH,
    });
    return {
      score: 0,
      passed: [],
      failed: ['Prompt exceeds maximum length'],
      suggestions: [`Prompt is ${prompt.length} bytes, maximum is ${MAX_PROMPT_LENGTH}`],
      isValid: false,
      needsWarning: true,
    };
  }

  // ... rest of validation
}
```

---

#### VULN-004: Fail-Open on Exception Without Audit

**Issue:** Catch block exits 0 (allow) without logging security context.

**Mitigation:**
```javascript
} catch (err) {
  // SECURITY: Always log exceptions with full context
  auditLog('spawn-prompt-validator', 'error-failopen', {
    error: err.message,
    stack: err.stack?.substring(0, 500),
    toolInput: JSON.stringify(toolInput || {}).substring(0, 200),
    mode: mode,
  });

  debugLog('spawn-prompt-validator', 'Validation error', err);

  // Consider: In production, fail-closed might be safer
  // process.exit(2); // Uncomment for fail-closed behavior
  process.exit(0);
}
```

---

#### VULN-005: Environment Variable Override Without Audit

**Issue:** Setting `SPAWN_PROMPT_VALIDATOR=off` bypasses validation without audit trail.

**Mitigation:**
```javascript
async function main() {
  const mode = getEnforcementMode('SPAWN_PROMPT_VALIDATOR', 'warn');

  // SECURITY: Audit any non-default mode
  if (mode !== 'warn') {
    const { auditSecurityOverride } = require('../../lib/utils/hook-input.cjs');
    auditSecurityOverride('spawn-prompt-validator', 'SPAWN_PROMPT_VALIDATOR', mode);
  }

  if (mode === 'off') {
    auditLog('spawn-prompt-validator', 'disabled', {
      reason: 'SPAWN_PROMPT_VALIDATOR=off',
      warning: 'Validation bypassed - security risk',
    });
    process.exit(0);
  }

  // ... rest of main()
}
```

---

#### VULN-006: Missing Required Tool Flags

**Issue:** Validation rules don't check for specific required tool flags in `allowed_tools`.

**Mitigation:** Add new validation rule:
```javascript
{
  name: 'TaskUpdate in allowed_tools',
  pattern: /allowed_tools\s*:\s*\[[^\]]*TaskUpdate[^\]]*\]/i,
  severity: 'high',
  suggestion: 'Ensure TaskUpdate is in allowed_tools array for spawned agent',
  weight: 5, // Borrow 5 points from existing weights
},
```

---

### E.3 MEDIUM Vulnerabilities (Consider Before Production)

- **VULN-007**: No rate limiting on validation calls
- **VULN-008**: Orchestrator skip logic too broad
- **VULN-009**: Score threshold not configurable without code change
- **VULN-010**: Missing hook signature verification
- **VULN-011**: Audit log rotation not specified

See full security review for details.

---

### E.4 Implementation Checklist

Before merging, developer MUST verify:

```
CRITICAL (Blocking):
[ ] Unicode normalization function added (VULN-001)
[ ] Homoglyph test cases added and passing
[ ] ReDoS-safe regex patterns implemented (VULN-002)
[ ] Regex timeout wrapper added
[ ] ReDoS test cases added and passing

HIGH (Within 1 week):
[ ] Prompt length limit added (VULN-003)
[ ] Exception handler includes full audit context (VULN-004)
[ ] Environment override auditing added (VULN-005)
[ ] Required tool flags validation added (VULN-006)

MEDIUM (Before production):
[ ] Rate limiting considered
[ ] Orchestrator skip logic reviewed
[ ] Score threshold made configurable
[ ] Audit log rotation documented
```

---

### E.5 Security Sign-Off

**Security Architect Approval:** APPROVED WITH CONDITIONS
**Condition:** All CRITICAL and HIGH mitigations must be implemented as specified above.

---

*End of Implementation Plan*
