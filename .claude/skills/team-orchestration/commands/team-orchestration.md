# team-orchestration Command

## Usage

```
Skill({ skill: 'team-orchestration' })
```

Or via the CLI entry point:

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase <plan|design|implement|review|test|deploy> \
  --task <taskId> \
  [--skip-approval-gate] \
  [--justification "reason for skipping gate"]
```

## Arguments

| Argument               | Type   | Required | Description                                               |
| ---------------------- | ------ | -------- | --------------------------------------------------------- |
| `--phase`              | string | YES      | One of: plan, design, implement, review, test, deploy     |
| `--task`               | string | NO       | Task ID for snapshot tracking (auto-generated if omitted) |
| `--skip-approval-gate` | flag   | NO       | Skip the human approval gate for this phase               |
| `--justification`      | string | NO\*     | Required when `--skip-approval-gate` is set               |

## Examples

**Start a new pipeline at the plan phase:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase plan --task feature-auth-2026-03-22
```

**Advance to implement after design approval:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase implement --task feature-auth-2026-03-22
```

**Skip approval gate with justification (CI environment):**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase deploy --task hotfix-crit-001 \
  --skip-approval-gate \
  --justification "P0 hotfix — CTO approved verbally, ticket HF-42"
```

## Output (JSON)

```json
{
  "taskId": "feature-auth-2026-03-22",
  "phase": "implement",
  "agent": "developer",
  "snapshotPath": ".claude/context/plans/feature-auth-2026-03-22.snapshot.json",
  "previousPhasesCompleted": ["plan", "design"],
  "missingApprovals": [],
  "message": "Ready to execute phase: implement with agent: developer"
}
```

## Snapshot Location

All state is persisted to:

```
.claude/context/plans/<taskId>.snapshot.json
```

This file is the source of truth for the pipeline. Read it to understand phase history, approvals, and agent assignments.
