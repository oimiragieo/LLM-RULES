---
description: Memory protocol rules for reading/writing agent memory
paths:
  - '.claude/context/memory/**'
  - '.claude/lib/memory/**'
---

# Memory Protocol

- Read memory context via `loadMemoryForContext()` (auto-injected into spawn prompts) or `node .claude/lib/memory/memory-manager.cjs load` before starting any task. (Note: `learnings.md` is a legacy read-only archive.)
- Write learnings, issues, and decisions to the appropriate memory files after completing work.
- Assume interruption: if it's not in memory, it didn't happen.
- Use named memory API (`.claude/context/memory/named/`) for topic-specific persistent notes.
- Never overwrite existing memory entries — append new content.
- Check `decisions.md` for relevant ADRs before making architectural choices.
- Check `issues.md` for known blockers and workarounds before debugging.

## Memory Architecture

The memory system has two distinct subsystems:

### 1. Session-Based Tiers (STM/MTM/LTM)

Session memory is organized in three tiers based on recency:

**STM (Short-Term Memory)** — Current session

- Location: `.claude/context/memory/stm/`
- Format: `session_current.json`
- Retention: Current session only

**MTM (Mid-Term Memory)** — Recent sessions

- Location: `.claude/context/memory/mtm/`
- Format: `session_*.json`
- Retention: Last 10 sessions
- Promotion: On session end, STM → MTM

**LTM (Long-Term Memory)** — Permanent knowledge

- Location: `.claude/context/memory/ltm/`
- Format: `summary_*.json` (compressed summaries)
- Retention: Indefinite

### 2. File-Based Rotation

Markdown memory files are rotated based on file size:

- Active files: `.claude/context/memory/` (root)
- Archive: `.claude/context/memory/archive/`
- Files: `learnings.md`, `decisions.md`, `issues.md`
- Trigger: File exceeds size threshold (see `LEARNINGS_ARCHIVE_THRESHOLD_KB`, `DECISIONS_WARN_THRESHOLD_KB` env vars)

## Memory Budget Management

**Active file limits** (STM/MTM/LTM tiers):

- `learnings.md`: Archive threshold 40KB (configurable via `LEARNINGS_ARCHIVE_THRESHOLD_KB` env var)
- `decisions.md`: Warn threshold 80KB (configurable via `DECISIONS_WARN_THRESHOLD_KB` env var)
- `issues.md`: Archive resolved issues periodically
- `codebase_map.json`: Max entries 500 (configurable via `CODEBASE_MAP_MAX_ENTRIES` env var)

**Rotation trigger**: File size exceeds threshold (NOT time-based)

## Memory Subsystem Integration

**Implementation**: `.claude/lib/memory/` provides:

- `memory-rotator.cjs` - File-size-based rotation (active → archive)
- `memory-deduplicator.cjs` - Duplicate detection
- `smart-pruner.cjs` - Memory pruning
- `memory-tiers.cjs` - STM/MTM/LTM session tier management
- `contextual-memory.cjs` - Semantic search and entity query interface

**Named memory API** (`.claude/context/memory/named/`):

```javascript
const manager = require('.claude/lib/memory/memory-manager.cjs');
await manager.readMemory('topic');
await manager.writeMemory('topic', 'content');
await manager.listMemories();
await manager.deleteMemory('topic');
```

**Structured memory API** (gotchas/patterns/discoveries):

```javascript
manager.recordGotcha({ text: '...', area: 'platform' });
manager.recordPattern({ text: '...', area: 'security' });
manager.recordDiscovery({ text: '...', area: 'search' });
```

**Additional stores** (`.claude/context/memory/`): `gotchas.json`, `patterns.json`, `access-stats.json`, `open-findings.json`, `codebase_map.json`, `maintenance-status.json`, `active_context.md`, `reflection-log.jsonl`.

## Agent Teams Memory Synchronization (WAL Protocol)

> **DESIGN SPEC — Not yet enforced at runtime.** During Agent Teams parallel execution, each session should write memory deltas to an isolated queue file (`.claude/context/memory/queue/session-{id}.jsonl`) to prevent concurrent write collisions. After all sessions complete, the Router spawns memory-manager to reconcile, deduplicate, and append approved entries to canonical memory files. Until the enforcement hook is implemented, agents use direct-write paths and concurrent write collisions are possible.

## Related References

- Memory management rebuild architecture (documented in `.claude/docs/MEMORY_SYSTEM.md`)
- `.claude/lib/memory/` - Memory subsystem implementation
- `context-compressor` skill - Compression strategies
