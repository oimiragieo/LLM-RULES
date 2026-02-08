<!-- Agent: developer | Task: #66 | Session: 2026-02-07 -->

# Archived Templates

**Date of Archival:** 2026-02-07
**Reason:** Template system overhaul (Task #66) - removing dead templates per architecture audit

This directory contains templates that have been archived as part of the template system consolidation effort. Templates were moved here using `git mv` to preserve full git history.

## Archived Templates

| Original Path                       | Archived Path                                | Reason                                 | Date       |
| ----------------------------------- | -------------------------------------------- | -------------------------------------- | ---------- |
| `spawn/bash-safe-background.md`     | `_archive/spawn/bash-safe-background.md`     | Superseded by universal-agent-spawn.md | 2026-02-07 |
| `spawn/router-task-template.md`     | `_archive/spawn/router-task-template.md`     | Superseded by universal-agent-spawn.md | 2026-02-07 |
| `claude-md-template.md`             | `_archive/claude-md-template.md`             | Unused - no active references found    | 2026-02-07 |
| `project-brief.md`                  | `_archive/project-brief.md`                  | Unused - no active references found    | 2026-02-07 |
| `prd.md`                            | `_archive/prd.md`                            | Unused - no active references found    | 2026-02-07 |
| `ui-spec.md`                        | `_archive/ui-spec.md`                        | Unused - no active references found    | 2026-02-07 |
| `planning/findings.md`              | `_archive/planning/findings.md`              | Unused - no active references found    | 2026-02-07 |
| `planning/progress.md`              | `_archive/planning/progress.md`              | Unused - no active references found    | 2026-02-07 |
| `planning/task_plan.md`             | `_archive/planning/task_plan.md`             | Unused - no active references found    | 2026-02-07 |
| `examples/example-adr-050.md`       | `_archive/examples/example-adr-050.md`       | Unused - no active references found    | 2026-02-07 |
| `examples/example-specification.md` | `_archive/examples/example-specification.md` | Unused - no active references found    | 2026-02-07 |
| `code-styles/dart.md`               | `_archive/code-styles/dart.md`               | Unused - no Dart code in project       | 2026-02-07 |
| `code-styles/csharp.md`             | `_archive/code-styles/csharp.md`             | Unused - no C# code in project         | 2026-02-07 |
| `code-styles/go.md`                 | `_archive/code-styles/go.md`                 | Unused - no Go code in project         | 2026-02-07 |

## Deleted Templates (Not Archived)

| Template Path             | Reason                                                                | Date       |
| ------------------------- | --------------------------------------------------------------------- | ---------- |
| `code-styles/html-css.md` | No HTML/CSS in project - deleted via `git rm`                         | 2026-02-07 |
| `code-styles/general.md`  | Overlap with `.claude/rules/code-standards.md` - deleted via `git rm` | 2026-02-07 |

## Templates Explicitly Retained (Per Security Review)

**Security Review Mandate (SEC-TMPL-006):** The following templates were flagged by security review and MUST remain at root level:

- `security-design-checklist.md` - STRIDE threat model checklist (SEC-TMPL-006)
- `error-recovery-template.md` - Error recovery patterns for hooks (SEC-TMPL-006)

These templates were NOT archived despite being in the original cleanup scope.

## Restoration Instructions

To restore an archived template:

```bash
# Restore a specific template to original location
git mv .claude/templates/_archive/spawn/bash-safe-background.md .claude/templates/spawn/

# Restore all templates in a category
git mv .claude/templates/_archive/planning/*.md .claude/templates/planning/
```

**Important:** Restoring templates via `git mv` preserves the full git history, just like the original archival.

## Archive Structure

```
_archive/
├── README.md (this file)
├── spawn/
│   ├── bash-safe-background.md
│   └── router-task-template.md
├── planning/
│   ├── findings.md
│   ├── progress.md
│   └── task_plan.md
├── examples/
│   ├── example-adr-050.md
│   └── example-specification.md
├── code-styles/
│   ├── dart.md
│   ├── csharp.md
│   └── go.md
├── claude-md-template.md
├── project-brief.md
├── prd.md
└── ui-spec.md
```

## Related Documentation

- **Template Overhaul Plan:** `.claude/context/plans/template-overhaul-tdd-plan-2026-02-07.md`
- **Architecture Review:** `.claude/context/plans/template-overhaul-architecture-2026-02-07.md`
- **Active Templates:** `.claude/templates/README.md`
