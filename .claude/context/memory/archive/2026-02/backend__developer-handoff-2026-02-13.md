<!-- Agent: context-compressor | Task: #3 | Session: 2026-02-13 -->

# Developer Handoff — P0/P1 Remediation Sprint

**Date:** 2026-02-13 | **Total Effort:** 16-24 hours P0 + 3-4 weeks P1
**Target:** Eliminate 5 P0 blockers within 1 week, resolve 8 P1 high-priority items within 1 month

---

## P0 CRITICAL FIXES (This Week)

### FIX 1: Memory Circular Dependency (2 hours) — C-001

**Files:** `.claude/lib/memory/contextual-memory.cjs` ↔ `.claude/lib/memory/memory-query.cjs`

**Problem:** `contextual-memory.cjs` and `memory-query.cjs` both import shared utilities, creating refactoring fragility.

**Solution:**

1. Create `.claude/lib/memory/core/memory-utils.cjs` with `buildSemanticContext()` extracted (100 lines)
2. Update imports in both modules to use `memory-utils.cjs`
3. Test: `npx madge --circular .claude/lib/memory/` → should report "No circular dependencies found!"

**Verification:**

```bash
npx madge --circular .claude/lib/memory/
pnpm test tests/lib/memory/integration/circular-import.test.cjs
node -e "const { readMemory } = require('./.claude/lib/memory/core/index.cjs'); console.log('OK');"
```

---

### FIX 2: Memory Rotation Field Name Mismatches (4 hours) — C-002

**Files:** `.claude/lib/memory/smart-pruner.cjs`, `.claude/lib/memory/memory-scheduler.cjs`

**Problem:**

- `memory-scheduler.cjs` expects `pruneResult.entriesRemoved` but `smart-pruner.cjs` returns `pruneResult.removed`
- `memory-scheduler.cjs` passes `{ similarityThreshold: 0.6 }` but `smart-pruner.cjs` expects `{ threshold: 0.6 }`
- Result: Memory pruning silently fails → learnings.md 2.65x over budget

**Solution:**

1. Standardize return contract: Add `removed` field to `smart-pruner.cjs` deduplication result
2. Fix caller in `memory-scheduler.cjs`: Change `dedupResult.duplicatesRemoved` → `dedupResult.removed || 0`
3. Add runtime validation: Export `validateResultContract()` in smart-pruner.cjs to fail loudly on contract violations
4. Integration test: `tests/lib/memory/integration/scheduler-pruner.test.cjs` with 4 test cases

**Verification:**

```bash
pnpm test tests/lib/memory/integration/scheduler-pruner.test.cjs
node .claude/lib/memory/memory-scheduler.cjs task deduplication
ls -lh .claude/context/memory/learnings.md  # Should be <20KB
```

---

### FIX 3: Integration Queue Not Automated (6 hours) — C-003

**Files:** `.claude/context/runtime/integration-queue.jsonl` (queue file)

**Problem:** Queue accumulates but is never auto-processed. Router Step 0.5 is a SHOULD (easily skipped). Result: 70% orphan rate (354/454 skills never cataloged).

**Solution:**

1. Create `.claude/lib/workflow/artifact-integrator-spawner.cjs` (100 lines) with `spawnArtifactIntegrator()`
2. Enhance `.claude/hooks/workflow/post-creation-integration.cjs`: Add auto-spawn when queue size ≥ 5
3. Add integration health check to `.claude/tools/gates/metrics-ci.cjs`
4. Add `pnpm metrics:integration` script to package.json

**Verification:**

```bash
# Create 5 test artifacts
for i in {1..5}; do mkdir -p .claude/skills/test-skill-$i && echo "# Test" > .claude/skills/test-skill-$i/SKILL.md; done
# Verify auto-spawn triggered
grep "artifact-integrator" .claude/context/runtime/spawn-log.jsonl
# Wait and verify queue cleared
sleep 10 && wc -l .claude/context/runtime/integration-queue.jsonl
# Run CI check
pnpm metrics:ci
```

---

### FIX 4: Memory Sanitization Missing (8 hours) — P0-005

**Files:** `.claude/lib/memory/memory-sanitizer.cjs` (NEW), `.claude/lib/memory/contextual-memory.cjs`

**Problem:** No filtering before writing to memory (learnings.md, decisions.md, issues.md). Malicious entries could execute code via pattern matching: `eval()`, `new Function()`, shell commands, etc.

**Solution:**

1. Create `.claude/lib/memory/memory-sanitizer.cjs` (250 lines) with:
   - `detectDangerousPatterns()` — check for 30+ dangerous patterns
   - `sanitizeContent()` — strip dangerous code, scripts, injection patterns
   - `validateMemoryEntrySchema()` — schema validation
2. Integrate into `contextual-memory.cjs` writeMemory(): Call `sanitizeMemoryEntry()` before write
3. Add security tests: `tests/security/memory-poisoning.test.cjs` (200 lines, 17 attack vector tests)

**Attack vectors blocked:**

- Code: `eval()`, `new Function()`, `require('child_process')`
- Shells: `rm -rf`, `` `bash\n... `, curl piped to bash
- HTML: `<script>`, `<iframe>`, `javascript:` URIs
- Injection: "ignore previous instructions", "DAN mode", "jailbreak"

**Verification:**

```bash
pnpm test tests/security/memory-poisoning.test.cjs
# Run manual test
node -e "
const { sanitizeMemoryEntry } = require('./.claude/lib/memory/memory-sanitizer.cjs');
const entry = { content: 'Pattern: eval(1+1)' };
try {
  sanitizeMemoryEntry(entry, { strict: true });
  console.log('FAIL: Should have blocked');
} catch (e) {
  console.log('PASS: Blocked dangerous pattern');
}
"
```

---

### FIX 5: Concurrent Write Locking (8 hours) — P0-006

**Files:** `.claude/lib/utils/file-locker.cjs` (NEW), memory/state files

**Problem:** No locking for concurrent writes to memory/state files. TOCTOU scenario: Agent A reads, Agent B reads, Agent A writes, Agent B writes (overwrites A's write).

**Solution:**

1. Create `.claude/lib/utils/file-locker.cjs` (90 lines) using `proper-lockfile` npm package
   - `acquireLock()` — atomic lock acquire with retry logic
   - `withLock()` — automatic acquire + release wrapper
   - `isLocked()` — check lock status
2. Add `proper-lockfile` to package.json dependencies
3. Integrate into:
   - `.claude/lib/memory/contextual-memory.cjs` writeMemory() — wrap with `withLock(filePath)`
   - `.claude/lib/workflow/workflow-state-manager.cjs` updateState() — wrap with lock
   - `.claude/lib/routing/router-state.cjs` state writes — add locking
4. Add concurrency tests: `tests/security/concurrent-writes.test.cjs` (100 lines, 3 test cases)

**Verification:**

```bash
pnpm add proper-lockfile
pnpm test tests/security/concurrent-writes.test.cjs
# Stress test: 100 concurrent writes
node -e "
const { writeMemory } = require('./.claude/lib/memory/core/index.cjs');
const writes = [];
for (let i = 0; i < 100; i++) {
  writes.push(writeMemory('test', \`Entry \${i}\`));
}
Promise.all(writes).then(() => console.log('PASS: All entries preserved'));
"
# Verify all entries present
grep -c "Entry" .claude/context/memory/test.md  # Should be 100
```

---

## P1 HIGH PRIORITY (This Month)

### P1-001: Test Coverage for 5 Critical Modules (16 hours)

**Files to Test:** `loop-state-manager.cjs` (SECURITY CRITICAL), `metrics-reader.cjs`, `dashboard-renderer.cjs`, `production-alerts.cjs`, `metrics-schema.cjs`

**Create test files:**

- `tests/lib/workflow/loop-state-manager.test.cjs` (12+ test cases, security focus)
- `tests/lib/monitoring/metrics-reader.test.cjs` (8+ test cases)
- `tests/lib/monitoring/dashboard-renderer.test.cjs` (6+ test cases)
- `tests/lib/monitoring/production-alerts.test.cjs` (8+ test cases)
- `tests/lib/monitoring/metrics-schema.test.cjs` (10+ test cases)

**Target:** ≥80% coverage for all 5 modules

**Verification:**

```bash
pnpm test:coverage
grep -E "loop-state-manager|metrics-reader" coverage-report.txt  # Should show ≥80%
```

---

### P1-002: Memory Budget Rotation (2 hours immediate + 4 hours fix)

**Immediate Action:**

1. Manually rotate learnings.md NOW
   - Move entries older than 30 days to `.claude/context/memory/archive/learnings-2026-02.md`
   - Keep only last 30 days in `learnings.md`
   - Verify `learnings.md` < 20KB

**Then:** Fix P0-004 (memory rotation bugs) to enable auto-rotation

---

### P1-003: Prompt Injection Detection (12 hours)

**Files:** `.claude/hooks/routing/user-prompt-unified.cjs` (add input filter), `.claude/hooks/safety/post-tool-output-filter.cjs` (NEW)

**Solution:**

1. Add input sanitization to `user-prompt-unified.cjs`: Block patterns like "ignore previous instructions", "disregard all rules", "DAN mode", "jailbreak"
2. Create `post-tool-output-filter.cjs` (NEW hook): Detect leaked system prompts/CLAUDE.md content in agent outputs
3. Add to `.claude/settings.json`: Register output filter hook
4. Security tests: `tests/security/prompt-injection.test.cjs` (15+ attack vector tests)

**Verification:**

```bash
pnpm test tests/security/prompt-injection.test.cjs
grep "post-tool-output-filter" .claude/settings.json  # Should be registered
```

---

### P1-004: Shell Execution Gaps (1 hour)

**Files:** 3 lib files (reveal via test)

**Solution:**

1. Run test: `pnpm test tests/lib/utils/windows-hide-compliance.test.cjs`
2. Identifies 3 files missing `windowsHide: true` in spawn calls
3. Add `windowsHide: true` to all spawn/spawnSync options
4. Verify test passes after fix

**Verification:**

```bash
pnpm test tests/lib/utils/windows-hide-compliance.test.cjs
grep -r "spawnSync\|spawn(" .claude/lib/ | grep -v "windowsHide: true"  # Should be empty
```

---

### P1-005: Hook Coupling Chain (1 hour)

**Files:** `.claude/lib/routing/router-state.cjs`, `.claude/hooks/routing/routing-guard.cjs`, `.claude/hooks/routing/spawn-prompt-assembler.cjs`

**Problem:** Hook→Lib→Hook coupling (hooks should be leaf nodes)

**Solution:**

1. Move `getRouterMode()` from `router-state.cjs` to new `.claude/lib/routing/routing-utils.cjs`
2. Update imports in both hooks to use `routing-utils`
3. Verify: `npx madge --circular .claude/hooks/` → no cycles

**Verification:**

```bash
npx madge --circular .claude/hooks/
grep "routing-utils" .claude/hooks/routing/routing-guard.cjs
grep "routing-utils" .claude/hooks/routing/spawn-prompt-assembler.cjs
```

---

### P1-006: Concurrent Write Locking (Already in P0-006 above)

Implement file-based locking for memory/state files.

---

### P1-007: Configuration Consolidation (2 weeks refactor — DEFERRED)

**Note:** Large refactor requiring ADR. Schedule for dedicated sprint.

---

### P1-008: safeParseJSON Adoption (8 hours)

**Files:** All hooks using raw `JSON.parse` (audit required)

**Solution:**

1. Audit all hooks: `grep -r "JSON.parse" .claude/hooks/ --include="*.cjs"`
2. Replace with `safeParseJSON` from `.claude/lib/utils/safe-json-parse.cjs`
3. Add ESLint rule: Block `JSON.parse` in hooks
4. Update `.claude/lib/hooks/hook-input.cjs` stdin parsing to use `safeParseJSON`

**Verification:**

```bash
grep -r "JSON.parse" .claude/hooks/ --include="*.cjs"  # Should be empty
pnpm lint .claude/hooks/  # ESLint rule should fail on JSON.parse
```

---

## SPRINT SCHEDULE

### Week 1: P0 Blockers

| Day | Tasks                                            | Effort | Owner    |
| --- | ------------------------------------------------ | ------ | -------- |
| Mon | C-001 (Circular) + C-002 (Fields)                | 6h     | Dev 1    |
| Tue | P0-002 (Test failures)                           | 4h     | QA + Dev |
| Wed | C-003 (Queue automation)                         | 6h     | Dev 2    |
| Thu | P0-005 (Sanitization 1/2)                        | 4h     | Dev 1    |
| Fri | P0-005 (Sanitization 2/2) + P0-006 (Locking 1/2) | 4h     | Dev 1    |

**Checkpoint:** All P0 tests passing, integration queue automated

### Week 2-3: Security + Coverage

- Day 1-2: P0-006 finish (4h) + P1-001 tests (8h)
- Day 3-4: P1-003 prompt injection (12h)
- Day 5: P1-004 windowsHide (1h) + P1-005 coupling (1h) + buffer (6h)

**Checkpoint:** Security score 87→95, 100% test pass rate

---

## VERIFICATION COMMANDS (Run Before Marking Done)

```bash
# All P0 tests pass
pnpm test tests/lib/memory/integration/
pnpm test tests/security/memory-poisoning.test.cjs
pnpm test tests/security/concurrent-writes.test.cjs

# No circular dependencies
npx madge --circular .claude/lib/memory/
npx madge --circular .claude/hooks/

# Memory pruning works
node .claude/lib/memory/memory-scheduler.cjs task deduplication

# Integration queue automated
pnpm metrics:ci  # Should PASS

# All tests pass
pnpm test
grep -E "passing|fail" test-output.log  # Should show 100% pass rate

# Lint and format clean
pnpm lint:fix && pnpm format
```

---

## FILES CREATED/MODIFIED

**New Files (10 total):**

- `.claude/lib/memory/core/memory-utils.cjs`
- `.claude/lib/memory/memory-sanitizer.cjs`
- `.claude/lib/utils/file-locker.cjs`
- `.claude/lib/workflow/artifact-integrator-spawner.cjs`
- `tests/lib/memory/integration/circular-import.test.cjs`
- `tests/lib/memory/integration/scheduler-pruner.test.cjs`
- `tests/security/memory-poisoning.test.cjs`
- `tests/security/concurrent-writes.test.cjs`
- `.claude/hooks/safety/post-tool-output-filter.cjs`
- `.claude/schemas/memory-entry.json`

**Modified Files (15 total):**

- `.claude/lib/memory/contextual-memory.cjs`
- `.claude/lib/memory/memory-query.cjs`
- `.claude/lib/memory/smart-pruner.cjs`
- `.claude/lib/memory/memory-scheduler.cjs`
- `.claude/hooks/workflow/post-creation-integration.cjs`
- `.claude/tools/gates/metrics-ci.cjs`
- `.claude/lib/routing/router-state.cjs`
- `.claude/lib/workflow/workflow-state-manager.cjs`
- `.claude/hooks/routing/user-prompt-unified.cjs`
- `.claude/hooks/routing/routing-guard.cjs`
- `.claude/hooks/routing/spawn-prompt-assembler.cjs`
- `.claude/settings.json`
- `package.json`
- `.eslintrc.js`
- `.claude/context/memory/learnings.md` (manual rotation)

---

## SUCCESS CRITERIA

- [ ] All P0 fixes verified (27 automated tests pass)
- [ ] All tests pass 100% (pnpm test)
- [ ] No circular dependencies (npx madge --circular)
- [ ] Integration queue auto-processes (no manual Step 0.5)
- [ ] Memory rotation works (learnings.md < 20KB)
- [ ] Orphan rate drops to <10% within 1 week
- [ ] Security score 87 → 95 (ASI06 + prompt injection)
- [ ] Architecture quality 7.8 → 9.0 (circular deps fixed)

---

**Document Status:** READY FOR IMPLEMENTATION | Last Updated: 2026-02-13
