# Tool Reference

**Source:** CLAUDE.md Section 1.4
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Comprehensive catalog of all available tools in the agent-studio framework, including core tools (22 total), MCP tools, tool categories, agent tool mappings, and validation enforcement.

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
| **SkillCatalog**    | Capability      | Query available skills at runtime           | ✅ All agents                  |
| **AvailableAgents** | Capability      | Query available agents by capability/domain | ✅ Router + Orchestrators      |
| **AskUserQuestion** | Interaction     | Get user input                              | ✅ Router ONLY                 |
| **EnterPlanMode**   | Planning        | Switch to planning mode                     | ✅ All agents                  |
| **ExitPlanMode**    | Planning        | Exit planning mode                          | ✅ All agents                  |
| **WebSearch**       | Research        | Search the web                              | ✅ All agents                  |
| **WebFetch**        | Research        | Fetch webpage content                       | ✅ All agents                  |
| **NotebookEdit**    | Jupyter         | Edit notebook cells                         | ✅ All agents                  |

**Total Core Tools:** 23

### Task Tool Signature

The `Task` tool is the primary mechanism for Router and Orchestrators to spawn subagents.

**Signature:**
`Task({ subagent_type: string, prompt: string, task_id?: string, model?: string })`

**Parameters:**

- `subagent_type`: The type of agent to spawn (e.g., 'planner', 'developer', 'qa').
- `prompt`: The detailed instruction for the agent. MUST include task ID and context.
- `task_id` (Optional): ID from `TaskCreate` or `TaskList`. Recommended for tracking.
- `model` (Optional): Override the default model (see `@MODEL_SELECTION.md`).

**Usage:**

```javascript
Task({
  subagent_type: 'developer',
  prompt: 'Task [DEV-01]: Implement auth middleware... (See context in ...)',
  task_id: 'DEV-01',
  model: 'claude-3-5-sonnet-20241022',
});
```

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
- Capability: Skill, SkillCatalog, AvailableAgents
- Research: WebSearch, WebFetch
- Planning: EnterPlanMode, ExitPlanMode
- Jupyter: NotebookEdit

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
    TaskUpdate,
    TaskList,
    TaskCreate,
    TaskGet,
    TaskOutput,
    Skill,
    SkillCatalog,
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
    TaskUpdate,
    TaskList,
    TaskCreate,
    TaskGet,
    TaskOutput,
    Skill,
    SkillCatalog,
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

### SkillCatalog Tool

Agents can query available skills dynamically at runtime:

- Example: `SkillCatalog({ domain: 'testing' })`
- Filters: domain, category, agentType, tags, limit
- Returns: Matching skills with descriptions and recommendations
- Use when: Agent needs to discover skills for current task

Example usage:

```javascript
const skills = SkillCatalog({ domain: 'testing', agentType: 'developer' });
const best = skills.skills.find(s => s.recommended);
Skill({ skill: best.name });
```

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
