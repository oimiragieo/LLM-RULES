---
paths:
  - .claude/skills/webmcp-browser-tools/**
---

# WebMCP Browser Tools Rules

## Core Rules

### Direction of Data Flow (CRITICAL)

WebMCP flows **web app → exposes tools → AI agent calls them**.

This is NOT:

- Web scraping (`WebFetch` is for that)
- External page fetching (`mcp__Exa__web_search_exa` is for that)
- Browser automation (Playwright / `mcp__chrome-devtools__*` is for that)

### Feature Detection (MANDATORY)

Always gate WebMCP usage behind a feature check:

```javascript
if ('modelContext' in window.navigator) {
  window.navigator.modelContext.provideContext({ tools: [...] });
}
```

### Polyfill for Today's Work

Use `@mcp-b/webmcp-polyfill` or `@mcp-b/react-webmcp` for development and early testing.
Do NOT rely on native browser API in production until Chrome stable ships (~mid-2026).

### Tool Design Principles

1. **Exploit state access** — tools should leverage current page state, not replicate what backend MCP already does
2. **Schema first** — define JSON Schema for all tool inputs before writing the handler
3. **Single responsibility** — one tool, one action

## When to Use

- Designing a web app that should expose UI actions to AI agents
- Integrating an existing React/Vue/Svelte app with Claude via browser-side tools
- Planning human-in-the-loop workflows where agent and user share a browser interface
- Evaluating WebMCP vs. backend MCP server for a feature

## When NOT to Use

- Fetching content from external websites → `WebFetch` or Exa
- Browser automation → `mcp__chrome-devtools__*`
- Target app doesn't support WebMCP → build a standard backend MCP server

## Anti-Patterns

- Registering tools that fetch external URLs from the browser
- Building production systems on native browser API before Chrome stable ships
- Confusing WebMCP (W3C Community Group) with Anthropic's MCP (different standard)

## Related Skills

- `mcp__chrome-devtools__*` — browser automation (different direction)
- `webmcp-browser-tools` — this skill's SKILL.md
