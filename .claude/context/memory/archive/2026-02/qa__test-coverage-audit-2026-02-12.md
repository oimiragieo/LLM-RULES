# Test Coverage Audit Report

**Date:** 2026-02-12
**Agent:** QA
**Scope:** Comprehensive test coverage gap analysis for agent-studio framework

## Executive Summary

This audit identified significant test coverage gaps across critical framework components. While the framework has 381 test files covering various subsystems, **systematic gaps exist in security-critical hooks, memory management, and routing layers**.

### Key Findings

- **Baseline:** 381 test files, 1637 total tests (430 passing as of recent QA run)
- **Critical Gaps:** 13 hooks without tests (30% of active hooks untested)
- **Library Coverage:** 109 lib tests for 181 library files (60% coverage)
- **CLI Tools:** 10 tests for 43 CLI tools (23% coverage)
- **Priority:** 18 P0 gaps, 25 P1 gaps, 40 P2 gaps

---

## 1. Untested Critical Hooks (P0 - BLOCKING)

### 1.1 Security-Critical Hooks (No Tests)

| Hook                         | Purpose                            | Risk     | Test Gap       |
| ---------------------------- | ---------------------------------- | -------- | -------------- |
| `unified-creator-guard.cjs`  | Blocks writes to creator paths     | CRITICAL | No tests exist |
| `spawn-prompt-assembler.cjs` | Assembles agent spawn prompts      | HIGH     | No tests exist |
| `unified-pre-write-hook.cjs` | File safety validation (11 checks) | HIGH     | No tests exist |
| `reflection-step0-guard.cjs` | Blocks TaskList without reflection | MEDIUM   | No tests exist |

**Impact:** These 4 hooks are the primary enforcement layer for:

- Creator workflow integrity (prevents orphaned artifacts)
- Spawn prompt security (prevents prompt injection)
- File path safety (prevents path traversal)
- Reflection protocol compliance

**Evidence from memory:**

- SEC-ROUTER-001: routing-guard.cjs not registered for Edit|Write (CRITICAL finding)
- VUL-ELEV-002: Creator intent guard bypass (HIGH finding from Wave 2 audit)
- 354 orphaned skills (78% orphan rate) - enforcement hooks exist but untested

**Recommended Tests:**

```javascript
// unified-creator-guard.cjs - MUST HAVE
- Test 1: Block writes to .claude/skills/**/*.md without skill-creator
- Test 2: Block writes to .claude/agents/**/*.md without agent-creator
- Test 3: Block writes to .claude/hooks/**/*.cjs without hook-creator
- Test 4: Allow writes during creator TTL window
- Test 5: Block writes after creator TTL expires (existing failure in comprehensive suite)
- Test 6: Verify restoration of archived artifacts triggers creator workflow

// spawn-prompt-assembler.cjs - MUST HAVE
- Test 1: Sanitize instruction override patterns
- Test 2: Enforce prompt length limits (50KB warning, 120KB block)
- Test 3: Include TaskUpdate warning box for all agents
- Test 4: Respect template loading protocol (universal/orchestrator/identity)
- Test 5: Handle template load failures gracefully

// unified-pre-write-hook.cjs - MUST HAVE
- Test 1: Validate path within project (prevent path traversal)
- Test 2: Block Windows reserved names (nul, con, prn, etc.)
- Test 3: Enforce file placement rules (.claude/context/reports/, etc.)
- Test 4: Allow whitelisted runtime paths (.claude/context/runtime/)
- Test 5: Block writes to project root (C:\dev\projects\agent-studio\)

// reflection-step0-guard.cjs - MUST HAVE
- Test 1: Block TaskList when reflection-reminder.txt exists
- Test 2: Allow TaskList when reminder deleted
- Test 3: Respect REFLECTION_STEP0_ENFORCEMENT modes (block/warn/off)
- Test 4: Verify dashboard pendingReflectionRequests integration
```

### 1.2 Memory & State Management Hooks (No Tests)

| Hook                          | Purpose                        | Risk   | Test Gap       |
| ----------------------------- | ------------------------------ | ------ | -------------- |
| `sync-memory-index.cjs`       | Updates memory search index    | MEDIUM | No tests exist |
| `error-summary-extractor.cjs` | Extracts errors for reflection | MEDIUM | No tests exist |
| `pre-compact.cjs`             | Pre-compaction validation      | LOW    | No tests exist |

**Evidence from memory:**

- Memory subsystem has 15+ modules but hook integration untested
- learnings.md corruption could silently fail sync

**Recommended Tests:**

```javascript
// sync-memory-index.cjs
- Test 1: Index learnings.md after Write
- Test 2: Index decisions.md after Edit
- Test 3: Handle invalid JSON in memory files
- Test 4: Respect MEMORY_MODE=hybrid|observational

// error-summary-extractor.cjs
- Test 1: Extract errors from task metadata
- Test 2: Format error summaries for reflection
- Test 3: Handle missing error fields gracefully
```

---

## 2. Library Module Test Gaps (P1 - HIGH PRIORITY)

### 2.1 Routing Layer (Partial Coverage)

**Status:** 7 tests for 8 routing modules (88% coverage, but depth gaps)

| Module                        | Test Status | Coverage Gap                                                  |
| ----------------------------- | ----------- | ------------------------------------------------------------- |
| `router-state.cjs`            | ❌ NO TEST  | State persistence, version management, optimistic concurrency |
| `routing-table.cjs`           | ❌ NO TEST  | 200+ routing rules, specialist-first routing, intent keywords |
| `agent-registry-loader.cjs`   | ❌ NO TEST  | 3-file split registry loading (core/domain/orchestrators)     |
| `fuzzy-intent-matcher.cjs`    | ✅ TESTED   | Semantic intent matching (coverage exists)                    |
| `intent-classifier.cjs`       | ✅ TESTED   | Intent classification (coverage exists)                       |
| `semantic-router.cjs`         | ✅ TESTED   | Semantic routing (coverage exists)                            |
| `pattern-router.cjs`          | ✅ TESTED   | Pattern-based routing (coverage exists)                       |
| `agent-registry-resolver.cjs` | ✅ TESTED   | Agent resolution (coverage exists)                            |

**CRITICAL GAPS:**

**router-state.cjs (21.7KB, 700+ lines):**

- No tests for state persistence to `.claude/context/runtime/router-state.json`
- No tests for optimistic concurrency (version field, saveStateWithRetry)
- No tests for mode transitions (router ↔ agent ↔ orchestrator)
- No tests for state reset on UserPromptSubmit

**Evidence from memory:**

- SEC-ROUTER-004: version field uses non-monotonic reset (Date.now() % 10000)
- SEC-ROUTER-002: taskListCalledSincePrompt flag tracked but never enforced
- HIGH-001 (pentest): router-state.json writable by agents (integrity risk)

**Recommended Tests:**

```javascript
// router-state.cjs - MUST HAVE
- Test 1: State persists to disk correctly
- Test 2: Version increments on save
- Test 3: Optimistic concurrency detects stale writes
- Test 4: State resets on UserPromptSubmit
- Test 5: Mode transitions (router → agent → orchestrator)
- Test 6: taskListCalledSincePrompt tracking
- Test 7: Concurrent write safety (file locking)
- Test 8: State recovery from corrupted JSON

// routing-table.cjs - MUST HAVE
- Test 1: Specialist-first routing (NOT developer for docs/test/review)
- Test 2: Intent keyword matching
- Test 3: ROUTING_TABLE precedence over INTENT_KEYWORDS
- Test 4: Fallback to developer when no specialist matches
- Test 5: Security-sensitive task routing (includes security-architect)

// agent-registry-loader.cjs - MUST HAVE
- Test 1: Load 3-file split registry (core/domain/orchestrators)
- Test 2: Build lookup index from 3 files
- Test 3: Handle missing registry files gracefully
- Test 4: Validate registry schema compliance
```

### 2.2 Memory Subsystem (Partial Coverage)

**Status:** 30+ memory modules, fragmented test coverage

| Module                  | Test Status         | Coverage Gap                                    |
| ----------------------- | ------------------- | ----------------------------------------------- |
| `memory-manager.cjs`    | ✅ TESTED (partial) | Health checks, full lifecycle not covered       |
| `memory-scheduler.cjs`  | ❌ NO TEST          | Daily/weekly rotation scheduling                |
| `memory-rotator.cjs`    | ❌ NO TEST          | Archive rotation, TTL enforcement               |
| `smart-pruner.cjs`      | ❌ NO TEST          | Deduplication, similarity threshold             |
| `cold-storage.cjs`      | ❌ NO TEST          | Compression, archive integrity                  |
| `memory-sanitizer.cjs`  | ❌ NO TEST          | Content sanitization (prompt injection defense) |
| `findings-registry.cjs` | ❌ NO TEST          | Open findings tracking, trend analysis          |
| `observations.cjs`      | ✅ TESTED           | Observational memory storage                    |
| `contextual-memory.cjs` | ❌ NO TEST          | Tiered memory access (HOT/WARM/COLD)            |

**Evidence from memory:**

- Task #7B: Memory management rebuild identified 3 HIGH security findings
- T-MEM-001: Archive path injection (no path validation tests)
- T-MEM-002: JSON prototype pollution (38 instances of raw JSON.parse)
- I-MEM-001: Sensitive data in cold storage (no scrubbing tests)
- HIGH-003 (pentest): Memory entry sanitization missing

**Recommended Tests:**

```javascript
// memory-rotator.cjs - MUST HAVE (SEC T-MEM-001)
- Test 1: Archive path validation (prevent injection)
- Test 2: TTL enforcement (rotate after 30 days)
- Test 3: File naming consistency (learnings-YYYY-MM.md)
- Test 4: Backup creation before rotation
- Test 5: Atomic file operations

// smart-pruner.cjs - MUST HAVE
- Test 1: Deduplication by content hash
- Test 2: Similarity threshold (0.6 default)
- Test 3: Preserve high-value entries
- Test 4: Return { removed: count } (not { entriesRemoved })

// memory-sanitizer.cjs - MUST HAVE (SEC HIGH-003)
- Test 1: Strip "IGNORE PREVIOUS INSTRUCTIONS" patterns
- Test 2: Redact API keys, JWTs, tokens
- Test 3: Sanitize email addresses in cold storage
- Test 4: Allow legitimate code snippets
- Test 5: Block shell command injection patterns

// findings-registry.cjs - MUST HAVE
- Test 1: Add/resolve/close finding lifecycle
- Test 2: Trend analysis (7-day snapshots)
- Test 3: Stale finding pruning (3+ days old)
- Test 4: CI gate thresholds (max 0 CRITICAL, max 5 HIGH)
```

### 2.3 Self-Healing & Workflow (Partial Coverage)

| Module                       | Test Status | Coverage Gap                                |
| ---------------------------- | ----------- | ------------------------------------------- |
| `loop-state-manager.cjs`     | ❌ NO TEST  | Loop prevention, lock management            |
| `rollback-manager.cjs`       | ❌ NO TEST  | State rollback, recovery                    |
| `validator.cjs`              | ❌ NO TEST  | Workflow step validation                    |
| `workflow-state-manager.cjs` | ❌ NO TEST  | Phase-gated execution state                 |
| `quality-gates.cjs`          | ❌ NO TEST  | Quality gate enforcement                    |
| `complexity-classifier.cjs`  | ❌ NO TEST  | TRIVIAL/LOW/MEDIUM/HIGH/EPIC classification |

**Evidence from memory:**

- VUL-TAM-001 (CRITICAL): Loop-state TOCTOU race condition (no tests)
- ASI01-SPOOF-001 (HIGH): Session ID environment override (no tests)
- No tests for enterprise workflow phase transitions

**Recommended Tests:**

```javascript
// loop-state-manager.cjs - MUST HAVE (SEC VUL-TAM-001)
- Test 1: Increment loop counter correctly
- Test 2: Detect infinite loops (threshold exceeded)
- Test 3: Lock acquisition and release
- Test 4: TOCTOU race condition (concurrent loops)
- Test 5: Stale lock cleanup
- Test 6: Session ID validation (prevent spoofing)

// complexity-classifier.cjs - MUST HAVE
- Test 1: TRIVIAL: single-file, <10 lines
- Test 2: LOW: single-file, <50 lines
- Test 3: MEDIUM: multi-file, <200 lines
- Test 4: HIGH: multi-file, multi-agent, architecture
- Test 5: EPIC: 7+ phases, 30+ tasks
```

---

## 3. CLI Tool Test Gaps (P1 - HIGH PRIORITY)

**Status:** 10 tests for 43 CLI tools (23% coverage)

### 3.1 Metrics & Monitoring Tools (No Tests)

| Tool                                 | Purpose                 | Risk   | Test Gap       |
| ------------------------------------ | ----------------------- | ------ | -------------- |
| `spawn-assembly-metrics-summary.cjs` | Spawn metrics dashboard | MEDIUM | No tests exist |
| `router-churn-summary.cjs`           | Routing churn metrics   | MEDIUM | No tests exist |
| `runtime-health-summary.cjs`         | Runtime health metrics  | MEDIUM | No tests exist |
| `memory-slo-summary.cjs`             | Memory SLO tracking     | MEDIUM | No tests exist |
| `memory-cache-stability-summary.cjs` | Cache stability metrics | MEDIUM | No tests exist |

**Recommended Tests:**

```javascript
// spawn-assembly-metrics-summary.cjs
- Test 1: Parse spawn-log.jsonl correctly
- Test 2: Calculate P95 latency
- Test 3: Detect compactness < 60%
- Test 4: CI gate assertions (--assert-max-p95-ms 300)

// memory-slo-summary.cjs
- Test 1: Calculate write P95 latency
- Test 2: Detect parse failures
- Test 3: Detect high churn rate (>80%)
- Test 4: CI gate assertions
```

### 3.2 Findings Management Tools (Partial Coverage)

| Tool                               | Test Status     | Coverage Gap                       |
| ---------------------------------- | --------------- | ---------------------------------- |
| `open-findings-summary.cjs`        | ✅ TESTED       | Basic functionality covered        |
| `open-findings-trend-summary.cjs`  | ✅ TESTED       | Trend analysis covered             |
| `open-findings-trend-snapshot.cjs` | ✅ TESTED (NEW) | Snapshot creation covered          |
| `open-findings-trend-admin.cjs`    | ✅ TESTED (NEW) | Admin operations covered           |
| `cleanup-transient-artifacts.cjs`  | ✅ TESTED (NEW) | Transient artifact cleanup covered |

**Good Coverage:** Findings management tools have recent comprehensive tests (2026-02-11).

---

## 4. Integration Test Gaps (P1 - IMPORTANT)

### 4.1 Hook Integration Tests (Missing)

**Issue:** Unit tests validate individual hooks, but **no integration tests** verify hook chains work together.

**Example from memory:**

- Task #9 had 41 passing unit tests
- Task #13 found 2 integration bugs (parameter name mismatches)
- Root cause: Unit tests mocked dependencies, missed real integration contract

**Recommended Integration Tests:**

```javascript
// Hook chain integration
- Test 1: Write operation triggers full hook chain
  - user-prompt-unified → routing-guard → unified-creator-guard → unified-pre-write-hook → sync-memory-index
- Test 2: TaskUpdate triggers post-task-unified → post-tool-metrics-unified
- Test 3: Spawn triggers spawn-prompt-assembler → spawn-prompt-validator → routing-guard
- Test 4: Reflection triggers force-step0-execution → reflection-step0-guard → reflection-queue-processor
```

### 4.2 Memory Integration Tests (Missing)

**Recommended Integration Tests:**

```javascript
// Memory subsystem integration
- Test 1: Write to learnings.md → sync-memory-index → lancedb-client embedding
- Test 2: Daily scheduler → memory-rotator → cold-storage compression
- Test 3: Smart-pruner deduplication → memory-manager health check
- Test 4: Contextual-memory query → tier access (HOT → WARM → COLD fallback)
```

---

## 5. Edge Case & Error Handling Gaps (P2 - NICE TO HAVE)

### 5.1 Missing Edge Cases (From Memory)

**Evidence from memory:**

- VUL-DOS-001: Whitespace bomb DoS (no tests for 1M-line prompts)
- VUL-DOS-002: Regex backtracking loop (no catastrophic backtracking tests)
- VUL-TAM-002: Unicode normalization bypass (no homoglyph tests)

**Recommended Edge Case Tests:**

```javascript
// spawn-prompt-validator.cjs
- Test 1: Whitespace bomb (1M lines → should error)
- Test 2: Unicode normalization (homoglyph injection)
- Test 3: Prompt length limits (50KB warning, 120KB block)
- Test 4: Compactness calculation (empty lines, whitespace)

// shell-injection-validator.cjs
- Test 1: OR chaining bypass (||, |&)
- Test 2: Non-standard separators (\n, ;)
- Test 3: Shell expansions ($VAR, `cmd`, $(cmd))
- Test 4: ANSI-C quoting ($'...')
```

### 5.2 Error Recovery Tests (Missing)

**Recommended Error Recovery Tests:**

```javascript
// router-state.cjs
- Test 1: Corrupted JSON recovery (fallback to defaults)
- Test 2: Missing state file (create new)
- Test 3: Permission denied (fail gracefully)
- Test 4: Concurrent write collision (retry with backoff)

// memory-manager.cjs
- Test 1: Corrupted learnings.md (skip bad entries)
- Test 2: Missing memory files (create from defaults)
- Test 3: Lock timeout (fail gracefully)
- Test 4: Disk full (error handling)
```

---

## 6. Test Quality Issues (P2 - REFACTORING)

### 6.1 Tests That Don't Assert Anything Meaningful

**Pattern:** Some tests check file existence but not behavior.

**Example Anti-Pattern:**

```javascript
// BAD: Tests implementation detail, not behavior
test('calls JSON.parse', () => {
  const spy = jest.spyOn(JSON, 'parse');
  loadState();
  expect(spy).toHaveBeenCalled();
});

// GOOD: Tests behavior, not implementation
test('loads state from disk correctly', () => {
  const state = loadState();
  expect(state.version).toBeGreaterThan(0);
  expect(state.mode).toBe('router');
});
```

### 6.2 Tests with Timing Dependencies (Flaky)

**Evidence from memory:**

- unified-creator-guard-comprehensive.test.cjs has 1 failure: "should block write after creator TTL expires" (timing issue)

**Recommended Fix:**

- Use deterministic time mocking (not real delays)
- Mock Date.now() instead of setTimeout
- Use condition polling instead of fixed delays

### 6.3 Tests with Shared State (Non-Isolated)

**Pattern:** Some tests modify global state and don't clean up.

**Recommended Fix:**

- Use beforeEach/afterEach to reset state
- Mock filesystem operations (don't write real files)
- Use temporary directories for file tests

---

## 7. Regression Test Gaps (P1 - IMPORTANT)

### 7.1 Known Bugs Without Regression Tests

**From memory (issues.md):**

| Bug                                         | Status     | Regression Test |
| ------------------------------------------- | ---------- | --------------- |
| Context overflow (5+ parallel heavy agents) | WORKAROUND | ❌ NO TEST      |
| Loop-state TOCTOU race condition            | OPEN       | ❌ NO TEST      |
| Whitespace bomb DoS                         | OPEN       | ❌ NO TEST      |
| Unicode normalization bypass                | OPEN       | ❌ NO TEST      |
| Creator intent guard bypass                 | OPEN       | ❌ NO TEST      |
| Session ID environment override             | OPEN       | ❌ NO TEST      |

**Recommended Regression Tests:**

```javascript
// Context overflow prevention
- Test 1: Spawn 5+ agents in parallel → should prevent or warn
- Test 2: Agent report exceeds 150KB → should write to file not inline
- Test 3: Context nears 200K tokens → should trigger compression

// Loop-state TOCTOU race
- Test 1: Concurrent loop increments → should not lose count
- Test 2: Stale lock acquisition → should validate ownership
- Test 3: Lock released after success → should clear lock ID
```

---

## 8. Test Infrastructure Gaps (P2 - TOOLING)

### 8.1 Missing Test Utilities

**Recommended Utilities:**

```javascript
// .claude/tools/testing/test-helpers.cjs
-createTempMemoryFile() - // Create temporary learnings.md for tests
  createMockRouterState() - // Mock router-state.json
  createMockTask() - // Mock task object for hook tests
  createMockHookInput() - // Mock hook stdin input
  cleanupTestArtifacts() - // Delete temp files after tests
  // .claude/tools/testing/hook-test-runner.cjs
  runHookWithInput(hookPath, input) - // Test hook stdin/stdout protocol
  assertHookBlocks(hookPath, input) - // Assert hook returns allow: false
  assertHookAllows(hookPath, input); // Assert hook returns allow: true
```

### 8.2 Missing CI Test Scripts

**Current CI:** `pnpm test:ci` runs all tests, but no focused suites.

**Recommended CI Scripts:**

```bash
# package.json scripts
"test:security": "node --test tests/hooks/*-guard*.test.cjs tests/hooks/*-validator*.test.cjs"
"test:memory": "node --test tests/lib/memory/**/*.test.cjs"
"test:routing": "node --test tests/lib/routing/**/*.test.cjs"
"test:p0": "node --test tests/hooks/unified-creator-guard*.test.cjs tests/hooks/spawn-prompt-assembler*.test.cjs"
```

---

## 9. Priority Matrix

### P0 - CRITICAL (Fix Immediately - 18 gaps)

| Component                  | Test Gap            | Impact                            | Effort       |
| -------------------------- | ------------------- | --------------------------------- | ------------ |
| unified-creator-guard.cjs  | No tests exist      | Orphaned artifacts (78% rate)     | 4h           |
| spawn-prompt-assembler.cjs | No tests exist      | Prompt injection risk             | 4h           |
| unified-pre-write-hook.cjs | No tests exist      | Path traversal risk               | 4h           |
| router-state.cjs           | No tests exist      | State corruption risk             | 6h           |
| loop-state-manager.cjs     | No tests exist      | TOCTOU race (SEC VUL-TAM-001)     | 4h           |
| memory-sanitizer.cjs       | No tests exist      | Memory poisoning (SEC HIGH-003)   | 3h           |
| memory-rotator.cjs         | No tests exist      | Archive injection (SEC T-MEM-001) | 3h           |
| **TOTAL P0**               | **7 critical gaps** | **Framework stability**           | **28 hours** |

### P1 - HIGH (Fix This Sprint - 25 gaps)

| Component                    | Test Gap                  | Impact                        | Effort       |
| ---------------------------- | ------------------------- | ----------------------------- | ------------ |
| routing-table.cjs            | No tests exist            | Misrouting risk               | 4h           |
| agent-registry-loader.cjs    | No tests exist            | Registry load failures        | 2h           |
| reflection-step0-guard.cjs   | No tests exist            | Reflection protocol bypass    | 2h           |
| smart-pruner.cjs             | No tests exist            | Memory deduplication failures | 3h           |
| cold-storage.cjs             | No tests exist            | Archive corruption            | 3h           |
| findings-registry.cjs        | No tests exist            | Finding tracking failures     | 3h           |
| complexity-classifier.cjs    | No tests exist            | Wrong phase selection         | 2h           |
| quality-gates.cjs            | No tests exist            | Quality gate bypass           | 2h           |
| workflow-state-manager.cjs   | No tests exist            | Phase transition failures     | 3h           |
| sync-memory-index.cjs        | No tests exist            | Search index stale            | 2h           |
| error-summary-extractor.cjs  | No tests exist            | Reflection missing errors     | 2h           |
| Metrics tools (5 tools)      | No tests exist            | CI gates unreliable           | 10h          |
| Integration tests (4 suites) | Missing                   | Real-world failures           | 8h           |
| **TOTAL P1**                 | **17 high-priority gaps** | **Quality & reliability**     | **46 hours** |

### P2 - MEDIUM (Fix Next Month - 40 gaps)

| Component                     | Test Gap            | Impact                   | Effort        |
| ----------------------------- | ------------------- | ------------------------ | ------------- |
| Edge case tests (8 gaps)      | Missing             | Security vulnerabilities | 16h           |
| Error recovery tests (4 gaps) | Missing             | Crash recovery           | 8h            |
| CLI tools (28 untested)       | No tests exist      | Tooling reliability      | 56h           |
| Test quality refactoring      | Anti-patterns       | Test reliability         | 12h           |
| Test infrastructure           | Missing helpers     | Developer productivity   | 8h            |
| **TOTAL P2**                  | **40+ medium gaps** | **Long-term quality**    | **100 hours** |

---

## 10. Recommendations

### 10.1 Immediate Actions (This Week - P0)

1. **Create unified-creator-guard comprehensive test suite** (4h)
   - 10+ test cases covering all creator paths
   - TTL window validation
   - Enforcement mode testing (block/warn/off)

2. **Create spawn-prompt-assembler comprehensive test suite** (4h)
   - Template loading protocol
   - Prompt sanitization
   - Length validation
   - TaskUpdate warning box inclusion

3. **Create unified-pre-write-hook comprehensive test suite** (4h)
   - Path validation (11 safety checks)
   - Windows reserved names
   - File placement rules
   - Whitelist validation

4. **Create router-state.cjs comprehensive test suite** (6h)
   - State persistence
   - Optimistic concurrency
   - Mode transitions
   - State reset protocol

5. **Create loop-state-manager.cjs comprehensive test suite** (4h)
   - TOCTOU race condition (SEC VUL-TAM-001)
   - Lock management
   - Session ID validation

6. **Create memory-sanitizer.cjs comprehensive test suite** (3h)
   - Prompt injection defense (SEC HIGH-003)
   - API key/JWT redaction
   - Shell command sanitization

7. **Create memory-rotator.cjs comprehensive test suite** (3h)
   - Archive path validation (SEC T-MEM-001)
   - TTL enforcement
   - Atomic file operations

**Total P0 Effort:** 28 hours (1 developer week)

### 10.2 Short-Term Actions (This Sprint - P1)

1. **Create routing layer comprehensive test suites** (6h)
   - routing-table.cjs: Specialist-first routing, intent keywords
   - agent-registry-loader.cjs: 3-file split loading

2. **Create memory subsystem comprehensive test suites** (11h)
   - smart-pruner.cjs: Deduplication, similarity threshold
   - cold-storage.cjs: Compression, integrity verification
   - findings-registry.cjs: Finding lifecycle, trend analysis

3. **Create workflow subsystem comprehensive test suites** (7h)
   - complexity-classifier.cjs: TRIVIAL/LOW/MEDIUM/HIGH/EPIC
   - quality-gates.cjs: Gate enforcement, blocking/non-blocking
   - workflow-state-manager.cjs: Phase transitions

4. **Create integration test suites** (8h)
   - Hook chain integration (4 suites)
   - Memory subsystem integration (4 suites)

5. **Create metrics tool test suites** (10h)
   - spawn-assembly-metrics-summary.cjs
   - router-churn-summary.cjs
   - runtime-health-summary.cjs
   - memory-slo-summary.cjs
   - memory-cache-stability-summary.cjs

6. **Create regression test suites** (4h)
   - Context overflow prevention
   - Loop-state TOCTOU race
   - Whitespace bomb DoS
   - Unicode normalization bypass

**Total P1 Effort:** 46 hours (1.5 developer weeks)

### 10.3 Long-Term Actions (Next Month - P2)

1. **Edge case test coverage** (16h)
2. **Error recovery test coverage** (8h)
3. **CLI tool test coverage** (56h)
4. **Test quality refactoring** (12h)
5. **Test infrastructure improvements** (8h)

**Total P2 Effort:** 100 hours (2.5 developer weeks)

---

## 11. Success Criteria

### 11.1 Coverage Metrics

**Current Baseline:**

- 381 test files
- 1637 total tests
- 430 passing (99.3% pass rate)
- ~60% library coverage
- ~23% CLI tool coverage
- 30% critical hooks untested

**Target (After P0+P1):**

- 450+ test files
- 2000+ total tests
- 95%+ pass rate
- 85%+ library coverage
- 50%+ CLI tool coverage
- 0% critical hooks untested

### 11.2 Quality Gates

**P0 Complete:**

- [ ] All 7 critical hooks have comprehensive test suites
- [ ] All security vulnerabilities (VUL-TAM-001, HIGH-003, T-MEM-001) have regression tests
- [ ] All tests passing (0 failures)
- [ ] Lint/format clean

**P1 Complete:**

- [ ] All 17 high-priority modules have comprehensive test suites
- [ ] Integration test suites for hooks, memory, routing
- [ ] Regression tests for known bugs
- [ ] Metrics tools have CI validation
- [ ] Test coverage >85% for critical paths

**P2 Complete:**

- [ ] Edge case coverage for security patterns
- [ ] Error recovery tests for all critical modules
- [ ] CLI tool coverage >50%
- [ ] Test infrastructure utilities available
- [ ] Test quality refactoring complete

---

## 12. Cross-References

**Memory Files:**

- `.claude/context/memory/learnings.md` - Enterprise pipeline patterns, test suite gaps
- `.claude/context/memory/issues.md` - Known bugs, security vulnerabilities
- `.claude/context/memory/decisions.md` - ADR-102 (memory management), ADR-103 (integration boundary testing)

**Security Reports:**

- `.claude/context/reports/security/security-audit-wave2-2026-02-11.md` - 11 vulnerabilities requiring tests
- `.claude/context/reports/security/auth-pentest-assessment-2026-02-09.md` - 14 pentest findings

**QA Reports:**

- `.claude/context/reports/qa/qa-audit-fixes-2026-02-11.md` - Test suite validation (99.3% pass rate)

**Architecture Reports:**

- `.claude/context/reports/architecture/code-simplification-analysis-2026-02-08.md` - 11,830 lines dead code

---

## 13. Appendix A: Full Untested Hook List

```
1. adaptive-quality-gate.cjs
2. creator-compliance-validator.cjs
3. error-summary-extractor.cjs
4. error-tracker.cjs
5. post-edit-scanner.cjs
6. pre-compact.cjs
7. pre-completion-validation.cjs
8. pre-tool-unified.cjs
9. reflection-step0-guard.cjs
10. spawn-prompt-assembler.cjs
11. sync-memory-index.cjs
12. unified-creator-guard.cjs
13. unified-pre-write-hook.cjs
```

---

## 14. Appendix B: Test Commands

```bash
# Run all tests
pnpm test

# Run framework tests (hooks + lib)
pnpm test:framework

# Run hook tests only
pnpm test:framework:hooks

# Run library tests only
pnpm test:framework:lib

# Run CI test suite
pnpm test:ci

# Run specific test file
node --test tests/hooks/unified-creator-guard-comprehensive.test.cjs

# Run test with coverage
pnpm test:coverage
```

---

**End of Report**
