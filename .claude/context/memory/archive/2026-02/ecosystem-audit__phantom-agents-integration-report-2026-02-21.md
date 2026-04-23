<!-- Agent: artifact-integrator | Task: #integration-queue-p1 | Session: 2026-02-21 -->

# Phantom Agent Integration Report

**Date**: 2026-02-21
**Trigger**: Integration queue entry `unknown:unknown` (P1, gap: not-in-graph)
**Resolution**: Cleaned 4 phantom agent references from routing infrastructure

## Problem

Four agents were registered in routing metadata (CLAUDE.md, routing-table-intent-keywords.cjs, routing-table-intent-agents.cjs) but their actual agent definition files were never created on disk. These are "phantom agents" -- the inverse of the typical "invisible artifact" pattern where a file exists but has no routing entry.

## Affected Agents

| Agent            | Expected Path                                    | Status             |
| ---------------- | ------------------------------------------------ | ------------------ |
| `qa-guardian`    | `.claude/agents/domain/qa-guardian.md`           | File never created |
| `contract-check` | `.claude/agents/domain/contract-check.md`        | File never created |
| `bool-action`    | `.claude/agents/domain/bool-action.md`           | File never created |
| `repo-onboarder` | `.claude/agents/orchestrators/repo-onboarder.md` | File never created |

## Root Cause

Memory entries in `learnings.md` show these agents were "created" on 2026-02-20 and 2026-02-21, and routing metadata was updated accordingly. However, the actual agent definition files were never committed to git. The creation process completed the routing/integration steps but failed to write the actual `.md` definition files.

## Remediation Applied

### Files Modified

1. **`.claude/CLAUDE.md`** (Section 3 Routing Table)
   - Removed 4 phantom routing entries for qa-guardian, contract-check, bool-action, repo-onboarder

2. **`.claude/lib/routing/routing-table-intent-keywords.cjs`**
   - Removed intent keyword entries for all 4 phantom agents

3. **`.claude/lib/routing/routing-table-intent-agents.cjs`**
   - Removed intent-to-agent mapping entries for all 4 phantom agents

4. **`.claude/context/runtime/integration-queue.jsonl`**
   - Marked entry as processed

### Files Not Modified (Intentionally)

- **`.claude/context/memory/learnings.md`** -- Historical record; kept as-is for audit trail
- **`.claude/context/memory/archive/learnings-2026-02.md`** -- Historical archive; kept as-is
- **`.claude/context/reports/reflections/reflection-session-tasks-1-4-2026-02-21.md`** -- Reflection report referencing qa-guardian; kept as-is

## Verification

After remediation:

- No phantom agents remain in CLAUDE.md routing table
- No phantom agents remain in routing-table intent files
- Agent registry (`agent-registry.json`) was already clean (61 agents, none phantom)
- Memory files preserved for audit trail

## Lessons Learned

1. **Agent creation must be atomic**: All steps (file write, routing update, registry update) must succeed together or none should persist. The current workflow allows partial completion where routing is updated but the file write fails or is skipped.

2. **Validation gap**: The `validate-agents.mjs` tool validates agents that exist, but does not cross-check CLAUDE.md routing entries against actual agent files on disk. A reverse validation (routing entries without backing files) would catch this class of error.

3. **Memory as evidence of failure**: The learnings.md entries claiming "Created new agent: qa-guardian" serve as evidence that the creation was attempted but incomplete. Memory should not claim creation until the definition file is verified to exist.

## Recommendation

Consider adding a post-routing-update validation step to `routing-table-intent-keywords.cjs` and `routing-table-intent-agents.cjs` that verifies all referenced agent names have corresponding `.md` files in `.claude/agents/`. This could be a CI gate or a hook-based check.
