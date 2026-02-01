# Memory and Core – Comprehensive Audit Fix Plan

**Date:** 2026-02-01  
**Scope:** All findings from the Comprehensive Audit (28 issues) plus the existing [Memory and Core Fix Plan](memory-and-core-fix-plan-2026-02-01.md).  
**Goal:** Single actionable plan with reviewer assessment and proposed solution for every finding.

---

## Relationship to Existing Plan

This document **extends** [memory-and-core-fix-plan-2026-02-01.md](memory-and-core-fix-plan-2026-02-01.md). Items already covered there are referenced by section; new or refined solutions from the 28-item audit are spelled out below with **Review** and **Proposed Solution** for each.

---

## Part A: Audit Findings – Review and Proposed Solutions

Each audit item is listed with: **Review** (assessment of root cause and impact) and **Proposed Solution** (concrete fix and where to implement).

---

### CRITICAL (P0)

#### C1. saveSession() throws – dead code path

**Audit:** [memory-manager.cjs](.claude/lib/memory/memory-manager.cjs) ~L233–237: `saveSession()` throws immediately; any caller crashes.

**Review:** Deprecation was implemented as a hard throw to force migration. That makes any remaining caller (e.g. unified-reflection-handler fallback when memory-tiers is missing) fragile. The legacy `sessions/` dir having 5 files suggests old code paths or manual use; the fallback is only safe if wrapped in try/catch.

**Proposed Solution:**

- **Option A (recommended):** Change `saveSession()` to a **no-op with deprecation warning**: log once (e.g. `console.warn` or audit log) and return `{ sessionNum: 0, file: null }` instead of throwing. Remove it from the public export list in a future major version, or keep exported but documented as deprecated no-op.
- **Option B:** Keep the throw but ensure **no code path** calls it. Audit unified-reflection-handler: when memory-tiers is missing it currently calls `memoryManager.saveSession()` in a try/catch; if we keep the throw, document that this fallback is “best-effort and may throw” and that memory-tiers is required for session persistence.
- **Implementation:** In [memory-manager.cjs](.claude/lib/memory/memory-manager.cjs), replace the `throw new Error(...)` in `saveSession()` with a deprecation log and `return { sessionNum: 0, file: null }`. Update [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and [DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md](.claude/docs/DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md) to state that `saveSession()` is a deprecated no-op.

---

#### C2. Consolidation task consistently failing

**Audit:** [maintenance-status.json](.claude/context/memory/maintenance-status.json) shows `"type": "consolidation", "success": false`. STM → MTM consolidation never succeeds.

**Review:** [memory-scheduler.cjs](.claude/lib/memory/memory-scheduler.cjs) `runConsolidation()` calls `memoryTiers.consolidateSession('current', projectRoot)`, which reads `.claude/context/memory/stm/session_current.json`. If that file is missing (STM empty or cleared), [memory-tiers.cjs](.claude/lib/memory/memory-tiers.cjs) returns `{ success: false, error: 'No STM session found' }`. So consolidation fails when: (1) SessionEnd never ran after STM was written, (2) STM was already consolidated and cleared, or (3) STM is only written on UserPromptSubmit and maintenance runs in a context where no prompt was submitted (e.g. cron or SessionEnd without prior STM write).

**Proposed Solution:**

- Ensure **STM is written before consolidation** when consolidation is triggered: e.g. in unified-reflection-handler on SessionEnd, we already call `writeSTMEntry(sessionData)` then `consolidateSession(sessionData.session_id)` – so SessionEnd path is correct. The scheduler’s `runConsolidation()` is used for **daily** maintenance and runs without a recent UserPromptSubmit; at that time STM may legitimately be empty.
- **Change semantics:** Treat “No STM session found” as **success** for the consolidation task (nothing to consolidate). In [memory-scheduler.cjs](.claude/lib/memory/memory-scheduler.cjs) `runConsolidation()`, set `result.success = true` when `consolidateResult.success === false` and `consolidateResult.error === 'No STM session found'` (or equivalent), so maintenance-status.json does not show consolidation as failed when there was simply no STM to consolidate.
- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md), state that consolidation in the scheduler may report “no session to consolidate” when STM is empty; that is normal when no UserPromptSubmit occurred before the maintenance run.

---

#### C3. STM directory always empty

**Audit:** `.claude/context/memory/stm/` only has `.gitkeep`; no session data. Tiered flow appears broken.

**Review:** [user-prompt-unified.cjs](.claude/hooks/routing/user-prompt-unified.cjs) (L870–892) **does** call `memoryTiers.writeSTMEntry()` on UserPromptSubmit, which should write `stm/session_current.json`. So either: (1) the audit was run before that was added, (2) SessionEnd runs and `consolidateSession()` then **clears** STM (by design), or (3) the hook or memoryTiers load is failing silently. After SessionEnd, STM is expected to be empty until the next UserPromptSubmit.

**Proposed Solution:**

- **Verify wiring:** Confirm that on UserPromptSubmit, `memoryTiers` is required and `writeSTMEntry` is invoked; add a single debug log or metric (e.g. “stm_written”) when write succeeds, and run one UserPromptSubmit to confirm `stm/session_current.json` appears.
- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md), state that STM is written on every UserPromptSubmit and cleared after consolidation on SessionEnd; so outside an active session, seeing only `.gitkeep` in `stm/` is expected.
- **No code change** if verification shows STM write is occurring; otherwise fix the require or the path in user-prompt-unified.

---

#### C4. SessionEnd hook may never fire

**Audit:** SessionEnd is registered in [settings.json](.claude/settings.json) but docs say “Claude Code does not provide a SessionEnd hook event”; persistence model may be broken.

**Review:** If the host (IDE/Claude Code) never emits SessionEnd, then: (1) `unified-reflection-handler` and `reflection-queue-processor` never run on session end, (2) `triggerMaintenance()` never runs, so weekly maintenance and cold storage never run, (3) STM is only consolidated when/if something else triggers consolidation. This is a **platform dependency**.

**Proposed Solution:**

- **Fallback trigger for weekly maintenance:** Add in [user-prompt-unified.cjs](.claude/hooks/routing/user-prompt-unified.cjs) a best-effort block on UserPromptSubmit: read [maintenance-status](.claude/context/memory/maintenance-status.json) (or call `memory-scheduler.getMaintenanceStatus()`); if `lastWeekly` is missing or older than 7 days, invoke weekly maintenance in a **child process** (e.g. `spawnSync(process.execPath, [pathToScheduler, 'weekly'], { cwd, stdio: 'ignore' })`) with a short timeout so the hook stays responsive. Document in [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) that weekly maintenance runs on SessionEnd **or** when overdue on UserPromptSubmit.
- **Documentation:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and [DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md](.claude/docs/DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md), state clearly that SessionEnd is host-dependent; if it does not fire, use manual `pnpm run memory:weekly` and the UserPromptSubmit fallback above.
- **Reflection:** Reflection queue processing and spawn-request writing remain best-effort if SessionEnd does not fire; the existing “reflection-reminder on UserPromptSubmit” still gives the Router a chance to process pending reflections.

---

#### C5. Weekly maintenance never runs

**Audit:** `lastWeekly: null` in maintenance-status; LTM/cold storage/deduplication never run.

**Review:** Direct consequence of C4: weekly maintenance is only triggered from `triggerMaintenance()` in unified-reflection-handler on SessionEnd. If SessionEnd does not fire, weekly never runs.

**Proposed Solution:** Same as C4: **UserPromptSubmit fallback** that checks `lastWeekly` and, when overdue, runs `memory-scheduler.cjs weekly` in a child process. See existing plan section “2. Weekly maintenance” and the Phase 3.3 in the enterprise plan. Implement the fallback in user-prompt-unified and document it.

---

#### C6. searchMemory() and exports / LanceDB dependency

**Audit:** searchMemory() may rely on ContextualMemory/LanceDB; if LanceDB fails, behavior is unclear or degrades.

**Review:** [memory-manager.cjs](.claude/lib/memory/memory-manager.cjs) `searchMemory()` uses ContextualMemory, which uses LanceDB. If LanceDB is unavailable or in mock mode, ContextualMemory falls back to keyword search. The audit concern is that this is “silent” and may return poor results.

**Proposed Solution:**

- **Health check / visibility:** Add a small “memory search health” check (e.g. in memory-health-check or memory-dashboard): detect if LanceDB is in mock mode (expose a getter or env from lancedb-client) and add a **warning** to health output and to dashboard: “Semantic search is in mock mode; results may be poor. Install optional dependencies (e.g. sharp) or configure embedding.”
- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md), state that semantic search depends on LanceDB and optional embedding dependencies; if they are missing, keyword fallback is used and health check will warn.

---

#### C7. LanceDB mock mode silent degradation

**Audit:** When @xenova/transformers (or sharp) fails, lancedb-client switches to mock mode with only a console.warn; users may think semantic search is working.

**Review:** [lancedb-client.cjs](.claude/lib/memory/lancedb-client.cjs) sets `_mockMode = true` and uses a mock embedder; [contextual-memory.cjs](.claude/lib/memory/contextual-memory.cjs) can fall back to keyword search. The issue is **visibility**.

**Proposed Solution:**

- **Expose mock mode:** In lancedb-client, export or expose `isMockMode()` (or a property) so callers can detect mock mode. In ContextualMemory or memory-manager searchMemory(), when falling back to keyword search due to mock or error, append to the result or log once: “Semantic search unavailable; results from keyword fallback.”
- **Health check:** Include “LanceDB mock mode: true/false” (or “embedding: mock | real”) in memory-health-check output and in memory-dashboard so operators see it. Implement as in C6.

---

#### C8. Entity extractor pattern matching too narrow

**Audit:** [entity-extractor.cjs](.claude/lib/memory/entity-extractor.cjs) only recognizes strict patterns (e.g. `### Pattern:`, `## [ADR-NNN]`); most content is not extracted.

**Review:** Extraction is intentionally format-based to avoid noise. Over-relaxing patterns can pollute the entity graph. The audit is valid that coverage is low.

**Proposed Solution:**

- **Extend patterns conservatively:** In entity-extractor, add a small set of **additional** patterns that match common markdown in learnings/decisions/issues (e.g. `## Pattern:`, `### Learning:`, `- **Decision:**`, `## Issue:`), with clear entity types and low risk of false positives. Prefer configurable pattern list (e.g. regex list in a small config or at top of file) so future tuning does not require large edits.
- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and in code comments, document which heading/format patterns are extracted and that learnings.md/decisions.md/issues.md are most effective when using those formats.
- **Optional:** Add a “coverage” metric (e.g. lines matched vs total lines) in dashboard or health for observability.

---

### MODERATE (P1)

#### M9. SyncLayer / BackgroundSyncWorker deprecated but still present

**Audit:** sync-layer.cjs and sync-worker.cjs are @deprecated but still in tree and importable.

**Review:** Already covered in the existing plan and enterprise plan: move to archive and update references.

**Proposed Solution:** As in the enterprise plan Phase 1.1: **Move** [.claude/lib/memory/sync-layer.cjs](.claude/lib/memory/sync-layer.cjs) and [.claude/lib/memory/sync-worker.cjs](.claude/lib/memory/sync-worker.cjs) to `.claude/archive/lib/memory/`. Remove or relocate tests that depend on them; update docs to state sync is **only** via [sync-memory-index.cjs](.claude/hooks/memory/sync-memory-index.cjs).

---

#### M10. Memory health check doesn’t fix issues

**Audit:** Health check only logs warnings; doesn’t trigger maintenance when issues are detected.

**Review:** [memory-health-check.cjs](.claude/hooks/memory/memory-health-check.cjs) already does **auto-remediation** for learnings archival, codebase_map pruning, patterns/gotchas smart-pruning, and MTM summarization when at limit. So some “fixes” are already there. The audit may refer to **maintenance** (e.g. weekly) not being triggered from the health check.

**Proposed Solution:**

- **Clarify in docs:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and in the hook header, list which remediations the health check performs (learnings archive, codebase_map prune, patterns/gotchas prune, MTM summarize). State that **weekly** maintenance (cold storage, dedup, etc.) is triggered by SessionEnd or UserPromptSubmit fallback, not by the health check, to avoid long-running work on every UserPromptSubmit.
- **Optional:** If desired, add a single “if overdue, enqueue or spawn weekly maintenance” from health check (e.g. same child-process pattern as UserPromptSubmit fallback), with a rate limit (e.g. at most once per 24h) to avoid duplicate runs.

---

#### M11. Access tracking rate limiting may cause stale data

**Audit:** Access counts updated at most every 5 minutes; quality scoring may be inaccurate in fast sessions.

**Review:** Throttling avoids excessive writes on every load. Trade-off is acceptable for “utility” scoring; we can make the interval configurable and document it.

**Proposed Solution:**

- **Configurable interval:** Keep `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS` (default 5 min); document in [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and in memory-manager that access tracking is throttled and that quality scores may lag by up to this interval.
- **Optional:** Reduce default to 1–2 minutes if profiling shows writes are cheap; otherwise leave default and document.

---

#### M12. Reflection queue never processed

**Audit:** reflection-queue.jsonl and spawn request file exist but no agent actually processes the queue.

**Review:** By design, the “processor” is the **Router**: reflection-queue-processor writes reflection-spawn-request.json and user-prompt-unified writes reflection-reminder.txt; the Router is instructed to read the reminder and spawn reflection-agent. So “processed” means “Router spawns reflection-agent when reminder exists.” There is no separate daemon that processes the queue.

**Proposed Solution:**

- **Strengthen Router contract:** As in existing plan and enterprise plan Phase 3.1: In [CLAUDE.md](.claude/CLAUDE.md), add an explicit **Step 0** (or equivalent) before TaskList: “If `.claude/context/runtime/reflection-reminder.txt` exists, Read reflection-spawn-request.json and spawn reflection-agent for each request (or first batch); then delete the reminder and clear the spawn request file.” Document in [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) that reflection is reminder-driven and the Router is the consumer.
- **No new agent or daemon** unless product explicitly requires background processing; then it would be a separate design (e.g. CLI or scheduled job that reads the queue and invokes an agent).

---

#### M13. Cold storage never used

**Audit:** archiveOldLTM only runs from weekly maintenance, which never runs; no cold/ directory.

**Review:** Same root cause as C5: weekly maintenance never runs because SessionEnd may not fire.

**Proposed Solution:** Same as C4/C5: **UserPromptSubmit fallback** for weekly maintenance so `archiveOldLTM` runs when overdue. Once weekly runs (SessionEnd or fallback), cold storage will be created and used. Document cold storage path and that it is populated by weekly maintenance.

---

#### M14. Duplicate session storage paths (legacy / MTM / STM)

**Audit:** Sessions can live in sessions/, mtm/, stm/; loadMemoryForContext tries MTM then legacy; “split-brain.”

**Review:** loadMemoryForContext already reads MTM first, then LTM summaries, then legacy sessions/. The “duplicate” is legacy; we do not write to sessions/ anymore. Migration of legacy files to MTM is optional and can be a one-time script.

**Proposed Solution:**

- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md), state that canonical session storage is MTM (and STM for current session); legacy sessions/ is read-only fallback and will not be written to. Optionally add a one-time migration script (e.g. `node .claude/tools/cli/migrate-legacy-sessions-to-mtm.cjs`) that moves legacy session_*.json into mtm/ with the expected format and then optionally renames or removes the legacy files; run manually.
- **No change** to loadMemoryForContext order (MTM → LTM → legacy).

---

#### M15. ML integration best-effort only

**Audit:** unified-reflection-handler requires ML index in try/catch; fails silently.

**Review:** Graceful degradation is intentional so the hook works without ML. The issue is that ML is “advertised” but may be off without clear visibility.

**Proposed Solution:**

- **Visibility:** In unified-reflection-handler, when ML is not available, set a debug or audit log once per run (e.g. “ML index not available; skipping triggerMLSessionEnd”). Optionally add a flag in reflection output or in a small “capabilities” file (e.g. `.claude/context/runtime/capabilities.json`) like `{ "ml": false }` so other tools can detect ML status.
- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) or ML docs, state that ML integration is optional and that reflection works without it.

---

#### M16. Embedding generation only on SessionEnd

**Audit:** triggerEmbeddingGeneration() only runs on SessionEnd; index can become stale.

**Review:** If SessionEnd rarely fires, new memory content is not embedded. Embedding on every PostToolUse(Edit|Write) for memory files would be expensive; a middle ground is to trigger embedding when memory-health-check or sync-memory-index runs (e.g. after editing learnings/decisions/issues).

**Proposed Solution:**

- **Optional trigger on memory file edit:** In [sync-memory-index.cjs](.claude/hooks/memory/sync-memory-index.cjs) or in a separate PostToolUse(Edit|Write) hook, after syncing core memory markdown to SQLite, call a **best-effort** “enqueue embedding for this file” (e.g. push path to a small queue file or call a non-blocking helper that runs embedding in the background or in a child process with a short timeout). Reuse the same embedding logic as unified-reflection-handler to avoid duplication.
- **Document:** State that embeddings are updated on SessionEnd and optionally when core memory files are edited; if SessionEnd does not fire, run manual `pnpm run memory:weekly` or rely on the optional edit-time trigger.

---

#### M17. Router state not persisted across sessions

**Audit:** router-state is file-based; may not survive IDE restarts.

**Review:** File-based state is the intended design; “sessions” here likely means IDE restarts or new Claude Code sessions. State will be lost if the file is deleted or the host does not preserve the project directory. We can make behavior robust to missing state (e.g. reset to router mode on missing file).

**Proposed Solution:**

- **Defensive read:** In [router-state.cjs](.claude/hooks/routing/router-state.cjs), treat missing or unreadable state file as “fresh router mode” (e.g. return default state and optionally reset taskListCalledSincePrompt). Document that state is best-effort and may reset on IDE/project restart.
- **No change** to persistence mechanism unless the product requires cross-restart persistence (e.g. external store); that would be a separate feature.

---

#### M18. Memory dashboard CLI not wired to hooks

**Audit:** Dashboard is CLI-only; no automatic dashboard generation or alerting.

**Review:** The **lib** [memory-dashboard.cjs](.claude/lib/memory/memory-dashboard.cjs) is used by memory-health-check for Phase 4 metrics (collectMetrics, saveMetrics, cleanupOldMetrics). The **CLI** [memory-dashboard.cjs](.claude/tools/cli/memory-dashboard.cjs) is a separate tool for human inspection. So “dashboard” in hooks = metrics collection, not the CLI.

**Proposed Solution:**

- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md), clarify: “Dashboard” in the context of hooks means metrics collection (Phase 4 of memory-health-check); the “Memory Stats Dashboard” CLI is for manual inspection and is not invoked by hooks. Add a script in package.json if missing: e.g. `"memory:dashboard": "node .claude/tools/cli/memory-dashboard.cjs"` for the CLI.
- **Optional:** Add a scheduled or UserPromptSubmit-based “daily snapshot” that runs the lib dashboard’s summary and appends to a file (e.g. `metrics/daily-summary.jsonl`) for trend analysis; keep it optional to avoid hook latency.

---

#### M19. Codebase map TTL pruning never runs

**Audit:** pruneCodebaseMap() is only called from weekly maintenance, which never runs.

**Review:** Same as C5/M13: weekly maintenance is the only trigger. Codebase_map is also pruned by memory-health-check when `codebaseMapEntries > CONFIG.CODEBASE_MAP_MAX_ENTRIES` (see memory-health-check auto-remediation). So pruning **can** run from health check; the audit may be referring only to “TTL” or time-based pruning. If there is a separate TTL prune that only weekly runs, then fixing weekly (C4/C5) fixes this.

**Proposed Solution:**

- **Verify:** Confirm memory-health-check calls pruneCodebaseMap when over threshold; if yes, document that codebase_map is pruned by health check (count-based) and optionally by weekly (if TTL exists). If TTL pruning only lives in weekly, add the same “overdue weekly” fallback (C4/C5) so it runs.
- **No new hook** for codebase_map alone; rely on health check + weekly.

---

#### M20. EntityQuery validates schema but doesn’t auto-initialize

**Audit:** EntityQuery throws if tables are missing; EntityExtractor auto-initializes; inconsistent.

**Review:** EntityExtractor is used by sync-memory-index (writes); EntityQuery is used by ContextualMemory and others (reads). Auto-init in the query path could hide misconfiguration (e.g. wrong DB path). So “validate and throw with clear message” is reasonable for the read path; sync-memory-index already calls ensureEntityDbInitialized before creating EntityExtractor.

**Proposed Solution:**

- **Document:** In [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and in entity-query.cjs, state that EntityQuery does **not** auto-initialize; run `pnpm run memory:init` or ensure sync-memory-index has run (which ensures schema). Optionally in EntityQuery constructor, if schema is missing and dbPath is the default memory.db, **once** log “Run pnpm run memory:init” and then throw (no silent auto-init).
- **Optional:** Add a lightweight “ensureSchema” helper used by both EntityExtractor and EntityQuery (e.g. in init-memory-db or a small shared module) so schema creation is in one place; EntityQuery would call it in constructor when tables are missing and path is default, then re-validate. Prefer documenting over auto-init in the query path to keep read path predictable.

---

### MINOR (P2)

#### N21. README outdated

**Proposed Solution:** Update root [README.md](README.md) (or [GETTING_STARTED.md](GETTING_STARTED.md)) with a short “Memory system” subsection: tiered memory (STM/MTM/LTM), LanceDB for semantic search, SyncLayer deprecated and sync via sync-memory-index, and link to [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md).

---

#### N22. Inconsistent timestamp formats

**Proposed Solution:** Prefer ISO 8601 everywhere. In memory-tiers and any code that writes timestamps, use `new Date().toISOString()` or a single shared helper (e.g. `timestampISO()`). For filenames that use timestamps (e.g. MTM session_YYYY-MM-DDTHH-MM-SS.json), document the format in MEMORY_SYSTEM.md and keep it consistent.

---

#### N23. Magic numbers in configuration

**Proposed Solution:** Centralize in [memory-retention-config.cjs](.claude/lib/memory/memory-retention-config.cjs) or [memory-manager.cjs](.claude/lib/memory/memory-manager.cjs) CONFIG: e.g. max sessions, max summaries, access tracking interval, codebase_map max entries. Document env overrides in MEMORY_SYSTEM.md and in code comments.

---

#### N24. Missing type definitions

**Proposed Solution:** Add JSDoc `@param` and `@returns` for public APIs (memory-manager, memory-tiers, contextual-memory, entity-query, entity-extractor). Optional: add a `.d.ts` or use TypeScript in a later phase; JSDoc is the minimal fix.

---

#### N25. Test coverage gaps

**Proposed Solution:** Add unit tests for: loadMemoryForContext (sync and async), consolidateSession when STM is empty, runConsolidation success when “No STM session found,” and memory-health-check Phase 4 when dashboard load fails. Prefer targeting the critical paths identified in this audit.

---

#### N26. Deprecated saveSession still exported

**Proposed Solution:** After changing saveSession to a no-op (C1), keep it exported but mark in JSDoc as `@deprecated` and document in MEMORY_SYSTEM.md. In a future major version, remove from exports or leave as no-op for backward compatibility.

---

#### N27. Inconsistent error handling

**Proposed Solution:** Document in a short “Error handling” section in MEMORY_SYSTEM.md or in code: (1) which APIs throw (e.g. EntityQuery on missing schema), (2) which return `{ success: false }` (e.g. consolidateSession), (3) which fail silently with log (e.g. optional embedding). Align new code with this convention; refactor existing code only where it causes bugs or confusion.

---

#### N28. Memory protocol documentation drift

**Proposed Solution:** After implementing the fixes above, do a single pass over [MEMORY_SYSTEM.md](.claude/docs/MEMORY_SYSTEM.md) and [DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md](.claude/docs/DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md): ensure every described path (STM write, consolidation, weekly trigger, reflection reminder, loadMemoryForContext order, sync-memory-index, health check remediations, LanceDB/mock, saveSession deprecation) matches the code and add a “Last verified” date or version in the doc.

---

## Part B: Priority and Implementation Order

| Priority | Items | Action |
|----------|--------|--------|
| **P0** | C1–C8 | saveSession no-op (C1); consolidation success when no STM (C2); verify STM write (C3); UserPromptSubmit weekly fallback (C4, C5); LanceDB health/warning (C6, C7); entity pattern extension (C8). |
| **P1** | M9–M20 | Archive SyncLayer/SyncWorker (M9); document health-check remediations (M10); access tracking doc/config (M11); reflection Step 0 in CLAUDE.md (M12); cold storage via weekly fallback (M13); legacy session doc/migration script (M14); ML/embedding visibility and optional edit-time embedding (M15, M16); router-state defensive read (M17); dashboard vs CLI doc (M18); codebase_map and EntityQuery doc (M19, M20). |
| **P2** | N21–N28 | README, timestamps, config, JSDoc, tests, saveSession export note, error-handling doc, MEMORY_SYSTEM pass (N21–N28). |

---

## Part C: Mapping to Existing Plan

- **Reflection spawn (reminder + Router Step 0):** Existing plan §1; audit M12. Implement §1.1 and §1.2 and CLAUDE.md Step 0.
- **Weekly maintenance (SessionEnd + fallback):** Existing plan §2; audit C4, C5, M13. Implement §2.1–§2.2 and UserPromptSubmit fallback in user-prompt-unified.
- **SyncLayer/SyncWorker deprecation:** Existing plan §3; audit M9. Implement archive and reference updates.
- **saveSession:** Not “remove” but “no-op + deprecation” (C1); keep fallback in unified-reflection-handler safe.
- **Consolidation “success” when no STM:** New (C2); add in memory-scheduler runConsolidation.
- **LanceDB mock visibility:** New (C6, C7); add to health check and optional dashboard.
- **Entity extractor patterns:** New (C8); extend patterns conservatively in entity-extractor.
- **TaskList-first enforcement:** Enterprise plan Phase 3.2; add router-state taskListCalledSincePrompt and PreToolUse(Task) check.
- **Dashboard/metrics hardening:** Enterprise plan Phase 2; add try/catch and optional fallback write in memory-health-check.

---

## Part D: Success Criteria (Updated)

1. **saveSession** is a no-op with deprecation warning; no caller throws.
2. **Consolidation** is reported success when there is no STM to consolidate; maintenance-status.json does not show false failure.
3. **STM** is written on every UserPromptSubmit (verified); docs state STM is cleared after consolidation.
4. **Weekly maintenance** runs via SessionEnd or UserPromptSubmit fallback when overdue; cold storage and LTM archival run.
5. **LanceDB mock mode** is visible in health check and/or dashboard; docs state semantic search dependency.
6. **Entity extraction** covers additional common markdown patterns; docs list supported formats.
7. **Reflection** has a mandatory Step 0 in CLAUDE.md; MEMORY_SYSTEM states reflection is reminder-driven.
8. **SyncLayer/SyncWorker** are archived; only sync-memory-index is canonical.
9. **Documentation** (MEMORY_SYSTEM, DEEP_DIVE_AUDIT, README) matches implementation and lists last-verified version/date.
10. **Tests** cover critical paths (loadMemoryForContext, consolidation, health-check Phase 4, optional EntityQuery/schema).

---

**End of comprehensive audit fix plan.**
