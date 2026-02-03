# Environment Configuration

**Source:** CLAUDE.md Section 8.7
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete reference for environment variables used to configure agent-studio framework behavior, enforcement modes, feature flags, and integrations.

---

## CONTENT

All environment-specific settings are managed through the `.env` file located at the project root. This file is **never committed** (see `.gitignore`) to protect sensitive data and allow per-developer customization.

### Environment Variables Reference

**File:** `.env.example` (template with all available variables and descriptions)

**Setup:**

1. Copy template: `cp .env.example .env`
2. Customize: Edit `.env` for your local environment
3. Use: Environment variables are automatically loaded

### Key Configuration Categories

| Category          | Variables                                           | Purpose                                      |
| ----------------- | --------------------------------------------------- | -------------------------------------------- |
| **Environment**   | `AGENT_STUDIO_ENV` (development/staging/production) | Selects configuration profile and data paths |
| **Features**      | `PARTY_MODE_ENABLED`, `ELICITATION_ENABLED`         | Control feature availability                 |
| **Hooks**         | `REFLECTION_ENABLED`, `REFLECTION_HOOK_MODE`        | Quality and learning controls                |
| **Safety**        | `LOOP_PREVENTION_MODE`, `ANOMALY_DETECTION_ENABLED` | Loop/anomaly thresholds                      |
| **Routing**       | `REROUTER_MODE`, `PLAN_EVOLUTION_GUARD`             | Orchestration behavior                       |
| **Debug**         | `DEBUG_HOOKS`, `CLAUDE_SESSION_ID`                  | Troubleshooting aids                         |
| **Observability** | `EVENT_BUS_SINK`                                    | Event bus sink + JSONL log output            |
| **Integration**   | `WEBHOOK_SECRET`, `API_URL`                         | External service integration                 |

### Enforcement Mode Variables

| Variable                      | Values         | Default | Purpose                           |
| ----------------------------- | -------------- | ------- | --------------------------------- |
| `PLANNER_FIRST_ENFORCEMENT`   | block/warn/off | block   | Enforce planner-first routing     |
| `CREATOR_GUARD`               | block/warn/off | block   | Enforce creator workflow (Gate 4) |
| `SPAWN_PROMPT_VALIDATOR`      | block/warn/off | warn    | Validate spawn prompts            |
| `ROUTER_WRITE_GUARD`          | block/warn/off | block   | Block router writes               |
| `SECURITY_REVIEW_ENFORCEMENT` | block/warn/off | block   | Enforce security reviews          |
| `RESEARCH_ENFORCEMENT`        | block/warn/off | block   | Enforce research before creation  |

**Enforcement Modes:**

- `block` - Prevents action, throws error (production default)
- `warn` - Logs warning but allows action (development)
- `off` - Disables enforcement (dangerous, use sparingly)

### Observability Variables

| Variable         | Values                | Default | Purpose                                                                            |
| ---------------- | --------------------- | ------- | ---------------------------------------------------------------------------------- |
| `EVENT_BUS_SINK` | on/off                | on      | Enable event bus sink; writes events to `.claude/context/runtime/event-bus.jsonl`. |
| `LOG_LEVEL`      | debug/info/warn/error | info    | Structured logger level for hooks and runtime components.                          |
| `DEBUG_HOOKS`    | true/false            | false   | Emit hook debugLog output for troubleshooting.                                     |

When enabled, all events (e.g. TOOL_COMPLETED, TOOL_FAILED, TOOL_BLOCKED) are appended as one JSON object per line to `.claude/context/runtime/event-bus.jsonl`. Set to `off` to disable the sink.
For troubleshooting workflows and log locations, see `.claude/docs/OBSERVABILITY.md`.

### Memory / Compression Variables

| Variable                   | Values | Default | Purpose                                                                                                            |
| -------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `AUTO_COMPRESSION_PHASE_3` | on/off | off     | When on, writes `.claude/context/runtime/compression-reminder.*` so Router/agents can invoke `context-compressor`. |

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
