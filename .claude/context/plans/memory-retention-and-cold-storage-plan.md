# Memory Retention Policies and Cold Storage

**Plan ID**: `memory-retention-and-cold-storage`  
**Status**: COMPLETE ✅ (2026-02-01)  
**Dependencies**: Split-brain fix complete (MTM/LTM read path in memory-manager) + cold storage implementation complete

---

## Executive Summary

Add retention policies and cold-storage archiving so the memory system stays bounded: cap LTM summary count, archive older LTM to compressed cold storage (no gzip append), keep cold content searchable via LanceDB, and extend the memory scheduler with tunables. Default prompt retrieval remains hot-only.

---

## 1. Tunables (config / env)

**Purpose**: Environment-driven limits so operators can cap LTM and control cold behavior.

| Env / config                     | Default                       | Purpose                                                                                   |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `MEMORY_LTM_MAX_SUMMARIES`       | `50`                          | Max LTM summary files to keep in `ltm/` before archiving oldest.                          |
| `MEMORY_COLD_ENABLE`             | `true`                        | If `false`, only delete oldest LTM files (no cold archive).                               |
| `MEMORY_COLD_ARCHIVE_AFTER_DAYS` | (optional)                    | If set, archive LTM summaries older than N days (alternative or complement to count cap). |
| `MEMORY_COLD_DIR`                | `.claude/context/memory/cold` | Directory for compressed archives.                                                        |

### Tasks

- [x] **1.1** Define tunables in a single place: add a small helper (e.g. in `memory-scheduler.cjs` or new `memory-config.cjs`) that reads `process.env` and returns `{ maxSummaries, coldEnable, archiveAfterDays, coldDir }` with defaults above.
- [x] **1.2** Ensure `MEMORY_COLD_DIR` is resolved against project root and validated (path traversal safe); document in MEMORY_SYSTEM.md.

---

## 2. Cold storage format and location

**Purpose**: Avoid unbounded LTM growth without losing data; keep cold searchable.

- **Directory**: `.claude/context/memory/cold/` (created by archiver if needed).
- **Format**: Do **not** append to a single `.jsonl.gz` (tooling/compat issues). Use either:
  - **Option A**: Rotate plain `.jsonl` (appendable), then periodically compress/close old segments (e.g. `ltm-YYYY-MM-DD.jsonl` → `ltm-YYYY-MM-DD.jsonl.gz` when segment is closed).
  - **Option B**: Write **new** `ltm-YYYY-MM-DD.jsonl.gz` per run (one file per run; never append into an existing gzip).
  - **Option C**: Archive to `tar.gz` batches (e.g. one tar per month containing multiple summary JSONs).
- **Content**: Each cold file contains one or more LTM summary JSONs (same structure as current `ltm/summary_*.json`) so cold is self-contained and parseable.
- **Prompt loading**: Cold files are **not** loaded into prompt context; only hot LTM (last N in `ltm/`) and MTM are used by `loadMemoryForContext`. Cold is for search and optional future “load on demand”.

### Tasks

- [x] **2.1** Choose and document format (A, B, or C) in this plan and in MEMORY_SYSTEM.md.
  - Chosen: **Option B** (write a new `.jsonl.gz` file per run; never append to an existing gzip).
- [x] **2.2** Implement cold dir creation and path helpers (resolve `coldDir` from project root, ensure directory exists before write, validate paths).

---

## 3. Archiver module (new file)

**Purpose**: List LTM summaries, archive oldest to cold (rotation or per-run files), optionally index into LanceDB, delete originals from `ltm/`.

**File**: `.claude/lib/memory/cold-storage.cjs` (or `memory-archiver.cjs`).

### Tasks

- [x] **3.1** Implement `listLTMSummaries(projectRoot)`: list `ltm/*.json` with mtime/name, sort by age (oldest first). Return array of `{ path, mtime, name }`.
- [x] **3.2** Implement `archiveOldLTM(projectRoot, options)`:
  - `options.maxSummaries`: from `MEMORY_LTM_MAX_SUMMARIES` (default 50).
  - `options.coldEnable`: from `MEMORY_COLD_ENABLE` (default true).
  - `options.archiveAfterDays`: optional; if set, consider only summaries older than N days.
  - If count <= maxSummaries (and no archiveAfterDays filter), return `{ archived: 0 }`.
  - Determine which files to archive (oldest first, by count and/or by date).
  - If cold enable: write to cold using chosen format (rotation or per-run `.jsonl.gz`; **no append to single gzip**). Then for each archived summary optionally index into LanceDB (see 3.3). Then delete original JSON from `ltm/`.
  - If cold disable: delete oldest files only (no archive, no LanceDB).
  - Return `{ archived: N, coldPaths: [...] }` for logging.
- [x] **3.3** LanceDB indexing of cold content: for each summary being archived, build a short text representation, upsert into LanceDB, and include metadata like `{ source: 'ltm_archive', coldPath: 'cold/...' }`.
- [x] **3.4** Safety: validate `projectRoot`; write only under `cold/`; use atomic-ish writes for new cold archives.
- [x] **3.5** Export `listLTMSummaries` and `archiveOldLTM` for scheduler and tests.

---

## 4. Memory scheduler changes

**Purpose**: Run archiver weekly so LTM stays capped and cold grows in a controlled way.

**File**: `.claude/lib/memory/memory-scheduler.cjs`.

### Tasks

- [x] **4.1** Add `CONFIG.TASKS.archiveOldLTM` (or `coldArchive`): `{ type: 'weekly', description: 'Archive old LTM summaries to cold storage' }`.
- [x] **4.2** Implement `runArchiveOldLTM(projectRoot)` and call `archiveOldLTM(projectRoot, options)` with env tunables.
- [x] **4.3** In the weekly maintenance branch, after `summarization` (and after `pruning`), call `runArchiveOldLTM(projectRoot)` and append result to run output.
- [x] **4.4** Record `lastColdArchive` in `maintenance-status.json` for reporting.
- [x] **4.5** Ensure `getLibDir(projectRoot)` signature mismatch is resolved (accepts arg for clarity).

---

## 5. LTM cap policy (no change to memory-tiers)

**Purpose**: Keep all retention policy in one place (scheduler + archiver); avoid coupling memory-tiers to cold-storage.

- **Decision**: Do **not** add LTM cap logic inside `memory-tiers.cjs`. Cap only in the weekly scheduler/archiver. memory-tiers continues to summarize MTM→LTM when MTM exceeds 10; the scheduler then archives excess LTM to cold.

### Tasks

- [x] **5.1** Document in MEMORY_SYSTEM.md that LTM cap is enforced by the weekly archiver task, not by memory-tiers.

---

## 6. LanceDB and retrieval behavior

**Purpose**: Keep cold searchable; avoid cold dominating prompt retrieval; prepare for scale.

- **Single collection**: Keep one collection/table for agent memory; cold summaries are additional documents with metadata (e.g. `source: 'ltm_archive'`).
- **Hot-only default**: Prompt retrieval (spawn-prompt-assembler / loadMemoryForContext) uses **hot** data only (MTM + last N LTM in `ltm/`). Semantic search (`searchMemory`) can search all (hot + cold) or be filtered to hot-only by default; document the default (hot-only for prompt, full for explicit search) in MEMORY_SYSTEM.md.
- **Recency/usage weighting (recommended)**: As cold grows, add recency or usage weighting so cold memories don’t dominate retrieval. Reference: LangChain time-weighted retriever pattern. Implement as v1 (simple metadata `created_at` + decay in score) or v2 (full time-weighted scoring).
- **Metadata columns (future)**: Today lancedb-client stores metadata as JSON string and uses SQL `metadata LIKE ...`. For scale, plan to migrate to real columns (`tier`, `created_at`, `source`) for proper SQL filters; document as follow-up in this plan and in MEMORY_SYSTEM.md.

### Tasks

- [x] **6.1** Document in MEMORY_SYSTEM.md: prompt retrieval = hot only; semantic search = configurable.
- [ ] **6.2** (Optional v1) Add `created_at` (or equivalent) to LanceDB document metadata when upserting cold summaries; use in ordering or simple recency filter.
- [ ] **6.3** (Future) Add “LanceDB metadata as real columns” to a follow-up plan or backlog for scalable filtering.

---

## 7. Documentation

**Purpose**: Single place for operators and contributors to understand retention and cold storage.

### Tasks

- [x] **7.1** In MEMORY_SYSTEM.md, add section “Retention and cold storage”:
  - Hot: STM, MTM, last N LTM summaries (in `ltm/`), patterns/gotchas/codebase_map (already capped).
  - Cold: Compressed archives in `cold/`; format (rotation or per-run); not loaded into prompts; searchable via LanceDB.
  - Tunables: `MEMORY_LTM_MAX_SUMMARIES`, `MEMORY_COLD_ENABLE`, `MEMORY_COLD_ARCHIVE_AFTER_DAYS`, `MEMORY_COLD_DIR`.
  - Weekly task: archive old LTM to cold, optionally index into LanceDB, then delete from `ltm/`.
  - Hot-only default for prompt retrieval; optional recency weighting.
- [x] **7.2** In DEEP_DIVE_AUDIT or README: one line that memory system is bounded by LTM cap + cold storage; legacy `sessions/` fallback may be removed in a future major version.

---

## 8. Testing

**Purpose**: Lock archiver and scheduler behavior with tests.

### Tasks

- [x] **8.1** Unit tests for cold-storage: list + archive with cold enable/disable.
- [x] **8.2** Unit tests for archiver with LanceDB mock: assert upsert called with expected metadata for archived summaries.
- [x] **8.3** Scheduler test: assert weekly run includes `archiveOldLTM` and task runner supports it.

---

## 9. session-memory-extractor and “unify memory managers”

- **session-memory-extractor**: Already deprecated with early-exit unless `SESSION_MEMORY_EXTRACTOR_ENABLE=true|1`. No further work.
- **Unify memory managers**: Remain deferred. Current design (memory-manager as primary read API, memory-tiers as canonical session write, ContextualMemory for search) stays; retention and cold storage are additive.

### Tasks

- [ ] **9.1** No implementation tasks; leave as-is.

---

## 10. Future: legacy sessions/ removal

When doing a major version cleanup, remove the legacy `sessions/` fallback from `loadMemoryForContext` so context loading uses only MTM + LTM (and cold remains search-only). Not part of this plan.

### Tasks

- [ ] **10.1** (Backlog) Add “Remove sessions/ fallback” to a future major-version cleanup list.

---

## Subtask summary (for TaskCreate)

| Task ID | Subject                                                             | Blocked By | Effort |
| ------- | ------------------------------------------------------------------- | ---------- | ------ |
| R1      | Tunables: config helper + validation                                | None       | 1h     |
| R2      | Cold format: choose (rotation vs per-run), path helpers             | None       | 1h     |
| R3      | Archiver: listLTMSummaries + archiveOldLTM + LanceDB index + safety | R2         | 4h     |
| R4      | Scheduler: weekly task + runArchiveOldLTM + getLibDir fix           | R3         | 2h     |
| R5      | Docs: MEMORY_SYSTEM.md retention + cold + hot-only                  | R4         | 1h     |
| R6      | Tests: cold-storage unit tests + scheduler weekly test              | R3         | 2h     |

---

## File list

| File                                                         | Change                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `.claude/lib/memory/cold-storage.cjs`                        | New: list LTM, archive to cold (no gzip append), optional LanceDB index, delete from ltm/. |
| `.claude/lib/memory/memory-scheduler.cjs`                    | New weekly task; call archiver; CONFIG + getLibDir fix if needed.                          |
| `tests/lib/memory/cold-storage.test.cjs` (or under `tests/`) | New: unit tests for archiver.                                                              |
| `.claude/docs/MEMORY_SYSTEM.md`                              | New section: retention policy, cold storage, tunables, hot-only default.                   |

---

**End of Memory Retention and Cold Storage Plan**
