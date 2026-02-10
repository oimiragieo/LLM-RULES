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
```

Search immediately (no batch indexing wait):

```bash
pnpm search:code "authentication logic"
pnpm search:structure
pnpm search:file .claude/lib/code-indexing/hybrid-lazy-indexer.cjs 1 60
```

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

## Hybrid Lazy Code Search

Agent Studio uses a hybrid lazy search model:

- Instant text retrieval via ripgrep (no upfront full indexing)
- Optional semantic ranking in the background
- Reciprocal Rank Fusion (RRF) to combine lexical and semantic candidates

Configuration:

```bash
HYBRID_EMBEDDINGS=off   # text-only, fastest startup
HYBRID_EMBEDDINGS=on    # text + semantic ranking (requires LanceDB path)
```

Guidance:

- Use `pnpm search:code` for broad discovery and ranked matches.
- Use `pnpm search:structure` for structure-oriented lookup.
- Use `rg` directly for strict literal/symbol matches and exact filters.

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

Install ripgrep-all + fuzzy finder:

```powershell
# Install rga (ripgrep-all)
scoop install rga

# Install fzf
scoop install fzf
```

Verify install:

```powershell
rga --version
fzf --version
```

Sources:

- `https://scoop.sh/`
- `https://github.com/phiresky/ripgrep-all?tab=readme-ov-file#scoop`

## Operational Notes

- `.claude/context/` stores runtime artifacts and persistent operational memory.
- `.tmp/` contains temporary/debug outputs and should not be treated as product documentation.
- Schema and command validation should be treated as blocking gates for release-quality changes.
