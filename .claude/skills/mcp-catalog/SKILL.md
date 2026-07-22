---
name: mcp-catalog
description: Comprehensive reference for Model Context Protocol (MCP) servers — official, community, and Agent Studio integrated. Use when selecting, configuring, or building MCP servers for Claude Code projects.
source: builtin
trust_score: 100
provenance_sha: 2de56f048397bca1
---

# MCP Catalog Skill

<!-- Agent: developer | Task: #task-mega-w3-wave4a | Session: 2026-03-14 -->

## Purpose

Comprehensive reference for Model Context Protocol (MCP) servers — official, community, and Agent Studio integrated. Use this skill when selecting, configuring, or building MCP servers for Claude Code projects.

## When to Invoke

```javascript
Skill({ skill: 'mcp-catalog' });
```

Invoke when:

- Selecting an MCP server for a specific capability
- Configuring MCP servers in Claude Code settings
- Building a new MCP server integration
- Auditing existing MCP server usage

---

## Official Anthropic / MCP Reference Servers

| Server                | Package                                            | Capability                                     | Transport |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- | --------- |
| `filesystem`          | `@modelcontextprotocol/server-filesystem`          | Read/write local files with configurable roots | stdio     |
| `github`              | `@modelcontextprotocol/server-github`              | GitHub repos, PRs, issues, search              | stdio     |
| `gitlab`              | `@modelcontextprotocol/server-gitlab`              | GitLab projects, MRs, pipelines                | stdio     |
| `google-drive`        | `@modelcontextprotocol/server-gdrive`              | Google Drive file access and search            | stdio     |
| `google-maps`         | `@modelcontextprotocol/server-google-maps`         | Geocoding, directions, place search            | stdio     |
| `postgres`            | `@modelcontextprotocol/server-postgres`            | PostgreSQL read access with schema inspection  | stdio     |
| `sqlite`              | `@modelcontextprotocol/server-sqlite`              | SQLite read/write with business intelligence   | stdio     |
| `slack`               | `@modelcontextprotocol/server-slack`               | Slack channels, messages, user management      | stdio     |
| `memory`              | `@modelcontextprotocol/server-memory`              | KV-based persistent memory graph               | stdio     |
| `puppeteer`           | `@modelcontextprotocol/server-puppeteer`           | Browser automation and web scraping            | stdio     |
| `brave-search`        | `@modelcontextprotocol/server-brave-search`        | Brave Search API — web and local results       | stdio     |
| `fetch`               | `@modelcontextprotocol/server-fetch`               | HTTP fetch with robots.txt compliance          | stdio     |
| `sequential-thinking` | `@modelcontextprotocol/server-sequential-thinking` | Dynamic chain-of-thought reasoning             | stdio     |
| `aws-kb-retrieval`    | `@modelcontextprotocol/server-aws-kb-retrieval`    | AWS Knowledge Base retrieval via Bedrock       | stdio     |

---

## Community MCP Servers (Curated)

### Developer Tools

| Server     | Source                    | Capability                                   |
| ---------- | ------------------------- | -------------------------------------------- |
| `exa`      | `exa-labs/exa-mcp-server` | AI-powered web search (semantic)             |
| `linear`   | `linear-mcp-server`       | Linear issue tracking and project management |
| `jira`     | community                 | Jira issue read/write, sprint management     |
| `notion`   | community                 | Notion pages, databases, search              |
| `obsidian` | community                 | Obsidian vault read/write                    |
| `sentry`   | community                 | Sentry error tracking, issues, events        |
| `datadog`  | community                 | Datadog metrics, logs, monitors              |
| `figma`    | community                 | Figma design file access, component export   |

### Data & Analytics

| Server          | Source    | Capability                             |
| --------------- | --------- | -------------------------------------- |
| `bigquery`      | community | Google BigQuery read queries           |
| `mongodb`       | community | MongoDB document CRUD and aggregation  |
| `redis`         | community | Redis key operations, pub/sub          |
| `elasticsearch` | community | Elasticsearch search, index management |
| `snowflake`     | community | Snowflake SQL queries                  |

### Cloud & Infrastructure

| Server       | Source                              | Capability                                |
| ------------ | ----------------------------------- | ----------------------------------------- |
| `aws`        | community                           | AWS resource management (EC2, S3, Lambda) |
| `gcp`        | community                           | Google Cloud resource management          |
| `cloudflare` | `@cloudflare/mcp-server-cloudflare` | Workers, KV, R2, D1 management            |
| `vercel`     | community                           | Vercel deployments, projects, domains     |
| `kubernetes` | community                           | Kubernetes cluster management             |

### Communication

| Server     | Source    | Capability                              |
| ---------- | --------- | --------------------------------------- |
| `discord`  | community | Discord server management and messaging |
| `telegram` | community | Telegram bot messaging                  |
| `twilio`   | community | SMS, voice, WhatsApp via Twilio         |
| `sendgrid` | community | Email sending via SendGrid              |

---

## Claude Code Settings Configuration

### stdio Transport (Most Common)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### SSE Transport (HTTP-based)

```json
{
  "mcpServers": {
    "remote-server": {
      "type": "sse",
      "url": "https://your-mcp-server.example.com/sse",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

### Environment Variable Injection Pattern

Never hardcode credentials in settings.json. Use environment variable references:

```json
{
  "env": {
    "API_KEY": "${MY_SERVICE_API_KEY}"
  }
}
```

Variables are resolved from the shell environment where Claude Code runs.

---

## Agent Studio MCP Integration

Agent Studio skills that wrap MCP servers:

| Skill                  | Underlying MCP                        | Agent Studio Path                      |
| ---------------------- | ------------------------------------- | -------------------------------------- |
| `github-ops`           | `@modelcontextprotocol/server-github` | `.claude/skills/github-ops/`           |
| `github-mcp`           | `@modelcontextprotocol/server-github` | `.claude/skills/github-mcp/`           |
| `figma`                | Figma MCP server                      | `.claude/skills/figma/`                |
| `google-workspace`     | Google Drive + Sheets MCP             | `.claude/skills/google-workspace/`     |
| `slack-notifications`  | Slack MCP                             | `.claude/skills/slack-notifications/`  |
| `linear-pm`            | Linear MCP                            | `.claude/skills/linear-pm/`            |
| `jira-pm`              | Jira MCP                              | `.claude/skills/jira-pm/`              |
| `arxiv-mcp`            | ArXiv search                          | `.claude/skills/arxiv-mcp/`            |
| `webmcp-browser-tools` | Browser tools MCP                     | `.claude/skills/webmcp-browser-tools/` |

---

## Adding a New MCP Server

### Step 1: Identify the Server

```bash
# Search npm registry
npm search "@modelcontextprotocol/server-"

# Browse community list
# https://github.com/modelcontextprotocol/servers
```

### Step 2: Configure in settings.json

Edit `.claude/settings.json` to add the mcpServers entry (see templates above).

### Step 3: Test the Connection

```bash
# Verify Claude Code loads the MCP server
claude --mcp-debug
```

### Step 4: Create an Agent Studio Skill (Optional)

If the MCP server is used frequently, wrap it in an Agent Studio skill:

```bash
# Use the skill-creator skill
Skill({ skill: 'skill-creator' })
```

The skill should:

- Document the MCP server's tools and resources
- Provide usage examples
- Define when to invoke
- List required environment variables

---

## Security Considerations

### Credential Management

- Store all secrets in `.env` (never in `settings.json` directly)
- Use `${ENV_VAR}` interpolation in settings.json
- Rotate tokens regularly; use minimal-scope PATs

### File System Access

- Restrict `filesystem` server to specific directories only
- Never grant root (`/`) or home (`~`) access
- Use read-only mode when write access is not needed

### Network MCP Servers

- Validate SSL certificates on SSE connections
- Use bearer token auth for remote MCP servers
- Audit tool calls from remote servers — treat as untrusted input

### Least Privilege

- Only register MCP servers that the agent actually needs
- Remove unused MCP server registrations
- Prefer local stdio over remote SSE when possible

---

## MCP Protocol Reference

### Tool vs Resource vs Prompt

| Concept      | Purpose                                | Agent Interaction                            |
| ------------ | -------------------------------------- | -------------------------------------------- |
| **Tool**     | Execute actions (write file, call API) | Agent calls `mcp__serverName__toolName()`    |
| **Resource** | Read data (file contents, DB records)  | Agent reads `mcp://serverName/resource/path` |
| **Prompt**   | Reusable prompt templates              | Agent requests prompt template by name       |

### Naming Convention in Claude Code

MCP tools appear as: `mcp__<serverName>__<toolName>`

Example: `mcp__github__create_issue`, `mcp__filesystem__read_file`

---

## Discovery

To list all available MCP tools in a session:

```javascript
// Agents can discover available MCP tools via AvailableAgents() or tool search
Skill({ skill: 'tool-search' });
```

## Related Skills

- `mcp-builder` — Build a new MCP server from scratch
- `github-ops` — GitHub workflow using MCP
- `github-mcp` — Direct GitHub MCP operations
- `figma` — Figma design access via MCP
- `webmcp-browser-tools` — Browser automation MCP
