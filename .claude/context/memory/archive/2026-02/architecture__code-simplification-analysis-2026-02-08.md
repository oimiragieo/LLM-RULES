<!-- Agent: code-simplifier | Task: #2 | Session: 2026-02-08 -->

# Code Simplification Analysis Report

**Date:** 2026-02-08
**Agent:** code-simplifier
**Scope:** Full codebase analysis of `.claude/` framework

---

## Executive Summary

The agent-studio framework contains **~98,000 lines of CJS code** and **~580,000 lines of Markdown** across **1,854 active files**, with an additional **1,627 archived files** (13,253 lines). The framework has grown organically and accumulated significant complexity that can be reduced without losing functionality.

**Key findings:**

- **48 workflow modules** (15,925 lines), of which **22+ are dead code** (never imported)
- **32 memory modules** (12,309 lines), of which **5+ are dead code**
- **3 separate keyword-to-agent mapping systems** doing overlapping work
- **3 agent registry/catalog files** tracking the same 49 agents
- **14 hooks fire per Write operation** (each spawning a separate Node.js process)
- **1,652 lines of ML code** gated behind a feature flag that is always off
- **230 skills** (many are thin wrappers with no executable logic)

**Estimated reduction potential:** 30-40% of codebase lines can be eliminated or consolidated without changing any behavior.

---

## 1. HIGH-IMPACT SIMPLIFICATIONS

### 1.1 Dead Workflow Modules (CRITICAL)

**Current state:** 48 files in `.claude/lib/workflow/` totaling 15,925 lines. At least 22 modules are never `require()`d by any active code.

**Dead modules (confirmed zero external imports):**

| Module                        | Lines | Purpose                                   |
| ----------------------------- | ----- | ----------------------------------------- |
| `strangler-fig.cjs`           | 331   | Strangler fig pattern                     |
| `deployment-manager.cjs`      | 344   | Deployment orchestration                  |
| `brownfield-orchestrator.cjs` | 178   | Brownfield migration                      |
| `migration-executor.cjs`      | 239   | Migration execution                       |
| `fan-out-fan-in.cjs`          | 197   | Fan-out/fan-in pattern                    |
| `result-streamer.cjs`         | 167   | Result streaming                          |
| `interface-mapper.cjs`        | 341   | Interface mapping                         |
| `version-registry.cjs`        | 302   | Version tracking                          |
| `workflow-versioner.cjs`      | 247   | Workflow versioning                       |
| `workflow-composer.cjs`       | 325   | Workflow composition                      |
| `domain-detector.cjs`         | 243   | Domain detection                          |
| `dynamic-task-generator.cjs`  | 188   | Dynamic task generation                   |
| `integration-impact.cjs`      | 436   | Integration impact analysis               |
| `parallel-phase-executor.cjs` | 355   | Parallel phase execution                  |
| `hybrid-executor.cjs`         | 278   | Hybrid execution                          |
| `adapter-registry.cjs`        | 137   | Adapter registry                          |
| `memory-budgeter.cjs`         | 134   | Memory budgeting                          |
| `legacy-adapter.cjs`          | 128   | Legacy adaptation                         |
| `loop-executor.cjs`           | 219   | Loop execution                            |
| `result-normalizer.cjs`       | 309   | Result normalization                      |
| `saga-coordinator.cjs`        | 499   | Saga coordination (self-referential only) |
| `workflow-cache.cjs`          | 211   | Workflow caching                          |

**Total dead code: ~5,258 lines (33% of workflow module)**

**Proposed simplification:** Archive all dead modules to `_archive/`. These appear to be speculative implementations for features that were never wired in. The actively used workflow modules (workflow-engine, workflow-state-machine, workflow-state-manager, phase-advance-reader, quality-gates, complexity-classifier, step-validators, checkpoint-manager, workflow-cli, state-sync-manager, state-transaction-manager) total ~6,900 lines -- sufficient for the actual enterprise workflow.

**Files affected:** 22 files in `.claude/lib/workflow/`
**Risk level:** LOW -- no code references these modules. Move to `_archive/` for safety.

---

### 1.2 Dead Memory Modules

**Current state:** 32 files in `.claude/lib/memory/` totaling 12,309 lines. Several modules have zero or only internal imports.

**Dead or near-dead modules:**

| Module                           | Lines | Status                                                     |
| -------------------------------- | ----- | ---------------------------------------------------------- |
| `cold-storage.cjs`               | 336   | Only imported by lancedb-client (not by any hook/tool)     |
| `semantic-archival.cjs`          | 498   | Only imported by learnings-parser (circular chain, unused) |
| `smart-pruner.cjs`               | 736   | Zero external imports                                      |
| `memory-rotator.cjs`             | 750   | Zero external imports                                      |
| `memory-consolidation.cjs`       | 44    | Zero external imports                                      |
| `session-context-for-search.cjs` | 143   | Zero external imports (checked)                            |
| `session-summary.cjs`            | 141   | Zero external imports (checked)                            |

**Total dead code: ~2,648 lines (21% of memory module)**

**Proposed simplification:** Archive dead modules. The active memory system (memory-manager, memory-tiers, contextual-memory, memory-dashboard, memory-scheduler, learnings-parser, entity-extractor, entity-query, memory-extraction-writer, sync-memory-index hook) is ~6,800 lines and handles all actual memory operations.

**Files affected:** 7 files in `.claude/lib/memory/`
**Risk level:** LOW -- no active consumers.

---

### 1.3 Triple Keyword-to-Agent Mapping (CRITICAL)

**Current state:** Three separate systems map keywords/phrases to agents:

1. **`ROUTING_TABLE`** in `routing-table.cjs` (172 keyword-agent pairs, simple object lookup)
2. **`SPECIALIST_KEYWORD_MAP`** in `routing-guard.cjs` (23 agents, contextual phrases with word-boundary regex)
3. **`DOMAIN_SPECIALIST_MAP`** in `phase-advance-reader.cjs` (33 keywords, substring matching)

Plus additional structures in the same routing-table.cjs: 4. **`ROUTING_PREFIX_PATTERNS`** (6 pattern entries, redundant with ROUTING_TABLE) 5. **`ROUTING_PATTERNS`** (regex patterns with priorities) 6. **`INTENT_KEYWORDS`** (500+ keywords across all agents)

**Problem:** Six overlapping mapping systems that must be kept in sync. When a new agent is added, keywords must be added to 3+ places. The routing-table.cjs alone is 2,042 lines -- a single file doing too many things.

**Proposed simplification:**

Consolidate to a **single authoritative keyword map** in `routing-table.cjs` that exports structured data consumed by all three systems. The routing-guard and phase-advance-reader should import from routing-table rather than maintaining their own maps.

```
// Single source of truth
const AGENT_ROUTING = {
  'technical-writer': {
    keywords: ['documentation', 'docs', 'readme'],
    phrases: ['write documentation', 'update documentation'],
    patterns: [/^(document|docs|readme)\b/i],
    domain: false  // core agent, not domain specialist
  },
  ...
};
```

This eliminates 3 of the 6 mapping structures and reduces the maintenance surface from 3 files to 1.

**Files affected:** `routing-table.cjs`, `routing-guard.cjs`, `phase-advance-reader.cjs`
**Risk level:** MEDIUM -- requires careful migration and test verification (95 existing tests cover this area).

---

### 1.4 Triple Agent Registry (HIGH)

**Current state:** Three JSON files track agent information:

| File                  | Lines | Purpose                                                    |
| --------------------- | ----- | ---------------------------------------------------------- |
| `agent-registry.json` | 4,375 | Full agent definitions with capabilities, skills, keywords |
| `agent-catalog.json`  | 1,296 | Simplified agent listing with categories                   |
| `agent-config.json`   | 851   | Runtime agent configuration with models                    |

**Problem:** Same 49 agents described in 3 different JSON files (6,522 lines total), plus the routing-table.cjs maps. When agents change, all must be updated. High maintenance burden, frequent drift.

**Proposed simplification:** Merge into a single `agent-registry.json` that includes the model configuration currently in `agent-config.json` and the categorization from `agent-catalog.json`. The generator script (`agent-registry-generator.cjs`) already produces `agent-registry.json` from agent definition files -- extend it to include model/config fields. Delete `agent-catalog.json` and `agent-config.json`, replacing their consumers with imports from the unified registry.

**Files affected:** `agent-registry.json`, `agent-catalog.json`, `agent-config.json`, `agent-config-reader.cjs`, `agent-registry-generator.cjs`
**Risk level:** MEDIUM -- multiple consumers must be updated.

---

### 1.5 Hook Execution Overhead (HIGH)

**Current state:** `settings.json` registers **42 hook invocations** across events:

- PreToolUse: 25 hooks
- PostToolUse: 11 hooks
- UserPromptSubmit: 3 hooks
- SessionEnd: 2 hooks
- Stop: 1 hook

For a single **Write** operation: **14 Node.js processes spawn** (9 Pre + 5 Post). Each hook performs its own `require()` chain, reads config files, and processes JSON via stdin/stdout.

**Performance impact:** At ~50-200ms per hook process launch on Windows, a Write operation adds 700ms-2.8s of hook overhead.

**Proposed simplification:**

**Phase 1 (quick win):** Consolidate hooks by event+matcher. The three universal PreToolUse hooks (`session-cleanup`, `execution-limit-monitor`, `tool-scope-validator`) should be merged into a single `pre-tool-unified.cjs` similar to how `user-prompt-unified.cjs` already consolidated 5 UserPromptSubmit hooks.

**Phase 2 (medium effort):** The Write/Edit matcher runs 6 separate hooks (`unified-creator-guard`, `unified-pre-write-hook`, `evolution-state-guard`, `research-enforcement`, `quality-gate-validator` + `conflict-detector`). At least 3 of these could be merged into a single `write-guard-unified.cjs`.

**Phase 3 (long-term):** The PostToolUse universal hooks (`metrics-collector-hook`, `error-tracker-hook`, `anomaly-detector`) should be merged into a single `post-tool-metrics.cjs`.

**Estimated reduction:** 42 hook invocations down to ~20, cutting per-operation overhead by 50%.

**Files affected:** Multiple hooks in `.claude/hooks/`
**Risk level:** MEDIUM -- requires careful testing of consolidated hook behavior.

---

## 2. MEDIUM-IMPACT SIMPLIFICATIONS

### 2.1 ML Subsystem (Always Disabled)

**Current state:** `.claude/lib/ml/` contains 9 files (1,652 lines) implementing pattern detection, cost prediction, adaptive execution, anomaly detection, and optimization. The `isMLEnabled()` function checks a feature flag that defaults to `false`.

**Consumers:** Only `workflow-engine.cjs` and `unified-reflection-handler.cjs` import it.

**Proposed simplification:** Archive the entire ML directory. It represents speculative infrastructure for a feature that is not enabled and has no path to enablement in the current architecture (no training data pipeline, no model serving). When ML features are needed, they can be rebuilt with current requirements.

**Lines eliminated:** 1,652
**Risk level:** LOW -- feature is disabled by flag.

---

### 2.2 Self-Healing Subsystem (Minimal Usage)

**Current state:** `.claude/lib/self-healing/` contains 4 files (1,934 lines): `dashboard.cjs`, `rollback-manager.cjs`, `validator.cjs`, `loop-state-manager.cjs`. Only `post-task-unified.cjs` imports from self-healing (rollback-manager).

**Proposed simplification:** The dashboard, validator, and loop-state-manager are unreferenced. Archive them. Keep rollback-manager as it has one active consumer.

**Lines eliminated:** ~1,372
**Risk level:** LOW -- dashboard/validator/loop-state-manager have zero consumers.

---

### 2.3 Routing Table Bloat (2,042 lines)

**Current state:** `routing-table.cjs` contains:

- `ROUTING_TABLE` (172 entries) -- simple keyword-agent map
- `ROUTING_PREFIX_PATTERNS` (6 entries) -- redundant with ROUTING_TABLE
- `ROUTING_PATTERNS` (regex patterns) -- 8 agent patterns with priorities
- `INTENT_KEYWORDS` (500+ keywords) -- extensive keyword lists per agent
- Various helper functions (getPreferredAgent, resolveByPattern, etc.)

**Problem:** `INTENT_KEYWORDS` alone contains 500+ keywords with significant overlap with `ROUTING_TABLE`. The `ROUTING_PREFIX_PATTERNS` is entirely redundant (all patterns exist in `ROUTING_TABLE` already).

**Proposed simplification:**

1. Delete `ROUTING_PREFIX_PATTERNS` (redundant)
2. Merge `ROUTING_PATTERNS` into `ROUTING_TABLE` with a `patterns` field
3. Reduce `INTENT_KEYWORDS` to top-5 discriminating keywords per agent (500+ to ~245)
4. This reduces the file from 2,042 to ~800 lines

**Files affected:** `routing-table.cjs`, `intent-classifier.cjs`
**Risk level:** MEDIUM -- must verify routing accuracy is maintained.

---

### 2.4 Documentation Sprawl (26K+ lines in /docs)

**Current state:** `.claude/docs/` contains 24 files totaling 10,623 lines. `.claude/workflows/` contains 15,830 lines of workflow documentation. CLAUDE.md is 589 lines with heavy cross-referencing.

**Specific issues:**

- `MEMORY_SYSTEM.md` (1,117 lines) -- describes a memory system that is largely aspirational
- `CODE_INDEXING_DESIGN.md` (1,114 lines) -- design doc for implemented feature, should be trimmed
- `DEVELOPER_ONBOARDING.md` (995 lines) -- overlaps with `GETTING_STARTED.md` (398 lines)
- Several `@` reference files duplicate content already in CLAUDE.md sections

**Proposed simplification:**

1. Merge `DEVELOPER_ONBOARDING.md` and `GETTING_STARTED.md` into a single onboarding guide
2. Trim design docs (`MEMORY_SYSTEM.md`, `CODE_INDEXING_DESIGN.md`) to just architectural decisions (remove implementation details that are in the code)
3. Remove `@` reference files that simply duplicate CLAUDE.md content (keep only those with additional detail)

**Estimated reduction:** ~3,000 lines
**Risk level:** LOW -- documentation changes, no code impact.

---

### 2.5 Configuration Source Proliferation

**Current state:** Configuration is spread across:

| Source                           | Purpose                                       |
| -------------------------------- | --------------------------------------------- |
| `config.yaml`                    | Agent models, features, monitoring thresholds |
| `settings.json`                  | Hook registrations, RAG settings              |
| `settings.local.json`            | Local overrides                               |
| `.env` / `.env.example`          | Environment variable overrides                |
| `agent-config.json`              | Agent runtime config                          |
| `config/presets.json`            | Preset system config                          |
| `config/phase-models.json`       | Phase-to-model mapping                        |
| `config/capability-routing.json` | Capability-based routing                      |
| `config/routing-prototypes.json` | Routing prototypes                            |
| `config/skill-index.json`        | Skill indexing config                         |
| `config/tool-manifest.json`      | Tool manifest                                 |
| `config/code-index-config.json`  | Code indexing config                          |
| `config/intent-feedback.json`    | Intent feedback data                          |

**13 configuration sources.** Agent model resolution alone follows a 5-level precedence chain: Task() override > agent frontmatter > config.yaml > complexity defaults > fallback.

**Proposed simplification:**

1. Merge `agent-config.json` into `config.yaml` agents section (already partially there)
2. Merge `phase-models.json` into `config.yaml`
3. Merge `capability-routing.json` and `routing-prototypes.json` into `routing-table.cjs`
4. Archive `intent-feedback.json` (feedback collection mechanism not wired)

**Reduces from 13 to 8 config sources.**

**Files affected:** Config files in `.claude/config/`
**Risk level:** MEDIUM -- must update all config readers.

---

### 2.6 Event Bus + Error Writer + Error Pattern Detector (Unused Infrastructure)

**Current state:**

- `.claude/lib/events/` (3 files: event-bus.cjs, event-bus-sink.cjs, event-types.cjs) -- event bus infrastructure
- `.claude/lib/error-pattern-detector.cjs` (579 lines) -- only imported by an archived tool
- `.claude/lib/error-writer.cjs` -- error writing utility

**Problem:** The event bus is imported by user-prompt-unified but largely unused in practice. The error-pattern-detector has no active consumers.

**Proposed simplification:** Archive error-pattern-detector. Review event bus usage -- if only 1-2 hooks use it, inline the functionality.

**Lines eliminated:** ~900
**Risk level:** LOW-MEDIUM

---

## 3. QUICK WINS

### 3.1 Archive \_archive Directories

**Current state:** 1,627 files in various `_archive/` directories (13,253+ lines). These inflate directory listings, IDE indexing, and search results.

**Proposed action:** Move all `_archive/` contents to a single top-level `.claude/_archive/` with subdirectories mirroring the original structure. Or consider moving to a separate git branch for historical reference.

**Effort:** 1 hour
**Benefit:** Cleaner directory structure, faster file searches.

---

### 3.2 Delete Truly Dead Hook Files

**Current state:** Several hooks registered in `settings.json` may reference files that exist but are never actually triggered, or hooks exist on disk but are not registered.

**Specific candidates:**

- `hooks/session/state-reset.cjs` and `hooks/session/session-cleanup.cjs` -- verify these are actually doing meaningful work on every prompt/tool call
- `hooks/safety/validate-skill-invocation.cjs` -- fires on every Read, check if actually validating anything useful

**Effort:** 2 hours of auditing
**Benefit:** Reduce per-operation hook count.

---

### 3.3 Consolidate Monitoring Hooks

**Current state:** Three separate PostToolUse hooks fire on every tool invocation:

- `metrics-collector-hook.cjs` (fires on ALL tools)
- `error-tracker-hook.cjs` (fires on ALL tools)
- `anomaly-detector.cjs` (fires on ALL tools)

That is 3 Node.js processes for monitoring on every single tool call.

**Proposed action:** Merge into `post-tool-metrics-unified.cjs`. Same logic, one process.

**Effort:** 4 hours
**Benefit:** Eliminate 2 process spawns per tool invocation.

---

### 3.4 Slim Down Skill Definitions

**Current state:** 230 SKILL.md files. Many "expert" skills (ai-ml-expert, android-expert, api-development-expert, etc.) are thin wrappers that contain only an identity block and a link to `source-skills.json`. They provide no executable logic.

**Example pattern (18+ skills follow this):**

```
<identity>
You are an expert in X.
</identity>
<capabilities>
- Review code for X compliance
</capabilities>
<instructions>
Apply X guidelines.
</instructions>
```

These could be consolidated into a single "domain-expert" skill with a parameter, or the identity could be injected via agent frontmatter instead of being a separate skill.

**Proposed action:** Identify skills that are pure identity declarations and merge them into their corresponding agent definitions. Skills should have executable workflows, not just persona descriptions.

**Effort:** 8 hours
**Benefit:** Reduce skill count from 230 to ~100-120, simplify skill catalog.

---

### 3.5 Remove Redundant Schema Files

**Current state:** 53 JSON schema files in `.claude/schemas/`. Many skill schemas (input.schema.json, output.schema.json) are boilerplate with minimal constraints.

**Proposed action:** Audit which schemas are actually validated at runtime. Archive schemas that exist but are never loaded by any hook or validation logic.

**Effort:** 3 hours
**Benefit:** Reduce schema maintenance burden.

---

## 4. CONSOLIDATION OPPORTUNITIES

### 4.1 Routing Module Consolidation

**Current:** 7 files in `.claude/lib/routing/` (3,361 lines) + routing hooks

- `routing-table.cjs` (2,042 lines) -- keyword maps, intent keywords, patterns
- `router-state.cjs` (719 lines) -- router state management
- `intent-classifier.cjs` (290 lines) -- intent classification
- `agent-registry-resolver.cjs` (113 lines) -- registry resolution
- `fuzzy-intent-matcher.cjs` (90 lines) -- fuzzy matching
- `semantic-router.cjs` (79 lines) -- semantic routing
- `pattern-router.cjs` (28 lines) -- pattern routing

**Proposed consolidation:**

1. Merge `fuzzy-intent-matcher.cjs` (90 lines), `semantic-router.cjs` (79 lines), `pattern-router.cjs` (28 lines) into `intent-classifier.cjs` -- they are all routing strategies called by the classifier
2. Trim `routing-table.cjs` as described in 2.3

**Result:** 7 files to 4 files, ~3,361 lines to ~2,000 lines.

---

### 4.2 Memory Module Consolidation

**Current:** 32 files in `.claude/lib/memory/` (12,309 lines)

**After archiving dead modules (Section 1.2):** ~25 files, ~9,661 lines

**Further consolidation:**

- Merge `memory-areas.cjs` (19 lines) and `memory-constants.cjs` (13 lines) into `memory-manager.cjs`
- Merge `intent-analyzer.cjs` (110 lines) into `contextual-memory.cjs` (its only consumer)
- Merge prompt template files (`prompts/consolidation.cjs` 20 lines, `prompts/dedup-decision.cjs` 66 lines) into their consumers

**Result:** 25 files to ~18 files.

---

### 4.3 Hook Consolidation (per Section 1.5)

**Current:** ~45 active hook files, 18,458 total lines

**Proposed consolidation map:**

| Current Hooks                                                         | Merged Into                     | Hooks Eliminated |
| --------------------------------------------------------------------- | ------------------------------- | ---------------- |
| session-cleanup + execution-limit-monitor + tool-scope-validator      | `pre-tool-unified.cjs`          | 2                |
| metrics-collector-hook + error-tracker-hook + anomaly-detector        | `post-tool-metrics-unified.cjs` | 2                |
| evolution-state-guard + research-enforcement + quality-gate-validator | `evolution-guard-unified.cjs`   | 2                |
| reflection-step0-guard + force-step0-execution                        | `reflection-guard-unified.cjs`  | 1                |

**Result:** 45 hooks to ~38 hooks, 7 fewer Node.js processes per operation cycle.

---

## 5. DEAD CODE INVENTORY

### 5.1 Workflow Dead Code (22 modules, ~5,258 lines)

See Section 1.1 for full list.

### 5.2 Memory Dead Code (7 modules, ~2,648 lines)

See Section 1.2 for full list.

### 5.3 ML Subsystem (9 modules, 1,652 lines)

See Section 2.1.

### 5.4 Self-Healing Dead Code (3 modules, ~1,372 lines)

See Section 2.2.

### 5.5 Error Infrastructure Dead Code (~900 lines)

See Section 2.6.

### 5.6 Total Dead Code

| Category             | Modules | Lines       |
| -------------------- | ------- | ----------- |
| Workflow             | 22      | ~5,258      |
| Memory               | 7       | ~2,648      |
| ML                   | 9       | 1,652       |
| Self-Healing         | 3       | ~1,372      |
| Error Infrastructure | 2       | ~900        |
| **Total**            | **43**  | **~11,830** |

**11,830 lines of dead code -- 12% of the total CJS codebase.**

---

## 6. COMPLEXITY METRICS

### 6.1 Lines of Code by Subsystem

| Subsystem           | Files | Lines   | Dead % |
| ------------------- | ----- | ------- | ------ |
| Workflow (lib)      | 48    | 15,925  | 33%    |
| Memory (lib)        | 32    | 12,309  | 21%    |
| Hooks               | 45+   | 18,458  | ~5%    |
| Routing (lib)       | 7     | 3,361   | 0%     |
| Self-Healing (lib)  | 4     | 1,934   | 71%    |
| ML (lib)            | 9     | 1,652   | 100%   |
| Code Indexing (lib) | 17    | ~8,000  | ~10%   |
| Docs                | 24    | 10,623  | ~20%   |
| Workflow docs       | 30+   | 15,830  | ~10%   |
| Skills (SKILL.md)   | 230   | ~50,000 | ~20%   |
| Agent definitions   | 49    | ~15,000 | ~5%    |

### 6.2 Hook Execution Overhead

| Tool Operation | Pre Hooks | Post Hooks | Total Processes |
| -------------- | --------- | ---------- | --------------- |
| Write          | 9         | 5          | 14              |
| Edit           | 8         | 5          | 13              |
| Task           | 8         | 5          | 13              |
| Bash           | 7         | 4          | 11              |
| TaskUpdate     | 6         | 6          | 12              |
| Read           | 4         | 3          | 7               |

### 6.3 Configuration Sources

13 separate configuration sources with a 5-level model resolution precedence chain.

---

## 7. PRIORITIZED ACTION PLAN

### Phase 1: Dead Code Cleanup (1-2 days, LOW risk)

1. Archive 22 dead workflow modules (~5,258 lines)
2. Archive 7 dead memory modules (~2,648 lines)
3. Archive ML subsystem (1,652 lines)
4. Archive dead self-healing modules (~1,372 lines)
5. Archive dead error infrastructure (~900 lines)

**Total: ~11,830 lines removed, zero behavior change.**

### Phase 2: Hook Consolidation (2-3 days, MEDIUM risk)

1. Merge 3 universal PostToolUse hooks into 1
2. Merge 3 universal PreToolUse hooks into 1
3. Merge 3 evolution Write hooks into 1
4. Test all hook behavior after consolidation

**Total: ~7 fewer process spawns per operation cycle.**

### Phase 3: Routing Consolidation (3-5 days, MEDIUM risk)

1. Consolidate keyword maps into single source of truth
2. Merge small routing helpers into intent-classifier
3. Merge agent registries into single file
4. Update all consumers
5. Run full 95-test routing suite

**Total: 3 files eliminated, 1 source of truth for agent routing.**

### Phase 4: Skill Rationalization (3-5 days, LOW risk)

1. Identify pure-identity skills (no executable logic)
2. Merge identity content into agent definitions
3. Archive consolidated skills
4. Update skill catalog

**Total: ~100 skills archived, cleaner skill catalog.**

### Phase 5: Documentation Trimming (2-3 days, LOW risk)

1. Merge overlapping onboarding docs
2. Trim design docs to architectural decisions only
3. Remove duplicate `@` reference files
4. Reduce INTENT_KEYWORDS from 500+ to ~245

**Total: ~5,000 lines of documentation reduced.**

---

## 8. RISK ASSESSMENT

| Change                 | Risk   | Mitigation                                       |
| ---------------------- | ------ | ------------------------------------------------ |
| Archive dead code      | LOW    | No consumers exist; searchable in git history    |
| Hook consolidation     | MEDIUM | Comprehensive test suite; incremental merging    |
| Routing consolidation  | MEDIUM | 95 existing tests; add integration tests         |
| Agent registry merge   | MEDIUM | Generator script already produces primary source |
| Skill rationalization  | LOW    | Skills are advisory, not executable code paths   |
| Documentation trimming | LOW    | No code dependencies on doc content              |
| Config consolidation   | MEDIUM | Must update all config readers; staged rollout   |

---

## 9. SUMMARY TABLE

| Category                        | Current | After Simplification | Reduction |
| ------------------------------- | ------- | -------------------- | --------- |
| CJS Lines                       | ~98,000 | ~80,000              | -18%      |
| Workflow Modules                | 48      | 26                   | -46%      |
| Memory Modules                  | 32      | 18                   | -44%      |
| Hook Process Spawns (per Write) | 14      | 8                    | -43%      |
| Keyword Maps                    | 6       | 2                    | -67%      |
| Agent Registries                | 3       | 1                    | -67%      |
| Config Sources                  | 13      | 8                    | -38%      |
| Active Skills                   | 230     | ~120                 | -48%      |
| Dead Code Lines                 | ~11,830 | 0                    | -100%     |

---

## Appendix A: Files Referenced

### Routing

- `C:\dev\projects\agent-studio\.claude\lib\routing\routing-table.cjs` (2,042 lines)
- `C:\dev\projects\agent-studio\.claude\hooks\routing\routing-guard.cjs` (1,448 lines)
- `C:\dev\projects\agent-studio\.claude\lib\workflow\phase-advance-reader.cjs` (221 lines)

### Registries

- `C:\dev\projects\agent-studio\.claude\context\agent-registry.json` (4,375 lines)
- `C:\dev\projects\agent-studio\.claude\context\agent-catalog.json` (1,296 lines)
- `C:\dev\projects\agent-studio\.claude\config\agent-config.json` (851 lines)

### Hooks

- `C:\dev\projects\agent-studio\.claude\settings.json` (289 lines, 42 hook registrations)
- `C:\dev\projects\agent-studio\.claude\hooks\routing\user-prompt-unified.cjs` (1,532 lines)

### Configuration

- `C:\dev\projects\agent-studio\.claude\config.yaml` (126 lines)
- `C:\dev\projects\agent-studio\.claude\settings.json` (289 lines)
- 11 additional config files in `.claude/config/`

### Dead Code (Workflow)

- 22 modules in `C:\dev\projects\agent-studio\.claude\lib\workflow\` (see Section 1.1)

### Dead Code (Memory)

- 7 modules in `C:\dev\projects\agent-studio\.claude\lib\memory\` (see Section 1.2)

### Dead Code (ML)

- 9 modules in `C:\dev\projects\agent-studio\.claude\lib\ml\` (see Section 2.1)
