---
name: pipeline-reflection-ux
description: Improve router-facing pipeline and reflection narration to reduce noisy status churn and make Step 0/Reflection outcomes explicit. Use when updating Router output contract, reflection reminder wording, or post-pipeline notification batching.
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
version: 1.1.0
tools: []
---

# Pipeline Reflection UX

Use this skill to keep pipeline/reflection output concise, explicit, and low-noise.

## Workflow

1. Make Step 0 visible in router narration.
2. Emit Step 0 completion before `TaskList()`.
3. Emit a one-line reflection outcome with report path.
4. Batch late post-pipeline notifications into one summary.
5. Keep guardrail semantics unchanged (`block` stays `block`).

## Required Checks

- Add/adjust tests before behavior changes.
- Confirm no regression in routing/taskupdate/read-safety tests.
- Verify debug-log counts improve for repeated violations/noise.

## Iron Laws

1. **ALWAYS** emit Step 0 narration (pending reflections count) before any `TaskList()` call — omitting the narration makes reflection spawning invisible to the user and breaks the pipeline audit trail.
2. **NEVER** batch reflection spawns with tool calls that depend on their results — reflection agents must complete before the router proceeds to routing; mixing them creates race conditions.
3. **ALWAYS** emit a one-line reflection outcome (report path + summary) after reflection-agent completes — without this, the user cannot distinguish a completed reflection from a skipped one.
4. **NEVER** emit one status message per late-completing background agent — per-agent late notifications create noise storms; batch all late completions into one summary after drain gate passes.
5. **ALWAYS** preserve existing `block` semantics when modifying pipeline narration — changing guardrail modes while fixing UX copy conflates two concerns and masks the behavioral impact of either change.

## Anti-Patterns

| Anti-Pattern                                  | Why It Fails                                                       | Correct Approach                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Omitting Step 0 narration                     | Reflection spawning invisible to user; pipeline audit trail broken | Always emit "Step 0: N pending reflections..." before spawning reflection agents |
| Missing one-line reflection outcome           | User cannot distinguish completed reflection from skipped one      | Emit report path + one-line summary after every reflection-agent completion      |
| One status message per late-completing agent  | Creates noise storms; clutters pipeline output                     | Batch all late completions into one summary message after drain gate passes      |
| Changing guardrail modes while fixing UX copy | Conflates two changes; behavioral impact of each masked in review  | Separate UX copy changes from guardrail mode changes in distinct commits         |
| Emitting Step 0 completion after TaskList()   | Violates router output contract; narration out of sequence         | Emit "Step 0 complete." before calling TaskList(), not after                     |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

## References

- Detailed UX review: `references/ui-reflection-review.md`
- Troubleshooting runbook: `.claude/docs/TROUBLESHOOTING.md`
- Task tracking protocol: `.claude/docs/@TASK_TRACKING_GUIDE.md`
