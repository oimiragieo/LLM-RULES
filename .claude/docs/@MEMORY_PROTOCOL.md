<!-- Extracted from CLAUDE.md | Session: 2026-03-06 -->

# Memory Protocol

**Source:** CLAUDE.md Section 8
**Purpose:** Complete memory persistence, tier architecture, and context budget reference

---

## Memory Persistence (All Spawned Agents)

1. **Memory context auto-injected:** The spawn-prompt-assembler automatically injects constitution, behaviour, semantic matches, and entity graph context into agent prompts.
2. **Write:** learnings/issues/decisions to:
   - `learnings.md` (patterns/solutions)
   - `decisions.md` (ADRs)
   - `issues.md` (blockers/workarounds)
3. **Structured memory:** Use the `MemoryRecord` tool for structured memory updates (patterns/gotchas/discoveries). Do not use Write/Edit on `.claude/context/memory/patterns.json`, `.claude/context/memory/gotchas.json`, `.claude/context/memory/open-findings.json`, or `.claude/context/memory/access-stats.json`; direct writes are blocked by the memory guard.
4. **Compression reminder (optional):** if `.claude/context/runtime/compression-reminder.txt` exists, spawn the `context-compressor` skill (or invoke `Skill({ skill: 'context-compressor' })`) and clear the reminder.
5. **Named memory API (optional):** project-specific notes in `.claude/context/memory/named/` via `memory-manager.cjs`:
   - `readMemory(name)`
   - `writeMemory(name, content)`
   - `listMemories()`
   - `deleteMemory(name)`

> **Assume interruption:** if it's not in memory, it didn't happen.

---

## Memory Tier Architecture

The memory system uses two subsystems:

### 1. Session Tiers (STM/MTM/LTM)

- **STM:** Current session context (`.claude/context/memory/stm/`)
- **MTM:** Last 10 sessions (`.claude/context/memory/mtm/`)
- **LTM:** Permanent compressed summaries (`.claude/context/memory/ltm/`)

### 2. File Rotation

`learnings.md`/`decisions.md`/`issues.md` rotate to `archive/` when exceeding size threshold (default: 20KB via `memory-rotator.cjs`).

### 3. Memory Mode + Kill Switch

- `MEMORY_MODE=hybrid|observational` (default: `hybrid`)
- `OBSERVATIONAL_MEMORY_ENABLED=on|off` (default: `on`)
- If kill switch is `off`, treat mode as `hybrid` regardless of `MEMORY_MODE`.

### 4. Tier Behavior in Spawn Prompts

- **Tier A (default):** session context + structured memory (gotchas, patterns).
- **Tier B (optional depth):** semantic/entity memory only when `memory_depth=true` or prompt intent is exploratory/debug/high-uncertainty.

### 5. Task Protocol Remains Strict

Memory mode does **not** relax task tracking. Spawned agents must still do FIRST `TaskUpdate(in_progress)` before work, LAST `TaskUpdate(completed)` before `TaskList()`.

---

## Context Window Budget

| Threshold   | Action                                                        |
| ----------- | ------------------------------------------------------------- |
| 80K tokens  | Spawn `context-compressor` proactively                        |
| 120K tokens | **WARNING:** Compression mandatory before new spawns          |
| 150K tokens | **RED LINE:** No new agent spawns until compression completes |

If `.claude/context/runtime/compression-reminder.txt` exists, compression is overdue -- handle it before spawning new agents.

---

## Memory Budget Management

**Active file limits** (STM/MTM/LTM tiers):

- `learnings.md`: Archive threshold 40KB (configurable via `LEARNINGS_ARCHIVE_THRESHOLD_KB` env var)
- `decisions.md`: Warn threshold 80KB (configurable via `DECISIONS_WARN_THRESHOLD_KB` env var)
- `issues.md`: Archive resolved issues periodically
- `codebase_map.json`: Max entries 500 (configurable via `CODEBASE_MAP_MAX_ENTRIES` env var)

**Rotation trigger**: File size exceeds threshold (NOT time-based)

---

## Implementation Files

| File                                         | Purpose                                      |
| -------------------------------------------- | -------------------------------------------- |
| `.claude/lib/memory/memory-rotator.cjs`      | File-size-based rotation (active -> archive) |
| `.claude/lib/memory/memory-deduplicator.cjs` | Duplicate detection                          |
| `.claude/lib/memory/smart-pruner.cjs`        | Memory pruning                               |
| `.claude/lib/memory/memory-tiers.cjs`        | STM/MTM/LTM session tier management          |
| `.claude/lib/memory/contextual-memory.cjs`   | Semantic search and entity query interface   |
| `.claude/lib/memory/memory-manager.cjs`      | Named memory API + structured recording      |

---

## Structured Memory API

```javascript
const manager = require('.claude/lib/memory/memory-manager.cjs');

manager.recordGotcha({ text: 'Windows paths need normalization', area: 'platform' });
manager.recordPattern({ text: 'Use shell: false for child_process', area: 'security' });
manager.recordDiscovery({ text: 'BM25 indexer supports lazy IDF', area: 'search' });
```

---

## RELATED REFERENCES

- **@ENVIRONMENT_CONFIG.md** - Memory-related environment variables
- **@TASK_TRACKING_GUIDE.md** - TaskUpdate protocol (task tracking is not relaxed by memory mode)
- **@SKILL_CATALOG_TABLE.md** - `context-compressor` and `context-compressor` skills
- `.claude/rules/memory-protocol.md` - Agent-facing memory protocol rules

---

## BACK TO MAIN

See **CLAUDE.md** Section 8 for inline summary.
