# Memory System Documentation

**Last verified:** 2026-02-18 (paths: MemoryRecord structured-memory policy, STM write on UserPromptSubmit, loadMemoryForContext MTM→LTM→legacy, sync-memory-index, reflection reminder, weekly maintenance fallback)

## Why Memory Matters

> "If it's not in memory, it didn't happen."

AI agents operate in a stateless environment where context resets between sessions. Memory provides continuity across conversations, enabling learnings to compound over time. Without memory, every session starts from zero.

## Memory File Locations

All memory files live in `.claude/context/memory/`:

| File                | Purpose                       | Format                    |
| ------------------- | ----------------------------- | ------------------------- |
| `learnings.md`      | Patterns, solutions, gotchas  | Markdown (Legacy Archive) |
| `decisions.md`      | Architecture Decision Records | ADR format                |
| `issues.md`         | Known blockers and fixes      | Issue format              |
| `active_context.md` | Current session state         | Markdown                  |
| `gotchas.json`      | Pitfalls to avoid             | JSON array                |
| `patterns.json`     | Reusable solutions            | JSON array                |
| `codebase_map.json` | File discoveries              | JSON object               |
| `stm/`              | Current session (STM)         | JSON                      |
| `mtm/`              | Recent sessions (MTM)         | JSON                      |
| `ltm/`              | Long-term summaries (LTM)     | JSON                      |
| `sessions/`         | Legacy per-session files      | JSON                      |

### Structured Memory Policy (Mandatory)

- For structured memory (`patterns`, `gotchas`, discoveries), use the `MemoryRecord` tool/flow.
- Do not use `Write`/`Edit` directly on:
  - `.claude/context/memory/patterns.json`
  - `.claude/context/memory/gotchas.json`
  - `.claude/context/memory/open-findings.json`
  - `.claude/context/memory/access-stats.json`
- Direct writes to those files are blocked by the pre-tool guard.
- Validation gate: `pnpm validate:agent-memory`

### learnings.md size and archival

- **Path:** `.claude/context/memory/learnings.md`
- **Warn threshold:** 40KB (config: `CONFIG.LEARNINGS_WARN_THRESHOLD_KB` in `memory-manager.cjs`). The memory-health-check hook warns when learnings.md exceeds this size.
- **Archive threshold:** 40KB (`LEARNINGS_ARCHIVE_THRESHOLD_KB`). When exceeded, auto-archive runs (e.g. via health check or `node .claude/lib/memory/memory-manager.cjs archive-learnings`).
- **Archival destination:** `.claude/context/memory/archive/` (e.g. dated `learnings-YYYY-MM.md`).

## Model-backed extraction and deduplication

Some memory features require an LLM:

- **Memory extraction** (MTM → structured memories)
- **Deduplication decisions** (merge/update/skip)
- **Session summaries**

Set `ANTHROPIC_API_KEY` to enable real model responses. Without an API key, these
features fall back to mock responses or heuristic extraction and may produce
limited results. See `@ENVIRONMENT_CONFIG.md` for model client env vars.

Extraction input is bounded by:

- `MEMORY_EXTRACTION_RECENT_MESSAGES_LIMIT`
- `MEMORY_EXTRACTION_RECENT_CHARS_LIMIT`
- `MEMORY_EXTRACTION_LIST_LIMIT`

## Entity Index (SQLite)

The hybrid memory system also maintains an entity/relationship index at `.claude/context/data/memory.db` (SQLite).
It is used by `.claude/lib/memory/entity-extractor.cjs` (writes) and `.claude/lib/memory/entity-query.cjs` (reads). Only high-value items (decisions, issues, patterns, gotchas) are indexed; learnings.md is legacy and not synced to the entity index. Session transcripts (MTM) are not currently synchronized to SQLite.

> **Ghost Memory**: The SQLite database is a **sync-only** implementation (using `node:sqlite`). It is considered "ghost memory" because it runs in the background to index content but is **not directly exposed** to agents via tools. Agents access this data only through the Contextual Memory API (injected into prompts) or the Memory Manager CLI.

- SQLite driver: Node’s built-in `node:sqlite` (`DatabaseSync`) to avoid native addon installs. You may see Node's `ExperimentalWarning: SQLite is an experimental feature` in logs; it is expected and can be ignored.
- Initialize schema: `pnpm run memory:init` (or `node .claude/tools/cli/init-memory-db.cjs`).
- Check memory health (JSON): `pnpm run memory:health` (or `node .claude/lib/memory/memory-manager.cjs health`).

The entity index is populated by `sync-memory-index` from `decisions.md` and `issues.md`, and from `patterns.json` / `gotchas.json` when those JSON files are edited. `learnings.md` is a legacy archive and is **not** synced into the entity index. Agent-visible patterns, gotchas, and decisions are loaded via `loadMemoryForContext()` (direct SQL). The `ContextualMemory` methods `findEntities()` and `getRelated()` are now used in the spawn prompt pipeline: `spawn-prompt-assembler.cjs` can append an **Entity Graph (SQLite)** section by default (set `SPAWN_PROMPT_ENTITY_GRAPH=off` to disable). Config model validation is handled by the routing guard hooks; the spawn prompt is augmented with the configured model so the Router should pass it into Task() when invoking. Extracted memories can also be linked to skill entities when SessionEnd provides `tools_used`, creating memory→skill relationships for later graph queries. The entity DB is created on first `pnpm run memory:init` or first sync when editing these files. Code that uses `findEntities`/`getRelated` ensures the DB is initialized (ContextualMemory lazily initializes schema) or handles missing schema by returning empty results.

### Troubleshooting

- **"Required table 'entities' not found"** or missing schema:
  - Run `pnpm run memory:init` (or `node .claude/tools/cli/init-memory-db.cjs`) before first use to create the SQLite schema. The sync-memory-index hook and EntityExtractor attempt to create the schema if missing; if they fail, run memory:init manually.
- **"EntityExtractor not initialized"**:
  - Check if `.claude/context/data/memory.db` exists and is readable.
- **Existing patterns/gotchas not in SQLite**:
  - Run `pnpm run memory:sync-json` once to backfill `patterns.json` / `gotchas.json` into the entity DB.

Entity extraction is format-based. Supported heading styles include `###` or `##` followed by `Pattern:`, `Concept:`, or `Issue:`; decisions use `## [ADR-NNN]` or `## ADR-NNN:` or `## Decision:`. Over-relaxing patterns can pollute the entity graph.

**Project root:** Memory and hooks should use `PROJECT_ROOT` from `.claude/lib/utils/project-root.cjs` when available; fallback to `process.cwd()` or `CLAUDE_PROJECT_DIR` where documented.

## Code Index Vector Store (LanceDB)

The code indexing system shares the LanceDB infrastructure with the memory system but uses a separate table (`code_index` vs `agent_memory`):

| Table          | Purpose                                     | Location                                           |
| -------------- | ------------------------------------------- | -------------------------------------------------- |
| `agent_memory` | Memory embeddings (patterns, gotchas, etc.) | `.claude/context/data/lancedb/agent_memory.lance/` |
| `code_index`   | Code chunk embeddings for semantic search   | `.claude/context/data/lancedb/code_index.lance/`   |

**BM25 index:** `.claude/context/data/lancedb/bm25-index.json` — text-based search index alongside the vector store.

### Building the index

```bash
pnpm code:index:reindex    # Full rebuild: BM25 + vector embeddings
```

This builds both the BM25 text index and LanceDB vector index. Embedding generation uses **subprocess isolation** to work around ONNX Runtime's native memory leak (`embed-subprocess.cjs`). The subprocess is automatically restarted every 50 batches to reclaim leaked native memory. GPU (CUDA) is auto-detected and used when available.

| Config                   | Default     | Notes                                                      |
| ------------------------ | ----------- | ---------------------------------------------------------- |
| `LANCEDB_EMBEDDING_MODE` | `fastembed` | Embedding engine (`fastembed` recommended for speed + GPU) |
| `HYBRID_EMBEDDINGS`      | `on`        | Enable semantic ranking in `pnpm search:code`              |
| `EMBED_SUBPROCESS`       | `on`        | Subprocess isolation for ONNX memory safety                |

See `.claude/docs/CODE_INDEXING_DESIGN.md` for full architecture.

## Hook Wiring (What Runs When)

The memory system is enforced/maintained via Claude Code hooks registered in `.claude/settings.json`:

- `UserPromptSubmit`
  - `.claude/hooks/routing/user-prompt-unified.cjs` (includes Memory Protocol reminder, reflection reminder management, prompt-based reflection queue processing, and maintenance fallback checks)
  - STM write behavior: UserPromptSubmit updates STM session state for in-session continuity.
- `PostToolUse` (matcher `Edit|Write|NotebookEdit`)
  - `.claude/hooks/memory/sync-memory-index.cjs` (canonical sync path: syncs decisions/issues plus patterns.json/gotchas.json into the SQLite entity index).
  - `.claude/hooks/routing/code-index-updater.cjs` (keeps code index metadata aligned after edits/writes)
  - Note: `SyncLayer` and `BackgroundSyncWorker` have been moved to `.claude/archive/lib/memory/` and are no longer in the active codebase. Sync is done only by `sync-memory-index.cjs`.
- `SessionEnd`
  - `.claude/hooks/reflection/unified-reflection-handler.cjs` (records session into STM/MTM, best-effort embeddings + maintenance, queues reflection)
  - `.claude/hooks/reflection/reflection-queue-processor.cjs` (writes `.claude/context/runtime/reflection-spawn-request.json` so reflection is actionable)
  - SessionEnd is responsible for consolidation/finalization (STM -> MTM/LTM pathways), not per-prompt STM mutation.

### Memory Reminder

The “memory reminder” behavior is handled inside `.claude/hooks/routing/user-prompt-unified.cjs`.
There is no separate `memory-reminder.cjs` hook wired in settings.
Note: Claude Code does not provide a `SessionStart` hook event; “session-start” behavior is implemented via `UserPromptSubmit`.

### Reflection spawn

Reflection is **reminder-driven**. The Router **must** perform Step 0 before `TaskList()`; no daemon or hook spawns the reflection-agent—compliance is required for pending reflections to run. The reflection-queue-processor writes `.claude/context/runtime/reflection-spawn-request.json`; on `UserPromptSubmit`, when that file has pending requests, `.claude/hooks/routing/user-prompt-unified.cjs` writes `.claude/context/runtime/reflection-reminder.txt`. Before `TaskList()` or any other tool, if `reflection-reminder.txt` exists, the Router must read it, read `reflection-spawn-request.json`, spawn reflection-agent for each request (or the first batch), then delete the reminder file and clear/trim the spawn request file. Health/dashboard may show `pendingReflectionRequests: N` when the spawn-request file contains queued items. A PreToolUse(TaskList) guard blocks by default when pending reflections exist; set `REFLECTION_STEP0_ENFORCEMENT=warn` to allow with a warning.

Subagent citation and evidence behavior is defined in `@.claude/docs/SUBAGENT_MEMORY_CONTRACT.md`.

An optional Step 0 guard runs on `PreToolUse(TaskList)` via `.claude/hooks/reflection/reflection-step0-guard.cjs`. It **blocks by default** when pending reflections exist; set `REFLECTION_STEP0_ENFORCEMENT=warn` to allow TaskList with warnings instead.

**Reflection is best-effort:** If the Router skips Step 0, pending reflections will not run. Check the dashboard (or health output) for `pendingReflectionRequests` to see if reflections are queued.

**Reflection queue is processed on SessionEnd by default.** The reflection-queue-processor reads `.claude/context/reflection-queue.jsonl` and writes `.claude/context/runtime/reflection-spawn-request.json`. Prompt-based queue processing is also enabled by default in `user-prompt-unified.cjs` (`REFLECTION_QUEUE_PROCESS_ON_PROMPT` empty/on/true/1), with interval guard `REFLECTION_QUEUE_PROCESS_INTERVAL_MS` and timeout `REFLECTION_QUEUE_PROCESS_TIMEOUT_MS`. The queue file is trimmed to the last N lines (default 2000) via `REFLECTION_QUEUE_MAX_LINES`. To run reflection manually, execute `node .claude/hooks/reflection/reflection-queue-processor.cjs`. **Headless / rare sessions:** If SessionEnd rarely or never fires (e.g. headless or long-lived sessions), keep prompt processing enabled and run weekly maintenance via cron or `pnpm run memory:weekly` (or use the worker).

## Reflection and Evolution Memory Flow

The operational data flow is:

1. **Reflection extraction**: `unified-reflection-handler.cjs` captures task/error/session events and writes queue/session artifacts.
2. **Memory storage**: STM/MTM/LTM and observational memory (`observations.jsonl`) are updated; compaction can write `observations_summary.md`.
3. **Spawn-time injection**: `spawn-prompt-assembler.cjs` injects memory context (hybrid or observational mode) into subagent prompts with section budgets.
4. **Evolution decisions**: evolution and quality gates consume findings/memory signals and enforce review/quality policies before changes are accepted.

This pipeline is intentionally best-effort and bounded: failures in one stage should not block normal tool execution, but they should be visible in metrics and nightly strict gates.

### Hook chain error handling

Hooks run in sequence; a hook that exits non-zero may prevent subsequent hooks from running (host-dependent). Each hook should be defensive and avoid throwing; use try/catch and exit 0 for advisory checks so the chain can continue.

### Memory Health Check

Current runtime wiring uses the inlined path only:

- **Inlined**: `user-prompt-unified.cjs` performs lightweight maintenance and fallback checks (including overdue weekly maintenance trigger).
- There is no standalone `memory-health-check.cjs` hook registered in current `.claude/settings.json`.

## Metrics Locations

There are two primary metrics roots:

- Observability metrics: `.claude/context/metrics/` (e.g. hook/error/limit events)
- Memory health metrics: `.claude/context/memory/metrics/`

### Metrics and dashboard

Memory/system metrics are emitted by active runtime hooks (not a standalone memory-health-check hook). For current health snapshots and summaries, use:

- `pnpm run memory:dashboard` (or `node .claude/lib/memory/memory-dashboard.cjs`)
- `pnpm run memory:health` (or `node .claude/lib/memory/memory-manager.cjs health`)

### Strict rollout monitoring

For strict findings rollout tracking over a 3-7 day window:

- `pnpm run metrics:findings:strict-rollout`
- Uses strict mode summary + 7-day trend + stale-open checks.
- Intended for staging/CI drift detection before production tightening.

### Auto-compression reminders (Phase 3 opt-in)

When `AUTO_COMPRESSION_PHASE_3=1`, the auto-compression trigger writes a reminder file for the Router or agents to act on:

- `.claude/context/runtime/compression-reminder.txt`
- `.claude/context/runtime/compression-reminder.json` (reason, urgency, timestamp)

This is advisory only. The Router should spawn the `context-compressor` skill (or invoke `Skill({ skill: 'context-compressor' })`) when the reminder exists.

### Embeddings (auto-index)

Semantic embeddings can be generated automatically on memory file edits when `MEMORY_EMBED_ON_EDIT=on`. The PostToolUse memory index hook (sync-memory-index.cjs) will invoke the embedding generator only for `decisions.md`, `issues.md`, `patterns.json`, and `gotchas.json` with a short timeout (`MEMORY_EMBED_ON_EDIT_TIMEOUT_MS`, default 60000). `learnings.md` is not included in auto-embed on edit (legacy archive). If disabled, use `pnpm run memory:embeddings` to build embeddings manually. To rebuild from scratch (e.g. after a model change or dimension mismatch), use `pnpm run memory:reindex`.

## Caveats / Verification Notes

### Loop Prevention

- Loop counters are updated in the `PreToolUse(Task)` path (after checks pass, before the Task runs), so the loop pre-check is no longer read-only.
- `PostToolUse(Task)` still performs a best-effort decrement when the Task returns.

### loop-prevention.cjs (Deprecated)

The standalone `pre-task-unified.cjs` file remains for history but is marked `@deprecated` and must not be re-wired, otherwise you risk double-counting.

### state-cache.cjs

The repo still contains `.claude/lib/utils/state-cache.cjs`, but `router-state.json` reads do not rely on TTL caching anymore (for correctness and test determinism). Other hooks may still use the cache; the overhead is generally negligible.

### Execution Limits

- Execution limits are wired via a persistent wrapper hook: `user-prompt-unified.cjs` (the original `execution-limit-monitor.cjs` module is in-memory and does not persist across hook processes).
- Cost-based limits are not strictly enforceable from hook input (no reliable per-call cost), so cost is recorded/logged best-effort rather than enforced hard.

## Session Memory (STM/MTM/LTM)

Sessions persist automatically via the `SessionEnd` hook. The canonical session storage is the tiered memory system (`.claude/lib/memory/memory-tiers.cjs`):

### STM (Current Session)

**Location**: `.claude/context/memory/stm/session_current.json`

STM is written on every UserPromptSubmit and cleared after consolidation on SessionEnd. Between sessions, or when no prompt was submitted before maintenance, seeing only `.gitkeep` in `stm/` is expected. Consolidation reporting "No STM session found" is a valid outcome and is treated as success (see maintenance status).

### MTM (Recent Sessions)

**Location**: `.claude/context/memory/mtm/session_YYYY-MM-DDTHH-MM-SS.json` (timestamp-based)

MTM entries include `tier: "MTM"` and `consolidated_at` metadata. Remove test sessions from `mtm/` (e.g. `session_id` containing `test`) before treating MTM as production; no automated sanitize step is run in weekly maintenance.

### LTM (Long-Term Summaries)

**Location**: `.claude/context/memory/ltm/`

## Vector Store (LanceDB)

LanceDB persist directory is `.claude/context/data/lancedb`. Any `vectors.db` or `vectors.db_placeholder` under `.claude/context/memory/` is legacy/orphan (from an older or alternate config) and can be removed; the active client uses `.claude/context/data/lancedb` only. The default table name is `agent_memory` (override with `LANCEDB_TABLE`). If the embedding model fails to load (e.g. missing deps like `sharp`), semantic search is **disabled** (fail‑closed) and ContextualMemory falls back to keyword search; a warning is logged and the dashboard/health show the disabled state.

**First run note:** the embedding model may download on first use (~90MB) and the first embed/search can be slow. Subsequent runs use the cached model.

**Model changes:** changing `LANCEDB_EMBEDDING_MODEL` requires re‑indexing/recreating the LanceDB table. If the table vector dimension does not match the embedding model’s dimension, semantic search is disabled with a clear “dimension mismatch” warning until reindexing is done (`pnpm run memory:reindex`).

- **L0/L1 metadata:** extracted memories store `abstract` (L0) and `overview` (L1) in LanceDB metadata. Spawn prompts prefer these fields for snippets; older rows won’t include them until you reindex.

- Spawn prompt semantic search may apply a hot-only filter (exclude cold LTM). If the filter fails (e.g. LanceDB schema/API change), the hook falls back to unfiltered search. Expected metadata for filtering is document-specific (e.g. `source: 'ltm_archive'` for cold).

Semantic search similarity threshold is defined in `.claude/lib/memory/memory-constants.cjs` as `SEMANTIC_SEARCH_DEFAULT_THRESHOLD` (default 0.72). Override via env `MEMORY_SEMANTIC_SEARCH_THRESHOLD`. Used by contextual-memory, spawn-prompt-assembler, and memory-search.

### Memory search CLI

To run semantic search outside the spawn prompt pipeline, use:

```
node .claude/lib/memory/memory-search.cjs "query"
```

### Code-indexing (separate table, same LanceDB)

Code-indexing (`.claude/lib/code-indexing/`) uses **LanceDB** with a separate table (`code_index` by default). It shares the same LanceDB persist directory (`.claude/context/data/lancedb`) but uses a different table name from memory. Override the table name with `LANCEDB_TABLE_CODE` and the persist directory with `LANCEDB_URI`. Index metadata still lives under `.claude/context/code-index/metadata.json`. To (re)build the code index, run `pnpm run code:index:reindex`.

## Retention and Cold Storage

The memory system is designed to stay bounded:

- **Hot memory (loaded into prompts)**: STM, MTM, and a bounded set of recent LTM summaries in `ltm/`.
- **Cold memory (not loaded into prompts)**: archived LTM summaries in `cold/` (compressed). Cold is retained for forensics and remains searchable via LanceDB, but is not injected into spawn prompts.

### LTM retention policy

- LTM summaries are written by `memory-tiers.cjs` and can grow unbounded without retention.
- Retention is enforced by the **weekly** maintenance task `archiveOldLTM` in `memory-scheduler.cjs`.

### When does weekly maintenance run?

- Weekly maintenance (including `archiveOldLTM`) runs when **SessionEnd** fires (via `unified-reflection-handler.cjs` → `triggerMaintenance()` → `memory-scheduler.cjs` `runWeeklyMaintenance()`) or when **UserPromptSubmit** detects it is overdue: `user-prompt-unified.cjs` reads `.claude/context/memory/maintenance-status.json`; if `lastWeekly` is missing or older than 7 days, it invokes weekly maintenance in a child process. Timeout is configurable via `MEMORY_WEEKLY_FALLBACK_TIMEOUT_MS` (default 60000 ms; for large repos or many LTM files, consider 120000 or higher). On timeout or non-zero exit, the hook logs a one-line warning so operators know maintenance may have been partial. Manual fallback: `pnpm run memory:weekly` (or `memory:daily`). To check last run: `pnpm run memory:status`. LTM cold archival is performed by `cold-storage.cjs` inside `runArchiveOldLTM` in the scheduler.
- **Headless or rarely-used environments:** There is no cron or daemon. Maintenance runs only on SessionEnd or when a user prompt occurs and weekly is overdue. If SessionEnd rarely or never fires, set `REFLECTION_QUEUE_PROCESS_ON_PROMPT=on` and run `pnpm run memory:weekly` (or `memory:daily`) on a schedule (e.g. cron) or use the worker so LTM retention and cold archival run.
- **Optional worker runtime:** You can run the headless worker (`pnpm run agent:worker`) to execute memory maintenance, code-index incremental updates, and reflection queue processing on an interval. See GETTING_STARTED.md for how to enable it and the heartbeat file location.

### Scheduled soak regimen

A weekly CI soak regimen runs memory chaos/stress tests and archives a report artifact:

- Workflow: `.github/workflows/memory-soak-regimen.yml`
- Script: `pnpm run metrics:soak:run`
- Report: `.claude/context/reports/qa/memory-soak-regimen-latest.json`

### Tunables

- `MEMORY_LTM_MAX_SUMMARIES` (default: `50`): max number of `ltm/summary_*.json` files to keep hot.
- `MEMORY_COLD_ENABLE` (default: `true`): if `false`, the scheduler deletes old LTM summaries without archiving.
- `MEMORY_COLD_ARCHIVE_AFTER_DAYS` (optional): also archive/delete any LTM summaries older than N days.
- `MEMORY_COLD_DIR` (default: `.claude/context/memory/cold`): cold archive directory (validated to be within the project root).
- `COLD_STORAGE_INDEX_MAX_CHARS` (default: `4000`): max characters indexed per cold LTM summary.

### Cold archive format and visibility

Cold archives are written as **one gzip’d JSONL per run** (no gzip append), e.g.:

- `.claude/context/memory/cold/ltm-YYYY-MM-DD-<timestamp>.jsonl.gz`

The cold directory (default `.claude/context/memory/cold`) is created by the archiver when needed (`cold-storage.cjs` calls `ensureDir(coldDir)` before writing). To verify archival: run `pnpm run memory:dashboard` (or `memory:health`); the dashboard and health output include cold storage stats (last cold archive time from `maintenance-status.json`, and count of `.jsonl.gz` files in `cold/`). If the cold directory is missing, archival has not yet run (e.g. weekly maintenance has not executed).

### Retention Configuration (Env Vars)

The following environment variables control retention behavior (defined in `.claude/lib/memory/memory-retention-config.cjs`):

| Variable                         | Default                       | Description                                                              |
| :------------------------------- | :---------------------------- | :----------------------------------------------------------------------- |
| `MEMORY_LTM_MAX_SUMMARIES`       | `50`                          | Max number of LTM summary files to keep in the hot `ltm/` directory.     |
| `MEMORY_COLD_ENABLE`             | `true`                        | Enable moving old summaries to cold storage. If false, they are deleted. |
| `MEMORY_COLD_ARCHIVE_AFTER_DAYS` | (unset)                       | Optional: Also archive summaries older than N days regardless of count.  |
| `MEMORY_COLD_DIR`                | `.claude/context/memory/cold` | Custom location for cold storage archives.                               |

### Search behavior (hot vs cold)

- Spawn prompt semantic memory (`spawn-prompt-assembler.cjs`) is **hot-only by default** and excludes cold-archived summaries.
- Explicit semantic search (`memoryManager.searchMemory`) can search across all documents unless a filter is supplied. It also accepts `contextType`/`category` options, which are translated into metadata filters (e.g. `{ contextType: 'memory', category: 'profile' }` → `metadata.type = 'memory'`, `metadata.category = 'profile'`).
- Cold-tier helper: `searchColdStorage()` (in `.claude/lib/memory/cold-storage.cjs`) performs a best-effort LanceDB search with `metadata.tier = 'cold'` filter and returns `[]` when unavailable.

Example (best-effort cold search):

```bash
node -e "require('./.claude/lib/memory/cold-storage.cjs').searchColdStorage('auth regression').then(r => console.log(r.length)).catch(() => {})"
```

### Legacy sessions/ (Deprecated)

The legacy path `.claude/context/memory/sessions/` is retained for backward compatibility and may be used if `memory-tiers` is unavailable.
The legacy `memory-manager.saveSession()` function has been removed; session recording uses memory-tiers.

### Memory Read Path (Split-Brain Fix)

The `loadMemoryForContext()` and `loadMemoryForContextAsync()` functions in `memory-manager.cjs` now read sessions from the canonical tiered storage:

1. **MTM First**: Reads from `.claude/context/memory/mtm/` (canonical session storage)
2. **LTM Summaries**: Also loads last 2 LTM summaries from `.claude/context/memory/ltm/`
3. **Legacy Fallback**: Falls back to `.claude/context/memory/sessions/` only if MTM is empty/unavailable

Session entries include a `source` field (`'mtm'`, `'ltm'`, or `'legacy'`) for debugging. For MTM sessions, `session_number` in the loaded payload is for display/ordering only and is not a global persistent session ID.

This ensures agents can recall session data written via `memory-tiers.cjs` (STM → MTM → LTM flow).

Implementation note: `loadMemoryForContextAsync()` uses synchronous file I/O under the hood via the shared context loader (sync I/O behind an async API) for deterministic hook/runtime behavior.

**Legacy Structure Example**:

```json
{
  "session_number": 1,
  "timestamp": "2026-01-25T10:30:00.000Z",
  "summary": "Session summary text",
  "tasks_completed": ["Task 1", "Task 2"],
  "files_modified": ["path/to/file.js"],
  "discoveries": ["Discovery 1"],
  "patterns_found": ["Pattern 1"],
  "gotchas_encountered": ["Gotcha 1"],
  "decisions_made": ["Decision 1"],
  "next_steps": ["Next step 1"]
}
```

### JSON Memory Files

**Gotchas** (`.claude/context/memory/gotchas.json`):

```json
[
  {
    "text": "Always close DB connections in workers",
    "timestamp": "2026-01-25T10:30:00.000Z",
    "accessCount": 5,
    "lastAccessed": "2026-02-01T14:00:00.000Z"
  }
]
```

**Patterns** (`.claude/context/memory/patterns.json`):

```json
[
  {
    "text": "Use async/await for all API calls",
    "timestamp": "2026-01-25T10:30:00.000Z",
    "accessCount": 3,
    "lastAccessed": "2026-02-01T14:00:00.000Z"
  }
]
```

**Access Tracking**: Gotchas and patterns now include `accessCount` and `lastAccessed` fields:

- `accessCount`: Incremented when an item is loaded via `loadMemoryForContext()`
- `lastAccessed`: Updated to current timestamp on read
- Access tracking is stored in a sidecar file: `.claude/context/memory/access-stats.json` (to avoid rewriting `patterns.json` / `gotchas.json` on read).
- Updates to access tracking are rate-limited per entry (default 5 minutes, configurable via `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS`); repeated reads within the interval do not bump the count.

**Memory Areas**: Gotchas and patterns can optionally include `area`:

- `main` (default)
- `fragments`
- `solutions`

Area is preserved in JSON and can be used for filtering in semantic search.

### Legacy sessions migration

If legacy `.claude/context/memory/sessions/` contains old session files, migrate them into MTM:

```
pnpm run memory:migrate-legacy
```

To remove legacy files after a successful migration:

```
pnpm run memory:migrate-legacy -- --delete
```

**Codebase Map** (`.claude/context/memory/codebase_map.json`):

The code-index-updater hook and the memory-manager `record-discovery` command keep the map updated on edits and discoveries. Stale entries (e.g. archived or moved files) can be pruned via the memory-manager `prune-codebase` command (`node .claude/lib/memory/memory-manager.cjs prune-codebase`) or by editing the file manually.

```json
{
  "discovered_files": {
    "src/auth.ts": {
      "description": "JWT authentication handler",
      "category": "security",
      "discovered_at": "2026-01-25T10:30:00.000Z"
    }
  },
  "last_updated": "2026-01-25T10:30:00.000Z"
}
```

### Session Retention

Session retention is governed by **memory-tiers** and the **scheduler** (LTM max summaries, cold archive), not by `memory-manager.cjs`. The legacy `sessions/` directory is only read when MTM/LTM are empty; new sessions are written only via memory-tiers (STM → MTM → LTM). LTM retention is enforced by weekly maintenance (`archiveOldLTM` in `memory-scheduler.cjs`); see LTM retention policy and Tunables above.

## Deleted Files and Folders

**Directories:** The memory system **recreates missing directories on demand**. When code writes archives, LanceDB data, or tier data (STM/MTM/LTM), it calls an `ensureDir()`-style helper that creates the directory (and parents) if they do not exist. So if you delete `.claude/context/memory/archive/`, the next write (archival or LanceDB init) will recreate the folder. No manual restore is required for directories.

**Files:** The memory system **does not auto-recreate deleted files**. Files like `learnings.md`, `decisions.md`, `issues.md`, `gotchas.json`, `patterns.json`, and `codebase_map.json` are created only when something writes to them (e.g. a hook, the memory-manager CLI, or an agent). If you delete `learnings.md`, reads will get "file not found" (or empty results) until some code writes to that path again. To restore a deleted memory file you can: (1) recreate it with minimal content (e.g. `# Learnings\n\n`) so reads succeed, or (2) rely on the next write from a hook/CLI/agent to recreate it.

**Summary:**

| What was deleted                                                  | Behavior                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `.claude/context/memory/` (entire dir)                            | Recreated when any memory write runs (e.g. SessionEnd, LanceDB init, memory-manager CLI).    |
| `sessions/`, `archive/`, `stm/`, `mtm/`, `ltm/`                   | Recreated on next write to that tier (STM/MTM/LTM). Legacy `sessions/` is no longer written. |
| `learnings.md`, `decisions.md`, `issues.md`, `gotchas.json`, etc. | **Not** auto-recreated. Created only when something writes to that file.                     |

## Memory Manager CLI

The `memory-manager.cjs` script provides CLI access to the memory system.

**Location**: `.claude/lib/memory/memory-manager.cjs`

### Record a Gotcha

```bash
node .claude/lib/memory/memory-manager.cjs record-gotcha "description"
```

Records a pitfall to avoid. The gotcha is saved to `gotchas.json` with a timestamp.
Optional: add an area (`main`, `fragments`, `solutions`):

```bash
node .claude/lib/memory/memory-manager.cjs record-gotcha "description" --area solutions
```

### Record a Pattern

```bash
node .claude/lib/memory/memory-manager.cjs record-pattern "description"
```

Records a reusable solution. The pattern is saved to `patterns.json` with a timestamp.
Optional: add an area (`main`, `fragments`, `solutions`):

```bash
node .claude/lib/memory/memory-manager.cjs record-pattern "description" --area main
```

### Record a Discovery

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "path" "description" [category]
```

Records a codebase file discovery. The discovery is saved to `codebase_map.json` with the file path, description, category (default: "general"), and timestamp.

**Example**:

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "src/auth.ts" "JWT authentication handler" "security"
```

### Load All Memory

```bash
node .claude/lib/memory/memory-manager.cjs load
```

### Named Memory (Read / Write / List / Delete)

Named memories are stored as individual Markdown files under:

```
.claude/context/memory/named/<name>.md
```

The memory-manager API exposes helpers to manage these entries:

- `readMemory(name)` — read a named memory (returns a not-found message if missing)
- `writeMemory(name, content)` — write or overwrite a named memory
- `listMemories()` — list existing named memory keys (without `.md`)
- `deleteMemory(name)` — delete a named memory

**Name normalization**: input names are normalized to safe filenames (spaces → `_`, invalid chars replaced).

Loads all memory files and outputs as formatted markdown. This is the command agents use to read memory at the start of a session.

**Output includes**:

- Recent gotchas (truncated to 20 items)
- Recent patterns (truncated to 20 items)
- Recent discoveries (truncated to 30 items)
- Recent sessions (last 5 sessions with summaries)
- Legacy learnings.md summary (last 3000 characters)

### Memory Statistics

```bash
node .claude/lib/memory/memory-manager.cjs stats
```

Outputs JSON statistics about the memory system:

```json
{
  "gotchas_count": 15,
  "patterns_count": 23,
  "discoveries_count": 42,
  "sessions_count": 12,
  "total_size_bytes": 125430
}
```

### Save a Session

The `save-session` command is **deprecated and exits with an error**. Sessions are recorded only via the memory-tiers flow (STM → MTM → LTM) on SessionEnd. Do not rely on CLI save-session for persistence.

```bash
echo '{"summary":"Fixed auth bug", "tasks_completed":["Fix login"], "files_modified":["src/auth.ts"]}' | node .claude/lib/memory/memory-manager.cjs save-session   # deprecated, exits 1
```

The SessionEnd hook (unified-reflection-handler + memory-tiers) records sessions automatically; the `save-session` CLI command is deprecated and exits with an error.

### Forget Memory by Query

```bash
node .claude/lib/memory/memory-manager.cjs forget "query text" --threshold 0.7 --area main
```

Runs a semantic search and deletes matched gotchas/patterns by id. Returns the list of deleted ids.

### Delete Memory by Ids

```bash
node .claude/lib/memory/memory-manager.cjs delete-by-ids id1,id2,id3
```

Deletes gotcha/pattern entries with matching ids from JSON storage.

## Memory Protocol for Agents

Every agent MUST follow the Memory Protocol before starting work:

### 1. Read Memory (MANDATORY)

Before starting any task, agents must read memory to understand context:

```bash
node .claude/lib/memory/memory-manager.cjs load
```

Or read structured memory directly:

```bash
cat .claude/context/memory/patterns.json
cat .claude/context/memory/gotchas.json
cat .claude/context/memory/decisions.md
cat .claude/context/memory/issues.md
```

> `learnings.md` is a legacy archive and should be treated as **read-only**.

### 2. Record Learnings (MANDATORY)

During and after completing work, agents must record discoveries:

**Record a gotcha** (preferred: MemoryRecord tool or CLI):

```bash
node .claude/tools/cli/memory-record.cjs gotcha "Always validate user input before database queries"
```

**Record a gotcha** (memory-manager fallback):

```bash
node .claude/lib/memory/memory-manager.cjs record-gotcha "Always validate user input before database queries"
```

**Record a pattern** (preferred: MemoryRecord tool or CLI):

```bash
node .claude/tools/cli/memory-record.cjs pattern "Use Zod schemas for API validation"
```

Direct edits to `patterns.json` / `gotchas.json` via Write/Edit are blocked by default. Use `MemoryRecord` or set `MEMORY_DIRECT_WRITE_ENFORCEMENT=warn|off` to override.

**Record a pattern** (memory-manager fallback):

```bash
node .claude/lib/memory/memory-manager.cjs record-pattern "Use Zod schemas for API validation"
```

**Record a discovery**:

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "src/api/users.ts" "User API endpoints" "api"
```

### 3. Assume Interruption (CRITICAL)

Agents must operate under the assumption that their context can reset at any time. If information is not persisted to memory, it is lost.

**Rule**: Persist context immediately after discovering something important. Don't wait until the end of the session.

## How Sessions Persist

The `unified-reflection-handler.cjs` hook automatically captures session insights using the memory-tiers system (STM → MTM).

**Location**: `.claude/hooks/reflection/unified-reflection-handler.cjs`

**Trigger**: SessionEnd event (when a conversation session ends)

**Workflow**:

1. Gather session insights from the SessionEnd payload (if provided) or `active_context.md`
2. Build session data structure
3. Write to STM (Short-Term Memory) via `memory-tiers.writeSTMEntry()`
4. Consolidate STM → MTM via `memory-tiers.consolidateSession()`
5. Extract patterns and gotchas to their respective JSON files

**Note**: The legacy `memory-manager.saveSession()` function has been removed; the `save-session` CLI exits with an error. Use memory-tiers for session recording. Sessions now use the memory-tiers system exclusively (STM → MTM → LTM). The legacy `sessions/` directory is no longer actively written to.

**Memory Tiers**:

- **STM** (Short-Term Memory): `.claude/context/memory/stm/` - Current session data
- **MTM** (Mid-Term Memory): `.claude/context/memory/mtm/` - Recent sessions (canonical storage)
- **LTM** (Long-Term Memory): `.claude/context/memory/ltm/` - Summarized older sessions

**Session Data Structure**:

```javascript
{
  summary: 'Session summary',
  tasks_completed: ['Task 1', 'Task 2'],
  files_modified: ['path/to/file.js'],
  discoveries: ['Discovery 1'],
  patterns_found: ['Pattern 1'],
  gotchas_encountered: ['Gotcha 1'],
  decisions_made: ['Decision 1'],
  next_steps: ['Next step 1']
}
```

## Automatic Memory Injection

Memory context is automatically injected into agent spawn prompts via `prompt-assembler.cjs`.

**Integration point**:

- Injection is applied at runtime by the PreToolUse(Task) hook: `.claude/hooks/routing/spawn-prompt-assembler.cjs`
- This avoids relying on the Router agent (a prompt file) to manually call the assembler.
- Semantic matches are enabled by default; set `SPAWN_PROMPT_SEMANTIC_MEMORY=off` to disable.

**What's injected**:

- Recent gotchas
- Recent patterns
- Recent discoveries
- Recent session summaries

**How it works**:

1. Router spawns agent via Task()
2. `prompt-assembler.cjs` loads memory via `loadMemoryForContext()`
3. Memory is formatted as a markdown section
4. Memory section is injected near `## Memory Protocol` when possible

**Disabling**:

- Memory injection: Pass `includeMemory: false` to `assembleSpawnPrompt()` (not recommended)
- Semantic matches: Set `SPAWN_PROMPT_SEMANTIC_MEMORY=off` environment variable

## Observational Memory Layer

Spawn prompts support an observational memory path designed for cache-stable summaries:

- `.claude/context/memory/observations.jsonl` (append-only structured observations)
- `.claude/context/memory/observations_summary.md` (stable summary block)

### Mode selection

- `MEMORY_MODE=hybrid` (default): existing memory context behavior (`gotchas/patterns/decisions/...`).
- `MEMORY_MODE=observational`: inject observational summary + recent observations.
- `OBSERVATIONAL_MEMORY_ENABLED=off`: kill switch that forces hybrid behavior even when `MEMORY_MODE=observational`.

If observational mode is selected but observational files are missing/empty, spawn prompt assembly falls back to the legacy/hybrid memory section to keep prompts valid.

### Section-based token budgets

Observational and Tier B sections are capped independently (estimated tokens = chars / 4):

- `MEMORY_SUMMARY_BLOCK_MAX_TOKENS` (default `400`)
- `MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS` (default `400`)
- `MEMORY_TIER_B_MAX_TOKENS` (default `400`)

The Tier B cap applies to semantic/query/entity memory subsections appended by the spawn hook.

### Open findings lifecycle

Audit report findings can now be promoted into structured memory and carried across sessions:

- Registry file: `.claude/context/memory/open-findings.json`
- Trend file: `.claude/context/metrics/open-findings-trend.jsonl`
- Ingestion path: `post-task-unified.cjs` ingests expected report artifacts after successful completion checks
- Resolution path: completion output with fix cues can transition matching findings from `open` to `resolved`
- Prompt carryover: spawn memory includes an `Open Findings Carryover` section for unresolved items
- Periodic snapshots: `post-tool-metrics-unified.cjs` records trend snapshots on a cooldown (default 15 minutes) to avoid stale trend signal

Severity filtering for carryover defaults to `high` and is configurable:

- `OPEN_FINDINGS_MIN_SEVERITY=high` (default)
- Accepted values: `critical`, `high`, `medium`, `low`
- `OPEN_FINDINGS_RESOLUTION_MODE=lenient` (default) or `strict`
- `OPEN_FINDINGS_RESOLUTION_MIN_OVERLAP=2` (default)
- `FINDINGS_TREND_SNAPSHOT_INTERVAL_MS=900000` (default)

CLI summaries:

- `pnpm metrics:findings:summary`
- `pnpm metrics:findings:trend:summary`
- `pnpm metrics:findings:trend:snapshot`
- `pnpm metrics:findings:trend:baseline`
- `pnpm metrics:findings:trend:reset`

Nightly strict gates:

- `pnpm metrics:nightly:strict`
- `pnpm metrics:findings:nightly` uses stale-open prune before strict thresholds (`--prune-stale true --prune-max-age-days 3`).

### Reflection and evolution memory data flow

1. Reflection extraction:
   - `unified-reflection-handler.cjs` extracts observations/learnings from task/session activity.
2. Memory persistence:
   - Structured memory files are updated under `.claude/context/memory/**` and compacted on SessionEnd.
3. Findings lifecycle:
   - `post-task-unified.cjs` ingests report findings and resolves findings from completion evidence.
4. Spawn-time injection:
   - `prompt-assembler.cjs` and spawn hooks inject observational/hybrid memory plus open-findings carryover.
5. Evolution feedback loop:
   - Evolution and orchestration workflows consume memory + findings telemetry to prioritize next fixes and reduce repeated regressions.

This keeps short-term reflection, operational findings, and long-horizon evolution coupled through one memory pipeline rather than isolated files.

### Transient artifact cleanup policy

To keep repository churn low and avoid accidental commits of generated data:

- Script: `pnpm cleanup:transient` (or dry-run: `pnpm cleanup:transient:dry-run`)
- Targets:
  - `.claude/staging/*`
  - `tests/lib/memory/.test-memory-soak-chaos-*`
- Default retention: 2 days (configurable via CLI flags)

### SessionEnd compaction

SessionEnd can compact recent observations into a stable summary file used by observational mode:

- `OBSERVATIONS_COMPACT_ON_SESSION_END=on` (default): run compaction at SessionEnd.
- `OBSERVATIONS_COMPACT_ON_SESSION_END=off`: skip compaction.
- `OBSERVATIONS_COMPACT_MAX=50` (default): max rows read from `observations.jsonl` for each compaction.
- `OBSERVATIONS_DECAY_PER_HOUR=0.02` (default): recency decay for observation scoring used in prompt ranking.
- `OBSERVATIONS_CONTRADICTION_ENABLED=off` (default): contradiction supersedes tagging is disabled until telemetry confirms readiness.
- `OBSERVATIONS_CONTRADICTION_MAX_AGE_DAYS=90` (default): when contradiction tagging is enabled, matching only considers recent same-topic history.

### Cache-stability metric

Spawn prompt memory assembly records hash churn at:

- `.claude/context/metrics/memory-cache-stability.jsonl`

Each entry tracks `memory_block_hash`, `previous_hash`, and `churned` (`true` when the memory block changed).

### CI gate

Use `pnpm run test:memory:ci` to run the memory safety/integration gate locally or in CI.  
The workflow `.github/workflows/memory-ci.yml` runs this gate on memory-related changes, plus format/lint and memory SLO checks.

### Live memory/RAG eval modes

Live evaluation for spawn-time memory usage and citation groundedness is implemented in:

- `tests/evals/subagent-memory-rag-live.eval.cjs`
- Report output: `.claude/context/runtime/evals/subagent-memory-rag-live-latest.json`

The eval now supports three execution legs with automatic fallback:

1. `live_cli`
   - Real runtime path via `claude -p --output-format stream-json`
   - Measures whether spawned Task prompts include memory/RAG evidence ids and whether assistant output cites grounded ids.
2. `hook_e2e_fallback`
   - Runs the real hook subprocess (`.claude/hooks/routing/spawn-prompt-assembler.cjs`)
   - Verifies injection fidelity (`[mem:...]`, `[rag:...]`) even when live CLI stalls.
3. `deterministic_subagent_probe`
   - Consumes injected hook prompt with deterministic probe logic
   - Produces citation and groundedness continuity metrics when live CLI is unavailable.

Summary selection:

- `summary.mode = live_cli` when live output is usable
- `summary.mode = hook_e2e_fallback` when live output is unusable and deterministic probe is not selected
- `summary.mode = deterministic_subagent_probe` when probe output is available

Primary metrics in the report summary:

- `spawn_success_rate`
- `evidence_injection_rate`
- `citation_use_rate`
- `groundedness_rate`
- `timed_out_cases`
- `output_observed_rate`

Recommended commands:

```bash
# Default (skip unless explicitly enabled)
node --test tests/evals/subagent-memory-rag-live.eval.cjs

# Live run with practical limits
RUN_LIVE_SUBAGENT_EVALS=on SUBAGENT_LIVE_EVAL_TIMEOUT_MS=120000 SUBAGENT_LIVE_EVAL_MAX_TURNS=3 node --test tests/evals/subagent-memory-rag-live.eval.cjs

# Strict threshold enforcement (CI/nightly)
RUN_LIVE_SUBAGENT_EVALS=on RUN_LIVE_SUBAGENT_EVALS_STRICT=on SUBAGENT_LIVE_EVAL_TIMEOUT_MS=120000 SUBAGENT_LIVE_EVAL_MAX_TURNS=3 node --test tests/evals/subagent-memory-rag-live.eval.cjs
```

### Cache-stability summary CLI

Use:

- `pnpm run metrics:memory-cache:summary`
- `pnpm run metrics:memory-cache:ci`
- `pnpm run metrics:memory:slo:summary`
- `pnpm run metrics:memory:slo:ci`

The CI variant asserts churn/stability thresholds on `memory-cache-stability.jsonl`.
It also uses `--require-data true`, requiring at least one operational memory signal in the current metrics window and at least one cache-stability row in the cache metrics window.

## Hybrid Memory Retrieval (Keyword + Vector)

`ContextualMemory.search()` now uses a hybrid retrieval path when semantic mode is enabled:

- Runs keyword and vector branches in parallel.
- Uses `Promise.allSettled` for fail-safe branch isolation (vector failures do not cancel keyword results).
- Fuses branch rankings with weighted RRF.
- Deduplicates results by stable id (`metadata.id`, then path+position, then content hash).
- Filters out empty-content items before returning results.

Behavior details:

- If `MEMORY_SEMANTIC_SEARCH=off`, search is keyword-only.
- Threshold filtering applies to the vector branch only; keyword hits are not suppressed by threshold.
- If LanceDB is unavailable, the system logs fallback telemetry and returns keyword results.

### Hybrid retrieval tuning

| Variable                                 | Default  | Description                                                                                                   |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `MEMORY_HYBRID_RRF_K`                    | `60`     | RRF damping constant.                                                                                         |
| `MEMORY_HYBRID_KEYWORD_WEIGHT`           | `0.4`    | Weight for keyword branch in fusion.                                                                          |
| `MEMORY_HYBRID_VECTOR_WEIGHT`            | `0.6`    | Weight for vector branch in fusion.                                                                           |
| `MEMORY_HYBRID_VECTOR_BRANCH_LIMIT_MODE` | `legacy` | `legacy` keeps vector limit at `options.limit`; `expanded` uses `branchLimit` for larger RRF candidate pools. |
| `MEMORY_SEMANTIC_SEARCH`                 | `on`     | Set to `off` to force keyword-only retrieval.                                                                 |
| `MEMORY_SEMANTIC_SEARCH_THRESHOLD`       | `0.72`   | Default vector similarity threshold (vector only).                                                            |

### Retrieval Quality Eval Gate

Run retrieval quality baseline before promoting retrieval changes:

```bash
pnpm metrics:retrieval:baseline
```

Artifacts:

- Benchmark fixture: `tests/evals/fixtures/retrieval-quality-benchmark.json`
- Baseline report: `.claude/context/reports/qa/retrieval-quality-baseline-latest.json`

Metrics tracked:

- `Recall@5`
- `MRR@10`
- `latency p50/p95`
- `fallbackRate`
- `keywordOnlyRate`

Promotion thresholds (expanded vs legacy):

- `Recall@5` uplift >= `0.03`
- `MRR@10` delta >= `0`
- `p95` latency regression <= `0.15`
- `fallbackRate` delta <= `0`

## Keyword Search Fallback

When semantic search (LanceDB) is unavailable or disabled, `ContextualMemory` falls back to keyword search with performance optimizations:

**Tool Priority**:

1. **ripgrep** (fastest) - Uses `@vscode/ripgrep` npm package or bundled binary
2. **File reads** (fallback) - Bounded reads (80KB max per file)

**Performance**:

- ripgrep: <50ms for typical searches across memory files
- File reads: <200ms (bounded to last 80KB per file)

**Dependencies**:

- `@vscode/ripgrep` - Automatically downloads correct binary for your platform
- `@ast-grep/cli` - Available for future structured search enhancements

## ADR Format (decisions.md)

Architecture Decision Records follow a standard format:

```markdown
## [ADR-XXX] Title

- **Date**: YYYY-MM-DD
- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: Trade-offs and implications
```

**Example**:

```markdown
## [ADR-001] Router-First Protocol

- **Date**: 2026-01-23
- **Status**: Accepted
- **Context**: Need consistent request handling across all agent interactions
- **Decision**: All requests must first go through the Router Agent for classification
- **Consequences**: Adds routing overhead but ensures proper agent selection
```

**When to create ADRs**:

- Major architectural decisions
- Framework adoption decisions
- Protocol changes
- Tool/library selections with trade-offs

**Status transitions**:

- Proposed → Accepted (when team agrees)
- Accepted → Deprecated (when replaced)
- Accepted → Superseded (when a new ADR replaces it)

## Issue Format (issues.md)

Known issues and blockers follow a standard format:

```markdown
## [ISSUE-XXX] Title

- **Date**: YYYY-MM-DD
- **Severity**: Critical | High | Medium | Low
- **Status**: Open | In Progress | Resolved | Won't Fix
- **Description**: What the issue is
- **Workaround**: Temporary solution (if any)
- **Resolution**: How it was fixed (when resolved)
```

**Example**:

```markdown
## [SEC-001] RESOLVED: Bash Command Validator Fail-Open Vulnerability

- **Date**: 2026-01-25
- **Severity**: Critical
- **Status**: Resolved
- **File**: `.claude/hooks/safety/bash-command-validator.cjs`
- **Lines**: 166-173
- **STRIDE Category**: Elevation of Privilege
- **Description**: The bash command validator had a fail-open pattern where catch blocks would call `process.exit(0)`, allowing all commands through on any error. An attacker could craft malformed input to trigger errors and bypass security validation entirely.
- **Resolution**: Changed `process.exit(0)` to `process.exit(2)` (block) in the catch block. Added security rationale comments explaining defense-in-depth principle: "deny by default when security state is unknown."
```

## Context Efficiency

The memory system uses read-time truncation to ensure memory loading fits within context limits:

**Configuration** (in `memory-manager.cjs`):

```javascript
MAX_CONTEXT_CHARS: {
  gotchas: 2000,
  patterns: 2000,
  discoveries: 3000,
  sessions: 5000,
  legacy: 3000,
}

MAX_ITEMS: {
  gotchas: 20,
  patterns: 20,
  discoveries: 30,
  sessions: 5,
}
```

**Loading strategy**:

1. Load most recent items (last N items from arrays)
2. Truncate to max characters per category
3. Return only what fits in context
4. Gracefully degrade if memory files are missing or corrupted

**Why this matters**: Loading full memory files can consume excessive context tokens. Truncation ensures agents get the most relevant recent memory without blowing the context budget.

## Best Practices

### 1. Record Learnings Immediately

Don't wait until the end of a session to record discoveries. Record them as soon as you find them.

**Why**: Context can reset at any time. Early recording ensures learnings survive interruptions.

### 2. Use Specific, Searchable Descriptions

Write gotchas and patterns with enough detail that future agents can find and understand them.

**Bad**: "Fix the bug"
**Good**: "Always validate user input before database queries to prevent SQL injection"

### 3. Reference File Paths When Relevant

Include file paths in discoveries and patterns so future agents can locate the code.

**Example**: "JWT authentication handler in `src/auth/jwt.ts` uses RS256 algorithm"

### 4. Keep Issues Updated with Status

When an issue is resolved, update the status and add the resolution. Don't leave stale "Open" issues.

**Update template**:

```markdown
- **Status**: Resolved
- **Resolution**: Changed `process.exit(0)` to `process.exit(2)` in catch block
```

### 5. Use Categories for Discoveries

When recording file discoveries, use consistent categories:

- `api` - API endpoints
- `security` - Security-related code
- `config` - Configuration files
- `testing` - Test files
- `database` - Database schemas and migrations
- `general` - Everything else

### 6. Read Memory Before Every Task

Never start work without reading memory. It's the only way to benefit from past learnings.

**MANDATORY**: All agents must read memory files at the start of their workflow.

### 7. Don't Duplicate Entries

The memory manager automatically checks for duplicates when recording gotchas and patterns. Don't manually add duplicates to JSON files.

**Duplicate detection**: Simple text match (case-insensitive)

## How Memory Enables Persistent AI Collaboration

Memory transforms AI agents from one-shot tools into persistent collaborators:

### Without Memory

- Every session starts from zero
- Same mistakes repeated
- No learning from past work
- Context lost between sessions
- Inefficient exploration of codebase

### With Memory

- Learnings compound over time
- Gotchas captured and avoided
- Patterns emerge and get reused
- Context persists across sessions
- Efficient navigation of codebase via codebase_map

### Example: Multi-Session Feature Development

**Session 1** (exploration):

- Agent discovers auth handler in `src/auth.ts`
- Records discovery to codebase_map
- Records pattern: "Use JWT with RS256 algorithm"

**Session 2** (implementation):

- Agent reads memory, sees auth handler location
- Reuses JWT pattern from memory
- Avoids re-exploring codebase

**Session 3** (debugging):

- Agent reads memory, sees past gotcha: "Always validate JWT expiry"
- Applies gotcha to fix bug
- Records new gotcha: "Check token refresh race conditions"

**Result**: Each session builds on previous work. No wasted effort, faster iteration, higher quality.

## Legacy Archive System

The original `learnings.md` file is now a **read-only archive**. New learnings should use the session-based system.

### Why the Change?

**Problems with monolithic learnings.md**:

- File grew too large (5000+ lines)
- Context token waste loading entire file
- Hard to find relevant learnings
- No structure or categorization

**Solutions with session-based memory**:

- Learnings split across sessions
- Read-time truncation for efficiency
- Structured JSON for gotchas/patterns/discoveries
- Automatic pruning of old sessions

### Archival Guidance

When `learnings.md` exceeds 5000 lines, archive older sections to `.claude/context/memory/archive/learnings-YYYY-MM.md` where YYYY-MM is the month being archived.

**Archive process**:

1. Create archive directory if it doesn't exist
2. Move old content (e.g., content older than 6 months) to dated archive file
3. Update `learnings.md` header with archive location
4. Keep recent learnings in main file

## Integration with Other Systems

### Integration with Task System

Memory and task systems work together:

- Tasks reference memory for context
- Task completion triggers memory recording
- TaskUpdate metadata can include discoveries

**Example**:

```javascript
TaskUpdate({
  taskId: '3',
  status: 'completed',
  metadata: {
    summary: 'Fixed auth bug',
    filesModified: ['src/auth.ts'],
    discoveries: ['JWT expiry validation missing'],
    patterns: ['Always check token expiry before refresh'],
  },
});
```

### Integration with Agent Spawning

Agents receive memory context in spawn prompts:

```javascript
Task({
  task_id: 'task-1',
  prompt: `You are DEVELOPER.

## Memory Protocol (MANDATORY)
1. Load memory via `node .claude/lib/memory/memory-manager.cjs load`
2. Record patterns/gotchas/decisions during work (MemoryRecord preferred)
3. Assume interruption - persist context immediately

## Task
[Task details here]
`,
});
```

### Integration with Workflow Skills

Workflow skills like `session-handoff` leverage memory:

- Read current session state from `active_context.md`
- Generate session summary
- Save to session file via memory-manager
- Clear active context for next session

## Troubleshooting

### Reset Memory and Logs

If memory or observability data becomes corrupted or you want a clean slate, use the reset script:

```bash
node scripts/reset-context.cjs --scope soft --force
```

Scopes:

- `soft` (default): clears runtime and metrics only.
- `memory`: clears runtime, metrics, and `.claude/context/memory/**`.
- `full`: clears memory scope plus code index, registry outputs, routing prototypes, and self-healing/evolution state.

Optional: `--include-lancedb` to wipe `.claude/context/data/lancedb`.

After `memory` or `full` reset, reinitialize memory schema:

```bash
pnpm run memory:init
```

After `full` reset, also rebuild:

```bash
pnpm run code:index:reindex
pnpm run routing:prototypes
pnpm run agents:registry
```

### Memory Files Not Found

**Symptom**: `load` command returns empty results

**Solution**: Initialize memory files

```bash
mkdir -p .claude/context/memory/stm
mkdir -p .claude/context/memory/mtm
mkdir -p .claude/context/memory/ltm
echo '[]' > .claude/context/memory/gotchas.json
echo '[]' > .claude/context/memory/patterns.json
echo '{"discovered_files":{},"last_updated":null}' > .claude/context/memory/codebase_map.json
```

### Session Files Use Timestamp Format

**Note**: The modern memory system uses timestamp-based session files in the MTM tier (`.claude/context/memory/mtm/`). Files follow the pattern `session_YYYY-MM-DDTHH-MM-SS.json`. The legacy `session_NNN.json` format with zero-padded numbers is no longer used.

If you see numbered session files in `.claude/context/memory/sessions/`, they are from the legacy system and can be archived.

### Memory Load Too Slow

**Symptom**: Loading memory takes > 1 second

**Solution**: Prune old sessions and reduce MAX_ITEMS/MAX_CONTEXT_CHARS in `memory-manager.cjs`:

```javascript
MAX_ITEMS: {
  gotchas: 10,  // Reduced from 20
  patterns: 10,
  discoveries: 15,
  sessions: 3,
}
```

### Duplicate Entries

**Symptom**: Same gotcha appears multiple times

**Solution**: Memory manager checks for duplicates automatically. If duplicates persist, manually deduplicate the JSON file:

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('.claude/context/memory/gotchas.json')); const unique=[...new Map(data.map(g=>[g.text,g])).values()]; fs.writeFileSync('.claude/context/memory/gotchas.json', JSON.stringify(unique,null,2));"
```

## Advanced Usage

### Programmatic Access

The memory-manager can be imported and used programmatically:

> Agent guidance: agents should still use `MemoryRecord` for structured memory. The programmatic API below is for framework/library code paths.

```javascript
const memoryManager = require('./.claude/lib/memory/memory-manager.cjs');

// Record a gotcha
memoryManager.recordGotcha('Always validate user input');

// Record a pattern
memoryManager.recordPattern('Use async/await for API calls');

// Record a discovery
memoryManager.recordDiscovery('src/auth.ts', 'JWT handler', 'security');

// Load memory for context
const memory = memoryManager.loadMemoryForContext();
console.log(memory.gotchas);

// Get statistics
const stats = memoryManager.getMemoryStats();
console.log(`Total gotchas: ${stats.gotchas_count}`);

// Session storage (canonical): memory-tiers STM → MTM
const memoryTiers = require('./.claude/lib/memory/memory-tiers.cjs');
const sessionData = {
  session_id: 'session-123',
  timestamp: new Date().toISOString(),
  summary: 'Fixed auth bug',
  tasks_completed: ['Fix login'],
  files_modified: ['src/auth.ts'],
};
memoryTiers.writeSTMEntry(sessionData);
memoryTiers.consolidateSession(sessionData.session_id);
```

### Custom Session Data

The tiered session flow preserves additional custom fields:

```javascript
const memoryTiers = require('./.claude/lib/memory/memory-tiers.cjs');

const sessionData = {
  summary: 'Implemented feature X',
  tasks_completed: ['Task 1', 'Task 2'],
  files_modified: ['file1.ts', 'file2.ts'],
  custom_metric: 42, // Custom field preserved
  team_notes: 'Reviewed by Alice', // Custom field preserved
};
memoryTiers.writeSTMEntry(sessionData);
memoryTiers.consolidateSession(sessionData.session_id || 'session-custom');
```

### Filtering Loaded Memory

You can filter memory by category when loading:

```javascript
const memory = memoryManager.loadMemoryForContext();

// Filter discoveries by category
const securityDiscoveries = memory.discoveries.filter(d => d.category === 'security');

// Filter sessions by date
const recentSessions = memory.recent_sessions.filter(s => {
  const sessionDate = new Date(s.timestamp);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return sessionDate > weekAgo;
});
```

## Summary

The memory system provides persistent context across AI agent sessions through:

1. **Tiered session JSON (STM/MTM/LTM)** for structured memory storage
2. **Read-time truncation** for context efficiency
3. **Automatic SessionEnd hook** for zero-overhead persistence
4. **CLI and programmatic access** for flexible memory recording
5. **Memory Protocol** requiring all agents to read before starting work

**Remember**: "If it's not in memory, it didn't happen."

Always read memory before starting work. Always record learnings immediately. Always assume interruption.
