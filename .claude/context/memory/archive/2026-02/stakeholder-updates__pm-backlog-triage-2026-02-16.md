<!-- Agent: pm | Task: #10 | Session: 2026-02-16 -->

# Product Backlog: Agent Studio Architecture Review Findings
**Date**: 2026-02-16
**PM Agent**: Product Manager
**Status**: Draft

---

## Executive Summary

This backlog prioritizes 11 outstanding issues discovered during the comprehensive codebase analysis. Issues are grouped by priority (P0-P3) using RICE scoring (Reach × Impact × Confidence / Effort) and MoSCoW categorization. 8 issues were already fixed; this backlog addresses the remaining work.

**Key Statistics**:
- **Total Outstanding Issues**: 11 items
- **P0 (Blocking)**: 2 items (CI validation gaps, path traversal)
- **P1 (High)**: 4 items (agent-config.json, dead hooks, archive policy, Windows atomic ops)
- **P2 (Medium)**: 3 items (CI hook validation, CI skill-agent mapping, CI tool deprecation)
- **P3 (Nice-to-have)**: 2 items (documentation, test coverage)

---

## Priority Framework

### RICE Scoring
- **Reach**: How many workflows affected? (1-10)
- **Impact**: Severity of problem? (1-10)
- **Confidence**: How certain are we? (0.1-1.0)
- **Effort**: Implementation cost? (1-10, lower = less effort)

### MoSCoW Mapping
- **Must Have**: P0 (blocking production/security)
- **Should Have**: P1 (high value, include if time permits)
- **Could Have**: P2 (nice to have, defer if needed)
- **Won't Have**: P3 (explicitly deferred to future sprints)

---

## P0 (BLOCKING) - Must Fix Immediately

### 1. CI Validation Gates Missing (BLOCKER)

**RICE Score**: (8 × 9 × 0.9) / 3 = **21.6**

**Problem Statement**:
No automated CI validation for hook registrations, skill-agent mapping, or deprecated tools. Manual verification is error-prone and doesn't scale. Framework integrity depends on these mappings being correct.

**Evidence**:
- 75+ hooks in `.claude/hooks/` with no registration validation
- Skill-agent mapping in catalogs is manually maintained
- Tool deprecation moves to `_archive/` without automated checks
- Recent hook consolidation (2026-02-08) required manual settings.json edits

**Impact**:
- **Reach**: 10/10 (affects all agent spawns, all skills)
- **Impact**: 9/10 (broken mappings = agents can't find skills)
- **Confidence**: 0.9 (high - we know this is missing)
- **Effort**: 3/10 (CI scripts for validation)

**Acceptance Criteria**:
- [ ] CI validates `.claude/settings.json` hook registrations match existing files
- [ ] CI validates skill-catalog.md entries have corresponding SKILL.md files
- [ ] CI validates deprecated tools in `_archive/` aren't referenced in active code
- [ ] CI fails PR if validation errors found
- [ ] Validation runs on every commit to `.claude/`

**Priority**: **MUST HAVE** (P0)
**Category**: Infrastructure / Quality Gates
**Estimated Effort**: 1 sprint (2-3 days)

---

### 2. Path Traversal Validation Gaps (SECURITY)

**RICE Score**: (6 × 10 × 0.8) / 4 = **12.0**

**Problem Statement**:
Some file operations lack path traversal validation. Malicious input could write files outside `.claude/` directory, compromising system security.

**Evidence**:
- `unified-pre-write-hook.cjs` has comprehensive checks
- Some older tools/scripts may bypass this hook
- No centralized path validation utility used consistently

**Impact**:
- **Reach**: 6/10 (affects file write operations)
- **Impact**: 10/10 (CRITICAL security issue)
- **Confidence**: 0.8 (medium - needs audit to confirm gaps)
- **Effort**: 4/10 (audit + remediation)

**Acceptance Criteria**:
- [ ] Audit all file write operations for path traversal checks
- [ ] Centralize path validation in `.claude/lib/utils/path-validator.cjs`
- [ ] All write operations use centralized validator
- [ ] Add test cases for path traversal attacks
- [ ] Security scan passes with 0 path traversal findings

**Priority**: **MUST HAVE** (P0)
**Category**: Security / Safety
**Estimated Effort**: 1 sprint (3-4 days)

---

## P1 (HIGH PRIORITY) - Should Fix Soon

### 3. agent-config.json Referenced But Missing

**RICE Score**: (7 × 7 × 0.7) / 2 = **17.2**

**Problem Statement**:
Code references `agent-config.json` but file doesn't exist or is inaccessible. This breaks agent runtime configuration lookups and model resolution.

**Evidence**:
- Memory notes: "agent-config.json referenced but missing/inaccessible"
- `agent-config-reader.cjs` expects this file
- Current system uses `agent-registry.json` + `config.yaml` instead

**Impact**:
- **Reach**: 7/10 (affects agent spawning)
- **Impact**: 7/10 (breaks model resolution if relied upon)
- **Confidence**: 0.7 (medium - may be intentional deprecation)
- **Effort**: 2/10 (clarify + document or implement)

**Acceptance Criteria**:
- [ ] Determine if `agent-config.json` is deprecated or needed
- [ ] If deprecated: remove references from code, update docs
- [ ] If needed: create schema, generate file, integrate
- [ ] Update `agent-config-reader.cjs` to handle missing file gracefully
- [ ] Document decision in ADR

**Priority**: **SHOULD HAVE** (P1)
**Category**: Technical Debt / Configuration
**Estimated Effort**: 1-2 days

---

### 4. Dead Hook Registrations

**RICE Score**: (8 × 6 × 0.9) / 2 = **21.6**

**Problem Statement**:
`settings.json` may register hooks that no longer exist (deleted/archived). This causes runtime errors and wastes execution cycles.

**Evidence**:
- Memory notes: "settings.json hook registrations may reference deleted files"
- 6 wildcard hooks consolidated on 2026-02-08
- User must restart session for hook changes to take effect

**Impact**:
- **Reach**: 8/10 (affects all tool executions)
- **Impact**: 6/10 (runtime errors, wasted cycles)
- **Confidence**: 0.9 (high - we know hooks were consolidated)
- **Effort**: 2/10 (audit + cleanup)

**Acceptance Criteria**:
- [ ] Audit `settings.json` hook registrations
- [ ] Remove references to non-existent hooks
- [ ] Add CI validation (see Issue #1)
- [ ] Document hook consolidation in changelog
- [ ] Test hook execution after cleanup

**Priority**: **SHOULD HAVE** (P1)
**Category**: Technical Debt / Cleanup
**Estimated Effort**: 1 day

---

### 5. Archive Retention Policy Missing

**RICE Score**: (4 × 5 × 0.6) / 3 = **4.0**

**Problem Statement**:
75+ archived files in `_archive/` directories with no retention policy. No governance for when to permanently delete vs keep for reference.

**Evidence**:
- `.claude/tools/_archive/`: 25 deprecated tools
- `.claude/hooks/_archive/`: archived hooks
- `.claude/lib/_archive/`: 8 library modules (relocated 2026-02-07)
- No documented policy for archive lifecycle

**Impact**:
- **Reach**: 4/10 (affects maintenance, not runtime)
- **Impact**: 5/10 (moderate - clutter, confusion)
- **Confidence**: 0.6 (medium - policy TBD)
- **Effort**: 3/10 (define policy + implement)

**Acceptance Criteria**:
- [ ] Define archive retention policy (ADR)
- [ ] Categorize archives: keep (reference), delete (obsolete)
- [ ] Add metadata headers to archived files (date, reason)
- [ ] Implement archive cleanup script
- [ ] Document policy in `.claude/docs/ARCHIVE_POLICY.md`

**Priority**: **SHOULD HAVE** (P1)
**Category**: Maintenance / Governance
**Estimated Effort**: 2-3 days

---

### 6. Windows Atomic File Operations Research

**RICE Score**: (5 × 6 × 0.5) / 5 = **3.0**

**Problem Statement**:
No documented best practices for atomic file operations on Windows. Race conditions possible during concurrent file writes (e.g., database initialization).

**Evidence**:
- Memory notes: "Research needed: Best practices for atomic file ops on Windows"
- Current use of `proper-lockfile` for DB init
- No comprehensive Windows file safety guidelines

**Impact**:
- **Reach**: 5/10 (affects Windows users only)
- **Impact**: 6/10 (race conditions = data corruption)
- **Confidence**: 0.5 (medium - research needed)
- **Effort**: 5/10 (research + documentation)

**Acceptance Criteria**:
- [ ] Research Windows atomic file operation patterns
- [ ] Document findings in `.claude/context/artifacts/research-reports/windows-atomic-ops-research-{date}.md`
- [ ] Identify gaps in current implementation
- [ ] Create ADR for Windows file safety guidelines
- [ ] Update affected code with recommendations

**Priority**: **SHOULD HAVE** (P1)
**Category**: Research / Platform Compatibility
**Estimated Effort**: 1 sprint (3-5 days)

---

## P2 (MEDIUM PRIORITY) - Could Fix Later

### 7. CI Hook Registration Validation

**RICE Score**: (7 × 5 × 0.8) / 3 = **9.3**

**Problem Statement**:
Subset of Issue #1 - specifically hook registration validation. Broken out as separate backlog item for granular tracking.

**Impact**:
- **Reach**: 7/10 (affects hook system)
- **Impact**: 5/10 (runtime errors)
- **Confidence**: 0.8 (high)
- **Effort**: 3/10

**Acceptance Criteria**:
- [ ] CI script validates hook paths in `settings.json`
- [ ] Fail CI if dead hook found
- [ ] Generate hook inventory report

**Priority**: **COULD HAVE** (P2)
**Category**: Quality Gates
**Estimated Effort**: 1 day
**Covered By**: Issue #1 (CI Validation Gates)

---

### 8. CI Skill-Agent Mapping Validation

**RICE Score**: (6 × 5 × 0.8) / 3 = **8.0**

**Problem Statement**:
Subset of Issue #1 - specifically skill-agent mapping validation. Broken out for granular tracking.

**Impact**:
- **Reach**: 6/10 (affects skill discovery)
- **Impact**: 5/10 (broken skill references)
- **Confidence**: 0.8 (high)
- **Effort**: 3/10

**Acceptance Criteria**:
- [ ] CI script validates skill-catalog.md entries
- [ ] Fail CI if orphaned skill found
- [ ] Generate skill inventory report

**Priority**: **COULD HAVE** (P2)
**Category**: Quality Gates
**Estimated Effort**: 1 day
**Covered By**: Issue #1 (CI Validation Gates)

---

### 9. CI Deprecated Tool Validation

**RICE Score**: (5 × 4 × 0.8) / 3 = **5.3**

**Problem Statement**:
Subset of Issue #1 - specifically deprecated tool validation. Broken out for granular tracking.

**Impact**:
- **Reach**: 5/10 (affects tool usage)
- **Impact**: 4/10 (stale references)
- **Confidence**: 0.8 (high)
- **Effort**: 3/10

**Acceptance Criteria**:
- [ ] CI script checks for references to `_archive/` tools
- [ ] Fail CI if active code uses deprecated tool
- [ ] Generate deprecation report

**Priority**: **COULD HAVE** (P2)
**Category**: Quality Gates
**Estimated Effort**: 1 day
**Covered By**: Issue #1 (CI Validation Gates)

---

## P3 (NICE-TO-HAVE) - Won't Fix Now

### 10. Documentation for Archive Policy

**RICE Score**: (3 × 3 × 0.7) / 2 = **3.2**

**Problem Statement**:
Once retention policy is defined (Issue #5), documentation should be comprehensive and discoverable.

**Impact**:
- **Reach**: 3/10 (affects maintainers)
- **Impact**: 3/10 (low - nice to have)
- **Confidence**: 0.7
- **Effort**: 2/10

**Acceptance Criteria**:
- [ ] Create `.claude/docs/ARCHIVE_POLICY.md`
- [ ] Link from main docs
- [ ] Include examples

**Priority**: **WON'T HAVE** (P3)
**Category**: Documentation
**Estimated Effort**: Half day
**Covered By**: Issue #5 (Archive Retention Policy)

---

### 11. Test Coverage for New CI Validation

**RICE Score**: (4 × 3 × 0.8) / 2 = **4.8**

**Problem Statement**:
New CI validation scripts (Issue #1) should have comprehensive test coverage.

**Impact**:
- **Reach**: 4/10 (affects CI reliability)
- **Impact**: 3/10 (low - validators are simple)
- **Confidence**: 0.8
- **Effort**: 2/10

**Acceptance Criteria**:
- [ ] Unit tests for hook validator
- [ ] Unit tests for skill validator
- [ ] Unit tests for tool validator
- [ ] Coverage ≥ 80%

**Priority**: **WON'T HAVE** (P3)
**Category**: Testing
**Estimated Effort**: 1 day
**Deferred To**: Post-MVP (include in next sprint)

---

## Implementation Roadmap

### Sprint 1 (Week 1): P0 Blockers
**Goal**: Eliminate security and integrity risks

| Task                               | Effort | Owner        | Deliverable                              |
| ---------------------------------- | ------ | ------------ | ---------------------------------------- |
| Path traversal audit & remediation | 3-4d   | Security     | Security audit report, centralized utils |
| CI validation gates (all 3)        | 2-3d   | DevOps       | CI scripts, failing tests                |
| **Total**                          | 5-7d   | 2 engineers  | 2 P0 issues resolved                     |

### Sprint 2 (Week 2): P1 High Priority
**Goal**: Reduce technical debt and clarify config

| Task                         | Effort | Owner     | Deliverable                   |
| ---------------------------- | ------ | --------- | ----------------------------- |
| agent-config.json resolution | 1-2d   | Developer | ADR, code cleanup             |
| Dead hook cleanup            | 1d     | DevOps    | settings.json cleanup         |
| Archive retention policy     | 2-3d   | PM        | ADR, policy doc, cleanup tool |
| Windows atomic ops research  | 3-5d   | Researcher | Research report, guidelines   |
| **Total**                    | 7-11d  | 3-4 engineers | 4 P1 issues resolved      |

### Sprint 3 (Future): P2/P3
**Goal**: Polish and deferred items

- P2 items covered by Issue #1 (already in Sprint 1)
- P3 items deferred to post-MVP

---

## Risk Assessment

| Risk                                | Likelihood | Impact | Mitigation                                      |
| ----------------------------------- | ---------- | ------ | ----------------------------------------------- |
| Path traversal exploit              | Medium     | High   | P0 priority, security review before deploy      |
| CI validation breaks existing PRs   | High       | Medium | Warn-only mode first, then enforce              |
| Archive cleanup deletes needed code | Low        | High   | Retention policy review, backup before deletion |
| Windows research reveals major gaps | Medium     | Medium | Time-box research, prioritize findings          |
| Dead hooks cause session crashes    | Medium     | Medium | Audit before cleanup, staged rollout            |

---

## Success Metrics

| Metric                             | Target  | Measurement                        |
| ---------------------------------- | ------- | ---------------------------------- |
| P0 issues resolved                 | 100%    | 2/2 complete by end of Sprint 1    |
| P1 issues resolved                 | 100%    | 4/4 complete by end of Sprint 2    |
| CI validation coverage             | 3 gates | Hook, skill, tool validators live  |
| Security audit pass rate           | 100%    | 0 path traversal findings          |
| Archive policy compliance          | 100%    | All archives categorized           |
| Hook registration errors           | 0       | No dead hooks in settings.json     |
| Time to detect config issues       | <1min   | CI catches before merge            |

---

## Dependencies & Blockers

### Issue #1 → Issues #7, #8, #9
CI Validation Gates (P0) encompasses three P2 sub-items. Complete #1 first.

### Issue #5 → Issue #10
Archive Retention Policy (P1) must be defined before documentation (P3) can be written.

### Issue #2 (Path Traversal) → Security Review
Security review required before marking complete. External penetration test recommended.

### Issue #6 (Windows Research) → Platform Team
Windows-specific research may require platform team consultation or Windows VM access.

---

## Open Questions

1. **agent-config.json**: Is this intentionally deprecated? If so, why are there still references?
2. **Archive retention**: Should we keep all archives for reference, or set a 6-month deletion policy?
3. **Windows atomic ops**: Do we support Windows as a first-class platform, or document limitations?
4. **CI enforcement**: Should validation be blocking (hard fail) or warning (soft fail) initially?
5. **Path traversal**: Are there specific tools/scripts outside hook coverage that need auditing?

---

## Related Documents

- **Architecture Review**: Original findings from codebase analysis
- **ADR-075**: Model resolution from config.yaml (relates to agent-config.json)
- **Hook Consolidation**: 2026-02-08 wildcard hook consolidation (relates to dead hooks)
- **File Placement Rules**: `.claude/docs/FILE_PLACEMENT_RULES.md` (relates to path traversal)
- **Enforcement Hooks**: `.claude/docs/@ENFORCEMENT_HOOKS.md` (relates to CI validation)

---

## Appendix A: RICE Scoring Detail

| Issue | Reach | Impact | Confidence | Effort | RICE  | Priority |
| ----- | ----- | ------ | ---------- | ------ | ----- | -------- |
| #1    | 8     | 9      | 0.9        | 3      | 21.6  | P0       |
| #2    | 6     | 10     | 0.8        | 4      | 12.0  | P0       |
| #3    | 7     | 7      | 0.7        | 2      | 17.2  | P1       |
| #4    | 8     | 6      | 0.9        | 2      | 21.6  | P1       |
| #5    | 4     | 5      | 0.6        | 3      | 4.0   | P1       |
| #6    | 5     | 6      | 0.5        | 5      | 3.0   | P1       |
| #7    | 7     | 5      | 0.8        | 3      | 9.3   | P2       |
| #8    | 6     | 5      | 0.8        | 3      | 8.0   | P2       |
| #9    | 5     | 4      | 0.8        | 3      | 5.3   | P2       |
| #10   | 3     | 3      | 0.7        | 2      | 3.2   | P3       |
| #11   | 4     | 3      | 0.8        | 2      | 4.8   | P3       |

---

## Appendix B: MoSCoW Categorization

### Must Have (P0)
- ✅ CI Validation Gates Missing
- ✅ Path Traversal Validation Gaps

### Should Have (P1)
- ✅ agent-config.json Referenced But Missing
- ✅ Dead Hook Registrations
- ✅ Archive Retention Policy Missing
- ✅ Windows Atomic File Operations Research

### Could Have (P2)
- ⚠️ CI Hook Registration Validation (subset of #1)
- ⚠️ CI Skill-Agent Mapping Validation (subset of #1)
- ⚠️ CI Deprecated Tool Validation (subset of #1)

### Won't Have (P3)
- ❌ Documentation for Archive Policy (subset of #5)
- ❌ Test Coverage for New CI Validation (defer to post-MVP)

---

**End of Backlog**
**Next Steps**: Review with team, assign owners, create GitHub issues for P0/P1 items.
