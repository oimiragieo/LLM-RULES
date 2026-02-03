# Audit Report: .claude Memory System & Core Fundamentals
**Date:** 2026-02-02
**Auditor:** Antigravity (CTO Persona)
**Status:** CRITICAL ISSUES DETECTED

## 1. Executive Summary
The system is currently in a **transitional state** with significant "split-brain" architecture. While individual components (Memory Tiers, LanceDB, Entity Extractor) are implemented with high quality, the **wiring between them is either missing, deprecated, or duplicated**. The "Production Agent" is a stub, meaning there is no actual runtime to execute these high-level behaviors outside of individual test scripts or manual CLI calls.

## 2. Core Fundamentals Audit

### 2.1. Missing Runtime (The "Brain" is Missing)
The most critical finding is that the application has **no autonomic nervous system**.
*   **`production-agent.js`**: Is a stub that logs "intentionally unimplemented" and exits.
*   **`worker-agent.js`**: Is a skeleton script that runs a `setInterval` heartbeat but performs no work, listens to no events, and drives no components.
*   **Implication**: The sophisticated memory systems you have built (STM/MTM/LTM) are **never automatically engaged** by a running process. They only run if manually invoked via CLI tools or specific test harnesses.

### 2.2. Configuration Disconnect
*   **`config.yaml`**: Defines sophisticated features like `token_monitoring`, `memory_management.auto_compression`, and `evolution`.
*   **Reality**: Most of these settings are **read-only**.
    *   `auto_compression`: There is NO active process ensuring this runs. `memory-scheduler.cjs` exists but must be triggered manually or via cron (which is not set up in the repo).
    *   `token_monitoring`: Configuration exists, but without a central event loop (Agent Runtime), it's not being checked in real-time.

## 3. Memory System Audit

### 3.1. "Split-Brain" Architecture
The memory system is fighting itself between three different storage paradigms:
1.  **Legacy JSON (`sessions/`)**: Deprecated but still referenced in fallback logic.
2.  **Memory Tiers (`stm/`, `mtm/`, `ltm/`)**: The new "Canonical" path, but `memory-manager.cjs` (the main entry point) still has legacy glue code.
3.  **Ghost Memory (SQLite)**: Used by `EntityExtractor`, but read-path logic in `memory-manager.cjs` tries to load from SQLite *first*, then falls back to JSON. If these get out of sync (which they will, because there's no unified writer), the agent will hallucinate context.

### 3.2. Vector Database Fragmentation
You have **two** completely separate vector store implementations that do not talk to each other:
1.  **`lib/memory/lancedb-client.cjs`**: A robust, local LanceDB implementation intended for **Memory**.
2.  **`lib/code-indexing/vector-db.cjs`**: A simplified, JSON-based vector store intended for **Code Indexing**.
*   **Impact**: Memory cannot search code, and Code Search cannot leverage Memory. This is a massive missed opportunity and technical debt.

### 3.3. Dead Code
*   **`memory-manager.cjs` -> `saveSession`**: marked as "CRITICAL DEPRECATION" and is a NO-OP. Any code relying on this to save session progress is silently failing to persist data to the legacy location (which might be intended, but confusing if not fully migrated).

## 4. The "Unwired" List (Critical)
These components exist but are **not connected to any active drive system**:

1.  **`production-agent.js`**: **UNWIRED**. Cannot run.
2.  **`memory-scheduler.cjs`**: **UNWIRED**. It acts as a library of tasks but has no trigger mechanism (no cron, no system service, no agent loop calling it).
3.  **`auto_compression` (in config)**: **UNWIRED**. Logic might exist in `memory-manager` (pruning), but nothing triggers it automatically based on the config threshold.
4.  **`EntityExtractor`**: **PARTIALLY WIRED**. It extracts from files, but only when manually triggered or (presumably) via a Git hook. If the hook fails or isn't installed (`npm run precommit`), entities are never updated.
5.  **`lancedb-client.cjs`**: **UNWIRED**. It is initialized but never used by the main agent loop (because there is no main agent loop).

## 5. Recommendations

### Phase 1: Establish the Heartbeat
1.  **Implement `worker-agent.js`**: It needs an event loop. It should:
    *   Initialize `MemoryManager`.
    *   Initialize `MemoryScheduler` and run a `setInterval` check for maintenance tasks.
    *   Listen for "Tasks" (even if just from a file watcher or mock queue for now).

### Phase 2: Unify Vector Storage
1.  **Delete `lib/code-indexing/vector-db.cjs`**.
2.  **Refactor `lib/code-indexing/vector-store.cjs`** to use `lancedb-client.cjs`.
3.  Ensure `lancedb-client.cjs` supports multiple tables/collections (it does) to segregate `agent_memory` from `code_index`.

### Phase 3: Finalize Memory Transition
1.  **Remove Legacy**: Delete `sessions/` directory fallback logic from `memory-manager.cjs`.
2.  **Force Unity**: Make `MemoryTiers` the **only** way to read/write sessions.
3.  **Ghost Sync**: Ensure that every time `MemoryTiers` writes a JSON file, it *also* triggers `EntityExtractor` to update the SQLite DB, keeping them 100% in sync.

### Phase 4: Enforce Config
1.  Wire `token_monitoring` into the new `worker-agent.js` loop.
2.  If budget > 90%, trigger `memory-scheduler.cjs` triggers (compression).
