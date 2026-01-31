---
template_type: spawn_template
template_name: orchestrator-spawn
use_cases:
  - Orchestrator agents (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator)
  - Agents that spawn subagents
  - Multi-agent coordination
requires:
  - Task tool in allowed_tools (orchestrators MUST spawn subagents)
model_selection: opus (orchestration requires complex reasoning)
---

# Orchestrator Spawn Template

Use this template for orchestrator agents that coordinate multiple subagents.

## When to Use

- Master orchestration (master-orchestrator)
- Swarm coordination (swarm-coordinator)
- Self-evolution (evolution-orchestrator)
- Party mode collaboration (party-orchestrator)

## Critical Difference from Universal Template

- **MUST include `Task` tool** in allowed_tools (orchestrators spawn subagents)
- **MUST use `opus` model** (orchestration requires complex reasoning)
- **May include MCP tools** for research (e.g., Exa for evolution-orchestrator)

## Template

```javascript
Task({
  subagent_type: 'evolution-orchestrator', // or master-orchestrator, swarm-coordinator
  model: 'opus',
  description: '<ORCHESTRATOR> coordinating <TASK>',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'Task', // CRITICAL: Orchestrators spawn subagents
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
    // NOTE: For sequential thinking, use Skill({ skill: 'sequential-thinking' })
    // MCP tools require server configuration in settings.json
    'mcp__Exa__web_search_exa',
    'mcp__Exa__get_code_context_exa', // For research
  ],
  prompt: `You are the <ORCHESTRATOR> agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: <ID>                                                  |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "in_progress" });              |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "completed",                   |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: <absolute-path-to-project>
All file operations MUST be relative to PROJECT_ROOT.

## Your Assigned Task
Task ID: <ID>
Subject: <SUBJECT>

## Instructions
1) FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" })
2) Read your orchestrator definition: <orchestrator-file-path>
3) Invoke required skills via Skill({ skill: "<skill>" })
4) Spawn subagents via Task(...) as needed
5) LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } })
6) THEN: TaskList()

## Bash Safety Protocol (MANDATORY for Background Tasks)

**CRITICAL:** All background Bash tasks MUST include CWD initialization.

**Required Pattern:**
\`\`\`bash
cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"
\`\`\`

### Phase 3: Shell Security Validators (ADR-077)

Background Bash tasks go through automated validation:
- **Layer 1:** CWD validator (requires \`cd "$PROJECT_ROOT"\`)
- **Layer 2:** Injection validator (blocks dangerous patterns)
- **Layer 3:** Quoting validator (warns on unquoted variables)
- **Layer 4:** Shellcheck validator (syntax checking)
- **Layer 5:** Command allowlist (blocks dangerous commands)

See \`.claude/docs/SHELL-SECURITY-GUIDE.md\` for complete guide.

**Full Template:** .claude/templates/spawn/bash-safe-background.md
**Related:** ADR-077, SHELL-SECURITY-001, SHELL-SECURITY-002

## Memory Protocol
1) Read: .claude/context/memory/learnings.md (before starting)
2) Write: decisions/issues/learnings to appropriate memory files
\`,
});
```

## Orchestrator-Specific Guidance

### Parallel Spawn (Rule)

For multi-perspective tasks: include multiple `Task(...)` calls in ONE response (parallel execution).

### Background Spawn (Supported)

```javascript
Task({
  subagent_type: 'general-purpose',
  run_in_background: true,
  description: 'QA running test suite',
  allowed_tools: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'Skill',
  ],
  prompt: 'You are QA. Read .claude/agents/core/qa.md and run full test suite...',
});
```

## Related Templates

- Universal Agent Spawn: `.claude/templates/spawn/universal-agent-spawn.md`
- Agent Identity Integration: `.claude/templates/spawn/agent-identity-integration.md`
