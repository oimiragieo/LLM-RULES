# Agent Studio: Comprehensive Feature & Architecture Review

**Date:** 2026-04-03
**Scope:** Agent Studio framework (`agent-studio/.claude/`) — the portable multi-agent AI framework for Claude Code
**Purpose:** Document every major system, capability, and architectural pattern in agent-studio for onboarding, auditing, and evolution planning.

---

## Table of Contents

### Part I: Core Architecture (1-15)

1. [Router-First Multi-Agent Architecture](#1-router-first-multi-agent-architecture)
2. [Agent System — 119 Specialized Agents](#2-agent-system--119-specialized-agents)
3. [Skill System — 336 Reusable Capabilities](#3-skill-system--336-reusable-capabilities)
4. [Hook Enforcement System — 127 Hooks](#4-hook-enforcement-system--127-hooks)
5. [Routing Engine — Semantic + Keyword + Hierarchical](#5-routing-engine--semantic--keyword--hierarchical)
6. [Memory System — STM/MTM/LTM Three-Tier](#6-memory-system--stmltm-three-tier)
7. [Code Search — Hybrid BM25 + Semantic](#7-code-search--hybrid-bm25--semantic)
8. [Workflow Engine — 300+ Multi-Agent Workflows](#8-workflow-engine--300-multi-agent-workflows)
9. [Task Management & Conductor Pattern](#9-task-management--conductor-pattern)
10. [Context Window Management](#10-context-window-management)
11. [Spawn System & Worktree Isolation](#11-spawn-system--worktree-isolation)
12. [Reflection & Self-Improvement System](#12-reflection--self-improvement-system)
13. [Validation Pipeline — Schema + Contract + CI](#13-validation-pipeline--schema--contract--ci)
14. [Configuration System — Layered Config Resolution](#14-configuration-system--layered-config-resolution)
15. [Rules Engine — 14 Auto-Loaded Behavioral Rules](#15-rules-engine--14-auto-loaded-behavioral-rules)

### Part II: Specialized Subsystems (16-30)

16. [Creator Ecosystem — Artifact Generation Pipeline](#16-creator-ecosystem--artifact-generation-pipeline)
17. [Evolution System — Self-Evolving Framework](#17-evolution-system--self-evolving-framework)
18. [Security Architecture — OWASP Agentic AI Top 10](#18-security-architecture--owasp-agentic-ai-top-10)
19. [Heartbeat & Cron Orchestration](#19-heartbeat--cron-orchestration)
20. [Agent-to-Agent (A2A) Protocol](#20-agent-to-agent-a2a-protocol)
21. [Model Selection & Dynamic Routing](#21-model-selection--dynamic-routing)
22. [Multi-LLM Consultation (Omega CLIs)](#22-multi-llm-consultation-omega-clis)
23. [Monitoring & Observability](#23-monitoring--observability)
24. [Self-Healing System](#24-self-healing-system)
25. [Session Handoff & Recovery](#25-session-handoff--recovery)
26. [Mission System — Long-Running Tasks](#26-mission-system--long-running-tasks)
27. [C4 Architecture Documentation Pipeline](#27-c4-architecture-documentation-pipeline)
28. [Consensus & Swarm Coordination](#28-consensus--swarm-coordination)
29. [Plugin System](#29-plugin-system)
30. [Telegram Integration](#30-telegram-integration)

### Part III: Quality & Operations (31-40)

31. [Test Suite — 200+ Tests](#31-test-suite--200-tests)
32. [Lint, Format & Pre-Commit Pipeline](#32-lint-format--pre-commit-pipeline)
33. [Documentation System — CLAUDE.md Breadcrumbs](#33-documentation-system--claudemd-breadcrumbs)
34. [Deviation Rules Protocol](#34-deviation-rules-protocol)
35. [Sharp Edges Catalog — Known Hazards](#35-sharp-edges-catalog--known-hazards)
36. [Cleanup & Anti-Slop System](#36-cleanup--anti-slop-system)
37. [Git Workflow & Conventional Commits](#37-git-workflow--conventional-commits)
38. [Schema Validation — 250+ JSON Schemas](#38-schema-validation--250-json-schemas)
39. [CLI Tooling — 74 Executable Utilities](#39-cli-tooling--74-executable-utilities)
40. [Environment Variable & Feature Flag Configuration](#40-environment-variable--feature-flag-configuration)

---

## 1. Router-First Multi-Agent Architecture

### Overview

Agent Studio's core design principle is that Claude Code operates as a **ROUTER** — it never executes work directly. Every user request is decomposed and dispatched to specialized subagents via the `Task()` tool.

### Implementation

**Source:** `.claude/CLAUDE.md` (Section 0 — Tool Lockdown), `.claude/hooks/routing/routing-guard.cjs`

The router has a strict tool allowlist:

- **Allowed:** `Task`, `TaskList`, `TaskCreate`, `TaskUpdate`, `TaskGet`, `Read` (limited paths), `AskUserQuestion`, `Bash` (only `git status`, `git log`, `echo >> session-gap-log`)
- **Banned:** `Edit`, `Write`, `Bash` (general), `Glob`, `Grep`, `WebSearch`, `WebFetch`, all `mcp__*` tools

This is enforced by `routing-guard.cjs` which runs as a PreToolUse hook and exits `2` (block) if the router attempts a banned tool. The guard also enforces the **specialist-first routing law** — if a specialist agent exists for the task, the `developer` agent cannot be used.

### Pre-Flight Sequence

Every router prompt executes a mandatory pre-flight:

1. Check `reflection-reminder.txt` + `reflection-spawn-request.json` → spawn reflection-agent if pending
2. Check `stale-tasks.json` → close stale tasks via TaskUpdate
3. Check `heartbeat-reminder.txt` → spawn heartbeat-orchestrator
4. Check `integration-queue.jsonl` → spawn artifact-integrator
5. For creation tasks → spawn planner for feasibility-gate
6. For framework changes → spawn QA with proactive-audit

### Drain Gate

Before claiming completion, the router must verify:

1. `TaskList()` returns zero in_progress/pending/blocked tasks
2. `reflection-spawn-request.json` has no pending entries
3. All tasks are marked completed

### Key Files

| File                                              | Purpose                           |
| ------------------------------------------------- | --------------------------------- |
| `.claude/CLAUDE.md`                               | Router instructions (Section 0-8) |
| `.claude/hooks/routing/routing-guard.cjs`         | Routing enforcement hook          |
| `.claude/hooks/routing/unified-creator-guard.cjs` | Creator path enforcement          |
| `.claude/workflows/core/router-decision.md`       | Primary routing decision tree     |

---

## 2. Agent System — 119 Specialized Agents

### Overview

The framework contains 119 agents organized into 4 tiers, each defined as a markdown file with YAML frontmatter specifying model preference, available tools, and behavioral instructions.

### Tier Structure

| Tier          | Directory                       | Count | Purpose                                                       |
| ------------- | ------------------------------- | ----- | ------------------------------------------------------------- |
| Core          | `.claude/agents/core/`          | 10    | Pipeline essentials — planner, developer, QA, architect, etc. |
| Domain        | `.claude/agents/domain/`        | 68    | Technology specialists — one per language/framework/domain    |
| Specialized   | `.claude/agents/specialized/`   | 25    | Cross-cutting concerns — security, devops, code review, etc.  |
| Orchestrators | `.claude/agents/orchestrators/` | 16    | Multi-agent coordinators and domain routers                   |

### Agent Definition Format

Each agent `.md` file contains:

```yaml
---
model: sonnet|opus|haiku
tools: [Read, Write, Edit, Bash, Grep, Glob, ...]
description: One-line description for routing
---
System prompt with behavioral instructions, rules, and capabilities.
```

### Routing Law (Specialist-First — Iron Law)

The `developer` agent is the LAST RESORT. Common misrouting corrections:

| User Request        | WRONG     | CORRECT                |
| ------------------- | --------- | ---------------------- |
| "update docs"       | developer | **technical-writer**   |
| "refactor/clean up" | developer | **code-simplifier**    |
| "review code"       | developer | **code-reviewer**      |
| "run tests"         | developer | **qa**                 |
| "deploy/Docker/CI"  | developer | **devops**             |
| "design database"   | developer | **database-architect** |

### Self-Check Gates

Before spawning any agent, the router checks 6 gates:

| Gate          | Trigger                            | Action                        |
| ------------- | ---------------------------------- | ----------------------------- |
| 0: Reflection | `reflection-reminder.txt` exists   | Process reflections FIRST     |
| 1: Complexity | Multi-step/multi-file/architecture | Spawn PLANNER first           |
| 2: Security   | Auth/credentials/PII               | Include SECURITY-ARCHITECT    |
| 3: Tool       | Blacklisted tools needed           | Spawn appropriate agent       |
| 4: Creator    | Writing to creator paths           | Invoke creator skill          |
| 5: Architect  | Code-simplifier/devops/chaos       | Spawn ARCHITECT first         |
| 6: Audit      | Pipeline touched framework         | Spawn QA with proactive-audit |

### Key Files

| File                                   | Purpose                               |
| -------------------------------------- | ------------------------------------- |
| `.claude/context/agent-registry.json`  | Master agent lookup (source of truth) |
| `.claude/docs/@AGENT_ROUTING_TABLE.md` | Complete routing matrix               |
| `.claude/rules/agents.md`              | Quick-reference routing rules         |
| `.claude/agents/CLAUDE.md`             | Agent directory documentation         |

---

## 3. Skill System — 330+ Reusable Capabilities

### Overview

Skills are reusable instruction sets invoked by agents via `Skill({ skill: 'name' })`. Each skill is a directory under `.claude/skills/` containing a `SKILL.md` file with structured instructions, and optionally a workflow file and output schema.

### Architecture

```
.claude/skills/{skill-name}/
├── SKILL.md          # Instructions and frontmatter
└── (optional files)

.claude/workflows/{skill-name}-skill-workflow.md  # Agent orchestration
.claude/schemas/skill-{skill-name}-output.schema.json  # Output validation
```

### Skill Categories (by count)

| Category                   | Count | Examples                                                        |
| -------------------------- | ----- | --------------------------------------------------------------- |
| Language/Framework Experts | 80+   | `react-expert`, `python-backend-expert`, `rust-expert`          |
| DevOps & Infrastructure    | 25+   | `docker-compose`, `terraform-infra`, `kubernetes-flux`          |
| Security & Compliance      | 15+   | `security-architect`, `static-analysis`, `yara-authoring`       |
| Framework Management       | 15+   | `skill-creator`, `agent-creator`, `hook-creator`                |
| Architecture & Planning    | 12+   | `brainstorming`, `plan-generator`, `spec-init`                  |
| Code Search & Quality      | 10+   | `ripgrep`, `code-semantic-search`, `lsp-navigator`              |
| Multi-Agent Orchestration  | 10+   | `team-orchestration`, `consensus-voting`, `llm-council`         |
| Context & Memory           | 13+   | `context-compressor`, `memory-search`, `perpetual-memory`       |
| External Integrations      | 20+   | `chrome-browser`, `figma`, `jira-pm`, `slack-notifications`     |
| Research & Content         | 10+   | `deep-research`, `arxiv-mcp`, `doc-generator`                   |
| Session & Recovery         | 9+    | `session-handoff`, `recovery`, `heartbeat`                      |
| Framework Health           | 13+   | `proactive-audit`, `ecosystem-integrity-scanner`, `sharp-edges` |

### Invocation Protocol

```javascript
// CORRECT — loads SKILL.md into agent context
Skill({ skill: 'tdd' });

// WRONG — bypasses skill system
Read('.claude/skills/tdd/SKILL.md');
```

### Skill Discovery

Agents discover skills through:

1. `skill-index.json` — Master registry mapping names to paths and descriptions
2. `skill-discovery` skill — Meta-skill for understanding the invocation protocol
3. `@SKILL_CATALOG_TABLE.md` — Human-readable catalog

### Key Files

| File                                   | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `.claude/config/skill-index.json`      | Master skill registry          |
| `.claude/docs/@SKILL_CATALOG_TABLE.md` | Complete skill catalog         |
| `.claude/docs/@SKILL_USAGE_GUIDE.md`   | Usage instructions             |
| `.claude/skills/CLAUDE.md`             | Skills directory documentation |

---

## 4. Hook Enforcement System — 119 Hooks

### Overview

Hooks are `.cjs` scripts registered in `.claude/settings.json` that execute automatically before (PreToolUse) or after (PostToolUse) Claude Code tool calls. They enforce routing policies, security rules, quality gates, and operational protocols.

### Hook Lifecycle

1. Claude Code prepares a tool call
2. All registered `PreToolUse` hooks run in order
3. Hook receives `{ tool_name, tool_input }` via stdin
4. Hook exits `0` (allow), `2` (block with message), or `1` (error)
5. If any hook exits `2`, the tool call is blocked
6. Tool executes
7. All registered `PostToolUse` hooks run

### Hook Categories (17 directories, 119 hooks)

| Category      | Hooks | Key Responsibilities                                                      |
| ------------- | ----- | ------------------------------------------------------------------------- |
| `routing/`    | 44    | Routing guard, tool lockdown, creator guard, specialist-first enforcement |
| `safety/`     | 14    | Bash command auditing, JSON parse safety, shell injection prevention      |
| `reflection/` | 10    | Post-task reflection triggers, output scoring, reflection queue           |
| `validation/` | 9     | Schema checks, contract enforcement, parameter validation                 |
| `session/`    | 9     | Gap detection, handoff, context management, session state                 |
| `monitoring/` | 8     | Metrics collection, health checks, SLO monitoring                         |
| `workflow/`   | 5     | Phase gates, approval checks, workflow state                              |
| `lifecycle/`  | 4     | Spawn tracking, completion validation, cleanup                            |
| `evolution/`  | 4     | Artifact creation gates, evolution queue                                  |
| `metrics/`    | 3     | Token counting, latency tracking, cost estimation                         |
| `channels/`   | 2     | Telegram relay, channel auto-start                                        |
| `startup/`    | 2     | Initialization checks, preflight validation                               |
| `a2a/`        | 2     | Agent-to-agent protocol hooks                                             |
| `quality/`    | 1     | Lint/format enforcement                                                   |
| `memory/`     | 1     | Consolidation triggers, bloat detection                                   |
| `cleanup/`    | 1     | Temp file removal, worktree pruning                                       |
| `benchmarks/` | 0     | Performance benchmarking (placeholder)                                    |

### Critical Hooks

| Hook                                    | Event       | Function                                                                 |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `routing/routing-guard.cjs`             | PreToolUse  | Enforces specialist-first routing and router tool lockdown               |
| `routing/unified-creator-guard.cjs`     | PreToolUse  | Blocks direct writes to creator paths (skills, agents, hooks, workflows) |
| `safety/bash-pretool-bundle.cjs`        | PreToolUse  | Audits bash commands against safe-command allowlist                      |
| `reflection/reflection-trigger.cjs`     | PostToolUse | Queues reflection after task completion                                  |
| `monitoring/context-window-monitor.cjs` | PostToolUse | Tracks context usage, warns at 65%/75% thresholds                        |

### Environment Override

Hooks can be loosened during development:

```bash
CREATOR_GUARD=warn    # Warn instead of block
ROUTING_GUARD=off     # Disable routing enforcement
```

### Key Files

| File                                 | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `.claude/settings.json`              | Hook registration             |
| `.claude/hooks/CLAUDE.md`            | Hooks directory documentation |
| `.claude/docs/@ENFORCEMENT_HOOKS.md` | Detailed hook reference       |

---

## 5. Routing Engine — Semantic + Keyword + Hierarchical

### Overview

The routing engine determines which agent handles each request. It supports three routing strategies, configurable via environment variables.

### Routing Strategies

**1. Semantic Routing (default: `ROUTING_PRIORITY=semantic`)**

Uses vector embeddings to match user intent against agent capability descriptions. The semantic router:

- Embeds the user's request using FastEmbed
- Compares against pre-computed agent capability embeddings
- Returns the top-N matching agents ranked by cosine similarity
- Falls back to keyword routing if semantic confidence is low

**2. Keyword Routing (`ROUTING_PRIORITY=keyword`)**

Pattern-matching against a predefined routing table mapping keywords/patterns to agent types.

**Source:** `.claude/lib/routing/routing-table-core-map.cjs` (flat), `.claude/lib/routing/routing-table-hierarchical.cjs` (hierarchical)

**3. Hierarchical Routing (default: `HIERARCHICAL_ROUTING=on`)**

Two-level routing that first selects a domain router, then the domain router selects the specific specialist:

```
User Request → Router → domain-router-backend → python-pro
                      → domain-router-security → penetration-tester
                      → domain-router-mobile → ios-pro
```

9 domain routers cover: AI/ML, architecture/data, backend, infrastructure, mobile, niche, product, security, web frontend.

### Dynamic Model Selection

When `MODEL_ROUTER_ENABLED=on`, the routing engine also selects the appropriate model tier:

| Tier     | Model  | When                                                |
| -------- | ------ | --------------------------------------------------- |
| Simple   | haiku  | Quick lookups, simple formatting                    |
| Standard | sonnet | Most development tasks                              |
| Complex  | opus   | Architecture, security reviews, multi-step planning |

Resolution order: Task `model:` → agent frontmatter → `config.yaml` → complexity heuristic → sonnet (default).

### Key Files (30 files in `.claude/lib/routing/`)

| File                             | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `routing-table-core-map.cjs`     | Flat routing table (keyword → agent)                   |
| `routing-table-hierarchical.cjs` | Hierarchical routing (keyword → domain router → agent) |
| `semantic-router.cjs`            | Embedding-based semantic routing                       |
| `model-router.cjs`               | Dynamic model selection                                |
| `routing-resolver.cjs`           | Unified routing resolution (combines all strategies)   |

---

## 6. Memory System — STM/MTM/LTM Three-Tier

### Overview

Agent Studio implements a structured three-tier memory system separate from Claude Code's built-in auto-memory. The framework memory stores cross-session learnings, architectural decisions, and issue tracking.

### Memory Tiers

| Tier              | Directory                     | Scope           | Purpose                                                    |
| ----------------- | ----------------------------- | --------------- | ---------------------------------------------------------- |
| STM (Short-Term)  | `.claude/context/memory/stm/` | Current session | Recent tool calls, observations, working context           |
| MTM (Medium-Term) | `.claude/context/memory/mtm/` | Cross-session   | Patterns learned across recent sessions                    |
| LTM (Long-Term)   | `.claude/context/memory/ltm/` | Permanent       | Architectural decisions, proven patterns, stable knowledge |

### Structured Memory Files

| File           | Purpose                                |
| -------------- | -------------------------------------- |
| `learnings.md` | Accumulated learnings from agent work  |
| `decisions.md` | Architectural decisions with rationale |
| `issues.md`    | Known issues and blockers              |
| `named/`       | Topic-keyed memory entries             |
| `archive/`     | Expired memories moved to cold storage |

### MemoryRecord Tool

Agents write structured data via the `MemoryRecord` tool (never direct file writes):

- `patterns.json` — Discovered code patterns
- `gotchas.json` — Known pitfalls and workarounds
- Direct writes to these files are guarded by hooks

### Memory Operations (53 files in `.claude/lib/memory/`)

The memory library provides:

- **Tiers:** STM/MTM/LTM management with promotion/demotion
- **Vector store:** LanceDB-backed semantic search over memory entries
- **Pruning:** Automatic removal of stale or low-value memories
- **Consolidation:** Background merging of duplicate/related memories
- **Query:** Semantic + keyword hybrid retrieval
- **Entity extraction:** Named entity recognition from agent outputs

### Dual Memory Architecture

Agent Studio coexists with Claude Code's auto-memory:

- **Claude Code auto-memory:** `~/.claude/projects/*/memory/` — user preferences, feedback, project context
- **Agent Studio memory:** `.claude/context/memory/` — framework-level patterns, decisions, issues

These systems are independent with no cross-contamination.

### Key Files

| File                                        | Purpose                 |
| ------------------------------------------- | ----------------------- |
| `.claude/lib/memory/memory-tiers.cjs`       | Tier management         |
| `.claude/lib/memory/contextual-memory.cjs`  | Context-aware retrieval |
| `.claude/lib/memory/lance-memory-store.cjs` | LanceDB vector storage  |
| `.claude/rules/memory-protocol.md`          | Memory protocol rules   |
| `.claude/docs/@MEMORY_PROTOCOL.md`          | Full protocol reference |

---

## 7. Code Search — Hybrid BM25 + Semantic

### Overview

Agent Studio implements a hybrid code search system combining traditional BM25 text search with semantic vector search via LanceDB and FastEmbed embeddings.

### Architecture

```
User Query
    ├── BM25 Search (keyword matching)
    │   └── Inverted index over code chunks
    ├── Semantic Search (intent matching)
    │   └── FastEmbed embeddings → LanceDB vector similarity
    └── Hybrid Scorer (reciprocal rank fusion)
        └── Combined ranked results
```

### Components (28 files in `.claude/lib/code-indexing/`)

| Component               | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `bm25-indexer.cjs`      | Builds BM25 inverted index from code files                    |
| `semantic-indexer.cjs`  | Generates FastEmbed vectors, stores in LanceDB                |
| `hybrid-search.cjs`     | Combines BM25 + semantic results via rank fusion              |
| `merkle-tree.cjs`       | Tracks file changes via hash tree for incremental re-indexing |
| `chunker.cjs`           | Splits code files into semantically meaningful chunks         |
| `fastembed-wrapper.cjs` | Node.js wrapper for FastEmbed embedding model                 |

### Invocation

```bash
# Primary search command
pnpm search:code "routing table implementation"

# With compression pipeline
pnpm search:compress "how does memory pruning work"
```

### Search Priority Order (from rules)

1. `pnpm search:code` — Hybrid semantic + BM25 (default)
2. `Skill({ skill: 'lsp-navigator' })` — Compiler-level definitions/references
3. `Skill({ skill: 'ripgrep' })` — Fast text search
4. `Skill({ skill: 'code-semantic-search' })` — Conceptual search
5. `Skill({ skill: 'code-structural-search' })` — AST-based search
6. `Grep` — Fallback only

### Index Storage

| Path                          | Content                                  |
| ----------------------------- | ---------------------------------------- |
| `.claude/context/code-index/` | Merkle tree hashes, metadata             |
| `.claude/context/data/`       | LanceDB vector databases, SQLite indexes |

---

## 8. Workflow Engine — 300+ Multi-Agent Workflows

### Overview

Workflows define multi-phase, multi-agent choreographies for complex tasks. Each workflow specifies which agents participate, what phases execute, and how data flows between phases.

### Workflow Types

| Type                 | Directory                       | Count | Purpose                                                         |
| -------------------- | ------------------------------- | ----- | --------------------------------------------------------------- |
| Skill Workflows      | `.claude/workflows/`            | 280+  | `{skill-name}-skill-workflow.md` — orchestration for each skill |
| Core Workflows       | `.claude/workflows/core/`       | ~5    | Router decision logic, phase gates                              |
| Enterprise Workflows | `.claude/workflows/enterprise/` | ~5    | Multi-phase delivery pipelines                                  |
| Operations Workflows | `.claude/workflows/operations/` | ~5    | Monitoring, incident response                                   |
| Creator Workflows    | `.claude/workflows/creators/`   | ~10   | How creator skills operate                                      |
| Updater Workflows    | `.claude/workflows/updaters/`   | ~10   | How updater skills refresh artifacts                            |

### Workflow Structure

A typical skill workflow defines:

```markdown
## Phases

1. **Research** — Agent: researcher — Gather context and best practices
2. **Plan** — Agent: planner — Create implementation plan
3. **Implement** — Agent: developer — Execute the plan via TDD
4. **Review** — Agent: code-reviewer — Two-stage code review
5. **Validate** — Agent: qa — Run tests, check quality gates
```

### Phase Gates

Workflows use phase gates to validate output quality before advancing:

- Schema validation against output contract
- Quality score threshold (configurable per workflow)
- Mandatory fields check
- Human approval gate (for enterprise workflows)

### Workflow State

Runtime state persists in `.claude/context/workflows/` for recovery:

- Current phase
- Completed phase outputs
- Approval status
- Error/retry state

### Key Files

| File                                        | Purpose                          |
| ------------------------------------------- | -------------------------------- |
| `.claude/workflows/core/router-decision.md` | Primary routing decision tree    |
| `.claude/docs/@ENTERPRISE_WORKFLOWS.md`     | Enterprise pipeline docs         |
| `.claude/lib/workflow/` (25 files)          | Workflow engine implementation   |
| `.claude/workflows/CLAUDE.md`               | Workflow directory documentation |

---

## 9. Task Management & Conductor Pattern

### Overview

Tasks are the unit of work in agent-studio. The router creates tasks, assigns them to agents, and tracks their lifecycle. The Conductor Pattern enables dependency-aware multi-agent execution.

### Task Lifecycle

```
TaskCreate → pending → TaskUpdate(in_progress) → [agent works] → TaskUpdate(completed)
                                                                → TaskUpdate(blocked, blocker: "...")
```

### Conductor Pattern

One orchestrator (typically `master-orchestrator`) creates tasks with dependency chains:

```javascript
TaskCreate({ subject: "Design API", ... })           // task #1
TaskCreate({ subject: "Implement API", addBlockedBy: ["1"] })  // task #2 (waits for #1)
TaskCreate({ subject: "Write tests", addBlockedBy: ["2"] })    // task #3 (waits for #2)
```

Each task auto-unblocks when its dependencies complete. This prevents duplicate work and enables traceable execution.

### Agent-to-Agent Coordination

Tasks carry structured metadata for handoff:

- `status`, `progress` — Current state
- `discoveredFiles` — Files found during work
- `keyDecisions` — Architectural choices made
- `blocker`, `blockerType`, `needsFrom` — Blocking issues
- `summary`, `filesModified`, `outputArtifacts` — Completion data

### Key Files

| File                                               | Purpose                  |
| -------------------------------------------------- | ------------------------ |
| `.claude/rules/task-tracking.md`                   | Task protocol rules      |
| `.claude/docs/@TASK_TRACKING_GUIDE.md`             | Full TaskUpdate protocol |
| `.claude/skills/task-management-protocol/SKILL.md` | Session handoff patterns |

---

## 10. Context Window Management

### Overview

Agent Studio actively manages context window pressure across the router and subagent sessions to prevent degradation and maintain response quality.

### Token Budget Zones

| Zone     | Threshold | Action                          |
| -------- | --------- | ------------------------------- |
| Green    | <65%      | Normal operation                |
| Yellow   | 65-75%    | Warning, consider compression   |
| Orange   | 75-80%    | Compress at next opportunity    |
| Red      | 80-120K   | Mandatory compression           |
| Critical | 120-150K  | RED LINE — compress immediately |

### Compression Strategies

1. **Context compression** — `context-compressor` agent reduces large context while preserving evidence
2. **Memory deduplication** — `token-saver-memory-dedup` skill removes redundant memory entries
3. **Adaptive ratio** — `token-saver-adaptive-ratio` adjusts compression aggressiveness based on remaining budget

### Monitoring

`monitoring/context-window-monitor.cjs` PostToolUse hook tracks:

- Current token usage per turn
- Rate of context growth
- Compression reminder triggers

### Planner Constraints

The planner is required to:

- Estimate token budget per task
- Split tasks >80K tokens into smaller units
- Limit file reads to 15 per agent session

### Key Files

| File                                                  | Purpose               |
| ----------------------------------------------------- | --------------------- |
| `.claude/hooks/monitoring/context-window-monitor.cjs` | Context tracking hook |
| `.claude/skills/context-compressor/SKILL.md`          | Compression skill     |
| `.claude/skills/context-degradation/SKILL.md`         | Degradation detection |

---

## 11. Spawn System & Worktree Isolation

### Overview

Agents are spawned via `Task()` with optional git worktree isolation for safe parallel development. The spawn system manages context injection, memory loading, and worktree lifecycle.

### Spawn Flow

```
Router: Task({ subagent_type: 'developer', prompt: '...', task_id: 'task-1' })
    └── Claude Code creates subagent session
        ├── [Optional] Creates git worktree for isolation
        ├── Loads agent definition (.md file)
        ├── Injects spawn prompt (safety preamble, agent protocol, etc.)
        ├── Agent works with its allowed tools
        ├── Agent calls TaskUpdate(completed) when done
        └── Worktree merged or cleaned up
```

### Worktree Isolation

When `isolation: "worktree"` is specified:

- Creates a fresh git worktree branch
- Agent works on isolated copy of the repo
- Changes are committed to the worktree branch
- On completion, the worktree path and branch are returned
- Router decides whether to merge

### Safety Rules

- **Never spawn worktree agents with uncommitted changes** — commit first
- **Never delete worktrees without age check** — use `fs.statSync`
- **Worktree agents may skip TaskUpdate** — verify TaskList after completion
- **Don't spawn worktrees for <10 line edits** — worktrees inject ~150K context overhead

### Key Files (10 files in `.claude/lib/spawn/`)

| File                            | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `prompt-assembler.cjs`          | Builds spawn prompts with injectable patches |
| `prompt-assembler-sections.cjs` | Section-level prompt assembly                |
| `prompt-assembler-data.cjs`     | Data loading for prompt sections             |
| `spawn-memory-manager.cjs`      | Memory injection for spawned agents          |

---

## 12. Reflection & Self-Improvement System

### Overview

The reflection system implements a RECE (Reflect-Evaluate-Correct-Execute) loop that scores agent outputs, extracts learnings, and feeds improvements back into the framework.

### Reflection Pipeline

```
Agent completes task
    → PostToolUse hook triggers reflection
    → Reflection request added to reflection-spawn-request.json
    → Next session start: Router spawns reflection-agent
    → reflection-agent scores output against rubrics
    → Learnings extracted → written to memory
    → Corrections → create follow-up tasks
```

### Reflection Types

| Type                | Trigger                        | Action                         |
| ------------------- | ------------------------------ | ------------------------------ |
| Task completion     | Every TaskUpdate(completed)    | Score output quality           |
| Deviation found     | DR-1/DR-2/DR-3 deviation       | Log and evaluate impact        |
| AI slop detected    | Cleanup scan finds artifacts   | Log to session-gap-log         |
| Self-review         | Milestone reached              | "Can I improve this?" analysis |
| Pipeline evaluation | Multi-phase pipeline completes | 5-dimension composite score    |

### Scoring Dimensions

The pipeline evaluator scores across:

1. **Accuracy** — Does the output match the specification?
2. **Groundedness** — Are claims supported by evidence?
3. **Coherence** — Is the output internally consistent?
4. **Relevance** — Does it address the actual request?
5. **Completeness** — Are all requirements covered?

### Key Files

| File                                                    | Purpose                   |
| ------------------------------------------------------- | ------------------------- |
| `.claude/hooks/reflection/reflection-trigger.cjs`       | Reflection queue hook     |
| `.claude/context/runtime/reflection-spawn-request.json` | Pending reflections queue |
| `.claude/lib/reflection/` (2 files)                     | RECE loop implementation  |
| `.claude/skills/outcome-reflection/SKILL.md`            | Outcome comparison skill  |

---

## 13. Validation Pipeline — Schema + Contract + CI

### Overview

A multi-layer validation system ensures framework integrity through JSON schema validation, cross-reference checking, and CI gates.

### Validation Layers

**Layer 1: JSON Schema Validation (250+ schemas)**
Every framework artifact has a corresponding JSON schema in `.claude/schemas/`:

- Agent definitions → `agent-definition.schema.json`
- Skill definitions → `skill-definition.schema.json`
- Workflow definitions → `workflow-definition.schema.json`
- Task outputs → `task-output.schema.json`

**Layer 2: Cross-Reference Validation**
Scripts verify all references are valid:

- `validate-all-references.mjs` — Checks agent, skill, hook, workflow cross-refs
- `validate-model-names.mjs` — Verifies model names in frontmatter
- `validate-workflow.mjs` — Validates workflow YAML/JSON contracts
- `validate-index.mjs` — Validates skill/agent registry indexes

**Layer 3: CI Gates**

```bash
pnpm validate        # Core config + model validation
pnpm validate:full   # Full validation suite (all checks)
pnpm metrics:ci      # Unified CI metrics gate
```

### Required Status Checks

Defined in `.claude/config/required-status-checks.json`:

- `pnpm lint:fix` — Zero errors
- `pnpm format` — No changes
- `pnpm test` — All tests pass
- `pnpm validate` — Schema validation passes

### Key Files

| File                                         | Purpose                 |
| -------------------------------------------- | ----------------------- |
| `.claude/schemas/` (250+ files)              | JSON Schema definitions |
| `scripts/validate-all-references.mjs`        | Cross-reference checker |
| `.claude/config/required-status-checks.json` | CI gate definitions     |

---

## 14. Configuration System — Layered Config Resolution

### Overview

Configuration is resolved through multiple layers with clear precedence rules.

### Resolution Order

1. **Task-level** — `model:` in Task() call
2. **Agent frontmatter** — `model:` in agent `.md` file
3. **config.yaml** — Framework-level defaults
4. **Complexity heuristic** — Auto-detection based on task analysis
5. **Fallback** — sonnet (default)

### Configuration Files (15 in `.claude/config/`)

| File                      | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `agent-config.json`       | Agent-level config (models, tools, spawn limits) |
| `model-registry.json`     | Available models and properties                  |
| `phase-models.json`       | Model per pipeline phase                         |
| `capability-routing.json` | Agent capability keywords                        |
| `skill-index.json`        | Skill registry                                   |
| `code-index-config.json`  | Code search config                               |
| `presets.json`            | Reusable task presets                            |
| `tool-manifest.json`      | Tool registry                                    |
| `trusted-sources.json`    | Trusted external sources                         |

### Environment Variables

| Variable               | Purpose                  | Default    |
| ---------------------- | ------------------------ | ---------- |
| `HIERARCHICAL_ROUTING` | Enable two-level routing | `on`       |
| `ROUTING_PRIORITY`     | `semantic` or `keyword`  | `semantic` |
| `MODEL_ROUTER_ENABLED` | Dynamic model selection  | `off`      |
| `CREATOR_GUARD`        | Creator path enforcement | `block`    |
| `ROUTING_GUARD`        | Routing enforcement      | `block`    |

---

## 15. Rules Engine — 14 Auto-Loaded Behavioral Rules

### Overview

Rules are markdown files in `.claude/rules/` that are automatically loaded into every agent's context window. They define non-negotiable behavioral constraints that govern all agent activity.

### Rules Catalog

| Rule File                  | Purpose                                                 | Enforcement            |
| -------------------------- | ------------------------------------------------------- | ---------------------- |
| `agents.md`                | Specialist-first routing law                            | routing-guard.cjs      |
| `cleanup-always.md`        | End-of-task cleanup protocol                            | Post-task validation   |
| `code-standards.md`        | Code quality, search tool priority, lint/format         | ESLint + Prettier      |
| `deviation-rules.md`       | DR-1/DR-2/DR-3/DR-4 deviation protocol                  | Session gap log        |
| `documentation-always.md`  | CHANGELOG/README/env.example mandatory updates          | Pre-completion hook    |
| `git-workflow.md`          | Conventional Commits, branch naming, AI attribution     | Commit validator       |
| `hooks.md`                 | Hook registration, exit codes                           | Settings.json          |
| `memory-protocol.md`       | STM/MTM/LTM usage rules                                 | Memory hooks           |
| `plan-file-update.md`      | Plan file `[ ]`→`[~]`→`[x]` markers                     | Agent self-enforcement |
| `safety-rules.md`          | Sharp edges (SE-01 through SE-07), file deletion safety | Safety hooks           |
| `security.md`              | shell:false, safeParseJSON, OWASP, prompt injection     | ESLint + hooks         |
| `task-tracking.md`         | TaskUpdate lifecycle, conductor pattern                 | Task hooks             |
| `workspace-conventions.md` | File placement, naming, provenance headers              | Cleanup hooks          |

### Conditional Rules

The `frameworks/` subdirectory contains framework-specific rules loaded conditionally based on project context (e.g., React, Django conventions).

---

## 16. Creator Ecosystem — Artifact Generation Pipeline

### Overview

The creator ecosystem ensures all framework artifacts (skills, agents, hooks, workflows, schemas, templates) are created through standardized pipelines with research, validation, and testing gates.

### Creator Skills

| Skill              | Creates                               | Gate                                                              |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------- |
| `skill-creator`    | Skills (SKILL.md + workflow + schema) | Research synthesis → feasibility gate → TDD → review              |
| `agent-creator`    | Agents (.md with frontmatter)         | Research → capability gap analysis → definition → registry update |
| `hook-creator`     | Hooks (.cjs with registration)        | Research → safety review → implementation → settings.json update  |
| `workflow-creator` | Workflows (.md with phases)           | Research → agent availability check → phase design → validation   |
| `template-creator` | Templates                             | Research → pattern analysis → template generation                 |
| `schema-creator`   | JSON Schemas                          | Research → contract analysis → schema generation → validation     |
| `command-creator`  | Commands                              | Research → command design → prompt expansion                      |
| `tool-creator`     | CLI tools                             | Research → interface design → implementation → manifest update    |
| `rule-creator`     | Rules (.md)                           | Research → impact analysis → rule definition                      |

### Updater Skills

| Skill              | Updates            | Safety                                       |
| ------------------ | ------------------ | -------------------------------------------- |
| `skill-updater`    | Existing skills    | Diff-based risk assessment, TDD checkpoints  |
| `agent-updater`    | Existing agents    | Frontmatter validation, routing impact check |
| `workflow-updater` | Existing workflows | Phase-gate regression check                  |

### Iron Law

Files under `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `.claude/workflows/`, `.claude/templates/`, `.claude/schemas/` are FORBIDDEN for direct `Write`/`Edit`. The `unified-creator-guard.cjs` hook blocks all direct writes — artifacts must go through creator skills.

### Key Files

| File                                              | Purpose                  |
| ------------------------------------------------- | ------------------------ |
| `.claude/hooks/routing/unified-creator-guard.cjs` | Creator path enforcement |
| `.claude/docs/@CREATOR_SKILLS_TABLE.md`           | Creator skill catalog    |
| `.claude/lib/creators/` (6 files)                 | Creator utilities        |

---

## 17. Evolution System — Self-Evolving Framework

### Overview

The evolution system allows agent-studio to detect capability gaps and automatically create new artifacts to fill them.

### Evolution Pipeline

```
Ecosystem Auditor scans codebase
    → Detects missing agent/skill for technology X
    → Creates evolution-request (queued)
    → Evolution Orchestrator processes queue
    → Research phase: best practices, existing patterns
    → Creation phase: invoke appropriate creator skill
    → Validation phase: TDD, schema check, integration test
    → Registration: update registries and indexes
```

### Components

| Component                         | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `ecosystem-auditor` agent         | Scans codebase, maps tech stack, identifies gaps |
| `evolution-orchestrator` agent    | Orchestrates the full EVOLVE workflow            |
| `recommend-evolution` skill       | Records standardized evolution recommendations   |
| `creation-feasibility-gate` skill | Validates feasibility before creation starts     |
| `research-synthesis` skill        | Research best practices before creation          |

### Key Files

| File                                                     | Purpose                  |
| -------------------------------------------------------- | ------------------------ |
| `.claude/agents/orchestrators/evolution-orchestrator.md` | Evolution coordinator    |
| `.claude/agents/specialized/ecosystem-auditor.md`        | Gap detector             |
| `.claude/lib/evolution/` (6 files)                       | Evolution engine         |
| `.claude/schemas/evolution-request.schema.json`          | Evolution request schema |

---

## 18. Security Architecture — OWASP Agentic AI Top 10

### Overview

Agent Studio implements security controls mapped to the OWASP Agentic AI Top 10, with dedicated agents, hooks, and skills for security analysis.

### OWASP Agentic AI Coverage

| OWASP ID | Risk                 | Agent Studio Mitigation                                          |
| -------- | -------------------- | ---------------------------------------------------------------- |
| ASI01    | Agent Goal Hijacking | Input validation, task boundary checks, routing guard            |
| ASI02    | Tool Misuse          | Tool allowlists per agent type, routing-guard.cjs                |
| ASI06    | Memory Poisoning     | Memory write sanitization, schema validation, rotation (ADR-102) |

### Security Controls

**Command Execution Safety:**

- `shell: false` mandatory for all `spawn()` calls (ESLint-enforced)
- `safeParseJSON()` required for all untrusted JSON (prototype pollution protection)
- Bash command allowlist in `safety/bash-pretool-bundle.cjs`

**Prompt Injection Defense:**

- Separate system instructions from user input
- Input validation at agent boundaries
- Output filtering for leaked system prompts

**Memory Poisoning Prevention:**

- Schema validation on all memory writes
- `__proto__`, `constructor`, `prototype` key filtering
- Memory rotation to cold storage

### Security Agents & Skills

| Agent/Skill                 | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `security-architect` agent  | Threat modeling, auth review, zero-trust design |
| `penetration-tester` agent  | Ethical hacking, vulnerability scanning         |
| `security-scanning` skill   | SAST (Semgrep), SCA, dependency scanning        |
| `static-analysis` skill     | CodeQL + Semgrep SARIF output                   |
| `insecure-defaults` skill   | Hardcoded credentials, fail-open detection      |
| `differential-review` skill | Security-focused diff review                    |

---

## 19. Heartbeat & Cron Orchestration

### Overview

The heartbeat system provides autonomous background monitoring through 7 heartbeat loops managed by the `heartbeat-orchestrator` agent.

### Architecture

The `heartbeat-orchestrator` isolates all cron job execution from the router session:

- Registers heartbeat loops via `CronCreate`
- Handles cron tick callbacks
- Spawns disposable sub-agents for Claude-dependent actions
- Prevents context pollution in the router

### Rules

- Heartbeat prompts produce ZERO text output for `HEARTBEAT_OK` — only speak when actionable
- Cron prompts MUST spawn disposable agents via `Task()` (never execute inline)
- Recurring tasks auto-expire after 7 days

### Key Files

| File                                                     | Purpose                    |
| -------------------------------------------------------- | -------------------------- |
| `.claude/agents/orchestrators/heartbeat-orchestrator.md` | Cron isolation agent       |
| `.claude/skills/heartbeat/SKILL.md`                      | Heartbeat management skill |
| `.claude/skills/scheduled-tasks/SKILL.md`                | CronCreate usage           |

---

## 20. Agent-to-Agent (A2A) Protocol

### Overview

The A2A protocol enables direct inter-agent communication beyond the Task() dispatch model, supporting more complex coordination patterns.

### Components (7 files in `.claude/lib/a2a/`)

| Component          | Purpose                                     |
| ------------------ | ------------------------------------------- |
| `a2a-server.cjs`   | HTTP server for inter-agent messages        |
| `a2a-client.cjs`   | Client for sending messages to other agents |
| `a2a-protocol.cjs` | Message format and protocol definition      |
| `a2a-router.cjs`   | Routes A2A messages to appropriate handlers |

### Hooks (2 in `.claude/hooks/a2a/`)

Pre/post hooks for A2A message handling, validation, and logging.

---

## 21. Model Selection & Dynamic Routing

### Overview

Agent Studio supports dynamic model selection based on task complexity, agent requirements, and configuration.

### Model Tiers

| Model               | Use Case                                 | Context            |
| ------------------- | ---------------------------------------- | ------------------ |
| `claude-haiku-4-5`  | Simple tasks, formatting, lookups        | Fast, low-cost     |
| `claude-sonnet-4-6` | Standard development, most tasks         | Balanced           |
| `claude-opus-4-6`   | Architecture, security, complex planning | Maximum capability |

### Resolution Chain

```
1. Task({ model: 'opus' })     → Explicit override (highest priority)
2. Agent frontmatter: model: opus  → Agent-level default
3. config.yaml model settings     → Framework-level default
4. Complexity heuristic           → Auto-detection
5. sonnet                         → Fallback default
```

### Dynamic Router

When `MODEL_ROUTER_ENABLED=on`:

- Analyzes task keywords and complexity signals
- Routes simple tasks to haiku (saves cost/time)
- Escalates security/architecture to opus
- Standard tasks stay on sonnet

### Key Files

| File                                   | Purpose                     |
| -------------------------------------- | --------------------------- |
| `.claude/lib/routing/model-router.cjs` | Dynamic model selection     |
| `.claude/config/model-registry.json`   | Model properties            |
| `.claude/config/phase-models.json`     | Per-phase model assignments |
| `.claude/docs/@MODEL_SELECTION.md`     | Model selection guide       |

---

## 22. Multi-LLM Consultation (Omega CLIs)

### Overview

Agent Studio integrates with multiple LLM providers through "Omega CLI" wrappers, enabling cross-model consultation, council debates, and multi-perspective analysis.

### Supported Providers

| Skill              | CLI      | Provider                               |
| ------------------ | -------- | -------------------------------------- |
| `omega-claude-cli` | `claude` | Anthropic Claude Code (second session) |
| `omega-codex-cli`  | `codex`  | OpenAI Codex CLI                       |
| `omega-cursor-cli` | `cursor` | Cursor Agent CLI                       |
| `omega-gemini-cli` | `gemini` | Google Gemini CLI                      |

### Council Protocol

The `llm-council` skill orchestrates multi-LLM deliberation:

1. **Independent responses** — Each LLM answers the question independently
2. **Anonymized peer review** — Each reviews the others' answers (without knowing who wrote what)
3. **Chairman synthesis** — Primary model synthesizes a final answer

### Use Cases

- Architecture decisions with multi-perspective analysis
- Code review cross-validation
- Research verification across models
- Debugging with fresh perspectives

---

## 23. Monitoring & Observability

### Overview

Comprehensive monitoring through 15 library modules and 8 hooks covering health checks, SLO tracking, metrics collection, and alerting.

### Monitoring Stack

| Component          | Implementation                            | Purpose                                     |
| ------------------ | ----------------------------------------- | ------------------------------------------- |
| Context monitoring | `context-window-monitor.cjs`              | Token usage tracking, degradation alerts    |
| Health checks      | `.claude/lib/monitoring/health-check.cjs` | System health verification                  |
| SLO tracking       | `.claude/lib/monitoring/slo-tracker.cjs`  | Service level objective monitoring          |
| Metrics            | `.claude/lib/metrics/` (5 files)          | Token counting, cost estimation, latency    |
| Alerting           | `notification-triggers` skill             | Regex-based pattern detection in tool calls |

### Metrics Collected

- Token usage per turn and per session
- Hook execution latency
- Task completion rates
- Model selection distribution
- Context window utilization percentage
- Deviation and error counts

---

## 24. Self-Healing System

### Overview

The self-healing system detects known failure patterns and automatically recovers without human intervention.

### Implementation

| Component                          | Purpose                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `.claude/lib/self-healing/`        | Failure pattern recognition and auto-recovery                      |
| `.claude/context/self-healing/`    | Known failure pattern database                                     |
| `behavioral-loop-detection` skill  | Detects agents stuck in repetitive loops (20-action window)        |
| `error-recovery-escalation` skill  | 5-level escalation: retry → nudge → replan → fallback → force-done |
| `troubleshooting-regression` skill | Regression troubleshooting for hook/router/memory failures         |

---

## 25. Session Handoff & Recovery

### Overview

When a session approaches context limits or needs to transfer work to a new session, the handoff system preserves context and pending actions.

### Handoff Protocol

1. Agent detects handoff trigger (context pressure, explicit request)
2. Invokes `session-handoff` skill
3. Handoff log created with:
   - **NEXT ACTION (IMMEDIATE)** at the top (mandatory)
   - Instructions to "spawn agents" (never "implement directly")
   - Pending tasks and their state
   - Key findings and decisions
4. New session launched via `scripts/spawn-new-session.cjs`
5. New session reads handoff log and continues

### Recovery

The `recovery` skill handles:

- Workflow resumption after context loss
- Session interruption recovery
- State reconstruction from execution snapshots

### Key Files

| File                                          | Purpose                    |
| --------------------------------------------- | -------------------------- |
| `.claude/skills/session-handoff/SKILL.md`     | Handoff skill              |
| `.claude/skills/recovery/SKILL.md`            | Recovery skill             |
| `scripts/spawn-new-session.cjs`               | New session launcher       |
| `scripts/wait-for-handoff.mjs`                | Handoff completion polling |
| `.claude/schemas/session-handoff.schema.json` | Handoff payload schema     |

---

## 26. Mission System — Long-Running Tasks

### Overview

The mission system manages tasks that span multiple sessions, maintaining persistent state and coordinating progress across session boundaries.

### Implementation (13 files in `.claude/lib/mission/`)

Missions are long-running objectives that decompose into multiple tasks across multiple sessions. The system tracks:

- Mission definition and objectives
- Phase progression across sessions
- Intermediate results and checkpoints
- Final deliverables

---

## 27. C4 Architecture Documentation Pipeline

### Overview

Four specialized agents implement the C4 model (Context, Container, Component, Code) for comprehensive architecture documentation.

### Agents

| Agent          | Level     | Input                   | Output                                            |
| -------------- | --------- | ----------------------- | ------------------------------------------------- |
| `c4-code`      | Code      | Source directories      | Function signatures, dependencies, code structure |
| `c4-component` | Component | Code-level docs         | Component boundaries, interfaces, relationships   |
| `c4-container` | Container | Component docs          | Deployment units, container APIs                  |
| `c4-context`   | Context   | Container + system docs | System context diagrams, personas, user journeys  |

### Pipeline

```
Source Code → c4-code → c4-component → c4-container → c4-context
```

Each level synthesizes the previous level's output into higher-level architecture documentation.

---

## 28. Consensus & Swarm Coordination

### Overview

Multi-agent decision making and parallel execution through consensus voting and swarm coordination.

### Consensus Voting

The `consensus-voting` skill implements Byzantine consensus:

- Multiple agents vote on a decision
- Voting protocols handle disagreements
- Quorum requirements ensure reliable outcomes
- Used for architecture decisions, code review verdicts

### Swarm Coordination

The `swarm-coordinator` agent manages Queen/Worker topology:

- Queen distributes tasks to worker agents
- Workers execute independently
- Results aggregated by coordinator
- Consensus reached on combined output

### Party Mode

The `party-orchestrator` enables collaborative multi-agent sessions with standard Task-based coordination.

---

## 29. Plugin System

### Overview

6 files in `.claude/lib/plugins/` implement an extension loading system for adding capabilities to the framework without modifying core code.

| Component        | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| Plugin loader    | Discovers and loads plugins from configured paths       |
| Plugin lifecycle | Manages plugin initialization, activation, deactivation |
| Plugin registry  | Tracks loaded plugins and their capabilities            |

---

## 30. Telegram Integration — Channel Daemon

### Overview

Agent Studio runs a standalone **channel daemon** for Telegram — a persistent Node.js background process inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) (event router) and Claude Code's KAIROS (persistent assistant with memory). It runs completely independently of any Claude Code session with zero API cost when idle.

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Channel Daemon (port 3101)                     │
│                                                                   │
│  [Telegram] → [Source: long-poll] → [Dispatcher] → [Renderer]   │
│                     ↕                    ↕            (Claude-p)  │
│               [Commands]           [3-Tier Memory]       ↓       │
│              (/help etc)           [Dream Engine]    [Sinks]     │
│                                                     (Tg API)    │
│  [Executor: headless claude -p with tools for tasks]             │
│  [HTTP API: /status /send /history /memory /dream /stop]         │
└──────────────────────────────────────────────────────────────────┘
```

### KAIROS-Style 3-Tier Memory

| Tier                     | Contents                                    | Lifecycle                                              |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| **1. Chat History**      | Raw recent messages (max 30)                | Auto-compacts at 20 messages via Haiku summarization   |
| **2. Session Summaries** | Structured conversation summaries           | Wiped after 5 compactions (session rotation)           |
| **3. User Profiles**     | Durable facts (name, preferences, projects) | Survives everything — extracted by dream consolidation |

### Dream Consolidation (KAIROS 4-Phase)

| Phase       | Action                                                          |
| ----------- | --------------------------------------------------------------- |
| Orient      | Review existing profile facts, check for stale data             |
| Gather      | Extract identity, projects, preferences, expertise, corrections |
| Consolidate | Merge new with existing, resolve conflicts (newer wins)         |
| Prune       | Remove duplicates, stale facts, trivial details                 |

Triggers: `/dream` command, auto after 5+ messages + 1hr, 10-minute timer check. Uses Sonnet.

### Context Rot Protection

Auto-detects when conversation context exceeds 80% of budget → forces compaction. After 5 compactions, triggers session rotation (Tier 1+2 wiped, Tier 3 profile preserved). User never notices.

### Bot Commands (OpenClaw-style)

Registered with Telegram `setMyCommands` — users see them in the `/` menu:

`/start`, `/help`, `/status`, `/memory`, `/tasks`, `/dream`, `/history`, `/new`, `/compress`, `/retry`, `/forget`, `/model`, `/ping`

### Task Execution

When users ask the bot to DO something (run code, check git, etc.):

1. Renderer responds with `[TASK]` tag
2. Dispatcher spawns `claude -p --model sonnet --max-turns 10` with full tool access
3. Sends "⚙️ Running task..." notification, then "✅ Task complete: ..." with result
4. Tracked in `/tasks` history

### HTTP API (port 3101)

| Endpoint       | Purpose                                 |
| -------------- | --------------------------------------- |
| `POST /send`   | Router sends messages to Telegram users |
| `GET /history` | Conversation history                    |
| `GET /memory`  | Memory stats + user profiles            |
| `GET /dream`   | Trigger dream consolidation             |
| `GET /status`  | Daemon stats                            |
| `POST /event`  | Inject custom events                    |
| `GET /stop`    | Shutdown                                |

### User Commands

| Skill                   | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `/setup-telegram`       | Verify bot config (token, owner, allowlist) |
| `/enable-telegram`      | Start daemon + auto-detect voice pipeline   |
| `/disable-telegram`     | Stop daemon                                 |
| `/setup-telegram-voice` | Verify voice config (Whisper, TTS keys)     |
| `/check-telegram-voice` | Check voice pipeline status                 |

### Key Files

| File                                        | Purpose                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `scripts/channels/daemon/` (11 files)       | The channel daemon — sources, sinks, router, dispatcher, renderer, memory, commands, executor |
| `scripts/channels/telegram-relay.mjs`       | MCP server (tools-only mode in main session, `TELEGRAM_DISABLE_POLLING=1`)                    |
| `scripts/channels/telegram-ctl.cjs`         | CLI: start / stop / status / restart                                                          |
| `.claude/hooks/channels/telegram-start.cjs` | Daemon launcher (PowerShell hidden window)                                                    |
| `.claude/docs/TELEGRAM_ARCHITECTURE.md`     | Full architecture documentation                                                               |

### What Replaced

The old system (326-line `channel-auto-start.cjs` with VBScript + BAT + WMI PID tracking + separate Claude session with `--dangerously-load-development-channels`) was archived. The daemon approach eliminates: VBScript, BAT files, WMI queries, confirmation dialog hacks, PID tracking, and the need for a separate Claude session.

---

## 31. Test Suite — 200+ Tests

### Overview

The test suite uses Node.js built-in test runner (`node --test`) with sequential execution to avoid shared-state conflicts.

### Structure

```
tests/
├── agents/             # Agent definition tests
├── cli/                # CLI tool tests
├── code-indexing/      # Code search and indexing tests
├── config/             # Configuration validation tests
├── hooks/              # Hook behavior tests
├── integration/        # Cross-component integration tests
├── lib/                # Library module tests (mirrors .claude/lib/)
│   ├── agents/         # Agent config schema tests
│   ├── code-indexing/  # BM25, embedding, hybrid search internals
│   ├── creators/       # Creator ecosystem impact tests
│   ├── memory/         # Memory system tests (LanceDB, tiers, pruning)
│   ├── monitoring/     # Metrics, health, SLO monitoring tests
│   ├── party-mode/     # Consensus voting tests
│   ├── plan/           # Plan progress tracking tests
│   ├── qa/             # QA criteria and report tests
│   ├── reflection/     # Reflection system contract tests
│   ├── routing/        # Routing logic tests
│   └── self-healing/   # Loop state management tests
├── schemas/            # JSON schema validation tests
├── scripts/            # Script behavior tests
└── tools/              # Tool execution tests
```

### Running Tests

```bash
pnpm test                          # All tests (concurrency=1)
pnpm test:framework                # Framework-specific tests
node --test tests/path/to/file.test.cjs  # Single test
```

---

## 32. Lint, Format & Pre-Commit Pipeline

### Overview

Mandatory code quality gates that must pass before any commit.

### Pipeline

```bash
pnpm lint:fix    # ESLint with auto-fix — zero errors required
pnpm format      # Prettier formatting — zero changes required
```

### Pre-Commit Checks

1. Lint passes (zero errors)
2. Format applied (no changes)
3. Commit message validated (Conventional Commits)
4. Security scan (no secrets, no `shell: true`)
5. No `console.log` in production code

### AI Attribution

All AI-assisted commits must include:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## 33. Documentation System — CLAUDE.md Breadcrumbs

### Overview

A hierarchical documentation system using CLAUDE.md files at each directory level, providing progressively more detail as you navigate deeper into the codebase.

### Hierarchy

```
.claude/CLAUDE.md                    → Master index with routing instructions
    ├── agents/CLAUDE.md             → Overview of 119 agents, 4 tiers
    │   ├── core/CLAUDE.md           → Each of 10 core agents described
    │   ├── domain/CLAUDE.md         → 68 domain specialists categorized
    │   ├── orchestrators/CLAUDE.md  → 16 orchestrators + domain routers
    │   └── specialized/CLAUDE.md    → 25 specialized agents
    ├── hooks/CLAUDE.md              → 17 hook categories, 119 total
    ├── lib/CLAUDE.md                → 50+ library modules grouped
    ├── skills/CLAUDE.md             → 330+ skills by category
    ├── context/CLAUDE.md            → Runtime data, memory tiers
    ├── config/CLAUDE.md             → 15 config files
    ├── schemas/CLAUDE.md            → 250+ JSON schemas
    ├── docs/CLAUDE.md               → Reference documentation
    ├── rules/CLAUDE.md              → 14 behavioral rules
    ├── workflows/CLAUDE.md          → 300+ workflows
    └── commands/CLAUDE.md           → 200+ slash commands
scripts/CLAUDE.md                    → Build & validation scripts
tests/CLAUDE.md                      → Test suite structure
```

---

## 34. Deviation Rules Protocol

### Overview

A structured protocol for handling unexpected findings during task execution.

### Decision Tree

| Rule | Trigger                                          | Action                                                    |
| ---- | ------------------------------------------------ | --------------------------------------------------------- |
| DR-1 | Clear, obvious bug in code being modified        | Auto-fix (minimal), log to session gap log                |
| DR-2 | Missing prerequisite (<30 lines, no arch impact) | Auto-add, record in decisions.md, log                     |
| DR-3 | Requires architectural decision                  | **STOP**, escalate to router, wait for acknowledgement    |
| DR-4 | Any deviation at all                             | Log to session-gap-log.jsonl with type, rule, description |

---

## 35. Sharp Edges Catalog — Known Hazards

### Overview

A living catalog of 7 known hazard patterns specific to agent-studio, maintained as SE-01 through SE-07.

| ID    | Hazard                          | Mitigation                                        |
| ----- | ------------------------------- | ------------------------------------------------- |
| SE-01 | Windows backslash paths         | Always normalize: `.replace(/\\\\/g, '/')`        |
| SE-02 | Prototype pollution             | Use `safeParseJSON()`, filter `__proto__` keys    |
| SE-03 | Hook exit codes                 | Exit `0` (allow) or `2` (block), never `1`        |
| SE-04 | Async swallowing                | Never `await` inside `forEach`, always `.catch()` |
| SE-05 | ReDoS in glob-to-regex          | Escape special chars first, then convert          |
| SE-06 | DST arithmetic                  | Never add fixed milliseconds for day boundaries   |
| SE-07 | Array mutation during iteration | Copy array first: `[...arr].forEach(...)`         |

---

## 36. Cleanup & Anti-Slop System

### Overview

Every agent runs a mandatory cleanup scan at task end to detect and remove AI-generated artifacts that shouldn't persist.

### AI Slop Patterns

Debug files, dump files, UUID-named temp files, analysis files outside proper directories, scripts not in package.json, markdown files that aren't README/CLAUDE/LICENSE/CHANGELOG.

### Correct File Locations

| Type        | Location                                      |
| ----------- | --------------------------------------------- |
| Debug/temp  | `.claude/context/tmp/`                        |
| Reports     | `.claude/context/reports/{domain}/`           |
| Plans       | `.claude/context/plans/`                      |
| Research    | `.claude/context/artifacts/research-reports/` |
| Lint output | stdout only (never persisted)                 |

---

## 37. Git Workflow & Conventional Commits

### Overview

Strict git workflow with Conventional Commits, branch naming conventions, and one-commit-per-task atomic commits.

### Commit Format

```
<type>: <subject>     (subject ≤72 chars, imperative mood, no period)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`

### Branch Conventions

- `feature/name` — New features
- `fix/name` — Bug fixes
- `refactor/name` — Refactoring
- Never force-push to main/master

---

## 38. Schema Validation — 250+ JSON Schemas

### Overview

Every framework artifact type has a corresponding JSON schema for structural validation. Schemas are organized into categories: core framework, pipeline/task, evolution/creation, runtime/session, and 200+ skill output schemas.

### Schema Categories

| Category           | Count | Examples                                                |
| ------------------ | ----- | ------------------------------------------------------- |
| Core framework     | ~20   | agent-definition, skill-definition, workflow-definition |
| Pipeline/task      | ~10   | plan, task-output, phase-advance                        |
| Evolution/creation | ~5    | evolution-request, artifact-manifest                    |
| Runtime/session    | ~5    | session-handoff, reflection-spawn-request               |
| Skill outputs      | 200+  | skill-tdd-output, skill-debugging-output                |
| Other              | ~15   | database-architecture, test-plan, ux-spec               |

---

## 39. CLI Tooling — 74 Executable Utilities

### Overview

74 CLI-executable utilities in `.claude/tools/cli/` provide standalone operations callable via bash. These are distinct from library modules — they run as standalone scripts.

### Categories

- **Search:** hybrid-search, semantic-search, structural-search
- **Validation:** schema-validator, reference-checker, model-name-validator
- **Registry:** generate-agent-registry, generate-skill-index
- **Metrics:** token-counter, cost-estimator, hook-perf-benchmark
- **Maintenance:** cleanup-temp, prune-stale, archive-old
- **Diagnostics:** health-check, debug-session, analyze-transcript

---

## 40. Environment Variable & Feature Flag Configuration

### Overview

Agent Studio uses environment variables for runtime configuration of routing strategies, enforcement levels, and feature toggles.

### Key Variables

| Variable               | Values               | Default    | Purpose                  |
| ---------------------- | -------------------- | ---------- | ------------------------ |
| `HIERARCHICAL_ROUTING` | `on`/`off`           | `on`       | Two-level domain routing |
| `ROUTING_PRIORITY`     | `semantic`/`keyword` | `semantic` | Primary routing strategy |
| `MODEL_ROUTER_ENABLED` | `on`/`off`           | `off`      | Dynamic model selection  |
| `CREATOR_GUARD`        | `block`/`warn`/`off` | `block`    | Creator path enforcement |
| `ROUTING_GUARD`        | `block`/`warn`/`off` | `block`    | Routing enforcement      |
| `RALPH_ACTION`         | action name          | —          | RALPH loop stop action   |

### Configuration Precedence

```
Environment variables → config.yaml → agent frontmatter → framework defaults
```

---

## Summary Statistics

| Metric              | Count                                                         |
| ------------------- | ------------------------------------------------------------- |
| Agents              | 119 (10 core + 68 domain + 25 specialized + 16 orchestrators) |
| Skills              | 330+                                                          |
| Hooks               | 119 across 17 categories                                      |
| Library modules     | 500+ files across 50+ directories                             |
| Workflows           | 300+                                                          |
| Commands            | 200+                                                          |
| JSON Schemas        | 250+                                                          |
| CLI Tools           | 74                                                            |
| Rules               | 14 auto-loaded                                                |
| Tests               | 200+                                                          |
| Config files        | 15                                                            |
| Documentation files | 40+ (@ references + topics + CLAUDE.md breadcrumbs)           |

**Total framework files:** ~2,000+ (excluding test artifacts and runtime data)

---

_Generated 2026-04-02 by Claude Opus 4.6 — comprehensive feature review of Agent Studio v3.1.0_
