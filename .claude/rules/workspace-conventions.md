# Workspace Conventions

Rules for file placement, naming, provenance, and cleanup in the agent-studio workspace.

## File Placement Rules

### Reports

- ALL agent reports go to `.claude/context/reports/`
- Subdirectories by domain: `reports/security/`, `reports/qa/`, `reports/architecture/`, `reports/database/`
- Naming: `{topic}-report-{YYYY-MM-DD}.md`
- Legacy reports in `.claude/context/artifacts/reports/` remain there (do not duplicate)

### Plans

- ALL plans go to `.claude/context/plans/`
- Naming: `{topic}-plan-{YYYY-MM-DD}.md`
- Implementation plans: `impl-{topic}-{YYYY-MM-DD}.md`

### Artifacts

- Catalogs and registries: `.claude/context/artifacts/catalogs/`
- Diagrams: `.claude/context/artifacts/diagrams/`
- Analysis documents: `.claude/context/artifacts/analysis/`
- Summaries: `.claude/context/artifacts/summaries/`
- Specifications: `.claude/context/artifacts/specs/`
- Research reports: `.claude/context/artifacts/research-reports/`
- Database artifacts: `.claude/context/artifacts/database/`

### Temporary Files

- ALL temp files: `.claude/context/tmp/`
- Auto-cleaned after 24 hours
- NEVER write temp files to project root or user home directories

### Naming Convention

- Always lowercase kebab-case
- Date suffix: `YYYY-MM-DD` (ISO 8601 with hyphens)
- Pattern: `{descriptive-name}-{YYYY-MM-DD}.{ext}`
- Extensions: `.md` (docs), `.json` (data), `.jsonl` (logs), `.csv` (tables)

### Provenance Headers

All agent-generated files must include a provenance header as the first line:

```
<!-- Agent: {type} | Task: #{id} | Session: {date} -->
```

### Forbidden Locations

- NEVER write to project root (`C:\dev\projects\agent-studio\`)
- NEVER write to user home paths (`C:\Users\`)
- NEVER create files named `nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9` (Windows reserved names)
- NEVER write temp files outside `.claude/context/tmp/`
- NEVER place reports in `.claude/context/artifacts/` root (use subdirectories)

## Detailed Reference

See `.claude/docs/FILE_PLACEMENT_RULES.md` for the complete placement specification with enforcement hooks.
