<!-- Agent: technical-writer | Task: memory-rag-deep-dive | Session: 2026-02-15 -->

# Memory & RAG Evidence Injection Pipeline — Deep Dive Analysis

**Report Date:** 2026-02-15
**Author:** Technical Writer Agent
**Purpose:** Document complete memory and RAG evidence injection paths for subagent spawn prompts

---

## Executive Summary

This report provides a comprehensive analysis of how memory context and RAG (Retrieval-Augmented Generation) evidence flows into spawned subagent prompts within the Agent Studio framework. The injection system operates as a PreToolUse hook on `Task` calls, intercepting every agent spawn to enrich prompts with relevant historical context, structured memory, and task-specific evidence.

**Key Findings:**

- **Two-tier injection model:** Tier A (default, always applied) and Tier B (conditional, expensive operations)
- **Multiple data sources:** SQLite entity DB, JSON memory files, session tiers (STM/MTM/LTM), LanceDB vectors
- **Token budget controls:** Strict character limits and section caps to prevent context overflow
- **10 critical gaps identified:** Including missing modules, duplicate loading, aggressive truncation, and redundant search paths

**Critical Gaps:**

1. Missing `session-context-for-search.cjs` module (HIGH severity)
2. Duplicate behaviour loading (MEDIUM severity)
3. Aggressive memory section caps (MEDIUM severity)
4. STM (current session) never injected (MEDIUM severity)

---

## 1. Pipeline Architecture Overview

### 1.1 Entry Chain

The spawn prompt assembly pipeline is a PreToolUse hook that intercepts every `Task` tool invocation. The module dependency chain is:

```
spawn-prompt-assembler.cjs (entrypoint shim)
  ↓
spawn-prompt-assembler.helpers.cjs (re-exports runtime)
  ↓
spawn-prompt-assembler.runtime.cjs (main orchestrator)
  ↓
  ├── spawn-prompt-assembler.core.cjs (utilities, caching, env checks)
  ├── spawn-prompt-assembler.task-tools.cjs (task ID, constitution, model)
  ├── spawn-prompt-assembler.memory.cjs (semantic memory, entity graph, query memories)
  └── spawn-prompt-assembler.runtime-support.cjs (model resolution, preset loading)
```

### 1.2 Assembly Sequence

The `runtime.cjs::main()` function executes the following sequence for every spawned agent:

1. **parseHookInputAsync()** — Parse hook JSON from stdin
2. **prepareTaskSpawnContext()** — Validate Task tool input, ensure task ID, sanitize prompt, add warning box prefix
3. **deriveSpawnContext()** — Resolve agent type, enrich allowed tools, build context mode, resolve skill section mode
4. **computeSpawnCacheContext()** — Compute cache key, check if expensive enrichment should be throttled
5. **assemblePromptWithCache()** — Core assembly (cache check or fresh build)
6. **appendConstitutionSection()** — Append constitution.md and behaviour.md
7. **appendPresetSection()** — Active preset injection
8. **appendConfigModelSection()** — Model resolution from config.yaml
9. **enforcePromptBudget()** — Trim to size budget
10. **putCachedAssembly()** — Cache the assembled prompt

---

## 2. Memory Tier Injection — Tier A (Default, Always Applied)

### 2.1 Data Sources

Tier A memory context is loaded via `loadMemoryForContext()` in `prompt-assembler-memory.cjs`. This pathway creates a `ContextualMemory` instance and calls `memory.loadContextSync()`, which loads data from:

| Source                             | Data Type                                          | Fallback Behavior                        |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| **SQLite entity DB** (`memory.db`) | Patterns, issues (as gotchas), decisions           | Fallback to JSON files if DB unavailable |
| **gotchas.json**                   | Structured gotcha records with access stats        | Used when DB didn't load gotchas         |
| **patterns.json**                  | Structured pattern records with access stats       | Used when DB didn't load patterns        |
| **codebase_map.json**              | `discovered_files` → discoveries                   | None (graceful degradation)              |
| **MTM sessions**                   | Recent session summaries (last 10 sessions)        | None (graceful degradation)              |
| **LTM summaries**                  | Compressed historical summaries (`summary_*.json`) | None (graceful degradation)              |
| **learnings.md** (legacy)          | Raw markdown, tail-truncated to maxChars.legacy    | None (read-only archive)                 |

### 2.2 Injection Format

The `formatMemorySection()` function generates a structured memory context section:

```markdown
## Memory Context (Auto-Loaded)

### Gotchas (Pitfalls to Avoid)

- [mem:xxxxxxxx] <gotcha text, max 220 chars>

### Patterns (Reusable Solutions)

- [mem:xxxxxxxx] <pattern text, max 220 chars>

### Decisions (ADRs)

- [mem:xxxxxxxx] <decision text, max 220 chars>

### Recent Discoveries

- <path>: <description>

### Recent Sessions

- Session <N>: <summary>
```

**Section Constraints:**

- **Max items per section:** 3
- **Max chars per item:** 220
- **Total section cap:** 3500 chars
- **Evidence IDs:** Format `[mem:xxxxxxxx]` for traceability

### 2.3 Open Findings Carryover

Open audit findings are injected via `findings-registry.cjs::getOpenFindings()`:

- **Section header:** `### Open Findings Carryover`
- **Max items:** 3
- **Min severity:** "high"
- **Purpose:** Ensure spawned agents are aware of critical unresolved issues

### 2.4 Observational Memory (Alternative Mode)

When `MEMORY_MODE=observational` AND `OBSERVATIONAL_MEMORY_ENABLED=on`:

- Loads `observations_summary.md` + scored recent observations
- Section header: `## Observational Memory Context`
- **Token budget:** 400 tokens summary, 400 tokens observations
- **Mutual exclusion:** Standard memory section (gotchas/patterns/decisions/sessions) is NOT loaded in observational mode

---

## 3. Memory Tier Injection — Tier B (Conditional, Expensive Operations)

### 3.1 Activation Conditions

Tier B is ONLY applied when:

1. `throttleExpensive` is **false** (prompt isn't too large/re-assembled from cache)
2. Either NOT in observational mode, OR `shouldUseTierB()` returns true

### 3.2 Semantic Memory (`applySemanticMemoryToPrompt`)

**Environment Control:** `SPAWN_PROMPT_SEMANTIC_MEMORY` (default: `on`, set to `off` to disable)

#### Intent Analysis Path (When `MEMORY_INTENT_ANALYSIS=on`)

1. Calls `intent-analyzer.cjs::analyzeIntent()` — uses an LLM (ModelClient) to analyze intent
2. Feeds in MTM session summaries + current query
3. Returns planned queries with priorities
4. Executes each planned query against `memoryManager.searchMemory()` (max 2 results each)
5. **GAP ALERT:** References `session-context-for-search.cjs` which **DOES NOT EXIST** — caught by try/catch, silently degraded

#### Direct Semantic Search Path (When intent analysis disabled or returns 0 results)

1. Calls `memoryManager.searchMemory(query, { limit: 3, threshold })`
2. Uses `ContextualMemory.search()` → LanceDB vector search OR keyword fallback
3. Hot-only filter first (excludes LTM archives), unfiltered fallback on error

#### Memory Query Path (When `SPAWN_PROMPT_MEMORY_QUERY=on`)

- Additional `memoryManager.searchMemory(query, { limit: 5 })` call
- Appended as `### Relevant Memories (Query)` section

**Injection Format:**

```markdown
### Semantic Matches (ContextualMemory)

- <snippet, max 180 chars> (similarity: XX%)

### Relevant Memories (Query)

- <snippet, max 180 chars>
```

**Section Budget:** Capped by `capTierBSection()` — 400 token budget

### 3.3 Entity Graph (`applyEntityGraphToPrompt`)

**Environment Control:** `SPAWN_PROMPT_ENTITY_GRAPH` (default: `on`, set to `off` to disable)

**Execution Flow:**

1. Creates `ContextualMemory` instance
2. `findEntities('decision', { limit: 3 })` — gets recent decisions from SQLite
3. `findEntities('issue', { limit: 3 })` — gets recent issues from SQLite
4. For first 2 decisions, `getRelated(id, { depth: 1 })` — related entities (max 2 each)

**Injection Format:**

```markdown
### Entity Graph (SQLite)

**Decisions** (max 3, 140 char content)

- <decision text>

**Issues** (max 3, 140 char content)

- <issue text>

**Related** (max 4 entities, with relationship type)

- <entity> → <relationship> → <entity>
```

**Section Budget:** Capped by `capTierBSection()` — 400 token budget

---

## 4. RAG-at-Spawn (Async Pathway, Separate from Tier B)

**Environment Control:** `RAG_AT_SPAWN` (default: `on`)

### 4.1 Execution Conditions

- Only runs when `memoryQuery` is non-empty (computed from task description or basePrompt[:240])
- Executes during `assembleSpawnPromptAsync()`

### 4.2 Execution Flow

1. Calls `queryMemoryForSpawn()` in `prompt-assembler-memory.cjs:377`
2. Uses `ContextualMemory.search()` (LanceDB vector → keyword fallback)
3. **Adaptive fallback:** If initial search returns 0 results and no explicit threshold, retries at 0.25 threshold

### 4.3 Configuration Limits

- `RAG_AT_SPAWN_LIMIT=5` (max results)
- `RAG_AT_SPAWN_MAX_ITEMS=5` (max items in section)
- `RAG_AT_SPAWN_MAX_CHARS=1800` (max total chars)

### 4.4 Injection Format

```markdown
### Task-Relevant Memory (RAG)

- [rag:xxxxxxxx] <snippet> (similarity: XX%)
```

**Evidence ID Format:** `[rag:xxxxxxxx]` for traceability

---

## 5. Constitution & Behaviour Injection

### 5.1 Constitution Injection (task-tools.cjs:408)

- Reads `.claude/context/memory/constitution.md` (cached after first load)
- Reads `.claude/context/memory/behaviour.md` (in same function)
- Appended after main assembly as `## Constitution Context`

### 5.2 Behaviour Rules Injection (prompt-assembler-agent.cjs:67)

- Reads `.claude/context/memory/behaviour.md`
- Strips headers, joins non-empty lines
- Injected as `## Dynamic behaviour rules` section

**CRITICAL GAP:** Behaviour is loaded TWICE through different paths:

1. Via `loadConstitutionContext()` in task-tools.cjs (hook-level)
2. Via `loadBehaviourRules()` in prompt-assembler-agent.cjs (library-level)

This creates potential duplication in assembled prompts.

---

## 6. Agent-Specific Overrides

### 6.1 Agent Prompt Overrides (prompt-assembler-agent.cjs:48)

1. Looks up agent file path in registry or filesystem
2. Checks for `{agentDir}/prompts/*.md` directory
3. Concatenates all .md files in alphabetical order
4. Appended to basePrompt

### 6.2 Context/Mode System (prompt-factory.cjs)

1. Loads context/mode configuration (context-mode-loader.cjs)
2. Applies tool restrictions (included/excluded tools)
3. Injects context/mode prompt fragment via `insertContextModeSection()`
4. Goes after SKILL DISCOVERY PROTOCOL section

---

## 7. Template-Based Injection

Templates in `.claude/templates/spawn/` define placeholders:

- `<ROLE>`, `<TASK>`, `<ID>`, `<SUBJECT>` — substituted by Router
- Templates define the WARNING BOX and TaskUpdate obligations
- **Memory/RAG sections are NOT in templates** — they're injected dynamically by the hook

**Template Types:**

- `universal-agent-spawn.md` — Standard spawn
- `orchestrator-spawn.md` — Orchestrators (must have Task tool + opus model)
- `agent-identity-integration.md` — Agents with personality frontmatter

---

## 8. Environment Variable Controls

Current `.env` settings controlling memory and RAG injection:

| Variable                       | Default  | Purpose                                   |
| ------------------------------ | -------- | ----------------------------------------- |
| `MEMORY_SEMANTIC_SEARCH`       | `on`     | Master switch for LanceDB semantic search |
| `SPAWN_PROMPT_SEMANTIC_MEMORY` | `on`     | Tier B semantic matches injection         |
| `SPAWN_PROMPT_ENTITY_GRAPH`    | `on`     | Tier B entity graph injection             |
| `MEMORY_INTENT_ANALYSIS`       | `off`    | LLM-based intent analysis (OFF)           |
| `SPAWN_PROMPT_MEMORY_QUERY`    | `off`    | Additional memory query section (OFF)     |
| `RAG_AT_SPAWN`                 | `on`     | RAG-at-spawn via assembleSpawnPromptAsync |
| `MEMORY_MODE`                  | `hybrid` | Memory mode (hybrid/observational)        |
| `OBSERVATIONAL_MEMORY_ENABLED` | `on`     | Kill switch for observational mode        |

---

## 9. Gap Analysis — Critical Issues

### GAP 1: MISSING MODULE — `session-context-for-search.cjs` 🔴 HIGH

**Location:** Referenced at `spawn-prompt-assembler.memory.cjs:176-177`

**Impact:** The intent analysis path (`MEMORY_INTENT_ANALYSIS`) tries to load `getContextForSearch` from this module. Since the file doesn't exist, the try/catch silently catches the `MODULE_NOT_FOUND` error and degrades to basic MTM session summaries.

**Current State:** Feature is disabled (`MEMORY_INTENT_ANALYSIS=off`) so practical impact is nil today, but enabling it would hit this gap.

**Risk:** If intent analysis were enabled, it would always use degraded context. The skill body becomes documentation Claude skips.

**Recommendation:**

- Either create the module with proper session context extraction
- OR remove the dead reference and document why intent analysis is limited

**Severity:** HIGH (blocks feature enablement)

---

### GAP 2: DUPLICATE BEHAVIOUR LOADING 🟡 MEDIUM

**Location:**

- `spawn-prompt-assembler.task-tools.cjs:418` (loadConstitutionContext loads behaviour.md)
- `prompt-assembler-agent.cjs:67` (loadBehaviourRules loads behaviour.md independently)

**Impact:** Behaviour rules may appear twice in the assembled prompt — once from constitution injection and once from the library-level behaviour section.

**Token Waste:** Behaviour.md is typically 50-100 lines. Duplicating it wastes 500-1000 tokens per spawn.

**Risk:** Duplicate instructions may confuse agents with conflicting interpretations.

**Recommendation:**

- Audit whether both paths actually inject, or if one supersedes the other
- If both inject, consolidate to single loading point
- Add deduplication check in assembly pipeline

**Severity:** MEDIUM (wastes tokens, potential confusion)

---

### GAP 3: MEMORY SECTION HARD CAPS TOO AGGRESSIVE 🟡 MEDIUM

**Location:** `prompt-assembler-memory.cjs`

**Constants:**

- `MAX_MEMORY_ITEMS_PER_SECTION = 3`
- `MAX_MEMORY_ITEM_CHARS = 220`
- `MAX_MEMORY_SECTION_CHARS = 3500`

**Impact:** Only 3 gotchas, 3 patterns, 3 decisions, 3 discoveries, 3 sessions ever injected. With 220 char limit per item, complex learnings are truncated. The 3500 char total cap means if gotchas are large, sessions may get cut off.

**Problem:** Agents operating in complex areas with many relevant gotchas/patterns only see a small window. No prioritization (takes last N, not most relevant N).

**Example Scenario:**

- Security audit agent needs 10 relevant gotchas about Windows path handling
- Only sees 3 most recent gotchas (not most relevant)
- Misses critical context, introduces known vulnerabilities

**Recommendation:**

- Implement relevance-scored selection instead of recency-only slicing
- OR increase limits for high-complexity tasks (detect via task metadata)
- OR add dynamic budget allocation (if task is HIGH complexity, increase caps)

**Severity:** MEDIUM (limits agent effectiveness in complex domains)

---

### GAP 4: TIER B GATED BEHIND LANCEDB AVAILABILITY 🟡 MEDIUM

**Location:** `contextual-memory.cjs:113-146` (\_getVectorStore)

**Impact:** If LanceDB isn't initialized (no embeddings, init failure, `LANCEDB_EMBEDDING_MODE=off`), semantic search falls back to keyword search (`_keywordSearch`). This keyword search is basic ripgrep/grep over memory files — it may return low-quality results compared to semantic matching.

**Scenario:** On systems without embedding infrastructure (common on Windows with no ONNX/transformers), Tier B semantic memory is effectively keyword-only.

**Quality Gap:** Semantic search finds conceptually similar memories. Keyword search finds lexically similar strings. Quality difference is significant for intent-driven searches.

**Recommendation:**

- Document this clearly in deployment guides
- Consider improving keyword fallback quality (BM25-based ranking, synonym expansion)
- OR make fallback status visible in telemetry (emit metric when vector search unavailable)

**Severity:** MEDIUM (degrades quality on non-embedding systems)

---

### GAP 5: RAG-AT-SPAWN AND TIER B SEMANTIC MEMORY ARE REDUNDANT 🟡 LOW-MEDIUM

**Location:**

- RAG-at-spawn: `prompt-assembler-memory.cjs:377` (queryMemoryForSpawn)
- Tier B: `spawn-prompt-assembler.memory.cjs:244` (applySemanticMemoryToPrompt)

**Impact:** Both paths perform `ContextualMemory.search()` with slightly different parameters. Both use the same underlying vector store or keyword fallback. The same memory item could appear in both `### Task-Relevant Memory (RAG)` and `### Semantic Matches (ContextualMemory)` sections.

**Token Waste:** Duplicate results consume tokens without adding value.

**Example:**

- RAG-at-spawn finds `[rag:abc12345] "Windows path normalization gotcha"`
- Tier B finds `[mem:abc12345] "Windows path normalization gotcha"`
- Same content, different evidence IDs, both in prompt

**Recommendation:**

- Either merge the two paths into single unified search
- OR add cross-section deduplication (by content hash)
- OR differentiate search strategies (RAG = task-specific, Tier B = general context)

**Severity:** LOW-MEDIUM (token waste, minor confusion)

---

### GAP 6: ENTITY GRAPH DB MAY NOT EXIST 🟢 LOW

**Location:** `contextual-memory.cjs` — \_getEntityQuery() method

**Impact:** If `memory.db` doesn't exist or has no `entities` table, entity graph injection silently returns empty. The `loadContextSync` in context-loader also catches DB errors.

**Current Behavior:** Graceful degradation (no crash), but agents never know entity graph is unavailable.

**Visibility Gap:** No telemetry signal to diagnose why entity graph is empty.

**Recommendation:**

- Add a telemetry/warning signal when entity graph is completely empty
- Emit metric on spawn: `entity_graph_available: true/false`
- Add diagnostic command: `pnpm memory:status` to show data source health

**Severity:** LOW (graceful degradation, but poor visibility)

---

### GAP 7: NO SEARCH EVIDENCE INJECTION FROM HYBRID CODE SEARCH 🟡 MEDIUM

**Location:** The `pnpm search:code` hybrid search (BM25 + semantic) is a CLI tool for code search. It produces results to stdout.

**Impact:** There is NO automated path to inject hybrid code search results into spawn prompts. Code search evidence flows through agent-initiated `Skill({ skill: 'code-semantic-search' })` or `Skill({ skill: 'ripgrep' })` calls AFTER spawning — not before.

**Policy-Reality Gap:** Search-before-spawn is documented in CLAUDE.md as a policy but has no automated implementation.

**Latency Impact:** Agents start without code search context. They must independently decide to search, adding latency to task completion.

**Recommendation:**

- Consider an optional search-before-spawn hook that pre-fetches relevant code context based on the task description
- OR add `CODE_SEARCH_AT_SPAWN=on/off` env var for experimental pre-spawn code search
- OR document that code search is agent-initiated only (clarify policy)

**Severity:** MEDIUM (policy-reality gap, latency impact)

---

### GAP 8: OBSERVATIONAL VS HYBRID MODE MUTUAL EXCLUSION 🟢 LOW

**Location:** `prompt-assembler-memory.cjs:99-112` (resolveMemorySection)

**Impact:** When `MEMORY_MODE=observational`, the standard memory section (gotchas, patterns, decisions, sessions) is NOT loaded — only observational summary + recent observations. This means structured gotchas/patterns from JSON files are invisible.

**Current State:** Using default `hybrid` mode. Switching to observational would lose all structured memory.

**Risk:** If a team switches to observational mode for experimentation, critical gotchas are invisible to agents.

**Recommendation:**

- In observational mode, consider still injecting critical gotchas/patterns as a safety net
- OR add `MEMORY_MODE=hybrid_observational` that includes both
- OR document this tradeoff clearly in mode descriptions

**Severity:** LOW (not using observational mode currently)

---

### GAP 9: CACHE KEY DOESN'T INCLUDE MEMORY STATE 🟢 LOW

**Location:** `spawn-prompt-assembler.runtime.cjs:165-187` (computeSpawnCacheContext)

**Impact:** The cache key includes agentType, presetId, tools, basePrompt, etc. but NOT the state of memory files (gotchas.json, patterns.json, etc.). If memory is updated between spawns, a cached prompt may serve stale memory.

**Current Mitigation:** Cache TTL is short (per-session), so memory staleness is limited.

**Scenario:** Agent A completes work, writes new gotcha. Agent B spawned 5 seconds later, cache hit, doesn't see new gotcha.

**Recommendation:**

- Include a memory version hash in cache key (hash of gotchas.json + patterns.json + decisions.md)
- OR invalidate cache on memory writes (via PostToolUse hook on Write/Edit to memory files)
- OR reduce cache TTL further (from session-lifetime to 5 minutes)

**Severity:** LOW (short cache TTL mitigates)

---

### GAP 10: STM (SHORT-TERM MEMORY) NEVER INJECTED 🟡 MEDIUM

**Location:** `loadContextSync()` loads MTM and LTM sessions, but STM (`session_current.json`) is never loaded.

**Impact:** Current session context (STM) is not injected into spawned agents. They only see MTM (past sessions) and LTM (compressed history).

**Visibility Gap:** A subagent spawned mid-session has no visibility into what other agents in the SAME session have already discovered or decided.

**Example Scenario:**

- Developer agent discovers "auth module uses JWT" (writes to STM)
- QA agent spawned 2 minutes later, doesn't see this discovery
- QA agent re-discovers same information (duplicate work)

**Recommendation:**

- Include STM in the memory context loading path, at least for critical discoveries/decisions from the current session
- Add `STM_IN_SPAWN_PROMPT=on/off` env var for experimental inclusion
- OR document this as design decision (spawned agents get historical context only)

**Severity:** MEDIUM (duplicate work, coordination gap)

---

### GAP 11: INTENT ANALYSIS REQUIRES EXTERNAL LLM CALL 🟡 MEDIUM

**Location:** `spawn-prompt-assembler.memory.cjs:runIntentAnalysis()` (line 159-242)

**Impact:** When `MEMORY_INTENT_ANALYSIS=on`, `runIntentAnalysis()` calls `ModelClient.generateText()` — an actual LLM inference call during hook execution. This adds significant latency to every spawn (hundreds of ms to seconds) and requires an available model endpoint.

**Current State:** Disabled by default (`MEMORY_INTENT_ANALYSIS=off`), so no practical impact today.

**Risk:** If enabled without understanding the latency implications, every `Task()` call would incur an LLM round-trip before the agent even starts.

**Recommendation:**

- Keep disabled by default
- If enabling, measure latency impact and add timeout
- Consider caching intent analysis results for similar queries

**Severity:** MEDIUM (latent risk, currently mitigated by being off)

---

### GAP 12: RACE CONDITIONS IN CONCURRENT MEMORY LOADING 🟢 LOW

**Location:** `contextual-memory-context-loader.cjs` — file reads in `loadContextSync()`

**Impact:** Multiple files are read synchronously (`gotchas.json`, `patterns.json`, `codebase_map.json`, MTM sessions, `learnings.md`). If a concurrent agent writes to these files simultaneously, partially-written files could be read. JSON.parse failures are caught (resulting in empty arrays), but file atomicity is not guaranteed.

**Mitigation:** Access stats updates use `setImmediate()` (deferred write), and `atomicWriteSync` is used for learnings archive. However, gotchas/patterns JSON writes from other agents are NOT atomic.

**Recommendation:**

- Use `atomicWriteSync` for all JSON memory file writes
- OR accept the risk and document that concurrent memory reads may see stale data

**Severity:** LOW (try/catch prevents crashes; reads are eventually consistent)

---

## 10. Summary of Gaps

| Gap # | Title                                    | Severity   | Impact                                       | Recommendation Priority              |
| ----- | ---------------------------------------- | ---------- | -------------------------------------------- | ------------------------------------ |
| 1     | Missing `session-context-for-search.cjs` | 🔴 HIGH    | Blocks intent analysis feature               | **P0 — Fix or remove**               |
| 2     | Duplicate behaviour loading              | 🟡 MEDIUM  | Wastes tokens, potential confusion           | **P1 — Deduplicate**                 |
| 3     | Memory section caps too aggressive       | 🟡 MEDIUM  | Limits agent effectiveness                   | **P1 — Relevance scoring**           |
| 4     | Tier B gated behind LanceDB              | 🟡 MEDIUM  | Quality degradation on non-embedding systems | **P2 — Document + improve fallback** |
| 5     | RAG-at-spawn and Tier B redundant        | 🟡 LOW-MED | Token waste, duplicate results               | **P2 — Deduplicate**                 |
| 6     | Entity graph DB may not exist            | 🟢 LOW     | Poor visibility                              | **P3 — Add telemetry**               |
| 7     | No hybrid code search injection          | 🟡 MEDIUM  | Policy-reality gap, latency                  | **P2 — Add search-before-spawn**     |
| 8     | Observational mode mutual exclusion      | 🟢 LOW     | Risk when switching modes                    | **P3 — Document tradeoff**           |
| 9     | Cache key doesn't include memory state   | 🟢 LOW     | Potential staleness                          | **P3 — Add memory hash**             |
| 10    | STM never injected                       | 🟡 MEDIUM  | Coordination gap, duplicate work             | **P1 — Include STM**                 |
| 11    | Intent analysis requires LLM call        | 🟡 MEDIUM  | Latent latency risk                          | **P3 — Document + timeout**          |
| 12    | Race conditions in memory loading        | 🟢 LOW     | Eventually consistent reads                  | **P3 — Atomic writes**               |

---

## 11. Actionable Recommendations

### Immediate Actions (P0)

1. **GAP 1 — Fix or remove `session-context-for-search.cjs` reference**
   - Audit if intent analysis is desired feature
   - If yes: implement module
   - If no: remove reference and update documentation

### High Priority (P1)

2. **GAP 2 — Deduplicate behaviour loading**
   - Consolidate to single loading point
   - Add integration test to detect duplication

3. **GAP 3 — Implement relevance-scored memory selection**
   - Replace recency-only slicing with relevance scoring
   - Use similarity scores from ContextualMemory.search()
   - Consider dynamic budget allocation by task complexity

4. **GAP 10 — Include STM in spawn prompts**
   - Add STM session file to loadContextSync() path
   - Gate behind `STM_IN_SPAWN_PROMPT=on/off` for experimentation
   - Monitor token impact in telemetry

### Medium Priority (P2)

5. **GAP 4 — Document LanceDB fallback behavior**
   - Add deployment guide section on embedding requirements
   - Emit telemetry metric: `tier_b_vector_available: true/false`
   - Consider BM25-based ranking for keyword fallback

6. **GAP 5 — Deduplicate RAG-at-spawn and Tier B searches**
   - Add content hash deduplication between sections
   - OR merge into single unified search path
   - Document search strategy differentiation

7. **GAP 7 — Add search-before-spawn hook (experimental)**
   - Implement `CODE_SEARCH_AT_SPAWN=on/off` env var
   - Pre-fetch code context via `pnpm search:code` before assembly
   - Gate behind experimental flag, measure latency impact

### Low Priority (P3)

8. **GAP 6 — Add entity graph telemetry**
   - Emit metric on spawn: `entity_graph_available: true/false`
   - Add diagnostic command: `pnpm memory:status`

9. **GAP 8 — Document observational mode tradeoff**
   - Clarify in documentation that observational mode excludes structured memory
   - Consider `hybrid_observational` mode for both

10. **GAP 9 — Include memory state in cache key**
    - Compute hash of gotchas.json + patterns.json + decisions.md
    - Include in cache key computation
    - OR invalidate cache on memory writes

---

## 12. Conclusion

The memory and RAG evidence injection pipeline is a sophisticated system with multiple data sources, two-tier injection model, and strict token budget controls. The architecture is well-designed for balancing context richness with token efficiency.

**Strengths:**

- Graceful degradation at multiple levels (DB → JSON → empty)
- Clear separation between default (Tier A) and expensive (Tier B) operations
- Evidence traceability via `[mem:*]` and `[rag:*]` citation format
- Flexible environment variable controls for experimentation

**Weaknesses:**

- Missing module creates dead code path (GAP 1)
- Duplicate loading wastes tokens (GAP 2)
- Aggressive truncation limits agent effectiveness (GAP 3)
- Current session context never injected (GAP 10)

Addressing the P0 and P1 recommendations will significantly improve the robustness and effectiveness of the memory injection system. The P2 and P3 recommendations are enhancements that can be prioritized based on operational needs and telemetry data.

---

## Appendix A: Data Flow Diagram

```
User Task Request
    ↓
Router (PreToolUse: Task)
    ↓
spawn-prompt-assembler.cjs
    ↓
assemblePromptWithCache()
    ↓
    ├─ TIER A (Always)
    │   ├─ SQLite entity DB → patterns, decisions, issues
    │   ├─ gotchas.json (fallback)
    │   ├─ patterns.json (fallback)
    │   ├─ codebase_map.json → discoveries
    │   ├─ MTM sessions (last 10)
    │   ├─ LTM summaries
    │   └─ learnings.md (legacy, read-only)
    │
    ├─ TIER B (Conditional: !throttleExpensive)
    │   ├─ Semantic Memory
    │   │   ├─ Intent Analysis (if MEMORY_INTENT_ANALYSIS=on)
    │   │   │   └─ [GAP 1: missing session-context-for-search.cjs]
    │   │   ├─ Direct Semantic Search (LanceDB → keyword fallback)
    │   │   └─ Memory Query (if SPAWN_PROMPT_MEMORY_QUERY=on)
    │   │
    │   └─ Entity Graph (SQLite)
    │       ├─ findEntities('decision', limit: 3)
    │       ├─ findEntities('issue', limit: 3)
    │       └─ getRelated(id, depth: 1)
    │
    ├─ RAG-at-Spawn (Parallel to Tier B)
    │   ├─ queryMemoryForSpawn()
    │   └─ LanceDB vector search → keyword fallback
    │
    ├─ Constitution & Behaviour
    │   ├─ constitution.md
    │   └─ behaviour.md [GAP 2: loaded twice]
    │
    └─ Agent-Specific Overrides
        ├─ {agentDir}/prompts/*.md
        └─ context/mode system
    ↓
Assembled Spawn Prompt
    ↓
Spawned Subagent Execution
```

---

## Appendix B: Memory Tier Budget Table

| Section                   | Max Items | Max Chars/Item | Total Cap      | Evidence Format  |
| ------------------------- | --------- | -------------- | -------------- | ---------------- |
| Gotchas                   | 3         | 220            | —              | `[mem:xxxxxxxx]` |
| Patterns                  | 3         | 220            | —              | `[mem:xxxxxxxx]` |
| Decisions                 | 3         | 220            | —              | `[mem:xxxxxxxx]` |
| Recent Discoveries        | 3         | —              | —              | Plain text       |
| Recent Sessions           | 3         | —              | —              | Plain text       |
| **Total Tier A**          | —         | —              | **3500 chars** | —                |
| Semantic Matches (Tier B) | 3         | 180            | 400 tokens     | `[mem:xxxxxxxx]` |
| Entity Graph (Tier B)     | 7 total   | 140            | 400 tokens     | Plain text       |
| RAG-at-Spawn              | 5         | —              | 1800 chars     | `[rag:xxxxxxxx]` |
| Open Findings             | 3         | —              | —              | Plain text       |

---

## Appendix C: Environment Variable Quick Reference

| Variable                       | Default  | Purpose                   | Impact                               |
| ------------------------------ | -------- | ------------------------- | ------------------------------------ |
| `MEMORY_SEMANTIC_SEARCH`       | `on`     | Master switch for LanceDB | Disables all vector operations       |
| `SPAWN_PROMPT_SEMANTIC_MEMORY` | `on`     | Tier B semantic matches   | Disables semantic search in Tier B   |
| `SPAWN_PROMPT_ENTITY_GRAPH`    | `on`     | Tier B entity graph       | Disables entity graph in Tier B      |
| `MEMORY_INTENT_ANALYSIS`       | `off`    | LLM-based intent analysis | Enables intent-driven query planning |
| `SPAWN_PROMPT_MEMORY_QUERY`    | `off`    | Additional memory query   | Adds extra query section             |
| `RAG_AT_SPAWN`                 | `on`     | RAG-at-spawn execution    | Disables task-specific RAG           |
| `RAG_AT_SPAWN_LIMIT`           | `5`      | Max RAG results           | Controls RAG result count            |
| `RAG_AT_SPAWN_MAX_ITEMS`       | `5`      | Max RAG items in section  | Controls RAG section size            |
| `RAG_AT_SPAWN_MAX_CHARS`       | `1800`   | Max RAG chars             | Controls RAG token budget            |
| `MEMORY_MODE`                  | `hybrid` | Memory mode               | `hybrid` or `observational`          |
| `OBSERVATIONAL_MEMORY_ENABLED` | `on`     | Observational kill switch | Disables observational mode          |

---

**End of Report**
