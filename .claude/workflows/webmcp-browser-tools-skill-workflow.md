<!-- Agent: skill-creator | Task: webmcp-browser-tools | Session: 2026-02-22 -->

# WebMCP Browser Tools — Skill Workflow

## Purpose

This workflow guides agents through using the `webmcp-browser-tools` skill to design, integrate, or evaluate WebMCP tool registration in a web application.

## When to Use

- A web app developer wants their UI to expose functionality to AI agents
- Evaluating whether to use WebMCP vs. a backend MCP server for an integration
- Planning a human-in-the-loop agent workflow where the agent and user share a browser tab
- Checking current browser support status and polyfill options

## Prerequisites

- A web application (or description of one) in a supported framework
- Understanding that WebMCP flows **web app → exposes tools → AI agent calls them** (not web scraping)

## Workflow Steps

### Phase 1: Evaluate Fit

1. Confirm the use case is exposing **web app functionality** to agents (not scraping external sites)
2. Check if the app already has a backend MCP server — if so, assess whether browser-side is additive or redundant
3. Identify which UI actions are valuable for agents to call (search, filter, add, submit, query)

### Phase 2: Design Tools

1. List the candidate actions to expose as tools
2. For each tool, define:
   - **Name**: kebab-case, verb-noun (e.g., `filter-products`, `submit-order`)
   - **Description**: Plain English — what does it do, when should an agent call it?
   - **Input schema**: JSON Schema for all parameters
   - **State dependencies**: What page state does the handler need access to?
3. Review against WebMCP tool design principles (single responsibility, schema-first, exploit state access)

### Phase 3: Implement

1. Choose integration approach:
   - **Vanilla JS**: `window.navigator.modelContext.provideContext({ tools: [...] })`
   - **React**: `@mcp-b/react-webmcp` → `useTool()` hook
   - **Polyfill today**: `@mcp-b/webmcp-polyfill` for cross-browser support
2. Use `.claude/skills/webmcp-browser-tools/templates/implementation-template.md`
3. Add feature detection: `if ('modelContext' in window.navigator) { ... }`
4. Register at app initialization

### Phase 4: Test

1. Enable `Experimental Web Platform Features` in Chrome 146 Canary
2. Verify tools appear when an AI agent connects to the page
3. Test each tool invocation with valid and invalid inputs
4. Verify fallback behavior when WebMCP is not available

### Phase 5: Document

1. Document registered tools in the app's README or developer docs
2. Note the polyfill dependency if used
3. Add a note for future removal of polyfill when Chrome stable ships

## Decision Matrix

| Scenario                                   | Use WebMCP? | Alternative               |
| ------------------------------------------ | ----------- | ------------------------- |
| App exposes search/filter to agents        | YES         | Backend MCP if stateless  |
| App needs agent to read external news      | NO          | `WebFetch` / Exa          |
| Agent needs to click through forms         | NO          | `mcp__chrome-devtools__*` |
| App wants human-in-the-loop agent workflow | YES         | —                         |
| Backend data queries (no UI state needed)  | NO          | Backend MCP server        |

## Output

- Generated tool definitions (JS/TS)
- Framework-specific integration code
- `implementation-template.md` populated for the app
- Browser support notes and polyfill setup

## Related

- `.claude/skills/webmcp-browser-tools/SKILL.md` — Skill definition and full context
- `.claude/skills/webmcp-browser-tools/templates/implementation-template.md` — Code templates
- `.claude/rules/webmcp-browser-tools.md` — Rules for this skill
