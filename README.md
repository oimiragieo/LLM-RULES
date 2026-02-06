# LLM-RULES (Agent Studio)

This repository is a **drop-in Claude Code agent ecosystem**: agents, hooks, workflows, schemas, prompts, and headless test harnesses.

The goal is simple: copy `.claude/` into another repo and get consistent routing, guardrails, and auditable diagnostics.

## What You Get

- **46 Specialized Agents**: Core, domain, specialized, and orchestrator agents (`.claude/agents/`)
- **427+ Reusable Skills**: Development, security, DevOps, scientific research, and more (`.claude/skills/`)
- **Agent-Skill Discovery System**: Central mapping of agents to skills with contextual loading (`.claude/context/config/agent-skill-matrix.json`)
- **Consolidated Hooks/Guards**: Unified routing and evolution guards with 75-80% latency reduction (`.claude/hooks/`)
- **Workflows + Runners**: 16+ enterprise workflows including security audit, consensus voting, swarm coordination (`.claude/workflows/`, `.claude/tools/`)
- **Schemas**: Structured artifact validation (`.claude/schemas/`)
- **Prompts**: Copy/paste prompts for UI (`.claude/prompts/`)
- **Headless Verification**: CI-friendly testing (`pnpm ship-readiness:headless:json`, `pnpm integration:headless:json`)
- **Memory System**: Persistent learnings, decisions, and issues across sessions (`.claude/context/memory/`)
- **Hybrid Lazy Code Search**: Instant ripgrep + optional semantic embeddings (no batch indexing required)
- **Spec-Kit Integration**: Complete feature set for requirements management with templates, skills, and automated quality validation
- **Worker Runtime (optional)**: Opt-in headless loop for maintenance/index/queue; emits heartbeat + metrics (see `.claude/docs/GETTING_STARTED.md`)
- **LanceDB-only Code Index**: Code indexing now uses LanceDB tables only (no JSON vector store)
- **ContextualMemory Read Path**: Memory reads go through ContextualMemory as the single source of truth
- **Blocking Hooks → Event Bus**: All blocking hooks emit events before exit for centralized observability

Notes:

- `.tmp/` contains experimental/vendor comparisons and is **not shipped** (gitignored).
- `.opencode*` / `.factory*` are **not part of the release** (gitignored/removed from tracked files).

## Quick Start (Copy Into Another Repo)

1. Copy `.claude/` into your target project.
2. (Optional) Copy `.cursor/` if you also support Cursor IDE.
3. **Initialize memory system** (recommended):

   ```bash
   pnpm run memory:init
   ```

   This creates the SQLite schema for the hybrid memory system. If you see errors about missing tables, run this command.

   If you need to reset memory/runtime/metrics state, use:

   ```bash
   # Soft reset (runtime and metrics only)
   pnpm run context:reset --scope soft --force

   # Memory reset (clears runtime, metrics, and memory files)
   pnpm run context:reset --scope memory --force
   pnpm run memory:init  # Required after memory reset

   # Full reset (memory scope + code index + registries)
   pnpm run context:reset --scope full --force
   pnpm run memory:init
   pnpm run code:index:reindex
   pnpm run routing:prototypes
   pnpm run agents:registry

   # Optional: Include LanceDB vector store
   pnpm run context:reset --scope memory --force --include-lancedb
   pnpm run memory:init
   ```

   **Note**: Without `--force`, the command runs in dry-run mode and shows what would be deleted without actually deleting anything.

4. **Build initial semantic index** (recommended):

   ```bash
   pnpm run memory:embeddings
   ```

   This fills LanceDB from existing memory files (Markdown + `patterns.json` + `gotchas.json`). After that, semantic search can use the full set.

5. **Generate routing artifacts** (recommended):

   ```bash
   pnpm run agents:registry
   pnpm run routing:prototypes
   pnpm run agents:catalog
   ```

   This builds the agent registry, routing prototypes, and agent catalog used by routing and discovery.

6. Open the project in Claude Code and run a normal request; routing + hooks + workflows apply automatically.

**What happens automatically:**

- Router analyzes your request and spawns appropriate specialized agents
- Agents discover and invoke relevant skills based on project type
- Contextual skills load automatically (e.g., Python skills when `.py` files detected)
- Enforcement hooks ensure quality gates and routing protocols

If you also want the repo’s CLI validation utilities (recommended), install deps:

```bash
pnpm install
```

## Hybrid Lazy Code Search (Instant, No Batch Indexing)

The system uses a **hybrid approach** combining fast text search (ripgrep) with optional semantic embeddings:

- **Instant**: 0.2-0.5 second response time for 40,000+ files
- **No upfront indexing**: Searches immediately without waiting hours
- **Lazy embeddings**: Background incremental updates as files are edited
- **Hybrid scoring**: Reciprocal Rank Fusion (RRF) combines text + semantic results

### Search Commands

```bash
# Search code instantly (ripgrep-based)
pnpm search:code "authentication logic"
pnpm search:code "export class User"
pnpm search:code "import react"

# View project structure
pnpm search:structure

# Get file content with line numbers
pnpm search:file src/auth.ts 1 50
```

### How It Works

1. **Pre-prompt hook** analyzes structure using ripgrep (0.5s)
2. **Search** uses ripgrep for instant text matching
3. **Optional embeddings** provide semantic similarity (background)
4. **Post-edit hook** incrementally embeds changed files

### Configuration

```bash
# Disable semantic search (text only, fastest)
HYBRID_EMBEDDINGS=off

# Enable semantic search (requires LanceDB)
HYBRID_EMBEDDINGS=on
```

### Comparison with Batch Indexing

| Approach        | Startup       | First Search | Memory     | Disk       |
| --------------- | ------------- | ------------ | ---------- | ---------- |
| **Old Batch**   | 2+ hours      | Instant      | 8-16GB     | 2-5GB      |
| **Hybrid Lazy** | **0 seconds** | **0.5s**     | **<500MB** | **<100MB** |

## Memory System Setup

The memory system uses a **hybrid architecture** combining three storage layers:

- **File-based storage**: Markdown files (`.claude/context/memory/`) for learnings, decisions, and issues
- **SQLite entity graph**: Structured relationships (`.claude/data/memory.db`) for entity/relationship queries
- **LanceDB vector search**: Semantic search (embedded, no server required) for similarity-based retrieval

### Initialization

After copying `.claude/` to your project, initialize the memory database:

```bash
pnpm run memory:init
```

This creates the SQLite schema at `.claude/data/memory.db`. If you see errors about missing tables, run this command.

Then build the initial semantic index:

```bash
pnpm run memory:embeddings
```

To keep embeddings current on edits, set `MEMORY_EMBED_ON_EDIT=on` (and optionally `MEMORY_EMBED_ON_EDIT_TIMEOUT_MS=30000`) in your `.env`.

**Note**: The system uses Node's built-in `node:sqlite` (no native dependencies) and embedded LanceDB (no Docker/server required).

### LanceDB Embeddings (Optional)

For semantic search with LanceDB, the system uses local embeddings via `@xenova/transformers`. This uses `sharp` internally and requires `sharp`’s native binary to be built/available.

If LanceDB logs that it “failed to load” the embedding model and falls back to a mock embedder, run:

```bash
pnpm rebuild sharp
```

Or do a fresh install:

```bash
pnpm install
```

**Note**: With `pnpm` v10+, dependency build scripts can be blocked by default. Ensure `pnpm-workspace.yaml` includes `sharp` under `onlyBuiltDependencies`, and if `pnpm` prompts for build approvals run `pnpm approve-builds` and explicitly approve `sharp` so the native binary is actually built.

For detailed memory system documentation, see `.claude/docs/MEMORY_SYSTEM.md`.

## Environment Configuration

All environment-specific settings are managed through the `.env` file. This file is **not committed to version control** (see `.gitignore`) to protect sensitive data.

### Setup

1. **Copy the example file**:

   ```bash
   cp .env.example .env
   ```

2. **Customize for your environment**:

   ```bash
   # Edit .env and adjust variables for your setup
   # (see .env.example for full documentation)
   ```

### Common Variables

| Variable              | Purpose                   | Default       | Options                                |
| --------------------- | ------------------------- | ------------- | -------------------------------------- |
| `AGENT_STUDIO_ENV`    | Environment selection     | `development` | `development`, `staging`, `production` |
| `PARTY_MODE_ENABLED`  | Multi-agent collaboration | `false`       | `true`, `false`                        |
| `ELICITATION_ENABLED` | Requirements gathering    | `false`       | `true`, `false`                        |
| `REFLECTION_ENABLED`  | Quality & learning hooks  | `true`        | `true`, `false`                        |
| `DEBUG_HOOKS`         | Verbose hook logging      | `false`       | `true`, `false`                        |

### Staging Environment

For testing configurations in isolation, use the staging environment:

1. Set `AGENT_STUDIO_ENV=staging` in `.env`
2. Initialize: `node .claude/tools/cli/init-staging.cjs`
3. Verify: `node --test tests/staging-smoke.test.mjs`

**See also**: `.claude/docs/STAGING_ENVIRONMENT.md` for complete staging setup.

### Reference

**Full documentation**: `.env.example` (contains all available variables with descriptions)

## Production Validation (Headless, Auditable)

These are the recommended “ship it” checks. They write reports/results under `.claude/context/` (which is gitignored).

```bash
# Runs baseline suites + denial + observability bundle, writes report/results JSON.
pnpm ship-readiness:headless:json

# Exercises the agent framework headlessly (core agents) and writes report/results JSON.
pnpm integration:headless:json
```

Important:

- Treat the `workflow_id` printed by each headless command as the source of truth for follow-on verification.
- Use the corresponding verify tool with that exact id:
- Before release, run `pnpm lint` and `pnpm test:framework` (or `pnpm test`) to catch regressions.

```bash
node .claude/tools/verify-ship-readiness.mjs --workflow-id <workflow_id> --json
node .claude/tools/verify-agent-integration.mjs --workflow-id <workflow_id> --expected-agents core --json
```

## Prompts (Claude Code UI)

Use these when you want a user-like UI run (not CI):

- `.claude/prompts/ship-readiness.md`
- `.claude/prompts/ship-readiness-validation-headless.md` (headless-first prompt)
- `.claude/prompts/agent-framework-integration.md`

For stability, prefer the **headless harnesses** above. UI multi-agent orchestration can hit platform memory limits depending on model/context.

## Documentation

**Key Guides:**

- **Getting Started**: `.claude/docs/GETTING_STARTED.md`
- **Agents System**: `.claude/docs/AGENTS.md` (45 agents, roles, and usage)
- **Agent-Skill Discovery**: `.claude/docs/AGENT-SKILL-DISCOVERY.md` (how agents find and use skills)
- **Skills System**: `.claude/docs/SKILLS.md` (426+ skills organized by category)
- **Router Protocol**: `.claude/docs/ROUTER_PROTOCOL.md` (routing and enforcement)
- **Memory System**: `.claude/docs/MEMORY_SYSTEM.md` (persistence across sessions)
- **Self-Evolution**: `.claude/docs/SELF_EVOLUTION.md` (creating agents and skills)

**Quick References:**

- **Agent-Skill Matrix**: `.claude/context/config/agent-skill-matrix.json` (central mapping)
- **Skill Catalog**: `.claude/context/artifacts/skill-catalog.md` (complete skill list)
- **Router Keywords**: `.claude/docs/ROUTER_KEYWORD_GUIDE.md` (intent routing)
- **Pre-commit security lint**: `.claude/docs/SECURITY_LINT.md` (exclusions, configuration, bypass)

## Observability / Debugging

Headless runs write artifacts under:

- `.claude/context/reports/` (human-readable)
- `.claude/context/artifacts/` (structured JSON/logs)
- `.claude/context/runtime/` (run state; ephemeral)

If you launch Claude Code in debug mode (`claude -d`), you’ll also get a platform debug log path. Many tools support passing it through where applicable.

Optional env flags (for deeper local debugging):

```powershell
$env:CLAUDE_OBS_STORE_PAYLOADS='1'
$env:CLAUDE_OBS_FAILURE_BUNDLES='1'
```

## Repo Hygiene (Do Not Commit Run Artifacts)

This repo intentionally ignores `.claude/context/**` runtime output. You can sanity-check:

```bash
git ls-files -- .claude/context/artifacts/testing .claude/context/reports
```

Expected output: empty.

## Contributing / Development

Useful commands:

```bash
pnpm format
pnpm test
pnpm validate
pnpm validate:docs-links
node .claude/tools/workflow-dryrun-suite.mjs
```

See also: `GETTING_STARTED.md` and `CHANGELOG.md`.

## Recent Updates (v2.3.0 - Spec-Kit Integration)

- **Specification Management**: IEEE 830-compliant template with token replacement and validation
- **Implementation Planning**: Phase 0 research-first workflow with 4-gate constitution checkpoint
- **Task Organization**: Epic → Story → Task hierarchy with Enabler-first pattern (SAFe)
- **Quality Validation**: Automated checklists combining IEEE 1028 + contextual items
- **Performance**: 88% faster specification creation, 90% faster task organization, 100% consistency
- **Security**: Comprehensive review with 5 findings addressed, token whitelist enforcement, path validation

### Previous Updates (v2.1.0)

- **Security Hardening**: SEC-007 safe JSON parsing, SEC-008 fail-closed patterns
- **Performance**: Unified `routing-guard.cjs` (80% spawn reduction), `unified-evolution-guard.cjs` (75% spawn reduction)
- **Code Quality**: Shared `hook-input.cjs` utility eliminates 2000+ lines of duplication
- **Documentation**: CLAUDE.md synchronized with codebase (zero drift)
