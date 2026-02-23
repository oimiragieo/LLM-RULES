<!-- Agent: developer | Task: #96 | Session: 2026-02-07 -->

# Tool Catalog

Complete inventory of all tools in the `.claude/tools/` directory, including active tools, archived tools, and relocated library modules.

**Last Updated:** 2026-02-22
**Total Source Files:** 124 active + 25 archived + 8 relocated = 157 total

---

## Summary Statistics

| Category              | Count | Percentage |
| --------------------- | ----- | ---------- |
| **Active Tools**      | 124   | 78%        |
| **Archived Tools**    | 25    | 16%        |
| **Relocated to lib/** | 8     | 5%         |
| **TOTAL**             | 157   | 100%       |

### Active Tools by Category

| Category       | Count | Description                            |
| -------------- | ----- | -------------------------------------- |
| CLI Validators | 3     | Command-line validation utilities      |
| CLI Utilities  | 4     | General-purpose CLI tools              |
| Analysis       | 12    | Code and project analysis tools        |
| Integrations   | 8     | External service connectors            |
| Optimization   | 5     | Performance and resource optimization  |
| Runtime        | 3     | Runtime coordination and observability |
| Visualization  | 1     | Diagram and graph generation           |
| Workflow       | 4     | Workflow execution and gates           |
| Context        | 2     | Context management                     |
| Gates          | 2     | Quality and validation gates           |
| Root-level     | 12    | Root-level utility scripts             |

---

## Active Tools

### CLI Validators

**Purpose:** Validation utilities for CLI operations

| Tool                                   | Location | Purpose                                       | Wiring Status                                            |
| -------------------------------------- | -------- | --------------------------------------------- | -------------------------------------------------------- |
| `doctor.mjs`                           | `cli/`   | System health diagnostics                     | package.json: `doctor`                                   |
| `validate-agents.mjs`                  | `cli/`   | Validate agent definitions                    | package.json: `validate:agents` (was phantom, now fixed) |
| `security-lint.cjs`                    | `cli/`   | Security vulnerability scanning               | package.json: `lint:security`                            |
| `validate-skill-agent-consistency.mjs` | `cli/`   | Validate skill/agent registration consistency | package.json: `validate:skills`                          |

### CLI Utilities

**Purpose:** General command-line tools

| Tool                   | Location | Purpose                        | Wiring Status                                 |
| ---------------------- | -------- | ------------------------------ | --------------------------------------------- |
| `detect-orphans.mjs`   | `cli/`   | Find orphaned files/references | Not scripted                                  |
| `validate-commit.mjs`  | `cli/`   | Validate commit messages       | skill: commit-validator                       |
| `tool_search.mjs`      | `cli/`   | Search for tools by capability | Deprecated: use SkillCatalog.search() instead |
| `git-notes-verify.cjs` | `cli/`   | Audit trail verification       | Not scripted                                  |

### Analysis

**Purpose:** Code analysis, dependency scanning, project assessment

| Directory/Tool        | Location    | Purpose                                         | Wiring Status                                                              |
| --------------------- | ----------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `project-analyzer/`   | `analysis/` | Analyze project structure and tech stack        | skill: code-analyzer                                                       |
| `ecosystem-assessor/` | `analysis/` | Assess ecosystem health (hooks, MCPs)           | Not scripted                                                               |
| `find-polluter/`      | `analysis/` | Find test pollution sources                     | skill: debugging                                                           |
| `repo-rag/`           | `analysis/` | Repository RAG (retrieval-augmented generation) | Experimental: not production-ready, use code-semantic-search skill instead |

### Integrations

**Purpose:** External service integrations

| Directory          | Location        | Purpose                          | Wiring Status     |
| ------------------ | --------------- | -------------------------------- | ----------------- |
| `aws-cloud-ops/`   | `integrations/` | AWS cloud operations integration | Not scripted      |
| `github/`          | `integrations/` | GitHub API integration           | skill: github-mcp |
| `kubernetes-flux/` | `integrations/` | Kubernetes Flux integration      | Not scripted      |
| `mcp-converter/`   | `integrations/` | MCP server to skill converter    | Not scripted      |

### Optimization

**Purpose:** Performance and resource optimization

| Directory/Tool         | Location        | Purpose                          | Wiring Status                                           |
| ---------------------- | --------------- | -------------------------------- | ------------------------------------------------------- |
| `token-optimizer/`     | `optimization/` | Monitor and optimize token usage | Not scripted                                            |
| `sequential-thinking/` | `optimization/` | Step-by-step reasoning helper    | MCP skill: mcp**sequential-thinking**sequentialthinking |

### Metrics

**Purpose:** Observability metrics, health checks, and alerting

| Tool                               | Location | Purpose                                                                                    | Wiring Status                            |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `reflection-degradation-alert.cjs` | `cli/`   | Reads reflection-log.jsonl, writes reflection-alert.json when agents score below threshold | package.json: `metrics:reflection:alert` |

### Runtime

**Purpose:** Runtime coordination and monitoring

| Directory        | Location   | Purpose                       | Wiring Status |
| ---------------- | ---------- | ----------------------------- | ------------- |
| `observability/` | `runtime/` | Runtime status and monitoring | Not scripted  |

### Visualization

**Purpose:** Diagram and graph generation

| Directory            | Location         | Purpose                        | Wiring Status                 |
| -------------------- | ---------------- | ------------------------------ | ----------------------------- |
| `diagram-generator/` | `visualization/` | Generate architecture diagrams | skill: architecture workflows |

### Workflow

**Purpose:** Workflow execution, gates, and handlers

| Tool                           | Location    | Purpose                       | Wiring Status |
| ------------------------------ | ----------- | ----------------------------- | ------------- |
| `workflow-context-tracker.mjs` | `workflow/` | Track workflow context        | Not scripted  |
| `workflow-validator.mjs`       | `workflow/` | Validate workflow definitions | Not scripted  |

### Context

### Gates

**Purpose:** Quality and validation gates

| Tool                                           | Location | Purpose                        | Wiring Status                                  |
| ---------------------------------------------- | -------- | ------------------------------ | ---------------------------------------------- |
| `run-agent-framework-integration-headless.mjs` | `gates/` | Headless agent framework tests | package.json: `validate:framework-integration` |

### Root-Level Utilities

**Purpose:** Standalone utilities at tools root

| Tool                                           | Location | Purpose                        | Wiring Status                                  |
| ---------------------------------------------- | -------- | ------------------------------ | ---------------------------------------------- |
| `cuj-validator-unified.mjs`                    | `tools/` | Unified CUJ validation         | package.json: `validate:cujs`                  |
| `run-agent-framework-integration-headless.mjs` | `tools/` | Headless integration tests     | package.json: `validate:framework-integration` |
| `validate-commands.mjs`                        | `tools/` | Validate command definitions   | package.json: `validate:commands`              |
| `validate-latest-integration-artifacts.mjs`    | `tools/` | Validate integration artifacts | package.json: `validate:latest-integration`    |

---

### CLI Operational Tools

**Purpose:** Metrics, observability, memory, search, generation, and validation CLI tools added after 2026-02-07.

| Tool                                       | Location | Purpose                                  | Wiring Status                                    |
| ------------------------------------------ | -------- | ---------------------------------------- | ------------------------------------------------ |
| `artifact-quality-daemon.cjs`              | `cli/`   | Artifact quality scoring daemon          | package.json: `metrics:artifact`                 |
| `backfill-agent-template-contract.cjs`     | `cli/`   | Backfill agent template contracts        | Not scripted                                     |
| `backfill-skill-verification.cjs`          | `cli/`   | Backfill skill verification records      | Not scripted                                     |
| `bootstrap-artifact-graph.cjs`             | `cli/`   | Initialize artifact dependency graph     | Not scripted                                     |
| `check-gpu.cjs`                            | `cli/`   | Check GPU availability for embeddings    | Not scripted                                     |
| `cleanup-transient-artifacts.cjs`          | `cli/`   | Remove stale transient context artifacts | package.json: `cleanup:transient`                |
| `dlq-health-summary.cjs`                   | `cli/`   | Dead-letter queue health summary         | Not scripted                                     |
| `document-query.cjs`                       | `cli/`   | Query document store                     | Not scripted                                     |
| `error-report.cjs`                         | `cli/`   | Error report generator                   | Not scripted                                     |
| `flight-recorder-maintenance.cjs`          | `cli/`   | Flight recorder log maintenance          | Not scripted                                     |
| `generate-agent-catalog.cjs`               | `cli/`   | Generate agent catalog markdown          | Not scripted                                     |
| `generate-agent-registry.cjs`              | `cli/`   | Generate agent-registry.json             | Not scripted                                     |
| `generate-embeddings.cjs`                  | `cli/`   | Generate vector embeddings for search    | Not scripted                                     |
| `generate-routing-prototypes.cjs`          | `cli/`   | Generate routing table prototypes        | package.json: `postinstall`                      |
| `generate-skill-index.cjs`                 | `cli/`   | Generate skill index for search          | Not scripted                                     |
| `generate-skill-index-definitions.cjs`     | `cli/`   | Generate skill definitions index         | Not scripted                                     |
| `generate-skill-index-validators.cjs`      | `cli/`   | Generate skill validators index          | Not scripted                                     |
| `generate-tool-manifest.cjs`               | `cli/`   | Generate tool manifest JSON              | Not scripted                                     |
| `generate-workflow-registry.cjs`           | `cli/`   | Generate workflow registry               | Not scripted                                     |
| `hybrid-search.cjs`                        | `cli/`   | BM25+semantic hybrid search              | package.json: `search:code`                      |
| `hybrid-search-daemon.cjs`                 | `cli/`   | Persistent hybrid search daemon          | Not scripted                                     |
| `index-codebase.cjs`                       | `cli/`   | Index codebase for BM25 search           | Not scripted                                     |
| `init-memory-db.cjs`                       | `cli/`   | Initialize memory database               | Not scripted                                     |
| `init-staging.cjs`                         | `cli/`   | Initialize staging environment           | package.json: `init:staging`                     |
| `integration-health-dashboard.cjs`         | `cli/`   | Integration health dashboard             | Not scripted                                     |
| `memory-cache-stability-summary.cjs`       | `cli/`   | Memory cache stability metrics           | package.json: `metrics:memory-cache:summary`     |
| `memory-dashboard.cjs`                     | `cli/`   | Memory system dashboard                  | Not scripted                                     |
| `memory-extract.cjs`                       | `cli/`   | Extract memory entries                   | Not scripted                                     |
| `memory-record.cjs`                        | `cli/`   | Record memory entries                    | Not scripted                                     |
| `memory-slo-summary.cjs`                   | `cli/`   | Memory SLO metrics summary               | package.json: `metrics:memory:slo:summary`       |
| `migrate-legacy-sessions.cjs`              | `cli/`   | Migrate legacy session format            | Not scripted                                     |
| `open-findings-strict-rollout-monitor.cjs` | `cli/`   | Strict open-findings rollout monitor     | package.json: `metrics:findings:strict-rollout`  |
| `open-findings-summary.cjs`                | `cli/`   | Open findings summary with CI assertions | package.json: `metrics:findings:summary`         |
| `open-findings-trend-admin.cjs`            | `cli/`   | Admin baseline reset for findings trend  | package.json: `metrics:findings:trend:baseline`  |
| `open-findings-trend-snapshot.cjs`         | `cli/`   | Snapshot findings trend data             | package.json: `metrics:findings:trend:snapshot`  |
| `open-findings-trend-summary.cjs`          | `cli/`   | Findings trend summary with deltas       | package.json: `metrics:findings:trend:summary`   |
| `process-stale-skills.cjs`                 | `cli/`   | Archive stale/unused skills              | Not scripted                                     |
| `profile-hooks.cjs`                        | `cli/`   | Profile hook execution times             | Not scripted                                     |
| `repro-pre-completion-no-summary.cjs`      | `cli/`   | Reproduce pre-completion validation      | Not scripted                                     |
| `retrieval-quality-eval.cjs`               | `cli/`   | Evaluate retrieval quality metrics       | package.json: `metrics:retrieval:baseline`       |
| `router-churn-summary.cjs`                 | `cli/`   | Router churn/block rate metrics          | package.json: `metrics:routing:summary`          |
| `run-memory-soak-regimen.cjs`              | `cli/`   | Run memory soak test regimen             | package.json: `metrics:soak:run`                 |
| `run-skill-updates.cjs`                    | `cli/`   | Run batch skill updates                  | Not scripted                                     |
| `runtime-health-snapshot.cjs`              | `cli/`   | Write runtime health snapshot            | package.json: `metrics:runtime:snapshot`         |
| `runtime-health-summary.cjs`               | `cli/`   | Runtime health metrics summary           | package.json: `metrics:runtime:summary`          |
| `sanitize-debug-log.cjs`                   | `cli/`   | Sanitize debug log for sharing           | Not scripted                                     |
| `skill-freshness-report.cjs`               | `cli/`   | Report on skill freshness/staleness      | Not scripted                                     |
| `skill-update-headless.cjs`                | `cli/`   | Headless skill update executor           | Not scripted                                     |
| `spawn-assembly-metrics-summary.cjs`       | `cli/`   | Spawn assembly performance metrics       | package.json: `metrics:spawn:summary`            |
| `sync-memory-json.cjs`                     | `cli/`   | Sync memory JSON stores                  | Not scripted                                     |
| `tool-manifest-definitions.cjs`            | `cli/`   | Tool manifest definition helpers         | Not scripted                                     |
| `trace-query.cjs`                          | `cli/`   | Query execution traces                   | Not scripted                                     |
| `validate-agent-skill-references.cjs`      | `cli/`   | Validate agent→skill references          | package.json: `validate:agent-skill-refs`        |
| `validate-agent-template-contract.cjs`     | `cli/`   | Validate agent template contracts        | package.json: `validate:agent-template-contract` |
| `validate-artifact-regression-gate.cjs`    | `cli/`   | Artifact regression gate checks          | package.json: `validate:artifact-regression`     |
| `validate-creator-ecosystem.cjs`           | `cli/`   | Validate creator skill ecosystem         | Not scripted                                     |
| `validate-integration.cjs`                 | `cli/`   | Validate integration artifacts           | Not scripted                                     |
| `validate-skill-ecosystem.cjs`             | `cli/`   | Validate skill ecosystem health          | Not scripted                                     |
| `weekly-error-analysis.cjs`                | `cli/`   | Weekly error pattern analysis            | Not scripted                                     |
| `worker-metrics-summary.cjs`               | `cli/`   | Worker thread metrics summary            | package.json: `worker:summary`                   |

---

## Archived Tools

**Location:** `.claude/tools/_archive/`
**Reason:** Dead tools with zero references in codebase
**Archive Date:** 2026-02-07
**Total:** 25 tools

### Archived CLI Tools

| Tool                            | Original Location | Reason for Archival                          |
| ------------------------------- | ----------------- | -------------------------------------------- |
| `archive-issues.py`             | `_archive/`       | Zero references                              |
| `archive-memory.mjs`            | `_archive/`       | Duplicate of maintenance/archive-memory.mjs  |
| `compact-lancedb.cjs`           | `_archive/`       | Duplicate of maintenance/compact-lancedb.cjs |
| `conductor-gap-analyzer.cjs`    | `_archive/`       | Zero references                              |
| `conductor-state-migrate.cjs`   | `_archive/`       | One-time migration tool (complete)           |
| `cost-report.js`                | `_archive/`       | Zero references                              |
| `detect-orphans.mjs`            | `_archive/`       | Duplicate of cli/detect-orphans.mjs          |
| `document-query.cjs`            | `_archive/`       | Zero references                              |
| `eslint-batch-fix.cjs`          | `_archive/`       | Zero references                              |
| `eslint-unused-var-fix.cjs`     | `_archive/`       | Zero references                              |
| `eslint-useless-escape-fix.cjs` | `_archive/`       | Zero references                              |
| `fix-spawn-log-task-ids.cjs`    | `_archive/`       | One-time migration tool (complete)           |
| `get-current-config.cjs`        | `_archive/`       | Zero references                              |
| `kb-search.cjs`                 | `_archive/`       | Zero references                              |
| `migrate-agent-config.cjs`      | `_archive/`       | One-time migration tool (complete)           |
| `migrate-memory.cjs`            | `_archive/`       | One-time migration tool (complete)           |
| `monitoring-dashboard.cjs`      | `_archive/`       | Zero references                              |
| `populate-agent-config.cjs`     | `_archive/`       | Zero references                              |
| `schedule-task.cjs`             | `_archive/`       | Zero references                              |
| `switch-modes.cjs`              | `_archive/`       | Zero references                              |
| `tool_search.mjs`               | `_archive/`       | Duplicate of cli/tool_search.mjs             |
| `validate-agent.cjs`            | `_archive/`       | Zero references                              |
| `validate-agent-routing.cjs`    | `_archive/`       | Zero references                              |
| `validate-agent-tools.cjs`      | `_archive/`       | Zero references                              |
| `render-graphs/`                | `_archive/`       | Subdirectory with zero references            |

**Preservation:** All archived tools preserved with `git mv` for full git history retention.

**README:** `.claude/tools/_archive/README.md` explains archival rationale and restoration process.

---

## Relocated to lib/

**Reason:** Library modules (imported via `require()` or `import`) belong in `.claude/lib/`, not `.claude/tools/` (CLI executables)
**Relocation Date:** 2026-02-07 (Phase C)
**Total:** 8 modules

| Module                      | Old Location      | New Location        | Purpose                          | Consumers          |
| --------------------------- | ----------------- | ------------------- | -------------------------------- | ------------------ |
| `skills-core.js`            | `tools/runtime/`  | `lib/skills/`       | Core skill loading and execution | hooks, lib modules |
| `swarm-coordination.cjs`    | `tools/runtime/`  | `lib/coordination/` | Multi-agent swarm coordination   | orchestrators      |
| `context-path-resolver.mjs` | `tools/context/`  | `lib/utils/`        | Resolve context file paths       | context modules    |
| `gate.mjs`                  | `tools/gates/`    | `lib/qa/`           | Quality gate validation          | QA workflows       |
| `decision-handler.mjs`      | `tools/workflow/` | `lib/workflow/`     | Workflow decision evaluation     | workflow-runner    |
| `loop-handler.mjs`          | `tools/workflow/` | `lib/workflow/`     | Workflow loop execution          | workflow-runner    |
| `workflow-runner.js`        | `tools/workflow/` | `lib/workflow/`     | Core workflow execution engine   | hooks, workflows   |

**Corresponding Test:** `skills-core.test.js` also moved from `tools/` to `tests/lib/skills/`

**History:** All relocations done via `git mv` to preserve git blame/log history.

**Security Fix:** During relocation, `decision-handler.mjs` was patched to replace `new Function()` with SafeExpressionParser (SEC-TOOL-001 fix).

---

## Wiring Reference

### Tools Referenced in package.json

| Script Name                      | Tool Path                                      | Status                    |
| -------------------------------- | ---------------------------------------------- | ------------------------- |
| `doctor`                         | `cli/doctor.mjs`                               | Active                    |
| `validate:agents`                | `cli/validate-agents.mjs`                      | Active (formerly phantom) |
| `lint:security`                  | `cli/security-lint.cjs`                        | Active                    |
| `init:staging`                   | `maintenance/init-staging.cjs`                 | Active                    |
| `validate:framework-integration` | `run-agent-framework-integration-headless.mjs` | Active                    |
| `validate:cujs`                  | `cuj-validator-unified.mjs`                    | Active                    |
| `validate:commands`              | `validate-commands.mjs`                        | Active                    |
| `validate:latest-integration`    | `validate-latest-integration-artifacts.mjs`    | Active                    |

### Tools Referenced in Skills

| Skill              | Tool Referenced              |
| ------------------ | ---------------------------- |
| `code-analyzer`    | `analysis/project-analyzer/` |
| `commit-validator` | `cli/validate-commit.mjs`    |
| `debugging`        | `analysis/find-polluter/`    |
| `github-mcp`       | `integrations/github/`       |

### Tools Referenced in Hooks

| Hook             | Tool/Module Referenced                        |
| ---------------- | --------------------------------------------- |
| (various)        | `lib/skills/skills-core.js` (relocated)       |
| (workflow hooks) | `lib/workflow/workflow-runner.js` (relocated) |

---

## Tool Discovery Methods

**For active tools:**

1. **package.json scripts:** Run `pnpm run <script-name>`
2. **Direct execution:** `node .claude/tools/<category>/<tool>.mjs`
3. **Skill invocation:** `Skill({ skill: "<skill-name>" })` (for tools with skill wrappers)
4. **This catalog:** Reference this file for complete inventory

**For archived tools:**

1. Check `.claude/tools/_archive/README.md` for restoration instructions
2. Use `git log --follow .claude/tools/_archive/<tool>` to see original location and history

**For relocated modules:**

1. Import from new location: `require('.claude/lib/<category>/<module>')`
2. Check this catalog's "Relocated to lib/" section for old → new mapping

---

## Related Documentation

- **Tools README:** `.claude/tools/README.md` - High-level directory structure and usage
- **Archive README:** `.claude/tools/_archive/README.md` - Archived tool details and restoration process
- **Directory Structure:** `.claude/docs/@DIRECTORY_STRUCTURE.md` - Framework-wide directory layout
- **ADR-089:** `.claude/context/memory/decisions.md` - Decision rationale for tools overhaul

---

## Maintenance Notes

**When adding new tools:**

1. Place in appropriate category subdirectory
2. Add to this catalog with purpose and wiring status
3. If CLI-invokable, add package.json script
4. If skill-backed, reference in skill's SKILL.md
5. Update `.claude/tools/README.md` category tables

**When archiving tools:**

1. Use `git mv` to preserve history
2. Update this catalog's "Archived Tools" section
3. Remove from active sections
4. Update `.claude/tools/_archive/README.md`
5. Remove package.json scripts (if any)

**When relocating to lib/:**

1. Use `git mv` for relocation
2. Update all `require()` / `import` references in consumers
3. Update this catalog's "Relocated to lib/" section
4. Verify depth for rootDir computation (`__dirname` + `../../../`)
5. Run all tests to confirm imports work
