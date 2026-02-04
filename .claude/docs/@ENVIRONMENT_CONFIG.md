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

| Category                  | Variables                                                                                                 | Purpose                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Environment**           | `AGENT_STUDIO_ENV` (development/staging/production)                                                       | Selects configuration profile and data paths |
| **Features**              | `PARTY_MODE_ENABLED`, `ELICITATION_ENABLED`                                                               | Control feature availability                 |
| **Hooks**                 | `REFLECTION_ENABLED`, `REFLECTION_HOOK_MODE`                                                              | Quality and learning controls                |
| **Safety**                | `LOOP_PREVENTION_MODE`, `ANOMALY_DETECTION_ENABLED`                                                       | Loop/anomaly thresholds                      |
| **Routing / Context**     | `REROUTER_MODE`, `PLAN_EVOLUTION_GUARD`, `SEMANTIC_ROUTING`, `AGENT_STUDIO_CONTEXT`, `AGENT_STUDIO_MODES` | Orchestration and context/mode selection     |
| **Enforcement**           | `PLANNER_FIRST_ENFORCEMENT`, `REFLECTION_STEP0_ENFORCEMENT`                                               | Guard/enforcement modes                      |
| **Spawn Prompt / Memory** | `SPAWN_PROMPT_ASSEMBLER`, `SPAWN_PROMPT_SEMANTIC_MEMORY`, `SPAWN_PROMPT_MEMORY_QUERY`                     | Spawn prompt memory retrieval behavior       |
| **Memory / Code Index**   | `LANCEDB_TABLE_CODE`, `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS`                                            | Code-index and memory tracking behavior      |
| **Worker Runtime**        | `WORKER_ENABLED`, `WORKER_INTERVAL_MS`, `WORKER_TASKS`                                                    | Background maintenance/index/reflection loop |
| **Debug**                 | `DEBUG_HOOKS`, `CLAUDE_SESSION_ID`                                                                        | Troubleshooting aids                         |
| **Observability**         | `EVENT_BUS_SINK`, `LOG_LEVEL`, `SCHEDULER_TICK_ON_PROMPT`                                                 | Event bus sink + JSONL log output            |
| **Integration**           | `WEBHOOK_SECRET`, `API_URL`                                                                               | External service integration                 |

### Enforcement Mode Variables

| Variable                       | Values         | Default | Purpose                           |
| ------------------------------ | -------------- | ------- | --------------------------------- |
| `PLANNER_FIRST_ENFORCEMENT`    | block/warn/off | block   | Enforce planner-first routing     |
| `CREATOR_GUARD`                | block/warn/off | block   | Enforce creator workflow (Gate 4) |
| `SPAWN_PROMPT_VALIDATOR`       | block/warn/off | warn    | Validate spawn prompts            |
| `ROUTER_WRITE_GUARD`           | block/warn/off | block   | Block router writes               |
| `SECURITY_REVIEW_ENFORCEMENT`  | block/warn/off | block   | Enforce security reviews          |
| `RESEARCH_ENFORCEMENT`         | block/warn/off | block   | Enforce research before creation  |
| `REFLECTION_STEP0_ENFORCEMENT` | block/warn/off | block   | Enforce reflection Step 0 guard   |

**Enforcement Modes:**

- `block` - Prevents action, throws error (production default)
- `warn` - Logs warning but allows action (development)
- `off` - Disables enforcement (dangerous, use sparingly)

### Observability Variables

| Variable                   | Values                | Default | Purpose                                                                            |
| -------------------------- | --------------------- | ------- | ---------------------------------------------------------------------------------- |
| `EVENT_BUS_SINK`           | on/off                | on      | Enable event bus sink; writes events to `.claude/context/runtime/event-bus.jsonl`. |
| `LOG_LEVEL`                | debug/info/warn/error | info    | Structured logger level for hooks and runtime components.                          |
| `DEBUG_HOOKS`              | true/false            | false   | Emit hook debugLog output for troubleshooting.                                     |
| `SCHEDULER_TICK_ON_PROMPT` | on/off                | off     | Run scheduler tick on UserPromptSubmit (best-effort).                              |

When enabled, all events (e.g. TOOL_COMPLETED, TOOL_FAILED, TOOL_BLOCKED) are appended as one JSON object per line to `.claude/context/runtime/event-bus.jsonl`. Set to `off` to disable the sink.
For troubleshooting workflows and log locations, see `.claude/docs/OBSERVABILITY.md`.

### Spawn Prompt / Memory Retrieval Variables

| Variable                       | Values | Default | Purpose                                                                                |
| ------------------------------ | ------ | ------- | -------------------------------------------------------------------------------------- |
| `SPAWN_PROMPT_ASSEMBLER`       | on/off | on      | Enable the spawn prompt assembler hook.                                                |
| `ALLOWED_TOOLS_ENRICHER`       | on/off | on      | Enrich allowed_tools from registry/agent-config.                                       |
| `SPAWN_PROMPT_SEMANTIC_MEMORY` | on/off | on      | Append "Semantic Matches" section from ContextualMemory.                               |
| `SPAWN_PROMPT_ENTITY_GRAPH`    | on/off | on      | Append entity graph (SQLite) section in spawn prompts.                                 |
| `MEMORY_INTENT_ANALYSIS`       | on/off | off     | Enable intent-based memory query planning.                                             |
| `SPAWN_PROMPT_MEMORY_QUERY`    | on/off | off     | Append query-driven "Relevant Memories" section; when on, replaces "Semantic Matches". |

### Memory / Compression Variables

| Variable                   | Values | Default | Purpose                                                                                                            |
| -------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `AUTO_COMPRESSION_PHASE_3` | on/off | off     | When on, writes `.claude/context/runtime/compression-reminder.*` so Router/agents can invoke `context-compressor`. |

### Memory / Code Index Variables

| Variable                                 | Values | Default    | Purpose                                      |
| ---------------------------------------- | ------ | ---------- | -------------------------------------------- |
| `LANCEDB_TABLE_CODE`                     | string | code_index | LanceDB table name for code indexing.        |
| `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS` | number | 300000     | Rate limit for memory access tracking (ms).  |
| `MEMORY_HOOK_JSON_SYNC`                  | on/off | off        | Allow hook-driven JSON memory sync on edits. |

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
