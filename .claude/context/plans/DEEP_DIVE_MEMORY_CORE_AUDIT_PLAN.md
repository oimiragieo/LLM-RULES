# DEEP DIVE AUDIT PLAN: .claude Memory System & Core Application

**Generated**: 2026-02-04
**Author**: Planner Agent (Opus)
**Version**: 1.0
**Scope**: 100% Critical Audit - Memory System + Core Application Fundamentals

---

## Executive Summary

This audit plan addresses the user request for a **ruthlessly thorough** 100% critical audit of:
1. `.claude` memory system (learnings.md, decisions.md, issues.md, active_context.md, memory.db, access stats)
2. Core application fundamentals (hooks, config, agent registry, spawn validation, routing enforcement, creator workflows)

**Known Critical Issues from Memory Files**:
- `decisions.md` at 27,572 tokens - EXCEEDS 25,000 token Read limit
- `agent-config.json` uses deprecated `thinkingDefault` instead of explicit `model` field
- `TASKUPDATE-001` TaskUpdate enforcement NOT registered (only tracked)
- `TOOL-001` MCP tool references in 14 agents but `mcpServers: {}` is empty

---

## Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Validate audit methodology and identify all audit domains
**Duration**: 1 hour
**Parallel OK**: No (blocking for subsequent phases)

### Research Requirements

- [x] Memory files read (learnings.md, issues.md, decisions.md chunk, active_context.md)
- [x] Configuration files read (settings.json, agent-config.json, agent-registry.json)
- [x] State files read (maintenance-status.json, loop-state.json, access-stats.json)
- [x] Prior audit reports reviewed (issues.md contains comprehensive history)

### Constitution Checkpoint - PASSED

1. **Research Completeness**: Memory files analyzed, 8+ configuration sources reviewed
2. **Technical Feasibility**: All audit targets accessible via Read/Grep tools
3. **Security Review**: No security implications for audit (read-only operations)
4. **Specification Quality**: Clear acceptance criteria defined per audit domain

---

## Phase 1: Memory System Audit (DISCOVERY)

**Purpose**: Deep audit of memory system health, integrity, and functionality
**Duration**: 2-3 hours
**Dependencies**: Phase 0 complete
**Parallel OK**: Yes (1.1-1.5 can run concurrently)

### Task 1.1: Memory Files Inventory & Integrity

**Agent**: developer
**Priority**: P1 (Critical)

**Checks**:
- [ ] **1.1.1** Verify all memory files exist:
  - `.claude/context/memory/learnings.md`
  - `.claude/context/memory/decisions.md`
  - `.claude/context/memory/issues.md`
  - `.claude/context/memory/active_context.md`
  - `.claude/data/memory.db` (SQLite)
  - `.claude/context/memory/access-stats.json`

- [ ] **1.1.2** Check file sizes against limits:
  | File | Current Size | Limit | Status |
  |------|-------------|-------|--------|
  | learnings.md | ~452 lines | 1500 lines | HEALTHY |
  | decisions.md | ~27,572 tokens | 25,000 tokens | **CRITICAL: OVER LIMIT** |
  | issues.md | ~1000 lines | 1500 lines | HEALTHY |
  | active_context.md | ~83 lines | 500 lines | HEALTHY |

- [ ] **1.1.3** Verify markdown structure integrity (headers, formatting)

- [ ] **1.1.4** Check for orphaned archive files in `.claude/context/memory/archive/`

**Evidence Required**:
- File size measurements
- Token count for decisions.md
- List of any corrupted or malformed files

**Command**:
```bash
wc -l .claude/context/memory/*.md
node -e "console.log(require('fs').readFileSync('.claude/context/memory/decisions.md', 'utf8').split(/\\s+/).length)"
```

**Verify**: All files exist, decisions.md identified for archival

---

### Task 1.2: SQLite Database Validation

**Agent**: developer
**Priority**: P1 (Critical)

**Checks**:
- [ ] **1.2.1** Verify `.claude/data/memory.db` exists and is valid SQLite
- [ ] **1.2.2** Check database schema matches expected structure
- [ ] **1.2.3** Verify entity sync status (ADRs synced from decisions.md)
- [ ] **1.2.4** Check for orphaned entities (in DB but not in source files)
- [ ] **1.2.5** Verify entity relationships are intact

**Known Issue from Memory**:
- SQLite had only 16/38 decisions (42% synced) before re-sync on 2026-02-04
- After re-sync: 35 ADRs (92%)
- 3 ADRs may have format variations EntityExtractor doesn't recognize

**Evidence Required**:
- Database file size and integrity check
- Entity count by type (decisions, learnings, issues)
- Comparison: entities in DB vs. entities in source files

**Command**:
```bash
node -e "const db = require('better-sqlite3')('.claude/data/memory.db'); console.log(db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type').all())"
```

**Verify**: Database valid, entity sync >= 90%

---

### Task 1.3: Access Patterns Analysis

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **1.3.1** Analyze `access-stats.json` for:
  - Most accessed entries (top 10)
  - Stale entries (not accessed in 30+ days)
  - Duplicate entries (similar content)

- [ ] **1.3.2** Verify access tracking is working:
  - Check `lastAccessed` timestamps are updating
  - Verify `accessCount` increments on read

- [ ] **1.3.3** Identify potential cold storage candidates

**Current State from Memory**:
- 10 entries tracked in access-stats.json
- Most entries have accessCount of 15-18
- Last accessed: 2026-02-05 (active)

**Evidence Required**:
- Access frequency histogram
- List of stale entries (candidates for archival)
- Duplicate detection results

**Verify**: Access tracking functional, no orphaned entries

---

### Task 1.4: Deduplication Effectiveness

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **1.4.1** Verify `memory-deduplicator.cjs` exists and is functional
- [ ] **1.4.2** Run deduplication on current memory files
- [ ] **1.4.3** Check maintenance-status.json for last deduplication run
- [ ] **1.4.4** Identify duplicate patterns in learnings.md

**Current State from Memory**:
- Last weekly deduplication: 2026-02-03 (success: true)
- Consolidation runs daily (success: true on 2026-02-04, 2026-02-05)

**Evidence Required**:
- Deduplication run results
- Count of duplicates found/removed
- Memory reduction percentage

**Command**:
```bash
node .claude/lib/memory/memory-deduplicator.cjs --dry-run
```

**Verify**: Deduplication functional, <5% duplicate rate

---

### Task 1.5: Memory Scheduler & Maintenance

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **1.5.1** Verify `memory-scheduler.cjs` is executing tasks
- [ ] **1.5.2** Check `maintenance-status.json` for:
  - Last daily run (should be within 24 hours)
  - Last weekly run (should be within 7 days)
  - Any failed tasks in history

- [ ] **1.5.3** Verify scheduled tasks:
  | Task | Schedule | Last Run | Status |
  |------|----------|----------|--------|
  | consolidation | daily | 2026-02-05 00:08:58 | SUCCESS |
  | healthCheck | daily | 2026-02-05 00:08:58 | SUCCESS |
  | metricsLog | daily | 2026-02-05 00:08:58 | SUCCESS |
  | summarization | weekly | 2026-02-03 05:18:32 | SUCCESS |
  | deduplication | weekly | 2026-02-03 05:18:32 | SUCCESS |
  | pruning | weekly | 2026-02-03 05:18:32 | SUCCESS |
  | archiveOldLTM | weekly | 2026-02-03 05:18:32 | SUCCESS |
  | weeklyReport | weekly | 2026-02-03 05:18:32 | SUCCESS |

- [ ] **1.5.4** Check for failed consolidation runs (history shows 3 failures on 2026-01-25/26, 2026-02-01)

**Evidence Required**:
- maintenance-status.json full analysis
- Failure root cause investigation
- Scheduler configuration validation

**Verify**: All scheduled tasks running, no recent failures

---

## Phase 2: Core System Validation

**Purpose**: Validate configuration, hooks, registry, and enforcement mechanisms
**Duration**: 3-4 hours
**Dependencies**: Phase 1 can run in parallel
**Parallel OK**: Yes (2.1-2.8 can run concurrently)

### Task 2.1: Configuration Validation

**Agent**: developer
**Priority**: P1 (Critical)

**Checks**:
- [ ] **2.1.1** Validate `config.yaml` structure and agent models
  - Current: planner=opus, developer=sonnet, qa=opus, architect=opus

- [ ] **2.1.2** Validate `settings.json` structure
  - Hook registrations complete
  - No orphaned hook references

- [ ] **2.1.3** Validate `agent-config.json` structure
  - **ISSUE FOUND**: Uses `thinkingDefault` instead of `model` field
  - Missing TaskUpdate in allowed tools for some agents

- [ ] **2.1.4** Check `.env.example` for required variables

- [ ] **2.1.5** Cross-validate:
  - config.yaml models match agent-registry.json preferredModel
  - agent-config.json tools match agent frontmatter allowed_tools

**Known Issues**:
- `agent-config.json` uses deprecated `thinkingDefault` instead of explicit `model`
- Mismatch between config sources (config.yaml vs agent-config.json)

**Evidence Required**:
- Configuration comparison matrix
- List of mismatches
- Recommended fixes

**Verify**: All configs valid, no critical mismatches

---

### Task 2.2: Hook Enforcement Audit

**Agent**: architect
**Priority**: P1 (Critical)

**Checks**:
- [ ] **2.2.1** Verify ALL hooks in `.claude/hooks/` are registered in `settings.json`

| Category | Hook | Registered | Matcher | Mode |
|----------|------|------------|---------|------|
| routing | user-prompt-unified.cjs | YES | UserPromptSubmit | block |
| routing | routing-guard.cjs | YES | Bash/Glob/Grep/WebSearch/Edit/Write/TaskCreate | block |
| routing | task-status-enforcement.cjs | YES | TaskUpdate | block |
| routing | config-model-validator.cjs | YES | Task | warn |
| routing | spawn-prompt-assembler.cjs | YES | Task | - |
| routing | tool-availability-validator.cjs | YES | Task | warn |
| routing | unified-creator-guard.cjs | YES | Edit/Write | block |
| safety | file-placement-guard.cjs | YES | Edit/Write | block |
| safety | write-content-scanner.cjs | YES | Edit/Write | block |
| safety | bash-cwd-validator.cjs | YES | Bash | block |
| safety | shell-injection-validator.cjs | YES | Bash | block |
| reflection | reflection-step0-guard.cjs | YES | TaskList | block |
| memory | memory-health-check.cjs | YES | UserPromptSubmit | - |
| memory | sync-memory-index.cjs | YES | Edit/Write/MemoryRecord | - |

- [ ] **2.2.2** Verify hook execution order (critical for security)

- [ ] **2.2.3** Check for unregistered hooks (files exist but not in settings.json)
  - task-completion-guard.cjs - **NOT REGISTERED** (TASKUPDATE-001)
  - Others to verify

- [ ] **2.2.4** Verify default enforcement modes match documentation:
  | Hook | Documented Default | Actual Default |
  |------|-------------------|----------------|
  | routing-guard | block | block |
  | spawn-prompt-validator | block | block (changed from warn) |
  | file-placement-guard | block | block |
  | creator-guard | block | block |

- [ ] **2.2.5** Test hook bypass scenarios (environment overrides)

**Evidence Required**:
- Complete hook registration audit
- Unregistered hooks list
- Mode verification results

**Verify**: All security hooks registered and in block mode

---

### Task 2.3: Agent Registry Validation

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **2.3.1** Verify `agent-registry.json` metadata:
  - totalAgents: 49
  - healthyAgents: 49
  - degradedAgents: 0

- [ ] **2.3.2** Cross-validate registry entries against filesystem:
  - Count agents in `.claude/agents/` subdirectories
  - Verify each registry entry has corresponding file
  - Verify no orphan files (in filesystem but not registry)

- [ ] **2.3.3** Verify agent health status:
  - All agents should be "healthy"
  - No isolation reasons

- [ ] **2.3.4** Validate agent capabilities match frontmatter

**Known State**:
- Registry generated: 2026-02-03T23:13:56.588Z
- All 49 agents healthy
- Last health check: 2026-02-03

**Evidence Required**:
- Agent count comparison (registry vs filesystem)
- Health status summary
- Orphan detection results

**Verify**: Registry accurate, all agents healthy

---

### Task 2.4: Task Tracking Protocol Compliance

**Agent**: architect
**Priority**: P1 (Critical)

**Checks**:
- [ ] **2.4.1** Verify TaskUpdate enforcement chain:
  | Step | Hook | Status |
  |------|------|--------|
  | PreToolUse(TaskUpdate) | task-status-enforcement.cjs | REGISTERED |
  | PreToolUse(TaskUpdate) | pre-completion-validation.cjs | REGISTERED |
  | PostToolUse(Task) | agent-context-tracker.cjs | REGISTERED |
  | PostToolUse(Task) | post-spawn-task-updater.cjs | REGISTERED |

- [ ] **2.4.2** Verify task-completion-guard.cjs status:
  - **ISSUE**: File exists but NOT REGISTERED in settings.json
  - This is TASKUPDATE-001 from issues.md

- [ ] **2.4.3** Check spawn template TaskUpdate warning box:
  - Universal template: 70-line warning box present
  - Orchestrator template: TaskUpdate protocol present

- [ ] **2.4.4** Verify router-state.json tracking:
  - `taskSpawned` tracking
  - `taskUpdatedCalls` tracking
  - Mode transitions

**Known Issue (TASKUPDATE-001)**:
- Documentation says TaskUpdate is "MANDATORY"
- task-completion-guard.cjs exists but NOT registered
- task-completion-guard.cjs only has warn/off modes, no block mode
- No enforcement that `TaskUpdate(in_progress)` is called first

**Evidence Required**:
- Hook registration status
- Template inspection results
- Gap analysis

**Verify**: Identify all TaskUpdate enforcement gaps

---

### Task 2.5: Router Gates Validation

**Agent**: architect
**Priority**: P1 (Critical)

**Checks**:
- [ ] **2.5.1** Verify Gate 1 (Complexity) enforcement:
  - routing-guard.cjs checks for multi-step, multi-file, architecture decisions
  - Planner-first enforcement active

- [ ] **2.5.2** Verify Gate 2 (Security) enforcement:
  - Security-architect required for auth/credentials changes
  - SECURITY_REVIEW_ENFORCEMENT variable functional

- [ ] **2.5.3** Verify Gate 3 (Tool) enforcement:
  - Router blacklist: Edit, Write, Bash, Glob, Grep, WebSearch
  - Whitelist: Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read

- [ ] **2.5.4** Verify Gate 4 (Creator Workflow) enforcement:
  - unified-creator-guard.cjs blocks direct writes to creator paths
  - Skill/agent/hook/workflow/template/schema paths protected

**Evidence Required**:
- Each gate test results
- Enforcement mode verification
- Bypass scenario testing

**Verify**: All 4 gates functional in block mode

---

### Task 2.6: Creator Workflows Validation

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **2.6.1** Verify skill-creator workflow:
  - skill-invocation-tracker.cjs tracking
  - unified-creator-guard.cjs blocking
  - Post-creation steps (CLAUDE.md update, catalog, assignment)

- [ ] **2.6.2** Verify agent-creator workflow:
  - Same pattern as skill-creator

- [ ] **2.6.3** Verify hook-creator workflow
- [ ] **2.6.4** Verify workflow-creator workflow
- [ ] **2.6.5** Verify template-creator workflow
- [ ] **2.6.6** Verify schema-creator workflow

**Evidence Required**:
- Each creator workflow test results
- Post-creation step verification
- Guard bypass testing

**Verify**: All creator workflows enforced

---

### Task 2.7: Spawn Validation Audit

**Agent**: developer
**Priority**: P2 (High)

**Checks**:
- [ ] **2.7.1** Verify spawn-prompt-validator.cjs patterns:
  - TaskUpdate Warning Box pattern (bounded quantifier 1500 chars)
  - Task ID Reference pattern
  - PROJECT_ROOT Context pattern
  - Memory Protocol pattern

- [ ] **2.7.2** Verify spawn-prompt-assembler.cjs template loading:
  - Universal template loads correctly
  - Orchestrator template loads correctly
  - Identity template loads correctly

- [ ] **2.7.3** Verify model assignment from config:
  - config-model-validator.cjs validates spawn model
  - Model aliases resolve correctly

**Known Fix from Memory**:
- Spawn prompt validator regex fixed: `{0,1000}` -> `{0,1500}` for warning box matching

**Evidence Required**:
- Pattern matching test results
- Template loading test results
- Model resolution test results

**Verify**: All spawn validation functional

---

### Task 2.8: Context Compression Triggers

**Agent**: developer
**Priority**: P3 (Medium)

**Checks**:
- [ ] **2.8.1** Verify compression-reminder.txt trigger mechanism
- [ ] **2.8.2** Verify context-compressor skill invocation
- [ ] **2.8.3** Check compression metrics in hook-metrics.jsonl
- [ ] **2.8.4** Verify AUTO_COMPRESSION_PHASE_3 environment variable

**Evidence Required**:
- Compression trigger test
- Metrics analysis

**Verify**: Context compression functional when triggered

---

### Task 2.9: Self-Healing Loops

**Agent**: developer
**Priority**: P3 (Medium)

**Checks**:
- [ ] **2.9.1** Verify `loop-state.json` structure:
  - sessionId (currently empty)
  - evolutionCount: 1
  - spawnDepth: 0
  - actionHistory tracking

- [ ] **2.9.2** Verify auto-rerouter.cjs functionality
- [ ] **2.9.3** Verify anomaly-detector.cjs functionality
- [ ] **2.9.4** Check for infinite loop detection

**Current State**:
- loop-state.json shows 10 spawn actions tracked
- Last evolution: hook on 2026-02-04

**Evidence Required**:
- Self-healing test results
- Loop detection verification

**Verify**: Self-healing mechanisms functional

---

## Phase 3: Remediation Roadmap

**Purpose**: Categorize and prioritize all identified issues
**Duration**: 1 hour
**Dependencies**: Phase 1 and 2 complete
**Parallel OK**: No

### Issue Severity Matrix

| Severity | Definition | SLA |
|----------|-----------|-----|
| **CRITICAL** | System broken, blocking workflows | Fix immediately |
| **HIGH** | Major functionality impaired, workaround exists | Fix within 1 day |
| **MEDIUM** | Minor functionality gap, no impact to core | Fix within 1 week |
| **LOW** | Cosmetic, documentation, optimization | Track for next cycle |

### Known Issues (Pre-Audit)

#### CRITICAL Issues (0)
- None identified at start

#### HIGH Issues (3)

| ID | Issue | Root Cause | Impact | Remediation |
|----|-------|-----------|--------|-------------|
| DECISIONS-SIZE-001 | decisions.md exceeds 25K token limit | No size-based rotation | Cannot read full file | Run memory-rotator, archive ADRs > 60 days |
| TASKUPDATE-001 | TaskUpdate protocol NOT enforced | task-completion-guard.cjs not registered | Tasks can be stuck forever | Register hook, add block mode |
| CONFIG-MISMATCH-001 | agent-config.json uses deprecated thinkingDefault | Legacy field not migrated | Config confusion | Migrate to explicit model field |

#### MEDIUM Issues (2)

| ID | Issue | Root Cause | Impact | Remediation |
|----|-------|-----------|--------|-------------|
| TOOL-001 | 14 agents reference MCP tools but mcpServers empty | Legacy references not cleaned | Tool availability errors | Remove mcp__ references from agents |
| LINT-001 | ADR-076 migration linting errors | Unused variables in test files | Blocks completion claim | Fix 1 error, 4 warnings |

#### LOW Issues (2)

| ID | Issue | Root Cause | Impact | Remediation |
|----|-------|-----------|--------|-------------|
| MIGRATION-001 | ADR-076 file count discrepancy (147 vs 143) | Documentation accuracy | None functional | Update documentation |
| META-003 | Evolution state completion record missing | Audit trail gap | Harder to track history | Add completion entry |

---

### Remediation Execution Plan

#### Immediate (During Audit)

1. **DECISIONS-SIZE-001**: Run `node .claude/lib/memory/memory-rotator.cjs rotate`
   - Expected: Archive ~15 ADRs older than 60 days
   - Target: decisions.md < 20KB after archival

2. **TASKUPDATE-001**: Register task-completion-guard.cjs
   - Add to settings.json PostToolUse(Task) hooks
   - Add block mode to hook (currently only warn/off)

#### This Session

3. **CONFIG-MISMATCH-001**: Migrate agent-config.json
   - Replace `thinkingDefault` with explicit `model` field
   - Align with config.yaml model assignments

#### This Week

4. **TOOL-001**: Clean MCP tool references
   - Remove mcp__ references from 14 agent files
   - Update skill files with Skill() invocation guidance

5. **LINT-001**: Fix linting errors
   - Remove/prefix unused variables
   - Run `pnpm lint --fix` for unused directives

---

## Phase 4: Evolution & Reflection Check (MANDATORY FINAL PHASE)

**Purpose**: Quality assessment and learning extraction
**Duration**: 30 minutes
**Dependencies**: Phase 3 complete

### Tasks

1. **4.1** Spawn reflection-agent to analyze completed audit work
2. **4.2** Extract learnings and update memory files:
   - New patterns discovered -> learnings.md
   - Issues found -> issues.md (already comprehensive)
   - Decisions made -> decisions.md
3. **4.3** Check for evolution opportunities:
   - New agents needed?
   - New skills needed?
   - New hooks needed?

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Audit reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed audit work, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Verification Gates

### Phase 1 Complete When:
- [ ] All 5 memory system tasks executed
- [ ] Evidence collected for each check
- [ ] No blocking issues remain unidentified

### Phase 2 Complete When:
- [ ] All 9 core system tasks executed
- [ ] Hook enforcement verified
- [ ] Registry validated
- [ ] All gates tested

### Phase 3 Complete When:
- [ ] All issues categorized by severity
- [ ] Remediation plan defined
- [ ] Critical issues have immediate fixes

### Phase 4 Complete When:
- [ ] Reflection agent spawned
- [ ] Learnings recorded
- [ ] Evolution opportunities assessed

---

## Agent Assignments (Parallel Execution)

| Phase | Tasks | Agent | Model | Parallel? |
|-------|-------|-------|-------|-----------|
| 1 | 1.1, 1.2, 1.3, 1.4, 1.5 | developer | sonnet | Yes (all 5) |
| 2 | 2.1, 2.3, 2.6, 2.7, 2.8, 2.9 | developer | sonnet | Yes (6 tasks) |
| 2 | 2.2, 2.4, 2.5 | architect | opus | Yes (3 tasks) |
| 3 | All | developer | sonnet | No (sequential) |
| 4 | All | reflection-agent | sonnet | No |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Issues Found | 10+ | Count of new issues in remediation roadmap |
| Critical Issues | 0 (post-fix) | All CRITICAL issues have fixes |
| Hook Coverage | 100% | All security hooks registered |
| Memory Health | GREEN | All files within size limits |
| Config Consistency | 100% | No mismatches between config sources |

---

## Output Artifacts

1. **Phase 1 Report**: `.claude/audit/MEMORY_SYSTEM_AUDIT_RESULTS_2026-02-04.md`
2. **Phase 2 Report**: `.claude/audit/CORE_SYSTEM_VALIDATION_RESULTS_2026-02-04.md`
3. **Consolidated Report**: `.claude/audit/DEEP_DIVE_AUDIT_FINAL_REPORT_2026-02-04.md`
4. **Learnings Update**: `.claude/context/memory/learnings.md` (append)
5. **Issues Update**: `.claude/context/memory/issues.md` (new entries)

---

**Plan Status**: READY FOR EXECUTION
**Next Action**: Spawn validator + developer agents for Phase 1-2 parallel execution
