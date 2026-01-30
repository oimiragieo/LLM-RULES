---
template_type: spawn_template
template_name: universal-agent-spawn
use_cases:
  - Standard agent spawning (developer, qa, planner, architect, etc.)
  - Single-purpose tasks
  - Non-orchestrator agents
model_selection: See Section 5 (haiku for simple, sonnet for standard, opus for complex)
---

# Universal Agent Spawn Template

Use this template for ALL non-orchestrator agents (developer, qa, planner, etc.)

## When to Use
- Bug fixes, feature implementation, testing, documentation
- Single-purpose tasks (one agent, one task)
- Non-orchestrator agents (not master-orchestrator, swarm-coordinator, etc.)

## Template

```javascript
// Step 1: Always check tasks first
TaskList();

// Step 2: Spawn agent (parallel spawns = multiple Task(...) in same response)
Task({
  subagent_type: 'general-purpose',
  // model: 'haiku' | 'sonnet' | 'opus' (see Section 5)
  description: '<ROLE> doing <TASK>',
  allowed_tools: [
    'Read','Write','Edit','Bash',
    'TaskUpdate','TaskList','TaskCreate','TaskGet','TaskOutput',
    'Skill',
    // NOTE: For sequential thinking, use Skill({ skill: 'sequential-thinking' })
    // MCP tools require server configuration in settings.json
  ],
  prompt: `You are the <ROLE> agent.

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

All file operations MUST use relative paths from PROJECT_ROOT.
- Agents: .claude/agents/
- Skills: .claude/skills/
- Context: .claude/context/

**Path Usage Rules:**
✅ CORRECT: .claude/context/artifacts/report.txt
✅ CORRECT: .claude/context/memory/learnings.md
✅ CORRECT: src/components/Button.tsx

❌ WRONG: C:\\dev\\projects\\agent-studio\\.claude\\context\\artifacts\\report.txt
❌ WRONG: C:/dev/projects/agent-studio/.claude/context/artifacts/report.txt
❌ WRONG: /home/user/agent-studio/.claude/context/memory/learnings.md

DO NOT use absolute paths. ALWAYS use relative paths from PROJECT_ROOT.
DO NOT create files outside PROJECT_ROOT.

## Your Assigned Task
Task ID: <ID>
Subject: <SUBJECT>

## Instructions
1) FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" })
2) Read your agent definition: <agent-file-path>
3) Invoke required skills via Skill({ skill: "<skill>" }) as applicable (default for coding: \`tdd\` → \`debugging\`)
4) Execute task
5) LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } })
6) THEN: TaskList()

## Task Synchronization
- discoveries/keyFiles: TaskUpdate({ taskId: "<ID>", metadata: { discoveries: [...], keyFiles: [...] } })

## Critical: Use These Tools
- Skill() - invoke skills (don't just read them)
- TaskUpdate() - track progress (MANDATORY)
- TaskList() - find next work

## Memory Protocol
1) Read: .claude/context/memory/learnings.md (before starting)
2) Write: decisions/issues/learnings to appropriate memory files
\`,
});
```

## Model Selection Guide

| Task Type | Model | Justification |
|-----------|-------|---------------|
| Simple validation, quick fixes | `haiku` | Low cost, fast |
| Standard coding, testing, docs | `sonnet` | Balanced cost/quality |
| Architecture, security, complex reasoning | `opus` | High quality |

## Related Templates
- Agent Identity Integration: `.claude/templates/spawn/agent-identity-integration.md`
- Orchestrator Spawn: `.claude/templates/spawn/orchestrator-spawn.md`
