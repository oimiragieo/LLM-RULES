---
name: context-attribution
description: Estimate per-turn token attribution across 6 categories in Claude Code sessions to show where context budget is spent
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Grep, TaskUpdate]
agents: [developer, architect]
category: 'Memory & Context'
tags: [context-analysis, token-attribution, observability, cost-optimization]
best_practices:
  - Classify every message into exactly one of the 6 categories
  - Use chars/4 for token estimation when usage fields are missing
  - Present results as a table with cumulative totals
error_handling: graceful
streaming: supported
---

# Context Attribution

Estimate per-turn token attribution across 6 categories in Claude Code sessions. Based on [claude-devtools](https://github.com/matt1398/claude-devtools) visible context tracker.

## When to Invoke

```javascript
Skill({ skill: 'context-attribution' });
```

Use when: context pressure is high, optimizing CLAUDE.md sizes, understanding which tool calls consume the most tokens, debugging context overflow.

## The 6 Categories

| Category          | Detection Pattern                                    | Typical % |
| ----------------- | ---------------------------------------------------- | --------- |
| CLAUDE.md files   | System messages with `claudeMd` or CLAUDE.md content | 20-40%    |
| @-mentioned files | Read tool results triggered by user file references  | 10-20%    |
| Tool outputs      | All tool_result content blocks                       | 15-30%    |
| AI thinking/text  | Assistant message content (text + thinking blocks)   | 10-25%    |
| Team coordination | Messages containing `<teammate-message>` XML         | 0-15%     |
| User messages     | User role messages (prompts, follow-ups)             | 5-15%     |

## Workflow

### Step 1: Load Session JSONL

```bash
# Find most recent session
SESSION=$(ls -t ~/.claude/projects/$(pwd | sed 's|/|-|g; s|^-||')/*.jsonl | head -1)
```

### Step 2: Extract Per-Turn Token Data

For each message, classify into one of the 6 categories and estimate tokens:

```bash
# Count user messages (Category 6)
grep '"role":"user"' "$SESSION" | grep -v '"tool_result"' | wc -l

# Count tool results (Categories 2-3)
grep '"type":"tool_result"' "$SESSION" | wc -l

# Count assistant output (Category 4)
grep '"role":"assistant"' "$SESSION" | wc -l

# Check for team messages (Category 5)
grep 'teammate-message' "$SESSION" | wc -l
```

### Step 3: Estimate Tokens Per Category

Use the `usage` field from each assistant turn for accurate counts. Fall back to chars/4 when unavailable.

### Step 4: Output Attribution Table

```
Turn | CLAUDE.md | Files | Tools | AI Out | Team | User | Total
-----|-----------|-------|-------|--------|------|------|------
  1  |   12,400  |     0 |     0 |    800 |    0 |  200 | 13,400
  2  |        0  | 3,200 | 1,500 |  2,100 |    0 |  150 |  6,950
...  |      ...  |   ... |   ... |    ... |  ... |  ... |   ...
```

### Step 5: Identify Top Consumers

Report which category consumes the most tokens and suggest optimizations (e.g., reduce CLAUDE.md size, compress tool outputs).

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
