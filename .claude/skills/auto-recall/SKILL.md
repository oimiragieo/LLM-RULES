---
name: auto-recall
description: Use when you need semantic retrieval from perpetual memory at query time. Parses query intent, searches vector store, ranks by relevance and recency, and injects context. Complements memory-search.cjs with the perpetual_memory LanceDB table.
version: 1.0.0
---

# Auto-Recall

## Overview

Semantic retrieval from the perpetual memory vector store at query time. Parses
query intent, searches the `perpetual_memory` LanceDB table, ranks results by
relevance and recency, and returns structured context for injection into agent
prompts.

**Core principle:** Every agent should be able to recall any past interaction
instantly by meaning, not by filename or keyword. Auto-recall is the read
side of the perpetual memory architecture.

## When to Use

- At the start of any task to recall related past decisions and learnings
- When debugging to find previously encountered similar issues
- When an agent needs context about how a similar problem was solved before
- When building prompts that benefit from historical context
- When checking if a pattern or approach was tried previously

**Do NOT use for:**

- Searching code (use `pnpm search:code` instead)
- Searching markdown memory files (use `memory-search.cjs` for that)
- Real-time interaction monitoring (use `perpetual-memory` skill for writes)

## Relationship to Existing Tools

| Tool                | Searches                   | Use For                              |
| ------------------- | -------------------------- | ------------------------------------ |
| `pnpm search:code`  | Code files (BM25+semantic) | Finding code patterns                |
| `memory-search.cjs` | Markdown memory files      | Searching learnings/decisions/issues |
| **auto-recall**     | `perpetual_memory` table   | Recalling past interactions          |

Auto-recall is complementary -- it searches a different index (the perpetual
memory vector store) that contains auto-captured interaction summaries rather
than manually-written markdown entries.

## Workflow

### Step 1: Parse Query Intent

Before searching, classify the query intent:

| Intent Type | Query Pattern                             | Search Strategy           |
| ----------- | ----------------------------------------- | ------------------------- |
| Decision    | "Why did we choose X", "What was decided" | Filter: category=decision |
| Issue       | "Have we seen this error before"          | Filter: category=issue    |
| Pattern     | "How do we usually handle X"              | Filter: category=pattern  |
| Learning    | "What did we learn about X"               | Filter: category=learning |
| General     | Any other query                           | No category filter        |

### Step 2: Search Vector Store

```bash
# Basic semantic search
node .claude/tools/cli/auto-embed.cjs --query "how does the routing guard handle Write operations" --limit 10

# Or via the skill script
node .claude/skills/auto-recall/scripts/main.cjs --query "JWT refresh token pattern" --limit 5
```

### Step 3: Rank by Relevance + Recency

Results are ranked by cosine similarity from LanceDB. For time-sensitive queries,
apply a recency boost:

```
final_score = similarity * 0.7 + recency_score * 0.3

where recency_score = max(0, 1 - (days_since_creation / 30))
```

This ensures recent interactions are slightly preferred when similarity is close.

### Step 4: Inject Context

Format retrieved memories for agent prompt injection:

```markdown
## Recalled Context (from perpetual memory)

1. [decision] (sim=0.87, 2d ago, agent=architect)
   Chose JWT RS256 over HS256 for key rotation support. ADR-045.

2. [learning] (sim=0.82, 5d ago, agent=developer)
   Token refresh requires httpOnly cookies to prevent XSS.

3. [issue] (sim=0.74, 1d ago, agent=qa)
   JWT expiry not propagated to frontend. Workaround in auth.middleware.ts:47.
```

## CLI Reference

```bash
# Semantic query
node .claude/skills/auto-recall/scripts/main.cjs --query "routing guard behavior"

# Query with category filter
node .claude/skills/auto-recall/scripts/main.cjs --query "auth decision" --category decision

# Query with limit
node .claude/skills/auto-recall/scripts/main.cjs --query "memory system" --limit 5

# Query with recency boost
node .claude/skills/auto-recall/scripts/main.cjs --query "recent changes" --recency-boost

# Output as JSON
node .claude/skills/auto-recall/scripts/main.cjs --query "search" --json
```

## Agent Integration Pattern

Agents should invoke auto-recall at the start of significant tasks:

```javascript
// At task start, recall relevant context
Skill({ skill: 'auto-recall' });

// Then query for task-relevant history
// node .claude/skills/auto-recall/scripts/main.cjs --query "<task description>" --limit 5
```

This provides agents with historical context about similar past work,
preventing repeated mistakes and leveraging prior decisions.

## Iron Laws

1. **NEVER use auto-recall as a replacement for memory-search.cjs** -- they search different indexes and are complementary.
2. **ALWAYS limit results** to avoid context bloat -- default to 5-10 results, never more than 20.
3. **NEVER inject recalled context without relevance filtering** -- results below 0.5 similarity are noise.
4. **ALWAYS include metadata (category, agent, timestamp)** in recalled context for traceability.
5. **NEVER block on auto-recall failure** -- if the perpetual memory table is unavailable, proceed without it.

## Anti-Patterns

| Anti-Pattern                             | Why It Fails                                     | Correct Approach                               |
| ---------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Using auto-recall for code search        | Wrong index; code is in BM25/semantic code index | Use `pnpm search:code` for code discovery      |
| Injecting all results into context       | Low-similarity results pollute the prompt        | Filter to similarity > 0.5 before injecting    |
| Blocking task on recall failure          | Perpetual memory is a bonus, not a dependency    | Gracefully degrade: proceed without recall     |
| Recalling without specifying limit       | Unbounded results consume too many tokens        | Always set --limit (default: 10)               |
| Trusting recall over fresh code analysis | Past context may be outdated                     | Use recall as starting context, verify current |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
