<!-- Agent: planner | Task: #bug-risk-assessment | Session: 2026-02-15 -->

# Bug Risk Assessment: Agent-Studio

**Generated**: 2026-02-15
**Scope**: Recent commits (last 5) + Memory analysis + High-risk areas
**Evidence Sources**: issues.md, learnings.md, gotchas.json, git log

---

## Executive Summary

**Overall Risk Level**: MEDIUM-HIGH
**Critical Areas**: 2 (P0), 4 (P1), 3 (P2)
**Recent Commit Risk**: MEDIUM (3 debug-hardening commits indicate active stability issues)

### Top 3 Risks

1. **Memory Sanitization Incomplete** (HIGH) - 4 of 5 write paths bypass sanitization [mem:issues.md#2026-02-13]
2. **Oversized Modules** (HIGH) - 6 modules >50KB, 2 >100KB create refactoring hazards [mem:issues.md#2026-02-13]
3. **Reflection Queue Context Missing** (HIGH-RECURRING) - Incomplete learnings extraction [mem:issues.md#2026-02-14]

---

## Risk Matrix

| Area | Risk Level | Evidence | Impact | Probability |
|------|-----------|----------|--------|-------------|
| **Memory System** | HIGH | 4/5 paths unsanitized [mem:issues.md] | Data corruption, security | 60% |
| **Routing Guard** | MEDIUM-HIGH | Recent bypass bugs [git:24fd1ef0, 57b77d0e] | False routing, crashes | 50% |
| **Hook System** | MEDIUM | 646 console.log bypass [mem:issues.md#console-sprawl] | Debugging blind spots | 40% |
| **Code Indexer** | LOW-MEDIUM | BM25-only stable [mem:learnings.md#indexer] | Search degradation | 20% |
| **Module Size** | HIGH | 2 modules >100KB [mem:issues.md#oversized] | Refactoring accidents | 70% |

---

## Evidence Analysis

### Recent Git Commits (Risk Profile)

**Commit 24fd1ef0** (2026-02-15): `fix(debug-hardening): reduce non-MCP session failures`
- **Risk**: Debug-mode instability still present after 3 sequential fixes
- **Files touched**: 14 files, 248 insertions, 71 deletions
- **Evidence**: Bypass routing bugs required multiple patches [git:log]
- **Assessment**: MEDIUM risk - system not converging to stability

**Commit 57b77d0e** (2026-02-15): `fix(debug-runs): harden bypass routing`
- **Risk**: TaskList-first bypass + spawn/runtime hook fixes
- **Files touched**: 22 files, 381 insertions, 1246 deletions
- **Evidence**: Deleted 1206-line security-fixes doc suggests cleanup after incident [git:show]
- **Assessment**: MEDIUM-HIGH risk - post-incident hardening

**Commit e4fa67aa** (2026-02-15): `Fixed: enforce search/token-saver read governance`
- **Risk**: Large unvalidated reads could crash sessions
- **Files touched**: 8 files, 269+ line hook added
- **Evidence**: New read-safety hook required [git:show]
- **Assessment**: LOW-MEDIUM risk - proactive governance

### Memory System Risks (HIGH)

**Issue**: Memory Sanitization Incomplete (HIGH-004) [mem:issues.md#2026-02-13]

**Evidence**:
- Only 1 of 5 memory write paths has sanitization
- 4 bypass paths: `archiveLearnings()`, `writeMemoryArray()`, `updateCodebaseMap()`, direct file writes
- [rag:memory-manager.cjs] shows single sanitizer call path

**Impact**:
- Unsanitized writes → injection vectors
- Data corruption risk in gotchas.json, patterns.json
- Security bypass in memory-backed routing decisions

**Mitigation**:
- Create `memory-sanitizer.cjs` utility
- Add to all 5 write paths
- Add pre-write hook validation

**Priority**: P1 (must fix before production use)

---

### Routing System Risks (MEDIUM-HIGH)

**Issue**: Routing Guard Bypass Bugs [git:24fd1ef0, 57b77d0e]

**Evidence**:
- 3 sequential commits fixing routing bypass bugs (2026-02-15)
- Router self-check bypass fail-open behavior added [rag:routing-guard-core.checks-router.cjs]
- TaskList-first bypass carveout added [git:show 57b77d0e]

**Pattern**: [mem:learnings.md#defensive-programming]
- "Defensive Programming Trilogy: Process hiding + command validation + existence guards"
- Recent commits add existence guard layer → implies prior layer failures

**Impact**:
- Incorrect agent routing → wrong specialist, wasted work
- Bypass mode allows non-compliant tool usage
- Debug sessions may route differently than production

**Risk Assessment**:
- HIGH probability of residual bypass bugs (3 fixes in 1 day)
- MEDIUM impact (routing errors catchable in review)

---

### Module Size Risk (HIGH)

**Issue**: Oversized Modules Require Refactoring (P0) [mem:issues.md#2026-02-13]

**Evidence**:
- 6 modules >50KB, 2 >100KB
- `skill-creator/create.cjs`: 107KB, 3,677 lines
- `routing-guard.cjs`: 79KB, 2,700+ lines
- Refactor plan exists: skill-creator → 7 modules, routing-guard → 6 modules

**Risk**:
- Large files = high bug density
- Refactoring accidents (breaking changes)
- Testing coverage gaps in monolithic files

**Pattern**: [mem:learnings.md#tri-audit-convergence]
- "When 3+ independent audits identify same issue, it's systemic (P0)"
- Security, architecture, code review ALL flagged oversized modules

**Probability**: 70% (refactoring 3,677-line file = guaranteed bugs)
**Impact**: HIGH (affects core routing and skill creation)

---

### Hook System Risks (MEDIUM)

**Issue**: Console Usage Sprawl (646 Instances) [mem:issues.md#2026-02-13]

**Evidence**:
- 646 instances of `console.log/error` bypass structured logging
- No observability in production hooks
- Debugging blind spots when hooks fail silently

**Gotcha**: [mem:gotchas.json#hook-crash-telemetry-missing]
- "File existence guards don't log which files were expected"
- Missing telemetry when optional files not found

**Impact**:
- Production debugging requires code inspection (no logs)
- Hook failures invisible to Router
- No audit trail for compliance

**Mitigation**:
- Batch refactor script (6-8 hours)
- Enable ESLint `no-console` rule

**Priority**: P1 (blocks production observability)

---

### Reflection Queue Risk (HIGH - RECURRING)

**Issue**: Reflection Queue Context Missing (P1) [mem:issues.md#2026-02-14]

**Evidence**:
- Task #13, Tasks 1-2 confirmed missing summary metadata
- Incomplete learnings extraction
- Broken audit trail

**Pattern**: RECURRING - elevated to P1 due to recurrence

**Impact**:
- Cannot reconstruct what agents accomplished
- Learnings extraction failures → memory gaps
- Compliance audit failures (missing provenance)

**Root Cause**:
- `post-completion-chain.cjs` not validating summary field
- TaskUpdate completions missing metadata

**Mitigation**:
- Add validation check to post-completion-chain.cjs
- Enforce summary field on TaskUpdate completion
- Backfill missing queue entries (if possible)

---

### Code Indexer Risk (LOW-MEDIUM)

**Issue**: Async Pipeline OOM at 600+ files [mem:learnings.md#code-indexer]

**Evidence**:
- BM25-only mode stable (1330 files in 19.5s)
- Async pipeline OOMs due to V8 heap fragmentation
- Sync fast-path bypasses async issues

**Risk Assessment**:
- LOW risk with `LANCEDB_EMBEDDING_MODE=off` (current stable mode)
- MEDIUM risk if embeddings re-enabled without fixing async pipeline
- Evidence: [mem:learnings.md#indexer-architecture]

**Mitigation**:
- Keep BM25-only as default
- Document async pipeline as experimental
- Fix heap fragmentation before re-enabling embeddings

---

## High-Density Bug Areas

### Area 1: `.claude/hooks/routing/routing-guard.cjs` (79KB)

**Bug Risk**: HIGH
**Evidence**:
- 79KB, 2,700+ lines [mem:issues.md#oversized]
- 3 bypass bugs fixed in last 24 hours [git:log]
- Complexity creates hidden edge cases

**Recommendation**: Refactor to 6 modules before next feature

---

### Area 2: `.claude/skills/skill-creator/create.cjs` (107KB)

**Bug Risk**: HIGH
**Evidence**:
- 107KB, 3,677 lines [mem:issues.md#oversized]
- Critical path for artifact creation
- Refactor plan: 7 modules

**Recommendation**: Immediate P0 refactor (26-32 hours)

---

### Area 3: `.claude/lib/memory/memory-manager.cjs` (57KB)

**Bug Risk**: MEDIUM-HIGH
**Evidence**:
- 57KB [mem:issues.md#oversized]
- 4 of 5 write paths bypass sanitization [mem:issues.md#memory-sanitization]
- [rag:memory-manager.cjs] shows single point of failure

**Recommendation**: Add sanitization layer + refactor to 4 modules

---

## Top 3 Recommended Actions

### 1. Memory Sanitization (URGENT - P1)

**Action**: Create `memory-sanitizer.cjs` utility and add to all 5 write paths

**Effort**: 4-6 hours
**Impact**: Eliminates injection vectors and data corruption risk
**Priority**: P1 (blocks production deployment)

**Implementation**:
```javascript
// .claude/lib/memory/memory-sanitizer.cjs
function sanitize(content) {
  // Strip ANSI codes, control chars, injection patterns
}
module.exports = { sanitize };
```

**Apply to**:
- `archiveLearnings()`
- `writeMemoryArray()`
- `updateCodebaseMap()`
- Direct file writes (2 locations)

---

### 2. Refactor Oversized Modules (P0)

**Action**: Break skill-creator (107KB) and routing-guard (79KB) into smaller modules

**Effort**: 26-32 hours
**Impact**: Reduces bug density, improves testability
**Priority**: P0 (systemic issue flagged by 3 audits)

**Sequence**:
1. skill-creator → 7 modules (12-16 hours)
2. routing-guard → 6 modules (14-16 hours)

**Evidence**: [mem:learnings.md#tri-audit-convergence]

---

### 3. Add Reflection Queue Validation (P1)

**Action**: Enforce summary field on TaskUpdate completion

**Effort**: 2-4 hours
**Impact**: Closes audit trail gaps, enables learnings extraction
**Priority**: P1 (RECURRING issue)

**Implementation**:
- Add validation to `post-completion-chain.cjs`
- Block completions without summary
- Add backfill script for existing queue

---

## Risk Trend Analysis

**Stability Trend**: DECLINING (3 hotfixes in 24 hours)
**Memory Budget**: CRITICAL (decisions.md 74KB, issues.md 62KB - 3-4x over budget)
**Test Coverage**: GOOD (99.3% pass rate) but coverage gaps exist
**Hook Registration**: 10 active hooks unregistered (verification needed)

**Evidence**:
- [mem:learnings.md#tri-audit-learnings] - "Memory file budget crisis: decisions.md (74KB) and issues.md (62KB) 3-4x over budget"
- [git:log] - 3 sequential debug-hardening commits (2026-02-15)

---

## Monitoring Recommendations

1. **Add memory write telemetry** - Track all 5 write paths
2. **Monitor hook execution time** - Alert on >100ms hooks
3. **Track routing bypass invocations** - Count fail-open cases
4. **Reflection queue health** - Alert on missing summary fields

---

## Conclusion

**Overall Assessment**: MEDIUM-HIGH risk with 2 critical P0 issues and 4 P1 issues.

**Critical Path**: Memory sanitization (P1) + oversized module refactor (P0) must complete before production deployment.

**Recent Stability**: Declining (3 hotfixes in 24 hours) indicates active instability requiring attention.

**Positive Signals**:
- 99.3% test pass rate [mem:learnings.md#tri-audit]
- 0 lint errors, 0 format violations [mem:learnings.md#progressive-quality-gates]
- BM25-only indexer stable [mem:learnings.md#code-indexer]

**Recommendation**: Halt new features, focus on P0/P1 remediation for next 2-3 days.

---

## Evidence Index

- [mem:issues.md#2026-02-13] - Oversized modules, console sprawl, memory sanitization
- [mem:issues.md#2026-02-14] - Reflection queue context missing
- [mem:learnings.md#code-indexer] - Code indexer architecture, BM25-only stability
- [mem:learnings.md#tri-audit-convergence] - Pattern: 3+ audits = systemic issue
- [mem:learnings.md#defensive-programming] - Process hiding + validation + guards trilogy
- [mem:gotchas.json#hook-crash-telemetry-missing] - Hook existence guard logging gap
- [git:24fd1ef0] - Debug-hardening commit (2026-02-15)
- [git:57b77d0e] - Bypass routing hardening commit (2026-02-15)
- [git:e4fa67aa] - Search/token-saver governance commit (2026-02-15)
- [rag:routing-guard-core.checks-router.cjs] - Router self-check implementation
- [rag:memory-manager.cjs] - Memory write path analysis

---

**Report Generated**: 2026-02-15
**Next Review**: After P0/P1 remediation complete (estimate: 3-4 days)
