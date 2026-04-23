<!-- Agent: researcher | Task: memory-docs-audit | Session: 2026-02-15 -->

# Memory System Documentation Audit Report

**Date**: 2026-02-15
**Scope**: All documentation referencing the memory system vs actual implementation
**Files Audited**: memory-protocol.md, CLAUDE.md Section 8, performance.md, MEMORY.md (auto-memory)

---

## CRITICAL — Documentation Actively Misleading

### 1. Tier naming mismatch: docs say HOT/WARM/COLD, code says STM/MTM/LTM

**Files**: `.claude/rules/memory-protocol.md`, `.claude/CLAUDE.md` Section 8
**Documentation Claims**: HOT tier (active files), WARM tier (archive/), COLD tier (archive/YYYY/)
**Implementation Reality**: `memory-tiers.cjs` defines:

- `STM` (Short-Term Memory) — current session, path: `.claude/context/memory/stm/`
- `MTM` (Mid-Term Memory) — last 10 sessions, path: `.claude/context/memory/mtm/`
- `LTM` (Long-Term Memory) — permanent summaries, path: `.claude/context/memory/ltm/`

The HOT/WARM/COLD terminology does NOT exist in the codebase. Additionally, there is a separate file-rotation system (`memory-rotator.cjs`) that archives `learnings.md`/`decisions.md`/`issues.md` to `archive/` when they exceed size thresholds — this is distinct from the STM/MTM/LTM tier system.

**Status**: WRONG

### 2. Named memory API import example is broken

**File**: `.claude/rules/memory-protocol.md`
**Documentation Claims**:

```javascript
const { readMemory, writeMemory } = require('.claude/lib/memory/contextual-memory.cjs');
```

**Implementation Reality**: `contextual-memory.cjs` exports `{ ContextualMemory }` (a class). The class has NO `readMemory`/`writeMemory`/`listMemories`/`deleteMemory` methods. Its API is: `search()`, `findEntities()`, `getRelated()`, `readFile()`, `loadContextSync()`, `close()`.

The named memory API lives in `.claude/lib/memory/core/memory-storage.cjs` and is re-exported via:

- `.claude/lib/memory/core/index.cjs`
- `.claude/lib/memory/memory-manager-core-impl.cjs`
- `.claude/lib/memory/memory-manager.cjs`

Correct imports:

```javascript
const memory = require('.claude/lib/memory/core');
await memory.readMemory(name);
// or
const manager = require('.claude/lib/memory/memory-manager.cjs');
await manager.readMemory(name);
```

**Status**: WRONG

### 3. `memory-consolidation.cjs` does not exist

**File**: `.claude/rules/memory-protocol.md`
**Documentation Claims**: Lists `memory-consolidation.cjs` for "Duplicate detection and merging"
**Implementation Reality**: File does NOT exist. Closest equivalents:

- `memory-deduplicator.cjs` — deduplication logic
- `smart-pruner.cjs` — pruning logic

**Status**: WRONG

### 4. `observations.jsonl` and `observations_summary.md` don't exist

**File**: `.claude/CLAUDE.md` Section 8.1
**Documentation Claims**: References these files with fallback behavior
**Implementation Reality**: The files do not exist on disk. `observations.cjs` defines paths and functions for them, but they are never created during normal operation. The "fallback to legacy" is the only code path that ever runs.

**Status**: OUTDATED (feature not fully implemented)

---

## MODERATE — Partially Implemented or Missing Documentation

### 5. Memory budget numbers don't match code defaults

**File**: `.claude/rules/memory-protocol.md`
**Documentation Claims**: `learnings.md: 20KB max`, `decisions.md: 20KB max`, `issues.md: 10KB max`
**Implementation Reality**: `memory-manager-core-impl.cjs` sets `LEARNINGS_ARCHIVE_THRESHOLD_KB: 40` (configurable via env var). The rotator's default section threshold is 20KB. These are different thresholds (archive trigger vs rotation trigger) but docs don't distinguish them.

**Status**: INACCURATE

### 6. Undocumented memory data stores

The following files exist in `.claude/context/memory/` but are not documented anywhere:

- `gotchas.json` — Gotcha records via `recordGotcha()` API
- `patterns.json` — Pattern records via `recordPattern()` API
- `access-stats.json` — Memory access statistics
- `open-findings.json` — Open findings for audit workflows
- `active_context.md` — Current context state
- `maintenance-status.json` — Maintenance scheduler state
- `reflection-log.jsonl` — Reflection session log

**Status**: MISSING documentation

### 7. Session-based storage undocumented

The actual memory manager stores sessions in:

- `stm/session_current.json` — current session
- `mtm/session_*.json` — recent sessions (max 10)
- `ltm/summary_*.json` — long-term summaries
- `sessions/session_NNN.json` — legacy session format

None of this is documented in memory-protocol.md.

**Status**: MISSING documentation

### 8. Memory rotation description wrong

**File**: `.claude/rules/memory-protocol.md`
**Documentation Claims**: "Monthly to WARM tier", "After 30 days to COLD tier"
**Implementation Reality**: `memory-rotator.cjs` rotates based on FILE SIZE (>20KB threshold), not time. The STM→MTM→LTM lifecycle in `memory-tiers.cjs` is session-based (on session end), not time-based. No monthly cron exists.

**Status**: WRONG

---

## LOW — Minor Inaccuracies

### 9. Spawn prompt assembler path wrong in MEMORY.md

**File**: Auto-memory MEMORY.md
**Documentation Claims**: `spawn-prompt-assembler.cjs` in `.claude/lib/`
**Implementation Reality**: Located at `.claude/hooks/routing/spawn-prompt-assembler.cjs` (with submodules: .memory.cjs, .runtime.cjs, .task-tools.cjs, .core.cjs, .helpers.cjs)

**Status**: OUTDATED

### 10. Manual learnings.md read instruction misleading

**File**: `.claude/CLAUDE.md` Section 8
**Documentation Claims**: "Read `.claude/context/memory/learnings.md` (before starting)"
**Implementation Reality**: The spawn-prompt-assembler automatically injects memory context (constitution, behaviour, semantic matches, entity graph) into agent prompts. Manual reading is redundant for spawned agents.

**Status**: INACCURATE

### 11. Terminology inconsistency across docs

- CLAUDE.md uses both "HOT/WARM/COLD" and "Tier A/Tier B" (observational memory)
- Code uses "STM/MTM/LTM" for session memory, separate "observational" system
- These are two distinct subsystems but docs conflate them

**Status**: CONFUSING

---

## REMEDIATION PLAN

### P0 — Critical (must fix)

1. Rewrite `memory-protocol.md` tier section: replace HOT/WARM/COLD with STM/MTM/LTM, describe session-based lifecycle
2. Fix named memory API import example in `memory-protocol.md`
3. Replace `memory-consolidation.cjs` reference with `memory-deduplicator.cjs` and `smart-pruner.cjs`
4. Update `CLAUDE.md` Section 8 to align tier names with implementation

### P1 — Should fix

5. Document `gotchas.json`, `patterns.json`, and other data stores in `memory-protocol.md`
6. Clarify file-rotation (rotator) vs session-tier lifecycle (STM/MTM/LTM) as distinct mechanisms
7. Document session storage format (stm/mtm/ltm directories)
8. Fix memory budget numbers or clarify archive vs rotation thresholds

### P2 — Nice to have

9. Fix spawn-prompt-assembler path in auto-memory MEMORY.md
10. Add note that memory injection is automatic via spawn-prompt-assembler
11. Clarify observational vs session tier systems as distinct subsystems
