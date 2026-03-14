# Plugin Development Standards

Rules for developing Claude Code plugins: MCP servers, Agent Studio skills, hooks, and agents.

## Claude Code Plugin Architecture

Claude Code supports four extension points:

| Extension Type | Location | Purpose | Creator Skill |
|----------------|----------|---------|---------------|
| **Skills** | `.claude/skills/<name>/SKILL.md` | Reusable workflows invoked via `Skill()` | `skill-creator` |
| **Agents** | `.claude/agents/**/<name>.md` | Specialized subagents spawned via `Task()` | `agent-creator` |
| **Hooks** | `.claude/hooks/**/<name>.cjs` | PreToolUse/PostToolUse enforcement | `hook-creator` |
| **MCP Servers** | External process (stdio/SSE) | Tools, resources, prompts for Claude | `mcp-builder` |

**IRON LAW**: Never write directly to creator-managed paths. Always use the creator skill:

```javascript
Skill({ skill: 'skill-creator' });   // For skills
Skill({ skill: 'agent-creator' });   // For agents
Skill({ skill: 'hook-creator' });    // For hooks
Skill({ skill: 'mcp-builder' });     // For MCP servers
```

---

## MCP Server Development

### Architecture

MCP servers communicate via JSON-RPC 2.0 over stdio or SSE transport. Each server exposes:

- **Tools** — callable functions (read file, call API, run query)
- **Resources** — readable data sources (file contents, database records)
- **Prompts** — reusable prompt templates

### TypeScript MCP Server Template

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'my-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Description of what this tool does',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string', description: 'A parameter' },
        },
        required: ['param'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'my_tool') {
    const { param } = request.params.arguments as { param: string };
    // Tool implementation here
    return {
      content: [{ type: 'text', text: `Result: ${param}` }],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Package Structure

```
my-mcp-server/
├── src/
│   └── index.ts          # Server entry point
├── package.json
├── tsconfig.json
└── README.md
```

### package.json for MCP Server

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "bin": { "my-mcp-server": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Registering in Claude Code

```json
// .claude/settings.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/my-mcp-server/dist/index.js"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

---

## Skill Development Standards

Skills are markdown files containing workflow instructions for Claude Code agents.

### Skill File Structure

```markdown
# Skill Name

## Purpose
One-sentence description of what this skill enables.

## When to Invoke
`Skill({ skill: 'skill-name' })`

Invoke when:
- Condition 1
- Condition 2

---

## Workflow

### Step 1: ...
### Step 2: ...

## Anti-Patterns
- Never do X
- Avoid Y

## Related Skills
- `other-skill` — brief description
```

### Skill Placement Rules

- Location: `.claude/skills/<skill-name>/SKILL.md`
- Naming: lowercase kebab-case
- One skill per directory
- Never write directly — use `Skill({ skill: 'skill-creator' })`

### Skill Invocation Pattern

Skills are invoked via the `Skill()` tool, NOT by reading the file:

```javascript
// CORRECT
Skill({ skill: 'tdd' });

// WRONG — reading the file does not apply the skill
Read('.claude/skills/tdd/SKILL.md');
```

### Skills vs Rules

| | Skills | Rules |
|-|--------|-------|
| **Format** | SKILL.md with structured workflow | .md with standards/guidelines |
| **Location** | `.claude/skills/<name>/SKILL.md` | `.claude/rules/<name>.md` |
| **Invocation** | `Skill({ skill: 'name' })` | Auto-injected into context |
| **Purpose** | Step-by-step workflows | Always-on standards |

---

## Hook Development Standards

Hooks intercept tool calls for enforcement, validation, and logging.

### Hook Types

| Event | Hook Type | Common Use |
|-------|-----------|------------|
| `PreToolUse` | Validation/blocking | Guard dangerous operations |
| `PostToolUse` | Metrics/logging | Track completions, update state |
| `UserPromptSubmit` | Preprocessing | Inject context, validate prompts |
| `Stop` | Cleanup | Check for console.logs, slop files |

### Hook File Structure

```javascript
#!/usr/bin/env node
// .claude/hooks/<category>/<hook-name>.cjs

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Read stdin
let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  const { success, data } = safeParseJSON(inputData, {});

  if (!success) {
    // Fail-open for advisory hooks, fail-closed for security hooks
    process.exit(0);
  }

  try {
    const result = validate(data);

    if (result.block) {
      console.log(JSON.stringify({ allow: false, message: result.reason }));
      process.exit(2); // Block
    }

    process.exit(0); // Allow
  } catch (err) {
    // Security hooks: fail-closed (exit 2)
    // Advisory hooks: fail-open (exit 0)
    process.exit(0);
  }
});

function validate(data) {
  // Hook logic here
  return { block: false };
}
```

### Exit Code Protocol

| Exit Code | Meaning |
|-----------|---------|
| `0` | Allow the tool call |
| `2` | Block the tool call |
| `1` | Error (NOT block — treated as allow) |

**CRITICAL**: Never exit with code `1` intending to block. Use `2` for blocks.

### Fail-Open vs Fail-Closed

| Hook Category | Policy | Exit on Error |
|---------------|--------|---------------|
| Security/routing/creator | Fail-closed | `process.exit(2)` |
| Advisory/metrics/logging | Fail-open | `process.exit(0)` |
| PostToolUse (all) | Fail-open | `process.exit(0)` |

### Hook Registration

Register in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/safety/my-hook.cjs"
          }
        ]
      }
    ]
  }
}
```

### Performance Budget

- Hooks MUST complete in under 100ms
- Never make network calls in PreToolUse hooks
- Never perform file I/O beyond reading a single config file
- Use `process.exit(0)` immediately if hook is not applicable

---

## Agent Development Standards

Agents are markdown files that define specialized subagent behavior.

### Agent File Structure

```markdown
---
name: my-agent
type: specialized
version: 1.0.0
description: One-line description of agent purpose
author: agent-studio
tools: Read, Write, Edit, Bash, TaskUpdate
skills:
  - tdd
  - debugging
tags:
  - implementation
  - domain
model: sonnet
---

# My Agent

## Core Identity

Brief description of the agent's role and persona.

## Capabilities

- Capability 1
- Capability 2

## Workflow

### Step 1: ...
### Step 2: ...

## Anti-Patterns

- Never do X
- Avoid Y
```

### Agent Placement

| Category | Path | Examples |
|----------|------|---------|
| Core | `.claude/agents/core/` | developer, qa, architect |
| Domain | `.claude/agents/domain/` | python-pro, k8s-specialist |
| Specialized | `.claude/agents/specialized/` | code-reviewer, code-simplifier |
| Orchestrators | `.claude/agents/orchestrators/` | master-orchestrator |

### Model Selection

| Complexity | Model | Use When |
|------------|-------|----------|
| Simple | `haiku` | Compression, simple lookups |
| Standard | `sonnet` | Most implementation tasks |
| Complex | `opus` | Security reviews, architecture, orchestrators |

### TaskUpdate Protocol (MANDATORY)

Every agent MUST call TaskUpdate at lifecycle boundaries:

```javascript
// At task start — FIRST thing
TaskUpdate({ taskId: 'task-N', status: 'in_progress', owner: 'my-agent' });

// At task completion — LAST thing (after all work is done)
TaskUpdate({
  taskId: 'task-N',
  status: 'completed',
  metadata: {
    summary: 'Brief description of what was accomplished',
    filesModified: ['path/to/file1', 'path/to/file2'],
    completedAt: new Date().toISOString(),
  },
});
```

---

## Anti-Patterns

### MCP Server Anti-Patterns

- Never use `shell: true` in MCP server child process spawning — command injection vector
- Never hardcode credentials in MCP server source or settings.json
- Never expose the MCP server to the network without authentication
- Never return raw error stack traces to Claude — sanitize errors first
- Never implement blocking I/O in tool handlers — always use async/await

### Skill Anti-Patterns

- Never write to `.claude/skills/` directly — use `skill-creator`
- Never duplicate workflow logic across multiple skills — extract shared steps
- Never make skills overly specific (single-use) — prefer composable generic skills
- Never embed large code examples inline — reference files instead

### Hook Anti-Patterns

- Never use `JSON.parse()` on untrusted input — use `safeParseJSON()`
- Never exit with code `1` to block — use `2`
- Never make network calls in PreToolUse hooks (blocks tool execution)
- Never catch-and-suppress errors in security hooks (fail-closed policy)
- Never write to stdout for logging — use stderr

### Agent Anti-Patterns

- Never skip `TaskUpdate(in_progress)` — tasks appear stuck
- Never mark completed before verifying work — integrity violation
- Never use `developer` when a specialist exists — specialist-first law
- Never hardcode file paths — use project root relative paths

---

## When to Invoke

For MCP server selection and configuration: `Skill({ skill: 'mcp-catalog' })`
For building a new MCP server: `Skill({ skill: 'mcp-builder' })`
For creating a new skill: `Skill({ skill: 'skill-creator' })`
For creating a new agent: `Skill({ skill: 'agent-creator' })`
For creating a new hook: `Skill({ skill: 'hook-creator' })`
