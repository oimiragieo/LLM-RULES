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
`Telegram Integration` · `.claude/docs/TELEGRAM_ARCHITECTURE.md`

## Telegram Integration

Agent Studio includes a background channel daemon that monitors Telegram and responds to messages using Claude. Inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) and Claude Code's KAIROS assistant mode.

### Quick Start

```bash
# 1. Configure (one-time)
# Add to your .env:
TELEGRAM_BOT_TOKEN=<token from @BotFather>
TELEGRAM_OWNER_ID=<your user ID from @userinfobot>
TELEGRAM_ALLOWED_USERS=<your user ID>
CHANNEL_AUTO_START=true

# 2. Verify config
/setup-telegram

# 3. Start monitoring
/enable-telegram

# 4. Stop monitoring
/disable-telegram

# 5. Restart daemon (without killing Claude session)
/restart-telegram
```

### Features

- **Zero-cost idle** — long-polls Telegram, only calls Claude when a message arrives
- **3-tier memory** — chat history, session summaries, persistent user profiles
- **Dream consolidation** — KAIROS-style 4-phase memory synthesis (Orient → Gather → Consolidate → Prune)
- **Context rot protection** — auto-detects and rotates sessions transparently
- **Task execution** — ask the bot to run code, check git, run tests via headless Claude
- **25 bot commands** — `/help`, `/status`, `/memory`, `/dream`, `/tasks`, `/code`, `/usage`, `/insights`, `/personality`, `/schedule`, `/export`, `/pair`, and more
- **`/code` mission-aware coding** — routes coding tasks through skill classification (16 agent types), builds feature specs, injects TDD workflow, grades results 0-100 against alignment rules
- **Skill extraction** — learns from completed tasks, auto-injects matching patterns into future prompts
- **Ralph loops** — iterative verify/fix execution (`[RALPH]` tag), max 5 iterations
- **Ultrawork parallel** — splits tasks into concurrent subtasks (`[ULTRAWORK]` tag)
- **Multi-model routing** — haiku/sonnet/opus selected automatically by message complexity
- **"While you were away" recap** — summarizes what happened when you return after being idle
- **HTTP API** — `http://127.0.0.1:3101/status`, `/send`, `/history`, `/memory`, `/dream`
- **A2A ready** — router can send messages and delegate tasks via the daemon's HTTP API
- **Webhook source** — `POST /webhook` endpoint for GitHub, CI, and external event ingestion
- **Proactive mode** — KAIROS tick engine with 15s heartbeat for scheduled messages and task progress streaming
- **Multi-platform ready** — Discord, Slack, and Web widget sources planned (platform-agnostic core)

### Voice Pipeline (Optional)

```bash
# Add TTS keys to .env:
ELEVENLABS_API_KEY=<key>      # or OPENAI_API_KEY for fallback
# Verify: /setup-telegram-voice
# Enable: /enable-telegram-voice
```

Full docs: `.claude/docs/TELEGRAM_ARCHITECTURE.md`

## Recent Changes

### Prompt Cache Optimization (Zylos-inspired)

- **Envelope fingerprint**: Stable hash across spawns of same agent type (excludes per-spawn basePrompt). Enables cache hits for tools/skills/safety prefix.
- **Memory query batch cache**: 60s file-based cache prevents redundant LanceDB/SQLite queries on burst spawns
- **Configurable memory cap**: `MEMORY_INJECTION_MAX_CHARS` env var (default 3600, raise to 8000+)

### Phase 10 — Paper-Inspired: Dual-Level Indexing + Memory Versioning

- **Dual-level skill+agent index**: 339 skill + 119 agent prototypes in shared vector space. Retrieve N=50, collapse to K=5 unique agents via skill-to-agent owner trace (+19.4% recall, arXiv:2511.01854)
- **Memory version links**: `supersedes` + `archived` fields on pattern/gotcha entries. Semantic matches create version chains instead of silent drops (arXiv:2603.19595)

### Phase 9 — Routing Recalibration

- **Semantic-first routing**: Embedding-based routing promoted to primary (`ROUTING_PRIORITY=semantic`); keyword classification demoted to metadata/tiebreaker
- **Hierarchical routing ON by default**: 119 agents grouped into 9 domain sub-routers (`HIERARCHICAL_ROUTING=on`)
- **Model router wired**: Dynamic haiku/sonnet/opus selection based on complexity + budget (`MODEL_ROUTER_ENABLED=on`)
- **Intent feedback loop closed**: Success/failure recorded per intent, read back into routing weights
- **Guard overhead reduced**: 2 redundant checks removed, 5 advisory hooks converted to async

### Post-Phase 8 — Audit Fixes

- **Consolidation wiring**: Connected Dream-equivalent pipeline (shouldConsolidate → acquireLock → consolidate → mtime stamp) in session-end hook — modules were built but never called
- **Flat-file rotation fix**: `parseSections()` line-based fallback prevents 572KB bloat recurrence
- **6 unreachable agents routed**: Added 22 flat routing keywords for product/business agents
- **Cleanup**: Deleted 2 duplicate hooks, 1 orphaned workflow, fixed stale agent count

### Phase 8 — Memory Consolidation (Dream-inspired)

- **Index discipline**: 25KB/200-line dual caps on markdown memory files, [PERMANENT] section preservation, automatic archival with warning lines, memory health reporting (16 tests)
- **Daily log + consolidation**: Append-only timestamped daily logs at `logs/YYYY/MM/YYYY-MM-DD.md`, 4-phase Dream-inspired consolidation (Orient/Gather/Consolidate/Prune), heuristic keyword extraction, idempotent processing with manifest tracking, session-end hook integration (48 tests)
- **Mtime lock + session trigger**: CC-style mtime-as-timestamp lock file, PID-based holder tracking with 60min stale detection, 24h time gate + 5-session count gate + 10min scan throttle, rollback on failure (28 tests)
- **Cross-area integration**: Full cycle (log/trigger/consolidate/prune), lock contention, failure rollback, MemoryRecord coexistence, STM/MTM/LTM backward compatibility, first-run scenario (13 tests)
- **Source**: 4 patterns adopted from Claude Code's Dream memory consolidation system

### Phase 7 — Security & Advanced Integration

- **Security hardening**: Case-normalized path comparison for case-insensitive filesystems, UNC path blocking (NTLM leak prevention), URL-encoded/backslash traversal detection, CC dangerous-pattern alignment with word-boundary matching, compound command analysis (single `&`, `$(...)`, backtick substitutions) (76 tests)
- **Hook enhancements**: `updatedInput` for bash safety prefixes (`set -euo pipefail` injection on unsafe multi-line scripts), `suppressOutput` on security blocks to prevent context inflation, denial-based routing feedback with agent suggestions after repeated tool denials (10 tests)
- **Agent enhancements**: `disallowedTools` field (excludes tools from prompt assembly with conflict resolution), `mcpServers` scoping (limits MCP visibility per agent), `fork_eligible` boolean field in agent schema (29 tests)
- **Cross-area integration**: Case-normalized blocking + cache stability, denial tracking to routing feedback end-to-end, suppressOutput context inflation prevention, agent schema round-trip (14 tests)

### Phase 6 — Prompt Cache & Context Intelligence

- **Prompt cache optimization**: Alphabetical tool/skill sorting, section memoization, duplicate contract elimination, cache-break-detector with SHA-256 hashing (45 tests)
- **Context management**: Pre-compact activeFiles persistence, threshold alignment with CC auto-compact at 93.5%, microcompact detection, circuit breaker (23 tests)
- **Cross-area integration**: Cache stability, tool change isolation, combined monitor output, prefix hash stability (10 tests)

### Phase 5 — Foundation & Performance

- **Rules compression**: CLAUDE.md + rules 66,374 to 36,679 chars (-45%), file merges, individual compression, frontmatter scoping (70 tests)
- **Hook overhaul**: 25 hooks to async, 63 timeout_ms additions, 3 deduplications, 2 consolidation bundles, 5 startup sentinels (142 tests)
- **New hook events**: SubagentStart (Iron Law validator), PermissionDenied (denial logger), SessionStart (watchPaths) (193 tests with cross-area)

### Phase 4 — Hermes Assimilation (Competitive Parity)

- **Intelligent runtime**: Cost pricing table with real $/MTok rates and auto-downgrade (opus->sonnet->haiku), flight recorder redaction with SENSITIVE_KEYS, mixture-of-agents consensus tool (96 tests)
- **Autonomous skills**: Skill auto-creator from session transcripts with Jaccard similarity and security scanning, SQLite FTS5 full-text search over session JSONL logs (79 tests)
- **Execution infrastructure**: Process registry with spawn/stop/checkpoint/restore and stdout RingBuffer, plugin tool registration with manifest schema extension (55 tests)
- **Cross-area integration**: Budget-aware background tasks, redacted log secrets, skill creation with plugin tool refs, cost-to-budget flow (20 tests)
- **Source**: 8 high-value features assimilated from nousresearch/hermes-agent (~20K LOC analyzed)

### Phase 3 — Self-Evolving Skills, GitHub Integration, Nomenclature & Production Audit

- **Self-evolving skills**: Usage tracking, pattern detection, suggestion generation, evolution triggers (91 tests)
- **GitHub integration**: CLI client wrapping `gh`, webhook simulator, mention parser, task dispatcher, CI status reporter (152 tests)
- **Nomenclature cleanup**: `droid` → `agent`, `.factory-plugin` → `.claude-plugin` across plugin system
- **Production audit**: Fixed all missing hooks (62 verified), replaced stub scripts, wired 32 unreachable agents to flat routing, fixed 7 misrouted keywords, fixed broken imports, added smoke tests for 14 untested modules (178 tests)

### Phase 2 — Model Routing, Readiness CLI, Knowledge Graph & Observability

- **Model routing**: Registry, cost prediction, provider compatibility, dynamic router with budget-aware auto-downgrade (opus→sonnet→haiku) (174 tests)
- **Readiness CLI**: Score/report/remediate commands with 4-format output (terminal/markdown/JSON/summary) (123 tests)
- **Cross-repo knowledge graph**: Federated query across repositories, relationship inference, portable exports to `~/.claude/knowledge/` (119 tests)
- **Observability CLI**: Unified log aggregation, alert management, cost reporting with status/events/alerts/costs commands (169 tests)

### Phase 1 — Mission Orchestrator, Plugin Marketplace, Headless Execution & Code Review

- **Mission orchestrator**: Dispatch loop, handoff pipeline, milestone gates, state recovery, E2E tests (100+ tests)
- **Plugin marketplace**: Manifest validation, 3-scope resolution, git marketplace, runtime loading (160 tests)
- **Headless execution**: 5-tier autonomy, 4 output formats (JSON/markdown/SARIF/JUnit), permission enforcement (139 tests)
- **Code review pipeline**: Diff parsing, P0-P3 severity, 8-criteria bug detection, 2-pass review pipeline (101 tests)

### Phase 8 — System Repair (Prior)

- **Test suite**: 201 failures → 0 (framework 3256/0, tools 462/0)
- **Reflection system**: Fixed score normalization, registered missing hooks, token reporting
- **A2A Protocol**: Auto-start hook, graceful shutdown, lazy client dispatch
- **Skills ecosystem**: 69 low-scoring skills improved to 100; average score 87 → 96
- **Windows platform**: YAML block scalar parsing, path resolution, glob expansion fixes

See [`CHANGELOG.md`](CHANGELOG.md) for full details.

## Quick Start (TL;DR)

Runtime: Node `>=22.5.0`, pnpm.
Windows Setup: Requires **Python** and **C++ Build Tools** installed for compiling native AST add-ons during setup.
Indexing Acceleration: Natively supports automatic Multi-GPU distribution for semantic indexing (dynamically spreading LanceDB embeddings across all detected NVIDIA GPUs via ONNX). Defaults gracefully to fully parallelized CPU parsing if GPUs are unavailable or disabled.
Agent Studio runs seamlessly on Windows PowerShell, WSL, macOS, and Linux.

Initialize the entire ecosystem (installs deps, compiles registries, indexes code):

```bash
pnpm run setup
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

### Optional API Keys (AI-Powered Skills)

Some skills require external API keys. All are optional — core functionality works without them.

```bash
# Copy the example env file and add your keys
cp .env.example .env
```

| Variable             | Used by                                                        | Notes                                            |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `OPENAI_API_KEY`     | `tts-generation` (OpenAI TTS), `transcription` (cloud backend) | Optional — local alternatives available          |
| `ELEVENLABS_API_KEY` | `tts-generation` (ElevenLabs voices)                           | Optional — OpenAI TTS or gTTS (free) as fallback |
| `EXA_API_KEY`        | `deep-research` (enhanced semantic search)                     | Optional — web search works without it           |

Skills that work without any API key: `transcription` (local via faster-whisper), `tts-generation` (gTTS, free), `browser-automation`, `diagram-generator`, all code/routing skills.

### Dynamic Agent Worktrees

Agent Studio dynamically supports Git Worktree isolation for dangerous/massive subagent tasks. The orchestrator spawns `isolated-*` agents (e.g., `isolated-developer`, `isolated-architect`) for high-risk or sweeping refactors. These agents inherently use the `-w` flag in Claude Code to sandbox their work in isolated branches—preventing race conditions during parallel execution.

**Important for Worktrees:** The ecosystem setup wizard automatically enables Git optimization (`core.untrackedCache true` and `core.fsmonitor true`). This prevents Git from hanging or triggering "too many active changes" warnings during massive parallel file generation or background vector indexing operations.

### Agent Teams (Experimental)

Agent Studio is designed to support Claude Code's Agent Teams feature for multi-session parallel coordination (Claude Code v2.1.32+, Opus 4.6 required). The Router-subordinate architecture allows the router to dispatch work to teammate agents running in parallel sessions. A WAL (Write-Ahead Log) memory synchronization protocol is planned to ensure safe concurrent writes to shared memory files during parallel execution. Enable via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and optionally set `CLAUDE_CODE_SUBAGENT_MODEL` for sub-agent cost optimization. Configure display mode via `teammateMode` in `settings.json` or the `--teammate-mode` CLI flag.

### Multi-LLM Consulting & Council

Agent Studio natively supports integrating with other headless LLM Code CLIs (Gemini, Codex, Cursor, and Claude Code). The `multi-llm-consultant` agent can dynamically detect which of these CLIs are authenticated on your system and distribute prompts in parallel. It also features a built-in `llm-council` skill that automatically runs a robust 3-stage deliberation protocol (independent completions -> anonymized peer review & ranking -> chairman synthesis) for complex architectural decisions.

## Current Footprint

- Agents: 119 files (includes 12 isolated worktree variants)
- Skills: 476 `SKILL.md` definitions
- Rules: 16 docs
- Schemas: 318 `*.schema.json`
- Commands: 262 `.claude/commands/*.md`

## Systems Architecture

Agent Studio includes several integrated subsystems built across four development phases:

| System               | Path                      | Purpose                                                                      |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Mission Orchestrator | `.claude/lib/mission/`    | Dispatch loop, handoff pipeline, milestone gates, state recovery             |
| Plugin Marketplace   | `.claude/lib/plugins/`    | Manifest validation, 3-scope resolution, git marketplace, runtime loading    |
| Headless Execution   | `.claude/lib/exec/`       | 5-tier autonomy enforcement, multi-format output (JSON/markdown/SARIF/JUnit) |
| Code Review Pipeline | `.claude/lib/review/`     | Diff parsing, P0-P3 severity classification, 8-criteria bug detection        |
| Model Router         | `.claude/lib/routing/`    | Cost-aware model selection, budget engine with auto-downgrade chain          |
| Readiness CLI        | `.claude/lib/readiness/`  | Project readiness scoring, configurable thresholds, 4-format reporting       |
| Knowledge Graph      | `.claude/lib/memory/`     | Cross-repo federated query, relationship inference, portable exports         |
| Observability CLI    | `.claude/lib/monitoring/` | Unified log aggregation, alert management, cost tracking                     |
| Self-Evolving Skills | `.claude/lib/evolution/`  | Usage tracking, pattern detection, suggestion generation, evolution triggers |
| GitHub Integration   | `.claude/lib/github/`     | `gh` CLI wrapper, webhook simulation, mention parsing, CI status reporting   |
| Consensus Engine     | `.claude/lib/consensus/`  | Mixture-of-agents fan-out, multi-model consensus synthesis                   |
| Skill Auto-Creator   | `.claude/lib/evolution/`  | Session transcript analysis, autonomous skill generation, security scanning  |
| Session FTS Index    | `.claude/lib/memory/`     | SQLite FTS5 full-text search over session JSONL logs                         |
| Process Registry     | `.claude/lib/workers/`    | Background process lifecycle, checkpoint/restore, stdout ring buffer         |

## Framework Upgrade Initiative (Phase 1 Complete)

Agent Studio's roadmap includes a structured multi-phase upgrade derived from analysing 8 external agent frameworks:

| Framework           | Focus area                                      |
| ------------------- | ----------------------------------------------- |
| GSD (Get Shit Done) | Task discipline, atomic commits, deviation docs |
| BMAD-METHOD         | Project constitution, workflow snapshots        |
| CrewAI              | Failure taxonomy, role-based routing            |
| lossless-claw       | Context compression, anomaly preservation       |
| AgentRx             | Agent fingerprinting, structured diagnostics    |
| agency-agents       | Review severity, code quality vocabulary        |
| MetaClaw            | Frontmatter parsing, skill metadata             |
| awesome-llm-apps    | Composable utility patterns                     |

The analysis produced **47 candidate features** (12 P0, 25 P1, 10 P2). Phase 1 shipped 6 features:

| ID  | Feature                         | Artifact                                         |
| --- | ------------------------------- | ------------------------------------------------ |
| D8  | Configurable context thresholds | `.env.example` + `spawn-token-guard.cjs`         |
| F1  | 10-category failure taxonomy    | `.claude/schemas/failure-taxonomy.schema.json`   |
| C4  | Review severity taxonomy        | `.claude/schemas/review-severity.schema.json`    |
| G1  | Agent fingerprinting            | `.claude/lib/utils/agent-fingerprint.cjs`        |
| D7  | Anomaly preservation            | `.claude/lib/utils/anomaly-detector.cjs`         |
| H1  | SKILL.md frontmatter parser     | `.claude/lib/utils/skill-frontmatter-parser.cjs` |

Full implementation plan: `.claude/context/plans/framework-upgrade-plan-2026-03-17.md`

## Quality Gates and Verification Patterns

Agent Studio ships several features that enforce completion quality and reduce plan drift across agent pipelines.

### Project Constitution

A project constitution file (`.claude/context/project-context.md`) is auto-injected into spawn prompts. It carries operational constraints — scope boundaries, architecture conventions, and non-negotiables — so every spawned agent operates from the same baseline without needing them restated per-task.

### Analysis Paralysis Guard

A hook at `.claude/hooks/session/analysis-paralysis-guard.cjs` monitors consecutive read-only tool calls and fires a warning when an agent exceeds its tier threshold. Thresholds are agent-type-aware:

| Agent type     | Read-only call limit |
| -------------- | -------------------- |
| `executor`     | 5                    |
| `analyst`      | 15                   |
| `orchestrator` | 20                   |
| `hunter`       | 25                   |

### Must-Haves Verification

The `must-haves` schema (`.claude/schemas/must-haves.schema.json`) provides goal-backward verification. Planners declare `truths` (facts that must hold), `artifacts` (files that must exist), and `key_links` (cross-references) as acceptance criteria. The `reflection-agent` scores each task completion against the `must_haves` block.

### Deviation Protocol

When a developer agent needs to deviate from a plan, it documents the deviation — reason, scope change, impact — before making changes. This creates an audit trail and keeps planner state consistent with what was actually built.

### SUCCESS/FAILURE Metrics

The universal spawn template includes a `criteria_met`/`criteria_failed` block in `TaskUpdate` metadata. Every agent completion carries structured evidence of what passed and what did not, enabling downstream agents and the reflection pipeline to make data-driven decisions.

### Verification Gap Reporting

QA agents emit structured gap reports using the verification-gap schema (`.claude/schemas/verification-gap.schema.json`). Each gap has an ID (G1, G2...), severity (`critical`, `high`, `medium`, `low`), and a description. The planner ingests these reports and generates targeted fix tasks — closing the feedback loop between QA findings and implementation work.

### Token Budget Estimation

Planners attach an `estimated_tokens` field to every task. Tasks projected to exceed 80K tokens are split before dispatch. This prevents agents from running into context overflow mid-task and avoids silent truncation.

### Live Token Usage and Cost Tracking

A `UserPromptSubmit` hook (`ccusage-statusline.cjs`) parses Claude Code's JSONL session logs on every prompt and writes a live status file to `.claude/context/runtime/ccusage-status.txt`. The router reads this file and includes token usage in pipeline summaries.

The status tracks three layers of cost optimization:

```
[tokens]      57,685 today (in: 1,403 / out: 56,282) | Cost: $86.82
[cache]       $316.97 saved | 66,701,262 reads, 7,961,389 writes
[compression] 18 events | 596.2KB freed (~152,627 tokens) | ~$0.76 saved
```

| Line            | What it measures                                                           | Optimization layer |
| --------------- | -------------------------------------------------------------------------- | ------------------ |
| `[tokens]`      | Actual API spend using real pricing tables                                 | Raw cost           |
| `[cache]`       | Savings from Anthropic's prompt caching (90% discount on repeated context) | Server-side        |
| `[compression]` | Tokens avoided by the framework's context compression pipeline             | Client-side        |

Pricing is calculated per-model using built-in rate tables (updated March 2026):

| Model      | Input   | Output   | Cache Write | Cache Read |
| ---------- | ------- | -------- | ----------- | ---------- |
| Opus 4.6   | $5.00/M | $25.00/M | $6.25/M     | $0.50/M    |
| Sonnet 4.6 | $3.00/M | $15.00/M | $3.75/M     | $0.30/M    |
| Haiku 4.5  | $1.00/M | $5.00/M  | $1.25/M     | $0.10/M    |

Set `CCUSAGE_MODEL=sonnet` or `CCUSAGE_MODEL=haiku` to match your model. Defaults to `opus`.
Set `CCUSAGE_STATUSLINE=off` to disable.

### Workflow Continuation Snapshots

Execution context is persisted using the workflow-snapshot schema (`.claude/schemas/workflow-snapshot.schema.json`). When a session is interrupted, the snapshot carries enough state for a new session to resume without re-running completed phases.

### Checkpoint Taxonomy

Pipelines emit standardized checkpoints (`.claude/schemas/checkpoint-taxonomy.schema.json`) at `wave_complete`, `phase_gate`, and `quality_gate` boundaries. Orchestrators use these to verify forward progress before advancing.

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
pnpm run setup
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

5. Mission CLI (Factory Droid-aligned orchestration):

```bash
pnpm mission:init                      # scaffold new mission bundle
pnpm mission:validate <mission-path>   # validate features.json + schemas
pnpm mission:lint <mission-path>       # lint features for circular deps
pnpm mission:grade <mission-path>      # grade against 17 alignment rules (0-100)
pnpm mission:audit <mission-path>      # query audit trail
pnpm mission:status <mission-path>     # feature vs assertion progress
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

| Tool/Mode                        | What it does best                                   | Latency profile                                                      | Determinism                 | Token/output profile                            |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | --------------------------- | ----------------------------------------------- |
| `pnpm search:code "query"`       | Conceptual discovery and ranked candidates          | Fast (`~0.2-0.7s` on this repo)                                      | High                        | Compact ranked output (good for agents)         |
| `pnpm search:code "ast:pattern"` | Structural intent with optional ast-grep refinement | Moderate (`~0.18s` warm daemon baseline, higher for explicit `ast:`) | High if pattern is explicit | Compact, structure-aware candidates             |
| `pnpm search:structure`          | Repo map, entrypoints, dependency orientation       | Fast one-shot structure pass                                         | High                        | Very low output volume                          |
| `rg -F "literal"`                | Exact symbol/literal lookup                         | Fastest (`~15-35ms` measured)                                        | Highest                     | Larger raw output unless scoped                 |
| `rga "query"`                    | Cross-file search (pdf/docs/archives)               | Slower than `rg`                                                     | High                        | Can be noisy; scope early                       |
| `rg` → `fzf`                     | Human interactive narrowing/selection               | Interactive                                                          | Operator-dependent          | Great for manual triage, not default agent path |

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

## Heartbeat Ecosystem & Telegram Control

Agent Studio includes a background heartbeat ecosystem that keeps the agent runtime healthy, indexed, informed, and reachable from your phone.

### Heartbeat Auto-Start

Heartbeat loops start automatically at each session. The router's Step 0.5 preflight reads
`heartbeat-active.json` and spawns `heartbeat-orchestrator` if any loops are missing or expired.

You can also start them manually with `/heartbeat-start` in your Claude Code session.

**The 8 loops:**

| Loop                      | Schedule         | What it does                                                                                |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| 0 — Auto-reschedule       | Every 2 days     | Re-registers any loops that expired (3-day Claude Code limit)                               |
| 1 — Continuous reflection | Every 2 hours    | Extracts patterns from session transcripts; rotates memory when `learnings.md` exceeds 35KB |
| 2 — Agent evolution       | Daily at 3am     | Applies accumulated learnings to improve agent definitions                                  |
| 3 — Morning briefing      | 8am weekdays     | Summarizes open issues, recent commits, and 2 priority tasks for the day                    |
| 4 — Codebase indexing     | Every 4 hours    | Keeps the hybrid BM25 + semantic search index fresh                                         |
| 5 — Context drain         | Every 15 minutes | Detects when the task pipeline is idle and prompts for `/clear`                             |
| 6 — Telegram polling      | Every 2 minutes  | Polls your Telegram bot for commands and routes them to agents                              |
| 7 — Research digest       | Daily at 7am     | Fetches ArXiv papers and Exa web results matching your configured topics                    |

All loops are session-scoped — they restart when you open a new terminal. Loop 0 prevents silent
expiry within a session by re-registering loops before the 3-day Claude Code limit is reached.

Full loop contracts and state files: `.claude/docs/HEARTBEAT_STATE_CONTRACTS.md`

### Telegram Phone Control Setup

Control Agent Studio from Telegram while the session is running.

**Your bot:** [@Agent_studio_bot](https://t.me/Agent_studio_bot) — already created and wired in.

**Steps to connect your account:**

1. Find your Telegram user ID: message [@userinfobot](https://t.me/userinfobot) on Telegram. It
   replies with your numeric ID (e.g., `123456789`).

2. Edit `.env` and set these three variables:

   ```bash
   TELEGRAM_BOT_TOKEN=<your_token>          # From @BotFather — already set if you followed setup
   TELEGRAM_OWNER_ID=123456789              # Your numeric Telegram user ID
   TELEGRAM_ALLOWED_USERS=123456789         # Comma-separated IDs allowed to use the bot
   ```

3. Start the heartbeat ecosystem (this activates Telegram polling as Loop 6):

   ```
   /heartbeat-start
   ```

4. Open Telegram and message [@Agent_studio_bot](https://t.me/Agent_studio_bot). Try `/status`
   or `/help` to confirm the connection.

### Telegram Commands Reference

| Command            | Who    | What it does                                                           |
| ------------------ | ------ | ---------------------------------------------------------------------- |
| `/help`            | Anyone | List all commands                                                      |
| `/status`          | Anyone | Active loops, pending tasks, last heartbeat time                       |
| `/tasks`           | Anyone | Current task list with status                                          |
| `/loops`           | Anyone | Active heartbeat loops                                                 |
| `/logs`            | Anyone | Last 20 session gap log entries                                        |
| `/memory QUERY`    | Anyone | Search recent learnings for a keyword                                  |
| `/ask QUESTION`    | Owner  | Ask the AI a question and get a reply                                  |
| `/spawn TYPE DESC` | Owner  | Spawn an agent (`general-assistant`, `researcher`, `technical-writer`) |
| `/approve TASK_ID` | Owner  | Two-step task approval (then `/confirm TASK_ID` within 60 seconds)     |
| `/deny TASK_ID`    | Owner  | Cancel a pending task                                                  |

Owner-only commands require your Telegram user ID to match `TELEGRAM_OWNER_ID`.

### File Drop Support

Send any file in the Telegram chat to automatically convert it to Markdown and store it as agent memory:

| File Type  | Extensions                | Converted To                 |
| ---------- | ------------------------- | ---------------------------- |
| Documents  | .pdf, .docx, .pptx, .xlsx | Structured Markdown          |
| Web pages  | .html, .htm               | Clean Markdown               |
| Data files | .csv, .json, .xml         | Markdown tables              |
| Images     | .jpg, .png, .gif, .webp   | Alt-text description         |
| Audio      | .mp3, .wav, .m4a, .ogg    | Transcription (if supported) |

**How it works:**

1. Drop a file in the Telegram chat
2. Bot downloads and converts it using [MarkItDown](https://github.com/microsoft/markitdown)
3. Content is stored as agent memory (searchable by all agents)
4. Bot replies with a confirmation

**Requirements:** Python with markitdown: `pip install 'markitdown[all]'`

**File size limit:** 20MB (Telegram Bot API limit)

### Environment Variables Quick Reference

For the full list, see `.env.example` and `.claude/docs/@ENVIRONMENT_CONFIG.md`.

| Variable                  | Required          | Description                                         |
| ------------------------- | ----------------- | --------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | For Telegram      | Bot API token from @BotFather                       |
| `TELEGRAM_OWNER_ID`       | For Telegram      | Your Telegram numeric user ID (privileged commands) |
| `TELEGRAM_ALLOWED_USERS`  | For Telegram      | Comma-separated user IDs allowed to use the bot     |
| `TELEGRAM_OWNER_USERNAME` | Optional          | Your @username (no @ prefix, display only)          |
| `TELEGRAM_OWNER_CHAT_ID`  | Recommended       | Numeric user ID (get from @userinfobot)             |
| `ARXIV_KEYWORDS`          | For research loop | Comma-separated ArXiv search topics                 |
| `EXA_MONITOR_TOPICS`      | For research loop | JSON array of web monitoring topics                 |

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

## Debug Log Utilities

When a session produces unexpected behavior, reduce the raw Claude Code debug log to signal-only lines:

```bash
pnpm debug:reduce    # Auto-find most recent ~/.claude/debug/*.txt, copy to .tmp/, and reduce to signal-only lines
```

The reduced file lands at `.tmp/<session-id>-reduced.txt`. Kept lines include `[ERROR]`, `[WARN]`, failed/blocked/timeout messages, and stack traces. Repeated identical lines are collapsed.

You can also pass an explicit path:

```bash
pnpm reduce-debug-log -- .tmp/session-abc.txt
pnpm reduce-debug-log -- .tmp/session-abc.txt --output .tmp/session-abc.cleaned.txt
```

The `debug-log-analysis` skill (`Skill({ skill: 'debug-log-analysis' })`) documents the full structured workflow for working with these reduced logs.

## Skills Catalog

> **476 active skills** across 21 categories. Full details: [`.claude/context/artifacts/catalogs/skill-catalog.md`](.claude/context/artifacts/catalogs/skill-catalog.md)
>
> Invoke any skill: `Skill({ skill: 'name' })`

### Core Development

| Skill                                                                                    | Description                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [tdd](.claude/skills/tdd/SKILL.md)                                                       | TDD with RED/GREEN/REFACTOR cycle                             |
| [debugging](.claude/skills/debugging/SKILL.md)                                           | Systematic 4-phase root cause investigation                   |
| [smart-debug](.claude/skills/smart-debug/SKILL.md)                                       | AI-assisted hypothesis ranking and structured instrumentation |
| [debug-log-analysis](.claude/skills/debug-log-analysis/SKILL.md)                         | Structured debug log analysis for Claude Code sessions        |
| [ripgrep](.claude/skills/ripgrep/SKILL.md)                                               | Enhanced code search with ES module support                   |
| [code-quality-expert](.claude/skills/code-quality-expert/SKILL.md)                       | Clean code principles and refactoring                         |
| [code-analyzer](.claude/skills/code-analyzer/SKILL.md)                                   | Static analysis and complexity metrics                        |
| [code-semantic-search](.claude/skills/code-semantic-search/SKILL.md)                     | Semantic code search with vector index                        |
| [code-structural-search](.claude/skills/code-structural-search/SKILL.md)                 | AST-based structural pattern matching                         |
| [verification-before-completion](.claude/skills/verification-before-completion/SKILL.md) | Evidence-based completion gate function                       |
| [subagent-driven-development](.claude/skills/subagent-driven-development/SKILL.md)       | Implementation via autonomous subagents with two-stage review |
| [requesting-code-review](.claude/skills/requesting-code-review/SKILL.md)                 | Dispatch structured two-stage code review                     |
| [receiving-code-review](.claude/skills/receiving-code-review/SKILL.md)                   | Process and act on code review feedback                       |
| [best-practices-guidelines](.claude/skills/best-practices-guidelines/SKILL.md)           | Cross-cutting development best practices                      |

### Planning & Architecture

| Skill                                                                              | Description                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [brainstorming](.claude/skills/brainstorming/SKILL.md)                             | Structured ideation with convergence                           |
| [plan-generator](.claude/skills/plan-generator/SKILL.md)                           | Implementation plan generation                                 |
| [prd-generator](.claude/skills/prd-generator/SKILL.md)                             | Product requirements document creation                         |
| [architecture-review](.claude/skills/architecture-review/SKILL.md)                 | System architecture analysis                                   |
| [complexity-assessment](.claude/skills/complexity-assessment/SKILL.md)             | Task complexity classification                                 |
| [diagram-generator](.claude/skills/diagram-generator/SKILL.md)                     | Mermaid diagram generation                                     |
| [wave-executor](.claude/skills/wave-executor/SKILL.md)                             | EPIC-tier batch pipeline orchestration via fresh Bun processes |
| [sparc-methodology](.claude/skills/sparc-methodology/SKILL.md)                     | SPARC methodology workflow                                     |
| [spec-critique](.claude/skills/spec-critique/SKILL.md)                             | Specification review and gap analysis                          |
| [spec-gathering](.claude/skills/spec-gathering/SKILL.md)                           | Requirements elicitation                                       |
| [spec-init](.claude/skills/spec-init/SKILL.md)                                     | Specification bootstrapping                                    |
| [dispatching-parallel-agents](.claude/skills/dispatching-parallel-agents/SKILL.md) | Parallel agent dispatch patterns                               |
| [ralph-loop](.claude/skills/ralph-loop/SKILL.md)                                   | Autonomous iteration via Stop hook loop with verification gate |

### Security

| Skill                                                                        | Description                              |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| [security-architect](.claude/skills/security-architect/SKILL.md)             | OWASP/STRIDE/AI threat modeling          |
| [auth-security-expert](.claude/skills/auth-security-expert/SKILL.md)         | OAuth 2.1 and JWT security patterns      |
| [static-analysis](.claude/skills/static-analysis/SKILL.md)                   | Semgrep and CodeQL pipelines             |
| [variant-analysis](.claude/skills/variant-analysis/SKILL.md)                 | Vulnerability variant discovery          |
| [semgrep-rule-creator](.claude/skills/semgrep-rule-creator/SKILL.md)         | Custom Semgrep rule authoring            |
| [binary-analysis-patterns](.claude/skills/binary-analysis-patterns/SKILL.md) | Binary analysis and reverse engineering  |
| [memory-forensics](.claude/skills/memory-forensics/SKILL.md)                 | Memory forensics workflows               |
| [differential-review](.claude/skills/differential-review/SKILL.md)           | Security-focused diff review             |
| [insecure-defaults](.claude/skills/insecure-defaults/SKILL.md)               | Insecure default detection               |
| [content-security-scan](.claude/skills/content-security-scan/SKILL.md)       | Content security scanning                |
| [audit-context-building](.claude/skills/audit-context-building/SKILL.md)     | Security audit context assembly          |
| [fix-review](.claude/skills/fix-review/SKILL.md)                             | Security fix regression verification     |
| [yara-authoring](.claude/skills/yara-authoring/SKILL.md)                     | YARA rule authoring for threat detection |
| [medusa-security](.claude/skills/medusa-security/SKILL.md)                   | Medusa security patterns                 |

### DevOps & Infrastructure

| Skill                                                                              | Description                        |
| ---------------------------------------------------------------------------------- | ---------------------------------- |
| [terraform-infra](.claude/skills/terraform-infra/SKILL.md)                         | Terraform IaC with safety controls |
| [docker-compose](.claude/skills/docker-compose/SKILL.md)                           | Docker Compose workflows           |
| [k8s-manifest-generator](.claude/skills/k8s-manifest-generator/SKILL.md)           | Kubernetes manifest generation     |
| [sentry-monitoring](.claude/skills/sentry-monitoring/SKILL.md)                     | Sentry error monitoring setup      |
| [kafka-development-practices](.claude/skills/kafka-development-practices/SKILL.md) | Kafka patterns and best practices  |
| [monorepo-and-tooling](.claude/skills/monorepo-and-tooling/SKILL.md)               | Monorepo setup and tooling         |
| [cloud-devops-expert](.claude/skills/cloud-devops-expert/SKILL.md)                 | Cloud DevOps workflows             |
| [container-expert](.claude/skills/container-expert/SKILL.md)                       | Container orchestration patterns   |

### Languages

| Skill                                                                                        | Description                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [typescript-expert](.claude/skills/typescript-expert/SKILL.md)                               | TypeScript type systems and patterns      |
| [python-backend-expert](.claude/skills/python-backend-expert/SKILL.md)                       | Python backend development                |
| [go-expert](.claude/skills/go-expert/SKILL.md)                                               | Go idioms and patterns                    |
| [nodejs-expert](.claude/skills/nodejs-expert/SKILL.md)                                       | Node.js patterns and tooling              |
| [java-expert](.claude/skills/java-expert/SKILL.md)                                           | Java development                          |
| [rust-expert](.claude/skills/rust-expert/SKILL.md)                                           | Rust safety patterns                      |
| [php-expert](.claude/skills/php-expert/SKILL.md)                                             | PHP development                           |
| [elixir-expert](.claude/skills/elixir-expert/SKILL.md)                                       | Elixir/OTP patterns                       |
| [cpp](.claude/skills/cpp/SKILL.md)                                                           | C++ development                           |
| [poetry-rye-dependency-management](.claude/skills/poetry-rye-dependency-management/SKILL.md) | Python dependency management (Poetry/Rye) |
| [modern-python](.claude/skills/modern-python/SKILL.md)                                       | Modern Python with uv/ruff/ty             |

### Frameworks

| Skill                                                                            | Description                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| [react-expert](.claude/skills/react-expert/SKILL.md)                             | React patterns and hooks                       |
| [nextjs-expert](.claude/skills/nextjs-expert/SKILL.md)                           | Next.js App Router and RSC                     |
| [svelte-expert](.claude/skills/svelte-expert/SKILL.md)                           | SvelteKit patterns                             |
| [vue-expert](.claude/skills/vue-expert/SKILL.md)                                 | Vue 3 Composition API and Pinia                |
| [angular-expert](.claude/skills/angular-expert/SKILL.md)                         | Angular patterns                               |
| [astro-expert](.claude/skills/astro-expert/SKILL.md)                             | Astro framework                                |
| [qwik-expert](.claude/skills/qwik-expert/SKILL.md)                               | Qwik resumability patterns                     |
| [solidjs-expert](.claude/skills/solidjs-expert/SKILL.md)                         | SolidJS fine-grained reactivity                |
| [graphql-expert](.claude/skills/graphql-expert/SKILL.md)                         | GraphQL schema and resolvers                   |
| [htmx-expert](.claude/skills/htmx-expert/SKILL.md)                               | HTMX hypermedia patterns                       |
| [webmcp-browser-tools](.claude/skills/webmcp-browser-tools/SKILL.md)             | WebMCP browser-side tool exposure to AI agents |
| [starknet-react-rules](.claude/skills/starknet-react-rules/SKILL.md)             | StarkNet React blockchain integration          |
| [drizzle-orm-rules](.claude/skills/drizzle-orm-rules/SKILL.md)                   | Drizzle ORM patterns                           |
| [convex-development-general](.claude/skills/convex-development-general/SKILL.md) | Convex backend development                     |

### Vercel & Web Performance

| Skill                                                                                | Description                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [vercel-deploy](.claude/skills/vercel-deploy/SKILL.md)                               | Zero-auth Vercel deployment for 20+ frameworks |
| [vercel-ai-sdk-best-practices](.claude/skills/vercel-ai-sdk-best-practices/SKILL.md) | Vercel AI SDK streaming patterns               |
| [web-perf](.claude/skills/web-perf/SKILL.md)                                         | 5-phase Core Web Vitals audit workflow         |
| [next-upgrade](.claude/skills/next-upgrade/SKILL.md)                                 | Next.js upgrade migration                      |
| [next-cache-components](.claude/skills/next-cache-components/SKILL.md)               | Next.js caching strategies                     |
| [shadcn-ui](.claude/skills/shadcn-ui/SKILL.md)                                       | shadcn/ui component integration                |
| [enhance-prompt](.claude/skills/enhance-prompt/SKILL.md)                             | AI prompt enhancement patterns                 |

### Mobile

| Skill                                                                                                          | Description                        |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [ios-expert](.claude/skills/ios-expert/SKILL.md)                                                               | iOS SwiftUI development            |
| [android-expert](.claude/skills/android-expert/SKILL.md)                                                       | Android Compose development        |
| [flutter-expert](.claude/skills/flutter-expert/SKILL.md)                                                       | Flutter cross-platform development |
| [expo-framework-rule](.claude/skills/expo-framework-rule/SKILL.md)                                             | Expo framework patterns            |
| [tauri-native-api-integration](.claude/skills/tauri-native-api-integration/SKILL.md)                           | Tauri native API integration       |
| [mobile-first-design-rules](.claude/skills/mobile-first-design-rules/SKILL.md)                                 | Mobile-first design patterns       |
| [nativewind-and-tailwind-css-compatibility](.claude/skills/nativewind-and-tailwind-css-compatibility/SKILL.md) | NativeWind Tailwind compatibility  |
| [nativescript](.claude/skills/nativescript/SKILL.md)                                                           | NativeScript patterns              |

### Data & Database

| Skill                                                                | Description                        |
| -------------------------------------------------------------------- | ---------------------------------- |
| [database-architect](.claude/skills/database-architect/SKILL.md)     | Database schema design             |
| [database-expert](.claude/skills/database-expert/SKILL.md)           | Database query optimization        |
| [data-expert](.claude/skills/data-expert/SKILL.md)                   | Data engineering patterns          |
| [text-to-sql](.claude/skills/text-to-sql/SKILL.md)                   | Natural language to SQL conversion |
| [large-data-with-dask](.claude/skills/large-data-with-dask/SKILL.md) | Large dataset processing with Dask |

### Documentation

| Skill                                                                | Description                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| [doc-generator](.claude/skills/doc-generator/SKILL.md)               | Technical documentation generation                         |
| [writing-skills](.claude/skills/writing-skills/SKILL.md)             | TDD applied to skill authoring                             |
| [readme](.claude/skills/readme/SKILL.md)                             | README generation patterns                                 |
| [summarize-changes](.claude/skills/summarize-changes/SKILL.md)       | Change summary generation                                  |
| [markitdown-converter](.claude/skills/markitdown-converter/SKILL.md) | Convert files to Markdown (PDF, DOCX, XLSX, images, audio) |

### Git & Version Control

| Skill                                                                                    | Description                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------- |
| [commit-validator](.claude/skills/commit-validator/SKILL.md)                             | Conventional commit validation     |
| [git-expert](.claude/skills/git-expert/SKILL.md)                                         | Advanced Git workflows             |
| [github-ops](.claude/skills/github-ops/SKILL.md)                                         | GitHub operations and PR workflows |
| [finishing-a-development-branch](.claude/skills/finishing-a-development-branch/SKILL.md) | Branch completion checklist        |
| [using-git-worktrees](.claude/skills/using-git-worktrees/SKILL.md)                       | Isolated development workspaces    |
| [smart-revert](.claude/skills/smart-revert/SKILL.md)                                     | Safe revert with impact analysis   |

### Creator Tools

| Skill                                                              | Description                                       |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| [research-synthesis](.claude/skills/research-synthesis/SKILL.md)   | Multi-source research and synthesis               |
| [skill-creator](.claude/skills/skill-creator/SKILL.md)             | Create new skills                                 |
| [skill-updater](.claude/skills/skill-updater/SKILL.md)             | Update existing skills to production-ready status |
| [agent-creator](.claude/skills/agent-creator/SKILL.md)             | Create new agents                                 |
| [agent-updater](.claude/skills/agent-updater/SKILL.md)             | Update existing agents                            |
| [workflow-creator](.claude/skills/workflow-creator/SKILL.md)       | Create new workflows                              |
| [workflow-updater](.claude/skills/workflow-updater/SKILL.md)       | Update existing workflows                         |
| [hook-creator](.claude/skills/hook-creator/SKILL.md)               | Create new hooks                                  |
| [template-creator](.claude/skills/template-creator/SKILL.md)       | Create new templates                              |
| [schema-creator](.claude/skills/schema-creator/SKILL.md)           | Create new schemas                                |
| [rule-creator](.claude/skills/rule-creator/SKILL.md)               | Create new rules                                  |
| [command-creator](.claude/skills/command-creator/SKILL.md)         | Create new commands                               |
| [tool-creator](.claude/skills/tool-creator/SKILL.md)               | Create new framework tools                        |
| [artifact-integrator](.claude/skills/artifact-integrator/SKILL.md) | Integrate artifacts into framework                |
| [artifact-updater](.claude/skills/artifact-updater/SKILL.md)       | Update existing artifacts                         |

### Memory & Context

| Skill                                                                                      | Description                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [context-compressor](.claude/skills/context-compressor/SKILL.md)                           | Context window compression                         |
| [token-saver-context-compression](.claude/skills/token-saver-context-compression/SKILL.md) | Search-aware context compression with MemoryRecord |
| [memory-quality-auditor](.claude/skills/memory-quality-auditor/SKILL.md)                   | Memory file quality audit                          |
| [session-handoff](.claude/skills/session-handoff/SKILL.md)                                 | Cross-session handoff artifacts                    |
| [task-management-protocol](.claude/skills/task-management-protocol/SKILL.md)               | Task tracking and structured handoff               |
| [track-management](.claude/skills/track-management/SKILL.md)                               | Work unit lifecycle management                     |
| [context-degradation](.claude/skills/context-degradation/SKILL.md)                         | Context degradation detection                      |
| [framework-context](.claude/skills/framework-context/SKILL.md)                             | Framework context loading                          |
| [recommend-evolution](.claude/skills/recommend-evolution/SKILL.md)                         | Framework evolution recommendations                |
| [assimilate](.claude/skills/assimilate/SKILL.md)                                           | External repository assimilation                   |
| [creation-feasibility-gate](.claude/skills/creation-feasibility-gate/SKILL.md)             | Pre-creation feasibility check                     |
| [compliance-policy-check](.claude/skills/compliance-policy-check/SKILL.md)                 | Policy compliance validation                       |
| [troubleshooting-regression](.claude/skills/troubleshooting-regression/SKILL.md)           | Regression diagnosis and fix verification          |
| [memory-search](.claude/skills/memory-search/SKILL.md)                                     | Semantic memory search                             |
| [insight-extraction](.claude/skills/insight-extraction/SKILL.md)                           | Knowledge extraction from context                  |

### Validation & Quality

| Skill                                                                                            | Description                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [checklist-generator](.claude/skills/checklist-generator/SKILL.md)                               | Quality checklist generation                                                      |
| [proactive-audit](.claude/skills/proactive-audit/SKILL.md)                                       | Proactive framework audit after pipeline changes                                  |
| [response-rater](.claude/skills/response-rater/SKILL.md)                                         | Agent response quality rating                                                     |
| [test-generator](.claude/skills/test-generator/SKILL.md)                                         | Automated test code generation                                                    |
| [accessibility](.claude/skills/accessibility/SKILL.md)                                           | Accessibility audit and fixes                                                     |
| [eval-harness-updater](.claude/skills/eval-harness-updater/SKILL.md)                             | Evaluation harness maintenance                                                    |
| [qa-workflow](.claude/skills/qa-workflow/SKILL.md)                                               | Systematic QA validation with fix loops                                           |
| [agent-evaluation](.claude/skills/agent-evaluation/SKILL.md)                                     | Agent capability evaluation                                                       |
| [strict-user-requirements-adherence](.claude/skills/strict-user-requirements-adherence/SKILL.md) | Requirements traceability                                                         |
| [property-based-testing](.claude/skills/property-based-testing/SKILL.md)                         | Property-based test generation                                                    |
| [behavioral-loop-detection](.claude/skills/behavioral-loop-detection/SKILL.md)                   | Detect agent behavioral loops via Jaccard similarity scoring                      |
| [judge-verification](.claude/skills/judge-verification/SKILL.md)                                 | Independent LLM judge evaluation with 4-dimension scoring                         |
| [error-recovery-escalation](.claude/skills/error-recovery-escalation/SKILL.md)                   | 5-level structured error recovery: retry → nudge → replan → fallback → force-done |

### Specialized Patterns

| Skill                                                                                            | Description                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| [thinking-tools](.claude/skills/thinking-tools/SKILL.md)                                         | Structured self-reflection checkpoints    |
| [sequential-thinking](.claude/skills/sequential-thinking/SKILL.md)                               | Dynamic step-by-step hypothesis reasoning |
| [consensus-voting](.claude/skills/consensus-voting/SKILL.md)                                     | Multi-perspective decision voting         |
| [swarm-coordination](.claude/skills/swarm-coordination/SKILL.md)                                 | Multi-agent swarm patterns                |
| [interactive-requirements-gathering](.claude/skills/interactive-requirements-gathering/SKILL.md) | Guided requirements elicitation           |
| [planning-with-files](.claude/skills/planning-with-files/SKILL.md)                               | File-based planning patterns              |
| [context-driven-development](.claude/skills/context-driven-development/SKILL.md)                 | Context-aware development workflow        |
| [pipeline-reflection-ux](.claude/skills/pipeline-reflection-ux/SKILL.md)                         | Pipeline reflection UX patterns           |

### External Integrations

| Skill                                                                      | Description                        |
| -------------------------------------------------------------------------- | ---------------------------------- |
| [jira-pm](.claude/skills/jira-pm/SKILL.md)                                 | Jira project management            |
| [linear-pm](.claude/skills/linear-pm/SKILL.md)                             | Linear project management          |
| [medusa](.claude/skills/medusa/SKILL.md)                                   | Medusa e-commerce platform         |
| [dynamic-api-integration](.claude/skills/dynamic-api-integration/SKILL.md) | Dynamic API integration patterns   |
| [project-onboarding](.claude/skills/project-onboarding/SKILL.md)           | Project onboarding workflow        |
| [github-mcp](.claude/skills/github-mcp/SKILL.md)                           | GitHub MCP integration             |
| [arxiv-mcp](.claude/skills/arxiv-mcp/SKILL.md)                             | arXiv paper retrieval              |
| [slack-notifications](.claude/skills/slack-notifications/SKILL.md)         | Slack notification patterns        |
| [gemini-cli-security](.claude/skills/gemini-cli-security/SKILL.md)         | Gemini CLI security audit patterns |

### Incident Response

| Skill                                                                            | Description                  |
| -------------------------------------------------------------------------------- | ---------------------------- |
| [incident-runbook-templates](.claude/skills/incident-runbook-templates/SKILL.md) | Incident runbook templates   |
| [on-call-handoff-patterns](.claude/skills/on-call-handoff-patterns/SKILL.md)     | On-call handoff protocols    |
| [postmortem-writing](.claude/skills/postmortem-writing/SKILL.md)                 | Blameless postmortem writing |

### Scientific Research

| Skill                                                          | Description                                       |
| -------------------------------------------------------------- | ------------------------------------------------- |
| [scientific-skills](.claude/skills/scientific-skills/SKILL.md) | Scientific computing (parent with 139 sub-skills) |

### Other

| Skill                                                                                      | Description                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------- |
| [advanced-elicitation](.claude/skills/advanced-elicitation/SKILL.md)                       | Advanced prompt elicitation techniques  |
| [ai-ml-expert](.claude/skills/ai-ml-expert/SKILL.md)                                       | AI/ML patterns and best practices       |
| [agent-tool-design](.claude/skills/agent-tool-design/SKILL.md)                             | Agent tool API design                   |
| [api-development-expert](.claude/skills/api-development-expert/SKILL.md)                   | REST API development patterns           |
| [ask-questions-if-underspecified](.claude/skills/ask-questions-if-underspecified/SKILL.md) | Requirements clarification              |
| [sharp-edges](.claude/skills/sharp-edges/SKILL.md)                                         | Known codebase hazard patterns          |
| [webapp-testing](.claude/skills/webapp-testing/SKILL.md)                                   | Playwright browser automation testing   |
| [stale-module-pruner](.claude/skills/stale-module-pruner/SKILL.md)                         | Stale module detection and pruning      |
| [skill-discovery](.claude/skills/skill-discovery/SKILL.md)                                 | Skill discovery and selection           |
| [code-style-validator](.claude/skills/code-style-validator/SKILL.md)                       | Programmatic AST-based style validation |
| [dry-principle](.claude/skills/dry-principle/SKILL.md)                                     | DRY enforcement patterns                |
| [async-operations](.claude/skills/async-operations/SKILL.md)                               | Async/await patterns and anti-patterns  |

## Troubleshooting

### "Prompt is too long" / Context Saturation on Startup

If Claude Code subagents crash immediately on spawn with an API size limit error (e.g., "Prompt is too long" or saturating the 200,000 token limit without executing), ensure that the `.claudeignore` file is present in the repository root.

By default, the Claude Code CLI actively scopes any massive Markdown files (`CHANGELOG.md`, `README.md`, `GETTING_STARTED.md`) and data directories located in the repository root into its invisible system context payload. The `.claudeignore` file securely blocks this eager-loading behavior, freeing up an estimated 65,000+ tokens and preventing instant crashes.

## Operational Notes

- `.claude/context/` stores runtime artifacts and persistent operational memory.
- `.tmp/` contains temporary/debug outputs and should not be treated as product documentation.
- Schema and command validation should be treated as blocking gates for release-quality changes.
