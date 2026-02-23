# Workspace Conventions

Rules for file placement, naming, provenance, and cleanup in the agent-studio workspace.

## File Placement Rules

### Reports

**Operational Reports** (agent execution reports):

- Location: `.claude/context/reports/backend/`
- Subdirectories by domain: `reports/security/`, `reports/qa/`, `reports/architecture/`, `reports/database/`, `reports/reflections/`
- Naming: `{topic}-report-{YYYY-MM-DD}.md`
- Types: Security audits, QA reports, architecture reviews, reflection reports
- This is the canonical report location (consolidated from previous `artifacts/reports/` location)

**Research Reports** (external research artifacts):

- Location: `.claude/context/artifacts/research-reports/`
- Naming: `{topic}-research-{YYYY-MM-DD}.md` (note: includes `-research-` suffix before date)
- Pattern: Descriptive kebab-case name + `-research-` + ISO date
- Types: External research, technique analysis, best practice studies, technology comparisons
- These are reference artifacts, not operational reports
- Must include provenance header: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`

**Examples**:

- `rules-modernization-research-2026-02-09.md`
- `owasp-agentic-ai-research-2026-02-09.md`
- `tdd-best-practices-research-2026-02-09.md`

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

### Data Files

- Code index data: `.claude/context/data/`
- Allowed files: `*.db`, `*.sqlite`, `*.json`, `*.lance` (LanceDB vector store, SQLite, BM25 index)
- NEVER write temporary data outside `.claude/context/tmp/`

### Temporary Files

- ALL temp files: `.claude/context/tmp/`
- Manual cleanup only (not automated)
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

## Related References

- `.claude/docs/FILE_PLACEMENT_RULES.md` - Complete placement specification with enforcement hooks
- `unified-pre-write-hook.cjs` - File safety validation hook
- `workspace-conventions` - This file (quick reference)
