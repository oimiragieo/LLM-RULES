# Memory Library

This directory contains the memory management system for maintaining context across agent sessions.

## Files

| File                   | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `memory-manager.cjs`   | Core memory management - read/write/update memory files |
| `memory-scheduler.cjs` | Schedules memory operations (compression, archival)     |
| `memory-tiers.cjs`     | Implements tiered memory (hot/warm/cold) storage        |
| `smart-pruner.cjs`     | Intelligently prunes old memory entries                 |
| `memory-dashboard.cjs` | Dashboard utilities for memory inspection               |

**Archived (moved to `.claude/archive/lib/memory/`):** `sync-layer.cjs`, `sync-worker.cjs`. Sync is done by the hook `.claude/hooks/memory/sync-memory-index.cjs` only.

## Memory Architecture

The memory system uses a tiered approach:

1. **Hot Memory** - Recent, frequently accessed context (learnings.md, decisions.md)
2. **Warm Memory** - Archived but quickly accessible (compressed JSON)
3. **Cold Memory** - Long-term storage (git history, snapshots)

## Usage

```javascript
const { MemoryManager } = require('./memory-manager.cjs');

const memory = new MemoryManager();

// Read current learnings
const learnings = await memory.read('learnings');

// Add a new learning
await memory.append('learnings', {
  date: new Date().toISOString(),
  pattern: 'Use async/await over callbacks',
  context: 'Improved code readability in workflow engine',
});
```

## Testing

Run tests with:

```bash
node --test .claude/lib/memory/*.test.cjs
```

## Related

- Memory files: `.claude/context/memory/`
- Memory Protocol: See CLAUDE.md Section 8
