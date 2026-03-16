# Model Selection for Subagents

**Source:** CLAUDE.md Section 5
**Version:** v2.2.4
**Last Updated:** 2026-03-06
**ADR:** ADR-075 (Router Model Selection from Configuration)

---

## PURPOSE

Guidelines for selecting the appropriate Claude model (haiku, sonnet, opus) when spawning subagents. **Router MUST resolve model from config.yaml before spawning** (ADR-075).

---

## MODEL PRECEDENCE ORDER (ADR-075)

**CRITICAL:** Router must use this precedence when selecting models:

| Priority | Source             | Description                      | When Used                                 |
| -------- | ------------------ | -------------------------------- | ----------------------------------------- |
| **P1**   | Task() parameter   | Explicit `model:` in spawn call  | Requested override (validated at runtime) |
| **P2**   | Agent frontmatter  | `model:` field in agent .md file | Agent-level default                       |
| **P3**   | config.yaml        | `agents.{type}.model` entry      | **RECOMMENDED** - centralized control     |
| **P4**   | Complexity default | Based on agent type              | Fallback for unconfigured agents          |
| **P5**   | Hardcoded fallback | `sonnet`                         | Last resort                               |

**Quick Reference:** haiku (simple/low) | sonnet (standard/default) | opus (complex/security/high)

**Note:** This file is the canonical reference for model resolution logic. CLAUDE.md Section 5 contains only a summary pointer to this document. All code examples and precedence details live here.

---

## CONTEXT WINDOW SIZES (2026)

| Model                       | Shorthand | Context Window        | Notes                                              |
| --------------------------- | --------- | --------------------- | -------------------------------------------------- |
| `claude-opus-4-6`           | `opus`    | 1,000,000 tokens (1M) | Full 1M context; ideal for large-codebase analysis |
| `claude-sonnet-4-6`         | `sonnet`  | 200,000 tokens (200K) | Standard max membership; sufficient for most tasks |
| `claude-haiku-4-5-20251001` | `haiku`   | 200,000 tokens (200K) | Lightweight tasks only                             |

> **Note:** A 1M-context Sonnet variant exists but is API/max-membership tier only and is not the standard deployment. Use `opus` when 1M context is required.

### Large-Context Routing Guidance

**Prefer Opus (1M window) for:**

- Analysis of very large codebases (>150K tokens of source)
- Long document processing (legal, architecture specs, large logs)
- Ingesting large context before synthesis or summarization
- Tasks where the executing agent might need >150K tokens in its working context

**Sonnet (200K) is sufficient for:**

- Standard development tasks, code review, and most feature work
- Documents and codebases that fit within 150K tokens
- The majority (80%+) of agent spawns

**Planner guidance:** When decomposing tasks that involve large context loads (>150K tokens), the planner should explicitly recommend `opus` model for the executing agent in its plan output.

**Spawn guidance:** If a spawned agent might need >150K context tokens to complete its work, set `model: 'opus'` explicitly in the `Task()` call:

```javascript
// Agent needs to analyze a large codebase section — use opus
Task({
  task_id: 'task-5',
  subagent_type: 'developer',
  model: 'opus', // Explicit override: large context load expected
  prompt: `Analyze the full authentication subsystem across 50+ files...`,
});
```

### How Router Reads Agent Models

```javascript
// In Router step 4, before spawning:
const { resolveAgentModel } = require('.claude/lib/utils/agent-config-reader.cjs');

// Get configured model
const result = resolveAgentModel('planner', PROJECT_ROOT);
// Returns: {
//   model: 'claude-opus-4-5-20251101',  // Full ID for Task()
//   shorthand: 'opus',                   // For logging
//   source: 'config.yaml',               // Where model came from
//   raw: 'claude-opus-4-5-20251101'      // Raw config value
// }

// Use in Task() spawn:
Task({
  task_id: 'task-1',
  model: result.shorthand,  // 'opus'
  prompt: `You are PLANNER...`,
  ...
});
```

---

## AGENT CONFIG EXAMPLES

### config.yaml Agent Configuration

```yaml
# .claude/config.yaml (agents section)
agents:
  planner:
    path: agents/core/planner.md
    model: claude-opus-4-5-20251101 # OPUS for complex planning
    extended_thinking: true
  developer:
    path: agents/core/developer.md
    model: claude-sonnet-4-5 # SONNET for standard work
  qa:
    path: agents/core/qa.md
    model: claude-opus-4-5-20251101 # OPUS for thorough testing
  architect:
    path: agents/core/architect.md
    model: claude-opus-4-5-20251101 # OPUS for architecture decisions
```

### Current Configured Agents

| Agent     | config.yaml Model        | Shorthand | Extended Thinking |
| --------- | ------------------------ | --------- | ----------------- |
| planner   | claude-opus-4-5-20251101 | opus      | Yes               |
| developer | claude-sonnet-4-5        | sonnet    | No                |
| qa        | claude-opus-4-5-20251101 | opus      | No                |
| architect | claude-opus-4-5-20251101 | opus      | No                |

### Agents Using Complexity Defaults

Agents not in config.yaml use complexity-based defaults:

| Agent Type             | Default Model | Reason                          |
| ---------------------- | ------------- | ------------------------------- |
| security-architect     | opus          | Security requires deep analysis |
| evolution-orchestrator | opus          | Creates system artifacts        |
| master-orchestrator    | opus          | Coordinates multiple agents     |
| party-orchestrator     | opus          | Multi-agent collaboration       |
| swarm-coordinator      | opus          | Parallel coordination           |
| context-compressor     | haiku         | Simple summarization            |
| _all others_           | sonnet        | Standard development work       |

---

## FALLBACK LOGIC

When config.yaml lookup fails:

```
1. Agent in config.yaml? → Use config.yaml model
   ↓ (No)
2. Agent has frontmatter model? → Use frontmatter model
   ↓ (No)
3. Agent in COMPLEXITY_DEFAULTS? → Use complexity default
   ↓ (No)
4. Return 'sonnet' (hardcoded fallback)
```

### Complexity Defaults Mapping

```javascript
// From agent-config-reader.cjs
const COMPLEXITY_DEFAULTS = {
  // Opus agents (high complexity)
  planner: 'opus',
  architect: 'opus',
  qa: 'opus',
  'security-architect': 'opus',
  'evolution-orchestrator': 'opus',
  'master-orchestrator': 'opus',
  // ...

  // Haiku agents (low complexity)
  'context-compressor': 'haiku',

  // Default for everything else
  default: 'sonnet',
};
```

---

## MODEL ID NORMALIZATION

Both shorthand and full IDs are supported:

| Shorthand | Full Model ID               | Context Window |
| --------- | --------------------------- | -------------- |
| `opus`    | `claude-opus-4-6`           | 1M tokens      |
| `sonnet`  | `claude-sonnet-4-6`         | 200K tokens    |
| `haiku`   | `claude-haiku-4-5-20251001` | 200K tokens    |

```javascript
const { normalizeModel, getShorthand } = require('.claude/lib/utils/agent-config-reader.cjs');

normalizeModel('opus'); // 'claude-opus-4-5-20251101'
normalizeModel('claude-sonnet-4-5'); // 'claude-sonnet-4-5' (unchanged)

getShorthand('claude-opus-4-5-20251101'); // 'opus'
getShorthand('sonnet'); // 'sonnet' (unchanged)
```

---

## CONTENT

| Model    | Use For                                  | Cost   |
| -------- | ---------------------------------------- | ------ |
| `haiku`  | simple validation, quick fixes           | low    |
| `sonnet` | standard agent work (default)            | medium |
| `opus`   | complex reasoning, architecture/security | high   |

### Model Selection Guidelines

**haiku (low cost):**

- Simple validation tasks
- Quick bug fixes
- Straightforward refactoring
- Code formatting
- Documentation updates
- Low-complexity testing

**sonnet (medium cost, default):**

- Standard development work
- Feature implementation
- Most planning tasks
- Code reviews
- QA testing
- Technical writing
- Most agent work (recommended default)

**opus (high cost):**

- Complex architectural decisions
- Security reviews and threat modeling
- Multi-step orchestration
- Self-evolution (evolution-orchestrator)
- Complex system design
- Critical debugging
- High-stakes decision-making

### Cost-Benefit Trade-offs

**When to prefer haiku:**

- Task is well-defined with clear acceptance criteria
- Low risk of failure
- Fast turnaround more important than perfect output
- Budget constraints

**When to prefer sonnet (default):**

- Most standard development tasks
- Balanced cost/quality trade-off
- Task complexity is moderate
- Recommended for 80% of agent spawns

**When to prefer opus:**

- Task failure would be costly
- Requires deep reasoning or multi-step planning
- Security-critical operations
- Orchestration of multiple subagents
- Self-evolution and artifact creation

---

## VALIDATION HOOK

Model validation is enforced by `routing-guard.cjs` (Check 11), and spawn-time correction is handled by `spawn-prompt-assembler.cjs`.

**Modes:**

- `CONFIG_MODEL_VALIDATOR=block` - Block spawn if mismatch
- `CONFIG_MODEL_VALIDATOR=warn` - Log warning
- `CONFIG_MODEL_VALIDATOR=off` - Disable validation

**Default:** `block`

**What it validates:**

1. Extracts agent type from spawn prompt
2. Resolves configured model from config.yaml
3. Compares spawn model vs configured model
4. Logs mismatch details for audit trail

### Runtime Auto-Correction

When a Task spawn provides an explicit model that differs from configured model, `spawn-prompt-assembler.cjs` now rewrites the spawn payload model to configured model (best-effort fail-safe) before final spawn validation.

---

## RELATED REFERENCES

- **@AGENT_ROUTING_TABLE.md** - Agent types and their typical complexity
- **CLAUDE.md Section 2** - Golden-Path Example (shows opus for security-architect)
- **CLAUDE.md Section 5** - Inline model selection summary
- **config.yaml** - `.claude/config.yaml` agents section
- **ADR-075** - Router Model Selection from Configuration decision

---

## FILES

| File                                               | Purpose                                            |
| -------------------------------------------------- | -------------------------------------------------- |
| `.claude/lib/utils/agent-config-reader.cjs`        | Model resolution utility                           |
| `.claude/hooks/routing/routing-guard.cjs`          | PreToolUse model validation (Check 11)             |
| `.claude/hooks/routing/spawn-prompt-assembler.cjs` | PreToolUse model auto-correction + prompt assembly |
| `.claude/config.yaml`                              | Source of truth for agent models                   |
| `.claude/agents/*/*.md`                            | Agent definitions with frontmatter                 |

---

## BACK TO MAIN

See **CLAUDE.md** Section 5 for inline summary.
