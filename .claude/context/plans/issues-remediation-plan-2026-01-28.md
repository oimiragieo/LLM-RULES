# Plan: Issues Remediation (2026-01-28)

## Executive Summary

This plan addresses 30 OPEN issues from `.claude/context/memory/issues.md`. The remediation is organized into 4 phases prioritizing quick wins, security fixes, code deduplication, and performance improvements.

**Total Estimated Effort**: 45-65 hours
**Quick Wins (Phase 1)**: 10 issues, ~6 hours, HIGH impact
**Security Fixes (Phase 2)**: 4 issues, ~12 hours, CRITICAL impact
**Code Deduplication (Phase 3)**: 3 issues, ~6 hours, saves ~2200 lines
**Performance & Process (Phase 4)**: 13+ issues, ~25+ hours, ongoing

## Objectives

- Resolve all CRITICAL and HIGH priority security issues
- Eliminate ~2200+ lines of duplicated code across hooks
- Improve performance by 40-70% via hook consolidation
- Close documentation and process gaps

## Issue Inventory (30 OPEN)

| Priority | Count | Categories |
|----------|-------|------------|
| CRITICAL | 2 | SEC-AUDIT-013, SEC-AUDIT-014 |
| HIGH | 5 | Security audit, enforcement gaps |
| MEDIUM | 18 | Performance, documentation, process |
| LOW | 5 | Nice-to-have improvements |

---

## Phases

### Phase 1: Quick Wins (Under 1 Hour Each, High Impact)

**Purpose**: Resolve low-effort, high-value issues to build momentum and reduce issue count quickly.
**Estimated Time**: ~6 hours total
**Tasks**:

1. - [ ] **1.1** Fix PERF-008: Silent Error Swallowing in Metrics (~30 min)
   - **File**: `.claude/lib/memory/memory-dashboard.cjs`
   - **Fix**: Add METRICS_DEBUG conditional logging to catch blocks
   - **Command**: Add `if (process.env.METRICS_DEBUG) console.error('Error:', e);` to empty catch blocks
   - **Verify**: `grep -n "catch.*ignore" memory-dashboard.cjs` returns 0 matches

2. - [ ] **1.2** Fix PERF-009: Path Traversal in CLI (~1 hour)
   - **Files**: `memory-manager.cjs`, `memory-scheduler.cjs`, `smart-pruner.cjs`
   - **Fix**: Add path validation using existing `validatePath()` from safe-json.cjs pattern
   - **Command**: Add `if (!path.startsWith(PROJECT_ROOT)) throw new Error('Path traversal blocked')`
   - **Verify**: Test with `../../../etc/passwd` path - should throw error

3. - [ ] **1.3** Fix HOOK-006: Inconsistent Audit Logging Format (~45 min)
   - **Files**: `session-memory-extractor.cjs`, reflection hooks
   - **Fix**: Standardize on `JSON.stringify()` format for ALL audit logs
   - **Verify**: `grep -n "console.error" | grep -v JSON.stringify` returns 0 matches in affected files

4. - [ ] **1.4** Fix HOOK-007: Magic Numbers - Timeout Values (~30 min)
   - **Files**: `task-completion-reflection.cjs`, `session-memory-extractor.cjs`, `loop-prevention.cjs`
   - **Fix**: Extract hardcoded timeouts to module-level constants with JSDoc
   - **Example**: `const LOCK_TIMEOUT_MS = 100; // Polling interval for lock acquisition`

5. - [ ] **1.5** Fix DEBUG-001/NEW-MED-002: Empty Catch Blocks (~1 hour)
   - **Files**: `memory-manager.cjs` (8), `memory-tiers.cjs` (3), `memory-scheduler.cjs` (1)
   - **Fix**: Add METRICS_DEBUG pattern from memory-dashboard.cjs
   - **Verify**: All catch blocks have conditional logging

6. - [ ] **1.6** Fix IMP-007: workflow-validator Missing Step Schema Validation (~45 min)
   - **File**: `.claude/lib/workflow/workflow-validator.cjs`
   - **Fix**: Add validation for required step fields (id, handler)
   - **Verify**: Test with malformed step - should throw validation error

7. - [ ] **1.7** Fix ARCH-003: Inconsistent Workflow Placement (~30 min)
   - **Location**: `.claude/workflows/` directory
   - **Fix**: Add README.md documenting intentional organization pattern
   - **No file moves** - document current pattern as intentional

8. - [ ] **1.8** Fix HOOK-008: Missing JSDoc on Exported Functions (~1 hour)
   - **Priority files**: routing-guard.cjs, unified-creator-guard.cjs, loop-prevention.cjs
   - **Fix**: Add JSDoc with @param, @returns, @throws for module.exports
   - **Verify**: Each exported function has JSDoc block

9. - [ ] **1.9** Fix HOOK-009: Inconsistent Module Exports (~30 min)
   - **Fix**: Standardize hooks to always export main/parseHookInput for testing
   - **Verify**: `grep "module.exports" *.cjs | wc -l` shows consistent pattern

10. - [ ] **1.10** Fix SEC-AUDIT-011: Document router-state.cjs Race Condition (~15 min)
    - **Status**: LOW priority, informational only
    - **Fix**: Add code comment documenting the race condition and why it's acceptable
    - **Verify**: Comment added explaining informational tracking is not security-critical

**Success Criteria**:
- [ ] All 10 quick-win issues marked RESOLVED in issues.md
- [ ] No regressions in existing tests
- [ ] Total time < 8 hours

---

### Phase 2: Security Fixes (SEC-AUDIT-013, SEC-AUDIT-014, SEC-AUDIT-016, SEC-AUDIT-018)

**Purpose**: Address remaining HIGH/CRITICAL security issues
**Estimated Time**: ~12-18 hours
**Dependencies**: None (can run parallel to Phase 1)
**SECURITY-ARCHITECT Review**: REQUIRED for all tasks in this phase

**Tasks**:

1. - [ ] **2.1** Fix SEC-AUDIT-013: Atomic Write Race Window on Windows (~3 hours)
   - **File**: `.claude/lib/utils/atomic-write.cjs`
   - **Issue**: `fs.renameSync()` not atomic on Windows NTFS
   - **Fix**: Add Windows-specific fallback with retry logic (5 retries, exponential backoff)
   - **Verify**: Test on Windows with concurrent writes
   - **Rollback**: Revert to sync-only if async fails
   - **Security Review**: REQUIRED - concurrent write handling

2. - [ ] **2.2** Fix SEC-AUDIT-014: TOCTOU in Lock File Mechanism (~3 hours)
   - **File**: `.claude/hooks/self-healing/loop-prevention.cjs:177-211`
   - **Issue**: Two processes checking simultaneously could both delete "stale" lock
   - **Fix Option A**: Use `proper-lockfile` package
   - **Fix Option B**: Remove stale lock cleanup entirely (safer)
   - **Verify**: Concurrent process test - only one should acquire lock
   - **Security Review**: REQUIRED - race condition elimination

3. - [ ] **2.3** Fix SEC-AUDIT-016: Environment Variable Override Logging (~2 hours)
   - **Files**: Multiple hooks (routing-guard.cjs, pre-task-unified.cjs, etc.)
   - **Issue**: Security override env vars logged inconsistently
   - **Fix**: Create `auditSecurityOverride()` utility function
   - **Implementation**:
     ```javascript
     // .claude/lib/utils/security-audit.cjs
     function auditSecurityOverride(envVar, value, component) {
       const entry = { timestamp: new Date().toISOString(), envVar, value, component };
       console.error(JSON.stringify({ type: 'SECURITY_OVERRIDE', ...entry }));
     }
     ```
   - **Verify**: All hooks use centralized function

4. - [ ] **2.4** Fix SEC-AUDIT-018: Evolution State Tampering (~8 hours) [DEFERRED]
   - **File**: `.claude/context/evolution-state.json`
   - **Issue**: State file writable by agents, could reset evolutionCount
   - **Fix**: Add HMAC signature to state file
   - **Note**: COMPLEX - may defer to future sprint
   - **Alternative**: Document as accepted risk with monitoring

**Phase 2 Error Handling**

If any security fix fails:
1. Document failure in issues.md with root cause
2. DO NOT proceed to dependent fixes
3. Escalate to Security-Architect for review

**Phase 2 Verification Gate**

```bash
# All security tests must pass
npm test -- --grep "SEC-AUDIT" 2>&1 | grep -E "passing|PASS"
# No critical security issues in lint
node .claude/hooks/safety/security-lint.cjs 2>&1 | grep -v "CRITICAL"
```

**Success Criteria**:
- [ ] SEC-AUDIT-013, SEC-AUDIT-014, SEC-AUDIT-016 marked RESOLVED
- [ ] SEC-AUDIT-018 either RESOLVED or documented as DEFERRED with rationale
- [ ] All security tests pass
- [ ] Security-Architect sign-off on all fixes

---

### Phase 3: Code Deduplication (HOOK-001, HOOK-002) (~2000+ Lines Saved)

**Purpose**: Eliminate massive code duplication across 40+ hooks
**Estimated Time**: ~6 hours
**Dependencies**: Phase 1 (1.5, 1.6 should be done first for shared patterns)

**Tasks**:

1. - [ ] **3.1** Create hook-input.cjs shared utility (~2 hours)
   - **Issue**: HOOK-001 - ~2000 lines duplicated parseHookInput() across 40+ files
   - **Target**: `.claude/lib/utils/hook-input.cjs`
   - **Steps**:
     a. Extract canonical parseHookInput() from routing-guard.cjs
     b. Add JSDoc documentation
     c. Add comprehensive tests
     d. Export for hook consumption
   - **Verify**: `node -e "require('./.claude/lib/utils/hook-input.cjs')"` succeeds

2. - [ ] **3.2** Migrate hooks to use shared hook-input.cjs (~2 hours)
   - **Files**: All 40+ hooks with duplicated parseHookInput()
   - **Migration pattern**:
     ```javascript
     // Before (each hook)
     function parseHookInput() { /* 50 lines */ }

     // After
     const { parseHookInput } = require('../../lib/utils/hook-input.cjs');
     ```
   - **Verify**: `grep -r "function parseHookInput" .claude/hooks/ | wc -l` returns 0

3. - [ ] **3.3** Migrate hooks to use shared project-root.cjs (~1.5 hours)
   - **Issue**: HOOK-002 - ~200 lines duplicated findProjectRoot() across 20+ files
   - **File**: `.claude/lib/utils/project-root.cjs` (already exists)
   - **Migration pattern**:
     ```javascript
     // Before
     function findProjectRoot() { /* 10 lines */ }

     // After
     const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
     ```
   - **Verify**: `grep -r "function findProjectRoot" .claude/hooks/ | wc -l` returns 0

4. - [ ] **3.4** Run full test suite after deduplication (~30 min)
   - **Command**: `npm test`
   - **Verify**: All hook tests pass
   - **Rollback**: `git checkout -- .claude/hooks/` if tests fail

**Phase 3 Error Handling**

If migration breaks a hook:
1. Revert that specific hook: `git checkout -- .claude/hooks/<hook>.cjs`
2. Document incompatibility in issues.md
3. Continue with remaining hooks

**Phase 3 Verification Gate**

```bash
# All hooks should use shared utilities
grep -r "function parseHookInput" .claude/hooks/ | wc -l  # Should be 0
grep -r "function findProjectRoot" .claude/hooks/ | wc -l  # Should be 0
# All tests pass
npm test
```

**Success Criteria**:
- [ ] HOOK-001, HOOK-002 marked RESOLVED
- [ ] ~2200 lines of code removed
- [ ] All 49 hooks use shared utilities
- [ ] All tests pass

---

### Phase 4: Performance Improvements & Process Gaps

**Purpose**: Consolidate hooks, improve caching, close process gaps
**Estimated Time**: ~25+ hours (can be done incrementally)
**Dependencies**: Phases 1-3

**Tasks**:

#### 4A: State Cache Integration (HOOK-004, PERF-004, PERF-005, PROC-007)

1. - [ ] **4A.1** Add state-cache.cjs integration for evolution-state.json (~2 hours)
   - **Files**: All evolution hooks reading evolution-state.json
   - **Fix**: Use `StateCache.get('evolution-state')` pattern
   - **Benefit**: 83% reduction in evolution state I/O

2. - [ ] **4A.2** Add state-cache.cjs integration for loop-state.json (~1 hour)
   - **File**: `.claude/hooks/self-healing/loop-prevention.cjs`
   - **Fix**: Replace direct reads with cached version
   - **Benefit**: ~100-200ms saved per read

#### 4B: Hook Consolidation (HOOK-PERF-001, PERF-003, PROC-001)

3. - [ ] **4B.1** Create task-pre-use-guard.cjs consolidation (~3 hours)
   - **Consolidate**: 4 PreToolUse(Task) hooks
   - **Pattern**: Follow unified-reflection-handler.cjs approach
   - **Benefit**: -75% process spawns for Task operations

4. - [ ] **4B.2** Create task-post-use-guard.cjs consolidation (~4 hours)
   - **Consolidate**: 5 PostToolUse(Task) hooks
   - **Benefit**: -80% process spawns for Task completions

5. - [ ] **4B.3** Create prompt-submit-guard.cjs consolidation (~3 hours)
   - **Consolidate**: 5 PreToolUse(UserPrompt) hooks
   - **Benefit**: -80% process spawns for user prompts

#### 4C: Process & Documentation Gaps

6. - [ ] **4C.1** Document hook consolidation workflow (~2 hours)
   - **Issue**: PROC-001
   - **Output**: `.claude/workflows/operations/hook-consolidation.md`
   - **Content**: Step-by-step consolidation process

7. - [ ] **4C.2** Document code deduplication process (~1 hour)
   - **Issue**: PROC-002
   - **Output**: `.claude/docs/CODE_DEDUPLICATION_PROCESS.md`

8. - [ ] **4C.3** Standardize error recovery patterns (~2 hours)
   - **Issue**: PROC-004
   - **Output**: `.claude/docs/ERROR_RECOVERY_PATTERNS.md`

9. - [ ] **4C.4** Add agent spawning verification hook (~3 hours)
   - **Issue**: PROC-005
   - **Output**: `.claude/hooks/routing/agent-completion-verifier.cjs`

10. - [ ] **4C.5** Create hooks development guide (~2 hours)
    - **Issue**: PROC-010
    - **Output**: `.claude/docs/HOOKS_DEVELOPMENT_GUIDE.md`

11. - [ ] **4C.6** Fix test isolation for state-dependent tests (~2 hours)
    - **Issue**: PROC-008
    - **Fix**: Create test fixture factory with isolated state files

#### 4D: Remaining Security Items

12. - [ ] **4D.1** Add URL allowlist for researcher agent (~4 hours)
    - **Issue**: SEC-REMEDIATION-003
    - **Fix**: Create URL domain allowlist (*.exa.ai, *.github.com, *.arxiv.org)
    - **Block**: RFC 1918 private network ranges

**Success Criteria**:
- [ ] All HOOK-004, PERF-004, PERF-005 marked RESOLVED
- [ ] Hook consolidation achieves 70%+ process spawn reduction
- [ ] All process documentation created
- [ ] SEC-REMEDIATION-003 mitigated or documented

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

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
| Hook migration breaks functionality | HIGH | Run tests after each migration | `git checkout -- .claude/hooks/<file>` |
| Security fix introduces new vulnerability | CRITICAL | Security-Architect review required | Revert commit, document in issues.md |
| State cache causes stale data | MEDIUM | Add TTL and invalidation | Disable cache via env var |
| Concurrent writes during atomic-write fix | HIGH | Test on Windows specifically | Revert to sync-only |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Dependencies |
|-------|-------|-----------|-----------|--------------|
| 1 (Quick Wins) | 10 | ~6h | Yes (within) | None |
| 2 (Security) | 4 | ~12h | Partial | None |
| 3 (Dedup) | 4 | ~6h | No | Phase 1.5, 1.6 |
| 4 (Perf/Process) | 12 | ~25h | Yes (within) | Phases 1-3 |
| FINAL (Reflection) | 3 | ~1h | No | All above |
| **Total** | **33** | **~50h** | | |

## Issue-to-Task Mapping

| Issue ID | Phase | Task | Status |
|----------|-------|------|--------|
| PERF-008 | 1 | 1.1 | Pending |
| PERF-009 | 1 | 1.2 | Pending |
| HOOK-006 | 1 | 1.3 | Pending |
| HOOK-007 | 1 | 1.4 | Pending |
| DEBUG-001/NEW-MED-002 | 1 | 1.5 | Pending |
| IMP-007 | 1 | 1.6 | Pending |
| ARCH-003 | 1 | 1.7 | Pending |
| HOOK-008 | 1 | 1.8 | Pending |
| HOOK-009 | 1 | 1.9 | Pending |
| SEC-AUDIT-011 | 1 | 1.10 | Pending |
| SEC-AUDIT-013 | 2 | 2.1 | Pending |
| SEC-AUDIT-014 | 2 | 2.2 | Pending |
| SEC-AUDIT-016 | 2 | 2.3 | Pending |
| SEC-AUDIT-018 | 2 | 2.4 | Deferred |
| HOOK-001 | 3 | 3.1, 3.2 | Pending |
| HOOK-002 | 3 | 3.3 | Pending |
| HOOK-004 | 4 | 4A.1 | Pending |
| PERF-004 | 4 | 4A.1 | Pending |
| PERF-005 | 4 | 4A.2 | Pending |
| PROC-007 | 4 | 4A.1 | Pending |
| HOOK-PERF-001/PERF-003 | 4 | 4B.1-4B.3 | Pending |
| PROC-001 | 4 | 4C.1 | Pending |
| PROC-002 | 4 | 4C.2 | Pending |
| PROC-004 | 4 | 4C.3 | Pending |
| PROC-005 | 4 | 4C.4 | Pending |
| PROC-010 | 4 | 4C.5 | Pending |
| PROC-008 | 4 | 4C.6 | Pending |
| SEC-REMEDIATION-003 | 4 | 4D.1 | Pending |

## Security-Architect Review Required

The following issues require Security-Architect review before implementation:

1. **SEC-AUDIT-013** - Atomic write race condition fix
2. **SEC-AUDIT-014** - Lock file TOCTOU fix
3. **SEC-AUDIT-016** - Security override logging
4. **SEC-AUDIT-018** - Evolution state tampering (if not deferred)
5. **SEC-REMEDIATION-003** - Researcher agent URL allowlist

---

*Plan generated by PLANNER agent on 2026-01-28*
*Invoke Skill({ skill: "plan-generator" }) for executable task format*
