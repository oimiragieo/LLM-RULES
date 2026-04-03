<!-- Agent: technical-writer | Task: #5 | Session: 2026-04-02 -->

# tests/ — Test Suite

The test suite mirrors the source directory structure. Each test file corresponds to a module in `.claude/lib/`, `.claude/hooks/`, `.claude/tools/`, or `scripts/`.

**Test runner:** `node --test` (Node.js built-in test runner, no external framework)
**Concurrency:** 1 (tests run sequentially to avoid shared-state conflicts)

---

## Running Tests

```bash
# Run all active tests
pnpm test

# Run framework-specific tests only
pnpm test:framework

# Run a single test file
node --test tests/path/to/file.test.cjs

# Count total tests (active and archived)
node scripts/testing/count-all-tests.mjs
```

---

## Directory Structure

```
tests/
├── agents/             # Agent definition tests
├── cli/                # CLI tool tests
├── code-indexing/      # Code search and indexing tests
├── config/             # Configuration validation tests
├── hooks/              # Hook behavior tests
├── integration/        # Cross-component integration tests
├── lib/                # Library module tests (mirrors .claude/lib/)
│   ├── agents/         # Agent config schema tests
│   ├── code-indexing/  # BM25, embedding, hybrid search internals
│   ├── creators/       # Creator ecosystem impact tests
│   ├── memory/         # Memory system tests (LanceDB, tiers, pruning)
│   ├── monitoring/     # Metrics, health, SLO monitoring tests
│   ├── party-mode/     # Consensus voting tests
│   ├── plan/           # Plan progress tracking tests
│   ├── qa/             # QA criteria and report tests
│   ├── reflection/     # Reflection system contract tests
│   ├── routing/        # Routing logic tests
│   ├── self-healing/   # Loop state management tests
│   ├── spawn/          # Spawn template and assembly tests
│   ├── text-processing/# Sentence chunker tests
│   ├── tools/          # Tool library tests
│   ├── utils/          # Utility module tests
│   └── workflow/       # Workflow engine and state tests
├── misc/               # Miscellaneous validation tests
├── performance-profiling-minimal.test.cjs
├── phase-4/            # Phase 4 workflow pattern tests
├── routing-table.test.cjs
├── scale/              # Scale and performance tests
├── scripts/            # Script import and security tests
├── skills/             # Skill creator and lifecycle tests
├── spec-init.test.cjs
├── tools/              # Tool integration tests
├── unit/               # UI formatter and unit tests
├── utils/              # Token budget and utility tests
├── workflows/          # Workflow creator/updater tests
├── fixtures/           # Static test data (JSON, .gitkeep)
└── (various root-level .test.cjs files)
```

---

## Test Coverage by Area

### `tests/agents/`

Tests for agent definition schemas and core agent behavior.

| Test File               | What It Covers                                      |
| ----------------------- | --------------------------------------------------- |
| `core/planner.test.cjs` | Planner agent task creation and dependency handling |
| `*.archived`            | Archived agent tests (not run)                      |

---

### `tests/cli/`

Tests for CLI tools exposed via `pnpm` scripts.

| Test File                        | What It Covers                             |
| -------------------------------- | ------------------------------------------ |
| `memory-dashboard.test.cjs`      | Memory dashboard CLI output and formatting |
| `setup-package-manager.test.cjs` | Package manager detection in setup wizard  |

---

### `tests/code-indexing/`

Tests for the hybrid code search system (BM25 + semantic).

| Test File                      | What It Covers                               |
| ------------------------------ | -------------------------------------------- |
| `ast-grep-wrapper.test.cjs`    | AST-grep wrapper for structural code search  |
| `cli.test.cjs`                 | Hybrid search CLI interface                  |
| `hybrid-search-cli.test.cjs`   | End-to-end CLI hybrid search behavior        |
| `hybrid-search.test.cjs`       | Core hybrid search (BM25 + semantic ranking) |
| `parser.test.cjs`              | Code parser for chunk extraction             |
| `query-analyzer.test.cjs`      | Query intent classification                  |
| `result-ranker.test.cjs`       | RRF result merging and ranking               |
| `ripgrep-integration.test.cjs` | ripgrep integration for text search          |
| `semantic-chunker.test.cjs`    | Semantic chunking of source files            |

---

### `tests/config/`

Configuration consistency and schema validation.

| Test File                           | What It Covers                                   |
| ----------------------------------- | ------------------------------------------------ |
| `phase-models-consistency.test.cjs` | Validates phase model assignments are consistent |

---

### `tests/hooks/`

Tests for PreToolUse/PostToolUse enforcement hooks.

| Test File                                            | What It Covers                                    |
| ---------------------------------------------------- | ------------------------------------------------- |
| `check-console-log.test.cjs`                         | Hook that blocks `console.log` in production code |
| `conflict-detector.test.cjs`                         | Detects conflicting file writes across agents     |
| `database-validators.test.cjs`                       | Validates database operation safety               |
| `filesystem-validators.test.cjs`                     | Validates file path safety and write permissions  |
| `network-validators.test.cjs`                        | Validates network operation safety                |
| `process-validators.test.cjs`                        | Validates child process spawn safety              |
| `spawn-prompt-assembler-constitution.test.cjs`       | Constitution layer of spawn prompt assembly       |
| `spawn-prompt-assembler-context-mode.test.cjs`       | Context-mode layer of spawn prompt assembly       |
| `spawn-prompt-assembler-preset-integration.test.cjs` | Preset integration for spawn prompt assembly      |
| `unified-creator-guard-templates.test.cjs`           | Creator guard for template paths                  |
| `windows-null-sanitizer.test.cjs`                    | Windows `nul` path sanitization                   |
| `project-root-write-guard.test.cjs`                  | Blocks writes to the project root                 |
| `spawn-prompt-validator-security.test.cjs`           | Security validation for spawn prompts             |
| `*.archived`                                         | Archived hook tests (not run)                     |

---

### `tests/integration/`

Cross-component integration tests that verify end-to-end wiring.

| Test File                                | What It Covers                               |
| ---------------------------------------- | -------------------------------------------- |
| `evolution-integration-wiring.test.cjs`  | Evolution orchestrator hook wiring           |
| `reflection-integration-wiring.test.cjs` | Reflection agent pipeline wiring             |
| `routing-all-agents.test.cjs`            | Routing table coverage across all 119 agents |

---

### `tests/lib/`

Unit tests for `.claude/lib/` modules. Mirrors the lib directory structure exactly.

#### `tests/lib/agents/`

| Test File                          | What It Covers                              |
| ---------------------------------- | ------------------------------------------- |
| `agent-config-schema.test.cjs`     | Agent YAML/MD frontmatter schema validation |
| `agent-template-contract.test.cjs` | Agent template contract enforcement         |

#### `tests/lib/code-indexing/`

| Test File                               | What It Covers                                 |
| --------------------------------------- | ---------------------------------------------- |
| `benchmark-fast-path.test.cjs`          | Fast-path performance for embedding generation |
| `bm25-indexer.test.cjs`                 | BM25 text index build and query                |
| `embedding-generator-gpu.test.cjs`      | GPU-accelerated embedding generation           |
| `gpu-detector.test.cjs`                 | CUDA/GPU availability detection                |
| `hybrid-search.test.cjs`                | Hybrid search integration                      |
| `parse-chunk-worker-fast-path.test.cjs` | Worker thread fast-path for parsing            |

#### `tests/lib/memory/`

| Test File                                   | What It Covers                               |
| ------------------------------------------- | -------------------------------------------- |
| `contextual-memory.test.cjs`                | Contextual memory storage and retrieval      |
| `contextual-memory.search-filters.test.cjs` | Search filter logic for memory queries       |
| `fastembed-gpu-integration.test.cjs`        | FastEmbed GPU integration for memory         |
| `lancedb-client.test.cjs`                   | LanceDB client operations                    |
| `lancedb-client-gpu.test.cjs`               | LanceDB GPU acceleration                     |
| `lancedb-client-gpu-integration.test.cjs`   | End-to-end GPU integration                   |
| `lancedb-client-status.test.cjs`            | LanceDB connection status checks             |
| `lancedb-gpu.test.cjs`                      | LanceDB GPU pathway                          |
| `lock-enforcement.test.cjs`                 | File locking for concurrent memory writes    |
| `memory-dashboard.test.cjs`                 | Memory dashboard data model                  |
| `memory-dashboard-slo.test.cjs`             | SLO tracking for memory operations           |
| `memory-entity-links.test.cjs`              | Entity link graph in memory                  |
| `memory-forget-delete.test.cjs`             | Memory deletion and forgetting               |
| `memory-management-integration.test.cjs`    | Full memory management pipeline              |
| `memory-manager.test.cjs`                   | Core memory manager operations               |
| `memory-manager-observability.test.cjs`     | Observability hooks for memory manager       |
| `memory-scheduler-perf-009.test.cjs`        | Performance regression for memory scheduler  |
| `memory-tiers-ltm-eviction.test.cjs`        | LTM eviction policy enforcement              |
| `named-memory.test.cjs`                     | Named memory slots                           |
| `smart-pruner-contract.test.cjs`            | Smart pruner contract validation             |
| `verify-gpu-usage.test.cjs`                 | Verifies GPU is actually used when available |

#### `tests/lib/monitoring/`

| Test File                                 | What It Covers                     |
| ----------------------------------------- | ---------------------------------- |
| `memory-cache-stability-summary.test.cjs` | Cache stability metrics reporting  |
| `memory-slo-summary.test.cjs`             | Memory SLO summary generation      |
| `metrics-reader.test.cjs`                 | Metrics file reading               |
| `metrics-reader-rollups.test.cjs`         | Metrics rollup aggregation         |
| `metrics-schema-contract.test.cjs`        | Metrics schema contract validation |
| `router-churn-log.test.cjs`               | Router churn event logging         |
| `runtime-health-log.test.cjs`             | Runtime health log writing         |
| `spawn-log.test.cjs`                      | Spawn event logging                |

#### `tests/lib/routing/`

| Test File                          | What It Covers                    |
| ---------------------------------- | --------------------------------- |
| `agent-registry-resolver.test.cjs` | Agent registry lookup by type     |
| `fuzzy-intent-matcher.test.cjs`    | Fuzzy intent matching for routing |
| `pattern-router.test.cjs`          | Pattern-based routing decisions   |
| `task-update-contract.test.cjs`    | TaskUpdate contract enforcement   |

#### `tests/lib/spawn/`

| Test File                            | What It Covers                        |
| ------------------------------------ | ------------------------------------- |
| `presets-schema.test.cjs`            | Spawn preset schema validation        |
| `prompt-assembler-security.test.cjs` | Security checks in prompt assembly    |
| `spawn-template-resolver.test.cjs`   | Template resolution for spawn prompts |

#### `tests/lib/tools/`

| Test File                                 | What It Covers                         |
| ----------------------------------------- | -------------------------------------- |
| `agent-catalog-generator.test.cjs`        | Agent catalog generation               |
| `agent-health-tracker.test.cjs`           | Agent health event tracking            |
| `agent-health-tracker-edge.test.cjs`      | Edge cases in health tracking          |
| `agent-registry-generator.test.cjs`       | Registry generation from agent files   |
| `agent-registry-generator-alias.test.cjs` | Alias handling in registry generation  |
| `agent-registry-generator-edge.test.cjs`  | Edge cases in registry generation      |
| `available-agents.test.cjs`               | Available agents list                  |
| `available-agents-consistency.test.cjs`   | Consistency between registry and files |
| `document-query.test.cjs`                 | Document query tool                    |
| `memory-record.test.cjs`                  | MemoryRecord tool behavior             |
| `memory-record-concurrency.test.cjs`      | Concurrent MemoryRecord writes         |
| `quick-status.test.cjs`                   | Quick status reporting tool            |
| `skill-catalog.test.cjs`                  | Skill catalog generation               |
| `tool-set.test.cjs`                       | Tool set definition validation         |

#### `tests/lib/utils/`

| Test File                             | What It Covers                           |
| ------------------------------------- | ---------------------------------------- |
| `atomic-write-sync-locking.test.cjs`  | Atomic file write with lock              |
| `context-reset.test.cjs`              | Context reset utility                    |
| `error-sanitizer.test.cjs`            | Error message sanitization               |
| `file-cache.test.cjs`                 | File-backed cache utility                |
| `hook-input.test.cjs`                 | Hook input parsing                       |
| `hook-resolver.test.cjs`              | Hook resolution by event type            |
| `jsonl-utils.test.cjs`                | JSONL file read/write utilities          |
| `logger.test.cjs`                     | Structured logger                        |
| `logical-unit-tracker.test.cjs`       | Logical unit tracking for context        |
| `path-helpers.test.cjs`               | Cross-platform path helpers              |
| `platform.test.cjs`                   | Platform detection (Windows/Linux/macOS) |
| `project-root.test.cjs`               | Project root resolution                  |
| `require-analyzer.test.cjs`           | Static require/import analysis           |
| `safe-json-bounded-set.test.cjs`      | Bounded set for safe JSON                |
| `safe-json-strip-dangerous.test.cjs`  | Prototype pollution stripping            |
| `safe-json-structured-clone.test.cjs` | Structured clone with safety             |
| `schema-validator.test.cjs`           | JSON schema validation helper            |
| `sensitive-scrubber.test.cjs`         | PII/secret scrubbing from logs           |
| `state-cache.test.cjs`                | State cache utility                      |

#### `tests/lib/workflow/`

| Test File                                      | What It Covers                         |
| ---------------------------------------------- | -------------------------------------- |
| `artifact-graph-path.test.cjs`                 | Artifact graph path resolution         |
| `artifact-integrator-spawner.test.cjs`         | Artifact integrator spawn logic        |
| `checkpoint-manager.test.cjs`                  | Workflow checkpoint save/restore       |
| `decision-handler-security.test.cjs`           | Security in workflow decision handling |
| `integration-example.test.cjs`                 | Integration example workflow           |
| `step-validators.test.cjs`                     | Step input/output validation           |
| `step-validators.security.test.cjs`            | Security-focused step validation       |
| `workflow-engine.test.cjs`                     | Core workflow engine execution         |
| `workflow-engine-events.test.cjs`              | Workflow event emission                |
| `workflow-engine-gates-rollback.test.cjs`      | Gate failures and rollback             |
| `workflow-engine-methods-persistence.test.cjs` | State persistence for workflow engine  |
| `workflow-state-manager.test.cjs`              | Workflow state management              |
| `workflow-validator.test.cjs`                  | Workflow definition validation         |

---

### `tests/workflows/`

Tests for workflow creator, updater, and CI integration.

#### `tests/workflows/creators/`

| Test File                            | What It Covers             |
| ------------------------------------ | -------------------------- |
| `agent-creator-workflow.test.cjs`    | Agent creation workflow    |
| `schema-creator-workflow.test.cjs`   | Schema creation workflow   |
| `template-creator-workflow.test.cjs` | Template creation workflow |
| `workflow-creator-workflow.test.cjs` | Workflow creation workflow |

#### `tests/workflows/updaters/`

| Test File                            | What It Covers           |
| ------------------------------------ | ------------------------ |
| `agent-updater-workflow.test.cjs`    | Agent update workflow    |
| `hook-updater-workflow.test.cjs`     | Hook update workflow     |
| `schema-updater-workflow.test.cjs`   | Schema update workflow   |
| `skill-updater-workflow.test.cjs`    | Skill update workflow    |
| `template-updater-workflow.test.cjs` | Template update workflow |
| `workflow-updater-workflow.test.cjs` | Workflow update workflow |

#### Root workflow tests

| Test File                                | What It Covers                      |
| ---------------------------------------- | ----------------------------------- |
| `branch-protection-audit.test.cjs`       | Branch protection rules audit       |
| `ci-ecosystem-gate.test.cjs`             | CI ecosystem gate validation        |
| `course-correction.test.cjs`             | Course correction workflow          |
| `creator-ecosystem-workflow.test.cjs`    | Full creator ecosystem              |
| `required-status-checks-config.test.cjs` | Required status check configuration |
| `verify-phase-uat.test.cjs`              | Phase UAT verification              |
| `workflow-trigger-parity.test.cjs`       | Workflow trigger parity checks      |

---

### Other Root-Level Tests

| Test File                                        | What It Covers                 |
| ------------------------------------------------ | ------------------------------ |
| `brownfield-assessor.test.cjs`                   | Brownfield codebase assessment |
| `memory-monitor.test.cjs`                        | Memory monitor behavior        |
| `misc/hybrid-validation.test.cjs`                | Hybrid search validation       |
| `performance-profiling-minimal.test.cjs`         | Minimal performance profiling  |
| `phase-4/workflow-patterns-conditional.test.cjs` | Conditional workflow patterns  |
| `routing-table.test.cjs`                         | Routing table coverage         |
| `scale/track-analytics-scale.test.cjs`           | Analytics scale test           |
| `scripts/install-security.test.cjs`              | Install script security checks |
| `scripts/script-imports.test.cjs`                | Script import validation       |
| `skills/creators/post-execute-cleanup.test.cjs`  | Skill creator cleanup          |
| `spec-init.test.cjs`                             | Spec init skill                |
| `tech-stack-detector.test.cjs`                   | Tech stack detection           |
| `tools/cli/error-report.test.cjs`                | Error report CLI tool          |
| `tools/cli/generate-workflow-registry.test.cjs`  | Workflow registry generation   |
| `tools/generate-embeddings.test.cjs`             | Embedding generation tool      |
| `tools/integration-health-dashboard.test.cjs`    | Integration health dashboard   |
| `tools/phantom-scripts.test.cjs`                 | Phantom script detection       |
| `unit/ui/formatter.test.cjs`                     | UI output formatter            |
| `utils/token-budget-tracker.test.cjs`            | Token budget tracking          |

---

## Archived Tests

Files with the `.archived` suffix are excluded from the test run. They document tests for features that were removed, refactored, or replaced. Do not delete them — they provide historical context and can be restored if functionality returns.

---

## `tests/fixtures/`

Static test data used by multiple test files.

| Path                    | Contents                                             |
| ----------------------- | ---------------------------------------------------- |
| `fixtures/checkpoints/` | JSON snapshots for workflow checkpoint manager tests |
| `fixtures/.gitkeep`     | Keeps the directory in git even when empty           |

---

## Writing New Tests

1. Place the test file in the directory that mirrors its source module.
2. Name it `<module-name>.test.cjs`.
3. Use Node.js built-in `assert` and `node:test`.
4. Run `node --test tests/path/to/your.test.cjs` to verify before committing.
5. If the test is experimental or covers a removed feature, add the `.archived` suffix.
