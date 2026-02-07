# Tool Reference

**Source:** CLAUDE.md Section 1.4
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Comprehensive catalog of all available tools in the agent-studio framework, including core tools (23 total), MCP tools, tool categories, agent tool mappings, and validation enforcement.

---

## CONTENT

### Core Tools (Always Available - No Configuration Required)

These tools are built into Claude Code and work immediately:

| Tool                | Category        | Purpose                                     | Availability                   |
| ------------------- | --------------- | ------------------------------------------- | ------------------------------ |
| **Read**            | File I/O        | Read files from filesystem                  | ✅ All agents                  |
| **Write**           | File I/O        | Create/overwrite files                      | ✅ All agents                  |
| **Edit**            | File I/O        | Make precise edits to files                 | ✅ All agents                  |
| **Bash**            | Shell           | Execute shell commands                      | ✅ All agents (restricted)     |
| **Glob**            | Search          | Pattern-based file discovery                | ✅ All agents                  |
| **Grep**            | Search          | Content search in files                     | ✅ All agents                  |
| **Task**            | Orchestration   | Spawn subagents                             | ✅ Router + Orchestrators ONLY |
| **Orchestrator**    | Orchestration   | Delegate task to agent pipeline             | ✅ Orchestrators               |
| **TaskCreate**      | Task Management | Create trackable tasks                      | ✅ All agents                  |
| **TaskUpdate**      | Task Management | Update task status/metadata                 | ✅ All agents (MANDATORY)      |
| **TaskList**        | Task Management | List all tasks                              | ✅ All agents                  |
| **TaskGet**         | Task Management | Get task details                            | ✅ All agents                  |
| **TaskOutput**      | Task Management | Read task output                            | ✅ All agents                  |
| **TaskStop**        | Task Management | Stop running task                           | ✅ All agents                  |
| **Skill**           | Capability      | Invoke skill workflows                      | ✅ All agents (MANDATORY)      |
| **AvailableAgents** | Capability      | Query available agents by capability/domain | ✅ Router + Orchestrators      |
| **AskUserQuestion** | Interaction     | Get user input                              | ✅ Router ONLY                 |
| **EnterPlanMode**   | Planning        | Switch to planning mode                     | ✅ All agents                  |
| **ExitPlanMode**    | Planning        | Exit planning mode                          | ✅ All agents                  |
| **WebSearch**       | Research        | Search the web                              | ✅ All agents                  |
| **WebFetch**        | Research        | Fetch webpage content                       | ✅ All agents                  |
| **NotebookEdit**    | Jupyter         | Edit notebook cells                         | ✅ All agents                  |
| **MemoryRecord**    | Memory          | Record structured memory entries            | ✅ All agents                  |

**Total Core Tools:** 23

**Note:** SkillCatalog is a Node.js library (not a host-provided tool), documented in the SkillCatalog Query System section below.

### Task Tool Signature

The `Task` tool is the primary mechanism for Router and Orchestrators to spawn subagents.

---

#### CRITICAL: Parameter Structure Requirements

**The Task tool MUST be invoked with an object parameter, NOT a string.**

| Requirement         | Correct                   | Wrong          |
| ------------------- | ------------------------- | -------------- |
| Parameter type      | Object `{}`               | String `"..."` |
| Property names      | `snake_case`              | `camelCase`    |
| Required properties | `subagent_type`, `prompt` | Missing either |

---

#### Full Signature

```typescript
Task({
  subagent_type: string,      // REQUIRED - Agent type to spawn
  prompt: string,              // REQUIRED - Complete instructions
  task_id?: string,           // RECOMMENDED - For spawn traceability
  model?: string,             // OPTIONAL - Override default model
  allowed_tools?: string[]    // OPTIONAL - Tool whitelist (auto-enriched)
})
```

---

#### Parameter Descriptions

| Parameter       | Required    | Description                                                                                                                               |
| --------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `subagent_type` | **YES**     | Must match an agent identifier (e.g., `'developer'`, `'planner'`, `'qa'`, `'architect'`). See `.claude/agents/` for available agents.     |
| `prompt`        | **YES**     | Complete instructions for the agent. MUST include: task ID, role description, specific task details, and relevant context.                |
| `task_id`       | Recommended | ID from `TaskCreate` or `TaskList`. Logged to `spawn-log.jsonl` for traceability. Without this, spawn tracking is incomplete.             |
| `model`         | Optional    | Model override. Use `'haiku'`, `'sonnet'`, `'opus'` shorthands OR full model ID (e.g., `'claude-sonnet-4-5'`). See `@MODEL_SELECTION.md`. |
| `allowed_tools` | Optional    | Tool whitelist for the agent. If omitted, `spawn-prompt-assembler.cjs` hook auto-enriches with mandatory tools (TaskUpdate, Skill, etc.). |

---

#### Common Errors and Solutions

| Error                         | Cause                                  | Solution                                                     |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| `"Invalid tool parameters"`   | Single string passed instead of object | Use object: `Task({ subagent_type: '...', prompt: '...' })`  |
| `"Invalid tool parameters"`   | Missing `subagent_type` property       | Always include `subagent_type` in the object                 |
| `"Invalid tool parameters"`   | Missing `prompt` property              | Always include `prompt` in the object                        |
| `"Invalid tool parameters"`   | Wrong property name (camelCase)        | Use `subagent_type` not `subagentType`                       |
| `"Tool not available"`        | TaskUpdate not in allowed_tools        | Let hook auto-enrich OR add `TaskUpdate` explicitly          |
| Spawn prompt validation fails | Missing required sections              | Include TaskUpdate warning box, task ID, and memory protocol |

---

#### Correct Usage Examples

**1. Minimal (Required Properties Only)**

```javascript
Task({
  subagent_type: 'developer',
  prompt: 'Task [DEV-01]: Implement user login validation...',
});
```

**2. Recommended (With task_id and model)**

```javascript
Task({
  subagent_type: 'developer',
  prompt: 'Task [DEV-01]: Implement auth middleware...',
  task_id: 'DEV-01',
  model: 'sonnet',
});
```

**3. Full (With Explicit allowed_tools)**

```javascript
Task({
  subagent_type: 'planner',
  prompt: 'Task [PLAN-001]: Design authentication system...',
  task_id: 'PLAN-001',
  model: 'opus',
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'Skill'],
});
```

---

#### Incorrect Usage Examples

**1. Single String (WRONG)**

```javascript
// ❌ WRONG: Task() does not accept a string
Task('Implement authentication for the app');

// ✓ CORRECT: Use object with required properties
Task({ subagent_type: 'developer', prompt: 'Implement authentication...' });
```

**2. Missing subagent_type (WRONG)**

```javascript
// ❌ WRONG: Missing subagent_type
Task({ prompt: 'Implement the feature...' });

// ✓ CORRECT: Include subagent_type
Task({ subagent_type: 'developer', prompt: 'Implement the feature...' });
```

**3. Missing prompt (WRONG)**

```javascript
// ❌ WRONG: Missing prompt
Task({ subagent_type: 'developer' });

// ✓ CORRECT: Include prompt
Task({ subagent_type: 'developer', prompt: 'Implement the feature...' });
```

**4. Wrong Property Name - camelCase (WRONG)**

```javascript
// ❌ WRONG: camelCase property name
Task({ subagentType: 'developer', prompt: '...' });

// ✓ CORRECT: snake_case property name
Task({ subagent_type: 'developer', prompt: '...' });
```

---

#### Hook Processing Pipeline

The following hooks process `Task()` calls in order:

| Hook                              | Trigger          | Purpose                                                         |
| --------------------------------- | ---------------- | --------------------------------------------------------------- |
| `routing-guard.cjs`               | PreToolUse(Task) | Enforces TaskList-first, planner-first, security review         |
| `pre-task-unified.cjs`            | PreToolUse(Task) | Validates spawn parameters, loop prevention, task status        |
| `spawn-prompt-assembler.cjs`      | PreToolUse(Task) | Auto-enriches prompt with memory, tools, and TaskUpdate warning |
| `spawn-prompt-validator.cjs`      | PreToolUse(Task) | Validates prompt contains required sections                     |
| `config-model-validator.cjs`      | PreToolUse(Task) | Validates model matches config.yaml                             |
| `tool-availability-validator.cjs` | PreToolUse(Task) | Validates required tools are available                          |
| `agent-context-pre-tracker.cjs`   | PreToolUse(Task) | Sets mode='agent' to prevent race conditions                    |

**Key Behavior:**

- `spawn-prompt-assembler.cjs` enriches `allowed_tools` with mandatory tools (`TaskUpdate`, `Skill`, etc.) if not explicitly provided
- This guarantees spawned agents have the tools needed for task tracking
- If `allowed_tools` is explicitly provided, mandatory tools are still added if missing

### MCP Tools (Require Server Configuration)

MCP (Model Context Protocol) tools require server configuration in `.claude/settings.json`. Currently **NO MCP servers are configured** (mcpServers: {}).

**Tool Pattern:** `mcp__<server>__<tool>`

| Tool                                   | Server              | Purpose              | Configured? | Agent References |
| -------------------------------------- | ------------------- | -------------------- | ----------- | ---------------- |
| **mcp**chrome-devtools**\***           | chrome-devtools     | Browser automation   | ❌ No       | 0 agents         |
| **mcp**sequential-thinking**\***       | sequential-thinking | Structured reasoning | ❌ No       | Use Skill()      |
| **mcp**Ref**ref_search_documentation** | Ref                 | Documentation search | ❌ No       | 0 agents         |
| **mcp**Ref**ref_read_url**             | Ref                 | Read URL content     | ❌ No       | 0 agents         |
| **mcp**Exa**web_search_exa**           | Exa                 | Enhanced web search  | ❌ No       | evolution-orch   |
| **mcp**Exa**get_code_context_exa**     | Exa                 | Code context search  | ❌ No       | evolution-orch   |
| **mcp**Exa**company_research_exa**     | Exa                 | Company research     | ❌ No       | 0 agents         |
| **mcp**shadcn**getComponents**         | shadcn              | shadcn/ui components | ❌ No       | 0 agents         |
| **mcp**shadcn**getComponent**          | shadcn              | Component details    | ❌ No       | 0 agents         |

**Fallback Strategy:** Use `Skill({ skill: '<skill-name>' })` instead of MCP tools when servers are not configured.

**Example:** Instead of `mcp__sequential-thinking__sequentialthinking`, use `Skill({ skill: 'sequential-thinking' })`

### Tool Categories and Usage

**Always Available (No restrictions):**

- File I/O: Read, Write, Edit
- Search: Glob, Grep
- Task Management: TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop
- Capability: Skill, AvailableAgents
- Research: WebSearch, WebFetch
- Planning: EnterPlanMode, ExitPlanMode
- Jupyter: NotebookEdit
- Memory: MemoryRecord

**Restricted (Special permissions):**

- **Task**: Only Router and Orchestrators (for spawning subagents)
- **Orchestrator**: Only orchestrator agents (master-orchestrator, swarm-coordinator, etc.), **not** the Router. Router routes; orchestrators orchestrate.
- **AskUserQuestion**: Only Router (for user interaction)
- **Bash**: All agents have access, but Router limited to read-only git commands

### Agent Tool Mapping

**Standard Agent Toolset** (developer, planner, qa, architect, pm, technical-writer):

```yaml
tools:
  [
    Read,
    Write,
    Edit,
    Bash,
    Glob,
    Grep,
    MemoryRecord,
    TaskUpdate,
    TaskList,
    TaskCreate,
    TaskGet,
    TaskOutput,
    Skill,
  ]
```

**Orchestrator Toolset** (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator):

```yaml
tools: [
    Read,
    Write,
    Edit,
    Bash,
    Glob,
    Grep,
    Task, # MANDATORY for spawning subagents
    Orchestrator,
    MemoryRecord,
    TaskUpdate,
    TaskList,
    TaskCreate,
    TaskGet,
    TaskOutput,
    Skill,
  ]
```

**Router Toolset** (router.md):

```yaml
tools: [
    Read, # agent files / routing docs
    Task,
    TaskList,
    TaskCreate,
    TaskUpdate,
    TaskGet,
    AskUserQuestion, # user interaction
  ]
# Router CANNOT use: Edit, Write, Bash (implementation), Glob, Grep, WebSearch, mcp__*
```

**Read-Only Agents** (intentional security constraint):

- **code-reviewer**: No Write, No Edit (read-only code analysis)
- **researcher**: Read, Glob, Grep, WebSearch, WebFetch (prevents data exfiltration)

**Write-Only Agents:**

- **context-compressor**: No Edit (write-only mode)

**Monitoring-Only Agents:**

- **reflection-agent**: No Bash (read-only, monitors Bash errors for reflection)

### SkillCatalog Query System

**Type:** Node.js Library (not a host tool)
**Usage:** `const { SkillCatalogQuery } = require('.claude/lib/tools/skill-catalog.cjs')`
**In Agents:** Use `Skill({ skill: 'skill-name' })` instead

SkillCatalog is an internal library for querying the skill index. Agents use the Skill() tool to invoke skills, not the SkillCatalog library directly.

**For skill discovery:**

- Agents receive AVAILABLE_SKILLS list at spawn time
- Use Skill() tool to invoke specific skills
- Skill discovery happens via agent documentation, not runtime queries

**Internal usage (if implementing new tools):**

```javascript
const { SkillCatalogQuery } = require('.claude/lib/tools/skill-catalog.cjs');
const catalog = new SkillCatalogQuery();
const results = catalog.query({ domain: 'testing', agentType: 'developer' });
```

### MemoryRecord Tool

Record structured memory entries (patterns/gotchas) without manual JSON edits.

**Signature:**
`MemoryRecord({ type: 'pattern'|'gotcha', text: string, category?: string, area?: string })`

**Notes:**

- Backed by `.claude/tools/cli/memory-record.cjs`, which calls `memory-manager` record APIs.
- Use this instead of editing `patterns.json` or `gotchas.json` directly.

### AvailableAgents Tool (Phase 3)

Router and orchestrators can query available agents at runtime:

- Example: `AvailableAgents({ capability: 'code-review' })`
- Filters: capability, domain, category, excludeFailed, minSuccessRate, limit
- Returns: Available agents with health status, sorted by success rate
- Use when: Router selects best agent for task dynamically

Example usage in router:

```javascript
const agents = AvailableAgents({
  capability: 'code-review',
  excludeFailed: true,
  minSuccessRate: 0.7
});
const best = agents.agents[0] || agents.agents.find(a => a.recommendedAgents?.includes('code-reviewer'));
Task({ subagent_type: best.id, prompt: ... });
```

### Tool Validation and Enforcement

**Hook:** `.claude/hooks/routing/tool-availability-validator.cjs`

**Purpose:**

- Validates tool availability before agent spawning
- Blocks spawn if required tools (core tools) are unavailable
- Warns but allows spawn if optional tools (MCP) are missing

**Related ADR:** ADR-051 Tool Availability Validation Hook

---

## RELATED REFERENCES

- **@ENFORCEMENT_HOOKS.md** - tool-availability-validator.cjs enforcement
- **@AGENT_ROUTING_TABLE.md** - Agent-specific toolset mappings

---

## BACK TO MAIN

See **CLAUDE.md** Section 1.4 for inline summary.
