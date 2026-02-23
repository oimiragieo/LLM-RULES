# WebMCP Browser Tools — Research Requirements

<!-- Agent: skill-creator | Task: webmcp-browser-tools | Session: 2026-02-22 -->

## Research Summary

**Date**: 2026-02-22 (updated)
**Query intent**: WebMCP W3C proposal, browser-side MCP tools, Chrome Canary status, available npm packages

## Prior Art (VoltAgent/awesome-agent-skills)

Searched VoltAgent/awesome-agent-skills for 'webmcp', 'browser-mcp', 'web-agent-tools' — no matching skill found.

## Primary Sources

1. **W3C WebMCP Repository**: https://github.com/webmachinelearning/webmcp
   - W3C Community Group Draft published 2026-02-12
   - Editors: Brandon Walderman (Microsoft), Khushal Sagar (Google), Dominic Farolino (Google)
   - 1.6k stars, 60 open issues, active development
   - NOT on the W3C Standards Track — Community Group proposal

2. **Chrome 146 Canary (February 2026)**
   - Early preview shipped in Chrome 146 Canary
   - Flag: `Experimental Web Platform Features`
   - API: `window.navigator.modelContext.provideContext({ tools: [...] })`
   - Stable rollout expected mid–late 2026

3. **@mcp-b npm ecosystem** (working packages today):
   - `@mcp-b/react-webmcp` v1.1.1 — React hooks for WebMCP tool registration
   - `@mcp-b/webmcp-polyfill` — Strict WebMCP polyfill for any framework
   - `@mcp-b/webmcp-types` — TypeScript type definitions
   - `@mcp-b/transports` — Browser transport layer
   - `@mcp-b/webmcp-ts-sdk` — Adapts official MCP TS SDK for browsers
   - `@mcp-b/create-webmcp-app` — Scaffolding tool

4. **Distinction from Anthropic MCP**: https://modelcontextprotocol.io/
   - Anthropic's MCP is a separate standard (different organization)
   - WebMCP is the W3C browser-native extension — same underlying protocol, different surface
   - They are complementary, not competing

## Design Constraints (Actionable)

1. **Direction of data flow** — WebMCP exposes web app functionality TO agents. It is NOT for reading/scraping external sites. All skill guidance must make this distinction explicit. Use `WebFetch` for external fetching.

2. **Feature detection required** — The API is not universally available. Always gate behind `if ('modelContext' in window.navigator)`. The polyfill (`@mcp-b/webmcp-polyfill`) enables this pattern cross-browser today.

3. **State sharing is the key differentiator** — WebMCP's primary advantage over a backend MCP server is access to live DOM state, user authentication context, and active session data. Tool designs should exploit this rather than replicating what a backend MCP server already provides.

## Non-Goals

- Do NOT implement a WebMCP polyfill from scratch — `@mcp-b/webmcp-polyfill` already exists
- Do NOT create browser extension workarounds — use the polyfill instead
- Do NOT conflate with Playwright-based browser automation (that's `mcp__chrome-devtools__*`)
- Do NOT guide users to use WebMCP for scraping/fetching external sites

## Status Monitoring

- GitHub: https://github.com/webmachinelearning/webmcp
- Chrome Platform Status: search 'webmcp' or 'modelContext'
- npm: `@mcp-b/react-webmcp` (watch for version updates)
- MDN Web Docs (when proposal advances to Working Draft)
