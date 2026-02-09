# Memory Protocol

- Read `.claude/context/memory/learnings.md` before starting any task.
- Write learnings, issues, and decisions to the appropriate memory files after completing work.
- Assume interruption: if it's not in memory, it didn't happen.
- Use named memory API (`.claude/context/memory/named/`) for topic-specific persistent notes.
- Never overwrite existing memory entries — append new content.
- Check `decisions.md` for relevant ADRs before making architectural choices.
- Check `issues.md` for known blockers and workarounds before debugging.

## Hierarchical Memory Tiers (ADR-102)

**Memory is organized in tiers by access frequency and age:**

### HOT Tier (Active Files)

- Location: `.claude/context/memory/` (root)
- Files: `learnings.md`, `decisions.md`, `issues.md`, `codebase_map.json`
- Budget: Each file must stay under 20KB
- Access: Read on every task start
- Rotation: Monthly to WARM tier

### WARM Tier (Recent Archives)

- Location: `.claude/context/memory/archive/`
- Pattern: `learnings-YYYY-MM.md`, `decisions-YYYY-MM.md`
- Retention: Last 30 days
- Access: On-demand for context
- Rotation: After 30 days to COLD tier

### COLD Tier (Long-Term Storage)

- Location: `.claude/context/memory/archive/YYYY/`
- Retention: Indefinite (compressed)
- Access: Rare, manual only
- Format: Compressed markdown

## Memory Budget Management

**Active file limits (HOT tier)**:

- `learnings.md`: 20KB max (rotate monthly)
- `decisions.md`: 20KB max (rotate monthly)
- `issues.md`: 10KB max (archive resolved issues)
- `codebase_map.json`: 50KB max (prune stale entries)

**When to rotate**:

- File exceeds budget
- End of month (automatic via cron)
- Major phase completion

## Memory Subsystem Integration

**Implementation**: `.claude/lib/memory/` provides:

- `memory-rotator.cjs` - Automated tier rotation
- `memory-consolidation.cjs` - Duplicate detection and merging
- `contextual-memory.cjs` - Query interface for tiered access

**Usage**: Agents should use memory API, not direct file access:

```javascript
const { readMemory, writeMemory } = require('.claude/lib/memory/contextual-memory.cjs');

// Read (searches HOT → WARM → COLD)
const learnings = await readMemory('learnings');

// Write (appends to HOT tier)
await writeMemory('learnings', 'New pattern: ...');
```

## Related References

- `ADR-102` - Memory management rebuild architecture
- `.claude/lib/memory/` - Memory subsystem implementation
- `context-compressor` skill - Compression strategies
