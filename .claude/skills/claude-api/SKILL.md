---
# Agent: developer | Task: #5 | Session: 2026-03-05
verified: true
lastVerifiedAt: 2026-03-15T00:00:00.000Z
name: claude-api
description: 'Build apps with the Claude API or Anthropic SDK. TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`/`claude_agent_sdk`, or user asks to use Claude API, Anthropic SDKs, or Agent SDK. DO NOT TRIGGER when: code imports `openai`/other AI SDK, general programming, or ML/data-science tasks.'
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, WebFetch]
agents: [developer, typescript-pro, python-backend-expert]
category: development
tags: [claude, anthropic, api, sdk, llm, agents, typescript, python]
aliases: [anthropic-api, anthropic-sdk]
best_practices:
  - Use claude-opus-4-6 as default model unless user specifies otherwise
  - Use thinking with type adaptive not budget_tokens (deprecated)
  - Use streaming for requests with long input, output, or high max_tokens
  - Use get_final_message or finalMessage helper for complete streamed responses
  - Use parse tool inputs with proper JSON methods not string operations
  - Never truncate user inputs — discuss options instead
error_handling: strict
streaming: supported
---

# Claude API & Agent SDK

## Defaults

- **Model**: `claude-opus-4-6` (unless user specifies otherwise)
- **Thinking**: `thinking: {type: "adaptive"}` for complex tasks (never `budget_tokens` — deprecated)
- **Streaming**: Default for large inputs, large outputs, or high `max_tokens`
- **Streaming completion**: Use `.get_final_message()` (Python) / `.finalMessage()` (TypeScript)

## Language Detection

Infer language from project files. Support: Python, TypeScript/JavaScript, Java/Kotlin/Scala, Go, Ruby, C#, PHP, cURL. If multiple languages detected, clarify which is relevant.

## Which Surface to Use

| Use Case                                            | Surface                              |
| --------------------------------------------------- | ------------------------------------ |
| Single LLM call (classify, summarize, extract, Q&A) | Claude API direct                    |
| Multi-step pipelines with tool use                  | Claude API + tool use                |
| Open-ended autonomous agents                        | Claude API agentic loop or Agent SDK |
| Built-in tools (files, web, terminal)               | Agent SDK                            |

## Current Models

| Model             | ID                  | Context        | Input $/1M | Output $/1M |
| ----------------- | ------------------- | -------------- | ---------- | ----------- |
| Claude Opus 4.6   | `claude-opus-4-6`   | 200K (1M beta) | $5.00      | $25.00      |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 200K (1M beta) | $3.00      | $15.00      |
| Claude Haiku 4.5  | `claude-haiku-4-5`  | 200K           | $1.00      | $5.00       |

**Default to `claude-opus-4-6`** unless the user explicitly requests another model.

## Thinking & Effort

```python
# Python — adaptive thinking
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=16000,
    thinking={"type": "adaptive"},
    messages=[{"role": "user", "content": "Explain quantum entanglement"}]
)

# Python — effort parameter
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=16000,
    output_config={"effort": "high"},  # low | medium | high | max
    messages=[...]
)
```

```typescript
// TypeScript — adaptive thinking
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  messages: [{ role: 'user', content: 'Explain quantum entanglement' }],
});
```

## Single API Call (Most Common)

### Python

```python
import anthropic

client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, Claude!"}]
)
print(response.content[0].text)
```

### TypeScript

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // Uses ANTHROPIC_API_KEY env var

const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
});
console.log(response.content[0].text);
```

## Streaming

Use streaming when `max_tokens` is large or inputs are long:

### Python

```python
with client.messages.stream(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[{"role": "user", "content": prompt}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

# For complete response with metadata:
final = stream.get_final_message()
```

### TypeScript

```typescript
const stream = await client.messages.stream({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    process.stdout.write(chunk.delta.text);
  }
}

const final = await stream.finalMessage();
```

## Tool Use

### Define Tools

```python
tools = [
    {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and state, e.g. 'San Francisco, CA'"
                }
            },
            "required": ["location"]
        }
    }
]
```

### Agentic Loop (Python)

```python
import json

messages = [{"role": "user", "content": "What's the weather in SF?"}]

while True:
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        tools=tools,
        messages=messages
    )

    if response.stop_reason == "end_turn":
        print(response.content[0].text)
        break

    if response.stop_reason == "tool_use":
        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = call_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result)
                })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

## Agent SDK

For agents that need built-in tools (web search, code execution, file operations):

### Python

```python
import anthropic

client = anthropic.Anthropic()

# Basic agent with built-in tools
response = client.beta.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=[{"type": "web_search_20250305", "name": "web_search"}],
    messages=[{"role": "user", "content": "Research the latest MCP developments"}],
    betas=["interleaved-thinking-2025-05-14"]
)
```

### TypeScript

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  messages: [{ role: 'user', content: 'Research the latest MCP developments' }],
  betas: ['interleaved-thinking-2025-05-14'],
});
```

## Batch Processing

For processing many independent requests efficiently:

```python
# Create batch
batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": f"request-{i}",
            "params": {
                "model": "claude-opus-4-6",
                "max_tokens": 256,
                "messages": [{"role": "user", "content": text}]
            }
        }
        for i, text in enumerate(texts)
    ]
)

# Poll until complete
import time
while batch.processing_status == "in_progress":
    time.sleep(60)
    batch = client.messages.batches.retrieve(batch.id)

# Get results
for result in client.messages.batches.results(batch.id):
    if result.result.type == "succeeded":
        print(result.result.message.content[0].text)
```

## Context Window Compaction (Beta, Opus 4.6)

For long agentic sessions approaching the 200K limit:

```python
# Enable server-side compaction
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=8192,
    messages=messages,
    extra_headers={"anthropic-beta": "compact-2026-01-12"}
)

# IMPORTANT: Always preserve full response.content including compaction blocks
messages.append({"role": "assistant", "content": response.content})
```

## Multi-Language Quick Reference

**Go:**

```go
import "github.com/anthropics/anthropic-sdk-go"
client := anthropic.NewClient()
```

**Java:**

```java
import com.anthropic.client.AnthropicClient;
AnthropicClient client = AnthropicClient.builder().build();
```

**Ruby:**

```ruby
require "anthropic"
client = Anthropic::Client.new
```

**cURL:**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-6","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

## Autonomous Coding Agent Pattern

Build multi-session autonomous coding agents using the Claude Agent SDK's two-agent architecture (from anthropics/claude-quickstarts):

### Architecture: Initializer + Coding Agent

```
Session 1:                    Session 2:                    Session N:
+-----------+                 +-----------+                 +-----------+
|Initializer|                 |Initializer|                 |Initializer|
|  Agent    |                 |  Agent    |                 |  Agent    |
+-----+-----+                +-----+-----+                +-----+-----+
      |                             |                             |
      v                             v                             v
+-----+-----+                +-----+-----+                +-----+-----+
|  Coding   |                |  Coding   |                |  Coding   |
|  Agent    |                |  Agent    |                |  Agent    |
+-----------+                +-----------+                +-----------+
      |                             |                             |
      +---------> git commit -------+---------> git commit -------+
```

### Initializer Agent

- Reads the feature list / requirements document
- Determines which feature to work on next (marks completed ones)
- Prepares context and constraints for the coding agent
- Spawns the coding agent with focused instructions

### Coding Agent

- Receives a single focused task from the initializer
- Implements using TDD (write tests, implement, verify)
- Commits progress to git after each logical unit
- Reports completion back to the initializer

### Git-Persisted Progress

The key innovation: progress is persisted via git commits, not in-memory state.

```python
from claude_agent_sdk import Agent, tool

@tool
def commit_progress(message: str, files: list[str]):
    """Commit completed work to git."""
    subprocess.run(["git", "add"] + files, check=True)
    subprocess.run(["git", "commit", "-m", message], check=True)
```

Between sessions:

1. Git log shows what was completed
2. Feature list file shows what remains
3. No session state needed — fresh agent reads git history

### Feature List Tracking

Maintain a `features.md` file that both agents read/write:

```markdown
# Features

- [x] User authentication (JWT)
- [x] Database schema setup
- [ ] API endpoints for CRUD <-- next
- [ ] Frontend dashboard
- [ ] Email notifications
```

The initializer marks features complete after the coding agent finishes each one.

### When to Use This Pattern

- Building complete applications over multiple sessions
- Long-running projects that exceed single context windows
- Projects requiring incremental, testable progress
- Autonomous coding with minimal human intervention

## Support Agent Quickstart Pattern

Build a customer support agent that handles tickets, escalates unresolved issues, and maintains conversation history (from anthropics/claude-quickstarts):

```python
import anthropic
from typing import Optional

client = anthropic.Anthropic()

SUPPORT_SYSTEM_PROMPT = """You are a helpful customer support agent for Acme Corp.
You have access to the following tools to help customers:
- look_up_order: Find order status by order ID
- process_refund: Initiate a refund for an order
- escalate_ticket: Escalate to human support with a reason

Always be polite and empathetic. If you cannot resolve an issue, escalate it."""

support_tools = [
    {
        "name": "look_up_order",
        "description": "Look up the status of a customer order",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "The order ID (e.g. ORD-12345)"}
            },
            "required": ["order_id"]
        }
    },
    {
        "name": "process_refund",
        "description": "Process a refund for a completed order",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string"},
                "reason": {"type": "string", "description": "Reason for refund"}
            },
            "required": ["order_id", "reason"]
        }
    },
    {
        "name": "escalate_ticket",
        "description": "Escalate an unresolved issue to human support",
        "input_schema": {
            "type": "object",
            "properties": {
                "issue_summary": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "medium", "high"]}
            },
            "required": ["issue_summary", "priority"]
        }
    }
]

def run_support_agent(user_message: str, conversation_history: list) -> tuple[str, list]:
    """Run one turn of the support agent, returning (response, updated_history)."""
    conversation_history.append({"role": "user", "content": user_message})

    while True:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=2048,
            system=SUPPORT_SYSTEM_PROMPT,
            tools=support_tools,
            messages=conversation_history
        )

        if response.stop_reason == "end_turn":
            text_content = next((b.text for b in response.content if hasattr(b, 'text')), "")
            conversation_history.append({"role": "assistant", "content": response.content})
            return text_content, conversation_history

        # Handle tool use
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(result)
                })

        conversation_history.append({"role": "assistant", "content": response.content})
        conversation_history.append({"role": "user", "content": tool_results})
```

## Financial Analyst Agent Pattern

Build a financial analysis agent that processes market data and generates reports (from anthropics/claude-quickstarts):

```python
import anthropic
import json

client = anthropic.Anthropic()

financial_tools = [
    {
        "name": "get_stock_price",
        "description": "Get current and historical stock price data",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Stock ticker symbol (e.g. AAPL)"},
                "period": {"type": "string", "enum": ["1d", "1w", "1m", "3m", "1y"],
                          "description": "Time period for historical data"}
            },
            "required": ["symbol"]
        }
    },
    {
        "name": "calculate_metrics",
        "description": "Calculate financial metrics like PE ratio, moving averages, volatility",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "metrics": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["pe_ratio", "ma_50", "ma_200", "volatility", "beta"]},
                    "description": "Financial metrics to calculate"
                }
            },
            "required": ["symbol", "metrics"]
        }
    },
    {
        "name": "generate_report",
        "description": "Generate a structured financial analysis report",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "report_type": {"type": "string", "enum": ["summary", "detailed", "comparison"]},
                "output_format": {"type": "string", "enum": ["markdown", "json", "html"]}
            },
            "required": ["symbol", "report_type"]
        }
    }
]

FINANCIAL_SYSTEM_PROMPT = """You are an expert financial analyst. Analyze stocks and market data
to provide actionable insights. Always:
1. Gather relevant data before making recommendations
2. Consider multiple metrics and timeframes
3. Clearly state assumptions and limitations
4. Structure analysis with: Summary → Data Analysis → Key Findings → Recommendation"""

def analyze_stock(symbol: str, question: Optional[str] = None) -> str:
    """Run a financial analysis agent for a given stock symbol."""
    prompt = question or f"Provide a comprehensive analysis of {symbol} stock."

    messages = [{"role": "user", "content": prompt}]

    while True:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            system=FINANCIAL_SYSTEM_PROMPT,
            tools=financial_tools,
            messages=messages
        )

        if response.stop_reason == "end_turn":
            return next((b.text for b in response.content if hasattr(b, 'text')), "")

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_financial_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result)
                })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

## Common Pitfalls

| Pitfall                            | Fix                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| Using `budget_tokens` in thinking  | Use `thinking: {type: "adaptive"}` instead                |
| Truncating long inputs             | Discuss chunking or summarization options with user       |
| Using `output_format`              | Use `output_config: {format: {...}}` instead              |
| Not streaming large responses      | Add streaming for `max_tokens > 4096`                     |
| String manipulation on tool inputs | Use `json.loads(block.input)` / `JSON.parse(block.input)` |
| Hardcoding API key                 | Use `ANTHROPIC_API_KEY` env var always                    |

## Memory Protocol

Read before working on Claude API integrations:

```bash
cat .claude/context/memory/learnings.md | grep -i "api\|anthropic\|sdk"
```

Record findings after completing work:

- Integration patterns → `.claude/context/memory/learnings.md`
- API gotchas → `.claude/context/memory/issues.md`

## Related Skills

- `mcp-builder` — Build MCP servers using the SDK
- `typescript-expert` — TypeScript type system and async patterns
- `python-backend-expert` — Python async, error handling
- `tdd` — Test-driven development for API integrations
