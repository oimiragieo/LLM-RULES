<!-- Agent: architect | Task: #1 | Session: 2026-02-08 -->

# Performance and Scalability Analysis

**Date:** 2026-02-08
**Agent:** Architect (opus)
**Scope:** Full codebase deep dive -- hooks, lib, code-indexing, memory, workflow, config, tests, deps

---

## Executive Summary

The agent-studio framework has significant performance bottlenecks primarily in its **hook system overhead** and **process-per-hook architecture**. Every single tool call triggers 3-8 separate Node.js processes, each re-requiring 10-20 modules from disk. The memory system files are growing unbounded toward context window limits. The codebase contains ~45% dead library code and heavyweight dependencies unused at runtime. These issues compound as the project scales.

**Severity Distribution:**

- 5 CRITICAL issues (immediate impact on every tool call)
- 7 IMPORTANT issues (medium-term scalability risks)
- 6 NICE-TO-HAVE issues (optimization opportunities)

---

## 1. CRITICAL Issues (Fix Now)

### C-001: Hook System Process Spawning Overhead

**Location:** `.claude/settings.json` (hook registrations), all `.claude/hooks/**/*.cjs`

**Problem:** Every tool call spawns **multiple separate Node.js processes** via the hook system. Each hook is a standalone `node` command that:

1. Boots a fresh V8 isolate (~30-50ms cold start)
2. Parses `require()` dependencies from disk (10-20 modules per hook)
3. Reads stdin for hook input JSON
4. Performs its check
5. Writes stdout JSON and exits

**Per-tool-call process count analysis from `settings.json`:**

| Tool Call    | Hooks Fired (Pre + Post)                   | Processes Spawned |
| ------------ | ------------------------------------------ | ----------------- |
| `Bash`       | 4 Pre + 3 Post + 3 Pre(all)                | **10 processes**  |
| `Write`      | 5 Pre + 2 Post + 3 Pre(all) + 1 Pre(Write) | **11 processes**  |
| `Edit`       | 5 Pre + 2 Post + 3 Pre(all)                | **10 processes**  |
| `Task`       | 5 Pre + 4 Post + 3 Pre(all)                | **12 processes**  |
| `Read`       | 1 Pre + 3 Post + 3 Pre(all)                | **7 processes**   |
| `Glob`       | 1 Pre + 3 Post + 3 Pre(all)                | **7 processes**   |
| `TaskUpdate` | 3 Pre + 5 Post + 3 Pre(all)                | **11 processes**  |

**Impact:** At ~50ms per process spawn, a single `Task` invocation adds **~600ms of overhead** just from hooks. A typical agent workflow with 20 tool calls accumulates **5-10 seconds** of pure hook overhead.

**Each hook re-requires the same shared modules independently:**

- `hook-input.cjs` (required by every hook)
- `event-bus.cjs` + `event-types.cjs` (required by 8+ hooks)
- `router-state.cjs` (required by 4 hooks)
- `config-loader.cjs` (required by 3 hooks)
- `atomic-write.cjs`, `state-cache.cjs`, `jsonl-utils.cjs`

**Suggested Fix:** Consolidate into a single hook dispatcher process that loads all modules once and dispatches to check functions in-memory. The `pre-task-unified.cjs` and `user-prompt-unified.cjs` patterns already demonstrate this consolidation approach (reducing 5 processes to 1 each) -- extend this to ALL hooks.

**Estimated Improvement:** 60-80% reduction in hook overhead (from ~600ms to ~100-150ms per tool call).

---

### C-002: UserPromptSubmit Hook Over-Loading

**Location:** `.claude/hooks/routing/user-prompt-unified.cjs`

**Problem:** This hook runs on every user prompt and eagerly loads **15+ library modules at top level** (not lazy):

- `project-root.cjs`, `hook-input.cjs`, `config-loader.cjs`, `jsonl-utils.cjs`, `logger.cjs`
- `routing-table.cjs`, `intent-classifier.cjs`, `agent-registry-resolver.cjs`, `semantic-router.cjs`
- `token-budget-tracker.cjs`, `compression-trigger.cjs`
- `memory-tiers.cjs`, `state-cache.cjs`, `atomic-write.cjs`
- `event-bus.cjs`, `event-types.cjs`, `router-state.cjs`

These modules recursively require their own dependencies (js-yaml, fs, path, etc.), creating a deep require tree that must be fully resolved on every user prompt.

**Impact:** ~100-200ms per user prompt just for module loading. The `semantic-router.cjs` and `intent-classifier.cjs` are particularly heavy since they load routing tables and pattern matching logic.

**Suggested Fix:**

1. Lazy-load all non-essential modules (semantic-router, intent-classifier, compression-trigger only when needed)
2. Use a singleton module cache that persists across hook invocations (requires hook dispatcher architecture from C-001)
3. Most checks in this hook are advisory -- consider moving non-blocking checks to PostToolUse

---

### C-003: Memory Files Growing Unbounded

**Location:** `.claude/context/memory/`

**Problem:** Core memory files are growing without effective pruning:

| File                           | Current Size | Growth Rate |
| ------------------------------ | ------------ | ----------- |
| `learnings.md`                 | **33 KB**    | ~15 KB/day  |
| `issues.md`                    | **51 KB**    | ~20 KB/day  |
| `decisions.md`                 | **24 KB**    | ~10 KB/day  |
| `patterns.json`                | **36 KB**    | ~5 KB/day   |
| `archive/learnings-2026-02.md` | **434 KB**   | Accumulated |

At the current growth rate, `issues.md` will exceed **100 KB within 3 days**. Since every spawned agent is instructed to read `learnings.md` before starting (Memory Protocol), these files are injected into context windows. At ~0.75 tokens/char:

- `learnings.md` = ~25K tokens
- `issues.md` = ~38K tokens
- `decisions.md` = ~18K tokens

**Combined: ~81K tokens** consumed by memory files alone, out of a 200K context window. This is **40% of the entire context budget** spent before the agent begins its actual work.

**Suggested Fix:**

1. Implement automatic rotation when files exceed 20 KB (archive older entries)
2. Add a summarization step that compresses old entries into digest form
3. Use indexed/searchable memory (the `memory.db` exists but is not the primary interface)
4. Only inject RELEVANT memory entries, not the entire file (use semantic search on memory content)

---

### C-004: Three PreToolUse(all) Hooks Fire on EVERY Tool Call

**Location:** `settings.json` lines 28-43 (matcher: "")

**Problem:** Three hooks with empty matcher ("") fire on every single tool use, regardless of tool type:

1. `session-cleanup.cjs` - Session housekeeping
2. `execution-limit-monitor-hook.cjs` - Execution limits
3. `tool-scope-validator.cjs` - Tool scope validation

These spawn 3 Node.js processes for **every** Read, Write, Edit, Bash, Glob, Grep, Task, and any other tool call. Even a simple `Read` call triggers these 3 processes plus the Read-specific hook (4 total Pre hooks).

**Impact:** 3 processes x ~50ms = ~150ms overhead on every tool call, regardless of whether the hook needs to act.

**Suggested Fix:**

1. Move `session-cleanup.cjs` to SessionEnd or a time-based trigger (not every tool call)
2. Make `execution-limit-monitor-hook.cjs` a counter that only spawns a process every Nth call (sampling)
3. Combine `tool-scope-validator.cjs` into the tool-specific hooks (it already knows the tool name from stdin)

---

### C-005: Three PostToolUse(all) Hooks Fire on EVERY Tool Call

**Location:** `settings.json` lines 179-195 (matcher: "")

**Problem:** Three PostToolUse hooks with empty matcher fire after every tool call:

1. `metrics-collector-hook.cjs` - Collects metrics
2. `error-tracker-hook.cjs` - Tracks errors
3. `anomaly-detector.cjs` - Detects anomalies

Combined with C-004, every tool call spawns **6 overhead processes** (3 Pre + 3 Post) before any tool-specific hooks.

**Impact:** 6 processes x ~50ms = ~300ms minimum overhead per tool call.

**Suggested Fix:** Merge all three into a single `post-tool-telemetry.cjs` that handles metrics, errors, and anomaly detection in one process. This reduces 3 processes to 1 on every tool call.

---

## 2. IMPORTANT Issues (Fix Soon)

### I-001: Dead Library Code (~45% of lib/)

**Location:** `.claude/lib/` directory

**Problem:** The issues.md file documents this: "~104 lib modules (~30,000 LOC) have zero active consumers. ~45% of .claude/lib/ is dead code." While a `_archive/` directory exists, it contains ~90 archived modules adding **2.5 MB** to the lib directory size. These files:

- Increase `require()` resolution time (Node.js scans directory entries)
- Confuse developers about which modules are canonical
- Make grep/glob searches slower

**Key dead subsystems identified:**

- `party-mode/` modules (archived but still present)
- `testing/`, `integration/`, `agents-runtime/`, `boot/`, `clients/`, `scheduler/`, `coordination/`, `skills/`, `config/`, `plan/`, `safety/`, `text-processing/`, `ui/` subsystems

**Suggested Fix:** Move `_archive/` outside the `.claude/lib/` tree entirely (e.g., to `.claude.archive/lib/`) to remove from module resolution paths.

---

### I-002: Config Loading Without Cross-Process Caching

**Location:** `.claude/lib/utils/config-loader.cjs`, `.claude/lib/utils/agent-config-reader.cjs`

**Problem:** `config-loader.cjs` has in-process caching (`cachedConfig`) but each hook is a separate process. The config.yaml file is:

1. Read from disk (`fs.readFileSync`)
2. Parsed through `js-yaml` with CORE_SCHEMA
3. Cached in memory (useless -- process exits after hook)

This happens in every hook that calls `loadConfig()`. Similarly, `agent-config-reader.cjs` reads and parses the agent markdown frontmatter from disk every time `resolveAgentModel()` is called.

**Impact:** ~5-10ms per config load x number of hooks needing config = redundant I/O.

**Suggested Fix:** With the hook dispatcher architecture (C-001), the in-process cache becomes effective. Alternatively, pre-compute config into a fast-loading JSON cache that hooks can read with a single `JSON.parse()` instead of YAML parsing.

---

### I-003: BM25 Indexer Stores Full Documents in Memory

**Location:** `.claude/lib/code-indexing/bm25-indexer.cjs` line 91

**Problem:** The BM25 indexer constructor initializes `this.documents = []` which stores document objects containing `id`, `length`, and `termFreqs` for every indexed chunk. While the original issue of storing full text was addressed (the `text` field was removed from `addDocuments` at line 180-184), the `termFreqs` objects are still plain JavaScript objects with one key per unique term. For a 7000+ chunk index:

- Each chunk averages ~50-100 unique terms
- Each termFreqs object = ~100 key-value pairs
- 7000 chunks x 100 entries = ~700,000 object entries in memory

**Impact:** Memory usage grows linearly with corpus size. The current 7182-chunk index works at ~50MB but would OOM at ~30,000 chunks (a medium codebase).

**Suggested Fix:**

1. Use a Map or typed arrays instead of plain objects for termFreqs
2. Store IDF and term frequencies in a SQLite database for O(1) lookups
3. Use streaming/sharded approach for corpora over 10,000 chunks

---

### I-004: Event Bus Validation on Every Emit

**Location:** `.claude/lib/events/event-bus.cjs` lines 43-57

**Problem:** Every `eventBus.emit()` call runs `validateEvent()` which checks the event type against a schema. Multiple hooks emit events (routing-guard, pre-task-unified, spawn-prompt-assembler, user-prompt-unified). Since the event bus uses `setImmediate()` for async execution, the validation overhead happens in the critical path while the actual handler execution is deferred.

**Impact:** ~1-3ms per event emission. With 5-10 events per tool call, this adds ~5-30ms.

**Suggested Fix:** Cache validation results for known event types (they are static string constants). After validating once, skip validation for the same event type.

---

### I-005: Spawn Prompt Assembly Overhead per Task

**Location:** `.claude/hooks/routing/spawn-prompt-assembler.cjs`

**Problem:** Every `Task` invocation triggers the spawn-prompt-assembler which:

1. Loads `agent-registry.json` from disk
2. Loads `tool-manifest.json` from disk
3. Reads the universal spawn template from disk
4. Builds context mode prompt via `prompt-factory.cjs`
5. Loads `agent-config.cjs` for default tools
6. Validates the prompt via `spawn-prompt-validator.cjs`
7. Optionally loads semantic memory matches

This is a separate process from `pre-task-unified.cjs` and `routing-guard.cjs`, both of which also fire on Task. Three processes all reading overlapping files.

**Impact:** ~100-200ms per Task invocation just for prompt assembly.

**Suggested Fix:** Merge spawn-prompt-assembler into pre-task-unified.cjs (they already share the same trigger). Pre-compute agent registry and tool manifest into a combined cache.

---

### I-006: Test Suite Scale (328 Test Files)

**Location:** `tests/` directory

**Problem:** 328 test files exist, many testing archived or dead hooks. The `test:hooks` script is literally `echo 'Hook tests archived'`. Test suites reference modules that have been archived:

- Tests for 45+ archived hooks still exist in `tests/hooks/`
- Some tests import from `_archive/` paths
- No test cleanup was done when hooks/libs were archived

**Impact:** Running `pnpm test:framework` takes unnecessarily long. CI build times increase. Developers waste time understanding test failures for dead code.

**Suggested Fix:**

1. Archive test files corresponding to archived hooks/libs
2. Add a test cleanup step to the archival process
3. Maintain a test-to-source mapping for automated cleanup

---

### I-007: JSONL Files Growing Without Rotation

**Location:** Various `.claude/context/metrics/*.jsonl`, `.claude/context/runtime/*.jsonl`

**Problem:** Multiple JSONL log files grow without automatic rotation:

- `event-bus.jsonl` - No rotation configured (SEC-CTX-007 in issues.md)
- `router-violations.jsonl` - Has 2000-line cap (good)
- `reflection-log.jsonl` - 10 KB and growing
- `spawn-log.jsonl` - Grows with every agent spawn
- Various metrics files

**Impact:** Over weeks of usage, these files become large and slow to parse/append. The `appendJsonl()` utility opens and appends to files synchronously, which becomes slower as files grow.

**Suggested Fix:** Apply the 2000-line rotation pattern from `violation-tracker.cjs` to ALL JSONL files. Create a shared rotation utility.

---

## 3. NICE-TO-HAVE Issues (Fix When Convenient)

### N-001: Heavy Dependencies for Optional Features

**Location:** `package.json`

**Problem:** Several large dependencies are installed for optional/rarely-used features:

| Package                   | Purpose          | Usage                                     | Size Concern               |
| ------------------------- | ---------------- | ----------------------------------------- | -------------------------- |
| `@lancedb/lancedb`        | Vector store     | Only when embeddings enabled              | Heavy native dependency    |
| `@xenova/transformers`    | ML embeddings    | Only when embeddings enabled              | Very heavy (~500MB models) |
| `fastembed`               | Fast embeddings  | Only when embeddings enabled              | Native bindings            |
| `sharp`                   | Image processing | Unknown usage in agent framework          | Heavy native dependency    |
| `piscina`                 | Worker pool      | Only for code indexing with concurrency>1 | Moderate                   |
| `tree-sitter` + 5 parsers | AST parsing      | Only for code-indexing semantic mode      | Native bindings            |

All of these are listed as `dependencies` (not `optionalDependencies`), meaning they are installed for every user even if they only use the routing/hook system.

**Suggested Fix:** Move ML/indexing dependencies to `optionalDependencies` or a separate `@agent-studio/indexing` package. The BM25-only mode already works without any of these.

---

### N-002: State Cache TTL Too Short for Hook Dispatcher

**Location:** `.claude/lib/utils/state-cache.cjs`

**Problem:** The state cache has a 1-second TTL (`DEFAULT_TTL_MS = 1000`). Since each hook is a separate process, the cache is never actually reused (process starts, reads, exits). The comment says "reduces 10-15 redundant reads to 1" but this only works within a single process lifetime.

**Suggested Fix:** With the hook dispatcher (C-001), the 1-second TTL becomes useful. Without it, consider a file-based cache (e.g., tmpfile with mtime check) that persists across processes.

---

### N-003: Regex Compilation in Hot Path

**Location:** `.claude/hooks/routing/routing-guard.cjs` (Check 7 specialist override)

**Problem:** The `checkSpecialistOverride()` function compiles word-boundary regexes on every invocation:

```javascript
const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp('\\b' + escaped + '\\b', 'i');
```

The SPECIALIST_KEYWORD_MAP has 23 agents with 3-5 phrases each = ~80+ regex compilations per Check 7 invocation.

**Impact:** ~5-10ms per invocation.

**Suggested Fix:** Pre-compile regexes at module load time (top-level constant). Since each hook process loads the module fresh, the regexes would be compiled once per process instead of once per function call.

---

### N-004: safeJSONParse Duplicated Across Modules

**Location:** `.claude/lib/routing/router-state.cjs`, `.claude/lib/utils/hook-input.cjs`, `.claude/lib/utils/safe-json.cjs`

**Problem:** Three different implementations of safe JSON parsing exist:

1. `router-state.cjs` has inline `safeJSONParse()` with Object.create(null) pattern
2. `hook-input.cjs` has `sanitizeObject()` with ALLOWED_HOOK_INPUT_KEYS filtering
3. `safe-json.cjs` is a dedicated module (but falls back to plain JSON.parse when no schema)

Each module was written independently, with slightly different security properties. The duplication means:

- Bug fixes must be applied in 3 places
- Inconsistent prototype pollution protection (SEC-CTX-001)
- Extra code loaded per process

**Suggested Fix:** Consolidate into `safe-json.cjs` as the single implementation. Fix the fallback behavior (SEC-LIB-005).

---

### N-005: Piscina Worker Pool Initialization Overhead

**Location:** `.claude/lib/code-indexing/index-manager.cjs`

**Problem:** The IndexManager constructor calls `calculateSafeMemoryConfig()` on every import, reading `os.totalmem()` and `os.freemem()`. It also imports Piscina, CodeParser, SemanticChunker, and VectorStore unconditionally at the top of the file -- even when running in BM25-only sync mode where none of these are needed.

**Impact:** ~50-100ms to load index-manager.cjs when only BM25 search is needed.

**Suggested Fix:** Guard all non-BM25 imports behind the embedding mode check:

```javascript
if (process.env.LANCEDB_EMBEDDING_MODE !== 'off') {
  // Only load heavy deps when embeddings are enabled
}
```

---

### N-006: Archive Directory in Git Repository

**Location:** `.claude.archive/` (estimated ~100+ MB), `.claude/hooks/_archive/`, `.claude/lib/_archive/`

**Problem:** Multiple archive directories exist within the repository:

- `.claude.archive/` - Contains old framework versions, reviewed repos
- `.claude/hooks/_archive/` - 45+ archived hooks
- `.claude/lib/_archive/` - 90+ archived modules

These contribute to repository size and clone time but are never used at runtime.

**Suggested Fix:**

1. Add archive directories to `.gitignore` or use `git-lfs` for large archives
2. Move archived code to a separate branch or tag
3. At minimum, ensure archives are excluded from glob/grep searches via `.gitignore`

---

## 4. Scalability Concerns

### What Breaks at 2x Scale

| Component                    | Current State   | At 2x Scale           | Breaking Point                     |
| ---------------------------- | --------------- | --------------------- | ---------------------------------- |
| Hook processes per tool call | 7-12            | Same (constant)       | Already at limit -- 600ms overhead |
| Memory files                 | 144 KB total    | 288 KB (~108K tokens) | Exceeds 50% context budget         |
| BM25 index                   | 7,182 chunks    | ~14,000 chunks        | ~100MB memory, nearing OOM         |
| JSONL log files              | Small (<100 KB) | Could reach MBs       | Append latency degrades            |
| Agent count                  | 49 agents       | ~100 agents           | Keyword maps need rewrite          |
| Test files                   | 328 files       | ~600+ files           | CI time doubles                    |
| Lib modules                  | ~100 active     | ~200 active           | Require resolution slows           |

### What Breaks at 10x Scale

1. **Memory files become unusable** at ~500 KB (375K tokens > full context window)
2. **BM25 index OOMs** at ~30,000 chunks without sharding
3. **Hook overhead becomes dominant** if more hooks are added (linear growth)
4. **Agent registry keyword matching** becomes O(n\*m) where n=agents, m=keywords
5. **Config loading** needs database-backed registry instead of file-per-agent

### Architectural Recommendations for Scale

1. **Hook Dispatcher Architecture** (Solves C-001 through C-005):
   - Single long-running process that loads all hooks as modules
   - Receives tool events via IPC or Unix socket
   - Dispatches to in-memory check functions
   - Eliminates per-hook process spawn overhead
   - Shared module cache across all checks

2. **Memory Tiering** (Solves C-003):
   - Hot tier: last 48 hours of entries (fits in context)
   - Warm tier: last 7 days (searchable via semantic match)
   - Cold tier: 30+ days (archived, only retrieved on explicit query)
   - The infrastructure exists (`memory-tiers.cjs`, `memory.db`) but is not the default path

3. **Index Sharding** (Solves I-003):
   - Split BM25 index by directory/module
   - Load only relevant shards for a search query
   - Use SQLite for term frequency storage instead of in-memory objects

4. **Dependency Splitting** (Solves N-001):
   - Core package: routing, hooks, memory, agents (~5 deps)
   - Indexing package: BM25, AST, vectors (~10 deps)
   - ML package: embeddings, transformers (~3 deps, very heavy)

---

## 5. Quick Wins (Can Be Done in < 1 Day)

| Fix                                                    | Effort | Impact                 | Issues Addressed |
| ------------------------------------------------------ | ------ | ---------------------- | ---------------- |
| Pre-compile Check 7 regexes                            | 30 min | ~10ms/Task             | N-003            |
| Lazy-load non-essential modules in user-prompt-unified | 1 hr   | ~50ms/prompt           | C-002            |
| Merge 3 PostToolUse(all) hooks into 1                  | 2 hrs  | ~100ms/tool call       | C-005            |
| Add memory file rotation at 20 KB                      | 2 hrs  | Context budget savings | C-003            |
| Guard heavy imports in index-manager behind mode check | 30 min | ~50ms load time        | N-005            |
| Move archived tests to tests/\_archive                 | 1 hr   | Cleaner test runs      | I-006            |

---

## 6. Priority Matrix

```
                    HIGH IMPACT
                        |
          C-001 (hooks) | C-003 (memory)
          C-004 (pre)   | C-005 (post)
          C-002 (UPS)   |
    ------+-------------+---------------
          |             | I-001 (dead code)
LOW       | N-003 (regex)| I-002 (config)
EFFORT    | N-005 (lazy) | I-003 (BM25)
          |             | I-005 (spawn)
                        |
                    LOW IMPACT
```

**Recommended Priority Order:**

1. C-003 (Memory rotation) -- Immediate context budget relief
2. C-005 (Merge PostToolUse hooks) -- 100ms savings per tool call
3. C-004 (Reduce PreToolUse all-hooks) -- 150ms savings per tool call
4. C-001 (Hook dispatcher architecture) -- Largest single improvement, most effort
5. C-002 (Lazy loading) -- Quick win for user prompt handling
6. I-001 (Dead code cleanup) -- Maintenance hygiene
7. I-003 (BM25 optimization) -- Scalability insurance

---

## Appendix A: Hook Execution Flow for a Typical Write Operation

```
User writes code via Write tool:

1. PreToolUse (matcher: "")
   [PROCESS 1] session-cleanup.cjs          ~50ms
   [PROCESS 2] execution-limit-monitor.cjs  ~50ms
   [PROCESS 3] tool-scope-validator.cjs     ~50ms

2. PreToolUse (matcher: "Edit|Write|NotebookEdit")
   [PROCESS 4] unified-creator-guard.cjs    ~80ms
   [PROCESS 5] unified-pre-write-hook.cjs   ~80ms
   [PROCESS 6] evolution-state-guard.cjs    ~50ms
   [PROCESS 7] research-enforcement.cjs     ~50ms
   [PROCESS 8] quality-gate-validator.cjs   ~50ms

3. PreToolUse (matcher: "Write")
   [PROCESS 9] conflict-detector.cjs        ~50ms

--- WRITE EXECUTES ---

4. PostToolUse (matcher: "")
   [PROCESS 10] metrics-collector-hook.cjs  ~50ms
   [PROCESS 11] error-tracker-hook.cjs      ~50ms
   [PROCESS 12] anomaly-detector.cjs        ~50ms

5. PostToolUse (matcher: "Edit|Write|NotebookEdit")
   [PROCESS 13] sync-memory-index.cjs       ~80ms
   [PROCESS 14] code-index-updater.cjs      ~80ms

TOTAL: 14 processes, ~820ms hook overhead for a single Write
```

## Appendix B: Module Dependency Tree (Most-Loaded)

Modules loaded in 5+ hook processes per tool call:

```
hook-input.cjs        -> loaded by ALL hooks (14/14 per Write)
event-bus.cjs         -> loaded by 8+ hooks
event-types.cjs       -> loaded by 8+ hooks
router-state.cjs      -> loaded by 5+ hooks
project-root.cjs      -> loaded by 6+ hooks
logger.cjs            -> loaded by 8+ hooks
atomic-write.cjs      -> loaded by 5+ hooks
state-cache.cjs       -> loaded by 4+ hooks
config-loader.cjs     -> loaded by 4+ hooks
  -> js-yaml           -> loaded transitively 4+ times
jsonl-utils.cjs       -> loaded by 5+ hooks
```

Each load is an independent `require()` from disk in a fresh process. Node.js module caching only works within a single process.

---

_End of Performance and Scalability Analysis_
