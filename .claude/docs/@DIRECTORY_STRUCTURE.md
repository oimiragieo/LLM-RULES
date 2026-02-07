# Directory Structure Reference

**Source:** CLAUDE.md Section 9
**Version:** v2.4.0
**Last Updated:** 2026-02-06

---

## PURPOSE

Complete directory structure reference for the `.claude/` framework directory, including subsections for agents, context, hooks, lib, schemas, skills, templates, tools, workflows, and deleted/deprecated directories.

---

## CONTENT

### Top-Level Structure

```
.claude/
├── agents/
├── config/
├── context/
├── docs/
├── hooks/
├── lib/
├── rules/
├── schemas/
├── skills/
├── templates/
├── tools/
├── workflows/
├── CLAUDE.md
├── config.yaml
└── settings.json
```

### agents/

```
agents/
├── core/
├── domain/
├── specialized/
└── orchestrators/
```

### context/

```
context/
├── artifacts/
│   ├── analysis/            # Deep-dive analysis documents
│   ├── architecture/        # Architecture documentation
│   ├── catalogs/            # Catalog and registry files
│   ├── database/            # Database design artifacts
│   ├── diagrams/            # Mermaid/ASCII diagrams
│   ├── plans/               # Implementation plans (legacy location)
│   ├── reports/             # Agent reports (legacy location)
│   │   └── archive/         # Archived reports
│   ├── research-reports/    # Research synthesis outputs
│   ├── specs/               # Specification documents
│   ├── summaries/           # Phase summaries, checkpoints
│   ├── skill-catalog.md     # Master skill catalog
│   └── ...                  # (legacy root files being migrated)
├── backups/                 # System backups (created on-demand by saga-coordinator.cjs for rollback checkpoints)
├── checkpoints/             # Workflow checkpoints
├── code-index/              # Code indexing data (merkle trees)
├── config/                  # Configuration files
│   ├── rule-index-cache.json
│   └── ...
├── data/
│   ├── lancedb/             # Vector store data
│   │   ├── bm25-index.json
│   │   ├── chunks.lance/
│   │   └── index-metadata.json
│   └── memory.db
├── memory/
│   ├── learnings.md
│   ├── decisions.md
│   ├── issues.md
│   ├── constitution.md
│   ├── behaviour.md
│   ├── active_context.md
│   ├── archive/
│   ├── named/               # Named memory API: readMemory/writeMemory (CLAUDE.md Section 8)
│   ├── stm/                 # STM tier: session data written by user-prompt-unified.cjs
│   ├── mtm/                 # MTM tier: (medium-term memory - future use)
│   └── ltm/                 # LTM tier: summarized session data written by memory-tiers.cjs
├── metrics/
│   ├── hook-metrics.jsonl
│   ├── spawn-log.jsonl
│   └── spawn-size-audit.jsonl
├── plans/                   # Planner outputs (canonical location)
├── reports/                 # Agent reports (canonical location - consolidated from artifacts/reports/)
│   ├── security/
│   ├── qa/
│   ├── architecture/
│   ├── database/
│   └── reflections/
├── runtime/
│   ├── router-state.json
│   ├── compression-reminder.txt
│   └── reflection-reminder.txt
├── self-healing/            # Self-healing state (anomaly-detector and loop-state-manager write here)
├── sessions/                # Session data (used by consensus-voting and swarm-coordinator for session state)
├── teams/
│   └── [team-name].csv
├── tmp/                     # Temporary files (auto-cleaned 24h)
├── workflows/               # Workflow state data
├── access-stats.json        # (legacy root - stats tracking)
├── agent-catalog.json       # Generated simplified view of agent-registry.json (NOT a duplicate)
├── agent-registry.json      # Agent registry (canonical root location - 35+ cross-cutting references)
├── dashboard.json           # Dashboard state
├── evolution-state.json     # EVOLVE workflow state (canonical root location - 35+ cross-cutting references)
└── reflection-queue.jsonl   # Reflection queue (canonical root location - 35+ cross-cutting references)
```

**Root-level context files note:** `agent-registry.json`, `evolution-state.json`, and `reflection-queue.jsonl` remain at `.claude/context/` root because they have 30+ cross-cutting references in hooks, workflows, agents, and documentation. Moving them would cause widespread breakage. They are canonical at their current locations.

**Note on agent-catalog.json:** This is a generated simplified view of `agent-registry.json` for quick reference, not a duplicate. It is auto-regenerated on commit via post-commit hook.

### config/

```
config/
├── capability-routing.json
├── presets.json
├── skill-index.json
└── tool-manifest.json
```

### hooks/

```
hooks/
├── audit/
│   └── git-notes-audit.cjs (tamper-proof commit metadata)
├── evolution/
├── memory/
├── reflection/
├── routing/
├── safety/
│   └── validators/
├── self-healing/
├── session/
└── validation/
```

### lib/

```
lib/
├── workflow/
│   ├── workflow-engine.cjs
│   ├── workflow-validator.cjs
│   ├── checkpoint-manager.cjs
│   ├── decision-handler.mjs (relocated from tools/workflow/)
│   ├── loop-handler.mjs (relocated from tools/workflow/)
│   └── workflow-runner.js (relocated from tools/workflow/)
├── memory/
│   ├── memory-manager.cjs
│   ├── memory-scheduler.cjs
│   ├── memory-tiers.cjs
│   └── smart-pruner.cjs
├── skills/
│   └── skills-core.js (relocated from tools/runtime/)
├── coordination/
│   └── swarm-coordination.cjs (relocated from tools/runtime/)
├── qa/
│   └── gate.mjs (relocated from tools/gates/)
├── self-healing/
│   ├── dashboard.cjs
│   ├── rollback-manager.cjs
│   └── validator.cjs
├── utils/
│   ├── hook-input.cjs
│   ├── project-root.cjs
│   ├── safe-json.cjs
│   ├── atomic-write.cjs
│   ├── state-cache.cjs
│   ├── context-path-resolver.mjs (relocated from tools/context/)
│   └── logical-unit-tracker.cjs (Phase 1.5 - git notes-based revert)
└── integration/
    └── system-registration-handler.cjs
```

### rules/

```
rules/
├── agents.md
├── coding-style.md
├── git-workflow.md
├── hooks.md
├── patterns.md
├── performance.md
├── security.md
├── testing.md
└── workspace-conventions.md
```

### skills/

```
skills/
├── planning-with-files/
└── ...
```

### tools/

**Total Active Tools:** 66 source files (25 archived, 8 relocated to lib/)
**Boundary Rule:** CLI executables only; library modules go in `.claude/lib/`

```
tools/
├── _archive/               # 25 archived dead tools (git mv preserves history)
├── cli/                    # CLI validators and utilities
│   ├── doctor.mjs
│   ├── validate-agents.mjs
│   ├── security-lint.cjs
│   ├── detect-orphans.mjs
│   ├── validate-commit.mjs
│   ├── tool_search.mjs
│   └── git-notes-verify.cjs
├── analysis/               # Code and project analysis
│   ├── project-analyzer/
│   ├── ecosystem-assessor/
│   ├── find-polluter/
│   └── repo-rag/
├── integrations/           # External service connectors
│   ├── aws-cloud-ops/
│   ├── github/
│   ├── kubernetes-flux/
│   └── mcp-converter/
├── optimization/           # Performance tools
│   ├── token-optimizer/
│   └── sequential-thinking/
├── runtime/                # Runtime observability
│   └── observability/
├── visualization/          # Diagrams and graphs
│   └── diagram-generator/
├── workflow/               # Workflow execution
│   ├── workflow-context-tracker.mjs
│   └── workflow-validator.mjs
├── context/                # Context management
│   └── context-cleanup.cjs
├── gates/                  # Quality gates
│   └── run-agent-framework-integration-headless.mjs
└── *.mjs                   # Root-level standalone utilities
```

**Recently Relocated (2026-02-07):**
- `skills-core.js` → `lib/skills/`
- `swarm-coordination.cjs` → `lib/coordination/`
- `context-path-resolver.mjs` → `lib/utils/`
- `gate.mjs` → `lib/qa/`
- `decision-handler.mjs` → `lib/workflow/` (+ SEC-TOOL-001 fix)
- `loop-handler.mjs` → `lib/workflow/`
- `workflow-runner.js` → `lib/workflow/`

**Empty directories (archived tools):**
- `maintenance/` - Files moved to `_archive/` (archive-memory, compact-lancedb)
- `visualization/render-graphs/` - Moved to `_archive/`

**See:** `.claude/context/artifacts/catalogs/tool-catalog.md` for complete inventory

### workflows/

```
workflows/
├── core/
│   ├── router-decision.md
│   ├── skill-lifecycle.md
│   ├── external-integration.md
│   └── evolution-workflow.md
├── enterprise/
│   ├── feature-development-workflow.md
│   └── c4-architecture-workflow.md
└── operations/
    └── incident-response.md
```

### templates/

```
templates/
├── spec-template.md
├── plan-template.md
├── tasks-template.md
├── planning/
│   ├── task_plan.md
│   ├── findings.md
│   └── progress.md
└── agents/
    └── agent-context-template.md
```

### schemas/

JSON Schema definitions for framework artifact validation:

**Total Active Schemas:** 27 (25 archived in `_archive/`)
**Actively Validated (Ajv):** 8 schemas with runtime validation
**Documentation Reference:** 16 schemas as structural templates
**Optional Validation:** 3 schemas with paths defined but validation skipped

```
schemas/
├── _archive/              (25 archived schemas from 2026-02-07 overhaul)
├── agent-*.schema.json    (5 agent schemas: config, definition, identity, capability-card, spawn-params)
├── skill-*.schema.json    (4 skill schemas: definition, diagram-output, repo-rag-output, test-output)
├── workflow-definition.schema.json
├── hook-definition.schema.json
├── evolution-state.schema.json
├── tool-manifest.schema.json
├── presets.schema.json
├── track-metadata.schema.json
├── plan*.schema.json      (planning schemas: plan, implementation-plan, phase-models)
├── test*.schema.json      (testing schemas: test_plan, test-results)
└── [16 more schemas]      (architecture, requirements, templates - see catalog)
```

**See:** `.claude/context/artifacts/catalogs/schema-catalog.md` for complete inventory with wiring status

### commands/

User-facing slash commands (thin delegators to skills):

| Path | Purpose |
|------|---------|
| `.claude/commands/` | User-facing slash commands (thin delegators to skills) |
| `.claude/commands/*.md` | Individual command definitions |

See `.claude/context/artifacts/catalogs/command-catalog.md` for the full catalog.

**Track Metadata Schema** (SPEC-007):

- **Path**: `.claude/schemas/track-metadata.schema.json`
- **Documentation**: `.claude/docs/TRACK_METADATA.md`
- **Purpose**: Consistent structure for task/track metadata
- **Features**: Effort estimation, phase tracking, dependency management
- **Integration**: TaskCreate, workflow state, reporting

### Output Locations by Creator

| Creator              | Output Location                               |
| -------------------- | --------------------------------------------- |
| `research-synthesis` | `.claude/context/artifacts/research-reports/` |
| `plan-generator`     | `.claude/context/plans/`                      |
| `agent-creator`      | `.claude/agents/<category>/`                  |
| `skill-creator`      | `.claude/skills/<skill-name>/`                |
| `hook-creator`       | `.claude/hooks/<category>/`                   |
| `workflow-creator`   | `.claude/workflows/<category>/`               |
| `template-creator`   | `.claude/templates/`                          |
| `schema-creator`     | `.claude/schemas/`                            |
| `diagram-generator`  | `.claude/context/artifacts/diagrams/`         |

### Workspace Conventions

- **Naming**: lowercase kebab-case, date suffix `YYYY-MM-DD`
- **Pattern**: `{descriptive-name}-{YYYY-MM-DD}.{ext}`
- **Provenance**: All generated files include `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
- **Temp files**: `.claude/context/tmp/` only (auto-cleaned 24h)
- **Reports**: `.claude/context/reports/{domain}/` (security, qa, architecture, database)
- **Full rules**: `.claude/rules/workspace-conventions.md`

### Deleted/Deprecated Directories

| Old Path                  | Status                                           | Date       |
| ------------------------- | ------------------------------------------------ | ---------- |
| `.claude/temp/`           | Deleted (was empty)                              | 2026-01-28 |
| `.claude/tests/`          | Moved to root `tests/` directory                 | 2026-01-28 |
| `.claude/scripts/`        | Consolidated into `.claude/lib/workflow/`        | 2026-01-28 |
| `.claude/data/`           | Moved to `.claude/context/data/`                 | 2026-02-06 |
| `.claude/staging/`        | Deleted (test artifacts and temp files)          | 2026-02-06 |
| `.claude/audit/`          | Deleted (one-time audit reports)                 | 2026-02-06 |
| `.claude/archive/`        | Deleted (outdated hooks and libs)                | 2026-02-06 |
| `.claude/references/`     | Moved to `.claude/docs/reference/` then deleted  | 2026-02-06 |
| `.claude/teams/`          | Moved to `.claude/context/teams/`                | 2026-02-06 |
| `.claude/docs/archive/`   | Deleted (one-time debug fix reports)             | 2026-02-06 |
| `.claude/docs/reference/`     | Deleted (AI-generated unused reference material) | 2026-02-06 |
| `.claude/context/code-indexing/` | Deleted (zero references - active indexer uses code-index/) | 2026-02-06 |
| `.claude/context/ml/`         | Deleted (zero references - optional ML features never activated) | 2026-02-06 |

### Moved Files (2026-02-06)

| Old Path                                       | New Path                                                           | Reason               |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| `.claude/context/spawn-size-audit.jsonl`       | `.claude/context/metrics/spawn-size-audit.jsonl`                   | Belongs in metrics   |
| `.claude/context/rule-index-cache.json`        | `.claude/context/config/rule-index-cache.json`                     | Belongs in config    |
| `.claude/context/checkpoint-week4-20260128.md` | `.claude/context/artifacts/summaries/checkpoint-week4-20260128.md` | Belongs in summaries |
| `tests/workflows/checkpoints/test-*`           | `tests/fixtures/checkpoints/test-*`                                 | Test fixtures moved  |

### File Placement Enforcement

Enforced by `file-placement-guard.cjs`:

- `block` (production), `warn` (default), `off`

**Override:** `FILE_PLACEMENT_OVERRIDE=true`
**Rules:** `.claude/docs/FILE_PLACEMENT_RULES.md`
**Workspace Conventions:** `.claude/rules/workspace-conventions.md`

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Output locations for each creator
- **@ENVIRONMENT_CONFIG.md** - Configuration files location
- `.claude/rules/workspace-conventions.md` - Naming, provenance, temp file rules

---

## BACK TO MAIN

See **CLAUDE.md** Section 9 for inline summary.
