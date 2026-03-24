---
name: session-log-analyzer
description: Parse Claude Code JSONL session logs from ~/.claude/projects/ for tool call inventory, token costs, error detection, subagent traces, and compaction detection
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Grep, Glob, TaskUpdate]
agents: [developer, qa, architect]
category: 'Memory & Context'
tags: [session-analysis, observability, debugging, token-usage, jsonl-parsing]
best_practices:
  - Always use line-by-line streaming for large JSONL files
  - Estimate tokens as chars/4 (Claude tokenizer approximation)
  - Never load entire session file into memory — use grep + head/tail
error_handling: graceful
streaming: supported
---

# Session Log Analyzer

Parse Claude Code JSONL session logs to understand what happened during a session — tool calls, token usage, errors, subagent trees, and compaction events.

Based on patterns from [claude-devtools](https://github.com/matt1398/claude-devtools) session parsing engine.

## When to Invoke

```javascript
Skill({ skill: 'session-log-analyzer' });
```

Use when: debugging failed sessions, analyzing cost/token usage, understanding which tools consumed the most context, tracing subagent execution, detecting where compaction occurred.

## Workflow

### Step 1: Locate Session Logs

Session logs live at `~/.claude/projects/{encoded-path}/*.jsonl` where `{encoded-path}` is the project directory with `/` replaced by `-`.

```bash
# List all project session directories
ls ~/.claude/projects/

# Find the most recent session for current project
ls -lt ~/.claude/projects/$(pwd | sed 's|/|-|g; s|^-||')/*.jsonl | head -5

# Or search by date
find ~/.claude/projects/ -name "*.jsonl" -newer /tmp/yesterday -type f
```

### Step 2: Parse and Classify Messages

Each line in the JSONL is a JSON object with a `type` field:

```bash
# Count message types in a session
grep -o '"type":"[^"]*"' SESSION.jsonl | sort | uniq -c | sort -rn

# Extract only assistant messages
grep '"type":"assistant"' SESSION.jsonl | head -5
```

Message types: `user`, `assistant`, `system`, `progress` (hook output)

### Step 3: Extract Tool Call Inventory

Tool calls appear as `tool_use` content blocks in assistant messages, results as `tool_result` in user messages:

```bash
# Count tool calls by name
grep -o '"type":"tool_use"' SESSION.jsonl | wc -l
grep -o '"name":"[^"]*"' SESSION.jsonl | sort | uniq -c | sort -rn

# Find errors (is_error: true in tool results)
grep '"is_error":true' SESSION.jsonl
```

### Step 4: Estimate Token Usage

Claude Code logs include usage data per turn. Extract and sum:

```bash
# Extract token counts per turn
grep '"usage"' SESSION.jsonl | grep -o '"input_tokens":[0-9]*' | cut -d: -f2 | paste -sd+ | bc
grep '"usage"' SESSION.jsonl | grep -o '"output_tokens":[0-9]*' | cut -d: -f2 | paste -sd+ | bc

# Fallback: estimate from content size (chars / 4)
wc -c SESSION.jsonl  # divide by 4 for rough token estimate
```

### Step 5: Detect Subagent Traces

Task tool calls spawn subagents. Extract the tree:

```bash
# Find all Task tool invocations
grep '"name":"Task"' SESSION.jsonl | grep -o '"subagent_type":"[^"]*"'

# Find task IDs
grep '"task_id"' SESSION.jsonl | grep -o '"task_id":"[^"]*"'
```

### Step 6: Detect Compaction Boundaries

Context compaction shows as sudden drops in input_tokens between adjacent turns:

```bash
# Extract input_tokens sequence — look for >30% drops between adjacent values
grep '"input_tokens"' SESSION.jsonl | grep -o '"input_tokens":[0-9]*' | cut -d: -f2
```

### Step 7: Generate Summary Report

Produce a summary with: total turns, tool call counts, estimated tokens, errors found, subagent tree, compaction events.

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
\`\`\`

**After completing:**

- New pattern -> \`.claude/context/memory/learnings.md\`
- Issue found -> \`.claude/context/memory/issues.md\`
- Decision made -> \`.claude/context/memory/decisions.md\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
