# Comprehensive Agent-Studio Audit Plan

**Version**: 1.0
**Date**: 2026-02-04
**Status**: READY FOR EXECUTION
**Framework Version**: agent-studio v2.2.1

## Executive Summary

This comprehensive audit addresses **CRITICAL INCONSISTENCIES** and **CLAIMED IMPLEMENTATIONS** in agent-studio's memory system and core infrastructure. Memory files show unresolved shell security issues, unclaimed "ADR-076 migration complete" status despite linting failures, and stale active_context.md (dated 2026-01-28, now 6 days old).

**Critical Findings Requiring Validation**:

1. **SHELL-SECURITY-001/002** (CRITICAL) - Background Bash tasks missing CWD, no injection validation
2. **ADR-076 Implementation** - Claims "147 test files migrated" but verification found 143 files, linting errors remain
3. **ADR-075 Status** - Listed as "Proposed" but learnings.md claims "ALL PHASES COMPLETE"
4. **Party Mode** - Claimed "production ready" (2026-01-28) but no integration validation
5. **Active Context Staleness** - 6-day lag suggests memory system not updating

**Audit Approach**: 7 parallel, independently executable audit tasks by specialized agents

**Timeline**: 2-3 days (parallel execution)

---

## Audit Objectives

### Primary Goals

1. **Validate Memory Integrity** - Verify accuracy, consistency, and freshness of memory files
2. **Validate Security Posture** - Confirm shell security issues are resolved or have fix timeline
3. **Validate Implementation Claims** - Verify ADR-076, ADR-075, Party Mode are truly complete
4. **Identify Configuration Drift** - Find inconsistencies between config.yaml, routing table, and hooks
5. **Generate Fix Prioritization** - Create actionable matrix (CRITICAL → HIGH → MEDIUM → LOW)

### Success Criteria

- All 7 audit tasks complete with consolidated findings report
- Every claimed "complete" ADR validated as functioning
- All CRITICAL/HIGH open issues have resolution timeline or documented workaround
- Fix prioritization matrix approved for implementation

---

## Audit Architecture

### Modular Design Principles

1. **Independence** - Each audit runs standalone, minimal dependencies
2. **Parallelization** - All 7 audits can run simultaneously
3. **Idempotence** - Safe to re-run audits without side effects
4. **Evidence-Based** - Every finding backed by file evidence or test results
5. **Actionable** - Every finding includes recommended remediation

### Audit Outputs

Each audit produces:

- **Findings Report**: Markdown document in `.claude/context/artifacts/audit-reports/`
- **Evidence Files**: Supporting grep/test outputs
- **Fix Recommendations**: Prioritized list (CRITICAL → LOW)
- **Integration Points**: Dependencies on other audits

---

## Audit Task Definitions

### Audit 1: Memory System Integrity

**Agent**: developer + qa
**Duration**: 4-6 hours
**Parallel OK**: Yes

#### Scope

Validate memory file accuracy, structure, consistency across:

- `.claude/context/memory/learnings.md`
- `.claude/context/memory/decisions.md`
- `.claude/context/memory/issues.md`
- `.claude/context/memory/active_context.md`

#### Validation Checklist

- [ ] **Staleness Check**: active_context.md last updated vs current date (CRITICAL if >7 days)
- [ ] **Cross-Reference Consistency**: ADR status in decisions.md matches learnings.md
- [ ] **Issue Resolution Tracking**: All "RESOLVED" issues in issues.md have resolution date
- [ ] **Open Issue Aging**: CRITICAL/HIGH open issues >30 days have escalation notice
- [ ] **File Size Check**: No memory file >20KB (Read tool limit risk at 25KB)
- [ ] **Duplicate Detection**: No duplicate ADR numbers, issue IDs, or learnings
- [ ] **Date Validity**: All dates in YYYY-MM-DD format, no future dates

#### Test Commands

```bash
# Check active_context.md age
grep "^## Session:" .claude/context/memory/active_context.md | head -1

# Find duplicate ADR numbers
grep -E "^\#\# \[ADR-[0-9]+\]" .claude/context/memory/decisions.md | sort | uniq -d

# Find CRITICAL open issues >30 days old
grep -A 5 "CRITICAL.*OPEN" .claude/context/memory/issues.md | grep "Date:"

# Check file sizes (in lines, estimate tokens)
wc -l .claude/context/memory/*.md
```

#### Expected Findings

1. **active_context.md Staleness** (CONFIRMED - 6 days old)
2. **ADR-076 vs ADR-075 Status Inconsistency** (Proposed vs Complete)
3. **Potential Duplicate ADRs** (ADR-075 appears twice in decisions.md)

#### Success Criteria

- Memory files accurate to within 24 hours
- No status inconsistencies between files
- All open issues <90 days have progress notes

#### Output

**Report**: `.claude/context/artifacts/audit-reports/memory-integrity-audit-2026-02-04.md`

---

### Audit 2: Shell Security Deep Dive

**Agent**: security-architect + developer
**Duration**: 6-8 hours
**Parallel OK**: Yes

#### Scope

Deep investigation of SHELL-SECURITY-001 and SHELL-SECURITY-002:

- **SHELL-SECURITY-001**: Background Bash tasks missing CWD initialization
- **SHELL-SECURITY-002**: No shell injection validation

#### Validation Checklist

- [ ] **CWD Validator Existence**: bash-cwd-validator.cjs hook exists and registered?
- [ ] **CWD Validator Testing**: Unit tests exist and pass?
- [ ] **Injection Validator Existence**: shell-injection-validator.cjs hook exists and registered?
- [ ] **Injection Validator Testing**: Unit tests exist and pass?
- [ ] **Template Compliance**: Spawn templates include `cd "$PROJECT_ROOT" &&` prefix?
- [ ] **Real-World Bash Audit**: Sample 20 recent Bash commands for CWD/injection patterns
- [ ] **Hook Registration**: Both hooks in settings.json PreToolUse(Bash)?
- [ ] **Enforcement Mode**: Default mode is `block` (not `warn`)?

#### Test Commands

```bash
# Check if CWD validator exists
ls .claude/hooks/safety/bash-cwd-validator.cjs

# Check if injection validator exists
ls .claude/hooks/safety/shell-injection-validator.cjs

# Check hook registration
grep "bash-cwd-validator\|shell-injection-validator" .claude/settings.json

# Audit recent Bash commands (if log exists)
grep -E "Bash\(\{.*command:" .claude/context/logs/*.log | tail -20

# Check spawn templates for CWD prefix
grep 'cd "\$PROJECT_ROOT"' .claude/templates/spawn/*.md
```

#### Expected Findings

1. **Missing Hook Files** (CONFIRMED - issues.md shows "Fix: Create bash-cwd-validator.cjs")
2. **No Hook Registration** (hooks don't exist yet, can't be registered)
3. **No Timeline for Fix** (issues show OPEN status, no resolution date)

#### Success Criteria

- Either hooks implemented OR documented fix timeline (ETA + assigned agent)
- If not implemented: Attack scenarios documented with risk assessment
- Workaround documented and validated

#### Output

**Report**: `.claude/context/artifacts/audit-reports/shell-security-audit-2026-02-04.md`

---

### Audit 3: Hook Enforcement Validation

**Agent**: qa + developer
**Duration**: 5-7 hours
**Parallel OK**: Yes

#### Scope

Verify all critical hooks are:

1. **Wired** - Registered in settings.json
2. **Tested** - Unit tests exist and pass
3. **Enforcing** - Default mode is `block` (not `warn` or `off`)

#### Validation Checklist

- [ ] **Routing Hooks**: routing-guard.cjs, unified-creator-guard.cjs, config-model-validator.cjs
- [ ] **Safety Hooks**: file-placement-guard.cjs, write-size-validator.cjs, shellcheck-validator.cjs
- [ ] **Security Hooks**: bash-cwd-validator.cjs, shell-injection-validator.cjs (if exist)
- [ ] **Hook Tests**: All hooks have corresponding .test.cjs files in tests/hooks/
- [ ] **Test Pass Rate**: 100% passing for all registered hooks
- [ ] **Enforcement Modes**: Check PLANNER_FIRST_ENFORCEMENT, CREATOR_GUARD, BASH_CWD_VALIDATOR env vars
- [ ] **Hook Metrics**: llm-usage-tracker.cjs logging to .claude/context/metrics/hook-metrics.jsonl

#### Test Commands

```bash
# List all registered hooks
node -e "const s = require('./.claude/settings.json'); console.log(JSON.stringify(s.hooks, null, 2))"

# Check test files exist for each hook
for hook in .claude/hooks/**/*.cjs; do
  test_file="tests/hooks/$(basename $hook .cjs).test.cjs"
  if [ ! -f "$test_file" ]; then echo "MISSING TEST: $hook"; fi
done

# Run all hook tests
npm test -- tests/hooks/

# Check enforcement modes in .env
grep -E "ENFORCEMENT|GUARD|VALIDATOR" .env
```

#### Expected Findings

1. **Missing Security Hooks** (bash-cwd-validator, shell-injection-validator not wired)
2. **Enforcement Mode Drift** (config.yaml vs .env vs runtime state)
3. **Hook Test Coverage Gaps** (some hooks may lack tests)

#### Success Criteria

- All CRITICAL hooks (routing-guard, unified-creator-guard, file-placement-guard) wired and enforcing
- 100% test pass rate for all registered hooks
- Documented enforcement mode for each hook (block/warn/off + reason)

#### Output

**Report**: `.claude/context/artifacts/audit-reports/hook-enforcement-audit-2026-02-04.md`

---

### Audit 4: ADR-076 File Placement Verification

**Agent**: qa + developer
**Duration**: 4-5 hours
**Parallel OK**: Yes

#### Scope

Validate ADR-076 File Placement Architecture Redesign claims:

- **Claim 1**: "147 test files migrated"
- **Claim 2**: Migration complete (all tests in `tests/`, none in `.claude/`)
- **Claim 3**: Linting errors resolved (issues.md shows LINT-001 open)

#### Validation Checklist

- [ ] **File Count Verification**: Count test files in `tests/` (should be 147)
- [ ] **Zero `.claude/` Tests**: Verify no .test.cjs files in `.claude/` (except examples)
- [ ] **Linting Clean**: Run `pnpm lint` (should return 0 errors, 0 warnings)
- [ ] **Import Paths Fixed**: All test imports use correct paths (no broken requires)
- [ ] **Test Execution**: Run `npm test` (100% pass rate required)
- [ ] **File Placement Guard**: Verify guard blocks test files in `.claude/`
- [ ] **Migration Script Existence**: scripts/testing/migrate-test-files.cjs exists

#### Test Commands

```bash
# Count test files in tests/
find tests/ -name "*.test.*js" | wc -l

# Check for lingering tests in .claude/
find .claude/ -name "*.test.*js" -not -path "*.example.*"

# Run linting (CRITICAL - blocks completion)
pnpm lint

# Run all tests
npm test

# Test file placement guard
# (Manual: try to Write a .test.cjs file to .claude/hooks/)
```

#### Expected Findings

1. **File Count Discrepancy** (CONFIRMED - 143 vs 147 claimed)
2. **Linting Errors** (CONFIRMED - LINT-001 open issue)
3. **Potential Import Path Failures** (48 files fixed, others may be broken)

#### Success Criteria

- Test file count matches documentation OR discrepancy explained
- Zero linting errors (blocks "complete" status)
- 100% test pass rate
- File placement guard blocks `.claude/` test writes

#### Output

**Report**: `.claude/context/artifacts/audit-reports/adr-076-verification-audit-2026-02-04.md`

---

### Audit 5: ADR-075 Model Selection Status

**Agent**: architect + developer
**Duration**: 4-6 hours
**Parallel OK**: Yes

#### Scope

Resolve ADR-075 status conflict:

- **decisions.md line 71**: "Status: Proposed"
- **learnings.md line 270**: "ADR-075 (ALL PHASES COMPLETE)"

#### Validation Checklist

- [ ] **Utility Existence**: agent-config-reader.cjs exists in `.claude/lib/utils/`
- [ ] **Hook Existence**: config-model-validator.cjs exists and registered
- [ ] **CLAUDE.md Updated**: Section 5 references config.yaml precedence
- [ ] **Router Updated**: router-decision.md Step 8 uses agent-config-reader
- [ ] **Orchestrator Compliance**: master-orchestrator, swarm-coordinator use config resolution
- [ ] **Test Coverage**: agent-config-reader.test.cjs exists and passes
- [ ] **Config.yaml Populated**: agents.{type}.model entries exist for planner, developer, qa, architect

#### Test Commands

```bash
# Check if utility exists
ls .claude/lib/utils/agent-config-reader.cjs

# Check if hook exists and is registered
ls .claude/hooks/routing/config-model-validator.cjs
grep "config-model-validator" .claude/settings.json

# Check CLAUDE.md references config.yaml
grep -C 3 "config.yaml" .claude/CLAUDE.md | grep -i "model"

# Check config.yaml has agent model entries
grep -A 5 "^agents:" .claude/config.yaml | grep "model:"

# Run utility tests
npm test -- tests/lib/agent-config-reader.test.cjs
```

#### Expected Findings

1. **Status Inconsistency** (Proposed vs Complete - one file is wrong)
2. **Partial Implementation** (some phases done, others pending)
3. **Documentation Drift** (implementation complete but docs not updated)

#### Success Criteria

- ADR-075 status consistent across all memory files
- If "Complete": All 6 implementation phases validated
- If "Proposed": Timeline for completion documented

#### Output

**Report**: `.claude/context/artifacts/audit-reports/adr-075-status-audit-2026-02-04.md`

---

### Audit 6: Router & Task System Audit

**Agent**: qa + developer
**Duration**: 5-7 hours
**Parallel OK**: Yes

#### Scope

Validate core routing functionality:

1. **Router Protocol Enforcement** (CLAUDE.md Section 0-1)
2. **TaskUpdate Iron Laws** (TaskUpdate before/after work)
3. **Agent Spawning** (Task tool usage, model resolution)

#### Validation Checklist

- [ ] **Router Tool Whitelist**: Router restricted to Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read, AskUserQuestion
- [ ] **Router Blacklist Enforcement**: Router cannot use Edit, Write, Bash (implementation), Glob, Grep, WebSearch
- [ ] **TaskUpdate Protocol**: Test tasks complete with TaskUpdate({ status: 'completed' })
- [ ] **Agent Mode Lifecycle**: Router stays in agent mode until session end (ROUTER-MONITORING-001)
- [ ] **Model Resolution**: Task() calls resolve model from config.yaml (if ADR-075 complete)
- [ ] **Spawn Template Compliance**: Templates include TaskUpdate warning box, PROJECT_ROOT, Memory Protocol
- [ ] **Task Completion Tracking**: Tasks don't get stuck "in_progress" forever

#### Test Commands

```bash
# Check routing-guard.cjs enforcement
npm test -- tests/hooks/routing-guard.test.cjs

# Verify router tool restrictions
grep -E "(Edit|Write|Glob|Grep|WebSearch)" .claude/CLAUDE.md | grep "Router.*NOT"

# Check spawn templates
grep "TaskUpdate" .claude/templates/spawn/*.md | wc -l

# Check post-task-unified.cjs for exitAgentMode removal
grep "exitAgentMode" .claude/hooks/routing/post-task-unified.cjs

# Run task system integration tests
npm test -- tests/integration/task-*.test.*js
```

#### Expected Findings

1. **Agent Mode Exit Issue** (ROUTER-MONITORING-001 - fixed per ADR-070?)
2. **Model Resolution Integration** (depends on ADR-075 status)
3. **TaskUpdate Compliance Gaps** (agents may forget to call TaskUpdate)

#### Success Criteria

- Router tool restrictions enforced (routing-guard.cjs tests pass)
- Agent mode lifecycle correct (stays active until session end)
- Task completion tracking functional (no stuck tasks)

#### Output

**Report**: `.claude/context/artifacts/audit-reports/router-task-system-audit-2026-02-04.md`

---

### Audit 7: Configuration Synchronization

**Agent**: devops + qa
**Duration**: 4-5 hours
**Parallel OK**: Yes

#### Scope

Verify config.yaml, hooks, and routing table are synchronized:

1. **config.yaml → settings.json** (hook registration)
2. **config.yaml → CLAUDE.md** (agent model mappings)
3. **config.yaml → routing table** (agent entries)

#### Validation Checklist

- [ ] **Agent Models**: config.yaml agents.{type}.model matches CLAUDE.md Section 3
- [ ] **Hook Registration**: All hooks in config.yaml also in settings.json
- [ ] **Feature Flags**: config.yaml flags match .env (PARTY_MODE_ENABLED, etc.)
- [ ] **Routing Table**: All agents in config.yaml have routing entry in CLAUDE.md
- [ ] **Environment Variables**: .env.example matches actual configuration needs
- [ ] **Model Aliases**: config.yaml model_aliases section exists and is used
- [ ] **Orchestrator Config**: master-orchestrator, party-orchestrator read config.yaml

#### Test Commands

```bash
# Compare config.yaml agents to CLAUDE.md routing table
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const config = yaml.load(fs.readFileSync('.claude/config.yaml', 'utf8'));
console.log('Agents in config.yaml:', Object.keys(config.agents || {}));
"

# Check hook registration consistency
diff <(grep -oP '"\K[^"]+(?=\.cjs)' .claude/config.yaml | sort) \
     <(grep -oP '"\K[^"]+(?=\.cjs)' .claude/settings.json | sort)

# Verify feature flags
grep -E "PARTY_MODE|ELICITATION" .claude/config.yaml .env

# Check model_aliases section
grep -A 10 "^model_aliases:" .claude/config.yaml
```

#### Expected Findings

1. **Config Drift** (config.yaml not loaded by some agents)
2. **Hook Registration Gaps** (hooks defined but not registered)
3. **Feature Flag Inconsistency** (config.yaml vs .env mismatch)

#### Success Criteria

- config.yaml is authoritative source for all configuration
- All hooks registered in settings.json
- No configuration drift between files

#### Output

**Report**: `.claude/context/artifacts/audit-reports/configuration-sync-audit-2026-02-04.md`

---

## Integration Points (Dependencies)

### Audit 1 → All Audits

**Dependency**: Memory Integrity audit must complete first to identify known stale data.

**Reason**: Other audits reference memory files (issues.md, decisions.md) for expected findings.

### Audit 4 ↔ Audit 5

**Dependency**: ADR-076 and ADR-075 audits share file placement validation logic.

**Integration**: Both audits check if utilities exist in correct locations per file placement architecture.

### Audit 2 ↔ Audit 3

**Dependency**: Shell Security audit findings feed into Hook Enforcement audit.

**Integration**: If bash-cwd-validator exists, Audit 3 validates it's enforcing; if not, Audit 2 documents risk.

### Audit 6 ↔ Audit 7

**Dependency**: Router audit validates config.yaml usage; Config audit validates config.yaml content.

**Integration**: Router spawn logic should use config.yaml (validated by Audit 7).

---

## Consolidated Findings Template

After all 7 audits complete, generate:

**File**: `.claude/context/artifacts/audit-reports/CONSOLIDATED-AUDIT-FINDINGS-2026-02-04.md`

### Structure

```markdown
# Consolidated Audit Findings

## Executive Summary

[2-3 paragraph overview of all findings]

## Critical Issues (Blocking)

| ID | Issue | Affected Area | Evidence | Fix Priority |
|----|-------|---------------|----------|--------------|
| C1 | [Description] | [Area] | [File:Line] | CRITICAL |

## High Priority Issues

[Same table structure]

## Medium Priority Issues

[Same table structure]

## Low Priority Issues

[Same table structure]

## Fix Prioritization Matrix

| Priority | Issue Count | Estimated Effort | Blocking For | Recommended Order |
|----------|-------------|------------------|--------------|-------------------|
| CRITICAL | X | Y hours | [Feature/Release] | Fix 1, Fix 2 |
| HIGH | X | Y hours | [Feature/Release] | Fix 3, Fix 4 |
| MEDIUM | X | Y hours | [Future work] | Fix 5, Fix 6 |
| LOW | X | Y hours | [Nice-to-have] | Fix 7, Fix 8 |

## Resolution Timelines

- **CRITICAL**: 1-2 days (drop everything)
- **HIGH**: 3-5 days (this sprint)
- **MEDIUM**: 1-2 weeks (next sprint)
- **LOW**: 1 month (backlog)

## Audit Metrics

- Total findings: X
- False positives: Y
- Memory inconsistencies: Z
- Configuration drift issues: N
- Security vulnerabilities: M
```

---

## Fix Prioritization Matrix (Initial Template)

Based on known issues from memory files:

| Priority | Issue | Area | Evidence | Estimated Fix | Blocking For |
|----------|-------|------|----------|---------------|--------------|
| **CRITICAL** | SHELL-SECURITY-001 | CWD initialization | issues.md:40-71 | 4-6 hours | All background Bash tasks |
| **CRITICAL** | SHELL-SECURITY-002 | Shell injection | issues.md:74-116 | 6-8 hours | All Bash commands |
| **CRITICAL** | ROUTER-MONITORING-001 | Agent mode exit | issues.md:293-339 | Fixed per ADR-070? | Multi-agent workflows |
| **HIGH** | LINT-001 | ADR-076 linting | issues.md:213-235 | 2-3 hours | ADR-076 completion claim |
| **HIGH** | CONFIG-001 | Model selection | issues.md:262-290 | 19 hours (ADR-075) | Router config compliance |
| **MEDIUM** | MIGRATION-001 | File count mismatch | issues.md:238-259 | 1 hour | Documentation accuracy |
| **MEDIUM** | active_context.md | 6-day staleness | N/A | 30 min | Memory freshness |
| **LOW** | ADR-075/076 status | Status inconsistency | decisions.md vs learnings.md | 15 min | Documentation accuracy |

---

## Execution Plan

### Phase 1: Launch Audits (Day 1, Hour 1)

Spawn 7 agents in parallel:

```javascript
// Audit 1: Memory System
Task({
  subagent_type: 'developer',
  prompt: 'Execute Audit 1: Memory System Integrity. Read COMPREHENSIVE_AUDIT_PLAN.md, validate all checklist items, generate findings report.',
  task_id: 'audit-1-memory'
});

// Audit 2: Shell Security
Task({
  subagent_type: 'security-architect',
  prompt: 'Execute Audit 2: Shell Security Deep Dive. Investigate SHELL-SECURITY-001/002, validate findings, generate report.',
  task_id: 'audit-2-shell'
});

// Audit 3: Hook Enforcement
Task({
  subagent_type: 'qa',
  prompt: 'Execute Audit 3: Hook Enforcement Validation. Check all hooks wired, tested, enforcing.',
  task_id: 'audit-3-hooks'
});

// Audit 4: ADR-076 Verification
Task({
  subagent_type: 'qa',
  prompt: 'Execute Audit 4: ADR-076 File Placement Verification. Validate migration claims.',
  task_id: 'audit-4-adr076'
});

// Audit 5: ADR-075 Status
Task({
  subagent_type: 'architect',
  prompt: 'Execute Audit 5: ADR-075 Model Selection Status. Resolve Proposed vs Complete conflict.',
  task_id: 'audit-5-adr075'
});

// Audit 6: Router & Task System
Task({
  subagent_type: 'qa',
  prompt: 'Execute Audit 6: Router & Task System Audit. Validate routing protocol enforcement.',
  task_id: 'audit-6-router'
});

// Audit 7: Configuration Sync
Task({
  subagent_type: 'devops',
  prompt: 'Execute Audit 7: Configuration Synchronization. Check config.yaml vs settings.json vs CLAUDE.md.',
  task_id: 'audit-7-config'
});
```

### Phase 2: Monitor Progress (Day 1-2)

Check task completion:

```bash
TaskList() # Every 2 hours
```

### Phase 3: Consolidate Findings (Day 2-3)

After all 7 audits complete:

```javascript
Task({
  subagent_type: 'architect',
  prompt: 'Consolidate all 7 audit findings into CONSOLIDATED-AUDIT-FINDINGS-2026-02-04.md. Use template from COMPREHENSIVE_AUDIT_PLAN.md.',
  task_id: 'audit-consolidation'
});
```

### Phase 4: Prioritization Review (Day 3)

Review fix matrix with user:

- Approve CRITICAL fixes (immediate)
- Schedule HIGH fixes (this sprint)
- Defer MEDIUM/LOW (next sprint/backlog)

---

## Success Metrics

- [ ] All 7 audit tasks completed
- [ ] Consolidated findings report generated
- [ ] Every CRITICAL issue has fix timeline
- [ ] Every "complete" ADR validated or marked incomplete
- [ ] Fix prioritization matrix approved
- [ ] No "unknown unknowns" remaining (exhaustive coverage)

---

## Risks & Mitigations

### Risk 1: Audit Findings Conflict

**Scenario**: Audit 4 says ADR-076 incomplete, but Audit 5 depends on file placement.

**Mitigation**: Audits are independent; consolidation phase resolves conflicts.

### Risk 2: Too Many Findings (Overwhelm)

**Scenario**: 50+ findings make prioritization hard.

**Mitigation**: Use severity + blocking criteria to auto-prioritize top 10.

### Risk 3: Audit Agent Failure

**Scenario**: Audit 2 agent runs out of context before completing.

**Mitigation**: Compress audit plan per-audit; spawn context-compressor if needed.

---

## Appendix A: Evidence Collection Commands

Quick reference for common audit commands:

```bash
# Memory file ages
ls -lh .claude/context/memory/

# Hook registration check
grep -c "\.cjs" .claude/settings.json

# Test file counts
find tests/ -name "*.test.*js" | wc -l
find .claude/ -name "*.test.*js" | wc -l

# Linting
pnpm lint

# All tests
npm test

# ADR status check
grep -E "Status: (Proposed|Accepted|Complete)" .claude/context/memory/decisions.md

# Configuration comparison
diff <(grep "model:" .claude/config.yaml) <(grep "model:" .claude/CLAUDE.md)

# Hook test coverage
for hook in .claude/hooks/**/*.cjs; do
  basename $hook
  ls tests/hooks/$(basename $hook .cjs).test.cjs 2>/dev/null || echo "  ❌ NO TEST"
done
```

---

## Appendix B: Audit Report Template

Each audit generates a report using this template:

```markdown
# [Audit Name] Report

**Audit ID**: [1-7]
**Date**: 2026-02-04
**Agent**: [agent-type]
**Duration**: [hours]
**Status**: COMPLETE | PARTIAL | BLOCKED

## Executive Summary

[2-3 sentences summarizing findings]

## Validation Results

### Checklist Completion

- [x] Item 1
- [ ] Item 2 (FAILED - reason)

### Test Execution

| Test | Result | Evidence |
|------|--------|----------|
| Test 1 | PASS | [file:line] |
| Test 2 | FAIL | [error output] |

## Findings

### Critical Findings (Blocking)

**Finding C1**: [Description]

- **Evidence**: [file:line, test output, grep result]
- **Impact**: [what breaks]
- **Fix**: [recommended remediation]
- **Priority**: CRITICAL

### High Priority Findings

[Same structure]

### Medium/Low Findings

[Same structure]

## Recommendations

1. Fix C1 immediately (blocking)
2. Schedule H1-H3 for this sprint
3. Defer M1-M5 to backlog

## Integration Points

- **Depends on**: [other audit IDs]
- **Blocks**: [other audit IDs]
- **Cross-references**: [related findings]

## Appendix: Evidence Files

- grep-output.txt
- test-results.log
- file-comparison.diff
```

---

**END OF AUDIT PLAN**

**Next Steps**:

1. User approves plan
2. Router spawns 7 audit tasks in parallel
3. Agents execute audits (2-3 days)
4. Consolidation agent generates final report
5. User reviews fix prioritization matrix
6. Implementation begins (CRITICAL fixes first)
