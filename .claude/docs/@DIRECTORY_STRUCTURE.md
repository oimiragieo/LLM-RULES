# Directory Structure Reference

**Source:** CLAUDE.md Section 9
**Version:** v2.2.5
**Last Updated:** 2026-02-04

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
│   ├── plans/
│   ├── research-reports/
│   └── .gitkeep
├── memory/
│   ├── learnings.md
│   ├── decisions.md
│   ├── issues.md
│   └── constitution.md
└── evolution-state.json
```

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
│   └── checkpoint-manager.cjs
├── memory/
│   ├── memory-manager.cjs
│   ├── memory-scheduler.cjs
│   ├── memory-tiers.cjs
│   └── smart-pruner.cjs
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
│   └── logical-unit-tracker.cjs (Phase 1.5 - git notes-based revert)
└── integration/
    └── system-registration-handler.cjs
```

### skills/

```
skills/
├── planning-with-files/
└── ...
```

### tools/

```
tools/
├── cli/
│   ├── doctor.js
│   ├── validate-agents.js
│   ├── validate-integration.cjs
│   ├── kb-search.cjs
│   ├── cost-report.js
│   ├── monitoring-dashboard.cjs
│   ├── init-staging.cjs
│   ├── git-notes-verify.cjs (audit trail verification and reporting)
│   └── ...
├── integrations/
│   ├── aws/
│   ├── github/
│   └── kubernetes/
├── analysis/
│   ├── project-analyzer.js
│   └── ecosystem-assessor.js
├── visualization/
│   ├── diagram-generator.js
│   └── render-graphs.js
├── optimization/
│   ├── token-optimizer.js
│   └── sequential-thinking.js
└── runtime/
    ├── skills-core.js
    └── swarm-coordination.js
```

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

Key schemas for validation:

```
schemas/
├── track-metadata.schema.json (track management, task metadata)
├── skill-diagram-generator-output.schema.json
└── skill-repo-rag-output.schema.json
```

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

### Deleted/Deprecated Directories

| Old Path            | Status                                        |
| ------------------- | --------------------------------------------- |
| `.claude/commands/` | Deleted (was empty)                           |
| `.claude/temp/`     | Deleted (was empty)                           |
| `.claude/tests/`    | Moved to root `tests/` directory (2026-01-28) |
| `.claude/scripts/`  | Consolidated into `.claude/lib/workflow/`     |

### File Placement Enforcement

Enforced by `file-placement-guard.cjs`:

- `block` (production), `warn` (default), `off`

**Override:** `FILE_PLACEMENT_OVERRIDE=true`
**Rules:** `.claude/docs/FILE_PLACEMENT_RULES.md`

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Output locations for each creator
- **@ENVIRONMENT_CONFIG.md** - Configuration files location

---

## BACK TO MAIN

See **CLAUDE.md** Section 9 for inline summary.
