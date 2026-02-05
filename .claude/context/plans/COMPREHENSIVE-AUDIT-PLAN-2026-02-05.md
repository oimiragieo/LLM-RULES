# Comprehensive 100% Audit Plan: Agent-Studio `.claude` Codebase

**Version:** 1.0.0
**Created:** 2026-02-05
**Status:** Phase 0 - Research Complete
**Methodology:** NO SLACK - Critical, Thorough, Zero Assumptions

## Executive Summary

This audit plan systematically validates EVERY component in the `.claude` framework to identify:
1. Components that exist but are NOT wired (invisible/orphaned)
2. Components that are wired but DON'T WORK (broken integration)
3. Configuration mismatches (documented vs. actual)
4. Cross-system integration failures
5. Known issues requiring verification

**Critical Discovery from Memory Review:**
- AUDIT-METHODOLOGY-001 (CRITICAL): Previous audit conflated "CODE EXISTS" with "VERIFIED WORKING"
- Skill-index has 11 missing skills + 142 path mismatches
- Tool availability drift documented (14 agents with legacy tool references)
- Hook metrics only have 2 test entries (system-level trigger issue)

---

## Phase 0: Constitution Checkpoint (MANDATORY)

### Research Completeness
- [x] Reviewed learnings.md (250+ lines of recent fixes)
- [x] Reviewed decisions.md (ADR-070 through ADR-081)
- [x] Reviewed issues.md (5 OPEN, 107 RESOLVED)
- [x] Reviewed settings.json (361 lines, all hook registrations)
- [x] Reviewed agent-config.json (7 agent configurations)

### Technical Feasibility
- [x] Framework structure documented
- [x] Integration points identified
- [x] Failure modes catalogued

### Security Review
- [x] ADR-077 shell security documented
- [x] Hook enforcement modes documented

### Specification Quality
- [x] Verification criteria defined per domain
- [x] Scoring levels established (VERIFIED_WORKING, CODE_EXISTS, DOCUMENTED, UNVERIFIED)

**CHECKPOINT PASSED - Proceeding to Phase 1+**

---

## Audit Domains (10 Total)

### Domain 1: Memory System
### Domain 2: Hooks System
### Domain 3: Agents System
### Domain 4: Workflows System
### Domain 5: Skills System
### Domain 6: Creator Workflows
### Domain 7: Tools Reference
### Domain 8: Configuration
### Domain 9: Runtime Files
### Domain 10: Integration Points

---

## Domain 1: MEMORY SYSTEM

**Investigator:** QA Agent + Developer Agent
**Priority:** CRITICAL (core persistence layer)

### 1.1 Files That MUST Exist

| File | Purpose | Status Check |
|------|---------|--------------|
| `.claude/context/memory/learnings.md` | Pattern/solution storage | Verify writable |
| `.claude/context/memory/decisions.md` | ADR storage | Verify writable |
| `.claude/context/memory/issues.md` | Blocker tracking | Verify writable |
| `.claude/context/memory/active_context.md` | Session context | Verify format |
| `.claude/context/memory/codebase_map.json` | File registry | Verify JSON valid |
| `.claude/context/memory/maintenance-status.json` | Health tracking | Verify JSON valid |
| `.claude/context/memory/access-stats.json` | Usage analytics | Verify JSON valid |
| `.claude/context/memory/patterns.json` | Pattern registry | Verify JSON valid |
| `.claude/context/memory/gotchas.json` | Gotcha registry | Verify JSON valid |
| `.claude/data/memory.db` | SQLite database | Verify SQLite valid |

### 1.2 Libraries That MUST Be Wired

| Library | Location | Consumers | Validation |
|---------|----------|-----------|------------|
| contextual-memory.cjs | `.claude/lib/memory/` | Hooks, agents | Run unit tests |
| memory-manager.cjs | `.claude/lib/memory/` | CLI tools | Run unit tests |
| lancedb-client.cjs | `.claude/lib/memory/` | Vector search | Run unit tests |
| memory-scheduler.cjs | `.claude/lib/memory/` | Background tasks | **VERIFY TRIGGER** |
| cold-storage.cjs | `.claude/lib/memory/` | Archival | Test archive flow |
| memory-deduplicator.cjs | `.claude/lib/memory/` | Cleanup | Test dedup flow |
| memory-entity-links.cjs | `.claude/lib/memory/` | Cross-refs | **VERIFY USAGE** |
| memory-extractor.cjs | `.claude/lib/memory/` | Pattern extraction | Test extraction |
| session-summary.cjs | `.claude/lib/memory/` | Session handoff | Test summary gen |
| smart-pruner.cjs | `.claude/lib/memory/` | Auto-cleanup | Test pruning |
| semantic-archival.cjs | `.claude/lib/memory/` | Semantic archive | Test archival |
| learnings-parser.cjs | `.claude/lib/memory/` | Learnings access | Test parsing |
| memory-rotator.cjs | `.claude/lib/memory/` | File rotation | Test rotation |

### 1.3 Specific Failure Modes to Check

1. **Memory DB Initialization**
   - [ ] Verify `memory.db` is valid SQLite (not empty/corrupt)
   - [ ] Command: `file .claude/data/memory.db` OR `sqlite3 .claude/data/memory.db ".tables"`
   - [ ] Expected: List of tables (memories, entities, etc.)

2. **Memory Scheduler Trigger**
   - [ ] Where is `memory-scheduler.cjs` invoked?
   - [ ] Is it cron/timer/hook triggered?
   - [ ] Evidence of actual execution (logs/timestamps)

3. **Cold Storage Archival**
   - [ ] Test: Archive old learnings
   - [ ] Verify: Files created in `.claude/context/memory/archive/`
   - [ ] Check: Last archive timestamp in maintenance-status.json

4. **Entity Links (ADR-054)**
   - [ ] Are entity links being created?
   - [ ] Evidence of agent usage (search for `linkEntities` calls)
   - [ ] Test: Create link, verify retrieval

5. **Access Stats Non-Blocking (ADR-079)**
   - [ ] Verify setImmediate() pattern in contextual-memory.cjs line 389-403
   - [ ] Test: Read operation doesn't block on stats write
   - [ ] Verify: access-stats.json updates eventually

6. **Environment Variable Config (ADR-080)**
   - [ ] Verify MEMORY_* vars respected
   - [ ] Test: Override MEMORY_MAX_SESSIONS, verify behavior
   - [ ] Check: .env.example documents all MEMORY_* vars

### 1.4 Validation Commands

```bash
# Test 1: Memory DB validity
node -e "const db = require('better-sqlite3')('.claude/data/memory.db'); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\"').all())"

# Test 2: Memory manager tests
npm test -- tests/lib/memory/memory-manager.test.cjs

# Test 3: Contextual memory tests
npm test -- tests/lib/memory/contextual-memory.test.cjs

# Test 4: LanceDB tests
npm test -- tests/lib/memory/lancedb-client.test.cjs

# Test 5: All memory tests
npm test -- tests/lib/memory/*.test.cjs
```

### 1.5 Known Issues to Verify

- [ ] **AUDIT-METHODOLOGY-001**: Memory database claimed "65KB initialized" but cannot verify without sqlite3

---

## Domain 2: HOOKS SYSTEM

**Investigator:** Developer Agent + Security-Architect
**Priority:** CRITICAL (enforcement layer)

### 2.1 Hooks Registered in settings.json vs. Files That Exist

**Total hooks in settings.json:** 50+ hook commands
**Total hook files found:** 91 .cjs files

### 2.2 Hook Registration Audit

| Hook Event | Registered Hooks | File Exists? | Tested? |
|------------|------------------|--------------|---------|
| **UserPromptSubmit** | | | |
| force-step0-execution.cjs | ✓ | ? | ? |
| state-reset.cjs | ✓ | ? | ? |
| user-prompt-unified.cjs | ✓ | ? | ? |
| post-creation-reminder.cjs | ✓ | ? | ? |
| memory-health-check.cjs | ✓ | ? | ? |
| reflection-queue-processor.cjs | ✓ | ? | ? |
| **PreToolUse (empty)** | | | |
| execution-limit-monitor-hook.cjs | ✓ | ? | ? |
| tool-scope-validator.cjs | ✓ | ? | ? |
| **PreToolUse (Bash)** | | | |
| context-mode-tool-guard.cjs | ✓ | ? | ? |
| windows-null-sanitizer.cjs | ✓ | ? | ? |
| bash-cwd-validator.cjs | ✓ | ? | ? |
| shell-injection-validator.cjs | ✓ | ? | ? |
| variable-quoting-validator.cjs | ✓ | ? | ? |
| shellcheck-validator.cjs | ✓ | ? | ? |
| command-allowlist-validator.cjs | ✓ | ? | ? |
| routing-guard.cjs | ✓ | ? | ? |
| bash-command-validator.cjs | ✓ | ? | ? |
| **PreToolUse (Glob/Grep/WebSearch)** | | | |
| routing-guard.cjs | ✓ | ? | ? |
| **PreToolUse (Edit/Write/NotebookEdit)** | | | |
| context-mode-tool-guard.cjs | ✓ | ? | ? |
| file-placement-guard.cjs | ✓ | ? | ? |
| write-content-scanner.cjs | ✓ | ? | ? |
| write-size-validator.cjs | ✓ | ? | ? |
| routing-guard.cjs | ✓ | ? | ? |
| router-write-guard.cjs | ✓ | ? | ? |
| unified-creator-guard.cjs | ✓ | ? | ? |
| tdd-check.cjs | ✓ | ? | ? |
| plan-evolution-guard.cjs | ✓ | ? | ? |
| unified-evolution-guard.cjs | ✓ | ? | ? |
| suggest-compact.cjs | ✓ | ? | ? |
| **PreToolUse (Read)** | | | |
| validate-skill-invocation.cjs | ✓ | ? | ? |
| **PreToolUse (TaskList)** | | | |
| reflection-step0-guard.cjs | ✓ | ? | ? |
| **PreToolUse (TaskCreate)** | | | |
| routing-guard.cjs | ✓ | ? | ? |
| **PreToolUse (Task)** | | | |
| config-model-validator.cjs | ✓ | ? | ? |
| spawn-prompt-assembler.cjs | ✓ | ? | ? |
| spawn-prompt-validator.cjs | ✓ | ? | ? |
| pre-spawn-tool-validator.cjs | ✓ | ? | ? |
| tool-availability-validator.cjs | ✓ | ? | ? |
| documentation-routing-guard.cjs | ✓ | ? | ? |
| pre-task-unified.cjs | ✓ | ? | ? |
| **PreToolUse (TaskUpdate)** | | | |
| task-status-enforcement.cjs | ✓ | ? | ? |
| pre-completion-validation.cjs | ✓ | ? | ? |
| **PreToolUse (Skill)** | | | |
| skill-invocation-tracker.cjs | ✓ | ? | ? |
| **PostToolUse (empty)** | | | |
| metrics-collector-hook.cjs | ✓ | ? | ? |
| error-tracker-hook.cjs | ✓ | ? | ? |
| anomaly-detector.cjs | ✓ | ? | ? |
| **PostToolUse (Task)** | | | |
| task-completion-guard.cjs | ✓ | ? | ? |
| agent-context-tracker.cjs | ✓ | ? | ? |
| auto-rerouter.cjs | ✓ | ? | ? |
| agent-health-hook.cjs | ✓ | ? | ? |
| post-spawn-task-updater.cjs | ✓ | ? | ? |
| post-task-unified.cjs | ✓ | ? | ? |
| **PostToolUse (TaskList)** | | | |
| task-list-tracker.cjs | ✓ | ? | ? |
| **PostToolUse (Edit/Write/NotebookEdit)** | | | |
| format-memory.cjs | ✓ | ? | ? |
| sync-memory-index.cjs | ✓ | ? | ? |
| enforce-claude-md-update.cjs | ✓ | ? | ? |
| code-index-updater.cjs | ✓ | ? | ? |
| planning-progress-tracker.cjs | ✓ | ? | ? |
| **PostToolUse (MemoryRecord)** | | | |
| sync-memory-index.cjs | ✓ | ? | ? |
| **PostToolUse (Task/TaskUpdate/Bash)** | | | |
| unified-reflection-handler.cjs | ✓ | ? | ? |
| **SessionEnd** | | | |
| unified-reflection-handler.cjs | ✓ | ? | ? |
| reflection-queue-processor.cjs | ✓ | ? | ? |
| **Stop** | | | |
| check-console-log.cjs | ✓ | ? | ? |

### 2.3 Hook Files NOT Registered (Orphaned?)

Files in `.claude/hooks/` but NOT in settings.json:

| File | Category | Reason for Non-Registration |
|------|----------|----------------------------|
| statusline.cjs | monitoring | ? |
| pre-tool-use.cjs | routing | Possibly legacy? |
| router-mode-reset.cjs | routing | ? |
| task-update-tracker.cjs | routing | ? |
| agent-context-pre-tracker.cjs | routing | ? |
| router-enforcer.cjs | routing | ? |
| task-auto-route.cjs | routing | ? |
| evolution-audit.cjs | evolution | ? |
| evolution-trigger-detector.cjs | evolution | ? |
| conflict-detector.cjs | evolution | ? |
| evolution-state-guard.cjs | evolution | ? |
| quality-gate-validator.cjs | evolution | ? |
| research-enforcement.cjs | evolution | ? |
| security-trigger.cjs | safety | ? |
| file-path-guard.cjs | safety | ? |
| auto-compression-trigger.cjs | safety | ? |
| spawn-size-validator.cjs | safety | ? |
| error-capture-post-tool.cjs | safety | ? |
| agent-tools-validator.cjs | validation | ? |
| track-analytics-validator.cjs | validation | ? |
| duplicate-detector.cjs | skills | ? |
| metadata-validator.cjs | skills | ? |
| rule-structure-validator.cjs | skills | ? |
| rule-validator.cjs | skills | ? |
| pre-spawn-task-validator.cjs | routing | ? |
| error-summary-extractor.cjs | reflection | ? |
| git-notes-audit.cjs | audit | ? |
| llm-usage-tracker.cjs | cost-tracking | ? |
| execution-limit-monitor.cjs | monitoring | Different from hook? |
| metrics-collector.cjs | monitoring | Library, not hook? |
| error-tracker.cjs | monitoring | Library, not hook? |
| regenerate-registries.cjs | git | Pre-commit hook |

### 2.4 Specific Failure Modes to Check

1. **Hook Metrics Not Logging (Known Issue)**
   - [ ] Verify metrics-collector-hook.cjs triggers
   - [ ] Check hook-metrics.jsonl for new entries
   - [ ] Test: Manual tool call, verify log entry

2. **Reflection Step 0 Guard**
   - [ ] Does TaskList block when reflection-reminder.txt exists?
   - [ ] Test: Create reflection-reminder.txt, call TaskList

3. **Shell Security Validators (ADR-077)**
   - [ ] Test bash-cwd-validator.cjs with missing cd
   - [ ] Test shell-injection-validator.cjs with dangerous command
   - [ ] Test command-allowlist-validator.cjs with blocked command

4. **Creator Guard (Gate 4)**
   - [ ] Test unified-creator-guard.cjs blocks direct .claude/skills write
   - [ ] Verify enforcement mode (block/warn/off)

5. **Config Model Validator (ADR-075)**
   - [ ] Test config-model-validator.cjs spawn validation
   - [ ] Verify model mismatch warning/block

### 2.5 Validation Commands

```bash
# Test all hook tests
npm test -- tests/hooks/*.test.cjs

# Test specific safety hooks
npm test -- tests/hooks/file-placement-guard.test.cjs
npm test -- tests/hooks/spawn-prompt-validator.test.cjs

# Verify hook registration
node -e "const s = require('./.claude/settings.json'); console.log(JSON.stringify(s.hooks, null, 2))" | grep -c "command"
```

---

## Domain 3: AGENTS SYSTEM

**Investigator:** Architect Agent
**Priority:** HIGH (routing layer)

### 3.1 Agents That MUST Exist

| Agent | Path | Category | Model Config |
|-------|------|----------|--------------|
| router | `.claude/agents/core/router.md` | core | N/A (host) |
| planner | `.claude/agents/core/planner.md` | core | opus |
| developer | `.claude/agents/core/developer.md` | core | sonnet |
| architect | `.claude/agents/core/architect.md` | core | opus |
| qa | `.claude/agents/core/qa.md` | core | opus |
| pm | `.claude/agents/core/pm.md` | core | ? |
| reflection-agent | `.claude/agents/core/reflection-agent.md` | core | opus |
| context-compressor | `.claude/agents/core/context-compressor.md` | core | ? |
| technical-writer | `.claude/agents/core/technical-writer.md` | core | ? |
| security-architect | `.claude/agents/specialized/security-architect.md` | specialized | ? |
| database-architect | `.claude/agents/specialized/database-architect.md` | specialized | ? |
| code-reviewer | `.claude/agents/specialized/code-reviewer.md` | specialized | opus |
| master-orchestrator | `.claude/agents/orchestrators/master-orchestrator.md` | orchestrator | opus |
| evolution-orchestrator | `.claude/agents/orchestrators/evolution-orchestrator.md` | orchestrator | opus |
| swarm-coordinator | `.claude/agents/orchestrators/swarm-coordinator.md` | orchestrator | opus |
| party-orchestrator | `.claude/agents/orchestrators/party-orchestrator.md` | orchestrator | opus |

### 3.2 Agent Registry Sync

| Check | Status |
|-------|--------|
| agent-registry.json exists | ? |
| Registry timestamp current | ? |
| All 49 agents in registry | ? |
| Registry matches filesystem | ? |

### 3.3 Specific Failure Modes to Check

1. **Tool Availability Drift (TOOL-001)**
   - [ ] 14 agents reference Search/SequentialThinking tools
   - [ ] Verify fallback mechanisms documented
   - [ ] Test: Spawn agent, verify tool availability

2. **Frontmatter Validation**
   - [ ] All agents have valid YAML frontmatter
   - [ ] Tools list matches agent-config.json
   - [ ] Model field matches config.yaml

3. **Routing Keywords**
   - [ ] router-enforcer.cjs has all agent keywords
   - [ ] No orphan agents (in filesystem but not routable)

4. **Orchestrator Tool Access**
   - [ ] All orchestrators have Task tool in frontmatter
   - [ ] Orchestrators use opus model

### 3.4 Validation Commands

```bash
# Regenerate and validate registry
node .claude/tools/cli/generate-agent-registry.cjs

# Validate agent frontmatter
node .claude/tools/cli/verify-agent-frontmatter.mjs

# Count agents
ls -la .claude/agents/**/*.md | wc -l
```

---

## Domain 4: WORKFLOWS SYSTEM

**Investigator:** Planner Agent
**Priority:** HIGH (orchestration layer)

### 4.1 Workflows That MUST Exist

| Workflow | Path | Purpose |
|----------|------|---------|
| router-decision.md | `.claude/workflows/core/` | Master routing |
| evolution-workflow.md | `.claude/workflows/core/` | EVOLVE process |
| reflection-workflow.md | `.claude/workflows/core/` | Reflection process |
| skill-lifecycle.md | `.claude/workflows/core/` | Skill management |
| post-creation-validation.md | `.claude/workflows/core/` | Artifact validation |
| external-integration.md | `.claude/workflows/core/` | External systems |
| feature-development-workflow.md | `.claude/workflows/enterprise/` | Feature dev |
| c4-architecture-workflow.md | `.claude/workflows/enterprise/` | C4 modeling |
| swarm-coordination-skill-workflow.md | `.claude/workflows/enterprise/` | Swarm ops |
| incident-response.md | `.claude/workflows/operations/` | Incident handling |
| hook-consolidation.md | `.claude/workflows/operations/` | Hook management |
| qa-bounded-loop.md | `.claude/workflows/operations/` | QA cycles |

### 4.2 Specific Failure Modes to Check

1. **Workflow YAML Validity**
   - [ ] All workflow files parse successfully
   - [ ] Required sections present (phases, steps, etc.)

2. **Workflow Triggers**
   - [ ] How are workflows invoked?
   - [ ] Are workflows wired to router?

3. **Cross-Workflow Dependencies**
   - [ ] evolution-workflow references router-decision
   - [ ] reflection-workflow integrates with memory

### 4.3 Validation Commands

```bash
# List all workflows
ls -la .claude/workflows/**/*.md

# Check for YAML issues
node scripts/validation/validate-workflow.mjs
```

---

## Domain 5: SKILLS SYSTEM

**Investigator:** Developer Agent + QA Agent
**Priority:** CRITICAL (capability layer)

### 5.1 Skill Index Discrepancies (Known Issue)

From learnings.md Task #6:
- **11 skills missing from index**
- **1 stale entry** (mobile-ux-reviewer)
- **142 scientific-skills path mismatch**

### 5.2 Missing Skills to Verify

| Skill | Should Exist At | Status |
|-------|-----------------|--------|
| advanced-elicitation | `.claude/skills/advanced-elicitation/SKILL.md` | ? |
| code-semantic-search | `.claude/skills/code-semantic-search/SKILL.md` | ? |
| code-structural-search | `.claude/skills/code-structural-search/SKILL.md` | ? |
| planning-with-files | `.claude/skills/planning-with-files/SKILL.md` | ? |
| sparc-methodology | `.claude/skills/sparc-methodology/SKILL.md` | ? |
| spec-init | `.claude/skills/spec-init/SKILL.md` | ? |
| test-skill-e2e-* | `.claude/skills/test-skill-e2e-*/SKILL.md` | Test artifact? |

### 5.3 Skill Index Validation

| Check | Expected | Actual |
|-------|----------|--------|
| Total skills in index | ~200+ | ? |
| Skills on filesystem | ? | ? |
| Delta | 0 | ~11 |

### 5.4 Specific Failure Modes to Check

1. **Skill Invocation via Skill() Tool**
   - [ ] Test: Skill({ skill: 'tdd' })
   - [ ] Test: Skill({ skill: 'debugging' })
   - [ ] Verify skill loads correctly

2. **Skill-Index Regeneration**
   - [ ] Run generate-skill-index.cjs
   - [ ] Verify 11 missing skills added
   - [ ] Verify stale entries removed

3. **Scientific Skills Path Fix**
   - [ ] Current: `scientific-skills/adaptyv`
   - [ ] Should be: `scientific-skills/skills/adaptyv`
   - [ ] Fix 142 entries

### 5.5 Validation Commands

```bash
# Regenerate skill index
node .claude/tools/cli/generate-skill-index.cjs

# Count skills on filesystem
find .claude/skills -name "SKILL.md" | wc -l

# Count skills in index
node -e "const idx = require('./.claude/config/skill-index.json'); console.log(Object.keys(idx.skills || idx).length)"
```

---

## Domain 6: CREATOR WORKFLOWS

**Investigator:** Security-Architect (Gate 4 enforcement)
**Priority:** HIGH (artifact integrity)

### 6.1 Creator Skills That MUST Exist

| Creator | Path | Output Path |
|---------|------|-------------|
| agent-creator | `.claude/skills/agent-creator/SKILL.md` | `.claude/agents/` |
| skill-creator | `.claude/skills/skill-creator/SKILL.md` | `.claude/skills/` |
| workflow-creator | `.claude/skills/workflow-creator/SKILL.md` | `.claude/workflows/` |
| hook-creator | `.claude/skills/hook-creator/SKILL.md` | `.claude/hooks/` |
| template-creator | `.claude/skills/template-creator/SKILL.md` | `.claude/templates/` |
| schema-creator | `.claude/skills/schema-creator/SKILL.md` | `.claude/schemas/` |

### 6.2 Creator Post-Creation Steps (ADR-072)

| Step | Required For | Verified |
|------|--------------|----------|
| Update CLAUDE.md routing | agent-creator | ? |
| Update skill-index.json | skill-creator | ? |
| Update agent-registry.json | agent-creator | ? |
| Assign to at least one agent | all creators | ? |
| Record in memory | all creators | ? |

### 6.3 Specific Failure Modes to Check

1. **Gate 4 Enforcement**
   - [ ] Test: Write directly to .claude/skills/test/SKILL.md
   - [ ] Verify: unified-creator-guard.cjs blocks

2. **Post-Creation Registry Update**
   - [ ] After agent creation, is registry regenerated?
   - [ ] After skill creation, is index regenerated?

3. **Creator Step 0 (Existence Check)**
   - [ ] If artifact exists, does creator delegate to updater?
   - [ ] Test: Create existing skill, verify updater invoked

### 6.4 Validation Commands

```bash
# Test Gate 4 (should block)
echo "test" > .claude/skills/test-gate4/SKILL.md 2>&1

# Verify creator skills exist
ls -la .claude/skills/*-creator/SKILL.md
```

---

## Domain 7: TOOLS REFERENCE

**Investigator:** Developer Agent
**Priority:** MEDIUM (documentation accuracy)

### 7.1 Tools Documented vs. Available

| Tool | In CLAUDE.md | In tool-manifest.json | Actually Works |
|------|--------------|----------------------|----------------|
| Read | ✓ | ? | ? |
| Write | ✓ | ? | ? |
| Edit | ✓ | ? | ? |
| Bash | ✓ | ? | ? |
| Glob | ✓ | ? | ? |
| Grep | ✓ | ? | ? |
| Task | ✓ | ? | ? |
| TaskList | ✓ | ? | ? |
| TaskCreate | ✓ | ? | ? |
| TaskUpdate | ✓ | ? | ? |
| TaskGet | ✓ | ? | ? |
| TaskOutput | ✓ | ? | ? |
| TaskStop | ✓ | ? | ? |
| Skill | ✓ | ? | ? |
| SkillCatalog | ✓ | ? | ? |
| AvailableAgents | ✓ | ? | ? |
| AskUserQuestion | ✓ | ? | ? |
| EnterPlanMode | ✓ | ? | ? |
| ExitPlanMode | ✓ | ? | ? |
| WebSearch | ✓ | ? | ? |
| WebFetch | ✓ | ? | ? |
| NotebookEdit | ✓ | ? | ? |
| MemoryRecord | ✓ | ? | ? |
| Orchestrator | ✓ | ? | ? |

### 7.2 MCP Tools (mcpServers: {})

- [ ] settings.json has `mcpServers: {}`
- [ ] .mcp.json exists with server configs
- [ ] Mismatch: MCP servers not loaded

### 7.3 Validation Commands

```bash
# Check tool manifest
cat .claude/config/tool-manifest.json | head -50

# Verify MCP config
cat .mcp.json
```

---

## Domain 8: CONFIGURATION

**Investigator:** Architect Agent
**Priority:** HIGH (system behavior)

### 8.1 Configuration Files

| File | Purpose | Validated |
|------|---------|-----------|
| `.claude/settings.json` | Host settings, hooks | ? |
| `.claude/config/agent-config.json` | Agent models/tools | ? |
| `.claude/config/skill-index.json` | Skill registry | **KNOWN ISSUES** |
| `.claude/context/agent-registry.json` | Agent registry | **NEEDS REGEN** |
| `config.yaml` | Model selection | ? |
| `.env` | Environment vars | ? |
| `.env.example` | Env documentation | ? |
| `.mcp.json` | MCP servers | **NOT LOADED** |

### 8.2 Environment Variable Audit

| Variable | Section | Documented | Used |
|----------|---------|------------|------|
| PLANNER_FIRST_ENFORCEMENT | Routing | ? | ? |
| CREATOR_GUARD | Safety | ? | ? |
| SPAWN_PROMPT_VALIDATOR | Safety | ? | ? |
| BASH_CWD_VALIDATOR | Shell Security | ? | ? |
| SHELL_INJECTION_VALIDATOR | Shell Security | ? | ? |
| VARIABLE_QUOTING_VALIDATOR | Shell Security | ? | ? |
| SHELLCHECK_VALIDATOR | Shell Security | ? | ? |
| COMMAND_ALLOWLIST_VALIDATOR | Shell Security | ? | ? |
| MEMORY_MAX_SESSIONS | Memory | ? | ? |
| MEMORY_LEARNINGS_ARCHIVE_THRESHOLD_KB | Memory | ? | ? |
| All MEMORY_* vars (ADR-080) | Memory | ? | ? |

### 8.3 Validation Commands

```bash
# Check config schema validation
node -e "const c = require('./.claude/config/agent-config.json'); console.log(c.version)"

# Verify env vars documented
grep "MEMORY_" .env.example | wc -l
```

---

## Domain 9: RUNTIME FILES

**Investigator:** Developer Agent
**Priority:** MEDIUM (session state)

### 9.1 Runtime Files That May Exist

| File | Purpose | When Created |
|------|---------|--------------|
| reflection-reminder.txt | Trigger Step 0 | Reflection requested |
| reflection-spawn-request.json | Reflection queue | Reflection queued |
| compression-reminder.txt | Trigger compression | Context limit approaching |
| router-state.json | Router session state | Every session |
| task-status.json | Task tracking | Task operations |
| event-bus.jsonl | Event log | All events |
| user-prompt-results.jsonl | Prompt log | User prompts |
| last-memory-health-check.txt | Health check timestamp | Health check runs |

### 9.2 Specific Failure Modes

1. **Reflection Reminder Not Cleared**
   - [ ] After Step 0, is reflection-reminder.txt deleted?
   - [ ] Test: Create reminder, process, verify deleted

2. **Router State Corruption**
   - [ ] Is router-state.json valid JSON?
   - [ ] Does it reset between sessions?

### 9.3 Validation Commands

```bash
# Check runtime files
ls -la .claude/context/runtime/

# Validate JSON files
node -e "JSON.parse(require('fs').readFileSync('.claude/context/runtime/router-state.json'))"
```

---

## Domain 10: INTEGRATION POINTS

**Investigator:** Master-Orchestrator (cross-system view)
**Priority:** CRITICAL (failure points)

### 10.1 Critical Integration Points

| From | To | Integration | Failure Mode |
|------|-----|-------------|--------------|
| Router | Agent Registry | Lookup | Registry stale |
| Router | Skill Index | Discovery | Index incomplete |
| Router | Hook System | Enforcement | Hook not triggered |
| Hooks | Memory | Persistence | Memory not written |
| Hooks | Reflection | Queue | Queue not processed |
| Agents | Memory | Read/Write | Memory inaccessible |
| Agents | Skills | Invocation | Skill not found |
| Creators | Registries | Post-create | Registry not updated |
| Scheduler | Memory | Archival | Archival not running |

### 10.2 Integration Test Scenarios

1. **Router -> Agent Spawn -> TaskUpdate -> Memory**
   - [ ] Spawn planner
   - [ ] Planner updates task
   - [ ] Memory records learning
   - [ ] Verify all steps complete

2. **Reflection Queue -> Step 0 -> Spawn -> Process**
   - [ ] Create reflection request
   - [ ] Verify Step 0 triggered
   - [ ] Verify reflection-agent spawned
   - [ ] Verify queue cleared

3. **Creator -> Artifact -> Registry Update -> Router Discovery**
   - [ ] Create new skill
   - [ ] Verify skill-index updated
   - [ ] Verify router can discover skill

4. **Memory Health Check -> Archive -> Cold Storage**
   - [ ] Trigger health check
   - [ ] Verify archive condition met
   - [ ] Verify cold storage executed

### 10.3 Validation Commands

```bash
# Integration test suite
npm test -- tests/integration/*.test.cjs

# Cross-system validation
node scripts/validation/validate-all-references.mjs
```

---

## Audit Scoring Framework

### Verification Levels

| Level | Definition | Evidence Required |
|-------|------------|-------------------|
| **VERIFIED_WORKING** | Execution test + metrics + usage proven | Test output, logs, timestamps |
| **CODE_EXISTS** | Implementation complete but not tested | File exists, lint passes |
| **DOCUMENTED** | Planned/designed but not implemented | Design doc only |
| **UNVERIFIED** | Claimed but cannot confirm | No evidence |

### Domain Scoring

| Domain | Weight | VERIFIED | CODE_EXISTS | DOCUMENTED | UNVERIFIED |
|--------|--------|----------|-------------|------------|------------|
| Memory System | 20% | ? | ? | ? | ? |
| Hooks System | 20% | ? | ? | ? | ? |
| Agents System | 15% | ? | ? | ? | ? |
| Workflows System | 10% | ? | ? | ? | ? |
| Skills System | 15% | ? | ? | ? | ? |
| Creator Workflows | 5% | ? | ? | ? | ? |
| Tools Reference | 5% | ? | ? | ? | ? |
| Configuration | 5% | ? | ? | ? | ? |
| Runtime Files | 2.5% | ? | ? | ? | ? |
| Integration Points | 2.5% | ? | ? | ? | ? |
| **TOTAL** | **100%** | | | | |

---

## Execution Plan

### Phase 1: Parallel Discovery (Recommended Agents)

| Agent | Domain | Duration |
|-------|--------|----------|
| qa | Memory System | 2 hours |
| developer | Hooks System | 2 hours |
| architect | Agents System | 1 hour |
| planner | Workflows System | 1 hour |
| developer | Skills System | 2 hours |

### Phase 2: Cross-Validation

| Agent | Task |
|-------|------|
| security-architect | Creator Workflows + Gate 4 |
| master-orchestrator | Integration Points |

### Phase 3: Consolidation

| Agent | Task |
|-------|------|
| qa | Generate audit report |
| planner | Create remediation plan |

---

## Success Criteria

1. **All 10 domains audited** with specific findings
2. **Every component scored** using verification levels
3. **Known issues verified** (AUDIT-METHODOLOGY-001, TOOL-001, skill-index)
4. **Integration points tested** with evidence
5. **Remediation plan created** for all UNVERIFIED items

---

## Output Artifacts

| Artifact | Path |
|----------|------|
| This Plan | `.claude/context/plans/COMPREHENSIVE-AUDIT-PLAN-2026-02-05.md` |
| Audit Report | `.claude/audit/COMPREHENSIVE-100-PERCENT-AUDIT-REPORT-2026-02-05.md` |
| Domain Findings | `.claude/audit/domain-findings/` |
| Remediation Plan | `.claude/context/plans/REMEDIATION-PLAN-2026-02-05.md` |

---

## Phase FINAL: Evolution & Reflection Check

**Purpose:** Quality assessment and learning extraction

**Tasks:**

1. Spawn reflection-agent to analyze completed audit
2. Extract learnings and update memory files
3. Check for evolution opportunities (patterns suggesting new agents/skills)

**Spawn Command:**
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Analyze the completed comprehensive audit, extract learnings to memory files, and check for evolution opportunities."
})
```

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

*Plan Generated by: PLANNER Agent*
*Using Skills: plan-generator, task-breakdown, sequential-thinking, progressive-disclosure*
*Memory Protocol: MANDATORY - All findings must be recorded*
