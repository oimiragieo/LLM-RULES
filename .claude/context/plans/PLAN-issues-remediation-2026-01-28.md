# Plan: Issues Remediation Sprint - 2026-01-28

## Executive Summary

This plan addresses the 36 OPEN issues identified in `.claude/context/memory/issues.md`. Focus is on "quick wins" that can be completed in under 1 hour each, delivering immediate value while reducing technical debt.

## Issue Analysis Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0 (Critical)** | 2 | SEC-AUDIT-013 (Windows atomic write), SEC-AUDIT-014 (Lock TOCTOU) |
| **P1 (High)** | 7 | Testing blockers, routing errors, security gaps |
| **P2 (Medium)** | 15 | Documentation gaps, performance, process improvements |
| **P3 (Low)** | 12 | Minor improvements, structural cleanup |

## Phase 1: Critical Path Fixes (~1.5 hours)

**Purpose**: Fix issues blocking core functionality

### Tasks

- [ ] **1.1** Fix ROUTING-001: Correct 3 wrong agent paths in CLAUDE.md (~15 min)
  - **Task ID**: #2
  - **Command**: Edit CLAUDE.md Section 3, change `core` to `specialized` for code-reviewer, security-architect, devops
  - **Verify**: `grep -E "(code-reviewer|security-architect|devops).*specialized" .claude/CLAUDE.md`

- [ ] **1.2** Fix ARCH-004: Update technical-writer.md deprecated skill reference (~5 min)
  - **Task ID**: #3
  - **Command**: Edit `.claude/agents/core/technical-writer.md`, replace `writing` with `writing-skills`
  - **Verify**: `grep "writing-skills" .claude/agents/core/technical-writer.md`

- [ ] **1.3** Add TESTING-003: Register claude command in validator (~45 min)
  - **Task ID**: #4
  - **Command**: Add `claude` to SAFE_COMMANDS_ALLOWLIST in registry.cjs
  - **Verify**: `claude --version` executes without SEC-AUDIT-017 error

**Success Criteria**: All 3 tasks complete, tests pass, no blocking errors

---

## Phase 2: Documentation Fixes (~1.5 hours)

**Purpose**: Improve discoverability and reduce routing failures

### Tasks

- [ ] **2.1** Fix ARCH-002: Add 6 undocumented workflows to CLAUDE.md (~30 min)
  - **Task ID**: #1
  - **Files to add**: security-architect-skill-workflow.md, architecture-review-skill-workflow.md, consensus-voting-skill-workflow.md, swarm-coordination-skill-workflow.md, database-architect-skill-workflow.md, context-compressor-skill-workflow.md
  - **Verify**: All 6 workflows appear in Section 8.6 table

- [ ] **2.2** Fix DOC-002: Add IRON LAW emphasis to Section 7 (~30 min)
  - **Task ID**: #7
  - **Check**: May already be partially implemented - verify before changes
  - **Verify**: Section 7 has visceral language about workflow requirements

- [ ] **2.3** Fix POINTER-003: Add Related Workflows to architect.md (~20 min)
  - **Task ID**: #6
  - **Add references to**: architecture-review-skill-workflow.md, consensus-voting-skill-workflow.md
  - **Verify**: architect.md has "Related Workflows" section

**Success Criteria**: All documentation gaps filled, no orphan workflows

---

## Phase 3: Audit and Verification (~1.5 hours)

**Purpose**: Validate catalog accuracy and security posture

### Tasks

- [ ] **3.1** Audit ARCH-003: Verify skill catalog count (~45 min)
  - **Task ID**: #5
  - **Command**: `ls -d .claude/skills/*/ | wc -l` and compare to catalog header
  - **Verify**: Catalog count matches filesystem, discrepancies documented

- [ ] **3.2** Fix SEC-AUDIT-021: Remove debug override hints (~45 min)
  - **Task ID**: #9
  - **Search**: `grep -r "PLANNER_FIRST_ENFORCEMENT\|ROUTER_WRITE_GUARD\|CREATOR_GUARD" .claude/hooks/`
  - **Verify**: Error messages don't expose override mechanisms

**Success Criteria**: Catalog accurate, security messages hardened

---

## Phase 4: Structural Improvements (~1.5 hours)

**Purpose**: Improve codebase organization

### Tasks

- [ ] **4.1** Fix STRUCT-001: Consolidate skill workflows location (~45 min)
  - **Task ID**: #8
  - **Action**: Create `.claude/workflows/skills/` and move *-skill-workflow.md files
  - **Verify**: All skill workflows in consistent location

- [ ] **4.2** Fix POINTER-001: Create example diagrams (~60 min)
  - **Task ID**: #10
  - **Create**: At least one architecture diagram showing framework components
  - **Verify**: `.claude/context/artifacts/diagrams/` has content beyond .gitkeep

**Success Criteria**: Consistent structure, example diagrams exist

---

## Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

### Tasks

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| CLAUDE.md edit breaks routing | High | Test routing after changes | `git checkout .claude/CLAUDE.md` |
| Validator change too permissive | Medium | Add minimal validator, not blanket allow | `git checkout .claude/hooks/safety/validators/` |
| Workflow moves break references | Medium | Search for references before moving | `git stash && git checkout .` |

## Timeline Summary

| Phase | Tasks | Est. Time | Priority |
|-------|-------|-----------|----------|
| 1 (Critical) | 3 | ~1.5h | P0/P1 |
| 2 (Docs) | 3 | ~1.5h | P1/P2 |
| 3 (Audit) | 2 | ~1.5h | P2 |
| 4 (Structural) | 2 | ~1.5h | P2/P3 |
| FINAL | 1 | ~30min | - |
| **Total** | **11** | **~6.5h** | |

---

## Issues NOT Addressed (Deferred to Next Sprint)

### P0 (Require deeper investigation)
- **SEC-AUDIT-013**: Windows atomic write race - needs Windows-specific testing
- **SEC-AUDIT-014**: TOCTOU in lock file - needs proper-lockfile package evaluation

### P1 (Require significant effort)
- **SEC-REMEDIATION-003**: Researcher Agent data exfiltration risk (4-6 hours)
- **SEC-AUDIT-016**: Environment variable override logging (2-3 hours)
- **SEC-AUDIT-018**: Evolution state tampering (6-10 hours)

### P2 (Performance - separate sprint)
- **HOOK-001**: parseHookInput() deduplication (2000 lines, 3-4 hours)
- **HOOK-002**: findProjectRoot() deduplication (1.5 hours)
- **PERF-004/005**: State cache integration (3 hours total)

### P3 (Backlog)
- **PROC-010**: Hooks development documentation
- **NEW-MED-002**: Debug logging for silent catch blocks
- **HOOK-006/007/008/009**: Minor hook improvements

---

## Memory Protocol

**Files to update after completion**:
- `.claude/context/memory/learnings.md` - Document any patterns discovered
- `.claude/context/memory/issues.md` - Mark resolved issues

---

*Plan generated by PLANNER agent on 2026-01-28*
*Following plan-generator skill workflow*
