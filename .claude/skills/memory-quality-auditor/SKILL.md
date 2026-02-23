---
name: memory-quality-auditor
description: Audit memory retrieval quality (drift, staleness, citation-groundedness) and produce remediation backlog.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord]
args: '--mode summary|full [--hours 24]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Memory Quality Auditor

Audit the memory system as a unified retrieval layer (STM/MTM/LTM files + index + spawn citation outcomes).

## Scope

- Retrieval drift signals
- stale memory ratio
- evidence injection coverage
- citation usage/groundedness continuity

## Workflow

1. Read memory artifacts and latest eval reports.
2. Compute quality metrics and threshold status.
3. Emit remediation backlog with TDD checks.
4. Record findings in memory and optional evolution recommendation.

## Iron Laws

1. **ALWAYS** establish a baseline metric snapshot before auditing — drift is only meaningful relative to a prior measurement; auditing without a baseline produces absolute numbers that cannot identify regression.
2. **NEVER** close a memory finding without re-running the affected retrieval query — closing without verification creates false improvement metrics and masks persistent degradation.
3. **ALWAYS** include citation-groundedness checks in every audit run — uncited memory injections are the primary source of hallucination in agent spawns; skipping this check leaves the highest-risk failure mode undetected.
4. **NEVER** audit only the STM tier — degradation often originates in MTM/LTM promotion corruption; all three tiers must be sampled in every full audit cycle.
5. **ALWAYS** emit TDD-ready remediation items with a failing-test condition and expected metric threshold — vague findings ("memory quality is low") cannot be actioned by any agent.

## Anti-Patterns

| Anti-Pattern                      | Why It Fails                                                                                                               | Correct Approach                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Auditing without a baseline       | Cannot distinguish regression from steady-state; all findings are ambiguous                                                | Snapshot current metrics at session start; compute delta against the previous run                |
| Closing findings without re-check | Produces false-positive resolution; degradation persists silently behind green metrics                                     | Re-run the specific retrieval query after each remediation; close only on confirmed green metric |
| Skipping citation groundedness    | Citation failures are the leading cause of agent hallucination; missing this check omits the highest-severity defect class | Include `citation_coverage` and `grounded_ratio` metrics in every audit report                   |
| Full-mode audit on every spawn    | Full audit is expensive; running it unconditionally inflates cost and slows workflows                                      | Use `--mode summary` for routine checks; reserve `--mode full` for scheduled or triggered audits |
| Auditing STM only                 | MTM/LTM corruption is invisible in STM-only scans; stale LTM entries contaminate future sessions                           | Sample all three tiers: STM (current session), MTM (last 10 sessions), LTM (permanent summaries) |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
