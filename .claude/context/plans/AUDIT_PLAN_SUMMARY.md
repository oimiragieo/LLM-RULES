# Comprehensive Audit Plan - Quick Reference

**Full Plan**: `.claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md`
**Date**: 2026-02-04
**Status**: READY FOR EXECUTION

## Critical Findings to Validate

### 🔴 CRITICAL (Immediate Fix Required)

1. **SHELL-SECURITY-001/002** - Background Bash tasks missing CWD, no shell injection validation
2. **ROUTER-MONITORING-001** - Router stops monitoring subagents (claims fixed ADR-070, needs validation)
3. **CONFIG-001** - Router ignores config.yaml model selection (ADR-075 status unclear)

### 🟡 HIGH (This Sprint)

4. **LINT-001** - ADR-076 migration has linting errors (blocks completion claim)
5. **ADR-075 Status Conflict** - Marked "Proposed" in decisions.md but "ALL PHASES COMPLETE" in learnings.md
6. **Active Context Staleness** - active_context.md is 6 days old (2026-01-28 vs 2026-02-04)

### 🟠 MEDIUM (Next Sprint)

7. **MIGRATION-001** - ADR-076 claims 147 test files migrated, verification found 143
8. **Party Mode Integration** - Claimed "production ready" but no post-deployment validation

## 7 Parallel Audit Tasks

| ID | Audit | Agent | Duration | Output |
|----|-------|-------|----------|--------|
| 1 | Memory System Integrity | developer + qa | 4-6h | memory-integrity-audit-2026-02-04.md |
| 2 | Shell Security Deep Dive | security-architect + developer | 6-8h | shell-security-audit-2026-02-04.md |
| 3 | Hook Enforcement Validation | qa + developer | 5-7h | hook-enforcement-audit-2026-02-04.md |
| 4 | ADR-076 File Placement | qa + developer | 4-5h | adr-076-verification-audit-2026-02-04.md |
| 5 | ADR-075 Model Selection Status | architect + developer | 4-6h | adr-075-status-audit-2026-02-04.md |
| 6 | Router & Task System | qa + developer | 5-7h | router-task-system-audit-2026-02-04.md |
| 7 | Configuration Synchronization | devops + qa | 4-5h | configuration-sync-audit-2026-02-04.md |

**Total Effort**: 32-44 hours (parallelized to 2-3 days)

## Quick Start Commands

### Launch All Audits (Parallel)

```bash
# From Router context
TaskList()

# Spawn Audit 1: Memory Integrity
Task({ subagent_type: 'developer', prompt: 'Execute Audit 1 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-1-memory' })

# Spawn Audit 2: Shell Security
Task({ subagent_type: 'security-architect', prompt: 'Execute Audit 2 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-2-shell' })

# Spawn Audit 3: Hook Enforcement
Task({ subagent_type: 'qa', prompt: 'Execute Audit 3 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-3-hooks' })

# Spawn Audit 4: ADR-076 Verification
Task({ subagent_type: 'qa', prompt: 'Execute Audit 4 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-4-adr076' })

# Spawn Audit 5: ADR-075 Status
Task({ subagent_type: 'architect', prompt: 'Execute Audit 5 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-5-adr075' })

# Spawn Audit 6: Router & Task System
Task({ subagent_type: 'qa', prompt: 'Execute Audit 6 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-6-router' })

# Spawn Audit 7: Configuration Sync
Task({ subagent_type: 'devops', prompt: 'Execute Audit 7 from COMPREHENSIVE_AUDIT_PLAN.md', task_id: 'audit-7-config' })
```

### Monitor Progress

```bash
# Check every 2 hours
TaskList()
```

### Consolidate Findings

After all 7 complete:

```bash
Task({
  subagent_type: 'architect',
  prompt: 'Consolidate all 7 audit findings into CONSOLIDATED-AUDIT-FINDINGS-2026-02-04.md per template in COMPREHENSIVE_AUDIT_PLAN.md',
  task_id: 'audit-consolidation'
})
```

## Expected Deliverables

1. **7 Individual Audit Reports** (one per audit task)
2. **Consolidated Findings Report** (synthesis of all 7)
3. **Fix Prioritization Matrix** (CRITICAL → LOW)
4. **Resolution Timelines** (1-2 days CRITICAL, 3-5 days HIGH, etc.)

## Success Criteria

- [ ] All 7 audit tasks completed
- [ ] Every CRITICAL issue has fix timeline or documented resolution
- [ ] Every "complete" ADR validated (ADR-076, ADR-075)
- [ ] All open SHELL-SECURITY issues have resolution plan
- [ ] Configuration drift identified and documented
- [ ] Fix prioritization matrix approved for implementation

## Next Steps (After Audit Complete)

1. Review consolidated findings report
2. Approve fix prioritization matrix
3. Assign CRITICAL fixes to developers (1-2 day sprint)
4. Schedule HIGH fixes (3-5 day sprint)
5. Defer MEDIUM/LOW to backlog

---

**Full details**: Read `.claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md`
