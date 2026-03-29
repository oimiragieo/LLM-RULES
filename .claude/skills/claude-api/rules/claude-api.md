# claude-api Rules

## Purpose

Build apps with the Claude API or Anthropic SDK for single LLM calls, multi-step pipelines, tool use, and autonomous agents.

## Defaults

- **Model**: `claude-opus-4-6` (unless user specifies otherwise)
- **Thinking**: `thinking: {type: "adaptive"}` for complex tasks (never `budget_tokens` — deprecated)
- **Streaming**: Default for large inputs, large outputs, or high `max_tokens`
- **Streaming completion**: Use `.get_final_message()` (Python) / `.finalMessage()` (TypeScript)

## Best Practices

- Use claude-opus-4-6 as default model unless user specifies otherwise
- Use thinking with type adaptive not budget_tokens (deprecated)
- Use streaming for requests with long input, output, or high max_tokens
- Use get_final_message or finalMessage helper for complete streamed responses
- Use parse tool inputs with proper JSON methods not string operations
- Never truncate user inputs — discuss options instead
- Always use ANTHROPIC_API_KEY environment variable, never hardcode

## Common Pitfalls

| Pitfall                            | Fix                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| Using `budget_tokens` in thinking  | Use `thinking: {type: "adaptive"}` instead                |
| Truncating long inputs             | Discuss chunking or summarization options with user       |
| Using `output_format`              | Use `output_config: {format: {...}}` instead              |
| Not streaming large responses      | Add streaming for `max_tokens > 4096`                     |
| String manipulation on tool inputs | Use `json.loads(block.input)` / `JSON.parse(block.input)` |
| Hardcoding API key                 | Use `ANTHROPIC_API_KEY` env var always                    |

## Related Skills

- `mcp-builder` — Build MCP servers using the SDK
- `typescript-expert` — TypeScript type system and async patterns
- `python-backend-expert` — Python async, error handling
- `tdd` — Test-driven development for API integrations
