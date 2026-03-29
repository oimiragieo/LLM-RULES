# Claude API Research Requirements (2026)

## Verified Tech Stack

- **Python SDK**: `anthropic` package
- **TypeScript SDK**: `@anthropic-ai/sdk` package
- **Go SDK**: `github.com/anthropics/anthropic-sdk-go`
- **Java SDK**: `com.anthropic:anthropic-java`

## Current Models

| Model             | ID                  | Context        | Input $/1M | Output $/1M |
| ----------------- | ------------------- | -------------- | ---------- | ----------- |
| Claude Opus 4.6   | `claude-opus-4-6`   | 200K (1M beta) | $5.00      | $25.00      |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 200K (1M beta) | $3.00      | $15.00      |
| Claude Haiku 4.5  | `claude-haiku-4-5`  | 200K           | $1.00      | $5.00       |

## Core Patterns

### Python Single Call

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content[0].text)
```

### Python Streaming

```python
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[{"role": "user", "content": prompt}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

final = stream.get_final_message()
```

### TypeScript Single Call

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.content[0].text);
```

### Tool Use Pattern

```python
tools = [{
    "name": "get_weather",
    "description": "Get weather for a location",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {"type": "string"}
        },
        "required": ["location"]
    }
}]

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    tools=tools,
    messages=messages
)
```

## Agent SDK

```python
# Built-in tools (web search, code execution)
response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=[{"type": "web_search_20250305", "name": "web_search"}],
    messages=[{"role": "user", "content": "Research MCP"}],
    betas=["interleaved-thinking-2025-05-14"]
)
```

## Source References

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
