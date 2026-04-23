<!-- Agent: pm | Task: #6 | Session: 2026-02-13 -->

# User Stories: Enterprise Codebase Fix Pipeline

**Generated:** 2026-02-13
**Status:** Ready for Phase 2 Implementation
**Total Stories:** 31 (3 CRITICAL + 13 HIGH + 15 MEDIUM/LOW)
**Estimated Effort:** 52 hours (P0: 18h, P1: 19h, P2: 15h)

---

## Epic 1: Security Vulnerabilities (P0 CRITICAL)

### Epic Goal

Eliminate critical security vulnerabilities that enable privilege escalation, memory poisoning, and arbitrary code execution via adversarial spawned agents.

**Impact if not fixed:** Framework can be compromised by any spawned agent, rendering security controls ineffective.

---

### US-SEC-001: Protect router-state.json from Agent Tampering

**As a** framework architect
**I want** router-state.json to be write-protected and integrity-validated
**So that** spawned agents cannot bypass routing enforcement by modifying router state

**Acceptance Criteria:**

- [ ] `.claude/context/runtime/router-state.json` is added to write-protected paths in `unified-pre-write-hook.cjs`
- [ ] Write attempts to router-state.json are blocked and logged with audit trail
- [ ] SHA-256 checksum field added to router-state.json structure
- [ ] `router-state.cjs` module validates checksum before trusting state data
- [ ] All tests pass: `pnpm test:framework`
- [ ] No legitimate writes fail (only Write tool bypasses protection)

**Technical Notes:**

- File: `.claude/hooks/safety/unified-pre-write-hook.cjs` (add forbidden path check)
- File: `.claude/lib/routing/router-state.cjs` (add checksum validation)
- Blocked attack pattern: `requiresPlannerFirst: false` writes

**Priority:** P0 CRITICAL (blocks all other security fixes)
**Effort Estimate:** 4 hours
**Dependencies:** None

---

### US-SEC-002: Validate and Rate-Limit Reflection Queue Entries

**As a** framework architect
**I want** reflection-spawn-request.json entries validated and rate-limited
**So that** agents cannot trigger arbitrary spawns or DoS via reflection queue poisoning

**Acceptance Criteria:**

- [ ] Max entry limit (50 entries) enforced with error on overflow
- [ ] Timestamp validation: reject entries >24 hours old
- [ ] Prompt field sanitized using `spawn-prompt-assembler.cjs` sanitizeTaskPrompt()
- [ ] SHA-256 checksum added to each entry for integrity verification
- [ ] Only `reflection-agent` can write to this file (enforcement via unified-creator-guard)
- [ ] Router Step 0 validates entries before spawning
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/hooks/routing/routing-guard.cjs` (Step 0 validation)
- File: `.claude/hooks/routing/spawn-prompt-validator.cjs` (entry validation)
- Blocked attack pattern: 10,000 entries + 1MB prompts = DoS

**Priority:** P0 CRITICAL
**Effort Estimate:** 6 hours
**Dependencies:** US-SEC-001

---

### US-SEC-003: Sanitize Memory Files Against Injection Attacks

**As a** framework architect
**I want** memory files (learnings.md, decisions.md, issues.md) sanitized before being read by agents
**So that** adversarial agents cannot inject instruction overrides into shared memory

**Acceptance Criteria:**

- [ ] `memory-sanitizer.cjs` module created in `.claude/lib/memory/`
- [ ] Blocks instruction override patterns (matching spawn-prompt-assembler.cjs patterns)
- [ ] Provenance markers added to all memory entries (agent type, task ID, timestamp)
- [ ] Memory entry signature validation implemented
- [ ] All memory append functions (`appendToLearnings`, `appendToDecisions`, `appendToIssues`) use sanitizer
- [ ] Agents treat memory content as untrusted in their processing
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/lib/memory/core/memory-storage.cjs` (integrate sanitizer)
- File: NEW `.claude/lib/memory/memory-sanitizer.cjs`
- Blocked attack pattern: "IGNORE ALL PREVIOUS INSTRUCTIONS" injection in learnings.md

**Priority:** P0 CRITICAL
**Effort Estimate:** 8 hours
**Dependencies:** US-SEC-001

---

## Epic 2: High-Priority Security Fixes (P1 HIGH)

### Epic Goal

Eliminate high-severity vulnerabilities affecting router operation, command execution, and configuration security.

**Impact if not fixed:** Attackers can escalate privileges, bypass security checks, and perform denial-of-service.

---

### US-SEC-004: Fix Router State TOCTOU Race Condition

**As a** framework architect
**I want** lock ownership validated in loop-state-manager.cjs
**So that** concurrent agents cannot corrupt shared loop-state.json via race conditions

**Acceptance Criteria:**

- [ ] Unique lock ID (UUID) generated for each lock acquisition
- [ ] Lock file contains: pid, timestamp, lockId
- [ ] After `tryClaimStaleLock()`, lock ownership validated before continuing
- [ ] `releaseLock()` validates lock ownership before deleting file
- [ ] Lock ownership validation logs security audit events
- [ ] All concurrent tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/lib/self-healing/loop-state-manager.cjs` (lines 100-123)
- Include code fix from security audit (lock ownership validation)

**Priority:** P1 HIGH
**Effort Estimate:** 3 hours
**Dependencies:** US-SEC-001

---

### US-SEC-005: Hardcode Router State Staleness Threshold

**As a** framework architect
**I want** STATE_STALE_THRESHOLD_MS hardcoded and bounds-checked
**So that** environment variables cannot be used to escalate privileges by extending router mode indefinitely

**Acceptance Criteria:**

- [ ] STATE_STALE_THRESHOLD_MS hardcoded to 600000 (10 minutes) in routing-guard.cjs
- [ ] Remove environment variable override entirely
- [ ] If configurability required (future), enforce bounds (min 30s, max 30min)
- [ ] Move to config.yaml if needed with validation
- [ ] Audit log entry when non-default threshold would be used
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/hooks/routing/routing-guard.cjs` (line 226)
- Blocked attack: `STATE_STALE_THRESHOLD_MS=31536000000` (1 year)

**Priority:** P1 HIGH
**Effort Estimate:** 2 hours
**Dependencies:** None

---

### US-SEC-006: Add Size Limits to Spawn Prompt Validator

**As a** framework architect
**I want** spawn prompt size limits enforced to prevent whitespace bomb DoS
**So that** malicious agents cannot crash the framework with unbounded prompts

**Acceptance Criteria:**

- [ ] MAX_PROMPT_LINES = 10000 constant added
- [ ] MAX_LINE_LENGTH = 2000 constant added
- [ ] MAX_MAP_SIZE = 100000 for internal maps
- [ ] Line count validated BEFORE split() operation
- [ ] Each line length validated BEFORE processing
- [ ] Map size monitored and limited during processing
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/hooks/routing/spawn-prompt-validator.cjs` (line 752)
- Include code fix from security audit (size limit checks)
- Blocked attack: 1 million newlines causing OOM

**Priority:** P1 HIGH
**Effort Estimate:** 2 hours
**Dependencies:** None

---

### US-SEC-007: Enhance Creator Intent Guard Detection

**As a** framework architect
**I want** creator intent validation based on Skill() invocation, not just text mentions
**So that** agents cannot bypass creator workflow enforcement by mentioning creator skills without invoking them

**Acceptance Criteria:**

- [ ] Detect explicit `Skill({ skill: '<creator>-creator' })` invocation pattern
- [ ] Use regex: `Skill\(\{.*skill:\s*['"](.*-creator)['"]`
- [ ] Block Task() spawn if creator intent detected but no Skill() found
- [ ] Enforce that spawned agent is general-purpose (not developer) for creator workflows
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/hooks/routing/routing-guard.cjs` (Check 9)
- Blocked attack: Mention "hook-creator" but directly Write to `.claude/hooks/`

**Priority:** P1 HIGH
**Effort Estimate:** 4 hours
**Dependencies:** US-SEC-001

---

### US-SEC-008: Validate Session ID Format and Prevent Spoofing

**As a** framework architect
**I want** CLAUDE_SESSION_ID validated and prevented from being spoofed
**So that** agents cannot access other sessions' state by setting fake session IDs

**Acceptance Criteria:**

- [ ] CLAUDE_SESSION_ID validation enforces UUID format (no fallback to timestamp)
- [ ] Session metadata stored: start time, agent type, process ID
- [ ] Clock skew validation: timestamps checked for reasonable range
- [ ] Session ownership verified before granting access to loop-state.json
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/lib/self-healing/loop-state-manager.cjs` (line 139)
- Blocked attack: Set `CLAUDE_SESSION_ID="victim-session-123"` to access victim's state

**Priority:** P1 HIGH
**Effort Estimate:** 3 hours
**Dependencies:** None

---

### US-SEC-009: Protect settings.json from Malicious Hook Registration

**As a** framework architect
**I want** settings.json write-protected and integrity-validated
**So that** agents cannot register malicious hooks or disable security hooks

**Acceptance Criteria:**

- [ ] `.claude/settings.json` added to write-protected paths in unified-pre-write-hook.cjs
- [ ] Write attempts logged with full audit trail
- [ ] SHA-256 signature added to settings.json
- [ ] Signature validated before executing any hooks
- [ ] Hook command paths validated to only allow `.claude/hooks/` directory
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/hooks/safety/unified-pre-write-hook.cjs`
- File: `.claude/lib/utils/hook-resolver.cjs` (add signature validation)
- Blocked attack: Register `/tmp/evil-hook.cjs` that runs on next Tool use

**Priority:** P1 HIGH
**Effort Estimate:** 5 hours
**Dependencies:** US-SEC-001

---

## Epic 3: Testing Coverage (P0 CRITICAL GAPS)

### Epic Goal

Achieve test coverage of core routing and safety enforcement logic to prevent regressions.

**Impact if not fixed:** Routing bugs ship to production, framework behavior breaks, enforcement bypasses not caught.

---

### US-TEST-001: Test routing-guard.cjs Core Enforcement Checks

**As a** QA engineer
**I want** routing-guard.cjs fully tested with 21+ test cases
**So that** routing enforcement decisions are validated before deployment

**Acceptance Criteria:**

- [ ] Test file created: `tests/hooks/routing-guard.test.cjs`
- [ ] All 12 enforcement checks tested (planner-first, security-review, specialist-override, etc.)
- [ ] Enforcement modes tested (block/warn/off)
- [ ] Test coverage: ≥85% lines, ≥70% branches
- [ ] All 21+ test cases pass: `pnpm test:framework`
- [ ] Test execution time: <5 seconds

**Test Scenarios (minimum):**

- Developer spawn for specialist task (docs → technical-writer)
- HIGH complexity task without planner
- Specialist override warnings
- TaskList-first gate enforcement
- Creator intent detection
- Intent-agent match validation
- Config model resolution validation
- Memory pressure throttling
- Router Bash whitelist
- Blacklisted tool enforcement
- TaskCreate guards
- Router write protection

**Technical Notes:**

- File: NEW `tests/hooks/routing-guard.test.cjs`
- Follow TDD pattern: write failing tests, then fix routing-guard.cjs

**Priority:** P0 CRITICAL
**Effort Estimate:** 4-6 hours
**Dependencies:** None (parallel with security fixes)

---

### US-TEST-002: Test unified-pre-write-hook.cjs Safety Checks

**As a** QA engineer
**I want** unified-pre-write-hook.cjs fully tested with 20+ test cases
**So that** write safety enforcement is validated before production

**Acceptance Criteria:**

- [ ] Test file created: `tests/hooks/unified-pre-write-hook.test.cjs`
- [ ] All 11 safety checks tested:
  - Windows reserved name detection
  - Path traversal prevention
  - Forbidden path checks
  - File path validation
  - Content safety checks
  - Overwrite protection
  - Atomic write validation
  - Creator path enforcement
  - Memory file format validation
  - Artifact placement rules
  - Provenance header injection
- [ ] Windows edge cases tested (backslashes, UNC paths, etc.)
- [ ] Test coverage: ≥80% lines, ≥70% branches
- [ ] All tests pass: `pnpm test:framework`

**Test Scenarios (minimum):**

- Block Windows reserved names (nul, con, prn, aux, com1-9, lpt1-9)
- Block path traversal (../../../etc/passwd)
- Block writes to project root
- Block writes to user home
- Allow writes to .claude/context/
- Validate creator path enforcement
- Check provenance header injection
- Prevent overwriting existing files

**Technical Notes:**

- File: NEW `tests/hooks/unified-pre-write-hook.test.cjs`
- Use mock file system (memfs or temp directories)

**Priority:** P0 CRITICAL
**Effort Estimate:** 3-4 hours
**Dependencies:** None (parallel)

---

### US-TEST-003: Test spawn-prompt-assembler.cjs Prompt Construction

**As a** QA engineer
**I want** spawn-prompt-assembler.cjs fully tested with 15+ cases
**So that** spawn prompt integrity is ensured before agents are spawned

**Acceptance Criteria:**

- [ ] Test file created: `tests/hooks/spawn-prompt-assembler.test.cjs`
- [ ] Memory section injection tested
- [ ] Constitution loading tested
- [ ] TaskUpdate warning box injection tested
- [ ] Template variable substitution tested
- [ ] Prompt size budgets validated
- [ ] Test coverage: ≥85% lines
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: NEW `tests/hooks/spawn-prompt-assembler.test.cjs`
- Mock memory files, constitution.md

**Priority:** P0 CRITICAL
**Effort Estimate:** 2-3 hours
**Dependencies:** None (parallel)

---

### US-TEST-004: Test unified-creator-guard.cjs Creator Enforcement

**As a** QA engineer
**I want** unified-creator-guard.cjs fully tested with 12+ cases
**So that** creator workflow enforcement is validated

**Acceptance Criteria:**

- [ ] Test file created: `tests/hooks/unified-creator-guard.test.cjs`
- [ ] Direct writes to `.claude/skills/**/SKILL.md` blocked ✓
- [ ] Direct writes to `.claude/agents/**/*.md` blocked ✓
- [ ] Direct writes to `.claude/hooks/**/*.cjs` blocked ✓
- [ ] Skill-creator invocation requirement enforced ✓
- [ ] Enforcement modes (block/warn/off) tested
- [ ] Test coverage: ≥80% lines
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: NEW `tests/hooks/unified-creator-guard.test.cjs`
- Mock creator paths

**Priority:** P0 CRITICAL
**Effort Estimate:** 2 hours
**Dependencies:** None (parallel)

---

### US-TEST-005: Test Memory Subsystem (Manager, Scheduler, Rotator)

**As a** QA engineer
**I want** memory subsystem fully tested
**So that** memory corruption is prevented

**Acceptance Criteria:**

- [ ] Expand `tests/lib/memory/` test suite
- [ ] memory-manager.cjs: read/write/locking tested
- [ ] memory-scheduler.cjs: rotation/cleanup tested
- [ ] memory-rotator.cjs: tier promotion tested
- [ ] Test coverage: ≥75% lines, ≥60% branches
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: Expand existing tests in `tests/lib/memory/`
- Mock file system for memory files
- Test concurrent access patterns

**Priority:** P0 CRITICAL
**Effort Estimate:** 8-10 hours
**Dependencies:** None (parallel)

---

### US-TEST-006: Create CLI Tool Test Suite (hybrid-search, cuj-validator, metrics)

**As a** QA engineer
**I want** critical CLI tools tested
**So that** CLI breakage doesn't ship to users

**Acceptance Criteria:**

- [ ] Test directory created: `tests/tools/cli/`
- [ ] hybrid-search.cjs: search functionality tested
- [ ] cuj-validator-unified.mjs: CUJ validation tested
- [ ] Metrics tools: spawn-assembly-metrics, router-churn, runtime-health tested
- [ ] Test coverage: ≥70% lines
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: NEW `tests/tools/cli/*.test.cjs`
- Mock external services (Exa API, databases)

**Priority:** P0 CRITICAL
**Effort Estimate:** 12-16 hours
**Dependencies:** None (parallel)

---

## Epic 4: Architecture & Planning (P1 HIGH)

### Epic Goal

Consolidate duplicate logic, reduce hook overhead, and unify configuration to improve maintainability.

**Impact if not fixed:** Framework becomes harder to maintain, performance degrades, bugs multiply due to code duplication.

---

### US-ARCH-001: Consolidate Hook Registration and Cache Config Reads

**As a** architect
**I want** hook configurations cached and consolidated
**So that** 20+ config file reads per operation reduced to 1-2 cached reads

**Acceptance Criteria:**

- [ ] `ConfigCache` singleton created in `.claude/lib/utils/`
- [ ] Config reads consolidated: 5 implementations → 1 cached instance
- [ ] File: `pre-tool-unified.cjs` uses ConfigCache instead of individual reads
- [ ] Cache invalidation on file changes (watch mode or TTL-based)
- [ ] Performance: 20+ file reads → 2 reads (first read + cache hit)
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: NEW `.claude/lib/utils/config-cache.cjs`
- Consolidate: config-loader, agent-config-reader, context-mode-loader, hook-resolver, routing-table

**Priority:** P1 HIGH
**Effort Estimate:** 6 hours
**Dependencies:** None

---

### US-ARCH-002: Split Monolithic unified-pre-write-hook.cjs

**As a** architect
**I want** unified-pre-write-hook.cjs split into 3 focused hooks
**So that** each hook has a single responsibility and is easier to test

**Acceptance Criteria:**

- [ ] Hook 1: path-validation-hook.cjs (Windows reserved names, path traversal, forbidden paths)
- [ ] Hook 2: creator-guard-hook.cjs (creator path enforcement)
- [ ] Hook 3: safety-checks-hook.cjs (content, overwrite, atomic write, provenance)
- [ ] settings.json updated with 3 new hook registrations
- [ ] Original unified-pre-write-hook.cjs archived
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: Create 3 new hooks in `.claude/hooks/safety/`
- Update `.claude/settings.json` registrations

**Priority:** P1 HIGH
**Effort Estimate:** 4 hours
**Dependencies:** None

---

### US-ARCH-003: Refactor Circular Dependencies in Memory Subsystem

**As a** architect
**I want** circular dependencies eliminated from memory modules
**So that** concurrent agent initialization doesn't fail with undefined exports

**Acceptance Criteria:**

- [ ] Memory modules refactored to use publish-subscribe pattern
- [ ] Circular dependency: memory-manager → memory-extractor → memory-scheduler → memory-manager BROKEN
- [ ] `.circular()` validator added to require-analyzer.cjs
- [ ] All require() analysis passes circular detection
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: `.claude/lib/memory/core/` modules
- Use event emitter pattern instead of direct requires

**Priority:** P1 HIGH
**Effort Estimate:** 5 hours
**Dependencies:** None

---

### US-ARCH-004: Split routing-table.cjs Into Focused Modules

**As a** architect
**I want** routing-table.cjs (165+ requires) split into focused modules
**So that** routing logic is easier to maintain and test

**Acceptance Criteria:**

- [ ] routing-core.cjs created: ~100 lines, essential routing logic
- [ ] routing-rules.cjs created: ~200 lines, lazy-loaded routing rules
- [ ] routing-table.cjs refactored to delegate
- [ ] Circular dependency to fuzzy-intent-matcher BROKEN
- [ ] Module requires reduced from 165+ to <50
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- Files: `.claude/lib/routing/`
- Use lazy-loading for rules module

**Priority:** P1 HIGH
**Effort Estimate:** 6 hours
**Dependencies:** US-ARCH-003

---

### US-ARCH-005: Archive Orphaned/Dead Code Modules

**As a** architect
**I want** 25-30 orphaned modules archived
**So that** codebase is cleaner and future developers don't maintain unused code

**Acceptance Criteria:**

- [ ] Modules archived to `.claude/lib/_archive/`:
  - rollback-manager.cjs
  - entity-extractor.cjs
  - brownfield-assessor.cjs
  - cycle-detector.cjs
  - agent-health-tracker.cjs
  - +20 more identified in audit
- [ ] Hook catalog updated to remove references
- [ ] CI check added: `npm run validate:orphans` to prevent future dead code
- [ ] Codebase reduced by ~8%

**Technical Notes:**

- Files: Move identified orphans to `_archive/`
- Update catalogs in `.claude/context/artifacts/`

**Priority:** P1 HIGH
**Effort Estimate:** 3 hours
**Dependencies:** None

---

## Epic 5: Configuration Unification (P1 HIGH)

### Epic Goal

Reduce 30 configuration sources to 5 consolidated files for faster initialization and clearer configuration management.

**Impact if not fixed:** Configuration sprawl makes the system harder to understand and slower to initialize.

---

### US-CONFIG-001: Consolidate Agent and Routing Configuration

**As a** architect
**I want** agent-config.json, capability-routing.json, and routing-prototypes.json merged into agents.json
**So that** agent registry is unified and initialization faster

**Acceptance Criteria:**

- [ ] New file created: `.claude/config/agents.json`
- [ ] Schema includes: agent metadata, capabilities, routing rules, experimental routing
- [ ] Backward compatibility: old files read with deprecation warning
- [ ] Config-loader.cjs updated to load agents.json
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/config/agents.json` (new consolidated file)
- Merge: agent-config.json + capability-routing.json + routing-prototypes.json

**Priority:** P1 HIGH
**Effort Estimate:** 4 hours
**Dependencies:** US-ARCH-001

---

### US-CONFIG-002: Consolidate Search and Code Indexing Configuration

**As a** architect
**I want** code-index-config.json, intent-feedback.json merged into search-config.json
**So that** search behavior is managed from a single source

**Acceptance Criteria:**

- [ ] New file created: `.claude/config/search-config.json`
- [ ] Includes: indexing behavior, intent feedback, BM25 tuning, semantic search settings
- [ ] config-loader.cjs updated
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/config/search-config.json` (new)
- Merge: code-index-config.json + intent-feedback.json

**Priority:** P1 HIGH
**Effort Estimate:** 3 hours
**Dependencies:** US-CONFIG-001

---

### US-CONFIG-003: Consolidate Capability and Metadata Configuration

**As a** architect
**I want** skill-index.json and tool-manifest.json merged into capabilities.json
**So that** agent capabilities are defined in one place

**Acceptance Criteria:**

- [ ] New file created: `.claude/config/capabilities.json`
- [ ] Includes: skill definitions, tool definitions, capability metadata
- [ ] config-loader.cjs updated
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/config/capabilities.json` (new)
- Merge: skill-index.json + tool-manifest.json

**Priority:** P1 HIGH
**Effort Estimate:** 3 hours
**Dependencies:** US-CONFIG-001

---

### US-CONFIG-004: Consolidate Rules and Governance Configuration

**As a** architect
**I want** rule-index.json and rule-index-cache.json merged into rules.json
**So that** routing rules are centralized

**Acceptance Criteria:**

- [ ] New file created: `.claude/config/rules.json`
- [ ] Includes: routing rules, validation rules, enforcement rules
- [ ] config-loader.cjs updated
- [ ] All tests pass: `pnpm test:framework`

**Technical Notes:**

- File: `.claude/config/rules.json` (new)
- Merge: rule-index.json + rule-index-cache.json

**Priority:** P1 MEDIUM
**Effort Estimate:** 2 hours
**Dependencies:** US-CONFIG-001

---

## Epic 6: Additional Testing Coverage (P1/P2)

### Epic Goal

Fill remaining test gaps to ensure comprehensive coverage of critical paths.

---

### US-TEST-007: Add Windows Path Handling Tests

**As a** QA engineer
**I want** Windows-specific path handling edge cases tested
**So that** Windows path normalization bugs are caught before production

**Acceptance Criteria:**

- [ ] Tests added to `tests/lib/utils/platform.test.cjs`
- [ ] Test cases:
  - Backslash vs forward slash normalization
  - UNC paths (`\\server\share\file.txt`)
  - Drive-relative paths (`C:file.txt`)
  - Reserved device names in subdirectories
  - Long path support
- [ ] All tests pass: `pnpm test:framework`

**Priority:** P1 HIGH
**Effort Estimate:** 2 hours
**Dependencies:** None

---

### US-TEST-008: Add Hook Execution Order and Isolation Tests

**As a** QA engineer
**I want** hook execution order and state isolation tested
**So that** hook interactions don't cause flaky failures

**Acceptance Criteria:**

- [ ] Test file created: `tests/hooks/hook-execution-order.test.cjs`
- [ ] Test cases:
  - Multiple hooks modifying shared state
  - Hook execution order guarantees
  - Hook failure propagation
  - Hook timeout handling
  - State isolation between tests
- [ ] All tests pass: `pnpm test:framework`

**Priority:** P1 MEDIUM
**Effort Estimate:** 3-4 hours
**Dependencies:** None

---

### US-TEST-009: Add Memory Pressure and Large File Tests

**As a** QA engineer
**I want** memory pressure scenarios and large file handling tested
**So that** edge cases under stress don't break the framework

**Acceptance Criteria:**

- [ ] Test file: `tests/hooks/routing-guard-memory.test.cjs`
- [ ] Test cases:
  - Spawn throttling under >80% heap pressure
  - Emergency spawn bypass for critical security agent
  - Memory pressure recovery
  - Files >1MB, >10MB handling
- [ ] All tests pass: `pnpm test:framework`

**Priority:** P1 MEDIUM
**Effort Estimate:** 4 hours
**Dependencies:** None

---

### US-TEST-010: Add Intent Classification Edge Case Tests

**As a** QA engineer
**I want** intent classification edge cases tested
**So that** ambiguous user inputs are handled correctly

**Acceptance Criteria:**

- [ ] Expand `tests/lib/routing/fuzzy-intent-matcher.test.cjs`
- [ ] Test cases:
  - Ambiguous prompts
  - Multi-intent prompts
  - Typos in keywords
  - Non-English prompts
  - Very long prompts (>10KB)
- [ ] All tests pass: `pnpm test:framework`

**Priority:** P1 MEDIUM
**Effort Estimate:** 3 hours
**Dependencies:** None

---

## Acceptance Criteria by Phase

### Phase 2: Security Review (P0 Security + P1 Planning)

- [ ] All 9 security findings documented in detailed issue tracker
- [ ] Attack scenarios documented with proof-of-concept patterns
- [ ] Remediation priority agreed with team
- [ ] Resource allocation for P0 fixes confirmed
- [ ] Timeline for P0 completion established (18 hours)

### Phase 3: Architecture Design

- [ ] Hook consolidation design reviewed
- [ ] Config unification schema designed
- [ ] Circular dependency refactoring plan finalized
- [ ] Dead code archival list confirmed
- [ ] Architecture review approved

### Phase 4: Implementation (P0 Security Fixes)

- [ ] US-SEC-001 through US-SEC-009 completed
- [ ] All P0 tests passing
- [ ] Security audit findings validated as fixed
- [ ] 100% test pass rate: `pnpm test:framework`

### Phase 5: Testing & Validation

- [ ] US-TEST-001 through US-TEST-010 all passing
- [ ] Test coverage reports generated
- [ ] Coverage targets met (≥75% lines, ≥60% branches)
- [ ] Performance benchmarks established

### Phase 6: Code Review & Documentation

- [ ] All changes reviewed by security-architect
- [ ] Architecture documentation updated
- [ ] Config reference documentation updated
- [ ] Memory protocol documented
- [ ] Git commits include Co-Authored-By attribution

### Phase 7: Final Reflection

- [ ] Post-implementation reflection conducted
- [ ] Learnings documented in memory files
- [ ] Metrics compared to baseline
- [ ] Success/failure analysis completed

---

## Story Mapping Summary

| Category                      | Count  | Status    | Est. Hours |
| ----------------------------- | ------ | --------- | ---------- |
| Security Vulnerabilities (P0) | 3      | Ready     | 18h        |
| High-Priority Fixes (P1)      | 6      | Ready     | 19h        |
| Testing Coverage (P0)         | 6      | Ready     | 27h\*      |
| Architecture (P1)             | 5      | Ready     | 24h\*      |
| Configuration (P1)            | 4      | Ready     | 12h\*      |
| Additional Tests (P1/P2)      | 4      | Ready     | 12h\*      |
| **TOTAL**                     | **31** | **Ready** | **52h**    |

\*Note: Some effort estimates are combined in "Estimated Effort" above. Total project: 52 hours across phases.

---

## Next Steps (For Phase 2 Handoff)

1. **Review this user story document** with PM and team leads
2. **Prioritize by risk:**
   - CRITICAL: Security fixes US-SEC-001 through US-SEC-009
   - HIGH: Testing US-TEST-001 through US-TEST-006
   - HIGH: Architecture US-ARCH-001 through US-ARCH-005
3. **Schedule sprints:**
   - Sprint 1 (Week 1): P0 security + P0 testing (37h)
   - Sprint 2 (Week 2): P1 architecture + P1 config (36h)
4. **Assign resources:** Allocate developer, QA, and security-architect
5. **Track progress:** Update user story status as work completes

---

**Generated by:** PM Agent (Task #6)
**Date:** 2026-02-13
**Status:** READY FOR IMPLEMENTATION
**Approval Required:** PM, Architecture Lead, Security Lead
