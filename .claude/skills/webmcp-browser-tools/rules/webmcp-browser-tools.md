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

Always gate WebMCP usage behind a feature check. The API is not available in all browsers:

```javascript
if ('modelContext' in window.navigator) {
  window.navigator.modelContext.provideContext({ tools: [...] });
} else {
  // Fallback: standard MCP server or no agent integration
}
```

### Polyfill for Today's Work

Use `@mcp-b/webmcp-polyfill` or `@mcp-b/react-webmcp` for development and early testing.
Do NOT rely on native browser API in production until Chrome stable ships the API (~mid-2026).

### Tool Design Principles

1. **Exploit state access** — WebMCP's advantage is live DOM/session access. Tools should leverage current page state, not replicate what a backend MCP server can already do.
2. **Schema first** — Define JSON Schema for all tool inputs before writing the handler.
3. **Idempotent where possible** — Agents may call tools repeatedly; side effects should be intentional and documented.
4. **Single responsibility** — One tool, one action. Avoid multi-purpose tools.

## When to Use

- Designing a web app that should expose UI actions to AI agents
- Integrating an existing React/Vue/Svelte app with Claude via browser-side tools
- Planning human-in-the-loop agent workflows where agent and user share a browser interface
- Evaluating WebMCP vs. backend MCP server for a product feature

## When NOT to Use

- Fetching/reading content from external websites → use `WebFetch` or Exa
- Browser automation (clicking, navigating) → use `mcp__chrome-devtools__*`
- The target web app does not support WebMCP → build a standard backend MCP server

## Anti-Patterns

- Registering tools that fetch external URLs from the browser (defeats the purpose; use backend MCP)
- Building production systems on the native browser API before it ships in Chrome stable
- Confusing WebMCP (W3C Community Group proposal) with Anthropic's MCP (separate standard)

## Related Skills

- `webmcp-browser-tools` — this skill
- `mcp__chrome-devtools__*` — browser automation (different direction)
- `ripgrep` — code search (unrelated, but useful for integrating into codebases)
