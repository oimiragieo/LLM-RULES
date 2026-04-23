<!-- Agent: architect | Task: #4 | Session: 2026-02-13 -->

# Architecture Review Report - Wave 2 Comprehensive Analysis

**Date:** 2026-02-13
**Agent:** architect
**Task:** #4 (Wave 2 - Comprehensive Architecture Review)
**Reviewers:** PM (backlog), Researcher (findings), Architect (this report)
**Scope:** Module coupling, hook architecture, memory subsystem, routing, code indexing, integration automation

---

## Executive Summary

The agent-studio framework demonstrates **strong architectural foundation** with clear separation of concerns and well-designed consolidation patterns, but requires **immediate attention to 3 CRITICAL architectural issues** impacting system reliability and maintainability.

**Overall Assessment:** 🟡 **CONDITIONALLY APPROVED** — Address P0 items before production deployment

### Key Findings

**✅ STRENGTHS:**

1. Hook chain-of-responsibility pattern optimized (6→2 unified hooks, <500ms overhead)
2. Memory facade (ADR-111) reduces cognitive load from 15→4 modules
3. Lazy code indexing eliminates 2+ hour startup cost (BM25 fast path)
4. Routing table simplified (2,472→1,030 lines, 58% reduction, zero regression)

**⚠️ CRITICAL ISSUES (P0):**

1. **C-001:** Circular dependency risk in memory modules (contextual-memory ↔ memory-query)
2. **C-002:** Integration bugs in memory rotation (field name mismatches bypass pruning)
3. **C-003:** Integration queue not processed automatically (70% orphan rate)

**🔴 HIGH PRIORITY (P1):**

1. **H-001:** Hook-to-hook coupling chain (routing-guard → router-state → spawn-prompt-assembler)
2. **H-002:** Memory budget violations (learnings.md 2.65x over 20KB limit)
3. **H-003:** Integration health scoring not calculated (no observability)
4. **H-004:** Configuration sprawl across 6 files (merge conflict risk)
5. **H-005:** Deeply nested conditionals in routing-guard.cjs (6+ levels)

**Architecture Score:** 7.8/10 (GOOD with critical gaps)

---

## 1. Module Coupling & Dependencies

### 1.1 Library Structure Overview

**Total Library Modules:** ~100+ files across 14 subsystems

```
.claude/lib/
├── routing/        (5 modules: routing-table, fuzzy-intent-matcher, semantic-router, pattern-router, agent-registry-resolver)
├── memory/         (15+ modules → 4 facades per ADR-111)
├── code-indexing/  (11 modules: BM25, hybrid search, query analyzer, result ranker)
├── workflow/       (14 modules: state machine, validators, checkpoint manager)
├── utils/          (30+ modules: atomic-write, path-validator, safe-json-parse, etc.)
├── safety/         (5 modules: command-allowlist, validators)
├── monitoring/     (dashboard-renderer, production-alerts, error-tracker)
└── tools/          (7 modules: skill-catalog, task-tools, orchestrator-tool)
```

---

### 🔴 CRITICAL FINDING C-001: Memory Module Circular Dependency Risk

**Evidence:**

```javascript
// File: .claude/lib/memory/contextual-memory.cjs
const memoryQuery = require('./memory-query.cjs');
const memoryExtractor = require('./memory-extractor.cjs');

// File: .claude/lib/memory/memory-query.cjs
const { buildSemanticContext } = require('./contextual-memory.cjs'); // CIRCULAR RISK
```

**Impact:**

- **Refactoring breaks**: Changing one module breaks the other
- **Initialization order fragile**: Depends on Node.js module cache behavior
- **Testability reduced**: Cannot mock cleanly due to cycle
- **Runtime risk**: If require cache cleared, infinite loop possible

**Root Cause:** `buildSemanticContext()` is a shared utility but lives in contextual-memory.cjs (not neutral location).

**Recommendation:**

1. Extract `buildSemanticContext()` to new `.claude/lib/memory/core/memory-utils.cjs`
2. Break cycle: `contextual-memory.cjs` → `memory-utils.cjs` ← `memory-query.cjs`
3. Update imports in both files
4. Add integration test validating no circular imports

**Estimated Effort:** 2 hours
**Priority:** P0 (CRITICAL — prevents future refactoring breakage)

---

### 🟡 HIGH FINDING H-001: Hook → Lib → Hook Coupling Chain

**Evidence:**

```
routing-guard.cjs (hook)
  → require('../../lib/routing/router-state.cjs')
    → router-state exports getRouterMode()
      → spawn-prompt-assembler.cjs (hook) imports router-state
```

**Why This Matters:**
Hooks should be **leaf nodes** in dependency graph. When hook A depends on lib that depends on hook B, we have:

- **Circular dependency risk** (same pattern as C-001)
- **Maintenance burden** (change one hook, check 3 files)
- **Testing complexity** (must mock entire chain)

**Recommendation:**

1. Move `getRouterMode()` from router-state.cjs to new `.claude/lib/routing/routing-utils.cjs`
2. Both hooks import routing-utils (neutral module)
3. Break chain: hooks consume utils, never other hooks

**Estimated Effort:** 1 hour
**Priority:** P1 (HIGH — architectural cleanliness)

---

### 1.3 Dependency Graph Health

**✅ STRENGTH: Clean Subsystem Boundaries**

Most subsystems have clear responsibilities:

- **routing/**: Intent matching, agent selection, routing table
- **safety/**: Input validation, command allowlists, sanitization
- **workflow/**: State machine, phase advancement, quality gates
- **utils/**: Shared utilities (atomic-write, safe-json-parse, path-validator)

**No cross-layer violations found** except H-001 (hook coupling).

---

## 2. Hook Chain Architecture

### 2.1 Hook Execution Performance

**Current Hook Chain (Write operation):**

```
PreToolUse Write:
1. routing-guard.cjs         (~50ms) - 12 checks (router self-check, planner-first, specialist, etc.)
2. unified-creator-guard.cjs (~20ms) - Creator path protection
3. unified-pre-write-hook.cjs (~30ms) - 11 safety checks (path validation, Windows compat)
4. spawn-prompt-validator.cjs (~80ms) - Token budget, compactness calculation

PostToolUse Write:
5. code-index-updater.cjs (~200ms) - Incremental BM25 indexing
6. post-creation-integration.cjs (~50ms) - Queue integration analysis
7. post-tool-metrics-unified.cjs (~30ms) - Metrics collection

TOTAL: ~460ms (worst case)
```

**Performance Budget:** <1000ms
**Status:** ✅ WITHIN BUDGET (460ms / 1000ms = 46%)

---

### 2.2 Hook Consolidation Success

**✅ STRENGTH: Successful Consolidation (Evidence from learnings.md)**

```
Major consolidation: 6 wildcard hooks → 2 unified hooks
- pre-tool-unified.cjs: 11 safety checks consolidated
- post-tool-metrics-unified.cjs: Metrics collection consolidated

Benefits:
- Reduced overhead from 6 sequential checks to 2
- Faster execution
- Simpler maintenance
```

**Verdict:** Hook consolidation is **complete and optimal**. No further merging recommended.

**Rationale:**

- routing-guard.cjs has 12 checks (at upper maintainability limit)
- Further consolidation would create monolithic hooks (anti-pattern)
- Current structure balances performance, maintainability, testability

---

### 🟡 MEDIUM FINDING M-001: Hook Priority Ordering Issue

**Current Registration (settings.json):**

```json
"Edit|Write|NotebookEdit": [
  "unified-creator-guard.cjs",    // Priority 1
  "routing-guard.cjs",            // Priority 2
  "unified-pre-write-hook.cjs"    // Priority 3
]
```

**Issue:** routing-guard Check 1 (router self-check) should fire FIRST to block blacklisted tools before creator guard runs.

**Evidence:** SEC-ROUTER-001 from issues.md indicates routing-guard was recently added to Edit|Write matcher. It should be priority 1 for fail-fast behavior.

**Recommendation:** Reorder to: `routing-guard → unified-creator-guard → unified-pre-write`

**Estimated Effort:** 5 minutes (edit settings.json)
**Priority:** P2 (MEDIUM — correctness improvement, not blocking)

---

## 3. Memory Subsystem Design

### 3.1 Tiered Memory Architecture (ADR-102)

**Design:**

```
HOT tier (.claude/context/memory/)
  ├─ learnings.md (20KB budget, rotates monthly)
  ├─ decisions.md (20KB budget, rotates monthly)
  └─ issues.md (10KB budget, archive resolved)

WARM tier (.claude/context/memory/archive/)
  └─ learnings-YYYY-MM.md (30-day retention)

COLD tier (.claude/context/memory/archive/YYYY/)
  └─ Compressed markdown (indefinite retention)
```

**✅ STRENGTH:** Well-designed tier system prevents unbounded growth (addresses C-003 context budget consumption).

---

### 🔴 CRITICAL FINDING C-002: Integration Bugs in Memory Rotation

**Evidence from learnings.md (2026-02-08):**

```
Task #9 implemented 4 memory management modules with 41 passing unit tests.
Task #13 discovered 2 integration bugs that NO unit test caught:

1. Memory-scheduler assumed `pruneResult.entriesRemoved`
   but smart-pruner returns `pruneResult.removed` (field name mismatch)

2. Memory-scheduler passed `{ similarityThreshold: 0.6 }`
   but smart-pruner expects `{ threshold: 0.6 }` (parameter key mismatch)
```

**Impact:**

- Memory pruning **fails silently** (field name mismatch → undefined → no pruning)
- Deduplication logic **bypassed** (wrong parameter name → falls back to default)
- HOT tier files **exceed budget** → context overflow
- **Root cause pattern:** Unit tests mocked interfaces, not actual implementations

**Why This Is Critical:**

- Validates ADR-103 finding: "Unit Test Isolation Can Hide Integration Bugs"
- Memory subsystem is **core infrastructure** — silent failures accumulate
- 41/41 unit tests passing gave **false confidence**

**Recommendation (per ADR-103):**

1. Add integration tests validating **actual module contracts** (not mocks)
2. Test real pruner + real scheduler interaction
3. Add runtime contract validation (fail loudly on mismatch):
   ```javascript
   const result = smartPruner.deduplicate(entries, { threshold: 0.6 });
   assert(typeof result.removed === 'number', 'Contract violation: missing result.removed');
   ```

**Estimated Effort:** 4 hours
**Priority:** P0 (CRITICAL — memory system correctness)

---

### 🟡 HIGH FINDING H-002: Memory Budget Violations

**Current Usage (from learnings.md):**

```
Active memory footprint: ~82KB total
- learnings.md: 53KB (EXCEEDS 20KB budget by 2.65x)
- decisions.md: ~15KB (within budget)
- issues.md: ~14KB (exceeds 10KB budget by 1.4x)
```

**Impact:**

- **Context window pressure**: 30-40% of 200K token budget consumed
- **Attention degradation**: "Lost in the middle" problem at 130K+ tokens (2026 research)
- **Rotation not triggering**: Memory rotator has integration bugs (C-002)

**Root Cause:** Automatic rotation disabled after discovering integration bugs in Task #13.

**Recommendation:**

1. **Immediate (P1):** Manually rotate learnings.md NOW (split to `learnings-2026-02.md` archive)
2. **Short-term (P0):** Fix integration bugs (C-002) to re-enable automatic rotation
3. **Long-term (P2):** Add rotation trigger in sync-memory-index.cjs hook

**Estimated Effort:** 2 hours (manual rotation) + 4 hours (fix bugs)
**Priority:** P1 (HIGH — context quality degradation)

---

### 3.4 Memory Facade API Quality

**Current API (ADR-111):**

```javascript
const { readMemory, writeMemory } = require('.claude/lib/memory/core/index.cjs');

// Read (searches HOT → WARM → COLD)
const learnings = await readMemory('learnings');

// Write (appends to HOT tier)
await writeMemory('learnings', 'New pattern: ...');
```

**✅ STRENGTH:** Ergonomic facade reduces 15 modules → 4 clear layers:

- `memory-storage.cjs` (read/write files)
- `memory-query.cjs` (search, entity-query)
- `memory-extraction.cjs` (extractor + writer merged)
- `memory-lifecycle.cjs` (retention, rotation, dedup)

**No issues found.**

---

## 4. Agent Spawn & Routing Architecture

### 4.1 Routing Table Design

**Current Structure:**

```javascript
// routing-table.cjs (1,030 lines, simplified from 2,472)
ROUTING_TABLE: {
  bug: 'developer',
  test: 'qa',
  security: 'security-architect',
  // ...
}

INTENT_KEYWORDS: {
  developer: ['bug', 'fix', 'code'],  // Reduced from 50+ to 3-5
  qa: ['test', 'quality'],
  // ...
}

DISAMBIGUATION_RULES: {
  // Conflict resolution
}
```

**✅ STRENGTH:** Simplified via ADR-107 (58% reduction, zero regression)

**Evidence:**

```
Routing Table Simplification (Adopted from pro-workflow):
- LLMs don't need exhaustive keyword lists
- Result: 2,472 → 1,030 lines (58% reduction) with identical routing
- 74 equivalence tests ensure no behavior change
```

**Verdict:** Routing table is **well-optimized**. No further action needed.

---

### 🟡 MEDIUM FINDING M-002: Fuzzy Intent Matcher Lacks Metrics

**Current Implementation:**

- fuzzy-intent-matcher.cjs uses Jaccard coefficient for semantic similarity
- Falls back to ROUTING_TABLE on low confidence
- **No telemetry** tracking accuracy, usage frequency, confidence distribution

**Issue:** Cannot validate if fuzzy matcher is actually beneficial.

**Recommendation:**

1. Add metric logging: `fuzzy_match_used: true/false`, `confidence_score: 0-1`
2. Track accuracy (was correct agent selected?) via post-task validation
3. Review quarterly: if <70% accuracy, deprecate feature

**Estimated Effort:** 4 hours
**Priority:** P2 (MEDIUM — observability improvement)

---

### 4.3 Spawn Prompt Assembly Pipeline

**Current Pipeline:**

```
1. Load template (universal-agent-spawn.md)
2. Substitute placeholders (<ROLE>, <TASK>, <ID>)
3. Inject sections (AVAILABLE_TOOLS, Memory, Task context)
4. Sanitize prompt (block instruction override patterns)
5. Validate token budget (spawn-prompt-validator.cjs)
```

**✅ STRENGTH:** Security hardened per learnings.md (HIGH-003 fix):

```
Spawn Prompt Sanitization:
- Created sanitizeTaskPrompt() function
- Blocks instruction override patterns (IGNORE PREVIOUS INSTRUCTIONS)
- Escapes system-like markdown headers
```

**No issues found.**

---

## 5. Code Indexing & Search

### 5.1 BM25-Only vs Hybrid Search Architecture

**Design:**

```
Hybrid Search Daemon (optional):
├─ BM25 text search (ripgrep-based, <0.5s)
├─ Semantic embeddings (LanceDB, <1.5s)
└─ RRF fusion (reciprocal rank fusion)

BM25-Only Fast Path (default):
└─ Sync fast-path bypasses async pipeline
   → 1330 files in 19.5s, 120MB peak RSS
```

**✅ STRENGTH:** Lazy indexing eliminates upfront cost

**Performance Comparison (from learnings.md):**

```
| Approach           | Startup   | First Search | Memory | Disk   |
| Old Batch Indexing | 2+ hours  | Instant      | 8-16GB | 2-5GB  |
| Hybrid Lazy Search | 0 seconds | ~0.5s        | <500MB | <100MB |
```

**Verdict:** BM25-only mode is **optimal for 40k+ file codebases**.

---

### 🟡 MEDIUM FINDING M-003: Daemon Prewarm Not Automated

**Issue:** Prewarm must be manually invoked (`pnpm search:daemon:prewarm`). Cold daemon first query: 1.35s (3.4x slower than prewarmed 0.40s).

**Recommendation:**

- Add auto-prewarm on first search query (lazy trigger)
- OR prewarm in background during session startup (non-blocking)

**Estimated Effort:** 2 hours
**Priority:** P2 (MEDIUM — UX improvement)

---

## 6. Integration Automation Gap

### 🔴 CRITICAL FINDING C-003: Integration Queue Not Processed Automatically

**Current State (CLAUDE.md Section 0):**

```
STEP 0.5 — CHECK INTEGRATION QUEUE:
If `.claude/context/runtime/integration-queue.jsonl` has unprocessed entries,
spawn artifact-integrator in background (non-blocking).
```

**Issue:** This is a **SHOULD** directive, not automated. Router can skip Step 0.5.

**Evidence:**

```
Task #22 Integration Health Score: 65% (Gaps category)
Missing: artifact-graph.json registration, tool-catalog.md status update

Orphan Rate: 70%+ (354/454 skills never cataloged)
```

**Impact:**

- Artifacts created but **never integrated** → invisible to Router/agents
- Integration gaps **accumulate over time** (70% orphan rate)
- Manual router step easily forgotten

---

### Recommended Architecture

```javascript
// .claude/hooks/workflow/post-creation-integration.cjs (PostToolUse TaskUpdate)

// Existing: Queue creation
if (isCreatorCompletion(metadata)) {
  queueIntegrationAnalysis(taskId, artifactPaths);
}

// NEW: Auto-spawn artifact-integrator when queue exceeds threshold
const queueSize = getQueueSize('.claude/context/runtime/integration-queue.jsonl');
if (queueSize >= INTEGRATION_BATCH_SIZE) {
  // e.g., 5 entries
  spawnArtifactIntegrator({ mode: 'batch', maxEntries: queueSize });
}
```

**Benefits:**

- **Automated processing** (no manual router step)
- **Batched analysis** (process 5-10 entries → efficiency)
- **Non-blocking** (runs in background via Task tool)
- **Threshold-based** (only spawns when queue accumulates)

**Estimated Effort:** 6 hours
**Priority:** P0 (CRITICAL — addresses 70% orphan rate root cause)

---

### 🟡 HIGH FINDING H-003: Integration Health Scoring Not Calculated

**Evidence from issues.md:**

```
Issue: artifact-integrator skill processes queue but does not calculate
integration health scores per ADR-100 Step 4.5.

Impact: Cannot track improvement over time, no RBT diagnosis for gaps.
```

**Recommendation:**

1. Update artifact-integrator skill to invoke `quickIntegrationCheck(artifactId)` for each artifact
2. Include health score in task completion metadata
3. Add integration-health-dashboard.cjs tracking orphan rate trend

**Estimated Effort:** 4 hours
**Priority:** P1 (HIGH — observability)

---

## 7. Configuration Sprawl

### 🟡 HIGH FINDING H-004: Configuration Spread Across 6 Files

**Current Files:**

1. `.claude/settings.json` (hook registration, 39 hooks)
2. `.claude/config.yaml` (agent models, enforcement modes)
3. `.env` (environment variables, kill switches)
4. `package.json` (CLI tool wiring, npm scripts)
5. `.claude/lib/utils/environment.cjs` (env var defaults)
6. `.claude/context/runtime/workflow-state.json` (runtime state)

**Evidence from learnings.md:**

```
Configuration Sprawl (6+ config locations):
- No single source of truth
- Impact: Merge conflicts, developer confusion, inconsistent behavior
```

**Impact:**

- **Merge conflict risk** (6 files change frequently)
- **Developer confusion** (where to set enforcement mode?)
- **Inconsistent defaults** (environment.cjs vs config.yaml discrepancies)

**Recommendation (from ADR-085):**
Configuration Consolidation — 6 files → 2 files (config.yaml + .env)

**Estimated Effort:** 2 weeks
**Priority:** P1 (HIGH — maintainability)

---

## 8. Code Quality - Routing Guard Complexity

### 🟡 HIGH FINDING H-005: Deeply Nested Conditionals

**Evidence (routing-guard.cjs Check 2):**

```javascript
function checkPlannerFirst(toolInput, state) {
  if (isRouterMode(state)) {
    // Level 1
    if (toolInput.complexity === 'HIGH' || toolInput.complexity === 'EPIC') {
      // Level 2
      if (!state.plannerSpawned) {
        // Level 3
        if (!state.hasExplicitOverride) {
          // Level 4
          if (getEnforcementMode('PLANNER_FIRST_ENFORCEMENT') === 'block') {
            // Level 5
            if (!dedupe.dedupe) {
              // Level 6
              return { allow: false, message: '...' };
            }
          }
        }
      }
    }
  }
  return { allow: true };
}
```

**Metrics:**

- **Nesting depth:** 6 levels (exceeds recommended 3-4)
- **Cyclomatic complexity:** ~8-10 (exceeds recommended 5)
- **Total lines:** 12 checks × ~150 lines/check = ~1,800 lines

**Impact:**

- **Hard to test**: 2^6 = 64 conditional paths per check
- **Hard to understand**: High cognitive load
- **Refactoring risk**: Change one condition → break entire check

**Recommendation:**
Extract guards with early return pattern:

```javascript
function checkPlannerFirst(toolInput, state) {
  if (!isRouterMode(state)) return { allow: true };
  if (toolInput.complexity !== 'HIGH' && toolInput.complexity !== 'EPIC') return { allow: true };
  if (state.plannerSpawned) return { allow: true };
  if (state.hasExplicitOverride) return { allow: true };
  if (getEnforcementMode('PLANNER_FIRST_ENFORCEMENT') !== 'block') return { allow: true };
  if (dedupe.dedupe) return { allow: true };

  return { allow: false, message: '...' };
}
```

**Estimated Effort:** 8 hours (refactor all 12 checks)
**Priority:** P1 (HIGH — maintainability + testability)

---

## 9. Summary of Findings

### Critical (P0 - Fix Immediately)

| ID    | Finding                              | Impact             | Effort  |
| ----- | ------------------------------------ | ------------------ | ------- |
| C-001 | Circular dependency (memory modules) | Refactoring breaks | 2 hours |
| C-002 | Integration bugs (memory rotation)   | Context overflow   | 4 hours |
| C-003 | Integration queue not automated      | 70% orphan rate    | 6 hours |

**Total P0 Effort:** 12 hours

---

### High Priority (P1 - Fix This Week)

| ID    | Finding                        | Impact                    | Effort  |
| ----- | ------------------------------ | ------------------------- | ------- |
| H-001 | Hook → Lib → Hook coupling     | Maintenance burden        | 1 hour  |
| H-002 | Memory budget violations       | Context pressure          | 2 hours |
| H-003 | Integration health not tracked | No trend visibility       | 4 hours |
| H-004 | Configuration sprawl (6 files) | Merge conflicts           | 2 weeks |
| H-005 | Deeply nested routing-guard    | Maintainability + testing | 8 hours |

**Total P1 Effort:** ~3 weeks

---

### Medium Priority (P2 - Next Sprint)

| ID    | Finding                      | Impact                | Effort  |
| ----- | ---------------------------- | --------------------- | ------- |
| M-001 | Hook registration order      | Correctness           | 5 mins  |
| M-002 | Fuzzy matcher lacks metrics  | Observability gap     | 4 hours |
| M-003 | Daemon prewarm not automated | UX (first query slow) | 2 hours |

**Total P2 Effort:** ~6 hours

---

## 10. Strengths

**✅ Well-Designed Patterns:**

1. **Hook consolidation** (6→2) — Performance improved, overhead reduced
2. **Memory facade** (ADR-111) — 15→4 modules, cognitive load reduced
3. **Lazy indexing** (BM25 fast path) — 0s startup vs 2+ hours batch
4. **Routing table simplification** (58% reduction) — Same behavior, less code
5. **Spawn prompt sanitization** — Instruction override patterns blocked

---

## 11. Architecture Quality Score

**Overall: 7.8/10** (GOOD, with critical gaps)

| Dimension              | Score | Rationale                                          |
| ---------------------- | ----- | -------------------------------------------------- |
| Separation of Concerns | 8/10  | Well-layered (lib/hooks/tools), minor coupling     |
| Maintainability        | 7/10  | Deep nesting, config sprawl                        |
| Performance            | 8/10  | Hook overhead <500ms, lazy indexing optimal        |
| Testability            | 7/10  | Integration bugs found (unit tests insufficient)   |
| Security               | 8/10  | Spawn sanitization, shell hardening, safeParseJSON |
| Scalability            | 9/10  | Lazy indexing, tiered memory, BM25 fast path       |
| Observability          | 6/10  | Missing integration health, fuzzy matcher metrics  |

**Blockers to 9/10:**

- Configuration sprawl (6 files)
- Deep nesting in routing-guard (6+ levels)
- Integration queue manual processing
- Missing integration health tracking

---

## 12. Recommendations

### P0 (This Week — 12 hours)

1. **Fix memory circular dependency** (C-001, 2h) — Extract `buildSemanticContext()` to neutral module
2. **Fix memory rotation bugs** (C-002, 4h) — Add integration tests, validate contracts
3. **Automate integration queue** (C-003, 6h) — Batch-spawn artifact-integrator at threshold

### P1 (This Month — 3 weeks)

4. **Break hook coupling** (H-001, 1h) — Move `getRouterMode()` to routing-utils
5. **Rotate learnings.md manually** (H-002, 2h) — Split to archive, fix integration bugs
6. **Add integration health scoring** (H-003, 4h) — Invoke `quickIntegrationCheck()` in artifact-integrator
7. **Plan configuration consolidation** (H-004, 2 weeks) — Design 6→2 file migration (ADR required)
8. **Refactor routing-guard nesting** (H-005, 8h) — Extract guards, reduce nesting to <4 levels

### P2 (Next Quarter — 6 hours)

9. **Reorder hook registration** (M-001, 5min) — routing-guard first for Edit|Write
10. **Add fuzzy matcher metrics** (M-002, 4h) — Track accuracy, confidence
11. **Automate daemon prewarm** (M-003, 2h) — Lazy trigger on first query

---

## 13. Deployment Verdict

**CONDITIONALLY APPROVED** — Address P0 items before production deployment

**Risk Assessment:**

- **P0 not addressed:** HIGH RISK (context overflow, 70% orphan rate, refactoring breaks)
- **P0 addressed, P1 deferred:** MEDIUM RISK (acceptable for MVP, address in 4 weeks)
- **P0+P1 addressed:** LOW RISK (production-ready)

**Path to 9/10:**

- Address P0+P1 items (4 weeks effort)
- Configuration consolidation (ADR-085)
- Integration automation (C-003)

---

**End of Report**

**Next Steps:**

1. Review findings with team
2. Prioritize P0 fixes (12 hours this week)
3. Schedule P1 fixes (3-week sprint)
4. Create ADR for configuration consolidation (H-004)
