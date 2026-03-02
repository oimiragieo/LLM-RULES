# Getting Started with Agent Studio

**5-Minute Quick Start** | [Full Documentation](../CLAUDE.md)

> **What is Agent Studio?**
>
> A multi-agent orchestration framework for Claude Code. Instead of one AI assistant, you get a coordinated team of 40+ specialized agents—developers, architects, QA, security reviewers—working together on your tasks.
>
> **Key Difference**: Router delegates to specialized agents. Memory persists across sessions. Self-evolves when capabilities missing.

## Overview

Agent Studio transforms Claude Code from a single assistant into an entire development team:

- **Router-First**: All requests analyzed and delegated to specialized agents
- **40+ Specialized Agents**: Developer, planner, architect, QA, security, domain experts
- **426 Skills**: Reusable capabilities (TDD, debugging, security review, etc.)
- **Persistent Memory**: Context never lost between sessions
- **Self-Evolution**: Creates new agents/skills when gaps detected
- **Quality Gates**: Built-in security and verification checks

## Prerequisites

- Claude Code CLI installed
- Node.js 18+ (for some tooling)
- Git (recommended)
- **ANTHROPIC_API_KEY** (required for memory extraction, deduplication, and intelligent summaries)
- **Python & C++ Build Tools**: Required on Windows specifically for compiling native C addons (like the `tree-sitter` AST parser) during `pnpm install`.

## Quick Start

### 1. Clone and Enter

```bash
cd your-project
# Agent Studio files live in .claude/
```

All configuration, agents, skills, and workflows are in the `.claude/` directory. You don't need to touch these files to use the system—just interact naturally with Claude Code.

### 2. Your First Interaction

Just ask Claude Code anything. The **Router** automatically:

- Analyzes your request
- Selects the best agent(s)
- Spawns them to handle your task

**Example:**

```
You: "Fix the login bug in auth.ts"
[ROUTER] → Spawns DEVELOPER agent → Bug fixed with tests
```

### 3. Key Concepts

| Concept       | What It Does                                                  |
| ------------- | ------------------------------------------------------------- |
| **Router**    | Analyzes requests, spawns the right agent(s)                  |
| **Agents**    | Specialized workers (developer, planner, QA, architect, etc.) |
| **Skills**    | Reusable capabilities agents invoke to execute tasks          |
| **Memory**    | Persistent context across sessions—nothing gets forgotten     |
| **Tasks**     | Trackable work units with dependencies and status             |
| **Workflows** | Multi-agent coordination patterns for complex work            |

## Common Workflows

### Bug Fix

```
You: "Fix the null pointer in utils.ts"
→ Router spawns DEVELOPER
→ DEVELOPER uses TDD and debugging skills
→ Bug fixed with regression tests
```

### New Feature

```
You: "Add user authentication"
→ Router spawns PLANNER + SECURITY-ARCHITECT (parallel)
→ Plan created and security-reviewed
→ Tasks created from plan
→ DEVELOPER implements each task
→ QA validates with comprehensive tests
```

### Code Review

```
You: "Review PR #123"
→ Router spawns CODE-REVIEWER
→ Two-stage review (spec compliance + code quality)
→ Detailed feedback with actionable recommendations
```

### Architecture Documentation

```
You: "Generate C4 diagrams for the system"
→ Router spawns C4-CONTEXT agent
→ System context diagram created
→ Follow-up spawns for container/component/code views
→ Complete architecture documentation
```

## Understanding the Router

The Router is the entry point for ALL requests. It acts like a project manager:

1. **Analyzes** the request (complexity, domain, security risk)
2. **Selects** the best agent(s) from 40+ available agents
3. **Spawns** agents using the Task tool
4. **Tracks** progress using the task system
5. **Coordinates** multi-agent workflows when needed

The Router **never implements work directly**—it always delegates to specialized agents.

Agent discovery uses `.claude/context/agent-registry.json` first, with a filesystem fallback if missing; CI enforces registry freshness, so run `pnpm gen:agent-registry` after agent changes.

## Available Agents

Agent Studio includes 40+ specialized agents organized into categories:

### Core Agents

- **developer**: Bug fixes, implementation, coding tasks
- **planner**: Feature planning, task breakdown, estimation
- **architect**: System design, architecture decisions
- **qa**: Testing, quality assurance, test automation
- **technical-writer**: Documentation creation and updates

### Specialized Agents

- **security-architect**: Security reviews, threat modeling
- **code-reviewer**: PR reviews, code quality analysis
- **devops**: Infrastructure, deployment, CI/CD
- **incident-responder**: Production incidents, debugging
- **database-architect**: Schema design, optimization

### Domain Experts

- **typescript-pro**, **python-pro**, **rust-pro**, **golang-pro**
- **fastapi-pro**, **nextjs-pro**, **react-pro**
- **ios-pro**, **expo-mobile-developer**
- **data-engineer**, **graphql-pro**

### Architecture & Diagrams

- **c4-context**, **c4-container**, **c4-component**, **c4-code**

For the complete list, see the [Agent Routing Table](../CLAUDE.md#3-agent-routing-table).

## Skills: Reusable Capabilities

Agents don't just "know things"—they **invoke skills** to execute work. Skills are reusable, tested capabilities.

**Examples:**

- `tdd` - Test-driven development workflow
- `debugging` - Systematic debugging process
- `security-architect` - Security review patterns
- `plan-generator` - Planning methodology
- `verification-before-completion` - Quality gates

The skill catalog contains **426 skills** organized into 20+ categories. Browse the [Skill Catalog](.claude/docs/skill-catalog.md) to see what's available.

## Slash Commands (Quick Actions)

Agent Studio ships with command shortcuts under `.claude/commands/` for common workflows.
All behavioral commands delegate to skills -- the command is a thin shim, the skill is the source of truth.

**Planning:** `/brainstorm`, `/write-plan`, `/execute-plan`
**Development:** `/tdd`, `/debug`, `/build-fix`
**Quality:** `/code-review`, `/verify`, `/test-coverage`, `/e2e`, `/eval`, `/refactor-clean`
**Security:** `/security-review`
**Context:** `/compress`, `/learn`
**Analysis:** `/analyze`
**Setup:** `/setup-pm`

See the [Command Catalog](.claude/context/artifacts/catalogs/command-catalog.md) for full details.

## Memory: Nothing Gets Forgotten

Agent Studio uses a persistent memory system so context carries across sessions:

- **patterns.json**: Structured reusable patterns
- **gotchas.json**: Structured pitfalls and edge cases
- **decisions.md**: Architecture Decision Records (ADRs)
- **issues.md**: Known blockers and workarounds
- **learnings.md**: Legacy archive (read-only; do not append)
- **STM/MTM/LTM**: Tiered session memory under `.claude/context/memory/`

Agents read memory before starting work and record findings after completion. This means you can resume work days later without repeating context.

## Presets (optional)

You can bias spawn prompts to a fixed **preset**: a named set of skills (and an optional rule snippet) defined in `.claude/config/presets.json`. When the Router (or any caller) passes a `preset_id` / `presetId` in the **Task** tool input, the spawn-prompt-assembler uses that preset’s `enabledSkills` (and optional `ruleSnippetPath`) instead of the default agent-based skill list.

**Task tool_input convention:**

- **`preset_id`** or **`presetId`** (string, optional): Key from `presets.json` (e.g. `planning-heavy`, `cowork-style`). If present, the assembled spawn prompt uses the preset’s skills and rule snippet; if absent, behavior is unchanged (agent-based skills only).

**Example (conceptual):**

```json
Task({
  task_id: 'task-1',
  "subagent_type": "planner",
  "prompt": "...",
  "preset_id": "planning-heavy"
})
```

**Config:** Define presets in `.claude/config/presets.json` (see `.claude/schemas/presets.schema.json`). Each preset can set `agentId`, `enabledSkills`, and optional `ruleSnippetPath`. Presets are optional; omit `preset_id` / `presetId` to use default routing and skill selection.

## Worker Runtime (Optional)

Agent Studio can run an **optional headless worker** for periodic maintenance tasks (opt-in only).

**Enable:**

```bash
WORKER_ENABLED=1 pnpm run agent:worker
```

**What it runs (per tick):**

- Memory maintenance (`memory-scheduler.cjs`, daily or weekly when overdue)
- Code index incremental update (if an index exists)
- Reflection queue processing (`reflection-queue-processor.cjs`)

**Heartbeat file:**

`.claude/context/runtime/worker-heartbeat.json` (includes `lastTick`, `status`, and per-task results)

**Quick summary:**

`pnpm worker:summary` (reads `.claude/context/metrics/worker.jsonl`)

**Key env vars:**

- `WORKER_ENABLED=1` (required)
- `WORKER_INTERVAL_MS=60000` (default 60s)
- `WORKER_TASKS=maintenance,index,reflection`
- `WORKER_ONCE=1` (one tick then exit)
- `WORKER_PROJECT_ROOT=...` (override project root)
- `WORKER_METRICS=off` (disable JSONL writes to `worker.jsonl`, default: on)
- `WORKER_EVENTS=off` (disable per-tick event bus emission, default: on)
- `WORKER_METRICS_MAX_LINES=1000` (cap `worker.jsonl` to last N lines)
- `WORKER_BACKOFF_BASE_MS=30000` / `WORKER_BACKOFF_MAX_MS=300000` (failure backoff tuning)

For details, see the Memory System documentation.

## Task Management

Complex work gets broken into trackable tasks with dependencies:

```
You: "Refactor authentication system"
→ PLANNER creates task breakdown
  - Task 1: Backup existing auth code
  - Task 2: Design new architecture (blocked by Task 1)
  - Task 3: Implement new auth service (blocked by Task 2)
  - Task 4: Migrate data (blocked by Task 3)
  - Task 5: QA validation (blocked by Task 4)
→ DEVELOPER claims and completes Task 1
→ Task 2 becomes available
→ Process continues through completion
```

Tasks track status, blockers, assignees, and metadata. Use `TaskList()` to see current work.

## Multi-Agent Orchestration

For complex work requiring multiple perspectives, agents work in **parallel** or **sequential** phases:

**Parallel Example** (concurrent work):

```
You: "Add payment processing"
→ PLANNER designs feature
→ SECURITY-ARCHITECT reviews design (parallel)
→ DEVELOPER implements (after reviews)
→ QA validates (after implementation)
```

**Sequential Example** (dependent phases):

```
You: "Migrate to new database"
→ ARCHITECT designs migration strategy
→ DEVELOPER implements migration scripts
→ DEVOPS sets up infrastructure
→ QA validates data integrity
```

The Router automatically orchestrates these workflows based on complexity.

## Self-Evolution (EVOLVE Workflow)

When no agent exists for your domain, Agent Studio automatically creates one using the **EVOLVE workflow**—a research-backed, quality-gated process:

```
You: "Review iOS UX patterns"
→ Router finds no ios-ux-reviewer agent
→ Router spawns EVOLUTION-ORCHESTRATOR
→ EVOLVE workflow executes:
  E - Evaluate: Confirm capability gap
  V - Validate: Check naming/conflicts
  O - Obtain: Research best practices (3+ queries, MANDATORY)
  L - Lock: Create artifact using creator skill
  V - Verify: Quality assurance (no placeholders, complete protocols)
  E - Enable: Register in routing tables
→ New ios-ux-reviewer agent ready
→ New agent handles the review
```

### EVOLVE Highlights

- **Research-Backed**: Every artifact researched with 3+ external sources
- **Quality-Gated**: 6 phases with exit conditions that MUST pass
- **Audit Trail**: Complete research reports and evolution history
- **Auto-Start (Optional)**: Set `EVOLVE_AUTO_START=true` to auto-trigger evolution

**Default**: Manual EVOLVE trigger (safer for production).

Same process creates skills, workflows, hooks, and schemas. The system evolves to meet your needs while maintaining quality.

**Learn More**: [Self-Evolution Guide](./SELF_EVOLUTION.md), [Configuration](./CONFIGURATION.md)

## What Makes This Different

Traditional AI assistants:

- Single perspective
- Context lost between sessions
- No specialization
- No quality gates
- Manual coordination

Agent Studio:

- Multiple expert perspectives
- Persistent memory across sessions
- Domain-specialized agents
- Built-in quality and security gates
- Automatic multi-agent coordination
- Self-evolving capabilities

## Scripts and entry points

- **agent:production** is a stub; **agent:worker** is a placeholder that does not run the hook framework (hooks are host-driven today).
- Memory scripts: `memory:init`, `memory:embeddings`, `memory:health`, `memory:weekly`, `memory:dashboard` (health), `memory:dashboard:budget` (token/budget) — see [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md). Set `MEMORY_EMBED_ON_EDIT=on` in `.env` for automatic embedding updates on memory file edits.
- For headless or rarely-closed sessions, enable `REFLECTION_QUEUE_PROCESS_ON_PROMPT` and schedule `memory:weekly` (or use the worker).

## Where to Learn More

- **[CLAUDE.md](../CLAUDE.md)**: Complete framework reference
- **ROUTER_PROTOCOL.md**: Router decision-making process
- **[Skill Catalog](../docs/skill-catalog.md)**: Browse all 426 skills
- **[Agent Directory](../agents/)**: Explore agent definitions
- **[Workflows](../workflows/)**: Multi-agent coordination patterns
- **HOOKS_AND_SAFETY.md**: Safety validators and hooks

## Troubleshooting

### MCP server timeouts (e.g. shadcn)

Some MCP servers (e.g. shadcn) may time out after ~30 seconds due to network, rate limits, or service availability. This is environmental, not a bug in Agent Studio. If you do not need a specific MCP server (e.g. shadcn components), you can disable it in your app’s MCP configuration to avoid noisy timeouts. Disabling an unused MCP server is safe.

### MCP stderr lines shown as [ERROR]

Some MCP servers (e.g. sequential-thinking, filesystem, chrome-devtools) write informational startup messages to stderr. The host may display these as `[ERROR]` in debug logs. If the servers connect successfully, these lines are cosmetic and do not indicate a failure. You can ignore them or reduce MCP verbosity in the server’s own config if available.

### Agent frontmatter "Missing required name"

Agent files under `.claude/agents/` must have YAML frontmatter with `name` as the **first** key (line 2 after `---`). Use a simple string value (e.g. `name: developer`, `name: reflection-agent`). Files must be saved as **UTF-8 without BOM**; a BOM can cause the host parser to fail. If the message persists, the host may require a specific format—check the host's documentation. You can verify all agents with: `node .claude/tools/cli/verify-agent-frontmatter.mjs`.

## Need Help?

1. **Check memory files**: `.claude/context/memory/learnings.md` for patterns and gotchas
2. **Review issues**: `.claude/context/memory/issues.md` for known blockers
3. **Consult changelog**: `.claude/docs/CHANGELOG.md` for recent updates
4. **Report issues**: File issues at the project repository

## Next Steps

Just start using Claude Code naturally. Ask it to:

- Fix bugs
- Implement features
- Review code
- Generate documentation
- Design architecture
- Run tests
- Deploy infrastructure

The Router handles everything else. Welcome to multi-agent development.
