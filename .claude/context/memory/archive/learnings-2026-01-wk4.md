# January 2026 Learnings - Week 4 (Jan 24-25)

<!-- security-lint-skip-file: Historical documentation contains code examples -->

> **ARCHIVE SPLIT NOTICE**: This is part 1/5 of the January 2026 learnings archive.
> - **This file**: Week 4 (Jan 24-25) - Lines 1-1987
> - **Index**: [learnings-2026-01-index.md](./learnings-2026-01-index.md)
> - **Next**: [learnings-2026-01-wk5a.md](./learnings-2026-01-wk5a.md)

---

# Project Learnings and Context

> **NOTICE: Legacy Archive File**
>
> This file is now a **read-only archive**. New learnings should be recorded using the session-based memory system:
>
> ```bash
> # Record a gotcha
> node .claude/lib/memory/memory-manager.cjs record-gotcha "description"
>
> # Record a pattern
> node .claude/lib/memory/memory-manager.cjs record-pattern "description"
>
> # Record a discovery
> node .claude/lib/memory/memory-manager.cjs record-discovery "path" "description"
>
> # Load all memory (truncated for context efficiency)
> node .claude/lib/memory/memory-manager.cjs load
> ```
>
> **New Storage Locations:**
>
> - `.claude/context/memory/gotchas.json` - Pitfalls to avoid
> - `.claude/context/memory/patterns.json` - Reusable solutions
> - `.claude/context/memory/codebase_map.json` - File discoveries
> - `.claude/context/memory/sessions/` - Per-session JSON files
>
> This file is kept for historical reference and backward compatibility.
>
> **ARCHIVAL GUIDANCE**: When this file exceeds 5000 lines, archive older sections to `.claude/context/memory/archive/learnings-YYYY-MM.md`
>
> **ARCHIVED CONTENT**: Detailed integration logs from 2026-01-24 moved to `.claude/context/memory/archive/learnings-archive-2026-01.md`

---

## [2026-01-25] Phase 4: Memory Monitoring and Automation Completed

**Implementation Summary**:
Implemented unified memory dashboard and automated maintenance scheduler.

**Files Created**:

- `.claude/lib/memory/memory-dashboard.cjs` - Unified metrics collection, health scoring, recommendations
- `.claude/lib/memory/memory-scheduler.cjs` - Automated daily/weekly maintenance tasks
- `.claude/lib/memory-dashboard.test.cjs` - 14 tests for dashboard
- `.claude/lib/memory-scheduler.test.cjs` - 12 tests for scheduler
- `.claude/context/memory/metrics/` - Directory for historical metrics

**Key Features**:

### Memory Dashboard

- **collectMetrics()**: Gathers metrics from all memory sources (files, tiers, sessions)
- **calculateHealthScore()**: 0-1 composite score based on weighted metrics
- **generateRecommendations()**: Auto-suggest actions based on thresholds
- **saveMetrics()/getMetricsHistory()**: Track trends over 30 days

**Health Score Weights**:
| Metric | Weight |
|--------|--------|
| learnings.md size | 0.20 |
| patterns count | 0.15 |
| gotchas count | 0.15 |
| codebase_map entries | 0.25 |
| MTM session count | 0.25 |

### Memory Scheduler

**Daily Tasks**:

- `consolidation` - Move STM to MTM
- `healthCheck` - Check tier health and log metrics
- `metricsLog` - Save daily snapshot to metrics/

**Weekly Tasks** (includes daily):

- `summarization` - Compress old MTM sessions to LTM
- `deduplication` - Remove duplicate patterns/gotchas
- `pruning` - Archive learnings, prune codebase_map
- `weeklyReport` - Generate trend report

**CLI Commands**:

```bash
# Dashboard
node .claude/lib/memory/memory-dashboard.cjs health    # Full dashboard
node .claude/lib/memory/memory-dashboard.cjs json      # JSON output
node .claude/lib/memory/memory-dashboard.cjs history 7 # Last 7 days

# Scheduler
node .claude/lib/memory/memory-scheduler.cjs daily     # Run daily tasks
node .claude/lib/memory/memory-scheduler.cjs weekly    # Run weekly tasks
node .claude/lib/memory/memory-scheduler.cjs status    # Check maintenance status

# Via memory-manager
node .claude/lib/memory/memory-manager.cjs dashboard   # Unified dashboard
node .claude/lib/memory/memory-manager.cjs maintenance daily  # Run maintenance
```

**Integration Points**:

- `memory-health-check.cjs` hook now saves metrics on each run
- `memory-manager.cjs` CLI has `dashboard` and `maintenance` commands

**Test Coverage**: 26 new tests (14 dashboard + 12 scheduler)

**Total Memory System Tests**: 83 tests across 5 modules

---

## [2026-01-25] Phase 3: Smart Pruning Completed

**Implementation Summary**:
Implemented utility-based scoring and semantic deduplication based on research findings.

**Utility Scoring Formula**:

```
Score = 0.3 * recency + 0.3 * frequency + 0.4 * importance
```

**Components**:
| Component | Calculation |
|-----------|-------------|
| Recency | Exponential decay with 30-day half-life |
| Frequency | Logarithmic scaling (caps at 20 accesses) |
| Importance | Pattern-based markers (CRITICAL=1.0, IMPORTANT=0.8, etc.) |

**Files Created**:

- `.claude/lib/memory/smart-pruner.cjs` - Core pruning module with utility scoring, Jaccard similarity, deduplication
- `.claude/lib/smart-pruner.test.cjs` - 29 tests covering all functionality

**Key Functions**:

- `calculateUtility(entry)` - Combined score for pruning decisions
- `jaccardSimilarity(s1, s2)` - Word-overlap similarity (0-1)
- `findSimilarEntries(entries)` - Group duplicates by similarity
- `mergeEntries(group)` - Combine duplicates preserving best info (prioritizes importance markers)
- `pruneByUtility(entries, target)` - Remove lowest utility entries
- `deduplicateAndPrune(entries, options)` - Full cleanup pipeline

**Importance Markers** (highest wins):
| Marker | Weight |
|--------|--------|
| CRITICAL | 1.0 |
| Iron Law | 1.0 |
| NEVER/ALWAYS | 0.9 |
| IMPORTANT | 0.8 |
| decision: | 0.8 |
| pattern: | 0.7 |
| WARNING | 0.7 |
| NOTE: | 0.5 |
| (unmarked) | 0.2 |

**Integration with memory-health-check.cjs**:

- Now monitors patterns.json and gotchas.json counts
- Auto-prunes when over threshold (50 entries)
- Reports patterns/gotchas counts in health metrics

**CLI Commands**:

```bash
node .claude/lib/memory/smart-pruner.cjs analyze <file.json>  # Show top/bottom by utility
node .claude/lib/memory/smart-pruner.cjs prune <file.json> N  # Prune to N entries
node .claude/lib/memory/smart-pruner.cjs prune <file.json> N --write  # Prune and save
node .claude/lib/memory/smart-pruner.cjs similarity "text1" "text2"  # Check similarity
```

**Test Coverage**: 29 tests, all passing

---

## [2026-01-25] Phase 2: Memory Hierarchy (STM/MTM/LTM) Completed

**Implementation Summary**:
Implemented three-tier memory hierarchy based on research findings (MemoryOS, H-MEM patterns).

**Memory Tiers**:
| Tier | Name | Purpose | Retention | Max Sessions |
|------|------|---------|-----------|--------------|
| STM | Short-Term Memory | Current session context | Session-bound | 1 |
| MTM | Mid-Term Memory | Recent sessions (detailed) | 10 sessions | 10 |
| LTM | Long-Term Memory | Permanent knowledge (summaries) | Permanent | Unlimited |

**Files Created**:

- `.claude/lib/memory/memory-tiers.cjs` - Core tier logic (consolidation, promotion, summarization)
- `.claude/lib/memory-tiers.test.cjs` - 14 tests, all passing

**Directories Created**:

- `.claude/context/memory/stm/` - Short-Term Memory storage
- `.claude/context/memory/mtm/` - Mid-Term Memory storage
- `.claude/context/memory/ltm/` - Long-Term Memory storage (summaries)

**Hooks Updated**:

- `session-end-recorder.cjs` - Now writes to STM then consolidates to MTM
- `memory-health-check.cjs` - Now monitors all three tiers

**Key Functions**:

- `writeSTMEntry()` - Write current session to STM
- `consolidateSession()` - Move STM to MTM after session ends
- `promoteToLTM()` - Manually promote high-value sessions
- `summarizeOldSessions()` - Compress old MTM sessions to LTM summaries
- `generateSessionSummary()` - Create structured summary from session group
- `getTierHealth()` - Health check for all memory tiers

**LTM Summary Format**:

```json
{
  "type": "session_summary",
  "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "session_count": N,
  "key_learnings": [...],
  "major_decisions": [...],
  "important_patterns": [...],
  "files_frequently_touched": [...]
}
```

**CLI Commands**:

```bash
node .claude/lib/memory/memory-tiers.cjs health          # Check tier health
node .claude/lib/memory/memory-tiers.cjs consolidate     # Consolidate STM -> MTM
node .claude/lib/memory/memory-tiers.cjs summarize       # Summarize old MTM -> LTM
node .claude/lib/memory/memory-tiers.cjs promote <id>    # Promote to LTM
node .claude/lib/memory/memory-tiers.cjs mtm-list        # List MTM sessions
```

**Test Coverage**: 14 tests covering all tier operations

---

## [2026-01-25] Phase 1 Critical Memory Fixes Completed

**Issue 1: Auto-archival for learnings.md** (40KB threshold)

- Added `checkAndArchiveLearnings()` function to memory-manager.cjs
- Archives content when file exceeds 40KB
- Keeps last 50 lines for continuity
- Archive format: `learnings-YYYY-MM.md` in archive/ directory

**Issue 2: TTL/size-based pruning for codebase_map.json**

- Added `pruneCodebaseMap()` function to memory-manager.cjs
- Removes entries older than 90 days (TTL)
- If still over 500 entries after TTL, removes oldest
- Added `last_accessed` field to all discovery entries
- Auto-migrates legacy entries without last_accessed

**Issue 3: Memory Health Check Hook**

- Created `memory-health-check.cjs` hook in `.claude/hooks/memory/`
- Warns when learnings.md > 35KB (archival at 40KB)
- Warns when codebase_map > 400 entries (prune at 500)
- Reports session count
- Auto-triggers archival/pruning when hard thresholds exceeded

**CLI Commands Added**:

```bash
node .claude/lib/memory/memory-manager.cjs health          # Check memory health
node .claude/lib/memory/memory-manager.cjs archive-learnings  # Manually archive
node .claude/lib/memory/memory-manager.cjs prune-codebase     # Manually prune
```

**Test Coverage**: 14 tests, all passing

- File: `.claude/lib/memory/memory-manager.test.cjs`

**Hook Registration**: Added to UserPromptSubmit in settings.json

---

## [2026-01-25] EVOLVE Enforcement Hooks Completed (100%)

**Hooks Created**:

- `quality-gate-validator.cjs` - Enforces quality checks during VERIFY phase (placeholders, missing sections, content length)
- `evolution-trigger-detector.cjs` - Auto-detects evolution keywords in user prompts, writes suggestions to evolution-state.json

**Test Coverage**:

- `quality-gate-validator.test.cjs` - 25 tests, all passing
- `evolution-trigger-detector.test.cjs` - 23 tests, all passing

**Registration**:

- `quality-gate-validator.cjs` added to PreToolUse(Edit|Write|NotebookEdit)
- `evolution-trigger-detector.cjs` added to UserPromptSubmit

**Complete Enforcement Hook List (6/6)**:
| Hook | Phase | Status | Tests |
|------|-------|--------|-------|
| `research-enforcement.cjs` | OBTAIN→LOCK | ✅ | ✅ |
| `evolution-state-guard.cjs` | ALL | ✅ | ✅ |
| `conflict-detector.cjs` | VALIDATE | ✅ | ✅ |
| `evolution-audit.cjs` | ENABLE | ✅ | ✅ |
| `quality-gate-validator.cjs` | VERIFY | ✅ | ✅ |
| `evolution-trigger-detector.cjs` | IDLE→EVALUATE | ✅ | ✅ |

**EVOLVE System Status**: 100% Complete

---

## [2026-01-25] EVOLVE Workflow Created

**Workflow Created**: `evolution-workflow` at `.claude/workflows/core/evolution-workflow.md`

**Purpose**: Locked-in workflow for self-evolution. Defines the MANDATORY state machine that all ecosystem evolution must follow.

**Key Features**:

- 6-Phase State Machine: E(valuate)->V(alidate)->O(btain)->L(ock)->V(erify)->E(nable)
- MANDATORY Research Phase (OBTAIN) - Cannot be skipped, requires 3+ queries, 3+ sources
- Gate-based progression with explicit exit conditions for each phase
- State persistence in `evolution-state.json` for recovery and audit
- 6 enforcement hooks defined: evolution-trigger-detector, conflict-detector, research-enforcement, evolution-state-guard, quality-gate-validator, evolution-audit
- 6 Iron Laws including "NO ARTIFACT WITHOUT RESEARCH" and "NO ARTIFACT WITHOUT ROUTING"

**Integration Points**:

- Added to CLAUDE.md Section 8.6 (Enterprise Workflows)
- References evolution-orchestrator agent at `.claude/agents/orchestrators/evolution-orchestrator.md`
- Uses research-synthesis skill in OBTAIN phase
- Uses all creator skills (agent-creator, skill-creator, etc.) in LOCK phase

**Usage Pattern**:

```javascript
// Router detects evolution need, spawns evolution-orchestrator
Task({
  subagent_type: 'evolution-orchestrator',
  description: 'Creating new artifact via EVOLVE workflow',
  prompt: `Follow EVOLVE workflow at .claude/workflows/core/evolution-workflow.md`,
});
```

**ADR**: ADR-011 in `.claude/context/memory/decisions.md`

---

## [2026-01-25] Research-Synthesis Skill Created

**Skill Created**: `research-synthesis` at `.claude/skills/research-synthesis/SKILL.md`

**Purpose**: Synthesize research from Exa/WebSearch into actionable design decisions BEFORE any creator skill invocation.

**Key Features**:

- Mandatory 3-query minimum research protocol
- Integration with Exa MCP tools and WebSearch/WebFetch
- Structured research report output format
- Quality gate checklist before proceeding to artifact creation
- Risk assessment with mitigations

**Integration Points**:

- Added to CLAUDE.md Section 3 (Creator Skills) as first entry
- Added to CLAUDE.md Section 4.1 (Creator Ecosystem) table
- Added to Skill Catalog under Creator Tools (now 10 skills, total 427)

**Usage Pattern**:

```javascript
// BEFORE creating any artifact
Skill({ skill: 'research-synthesis' });
// Execute research protocol...
// THEN invoke creator
Skill({ skill: 'skill-creator' });
```

---

## [2026-01-25] Task Synchronization Protocol Enforcement

**Problem**: Agents complete work but never call `TaskUpdate({ status: "completed" })`, breaking task tracking.

**Fix Applied**:

1. Added "Task Progress Protocol (MANDATORY)" section to all 7 core agents
2. Enhanced CLAUDE.md spawn template with Iron Laws emphasis

**The Three Iron Laws (Agents MUST Follow)**:

1. **LAW 1**: ALWAYS call TaskUpdate({ status: "in_progress" }) when starting
2. **LAW 2**: ALWAYS call TaskUpdate({ status: "completed", metadata: {...} }) when done
3. **LAW 3**: ALWAYS call TaskList() after completion to find next work

---

## Key Decisions

- [2026-01-23] Adopted Router-First Protocol for all interactions
- [2026-01-23] Standardized on Anthropic Tool Use (Parallel, Bash, Code Execution)
- [2026-01-24] **CRITICAL**: ALWAYS update CLAUDE.md after creating skills/agents/workflows
- [2026-01-24] Standardized `context_strategy` field in agent YAML frontmatter (minimal, lazy_load, full)
- [2026-01-24] Created comprehensive Skill Catalog at `.claude/context/artifacts/skill-catalog.md`
- [2026-01-24] Integrated K-Dense Scientific Skills (139 sub-skills) at `.claude/skills/scientific-skills/`
- [2026-01-25] Comprehensive Documentation Update for Audit Fixes (see `.claude/docs/`)

---

## Patterns Identified

- Agents must explicitly reference tools to use them effectively
- Parallel tool use significantly speeds up exploration

### Cross-Platform Shell Commands (CRITICAL)

**Problem**: Using `/dev/null` in shell commands creates a literal `nul` file on Windows.

**Solution**: Use platform-aware null device:

```javascript
const { NULL_DEVICE } = require('../lib/platform.cjs');
execSync(`command 2>${NULL_DEVICE}`);
```

**Library Location**: `.claude/lib/platform.cjs` and `.claude/lib/platform.mjs`

**Hook-Based Fix**: `windows-null-sanitizer.cjs` PreToolUse hook intercepts ALL Bash commands on Windows and replaces `/dev/null` with `NUL`.

---

## User Preferences

- Prefer concise plans
- Strict adherence to TDD

---

## Critical Hooks

| Hook                        | Location                 | Purpose                                   |
| --------------------------- | ------------------------ | ----------------------------------------- |
| `windows-null-sanitizer`    | `.claude/hooks/safety/`  | Prevents literal "nul" files on Windows   |
| `validate-skill-invocation` | `.claude/hooks/safety/`  | Validates Skill() tool usage              |
| `bash-command-validator`    | `.claude/hooks/safety/`  | Security validation (fail-closed)         |
| `router-write-guard`        | `.claude/hooks/safety/`  | Prevents router from using Edit/Write     |
| `task-create-guard`         | `.claude/hooks/routing/` | Enforces PLANNER-first for complex tasks  |
| `enforce-claude-md-update`  | `.claude/hooks/safety/`  | Reminds to update CLAUDE.md               |
| `memory-reminder`           | `.claude/hooks/session/` | Reminds to read memory files              |
| `security-review-guard`     | `.claude/hooks/routing/` | Blocks dev spawns without security review |
| `file-placement-guard`      | `.claude/hooks/safety/`  | Enforces file placement rules             |

---

## Security Patterns (2026-01-25)

### Pattern: Use validatePath() Before File Operations

**Always validate paths before file operations in framework code:**

```javascript
const { validatePath } = require('./validator.cjs');

// BEFORE any fs.readFileSync, fs.writeFileSync, fs.rmSync
const validation = validatePath(filePath);
if (!validation.valid) {
  throw new Error(`Invalid path: ${validation.reason}`);
}
```

**Location**: `.claude/lib/self-healing/validator.cjs`

### Pattern: Fail-Closed for Security Hooks

**Security hooks must fail-closed, not fail-open:**

```javascript
// WRONG - Fail open allows bypass via induced errors
} catch (err) {
  process.exit(0);  // DANGEROUS: Allows action on error
}

// CORRECT - Fail closed, deny by default
} catch (err) {
  console.error('[security-hook] Error, denying by default:', err.message);
  process.exit(2);  // SAFE: Blocks action on error
}
```

### Anti-Pattern: Avoid new Function() / eval()

**Never use `new Function()` or `eval()` with external input:**

```javascript
// DANGEROUS - Allows code injection
const evaluator = new Function('context', `return ${userInput};`);

// SAFE - Use a restricted expression parser
const exprEval = require('expr-eval');
const parser = new exprEval.Parser();
const result = parser.evaluate(expression, context);
```

### Pattern: Validate State Files After JSON.parse()

**Always validate parsed JSON against schema:**

```javascript
const { validateOutput } = require('./validator.cjs');

const content = fs.readFileSync(stateFile, 'utf-8');
const data = JSON.parse(content);

// Validate against schema
const validation = validateOutput(data, STATE_SCHEMA);
if (!validation.valid) {
  throw new Error(`Invalid state: ${validation.errors.join(', ')}`);
}
```

### Pattern: Array-Form for Child Process Execution

**Avoid string interpolation with execSync:**

```javascript
// DANGEROUS - Command injection risk
execSync(`node "${scriptPath}" ${args.join(' ')}`);

// SAFE - Array form prevents injection
const { spawnSync } = require('child_process');
spawnSync('node', [scriptPath, ...args], { shell: false });
```

---

## Creator Ecosystem Summary

| Creator            | Creates      | Output Location      |
| ------------------ | ------------ | -------------------- |
| `agent-creator`    | Agents       | `.claude/agents/`    |
| `skill-creator`    | Skills       | `.claude/skills/`    |
| `hook-creator`     | Hooks        | `.claude/hooks/`     |
| `workflow-creator` | Workflows    | `.claude/workflows/` |
| `template-creator` | Templates    | `.claude/templates/` |
| `schema-creator`   | JSON Schemas | `.claude/schemas/`   |

**Iron Law**: NO CREATION WITHOUT CLAUDE.MD UPDATE

---

## Integrated Components Summary (2026-01-24)

> **Full details**: `.claude/context/memory/archive/learnings-archive-2026-01.md`

### Auto-Claude Integration

- **Security Validators**: 6 CJS hooks in `.claude/hooks/safety/validators/`
- **Skills Created**: spec-gathering, spec-writing, spec-critique, complexity-assessment, insight-extraction, qa-workflow
- **Analysis Patterns**: 4 reference files in `.claude/skills/project-analyzer/references/`
- **Recovery Patterns**: 3 reference files in `.claude/skills/recovery/references/`

### Superpowers Integration

- **Foundation Skills**: tdd (enhanced), debugging (4-phase), verification-before-completion
- **Workflow Skills**: brainstorming, writing-plans, executing-plans, subagent-driven-development
- **Git Workflow**: using-git-worktrees, finishing-a-development-branch
- **Advanced**: dispatching-parallel-agents, writing-skills, skill-discovery
- **Code Review**: code-reviewer agent + requesting/receiving skills
- **Key Patterns**: Iron Laws, Rationalization Tables, Red Flags, Gate Functions

### Language Pro Agents

- python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro (all with Memory Protocol)

### Conductor Integration

- **Skills**: context-driven-development, track-management, workflow-patterns
- **Agent**: conductor-validator
- **Workflow**: conductor-setup-workflow

### C4 Architecture

- **Agents**: c4-code, c4-component, c4-container, c4-context
- **Workflow**: c4-architecture-workflow

### Kubernetes Operations

- **Skills**: k8s-manifest-generator, helm-chart-scaffolding, gitops-workflow, k8s-security-policies

### Reverse Engineering (AUTHORIZED USE ONLY)

- **Skills**: binary-analysis-patterns, memory-forensics, protocol-reverse-engineering
- **Agent**: reverse-engineer

### Serena Integration

- **Skills**: project-onboarding, thinking-tools, summarize-changes, operational-modes, session-handoff
- **Patterns**: Mode-based tool exclusion, memory persistence, thinking checkpoints

---

## Security Validators Architecture

**Central Registry**: `.claude/hooks/safety/validators/registry.cjs`

**Validation Function Signature**:

```javascript
function validateCommand(commandString) {
  return { valid: boolean, error: string };
}
```

**Validators** (all fail-closed after SEC-001/002/003 fixes):

- `shell-validators.cjs` - Bash/sh/zsh (blocks eval, nested shells)
- `database-validators.cjs` - PostgreSQL/MySQL/Redis/MongoDB
- `filesystem-validators.cjs` - chmod/rm operations
- `git-validators.cjs` - config/push protection
- `process-validators.cjs` - kill/pkill/killall
- `network-validators.cjs` - curl/wget pipe protection

---

## Router Decision Workflow

**Location**: `.claude/workflows/core/router-decision.md`

**9-Step Process**:

1. Duplication Check
2. Task List Check
3. Request Classification (Intent, Complexity, Domain, Risk)
4. External Repo Detection
5. Self-Check Protocol (4 mandatory questions)
6. Valid Router Actions (whitelist/blacklist)
7. Agent Selection
8. Spawn Decision (single, parallel, phased)
9. Model Selection (haiku/sonnet/opus)

**Router Tool Restrictions**:

- **Whitelist**: TaskList, TaskCreate, TaskUpdate, TaskGet, Task, Read (routing files), AskUserQuestion
- **Blacklist**: Edit, Write, Bash (implementation), Glob, Grep, WebSearch, mcp\_\_\*

---

## Framework Statistics (2026-01-25)

- **Agents**: 39 (8 core, 17 domain, 2 orchestrators, 12 specialized)
- **Skills**: 426 (284 directories + 139 scientific sub-skills)
- **Hooks**: 23 (organized into safety, routing, memory, session)
- **Workflows**: 10+ (enterprise, operations, core)
- **Schemas**: 77 (11 core + 66 skill schemas)
- **Templates**: 4 (agent, skill, workflow, README)

---

## Skill Invocation Protocol

**CORRECT**: Use Skill tool to invoke

```javascript
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });
```

**WRONG**: Just reading the file doesn't apply the skill

```javascript
Read('.claude/skills/tdd/SKILL.md'); // Reading is NOT invoking
```

**Scientific Skills**: Use full path format

```javascript
Skill({ skill: 'scientific-skills/rdkit' }); // NOT just 'rdkit'
```

---

## Audit Findings Summary (2026-01-25)

### CLAUDE.md Audit

- **Routing Table**: 100% accurate (39 agents)
- **Workflow Table**: 100% accurate (7 workflows)
- **Creator Skills**: 100% accurate (6 creators)
- **One Path Issue**: task-create-guard.cjs location corrected to `.claude/hooks/routing/`

### Hooks and Safety Audit

- **23 hooks** organized into 4 categories
- **Security validators**: All fail-closed (SEC-001/002/003 fixes verified)
- **Pass rate**: 16/16 audited hooks pass

### Schema Audit

- **77 schemas**: 100% valid
- **Standards**: Consistent JSON Schema draft-07 and draft-2020-12

---

## Key Learning: Router Update After Integration

**Issue**: After integration work, new skills/agents/workflows were NOT added to CLAUDE.md.

**Root Cause**: Manual integration bypassed creator skills that enforce this.

**Fix**: Created `codebase-integration` skill with 8-phase workflow including mandatory router update step.

**Rule**:

```
IRON LAW: NO INTEGRATION WITHOUT CLAUDE.MD UPDATE

After creating ANY skill, agent, or workflow:
1. Update CLAUDE.md Section 3 (agents) or Section 8.5 (skills) or Section 8.6 (workflows)
2. Run: grep "<item-name>" .claude/CLAUDE.md || echo "ERROR!"
3. Update learnings.md with integration summary

WHY: Items not in CLAUDE.md are INVISIBLE to the Router.
```

---

## Memory Protocol (All Agents/Skills Must Follow)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> **ASSUME INTERRUPTION**: If it's not in memory, it didn't happen.

---

## [2026-01-25] Agent Context Race Condition Fix

**Problem**: Race condition in agent context tracking caused spawned agents to be blocked from using Write/Edit.

**Root Cause**:

1. Router calls `Task()` to spawn agent
2. Agent starts - its `UserPromptSubmit` fires
3. `router-mode-reset.cjs` checks if mode='agent' - but it's STILL 'router' because...
4. Router's `PostToolUse(Task)` hasn't completed yet to call `enterAgentMode()`

**Timeline BEFORE fix**:

```
Router Task() -> Agent starts -> UserPromptSubmit resets to 'router' -> PostToolUse sets 'agent' (TOO LATE)
```

**Fix Applied**: Created `agent-context-pre-tracker.cjs` hook that sets `mode='agent'` in `PreToolUse(Task)` BEFORE the task runs.

**Timeline AFTER fix**:

```
Router Task() -> PreToolUse sets 'agent' -> Agent starts -> UserPromptSubmit sees 'agent', skips reset
```

**Files Created**:

- `.claude/hooks/routing/agent-context-pre-tracker.cjs` - PreToolUse hook for Task

**Files Modified**:

- `.claude/settings.json` - Added hook to PreToolUse Task matcher (first position)

**Hook Order in PreToolUse(Task)**:

1. `agent-context-pre-tracker.cjs` (sets mode=agent FIRST)
2. `planner-first-guard.cjs`
3. `security-review-guard.cjs`

## [2026-01-25] Router Discipline - Documentation Routing Fixes

**Problem**: Documentation requests being routed to developer instead of technical-writer.

**Fixes Implemented**:

1. Added documentation intent keywords to router-enforcer.cjs
2. Added +5 scoring boost for technical-writer on documentation intent
3. Created ROUTING_TABLE constant mirroring CLAUDE.md Section 3
4. Changed technical-writer priority from medium to high
5. Added Routing Exclusions section to developer.md
6. Created documentation-routing-guard.cjs hook (PreToolUse Task)
7. Added 30 new tests (18 router-enforcer + 18 doc-routing-guard, all pass)

**Files Modified**:

- .claude/hooks/routing/router-enforcer.cjs
- .claude/agents/core/technical-writer.md
- .claude/agents/core/developer.md
- .claude/hooks/routing/documentation-routing-guard.cjs (new)
- .claude/hooks/routing/documentation-routing-guard.test.cjs (new)
- .claude/hooks/routing/router-enforcer.test.cjs
- .claude/settings.json

**Hook Order in PreToolUse(Task)** (updated):

1. agent-context-pre-tracker.cjs
2. planner-first-guard.cjs
3. security-review-guard.cjs
4. documentation-routing-guard.cjs (NEW)

---

## [2026-01-25] Router-Enforcer Comprehensive Agent Keywords Update

**Problem**: Router-enforcer.cjs only had keywords for ~15 agents. Needed comprehensive coverage for all 41 agents.

**Research Conducted**: Created 5 research reports with keywords for all agents:

- `agent-keywords-core.md` - 8 core agents (architect, context-compressor, developer, planner, pm, qa, router, technical-writer)
- `agent-keywords-domain-languages.md` - 6 language agents (python-pro, rust-pro, golang-pro, typescript-pro, java-pro, php-pro)
- `agent-keywords-domain-frameworks.md` - 8 framework agents (fastapi-pro, nextjs-pro, sveltekit-expert, nodejs-pro, expo-mobile-developer, tauri-desktop-developer, ios-pro, graphql-pro)
- `agent-keywords-domain-other.md` - 3 other domain agents (frontend-pro, data-engineer, mobile-ux-reviewer)
- `agent-keywords-specialized.md` - 12 specialized agents (c4-\*, code-reviewer, conductor-validator, database-architect, devops, devops-troubleshooter, incident-responder, reverse-engineer, security-architect)
- Plus 3 orchestrators (master-orchestrator, swarm-coordinator, evolution-orchestrator)

**Files Modified**:

- `.claude/hooks/routing/router-enforcer.cjs`

**Key Changes**:

1. **intentKeywords Object**: Expanded from ~15 to 41 agent categories with comprehensive keyword lists (~260 lines)

2. **INTENT_TO_AGENT Mapping**: New constant that maps intent keys to actual agent names

```javascript
const INTENT_TO_AGENT = {
  architect: 'architect',
  documentation: 'technical-writer',
  python: 'python-pro',
  // ... all 41 mappings
};
```

3. **DISAMBIGUATION_RULES**: New constant with 10 disambiguation categories for overlapping keywords

```javascript
const DISAMBIGUATION_RULES = {
  design: [
    { condition: ['system', 'architecture'], prefer: 'architect', deprioritize: 'planner' },
    { condition: ['plan', 'breakdown'], prefer: 'planner', deprioritize: 'architect' },
  ],
  // ... 9 more categories (test, refactor, async, api, migration, mobile, component, debug, review, database)
};
```

4. **Updated scoreAgents()**: Now uses INTENT_TO_AGENT for domain-specific boosts

5. **New applyDisambiguation()**: Resolves ambiguous prompts using context rules

**Test Results**: All 18 tests pass after updating assertions to check for INTENT_TO_AGENT instead of old scoring patterns.

**Research Reports Location**: `.claude/context/artifacts/research-reports/`

**Pattern**: When extending router capabilities, create research reports first documenting keyword sources.

---

## [2026-01-25] Workflow Engine Core Module Created

**Files Created**:

- `.claude/lib/workflow/workflow-engine.cjs` - Production-grade workflow engine for EVOLVE system
- `.claude/lib/workflow-engine.test.cjs` - 55 comprehensive tests
- `.claude/workflows/creators/` - Directory for creator workflow YAML files

**Key Features Implemented**:

1. **EVOLVE State Machine**: 6 phases (EVALUATE, VALIDATE, OBTAIN, LOCK, VERIFY, ENABLE)
2. **TRANSITIONS Constant**: Defines valid phase transitions including retry (verify->lock)
3. **YAML Parser**: Custom parser without external dependencies for workflow definitions
4. **Step Executor**: With before/after hooks, handler registration, result storage
5. **Gate Validation**: JavaScript condition evaluation for phase transitions
6. **Checkpoint/Resume**: File-based checkpoints for workflow durability
7. **Rollback**: Compensating actions executed in reverse order
8. **Event System**: phase:start/end/error, step:start/end/error, gate:pass/fail, checkpoint:save/restore

**YAML Parser Learning**:

- Custom YAML parser handles basic structures (objects, arrays, strings, numbers, booleans)
- Key insight: When parsing array items like `- id: step1`, nested properties under the item must be collected separately
- The parser correctly handles the indentation-based structure common in workflow definitions

**Test Framework Pattern**:

- Simple test framework with `describe`/`it` that collects tests into a queue
- Sequential execution via `await runTestQueue()` prevents race conditions with shared resources
- Important: Async tests must be awaited, not just returned as promises

**Handler Registration Pattern**:

- Handlers registered by name, executed during step execution
- Results stored in `state.stepResults[stepId]`
- Gate conditions access results via `steps.<stepId>.output.<field>`
- Handlers should return objects with `output` field for gate compatibility

**CLI Commands**:

```bash
node .claude/lib/workflow-engine.test.cjs  # Run 55 tests
```

**Exports**:

```javascript
const {
  WorkflowEngine,
  PHASES,
  TRANSITIONS,
  parseWorkflow,
  validateWorkflow,
} = require('./workflow-engine.cjs');
```

---

## [2026-01-25] Agent Creator Workflow YAML Created

**Files Created**:

- `.claude/workflows/creators/agent-creator-workflow.yaml` - Executable workflow for creating new agents
- `.claude/workflows/creators/agent-creator-workflow.test.cjs` - 37 comprehensive tests

**Key Features**:

1. **6 EVOLVE Phases**: evaluate, validate, obtain, lock, verify, enable
2. **18 Total Steps** with unique IDs across all phases
3. **Gates per Phase** with assertion and type-specific validation
4. **Saga-Based Rollback** with compensation definitions
5. **Iron Laws in Metadata** enforcing best practices

**YAML Structure Pattern**:

```yaml
name: <workflow-name>
version: 1.0.0
description: <description>
triggers:
  - pattern: <regex-pattern>

phases:
  <phase-name>:
    description: <phase-description>
    steps:
      - id: <unique-step-id>
        action: <action-type> # search, prompt, write, validate, edit, etc.
        handler: <handler-name>
        description: <what-it-does>
        compensate: # Optional rollback config
          type: <compensation-type>
    gates:
      - type: <gate-type> # assertion, research, file_exists, registration
        condition: <js-condition> # For assertions
        message: <failure-message>

rollback:
  strategy: saga
  compensations:
    - <type>: <action>

metadata:
  iron_laws:
    - <law-1>
```

**Gate Types**:

- `assertion` - JavaScript condition evaluation
- `research` - Requires minQueries, minSources, reportRequired
- `file_exists` - Check path exists
- `registration` - Check targets array for multiple registrations

**Step Action Types**:

- `search` - Search existing artifacts
- `prompt` - Interactive confirmation
- `write` - Create new file
- `validate` - Check rules/patterns
- `edit` - Modify existing file
- `mkdir` - Create directory
- `append` - Append to file
- `command` - Run shell command
- `classify` - Categorize artifact
- `exa_search` / `web_search` - External research

**Test Coverage**: 37 tests covering all phases, gates, rollback, and iron laws

---

## [2026-01-25] Integration Layer for Executable Workflows Created

**Files Created**:

- `.claude/lib/cross-workflow-trigger.cjs` - Cross-workflow triggering with circular detection
- `.claude/lib/cross-workflow-trigger.test.cjs` - 14 tests
- `.claude/lib/system-registration-handler.cjs` - Automated registration in system files
- `.claude/lib/system-registration-handler.test.cjs` - 13 tests
- `.claude/lib/evolution-state-sync.cjs` - Evolution state synchronization
- `.claude/lib/evolution-state-sync.test.cjs` - 22 tests

**Key Features**:

### CrossWorkflowTrigger

- Sync triggers (wait for result) and async triggers (fire-and-forget)
- Circular trigger detection to prevent infinite loops
- Trigger history tracking for debugging
- Multiple workflow triggering in parallel
- Max chain depth limit (default: 10)

### SystemRegistrationHandler

- Registers agents, skills, hooks, workflows in system files
- Creates backups before modification
- Supports CLAUDE.md, settings.json, skill-catalog.md
- Deregistration and update capabilities
- Verification of registration status

### EvolutionStateSync

- Reads/writes `.claude/context/evolution-state.json`
- Locking mechanism with timeout for exclusive access
- Suggestion queue management (add/pop)
- History recording for evolutions
- Current evolution tracking with phase updates
- State caching for performance

**Integration Points**:

- Works with `workflow-engine.cjs` phase transitions
- Integrates with `saga-coordinator.cjs` for rollback
- Uses `checkpoint-manager.cjs` patterns for state persistence

**Test Coverage**: 49 tests across 3 modules, all passing

---

## [2026-01-25] Phase 4: CLI and Comprehensive Tests Created

**Files Created**:

- `.claude/lib/workflow-cli.cjs` - Command-line interface for workflow execution
- `.claude/lib/workflow-cli.test.cjs` - 26 tests for CLI
- `.claude/lib/workflow-validator.cjs` - EVOLVE workflow YAML validator
- `.claude/lib/workflow-validator.test.cjs` - 19 tests for validator
- `.claude/lib/workflow-integration.test.cjs` - 24 comprehensive integration tests
- `.claude/scripts/run-workflow-tests.cjs` - Test runner script

**Key Features**:

### Workflow CLI

- Commands: create, update, resume, list, status, rollback
- Flags: --dry-run, --verbose, --help
- Workflow path resolution for creator/updater workflows
- Exports: `WorkflowCLI`, `parseArgs`, `COMMANDS`, `WORKFLOW_TYPES`

### Workflow Validator

- EVOLVE phase validation (all 6 phases required)
- Gate validation (assertion, research, file_exists, registration)
- Rollback configuration validation
- Iron laws checking in metadata
- Duplicate step ID detection
- Exports: `WorkflowValidator`, `validateEvolvePhases`, `EVOLVE_PHASES`

### Integration Tests

- Full workflow execution end-to-end
- Cross-workflow triggering
- Checkpoint and resume
- Rollback scenarios (saga coordinator)
- System registration
- Evolution state sync
- Error handling and recovery
- Workflow validation integration

**Test Coverage Summary**:

- CLI tests: 26 passed
- Validator tests: 19 passed
- Integration tests: 24 passed
- **Total: 69 tests, all passing**

**Bug Fix Applied**: Checkpoint test used incompatible checkpoint managers. `WorkflowEngine.checkpoint()` saves to plain JSON files, while `CheckpointManager` expects gzipped files with different structure. Fixed by using consistent `WorkflowEngine.checkpoint()/resume()` methods in the test.

**CLI Commands**:

```bash
# Run all tests
node .claude/scripts/run-workflow-tests.cjs

# Run specific suite
node .claude/scripts/run-workflow-tests.cjs --cli
node .claude/scripts/run-workflow-tests.cjs --validator
node .claude/scripts/run-workflow-tests.cjs --integration

# Show help
node .claude/scripts/run-workflow-tests.cjs --help
```

**Executable Workflow Ecosystem Complete**:

- Core engine: `workflow-engine.cjs` (55 tests)
- Checkpoint manager: `checkpoint-manager.cjs`
- Saga coordinator: `saga-coordinator.cjs`
- Step validators: `step-validators.cjs`
- Cross-workflow trigger: `cross-workflow-trigger.cjs` (14 tests)
- System registration: `system-registration-handler.cjs` (13 tests)
- Evolution state sync: `evolution-state-sync.cjs` (22 tests)
- CLI: `workflow-cli.cjs` (26 tests)
- Validator: `workflow-validator.cjs` (19 tests)
- Integration tests: `workflow-integration.test.cjs` (24 tests)
- Creator workflows: 6 YAML files in `.claude/workflows/creators/`
- Updater workflows: 6 YAML files in `.claude/workflows/updaters/`

---

## [2026-01-25] Scientific-Skills Router Registration Completed

**Problem**: Scientific-skills (139 sub-skills) were in skill-catalog but NOT detectable by router-enforcer.cjs.

**Root Cause**: Missing `scientific` intent in:

1. `intentKeywords` object (keyword arrays)
2. `INTENT_TO_AGENT` mapping
3. `domainBoosts` for python-pro

**Fix Applied**:

1. **Added scientific intent keywords** (40+ keywords):
   - Core: scientific, science, research, laboratory, lab
   - Chemistry: chemistry, chemical, molecule, compound, rdkit, cheminformatics
   - Biology: biology, bioinformatics, genomics, gene, protein, dna, rna
   - Tools: scanpy, biopython, chembl, uniprot, pubchem
   - Medical: drug discovery, pharma, clinical, medical, clinical trials
   - Analysis: statistics, visualization, matplotlib, seaborn, plotly

2. **Added INTENT_TO_AGENT mapping**:

   ```javascript
   scientific: 'python-pro',
   ```

3. **Enhanced python-pro domainBoosts** with scientific keywords for high-confidence routing.

**Files Modified**:

- `.claude/hooks/routing/router-enforcer.cjs`

**Verification**:

- Syntax check: PASSED
- Keyword presence: CONFIRMED
- Mapping presence: CONFIRMED
- Domain boosts: CONFIRMED

**Router Detection Examples** (now working):

- "analyze this RNA-seq data" -> scientific intent -> python-pro + scientific-skills
- "review the chemistry literature" -> scientific intent
- "use rdkit to compute molecular properties" -> scientific intent

---

## [2026-01-25] Agent-Skill Discovery Gap Remediation

**Problem**: 85% of agents (34/40) had NO skill guidance whatsoever. Agents could not discover or use skills effectively, leading to underutilization of the skill ecosystem.

**Solution Architecture** (5 Phases):

### Phase 1: Agent-Skill Matrix (Centralized Discovery)

- Created `.claude/context/config/agent-skill-matrix.json`
- Maps all 45 agents to their skills (primary, secondary, contextual)
- Single source of truth for agent-to-skill relationships
- Agents can query matrix to discover relevant skills

**Pattern**: Central matrix pattern for M:N mappings

```json
{
  "agents": {
    "developer": {
      "primary_skills": ["tdd", "debugging", "git-expert"],
      "secondary_skills": ["code-analyzer", "test-generator"],
      "contextual_skills": { "security_changes": ["security-architect"] }
    }
  }
}
```

### Phase 2: Skill Invocation Protocol Template

- Created `.claude/templates/agent-skill-invocation-section.md`
- Standardized template embedded in ALL 45 agent definitions
- Includes examples, contextual triggers, and lookup guidance
- Prevents inconsistent skill guidance across agents

**Pattern**: Template injection for consistent documentation

```markdown
## Skill Invocation Protocol

### Primary Skills (Always Load)

- Skill({ skill: "tdd" }) - Test-driven development
  ...

### Contextual Skills (Load When Relevant)

| Trigger          | Skill              | Reason             |
| ---------------- | ------------------ | ------------------ |
| Security changes | security-architect | Review auth/crypto |
```

### Phase 3: Skill Consolidation with Aliases

- Merged testing-expert -> tdd (alias added)
- Merged writing -> writing-skills (alias added)
- Added cross-references between 6 related skill pairs

**Pattern**: Alias-based deprecation preserves backward compatibility

```markdown
**Aliases**: `testing-expert` (deprecated, use this skill)
```

### Phase 4: New Domain Agents (via EVOLVE)

- scientific-research-expert (139 scientific sub-skills)
- ai-ml-specialist (ML/AI frameworks)
- android-pro (native Android, parity with ios-pro)
- gamedev-pro (Unity/Unreal/Godot)
- web3-blockchain-expert (Solidity/DeFi)

### Phase 5: Validation

- 45/45 agents validated for skill protocol presence
- 204/204 validation tests passed
- All registries updated (CLAUDE.md, router-enforcer.cjs, skill-catalog.md)

**Key Learnings**:

1. **Discoverability gap is invisible**: Agents worked but underperformed silently
2. **Central matrix enables programmatic lookup**: Better than scattered documentation
3. **Templates ensure consistency**: All 45 agents now have identical skill guidance structure
4. **Aliases prevent breaking changes**: Deprecate via alias, not deletion

---

## [2026-01-25] GameDev-Pro Agent Created via EVOLVE Workflow

**Agent Created**: `gamedev-pro` at `.claude/agents/domain/gamedev-pro.md`

**Purpose**: Multi-engine game development expert for Unity, Unreal Engine, and Godot with expertise in ECS architecture, game loops, shaders, physics, game AI, and cross-platform optimization.

**EVOLVE Phases Completed**:

- **EVALUATE**: Confirmed need - existing `gamedev-expert` skill only covers DragonRuby patterns
- **VALIDATE**: No naming conflicts, follows kebab-case convention
- **OBTAIN**: 3 Exa queries executed, 7+ sources consulted
- **LOCK**: Agent created with 378 lines, 12 capability subsections
- **VERIFY**: All 7 assigned skills verified to exist
- **ENABLE**: Routing table and router-enforcer.cjs updated

**Skills Assigned**:

- task-management-protocol, tdd, debugging, git-expert, verification-before-completion, gamedev-expert, cpp

**Registrations**:

- CLAUDE.md routing table: `| Game development | gamedev-pro | .claude/agents/domain/gamedev-pro.md |`
- router-enforcer.cjs: `INTENT_TO_AGENT.gamedev = 'gamedev-pro'`
- router-enforcer.cjs: `domainBoosts['gamedev-pro']` with 30+ keywords

**Research Report**: `.claude/context/artifacts/research-reports/gamedev-pro-research.md`

**Domains Covered**: Unity (C#), Unreal Engine 5 (C++/Blueprints), Godot 4 (GDScript/C#), ECS, Game Physics, Shaders (HLSL/GLSL), Game AI (Behavior Trees, FSM, GOAP), Cross-platform

**Routing Keywords Added**:

- game, game development, gamedev, game engine, unity, unreal, godot
- ecs, entity component system, game loop, game physics, shader
- sprite, collision, physics engine, multiplayer, netcode
- game ai, pathfinding, behavior tree, game state, level design
- procedural generation, fps, frame rate, gpu, rendering

---

## [2026-01-25] Agent-Creator Skill v2.1.0 - Template Gap Prevention

**Problem**: Audit found 52 gaps across 5 newly created agents - missing Response Approach, Behavioral Traits, Example Interactions sections.

**Root Cause**: Agent-creator template lacked these sections and had no validation requiring them.

**Fix Applied to `.claude/skills/agent-creator/SKILL.md`**:

1. **Added to Template (Step 5)**:
   - Response Approach section with 8 numbered steps
   - Behavioral Traits section with 10+ placeholder traits
   - Example Interactions section with 8+ placeholder examples

2. **Added Validation Rules (Step 6)**:
   - Model Validation: base name only (haiku/sonnet/opus), NO dated versions
   - Extended Thinking warning: NOT standard, requires justification
   - MCP Tools warning: causes router enforcement failures

3. **Added Reference Agent Section**:
   - python-pro.md designated as canonical reference
   - Comparison checklist before finalizing any agent

4. **Added Iron Law #10**:

   ```
   10. NO AGENT WITHOUT RESPONSE APPROACH
       - Every agent MUST have Response Approach section with 8 numbered steps
       - Every agent MUST have Behavioral Traits section with 10+ domain-specific traits
       - Every agent MUST have Example Interactions section with 8+ examples
       - Without these sections, execution strategy is undefined
       - Reference python-pro.md for canonical structure
   ```

5. **Updated Completion Checklist** with new requirements

**Version**: Bumped to 2.1.0

**Pattern**: Template-based enforcement prevents systematic gaps. Reference agent ensures consistency.

---

## [2026-01-25] Self-Healing System Security Review Completed

**Security Review Report**: `.claude/context/artifacts/reports/security-review-self-healing.md`

**Key Security Patterns Identified**:

### 1. Immutable Security Core Pattern

When implementing self-modifying systems, define a set of PROTECTED_PATHS that cannot be modified without explicit human approval:

- Security hooks (`.claude/hooks/safety/*`)
- State management files (`router-state.cjs`)
- Enforcement hooks (`task-create-guard.cjs`, `router-write-guard.cjs`)
- Core instructions (CLAUDE.md Sections 1.1-1.3, 6)

**Implementation**: Use a PreToolUse hook that blocks Edit/Write to protected paths unless a one-time environment token is provided.

### 2. Circuit Breaker Pattern for Self-Healing

Prevent runaway self-healing loops with:

- **Failure threshold**: 5 consecutive failures triggers OPEN state
- **Hourly limit**: Max 10 self-heal attempts per hour
- **Cooldown period**: 30 minutes before retry allowed
- **State machine**: CLOSED -> OPEN -> HALF-OPEN -> (test) -> CLOSED/OPEN

**State File**: `.claude/context/runtime/self-healing-state.json`

### 3. Tamper-Evident Audit Trail Pattern

For self-modifying systems, use append-only logs with integrity chains:

- Each entry includes SHA-256 hash of previous entry
- Verify chain integrity on session start
- Use JSONL format for easy parsing
- Archive after 1000 entries

**Log Location**: `.claude/context/audit/self-modification-log.jsonl`

### 4. Reflection Agent Sandbox Pattern

Reflection/metacognition agents should have constrained capabilities:

- **ALLOWED**: Read, analyze, propose, update memory files
- **PROHIBITED**: Direct modification of hooks, CLAUDE.md, router state
- Proposals must go through EVOLVE workflow with human gates

### 5. Human-in-the-Loop Gate Pattern

Critical operations require mandatory human approval:

- Elevated permissions (Bash, Edit, Write tools in agents)
- Hook modifications
- CLAUDE.md routing changes
- Self-healing after repeated failures

**Timeout**: 5 minutes (abort if no response)

### Risk Assessment Findings

| Risk Category        | Highest Risk                | Recommended Control   |
| -------------------- | --------------------------- | --------------------- |
| Self-modification    | Security hook tampering     | Protected paths guard |
| Infinite loops       | Runaway self-healing        | Circuit breaker       |
| Privilege escalation | Agent with elevated perms   | Human approval gates  |
| Data integrity       | Audit log tampering         | Integrity chain       |
| Bypass attempts      | Reflection disabling guards | Sandbox constraints   |

**ADR**: ADR-016 in `.claude/context/memory/decisions.md`

---

## [2026-01-25] Reflection Trigger Hooks Created

**Files Created**:

- `.claude/hooks/reflection/task-completion-reflection.cjs` - PostToolUse(TaskUpdate) when status=completed

## [SECURITY] Security Hook Fail-Closed Pattern

**Importance**: CRITICAL

**Pattern Learned**: Security hooks MUST fail closed (deny on error) to prevent bypass via induced errors.

**Wrong Pattern**:

```javascript
} catch (err) {
  // Fail open to avoid blocking legitimate work
  process.exit(0);  // WRONG: Allows bypass via induced errors
}
```

**Correct Pattern**:

```javascript
} catch (err) {
  // Allow debug override for troubleshooting
  if (process.env.HOOK_FAIL_OPEN === 'true') {
    process.exit(0);
  }

  // Audit log the error
  console.error(JSON.stringify({
    hook: 'hook-name',
    event: 'error_fail_closed',
    error: err.message,
    timestamp: new Date().toISOString()
  }));

  // Fail closed: deny when security state unknown
  process.exit(2);
}
```

**Files Fixed**: `task-create-guard.cjs`, `loop-prevention.cjs`

**Pattern Learned**: Always use `spawnSync()` with array arguments and `shell: false` instead of `execSync()` with string interpolation.

**Wrong Pattern**:

```javascript
execSync(`node "${filePath}" ${args.join(' ')}`, { cwd: root }); // VULNERABLE
```

**Correct Pattern**:

```javascript
// 1. Validate paths first
function isPathSafe(filePath) {
  const dangerousChars = [
    '$',
    '`',
    '|',
    '&',
    ';',
    '(',
    ')',
    '<',
    '>',
    '!',
    '*',
    '?',
    '[',
    ']',
    '{',
    '}',
    '\n',
    '\r',
  ];
  return !dangerousChars.some(char => filePath.includes(char));
}

if (!isPathSafe(filePath)) {
  throw new Error('Invalid path');
}

// 2. Use spawnSync with array args
const result = spawnSync('node', [filePath, ...args], {
  cwd: root,
  shell: false, // CRITICAL: Prevents shell interpretation
});
```

**Files Fixed**: `swarm-coordination.cjs`, `format-memory.cjs`

**Pattern Learned**: Security hooks with environment variable overrides MUST log when overrides are used.

**Implementation**:

```javascript
if (enforcementMode === 'off') {
  console.error(
    JSON.stringify({
      hook: 'hook-name',
      event: 'security_override_used',
      override: 'ENV_VAR=off',
      timestamp: new Date().toISOString(),
      warning: 'Security enforcement disabled',
    })
  );
  process.exit(0);
}
```

**Files Updated**: `task-create-guard.cjs`, `router-write-guard.cjs`, `file-placement-guard.cjs`, `loop-prevention.cjs`

---

## [SECURITY] Pre-Implementation Security Review Pattern

**Date**: 2026-01-26
**Importance**: HIGH

**Pattern Learned**: Security review of implementation tasks BEFORE development prevents costly rework.

**Review Structure**:

1. Read target files to understand current implementation
2. Analyze proposed changes against STRIDE threat model
3. Identify security concerns specific to the change
4. Document required safeguards as implementation conditions
5. Update task descriptions with security requirements
6. Add issues to issues.md for tracking

**Key Security Patterns for Common Changes**:

| Change Type        | Top Security Concerns                        |
| ------------------ | -------------------------------------------- |
| Retry/concurrency  | DoS via infinite loops, version manipulation |
| Event handlers     | Memory exhaustion, handler spoofing          |
| Sync to async I/O  | TOCTOU races, error handling, atomic writes  |
| State file changes | Tampering, fail-closed on errors             |

**Verdict Categories**:

- **APPROVED**: No security concerns
- **APPROVED_WITH_CONDITIONS**: Safe with documented safeguards
- **REJECTED**: Fundamental security flaw requiring redesign

**Output Artifacts**:

- Security review report: `.claude/context/artifacts/security-review-*.md`
- Issues added to: `.claude/context/memory/issues.md` with SEC-IMPL-\* prefix
- Task descriptions updated with security requirements

---

## [SECURITY] Auto-Spawn Security Patterns

**Date**: 2026-01-26
**Importance**: HIGH

**Security Review Report**: `.claude/context/artifacts/reports/security-review-evolve-auto-start.md`

**Pattern Learned**: When implementing features that automatically spawn agents or perform automated actions based on state:

1. **Circuit Breaker Integrity**
   - Store rate limit state with HMAC integrity check
   - Use monotonic counters (timestamp arrays) instead of window-based limits
   - Window-based limits are vulnerable to clock manipulation
   - Consider storing circuit breaker state in tamper-resistant location

2. **Recursive Spawn Prevention**
   - Track spawn depth in state (`spawnDepth` field)
   - Block auto-spawn if already in an automated flow (depth > 0)
   - Prevents infinite spawn loops

3. **Sensitive Path Blocking**
   - Maintain blocklist of paths that should never trigger automation:
     - `.env` files
     - Credential files (`credential`, `secret`, `password`)
     - Security hooks (`.claude/hooks/safety/`)
     - Core config (`.claude/CLAUDE.md`)
     - Internal libs (`.claude/lib/`)
   - Audit log blocked attempts

4. **Path Sanitization for Prompts**
   - When passing file paths to spawned agents via prompts, sanitize first
   - Remove shell metacharacters: `` `$(){}[]\\|&;<>! ``
   - Remove newlines (prompt injection vector)
   - Limit length to prevent prompt overflow (500 chars max)

5. **Fail-Closed Auto-Spawn**
   - Wrap all auto-spawn logic in try-catch
   - On any error, do NOT spawn (fail closed)
   - Provide audited HOOK_FAIL_OPEN override for debugging only
   - Always audit log the error event

6. **State File Parsing Consistency**
   - Apply SEC-007 safeJSONParse pattern to ALL state files
   - `evolution-state.json` currently uses raw JSON.parse() - needs fix
   - Add schema to `safe-json.cjs` SCHEMAS object for each state file
   - Strip unknown properties, block prototype pollution keys

**STRIDE Analysis for Auto-Spawn Features**:

| Threat                 | Mitigation                                     |
| ---------------------- | ---------------------------------------------- |
| Spoofing               | Validate state file integrity with HMAC        |
| Tampering              | Fail-closed on parse errors, schema validation |
| Repudiation            | Comprehensive audit logging for all events     |
| Information Disclosure | Sanitize paths before including in prompts     |
| Denial of Service      | Circuit breaker, spawn depth tracking          |
| Elevation of Privilege | Sensitive path blocklist, default disabled     |

**Related Issues**: SEC-AS-001 through SEC-IV-002 in issues.md

---

## [SECURITY] EVOLVE Auto-Start Security Implementation

**Date**: 2026-01-26
**Importance**: HIGH

**Task #1**: Fix P0 security issues in EVOLVE auto-start feature

**Security Fixes Implemented**:

1. **Tamper-Resistant Circuit Breaker (SEC-AS-001)**
   - Pattern: Use timestamp arrays instead of simple counters
   - Reason: Counters can be reset to 0; timestamps must be valid ISO dates within the time window
   - Implementation: `circuitBreaker.timestamps` array in evolution-state.json

2. **Safe JSON Parsing (SEC-SF-001)**
   - Pattern: Use `safeParseJSON()` with schema validation for all state files
   - Reason: Prevents prototype pollution and property injection attacks
   - Implementation: Added `evolution-state` schema to safe-json.cjs

3. **Spawn Depth Tracking (SEC-AS-004)**
   - Pattern: Track spawn depth to prevent recursive spawn loops
   - Reason: Auto-spawn inside auto-spawn creates infinite loop
   - Implementation: `spawnDepth` field in evolution state, `checkSpawnDepth()` function

4. **Path Sanitization (SEC-IV-001)**
   - Pattern: Sanitize file paths before including in agent prompts
   - Reason: Shell metacharacters and newlines can enable prompt injection
   - Implementation: `sanitizePathForPrompt()` strips dangerous characters

5. **Sensitive Path Blocking (SEC-IV-002)**
   - Pattern: Blocklist for paths that should never trigger automation
   - Reason: Security hooks, credentials, and env files must not be auto-evolved
   - Implementation: `SENSITIVE_PATH_PATTERNS` array, `isSensitivePath()` function

**Test-Driven Development Applied**:

- 27 new security tests written before implementation (RED phase)
- All 94 tests passing after implementation (GREEN phase)
- Test suites: SEC-AS-001, SEC-SF-001, SEC-AS-004, SEC-IV-001, SEC-IV-002

**Files Modified**:

- `.claude/hooks/safety/file-placement-guard.cjs` - Main security fixes
- `.claude/hooks/safety/file-placement-guard.test.cjs` - 27 new security tests
- `.claude/lib/utils/safe-json.cjs` - Added evolution-state schema

---

## [SECURITY] SEC-008: Fail-Closed Security Hooks

**Date**: 2026-01-26
**Importance**: CRITICAL

**Pattern Applied**: Security hooks MUST fail closed (exit 2) on errors to prevent bypass via induced errors.

**Files Fixed**:

- {"result":"allow","message":"No input provided"} - Changed catch block from exit(0) to exit(2)
- - Changed catch block from exit(0) to exit(2)
- - Changed catch block from exit(0) to exit(2)
- - Added try-catch wrapper with audit logging

**Pattern**:
\
**Exception**: PostToolUse hooks (like extract-workflow-learnings.cjs) should fail open since the tool has already executed, but still audit log errors.

**Test Isolation Fix**: Test files using router-state.cjs must call after directly writing to the state file to avoid stale cache.

---

## [IMPLEMENTATION] State Cache Implementation

**Date**: 2026-01-26
**Importance**: MEDIUM

**Pattern Implemented**: TTL-based caching layer for state files.

**Module**: `.claude/lib/utils/state-cache.cjs`

**Problem Solved**: Multiple hooks reading the same state files (e.g., `router-state.json`) independently, causing 10-15 redundant file reads per Edit/Write operation.

**API**:

```javascript
const {
  getCachedState,
  invalidateCache,
  clearAllCache,
  DEFAULT_TTL_MS,
} = require('./state-cache.cjs');

// Read with caching (1 second TTL default)
const state = getCachedState('/path/to/router-state.json', {});

// Custom TTL (5 seconds)
const state = getCachedState('/path/to/file.json', {}, 5000);

// Invalidate after writing to file
invalidateCache('/path/to/router-state.json');

// Clear all cached data
clearAllCache();
```

**Design Decisions**:

1. **1-second default TTL** - Balances freshness with I/O reduction. Sequential hooks in same tool operation will share cache.
2. **Module-level Map cache** - Works across the process lifetime, cleared on process restart.
3. **Graceful degradation** - Returns default value on any error (missing file, parse error, permission error).
4. **Debug mode** - Set `STATE_CACHE_DEBUG=true` for error logging.

**Expected Impact**: ~60% reduction in state file I/O per Edit/Write operation.

**Integration Points** (Task #3 will address):

- `router-state.cjs` - Reads router-state.json
- `task-create-guard.cjs` - Reads router-state.json
- Other hooks reading state files

**Test Coverage**: 19 tests covering:

- Basic read/cache operations
- TTL expiration
- Cache invalidation
- Error handling (missing files, parse errors, permission errors)
- Edge cases (null, arrays, empty objects)

**Task #3 Completed**: Integrated state-cache.cjs into router-state.cjs to reduce redundant file I/O.

**Changes Made**:

1. Modified `getState()` to use `getCachedState()` instead of direct `fs.readFileSync()`
2. Modified `saveState()` to call `invalidateCache()` after writing to ensure consistency
3. Added `sanitizeParsedState()` helper to maintain SEC-007 protection on cached data
4. Exported `invalidateStateCache()` for testing and external use

**Impact**:

- All hooks that import router-state.cjs now automatically benefit from caching
- Affected hooks: `router-self-check.cjs`, `router-write-guard.cjs`, `task-create-guard.cjs`, `agent-context-tracker.cjs`, etc.
- Multiple `getState()` calls within 1 second share cached data
- Estimated I/O reduction: ~60% for hooks reading router-state.json

**Test Coverage**:

- Added 2 new tests to router-state.test.cjs (Tests 10 and 11)
- Test 10: Verifies caching reduces file I/O (cache hit within TTL)
- Test 11: Verifies saveState invalidates cache for consistency
- Total: 61 tests passing for router-state.cjs

**Design Decisions**:

1. **Cache at the module level**: Instead of modifying each hook individually, caching was added to the central `router-state.cjs` module. This provides automatic benefits to all consumers.
2. **SEC-007 maintained**: Added `sanitizeParsedState()` to ensure prototype pollution prevention still applies to cached data.
3. **Explicit invalidation**: `saveState()` explicitly invalidates cache to prevent stale reads after writes.

---

## [SECURITY] SEC-PT-001: Path Traversal Validation

**Date**: 2026-01-26
**Importance**: MEDIUM

**Pattern Implemented**: Added path traversal validation to file-placement-guard.cjs to prevent directory escape attacks.

**Vulnerability**: Without path traversal validation, attackers could escape PROJECT_ROOT using:

- Basic traversal: `../../../etc/passwd`
- URL-encoded traversal: `%2e%2e/%2e%2e/etc/passwd`
- Double-URL-encoded: `%252e%252e/%252e%252e/etc/passwd`
- Null byte injection: `file.txt\x00../../etc/passwd`
- Backslash on Windows: `..\\..\\etc\\passwd`

**Implementation**:

1. **PATH_TRAVERSAL_PATTERNS** - Regex patterns to detect traversal:
   - `/\.\./` - Basic traversal
   - `/%2e%2e/i` - URL-encoded traversal
   - `/%252e%252e/i` - Double URL-encoded
   - `/\x00/` - Null bytes

2. **isPathSafe(filePath, projectRoot)** - Validates paths:
   - Fail-closed: Rejects null/undefined/empty paths
   - Checks patterns BEFORE path resolution
   - Resolves path and ensures it stays within PROJECT_ROOT
   - Cross-platform: Normalizes slashes for Windows/Unix

3. **Integration in main()** - Called early in hook execution:
   - After getting file path, before EVOLVE enforcement
   - Audit logs blocked attempts with JSON
   - Human-readable error message
   - Exit code 2 (blocked)

**Audit Log Format**:

```json
{
  "hook": "file-placement-guard",
  "event": "path_traversal_blocked",
  "tool": "Write",
  "path": "../../../etc/passwd",
  "reason": "Path contains traversal sequence or invalid characters",
  "timestamp": "...",
  "severity": "CRITICAL"
}
```

**Test Coverage**: 14 tests for isPathSafe() covering:

- Simple traversal, backslash traversal
- Traversal in middle of path
- Paths resolving outside PROJECT_ROOT
- Safe paths, relative paths
- URL-encoded, double-URL-encoded traversal
- Null bytes, empty/null/undefined paths
- Absolute paths outside root
- Symlink-like escapes

**Total Tests**: 108 tests passing in file-placement-guard.test.cjs

---

## [PATTERN] Async I/O Pattern for Memory Module

**Date**: 2026-01-26
**Importance**: MEDIUM

**Pattern Implemented**: Added async versions of hot-path I/O functions with `Async` suffix.

**Security Requirements Met**:

1. **NO exists() checks** - Use try/catch with ENOENT handling

   ```javascript
   async function readMemoryAsync(file) {
     try {
       return await fsp.readFile(file, 'utf8');
     } catch (err) {
       if (err.code === 'ENOENT') return null;
       throw err;
     }
   }
   ```

2. **Atomic write pattern** - temp file + rename for crash safety

   ```javascript
   async function atomicWriteAsync(path, data) {
     const tmp = `${path}.${process.pid}.tmp`;
     try {
       await fsp.writeFile(tmp, data, 'utf8');
       await fsp.rename(tmp, path);
     } catch (err) {
       try {
         await fsp.unlink(tmp);
       } catch {}
       throw err;
     }
   }
   ```

3. **Explicit error handling** - All async operations wrapped in try/catch

**Functions Added to memory-manager.cjs**:

- `readMemoryAsync(file)` - Returns content or null (ENOENT)
- `atomicWriteAsync(path, data)` - Atomic write with temp+rename
- `ensureDirAsync(dirPath)` - mkdir with recursive (no exists check)
- `recordGotchaAsync(gotcha, projectRoot)` - Async gotcha recording
- `recordPatternAsync(pattern, projectRoot)` - Async pattern recording
- `loadMemoryForContextAsync(projectRoot)` - Async memory loading

**Backward Compatibility**: Sync versions preserved for existing callers.

**Test Framework Fix**: When using async tests with simple test framework, the `it()` and `describe()` functions must be async and await their callbacks. Without this, tests run in parallel causing race conditions.

---

## [PATTERN] Event Handler Deduplication Pattern

**Date**: 2026-01-26
**Importance**: MEDIUM

**Pattern Implemented**: Added Set-based event handler deduplication to prevent memory leaks from duplicate handlers.

**Problem Solved**: Memory exhaustion from repeated handler registrations (SEC-IMPL-003, CWE-770).

**Implementation in workflow-engine.cjs**:

1. **MAX_HANDLERS constant** - Limits handlers per event (default: 100)
2. **handlerRegistry** - Map<event, Set<handlerId>> for deduplication
3. **handlerIdMap** - Map<handler, {event, id}> for reverse lookup on off()
4. **onWithId(event, handler, id)** - Returns boolean, rejects duplicates
5. **clearHandlers(event?)** - Clears all or specific event handlers
6. **getHandlerCount(event)** - Returns handler count for monitoring

**Key Design Decisions**:

1. **Reverse mapping for off()** - When `off(event, handler)` is called without ID, the handlerIdMap lookup allows automatic cleanup of the registry entry.
2. **Silent duplicate rejection** - `onWithId()` returns false for duplicates without logging (noise reduction).
3. **Limit logging** - Only logs when MAX_HANDLERS limit is reached (important security events).
4. **Preserved existing on/off** - Legacy code using `on()` without IDs continues to work.

**Test Coverage**: 12 tests added covering:

- MAX_HANDLERS export
- Duplicate prevention
- Different IDs allowed
- Handler limit enforcement (logs when reached)
- Separate tracking per event type
- clearHandlers() all vs specific
- Re-registration after clear
- Handler count tracking
- off() integration with reverse lookup
- Set-based internal structure

**API Usage**:

```javascript
const engine = new WorkflowEngine('/path/to/workflow.yaml');

// Register with deduplication
const ok = engine.onWithId('phase:start', handler, 'my-unique-id');
if (!ok) console.log('Handler already registered or limit reached');

// Check count
const count = engine.getHandlerCount('phase:start');

// Clean up on workflow completion
engine.clearHandlers(); // Clear all
engine.clearHandlers('phase:start'); // Clear specific event

// off() automatically cleans up registry via reverse lookup
engine.off('phase:start', handler);
```

**Files Modified**:

- `.claude/lib/workflow/workflow-engine.cjs` - Implementation
- `.claude/lib/workflow/workflow-engine.test.cjs` - 12 new tests

**Total Tests**: 67 tests passing

---

## [PATTERN] Cross-Reference Analysis Pattern

**Date**: 2026-01-26
**Importance**: MEDIUM

