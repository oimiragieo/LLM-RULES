# WebMCP Browser Tools — Research Requirements

<!-- Agent: developer | Task: #29 | Session: 2026-02-22 -->

## Research Summary

**Date**: 2026-02-22
**Query intent**: WebMCP W3C proposal, browser-side MCP tools, agent-to-browser integration

## Prior Art (VoltAgent/awesome-agent-skills)

Searched VoltAgent/awesome-agent-skills for 'webmcp', 'browser-mcp', 'web-agent-tools' — no matching skill found.

## Primary Sources

1. **W3C WebMCP Repository**: https://github.com/webmachinelearning/webmcp
   - Hosted by W3C Web Machine Learning Working Group
   - Proposal status: Draft
   - No browser implementation exists as of 2026-02-22

2. **W3C Web Machine Learning Working Group**: https://www.w3.org/groups/wg/webmachinelearning/
   - Oversees Web Neural Network API (WebNN), WebMCP, and related proposals

3. **Distinction from Anthropic MCP**: https://modelcontextprotocol.io/
   - Anthropic's MCP (Model Context Protocol) is a SEPARATE standard
   - WebMCP is a W3C proposal for browser-native tool exposure
   - Different organization, different scope, potentially complementary

## Design Constraints (Actionable)

1. **No production deployment until browser support ships** — any code using `navigator.mcp` will throw at runtime in all current browsers. Always gate behind feature detection: `if (navigator.mcp) { ... }`.

2. **Schema-first design** — WebMCP tools define JSON Schema for inputs. This mirrors Anthropic MCP tool definitions. Future implementations should design schemas now even if execution is mocked.

3. **State sharing is the key differentiator** — WebMCP's primary advantage is access to live DOM state, authentication context, and user session. Tool designs should exploit this rather than duplicating what server-side MCP can already do.

## Non-Goals

- Do NOT implement a WebMCP polyfill — proposal is too early and likely to change
- Do NOT create browser extension workarounds — wait for native API
- Do NOT conflate with Playwright-based browser automation (separate capability)

## Status Monitoring

- GitHub: https://github.com/webmachinelearning/webmcp
- W3C TAG Design Review (when filed)
- Chrome Platform Status: search 'webmcp'
- MDN Web Docs (when proposal advances)
