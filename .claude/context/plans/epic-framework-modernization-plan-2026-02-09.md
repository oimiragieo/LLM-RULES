<!-- Agent: planner | Task: #1 EPIC | Session: 2026-02-09 -->

# EPIC Plan: Systematic Framework Modernization

## Executive Summary

A comprehensive 4-batch, dependency-first modernization of the entire agent-studio framework (`C:\dev\projects\agent-studio\.claude\`). Each batch builds on the previous, ensuring no regressions. The plan covers 400+ files across schemas, config, rules, context, libraries, tools, docs, templates, scripts, hooks, commands, skills, agents, and workflows.

**Strategy**: Foundation-first (data structures and rules) -> Resources (libraries and tools) -> Action (hooks and skills) -> Intelligence (agents and workflows). Each batch validated before the next begins.

**Total Estimated Effort**: 120-180 hours across 4 batches
**Total Files in Scope**: ~420 active files (excluding _archive)
**Total Agents Required**: 12+ agent types per batch (full enterprise pipeline)

---

## Table of Contents

1. [Dependency Map](#dependency-map)
2. [Batch 1: Foundations](#batch-1-foundations)
3. [Batch 2: Resources](#batch-2-resources)
4. [Batch 3: Action](#batch-3-action)
5. [Batch 4: Intelligence](#batch-4-intelligence)
6. [Quality Gates](#quality-gates)
7. [Risk Assessment](#risk-assessment)
8. [Enterprise Pipeline Per Batch](#enterprise-pipeline-per-batch)

---

## Dependency Map

### Critical Dependency Graph (Bottom-Up)

```
LAYER 0: Foundation (zero dependencies)
  .claude/schemas/*.schema.json
  .claude/config.yaml
  .claude/rules/*.md
  .claude/context/memory/*.md

LAYER 1: Utility Libraries (depend on Layer 0)
  .claude/lib/utils/project-root.cjs       <- used by 30+ files
  .claude/lib/utils/hook-input.cjs         <- used by 20+ hooks
  .claude/lib/utils/atomic-write.cjs       <- used by 15+ files
  .claude/lib/utils/safe-json.cjs          <- used by 12+ files
  .claude/lib/utils/jsonl-utils.cjs        <- used by 10+ files
  .claude/lib/utils/logger.cjs             <- used by 10+ files
  .claude/lib/utils/state-cache.cjs        <- used by 8+ hooks
  .claude/lib/utils/config-loader.cjs      <- reads config.yaml
  .claude/lib/utils/schema-validator.cjs   <- reads schemas/

LAYER 2: Domain Libraries (depend on Layer 1)
  .claude/lib/routing/router-state.cjs     <- used by 10+ hooks
  .claude/lib/routing/routing-table.cjs    <- used by routing-guard
  .claude/lib/events/event-bus.cjs         <- used by 15+ hooks
  .claude/lib/events/event-types.cjs       <- used by 15+ hooks
  .claude/lib/memory/*.cjs                 <- memory subsystem (18 files)
  .claude/lib/code-indexing/*.cjs          <- search subsystem (13 files)
  .claude/lib/creators/*.cjs               <- creator subsystem (3 files)

LAYER 3: Hooks (depend on Layer 1-2)
  .claude/hooks/routing/*.cjs              <- routing enforcement (8 active)
  .claude/hooks/safety/*.cjs               <- safety enforcement (7 active)
  .claude/hooks/session/*.cjs              <- session management (5 active)
  .claude/hooks/evolution/*.cjs            <- evolution guards (5 active)
  .claude/hooks/validation/*.cjs           <- validation (3 active)
  .claude/hooks/reflection/*.cjs           <- reflection (4 active)
  .claude/hooks/monitoring/*.cjs           <- metrics (3 active)
  .claude/hooks/workflow/*.cjs             <- workflow chain (2 active)
  .claude/hooks/memory/*.cjs               <- memory sync (1 active)
  .claude/hooks/metrics/*.cjs              <- unified metrics (1 active)

LAYER 4: Skills & Commands (depend on Layer 0-2, invoke via Skill())
  .claude/skills/*/SKILL.md                <- 93 active skills
  .claude/commands/*.md                    <- 17 commands

LAYER 5: Agents & Workflows (depend on Layer 0-4)
  .claude/agents/**/*.md                   <- 59 agents (core/domain/specialized/orchestrators)
  .claude/workflows/**/*.md                <- 28 workflows

LAYER 6: Docs & Templates (document Layers 0-5)
  .claude/docs/*.md                        <- 24 reference docs
  .claude/templates/**/*.md                <- 28 active templates
```

### Cross-Layer Dependencies (Critical Paths)

| Source Layer | Target Layer | Count | Key Examples |
|---|---|---|---|
| Hooks -> lib/utils | L3 -> L1 | 80+ requires | hook-input, project-root, jsonl-utils |
| Hooks -> lib/routing | L3 -> L2 | 10+ requires | router-state, routing-table |
| Hooks -> lib/events | L3 -> L2 | 15+ requires | event-bus, event-types |
| lib/memory -> lib/utils | L2 -> L1 | 25+ requires | atomic-write, logger, project-root |
| lib/memory -> tools/cli | L2 -> L2 | 3 requires | init-memory-db |
| Skills -> schemas | L4 -> L0 | implicit | schema validation |
| Agents -> skills | L5 -> L4 | implicit | Skill() invocations |
| Agents -> rules | L5 -> L0 | implicit | rule compliance |
| Docs -> all layers | L6 -> L0-5 | implicit | documentation of all |

---

## Batch 1: Foundations

**Scope**: `.claude/schemas/`, `.claude/config.yaml`, `.claude/rules/`, `.claude/context/`
**Goal**: Modernize data structures, validation schemas, configuration, and workspace rules
**Estimated Effort**: 25-35 hours
**Files in Scope**: 95 active files

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research modern schema patterns, configuration best practices, memory management, and rule systems
**Duration**: 6-8 hours
**Parallel OK**: Yes (4 parallel researchers)

#### Research Requirements (MANDATORY)

| # | Research Topic | Queries | Target Agent |
|---|---|---|---|
| 0.1 | Modern JSON Schema patterns (2024-2026) | arxiv: "JSON Schema validation performance", "schema evolution strategies"; reddit: "best practices JSON Schema $ref composition" | `researcher` |
| 0.2 | YAML configuration management best practices | arxiv: "configuration management AI systems"; reddit: "yaml config management monorepo", "feature flag patterns 2026" | `researcher` |
| 0.3 | Workspace rules & linting rule systems | arxiv: "static analysis rule specification"; reddit: "eslint custom rules architecture", "workspace conventions automation" | `researcher` |
| 0.4 | Memory management for AI agent systems | arxiv: "long-term memory AI agents 2025", "context window optimization LLM"; reddit: "AI agent memory patterns", "vector db vs markdown memory" | `researcher` |

**Research Output**: `.claude/context/artifacts/research-reports/batch1-foundations-research-2026-02-09.md`

#### Constitution Checkpoint

1. **Research Completeness**
   - [ ] 4 research reports with 3+ external sources each (12+ total)
   - [ ] All unknowns resolved
   - [ ] ADR for schema evolution strategy

2. **Technical Feasibility**
   - [ ] Schema changes backward-compatible
   - [ ] Config changes have rollback path
   - [ ] Memory changes preserve existing data

3. **Security Review**
   - [ ] Schema validation cannot be bypassed
   - [ ] Config changes don't expose secrets
   - [ ] Memory file access patterns validated

4. **Specification Quality**
   - [ ] Each schema has measurable validation criteria
   - [ ] Each rule has enforcement mechanism
   - [ ] Each config key has documentation

---

### Phase 1: Schemas Review & Modernization

**Purpose**: Update all 27 active JSON schemas to modern patterns
**Dependencies**: Phase 0 complete
**Duration**: 8-10 hours

#### Files (Ordered by Dependency)

**Active Schemas (27 files)**:

| # | File | Research Topics | Priority |
|---|---|---|---|
| 1.1 | `agent-definition.schema.json` | Modern agent definition patterns, frontmatter validation | P0 - Used by 59 agents |
| 1.2 | `agent-config.schema.json` | Agent configuration validation, model resolution | P0 - Used by config loader |
| 1.3 | `skill-definition.schema.json` | Skill metadata patterns, capability declaration | P0 - Used by 93 skills |
| 1.4 | `hook-definition.schema.json` | Hook registration validation, event type enums | P0 - Used by 39 hooks |
| 1.5 | `workflow-definition.schema.json` | Workflow state machine patterns, phase modeling | P0 - Used by 28 workflows |
| 1.6 | `plan.schema.json` | Plan structure validation, phase/task modeling | P1 - Used by planner |
| 1.7 | `implementation-plan.schema.json` | Implementation task structure | P1 - Used by plan-generator |
| 1.8 | `product_requirements.schema.json` | PRD validation, MoSCoW tables | P1 - Used by prd-generator |
| 1.9 | `specification-template.schema.json` | Spec template validation | P1 - Used by spec-gathering |
| 1.10 | `project-analysis.schema.json` | Project analysis output | P2 |
| 1.11 | `project_brief.schema.json` | Project brief validation | P2 |
| 1.12 | `system_architecture.schema.json` | Architecture doc validation | P2 |
| 1.13 | `test_plan.schema.json` | Test plan structure | P2 |
| 1.14 | `test-results.schema.json` | Test results format | P2 |
| 1.15 | `tool-manifest.schema.json` | Tool manifest validation | P2 |
| 1.16 | `artifact_manifest.schema.json` | Artifact tracking | P2 |
| 1.17 | `artifact-graph.schema.json` | Artifact relationship graph | P2 |
| 1.18 | `evolution-state.schema.json` | Evolution state machine | P2 |
| 1.19 | `phase-models.schema.json` | Phase modeling | P2 |
| 1.20 | `presets.schema.json` | Preset system validation | P2 |
| 1.21 | `track-metadata.schema.json` | Track management | P2 |
| 1.22 | `ux_spec.schema.json` | UX specification | P3 |
| 1.23 | `adr-template.schema.json` | ADR validation | P3 |
| 1.24 | `agent-capability-card.schema.json` | Agent capability cards | P3 |
| 1.25 | `agent-identity.schema.json` | Agent identity/personality | P3 |
| 1.26 | `skill-diagram-generator-output.schema.json` | Diagram output | P3 |
| 1.27 | `skill-repo-rag-output.schema.json` | RAG output | P3 |

**Archived Schemas (22 files in `_archive/`)**: Review for deletion or resurrection.

#### Tasks

- [ ] **1.1** Audit all 27 schemas for $ref composition, enum completeness, required fields (~4 hours)
  - Target Agent: `architect`
  - Recommended Skills: `architecture-review`, `verification-before-completion`

- [ ] **1.2** Update P0 schemas (agent-definition, agent-config, skill-definition, hook-definition, workflow-definition) with modern patterns (~3 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`

- [ ] **1.3** Update P1 schemas (plan, implementation-plan, product_requirements, specification-template) (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`

- [ ] **1.4** Update remaining P2/P3 schemas (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`

- [ ] **1.5** Validate schema changes don't break existing consumers (~1 hour)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `checklist-generator`

**Success Criteria**: All schemas validate against existing data; zero breaking changes confirmed by tests.

---

### Phase 2: Configuration Modernization

**Purpose**: Modernize config.yaml with all agent model mappings, feature flags, and performance tuning
**Dependencies**: Phase 1 schemas complete
**Duration**: 3-4 hours

#### Files

| # | File | Research Topics |
|---|---|---|
| 2.1 | `.claude/config.yaml` | Modern YAML config patterns, 12-factor config, environment-based overrides |
| 2.2 | `.claude/.env.example` | Environment variable documentation completeness |

#### Tasks

- [ ] **2.1** Audit config.yaml: add missing agent model mappings (only 5 of 59 agents configured) (~2 hours)
  - Target Agent: `architect`
  - Recommended Skills: `architecture-review`
  - Research: reddit "yaml config management for multi-agent systems", arxiv "configuration optimization AI"

- [ ] **2.2** Add all enforcement environment variables to .env.example (~1 hour)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Known gap: TASKLIST_FIRST_ENFORCEMENT, STATE_STALE_THRESHOLD_MS missing (issues.md)

- [ ] **2.3** Review and update feature flags for modern patterns (~1 hour)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`

**Success Criteria**: All 59 agents have model resolution path; all env vars documented.

---

### Phase 3: Rules Modernization

**Purpose**: Update 11 workspace rules to reflect current project goals and modern practices
**Dependencies**: Phase 0 research complete
**Duration**: 4-6 hours

#### Files (11 rules)

| # | File | Research Topics | Priority |
|---|---|---|---|
| 3.1 | `rules/code-standards.md` | Modern code quality standards 2026, AI-assisted coding patterns | P0 |
| 3.2 | `rules/testing.md` | Modern testing patterns, AI-generated test strategies, integration boundary testing (ADR-103) | P0 |
| 3.3 | `rules/security.md` | OWASP 2025 updates, supply chain security, AI-specific security patterns | P0 |
| 3.4 | `rules/hooks.md` | Hook authoring best practices, performance optimization | P1 |
| 3.5 | `rules/memory-protocol.md` | AI memory persistence patterns, context management strategies | P1 |
| 3.6 | `rules/task-tracking.md` | Modern task tracking in AI systems, structured metadata handoff | P1 |
| 3.7 | `rules/agents.md` | Agent routing best practices, specialist-first enforcement | P1 |
| 3.8 | `rules/workspace-conventions.md` | File placement rules, naming conventions | P2 |
| 3.9 | `rules/git-workflow.md` | Modern git workflow for AI-assisted development | P2 |
| 3.10 | `rules/performance.md` | Token optimization, context management, hook performance | P2 |
| 3.11 | `rules/artifact-integration.md` | Cross-artifact integration patterns, creator ecosystem | P2 |

#### Tasks

- [ ] **3.1** Research modern code standards and testing patterns for AI systems (~2 hours)
  - Target Agent: `researcher`
  - Recommended Skills: `research-synthesis`

- [ ] **3.2** Update P0 rules (code-standards, testing, security) with modern techniques (~2 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`, `verification-before-completion`
  - Research: Include ADR-103 (integration boundary testing), OWASP 2025 updates

- [ ] **3.3** Update P1 rules (hooks, memory-protocol, task-tracking, agents) (~1.5 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`

- [ ] **3.4** Update P2 rules (workspace-conventions, git-workflow, performance, artifact-integration) (~1 hour)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`

**Success Criteria**: All rules reflect current project state; no contradictions with CLAUDE.md.

---

### Phase 4: Context & Memory Modernization

**Purpose**: Clean up context artifacts, update memory files, modernize data structures
**Dependencies**: Phases 1-3 complete
**Duration**: 4-6 hours

#### Files

**Memory Files (active)**:
- `context/memory/learnings.md` (~800 lines, needs rotation per ADR-102)
- `context/memory/decisions.md` (~820 lines, needs rotation)
- `context/memory/issues.md` (~390 lines, active issues)
- `context/memory/patterns.json`
- `context/memory/gotchas.json`
- `context/memory/codebase_map.json`
- `context/memory/access-stats.json`
- `context/memory/constitution.md`
- `context/memory/behaviour.md`

**Catalogs (active)**:
- `context/artifacts/catalogs/skill-catalog.md` (95 skills)
- `context/artifacts/catalogs/creator-registry.json`
- `context/artifacts/catalogs/workflow-registry.json`
- `context/agent-registry.json` (59 agents)
- `context/agent-catalog.json`

**Runtime State**:
- `context/runtime/router-state.json`
- `context/runtime/session-metrics.json`
- `context/runtime/edit-counter.json`
- `context/runtime/drift-state.json`
- `context/runtime/pre-compact-snapshot.json`
- `context/runtime/reflection-spawn-request.json`

**Data Files**:
- `context/data/artifact-graph.json`
- `context/data/ecosystem-impact-graph.json`
- `context/data/memory.db`
- `context/code-index/` (BM25 index)

#### Tasks

- [ ] **4.1** Execute memory rotation (learnings.md, decisions.md, issues.md) per ADR-102 (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Action: Rotate entries older than 30 days to archive; preserve [PERMANENT] entries

- [ ] **4.2** Update catalogs: skill-catalog, agent-registry, workflow-registry (~1.5 hours)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Action: Verify all entries match filesystem reality; remove stale entries; add missing entries

- [ ] **4.3** Clean context/artifacts: archive stale research reports, error summaries older than 7 days (~1 hour)
  - Target Agent: `developer`
  - Action: Move stale artifacts to _archive; clean tmp/

- [ ] **4.4** Validate all runtime state files have correct structure (~0.5 hours)
  - Target Agent: `qa`
  - Recommended Skills: `checklist-generator`

**Success Criteria**: Memory files under 20KB each; all catalogs accurate; no stale artifacts.

---

### Phase 5: Batch 1 Validation Gate

**Purpose**: Comprehensive validation before Batch 2
**Dependencies**: Phases 1-4 complete
**Duration**: 2-3 hours

#### Tasks

- [ ] **5.1** Run full test suite: `pnpm test` (~0.5 hours)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `checklist-generator`

- [ ] **5.2** Validate schemas against existing data files (~1 hour)
  - Target Agent: `qa`
  - Verify: Every schema validates at least one real file

- [ ] **5.3** Code review of all Batch 1 changes (~1 hour)
  - Target Agent: `code-reviewer`
  - Recommended Skills: `code-analyzer`, `verification-before-completion`

- [ ] **5.4** Commit checkpoint: Batch 1 foundation complete
  - Target Agent: `developer`
  - Command: `git add . && git commit -m "modernize: Batch 1 foundation (schemas, config, rules, context)"`

**Validation Criteria (ALL MUST PASS)**:
- [ ] Zero test regressions (same or better pass rate than baseline)
- [ ] All schemas validate existing data
- [ ] Config.yaml loads without errors
- [ ] All rules internally consistent
- [ ] Memory files under size thresholds
- [ ] `pnpm lint:fix` produces 0 errors
- [ ] `pnpm format` produces no changes

---

### Phase FINAL: Evolution & Reflection Check (Batch 1)

**Purpose**: Quality assessment and learning extraction for Batch 1

**Tasks**:

1. Spawn reflection-agent to analyze completed Batch 1 work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed for Batches 2-4)

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Batch 2: Resources

**Scope**: `.claude/lib/`, `.claude/tools/`, `.claude/docs/`, `.claude/templates/`
**Goal**: Modernize utility functions, tools, documentation, and templates
**Estimated Effort**: 35-50 hours
**Files in Scope**: 160+ active files
**Prerequisite**: Batch 1 validation gate passed

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research modern library patterns, tool architectures, documentation standards
**Duration**: 6-8 hours
**Parallel OK**: Yes (4 parallel researchers)

#### Research Requirements (MANDATORY)

| # | Research Topic | Queries | Target Agent |
|---|---|---|---|
| 0.1 | Modern Node.js utility patterns (ESM, CJS compatibility) | reddit: "nodejs cjs to esm migration 2026", "utility library patterns node"; arxiv: "module system evolution JavaScript" | `researcher` |
| 0.2 | CLI tool architecture best practices | reddit: "nodejs cli tool patterns 2026", "argument parsing best practices"; github: modern CLI frameworks | `researcher` |
| 0.3 | AI framework documentation standards | reddit: "documentation standards AI tools", "living documentation patterns"; arxiv: "automated documentation AI systems" | `researcher` |
| 0.4 | Template engine patterns for code generation | reddit: "template rendering markdown generation", "code scaffolding patterns"; github: template rendering engines | `researcher` |

#### Constitution Checkpoint

1. **Research Completeness**: 4 reports with 3+ sources each (12+ total)
2. **Technical Feasibility**: Library changes backward-compatible
3. **Security Review**: No new attack surfaces
4. **Specification Quality**: Each library has clear API contract

---

### Phase 1: Core Utility Libraries (`lib/utils/`)

**Purpose**: Modernize the foundational utility layer (43 files)
**Dependencies**: Batch 1 complete + Phase 0 research
**Duration**: 10-12 hours

#### Files (Ordered by Dependency - Highest First)

**Tier 1: Critical Path (used by 15+ consumers)**

| # | File | Consumers | Research Topics |
|---|---|---|---|
| 1.1 | `utils/project-root.cjs` | 30+ files | Path resolution patterns, cross-platform compatibility |
| 1.2 | `utils/hook-input.cjs` | 20+ hooks | Hook I/O patterns, stdin/stdout protocol optimization |
| 1.3 | `utils/atomic-write.cjs` | 15+ files | Atomic file operations, crash-safe writes, lockfile patterns |
| 1.4 | `utils/safe-json.cjs` | 12+ files | Safe JSON parse (prototype pollution prevention per SEC findings) |
| 1.5 | `utils/jsonl-utils.cjs` | 10+ files | JSONL append/trim patterns, rotation |
| 1.6 | `utils/logger.cjs` | 10+ files | Structured logging patterns, log levels |

**Tier 2: Important (used by 5-15 consumers)**

| # | File | Research Topics |
|---|---|---|
| 1.7 | `utils/state-cache.cjs` | State caching patterns, TTL management |
| 1.8 | `utils/config-loader.cjs` | Configuration loading, environment override patterns |
| 1.9 | `utils/schema-validator.cjs` | JSON Schema validation performance, ajv alternatives |
| 1.10 | `utils/agent-config-reader.cjs` | Agent model resolution, config.yaml reading |
| 1.11 | `utils/feature-flags.cjs` | Feature flag patterns, gradual rollout |
| 1.12 | `utils/environment.cjs` | Environment detection, platform utilities |
| 1.13 | `utils/platform.cjs` | Platform-specific utilities |
| 1.14 | `utils/path-validator.cjs` | Path validation, traversal prevention |
| 1.15 | `utils/path-helpers.cjs` | Path normalization, artifact name validation |
| 1.16 | `utils/sensitive-scrubber.cjs` | Sensitive data redaction (per SEC-LOG-001) |
| 1.17 | `utils/error-sanitizer.cjs` | Error message sanitization |
| 1.18 | `utils/retry-with-backoff.cjs` | Exponential backoff, retry patterns |

**Tier 3: Specialized (used by <5 consumers)**

| # | File | Research Topics |
|---|---|---|
| 1.19 | `utils/compression-trigger.cjs` | Compression trigger conditions |
| 1.20 | `utils/token-budget-tracker.cjs` | Token counting, budget management |
| 1.21 | `utils/cost-calculator.cjs` | LLM cost estimation |
| 1.22 | `utils/context-accumulator.cjs` | Context accumulation patterns |
| 1.23 | `utils/context-reset.cjs` | Context reset utilities |
| 1.24 | `utils/hook-logger.cjs` | Hook-specific logging |
| 1.25 | `utils/hook-resolver.cjs` | Hook resolution and loading |
| 1.26 | `utils/require-analyzer.cjs` | Static require() analysis |
| 1.27 | `utils/memory-monitor.cjs` | Memory usage monitoring |
| 1.28 | `utils/memory-integrated-suggester.cjs` | Memory-based suggestions |
| 1.29 | `utils/package-manager.cjs` | Package manager detection |
| 1.30 | `utils/command-exists.cjs` | Command availability checking |
| 1.31 | `utils/tech-stack-detector.cjs` | Technology stack detection |
| 1.32 | `utils/adaptive-discloser.cjs` | Progressive disclosure utilities |
| 1.33 | `utils/bottleneck-analyzer.cjs` | Performance bottleneck analysis |
| 1.34 | `utils/brownfield-assessor.cjs` | Brownfield project assessment |
| 1.35 | `utils/build-knowledge-base-index.cjs` | Knowledge base indexing |
| 1.36 | `utils/knowledge-base-reader.cjs` | Knowledge base reading |
| 1.37 | `utils/logical-unit-tracker.cjs` | Logical unit tracking |
| 1.38 | `utils/optimization-targets.cjs` | Optimization target identification |
| 1.39 | `utils/pattern-library.cjs` | Pattern matching library |
| 1.40 | `utils/performance-profiler.cjs` | Performance profiling |
| 1.41 | `utils/profiling-report-generator.cjs` | Profiling report generation |
| 1.42 | `utils/readiness-scorer.cjs` | Readiness scoring |
| 1.43 | `utils/track-analytics.cjs` | Track analytics |

#### Tasks

- [ ] **1.1** Security audit: safe-json.cjs (prototype pollution), sensitive-scrubber.cjs (redaction completeness) (~2 hours)
  - Target Agent: `security-architect`
  - Recommended Skills: `security-architect`, `auth-security-expert`
  - Research: arxiv "prototype pollution prevention Node.js", reddit "safe json parse patterns"

- [ ] **1.2** Modernize Tier 1 utilities (project-root, hook-input, atomic-write, safe-json, jsonl-utils, logger) (~4 hours)
  - Target Agent: `nodejs-pro`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - Research: reddit "atomic file operations node 2026", "structured logging best practices"

- [ ] **1.3** Modernize Tier 2 utilities (~3 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`

- [ ] **1.4** Review Tier 3 utilities for dead code candidates (~2 hours)
  - Target Agent: `code-simplifier`
  - Recommended Skills: `code-analyzer`
  - Action: Identify unused utilities; archive confirmed dead code

- [ ] **1.5** Integration tests for all Tier 1 utility changes (~1 hour)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `checklist-generator`

**Success Criteria**: All Tier 1 utilities have 80%+ test coverage; zero security findings in safe-json.

---

### Phase 2: Domain Libraries (`lib/` excluding utils/)

**Purpose**: Modernize routing, memory, code-indexing, events, creators, monitoring subsystems
**Dependencies**: Phase 1 utilities complete
**Duration**: 10-14 hours

#### Subsystem: Routing (`lib/routing/` - 5 active files)

| # | File | Research Topics |
|---|---|---|
| 2.1 | `routing/router-state.cjs` | State management patterns, optimistic concurrency |
| 2.2 | `routing/routing-table.cjs` | Intent routing, keyword matching optimization |
| 2.3 | `routing/agent-registry-resolver.cjs` | Agent discovery patterns |
| 2.4 | `routing/fuzzy-intent-matcher.cjs` | Fuzzy matching algorithms, NLP intent classification |
| 2.5 | `routing/semantic-router.cjs` | Semantic routing, embedding-based matching |
| 2.6 | `routing/pattern-router.cjs` | Pattern-based routing |

**Research**: reddit "intent classification for AI agents", arxiv "semantic routing multi-agent systems 2025"

#### Subsystem: Memory (`lib/memory/` - 18 active files)

| # | File | Research Topics |
|---|---|---|
| 2.7 | `memory/memory-manager.cjs` | Memory management architecture, tiered storage |
| 2.8 | `memory/memory-scheduler.cjs` | Scheduled memory operations, rotation |
| 2.9 | `memory/memory-tiers.cjs` | Hot/warm/cold memory tiers |
| 2.10 | `memory/memory-search.cjs` | Memory search patterns |
| 2.11 | `memory/memory-deduplicator.cjs` | Deduplication algorithms |
| 2.12 | `memory/memory-extractor.cjs` | Memory extraction from conversations |
| 2.13 | `memory/memory-extraction-writer.cjs` | Writing extracted memories |
| 2.14 | `memory/session-summary.cjs` | Session summarization |
| 2.15 | `memory/learnings-parser.cjs` | Learnings file parsing |
| 2.16 | `memory/memory-dashboard.cjs` | Memory monitoring dashboard |
| 2.17 | `memory/contextual-memory.cjs` | Context-aware memory |
| 2.18 | `memory/memory-entity-links.cjs` | Entity relationship linking |
| 2.19 | `memory/entity-query.cjs` | Entity querying |
| 2.20 | `memory/memory-areas.cjs` | Memory area definitions |
| 2.21 | `memory/memory-constants.cjs` | Memory constants |
| 2.22 | `memory/memory-retention-config.cjs` | Retention configuration |
| 2.23 | `memory/audit-trail-integration.cjs` | Audit trail for memory operations |
| 2.24 | `memory/lancedb-client.cjs` | LanceDB vector store integration |

**Research**: arxiv "memory systems for AI agents 2025", reddit "LLM agent memory management patterns"

#### Subsystem: Code Indexing (`lib/code-indexing/` - 13 active files)

| # | File | Research Topics |
|---|---|---|
| 2.25 | `code-indexing/index-manager.cjs` | Code index management, incremental updates |
| 2.26 | `code-indexing/bm25-indexer.cjs` | BM25 scoring optimization |
| 2.27 | `code-indexing/hybrid-search.cjs` | Hybrid search patterns (text + semantic) |
| 2.28 | `code-indexing/query-analyzer.cjs` | Query understanding and intent |
| 2.29 | `code-indexing/result-ranker.cjs` | Search result ranking |
| 2.30 | `code-indexing/vector-store.cjs` | Vector storage patterns |
| 2.31 | `code-indexing/code-parser.cjs` | Code parsing strategies |
| 2.32 | `code-indexing/semantic-chunker.cjs` | Semantic code chunking |
| 2.33 | `code-indexing/ast-grep-wrapper.cjs` | AST pattern matching |
| 2.34 | `code-indexing/merkle-tree.cjs` | Merkle tree for change detection |
| 2.35 | `code-indexing/gpu-detector.cjs` | GPU availability detection |
| 2.36 | `code-indexing/parse-utils.cjs` | Parsing utilities |
| 2.37 | `code-indexing/parse-chunk-worker.cjs` | Worker for chunk parsing |

**Research**: arxiv "code search ranking 2025", "BM25 vs dense retrieval code search"; reddit "hybrid code search implementation"

#### Subsystem: Other Libraries

| # | File | Research Topics |
|---|---|---|
| 2.38 | `events/event-bus.cjs` | Event bus patterns, pub/sub optimization |
| 2.39 | `events/event-types.cjs` | Event type definitions |
| 2.40 | `events/event-bus-sink.cjs` | Event persistence |
| 2.41 | `creators/creator-commons.cjs` | Creator utility patterns |
| 2.42 | `creators/ecosystem-impact-analyzer.cjs` | Impact analysis |
| 2.43 | `creators/companion-check.cjs` | Companion artifact checking |
| 2.44 | `monitoring/dashboard-renderer.cjs` | Dashboard rendering |
| 2.45 | `monitoring/metrics-reader.cjs` | Metrics reading |
| 2.46 | `monitoring/production-alerts.cjs` | Alert generation |
| 2.47 | `monitoring/spawn-log.cjs` | Spawn logging |
| 2.48 | `safety/command-allowlist.cjs` | Command allowlisting |
| 2.49 | `self-healing/loop-state-manager.cjs` | Loop detection |
| 2.50 | `self-healing/rollback-manager.cjs` | Rollback management |
| 2.51 | `ml/index.cjs` | ML integration (feature-flagged) |
| 2.52 | `error-pattern-detector.cjs` | Error pattern detection |
| 2.53 | `error-writer.cjs` | Error writing |
| 2.54 | `evolution-state-sync.cjs` | Evolution state synchronization |

#### Tasks

- [ ] **2.1** Routing subsystem review and modernization (~3 hours)
  - Target Agent: `architect`
  - Recommended Skills: `architecture-review`, `code-analyzer`
  - Research: fuzzy matching optimization, semantic routing patterns

- [ ] **2.2** Memory subsystem review and modernization (~4 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `debugging`
  - Research: tiered memory management, deduplication algorithms
  - Critical: Address ADR-102 (memory rotation/pruning/cold storage)

- [ ] **2.3** Code indexing subsystem review and modernization (~3 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `code-semantic-search`
  - Research: hybrid search optimization, BM25 tuning

- [ ] **2.4** Events, creators, monitoring subsystem review (~2 hours)
  - Target Agent: `code-simplifier`
  - Recommended Skills: `code-analyzer`

- [ ] **2.5** Dead code analysis: identify and archive unused library modules (~2 hours)
  - Target Agent: `code-simplifier`
  - Known dead: 22 workflow modules, 7 memory modules, ML subsystem (per issues.md)

**Success Criteria**: All active libraries have tests; dead code archived; no MODULE_NOT_FOUND errors.

---

### Phase 3: Tools Modernization (`tools/`)

**Purpose**: Review and modernize 66 active CLI tools
**Dependencies**: Phase 2 libraries complete
**Duration**: 6-8 hours

#### Active Tools (by Category)

**CLI Validators & Generators (16 active)**:
- `tools/cli/validate-commit.mjs`, `validate-agents.mjs`, `validate-integration.cjs`
- `tools/cli/verify-agent-frontmatter.mjs`, `verify-debug-log-remediation.mjs`
- `tools/cli/generate-agent-catalog.cjs`, `generate-agent-registry.cjs`
- `tools/cli/generate-routing-prototypes.cjs`, `generate-skill-index.cjs`
- `tools/cli/generate-workflow-registry.cjs`, `generate-tool-manifest.cjs`
- `tools/cli/generate-embeddings.cjs`
- `tools/cli/doctor.mjs`, `security-lint.cjs`
- `tools/cli/bootstrap-artifact-graph.cjs`, `integration-health-dashboard.cjs`

**Memory & Indexing Tools (6 active)**:
- `tools/cli/memory-dashboard.cjs`, `memory-extract.cjs`, `memory-record.cjs`
- `tools/cli/sync-memory-json.cjs`, `init-memory-db.cjs`
- `tools/cli/index-codebase.cjs`

**Analysis Tools (5 active)**:
- `tools/analysis/project-analyzer/analyzer.mjs`
- `tools/analysis/ecosystem-assessor/assess-ecosystem.mjs`
- `tools/analysis/repo-rag/scripts/search.mjs`
- `tools/cli/hybrid-search.cjs`
- `tools/cli/profile-hooks.cjs`

**Other Active Tools (8)**:
- `tools/cli/check-gpu.cjs`, `error-report.cjs`
- `tools/cli/git-notes-verify.cjs`, `init-staging.cjs`
- `tools/cli/migrate-legacy-sessions.cjs`, `worker-metrics-summary.cjs`
- `tools/cli/weekly-error-analysis.cjs`
- `tools/chrome-browser/chrome-browser.cjs`

**Archived Tools (25 in `_archive/`)**: Already archived.

#### Tasks

- [ ] **3.1** Audit all 66 active tools: categorize by usage frequency, identify dead tools (~2 hours)
  - Target Agent: `code-simplifier`
  - Recommended Skills: `code-analyzer`

- [ ] **3.2** Modernize high-frequency tools (generators, validators, memory tools) (~3 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - Research: reddit "nodejs cli tool patterns 2026", "yargs vs commander 2026"

- [ ] **3.3** Archive identified dead tools (~1 hour)
  - Target Agent: `developer`

- [ ] **3.4** Update tool-catalog.md with accurate wiring status (~1 hour)
  - Target Agent: `technical-writer`
  - Recommended Skills: `doc-generator`

**Success Criteria**: All active tools run without errors; dead tools archived; catalog accurate.

---

### Phase 4: Documentation Modernization (`docs/`)

**Purpose**: Update all 24 reference documents to reflect modernized foundation and resources
**Dependencies**: Phases 1-3 complete
**Duration**: 4-6 hours

#### Files (24 reference docs)

**@ Reference Files (14 - imported by CLAUDE.md)**:
| # | File | Purpose |
|---|---|---|
| 4.1 | `@AGENT_ROUTING_TABLE.md` | Complete agent routing matrix |
| 4.2 | `@CREATOR_SKILLS_TABLE.md` | Creator skill invocation patterns |
| 4.3 | `@TOOL_REFERENCE.md` | Complete tool catalog |
| 4.4 | `@MODEL_SELECTION.md` | Model selection guidelines |
| 4.5 | `@SKILL_CATALOG_TABLE.md` | Workflow enhancement skills |
| 4.6 | `@SKILL_USAGE_GUIDE.md` | Skill selection decision tree |
| 4.7 | `@ENTERPRISE_WORKFLOWS.md` | Enterprise workflow paths |
| 4.8 | `@ENVIRONMENT_CONFIG.md` | Environment variable reference |
| 4.9 | `@DIRECTORY_STRUCTURE.md` | Directory layout reference |
| 4.10 | `@ENFORCEMENT_HOOKS.md` | Hook enforcement details |
| 4.11 | `@HOOK_AGENT_MAP.md` | Hook-agent mapping matrix |
| 4.12 | `@WORKFLOW_AGENT_MAP.md` | Workflow-agent mapping matrix |
| 4.13 | `@TASK_TRACKING_GUIDE.md` | TaskUpdate best practices |
| 4.14 | `@EVOLUTION_WORKFLOW.md` | EVOLVE workflow details |

**Standalone Docs (10)**:
| # | File | Purpose |
|---|---|---|
| 4.15 | `ARCHITECTURE.md` | System architecture overview |
| 4.16 | `GETTING_STARTED.md` | Getting started guide |
| 4.17 | `DEVELOPER_ONBOARDING.md` | Developer onboarding |
| 4.18 | `DEVELOPER_WORKFLOW.md` | Developer workflow |
| 4.19 | `CONFIGURATION.md` | Configuration guide |
| 4.20 | `MEMORY_SYSTEM.md` | Memory system design |
| 4.21 | `HOOKS_REFERENCE.md` | Hook authoring reference |
| 4.22 | `CODE_INDEXING_DESIGN.md` | Code indexing design |
| 4.23 | `FILE_PLACEMENT_RULES.md` | File placement rules |
| 4.24 | `AGENT_ROUTING_CARD.md` | Agent routing card |

#### Tasks

- [ ] **4.1** Audit all @files for accuracy against current codebase (~2 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `doc-generator`, `verification-before-completion`

- [ ] **4.2** Update @files with Batch 1-2 changes (~2 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`

- [ ] **4.3** Update standalone docs (~1.5 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`

- [ ] **4.4** Cross-reference validation: verify all links resolve (~0.5 hours)
  - Target Agent: `qa`
  - Recommended Skills: `checklist-generator`

**Success Criteria**: All docs reflect current state; no broken links; no stale content.

---

### Phase 5: Templates Modernization (`templates/`)

**Purpose**: Modernize 28 active templates
**Dependencies**: Phases 1-4 complete
**Duration**: 3-4 hours

#### Active Templates (28)

**Spawn Templates (4)**:
- `spawn/universal-agent-spawn.md` (used by all agent spawns)
- `spawn/orchestrator-spawn.md` (orchestrator-specific)
- `spawn/subordinate-once.md` (one-shot agents)
- `spawn/agent-identity-integration.md` (personality agents)

**Report Templates (5)**:
- `reports/plan-template.md`, `reports/audit-report-template.md`
- `reports/research-report-template.md`, `reports/implementation-report-template.md`
- `reports/reflection-report-template.md`

**Other Templates (19)**:
- Agent, skill, workflow, specification, test-plan, ADR, PRD templates, etc.

#### Tasks

- [ ] **5.1** Audit template usage: which templates are actively consumed (~1 hour)
  - Target Agent: `code-simplifier`
  - Reference: ADR-085 (template system overhaul)

- [ ] **5.2** Modernize spawn templates with Batch 1-2 changes (~1.5 hours)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`

- [ ] **5.3** Archive dead templates per ADR-085 (~0.5 hours)
  - Target Agent: `developer`

- [ ] **5.4** Update template-catalog.md (~0.5 hours)
  - Target Agent: `technical-writer`

**Success Criteria**: All active templates validated; dead templates archived; catalog accurate.

---

### Phase 6: Batch 2 Validation Gate

**Purpose**: Comprehensive validation before Batch 3
**Dependencies**: Phases 1-5 complete
**Duration**: 2-3 hours

#### Tasks (same pattern as Batch 1 Phase 5)

- [ ] **6.1** Full test suite run
- [ ] **6.2** Library integration tests
- [ ] **6.3** Tool execution validation (each tool runs without error)
- [ ] **6.4** Code review
- [ ] **6.5** Commit checkpoint

**Validation Criteria (ALL MUST PASS)**: Same as Batch 1 + all library consumer tests pass.

---

### Phase FINAL: Evolution & Reflection Check (Batch 2)

Same structure as Batch 1 Phase FINAL.

---

## Batch 3: Action

**Scope**: `.claude/scripts/`, `.claude/hooks/`, `.claude/commands/`, `.claude/skills/`
**Goal**: Refactor logic to utilize updated libraries; detailed skill-by-skill modernization
**Estimated Effort**: 40-55 hours
**Files in Scope**: 140+ active files
**Prerequisite**: Batch 2 validation gate passed

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research modern hook architectures, skill design patterns, command UX
**Duration**: 6-8 hours

#### Research Requirements (MANDATORY)

| # | Research Topic | Queries | Target Agent |
|---|---|---|---|
| 0.1 | Modern hook/plugin architectures | arxiv: "plugin architecture patterns 2025"; reddit: "hook system design patterns", "event-driven plugin systems" | `researcher` |
| 0.2 | AI skill composition patterns | arxiv: "skill composition autonomous agents 2025"; reddit: "AI agent skill patterns", "modular AI capabilities" | `researcher` |
| 0.3 | Command-line UX for AI tools | reddit: "AI CLI UX patterns 2026", "slash command design"; github: modern AI CLI tools | `researcher` |
| 0.4 | Security enforcement in AI systems | arxiv: "security enforcement AI agents 2025"; reddit: "AI agent security patterns", "guardrails AI systems" | `researcher` |

---

### Phase 1: Scripts Modernization (`scripts/`)

**Purpose**: Update 6 active scripts
**Duration**: 2-3 hours

#### Files

| # | File | Purpose | Research Topics |
|---|---|---|---|
| 1.1 | `scripts/verify-hook-modules.cjs` | Hook module verification | Static analysis patterns |
| 1.2 | `scripts/validate-routing-consistency.cjs` | Routing consistency checks | Routing validation |
| 1.3 | `scripts/ensure-routing-prototypes.cjs` | Routing prototype generation | Auto-generation patterns |
| 1.4 | `scripts/quick-status.cjs` | Quick status display | Status reporting |
| 1.5 | `scripts/setup-package-manager.cjs` | Package manager setup | Package management |
| 1.6 | `scripts/active-skills-list.txt` | Active skills reference | Catalog generation |

#### Tasks

- [ ] **1.1** Review and modernize all scripts to use updated lib/utils (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`

---

### Phase 2: Hooks Modernization (`hooks/`)

**Purpose**: Modernize 39 active hooks across 10 categories
**Dependencies**: Phase 1 scripts + Batch 2 libraries complete
**Duration**: 12-16 hours

#### Active Hooks by Category

**Routing (8 active)**:
| # | File | Lines | Research Topics |
|---|---|---|---|
| 2.1 | `routing/routing-guard.cjs` | ~1400 | Multi-check enforcement patterns, performance optimization |
| 2.2 | `routing/user-prompt-unified.cjs` | ~800 | User prompt processing, intent detection |
| 2.3 | `routing/unified-creator-guard.cjs` | ~600 | Creator enforcement, file-existence check (ADR-106) |
| 2.4 | `routing/spawn-prompt-assembler.cjs` | ~500 | Spawn prompt construction |
| 2.5 | `routing/pre-task-unified.cjs` | ~400 | Pre-task validation |
| 2.6 | `routing/post-task-unified.cjs` | ~300 | Post-task processing |
| 2.7 | `routing/pre-tool-unified.cjs` | ~200 | Pre-tool validation |
| 2.8 | `routing/code-index-updater.cjs` | ~150 | Code index update triggers |

**Safety (7 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.9 | `safety/unified-pre-write-hook.cjs` | Write safety patterns |
| 2.10 | `safety/bash-command-validator.cjs` | Command validation |
| 2.11 | `safety/shell-injection-validator.cjs` | Shell injection prevention |
| 2.12 | `safety/spawn-prompt-validator.cjs` | Spawn prompt validation |
| 2.13 | `safety/windows-null-sanitizer.cjs` | Windows compatibility |
| 2.14 | `safety/validate-skill-invocation.cjs` | Skill invocation validation |
| 2.15 | `safety/validators/registry.cjs` + 6 validator files | Validator registry pattern |

**Session (5 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.16 | `session/state-reset.cjs` | State management, reset patterns |
| 2.17 | `session/adaptive-quality-gate.cjs` | Adaptive quality thresholds |
| 2.18 | `session/drift-detector.cjs` | Intent drift detection |
| 2.19 | `session/post-edit-scanner.cjs` | Post-edit anti-pattern scanning |
| 2.20 | `session/pre-compact.cjs` | Pre-compaction snapshots |

**Evolution (5 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.21 | `evolution/conflict-detector.cjs` | Conflict detection patterns |
| 2.22 | `evolution/evolution-state-guard.cjs` | State machine guards |
| 2.23 | `evolution/quality-gate-validator.cjs` | Quality gate enforcement |
| 2.24 | `evolution/research-enforcement.cjs` | Research requirement enforcement |

**Validation (3 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.25 | `validation/pre-completion-validation.cjs` | Pre-completion gates |
| 2.26 | `validation/creator-compliance-validator.cjs` | Creator compliance |
| 2.27 | `validation/check-console-log.cjs` | Console.log detection |

**Reflection (4 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.28 | `reflection/unified-reflection-handler.cjs` | ~1000 lines, largest hook |
| 2.29 | `reflection/reflection-step0-guard.cjs` | Step 0 enforcement |
| 2.30 | `reflection/reflection-queue-processor.cjs` | Queue processing |
| 2.31 | `reflection/force-step0-execution.cjs` | Force execution |

**Monitoring (3 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.32 | `monitoring/error-tracker.cjs` | Error tracking patterns |
| 2.33 | `monitoring/metrics-collector.cjs` | Metrics collection |

**Workflow (2 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.34 | `workflow/post-completion-chain.cjs` | Post-completion automation |
| 2.35 | `workflow/post-creation-integration.cjs` | Post-creation integration |

**Memory (1 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.36 | `memory/sync-memory-index.cjs` | Memory index synchronization |

**Metrics (1 active)**:
| # | File | Research Topics |
|---|---|---|
| 2.37 | `metrics/post-tool-metrics-unified.cjs` | Unified metrics collection |

#### Tasks

- [ ] **2.1** Security audit of routing hooks (routing-guard, creator-guard, spawn-prompt-assembler) (~3 hours)
  - Target Agent: `security-architect`
  - Recommended Skills: `security-architect`
  - Critical: Address SEC-ROUTER-001, SEC-ROUTER-002, SEC-ROUTER-003

- [ ] **2.2** Modernize routing hooks with updated lib/utils patterns (~4 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`
  - Research: Modern enforcement patterns, performance optimization for multi-check hooks

- [ ] **2.3** Modernize safety hooks (~2 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`

- [ ] **2.4** Modernize session, evolution, validation hooks (~3 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`

- [ ] **2.5** Review reflection hooks (largest: unified-reflection-handler at ~1000 lines) (~2 hours)
  - Target Agent: `code-simplifier`
  - Recommended Skills: `code-analyzer`
  - Goal: Break down into smaller, focused modules if possible

- [ ] **2.6** Hook integration tests (~2 hours)
  - Target Agent: `qa`
  - Recommended Skills: `tdd`, `checklist-generator`

**Success Criteria**: All hooks pass tests; SEC findings addressed; no hook execution errors.

---

### Phase 3: Commands Modernization (`commands/`)

**Purpose**: Review and modernize 17 slash commands
**Dependencies**: Phase 2 hooks complete
**Duration**: 2-3 hours

#### Files (17 commands)

| # | File | Delegates To | Research Topics |
|---|---|---|---|
| 3.1 | `brainstorm.md` | brainstorming skill | Creative ideation UX |
| 3.2 | `tdd.md` | tdd skill | TDD workflow UX |
| 3.3 | `debug.md` | debugging skill | Debugging UX |
| 3.4 | `verify.md` | verification skill | Verification UX |
| 3.5 | `security-review.md` | security-architect skill | Security review UX |
| 3.6 | `code-review.md` | code-review skill | Code review UX |
| 3.7 | `compress.md` | context-compressor skill | Compression UX |
| 3.8 | `analyze.md` | analysis skill | Analysis UX |
| 3.9 | `learn.md` | learning skill | Learning UX |
| 3.10 | `execute-plan.md` | plan execution | Plan execution UX |
| 3.11 | `write-plan.md` | plan-generator skill | Plan writing UX |
| 3.12 | `setup-pm.md` | PM setup | PM workflow UX |
| 3.13 | `build-fix.md` | build fix skill | Build fix UX |
| 3.14 | `e2e.md` | e2e testing | E2E testing UX |
| 3.15 | `eval.md` | evaluation | Evaluation UX |
| 3.16 | `refactor-clean.md` | refactoring skill | Refactoring UX |
| 3.17 | `test-coverage.md` | test coverage | Coverage UX |

#### Tasks

- [ ] **3.1** Audit command-skill delegation accuracy (~1 hour)
  - Target Agent: `code-reviewer`
  - Verify: Each command delegates to the correct skill

- [ ] **3.2** Modernize command descriptions and add new commands if gaps found (~1.5 hours)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Research: reddit "slash command UX patterns", "AI CLI command design"

**Success Criteria**: All commands delegate correctly; no orphan commands.

---

### Phase 4: Skills Modernization (`skills/`)

**Purpose**: Detailed skill-by-skill review and modernization of 93 active skills
**Dependencies**: Phases 1-3 complete
**Duration**: 18-24 hours (largest phase in entire plan)

This is the most critical phase. Each skill must be reviewed for:
1. Modern technique adoption (research per skill category)
2. Updated library usage (Batch 2 changes)
3. Accurate agent assignments
4. Working Memory Protocol sections
5. Integration with updated schemas

#### Skills by Category (93 active)

**Core Development (11 skills)**:
| # | Skill | Research Topics | Priority |
|---|---|---|---|
| 4.1 | `tdd` | Modern TDD for AI-generated code, property-based testing | P0 |
| 4.2 | `debugging` | AI-assisted debugging patterns, root cause analysis | P0 |
| 4.3 | `ripgrep` | Hybrid search integration, search optimization | P0 |
| 4.4 | `code-quality-expert` | Code quality metrics 2026, AI code review | P1 |
| 4.5 | `code-analyzer` | Static analysis patterns, AST analysis | P1 |
| 4.6 | `code-semantic-search` | Hybrid search Phase 2, embedding models | P1 |
| 4.7 | `code-structural-search` | AST-grep patterns, structural matching | P1 |
| 4.8 | `code-style-validator` | Style validation patterns | P2 |
| 4.9 | `dry-principle` | Duplication detection algorithms | P2 |
| 4.10 | `verification-before-completion` | Verification gate patterns | P0 |
| 4.11 | `best-practices-guidelines` | 2026 best practices | P2 |

**Planning & Architecture (9 skills)**:
| # | Skill | Research Topics | Priority |
|---|---|---|---|
| 4.12 | `plan-generator` | AI planning systems, plan validation | P0 |
| 4.13 | `prd-generator` | PRD best practices, hypothesis-driven development | P0 |
| 4.14 | `architecture-review` | Modern architecture review patterns | P1 |
| 4.15 | `complexity-assessment` | Complexity estimation, ML-based assessment | P1 |
| 4.16 | `diagram-generator` | Mermaid 2026, architecture visualization | P1 |
| 4.17 | `planning-with-files` | File-based planning patterns | P2 |
| 4.18 | `spec-gathering` | Requirements elicitation for AI | P1 |
| 4.19 | `spec-init` | Specification initialization | P2 |
| 4.20 | `sparc-methodology` | SPARC methodology updates | P2 |

**Security (6 skills)**:
| # | Skill | Research Topics | Priority |
|---|---|---|---|
| 4.21 | `security-architect` | OWASP 2025, STRIDE, threat modeling 2026 | P0 |
| 4.22 | `auth-security-expert` | OAuth 2.1, JWT RFC 8725, zero-trust | P0 |
| 4.23 | `binary-analysis-patterns` | Modern reverse engineering | P2 |
| 4.24 | `memory-forensics` | Memory analysis techniques | P2 |
| 4.25 | `protocol-reverse-engineering` | Protocol analysis updates | P2 |
| 4.26 | `accessibility` | WCAG 2.2, accessibility 2026 | P1 |

**Creator Tools (12 skills)**:
| # | Skill | Research Topics | Priority |
|---|---|---|---|
| 4.27 | `research-synthesis` | Research methodology, citation patterns | P0 |
| 4.28 | `agent-creator` | Agent design patterns, prompt engineering | P0 |
| 4.29 | `skill-creator` | Skill composition, modular capabilities | P0 |
| 4.30 | `hook-creator` | Hook design patterns | P1 |
| 4.31 | `workflow-creator` | Workflow design patterns | P1 |
| 4.32 | `template-creator` | Template design patterns | P1 |
| 4.33 | `schema-creator` | Schema design patterns | P1 |
| 4.34 | `artifact-integrator` | Integration analysis | P0 |
| 4.35 | `artifact-updater` | Artifact update patterns | P1 |
| 4.36 | `command-creator` | Command design | P2 |
| 4.37 | `rule-creator` | Rule design | P2 |
| 4.38 | `tool-creator` | Tool design | P2 |

**Language/Framework Skills (18 skills)**: All P2
- `python-backend-expert`, `typescript-expert`, `go-expert`, `nodejs-expert`
- `java-expert`, `php-expert`, `react-expert`, `nextjs-expert`
- `svelte-expert`, `graphql-expert`, `ios-expert`, `android-expert`
- `expo-framework-rule`, `tauri-native-api-integration`, `mobile-first-design-rules`
- `frontend-expert`, `gamedev-expert`, `web3-expert`

**DevOps & Infrastructure (6 skills)**: All P1
- `docker-compose`, `terraform-infra`, `k8s-manifest-generator`
- `sentry-monitoring`, `container-expert`, `incident-runbook-templates`

**Data & Database (4 skills)**: All P2
- `database-architect`, `database-expert`, `data-expert`, `text-to-sql`

**Memory & Context (6 skills)**: All P1
- `context-compressor`, `session-handoff`, `task-management-protocol`
- `context-driven-development`, `insight-extraction`, `track-management`

**Remaining Skills (21)**: Mixed P2-P3
- Documentation, validation, specialized patterns, etc.

#### Tasks

- [ ] **4.1** Research modern techniques for each skill category (parallel) (~4 hours)
  - Target Agent: `researcher` (4 parallel)
  - Each researcher covers: Core Dev + Planning, Security + Creators, Languages + Frameworks, DevOps + Data + Memory

- [ ] **4.2** Modernize P0 skills (tdd, debugging, ripgrep, verification, plan-generator, prd-generator, security-architect, auth-security, research-synthesis, agent-creator, skill-creator, artifact-integrator) (~6 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`, `verification-before-completion`

- [ ] **4.3** Modernize P1 skills (14 skills) (~4 hours)
  - Target Agent: `developer`
  - Recommended Skills: `tdd`

- [ ] **4.4** Modernize P2 skills (30+ skills) (~4 hours)
  - Target Agent: `developer`
  - Action: Batch review and update; focus on modern technique adoption

- [ ] **4.5** Validate all skill Memory Protocol sections (~1 hour)
  - Target Agent: `qa`
  - Recommended Skills: `checklist-generator`

- [ ] **4.6** Update skill-catalog.md with all changes (~1 hour)
  - Target Agent: `technical-writer`
  - Recommended Skills: `doc-generator`

**Success Criteria**: All 93 skills reviewed; P0/P1 skills modernized; catalog accurate.

---

### Phase 5: Batch 3 Validation Gate

Same pattern as Batch 1/2 validation gates plus:
- [ ] All hooks pass integration tests
- [ ] All commands delegate correctly
- [ ] All skills load without errors
- [ ] Commit checkpoint: Batch 3 action complete

---

### Phase FINAL: Evolution & Reflection Check (Batch 3)

Same structure as Batch 1/2.

---

## Batch 4: Intelligence

**Scope**: `.claude/agents/`, `.claude/workflows/`
**Goal**: Align agent behavior with updated stack; create new agents if needed
**Estimated Effort**: 25-40 hours
**Files in Scope**: 87 active files
**Prerequisite**: Batch 3 validation gate passed

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research modern agent architectures, workflow patterns, multi-agent coordination
**Duration**: 6-8 hours

#### Research Requirements (MANDATORY)

| # | Research Topic | Queries | Target Agent |
|---|---|---|---|
| 0.1 | Modern AI agent architectures (2025-2026) | arxiv: "multi-agent architecture 2025", "autonomous agent design patterns"; github: multi-agent frameworks; reddit: "AI agent architecture patterns" | `researcher` |
| 0.2 | Workflow orchestration patterns | arxiv: "workflow orchestration autonomous agents"; reddit: "AI workflow patterns", "state machine workflow engines"; github: agent workflow engines | `researcher` |
| 0.3 | Agent specialization vs generalization | arxiv: "specialist vs generalist AI agents"; reddit: "when to create new AI agent vs skill" | `researcher` |
| 0.4 | Multi-agent coordination protocols | arxiv: "multi-agent communication protocols 2025"; reddit: "agent coordination patterns", "swarm intelligence AI agents" | `researcher` |

---

### Phase 1: Core Agents Modernization (9 agents)

**Purpose**: Update core agents with Batch 1-3 changes
**Dependencies**: Phase 0 research + Batch 3 complete
**Duration**: 8-10 hours

#### Files

| # | Agent | Lines | Key Updates Needed |
|---|---|---|---|
| 1.1 | `core/router.md` | ~200 | Updated routing table, model selection, enforcement |
| 1.2 | `core/planner.md` | ~400 | TDD-for-plans, hypothesis framing, hybrid search, compression |
| 1.3 | `core/developer.md` | ~350 | Context management, search-first protocol, compression |
| 1.4 | `core/architect.md` | ~250 | Architecture review patterns, C4 integration |
| 1.5 | `core/qa.md` | ~300 | Search protocol, test strategy updates |
| 1.6 | `core/pm.md` | ~250 | PRD workflow, prd-generator integration |
| 1.7 | `core/technical-writer.md` | ~200 | Documentation standards, search skills |
| 1.8 | `core/context-compressor.md` | ~150 | Compression trigger patterns |
| 1.9 | `core/reflection-agent.md` | ~200 | Reflection patterns, learning extraction |

#### Tasks

- [ ] **1.1** Research modern agent design patterns (ReAct, Plan-and-Execute, Reflection) (~2 hours)
  - Target Agent: `researcher`
  - Recommended Skills: `research-synthesis`
  - Research: arxiv "ReAct pattern AI agents 2025", github "plan-and-execute agent pattern"

- [ ] **1.2** Update core agents with Batch 1-3 changes (~4 hours)
  - Target Agent: `prompt-engineer`
  - Recommended Skills: `verification-before-completion`
  - Action: Update skill references, search protocols, compression triggers, model selection

- [ ] **1.3** Validate YAML frontmatter for all core agents (~1 hour)
  - Target Agent: `qa`
  - Known issues: prompt-engineer.md, mcp-developer.md have duplicate keys (SEC-LOG-002)

- [ ] **1.4** Security review of router and security-architect agents (~1 hour)
  - Target Agent: `security-architect`

**Success Criteria**: All core agents reflect Batch 1-3 changes; frontmatter valid; routing correct.

---

### Phase 2: Review & Quality Agents (3 agents)

**Duration**: 2-3 hours

| # | Agent | Key Updates |
|---|---|---|
| 2.1 | `specialized/code-reviewer.md` | Add Write tool (per reflection findings), search skills |
| 2.2 | `specialized/code-simplifier.md` | Updated code analysis patterns |
| 2.3 | `specialized/security-architect.md` | OWASP 2025, modern threat modeling |

---

### Phase 3: Infrastructure & Ops Agents (4 agents)

**Duration**: 2-3 hours

| # | Agent | Key Updates |
|---|---|---|
| 3.1 | `specialized/devops.md` | Modern DevOps patterns, Kubernetes 2026 |
| 3.2 | `specialized/devops-troubleshooter.md` | AI-assisted debugging |
| 3.3 | `specialized/incident-responder.md` | Incident response patterns |
| 3.4 | `specialized/database-architect.md` | Modern database patterns |

---

### Phase 4: Domain Specialist Agents (22 agents)

**Duration**: 6-8 hours

**Language Specialists (10)**:
- python-pro, typescript-pro, golang-pro, rust-pro, java-pro, php-pro, nodejs-pro, fastapi-pro

**Framework Specialists (5)**:
- frontend-pro, nextjs-pro, sveltekit-expert, graphql-pro

**Mobile/Desktop (4)**:
- ios-pro, android-pro, expo-mobile-developer, tauri-desktop-developer

**Domain (5)**:
- data-engineer, ai-ml-specialist, web3-blockchain-expert, scientific-research-expert, gamedev-pro

**Other (3)**:
- llm-architect, api-designer, microservices-architect, mobile-ux-reviewer
- prompt-engineer, mcp-developer (fix duplicate YAML keys)

#### Tasks

- [ ] **4.1** Research modern patterns for each specialist domain (parallel) (~3 hours)
  - Target Agent: `researcher` (4 parallel)
  - Research: github code + reddit for each language/framework/domain

- [ ] **4.2** Update all domain agents with modern techniques and Batch 1-3 changes (~4 hours)
  - Target Agent: `prompt-engineer`
  - Action: Update skill assignments, add search skills, fix frontmatter

- [ ] **4.3** Fix known YAML issues in prompt-engineer.md and mcp-developer.md (~0.5 hours)
  - Target Agent: `developer`

---

### Phase 5: Specialized & Other Agents (14 agents)

**Duration**: 3-4 hours

- sre-engineer, performance-engineer, penetration-tester, accessibility-tester
- chaos-engineer, conductor-validator, reverse-engineer
- c4-context, c4-container, c4-component, c4-code
- researcher

---

### Phase 6: Orchestrator Agents (4 agents)

**Duration**: 2-3 hours

| # | Agent | Key Updates |
|---|---|---|
| 6.1 | `orchestrators/master-orchestrator.md` | Updated enterprise workflow, compression |
| 6.2 | `orchestrators/evolution-orchestrator.md` | EVOLVE workflow updates |
| 6.3 | `orchestrators/party-orchestrator.md` | Multi-agent coordination |
| 6.4 | `orchestrators/swarm-coordinator.md` | Swarm coordination patterns |

---

### Phase 7: Workflows Modernization (28 workflows)

**Purpose**: Update all workflows to align with updated agents and skills
**Duration**: 6-8 hours

#### Core Workflows (7)

| # | File | Purpose |
|---|---|---|
| 7.1 | `core/router-decision.md` | Master routing workflow |
| 7.2 | `core/enterprise-workflow.md` | Enterprise orchestration |
| 7.3 | `core/evolution-workflow.md` | EVOLVE workflow |
| 7.4 | `core/ecosystem-creation-workflow.md` | Artifact creation lifecycle |
| 7.5 | `core/skill-lifecycle.md` | Skill lifecycle |
| 7.6 | `core/reflection-workflow.md` | Reflection workflow |
| 7.7 | `core/external-integration.md` | External integration |
| 7.8 | `core/post-creation-validation.md` | Post-creation validation |

#### Enterprise Workflows (3)

| # | File | Purpose |
|---|---|---|
| 7.9 | `enterprise/feature-development-workflow.md` | Feature development |
| 7.10 | `enterprise/c4-architecture-workflow.md` | C4 documentation |
| 7.11 | `enterprise/swarm-coordination-skill-workflow.md` | Swarm coordination |

#### Operations Workflows (3)

| # | File | Purpose |
|---|---|---|
| 7.12 | `operations/hook-consolidation.md` | Hook consolidation |
| 7.13 | `operations/incident-response.md` | Incident response |
| 7.14 | `operations/qa-bounded-loop.md` | QA bounded loop |

#### Skill Workflows (11)

- architecture-review, chrome-browser, conductor-setup, consensus-voting
- context-compressor, database-architect, progressive-disclosure
- security-architect, template-renderer
- code-review, documentation, domain-development, product-management

#### Tasks

- [ ] **7.1** Research modern workflow patterns for AI systems (~2 hours)
  - Target Agent: `researcher`
  - Research: arxiv "workflow orchestration AI agents", reddit "state machine workflow patterns"

- [ ] **7.2** Update core workflows with Batch 1-3 changes (~3 hours)
  - Target Agent: `architect`
  - Recommended Skills: `architecture-review`, `workflow-patterns`

- [ ] **7.3** Update enterprise and operations workflows (~1.5 hours)
  - Target Agent: `technical-writer`
  - Recommended Skills: `writing-skills`

- [ ] **7.4** Update skill workflows (~1.5 hours)
  - Target Agent: `technical-writer`

**Success Criteria**: All workflows reflect updated agents/skills; no broken references.

---

### Phase 8: New Agent/Skill Creation (if needed)

**Purpose**: Create new agents identified during modernization
**Dependencies**: Phases 1-7 complete
**Duration**: 4-6 hours

**Candidate New Agents** (from ADR-090 and modernization findings):
- Agent catalog discovery commands (ADR-090 P1)
- Category README documentation (ADR-090 P1)
- Any agents identified by Batch 3 skill review

**Process**: Use full creator workflow (research-synthesis -> agent-creator/skill-creator)

---

### Phase 9: Batch 4 Validation Gate

**Purpose**: Final comprehensive validation
**Duration**: 3-4 hours

#### Tasks

- [ ] **9.1** Full test suite: `pnpm test`
- [ ] **9.2** Agent frontmatter validation: all 59 agents
- [ ] **9.3** Workflow reference validation: all 28 workflows
- [ ] **9.4** End-to-end routing test: verify agent routing for 20 test cases
- [ ] **9.5** Code review of all Batch 4 changes
- [ ] **9.6** Commit checkpoint: Batch 4 intelligence complete

**Validation Criteria (ALL MUST PASS)**:
- [ ] Zero test regressions
- [ ] All agent YAML frontmatter valid
- [ ] All workflow references resolve
- [ ] Routing test: 20/20 correct agent selections
- [ ] `pnpm lint:fix` produces 0 errors
- [ ] `pnpm format` produces no changes

---

### Phase 10: CLAUDE.md Final Update

**Purpose**: Update the master CLAUDE.md to reflect all modernization changes
**Dependencies**: Phase 9 validation passed
**Duration**: 2-3 hours

#### Tasks

- [ ] **10.1** Update CLAUDE.md with modernized references (~1.5 hours)
  - Target Agent: `technical-writer`
  - Action: Update all section references, agent counts, skill counts, hook references

- [ ] **10.2** Update all @files with final state (~1 hour)
  - Target Agent: `technical-writer`

**Success Criteria**: CLAUDE.md accurately describes modernized system.

---

### Phase FINAL: Evolution & Reflection Check (Batch 4 / Project Complete)

**Purpose**: Final quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed modernization
2. Extract learnings and update memory files
3. Check for evolution opportunities
4. Generate final modernization report

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Final report at `.claude/context/reports/reflections/framework-modernization-reflection-2026-02-09.md`
- Evolution opportunities logged

---

## Quality Gates

### Per-Batch Validation Criteria

| Gate | Batch 1 | Batch 2 | Batch 3 | Batch 4 |
|---|---|---|---|---|
| Test suite | No regressions | No regressions | No regressions | No regressions |
| Lint | 0 errors | 0 errors | 0 errors | 0 errors |
| Format | No changes | No changes | No changes | No changes |
| Schema validation | All pass | All pass | All pass | All pass |
| Security review | Config + rules | Libraries | Hooks | Agents |
| Code review | Required | Required | Required | Required |
| Commit checkpoint | Required | Required | Required | Required |

### Inter-Batch Dependencies

```
Batch 1 (Foundation) ──MUST PASS──> Batch 2 (Resources)
Batch 2 (Resources) ──MUST PASS──> Batch 3 (Action)
Batch 3 (Action) ──MUST PASS──> Batch 4 (Intelligence)
```

**BLOCKING**: No batch starts until the previous batch's validation gate passes.

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Schema changes break consumers | HIGH | MEDIUM | Backward-compatible changes only; validate against existing data |
| Library changes break hooks | HIGH | MEDIUM | TDD for all library changes; integration tests |
| Hook modernization breaks enforcement | CRITICAL | LOW | Feature branch; equivalence tests; rollback checkpoint |
| Agent updates cause routing failures | HIGH | LOW | Routing test suite; equivalence tests |
| Context limit during planning | MEDIUM | HIGH | Invoke context-compressor at phase boundaries |
| Test suite regressions | HIGH | MEDIUM | Baseline test count; zero-regression gate |
| Memory file corruption during rotation | HIGH | LOW | Atomic writes; backup before rotation |
| Dead code archival breaks imports | MEDIUM | MEDIUM | Static analysis with verify-hook-modules.cjs |

### Rollback Strategy

Each batch has a commit checkpoint. If a batch validation gate fails:
1. Revert to previous batch checkpoint: `git revert --no-commit HEAD~N`
2. Investigate failure cause
3. Fix and retry the failing batch
4. Never proceed to next batch with failing gates

---

## Enterprise Pipeline Per Batch

Each batch follows this 14-agent pipeline:

```
Phase 0: Research
  reflection-agent (pre-check) → researcher (4 parallel)

Phase 1-N: Implementation
  pm (PRD if needed) → architect + security-architect (parallel)
  → code-simplifier + researcher (parallel for technique research)
  → planner + context-compressor (if context high)
  → developer (sequential implementation)
  → chaos-engineer (resilience testing if applicable)

Phase N+1: Validation
  code-reviewer → qa → devops (commit/deploy)

Phase FINAL: Documentation & Reflection
  technical-writer → reflection-agent
```

### Agent Assignments Summary

| Agent | Batch 1 | Batch 2 | Batch 3 | Batch 4 |
|---|---|---|---|---|
| `researcher` | 4 parallel | 4 parallel | 4 parallel | 4 parallel |
| `pm` | PRD review | - | - | - |
| `architect` | Schema design | Library design | - | Workflow design |
| `security-architect` | Config review | Library audit | Hook audit | Agent review |
| `code-simplifier` | - | Dead code | Hook simplification | - |
| `planner` | Phase planning | Phase planning | Phase planning | Phase planning |
| `context-compressor` | At boundaries | At boundaries | At boundaries | At boundaries |
| `developer` | Schema/config impl | Library/tool impl | Hook/skill impl | Agent updates |
| `nodejs-pro` | - | Core utils | - | - |
| `prompt-engineer` | - | - | Skill review | Agent prompts |
| `code-reviewer` | Validation | Validation | Validation | Validation |
| `qa` | Testing | Testing | Testing | Testing |
| `devops` | Commits | Commits | Commits | Commits |
| `technical-writer` | Rules/docs | Docs/templates | Commands | Agent/workflow docs |
| `reflection-agent` | Per batch | Per batch | Per batch | Per batch |

---

## Commit Checkpoint Pattern

**Batch 1**: `modernize: Batch 1 foundation (schemas, config, rules, context)`
**Batch 2**: `modernize: Batch 2 resources (libs, tools, docs, templates)`
**Batch 3**: `modernize: Batch 3 action (scripts, hooks, commands, skills)`
**Batch 4**: `modernize: Batch 4 intelligence (agents, workflows, CLAUDE.md)`

Each batch touches 60-160 files, well above the 10-file checkpoint threshold.

---

## Timeline Summary

| Batch | Phases | Tasks | Est. Time | Parallel? |
|---|---|---|---|---|
| 1: Foundations | 7 | ~25 | 25-35 hrs | Research parallel |
| 2: Resources | 8 | ~30 | 35-50 hrs | Research parallel |
| 3: Action | 7 | ~35 | 40-55 hrs | Research + skill review parallel |
| 4: Intelligence | 12 | ~40 | 25-40 hrs | Research + agent update parallel |
| **Total** | **34** | **~130** | **125-180 hrs** | |

---

## Appendix: File Count Summary

| Directory | Active Files | Archived | Total |
|---|---|---|---|
| `.claude/schemas/` | 27 | 22 | 49 |
| `.claude/config.yaml` | 1 | - | 1 |
| `.claude/rules/` | 11 | - | 11 |
| `.claude/context/` | ~80 | ~30 | ~110 |
| `.claude/lib/` | ~90 | ~30 | ~120 |
| `.claude/tools/` | 66 | 25 | 91 |
| `.claude/docs/` | 24 | - | 24 |
| `.claude/templates/` | 28 | 14 | 42 |
| `.claude/scripts/` | 6 | - | 6 |
| `.claude/hooks/` | 39 | 40 | 79 |
| `.claude/commands/` | 17 | - | 17 |
| `.claude/skills/` | 93 | 214 | 307 |
| `.claude/agents/` | 59 | - | 59 |
| `.claude/workflows/` | 28 | - | 28 |
| **Total** | **~569** | **~375** | **~944** |
