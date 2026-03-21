<!-- Agent: researcher | Task: #23 | Session: 2026-03-08 -->

# Research Report: Google Always-On Memory Agent

**Date**: 2026-03-08
**Researcher**: researcher agent
**Task**: #23
**Batch/Phase**: Phase 1 of 1
**Sources Consulted**: 4

---

## Executive Summary

Google's always-on-memory-agent (from `GoogleCloudPlatform/generative-ai`) is a lightweight, continuously-running memory system built on SQLite, using three specialized LLM agents (ingest, consolidate, query) to extract, synthesize, and retrieve structured knowledge from multimodal inputs. The most valuable innovations for agent-studio are: (1) explicit importance scoring during extraction, (2) a periodic consolidation pass that generates cross-memory insights (analogous to sleep consolidation), (3) a structured `connections` field linking related memories, and (4) a `consolidated` flag that enables differential processing. These map cleanly onto agent-studio's existing STM/MTM/LTM tiers but fill specific gaps — particularly around cross-session insight generation and importance-aware retrieval ranking. The system deliberately avoids vector databases; agent-studio already has LanceDB, giving us a significant retrieval advantage we should preserve.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | GitHub directory listing | https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/agents/always-on-memory-agent | 6 files listed |
| 2 | README full content | https://raw.githubusercontent.com/GoogleCloudPlatform/generative-ai/main/gemini/agents/always-on-memory-agent/README.md | Full README extracted |
| 3 | agent.py full source | https://raw.githubusercontent.com/GoogleCloudPlatform/generative-ai/main/gemini/agents/always-on-memory-agent/agent.py | Full schema + implementation details |
| 4 | Internal codebase review | `.claude/lib/memory/` directory | 50 files examined |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | Google always-on-memory-agent README | GitHub documentation | https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/agents/always-on-memory-agent | 2026-03-08 |
| 2 | agent.py source code | Python source | https://raw.githubusercontent.com/.../agent.py | 2026-03-08 |
| 3 | memory-extractor.cjs | Internal code | `.claude/lib/memory/memory-extractor.cjs` | 2026-03-08 |
| 4 | memory-tiers.cjs, contextual-memory.cjs, memory-tiers-ltm-helpers.cjs | Internal code | `.claude/lib/memory/` | 2026-03-08 |

---

## Detailed Findings

### Topic 1: Google's Memory Extraction Approach

**Key Insights:**

- The `ingest_agent` uses a single LLM call to convert raw content into a structured memory record with: `summary` (1-2 sentences), `entities` (JSON array of named entities: people, companies, products, concepts, locations), `topics` (2-4 topic tags), and `importance` (float 0.0-1.0)
- The `raw_text` field is preserved alongside the `summary`, enabling future re-analysis without data loss
- Extraction supports multimodal inputs (text, images, audio, video, PDFs) via Gemini's native capabilities — 27 file formats total
- A `source` field tracks where the memory came from (filename or API origin), enabling provenance tracing

**Evidence:**
Google's `store_memory()` inserts records with these fields: `raw_text`, `summary`, `entities`, `topics`, `importance`, `source`, `created_at`, `consolidated`. The `ingest_agent` prompt instructs the LLM to analyze content and call `store_memory()` with structured output.

**Relevance to Our Framework:**
Agent-studio's `memory-extractor.cjs` already extracts from `TaskUpdate(completed)` metadata but does NOT produce: (a) named entity arrays, (b) explicit topic tags, (c) importance scores. The extractor uses a category system (patterns/gotchas/decisions/issues) but lacks cross-cutting topic indexing. Adding entity extraction and importance scoring would dramatically improve our BM25/LanceDB retrieval relevance without architectural surgery.

---

### Topic 2: Storage Schema and Structured Memory Records

**Key Insights:**

- Google uses two tables: `memories` (individual records) and `consolidations` (synthesized insights spanning multiple memories)
- The `consolidated` boolean flag on each memory record enables efficient differential processing — consolidation only operates on records where `consolidated = 0`
- The `connections` field (JSON array) on each memory record is populated AFTER consolidation, storing IDs and relationship descriptions of linked memories
- A `processed_files` table prevents re-processing the same source file
- Google stores both `raw_text` and `summary` — preserving original content for future re-analysis

**Evidence:**
SQLite schema has: `memories(id, source, raw_text, summary, entities, topics, connections, importance, created_at, consolidated)` and `consolidations(id, source_ids, summary, insight, created_at)`.

**Relevance to Our Framework:**
Agent-studio's STM uses `session_current.json`, MTM uses `session_*.json`, LTM uses `summary_*.json`. We have NO equivalent of the `consolidated` flag — once a memory is written, it is never reprocessed. The `connections` concept doesn't exist in our system. Our `patterns.json` / `gotchas.json` are flat arrays with no cross-linkage. Adding a `consolidated` processing flag to our STM/MTM records would enable a targeted consolidation pass without full reprocessing.

---

### Topic 3: Memory Consolidation — The "Sleep Phase" Pattern

**Key Insights:**

- Google runs a `consolidation_loop()` on a configurable timer (default 30 minutes) as a background process
- The `consolidate_agent` retrieves only UNCONSOLIDATED memories (`consolidated = 0`), identifies cross-cutting patterns, generates a synthesized `summary` and a single key `insight`, stores the result in the `consolidations` table with `source_ids`, then marks source records `consolidated = 1`
- This is explicitly modeled after biological sleep consolidation — binding episodic memories into semantic knowledge
- The consolidation produces both a `summary` (factual synthesis) and an `insight` (the discovered pattern/connection), which are stored separately for different use cases

**Evidence:**
The `consolidation_loop()` function: checks for unconsolidated memories, skips if count < 2, calls `consolidate_agent` with `read_unconsolidated_memories()`, stores output via `store_consolidation()`, updates source records with `connections` and `consolidated = 1`.

**Relevance to Our Framework:**
Agent-studio currently has NO cross-session insight generation. Our LTM summarizer (`memory-tiers-ltm-helpers.cjs`) generates session summaries via `generateSessionSummary()` but produces a single-session distillation, not cross-session connection discovery. Our `memory-scheduler.cjs` could host a consolidation task. The critical missing piece is a pass that takes multiple recent STM/MTM sessions and discovers what CONNECTS them — this is exactly what Google's `consolidate_agent` does. Implementation would require: (a) a `consolidated` flag on STM/MTM JSON records, (b) a new `generateCrossSessionInsights()` function in `memory-tiers-ltm-helpers.cjs`, (c) a scheduled task in `memory-scheduler.cjs`.

---

### Topic 4: Retrieval and Query Architecture

**Key Insights:**

- Google's `query_agent` retrieves up to 50 most recent memories PLUS up to 10 consolidation summaries, then uses the LLM to synthesize an answer — no vector search or ranking by importance
- Retrieval ordering is ONLY by `created_at DESC` (recency) — the importance field extracted during ingest is NOT used for ranking. This is a significant gap in Google's implementation.
- Source citations are included in query responses as `[Memory N]` references, enabling traceability
- The query agent reads both `memories` AND `consolidations` — combining episodic (raw events) with semantic (synthesized insights)

**Evidence:**
`read_all_memories()` orders by `created_at DESC LIMIT 50`. `read_consolidation_history()` retrieves last 10 consolidations. The `query_agent` receives both and synthesizes using only in-context LLM reasoning.

**Relevance to Our Framework:**
Agent-studio already has hybrid retrieval (BM25 + LanceDB vector search via `contextual-memory.cjs`) which is dramatically superior to Google's recency-only approach. We should preserve this. However, we are NOT currently feeding consolidation insights into our retrieval path — only raw memories and markdown files. Adding consolidation results to the retrieval input would improve answer quality without changing the retrieval mechanism. The `incrementLTMAccessCount()` in `contextual-memory.cjs` already tracks access patterns, but the importance score from extraction is not used for ranking.

---

### Topic 5: Importance Scoring and Relevance Ranking

**Key Insights:**

- Google extracts an explicit `importance` score (0.0-1.0) for each memory during ingest — based on LLM judgment about the content's significance
- However, this score is NOT used in retrieval — it is stored but never queried against during `read_all_memories()`
- The score is visible in the dashboard but functions more as a human-readable signal than a machine-usable ranking signal
- This represents an unfinished feature — importance scoring without importance-weighted retrieval is a missed opportunity

**Evidence:**
The `importance REAL` field exists in the schema and is populated by `ingest_agent`. `read_all_memories()` uses `ORDER BY created_at DESC` with no importance weighting.

**Relevance to Our Framework:**
Agent-studio should implement importance scoring PROPERLY — at extraction time AND at retrieval time. Our `memory-extractor.cjs` currently does not score importance. Our `smart-pruner.cjs` and LTM eviction use `accessCount + time decay` for utility scoring, which is access-based but not content-based. Adding importance scoring to `memory-extractor.cjs` output, then incorporating it as a ranking signal in `contextual-memory.cjs`'s hybrid search (alongside BM25 and vector similarity) would yield a three-factor ranking: relevance + recency + importance.

---

### Topic 6: Memory Overflow and Pruning

**Key Insights:**

- Google has NO automatic pruning — the SQLite database grows indefinitely
- The only safeguards are soft limits: retrieve max 50 memories per query, max 20MB per ingested file, max 10 unconsolidated memories per consolidation pass
- A manual `clear_all_memories()` function exists for full reset, but no eviction policy removes old records
- This is explicitly a limitation of the system — acceptable for a demo but not for production multi-session agents

**Evidence:**
No `DELETE` statements in the codebase except in `clear_all_memories()`. No TTL, no capacity limit, no eviction.

**Relevance to Our Framework:**
Agent-studio already has a more sophisticated eviction system: `smart-pruner.cjs` implements cap-based eviction with utility scoring (accessCount + time decay), and `memory-rotator.cjs` handles file-size-based rotation. Our system is SUPERIOR here — no adoption needed. However, the cap-based approach should incorporate importance scores (from extraction) to preferentially evict low-importance memories over high-importance ones.

---

### Topic 7: Cross-Session Continuity Patterns

**Key Insights:**

- Google achieves cross-session continuity via SQLite persistence — memories survive process restarts by design
- The `processed_files` table prevents duplicate ingestion of the same source files on restart
- No session boundary concept exists — all memories are in a single flat timeline
- Background loops (`file_watcher_loop`, `consolidation_loop`) auto-resume on startup

**Evidence:**
SQLite initialization on startup: `conn.execute("CREATE TABLE IF NOT EXISTS memories...")`. File watcher and consolidation loop start unconditionally in `main()`.

**Relevance to Our Framework:**
Agent-studio uses JSON files per session (STM/MTM) with explicit session promotion. The session boundary concept is a strength — it enables session-scoped context injection. The equivalent of Google's "no duplicates" protection is our `memory-deduplicator.cjs`. Google's file watcher pattern for inbox ingestion could be valuable: agent-studio could watch `.claude/context/tmp/` for files written by agents and auto-ingest them into memory, rather than relying solely on `TaskUpdate(completed)` metadata extraction.

---

### Topic 8: LLM Call Architecture

**Key Insights:**

- Google uses 4 specialized LLM agents: orchestrator (routing), ingest (extraction), consolidate (synthesis), query (retrieval+synthesis)
- ALL calls use the same model (Gemini Flash Lite for cost efficiency)
- Each agent has a single, focused system prompt — minimal complexity per call
- The `consolidate_agent` is the most sophisticated, receiving multiple memories and producing relational synthesis
- Average token cost per memory: ~200-500 tokens for ingest, ~1000-3000 tokens for consolidation (depends on memory count)

**Evidence:**
`agent.py` creates 4 `Agent` instances with ADK. Each has a focused `description` field and specific tools.

**Relevance to Our Framework:**
Agent-studio's `memory-extractor.cjs` uses `ModelClient` for extraction — equivalent to Google's `ingest_agent`. We have NO equivalent of the `consolidate_agent`. Adding cross-session consolidation would require one new LLM call per consolidation cycle — acceptable cost given the quality improvement. The `query_agent` is irrelevant for us since we use spawn-prompt injection rather than a query endpoint. The orchestrator pattern is already our router pattern.

---

## Academic References

*(No directly relevant arXiv papers found for this implementation-focused research. The memory consolidation metaphor traces to neuroscience literature on hippocampal-neocortical transfer during sleep, but the implementation does not cite academic sources.)*

---

## Practical Recommendations

### P0 (Immediate — High Impact, Low Risk)

**P0-1: Add Importance Scoring to Memory Extraction**

- **What**: Extend `memory-extractor.cjs` to produce an `importance` float (0.0-1.0) alongside each extracted memory. The existing LLM prompt for extraction can be amended to include importance scoring.
- **Files to change**: `.claude/lib/memory/memory-extractor.cjs`, `.claude/lib/memory/prompts/memory-extraction.cjs`
- **Schema change**: Add `importance` field to extracted memory records stored in STM/MTM JSON files
- **Why P0**: Enables P0-2 (ranking) and P1-1 (eviction improvement) — foundational for multiple improvements
- **Risk**: Low — additive change, existing consumers ignore unknown fields

**P0-2: Incorporate Importance Score into Retrieval Ranking**

- **What**: In `contextual-memory.cjs`, include importance score as a ranking signal alongside BM25 and vector similarity. Current ranking: `BM25 * w1 + vector * w2`. Target: `BM25 * w1 + vector * w2 + importance * w3`
- **Files to change**: `.claude/lib/memory/contextual-memory.cjs`, `contextual-memory-context-loader.cjs`
- **Why P0**: Immediately improves retrieval quality for high-signal memories (architecture decisions, critical bugs) over noise
- **Risk**: Low — additive weight term, tunable via env var

---

### P1 (Next Sprint — Medium Impact, Medium Effort)

**P1-1: Add `consolidated` Flag to STM/MTM Records**

- **What**: Add a `consolidated: false` boolean to each memory record written to STM/MTM. Create a new `getUnconsolidatedMemories()` function in `memory-manager.cjs`.
- **Files to change**: `memory-extractor.cjs`, `memory-manager.cjs`, `memory-tiers.cjs`
- **Why P1**: Prerequisite for P1-2 (consolidation pass) — enables differential processing without full reprocessing
- **Risk**: Low — additive schema field

**P1-2: Implement Cross-Session Consolidation Pass**

- **What**: Add a `generateCrossSessionInsights()` function to `memory-tiers-ltm-helpers.cjs`. This function reads N most recent unconsolidated STM/MTM memories, makes one LLM call to identify cross-cutting patterns and connections, stores the result as a new LTM summary with `type: "consolidation"`, and marks source records as `consolidated: true`.
- **Files to change**: `memory-tiers-ltm-helpers.cjs`, `memory-scheduler.cjs` (add scheduled task), `memory-manager.cjs`
- **Why P1**: Fills the biggest gap vs Google's system — we currently never synthesize ACROSS sessions to discover emergent patterns
- **Risk**: Medium — requires new LLM call, needs cost guardrails (consolidate only when N >= 5 unconsolidated memories)
- **Adapt from Google**: Google's consolidation is per-memory; ours should be per-session-batch to reduce LLM call frequency

**P1-3: Add `connections` Field to Memory Records**

- **What**: During consolidation (P1-2), populate a `connections` array on source memory records listing IDs of related memories and relationship descriptions. Store these back to the source records.
- **Files to change**: `memory-tiers.cjs`, `memory-tiers-ltm-helpers.cjs`
- **Why P1**: Enables graph-style traversal — when a memory is retrieved, its connected memories can be co-retrieved for richer context
- **Risk**: Low — additive field, populated post-consolidation

---

### P2 (Future — Lower Priority)

**P2-1: Entity Extraction at Memory Ingest Time**

- **What**: Extract named entities (people, files, agents, components, decisions) from each memory during extraction and store as a `entities` JSON array
- **Files to change**: `memory-extractor.cjs`, `entity-extractor.cjs` (already exists — check if reusable), prompts
- **Why P2**: Enables entity-based retrieval ("find all memories mentioning routing-guard.cjs") without full text search — note `entity-extractor.cjs` already exists in our memory lib
- **Risk**: Low — entity extraction already has infrastructure

**P2-2: Topic Tagging for Cross-Domain Search**

- **What**: Add 2-4 topic tags per memory during extraction (e.g., `["routing", "hooks", "security"]`). Store in memory records. Enable tag-based retrieval in `contextual-memory.cjs`.
- **Files to change**: `memory-extractor.cjs`, `contextual-memory.cjs`
- **Why P2**: Complements BM25/vector search for faceted retrieval — "show all memories tagged 'devops'"
- **Risk**: Low — additive

**P2-3: Inbox File Watcher for Auto-Ingestion**

- **What**: Watch `.claude/context/tmp/` for new files written by agents. Auto-ingest into memory (extract summary, entities, importance, topics) without requiring `TaskUpdate(completed)` metadata.
- **Files to change**: New `memory-inbox-watcher.cjs`, `memory-scheduler.cjs`
- **Why P2**: Captures agent work that doesn't flow through TaskUpdate (e.g., research reports, plans)
- **Risk**: Medium — background file watcher on Windows needs careful implementation (chokidar or fs.watch)

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Consolidation LLM calls increase cost | Medium | High | Rate-limit: consolidate only when N >= 5 unconsolidated memories; schedule during idle periods |
| Importance scoring introduces LLM bias | Low | Medium | Use 0.0-1.0 float with configurable weight; allow env var override to disable importance weighting |
| Schema changes break existing memory readers | Medium | Low | Additive changes only; existing code ignores unknown JSON fields in memory records |
| Cross-session consolidation introduces latency | Low | Medium | Run as async background task in `memory-scheduler.cjs`; never block spawn-prompt assembly |
| File watcher on Windows EBUSY / locking | High | Medium | Use polling mode fallback; wrap in try/catch; same pattern as existing SQLite memory.db issues |
| Entity extraction LLM prompt engineering | Low | Medium | Reuse existing `entity-extractor.cjs` infrastructure |

---

## What We Should NOT Adopt

1. **SQLite as primary memory store**: Google uses SQLite because it lacks vector search. Agent-studio has LanceDB + BM25, which is far superior for semantic retrieval. Do NOT replace our hybrid search with SQLite.

2. **Recency-only retrieval (ORDER BY created_at DESC)**: Google's retrieval is simple but low quality. Our hybrid BM25 + vector approach is better — preserve it.

3. **Manual-clear-only pruning**: We already have `smart-pruner.cjs` with utility-based eviction. Google's no-pruning approach is a demo limitation, not a feature.

4. **Single flat memory timeline**: Google has no session boundaries. Agent-studio's STM/MTM/LTM tier promotion enables session-scoped context injection, which is architecturally better for multi-agent workflows.

5. **Gemini-specific multimodal ingestion**: The 27-format multimodal support requires Gemini's native capabilities. Agent-studio targets Claude — multimodal extraction would need a different approach. Not worth adapting unless we add file ingestion as a feature.

6. **ADK framework dependency**: Google's `Agent` class is ADK-specific. Our multi-agent framework already handles agent spawning via `Task()` tool — no ADK needed.

---

## Gemini-to-Claude Adaptation Notes

| Google (Gemini) Approach | Agent-Studio (Claude) Adaptation |
|--------------------------|----------------------------------|
| Gemini Flash Lite for all extraction | Claude Haiku for extraction/consolidation (cost-efficient, same reasoning quality) |
| Single monolithic memory query endpoint | Spawn-prompt injection via `spawn-prompt-assembler.cjs` (already our approach) |
| ADK `Agent` orchestration class | `Task()` tool spawning via router (already our approach) |
| File watcher ingestion via `./inbox/` | Watch `.claude/context/tmp/` or hook into `TaskUpdate(completed)` |
| Gemini multimodal (images, audio, video) | Text-only initially (Claude supports multimodal but not relevant for code memories) |
| Background loops via async Python | Scheduled tasks via `memory-scheduler.cjs` (already exists) |

---

## Implementation Roadmap

### Immediate (This Week)
1. Add importance scoring field to `memory-extractor.cjs` output schema
2. Incorporate importance into `contextual-memory.cjs` ranking formula (as configurable weight)

### Next Sprint
3. Add `consolidated` flag to STM/MTM memory records
4. Implement `generateCrossSessionInsights()` in `memory-tiers-ltm-helpers.cjs`
5. Add consolidation task to `memory-scheduler.cjs` (run when >= 5 unconsolidated memories)
6. Add `connections` field population during consolidation

### Future
7. Entity extraction integration (reuse `entity-extractor.cjs`)
8. Topic tagging for faceted retrieval
9. Inbox file watcher for auto-ingestion

---

## Key Takeaway

Google's system is simpler than agent-studio's in retrieval (no vector search) but more sophisticated in one dimension: **cross-memory synthesis**. The consolidation pass that generates `connections` and cross-cutting `insights` from multiple memories is the single most valuable pattern to adopt. Everything else is either already done better in agent-studio, or is a Gemini-specific capability that doesn't translate to Claude/Node.js.

The consolidation pattern maps directly to our existing `memory-scheduler.cjs` + `memory-tiers-ltm-helpers.cjs` infrastructure. The main addition needed is: (a) a `consolidated` flag on memory records, (b) a new LLM call that synthesizes across sessions, and (c) a scheduled trigger for when to run it.
