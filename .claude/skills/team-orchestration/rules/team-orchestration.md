# Team Orchestration Rules

## Core Principles

1. **Phase Integrity**: No phase may start until the previous phase's exit criteria are verified.
2. **Approval Gates**: Human approval gates cannot be skipped without documented justification stored in the snapshot.
3. **Agent Ownership**: Each phase has a single owning agent. Only that agent updates the phase snapshot.
4. **Snapshot as Source of Truth**: The `.claude/context/plans/<taskId>.snapshot.json` is the sole state record for a pipeline run. Never infer state from file timestamps or memory alone.
5. **Resumability**: Every phase must leave the pipeline in a resumable state — partial work must be checkpointed, not discarded.

## Phase Transition Protocol

- Before advancing to the next phase, call `TaskUpdate` with `metadata.phaseCompleted = <phase>`.
- Emit the exit-criteria checklist as structured output, not prose.
- If ANY exit criterion fails, set phase status to `blocked` and report the blocking criterion.
- Never advance from `review` to `test` with open critical findings.

## Approval Gate Behavior

| Gate Type  | Who Approves         | Can Skip?            |
| ---------- | -------------------- | -------------------- |
| HUMAN      | Human user           | Yes, with written justification |
| AUTOMATED  | CI/CD system         | No — system must pass |
| CONSENSUS  | 2+ agents agree      | No — quorum required |

## Anti-Patterns

- Never run `implement` before `design` is complete — undefined scope causes rework.
- Never skip `review` to "save time" — every line of code requires a review pass.
- Never run `deploy` without `test` passing — broken deploys cost more than delayed ones.
- Never hard-code agent names in prompts — use the `agentAssignments` from snapshot.
- Never store secrets, tokens, or credentials in snapshot files.

## Integration Points

- **plan-generator**: Use to create the initial plan before invoking team-orchestration.
- **code-reviewer**: The default agent for the `review` phase.
- **qa**: The default agent for the `test` phase.
- **devops**: The default agent for the `deploy` phase.
- **master-orchestrator**: Can wrap team-orchestration for multi-task pipelines.

## Snapshot Retention

- Keep snapshots in `.claude/context/plans/` for the duration of the pipeline.
- Archive snapshots to `.claude/context/plans/archive/` after `deploy` completes.
- Never delete snapshots until the pipeline is confirmed complete by the `deploy` agent.
