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

**Named memory API** (for topic-specific notes in `.claude/context/memory/named/`):

```javascript
const manager = require('.claude/lib/memory/memory-manager.cjs');

// Read a named memory
const content = await manager.readMemory('topic-name');

// Write a named memory
await manager.writeMemory('topic-name', 'Content here');

// List all named memories
const names = await manager.listMemories();

// Delete a named memory
await manager.deleteMemory('topic-name');
```

**Structured memory API** (for gotchas, patterns, discoveries):

```javascript
const manager = require('.claude/lib/memory/memory-manager.cjs');

manager.recordGotcha({ text: 'Windows paths need normalization', area: 'platform' });
manager.recordPattern({ text: 'Use shell: false for child_process', area: 'security' });
manager.recordDiscovery({ text: 'BM25 indexer supports lazy IDF', area: 'search' });
```

**Additional data stores** (in `.claude/context/memory/`):

- `gotchas.json` — Gotcha records
- `patterns.json` — Pattern records
- `access-stats.json` — Access statistics
- `open-findings.json` — Open audit findings
- `codebase_map.json` — File discovery tracking
- `maintenance-status.json` — Weekly maintenance tracking
- `active_context.md` — Current context state
- `reflection-log.jsonl` — Reflection session log

## Related References

- Memory management rebuild architecture (documented in `.claude/docs/MEMORY_SYSTEM.md`)
- `.claude/lib/memory/` - Memory subsystem implementation
- `context-compressor` skill - Compression strategies

## Agent Teams Memory Synchronization (WAL Protocol)

> **DESIGN SPECIFICATION — Not yet enforced at runtime.** This section describes the intended WAL protocol for Agent Teams parallel execution. The protocol requires runtime enforcement (a PreToolUse hook or equivalent) to redirect memory writes during Agent Teams sessions. Until that hook is implemented, agents will continue using direct-write paths and concurrent write collisions are possible.

When running Agent Teams (multi-session parallel execution), each session writes memory deltas to an isolated queue file to prevent concurrent write collisions.

### Queue Files

- Location: `.claude/context/memory/queue/`
- Format: `session-{id}.jsonl` (one JSON object per line)
- Each entry: `{ "timestamp": "ISO", "source": "session-id", "type": "learning|decision|issue|pattern|gotcha", "content": "...", "scope": "local|global", "confidence": 0.0-1.0 }`

### Write Protocol

1. During Agent Teams execution, agents write ONLY to their session queue file
2. Never write directly to canonical memory files during parallel execution
3. Each queue entry includes source session ID for traceability

### Merge Protocol (Router-Mediated)

1. After all Agent Teams sessions complete, Router spawns memory-manager to reconcile
2. memory-manager reads all queue files, deduplicates, resolves conflicts by timestamp
3. Approved entries are appended to canonical memory files
4. Queue files are archived to `.claude/context/memory/queue/archive/`

### Cleanup

- Queue files older than 24 hours are auto-archived
- Archive files older than 7 days may be deleted
