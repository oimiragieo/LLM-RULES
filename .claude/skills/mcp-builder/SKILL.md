---
# Agent: developer | Task: #5 | Session: 2026-03-05
verified: true
lastVerifiedAt: 2026-03-15T00:00:00.000Z
name: mcp-builder
description: Guide developers in creating Model Context Protocol (MCP) servers. Use for building MCP tools that enable LLMs to interact with external services. Covers TypeScript (primary) and Python FastMCP (secondary), tool annotations, Zod/Pydantic validation, and evaluation question creation.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, WebFetch]
agents: [developer, typescript-pro, mcp-developer]
category: development
tags: [mcp, model-context-protocol, typescript, python, api-integration, tools]
aliases: [mcp-server-builder, mcp-development]
best_practices:
  - Study MCP protocol docs before implementing any server
  - TypeScript is strongly preferred for its high-quality SDK support
  - Use streamable HTTP for remote servers, stdio for local servers
  - Validate all inputs with Zod (TypeScript) or Pydantic (Python)
  - Annotate tools with readOnlyHint, destructiveHint, idempotentHint, openWorldHint
  - Create 10 independent evaluation questions per server
error_handling: strict
streaming: supported
---

# MCP Server Development Guide

> "The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks."

## Overview

This skill guides you through creating Model Context Protocol (MCP) servers — tools that enable LLMs to interact with external services. MCP servers expose capabilities as typed tools that agents can discover and invoke.

## When to Invoke

- User asks to "build an MCP server" or "create MCP tools"
- Integrating an external API with Claude
- Exposing local system capabilities (files, databases, services) to an agent
- Creating tools for an agent to call

## Four-Phase Development Workflow

### Phase 1: Deep Research and Planning

Before writing any code, understand the target API or service thoroughly.

1. **Study MCP protocol documentation**
   - Visit `https://modelcontextprotocol.io/sitemap.xml` for current docs
   - Understand tool definitions, resource types, and prompt patterns

2. **Analyze the target service**
   - What operations does the API support?
   - Which operations are read-only vs destructive?
   - What are the authentication requirements?
   - What are the rate limits and pagination patterns?

3. **Design tool coverage**
   - Balance: API coverage (breadth) vs workflow tools (depth, combining multiple API calls)
   - Prefer workflow tools for common agent tasks
   - Design tool names as snake_case verb-noun pairs: `get_user`, `create_issue`, `list_repos`

4. **Choose transport**
   - **Remote servers**: Streamable HTTP transport
   - **Local servers**: stdio transport
   - Default to stdio unless there's a specific need for HTTP

### Phase 2: Implementation

#### Language Selection

**TypeScript (recommended)** — high-quality SDK, strong type safety, better IDE support:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'my-service',
  version: '1.0.0',
});
```

**Python (FastMCP)** — simpler syntax, good for Python-native services:

```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel

mcp = FastMCP("my-service")
```

#### Project Structure (TypeScript)

```
mcp-server/
├── src/
│   ├── index.ts          # Server entry point
│   ├── client.ts         # API client + auth
│   ├── tools/
│   │   ├── read.ts       # Read-only tools
│   │   └── write.ts      # Mutating tools
│   └── utils/
│       ├── pagination.ts
│       └── errors.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### Tool Annotations (MANDATORY)

Every tool MUST declare intent annotations:

```typescript
server.tool(
  'get_repository',
  'Fetch a GitHub repository by owner and name',
  {
    owner: z.string().describe('Repository owner (username or org)'),
    repo: z.string().describe('Repository name'),
  },
  {
    // Annotations
    readOnlyHint: true, // Does not modify external state
    destructiveHint: false, // Not destructive
    idempotentHint: true, // Safe to call multiple times
    openWorldHint: true, // Makes external network calls
  },
  async ({ owner, repo }) => {
    // implementation
  }
);
```

**Annotation reference:**

| Annotation        | Type    | Meaning                                         |
| ----------------- | ------- | ----------------------------------------------- |
| `readOnlyHint`    | boolean | Does not modify external state                  |
| `destructiveHint` | boolean | May destroy data irreversibly                   |
| `idempotentHint`  | boolean | Multiple identical calls have same effect       |
| `openWorldHint`   | boolean | Interacts with external systems (network, disk) |

#### Input Validation with Zod (TypeScript)

```typescript
// Good: explicit, descriptive schemas
const schema = {
  query: z.string().min(1).max(500).describe('Search query'),
  limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
  cursor: z.string().optional().describe('Pagination cursor from previous call'),
};
```

#### Input Validation with Pydantic (Python)

```python
from pydantic import BaseModel, Field
from typing import Optional

class SearchParams(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    limit: int = Field(20, ge=1, le=100, description="Max results")
    cursor: Optional[str] = Field(None, description="Pagination cursor")
```

#### Response Format

Include both text (for human-readable output) and structured data (for agent parsing):

```typescript
return {
  content: [
    {
      type: 'text',
      text: `Found ${results.length} results for "${query}"`,
    },
    {
      type: 'text',
      text: JSON.stringify(results, null, 2),
    },
  ],
};
```

#### Shared Utilities

Always build these utilities before implementing tools:

1. **API client** — centralized HTTP client with auth headers, retry logic
2. **Error handler** — converts API errors to MCP-safe error messages
3. **Pagination helper** — cursor/offset/page-based pagination abstraction

#### Error Handling Pattern

```typescript
try {
  const result = await apiClient.getResource(id);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
} catch (error) {
  if (error instanceof NotFoundError) {
    return {
      content: [{ type: 'text', text: `Resource ${id} not found` }],
      isError: true,
    };
  }
  throw error; // Re-throw unexpected errors
}
```

### Phase 3: Review and Test

#### Code Review Checklist

- [ ] DRY: No duplicated API call logic across tools
- [ ] All tools have meaningful descriptions
- [ ] All inputs have `describe()` annotations
- [ ] All tools have intent annotations (readOnlyHint etc.)
- [ ] Error messages are user-friendly, not stack traces
- [ ] TypeScript: full type coverage, no `any` types
- [ ] Python: all functions typed, Pydantic models for inputs

#### Build Verification

**TypeScript:**

```bash
npm run build            # Must succeed with 0 errors
npx tsc --noEmit        # Type-check without output
```

**Python:**

```bash
python -m py_compile src/server.py   # Syntax check
mypy src/                             # Type check
```

#### Testing with MCP Inspector

```bash
# TypeScript
npx @modelcontextprotocol/inspector node dist/index.js

# Python
npx @modelcontextprotocol/inspector python src/server.py
```

Use MCP Inspector to:

1. Verify all tools appear with correct descriptions
2. Test each tool with sample inputs
3. Verify error handling with invalid inputs
4. Check response format is parseable

### Phase 4: Create Evaluations

Design **10 independent evaluation questions** per server. These test whether the MCP server enables real-world tasks.

**Evaluation question requirements:**

- Each question is independent (no prior context needed)
- Questions use realistic scenarios an agent would encounter
- Questions are specific enough to have verifiable answers
- Mix of simple (1 tool call) and compound (2-3 tool calls) tasks
- At least 3 questions test read-only operations
- At least 2 questions test error handling

**Output format:**

```xml
<evaluations>
  <question id="1">
    <task>Get the description of the 'anthropics/claude-code' repository</task>
    <expected_tools>get_repository</expected_tools>
    <answer>Claude Code is Anthropic's official CLI for Claude</answer>
  </question>
  <question id="2">
    <task>List the open issues labeled 'bug' in 'anthropics/claude-code', limit to 5</task>
    <expected_tools>list_issues</expected_tools>
    <answer>Returns up to 5 open issues with 'bug' label</answer>
  </question>
  <!-- ... 8 more questions -->
</evaluations>
```

## Memory Protocol

Before starting MCP server development:

```bash
cat .claude/context/memory/learnings.md | grep -i "mcp\|model context"
cat .claude/context/memory/issues.md | grep -i "mcp\|model context"
```

After completing the server, record findings:

- Working patterns → `.claude/context/memory/learnings.md`
- API integration gotchas → `.claude/context/memory/issues.md`
- Architecture decisions → `.claude/context/memory/decisions.md`

## Official MCP Server Templates

The `modelcontextprotocol/servers` repository provides production-ready reference implementations. Use these as starting templates before building custom servers.

### PostgreSQL MCP Server

```bash
# Install and run directly
npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb
```

**Claude Desktop config:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

**Tools provided:** `query` (read-only SQL), `list_tables`, `describe_table`

**Key implementation patterns from the reference server:**

```typescript
// Read-only query tool pattern
server.tool(
  'query',
  'Run a read-only SQL query',
  { sql: z.string().describe('SQL SELECT statement') },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ sql }) => {
    // Enforce read-only by setting transaction to read-only
    const result = await pool.query('BEGIN READ ONLY; ' + sql + '; COMMIT');
    return {
      content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }],
    };
  }
);
```

### SQLite MCP Server

```bash
# Install and run
npx -y @modelcontextprotocol/server-sqlite /path/to/database.db
```

**Claude Desktop config:**

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/database.db"]
    }
  }
}
```

**Tools provided:** `read_query`, `write_query`, `create_table`, `list_tables`, `describe_table`, `insert_row`, `delete_rows`

**Schema introspection pattern:**

```typescript
server.tool(
  'describe_table',
  'Get the schema for a table',
  { table_name: z.string().describe('Name of the table') },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async ({ table_name }) => {
    const rows = db.prepare(`PRAGMA table_info(?)`).all(table_name);
    return {
      content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
    };
  }
);
```

### Filesystem MCP Server

```bash
npx -y @modelcontextprotocol/server-filesystem /allowed/path
```

**Tools provided:** `read_file`, `write_file`, `list_directory`, `create_directory`, `move_file`, `search_files`, `get_file_info`

**Path safety pattern (copy this for any filesystem tool):**

```typescript
function validatePath(requestedPath: string, allowedDir: string): string {
  const resolved = path.resolve(requestedPath);
  if (!resolved.startsWith(path.resolve(allowedDir))) {
    throw new Error(`Path ${requestedPath} is outside allowed directory`);
  }
  return resolved;
}
```

### GitHub MCP Server

```bash
npx -y @modelcontextprotocol/server-github
# Requires: GITHUB_PERSONAL_ACCESS_TOKEN env var
```

**Tools provided:** `create_repository`, `get_file_contents`, `push_files`, `create_issue`, `create_pull_request`, `search_repositories`, `search_code`, `fork_repository`, `list_commits`

### When to Use Official Servers vs Custom

| Scenario                          | Use Official Server | Build Custom |
| --------------------------------- | ------------------- | ------------ |
| Standard PostgreSQL/SQLite access | YES                 | No           |
| GitHub repo operations            | YES                 | No           |
| Custom API integration            | No                  | YES          |
| Business-specific logic           | No                  | YES          |
| Combining multiple APIs           | No                  | YES          |
| Existing service with SDK         | No                  | YES          |

## Common Pitfalls

| Pitfall                       | Description                       | Fix                                 |
| ----------------------------- | --------------------------------- | ----------------------------------- |
| Missing annotations           | Tools without `readOnlyHint` etc. | Always declare all 4 annotations    |
| Overly broad tools            | `do_everything(action, params)`   | One tool per distinct operation     |
| Missing input descriptions    | `query: z.string()`               | Always add `.describe()`            |
| Leaking auth tokens in errors | Logging API key in error message  | Sanitize error messages             |
| No pagination                 | Returning all results at once     | Add cursor/limit to list operations |
| Blocking event loop           | Synchronous I/O in Node.js        | Always use async/await              |

## Cross-IDE Agent Detection (Inspired by Skill_Seekers AgentDetector)

After building an MCP server, auto-detect which AI coding agents are installed on the user's system and generate the correct configuration for each. This eliminates the manual "copy this JSON into your settings" step.

**Supported agents and their config locations:**

| Agent           | Transport | Config Path (Windows)                                                                       | Config Path (macOS/Linux)                                |
| --------------- | --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Claude Code     | stdio     | `~/.claude.json`                                                                            | `~/.claude.json`                                         |
| Cursor          | HTTP      | `%APPDATA%\Cursor\mcp_settings.json`                                                        | `~/Library/Application Support/Cursor/mcp_settings.json` |
| Windsurf        | HTTP      | `%APPDATA%\Windsurf\mcp_config.json`                                                        | `~/Library/Application Support/Windsurf/mcp_config.json` |
| VS Code + Cline | stdio     | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` | `~/.config/Code/User/globalStorage/...`                  |
| IntelliJ IDEA   | HTTP      | `%APPDATA%\JetBrains\IntelliJIdea2024.3\mcp.xml`                                            | `~/Library/Application Support/JetBrains/...`            |

**Detection protocol:**

1. Check if each config file exists at the platform-appropriate path
2. For each detected agent, generate the MCP server config snippet in the agent's format
3. Present all detected agents to the user with one-click install instructions
4. For agents using HTTP transport, include the default port and health check URL

**Config generation template** (Claude Code stdio example):

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "node",
      "args": ["<path-to-server>/dist/index.js"],
      "env": {}
    }
  }
}
```

This step should be part of Phase 4 (Testing & Deployment) — after the server is built and tested, offer to install it into all detected agents.

## Reference Documentation

- MCP Protocol: `https://modelcontextprotocol.io/`
- TypeScript SDK: `https://github.com/modelcontextprotocol/typescript-sdk`
- Python SDK: `https://github.com/modelcontextprotocol/python-sdk`
- FastMCP: `https://github.com/jlowin/fastmcp`
- MCP Inspector: `npx @modelcontextprotocol/inspector`

## Related Skills

- `typescript-expert` — TypeScript type system, SDK patterns
- `api-development-expert` — REST API design, authentication patterns
- `tdd` — Test-driven development for MCP tool testing
- `verification-before-completion` — Pre-completion quality gates
