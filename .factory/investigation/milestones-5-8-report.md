# Milestones 5–8 Codebase Investigation Report

**Date:** 2026-03-30  
**Scope:** agent-studio at commit `92344eab` (main branch)

---

## Milestone 5: Intelligent Model Router & Cost Engine

### Existing Files

| File | Lines | Purpose |
|------|-------|---------|
| `.claude/lib/agents/agent-config.cjs` | 147 | Reads `agent-config.json` — maps agent types to tool lists, thinking budget levels, and phases. No model routing logic. |
| `.claude/lib/utils/agent-config-reader.cjs` | 324 | **Model resolver** — ADR-075. Resolves agent→model with precedence: frontmatter > config.yaml > complexity-default > sonnet fallback. Supports opus/sonnet/haiku aliases. |
| `.claude/config/agent-config.json` | ~2208 | Per-agent tool lists and model assignments (e.g., architect→opus, context-compressor→haiku, developer→sonnet). |
| `.claude/lib/workers/budget-enforcement.cjs` | 100 | `BudgetEnforcementService` — TPM (tokens-per-minute, default 400K) and max concurrent workers (default 3). Simple rolling 60s window. |
| `.claude/lib/utils/token-budget-tracker.cjs` | 196 | Phase 2 tracking framework — estimates tokens (char×0.75), tracks per-agent usage in-memory + JSONL log, budget status (OK/WARNING/CRITICAL). Does NOT enforce limits. |
| `.claude/lib/metrics/token-accountant.cjs` | 332 | `TokenAccountant` class — per-task token recording with model-based cost estimation (haiku $0.25/$1.25, sonnet $3/$15, opus $15/$75 per 1K tokens). Persists to disk via atomic writes. Supports session totals, per-agent aggregation. |
| `.claude/lib/routing/semantic-router.cjs` | 105 | Embedding-based routing — loads prototype vectors from `routing-prototypes.json`, computes cosine similarity to route prompts to agents. Uses `EmbeddingGenerator` + domain boost. |
| `.claude/lib/routing/intent-classifier.cjs` | 492 | Keyword/pattern-based intent classification — maps prompts to agents via intent keywords, prefix patterns, fuzzy matching, capability routing, and domain routing tables. |
| `.claude/lib/routing/sub-router-selection.cjs` | 519 | Hierarchical sub-router system — 9 domain sub-routers (web-frontend, backend, mobile, ai-ml, infra, security, arch-data, product, niche) each with signal-based agent selection rules. |
| `.claude/lib/routing/router-state.cjs` | 810 | Router/agent mode state management — file-based persistence with locking, write-guard enforcement (block/warn/off), complexity tracking. |
| `.claude/lib/routing/routing-table-core-map.cjs` | 462 | Core routing table with agent→skill mappings. |
| `.claude/lib/routing/circuit-breaker.cjs` | 243 | Circuit breaker pattern for routing resilience. |

### Tests

- `tests/lib/agents/agent-config.test.cjs`, `agent-config-schema.test.cjs`, `populate-agent-config.test.cjs`
- `tests/lib/utils/agent-config-reader.test.cjs`
- `tests/lib/workers/budget-enforcement.test.cjs`
- `tests/utils/token-budget-tracker.test.cjs`
- `tests/lib/token-accountant.test.cjs`
- `tests/lib/routing/semantic-router.test.cjs`, `intent-classifier.test.cjs`, plus ~25 routing guard tests
- `tests/integration/routing-specialist-e2e.test.cjs`, `routing-all-agents.test.cjs`

### Routing Module Summary (24 files, ~5,360 total lines)

The routing layer is the most mature subsystem, covering intent classification, hierarchical domain routing, semantic embedding routing, disambiguation, pattern matching, task claim/lifecycle, and circuit breaking.

### Key Gaps for Milestone 5

1. **No dynamic model router** — Model selection is static (config.yaml/frontmatter) per agent type. No runtime cost-aware model switching (e.g., downgrading from opus→sonnet if budget is running low).
2. **No real cost engine** — `TokenAccountant` tracks costs after-the-fact with hardcoded pricing. No integration with real API usage data, no cost ceiling enforcement, no provider billing API integration.
3. **No multi-provider support** — Only Anthropic Claude models supported (opus/sonnet/haiku). No OpenAI, Google, or other LLM provider compatibility.
4. **No latency-aware routing** — Routing picks agents by intent/domain but doesn't factor in response latency or model availability.
5. **Budget enforcement is basic** — `BudgetEnforcementService` only does TPM rate-limiting for the worker pool, not session/project-level budget caps.
6. **No cost prediction** — No pre-task cost estimation to decide which model to route to.

---

## Milestone 6: Readiness Reports CLI + Auto-Remediation

### Existing Files

| File | Lines | Purpose |
|------|-------|---------|
| `.claude/lib/readiness/readiness-scorer.cjs` | 739 | **5-level Autonomy Maturity Model (AMM)** with 9 weighted pillars: styleAndValidation (1.0), buildSystem (1.0), testing (1.5), documentation (0.8), developmentEnvironment (0.8), debuggingAndObservability (1.0), security (1.2), taskDiscovery (0.7), productAndExperimentation (0.5). Executes real commands and checks exit codes. Levels: L1 (0-39), L2 (40-59), L3 (60-79), L4 (80-94), L5 (95-100). Gate threshold at 80%. Uses AJV schema validation on output. |
| `.claude/lib/readiness/readiness-remediation.cjs` | 784 | Auto-remediation pipeline — generates remediation tasks per failing pillar. Scaffolds missing configs (ESLint, Prettier, tsconfig, jest.config, devcontainer.json, AGENTS.md, pre-commit hooks). Supports dry-run mode, git branch creation per remediation, and branch restoration. |
| `.claude/lib/utils/readiness-checker.cjs` | 77 | Implementation readiness gate checker — 5 gates: Requirements, TechnicalDesign, DependenciesResolved, TestStrategy, AcceptanceCriteria. Boolean checks only. |
| `.claude/skills/implementation-readiness/` | Scaffold only | SKILL.md + schemas exist but `scripts/main.cjs` is a **scaffold stub** (prints warning, exits 1). |
| `.claude/skills/project-stage-detection/` | Full skill | Has SKILL.md, schemas, commands, hooks, rules, and a `scripts/main.cjs`. |

### Tests

- `tests/readiness/readiness-scorer.test.cjs`
- `tests/readiness/readiness-remediation.test.cjs`
- `tests/lib/readiness-checker.test.cjs`
- `tests/integration/readiness-bootstrap.test.cjs`

### Exports Summary

**readiness-scorer.cjs** exports: `ReadinessScorer` (class), `scoreReadiness()`, `PILLAR_WEIGHTS`, `LEVEL_BOUNDARIES`, `GATE_THRESHOLD`, `DEFAULT_TIMEOUT`, `PILLAR_DEFINITIONS`, `READINESS_REPORT_SCHEMA`, `validateReport`, `getLevelFromScore`, `calculateOverallScore`

**readiness-remediation.cjs** exports: `ReadinessRemediation` (class), `remediateReadiness()`, `REMEDIATION_TEMPLATES`, `checkGitAvailable`, `getCurrentBranch`, `createBranch`, `checkoutBranch`, `generateTimestamp`

### Key Gaps for Milestone 6

1. **No CLI entry point** — No `readiness` command or CLI binary. Scoring and remediation are library functions only, not exposed as a CLI tool (e.g., `npx readiness-report`).
2. **No report output formatting** — The scorer produces JSON objects but has no CLI-friendly rendering (table output, color coding, markdown reports, etc.).
3. **No CI/CD integration** — No GitHub Action, pre-push hook, or pipeline integration for readiness gates.
4. **implementation-readiness skill is unimplemented** — The skill is scaffolded but non-functional.
5. **No historical tracking** — No trend analysis or readiness score history over time.
6. **No configurable thresholds** — Pillar weights and level boundaries are hardcoded, not user-configurable per project.
7. **Remediation is template-only** — Auto-remediation scaffolds config files but doesn't install packages, configure CI, or do anything beyond file creation.

---

## Milestone 7: Cross-Repo Knowledge Graph

### Existing Files — Memory System (45 files, ~10,500+ total lines)

| File | Lines | Purpose |
|------|-------|---------|
| `contextual-memory.cjs` | 705 | **Unified aggregation layer** — routes queries to LanceDB (semantic), SQLite (entity/graph), or filesystem (raw). Smart routing for search/findEntities/getRelated/readFile. |
| `lancedb-client-impl.cjs` | 1380 | **LanceDB vector store** — embedded serverless vector DB with `@lancedb/lancedb` + `@xenova/transformers` for local embeddings (all-MiniLM-L6-v2). Supports GPU, batch embedding, typed metadata filters. |
| `lancedb-client.cjs` | 17 | Entrypoint re-export for `MemoryVectorStore`. |
| `lancedb-client-helpers.cjs` | 123 | LanceDB SQL filter generation, CUDA path config, typed metadata fields. |
| `entity-extractor.cjs` | 544 | Extracts entities (agents, tasks, skills, concepts, patterns, decisions, issues) and relationships (blocks, implements, references, depends_on) from markdown files into SQLite. |
| `entity-query.cjs` | 452 | `EntityQuery` — graph traversal API: findById, findByType, findRelated (depth-limited BFS), getRelationshipPath (shortest path). |
| `memory-entity-links.cjs` | 185 | Inserts entities and relationships into SQLite DB. |
| `findings-registry.cjs` | 572 | Tracks open findings (issues/bugs) with severity, dedup, resolution, trend logging. |
| `memory-manager-core.cjs` | 506 | Core memory manager orchestration. |
| `memory-manager-core-recording.cjs` | 431 | Recording logic for memory writes. |
| `memory-manager-core-storage.cjs` | 424 | Storage backends for memory. |
| `memory-manager-core-reporting.cjs` | 160 | Reporting/stats for memory usage. |
| `memory-tiers.cjs` | 632 | Hot/warm/cold tiered storage with eviction. |
| `memory-scheduler.cjs` | 585 | Scheduled memory operations (compression, archival). |
| `memory-dashboard.cjs` | 581 | Dashboard utilities for memory inspection. |
| `observations.cjs` | 335 | Observation recording system. |
| `memory-slo-metrics.cjs` | 305 | SLO tracking for memory operations. |
| `cold-storage.cjs` | 299 | Cold tier storage implementation. |
| `memory-rotator.cjs` | 279 | Log/memory file rotation. |
| `memory-manager-cli.cjs` | 279 | CLI interface for memory management. |
| `memory-extraction-writer.cjs` | 273 | Writes extraction pipeline results. |
| `smart-pruner.cjs` | 249 | Intelligent memory pruning. |
| `memory-tiers-ltm-helpers.cjs` | 245 | Long-term memory helpers. |
| `memory-extractor.cjs` | 235 | Content extraction from sessions. |
| `memory-sanitizer.cjs` | 232 | Sanitization of memory content. |
| `contextual-memory-search-fallback.cjs` | 204 | Ripgrep/ast-grep fallback when vector search unavailable. |
| `memory-deduplicator.cjs` | 196 | Deduplication of memory entries. |
| `adaptive-recall.cjs` | 180 | Adaptive recall scoring. |
| `importance-scorer.cjs` | 172 | Importance scoring for memories. |
| `contextual-memory-context-loader.cjs` | 439 | Context quality scoring and LTM access tracking. |
| `memory-scheduler-tasks.cjs` | 521 | Individual scheduled task definitions. |
| `completion-memory-writer.cjs` | 126 | Writes completion summaries. |
| `session-summary.cjs` | 141 | Session summary generation. |
| `intent-analyzer.cjs` | 111 | Memory intent analysis. |
| `run-extraction-pipeline.cjs` | 109 | Extraction pipeline orchestrator. |
| `memory-tiers-lock.cjs` | 98 | File locking for tier operations. |
| `memory-tiers-cli.cjs` | 82 | CLI for tier management. |
| `memory-search.cjs` | 61 | Basic memory search. |
| `memory-paths.cjs` | 25 | Path constants. |
| `memory-areas.cjs` | 19 | Memory area definitions. |
| `memory-constants.cjs` | 13 | Constants. |
| `memory-dashboard-helpers.cjs` | 123 | Dashboard helper functions. |
| `memory-dashboard-scoring.cjs` | 115 | Dashboard scoring logic. |
| `memory-tier-helpers.cjs` | 139 | Tier utility functions. |

**Subdirectories:**
- `ingestion/` — 5 files: file-converter, file-watcher, image-metadata-extractor, importance-scorer, token-gate
- `consolidation/` — empty directory
- `prompts/` — memory-related prompt templates

### Tests (~70+ test files)

Extensive test coverage including: entity-extractor, entity-query, contextual-memory (multiple test files for search, filters, stale index, entity lifecycle), lancedb (client, GPU, resilience, status), memory-manager, memory-tiers (locking, eviction, concurrency, health), memory-scheduler, memory-sanitizer, memory-rotator, memory-dedup, findings-registry, plus integration and validation tests.

### Key Gaps for Milestone 7

1. **No cross-repo knowledge** — The entire memory system is single-repo scoped. Entities, vectors, and relationships are all project-local (`.claude/context/data/`). No mechanism to federate, share, or query knowledge across repositories.
2. **No knowledge graph visualization** — Entity relationships exist in SQLite but there's no graph visualization, export to graph formats (GraphML, DOT), or interactive exploration.
3. **Entity extraction is regex-based** — `entity-extractor.cjs` uses regex patterns on markdown only. No AST-level code extraction, no LLM-enhanced entity identification.
4. **No relationship inference** — Relationships must be explicitly stated in markdown. No automatic inference from code imports, call graphs, or dependency trees.
5. **Consolidation directory is empty** — The planned `consolidation/` module is unbuilt.
6. **No graph query language** — Queries are limited to depth-bounded BFS. No Cypher-like, SPARQL, or other graph query DSL.
7. **No embedding update pipeline** — No incremental re-indexing when code changes. The `file-watcher.cjs` exists in ingestion but consolidation is empty.
8. **LanceDB is local-only** — No cloud/distributed vector DB option for team sharing.

---

## Milestone 8: Real-Time Observability Dashboard

### Existing Files — Monitoring System (11 files, ~2,136 total lines)

| File | Lines | Purpose |
|------|-------|---------|
| `flight-recorder.cjs` | 159 | **Core telemetry recorder** — JSONL append with rotation (5MB max, 20 file max, 7-day retention). Async via `AsyncLogBuffer`. Fail-open design. Records traceId, component, timestamp, event. |
| `async-log-buffer.cjs` | 120 | Buffered async write stream — 64KB flush trigger, 500ms max latency. Prevents main-thread blocking. |
| `flight-recorder-replay.cjs` | 37 | Replays flight recorder JSONL back into structured entries. |
| `metrics-reader.cjs` | 472 | Reads/aggregates metrics from JSONL files — time filtering, aggregation by event type, success rates, percentile calculations, dashboard summary. |
| `metrics-schema.cjs` | 250 | Schema definitions for metric events: spawn_start/end, memory_load_failed, spawn_assembly, spawn_rag, etc. Validates metric rows. |
| `production-alerts.cjs` | 313 | Alert thresholds and monitoring rules: memory (70%/85% heap), ML feature latency, error rates (0.1%/1%), performance latency budgets (routing <10ms, memory <50ms), spawn rate limits. Exports `checkHeapUsage()`, `checkLatency()`, `checkErrorRate()`, etc. |
| `violation-tracker.cjs` | 337 | Tracks router blacklist violations — JSONL logging with rotation, rate limiting (5K/hr), threshold alerting, tool whitelist enforcement. |
| `slo-rollups.cjs` | 79 | Aggregates flight recorder entries into SLO metrics — hook latency p50/p95, recorder write success rate. |
| `spawn-log.cjs` | 194 | Spawn event logging — spawn start/end/error, assembly metrics, token burn metrics. Multiple JSONL files. |
| `router-churn-log.cjs` | 110 | Logs router churn metrics (frequent re-routing). |
| `runtime-health-log.cjs` | 65 | Logs runtime health: RSS/heap memory, component status, duration. |

### Hooks (6 files)

| File | Purpose |
|------|---------|
| `hooks/monitoring/metrics-collector.cjs` | PostToolUse hook — collects hook execution time, success/failure rates, bottleneck detection. Rate-limited at 10K/hr. |
| `hooks/monitoring/context-window-monitor.cjs` | PostToolUse hook — warns at 65% context used, critical at 75%. Reads from budget-tracker.json. |
| `hooks/monitoring/slo-alert-gate.cjs` | SLO threshold monitoring hook. |
| `hooks/monitoring/hook-error-detector.cjs` | Detects and logs hook execution errors. |
| `hooks/monitoring/recurring-issue-detector.cjs` | Detects recurring issue patterns. |
| `hooks/monitoring/error-tracker.cjs` | General error tracking. |
| `hooks/monitoring/ccusage-statusline.cjs` | Usage status line display. |
| `hooks/metrics/post-tool-metrics-unified.cjs` | Unified post-tool metrics collection. |
| `hooks/metrics/search-telemetry-helpers.cjs` | Search operation telemetry. |
| `hooks/metrics/findings-snapshot-helpers.cjs` | Findings snapshot metrics. |

### Tests (11 test files)

- `flight-recorder.test.cjs`, `flight-recorder-rotation.test.cjs`, `flight-recorder-replay.test.cjs`, `flight-recorder-drain.test.cjs`
- `flight-recorder-schema-gate.test.cjs` (validation)
- `flight-recorder-maintenance-cli.test.cjs` (tools)
- `flight-recorder-throughput.test.cjs` (benchmark)
- `violation-tracker.test.cjs`, `spawn-log.test.cjs`
- `metrics-reader.test.cjs`, `metrics-reader-rollups.test.cjs`
- `router-churn-log.test.cjs`
- `hooks/monitoring/slo-alert-gate.test.cjs`, `hook-error-detector.test.cjs`

### Key Gaps for Milestone 8

1. **No dashboard UI** — All observability is file-based JSONL logs. No web UI, terminal UI, or any visual dashboard. The `metrics-reader.cjs` has a `getMetricsSummary()` for "dashboard" but it returns JSON, not a rendered view.
2. **No real-time streaming** — No WebSocket, SSE, or any real-time push mechanism. All data access is pull-based file reads.
3. **No time-series database** — Metrics stored in JSONL files with size-based rotation. No InfluxDB, Prometheus, TimescaleDB, or similar TSDB integration.
4. **No distributed tracing** — `traceId` field exists in flight recorder but there's no OpenTelemetry, Jaeger, or distributed tracing integration. Traces are local.
5. **No alerting delivery** — `production-alerts.cjs` defines thresholds but has no notification delivery (Slack, email, PagerDuty). Alert checks must be called programmatically.
6. **No Grafana/Prometheus export** — No metrics export in Prometheus format, no Grafana dashboard definitions.
7. **No agent activity visualization** — No way to see which agents are running, their state, routing decisions, or task progress in real-time.
8. **No log aggregation** — Metrics are scattered across ~6 different JSONL files (spawn-log, router-churn, runtime-health, hook-metrics, violations, flight-recorder). No unified query across all.
9. **No historical analysis** — SLO rollups exist but no long-term trend analysis, anomaly detection, or regression alerting.

---

## Summary Matrix

| Milestone | Maturity | Files | Lines | Tests | Assessment |
|-----------|----------|-------|-------|-------|------------|
| **5: Model Router & Cost** | 🟡 Partial | ~12 key files | ~3,600 | ~30+ | Strong task routing exists but model selection is static. Cost tracking exists but no enforcement or dynamic switching. |
| **6: Readiness CLI** | 🟢 Core Done | 4 key files | ~1,600 | 4 | Scorer + remediation are well-built. Missing CLI wrapper, report formatting, CI integration. |
| **7: Knowledge Graph** | 🟡 Foundation | 45+ files | ~10,500+ | 70+ | Rich single-repo memory with vector search + entity graph. No cross-repo capability at all. |
| **8: Observability** | 🟠 Telemetry Only | 11 lib + 10 hooks | ~2,700 | 14 | Good telemetry collection infrastructure. No dashboard, visualization, real-time streaming, or alerting delivery. |

### Priority Recommendations

1. **Milestone 6** is closest to completion — needs a CLI entry point and output formatting (~1-2 days).
2. **Milestone 5** needs a dynamic model router that reads cost data from `TokenAccountant` and adjusts model selection in real-time (~3-5 days).
3. **Milestone 8** needs a dashboard UI (web or TUI) consuming existing JSONL metrics (~5-7 days for MVP).
4. **Milestone 7** requires the most new architecture — cross-repo federation is a fundamentally new capability (~2-4 weeks).
