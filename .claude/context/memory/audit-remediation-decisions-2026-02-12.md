# Audit Remediation Decisions — 2026-02-12

<!-- Agent: reflection-agent | Task: #5 (batch reflection) | Session: 2026-02-12 -->

## Decision Summary

Based on 4-agent audit findings (47 code bugs, 46 untested files, 14 security vulnerabilities, architectural drift), we've decided on a **3-tier remediation strategy** prioritizing security fixes, test coverage, and architectural consolidation.

---

## DECISION-001: Security-First Remediation Sequence

**Status**: ACCEPTED

**Context**: 3 CRITICAL security vulnerabilities (router state bypass, reflection queue RCE, memory poisoning) plus 4 CRITICAL code bugs identified.

**Decision**: Execute P0 security fixes BEFORE any other work

**Sequence**:

1. **Week 1 (Security)**: CRIT-SEC-001, CRIT-SEC-002, CRIT-SEC-003 (18 hours)
2. **Week 1 (Code Quality)**: C1 (router state race), C2 (Windows paths) (4 hours)
3. **Week 2 (Test Coverage)**: P0-1 (routing-guard), P0-2 (unified-pre-write) (12-15 hours)
4. **Week 3-4**: P1 actions (memory tests, CLI tests, hook consolidation)

**Rationale**:

- Security vulnerabilities allow arbitrary agent spawns, privilege escalation, and prompt poisoning
- CRITICAL bugs (race conditions, path bypass) risk production stability
- Test coverage gaps prevent validation of fixes

**Alternatives Considered**:

- Architecture-first (config consolidation): Rejected — doesn't address security
- Test-first (coverage before fixes): Rejected — fixes are urgent, tests can validate after

**Consequences**:

- Security vulnerabilities closed in 1 week
- Framework deployable after 2 weeks (P0 complete)
- Architecture improvements deferred to P2 (Month 2-3)

---

## DECISION-002: File-Based State Protection Model

**Status**: ACCEPTED

**Context**: Runtime state files (router-state.json, reflection-spawn-request.json, session-metrics.json) are writable by all agents, enabling trust boundary bypass.

**Decision**: Implement **Write-Protected Paths + Integrity Validation** pattern

**Implementation**:

1. Add `.claude/context/runtime/*.json` to `WRITE_PROTECTED_PATHS` in unified-pre-write-hook.cjs
2. Add SHA-256 checksum field to all runtime state schemas
3. Validate checksum before trusting state data
4. Only allow designated modules to write to protected files (router-state.cjs writes router-state.json, etc.)

**Rationale**:

- Simplest solution with immediate effect (4-6 hours implementation)
- Follows existing unified-pre-write-hook.cjs pattern
- Integrity validation (checksums) detects tampering

**Alternatives Considered**:

- **Database-backed state**: Rejected — requires SQLite migration (2-3 weeks), overkill for current needs
- **In-memory state only**: Rejected — loses state across process restarts
- **File permissions**: Rejected — Node.js fs module has limited ACL support, platform-dependent

**Consequences**:

- Agents can no longer modify runtime state files directly
- State tampering detected via checksum validation
- Small performance overhead (~5ms per state read for checksum)
- Future: Consider database migration if state complexity grows

---

## DECISION-003: Memory Sanitization Strategy

**Status**: ACCEPTED

**Context**: Memory files (learnings.md, decisions.md, issues.md) read by ALL agents. No input sanitization exists. Adversarial agent can inject prompt injection patterns.

**Decision**: Create `memory-sanitizer.cjs` module with **pattern blocking + provenance validation**

**Implementation**:

1. Block instruction override patterns (same list as spawn-prompt-assembler.cjs):
   - `IGNORE (PREVIOUS|ALL PRIOR|SYSTEM) INSTRUCTIONS`
   - `DISREGARD (EVERYTHING|ALL PREVIOUS)`
   - `YOU ARE NOW A [AGENT]`
   - `SET (ENFORCEMENT|GUARD|SECURITY)=off`
2. Add provenance markers to all memory entries:
   ```markdown
   <!-- Agent: developer | Task: #42 | Session: 2026-02-12 -->
   ```
3. Validate provenance on read (log warnings for unmarked entries)
4. Treat memory content as untrusted input in agent prompts

**Rationale**:

- Pattern blocking is fast (<5ms overhead per write)
- Provenance enables audit trail (who wrote this entry?)
- Same pattern used successfully in spawn-prompt-assembler.cjs

**Alternatives Considered**:

- **LLM-based detection**: Rejected — too slow for hook path (200-500ms)
- **Escape-only (no blocking)**: Rejected — escape can be bypassed with encoding tricks
- **Memory signature validation**: Deferred to P2 — adds complexity, provenance sufficient for now

**Consequences**:

- Memory writes sanitized (prompt injection blocked)
- Provenance markers enable audit trail
- Small performance overhead (~5ms per memory write)
- False positives possible (legitimate entries matching patterns) — log warnings, don't block

---

## DECISION-004: Test Coverage Target (90% Critical Paths)

**Status**: ACCEPTED

**Context**: Current test coverage ~50% (214 tests passing, but 46 critical files untested). Framework has comprehensive test infrastructure but hollow coverage.

**Decision**: Target **90% coverage for critical paths** (not 100% overall)

**Definition of "Critical Paths"**:

- All enforcement hooks (routing-guard.cjs, unified-creator-guard.cjs, unified-pre-write-hook.cjs)
- All memory subsystem modules (14 files)
- All routing logic (router-state.cjs, routing-table.cjs, intent-classifier.cjs)
- All CLI tools used in CI (hybrid-search, cuj-validator, metrics tools)

**Timeline**:

- P0 (2 weeks): Enforcement hooks (12-15 hours)
- P1 (1 month): Memory subsystem (8-10 hours) + CLI tools (12-16 hours)
- P2 (3 months): Remaining critical paths (orchestration, workflow, monitoring)

**Rationale**:

- 90% is realistic (100% is diminishing returns)
- Focus on high-risk areas (enforcement, routing, memory, CLI)
- Existing tests (214) cover utility/lib functions well (keep those)

**Alternatives Considered**:

- **100% coverage**: Rejected — unrealistic timeline (6+ months), diminishing returns
- **70% coverage**: Rejected — too low for critical infrastructure
- **Branch coverage instead of line coverage**: Deferred — line coverage easier to measure, branch coverage P2

**Consequences**:

- Test suite grows from 214 to ~400-500 tests
- CI time increases ~2x (mitigate with parallel test execution)
- Coverage report becomes meaningful (current 100% pass rate with 50% coverage is misleading)

**Success Criteria**:

- Routing hooks: 100% coverage (all 12 checks tested)
- Memory subsystem: 90% coverage
- CLI tools (critical): 80% coverage
- Overall: 70-75% (acceptable for non-critical paths)

---

## DECISION-005: Hook Consolidation via Shared Validation Library

**Status**: ACCEPTED

**Context**: 7 sequential hooks fire on PreToolUse(Write), causing 300ms latency (target <150ms). Root cause: duplicate validation (6 path validators, 3 error sanitizers, 5 config readers).

**Decision**: Create **shared validation library** with memoization

**Modules to Create**:

1. **ConfigCache** (`.claude/lib/utils/config-cache.cjs`):
   - Singleton with lazy loading
   - LRU cache with 5-minute TTL
   - Replaces 5 config readers (agent-config-reader, config-loader, context-mode-loader, hook-resolver, inline config)

2. **PathValidator** (`.claude/lib/utils/path-validator.cjs`):
   - Facade consolidating 6 implementations
   - Windows-aware (UNC, relative, reserved names, case-insensitive)
   - Cached results (path normalization is expensive)

3. **ErrorSanitizer** (`.claude/lib/utils/error-sanitizer.cjs`):
   - Singleton consolidating 3 implementations
   - Remove PII, hide credentials, scrub sensitive data
   - Used by hooks, loggers, error trackers

**Hook Consolidation**:

- Merge routing-guard.cjs + spawn-prompt-validator.cjs (both validate Task() calls)
- Split unified-pre-write-hook.cjs into 3 focused hooks:
  - path-safety-hook.cjs (path validation only)
  - creator-workflow-hook.cjs (creator path blocking only)
  - write-content-hook.cjs (content safety checks only)

**Rationale**:

- Shared library reduces duplication (6 path validators → 1 facade)
- Memoization reduces redundant work (config read once per session, not per hook)
- Splitting large hooks improves maintainability (11 checks in one file is too many)

**Alternatives Considered**:

- **Keep hooks as-is**: Rejected — 300ms latency unacceptable
- **Merge all write hooks into one**: Rejected — single hook with 20+ checks is unmaintainable
- **Async hook execution**: Rejected — hooks must be synchronous per protocol

**Consequences**:

- Hook latency reduced 40% (300ms → 180ms)
- Config reads reduced from 20+ to 1 per session
- Path validation faster (cached results)
- Breaking change: Hooks now depend on shared library (document in upgrade guide)

**Migration Plan**:

1. Create shared libraries (ConfigCache, PathValidator, ErrorSanitizer)
2. Add tests for shared libraries (100% coverage)
3. Refactor hooks to use shared libraries (one hook at a time)
4. Validate hook behavior unchanged (equivalence tests)
5. Archive old validation modules

---

## DECISION-006: Config Consolidation to 5 Files

**Status**: ACCEPTED

**Context**: 30 configuration files cause slow initialization (20+ file reads), merge conflicts, unclear source of truth.

**Decision**: Consolidate to **5 configuration files**

**Mapping**:

1. **agents.json** (consolidates 5 files):
   - agent-config.json (runtime registry)
   - capability-routing.json (intent→agent mapping)
   - routing-prototypes.json (experimental routing)
   - presets.json (preset configurations)
   - agent-skill-matrix.json

2. **search-config.json** (consolidates 2 files):
   - code-index-config.json (indexing behavior)
   - intent-feedback.json (historical intent data)

3. **capabilities.json** (consolidates 2 files):
   - skill-index.json (skill metadata)
   - tool-manifest.json (tool definitions)

4. **rules.json** (consolidates 2 files):
   - rule-index.json
   - rule-index-cache.json

5. **workflow.json**:
   - phase-models.json (workflow phases)

**Root Configs (Keep as-is)**:

- settings.json (hook registrations)
- config.yaml (agent models)
- package.json (npm scripts, deps)
- .env.example (environment template)

**Rationale**:

- Reduces config files from 30 to 5 (83% reduction)
- Startup reads reduced from 20+ to 5
- Single source of truth per domain (agents, search, capabilities, rules, workflow)
- Easier to find config (no more hunting across 3 directories)

**Alternatives Considered**:

- **One monolithic config.json**: Rejected — too large (>5000 lines), merge conflicts worse
- **Keep current structure**: Rejected — config sprawl will only grow
- **Database for config**: Rejected — overkill, adds dependency

**Consequences**:

- Breaking change (all hooks/lib modules must update imports)
- Migration script needed (automated conversion of old configs to new format)
- 30-day grace period (old configs still read, warnings logged)
- Documentation update (CONFIG_REFERENCE.md shows new structure)

**Migration Plan**:

1. Define schemas for 5 new config files (agents.schema.json, etc.)
2. Create migration script (`.claude/tools/cli/migrate-configs.cjs`)
3. Add config-loader.cjs fallback (read old files with deprecation warnings)
4. Update all imports to use new config structure
5. Run migration script, validate all tests pass
6. Archive old config files after 30-day grace period

---

## DECISION-007: Windows Path Handling Strategy

**Status**: ACCEPTED

**Context**: Path normalization incomplete (only converts backslashes). Doesn't handle UNC, relative, case-sensitivity, reserved names in subdirectories. CRITICAL vulnerability (path traversal, bypass guards).

**Decision**: Implement **comprehensive Windows path validator** with test-driven approach

**Implementation**:

1. Create `path-validator.cjs` (unified path validation module)
2. Handle all Windows edge cases:
   - **Backslashes**: Convert to forward slashes (`\` → `/`)
   - **Relative paths**: Use `path.resolve()` to absolute path
   - **UNC paths**: Normalize `\\server\share\file.txt` to absolute form
   - **Case sensitivity**: Lowercase comparison on Windows (case-insensitive filesystem)
   - **Reserved names**: Check recursively (not just basename)
   - **.. segments**: Use `path.normalize()` to resolve
3. Add comprehensive test suite (tests/lib/utils/platform.test.cjs):
   - 50+ test cases covering all edge cases
   - Cross-platform tests (run on Windows + Linux)
   - Negative tests (invalid paths should be rejected)

**Rationale**:

- Unified module is easier to maintain than scattered checks
- Test-driven approach prevents regressions
- Cross-platform testing validates behavior on both Windows and Linux

**Alternatives Considered**:

- **Keep scattered path checks**: Rejected — already proven insufficient
- **Use third-party library**: Rejected — no library handles all edge cases
- **Platform-specific validation**: Rejected — cross-platform codebase requires unified approach

**Consequences**:

- Path validation comprehensive (all Windows edge cases handled)
- Test suite prevents regressions (50+ tests)
- Small performance overhead (path normalization is expensive) — mitigate with caching
- All hooks/validators must use path-validator.cjs (breaking change)

---

## DECISION-008: Circular Dependency Resolution Strategy

**Status**: ACCEPTED

**Context**: 3 circular dependencies detected (memory-manager, routing-table, agent-config-reader). Causes undefined exports, race conditions.

**Decision**: Use **publish-subscribe pattern** for memory modules, **module splitting** for routing/config

**Approach by Module**:

1. **Memory Cycle** (`memory-manager → memory-extractor → memory-scheduler → memory-manager`):
   - **Solution**: Event-driven architecture
   - memory-scheduler emits `rotation-needed` event
   - memory-manager subscribes to event (no direct import)
   - memory-extractor emits `extraction-complete` event
   - Breaking circular import chain

2. **Routing Cycle** (`routing-table → agent-registry-resolver → fuzzy-intent-matcher → routing-table`):
   - **Solution**: Split routing-table.cjs into 2 files
   - routing-core.cjs (100 lines, core data structures)
   - routing-rules.cjs (lazy-loaded, 1500 lines of rules)
   - fuzzy-intent-matcher imports routing-core only

3. **Config Cycle** (`agent-config-reader → config-loader → environment → agent-config-reader`):
   - **Solution**: Inversion of control
   - environment.cjs doesn't import agent-config-reader
   - Instead, agent-config-reader passes env vars to config-loader
   - config-loader is pure (no imports)

**Rationale**:

- Publish-subscribe is proven pattern for breaking cycles
- Module splitting reduces coupling
- Inversion of control clarifies dependencies

**Alternatives Considered**:

- **Ignore circular deps**: Rejected — causes runtime failures
- **Merge modules**: Rejected — creates monster modules (2000+ lines)
- **Lazy require()**: Rejected — doesn't solve root cause, just hides it

**Consequences**:

- Circular dependencies eliminated
- Modules more loosely coupled (easier to test)
- Slight complexity increase (event emitters)
- CI check added (`npm run validate:circular`) to prevent future cycles

---

## Cross-References

- **Findings**: `consolidated-audit-findings-2026-02-12.md`
- **Issues**: `audit-issues-2026-02-12.md`
- **Full Reports**: `.claude/context/reports/*-2026-02-12.md`

---

## Next Steps

1. **This Week**: Execute P0 security fixes (CRIT-SEC-001, CRIT-SEC-002, CRIT-SEC-003)
2. **Week 2**: Execute P0 code quality fixes (C1, C2) + P0 test coverage (routing-guard, unified-pre-write)
3. **Week 3-4**: Execute P1 actions (memory tests, CLI tests, hook consolidation)
4. **Month 2-3**: Execute P2 actions (config unification, circular dependency resolution, dead code archival)

**Review**: Monthly architecture review to track progress (success criteria from DECISION-004)
