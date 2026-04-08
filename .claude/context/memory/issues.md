# Issues\n\n*Memory index reset on 2026-04-01. Previous 572KB of routing warnings archived.*\n*Cap: 25KB per file (matching CC discipline).*\n

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.580Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.602Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.632Z

## Systemic: Missing TaskUpdate Metadata Contract (Ongoing — 2026-04-04)

**Pattern**: 18 reflection entries across sessions 2026-04-02 and 2026-04-04 contain only the fallback string 'Task N completed without summary metadata'. No scores can be extracted — reflection-agent INSUFFICIENT_DATA gate fires on all 18.

**Root cause**: Subagents completing tasks via TaskUpdate(completed) without providing metadata.summary. The pre-completion-validation.cjs hook either not enforcing or being bypassed.

**Impact**: Full audit trail broken for all tasks in those sessions. 383-387 gap-log entries of type missing_metadata confirm this is deeply systemic — not a one-off.

**Stale task compounding**: task-lifecycle-42 has been in_progress for 3400-3687 minutes (2+ days) and generates a gap-log entry on every prompt. This pollutes the gap log with noise making signal detection harder.

**Recommended fix**:

1. Enforce pre-completion-validation.cjs to BLOCK (not warn) when metadata.summary is absent.
2. Auto-close task-lifecycle-42 — it is a zombie task that will never complete.
3. Review post-completion-chain.cjs to ensure reflection spawn requests include task metadata, not just fallback strings.

**Reflection scores withheld**: All 18 reflections. DataQuality = insufficient. (See reflection-log.jsonl entries 2026-04-02, 2026-04-04.)

Source: reflection of session tasks (2026-04-02 to 2026-04-04)

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.639Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.654Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.678Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:43.990Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:44.086Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:44.131Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.300Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.324Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.346Z
