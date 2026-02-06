# Audit Execution Checklist

**Plan**: COMPREHENSIVE_AUDIT_PLAN.md
**Date**: 2026-02-04
**Status**: READY TO EXECUTE

## Pre-Audit Checklist

### Environment Preparation

- [ ] Git status clean (or known changes documented)
- [ ] All tests passing baseline: `npm test` (record current pass rate)
- [ ] Linting baseline: `pnpm lint` (record current error count)
- [ ] Memory files backed up:
  ```bash
  cp -r .claude/context/memory/ .claude/context/memory-backup-$(date +%Y%m%d)/
  ```

### Agent Availability

- [ ] developer agent available (Audits 1, 2, 3, 4, 5)
- [ ] qa agent available (Audits 1, 3, 4, 6, 7)
- [ ] security-architect agent available (Audit 2)
- [ ] architect agent available (Audit 5)
- [ ] devops agent available (Audit 7)

### Context Validation

- [ ] COMPREHENSIVE_AUDIT_PLAN.md readable (no corruption)
- [ ] Audit output directory exists: `.claude/context/artifacts/audit-reports/`
- [ ] All referenced files in plan exist:
  - `.claude/context/memory/learnings.md`
  - `.claude/context/memory/decisions.md`
  - `.claude/context/memory/issues.md`
  - `.claude/context/memory/active_context.md`
  - `.claude/config.yaml`
  - `.claude/settings.json`
  - `.claude/CLAUDE.md`

---

## Audit Execution Checklist

### Phase 1: Launch Audits (Hour 0-1)

- [ ] **Audit 1: Memory System Integrity**
  ```javascript
  Task({
    subagent_type: 'developer',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 1: Memory System Integrity. Validate all checklist items. Generate findings report at .claude/context/artifacts/audit-reports/memory-integrity-audit-2026-02-04.md',
    task_id: 'audit-1-memory'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 4-6 hours

- [ ] **Audit 2: Shell Security Deep Dive**
  ```javascript
  Task({
    subagent_type: 'security-architect',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 2: Shell Security Deep Dive. Investigate SHELL-SECURITY-001 and SHELL-SECURITY-002. Generate findings report at .claude/context/artifacts/audit-reports/shell-security-audit-2026-02-04.md',
    task_id: 'audit-2-shell'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 6-8 hours

- [ ] **Audit 3: Hook Enforcement Validation**
  ```javascript
  Task({
    subagent_type: 'qa',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 3: Hook Enforcement Validation. Check all hooks are wired, tested, and enforcing. Generate findings report at .claude/context/artifacts/audit-reports/hook-enforcement-audit-2026-02-04.md',
    task_id: 'audit-3-hooks'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 5-7 hours

- [ ] **Audit 4: ADR-076 File Placement Verification**
  ```javascript
  Task({
    subagent_type: 'qa',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 4: ADR-076 File Placement Verification. Validate migration claims (147 test files, zero linting errors). Generate findings report at .claude/context/artifacts/audit-reports/adr-076-verification-audit-2026-02-04.md',
    task_id: 'audit-4-adr076'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 4-5 hours

- [ ] **Audit 5: ADR-075 Model Selection Status**
  ```javascript
  Task({
    subagent_type: 'architect',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 5: ADR-075 Model Selection Status. Resolve Proposed vs Complete status conflict. Generate findings report at .claude/context/artifacts/audit-reports/adr-075-status-audit-2026-02-04.md',
    task_id: 'audit-5-adr075'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 4-6 hours

- [ ] **Audit 6: Router & Task System Audit**
  ```javascript
  Task({
    subagent_type: 'qa',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 6: Router & Task System Audit. Validate routing protocol enforcement and task completion tracking. Generate findings report at .claude/context/artifacts/audit-reports/router-task-system-audit-2026-02-04.md',
    task_id: 'audit-6-router'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 5-7 hours

- [ ] **Audit 7: Configuration Synchronization**
  ```javascript
  Task({
    subagent_type: 'devops',
    prompt: 'Read .claude/context/artifacts/plans/COMPREHENSIVE_AUDIT_PLAN.md. Execute Audit 7: Configuration Synchronization. Check config.yaml vs settings.json vs CLAUDE.md consistency. Generate findings report at .claude/context/artifacts/audit-reports/configuration-sync-audit-2026-02-04.md',
    task_id: 'audit-7-config'
  })
  ```
  - [ ] Task spawned successfully
  - [ ] Agent acknowledged task
  - [ ] Estimated completion: 4-5 hours

### Phase 2: Monitor Progress (Every 2 hours)

**Hour 2**:
- [ ] Run `TaskList()` - check task statuses
- [ ] Verify no agents stuck (status = in_progress for >4 hours without updates)
- [ ] Check `.claude/context/artifacts/audit-reports/` for partial outputs

**Hour 4**:
- [ ] Run `TaskList()` - check task statuses
- [ ] Expected: 2-3 audits complete (shorter ones: Audits 4, 5, 7)
- [ ] Review completed reports for critical blockers

**Hour 6**:
- [ ] Run `TaskList()` - check task statuses
- [ ] Expected: 4-5 audits complete
- [ ] Review completed reports

**Hour 8**:
- [ ] Run `TaskList()` - check task statuses
- [ ] Expected: 6-7 audits complete
- [ ] Identify any blocked audits

**Hour 10**:
- [ ] All audits complete or escalate blockers

### Phase 3: Consolidate Findings (After All Complete)

- [ ] **Verify all 7 reports exist**:
  ```bash
  ls -lh .claude/context/artifacts/audit-reports/*-audit-2026-02-04.md
  ```
  Expected: 7 files

- [ ] **Spawn consolidation task**:
  ```javascript
  Task({
    subagent_type: 'architect',
    prompt: 'Read all 7 audit reports in .claude/context/artifacts/audit-reports/ (memory-integrity, shell-security, hook-enforcement, adr-076-verification, adr-075-status, router-task-system, configuration-sync). Read COMPREHENSIVE_AUDIT_PLAN.md Consolidated Findings Template. Generate CONSOLIDATED-AUDIT-FINDINGS-2026-02-04.md synthesizing all findings with fix prioritization matrix.',
    task_id: 'audit-consolidation'
  })
  ```

- [ ] **Consolidation complete**
  - [ ] CONSOLIDATED-AUDIT-FINDINGS-2026-02-04.md exists
  - [ ] Executive summary written
  - [ ] Fix prioritization matrix generated
  - [ ] Resolution timelines documented

---

## Post-Audit Checklist

### Validation

- [ ] All 7 audit reports generated (no missing audits)
- [ ] Consolidated report exists
- [ ] Fix prioritization matrix has entries for all CRITICAL/HIGH issues
- [ ] Every "complete" ADR validated (ADR-076, ADR-075) or marked incomplete

### Review Preparation

- [ ] Print executive summary for user review
- [ ] Identify top 3 CRITICAL fixes
- [ ] Estimate total fix effort (CRITICAL + HIGH)
- [ ] Prepare fix timeline proposal:
  - CRITICAL: 1-2 days (immediate)
  - HIGH: 3-5 days (this sprint)
  - MEDIUM: 1-2 weeks (next sprint)
  - LOW: 1 month (backlog)

### Memory Update

- [ ] Record audit completion in learnings.md:
  ```
  ## Comprehensive Audit Complete (2026-02-04)
  - Total findings: [X]
  - CRITICAL: [Y]
  - HIGH: [Z]
  - Key findings: [list top 3]
  ```

- [ ] Update active_context.md with current session state
- [ ] Record any new issues discovered in issues.md

### Archive

- [ ] Create audit archive directory:
  ```bash
  mkdir -p .claude/context/artifacts/audit-archives/2026-02-04/
  ```

- [ ] Copy all audit reports to archive:
  ```bash
  cp .claude/context/artifacts/audit-reports/*-audit-2026-02-04.md \
     .claude/context/artifacts/audit-archives/2026-02-04/
  ```

- [ ] Create audit index:
  ```bash
  ls -1 .claude/context/artifacts/audit-archives/2026-02-04/ > \
     .claude/context/artifacts/audit-archives/2026-02-04/INDEX.txt
  ```

---

## Emergency Procedures

### Agent Stuck (>4 hours no progress)

1. Check agent context size (may be at limit)
2. Spawn context-compressor to reduce context
3. Restart agent with compressed context
4. If persistent: Split audit into smaller sub-tasks

### Audit Failure (Agent Cannot Complete)

1. Document failure reason in audit report
2. Mark audit as PARTIAL in checklist
3. Note missing validation items
4. Continue with other audits
5. Re-attempt failed audit after others complete

### Critical Blocker Found Mid-Audit

1. Document blocker immediately in issues.md
2. Tag as CRITICAL with date discovered
3. Notify user immediately
4. Continue audit (blocker is a finding, not a halt condition)

---

## Success Criteria (Final Gate)

- [ ] All 7 audit tasks marked completed in TaskList
- [ ] All 7 individual reports generated
- [ ] Consolidated findings report exists
- [ ] Fix prioritization matrix has ≥1 entry per critical issue
- [ ] Every CRITICAL issue has fix timeline or resolution plan
- [ ] User approves fix prioritization matrix

**AUDIT COMPLETE** when all criteria pass.

---

**Next**: Present consolidated findings to user → Approve fix matrix → Execute CRITICAL fixes
