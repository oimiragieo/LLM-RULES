---
description: Memory protocol rules for reading/writing agent memory
paths:
  - '.claude/context/memory/**'
  - '.claude/lib/memory/**'
---

# Memory Protocol

- Read memory context via `loadMemoryForContext()` (auto-injected into spawn prompts) or `node .claude/lib/memory/memory-manager.cjs load` before starting any task.
- Write learnings, issues, and decisions to the appropriate memory files after completing work.
- Assume interruption: if it's not in memory, it didn't happen.
- Use named memory API (`.claude/context/memory/named/`) for topic-specific persistent notes.
- Never overwrite existing memory entries — append new content.
- Check `decisions.md` for relevant ADRs before making architectural choices.
- Check `issues.md` for known blockers and workarounds before debugging.

## Memory Architecture

### Session-Based Tiers (STM/MTM/LTM)

- **STM** (`.claude/context/memory/stm/`) — Current session only
- **MTM** (`.claude/context/memory/mtm/`) — Last 10 sessions; STM promotes to MTM on session end
- **LTM** (`.claude/context/memory/ltm/`) — Permanent compressed summaries

### File-Based Rotation (25KB Cap)

**Hard cap: 25KB per markdown memory file** (matches Claude Code's 200-line/25KB MEMORY.md discipline). Active files (`learnings.md`, `decisions.md`, `issues.md`) rotate to `.claude/context/memory/archive/` when they exceed 25KB. Rotation handles both section-delimited (`---`/`##`) and flat bullet-point formats via synthetic sectioning. `codebase_map.json` max 500 entries. JSON files (`patterns.json`, `gotchas.json`) capped at 20 items each.

## Memory APIs

**Named memory** (`.claude/context/memory/named/`): `manager.readMemory('topic')`, `writeMemory`, `listMemories`, `deleteMemory`.

**Structured memory** (gotchas/patterns/discoveries): `manager.recordGotcha({ text, area })`, `recordPattern`, `recordDiscovery`.

**Implementation** in `.claude/lib/memory/`: `memory-rotator.cjs`, `memory-deduplicator.cjs`, `smart-pruner.cjs`, `memory-tiers.cjs`, `contextual-memory.cjs`.

## Related References

- `.claude/docs/MEMORY_SYSTEM.md` - Memory architecture docs
- `.claude/lib/memory/` - Memory subsystem implementation
