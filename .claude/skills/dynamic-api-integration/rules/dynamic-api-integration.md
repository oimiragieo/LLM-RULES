# dynamic-api-integration Rules

## Purpose

Discover, parse, and call external HTTP APIs at runtime using OpenAPI specs, tool templates, and iterative chaining. Adapted from UTCP (Universal Tool Calling Protocol) patterns for Node.js and Claude Code agents.

## Best Practices

- Always fetch and validate the OpenAPI spec before constructing requests
- Use environment variables for all API keys and secrets; never hardcode
- Apply max_iterations guard to prevent infinite API call loops
- Truncate or summarize large API responses to stay within context budget
- Match user intent to API endpoints semantically before calling
- Handle errors explicitly with retry logic for transient failures

## Integration Points

See SKILL.md for complete documentation.
