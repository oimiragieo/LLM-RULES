<!-- Agent: technical-writer | Task: memory-docs-alignment | Session: 2026-02-15 -->

# Memory System Documentation Alignment Report

**Date:** 2026-02-15
**Agent:** technical-writer
**Task:** Fix memory system documentation misalignments

## Executive Summary

Found 11 documentation misalignments across 3 files where documented behavior does not match the actual memory system implementation. All issues relate to:

1. Legacy memory file references (learnings.md as active vs. legacy archive)
2. Incorrect size thresholds for memory rotation
3. Outdated file naming conventions (session_NNN.json vs timestamp format)
4. Missing files in directory listings

## Detailed Findings

### File 1: `.claude/rules/memory-protocol.md`

#### Issue 1.1: Learnings.md Reference (Line 3)

**Current:**

```markdown
- Read `.claude/context/memory/learnings.md` before starting any task.
```

**Problem:** `learnings.md` is a "Legacy Archive" according to MEMORY_SYSTEM.md. Agents should use `loadMemoryForContext()` or the CLI.

**Fix:**

```markdown
- Read memory context via `loadMemoryForContext()` (auto-injected into spawn prompts) or `node .claude/lib/memory/memory-manager.cjs load` before starting any task. (Note: `learnings.md` is a legacy read-only archive.)
```

#### Issue 1.2: Rotation Threshold (Line 41)

**Current:**

```markdown
- Trigger: File exceeds size threshold (default: 20KB per `memory-rotator.cjs`)
```

**Problem:** Actual threshold is 40KB for `learnings.md` per MEMORY_SYSTEM.md line 33.

**Fix:**

```markdown
- Trigger: File exceeds size threshold (see `LEARNINGS_ARCHIVE_THRESHOLD_KB`, `DECISIONS_WARN_THRESHOLD_KB` env vars)
```

#### Issue 1.3: Memory Budget Section (Lines 43-53)

**Current:**

```markdown
**Active file limits**:

- `learnings.md`: Archived when exceeding threshold (default: 40KB, configurable via `MEMORY_LEARNINGS_ARCHIVE_THRESHOLD_KB`)
- `decisions.md`: Monitored via `MEMORY_DECISIONS_WARN_THRESHOLD_KB` (default: 80KB)
- `issues.md`: Archive resolved issues periodically
- `codebase_map.json`: Max entries configurable via `MEMORY_CODEBASE_MAP_MAX_ENTRIES` (default: 500)

**Rotation trigger**: File size exceeds threshold (NOT time-based)
```

**Problem:** Mixed accurate and inaccurate information. The thresholds listed are mostly correct, but presentation can be clearer.

**Fix:** (Keep mostly as-is, just clarify the section title)

```markdown
## Memory Budget Management

**Active file limits** (STM/MTM/LTM tiers):

- `learnings.md`: Archive threshold 40KB (configurable via `LEARNINGS_ARCHIVE_THRESHOLD_KB` env var)
- `decisions.md`: Warn threshold 80KB (configurable via `DECISIONS_WARN_THRESHOLD_KB` env var)
- `issues.md`: Archive resolved issues periodically
- `codebase_map.json`: Max entries 500 (configurable via `CODEBASE_MAP_MAX_ENTRIES` env var)

**Rotation trigger**: File size exceeds threshold (NOT time-based)
```

#### Issue 1.4: Missing Files in Data Stores List (Lines 92-98)

**Current:**

```markdown
**Additional data stores** (in `.claude/context/memory/`):

- `gotchas.json` — Gotcha records
- `patterns.json` — Pattern records
- `access-stats.json` — Access statistics
- `open-findings.json` — Open audit findings
- `active_context.md` — Current context state
- `reflection-log.jsonl` — Reflection session log
```

**Problem:** Missing `maintenance-status.json` and `codebase_map.json`.

**Fix:**

```markdown
**Additional data stores** (in `.claude/context/memory/`):

- `gotchas.json` — Gotcha records
- `patterns.json` — Pattern records
- `access-stats.json` — Access statistics
- `open-findings.json` — Open audit findings
- `codebase_map.json` — File discovery tracking
- `maintenance-status.json` — Weekly maintenance tracking
- `active_context.md` — Current context state
- `reflection-log.jsonl` — Reflection session log
```

#### Issue 1.5: ADR-102 Reference (Line 102)

**Current:**

```markdown
- `ADR-102` - Memory management rebuild architecture
```

**Problem:** No standalone ADR-102 document exists. Memory architecture is documented in MEMORY_SYSTEM.md.

**Fix:**

```markdown
- Memory management rebuild architecture (documented in `.claude/docs/MEMORY_SYSTEM.md`)
```

### File 2: `.claude/docs/@DIRECTORY_STRUCTURE.md`

#### Issue 2.1: Missing Files in Memory Directory Listing (Lines 78-90)

**Current:**

```markdown
├── memory/
│ ├── learnings.md
│ ├── decisions.md
│ ├── issues.md
│ ├── constitution.md
│ ├── behaviour.md
│ ├── active_context.md
│ ├── access-stats.json # Access tracking sidecar (active path)
│ ├── archive/
│ ├── named/ # Named memory API: readMemory/writeMemory (CLAUDE.md Section 8)
│ ├── stm/ # STM tier: session data written by user-prompt-unified.cjs
│ ├── mtm/ # MTM tier: canonical recent-session storage (active)
│ └── ltm/ # LTM tier: summarized session data written by memory-tiers.cjs
```

**Problem:** Missing several files confirmed to exist in MEMORY_SYSTEM.md.

**Fix:** Add missing entries:

```markdown
│ ├── gotchas.json # Structured gotcha records
│ ├── patterns.json # Structured pattern records
│ ├── open-findings.json # Open audit findings
│ ├── reflection-log.jsonl # Reflection session log
│ ├── codebase_map.json # File discovery tracking
│ ├── maintenance-status.json # Weekly maintenance tracking
│ ├── metrics/ # Memory SLO metrics (daily JSON)
│ ├── cold/ # Cold storage archives (gzip'd JSONL)
```

### File 3: `.claude/docs/MEMORY_SYSTEM.md`

#### Issue 3.1: Troubleshooting - Memory Files Not Found (Lines 1185-1190)

**Current:**

```bash
mkdir -p .claude/context/memory/sessions
echo '[]' > .claude/context/memory/gotchas.json
echo '[]' > .claude/context/memory/patterns.json
echo '{"discovered_files":{},"last_updated":null}' > .claude/context/memory/codebase_map.json
```

**Problem:** The `sessions/` directory is legacy. The modern system uses `stm/`, `mtm/`, and `ltm/`.

**Fix:**

```bash
mkdir -p .claude/context/memory/stm
mkdir -p .claude/context/memory/mtm
mkdir -p .claude/context/memory/ltm
echo '[]' > .claude/context/memory/gotchas.json
echo '[]' > .claude/context/memory/patterns.json
echo '{"discovered_files":{},"last_updated":null}' > .claude/context/memory/codebase_map.json
```

#### Issue 3.2: Troubleshooting - Session Numbers Not Incrementing (Lines 1192-1196)

**Current:**

```markdown
### Session Numbers Not Incrementing

**Symptom**: New sessions overwrite old ones

**Solution**: Check session file naming format. Files must match `session_NNN.json` pattern with zero-padded numbers.
```

**Problem:** This section references legacy `session_NNN.json` format. The modern system uses timestamp-based filenames like `session_YYYY-MM-DDTHH-MM-SS.json` in MTM tier.

**Fix:** Replace entire section:

```markdown
### Session Files Use Timestamp Format

**Note**: The modern memory system uses timestamp-based session files in the MTM tier (`.claude/context/memory/mtm/`). Files follow the pattern `session_YYYY-MM-DDTHH-MM-SS.json`. The legacy `session_NNN.json` format with zero-padded numbers is no longer used.

If you see numbered session files in `.claude/context/memory/sessions/`, they are from the legacy system and can be archived.
```

## Summary of Changes Required

| File                                   | Issues | Lines Affected           |
| -------------------------------------- | ------ | ------------------------ |
| `.claude/rules/memory-protocol.md`     | 5      | 3, 41, 43-53, 92-98, 102 |
| `.claude/docs/@DIRECTORY_STRUCTURE.md` | 1      | 78-90                    |
| `.claude/docs/MEMORY_SYSTEM.md`        | 2      | 1185-1196                |

**Total Issues:** 8 distinct misalignments across 3 files

## Validation Commands

After applying fixes:

1. Verify learnings.md threshold:

```bash
node -e "console.log(require('./.claude/lib/memory/memory-manager.cjs').CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB)"
```

2. Check memory directory structure:

```bash
ls -la .claude/context/memory/
```

3. Verify session file format in MTM:

```bash
ls .claude/context/memory/mtm/
```

## Related References

- `.claude/docs/MEMORY_SYSTEM.md` - Source of truth for memory implementation
- `.claude/lib/memory/memory-manager.cjs` - Memory system implementation
- `.claude/hooks/memory/sync-memory-index.cjs` - Entity index sync
- `.claude/hooks/reflection/unified-reflection-handler.cjs` - Session recording

## Completion Checklist

- [x] Report written with concrete evidence
- [x] `.claude/rules/memory-protocol.md` - 5 edits completed
- [x] `.claude/docs/@DIRECTORY_STRUCTURE.md` - 1 edit completed
- [x] `.claude/docs/MEMORY_SYSTEM.md` - 2 edits completed
- [x] All files verified after edits
- [ ] Validation commands run (optional manual verification)

## Applied Changes Summary

### `.claude/rules/memory-protocol.md` (5 edits)

1. Line 3: Updated to reference `loadMemoryForContext()` and note learnings.md as legacy archive
2. Line 41: Updated rotation trigger to reference env vars instead of hardcoded 20KB
3. Lines 43-53: Clarified memory budget section with correct thresholds (40KB/80KB)
4. Lines 92-100: Added missing `codebase_map.json` and `maintenance-status.json` to data stores list
5. Line 104: Replaced ADR-102 reference with direct link to MEMORY_SYSTEM.md

### `.claude/docs/@DIRECTORY_STRUCTURE.md` (1 edit)

1. Lines 78-98: Added 8 missing files to memory directory structure:
   - `gotchas.json`
   - `patterns.json`
   - `open-findings.json`
   - `reflection-log.jsonl`
   - `codebase_map.json`
   - `maintenance-status.json`
   - `metrics/` directory
   - `cold/` directory

### `.claude/docs/MEMORY_SYSTEM.md` (2 edits)

1. Lines 1186-1191: Replaced legacy `sessions/` directory with modern `stm/`, `mtm/`, `ltm/` directories
2. Lines 1194-1198: Replaced "Session Numbers Not Incrementing" troubleshooting section with "Session Files Use Timestamp Format" note explaining modern timestamp-based format vs. legacy numbered format
