# session-log-analyzer Rules

## Purpose

Parse Claude Code JSONL session logs from ~/.claude/projects/ for tool call inventory, token costs, error detection, subagent traces, and compaction detection.

## Best Practices

- Always use line-by-line streaming for large JSONL files
- Estimate tokens as chars/4 (Claude tokenizer approximation)
- Never load entire session file into memory — use grep + head/tail
- Handle missing session files gracefully
- Report compaction events when input_tokens drops > 30% between turns

## Log Analysis Patterns

- **Message types**: user, assistant, system, progress
- **Tool calls**: tool_use in assistant messages, tool_result in user messages
- **Errors**: is_error: true in tool results
- **Subagents**: Task tool with subagent_type field
- **Compaction**: Sudden drops in input_tokens between adjacent turns

## Integration Points

See SKILL.md for complete documentation.
