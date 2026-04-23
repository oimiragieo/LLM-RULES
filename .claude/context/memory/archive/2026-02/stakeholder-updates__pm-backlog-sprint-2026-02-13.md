<!-- Agent: pm | Task: #1 | Session: 2026-02-13 -->

# PM Backlog — P0/P1 Fix Sprint 2026-02-13

**Created:** 2026-02-13
**Sprint Capacity:** 16-24 hours (P0) + 3-4 weeks (P1)
**Baseline:** 5 P0 CRITICAL + 8 P1 HIGH priority issues
**Target Exit State:** 100% test pass rate, <10% orphan rate, security score 95/100

---

## Executive Summary

Foundation health is GOOD (87/100 security, 99.94% test pass rate) but **3 blocking issues prevent production deployment:**

1. **Integration queue dead (orphan rate 70%)**
2. **Test suite incomplete (2 failures + 2 blocked tasks)**
3. **Memory system flaky (circular deps + field mismatches + no sanitization)**

This backlog prioritizes unblocking the core pipeline (Day 1-5) before secondary hardening.

---

## Priority Ordering Strategy

| Tier          | Focus                                                | Effort   | Blocked Reason                                         |
| ------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------ |
| **P0 Wave 1** | Integration queue → test suite → memory circular dep | 5-8 hrs  | Unblocks verification, artifact discovery, refactoring |
| **P0 Wave 2** | Memory rotation field fixes → sanitization           | 8-12 hrs | Unblocks memory-heavy workflows, async agents          |
| **P1 Wave 1** | Security hardening (injection, safeParseJSON)        | 3-4 days | Unblocks compliance, OWASP audit, team confidence      |
| **P1 Wave 2** | Test coverage (5 critical modules)                   | 3 days   | Unblocks security review sign-off                      |
| **P1 Wave 3** | Concurrent write locking + config consolidation      | 2+ weeks | Long-pole refactor, enables multi-agent workflows      |

---

## User Stories & Acceptance Criteria

---

### **STORY P0-001: Integration Queue Automation**

**As a** PM agent
**I want** the integration-queue-processor to auto-remediate orphaned artifacts
**So that** 70% orphan rate doesn't regress and integrations are discoverable

**Acceptance Criteria:**

- [ ] **AC1:** `artifact-integrator` wired to `package.json` scripts (`pnpm integrate:queue`)
- [ ] **AC2:** New hook `integration-queue-processor.cjs` registered (PostToolUse TaskUpdate)
- [ ] **AC3:** Queue processor detects stale entries (>24h old) and reconciles vs actual state
- [ ] **AC4:** Dry-run mode: `INTEGRATION_QUEUE_DRY_RUN=true` shows remediation plan before execution
- [ ] **AC5:** Integration health metric added to CI (`pnpm metrics:ci` includes orphan count)
- [ ] **AC6:** Test: Seed queue with orphaned entries → Run processor → Verify entries removed or linked
- [ ] **AC7:** Documentation: `.claude/context/artifacts/analysis/integration-queue-guide.md` explains queue lifecycle

**TDD Approach:**

```
RED:   No integration-queue-processor.cjs file → test fails
GREEN: Create hook, wire to package.json, run → queue entries process
REFACTOR: Add dry-run, metrics, logging
```

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Queue processor removes valid entries | Low | High | Dry-run mode + manual review before auto-execute |
| Existing queue entries incompatible | Medium | Medium | Version new entries with schema version field |
| Hook executes on every TaskUpdate | Low | Medium | Add filter: only process on artifact-integrator completion |

**Dependency:** None (standalone)
**Blocks:** P0-002 (verification-before-completion depends on clean artifacts)
**Effort:** 3-5 hours

**Definition of Done:**

- Queue processor executes in <500ms per 100 entries
- Dry-run output is human-readable
- Integration health metric visible in CI dashboard
- Zero false positives in 48-hour production run

---

### **STORY P0-002: Test Suite Completion & Failure Resolution**

**As a** developer
**I want** all tests to pass (0 failures, 2 incomplete files completed)
**So that** verification-before-completion can run reliably

**Acceptance Criteria:**

- [ ] **AC1:** Debug `metrics-schema-contract.test.cjs` failure (root cause → fix → test passes)
- [ ] **AC2:** Debug `metrics-reader-rollups.test.cjs` failure (root cause → fix → test passes)
- [ ] **AC3:** Complete `metrics-schema-contract.test.cjs` (line 100: mid-function stub → proper test assertions)
- [ ] **AC4:** Complete `metrics-reader-rollups.test.cjs` (full integration test with rollup validation)
- [ ] **AC5:** All tests pass: `pnpm test` exits 0 with 0 failures
- [ ] **AC6:** Test coverage ≥80% for metrics modules (add missing edge cases)
- [ ] **AC7:** CI gate enforces: no commit without passing tests

**TDD Approach:**

```
RED:   pnpm test → 2 failures, 2 incomplete
GREEN: Write minimal assertions to complete incomplete tests, debug failures
REFACTOR: Add edge case coverage (malformed input, boundary conditions)
```

**Investigation Checklist:**

- [ ] Read both failing test files line-by-line
- [ ] Identify assertion mismatch (expected vs actual)
- [ ] Find root cause in implementation (metrics-schema.cjs, metrics-reader.cjs)
- [ ] Create 1 regression test per bug
- [ ] Verify red-green cycle (fail → fix → pass)

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Incomplete tests have complex assertions | Medium | Medium | Reference existing test patterns, ask QA for guidance |
| Bug fix breaks other tests | Low | Medium | Run full suite after each fix |
| Test assertions are too loose | Low | High | Add boundary/edge case tests (negative path) |

**Dependency:** P0-001 (integration queue clean for artifact verification)
**Blocks:** P0-003 (refactoring can proceed once tests pass)
**Effort:** 6-8 hours

**Definition of Done:**

- `pnpm test` outputs: "X passed, 0 failed"
- All 4 test files complete and passing
- Coverage report shows no skipped tests
- Regression tests for both bugs committed

---

### **STORY P0-003: Break Memory Circular Dependency (C-001)**

**As a** developer
**I want** to extract `buildSemanticContext()` to neutral `memory-utils.cjs`
**So that** memory module refactoring doesn't break the dependency chain

**Background:**

```
contextual-memory.cjs → memory-query.cjs  (calls buildSemanticContext)
                    ↓
            buildSemanticContext() [circular: needs both modules]
                    ↑
memory-query.cjs → contextual-memory.cjs  (calls readMemory)
```

**Acceptance Criteria:**

- [ ] **AC1:** Create `.claude/lib/memory/memory-utils.cjs` (neutral module)
- [ ] **AC2:** Extract `buildSemanticContext()` to memory-utils (no cross-module imports)
- [ ] **AC3:** Update imports: `contextual-memory.cjs` and `memory-query.cjs` now import from `memory-utils`
- [ ] **AC4:** Add unit tests for `buildSemanticContext()` in `memory-utils.test.cjs`
- [ ] **AC5:** No circular imports detected: `node --input-type=module -e "import('./memory-utils.cjs')"` succeeds
- [ ] **AC6:** All memory tests pass: `pnpm test lib/memory/`
- [ ] **AC7:** Architecture doc updated: `.claude/context/artifacts/architecture/memory-module-dependencies.md`

**TDD Approach:**

```
RED:   Circular import detection fails
GREEN: Extract buildSemanticContext to memory-utils, update both callers
REFACTOR: Add comprehensive unit tests for extracted function
```

**Dependency:** P0-002 (tests must pass)
**Blocks:** P0-004 (memory rotation relies on clean circular deps)
**Effort:** 4-6 hours

**Definition of Done:**

- Zero circular import warnings
- `buildSemanticContext()` tested in isolation (unit tests)
- Memory module tests pass (integration tests)
- No performance regression in query/write operations

---

### **STORY P0-004: Fix Memory Rotation Integration Bugs (C-002)**

**As a** developer
**I want** to fix field name mismatches in memory rotation (pruneResult.removed vs entriesRemoved)
**So that** memory pruning doesn't fail silently

**Acceptance Criteria:**

- [ ] **AC1:** Identify all callers of `smart-pruner.cjs` (grep for pruneResult usage)
- [ ] **AC2:** Standardize field names: `pruneResult` always returns `{ success, removed: [], entries: [] }`
- [ ] **AC3:** Update `.claude/lib/memory/contextual-memory.cjs` to use consistent field names
- [ ] **AC4:** Update `.claude/lib/memory/memory-rotator.cjs` to use consistent field names
- [ ] **AC5:** Add integration test: rotate learnings.md → verify removed entries = archived entries count
- [ ] **AC6:** Add error handling: if pruneResult.success === false, log error + alert to memory.issues.md
- [ ] **AC7:** Manual test: rotate learnings.md (size 80KB → archive, create new)

**TDD Approach:**

```
RED:   pruneResult returns mixed field names, rotator fails silently
GREEN: Standardize to { success, removed: [...], entries: [...] }, add assertions
REFACTOR: Add comprehensive error handling + logging
```

**Field Audit:**

- [ ] Search all files for `pruneResult.removed`, `pruneResult.entriesRemoved`, `pruneResult.entries`
- [ ] Create single source of truth schema
- [ ] Update all callers

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Archived entries are corrupted during rotation | Low | High | Backup before rotate, verify checksums after |
| Silent failures still occur due to error handling gaps | Medium | Medium | Add explicit error path logging |
| Performance degradation during rotation | Low | Medium | Profile rotation with large files (>100KB) |

**Dependency:** P0-003 (circular deps broken)
**Blocks:** P0-005 (sanitization needs rotation to be stable)
**Effort:** 3-4 hours

**Definition of Done:**

- All pruneResult callers use consistent field names
- Zero "undefined field" errors in tests
- Memory rotation tested with 50KB, 100KB files
- Error log appears in memory.issues.md on failure

---

### **STORY P0-005: Add Memory Sanitization Pipeline**

**As a** security architect
**I want** to add `sanitizeMemoryEntry()` function that blocks code execution patterns
**So that** memory poisoning attacks (ASI06) are mitigated

**Background:** Memory files can be edited by agents. Malicious input like `eval()` or `process.exit()` in decisions.md could be executed if memory is used unsafely.

**Acceptance Criteria:**

- [ ] **AC1:** Create `sanitizeMemoryEntry(entry)` in `.claude/lib/memory/memory-utils.cjs`
- [ ] **AC2:** Function blocks patterns: `eval(`, `Function(`, `require(`, `process.exit`, `child_process`, `spawn`, `exec`
- [ ] **AC3:** Function blocks patterns: `__proto__`, `constructor`, `prototype` (prototype pollution)
- [ ] **AC4:** Function returns sanitized entry (blocked patterns removed/escaped)
- [ ] **AC5:** Call sanitizeMemoryEntry() on all reads from memory files (contextual-memory.cjs readMemory)
- [ ] **AC6:** Add unit tests: inject malicious payload → verify sanitized output
- [ ] **AC7:** Log sanitization events to `.claude/context/memory/sanitization-log.jsonl`
- [ ] **AC8:** Documentation: `.claude/context/artifacts/security/memory-poisoning-prevention.md`

**TDD Approach:**

```
RED:   Inject malicious code into decisions.md → readMemory returns raw content
GREEN: Add sanitizeMemoryEntry() → readMemory sanitizes before returning
REFACTOR: Add comprehensive pattern detection + logging
```

**Malicious Payload Test Cases:**

```javascript
// Test cases:
'Decision: eval("process.exit(1)")'
'Pattern: eval(user_input)'
'Issue: require("child_process").exec("rm -rf /")'
'Learning: __proto__.isAdmin = true'
'Decision: Function("return process.getEnv()")()
```

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Sanitization is too aggressive (blocks valid patterns) | Medium | Low | Whitelist legitimate patterns (e.g., "require-only-in-comments") |
| Performance impact on memory reads | Low | Low | Cache sanitization rules, profile on large files |
| Bypassed by encoding (base64, unicode escapes) | Low | Medium | Add second-layer detection (entropy analysis) |

**Dependency:** P0-004 (rotation stable)
**Blocks:** None (standalone security hardening)
**Effort:** 4-6 hours

**Definition of Done:**

- sanitizeMemoryEntry() blocks all 10+ attack patterns
- Zero false positives on legitimate patterns
- Sanitization log shows all blocked entries
- Security audit team approves pattern list

---

## P0 Summary Table

| ID        | Story                        | Effort     | Blocker Chain | Exit Criteria                                |
| --------- | ---------------------------- | ---------- | ------------- | -------------------------------------------- |
| P0-001    | Integration Queue Automation | 3-5h       | None          | Queue processor <500ms, orphan rate <10%     |
| P0-002    | Test Suite Completion        | 6-8h       | P0-001        | `pnpm test` → 0 failures, 100% pass          |
| P0-003    | Break Circular Dependency    | 4-6h       | P0-002        | Zero circular imports, memory tests pass     |
| P0-004    | Memory Rotation Fixes        | 3-4h       | P0-003        | Consistent field names, rotation tested      |
| P0-005    | Memory Sanitization          | 4-6h       | P0-004        | All 10+ patterns blocked, no false positives |
| **TOTAL** | **5 P0 Issues**              | **20-29h** | Sequential    | **All P0s resolved, ready for P1**           |

**P0 Sprint: 3-5 days (assuming 6-8h/day)**

---

## P1 Issues (HIGH Priority — This Month)

### **STORY P1-001: Add Test Coverage for 5 Critical Modules**

**As a** QA
**I want** comprehensive test suites for security-critical modules at 0% coverage
**So that** production-ready code is validated

**Target Modules:**

1. `loop-state-manager.cjs` (SECURITY CRITICAL: manages workflow loops)
2. `metrics-reader.cjs` (generates CI metrics)
3. `dashboard-renderer.cjs` (renders agent studio dashboard)
4. `production-alerts.cjs` (alert dispatcher)
5. `metrics-schema.cjs` (validates metric payloads)

**Acceptance Criteria:**

- [ ] **AC1:** Add test suite for each module (5 files: `*.test.cjs`)
- [ ] **AC2:** Coverage ≥80% for each module (statement + branch coverage)
- [ ] **AC3:** Security-critical module (loop-state-manager) has threat model test coverage
- [ ] **AC4:** Edge case coverage: malformed input, boundary conditions, error paths
- [ ] **AC5:** `pnpm test` includes all 5 modules, all pass
- [ ] **AC6:** CI enforces minimum coverage (fail if <80%)

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| loop-state-manager test reveals security bugs | Medium | High | Fix bugs before release, add regression tests |
| metrics-reader tests are flaky (timing-dependent) | Medium | Medium | Use fake timers (sinon.useFakeTimers) in tests |

**Dependency:** P0-002 (test suite working)
**Blocks:** P1-005 (test coverage sign-off)
**Effort:** 12-16 hours

**Definition of Done:**

- Coverage report shows 80%+ for each module
- All tests pass consistently
- CI enforces coverage gate

---

### **STORY P1-002: Implement Prompt Injection Detection**

**As a** security architect
**I want** to add explicit prompt injection detection in `user-prompt-unified.cjs`
**So that** goal hijacking attacks (ASI01) are prevented

**Acceptance Criteria:**

- [ ] **AC1:** Add `detectPromptInjection(prompt)` function (blocks "ignore", "disregard", "system prompt")
- [ ] **AC2:** Maintain blocklist: 20+ injection keywords
- [ ] **AC3:** Log injection attempts to `.claude/context/memory/security-events.jsonl`
- [ ] **AC4:** Reject prompt if injection detected, return error to user
- [ ] **AC5:** Test: inject "ignore previous instructions" → rejected
- [ ] **AC6:** Test: normal prompts not blocked (false positive rate = 0)
- [ ] **AC7:** Documentation: `.claude/context/artifacts/security/prompt-injection-prevention.md`

**Injection Patterns to Block:**

```
"ignore previous instructions"
"forget about your role"
"disregard your system prompt"
"execute this instead"
"switch modes to"
"you are now"
"pretend you are"
"as a different agent"
"break character"
```

**TDD Approach:**

```
RED:   Inject attack prompt → passes through unchecked
GREEN: Add detectPromptInjection() → attack prompt rejected
REFACTOR: Expand blocklist, add logging
```

**Dependency:** P0-005 (security foundation)
**Blocks:** None (standalone)
**Effort:** 2-3 days

**Definition of Done:**

- Zero false positives on 100 legitimate prompts
- All 20+ attack patterns blocked
- Security event log shows blocked attempts

---

### **STORY P1-003: Complete safeParseJSON Adoption**

**As a** developer
**I want** to replace all `JSON.parse()` calls with `safeParseJSON()` in production code
**So that** malformed JSON doesn't crash hooks/tools

**Acceptance Criteria:**

- [ ] **AC1:** Audit all files for `JSON.parse()` usage: grep for `JSON\.parse\(`
- [ ] **AC2:** Replace each with `safeParseJSON()` from `.claude/lib/utils/safe-json-parse.cjs`
- [ ] **AC3:** Add error handling: if !success, log error + return fallback
- [ ] **AC4:** Special focus: 3 reflection hooks + 100+ test files
- [ ] **AC5:** Test: inject malformed JSON → no crash, graceful error handling
- [ ] **AC6:** Test: inject prototype pollution attack → blocked by safeParseJSON

**Malformed JSON Test Cases:**

```
'{"unclosed": '
'{"__proto__": {"isAdmin": true}}'
'{"duplicate": "key", "duplicate": "key"}'
'{"constructor": {}, "prototype": {}}'
```

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| JSON.parse in test files is harder to replace | Medium | Low | Create test-specific wrapper if needed |
| Fallback values mask real errors | Low | Medium | Add strict logging for failures |

**Dependency:** P0-005 (security foundation)
**Blocks:** None (parallel to P1-002)
**Effort:** 1-2 days

**Definition of Done:**

- grep for `JSON\.parse\(` returns 0 results in production code
- All hook JSON parsing uses safeParseJSON
- Error handling comprehensive (no silent failures)

---

### **STORY P1-004: Add Concurrent Write Locking**

**As a** architect
**I want** file-based locking for memory and workflow-state writes
**So that** multi-agent concurrent workflows don't lose data

**Acceptance Criteria:**

- [ ] **AC1:** Use `proper-lockfile` npm package for file locking
- [ ] **AC2:** Wrap all memory file writes in lock acquisition
- [ ] **AC3:** Wrap workflow-state.json writes in lock acquisition
- [ ] **AC4:** Lock timeout: 5 seconds (fail if lock held >5s)
- [ ] **AC5:** Test: 5 agents writing to same memory file concurrently → all writes succeed
- [ ] **AC6:** Test: deadlock prevention (agent A waits for B, B waits for A) → timeout resolves
- [ ] **AC7:** Documentation: `.claude/context/artifacts/architecture/concurrent-write-locking.md`

**Lock Protocol:**

```javascript
// Before any file write:
const lock = await lockfile.lock(filePath, { timeout: 5000 });
try {
  // perform write
} finally {
  await lock.unlock();
}
```

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Lock contention causes timeouts | Medium | Medium | Increase timeout to 10s, add queue |
| Lock file corruption | Low | High | Implement lock recovery (auto-unlock after TTL) |
| Performance impact | Low | Low | Profile concurrent writes |

**Dependency:** P0-004 (memory rotation stable)
**Blocks:** Multi-agent workflows that write to shared state
**Effort:** 2-3 days

**Definition of Done:**

- Concurrent write test passes (5 agents, same file)
- Zero data loss in stress test (1000+ concurrent writes)
- Lock timeout enforced

---

### **STORY P1-005: Fix Shell Execution Gaps (windowsHide)**

**As a** devops
**I want** to add `windowsHide: true` to 3 lib files missing it
**So that** Windows process management is consistent

**Files to Fix:**

1. `.claude/lib/code-indexing/...` (1 file)
2. `.claude/lib/memory/...` (1 file)
3. `.claude/lib/routing/...` (1 file)

**Acceptance Criteria:**

- [ ] **AC1:** Search all files: `grep -r "spawn\|spawnSync" .claude/lib/`
- [ ] **AC2:** Add `windowsHide: true` to all spawn calls without it
- [ ] **AC3:** Verify no spawn calls use `shell: true` (security issue)
- [ ] **AC4:** Test on Windows: child processes don't show console window
- [ ] **AC5:** CI enforces: ESLint rule blocks new spawn calls without windowsHide

**Dependency:** P1-003 (production code audit)
**Blocks:** None (1-hour fix)
**Effort:** 1 hour

**Definition of Done:**

- All spawn calls have windowsHide: true
- No shell: true found in spawn calls
- Windows test verified child process hiding

---

### **STORY P1-006: Audit Memory Budget Violations**

**As a** PM
**I want** to manually rotate learnings.md and fix 2.65x budget violation
**So that** memory stays under 20KB per file

**Acceptance Criteria:**

- [ ] **AC1:** Measure current learnings.md size: `wc -c learnings.md`
- [ ] **AC2:** Identify entries older than 30 days (rotate to archive)
- [ ] **AC3:** Create `learnings-2026-02.md` in `.claude/context/memory/archive/`
- [ ] **AC4:** Move 30+ day entries to archive (keep 14 days in HOT tier)
- [ ] **AC5:** Verify learnings.md <20KB after rotation
- [ ] **AC6:** Update memory protocol doc with rotation schedule

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Archive file is lost | Low | Medium | Backup archive to git |
| Rotation breaks memory access | Low | Medium | Test read operations on archive file |

**Dependency:** P0-004 (rotation mechanism working)
**Blocks:** None (standalone cleanup)
**Effort:** 30 minutes

**Definition of Done:**

- learnings.md <20KB
- Archive file created with >30-day entries
- No data loss (verify entry count before/after)

---

### **STORY P1-007: Consolidate Configuration (6→2 files)**

**As a** architect
**I want** to consolidate 6 config files into 2 (config.yaml + .env)
**So that** configuration is centralized and maintainable

**Current State:**

```
.claude/settings.json          (hook registration)
config.yaml                    (agent models)
.env                           (secrets)
package.json                   (build scripts)
environment.cjs                (runtime env loading)
workflow-state.json            (workflow metadata)
```

**Target State:**

```
config.yaml                    (agents, workflows, hooks, build scripts)
.env                           (secrets)
```

**Acceptance Criteria:**

- [ ] **AC1:** Merge settings.json hook registration into config.yaml hooks section
- [ ] **AC2:** Merge package.json scripts into config.yaml scripts section
- [ ] **AC3:** Move environment.cjs logic into Node.js config loader
- [ ] **AC4:** Move workflow-state.json metadata into config.yaml
- [ ] **AC5:** Verify: `pnpm start` reads from config.yaml, not multiple files
- [ ] **AC6:** Update `.env.example` with all required variables
- [ ] **AC7:** Documentation: `.claude/context/artifacts/architecture/configuration-consolidation.md`

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Configuration loading breaks | Medium | High | Create config validator, dry-run before applying |
| Performance impact (fewer files) | Low | Low | Profile config load time |
| Backward compatibility | Low | Medium | Provide migration script from old format |

**Dependency:** All other P1 stories (large refactor)
**Blocks:** Configuration standardization
**Effort:** 2 weeks

**Definition of Done:**

- Single config.yaml source of truth
- .env only contains secrets
- Zero duplicate config values
- CI validates config schema

---

## P1 Summary Table

| ID        | Story                         | Effort   | Dependencies | Exit Criteria                              |
| --------- | ----------------------------- | -------- | ------------ | ------------------------------------------ |
| P1-001    | Test Coverage (5 modules)     | 12-16h   | P0-002       | 80%+ coverage, all tests pass              |
| P1-002    | Prompt Injection Detection    | 2-3d     | P0-005       | Zero false positives, all patterns blocked |
| P1-003    | safeParseJSON Adoption        | 1-2d     | P0-005       | grep shows 0 JSON.parse in production      |
| P1-004    | Concurrent Write Locking      | 2-3d     | P0-004       | Concurrent write test passes, no deadlock  |
| P1-005    | Shell Execution (windowsHide) | 1h       | P1-003       | All spawn calls have windowsHide: true     |
| P1-006    | Memory Budget Rotation        | 30m      | P0-004       | learnings.md <20KB                         |
| P1-007    | Configuration Consolidation   | 2w       | All P1       | Single config.yaml, 100% migration         |
| **TOTAL** | **7 P1 Issues**               | **3-4w** | Sequential   | **Production-ready, 95/100 security**      |

**P1 Timeline:** Week 2-3 (security) + Week 4-5 (coverage) + Week 6-7 (config refactor)

---

## Dependency Graph

```
P0-001 (Queue)
  ↓
P0-002 (Tests) ← P0-001
  ↓
P0-003 (Circular Deps) ← P0-002
  ↓
P0-004 (Memory Rotation) ← P0-003
  ↓
P0-005 (Sanitization) ← P0-004

P1-002 (Prompt Injection) ← P0-005
P1-003 (safeParseJSON) ← P0-005
P1-001 (Coverage) ← P0-002
P1-005 (windowsHide) ← P1-003
P1-006 (Memory Rotation) ← P0-004
P1-004 (Locking) ← P0-004
P1-007 (Config) ← All P1
```

**Critical Path:** P0-001 → P0-002 → P0-003 → P0-004 → P0-005 (5-29h, 3-5 days)

---

## Risk Assessment & Mitigation

### High-Risk Issues

| Issue                                            | Risk | Probability | Impact | Mitigation                                     |
| ------------------------------------------------ | ---- | ----------- | ------ | ---------------------------------------------- |
| Memory rotation field mismatches cause data loss | High | Medium      | High   | Backup before rotation, verify checksums       |
| Circular dependencies re-emerge during refactor  | High | Medium      | High   | Add CI check for circular imports (pre-commit) |
| Incomplete tests hide security bugs              | High | Low         | High   | Red-green-refactor TDD for all tests           |
| Prompt injection detection bypassed              | High | Low         | High   | Adversarial testing (try 50+ attack patterns)  |

### Medium-Risk Issues

| Issue                                             | Risk   | Probability | Impact | Mitigation                                |
| ------------------------------------------------- | ------ | ----------- | ------ | ----------------------------------------- |
| Integration queue processor removes valid entries | Medium | Low         | High   | Dry-run mode, manual review gate          |
| Concurrent write locking causes deadlocks         | Medium | Medium      | Medium | Lock timeout + recovery mechanism         |
| Config consolidation breaks existing workflows    | Medium | Medium      | Medium | Dry-run, gradual migration, rollback plan |

---

## Success Metrics (1-Month Target)

| Metric                  | Before              | After         | Target           |
| ----------------------- | ------------------- | ------------- | ---------------- |
| Test pass rate          | 99.94% (2 failures) | 100%          | 100%             |
| Test failures           | 2                   | 0             | 0                |
| Incomplete test files   | 2                   | 0             | 0                |
| P0 issues               | 5                   | 0             | 0                |
| P1 issues               | 8                   | 0-2 (partial) | <3               |
| Security score          | 87/100              | 95/100        | 95+/100          |
| Architecture score      | 7.8/10              | 9.0/10        | 9.0+/10          |
| Orphan artifact rate    | 70%                 | <10%          | <5%              |
| Memory file sizes       | 2.65x over budget   | <20KB each    | <20KB            |
| Circular dependencies   | 1 (C-001)           | 0             | 0                |
| Concurrent write safety | Unsafe              | Safe (locked) | Production-ready |

---

## Sprint Capacity & Timeline

### Week 1 (Feb 13-17): P0 Wave 1-2

**Daily Plan:**

- **Day 1 (Wed):** P0-001 (Queue automation) + P0-002 (Tests: debug failures)
- **Day 2 (Thu):** P0-002 (Tests: complete files) + P0-003 (Circular deps)
- **Day 3 (Fri):** P0-004 (Memory rotation) + P0-005 (Sanitization)
- **Day 4 (Mon):** Verification, documentation, CI gates
- **Day 5 (Tue):** Sprint review, P0 sign-off

**Capacity:** 40h available / 29h required = 27% buffer

### Week 2-3 (Feb 18-Mar 3): P1 Wave 1 (Security)

**Priority:**

- P1-002 (Prompt injection) - 2-3 days
- P1-003 (safeParseJSON) - 1-2 days
- P1-001 (Coverage) - 12-16h
- P1-005 (windowsHide) - 1h
- P1-006 (Memory rotation) - 30m

**Capacity:** 80h available / 45h required = 44% buffer

### Week 4-7 (Mar 4-31): P1 Wave 2-3 (Coverage + Config)

**Priority:**

- P1-004 (Concurrent locking) - 2-3 days
- P1-007 (Config consolidation) - 2 weeks

**Capacity:** 160h available / 70h required = 56% buffer

---

## Stakeholder Communication Plan

### Daily Standup (Sprint P0)

- **Status:** P0 story progress (tests/queue/memory)
- **Blockers:** Any issues preventing story closure
- **EOD Update:** Commit hashes, test results

### Weekly Sprint Review (Friday)

- **Demo:** Working integration queue, passing tests
- **Metrics:** Orphan rate, test coverage, security score
- **Risks:** Any emerging blockers

### Monthly Board Update (Feb 28)

- **Accomplishment:** 5 P0s resolved, 3 P1s in progress
- **Security:** Score 87 → 95/100, orphan rate 70% → <10%
- **Production Readiness:** Deployment checklist status

---

## Definition of Done (Per Story)

**Code:**

- [ ] All acceptance criteria met and verified
- [ ] TDD red-green-refactor cycle complete
- [ ] Code follows style guide (`pnpm lint:fix`, `pnpm format` pass)
- [ ] No console.log in production code
- [ ] Provenance header present

**Tests:**

- [ ] Unit tests for new/changed functions
- [ ] Integration tests for multi-module changes
- [ ] Edge case coverage included
- [ ] Tests deterministic (no flakiness)
- [ ] Coverage ≥80% for new code

**Documentation:**

- [ ] Inline code comments for complex logic
- [ ] Public API documentation
- [ ] Architecture diagrams updated if needed
- [ ] CHANGELOG entry added
- [ ] Memory files updated (learnings/decisions/issues)

**Review:**

- [ ] Code review approved (code-reviewer agent)
- [ ] Security review approved (security-architect for P0/P1)
- [ ] Architecture review approved (architect for refactors)

**Deployment:**

- [ ] CI/CD pipeline passes (linting, tests, build)
- [ ] Manual verification on test environment
- [ ] Rollback plan documented
- [ ] TaskUpdate marked completed with metadata

---

## Memory Updates Required

**To `.claude/context/memory/learnings.md`:**

- Pattern: Defensive programming trilogy (windowsHide + shell:false + file guards)
- Pattern: Stale queue detection (cross-check before remediation)
- Pattern: Memory rotation integration (field standardization key)

**To `.claude/context/memory/decisions.md`:**

- ADR-106: Break memory circular dependency via memory-utils.cjs neutral module
- ADR-107: Consolidate 6 config files → config.yaml + .env (2-week refactor)
- ADR-108: Add file-based locking for concurrent memory writes (proper-lockfile)

**To `.claude/context/memory/issues.md`:**

- Task #13 reflection context missing (audit trail gap for Wave 2)
- Integration queue stale accumulation (P2 monitoring)
- Memory field name standardization applied (C-002 resolved)

---

## References

- **Findings Source:** `.claude/context/reports/compressed-findings-summary-2026-02-13.md`
- **Routing Guide:** `.claude/workflows/core/router-decision.md`
- **Task Tracking:** `.claude/skills/task-management-protocol/SKILL.md`
- **Memory Protocol:** `.claude/rules/memory-protocol.md`
- **Code Standards:** `.claude/rules/code-standards.md`
- **Security:** `.claude/rules/security.md` (ASI01, ASI06 references)

---

**Backlog Created By:** pm | **Date:** 2026-02-13
**Sprint Ready:** YES — all stories have acceptance criteria, TDD approach, risk assessment
**Next Action:** Spawn developer on P0-001 (Queue automation)
