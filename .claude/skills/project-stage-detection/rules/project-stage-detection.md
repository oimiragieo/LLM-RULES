# Project Stage Detection Rules

## Core Principles

1. **Evidence-Based Only**: Never claim a stage without counting indicator scores. Assertions must be traceable to file system checks.
2. **Non-Blocking**: Missing files are acceptable — the skill must degrade gracefully and produce output even for completely empty directories.
3. **Idempotent**: Running detection twice on the same project must produce the same result.
4. **Narrow Scope**: Only scan the project root and immediate standard subdirectories. Never recurse into `node_modules/`, `.git/`, or `.claude/`.

## Stage Promotion Rules

- A project can only be `mature` if it has ALL three HIGH-weight indicators: source directory, tests, and CI/CD.
- A project with no source directory is always `new` or `early`, regardless of documentation presence.
- Presence of a lockfile alone does not indicate `mid` or `mature` — it requires supporting evidence.

## Anti-Patterns

- Never use wall-clock timestamps to determine stage — use file presence only.
- Never report a higher stage than the evidence supports to "be encouraging."
- Never scan the `.claude/` directory as part of project indicators — agent-studio infrastructure is not project code.
- Never make network calls during detection — this is a pure file-system check.

## Integration Points

- **gap-detection**: Run after detection to find specific missing components within the stage.
- **project-onboarding**: The primary downstream skill for `new` stage projects.
- **proactive-audit**: Run for `mid` and `mature` stage projects.
- **planner**: Should run this skill before decomposing tasks on unfamiliar repositories.

## Caching Policy

- Detection results are valid for 7 days per project root.
- Cache key: `${projectRoot}-${datestamp}` stored in learnings.md.
- Use `skipCache: true` after major repository changes.
