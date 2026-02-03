# Audit Report: .claude Memory System & Core Fundamentals

**Date:** 2026-02-02
**Auditor:** Antigravity (CTO Persona)
**Status:** UPDATED — Findings Remediated (2026-02-03)

## Update (2026-02-03)

This report reflects the original audit. The following items have since been remediated:

- Runtime: `worker-agent.cjs` is a real opt-in loop; `production-agent.js` delegates to the worker.
- Config wiring: `token_monitoring` + `auto_compression` are read by `user-prompt-unified.cjs`.
- Read path: `memory-manager.cjs` delegates to `ContextualMemory.loadContext` / `loadContextSync`.
- Vector DB: JSON `vector-db.cjs` removed; code indexing uses LanceDB (`code_index` table).
- Legacy sessions: `sessions/` legacy path removed; no fallback reads.
- saveSession: deprecated and removed from active paths (throws if called).

See `VERIFICATION_REPORT.md` for current validation.

## 1. Executive Summary

The system is currently in a **transitional state** with significant "split-brain" architecture. While individual components (Memory Tiers, LanceDB, Entity Extractor) are implemented with high quality, the **wiring between them is either missing, deprecated, or duplicated**. The "Production Agent" is a stub, meaning there is no actual runtime to execute these high-level behaviors outside of individual test scripts or manual CLI calls.

## 2. Core Fundamentals Audit

### 2.1. Missing Runtime (The "Brain" is Missing)

The most critical finding is that the application has **no autonomic nervous system**.

**Update (2026-02-03):** `worker-agent.cjs` is now a real opt-in loop (maintenance, indexing, reflection, metrics). `production-agent.js` delegates to the worker by setting `WORKER_ENABLED=1`.

### 2.2. Configuration Disconnect

- **`config.yaml`**: Defines sophisticated features like `token_monitoring`, `memory_management.auto_compression`, and `evolution`.
  **Update (2026-02-03):** `user-prompt-unified.cjs` reads `token_monitoring` and `memory_management.auto_compression` from `config.yaml` and applies best-effort checks per prompt.

## 3. Memory System Audit

### 3.1. "Split-Brain" Architecture

The memory system is fighting itself between three different storage paradigms:

1.  **Legacy JSON (`sessions/`)**: Deprecated but still referenced in fallback logic.
2.  **Memory Tiers (`stm/`, `mtm/`, `ltm/`)**: The new "Canonical" path, but `memory-manager.cjs` (the main entry point) still has legacy glue code.
3.  **Ghost Memory (SQLite)**: Used by `EntityExtractor`, but read-path logic in `memory-manager.cjs` tries to load from SQLite _first_, then falls back to JSON. If these get out of sync (which they will, because there's no unified writer), the agent will hallucinate context.

**Update (2026-02-03):** `memory-manager.cjs` now delegates context loading to `ContextualMemory.loadContext` / `loadContextSync`, removing the split-brain read path.

### 3.2. Vector Database Fragmentation

You have **two** completely separate vector store implementations that do not talk to each other:

1.  **`lib/memory/lancedb-client.cjs`**: A robust, local LanceDB implementation intended for **Memory**.
2.  **`lib/code-indexing/vector-db.cjs`**: A simplified, JSON-based vector store intended for **Code Indexing**. **Note:** superseded by LanceDB (`vector-db.cjs` removed; code index now uses LanceDB table `code_index`).

- **Impact**: Memory cannot search code, and Code Search cannot leverage Memory. This is a massive missed opportunity and technical debt.

### 3.3. Dead Code

**Update (2026-02-03):** `saveSession()` was removed from active paths and deprecated; callers use memory-tiers / SessionEnd.

## 4. The "Unwired" List (Critical)

These components exist but are **not connected to any active drive system**:

1.  **`production-agent.js`**: **RESOLVED**. Delegates to the worker runtime.
2.  **`memory-scheduler.cjs`**: **RESOLVED**. Triggered by SessionEnd and worker loop.
3.  **`auto_compression` (in config)**: **RESOLVED**. Evaluated by `user-prompt-unified.cjs`.
4.  **`EntityExtractor`**: **PARTIALLY WIRED**. Runs via `sync-memory-index.cjs` (PostToolUse Edit|Write).
5.  **`lancedb-client.cjs`**: **RESOLVED**. Used by ContextualMemory, cold storage, and code indexing.

## 5. Recommendations

### Phase 1: Establish the Heartbeat

1.  **Implement `worker-agent.cjs`**: It needs an event loop. It should:
    - Initialize `MemoryManager`.
    - Initialize `MemoryScheduler` and run a `setInterval` check for maintenance tasks.
    - Listen for "Tasks" (even if just from a file watcher or mock queue for now).

### Phase 2: Unify Vector Storage

1.  **Delete `lib/code-indexing/vector-db.cjs`**. **(Done: JSON store removed; LanceDB is the sole code index store.)**
2.  **Refactor `lib/code-indexing/vector-store.cjs`** to use `lancedb-client.cjs`.
3.  Ensure `lancedb-client.cjs` supports multiple tables/collections (it does) to segregate `agent_memory` from `code_index`.

### Phase 3: Finalize Memory Transition

1.  **Remove Legacy**: Delete `sessions/` directory fallback logic from `memory-manager.cjs`.
2.  **Force Unity**: Make `MemoryTiers` the **only** way to read/write sessions.
3.  **Ghost Sync**: Ensure that every time `MemoryTiers` writes a JSON file, it _also_ triggers `EntityExtractor` to update the SQLite DB, keeping them 100% in sync.

### Phase 4: Enforce Config

1.  Wire `token_monitoring` into the new `worker-agent.cjs` loop.
2.  If budget > 90%, trigger `memory-scheduler.cjs` triggers (compression).
