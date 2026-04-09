# Workspace Conventions

Rules for file placement, naming, provenance, and cleanup in the agent-studio workspace.

## File Placement

| Type                | Location                                      | Naming Pattern                          |
| ------------------- | --------------------------------------------- | --------------------------------------- |
| Operational reports | `.claude/context/reports/backend/{domain}/`   | `{topic}-report-YYYY-MM-DD.md`          |
| Research reports    | `.claude/context/artifacts/research-reports/` | `{topic}-research-YYYY-MM-DD.md`        |
| Plans               | `.claude/context/plans/`                      | `{topic}-plan-YYYY-MM-DD.md`            |
| Catalogs/registries | `.claude/context/artifacts/catalogs/`         | kebab-case                              |
| Diagrams            | `.claude/context/artifacts/diagrams/`         | kebab-case                              |
| Analysis            | `.claude/context/artifacts/analysis/`         | kebab-case                              |
| Code index data     | `.claude/context/data/`                       | `*.db`, `*.sqlite`, `*.json`, `*.lance` |
| Temp files          | `.claude/context/tmp/`                        | any (manual cleanup)                    |

## Naming Convention

- Always lowercase kebab-case
- Date suffix: `YYYY-MM-DD` (ISO 8601)
- Extensions: `.md` (docs), `.json` (data), `.jsonl` (logs), `.csv` (tables)

## Provenance Headers

All agent-generated files must include as first line: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`

## Forbidden Locations

- NEVER write to project root or user home paths
- NEVER create Windows reserved filenames (`nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9`)
- NEVER write temp files outside `.claude/context/tmp/`
- NEVER place files in `.claude/context/artifacts/` root (use subdirectories)
