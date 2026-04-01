---
name: context-degradation
description: 'Token-range severity zones (Green/Yellow/Orange/Red/Critical) with detection checklist, early warning indicators, and corrective routing actions for context window degradation'
version: 1.2.0
category: 'Performance & Optimization'
agents: [context-compressor, planner, router]
user_invocable: true
invoked_by: both
tools: [Read, Write, Skill]
tags: [context, tokens, degradation, compression, performance, thresholds]
best_practices:
  - Check at every phase boundary, not just when problems appear
  - Treat 2+ early warning indicators as one zone higher
  - Spawn fresh subagent rather than continuing in critical zone
error_handling: graceful
verified: true
lastVerifiedAt: 2026-03-01T00:00:00.000Z
---

# Context Degradation Monitor

Detects context window degradation and prescribes corrective actions before accuracy drops.

## Severity Zones

Thresholds are expressed as a percentage of the context window budget. For a 200K window, Claude Code's auto-compact fires at ~187K (~93.5%, i.e., `contextWindow - 13K`).

| Zone         | Usage % | ~Tokens (200K) | Status   | Action                                                                            |
| ------------ | ------- | -------------- | -------- | --------------------------------------------------------------------------------- |
| Green        | < 65%   | < 130K         | Healthy  | Normal operation                                                                  |
| Yellow       | 65–80%  | 130K–160K      | Caution  | Begin selective compression                                                       |
| Orange/Red   | 80–90%  | 160K–180K      | Warning  | Compress aggressively; summarize completed phases; spawn fresh subagent if needed |
| Critical     | 90–93%  | 180K–186K      | Severe   | Halt complex reasoning; compress immediately; do not attempt multi-step tasks     |
| Auto-compact | > 93%   | > 186K         | Imminent | Claude Code auto-compact will fire; initiate post-compact recovery (see below)    |

Reference: Claude Code constant `AUTOCOMPACT_BUFFER_TOKENS = 13,000`. Auto-compact fires at `contextWindow - 13K`, so for a 200K window that is 187K (93.5%). "Lost in the middle" effect: middle tokens have 20–40% lower recall past ~100K.

## Early Warning Indicators

Symptoms that context degradation is affecting output quality (regardless of token count):

1. **Repeated tool calls** — Agent re-reads files already read in same session
2. **Contradictory reasoning** — Later steps contradict earlier decisions
3. **Missing prior context** — Agent "forgets" task scope or constraints stated at session start
4. **Over-explanation** — Agent re-explains concepts already established
5. **Stale references** — Agent references file paths or task IDs that were resolved earlier

If 2+ indicators are present, treat as one zone higher than token count suggests.

## Corrective Routing by Zone

**Yellow (65–80%):**

- Invoke `Skill({ skill: 'context-compressor' })` at the current phase boundary
- Remove completed phase content from active context
- Keep: current task spec, key decisions, in-progress file list

**Orange/Red (80–90%):**

- Invoke `Skill({ skill: 'context-compressor' })` — aggressive summarization
- Write phase summary to `.claude/context/tmp/phase-summary-{date}.md`
- Prune: all resolved task details, intermediate research, superseded plans
- Spawn fresh subagent if remaining work is complex

**Critical (90–93%):**

- Do NOT continue complex multi-step tasks in current agent
- Spawn a fresh subagent with only the compressed summary as context
- Current agent: write handoff doc → call TaskUpdate(completed) with handoff path in metadata

**Auto-compact (>93%):**

- Halt immediately
- Write emergency summary: what was done, what remains, key decisions
- Route to `session-handoff` skill
- Invoke `Skill({ skill: 'session-handoff' })` before context window forces truncation
- See **Post-Compact Recovery** section below for steps after auto-compact fires

## Detection Checklist (Run at Each Phase Boundary)

```
[ ] Usage < 65%?  → Green, no action
[ ] Usage 65–80%? → Yellow, begin compression
[ ] Usage 80–90%? → Orange/Red, compress aggressively
[ ] Usage 90–93%? → Critical, spawn fresh agent
[ ] Usage > 93%?  → Auto-compact imminent; initiate post-compact recovery
[ ] 2+ early warning indicators? → Upgrade one severity zone
[ ] Compression reminder file exists? → Invoke context-compressor immediately
```

## Post-Compact Recovery

When Claude Code's auto-compact fires (or a microcompact is detected), the context has been silently truncated. Follow these steps to restore working state:

1. **Re-read active files** — Read all files from the pre-compact snapshot's `activeFiles` list (stored in `.claude/context/runtime/pre-compact-snapshot.json`). This restores the in-memory view of code you were editing.
2. **Verify task state** — Read `.claude/context/runtime/edit-counter.json` and current task files to confirm what was completed before compaction and what remains.
3. **Check for microcompact indicators** — Look for a `microcompact-detected` event in the flight recorder (`.claude/context/runtime/flight-recorder.jsonl`). If present, a silent compaction occurred without a PreCompact hook event; treat your current context as potentially incomplete.
4. **Reference the pre-compact snapshot** — Load `.claude/context/runtime/pre-compact-snapshot.json` to recover `originalIntent`, `editCount`, `correctionCount`, and the list of `activeFiles` written just before compaction.
5. **Re-invoke your current skill** — If you were mid-skill when compaction fired, invoke the skill again so its procedures are in context before continuing work.

> These steps ensure that after a compaction event (auto or silent), you resume with full knowledge of where you left off.

## Integration

- Pairs with: `context-compressor`, `context-compressor`, `session-handoff`
- Called by: `planner` (at plan start), `developer` (after each phase), `router` (before large spawns)
- Trigger: Check at every phase boundary, not just when problems appear

## Iron Laws

1. **ALWAYS** check token count at every phase boundary — not just when problems appear or after completing a large task.
2. **NEVER** continue complex multi-step tasks past 90% usage (Critical zone) in the same agent context — spawn a fresh subagent with a compressed handoff instead.
3. **ALWAYS** treat 2+ early warning indicators as one severity zone higher than the raw usage percentage suggests.
4. **ALWAYS** invoke `context-compressor` at Yellow zone (65–80%) before context bloat becomes severe — prevention is cheaper than recovery.
5. **NEVER** claim a task complete without writing a context summary when operating in Critical or Auto-compact zone — if it's not written down, the next agent won't know it happened.

## Anti-Patterns

| Anti-Pattern                                                          | Why It Fails                                                                                          | Correct Approach                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Waiting until output quality degrades before checking context         | By the time quality drops, the context is already in Red/Critical zone                                | Run detection checklist at every phase boundary proactively          |
| Continuing multi-step tasks past 90% usage (Critical zone)            | "Lost in the middle" effect causes 20–40% recall drop; decisions made early are forgotten             | Spawn fresh subagent at Critical zone (90%) with compressed context  |
| Ignoring early warning indicators because token count looks fine      | Indicators are more reliable than raw token counts; a 30K session with 3 indicators is already Yellow | Treat 2+ indicators as one zone higher regardless of token count     |
| Spawning a subagent without a written handoff document                | Subagent starts from scratch, duplicating work or missing constraints                                 | Always write phase summary to `.claude/context/tmp/` before spawning |
| Compressing context by deleting tool call results without summarizing | Compression without summarization loses critical findings from earlier phases                         | Summarize completed phase outputs before pruning raw tool results    |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
