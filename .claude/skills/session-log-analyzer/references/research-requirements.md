# Session Log Analyzer Research Requirements (2026)

## Core Components

- **Session Log Location**: `~/.claude/projects/{encoded-path}/*.jsonl`
- **Encoding**: Project directory with `/` replaced by `-`
- **Parser**: Line-by-line JSONL streaming

## Message Types

- `user` — User input messages
- `assistant` — AI assistant responses
- `system` — System messages
- `progress` — Hook output messages

## Tool Call Patterns

```bash
# Count tool calls by name
grep '"name":"[^"]*"' SESSION.jsonl | sort | uniq -c | sort -rn

# Find errors
grep '"is_error":true' SESSION.jsonl
```

## Token Estimation

```bash
# Extract token counts
grep '"usage"' SESSION.jsonl | grep -o '"input_tokens":[0-9]*' | cut -d: -f2
# Fallback: chars / 4
wc -c SESSION.jsonl
```

## Subagent Detection

```bash
# Find Task tool invocations
grep '"name":"Task"' SESSION.jsonl
```

## Compaction Detection

```bash
# Look for >30% drops in input_tokens between turns
grep '"input_tokens"' SESSION.jsonl | grep -o '"input_tokens":[0-9]*' | cut -d: -f2
```

## Implementation Patterns

### Streaming Parser

```javascript
const readline = require('readline');
const fs = require('fs');

async function parseSession(filePath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const msg = JSON.parse(line);
    // Process message by type
  }
}
```

## Source References

- [claude-devtools](https://github.com/matt1398/claude-devtools)
- Node.js readline streaming
- JSONL format specification
