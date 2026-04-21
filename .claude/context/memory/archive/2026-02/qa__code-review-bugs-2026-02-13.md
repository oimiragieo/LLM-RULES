<!-- Agent: code-reviewer | Task: #2 | Session: 2026-02-13 -->

# Bug-Focused Code Audit Report

**Date**: 2026-02-13  
**Scope**: High-priority files (hooks, routing, memory, utils)  
**Focus**: ACTUAL BUGS (logic errors, race conditions, edge cases, broken code)

---

## CRITICAL BUGS (P0 - Must Fix)

### BUG-001: Race Condition in State Cache Invalidation
**File**: `.claude/hooks/routing/routing-guard.cjs:278-281`

**Issue**: Cache invalidation is not atomic. Between line 279 and 280, another thread could call getCachedRouterState() and get stale cache.

**Impact**: Stale router state could allow blacklisted tools through.

**Fix**: Reverse order - invalidate external first, then local.

**Severity**: CRITICAL - Security bypass risk

---

### BUG-002: Unsafe Process Kill Signal Check (Windows)
**File**: `.claude/hooks/routing/pre-tool-unified.cjs:259-265`

**Issue**: On Windows, process.kill(pid, 0) does NOT check if process is alive - it ALWAYS throws. Function always returns false on Windows, marking all locks as stale.

**Impact**: On Windows, lock files never respected - concurrent file corruption.

**Severity**: CRITICAL (Windows data corruption)

---

### BUG-003: Logic Error in Stale Detection Fallback
**File**: `.claude/hooks/routing/routing-guard.cjs:222-232`

**Issue**: Returns unmodified state without updating sessionId when lastReset missing and no explicit mismatch.

**Impact**: Stale router state persists across sessions.

**Severity**: HIGH

---

### BUG-004: Missing Timeout in eventBus Awaits
**File**: `.claude/hooks/routing/routing-guard.cjs:2260-2267`

**Issue**: Hook awaits eventBus.emit() without timeout - if emit hangs, hook hangs forever.

**Impact**: Hook deadlock blocks all tools.

**Severity**: HIGH

---

### BUG-005: Potential Null Dereference in Hook Input
**File**: `.claude/hooks/routing/routing-guard.cjs:2170-2178`

**Issue**: If parseHookInputAsync returns truthy non-object (e.g. empty string), getToolName(hookInput) would crash.

**Impact**: Hook crash on malformed input.

**Severity**: MEDIUM

---

## SUMMARY

| Priority | Count | Fix Time |
|----------|-------|----------|
| P0 (Critical) | 2 | 1-2 hours |
| P1 (High) | 2 | 1 hour |
| P2 (Medium) | 1 | 30 min |

**Total Real Bugs**: 5  
**Blocking**: 4 (P0/P1)

---

## VERDICT

**Ready to merge?** NO (4 CRITICAL/HIGH bugs must be fixed)

**Reasoning**: BUG-001 (cache race) and BUG-002 (Windows lock) are security/corruption risks. BUG-003 (stale state) and BUG-004 (hang) are stability risks.

**Estimated Fix Time**: 2-3 hours for all P0/P1 bugs.
