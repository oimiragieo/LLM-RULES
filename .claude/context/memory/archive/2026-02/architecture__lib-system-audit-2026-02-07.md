<!-- Agent: architect | Task: #121 | Session: 2026-02-07 -->

# Lib System Deep Dive Audit

**Date:** 2026-02-07
**Pipeline:** #15 - Lib System Deep Dive
**Agent:** Architect (Opus 4.6)
**Scope:** `.claude/lib/` shared library subsystem

---

## Executive Summary

**Health Score: 52/100**

The `.claude/lib/` subsystem contains **233 modules** across **29 subdirectories** totaling **66,676 lines of code**. The system has a solid foundation in its core utilities (`utils/`, `routing/`, `events/`) which are heavily consumed by hooks and tools. However, the system suffers from significant dead-code sprawl: approximately **45% of modules have zero or archive-only consumers**. Several entire subsystems (`party-mode/`, `testing/`, `integration/`, `boot/`, `clients/`, `agents/`, `plan/`, `scheduler/`, `coordination/`, `skills/`, `config/`, `text-processing/`, `ui/`) are either dead code, self-referencing only, or consumed exclusively by archived (deprecated) code. The `memory/` and `workflow/` subsystems are the largest contributors by line count but have mixed consumer profiles.

**Key Findings:**
- 29 subdirectories, 233 modules, 66,676 LOC
- Core utilities (`hook-input`, `project-root`, `atomic-write`, `event-bus`) are well-wired with 10+ active consumers each
- 10 entire subsystems have zero active (non-archive) external consumers
- The `party-mode/` subsystem (10 modules, ~2,500 LOC) has exactly 1 consumer (an orchestrator agent doc)
- The `testing/` subsystem (8 modules, ~2,800 LOC) is consumed only by itself (intra-lib references)
- No true circular dependencies detected (the dependency graph is acyclic at the module level)
- The `post-completion-chain.cjs` is referenced in CLAUDE.md as a lib module but actually lives in `hooks/workflow/`

---

## Module Inventory by Subsystem

### 1. utils/ (42 modules, ~8,700 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| hook-input.cjs | 493 | Hook stdin parser, enforcement checks | 20+ hooks | CORE |
| project-root.cjs | 184 | Find project root from .claude/CLAUDE.md | 30+ modules | CORE |
| atomic-write.cjs | ~80 | Crash-safe file writes via temp+rename | 15+ modules | CORE |
| agent-config-reader.cjs | 329 | Model resolution from config.yaml (ADR-075) | 3 hooks, 1 tool | ACTIVE |
| safe-json.cjs | ~200 | Safe JSON parse/read with schema validation | 5 hooks/modules | ACTIVE |
| state-cache.cjs | 116 | Cached state reads for hooks | 3 hooks | ACTIVE |
| jsonl-utils.cjs | 46 | JSONL append/trim utilities | 4 hooks | ACTIVE |
| logger.cjs | 74 | Structured logger factory | 10+ lib modules | CORE |
| schema-validator.cjs | 126 | JSON Schema validation | 3 lib modules | ACTIVE |
| environment.cjs | 93 | Environment detection | 1 tool | LOW |
| config-loader.cjs | 129 | Config file loading | 1 tool | LOW |
| error-sanitizer.cjs | 412 | Error message sanitization | 0 active | DEAD |
| feature-flags.cjs | ~200 | Feature flag management | 0 active (party-mode ref) | DEAD |
| hook-logger.cjs | 27 | Hook logging utility | 0 active | DEAD |
| hook-resolver.cjs | 166 | Hook path resolution | 0 active | DEAD |
| platform.cjs | 109 | Platform detection (CJS) | 0 active code consumers | DEAD |
| context-path-resolver.mjs | ~100 | Context path resolution (ESM) | 0 active | DEAD |
| adaptive-discloser.cjs | 457 | Adaptive progressive disclosure | 0 active | DEAD |
| bottleneck-analyzer.cjs | ~200 | Performance bottleneck analysis | 0 active | DEAD |
| brownfield-assessor.cjs | 375 | Brownfield project assessment | 0 active | DEAD |
| build-knowledge-base-index.cjs | ~200 | Knowledge base indexing | 0 active | DEAD |
| command-exists.cjs | 20 | Check if CLI command exists | 0 active | DEAD |
| compression-trigger.cjs | ~150 | Auto-compression trigger | 0 active | DEAD |
| context-accumulator.cjs | 195 | Context accumulation | 0 active | DEAD |
| context-reset.cjs | 97 | Context state reset | 0 active | DEAD |
| cost-calculator.cjs | 163 | Token cost calculation | 0 active | DEAD |
| logical-unit-tracker.cjs | ~200 | Logical unit tracking | 0 active | DEAD |
| memory-integrated-suggester.cjs | 155 | Memory-integrated suggestions | 0 active | DEAD |
| memory-monitor.cjs | 440 | Memory usage monitoring | 0 active | DEAD |
| optimization-targets.cjs | 143 | Optimization target tracking | 0 active | DEAD |
| package-manager.cjs | ~150 | Package manager detection | 0 active | DEAD |
| path-validator.cjs | 158 | Path validation | 1 lib internal (party-mode) | DEAD |
| pattern-library.cjs | 377 | Pattern library storage | 0 active | DEAD |
| performance-profiler.cjs | 523 | Performance profiling | 0 active | DEAD |
| profiling-report-generator.cjs | ~200 | Profiling report generation | 0 active | DEAD |
| readiness-scorer.cjs | 180 | System readiness scoring | 0 active | DEAD |
| retry-with-backoff.cjs | 139 | Retry with exponential backoff | 0 active | DEAD |
| tech-stack-detector.cjs | ~200 | Tech stack detection | 1 lib internal (brownfield) | DEAD |
| token-budget-tracker.cjs | 162 | Token budget tracking | 0 active | DEAD |
| track-analytics.cjs | 369 | Analytics tracking | 0 active | DEAD |
| require-analyzer.cjs | ~100 | Require dependency analysis | 0 active | DEAD |

### 2. routing/ (7 modules, ~3,830 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| routing-table.cjs | 2,024 | Intent-to-agent mapping (source of truth) | 2 hooks, 2 tools, 1 lib | CORE |
| router-state.cjs | 719 | Router/agent mode state machine | 3 hooks | CORE |
| agent-registry-resolver.cjs | 113 | Registry-first agent resolution | 0 active | LOW |
| intent-classifier.cjs | ~200 | Intent classification | 0 active | DEAD |
| semantic-router.cjs | 79 | Semantic routing | 0 active | DEAD |
| fuzzy-intent-matcher.cjs | 90 | Fuzzy intent matching | 0 active | DEAD |
| pattern-router.cjs | 28 | Pattern-based routing | 0 active | DEAD |

### 3. events/ (3 modules, ~520 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| event-bus.cjs | 151 | Central event bus | 15+ hooks | CORE |
| event-types.cjs | 330 | Event type definitions | 15+ hooks | CORE |
| event-bus-sink.cjs | 39 | JSONL event persistence | 0 active | LOW |

### 4. memory/ (32 modules, ~12,600 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| memory-manager.cjs | 1,504 | Central memory management | 3 hooks, 1 tool | ACTIVE |
| entity-extractor.cjs | 534 | Entity extraction from text | 1 hook (sync-memory-index) | ACTIVE |
| lancedb-client.cjs | 774 | LanceDB vector store client | 2 tools, 1 lib | ACTIVE |
| contextual-memory.cjs | 920 | Context-aware memory | 0 direct active | LOW |
| memory-scheduler.cjs | 954 | Memory maintenance scheduling | 1 hook (reflection) | LOW |
| learnings-parser.cjs | 686 | Parse learnings.md | 0 active | DEAD |
| memory-dashboard.cjs | 781 | Memory system dashboard | 0 active | DEAD |
| memory-tiers.cjs | 719 | Tiered memory storage | 0 active | DEAD |
| memory-rotator.cjs | 750 | Memory file rotation | 0 active | DEAD |
| smart-pruner.cjs | 736 | Intelligent memory pruning | 0 active | DEAD |
| cold-storage.cjs | 336 | Cold storage archival | 0 active | DEAD |
| semantic-archival.cjs | 498 | Semantic archival | 0 active | DEAD |
| audit-trail-integration.cjs | 488 | Audit trail | 0 active | DEAD |
| entity-query.cjs | 450 | Entity query interface | 0 active | DEAD |
| memory-extraction-writer.cjs | ~200 | Extraction writer | 0 active | DEAD |
| memory-extractor.cjs | ~200 | Memory extractor | 0 active | DEAD |
| memory-deduplicator.cjs | 192 | Deduplication | 0 active | DEAD |
| memory-entity-links.cjs | 185 | Entity link management | 0 active | DEAD |
| memory-consolidation.cjs | 44 | Memory consolidation | 0 active | DEAD |
| memory-retention-config.cjs | 66 | Retention config | 0 active | DEAD |
| memory-areas.cjs | 19 | Area definitions | 0 active | DEAD |
| memory-constants.cjs | 13 | Constants | 0 active | DEAD |
| memory-search.cjs | 50 | Search interface | 0 active | DEAD |
| session-summary.cjs | 141 | Session summarization | 0 active | DEAD |
| session-context-for-search.cjs | 143 | Session context for search | 0 active | DEAD |
| intent-analyzer.cjs | 110 | Intent analysis | 0 active | DEAD |
| run-extraction-pipeline.cjs | 108 | Extraction pipeline runner | 1 tool (memory-extract) | ACTIVE |
| prompts/ (5 modules) | ~270 | Prompt templates for memory ops | 0 active | DEAD |

### 5. workflow/ (47 modules, ~14,700 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| complexity-classifier.cjs | 149 | Request complexity classification | Referenced in CLAUDE.md | ACTIVE |
| workflow-state-manager.cjs | 372 | Workflow state file management | Referenced in CLAUDE.md | ACTIVE |
| phase-advance-reader.cjs | 134 | Phase advancement signals | Referenced in CLAUDE.md | ACTIVE |
| quality-gates.cjs | ~200 | Quality gate evaluation | Referenced in CLAUDE.md | ACTIVE |
| domain-detector.cjs | ~200 | Domain detection | 0 active | DEAD |
| workflow-engine.cjs | 1,185 | Core workflow engine | 0 active | DEAD |
| workflow-cli.cjs | 715 | CLI for workflow operations | 0 active | DEAD |
| workflow-state-machine.cjs | 667 | State machine for workflows | 0 active | DEAD |
| checkpoint-manager.cjs | 648 | Workflow checkpointing | 0 active | DEAD |
| step-validators.cjs | 714 | Step validation logic | 0 active | DEAD |
| state-sync-manager.cjs | 562 | State synchronization | 0 active | DEAD |
| state-transaction-manager.cjs | 538 | State transactions | 0 active | DEAD |
| saga-coordinator.cjs | 499 | Saga pattern coordinator | 0 active | DEAD |
| parallel-phase-executor.cjs | 355 | Parallel phase execution | 0 active | DEAD |
| deployment-manager.cjs | 344 | Deployment management | 0 active | DEAD |
| interface-mapper.cjs | 341 | Interface mapping | 0 active | DEAD |
| cross-workflow-trigger.cjs | 340 | Cross-workflow triggers | 0 active | DEAD |
| strangler-fig.cjs | 331 | Strangler fig migration | 0 active | DEAD |
| workflow-composer.cjs | 325 | Workflow composition | 0 active | DEAD |
| decision-handler.mjs | 427 | Decision handling | 0 active | DEAD |
| loop-handler.mjs | ~200 | Loop handling | 0 active | DEAD |
| verify-workflows.mjs | 337 | Workflow verification | 0 active | DEAD |
| task-cleanup-manager.cjs | 418 | Task cleanup | 0 active | DEAD |
| task-router.cjs | ~200 | Task routing | 0 active | DEAD |
| ... (23 more modules) | ~4,500 | Various workflow utilities | 0 active | DEAD |

### 6. code-indexing/ (16 modules, ~5,600 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| index-manager.cjs | 847 | Index management (BM25 + vectors) | 1 hook, 1 tool | ACTIVE |
| bm25-indexer.cjs | ~300 | BM25 sparse search | Internal (index-manager) | ACTIVE |
| hybrid-lazy-indexer.cjs | 642 | Lazy hybrid indexing | 1 tool (hybrid-search) | ACTIVE |
| hybrid-search.cjs | 173 | Hybrid search interface | 1 tool | ACTIVE |
| ast-grep-wrapper.cjs | 342 | ast-grep CLI wrapper | 1 tool | ACTIVE |
| query-analyzer.cjs | 348 | Query analysis for search | 1 tool | ACTIVE |
| result-ranker.cjs | ~200 | Result ranking | 0 active | LOW |
| vector-store.cjs | 314 | Vector store (lazy LanceDB) | Internal | ACTIVE |
| embedding-generator.cjs | 388 | Embedding generation | 1 tool | ACTIVE |
| code-parser.cjs | 135 | Code parsing for indexing | Internal | ACTIVE |
| semantic-chunker.cjs | 447 | Semantic chunking | Internal | ACTIVE |
| index.cjs | 31 | Entry point barrel | 0 direct external | LOW |
| merkle-tree.cjs | ~200 | Change detection tree | Internal | ACTIVE |
| parse-chunk-worker.cjs | 117 | Worker thread for parsing | Internal | ACTIVE |
| parse-utils.cjs | 104 | Parsing utilities | Internal | ACTIVE |
| gpu-detector.cjs | 103 | GPU detection for embeddings | Internal | ACTIVE |

### 7. party-mode/ (10 modules, ~2,500 LOC) -- ALL DEAD

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| consensus/response-aggregator.cjs | 341 | Response aggregation | 0 active (1 self-ref) | DEAD |
| orchestration/lifecycle-manager.cjs | ~300 | Lifecycle management | 0 active | DEAD |
| orchestration/round-manager.cjs | ~250 | Round management | 0 active | DEAD |
| orchestration/team-loader.cjs | ~200 | Team loading | 0 active | DEAD |
| protocol/context-isolator.cjs | 175 | Context isolation | 0 active | DEAD |
| protocol/message-router.cjs | 189 | Message routing | 0 active | DEAD |
| protocol/sidecar-manager.cjs | ~250 | Sidecar management | 0 active | DEAD |
| security/agent-identity.cjs | 133 | Agent identity verification | 0 active | DEAD |
| security/response-integrity.cjs | 165 | Response integrity checks | 0 active | DEAD |
| security/session-audit.cjs | ~200 | Session auditing | 0 active | DEAD |

### 8. ml/ (9 modules, ~2,200 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| index.cjs | ~300 | ML features entry point | 1 hook (unified-reflection) | LOW |
| pattern-detector.cjs | 108 | Workflow pattern detection | Internal (index) | LOW |
| cost-predictor.cjs | ~200 | Cost prediction | Internal (index) | LOW |
| adaptive-executor.cjs | ~200 | Adaptive execution | Internal (index) | LOW |
| optimization-engine.cjs | 114 | Optimization recommendations | Internal (index) | LOW |
| feedback-loop.cjs | 195 | ML feedback loop | Internal (index) | LOW |
| anomaly-detector.cjs | 139 | Anomaly detection | Internal (index) | LOW |
| feature-engineer.cjs | 79 | Feature engineering | Internal (index) | LOW |
| models/clustering.cjs | 170 | Clustering models | Internal | LOW |

### 9. testing/ (8 modules, ~2,800 LOC) -- ALL DEAD

Consumed only by themselves and a single onboarding doc. Zero runtime consumers.

### 10. integration/ (5 modules, ~2,400 LOC) -- NEARLY ALL DEAD

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| system-registration-handler.cjs | 641 | System registration | 0 active | DEAD |
| conductor-gap-analyzer.cjs | 402 | Conductor gap analysis | 1 archived tool | DEAD |
| feature-compatibility.cjs | ~300 | Feature compatibility | 0 active | DEAD |
| migration-strategy.cjs | ~300 | Migration strategy | 0 active | DEAD |
| safety-rollback-manager.cjs | 416 | Safety rollback | 0 active | DEAD |

### 11. self-healing/ (4 modules, ~2,200 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| loop-state-manager.cjs | ~200 | Loop detection state | 1 hook (post-task-unified) | ACTIVE |
| dashboard.cjs | 588 | Self-healing dashboard | 0 active | DEAD |
| rollback-manager.cjs | 562 | Rollback management | 0 active | DEAD |
| validator.cjs | 531 | Self-healing validation | 0 active | DEAD |

### 12. monitoring/ (5 modules, ~1,600 LOC)

| Path | Lines | Purpose | Active Consumers | Status |
|------|-------|---------|-----------------|--------|
| spawn-log.cjs | 94 | Spawn event logging | 1 hook (post-task-unified) | ACTIVE |
| violation-tracker.cjs | 325 | Violation tracking | 1 hook (routing-guard) | ACTIVE |
| metrics-reader.cjs | ~200 | Metrics reading | 0 active | LOW |
| dashboard-renderer.cjs | ~300 | Dashboard rendering | 0 active | DEAD |
| production-alerts.cjs | 313 | Production alerting | Internal only | LOW |

### 13-19. Smaller Subsystems

| Subsystem | Modules | LOC | Active Consumers | Status |
|-----------|---------|-----|-----------------|--------|
| spawn/ | 3 | ~1,000 | 2 (spawn-prompt-assembler hook, task-tools) | ACTIVE |
| agents/ | 8 | ~750 | 0 active (1 archived tool) | DEAD |
| tools/ | 10 | ~3,400 | 2 (generate-agent-registry, get-current-config) | LOW |
| boot/ | 3 | ~600 | 0 active | DEAD |
| clients/ | 1 | 153 | 0 active (used by factory.cjs internally) | DEAD |
| config/ | 3 | ~300 | 0 active | DEAD |
| plan/ | 2 | 84 | 0 active | DEAD |
| qa/ | 3 | ~200 | 0 active | DEAD |
| scheduler/ | 2 | ~180 | 1 archived tool | DEAD |
| coordination/ | 1 | ~300 | 0 active | DEAD |
| skills/ | 1 | 318 | 0 active | DEAD |
| safety/ | 1 | 433 | 1 archived hook | DEAD |
| text-processing/ | 1 | 94 | 0 active | DEAD |
| ui/ | 1 | 95 | 1 template ref | DEAD |
| Root-level | 4 | ~1,100 | Mixed | LOW |

---

## Gap Analysis

### DEAD Code (Zero Active Consumers)

**~104 modules (~30,000 LOC)** have zero active (non-archived) consumers outside their own subsystem. This represents approximately **45% of all lib code**.

**Worst offenders by LOC:**
1. `workflow/` subsystem: ~35 of 47 modules are dead (~10,000 LOC)
2. `memory/` subsystem: ~22 of 32 modules are dead (~7,000 LOC)
3. `party-mode/`: All 10 modules dead (~2,500 LOC)
4. `utils/`: ~24 of 42 modules are dead (~5,000 LOC)
5. `testing/`: All 8 modules dead (~2,800 LOC)
6. `integration/`: All 5 modules dead (~2,400 LOC)

### PHANTOM References

1. **`post-completion-chain.cjs`** -- Referenced in CLAUDE.md Section 3.5 as a lib module (`post-completion-chain.cjs`), but actually lives at `.claude/hooks/workflow/post-completion-chain.cjs`. Not a phantom per se, but the CLAUDE.md reference is misleading.

### STALE Subsystems

1. **`party-mode/`** -- 10 modules, entire multi-agent "party mode" protocol. The only consumer is the party-orchestrator agent markdown (a doc reference, not code). The feature appears to have been designed but never integrated.
2. **`agents/`** (factory, base-agent, developer, architect, qa, orchestrator) -- An alternative agent runtime that is not used. The actual agent system uses markdown agent files + spawn templates, not these CJS classes.
3. **`boot/`** (production-agent, worker-agent) -- A headless agent runtime. Zero consumers outside lib. Appears to be a prototype for a standalone agent execution environment.
4. **`testing/`** (chaos-engineer, failure-scenarios, etc.) -- Testing framework modules that reference each other but have no external consumers. Never integrated into CI or any test runner.
5. **`integration/`** -- Conductor integration modules. The only consumer is an archived tool. Conductor appears to have been a planned integration that was abandoned.
6. **`scheduler/`** -- Task scheduler. Only consumer is an archived tool.

### ORPHANED Directories

1. **`skill-build/`** -- Contains only `src/` and `tsconfig.json`, no .cjs/.mjs/.js files. Appears to be a stub for a planned TypeScript build system.
2. **`context/`** -- Contains only an `etc/` subdirectory, no code files.

---

## Dependency Graph (Major Subsystems)

```
                    +-----------+
                    | hooks/    |  (primary consumers)
                    +-----------+
                         |
         +-------+-------+-------+-------+
         v       v       v       v       v
    +--------+ +------+ +------+ +------+ +--------+
    | utils/ | |events| |route | |memory| |monitor |
    +--------+ +------+ +------+ +------+ +--------+
     hook-input  event-bus routing  memory   spawn-log
     project-root event-types table  manager  violation
     atomic-write            router  entity   tracker
     safe-json               state   extract
     state-cache
     jsonl-utils
     logger
     agent-config
     schema-valid
         |
         v
    +---------+
    | tools/  |  (CLI consumers)
    +---------+
         |
         v
    +----------+   +--------+
    | code-idx |   | spawn/ |
    +----------+   +--------+
     index-mgr     prompt-assembler
     bm25-idx      prompt-factory
     hybrid-lazy   spawn-template-resolver
     ast-grep-wrap

    +-----------+   +----------+   +----------+
    | self-heal |   | workflow/ |   | ml/      |
    +-----------+   +----------+   +----------+
     loop-state     complexity     index.cjs
     (1 consumer)   classifier     (1 consumer)
                    wf-state-mgr
                    phase-advance
                    quality-gates
```

**Core dependency flow:** hooks --> lib/utils --> lib/events --> lib/routing

**Intra-lib dependencies:** Most subsystems depend on `utils/project-root`, `utils/logger`, and `utils/atomic-write`. The `memory/` modules depend heavily on `utils/` and occasionally on `events/`. No circular dependencies detected at the module level.

---

## Disposition Matrix

### KEEP (Core, Actively Consumed)

| Module | Consumers | Rationale |
|--------|-----------|-----------|
| utils/hook-input.cjs | 20+ hooks | Foundation of hook system |
| utils/project-root.cjs | 30+ modules | Universal path resolution |
| utils/atomic-write.cjs | 15+ modules | Crash-safe writes |
| utils/agent-config-reader.cjs | 3 hooks + 1 tool | ADR-075 model resolution |
| utils/safe-json.cjs | 5+ modules | Safe parsing |
| utils/state-cache.cjs | 3 hooks | Performance optimization |
| utils/jsonl-utils.cjs | 4+ hooks | JSONL operations |
| utils/logger.cjs | 10+ modules | Structured logging |
| utils/schema-validator.cjs | 3 modules | Schema validation |
| routing/routing-table.cjs | 4+ consumers | Source of truth for routing |
| routing/router-state.cjs | 3 hooks | Agent mode tracking |
| events/event-bus.cjs | 15+ hooks | Event distribution |
| events/event-types.cjs | 15+ hooks | Event contracts |
| memory/memory-manager.cjs | 3 hooks + 1 tool | Memory CRUD |
| memory/entity-extractor.cjs | 1 hook | Entity extraction |
| memory/lancedb-client.cjs | 2 tools + 1 lib | Vector store |
| memory/run-extraction-pipeline.cjs | 1 tool | Extraction pipeline |
| code-indexing/* (12 active) | 2+ tools/hooks | Code search |
| monitoring/spawn-log.cjs | 1 hook | Spawn traceability |
| monitoring/violation-tracker.cjs | 1 hook | Violation tracking |
| self-healing/loop-state-manager.cjs | 1 hook | Loop detection |
| spawn/prompt-assembler.cjs | 1 hook + 1 lib | Spawn prompt injection |
| workflow/complexity-classifier.cjs | CLAUDE.md ref | Complexity classification |
| workflow/workflow-state-manager.cjs | CLAUDE.md ref | Workflow state |
| workflow/phase-advance-reader.cjs | CLAUDE.md ref | Phase advancement |
| workflow/quality-gates.cjs | CLAUDE.md ref | Quality gates |

### UPDATE (Needs Attention)

| Module | Issue | Action |
|--------|-------|--------|
| routing/agent-registry-resolver.cjs | Low usage, may need wiring | Wire to routing-guard or deprecate |
| events/event-bus-sink.cjs | No active consumers | Wire to event-bus or archive |
| ml/index.cjs | Single consumer (reflection) | Review if ML features are needed |
| memory/memory-scheduler.cjs | Single consumer | Review consolidation with memory-manager |

### ARCHIVE (Move to _archive/)

| Subsystem | Modules | LOC | Rationale |
|-----------|---------|-----|-----------|
| party-mode/ | 10 | ~2,500 | Entire subsystem unused, feature never shipped |
| testing/ | 8 | ~2,800 | Never integrated into CI/test runner |
| integration/ | 5 | ~2,400 | Conductor integration abandoned |
| agents/ (runtime) | 8 | ~750 | Alternative agent runtime not used |
| boot/ | 3 | ~600 | Standalone runtime prototype |
| clients/ | 1 | 153 | Used only by dead agents/factory |
| scheduler/ | 2 | ~180 | Only archived tool consumes it |
| coordination/ | 1 | ~300 | Zero consumers |
| skills/ | 1 | 318 | Zero active code consumers |
| config/ (3 modules) | 3 | ~300 | Zero consumers |
| plan/ | 2 | 84 | Zero consumers |
| qa/ (criteria, report) | 2 | ~200 | Zero consumers (gate.mjs is 12 lines) |
| safety/command-allowlist | 1 | 433 | Only archived hook consumes |
| text-processing/ | 1 | 94 | Zero consumers |
| ui/ | 1 | 95 | Only template doc reference |
| Root-level dead modules | 3 | ~1,400 | error-writer, evolution-state-sync, platform.mjs |

**Total archivable: ~80 modules, ~12,600 LOC**

### DELETE (Stubs/Empty)

| Path | Rationale |
|------|-----------|
| skill-build/ | Empty directory stub (no code) |
| context/ | Empty directory stub (no code) |

### Dead utils/ candidates for ARCHIVE

| Module | LOC | Rationale |
|--------|-----|-----------|
| error-sanitizer.cjs | 412 | Zero consumers |
| adaptive-discloser.cjs | 457 | Zero consumers |
| bottleneck-analyzer.cjs | ~200 | Zero consumers |
| brownfield-assessor.cjs | 375 | Zero consumers |
| build-knowledge-base-index.cjs | ~200 | Zero consumers |
| context-accumulator.cjs | 195 | Zero consumers |
| context-reset.cjs | 97 | Zero consumers |
| cost-calculator.cjs | 163 | Zero consumers |
| memory-monitor.cjs | 440 | Zero consumers |
| performance-profiler.cjs | 523 | Zero consumers |
| pattern-library.cjs | 377 | Zero consumers |
| token-budget-tracker.cjs | 162 | Zero consumers |
| track-analytics.cjs | 369 | Zero consumers |
| ... (11 more) | ~1,500 | Zero consumers |

**Total dead utils: ~24 modules, ~5,000 LOC**

### Dead workflow/ candidates for ARCHIVE

| Module | LOC | Rationale |
|--------|-----|-----------|
| workflow-engine.cjs | 1,185 | Zero consumers |
| workflow-cli.cjs | 715 | Zero consumers |
| workflow-state-machine.cjs | 667 | Zero consumers |
| checkpoint-manager.cjs | 648 | Zero consumers |
| step-validators.cjs | 714 | Zero consumers |
| state-sync-manager.cjs | 562 | Zero consumers |
| state-transaction-manager.cjs | 538 | Zero consumers |
| saga-coordinator.cjs | 499 | Zero consumers |
| ... (27 more) | ~4,500 | Zero consumers |

**Total dead workflow: ~35 modules, ~10,000 LOC**

### Dead memory/ candidates for ARCHIVE

| Module | LOC | Rationale |
|--------|-----|-----------|
| memory-dashboard.cjs | 781 | Zero consumers |
| memory-tiers.cjs | 719 | Zero consumers |
| memory-rotator.cjs | 750 | Zero consumers |
| smart-pruner.cjs | 736 | Zero consumers |
| learnings-parser.cjs | 686 | Zero consumers |
| ... (17 more) | ~3,000 | Zero consumers |

**Total dead memory: ~22 modules, ~7,000 LOC**

---

## Code-Indexing Health Assessment

The `code-indexing/` subsystem is one of the healthiest in the lib:

**Strengths:**
- 12 of 16 modules are actively consumed
- Clear architecture: BM25 (lexical) + LanceDB (vector) + ast-grep (structural) = hybrid search
- Well-documented per MEMORY.md (BM25-only mode, lazy IDF, sync fast-path)
- `hybrid-lazy-indexer.cjs` provides 0s startup search for 40k+ files
- Properly handles Windows path normalization (per learnings.md)

**Issues:**
- `result-ranker.cjs` (200 LOC) has no direct external consumers
- `index.cjs` barrel file sets `LANCEDB_EMBEDDING_MODE=off` as default, but this side-effect on `process.env` is a design smell -- should be explicit opt-in
- Internal modules (`parse-chunk-worker`, `parse-utils`, `gpu-detector`) are well-structured but could benefit from explicit `@internal` jsdoc tags

**Recommendation:** KEEP entire subsystem. Mark `result-ranker.cjs` as LOW priority for review.

---

## Recommendations

### P1 (Critical -- Address This Sprint)

1. **Archive dead subsystems.** Move `party-mode/`, `testing/`, `integration/`, `agents/` (runtime), `boot/`, `clients/`, `scheduler/`, `coordination/`, `skills/`, `config/`, `plan/`, `safety/`, `text-processing/`, `ui/` to `.claude/lib/_archive/`. This removes ~80 modules and ~12,600 LOC of dead code.

2. **Archive dead utils/ modules.** Move ~24 zero-consumer utils to `.claude/lib/_archive/utils/`. This removes ~5,000 LOC.

3. **Archive dead workflow/ modules.** Move ~35 zero-consumer workflow modules to `.claude/lib/_archive/workflow/`. This removes ~10,000 LOC.

4. **Archive dead memory/ modules.** Move ~22 zero-consumer memory modules to `.claude/lib/_archive/memory/`. This removes ~7,000 LOC.

5. **Fix CLAUDE.md reference.** `post-completion-chain.cjs` is listed in Section 3.5 as a lib module but lives at `.claude/hooks/workflow/post-completion-chain.cjs`. Update the reference to include the correct path.

### P2 (Important -- Address Next Sprint)

6. **Consolidate root-level modules.** Move `error-pattern-detector.cjs`, `error-writer.cjs`, `evolution-state-sync.cjs` into appropriate subdirectories or archive them. Root-level modules break the subsystem organization pattern.

7. **Delete empty directories.** Remove `skill-build/` and `context/` stubs.

8. **Review ML subsystem viability.** The `ml/` subsystem (9 modules) has exactly one active consumer (`unified-reflection-handler.cjs`). Evaluate whether the ML features are delivering value or should be archived.

9. **Wire or archive intent-classifier, semantic-router, fuzzy-intent-matcher, pattern-router.** These routing modules (4 modules, ~400 LOC) appear to have been designed for an advanced routing system that was never connected. Either wire them into the routing pipeline or archive.

### P3 (Nice-to-Have)

10. **Add `@internal` JSDoc tags** to intra-lib-only modules (e.g., code-indexing internals, memory prompts) to distinguish them from public API modules.

11. **Create a lib module registry** (similar to agent-registry.json) that documents each module's purpose, consumers, and status. This would automate future audits.

12. **Standardize module format.** Some modules use ESM (`platform.mjs`, `decision-handler.mjs`, `verify-workflows.mjs`, `loop-handler.mjs`, `qa/gate.mjs`, `context-path-resolver.mjs`), while the vast majority use CommonJS. Consider standardizing on CJS for consistency (the project uses CJS exclusively in hooks and tools).

---

## Post-Archive Projected State

After P1 archival:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total modules | 233 | ~90 | -61% |
| Total LOC | 66,676 | ~32,000 | -52% |
| Dead modules | ~104 | ~5 | -95% |
| Subsystems | 29 | ~12 | -59% |

The surviving lib would contain:
- `utils/` (~18 active modules)
- `routing/` (2-3 modules)
- `events/` (2-3 modules)
- `memory/` (~8 active modules)
- `code-indexing/` (~14 modules)
- `workflow/` (~5 active modules)
- `monitoring/` (2-3 modules)
- `self-healing/` (1 module)
- `spawn/` (3 modules)
- `ml/` (under review)
- Root-level `platform.cjs` (if consumers added)

---

## Appendix: Consumer Frequency (Top 10 Most-Consumed Modules)

| Module | Active Consumer Count |
|--------|----------------------|
| utils/project-root.cjs | 30+ |
| utils/hook-input.cjs | 20+ |
| events/event-bus.cjs | 15+ |
| events/event-types.cjs | 15+ |
| utils/atomic-write.cjs | 15+ |
| utils/logger.cjs | 10+ |
| utils/safe-json.cjs | 5+ |
| routing/routing-table.cjs | 4+ |
| utils/jsonl-utils.cjs | 4+ |
| routing/router-state.cjs | 3+ |
