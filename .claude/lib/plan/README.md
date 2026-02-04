# Plan Library

## implementation-plan.cjs

Load/save implementation plans at:
`.claude/context/plans/<planId>/implementation_plan.json`

Exports:
- `load(planDir)`
- `save(planDir, plan)`
- `createMinimal(featureName)`

## progress.cjs

Progress helpers:
- `isBuildComplete(planDir)`
- `countSubtasks(planDir)`
- `countCompletedSubtasks(planDir)`
- `getNextSubtask(planDir)`

See `.claude/docs/AGENT_CONFIG_AND_QA_REFERENCE.md` for the full reference.
