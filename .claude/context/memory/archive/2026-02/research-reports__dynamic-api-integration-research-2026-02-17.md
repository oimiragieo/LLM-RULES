<!-- Agent: researcher | Task: #1 | Session: 2026-02-17 -->

# Dynamic API Integration — Research Report

> **Date:** 2026-02-17
> **Purpose:** Research synthesis for creating the `dynamic-api-integration` skill
> **Sources:** 8 external, 1 codebase (UTCP Agent)

---

## 1. Problem Statement

AI agents frequently need to interact with external HTTP APIs at runtime — discovering endpoints, constructing requests, handling authentication, and chaining calls. Currently there is no standardized skill in agent-studio for teaching agents how to dynamically discover and call arbitrary APIs using OpenAPI specs, tool templates, or raw HTTP endpoints.

## 2. Source Material

### 2.1 UTCP Agent (Primary Source)

The Universal Tool Calling Protocol (UTCP) agent (`utcp-agent-main/`) is a Python/LangGraph implementation demonstrating:

- **Dynamic API Discovery:** Parses OpenAPI/Swagger specs at runtime to find available endpoints.
- **Semantic Tool Search:** Maps natural language tasks to matching tools via `utcp_client.search_tools(task, limit=N)`.
- **Multi-Protocol Tool Bridging:** Single config handles HTTP (`call_template_type: "http"`), MCP (`"mcp"`), and text-based (`"text"`) tools.
- **Manual Tool Templates:** JSON format defining tools with name, description, inputs (JSON Schema), outputs, and call_template (url, method, auth).
- **Iterative Tool Chaining:** Execute tool, re-analyze task, execute again (configurable `max_iterations` guard, default 3).
- **Context Summarization:** Auto-summarize conversation when token estimate exceeds threshold (80K default), preserving system messages + last 2 messages.
- **5-Node State Machine:** `analyze_task` -> `search_tools` -> `decide_action` -> `execute_tools` -> `respond`.

**Key Code Patterns Extracted:**

```python
# Tool template JSON format (from newsapi_manual.json)
{
  "name": "everything_get",
  "description": "Search articles from 150K+ news sources",
  "inputs": { "type": "object", "properties": { ... }, "required": ["q"] },
  "outputs": { "type": "object", "properties": { ... } },
  "tool_call_template": {
    "call_template_type": "http",
    "url": "https://newsapi.org/v2/everything",
    "http_method": "GET",
    "content_type": "application/json",
    "auth": { "auth_type": "api_key", "api_key": "$NEWS_API_KEY", "var_name": "X-Api-Key" }
  }
}
```

```python
# UTCP config with OpenAPI auto-discovery
utcp_config = {
  "manual_call_templates": [{
    "name": "openlibrary",
    "call_template_type": "http",
    "http_method": "GET",
    "url": "https://openlibrary.org/static/openapi.json",
    "content_type": "application/json"
  }]
}
```

### 2.2 UTCP Specification (utcp.io)

UTCP is an open standard (MPL-2.0) that enables AI agents to discover and directly call tools across protocols, eliminating wrapper servers. Key principles:

- **No Wrapper Tax:** Call tools directly via native protocols (HTTP, WebSocket, CLI).
- **No Security Tax:** Same security guarantees as human-initiated calls.
- **OpenAPI Ingestion:** Automatically converts OpenAPI 2.0/3.0 specs into UTCP tools.
- **Manual Providers:** JSON files defining tool name, description, inputs (JSON Schema), outputs, and call_template.

Sources: [UTCP Introduction](https://www.utcp.io/), [UTCP Specification](https://github.com/universal-tool-calling-protocol/utcp-specification)

### 2.3 OpenAPI Parsing Best Practices

- **OpenAPI 3.1** is recommended for all projects (2025+), with full JSON Schema compatibility.
- **82% of organizations** follow API-first approach (Postman 2025 State of the API Report).
- **Key Node.js parsers:** `@readme/openapi-parser`, `swagger-parser`, `@scalar/openapi-parser`.
- **What to extract:** paths (endpoints), operations (HTTP methods), parameters (query/path/header/body), security schemes, response schemas.

Sources: [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html), [Swagger Parser](https://github.com/APIDevTools/swagger-parser)

### 2.4 AI Agent API Integration Patterns (2025-2026)

Five patterns identified (Composio, 2026):

1. **Model-Native Tool Calling:** Tools defined with structured schemas; LLM outputs structured JSON specifying which tool to call.
2. **MCP (Model Context Protocol):** Wrapper servers expose APIs as MCP tools (higher latency but standardized).
3. **UTCP Direct Calling:** Agent discovers and calls tools directly via native protocols.
4. **agents.json Specification:** Open spec for API-agent contracts built on OpenAPI.
5. **Dynamic Discovery at Runtime:** Agent fetches OpenAPI spec, extracts endpoints, and constructs calls.

Sources: [API Integration Patterns Guide](https://composio.dev/blog/apis-ai-agents-integration-patterns), [Tool Calling Guide](https://composio.dev/blog/ai-agent-tool-calling-guide)

### 2.5 agents.json Specification

An open specification that formally describes contracts for API and agent interactions, built on top of OpenAPI. API providers use their existing OpenAPI spec to construct this file and agents inspect it to run accurate series of API calls.

Source: [agents.json](https://github.com/wild-card-ai/agents-json)

## 3. Key Design Decisions

| Decision             | Chosen Approach                           | Rationale                                       |
| -------------------- | ----------------------------------------- | ----------------------------------------------- |
| Target runtime       | Node.js / Claude Code tools               | Framework is JS-based; agents use Bash/WebFetch |
| Spec parsing         | WebFetch + JSON.parse (no npm dependency) | Agents cannot install npm packages at runtime   |
| Auth handling        | Template-based (API key, Bearer, Basic)   | Covers 90%+ of public APIs                      |
| Iteration guard      | max_iterations = 5 (configurable)         | Prevents infinite loops; UTCP default is 3      |
| Tool template format | JSON (UTCP-inspired, simplified)          | Portable, human-readable, schema-validated      |
| Context management   | Truncate large responses                  | Agents have 200K context but degrade past 32K   |

## 4. Patterns for Node.js Translation

### 4.1 OpenAPI Spec Fetching (UTCP -> Node.js)

```javascript
// UTCP Python: utcp_client reads spec from URL
// Node.js equivalent using WebFetch tool:
const specContent = WebFetch({
  url: 'https://api.example.com/openapi.json',
  prompt:
    'Extract all API endpoints with their HTTP methods, paths, parameters, and descriptions. Return as structured JSON.',
});
```

### 4.2 HTTP Request Construction (UTCP -> Node.js)

```javascript
// UTCP Python: utcp_client.call_tool(tool_name, arguments)
// Node.js equivalent using Bash + curl:
Bash({
  command: `curl -s -X GET "https://api.example.com/v2/search?q=test" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json"`,
});
```

### 4.3 Tool Template Format (UTCP -> Simplified)

```json
{
  "name": "search_articles",
  "description": "Search news articles by keyword",
  "base_url": "https://newsapi.org/v2/everything",
  "method": "GET",
  "auth": { "type": "api_key", "header": "X-Api-Key", "env_var": "NEWS_API_KEY" },
  "parameters": {
    "q": { "type": "string", "required": true, "in": "query", "description": "Search keywords" },
    "language": {
      "type": "string",
      "required": false,
      "in": "query",
      "description": "ISO 639-1 language code"
    }
  },
  "response_schema": { "type": "object", "properties": { "articles": { "type": "array" } } }
}
```

## 5. Risk Assessment

| Risk                       | Severity | Mitigation                               |
| -------------------------- | -------- | ---------------------------------------- |
| API keys exposed in logs   | HIGH     | Use env vars ($VAR), never hardcode      |
| Infinite API call loops    | MEDIUM   | max_iterations guard (default 5)         |
| Large response overflow    | MEDIUM   | Truncate/summarize responses > 10KB      |
| Rate limiting / 429 errors | MEDIUM   | Exponential backoff, respect Retry-After |
| Malformed OpenAPI specs    | LOW      | Validate spec structure before parsing   |
| Auth token expiry (OAuth)  | LOW      | Document refresh pattern, detect 401     |

## 6. Recommendations

1. Create skill focused on **practical Node.js patterns** (Bash curl, WebFetch, JSON parsing).
2. Include **tool template JSON format** inspired by UTCP but simplified for Claude Code agents.
3. Include **iterative chaining workflow** with explicit max_iterations safety.
4. Include **real-world examples** (GitHub API, OpenLibrary, JSONPlaceholder).
5. Include **auth patterns** for API Key, Bearer Token, and Basic Auth.
6. Include **context management** guidance for large API responses.
7. Assign to `developer`, `researcher`, and `nodejs-pro` agents.

---

## Sources

- [UTCP Introduction](https://www.utcp.io/)
- [UTCP Specification](https://github.com/universal-tool-calling-protocol/utcp-specification)
- [UTCP Agent Codebase](https://github.com/universal-tool-calling-protocol/utcp-agent)
- [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html)
- [API Integration Patterns Guide](https://composio.dev/blog/apis-ai-agents-integration-patterns)
- [Tool Calling Guide](https://composio.dev/blog/ai-agent-tool-calling-guide)
- [agents.json Specification](https://github.com/wild-card-ai/agents-json)
- [Swagger Parser](https://github.com/APIDevTools/swagger-parser)
