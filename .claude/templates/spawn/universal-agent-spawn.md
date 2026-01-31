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
- Bash() - MUST start with: cd "$PROJECT_ROOT" || exit 1 (for background tasks, see bash-safe-background.md)

## Memory Management Requirements (MANDATORY)

All agents MUST follow these memory management rules:

1. **Use Bounded Collections**
   - All arrays MUST have max size limits (1000 entries default)
   - Add trimming after each push operation
   - Example:
     \`\`\`javascript
     this.history = [];
     this.maxHistorySize = 1000;
     this.history.push(item);
     if (this.history.length > this.maxHistorySize) {
       this.history.shift();
     }
     \`\`\`

2. **Implement cleanup() Methods**
   - Required for all classes managing resources
   - Clear arrays, Maps, Sets
   - Remove event listeners
   - Close file handles
   - Clear timers/intervals

3. **Call Cleanup in Test Teardown**
   - Add \`afterEach\` hooks to all test suites
   - Call \`cleanup()\` on all test instances
   - Example:
     \`\`\`javascript
     afterEach(async () => {
       if (instance) await instance.cleanup();
     });
     \`\`\`

4. **NO Unbounded Data Accumulation**
   - Never accumulate data without limits
   - Use LRU eviction for caches
   - Trim metrics arrays to max size

5. **Monitor Memory During Long Operations**
   - Track heap usage for operations >1000 iterations
   - Log warnings if memory grows unexpectedly
   - Use \`process.memoryUsage()\` for monitoring

**Reference:** .claude/docs/MEMORY_MANAGEMENT.md

## Bash Safety Protocol (MANDATORY for Background Tasks)

**CRITICAL:** All background Bash tasks MUST include CWD initialization to prevent filesystem traversal.

**Required Pattern:**
\`\`\`bash
cd "$PROJECT_ROOT" || { echo "Failed to change to project root"; exit 1; }

# Your command here
find tests/ -name "*.test.*"
\`\`\`

**Why This Matters:**
- Background tasks execute in undefined CWD (not PROJECT_ROOT)
- Without \`cd "$PROJECT_ROOT"\`, relative paths resolve from root (/)
- This causes filesystem traversal and user data exposure

**Examples:**
\`\`\`javascript
// ❌ WRONG (will search from root /)
Bash({ command: 'find tests/', run_in_background: true });

// ✅ CORRECT (searches from PROJECT_ROOT)
Bash({
  command: 'cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"',
  run_in_background: true
});
\`\`\`

**Variable Quoting (MANDATORY):**
- Always quote variables: \`"$VAR"\` not \`$VAR\`
- Prevents failures when paths have spaces: \`/c/Program Files/\`

**Blocked Patterns:**
- Chained \`rm\`: \`; rm -rf /\`, \`&& rm -rf\`, \`| rm -rf\`
- Dangerous targets: \`rm -rf /\`, \`rm -rf ~\`, \`rm -rf *\`
- Code injection: \`eval\`, backticks, \`$()\` with rm
- Device redirects: \`>> /dev/\`

**Validation Hooks:**
- \`bash-cwd-validator.cjs\` - Blocks background tasks without CWD (CRITICAL)
- \`shell-injection-validator.cjs\` - Blocks dangerous patterns (CRITICAL)

**Full Template:** .claude/templates/spawn/bash-safe-background.md
**Related:** ADR-077, SHELL-SECURITY-001, SHELL-SECURITY-002

## Memory Protocol
1) Read: .claude/context/memory/learnings.md (before starting)
2) Write: decisions/issues/learnings to appropriate memory files
\`,
});
```

## Model Selection Guide

| Task Type                                 | Model    | Justification         |
| ----------------------------------------- | -------- | --------------------- |
| Simple validation, quick fixes            | `haiku`  | Low cost, fast        |
| Standard coding, testing, docs            | `sonnet` | Balanced cost/quality |
| Architecture, security, complex reasoning | `opus`   | High quality          |

## Related Templates

- Agent Identity Integration: `.claude/templates/spawn/agent-identity-integration.md`
- Orchestrator Spawn: `.claude/templates/spawn/orchestrator-spawn.md`
