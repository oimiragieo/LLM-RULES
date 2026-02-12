# Environment Configuration

**Source:** CLAUDE.md Section 8.7
**Version:** v2.2.5
**Last Updated:** 2026-02-04

---

## PURPOSE

Complete reference for environment variables used to configure agent-studio framework behavior, enforcement modes, feature flags, and integrations.

---

## CONTENT

All environment-specific settings are managed through the `.env` file located at the project root. This file is **never committed** (see `.gitignore`) to protect sensitive data and allow per-developer customization.

### Environment Variables Reference

**File:** `.env.example` (template with all available variables and descriptions)

**Canonical source:** `.env.example` is the authoritative list for all environment variables (v2.2.5); this doc summarizes and groups them for quick reference.

**Setup:**

1. Copy template: `cp .env.example .env`
2. Customize: Edit `.env` for your local environment
3. Use: Environment variables are automatically loaded

### Key Configuration Categories

| Category                  | Variables                                                                                                                                                                                                                                                                                                                                                                                  | Purpose                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| **Environment**           | `AGENT_STUDIO_ENV` (development/staging/production)                                                                                                                                                                                                                                                                                                                                        | Selects configuration profile and data paths |
| **Features**              | `PARTY_MODE_ENABLED`, `ELICITATION_ENABLED`                                                                                                                                                                                                                                                                                                                                                | Control feature availability                 |
| **Hooks**                 | `REFLECTION_ENABLED`, `REFLECTION_HOOK_MODE`                                                                                                                                                                                                                                                                                                                                               | Quality and learning controls                |
| **Safety**                | `LOOP_PREVENTION_MODE`, `ANOMALY_DETECTION_ENABLED`                                                                                                                                                                                                                                                                                                                                        | Loop/anomaly thresholds                      |
| **Routing / Context**     | `REROUTER_MODE`, `PLAN_EVOLUTION_GUARD`, `SEMANTIC_ROUTING`, `AGENT_STUDIO_CONTEXT`, `AGENT_STUDIO_MODES`                                                                                                                                                                                                                                                                                  | Orchestration and context/mode selection     |
| **Enforcement**           | `PLANNER_FIRST_ENFORCEMENT`, `REFLECTION_STEP0_ENFORCEMENT`                                                                                                                                                                                                                                                                                                                                | Guard/enforcement modes                      |
| **Spawn Prompt / Memory** | `SPAWN_PROMPT_ASSEMBLER`, `SPAWN_PROMPT_SEMANTIC_MEMORY`, `SPAWN_PROMPT_MEMORY_QUERY`, `MEMORY_MODE`, `OBSERVATIONAL_MEMORY_ENABLED`, `MEMORY_SUMMARY_BLOCK_MAX_TOKENS`, `MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS`, `MEMORY_TIER_B_MAX_TOKENS`, `OPEN_FINDINGS_MIN_SEVERITY`, `OPEN_FINDINGS_RESOLUTION_MODE`, `OPEN_FINDINGS_RESOLUTION_MIN_OVERLAP`, `FINDINGS_TREND_SNAPSHOT_INTERVAL_MS` | Spawn prompt memory retrieval behavior       |
| **Memory / Code Index**   | `LANCEDB_TABLE_CODE`, `MEMORY_ACCESS_TRACKING`, `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS`, `MEMORY_JSON_WRITE_ENFORCEMENT`, `MEMORY_EXTRACTION_RECENT_MESSAGES_LIMIT`, `MEMORY_EXTRACTION_RECENT_CHARS_LIMIT`, `MEMORY_EXTRACTION_LIST_LIMIT`, `COLD_STORAGE_INDEX_MAX_CHARS`                                                                                                               | Code-index and memory tracking behavior      |
| **Worker Runtime**        | `WORKER_ENABLED`, `WORKER_INTERVAL_MS`, `WORKER_TASKS`                                                                                                                                                                                                                                                                                                                                     | Background maintenance/index/reflection loop |
| **Model Client**          | `MODEL_CLIENT_DEFAULT_MODEL`, `MODEL_CLIENT_AGENT_TYPE`, `MODEL_CLIENT_MAX_RETRIES`, `MODEL_CLIENT_RETRY_BASE_MS`                                                                                                                                                                                                                                                                          | LLM client defaults and retry behavior       |
| **Debug**                 | `DEBUG_HOOKS`, `CLAUDE_SESSION_ID`                                                                                                                                                                                                                                                                                                                                                         | Troubleshooting aids                         |
| **Observability**         | `EVENT_BUS_SINK`, `LOG_LEVEL`, `SCHEDULER_TICK_ON_PROMPT`                                                                                                                                                                                                                                                                                                                                  | Event bus sink + JSONL log output            |
| **Integration**           | `WEBHOOK_SECRET`, `API_URL`, `ANTHROPIC_API_KEY`                                                                                                                                                                                                                                                                                                                                           | External service integration                 |

### Enforcement Mode Variables

| Variable                       | Values         | Default | Purpose                                                                  |
| ------------------------------ | -------------- | ------- | ------------------------------------------------------------------------ |
| `PLANNER_FIRST_ENFORCEMENT`    | block/warn/off | block   | Enforce planner-first routing                                            |
| `CREATOR_GUARD`                | block/warn/off | block   | Enforce creator workflow (Gate 4)                                        |
| `SPAWN_PROMPT_VALIDATOR`       | block/warn/off | warn    | Validate spawn prompts                                                   |
| `CONFIG_MODEL_VALIDATOR`       | block/warn/off | block   | Enforce spawn model matches configured model                             |
| `ROUTER_WRITE_GUARD`           | block/warn/off | block   | Block router writes                                                      |
| `SECURITY_REVIEW_ENFORCEMENT`  | block/warn/off | block   | Enforce security reviews                                                 |
| `TASK_COMPLETION_GUARD`        | block/warn/off | block   | Block completion-like Task output without matching TaskUpdate(completed) |
| `RESEARCH_ENFORCEMENT`         | block/warn/off | block   | Enforce research before creation                                         |
| `REFLECTION_STEP0_ENFORCEMENT` | block/warn/off | block   | Enforce reflection Step 0 guard                                          |
| `TASKLIST_FIRST_ENFORCEMENT`   | block/warn/off | warn    | Enforce TaskList() before Task()                                         |
| `STATE_STALE_THRESHOLD_MS`     | number         | 600000  | State staleness threshold in ms (10 minutes)                             |

**Enforcement Modes:**

- `block` - Prevents action, throws error (production default)
- `warn` - Logs warning but allows action (development)
- `off` - Disables enforcement (dangerous, use sparingly)

### Observability Variables

| Variable                           | Values                | Default | Purpose                                                                            |
| ---------------------------------- | --------------------- | ------- | ---------------------------------------------------------------------------------- |
| `EVENT_BUS_SINK`                   | on/off                | on      | Enable event bus sink; writes events to `.claude/context/runtime/event-bus.jsonl`. |
| `EVENT_BUS_MAX_LINES`              | number                | 2000    | Max lines to keep in event-bus.jsonl (rotation).                                   |
| `LOG_LEVEL`                        | debug/info/warn/error | info    | Structured logger level for hooks and runtime components.                          |
| `DEBUG_HOOKS`                      | true/false            | false   | Emit hook debugLog output for troubleshooting.                                     |
| `SCHEDULER_TICK_ON_PROMPT`         | on/off                | off     | Run scheduler tick on UserPromptSubmit (best-effort).                              |
| `HOOK_METRICS_MAX_LINES`           | number                | 2000    | Max lines to keep in hook-metrics.jsonl (rotation).                                |
| `ERROR_METRICS_MAX_LINES`          | number                | 2000    | Max lines to keep in error-metrics.jsonl (rotation).                               |
| `EXECUTION_LIMIT_EVENTS_MAX_LINES` | number                | 2000    | Max lines to keep in execution-limit-events.jsonl (rotation).                      |
| `USER_PROMPT_RESULTS_MAX_LINES`    | number                | 2000    | Max lines to keep in user-prompt-results.jsonl (rotation).                         |
| `ANOMALY_LOG_MAX_LINES`            | number                | 2000    | Max lines to keep in anomaly-log.jsonl (rotation).                                 |

When enabled, all events (e.g. TOOL_COMPLETED, TOOL_FAILED, TOOL_BLOCKED) are appended as one JSON object per line to `.claude/context/runtime/event-bus.jsonl`. Set to `off` to disable the sink.
For troubleshooting workflows and log locations, see `.claude/docs/OBSERVABILITY.md`.

### Spawn Prompt / Memory Retrieval Variables

| Variable                                  | Values     | Default    | Purpose                                                                                                               |
| ----------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `SPAWN_PROMPT_ASSEMBLER`                  | on/off     | on         | Enable the spawn prompt assembler hook.                                                                               |
| `ALLOWED_TOOLS_ENRICHER`                  | on/off     | on         | Enrich allowed_tools from registry/agent-config.                                                                      |
| `SPAWN_PROMPT_SEMANTIC_MEMORY`            | on/off     | on         | Append "Semantic Matches" section from ContextualMemory.                                                              |
| `SPAWN_PROMPT_ENTITY_GRAPH`               | on/off     | on         | Append entity graph (SQLite) section in spawn prompts.                                                                |
| `MEMORY_INTENT_ANALYSIS`                  | on/off     | off        | Enable intent-based memory query planning.                                                                            |
| `SPAWN_PROMPT_MEMORY_QUERY`               | on/off     | off        | Append query-driven "Relevant Memories" section; when on, replaces "Semantic Matches".                                |
| `SPAWN_PROMPT_MAX_CHARS`                  | number     | 40000      | Hard max chars for assembled spawn prompt before section trimming.                                                    |
| `SPAWN_SKILL_SECTION_MODE`                | enum       | names_only | Skill section verbosity (`names_only` or `full`).                                                                     |
| `SPAWN_ASSEMBLY_PROFILING`                | true/false | false      | Emit dev-only spawn assembly timing + token burn metrics.                                                             |
| `SPAWN_ADAPTIVE_ENRICHMENT`               | true/false | false      | Dynamically throttle expensive prompt enrichment based on runtime metrics.                                            |
| `SPAWN_ASSEMBLY_CACHE`                    | on/off     | on         | Enable on-disk spawn assembly cache.                                                                                  |
| `SPAWN_ASSEMBLY_CACHE_TTL_MS`             | number     | 120000     | Cache entry TTL (ms) for assembled spawn prompts.                                                                     |
| `SPAWN_ASSEMBLY_CACHE_MAX_ENTRIES`        | number     | 120        | Max assembled prompts retained in cache.                                                                              |
| `MEMORY_MODE`                             | enum       | hybrid     | Memory injection mode for spawn prompts (`hybrid` or `observational`).                                                |
| `OBSERVATIONAL_MEMORY_ENABLED`            | on/off     | on         | Kill switch for observational mode; when off, `MEMORY_MODE=observational` is ignored.                                 |
| `MEMORY_SUMMARY_BLOCK_MAX_TOKENS`         | number     | 400        | Token cap for observational summary subsection.                                                                       |
| `MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS`   | number     | 400        | Token cap for recent observations subsection.                                                                         |
| `MEMORY_TIER_B_MAX_TOKENS`                | number     | 400        | Token cap for Tier B memory sections (semantic/query/entity).                                                         |
| `OPEN_FINDINGS_MIN_SEVERITY`              | enum       | high       | Minimum severity included in open-findings carryover (`critical/high/medium/low`).                                    |
| `OPEN_FINDINGS_RESOLUTION_MODE`           | enum       | lenient    | Auto-resolution mode for findings (`lenient` or `strict`).                                                            |
| `OPEN_FINDINGS_RESOLUTION_MIN_OVERLAP`    | number     | 2          | Minimum token overlap required before attempting finding auto-resolution.                                             |
| `FINDINGS_TREND_SNAPSHOT_INTERVAL_MS`     | number     | 900000     | Minimum interval (ms) between periodic findings trend snapshots from unified post-tool metrics and user-prompt hooks. |
| `OBSERVATIONS_COMPACT_ON_SESSION_END`     | on/off     | on         | Enable SessionEnd compaction from `observations.jsonl` into `observations_summary.md`.                                |
| `OBSERVATIONS_COMPACT_MAX`                | number     | 50         | Max observation rows included during SessionEnd summary compaction.                                                   |
| `OBSERVATIONS_DECAY_PER_HOUR`             | number     | 0.02       | Recency decay used in observation scoring (higher = stronger recency bias).                                           |
| `OBSERVATIONS_CONTRADICTION_ENABLED`      | on/off     | off        | Enable contradiction supersedes tagging for new observations (deferred by default).                                   |
| `OBSERVATIONS_CONTRADICTION_MAX_AGE_DAYS` | number     | 90         | Max age window for contradiction supersedes tagging within same topic.                                                |

### Memory / Compression Variables

| Variable                   | Values | Default | Purpose                                                                                                            |
| -------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `AUTO_COMPRESSION_PHASE_3` | on/off | off     | When on, writes `.claude/context/runtime/compression-reminder.*` so Router/agents can invoke `context-compressor`. |

### Memory / Code Index Variables

| Variable                                  | Values         | Default    | Purpose                                                                    |
| ----------------------------------------- | -------------- | ---------- | -------------------------------------------------------------------------- |
| `LANCEDB_TABLE_CODE`                      | string         | code_index | LanceDB table name for code indexing.                                      |
| `MEMORY_ACCESS_TRACKING`                  | on/off         | on         | Enable/disable access tracking sidecar writes.                             |
| `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS`  | number         | 300000     | Rate limit for memory access tracking (ms).                                |
| `MEMORY_JSON_WRITE_ENFORCEMENT`           | block/warn/off | block      | Block direct edits to `patterns.json` / `gotchas.json` (use MemoryRecord). |
| `MEMORY_EMBED_ON_EDIT`                    | on/off         | off        | Generate embeddings on memory file edits.                                  |
| `MEMORY_EMBED_ON_EDIT_TIMEOUT_MS`         | number         | 60000      | Max time for embed-on-edit (ms).                                           |
| `MEMORY_EXTRACTION_RECENT_MESSAGES_LIMIT` | number         | 40         | Max recent messages sent to memory extraction.                             |
| `MEMORY_EXTRACTION_RECENT_CHARS_LIMIT`    | number         | 8000       | Max characters of recent messages sent to memory extraction.               |
| `MEMORY_EXTRACTION_LIST_LIMIT`            | number         | 12         | Max items per list in extraction input (decisions/patterns/gotchas/tasks). |
| `COLD_STORAGE_INDEX_MAX_CHARS`            | number         | 4000       | Max characters indexed per cold LTM summary.                               |

### Memory Scheduler Variables

| Variable                         | Values | Default | Purpose                               |
| -------------------------------- | ------ | ------- | ------------------------------------- |
| `MEMORY_SCHEDULER_HISTORY_LIMIT` | number | 30      | Max history entries retained per job. |

### Reflection Queue Variables

| Variable                               | Values | Default | Purpose                                                 |
| -------------------------------------- | ------ | ------- | ------------------------------------------------------- |
| `REFLECTION_QUEUE_PROCESS_ON_PROMPT`   | on/off | on      | Process reflection-queue.jsonl during UserPromptSubmit. |
| `REFLECTION_QUEUE_PROCESS_INTERVAL_MS` | number | 600000  | Minimum interval between queue processing runs (ms).    |
| `REFLECTION_QUEUE_MAX_LINES`           | number | 2000    | Cap reflection-queue.jsonl to last N lines.             |
| `REFLECTION_QUEUE_PROCESS_TIMEOUT_MS`  | number | 60000   | Timeout for queue processing (ms).                      |
| `REFLECTION_QUEUE_MAX_LINES`           | number | 5000    | Max lines to keep in reflection-queue.jsonl (rotation). |

### Model Client Variables

| Variable                     | Values | Default | Purpose                                             |
| ---------------------------- | ------ | ------- | --------------------------------------------------- |
| `MODEL_CLIENT_DEFAULT_MODEL` | string | (unset) | Default model for model-client when none is passed. |
| `MODEL_CLIENT_AGENT_TYPE`    | string | planner | Agent type used to resolve default model.           |
| `MODEL_CLIENT_MAX_RETRIES`   | number | 2       | Max retries for model-client requests.              |
| `MODEL_CLIENT_RETRY_BASE_MS` | number | 500     | Base retry backoff (ms).                            |

### Routing / Context Mode Variables

| Variable                  | Values         | Default | Purpose                                    |
| ------------------------- | -------------- | ------- | ------------------------------------------ |
| `AGENT_STUDIO_CONTEXT`    | string         | (unset) | Select current context (e.g. claude-code). |
| `AGENT_STUDIO_MODES`      | csv            | editing | Select active modes (comma-separated).     |
| `CONTEXT_MODE_TOOL_GUARD` | block/warn/off | warn    | Enforce context/mode tool restrictions.    |
| `SEMANTIC_ROUTING`        | on/off         | on      | Enable semantic routing fallback.          |

### Worker Runtime Variables

| Variable                   | Values         | Default                      | Purpose                               |
| -------------------------- | -------------- | ---------------------------- | ------------------------------------- |
| `WORKER_ENABLED`           | 1/true/0/false | off                          | Enable worker runtime loop.           |
| `WORKER_ONCE`              | 1/true/0/false | off                          | Run one tick then exit.               |
| `WORKER_INTERVAL_MS`       | number         | 60000                        | Worker tick interval in milliseconds. |
| `WORKER_BACKOFF_BASE_MS`   | number         | 30000                        | Backoff base delay after failures.    |
| `WORKER_BACKOFF_MAX_MS`    | number         | 300000                       | Max backoff delay.                    |
| `WORKER_METRICS`           | on/off         | on                           | Enable worker.jsonl metrics output.   |
| `WORKER_EVENTS`            | on/off         | on                           | Emit worker tick events to event bus. |
| `WORKER_METRICS_MAX_LINES` | number         | 1000                         | Max lines to keep in worker.jsonl.    |
| `WORKER_PROJECT_ROOT`      | string         | (auto)                       | Override project root for worker.     |
| `WORKER_TASKS`             | csv            | maintenance,index,reflection | Tasks to run each tick.               |

### Staging Environment

For isolated testing, use `AGENT_STUDIO_ENV=staging`:

- Configuration: `.claude/config.staging.yaml` (separate from production)
- Data paths: `.claude/staging/*` (isolated workspace)
- Features: All enabled by default (for testing)
- Documentation: See `.claude/docs/STAGING_ENVIRONMENT.md`

**Initialization:**

```bash
# Initialize staging environment
node .claude/tools/cli/init-staging.cjs

# Verify setup
node --test tests/staging-smoke.test.mjs
```

### MCP Server Configuration

MCP (Model Context Protocol) servers extend Claude's capabilities with external tools and integrations.

**Important:** MCP servers are configured separately from `settings.json`:

| Configuration File                         | Purpose                 | Scope                                           |
| ------------------------------------------ | ----------------------- | ----------------------------------------------- |
| `.claude/.mcp.json`                        | **Project MCP servers** | Per-project MCP tools (committed to repo)       |
| `settings.json` → `mcpServers: {}`         | **User MCP servers**    | User-level MCP tools (not used in this project) |
| `~/.config/claude/` or `%APPDATA%\Claude\` | **Global MCP servers**  | User-level MCP tools (OS-dependent)             |

**Project MCP configuration (`.claude/.mcp.json`):**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem@0", "."]
    },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@0"] }
  }
}
```

**Why `mcpServers: {}` is empty in settings.json:**

The `settings.json` file contains hook configuration, not MCP servers. Project-level MCP servers are stored in `.claude/.mcp.json` to keep concerns separated:

- `settings.json` = hooks, max_tokens, RAG settings
- `.mcp.json` = MCP server definitions

**Available MCP servers in this project:**

- `filesystem` - File system operations
- `git` - Git operations
- `memory` - Persistent memory
- `sequential-thinking` - Multi-step reasoning
- `github` - GitHub API operations
- `sqlite` - SQLite database access

### Override Examples

```bash
# Disable planner-first enforcement (development)
PLANNER_FIRST_ENFORCEMENT=warn claude

# Disable router write guard (dangerous)
ROUTER_WRITE_GUARD=off claude

# Enable debug mode for hooks
DEBUG_HOOKS=true claude

# Enable query-driven memories in spawn prompts
SPAWN_PROMPT_MEMORY_QUERY=on claude

# Turn on dev-only spawn timing/token profiling
SPAWN_ASSEMBLY_PROFILING=true claude

# Enable context/mode tool guard in warn mode
CONTEXT_MODE_TOOL_GUARD=warn claude

# Enable worker runtime loop
WORKER_ENABLED=true claude

# Use staging environment
AGENT_STUDIO_ENV=staging claude
```

---

## RELATED REFERENCES

- **@ENFORCEMENT_HOOKS.md** - Hooks controlled by these variables
- **CLAUDE.md Section 1.3** - Enforcement hook modes

---

## BACK TO MAIN

See **CLAUDE.md** Section 8.7 for inline summary.
