---
name: webmcp-browser-tools
description: "WebMCP (W3C Web Machine Learning Working Group proposal) — browser-side standard for web apps to expose functionality as MCP tools to AI agents. Draft status only; no production browser support yet."
version: 1.0.0
model: sonnet
invoked_by: agent
user_invocable: false
tools:
  - Read
  - WebFetch
  - WebSearch
agents:
  - frontend-pro
  - developer
  - researcher
category: "Web Development"
tags:
  - webmcp
  - browser
  - mcp
  - w3c
  - ai-agents
  - future-web
  - web-development
---

# WebMCP Browser Tools

WebMCP is a W3C Web Machine Learning Working Group proposal enabling web applications to expose their functionality as tools to AI agents via client-side JavaScript. Unlike standard MCP servers (separate processes), WebMCP runs in the browser alongside the UI.

## Status (as of 2026-02-22)

- **W3C Proposal**: Draft status only — https://github.com/webmachinelearning/webmcp
- **Production support**: None — no browser has shipped this API
- **Installable package**: None — implement the pattern manually if needed today

## When to Use This Skill

- Planning future browser-side agent integration
- Understanding how web apps can expose MCP tools client-side
- Designing agent-to-browser-app integration patterns
- Monitoring W3C implementation milestones

## WebMCP Concept

```javascript
// Web app registers tools for AI agents to call
navigator.mcp.registerTool({
  name: 'filterProducts',
  description: 'Filter products by natural language query',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language filter' }
    }
  },
  handler: async ({ query }) => {
    return await productService.filter(query);
  }
});
```

## Key Differences from Standard MCP

| Aspect | Standard MCP | WebMCP |
|--------|-------------|--------|
| Location | Separate server process | Browser client-side JS |
| Context | Isolated from UI | Shares user interface state |
| Status | Production-ready | W3C proposal (draft) |
| Installation | npm package | Browser API (future) |

## Use Cases (Future)

- **Design tool integration**: Figma/Canva exposing drawing tools to agents
- **E-commerce agents**: Product search/filter via WebMCP browser tools
- **IDE browser tools**: Browser-based IDEs exposing code actions
- **Dashboard agents**: Analytics dashboards exposing query tools

## agent-studio Integration Path

When WebMCP ships in browsers:
1. Update `chrome-browser` skill to include WebMCP tool discovery
2. Add WebMCP tool enumeration to browser automation workflow
3. Create bridge skill: `Skill({ skill: 'webmcp-browser-tools' })` → enumerate page tools → call them via Claude tool use

## Monitoring

Watch: https://github.com/webmachinelearning/webmcp for:
- W3C Working Draft publication
- Browser implementation flags (Chrome/Firefox intent-to-implement)
- npm package releases

## Anti-Patterns

- Do NOT attempt to use WebMCP in production — no browser supports it yet
- Do NOT confuse with Anthropic's MCP (Model Context Protocol) — different standard, different org
- Do NOT build production systems depending on this API until browser support ships

## Assigned Agents

| Agent | Role |
|-------|------|
| `frontend-pro` | Primary — browser-side tool design and planning |
| `developer` | Supporting — integration architecture |
| `researcher` | Supporting — W3C proposal monitoring |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New WebMCP pattern or status update -> `.claude/context/memory/learnings.md`
- Issue with browser API proposal -> `.claude/context/memory/issues.md`
- Architecture decision for agent-browser integration -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
