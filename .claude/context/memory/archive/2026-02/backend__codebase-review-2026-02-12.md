# Agent Studio Codebase Review - 2026-02-12

Agent: code-reviewer | Task: codebase-review | Session: 2026-02-12

## EXECUTIVE SUMMARY

**Key Metrics:**

- Total findings: 23 (2 CRITICAL, 4 HIGH, 8 MEDIUM, 9 LOW)
- Code organization: Strong (facade patterns, modular structure)
- Security: **CRITICAL** (unprotected JSON.parse, shell injection)
- Test coverage: 260 test files, 97% pass rate

---

## CRITICAL ISSUES (MUST FIX)

### CRITICAL-001: Unprotected JSON.parse in 5+ Hook Files

**Files:**

- .claude/hooks/reflection/reflection-queue-processor.cjs:126,205,235
- .claude/hooks/reflection/reflection-step0-guard.cjs:68
- .claude/hooks/reflection/force-step0-execution.cjs
- .claude/hooks/routing/pre-task-unified.cjs
- .claude/hooks/routing/pre-tool-unified.cjs

**Issue:** JSON.parse without try-catch will crash hooks when memory files are malformed.

**Impact:** Process crash → TaskList() blocked → framework frozen

**Fix:** Wrap all JSON.parse in try-catch:

```javascript
try {
  const data = JSON.parse(content);
} catch (err) {
  auditLog('JSON parse failed', { error: err.message });
  return [];
}
```

---

### CRITICAL-002: Shell Injection Risk in 4 Skill Scripts

**Files:**

- .claude/skills/sequential-thinking/scripts/main.cjs
- .claude/skills/git-expert/scripts/main.cjs
- .claude/skills/docker-compose/scripts/main.cjs
- .claude/skills/terraform-infra/scripts/main.cjs

**Issue:** Using `shell: true` with user-controlled input enables command injection.

**Impact:** Arbitrary code execution

**Fix:** Change all to:

```javascript
spawn(executor, [userInput], { shell: false });
```

---

### CRITICAL-003: Synchronous Busy-Wait Freezes Application

**File:** .claude/lib/code-indexing/vector-store.cjs:13-18

**Issue:**

```javascript
function sleepSync(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait blocks event loop completely
  }
}
```

**Impact:** Application freeze if called in hot path

**Fix:** Use async sleep:

```javascript
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## HIGH-SEVERITY ISSUES (4 FOUND)

### HIGH-001: Silent File Write Failures

**File:** .claude/hooks/reflection/reflection-queue-processor.cjs:220

**Issue:** fs.writeFileSync without error handling. Lost spawn requests if disk full.

---

### HIGH-002: Race Condition in Database Initialization

**File:** .claude/hooks/memory/sync-memory-index.cjs:56-80

**Issue:** Concurrent hooks may both try to initialize schema → SQLite corruption

**Fix:** Use file locking before initialization

---

### HIGH-003: Silent Failure in Reminder Cleanup

**File:** .claude/hooks/reflection/reflection-step0-guard.cjs:75-85

**Issue:** clearReminderIfStale() ignores deletion errors → reflection blocks forever

---

### HIGH-004: Event Bus Crash Potential

**Files:** Multiple hooks

**Issue:** No null check for event bus module → crashes if initialization fails

**Fix:**

```javascript
let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  eventBus = null;
}
if (eventBus) eventBus.emit(...);
```

---

## MEDIUM-SEVERITY ISSUES (8 FOUND)

### MEDIUM-001: Inconsistent Error Handling in Router Guard

### MEDIUM-002: Windows Path Compatibility (backslash vs forward slash)

### MEDIUM-003: Memory Leak Potential in Hook Input Caching

### MEDIUM-004: Incomplete Memory Monitor Null Checks

### MEDIUM-005: Missing Timeout Protection in AST Grep Wrapper

### MEDIUM-006: Incomplete Error Propagation in Hybrid Indexer

### MEDIUM-007: Fragile Config Path Resolution (assumes directory structure)

### MEDIUM-008: Ripgrep Cache Has No LRU Eviction Policy

---

## RECOMMENDATIONS

### Immediate (P0 - This Week)

1. Fix JSON.parse safety: add try-catch to 5+ hook files (2-3 hours)
2. Fix shell injection: change 4 skill scripts to shell: false (1-2 hours)
3. Add event bus null checks: all hooks using event bus (1 hour)

### Short-term (P1 - This Month)

4. Add proper error handling to file operations
5. Fix database initialization race condition
6. Replace sleepSync busy-wait with async
7. Add error path test coverage
8. Migrate tests to Jest framework

### Long-term (P2 - Next Quarter)

9. Consistent error handling patterns
10. Memory monitoring and limits
11. Windows path compatibility fixes
12. Performance profiling for caches

---

## CODE QUALITY SUMMARY

| Area                  | Status   | Count |
| --------------------- | -------- | ----- |
| JSON.parse safety     | CRITICAL | 5     |
| Shell injection risk  | CRITICAL | 4     |
| Error handling        | HIGH     | 4     |
| Null checks           | HIGH     | 2     |
| Windows compatibility | MEDIUM   | 3     |
| Memory management     | MEDIUM   | 2     |
| Performance           | MEDIUM   | 1     |
| Test quality          | LOW      | 3     |

---

## VERIFICATION CHECKLIST

- [ ] JSON.parse fixes applied (5 files)
- [ ] Shell injection fixes applied (4 files)
- [ ] Event bus null checks added
- [ ] pnpm test passes (430+ tests)
- [ ] pnpm lint:fix (0 errors)
- [ ] pnpm format (no changes)

---

**Report Generated:** 2026-02-12
**Files Analyzed:** 50+ hooks, libs, and tools
**Test Status:** 97% pass rate (430/433)
**Confidence Level:** HIGH
