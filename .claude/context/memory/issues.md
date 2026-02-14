<!-- Last Cleaned: 2026-02-13 - Ruthless trimming to 84% reduction -->

## 2026-02-13: Oversized Modules Require Refactoring (P0)

**Issue**: 6 modules exceed 50KB with 2 exceeding 100KB.

**Evidence**: skill-creator/create.cjs (107KB, 3,677 lines), routing-guard.cjs (79KB, 2,700+ lines), user-prompt-unified.cjs (68KB), spawn-prompt-assembler.cjs (58KB), memory-manager.cjs (57KB), pre-tool-unified.cjs (46KB)

**Solution**: Refactor into smaller modules. skill-creator → 7 modules, routing-guard → 6 modules. Effort: 26-32 hours total.

**Priority**: P0

---

## 2026-02-13: Console Usage Sprawl (646 Instances) (P1)

**Issue**: 646 instances of direct console.log/error bypass structured logging.

**Solution**: Batch refactor script to replace in hooks/lib only. Enable ESLint no-console rule. Effort: 6-8 hours.

**Priority**: P1

---

## 2026-02-13: Memory Sanitization Incomplete (HIGH-004) (P1)

**Issue**: Only 1 of 5 memory write paths has sanitization. 4 other paths bypass: archiveLearnings(), writeMemoryArray(), updateCodebaseMap(), direct file writes.

**Solution**: Create memory-sanitizer.cjs utility, add to all 5 write paths, add pre-write hook.

**Priority**: P1

---

## 2026-02-14: Reflection Queue Context Missing (P1) — RECURRING

**Issue**: Reflection queue entries lack summary metadata. Task #13, Tasks 1-2 confirmed missing context.

**Impact**: Incomplete learnings extraction, broken audit trail.

**Solution**: Investigate post-completion-chain.cjs, add validation check, enforce summary field on TaskUpdate completion.

**Priority**: P1 (ELEVATED DUE TO RECURRENCE)

---

## 2026-02-13: Stale Integration Queue Entries Accumulate (P2)

**Issue**: Integration queue contains stale entries from previous sessions.

**Solution**: Add hygiene step to artifact-integrator skill (Step 0: Validate Queue), mark stale entries, periodic cleanup.

**Priority**: P2

---

## 2026-02-13: Integration Health Scoring Not Calculated (P2)

**Issue**: artifact-integrator processes queue but doesn't invoke quickIntegrationCheck().

**Solution**: Update skill to invoke quickIntegrationCheck(), include score in reports, add to RBT diagnosis.

**Priority**: P2

---

## 2026-02-13: Missing Automated windowsHide Enforcement (P1)

**Issue**: Manual pattern application across 18 files. Future spawn calls may forget windowsHide.

**Solution**: Add ESLint rule requiring windowsHide: true OR create safeSpawn() wrapper.

**Priority**: P1

---

## 2026-02-13: Hook Crash Telemetry Missing (P1)

**Issue**: File existence guards don't log which files were expected.

**Solution**: Add structured logging via event bus when optional files missing.

**Priority**: P1

---

## 2026-02-10: Integration Health Gaps in Task #22 (P2)

**Issue**: 3 CLI tools wired to package.json but not integrated per ADR-100. Missing artifact-graph.json entries, tool-catalog.md updates, Router keywords.

**Solution**: Queue artifact-integrator task. Integration Health Score: 65%.

**Priority**: P2

---

## 2026-02-10: EPIC Plan Execution Context Risk - Task #25 (P1)

**Issue**: 34 agent spawns across 7 phases. Sequential execution with heavy agents without wave-limiting could trigger context overflow.

**Prevention**: Execute phases sequentially, use wave-based spawning (max 2 concurrent), agents write to reports/

**Priority**: P1

---

## 2026-02-09: Active Stub Modules (P3)

**Issue**: 4 stub modules exist for archived functionality.

**Stub Inventory**: ml/index.cjs, model-client.cjs, git-notes-audit.cjs. Consumers handle disabled features gracefully.

**Priority**: P3 (technical debt)

---

## 2026-02-09: Schema Security Audit -- 11 Schemas Missing additionalProperties: false (P1)

**Issue**: 11 schemas missing property injection protection. 47 unbounded strings, 38 unbounded arrays.

**Priority**: P1

---

## 2026-02-08: 277 Pre-Existing Test Failures (P2)

**Issue**: 14.5% failure rate. Categories: Module Not Found (28), Assertion Failures (164), Hook Errors (45), Timeouts (32).

**Resolution Path**: Categorize by root cause, fix top 20 failures (quick wins).

**Priority**: P2

---

## 2026-02-08: .env.example Missing Enforcement Variables (P1)

**Issue**: New enforcement variables (TASKLIST_FIRST_ENFORCEMENT, STATE_STALE_THRESHOLD_MS) not documented in .env.example.

**Priority**: P1

---

## 2026-02-08: SEC-ROUTER-003 Audit Logging Incomplete (P1)

**Issue**: 3 env var kill switches plus HOOK_FAIL_OPEN lack auditSecurityOverride() logging.

**Priority**: P1

---

## 2026-02-13: VUL-INTEG-001 -- CRITICAL Sanitizer Integration Bug (P0) — RESOLVED ✅

**Issue**: sanitizeMemoryContent() returns {safe, sanitized, detections} but memory-manager.cjs line 415 assigns whole object. Result: [object Object] written to file.

**Resolution**: Fixed in codebase with FIX VUL-INTEG-001 comments at lines 414-435. Now correctly uses `result.sanitized` property instead of whole object, with proper safety checks.

**Status**: RESOLVED

---

## 2026-02-13: VUL-BYPASS-001 -- Code Block Exemption Bypass (P1)

**Issue**: Triple-backtick code blocks fully exempt from scanning. Wrapping malicious payload in backticks bypasses all detection.

**Priority**: P1

---

## 2026-02-13: VUL-BYPASS-003 -- Only 1 of 5+ Memory Write Paths Sanitized (P1)

**Issue**: Sanitizer only protects writeMemory(). Four other paths bypass sanitization.

**Priority**: P1

---

## 2026-02-11: Test Failures in Comprehensive Suites (P2)

**Issue**: 3 test failures in new comprehensive test suites. 98/101 tests pass (97%).

**Details**: routing-guard-comprehensive (2 failures), unified-creator-guard-comprehensive (1 failure).

**Priority**: P2 (non-blocking)

---

## 2026-02-11: Memory Sanitizer Not Yet Implemented (P1)

**Issue**: HIGH-004 (Memory poisoning) identified in security audit but deferred from Wave 2b.

**Priority**: P1

---

## 2026-02-09: Remaining Ecosystem Gaps (61 gaps)

**Distribution**: 0 CRITICAL, 13 HIGH, 48 MEDIUM.

**Key Patterns**: Extended Thinking (13 agents), ROUTING_TABLE Gaps (10 agents), Skill Assignments (several), Model Mismatches (8 agents).

**Priority Actions**: Enable extended_thinking for 7 analysis agents, add ROUTING_TABLE entries for pm/reflection-agent, quarterly audit cadence.

---

## 2026-02-11: CRITICAL SECURITY FINDINGS - Wave 2 Hooks (11 vulnerabilities)

**Report**: `.claude/context/reports/security/security-audit-wave2-2026-02-11.md`

**P0 (Fix Immediately)**:

- VUL-TAM-001: Loop-State TOCTOU Race Condition (2h)
- VUL-DOS-001: Whitespace Bomb DoS (1h)
- VUL-ELEV-001: Router Mode Bypass via Env Override (1h)

**P1 (Fix This Week)**:

- VUL-TAM-002: Unicode Normalization Bypass
- VUL-DOS-002: Regex Backtracking Loop
- VUL-ELEV-002: Creator Intent Guard Bypass
- ASI01-SPOOF-001: Session ID Environment Override

---

## 2026-02-13: RESOLVED - Security Fixes (Commits 1-4)

✅ CRITICAL-002 (shell injection): shell: false adopted
✅ CRITICAL-001 (JSON.parse safety): safeParseJSON adopted
✅ HIGH-002 (DB race): File-based locking added
✅ P0 (nul file): Windows reserved filename deleted

---

## 2026-02-13: Bash Command Allowlist Lacks Categorization (P2)

**Issue**: SAFE_COMMANDS_ALLOWLIST in registry.cjs has 80+ commands in flat list.

**Solution**: Refactor into categorized sections (shell builtins, read-only fs, dev tools, build tools, archive tools).

**Priority**: P2
