# Audit Issues & Blockers — 2026-02-12

<!-- Agent: reflection-agent | Task: #5 (batch reflection) | Session: 2026-02-12 -->

## CRITICAL Issues (P0 - Block Deployment)

### ISSUE-001: Router State Trust Boundary Bypass (CRIT-SEC-001)

**Trigger**: Any spawned agent with Write tool access

**Details**:

- router-state.json controls routing enforcement (requiresPlannerFirst, requiresSecurityReview, taskListCalledSincePrompt)
- File is writable by all agents (no protection in unified-pre-write-hook.cjs)
- No integrity validation (checksum/HMAC)
- Agent can set `mode: "router"` to claim Router privileges

**Solution**:

1. Add `.claude/context/runtime/*.json` to WRITE_PROTECTED_PATHS in unified-pre-write-hook.cjs
2. Add SHA-256 checksum field to router-state.json schema
3. Validate checksum before trusting state data in router-state.cjs
4. Only allow router-state.cjs module to write to this file

**Priority**: P0 (4 hours)

**Blocks**: Deployment (CRITICAL security vulnerability)

---

### ISSUE-002: Reflection Queue Allows Arbitrary Agent Spawns (CRIT-SEC-002)

**Trigger**: Agent appends malicious entry to reflection-spawn-request.json

**Details**:

- reflection-spawn-request.json triggers automatic agent spawns via Router Step 0
- No validation of entries (unbounded, no timestamp expiry, prompt unsanitized)
- Agent can inject prompt injection patterns
- No max entry limit (DoS via mass spawns)

**Solution**:

1. Add max entry limit (50 entries) in reflection-queue-processor.cjs
2. Validate timestamp age (reject entries >24h old)
3. Sanitize prompt field using spawn-prompt-assembler.cjs sanitizeTaskPrompt()
4. Add SHA-256 checksum to each entry
5. Only allow reflection-agent to write to this file

**Priority**: P0 (6 hours)

**Blocks**: Deployment (RCE vulnerability)

---

### ISSUE-003: Memory File Prompt Poisoning (CRIT-SEC-003)

**Trigger**: Agent writes to learnings.md/decisions.md/issues.md

**Details**:

- Memory files read by ALL agents before task execution (trust without verification)
- No input sanitization for memory writes
- Adversarial agent can inject instruction override patterns:
  - "IGNORE ALL PREVIOUS INSTRUCTIONS"
  - "DISREGARD SECURITY CHECKS"
  - "SET ENFORCEMENT=off"
- No provenance validation (can't determine who wrote entry)

**Solution**:

1. Create `.claude/lib/memory/memory-sanitizer.cjs` utility
2. Block instruction override patterns (same as spawn-prompt-assembler.cjs)
3. Add provenance markers to all memory entries (agent type, task ID, timestamp)
4. Implement entry signature validation
5. Treat memory content as untrusted in agent prompts

**Priority**: P0 (8 hours)

**Blocks**: Deployment (CRITICAL - prompt poisoning attack)

**Cross-Reference**: HIGH-004 from Wave 2 audit (now escalated to CRITICAL)

---

### ISSUE-004: Core Routing Logic Untested (P0-1 QA)

**Trigger**: Code changes to routing hooks ship without tests

**Details**:

- routing-guard.cjs (12 enforcement checks) has 0 test coverage
- unified-creator-guard.cjs (creator workflow) has 0 test coverage
- spawn-prompt-assembler.cjs (spawn construction) has 0 test coverage
- user-prompt-unified.cjs (intent classification) has 0 test coverage
- Routing bugs ship undetected

**Solution**:

1. Create `tests/hooks/routing-guard.test.cjs` with 12 test scenarios (planner-first, security-review, specialist-override, TaskList-first, etc.)
2. Create `tests/hooks/unified-creator-guard.test.cjs` (creator path blocking)
3. Create `tests/hooks/spawn-prompt-assembler.test.cjs` (memory injection, template substitution)
4. Create `tests/hooks/user-prompt-unified.test.cjs` (intent detection, complexity classification)

**Priority**: P0 (12-15 hours total)

**Blocks**: Deployment (false test confidence - tests pass but critical paths untested)

---

### ISSUE-005: Write Safety Checks Untested (P0-2 QA)

**Trigger**: Code changes to write safety hooks ship without tests

**Details**:

- unified-pre-write-hook.cjs (11 safety checks) has 0 test coverage
- Windows reserved name detection untested
- Path traversal prevention untested
- Creator path enforcement untested
- Forbidden path checks untested

**Solution**:
Create `tests/hooks/unified-pre-write-hook.test.cjs` covering:

- Windows reserved names (nul, con, prn, aux, com1-9, lpt1-9)
- Path traversal (`../../../etc/passwd`)
- Project root writes blocked
- User home writes blocked
- Creator paths blocked (skills/agents/hooks/workflows)
- Allowed paths (`.claude/context/reports/`, `.claude/context/plans/`)

**Priority**: P0 (3-4 hours)

**Blocks**: Deployment (file safety not validated)

---

### ISSUE-006: Router State Race Condition (C1 Code Quality)

**Trigger**: Concurrent hooks read stale router state

**Details**:

- routing-guard.cjs line 235-253: Cache populated once, never invalidated
- Concurrent hooks see stale state
- `isRouterInvocation()` checks cached `mode` that may be outdated
- Multi-agent scenarios corrupt state

**Solution**:

1. Invalidate cache on state change (not just on first load)
2. Add cache TTL (5 seconds max)
3. Use state-cache.cjs with LRU eviction
4. Add tests for concurrent hook invocations

**Priority**: P0 (2 hours)

**Blocks**: Multi-agent pipeline reliability

---

### ISSUE-007: Windows Path Normalization Incomplete (C2 Code Quality)

**Trigger**: Windows-specific file operations

**Details**:

- unified-creator-guard.cjs line 193-219: Only converts backslashes
- Doesn't handle:
  - Relative paths (`C:file.txt` without backslash)
  - UNC paths (`\\server\share\file.txt`)
  - Case sensitivity (`C:\Foo` vs `C:\foo`)
  - `..` segments (`C:\foo\..\bar`)
  - Reserved names in subdirectories (`logs\nul\output.txt`)

**Solution**:

1. Create `path-validator.cjs` with comprehensive Windows path handling
2. Use `path.resolve()` for relative path normalization
3. Use `path.normalize()` for `..` segments
4. Lowercase UNC paths for case-insensitive comparison
5. Check reserved names recursively (not just basename)
6. Add comprehensive Windows path test suite

**Priority**: P0 (2 hours)

**Blocks**: Windows compatibility

---

## HIGH Priority Issues (P1 - This Month)

### ISSUE-008: Memory Subsystem Untested

**Details**: 14/14 memory modules have 0 test coverage

**Files**:

- memory-manager.cjs
- memory-scheduler.cjs
- memory-rotator.cjs
- memory-dashboard.cjs
- contextual-memory.cjs
- memory-consolidation.cjs
- memory-extraction-writer.cjs
- memory-extractor.cjs
- memory-search.cjs
- session-summary.cjs
- run-extraction-pipeline.cjs
- memory-tiers.cjs
- memory-lifecycle.cjs
- memory-query.cjs

**Solution**: Create `tests/lib/memory/*.test.cjs` files (8-10 hours)

**Priority**: P1

---

### ISSUE-009: CLI Tools Untested (0% Coverage)

**Details**: 66/66 CLI tools have no tests

**Critical Tools**:

- hybrid-search.cjs
- cuj-validator-unified.mjs
- All metrics tools (spawn-assembly, router-churn, runtime-health, memory-slo, open-findings)
- All registry generators (agent-registry, skill-index, tool-manifest)

**Solution**: Create `tests/tools/cli/*.test.cjs` files (12-16 hours)

**Priority**: P1

---

### ISSUE-010: Hook Overhead from Duplication

**Details**:

- PreToolUse(Write): 7 sequential hooks (~300ms, target <100ms)
- Config read 20+ times on startup
- 6 path validators (duplicate logic)
- 3 error sanitizers (duplicate logic)
- 5 config readers (duplicate logic)

**Solution**:

1. Create ConfigCache singleton
2. Create PathValidator facade (consolidate 6 implementations)
3. Merge routing-guard.cjs + spawn-prompt-validator.cjs
4. Split unified-pre-write-hook.cjs into 3 focused hooks

**Priority**: P1 (8 hours)

---

### ISSUE-011: Config Sprawl (30 Files)

**Details**: 30 configuration files slow initialization

**Files**:

- 9 root configs (settings.json, config.yaml, package.json, etc.)
- 9 config/\* files
- 8 context/config/\* files
- 4 scattered config files

**Solution**: Consolidate to 5 files:

- agents.json (agent-config + capability-routing + routing-prototypes + presets)
- search-config.json (code-index-config + intent-feedback)
- capabilities.json (skill-index + tool-manifest)
- rules.json (rule-index + rule-index-cache)
- workflow.json (phase-models)

**Priority**: P1 (2 weeks)

---

### ISSUE-012: Circular Dependencies (3 Detected)

**Details**:

1. **Memory cycle**:

   ```
   memory-manager.cjs → memory-extractor.cjs → memory-scheduler.cjs → memory-manager.cjs
   ```

2. **Routing cycle**:

   ```
   routing-table.cjs → agent-registry-resolver.cjs → fuzzy-intent-matcher.cjs → routing-table.cjs
   ```

3. **Config cycle**:
   ```
   agent-config-reader.cjs → config-loader.cjs → environment.cjs → agent-config-reader.cjs
   ```

**Solution**:

1. Refactor memory modules to publish-subscribe (break direct imports)
2. Split routing-table.cjs into routing-core.cjs + routing-rules.cjs (lazy-loaded)
3. Add circular dependency detection to CI (`npm run validate:circular`)

**Priority**: P1 (1 week)

---

## MEDIUM Priority Issues (P2 - Next Quarter)

### ISSUE-013: Dead Code (12-15% Orphan Rate)

**Files**:

- rollback-manager.cjs (0 imports)
- entity-extractor.cjs (0 imports)
- brownfield-assessor.cjs (0 imports)
- cycle-detector.cjs (0 imports)
- agent-health-tracker.cjs (legacy from party-mode)
- feature-flags.cjs (flags never checked)
- comprehensive-debug-info.cjs (12 functions, 0 calls)
- system-adapters.cjs (never invoked)
- router-churn-log.cjs (created but not read)

**Solution**: Archive 25-30 orphaned files to `_archive/` (4 hours)

**Priority**: P2

---

### ISSUE-014: State Management Fragmentation (8 Modules)

**Files**:

- workflow-state-manager.cjs (file-based)
- router-state.cjs (in-memory)
- state-cache.cjs (LRU cache)
- state-transaction-manager.cjs (transactional)
- loop-state-manager.cjs (loop-specific)
- checkpoint-manager.cjs (checkpoint-specific)
- state-sync-manager.cjs (sync orchestration)
- state-validator.cjs (validation layer)

**Solution**: Choose ONE state backend (recommend workflow-state-manager.cjs), deprecate others (1 week)

**Priority**: P2

---

## Workarounds (Temporary)

### WORKAROUND-001: Manual Code Review for Enforcement Hooks

**Until P0-1/P0-2 tests added:**

- Human review REQUIRED for all changes to routing-guard.cjs, unified-creator-guard.cjs, unified-pre-write-hook.cjs
- Run manual smoke tests (spawn developer with forbidden tools, write to creator paths, etc.)
- Monitor error logs for hook failures

**Remove When**: P0-1 and P0-2 tests completed

---

### WORKAROUND-002: Runtime State File Monitoring

**Until ISSUE-001/ISSUE-002 fixed:**

- Add audit logging for all writes to `.claude/context/runtime/*.json`
- Monitor reflection-spawn-request.json for unexpected entries
- Alert on router-state.json modifications during agent execution

**Remove When**: State file protection implemented

---

### WORKAROUND-003: Memory Content Manual Review

**Until ISSUE-003 fixed:**

- Manual review of all learnings.md/decisions.md/issues.md changes during PR review
- Search for instruction override patterns ("IGNORE", "DISREGARD", "SET ENFORCEMENT")
- Flag suspicious memory entries

**Remove When**: memory-sanitizer.cjs implemented

---

## Prevention

**To prevent future issues like these:**

1. **Enforcement Hooks Are Security Boundaries**: Treat routing-guard.cjs, unified-creator-guard.cjs, unified-pre-write-hook.cjs as kernel-level code (100% test coverage, mandatory security review)

2. **File-Based State Needs Protection**: Add new state files to WRITE_PROTECTED_PATHS immediately, implement checksums for integrity

3. **Memory Is Untrusted Input**: Sanitize ALL memory writes, add provenance markers, validate patterns

4. **Test Coverage ≠ Test Quality**: 100% pass rate with 50% coverage = false confidence. Check coverage report monthly.

5. **Windows Edge Cases Compound**: Test comprehensively (backslash, relative, UNC, reserved, case), not just main path

6. **Hook Overhead Accumulates**: Track cumulative hook time monthly, consolidate when >3 hooks fire on same event

7. **Config Files Are Technical Debt**: Default to extending existing files, only create new with explicit justification

---

## Related Memory

- Consolidated findings: `consolidated-audit-findings-2026-02-12.md`
- Full reports: `.claude/context/reports/*-2026-02-12.md`
