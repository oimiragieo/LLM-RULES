# Agent Studio

Portable multi-agent ecosystem for Claude Code.

Agent Studio packages agents, skills, rules, hooks, schemas, and validation tooling into a single repo that can run directly or be dropped into another project.

If you want a local-first, reproducible agent stack with strict validation and hybrid code search, this is it.

## Quick Links

`Getting Started` · `.claude/docs/GETTING_STARTED.md`  
`Architecture` · `.claude/docs/ARCHITECTURE.md`  
`Developer Workflow` · `.claude/docs/DEVELOPER_WORKFLOW.md`  
`Hooks Reference` · `.claude/docs/HOOKS_REFERENCE.md`  
`Memory System` · `.claude/docs/MEMORY_SYSTEM.md`  
`Code Indexing` · `.claude/docs/CODE_INDEXING_DESIGN.md`

## Quick Start (TL;DR)

Runtime: Node `>=22.5.0`, pnpm.

```bash
pnpm install
pnpm memory:init
pnpm agents:registry
pnpm routing:prototypes
pnpm agents:catalog
pnpm code:index:reindex    # builds BM25 + semantic vector index (~12 min with GPU)
```

Search immediately after indexing:

```bash
pnpm search:code "authentication logic"   # hybrid text + semantic search (~5ms cached)
pnpm search:compress "how routing works"   # search + compress + dedup pipeline
pnpm search:structure                      # project structure + deps + Mermaid diagram
pnpm search:tokens .claude/lib             # token budget analysis + refactor recommendations
pnpm search:file .claude/lib/code-indexing/hybrid-lazy-indexer.cjs 1 60
```

Text search (`pnpm search:code`) works instantly even without the full index build.
Running `code:index:reindex` adds semantic ranking for concept-level queries.
Repeated queries are auto-cached (~5ms hit vs ~800ms miss). BM25 index auto-updates on file edits.

`search:compress` combines search + adaptive compression + memory dedup into a single command — use it when a topic spans many files and you need a compressed summary.

`search:tokens` shows file/directory sizes, token estimates, and recommends splitting oversized source files (>15K tokens) into smaller modules for better AI agent readability.

## Current Footprint

- Agents: 62 files
- Skills: 454 `SKILL.md` definitions
- Rules: 105 docs
- Schemas: 147 `*.schema.json`
- Commands: 102 `.claude/commands/*.md`

## Repository Layout

```text
.claude/   # agents, skills, rules, hooks, tools, schemas, docs
.cursor/   # Cursor-specific assets
scripts/   # validation and maintenance scripts
tests/     # project and framework tests
.tmp/      # local debug/temp artifacts (not release docs)
```

## For External Contributors

Use this path if you are proposing changes to the ecosystem itself.

1. Install and bootstrap:

```bash
pnpm install
pnpm memory:init
```

2. Run baseline validation:

```bash
pnpm validate
pnpm validate:full
pnpm validate:schemas
pnpm validate:commands
pnpm validate:routing
```

3. Run tests relevant to your change:

```bash
pnpm test
pnpm test:framework
pnpm test:tools
pnpm test:code-indexing
```

4. Enforce style before shipping:

```bash
pnpm lint
pnpm format:check
```

Notes:

- Prefer `package.json` scripts as the source of truth for runnable workflows.
- Archived test suites are intentionally stubbed in scripts (see script output messages).

## For Internal Agent Operators

Use this path if you are running Agent Studio as an operational control plane.

1. Keep registries and routing artifacts fresh:

```bash
pnpm agents:registry
pnpm skills:index
pnpm manifest:generate
pnpm routing:prototypes
```

2. Track memory and operational health:

```bash
pnpm memory:status
pnpm memory:health
pnpm worker:summary
```

3. Run integration checks before larger pipeline runs:

```bash
pnpm integration:headless:json
pnpm validate:full
```

4. Reset context safely when sessions get noisy:

```bash
pnpm context:reset --scope soft --force
```

## Memory System (Current Operating Model)

The memory path now supports two operating modes for spawned agents:

- `MEMORY_MODE=hybrid` (default): legacy memory injection (`gotchas/patterns/decisions/...`).
- `MEMORY_MODE=observational`: injects `observations_summary.md` + recent rows from `observations.jsonl`.
- `OBSERVATIONAL_MEMORY_ENABLED=off`: kill switch that forces hybrid mode.

Additional controls:

- Section token budgets:
  - `MEMORY_SUMMARY_BLOCK_MAX_TOKENS` (default `400`)
  - `MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS` (default `400`)
  - `MEMORY_TIER_B_MAX_TOKENS` (default `400`)
- Session compaction:
  - `OBSERVATIONS_COMPACT_ON_SESSION_END=on` (default)
  - `OBSERVATIONS_COMPACT_MAX=50` (default)
- Contradiction tagging is deferred by default:
  - `OBSERVATIONS_CONTRADICTION_ENABLED=off`
  - `OBSERVATIONS_CONTRADICTION_MAX_AGE_DAYS=90`

Primary reference:

- `.claude/docs/MEMORY_SYSTEM.md`

Operational gates:

- `pnpm run test:memory:ci`
- `pnpm run metrics:memory:slo:ci`
- `pnpm run metrics:memory-cache:ci`
- `pnpm run test:framework`

CI workflows:

- `.github/workflows/memory-ci.yml`
- `.github/workflows/memory-mvp-gate.yml`

## Hybrid Lazy Code Search

Agent Studio uses a hybrid lazy search model:

- Instant text retrieval via ripgrep (no upfront full indexing)
- Semantic vector ranking via fastembed (BGE-small) with GPU acceleration
- Reciprocal Rank Fusion (RRF) to combine lexical and semantic candidates
- Subprocess embedding isolation to prevent ONNX Runtime memory leaks

Setup:

```bash
# Build the full index (BM25 text + semantic vectors)
pnpm code:index:reindex    # ~12 min with GPU, ~17 min CPU-only

# Enable semantic search in .env
HYBRID_EMBEDDINGS=on       # text + semantic ranking (default after setup)
EMBED_SUBPROCESS=on        # ONNX memory leak workaround (default)
```

Without `code:index:reindex`, text search still works but semantic/concept queries
(e.g. "authentication flow for refresh tokens") will return poor results.

Guidance:

- Use `pnpm search:code` for broad discovery and ranked matches.
- Use `pnpm search:structure` for structure-oriented lookup.
- Use `rg` directly for strict literal/symbol matches and exact filters.

### Search Mode Comparison

| Tool/Mode                        | What it does best                                   | Latency profile                                                      | Determinism                 | Token/output profile                    |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | --------------------------- | --------------------------------------- | ----------------------------------------------- |
| `pnpm search:code "query"`       | Conceptual discovery and ranked candidates          | Fast (`~0.2-0.7s` on this repo)                                      | High                        | Compact ranked output (good for agents) |
| `pnpm search:code "ast:pattern"` | Structural intent with optional ast-grep refinement | Moderate (`~0.18s` warm daemon baseline, higher for explicit `ast:`) | High if pattern is explicit | Compact, structure-aware candidates     |
| `pnpm search:structure`          | Repo map, entrypoints, dependency orientation       | Fast one-shot structure pass                                         | High                        | Very low output volume                  |
| `rg -F "literal"`                | Exact symbol/literal lookup                         | Fastest (`~15-35ms` measured)                                        | Highest                     | Larger raw output unless scoped         |
| `rga "query"`                    | Cross-file search (pdf/docs/archives)               | Slower than `rg`                                                     | High                        | Can be noisy; scope early               |
| `rg                              | rga -> fzf`                                         | Human interactive narrowing/selection                                | Interactive                 | Operator-dependent                      | Great for manual triage, not default agent path |

Selection contract:

- Agents should default to `pnpm search:code` for discovery.
- Use `rg -F` for exact anchors before edits/refactors.
- Use `ast:` only when the question is structural (shape/pattern), not plain text intent.
- Keep `fzf` optional and human-in-the-loop; do not make it a hard dependency of automated wrappers.

### Perf Runbook (Daemon + Prewarm)

Use daemon mode for repeated searches in active sessions.

```bash
# Start/inspect daemon
pnpm search:daemon:start
pnpm search:daemon:status

# Prewarm rg + LanceDB + semantic path
pnpm search:daemon:prewarm

# Run searches (daemon on by default)
pnpm search:code "authentication logic"

# Stop daemon when done
pnpm search:daemon:stop
```

### Query Cache and BM25 Incremental Updates

Repeated or semantically similar queries are served from a local cache, avoiding redundant embedding lookups. The cache uses cosine similarity to match queries, so slight rephrasings still hit the cache.

After file edits, the BM25 text index updates incrementally (no full reindex needed).

| Variable                  | Default  | Purpose                                              |
| ------------------------- | -------- | ---------------------------------------------------- |
| `SEARCH_CACHE_ENABLED`    | `on`     | Semantic query cache (set to `off` to disable)       |
| `SEARCH_CACHE_TTL_MS`     | `300000` | Cache entry TTL (5 min)                              |
| `SEARCH_CACHE_SIMILARITY` | `0.95`   | Cosine threshold for cache hit                       |
| `BM25_INCREMENTAL_UPDATE` | `on`     | Post-edit BM25 fast update (set to `off` to disable) |

Disable daemon or semantic mode when you need deterministic baselines:

```bash
# Direct (no daemon transport)
HYBRID_SEARCH_DAEMON=off pnpm search:code "authentication logic"

# Text-only (skip semantic ranking)
HYBRID_EMBEDDINGS=off pnpm search:code "authentication logic"

# Force semantic ranking
HYBRID_EMBEDDINGS=on pnpm search:code "authentication logic"
```

Daemon tuning toggles:

```bash
# Auto-prewarm on daemon startup
HYBRID_DAEMON_PREWARM=true pnpm search:daemon:start

# Idle timeout (ms) before daemon auto-exit
HYBRID_DAEMON_IDLE_MS=600000 pnpm search:daemon:start

# Custom daemon port
HYBRID_DAEMON_PORT=47653 pnpm search:daemon:start
```

Expected latency profile on this repo (Windows, measured):

- Cold daemon first query (no prewarm): ~1.35s average
- First query after `search:daemon:prewarm`: ~0.40s average
- Warm repeated daemon queries: ~0.18-0.19s steady state
- Direct mode (`HYBRID_SEARCH_DAEMON=off`) repeated CLI calls: ~0.73s average

## Memory + Search + Token Saver (Simple Flow)

If you only remember one thing, remember this:

1. **Search finds candidates**
2. **Memory keeps what matters**
3. **Token saver compresses only when context gets too large**

### Step-by-step

1. Start with search:
   - Run `pnpm search:code "your query"` to find likely files/snippets quickly.
2. Read only the best matches:
   - Open a small set of top results instead of dumping whole folders.
3. If the result set is still too big:
   - Use `Skill({ skill: 'token-saver-context-compression' })` to compress/summarize evidence.
4. Save useful outcomes to memory:
   - Store durable findings (patterns, gotchas, decisions, issues).
5. On future spawns:
   - The spawn prompt injects memory/RAG evidence and expects citation IDs like `[mem:...]` and `[rag:...]`.

### When to use token saver vs normal flow

- Use normal flow (default):
  - Small task, few files, short snippets.
- Use token saver:
  - Many search hits, long logs, or large cross-file synthesis.
  - You need a compact evidence pack for handoff/review.

### Why this is the default design

- Search is fast and good for discovery.
- Memory prevents relearning the same lessons.
- Token saver is a pressure valve, not the first step.
- This keeps prompts smaller while staying grounded in evidence.

### Minimal operator recipe

```bash
# 1) Discover
pnpm search:code "auth token refresh bug"

# 2) If context is too large, compress (inside agent flow via Skill)
# Skill({ skill: 'token-saver-context-compression' })

# 3) Persist useful outcomes (via MemoryRecord or write paths that trigger memory sync hooks)

# 4) Validate memory/search pipeline health
pnpm test:memory:ci
pnpm metrics:memory:slo:ci
```

## Autonomous Quality Daemon (New)

This repo is still session/CI-driven, but now includes a background quality daemon you can run independently.

What it does:

- Runs the artifact regression gate on a timer
- Writes heartbeat/state to `.claude/context/runtime/artifact-quality-daemon-state.json`
- Opens/resolves system remediation events in `.claude/context/runtime/remediation-queue.jsonl`

Commands:

```bash
# One cycle now
pnpm quality:daemon:run-once

# Continuous loop (foreground)
pnpm quality:daemon:start

# Inspect daemon heartbeat/state
pnpm quality:daemon:status
```

Key env var:

- `ARTIFACT_QUALITY_DAEMON_INTERVAL_MS` (default `300000`)

## Drop-In Setup (Use In Another Repo)

1. Copy `.claude/` into the target repository.
2. Install dependencies required by the copied tooling.
3. Initialize core artifacts:

```bash
pnpm memory:init
pnpm agents:registry
pnpm routing:prototypes
```

## Environment

```bash
cp .env.example .env
```

Common controls:

- `AGENT_STUDIO_ENV`
- `REFLECTION_ENABLED`
- `DEBUG_HOOKS`
- `HYBRID_EMBEDDINGS`

See `.env.example` and `.claude/docs/@ENVIRONMENT_CONFIG.md`.

## Windows Search Tooling (Scoop)

If you want fast local terminal search tooling on Windows (non-admin), install `rga` and `fzf` via Scoop.

Install Scoop (non-admin PowerShell):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
```

Install ripgrep-all + fuzzy finder + ast-grep:

```powershell
# Install rga (ripgrep-all)
scoop install rga

# Install fzf
scoop install fzf

# Install ast-grep (includes `sg` shim)
scoop install ast-grep
```

Verify install:

```powershell
rga --version
fzf --version
sg --version
```

Runtime discovery behavior:

- Search wrappers auto-discover binaries from `node_modules/.bin`, Scoop shims, and PATH.
- If your shell PATH is stale after install, wrappers still resolve common Scoop shim paths.
- You can force specific binaries with env overrides (`RG_BIN`, `AST_GREP_BIN`, `RGA_BIN`, `FZF_BIN`).

### fzf Workflows (Interactive Narrowing)

`fzf` is most useful as an interactive selector on top of `rg`/`rga` output.
It improves usability and reduces noise, but does not replace search engines.
For AI/automation, keep `fzf` optional; interactive prompts are non-deterministic for unattended runs.

Quick file+line picker with preview:

```powershell
rg --line-number --no-heading --color=always "auth|token|session" . `
  | fzf --ansi --delimiter ":" `
    --preview "bat --color=always --style=numbers --highlight-line {2} {1}"
```

Search inside office/pdf/archive content (via `rga`) and narrow interactively:

```powershell
rga --line-number --no-heading --color=always "invoice|receipt|policy" . `
  | fzf --ansi --delimiter ":" `
    --preview "bat --color=always --style=numbers --line-range=:300 {1}"
```

Advanced interactive ripgrep launcher (`fzf` reload pattern):

```bash
: | rg_prefix='rg --column --line-number --no-heading --color=always --smart-case' \
  fzf --ansi --disabled \
      --bind 'start:reload:$rg_prefix ""' \
      --bind 'change:reload:$rg_prefix {q} || true'
```

AST + RG + fzf (structural triage workflow):

```powershell
# 1) Structural file candidates
ast-grep -p "function `$NAME(`$$$) { `$$$ }" --lang javascript --files-with-matches . `
  | fzf --ansi --delimiter ":" `
    --preview "bat --color=always --style=numbers --line-range=:220 {}"

# 2) Then run exact literal checks inside chosen files
rg -F "function " <chosen-file>
```

Wrapper policy:

- Keep `pnpm search:code` non-interactive and deterministic for agents.
- Offer `fzf` as an optional terminal UX layer for humans doing investigative triage.
- Prefer `pnpm search:structure` or `pnpm search:code "ast:..."` for agent structural queries; use `sg` directly for manual structural audits.

Sources:

- `https://scoop.sh/`
- `https://github.com/phiresky/ripgrep-all?tab=readme-ov-file#scoop`
- `https://github.com/junegunn/fzf` (interactive ripgrep + reload)
- `https://junegunn.github.io/fzf/tips/ripgrep-integration/` (official rg+fzf pattern)
- `https://github.com/phiresky/ripgrep-all` (rga + fzf integration notes)
- `https://github.com/phiresky/ripgrep-all/wiki/fzf-Integration` (`rga-fzf` notes)
- `https://ast-grep.github.io/guide/pattern-syntax.html` (ast-grep pattern language)
- `https://ast-grep.github.io/reference/cli.html` (ast-grep CLI options)
- `https://github.com/sharkdp/bat` (fzf preview examples)

## Operational Notes

- `.claude/context/` stores runtime artifacts and persistent operational memory.
- `.tmp/` contains temporary/debug outputs and should not be treated as product documentation.
- Schema and command validation should be treated as blocking gates for release-quality changes.
