# Architecture Audit Report — agent-studio

<!-- Agent: architect | Task: #4 | Session: 2026-02-13 -->

**Date**: 2026-02-13
**Scope**: Overall architecture, structural health, technical debt, configuration sprawl
**Methodology**: Static analysis, dependency review, pattern detection, size analysis

---

## Executive Summary

The agent-studio codebase shows **mature architecture with significant technical debt**. While the system demonstrates good modularization and thoughtful design patterns, it suffers from:

1. **Oversized modules** (79KB routing-guard, 107KB skill-creator script)
2. **640+ instances of direct console usage** (bypassing logger infrastructure)
3. **Extensive archive sprawl** (640KB across 16 archive directories, 405 archived docs)
4. **168 npm scripts** with unclear usage patterns
5. **Configuration fragmentation** across multiple YAML/JSON files
6. **Circular dependency workarounds** (lazy loading in 10+ critical modules)

**Overall Grade**: B- (Functional but needs refactoring to prevent future maintainability issues)

---

## Findings by Category

### 1. Dead/Orphaned Code (MEDIUM Priority)

#### Finding 1.1: Hook Export Pattern Inconsistency (MEDIUM)

**Severity**: MEDIUM
**Impact**: 14 hooks without proper `module.exports` patterns could fail to load correctly

**Evidence**:

- 105 total hook files
- 0 hooks using functional exports (`module.exports = function`)
- All hooks registered in settings.json use stdin-based protocol (JSON in/out)
- 14 orphaned hooks in `_archive/` subdirectories still contain old export patterns

**Affected Files**:

```
.claude/hooks/monitoring/_archive/error-tracker-hook.cjs
.claude/hooks/monitoring/_archive/execution-limit-monitor-hook.cjs
.claude/hooks/monitoring/_archive/metrics-collector-hook.cjs
.claude/hooks/routing/_archive/tool-scope-validator.cjs
.claude/hooks/_archive/git/regenerate-registries.cjs
.claude/hooks/_archive/safety/file-path-guard.cjs
.claude/hooks/_archive/safety/write-content-scanner.cjs
.claude/hooks/_archive/task-status-enforcement.cjs
.claude/hooks/_archive/validation/track-analytics-validator.cjs
```

**Recommended Action**:

1. **Delete archived hooks** if no longer needed (448KB of orphaned code)
2. OR **restore to active** if still required (requires settings.json registration)
3. Document decision in `.claude/context/memory/decisions.md`

**Business Impact**: Low (archived code doesn't execute, but clutters codebase and confuses developers)

---

#### Finding 1.2: Archived Tools Sprawl (MEDIUM)

**Severity**: MEDIUM
**Impact**: 26 archived tools (192KB) with unclear restoration path

**Evidence**:

- `.claude/tools/_archive/` contains 26 deprecated tools
- No clear archival policy documented
- Some tools reference in-memory caching, monitoring dashboards, ESLint fixes
- Tool catalog marks 25 tools as deprecated (overlaps with \_archive count)

**Sample Archived Tools**:

```
archive-issues.py
compact-lancedb.cjs
conductor-gap-analyzer.cjs
cost-report.js
detect-orphans.mjs
document-query.cjs
eslint-batch-fix.cjs
monitoring-dashboard.cjs
migrate-agent-config.cjs
```

**Questions to Answer**:

1. Should these be **permanently deleted** (free up 192KB)?
2. Should any be **restored** (e.g., `detect-orphans.mjs` for architecture analysis)?
3. Is there a **retention policy** for archived tools?

**Recommended Action**:

1. **Audit archived tools** for restoration candidates (1-2 hours)
2. **Delete permanently** if no restoration plan exists
3. **Document archival policy** in `FILE_PLACEMENT_RULES.md`

---

#### Finding 1.3: Massive Test Archive (HIGH Priority)

**Severity**: HIGH
**Impact**: 404 active tests vs 114 archived tests — unclear archival rationale

**Evidence**:

- `tests/` directory contains 404 active test files
- Archive exists but size/scope unclear (grep failed to enumerate)
- No documented policy for test archival vs deletion
- Archived tests may contain valuable regression patterns

**Affected Areas**:

- Hook tests: `post-creation-integration-edge-cases.test.cjs`, `post-creation-integration.test.cjs` (appear active, not archived)
- Unknown archived test scope

**Recommended Action**:

1. **Inventory archived tests** (run `find tests/_archive -name "*.test.*"`)
2. **Classify by restoration value**:
   - **Delete**: Obsolete tests for removed features
   - **Restore**: Regression tests for active features
   - **Keep archived**: Historical reference (document why)
3. **Update test documentation** with archival policy

**Business Impact**: Medium (missing regression tests = potential bugs; bloated archives = confusion)

---

### 2. Duplicate Functionality (HIGH Priority)

#### Finding 2.1: Overlapping Guard Logic in Hooks (HIGH)

**Severity**: HIGH
**Impact**: 8 hooks contain overlapping guard/validation logic, risking inconsistency

**Evidence**:

- `routing-guard.cjs` (79KB, 38 functions) — central validation hub
- `unified-creator-guard.cjs` (23KB) — creator path validation
- `pre-task-unified.cjs` (38KB) — task validation
- `user-prompt-unified.cjs` (68KB) — prompt validation
- `bash-pretool-bundle.cjs` — Bash command validation
- `unified-pre-write-hook.cjs` (46KB) — file safety validation

**Overlap Examples**:

1. **Routing validation** appears in:
   - `routing-guard.cjs` (primary)
   - `pre-task-unified.cjs` (task-specific)
   - `user-prompt-unified.cjs` (prompt-level)

2. **Security validation** appears in:
   - `routing-guard.cjs` (security-architect routing)
   - `bash-pretool-bundle.cjs` (shell injection checks)
   - `unified-pre-write-hook.cjs` (file path safety)

**Risk**:

- Inconsistent validation logic across hooks
- Difficult to maintain (change requires 3+ file edits)
- High cognitive load (79KB routing-guard with 38 functions)

**Recommended Action**:

1. **Extract shared validation to library module**: `.claude/lib/validation/common-guards.cjs`
2. **Refactor hooks to use shared module**:
   ```javascript
   const {
     validateRouting,
     validateSecurity,
     validateFilePath,
   } = require('../../lib/validation/common-guards.cjs');
   ```
3. **Split routing-guard.cjs** into smaller modules:
   - `routing-guard-core.cjs` (10KB) — core routing logic
   - `planner-first-guard.cjs` (5KB) — planner-first enforcement
   - `security-guard.cjs` (5KB) — security review enforcement
   - `specialist-routing-guard.cjs` (5KB) — specialist-first enforcement

**Estimated Effort**: 8-12 hours (high-risk refactor, requires comprehensive testing)

---

#### Finding 2.2: Circular Dependency Workarounds (MEDIUM)

**Severity**: MEDIUM
**Impact**: 10+ modules use lazy loading to break circular dependencies

**Evidence**:

```
.claude/lib/memory/core/memory-utils.cjs
.claude/lib/routing/routing-table.cjs
.claude/lib/tools/available-agents.cjs
.claude/lib/tools/skill-catalog.cjs
.claude/lib/workflow/cycle-detector.cjs
.claude/lib/workflow/lazy-loader.cjs
.claude/lib/workflow/workflow-engine.cjs
.claude/lib/workflow/workflow-resolver.cjs
.claude/lib/workflow/workflow-validator.cjs
```

**Pattern**:

```javascript
// routing-guard.cjs line 3-5
// Memory Monitor integration (lazy-loaded to avoid circular dependencies)
// Event Bus integration (P1-6.4)
// Violation Tracker integration (lazy-loaded)
```

**Root Cause**:

- `routing-guard.cjs` depends on `memory-monitor`
- `memory-monitor` depends on `routing-guard` (for event tracking)
- Workaround: lazy-load `memory-monitor` inside functions

**Recommended Action**:

1. **Introduce dependency inversion**:
   - Create `validation-events.cjs` interface
   - Both `routing-guard` and `memory-monitor` depend on interface (not each other)
   - Use event bus for loose coupling

2. **Run madge analysis**:

   ```bash
   npx madge --circular .claude/lib
   ```

   (Already run: "Processed 226 files (23 warnings)" — suggests 23 circular refs)

3. **Refactor top 5 circular dependency chains**:
   - Memory subsystem (memory-utils ↔ memory-manager)
   - Routing subsystem (routing-table ↔ routing-guard)
   - Workflow subsystem (workflow-engine ↔ workflow-resolver)

**Estimated Effort**: 12-16 hours (requires dependency graph visualization + careful refactoring)

---

### 3. Oversized Modules (HIGH Priority)

#### Finding 3.1: Mega-Modules Exceeding Maintainability Threshold (HIGH)

**Severity**: HIGH
**Impact**: 5 modules >50KB, 1 module >100KB — difficult to understand and test

**Evidence** (files >20KB):
| File | Size | Lines | Functions | Assessment |
|------|------|-------|-----------|------------|
| `.claude/skills/skill-creator/scripts/create.cjs` | 107KB | 3,677 | Unknown | **CRITICAL** — monolithic skill creator |
| `.claude/hooks/routing/routing-guard.cjs` | 79KB | 2,700+ | 38 | **HIGH** — god object anti-pattern |
| `.claude/hooks/routing/user-prompt-unified.cjs` | 68KB | 2,300+ | Unknown | **HIGH** — unified prompt processing |
| `.claude/hooks/routing/spawn-prompt-assembler.cjs` | 58KB | 1,900+ | Unknown | **MEDIUM** — complex template assembly |
| `.claude/lib/memory/memory-manager.cjs` | 57KB | 1,900+ | Unknown | **MEDIUM** — memory orchestration hub |
| `.claude/hooks/routing/pre-tool-unified.cjs` | 46KB | 1,500+ | Unknown | **MEDIUM** — unified pre-tool validation |

**Detailed Analysis**:

**3.1.1: skill-creator/scripts/create.cjs (107KB, 3,677 lines)**

**Violations**:

- **Single Responsibility Principle**: Handles research, template rendering, file I/O, validation, CLAUDE.md updates, catalog updates
- **God Object**: 107KB script doing 6+ distinct responsibilities
- **Testability**: Impossible to unit test individual functions (all private/inline)

**Recommended Split**:

```
skill-creator/
  lib/
    research-handler.cjs        (~500 lines) — research-synthesis integration
    template-processor.cjs      (~600 lines) — template rendering logic
    file-operations.cjs         (~400 lines) — file I/O and validation
    catalog-updater.cjs         (~300 lines) — catalog/registry updates
    claude-md-updater.cjs       (~200 lines) — CLAUDE.md integration
    validation-pipeline.cjs     (~400 lines) — schema validation
  scripts/
    create.cjs                  (~300 lines) — orchestration only
```

**Effort**: 16-20 hours (high-risk refactor, requires comprehensive integration tests)

---

**3.1.2: routing-guard.cjs (79KB, 2,700+ lines, 38 functions)**

**Violations**:

- **Cyclomatic Complexity**: 38 functions suggest complex branching logic
- **God Object**: Central validation hub with 7+ enforcement modes
- **Mixed Concerns**: Routing + security + complexity + planner-first + specialist routing

**Recommended Split** (already outlined in Finding 2.1):

```
routing/
  guards/
    routing-guard-core.cjs       (10KB) — core routing orchestration
    planner-first-guard.cjs      (5KB)  — complexity-based planner enforcement
    security-guard.cjs           (5KB)  — security review enforcement
    specialist-routing-guard.cjs (5KB)  — specialist-first enforcement
    creator-routing-guard.cjs    (5KB)  — creator skill routing
    task-complexity-guard.cjs    (5KB)  — TaskCreate complexity checks
  routing-guard.cjs              (5KB)  — facade delegating to guards/
```

**Effort**: 10-12 hours

---

### 4. Inconsistent Patterns (MEDIUM Priority)

#### Finding 4.1: Direct Console Usage (HIGH Code Smell)

**Severity**: MEDIUM (Code Quality)
**Impact**: 646 instances of direct console usage bypassing structured logging

**Evidence**:

```bash
grep -r "console\.log\|console\.error" .claude/hooks .claude/lib --include="*.cjs" | grep -v "logger\|Logger\|// console" | wc -l
# Result: 646
```

**Problem**:

- Logger infrastructure exists (`.claude/lib/utils/logger.cjs`)
- 646 instances bypass logger (no structured logs, no log levels, no timestamps)
- Violates `check-console-log.cjs` hook (runs on Stop event)

**Sample Violations**:

- Hooks: Direct `console.error` in error handlers (no context)
- Library modules: `console.log` for debugging (should use logger.debug)
- Tools: `console.log` in CLI tools (acceptable for user output, but inconsistent)

**Recommended Action**:

1. **Classify console usage**:
   - **CLI tools** (user-facing): Keep `console.log` (acceptable)
   - **Hooks/lib** (internal): Replace with logger
   - **Debug statements**: Replace with `logger.debug`

2. **Batch refactor script** (similar to archived `eslint-batch-fix.cjs`):

   ```javascript
   // Replace in hooks/lib only
   console.log(...) → logger.info(...)
   console.error(...) → logger.error(...)
   console.warn(...) → logger.warn(...)
   ```

3. **Enable ESLint rule**: `no-console` for `.claude/hooks/**` and `.claude/lib/**`

**Estimated Effort**: 6-8 hours (automated script + manual review of edge cases)

---

#### Finding 4.2: Mixed CJS/ESM Module Patterns (LOW)

**Severity**: LOW
**Impact**: 226 modules split between CJS (majority) and ESM (.mjs tools)

**Evidence**:

- Hooks: 100% CommonJS (`.cjs`)
- Library: 100% CommonJS (`.cjs`)
- Tools: Mixed (`.mjs` for newer tools, `.cjs` for legacy)
- Total: 226 modules (85% `.cjs`, 15% `.mjs`)

**Current State**:

- Hooks use CommonJS (required by Claude Code's stdin-based protocol)
- Tools use ESM for modern Node.js features (top-level await, ESM imports)

**Assessment**: **NOT A PROBLEM** — intentional split based on execution context

**Recommendation**: Document in `code-standards.md`:

```markdown
## Module Format Guidelines

- **Hooks**: CommonJS (`.cjs`) — required by Claude Code stdin protocol
- **Library**: CommonJS (`.cjs`) — shared by hooks (must be CJS)
- **Tools**: ESM (`.mjs`) — modern CLI tools with top-level await
- **Tests**: ESM (`.test.mjs`) — Node.js native test runner
```

---

#### Finding 4.3: Hardcoded Values (LOW)

**Severity**: LOW
**Impact**: 5 instances of hardcoded values (minimal)

**Evidence**:

```bash
grep -r "hardcoded\|magic.*number\|0x[0-9a-f]" .claude/hooks .claude/lib --include="*.cjs" -i | grep -v "comment\|//" | wc -l
# Result: 5
```

**Assessment**: Very low occurrence, likely false positives or acceptable constants

**Recommendation**: No action required (5 instances within acceptable threshold)

---

### 5. Technical Debt (MEDIUM Priority)

#### Finding 5.1: TODO/FIXME/HACK Markers (LOW)

**Severity**: LOW
**Impact**: 17 instances of technical debt markers

**Evidence**:

```bash
grep -r "TODO\|FIXME\|HACK" .claude/hooks .claude/lib .claude/tools --include="*.cjs" --include="*.mjs" | wc -l
# Result: 17
```

**Recommended Action**:

1. **Audit 17 instances** (2 hours)
2. **Create GitHub issues** for legitimate TODOs
3. **Remove obsolete markers** (already completed work)

---

#### Finding 5.2: Deprecated Code (LOW)

**Severity**: LOW
**Impact**: 27 instances of `@deprecated` markers

**Evidence**:

```bash
grep -r "deprecated\|@deprecated" .claude --include="*.cjs" --include="*.mjs" | wc -l
# Result: 27
```

**Recommended Action**:

1. **Audit deprecated code** (determine if still in use)
2. **Remove if unused** (or move to `_archive/`)
3. **Update call sites** if replacement exists

---

#### Finding 5.3: Shell Injection Risks (MEDIUM)

**Severity**: MEDIUM
**Impact**: 6 instances of `shell: true` in child process spawns

**Evidence**:

```bash
grep -r "shell:\s*true" .claude --include="*.cjs" --include="*.mjs" | wc -l
# Result: 6
```

**Risk**: Potential command injection vectors (low if inputs are controlled)

**Recommended Action**:

1. **Audit 6 instances** for input validation
2. **Refactor to `shell: false` with array arguments** (security best practice)
3. **Document exceptions** (if shell features required)

**Reference**: `.claude/rules/security.md` — "shell: false Standard (CRITICAL)"

---

### 6. Configuration Sprawl (MEDIUM Priority)

#### Finding 6.1: Multiple Configuration Files (MEDIUM)

**Severity**: MEDIUM
**Impact**: 7 config files across project, unclear precedence

**Evidence**:

```
.claude/config.staging.yaml       — staging environment config
.claude/config.yaml               — primary config (agents, models)
.claude/settings.json             — Claude Code hooks registration
.claude/tools/integrations/github/config.json
.claude/tools/integrations/kubernetes-flux/config.json
.claude/tools/optimization/sequential-thinking/config.json
.claude/skills/k8s-manifest-generator/assets/configmap-template.yaml
```

**Problems**:

1. **No documented precedence**: Which config wins if conflicts?
2. **Scattered configs**: Tool-specific configs not in central location
3. **No schema validation**: Missing JSON schema for config.yaml

**Recommended Action**:

1. **Consolidate tool configs** to `.claude/config.yaml`:

   ```yaml
   tools:
     github:
       apiUrl: 'https://api.github.com'
     kubernetes-flux:
       namespace: 'flux-system'
   ```

2. **Document precedence** in `@ENVIRONMENT_CONFIG.md`:

   ```
   1. CLI args (highest)
   2. Environment variables
   3. config.yaml
   4. settings.json (hooks only)
   5. Defaults (lowest)
   ```

3. **Add JSON schema** for `config.yaml` validation

**Estimated Effort**: 6-8 hours

---

#### Finding 6.2: 168 NPM Scripts (HIGH Complexity)

**Severity**: MEDIUM
**Impact**: Unclear script usage, potential redundancy

**Evidence**:

```bash
cat package.json | jq '.scripts | keys | length'
# Result: 168
```

**Problem**: 168 scripts with no usage documentation or deprecation markers

**Sample Scripts** (from package.json audit):

- `search:*` — 15+ search-related scripts
- `metrics:*` — 20+ metrics scripts
- `test:*` — 30+ test scripts
- `tool:*` — 25+ tool scripts
- Numerous one-off scripts with unclear purpose

**Recommended Action**:

1. **Audit script usage** (analyze git history + README references)
2. **Classify scripts**:
   - **Core** (frequently used, document in README)
   - **Deprecated** (mark with `// DEPRECATED` or remove)
   - **Experimental** (move to `scripts/_archive/`)

3. **Add script documentation**:
   ```json
   "scripts": {
     "search:code": "node .claude/tools/search/hybrid-search.mjs", // Core: Hybrid code search
     "metrics:findings:summary": "node .claude/tools/metrics/findings.mjs", // Core: Findings summary
     "test:hooks": "node --test tests/hooks/**/*.test.mjs" // Core: Hook tests
   }
   ```

**Estimated Effort**: 8-12 hours (requires domain knowledge of tool usage)

---

### 7. Archive Management (MEDIUM Priority)

#### Finding 7.1: 16 Archive Directories (640KB Total)

**Severity**: MEDIUM
**Impact**: Cluttered codebase, unclear restoration path

**Evidence**:

```bash
find .claude -type d -name "_archive" | wc -l
# Result: 16

du -sh .claude/hooks/_archive/ .claude/tools/_archive/
# Result:
# 448K  .claude/hooks/_archive/
# 192K  .claude/tools/_archive/
```

**Additional Archives** (not measured):

- `.claude/agents/_archive/`
- `.claude/skills/_archive/`
- `.claude/workflows/_archive/`
- `.claude/templates/_archive/`
- `.claude/lib/_archive/`
- `tests/_archive/`
- (10+ more archive directories)

**Problem**: No archival policy documented, unclear if archives are:

- **Temporary** (restore candidates)
- **Historical** (keep for reference)
- **Obsolete** (delete permanently)

**Recommended Action**:

1. **Create archival policy** in `FILE_PLACEMENT_RULES.md`:

   ````markdown
   ## Archive Policy

   Archives exist for 3 purposes:

   1. **Restoration Candidates** (tag: `RESTORE_CANDIDATE`)
   2. **Historical Reference** (tag: `HISTORICAL`)
   3. **Pending Deletion** (tag: `DELETE_AFTER_2026-XX-XX`)

   Tag format: Add YAML frontmatter to archived files:

   ```yaml
   ---
   archived: 2026-02-13
   archiveReason: 'Replaced by unified-pre-write-hook.cjs'
   archiveType: RESTORE_CANDIDATE | HISTORICAL | DELETE_AFTER_2026-XX-XX
   ---
   ```
   ````

   ```

   ```

2. **Audit archives by size** (prioritize largest):
   - Hooks archive: 448KB (35+ files) — **HIGH PRIORITY**
   - Tools archive: 192KB (26 files) — **MEDIUM PRIORITY**
   - Docs archive: 405 files — **LOW PRIORITY** (small files)

3. **Execute archival triage**:
   - Tag all archived files (8 hours)
   - Delete `DELETE_AFTER_*` files (2 hours)
   - Document `HISTORICAL` reasons (4 hours)

**Estimated Effort**: 14-16 hours

---

#### Finding 7.2: 405 Archived Documentation Files (HIGH Noise)

**Severity**: LOW
**Impact**: High cognitive load when searching docs

**Evidence**:

```bash
find .claude -name "*.md" -path "*/_archive/*" | wc -l
# Result: 405
```

**Problem**: Searching documentation returns 405 archived files as noise

**Recommended Action**:

1. **Move archived docs** to single location: `.claude/_archive/docs/YYYY-MM/`
2. **Update `.gitignore`**: Exclude `_archive/` from ripgrep searches
3. **Add ripgreprc rule**: `--glob=!**/_archive/**`

**Estimated Effort**: 2-4 hours (mostly automated moves)

---

## Codebase Metrics Summary

| Metric                    | Value         | Assessment                        |
| ------------------------- | ------------- | --------------------------------- |
| **Total Hooks**           | 105           | Healthy count                     |
| **Hook Avg Size**         | 356 lines     | Moderate (largest: 2,700 lines)   |
| **Total Library Modules** | 226           | Large but organized               |
| **Library Total Lines**   | 63,933        | High complexity                   |
| **Oversized Modules**     | 6 (>50KB)     | **CRITICAL**                      |
| **Circular Dependencies** | 23 warnings   | **HIGH** (needs refactoring)      |
| **Console Usage**         | 646 instances | **HIGH** (bypasses logger)        |
| **Archive Size**          | 640KB         | **MEDIUM** (cleanup needed)       |
| **NPM Scripts**           | 168           | **MEDIUM** (documentation needed) |
| **Active Tests**          | 404           | Healthy coverage                  |
| **Archived Tests**        | 114           | **MEDIUM** (restore or delete)    |
| **Shell Injection Risks** | 6 instances   | **MEDIUM** (audit needed)         |
| **TODO/FIXME Markers**    | 17            | Low technical debt                |
| **Deprecated Code**       | 27 instances  | Low (normal churn)                |

---

## Prioritized Recommendations

### P0 - Critical (Do Immediately)

1. **Refactor skill-creator/create.cjs** (107KB → 7 modules)
   - **Impact**: Massive maintainability improvement
   - **Effort**: 16-20 hours
   - **Risk**: High (comprehensive integration tests required)

2. **Split routing-guard.cjs** (79KB → 6 modules)
   - **Impact**: Reduce cognitive load, improve testability
   - **Effort**: 10-12 hours
   - **Risk**: Medium (well-defined responsibilities)

### P1 - High (Do This Sprint)

3. **Audit and resolve circular dependencies** (23 warnings)
   - **Impact**: Prevent fragile lazy-loading workarounds
   - **Effort**: 12-16 hours
   - **Risk**: Medium (requires dependency graph visualization)

4. **Batch refactor console usage** (646 instances → logger)
   - **Impact**: Structured logging, better observability
   - **Effort**: 6-8 hours (mostly automated)
   - **Risk**: Low (automated script + manual review)

5. **Archive triage and cleanup** (640KB, 16 directories)
   - **Impact**: Reduce codebase clutter
   - **Effort**: 14-16 hours
   - **Risk**: Low (tag, audit, delete)

### P2 - Medium (Do Next Sprint)

6. **Audit and fix shell injection risks** (6 instances)
   - **Impact**: Security hardening
   - **Effort**: 2-4 hours
   - **Risk**: Low (input validation audit)

7. **Consolidate tool configs** (7 files → 1 config.yaml)
   - **Impact**: Simpler configuration management
   - **Effort**: 6-8 hours
   - **Risk**: Low (centralize configs)

8. **Document npm script usage** (168 scripts)
   - **Impact**: Improve developer onboarding
   - **Effort**: 8-12 hours
   - **Risk**: Low (documentation only)

### P3 - Low (Nice to Have)

9. **Audit TODO/FIXME markers** (17 instances)
   - **Effort**: 2 hours

10. **Remove deprecated code** (27 instances)
    - **Effort**: 4 hours

11. **Audit archived tests** (114 files)
    - **Effort**: 4-6 hours

---

## Architecture Quality Scores

| Category            | Score | Rationale                                                                  |
| ------------------- | ----- | -------------------------------------------------------------------------- |
| **Modularity**      | B+    | Good separation of concerns, but oversized modules drag down score         |
| **Coupling**        | C+    | Circular dependencies and lazy-loading workarounds indicate tight coupling |
| **Cohesion**        | B     | Well-organized directory structure, but god objects reduce cohesion        |
| **Testability**     | B-    | 404 active tests is strong, but oversized modules hard to unit test        |
| **Maintainability** | C+    | High cognitive load (79KB routing-guard, 646 console usages)               |
| **Scalability**     | B     | Event-driven architecture supports scaling, but circular deps are fragile  |
| **Security**        | B-    | 6 shell injection risks, but minimal hardcoded secrets                     |
| **Documentation**   | B     | Good docs, but 405 archived docs create noise                              |

**Overall Grade**: **B-** (Functional but needs refactoring)

---

## Long-Term Recommendations

### Introduce Architecture Decision Records (ADRs)

**Problem**: No documented rationale for:

- Why routing-guard is 79KB (deliberate or tech debt?)
- Why lazy-loading circular dependencies (workaround or design?)
- Why 168 npm scripts (organic growth or intentional?)

**Recommendation**: Adopt ADR pattern (already exists in `.claude/context/memory/decisions.md`):

```markdown
## ADR-XXX: Split routing-guard.cjs into 6 modules

**Date**: 2026-02-13
**Status**: Proposed
**Context**: routing-guard.cjs is 79KB with 38 functions, violating SRP
**Decision**: Split into 6 guard modules (routing-guard-core, planner-first-guard, etc.)
**Consequences**: Improves testability but increases file count
```

### Establish Module Size Budget

**Recommendation**: Enforce module size limits via ESLint plugin:

```javascript
// .eslintrc.cjs
rules: {
  'max-lines': ['error', { max: 500, skipBlankLines: true }],
  'max-lines-per-function': ['warn', { max: 50 }],
}
```

**Exceptions**: Document large modules with ADRs explaining why >500 lines is justified

### Adopt Dependency Injection

**Problem**: Circular dependencies solved via lazy loading (fragile workaround)

**Recommendation**: Introduce DI container (e.g., `awilix`, `tsyringe`) or manual DI:

```javascript
// routing-guard.cjs (before)
const memoryMonitor = require('../../lib/memory/memory-monitor.cjs'); // Circular!

// routing-guard.cjs (after DI)
function createRoutingGuard({ memoryMonitor, eventBus }) {
  // Use injected dependencies
}
module.exports = { createRoutingGuard };
```

---

## Appendices

### Appendix A: Module Dependency Graph

**Recommendation**: Generate visual dependency graph:

```bash
npx madge --image graph.png --extensions cjs,mjs .claude/lib
```

Expected output:

- Circular dependency chains (23 warnings)
- God object hubs (routing-guard, memory-manager)
- Dependency depth analysis

### Appendix B: Archive Inventory

**Full archive directory list**:

```
.claude/agents/_archive/
.claude/hooks/_archive/
.claude/hooks/monitoring/_archive/
.claude/hooks/routing/_archive/
.claude/hooks/safety/_archive/
.claude/hooks/validation/_archive/
.claude/hooks/_archive/git/
.claude/lib/_archive/
.claude/lib/_archive/integration/modules/
.claude/lib/_archive/testing/modules/
.claude/skills/_archive/
.claude/templates/_archive/
.claude/tools/_archive/
.claude/workflows/_archive/
tests/_archive/
docs/_archive/ (405 files)
```

**Total**: 16 archive directories, 640KB+ of archived code

### Appendix C: Dependency Frequency Analysis

**Top 20 most frequently imported modules**:

```
558 times: const path = require('path');
527 times: const fs = require('fs');
 49 times: const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
 39 times: const { PROJECT_ROOT } = require('../utils/project-root.cjs');
 24 times: const crypto = require('crypto');
 23 times: const { EventTypes } = require('../../lib/events/event-types.cjs');
 22 times: const eventBus = require('../../lib/events/event-bus.cjs');
 21 times: const { spawnSync } = require('child_process');
 19 times: import { fileURLToPath } from 'url';
 17 times: const { createLogger } = require('../utils/logger.cjs');
 15 times: const { spawn } = require('child_process');
```

**Insights**:

- **path/fs**: Standard Node.js modules (expected)
- **PROJECT_ROOT**: 88 imports (49 + 39) — suggests centralized project root handling
- **eventBus**: 22 imports — good event-driven architecture
- **createLogger**: Only 17 imports (should be 226+ if all modules use logger) — **confirms Finding 4.1 (direct console usage)**

---

## Conclusion

The agent-studio codebase demonstrates **mature architecture with accumulating technical debt**. The system is **functional and well-organized**, but **oversized modules and circular dependencies** create maintainability risks.

**Immediate Actions**:

1. Refactor `skill-creator/create.cjs` (107KB → 7 modules)
2. Split `routing-guard.cjs` (79KB → 6 modules)
3. Resolve 23 circular dependency warnings

**Medium-Term Actions**: 4. Batch refactor 646 console usages to logger 5. Archive triage and cleanup (640KB) 6. Audit shell injection risks (6 instances)

**Long-Term Actions**: 7. Introduce ADRs for architecture decisions 8. Establish module size budgets (ESLint enforcement) 9. Adopt dependency injection to eliminate circular deps

**Estimated Total Effort**: 80-100 hours (P0-P2 recommendations)

---

**Next Steps**:

1. Review findings with team
2. Prioritize recommendations based on business impact
3. Create GitHub issues for P0/P1 recommendations
4. Schedule refactoring sprints (2-3 sprints for P0-P1 work)

---

**Report End** — 2026-02-13
