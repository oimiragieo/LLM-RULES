---
name: perpetual-memory
description: Use when you need to auto-log all tool interactions into a self-organizing vector DB with instant recall. Intercepts interactions, extracts key information, generates embeddings, stores in LanceDB, auto-categorizes, and builds a retrieval index. Inspired by OpenClaw SQLite LCM + summary DAG pattern.
version: 1.0.0
---

# Perpetual Memory

## Overview

Auto-embed all tool interactions into a vector store without explicit "remember" commands.
Every significant interaction is captured, categorized, and stored in LanceDB for instant
semantic recall across sessions.

**Core principle:** If it happened and it mattered, it is in perpetual memory. No explicit
"remember" commands needed. The system auto-captures decisions, learnings, patterns,
gotchas, and issues from every agent interaction.

## When to Use

- After completing any significant task (auto-triggered)
- When agents produce findings, decisions, or learnings
- When debugging reveals root causes or workarounds
- When architectural decisions are made
- When new patterns or anti-patterns are discovered
- At session boundaries to capture session summaries

**Do NOT use for:**

- Trivial read-only queries that produce no insights
- Ephemeral debugging output that has no lasting value
- Duplicate content already in the memory system

## Integration with Existing Memory System

This skill extends (does NOT replace) the existing memory system:

| System                     | Purpose                            | Perpetual Memory Role           |
| -------------------------- | ---------------------------------- | ------------------------------- |
| `learnings.md`             | Human-readable learning archive    | Auto-populates from embeddings  |
| `decisions.md`             | ADR-style decisions                | Indexes for semantic recall     |
| `issues.md`                | Known blockers and workarounds     | Indexes for semantic recall     |
| `patterns.json`            | Structured patterns (MemoryRecord) | Deduplicates against            |
| `gotchas.json`             | Structured gotchas (MemoryRecord)  | Deduplicates against            |
| `memory-search.cjs`        | Semantic search over markdown      | Complementary (different index) |
| `pnpm search:code`         | Code search (BM25 + semantic)      | Does NOT interfere              |
| **perpetual_memory table** | Vector store of all interactions   | Primary perpetual store         |

## Workflow

### Step 1: Intercept Interaction

After a tool completes (PostToolUse), extract the significant content:

- TaskUpdate completions with metadata.summary
- Write/Edit operations with file paths and descriptions
- Bash command outputs with significant findings
- Skill invocation results

### Step 2: Extract Key Information

From the raw interaction, extract:

- **What happened**: One-line summary of the action
- **Why it matters**: The significance or decision rationale
- **Context**: Agent name, task ID, affected files
- **Category signal**: Keywords that indicate decision/learning/pattern/gotcha/issue

### Step 3: Generate Embeddings and Store

```bash
# Embed and store via the auto-embed CLI tool
node .claude/tools/cli/auto-embed.cjs \
  --text "Discovered that routing-guard.cjs blocks Write on creator paths. This is Gate 4 enforcement." \
  --agent developer \
  --task-id task-12 \
  --category learning
```

### Step 4: Auto-Categorize

The tool auto-categorizes based on keyword matching:

| Category   | Trigger Keywords                                         |
| ---------- | -------------------------------------------------------- |
| `decision` | decided, chose, selected, tradeoff, rationale, ADR       |
| `learning` | learned, discovered, found that, realized, insight       |
| `pattern`  | pattern, approach, technique, best practice, convention  |
| `gotcha`   | gotcha, pitfall, anti-pattern, risk, warning, sharp edge |
| `issue`    | issue, bug, error, broken, failing, blocker, regression  |

Override with `--category <name>` when auto-detection is wrong.

### Step 5: Deduplication

Before storing, the tool checks similarity against existing entries:

- Default threshold: 0.92 (92% cosine similarity)
- If a near-duplicate exists, the store is skipped
- Configurable via `--dedup-threshold <float>`

### Step 6: Build Retrieval Index

The LanceDB `perpetual_memory` table automatically maintains a vector index.
Queries use ANN (Approximate Nearest Neighbor) search for sub-second retrieval.

## CLI Reference

```bash
# Store an interaction
node .claude/tools/cli/auto-embed.cjs --text "interaction text" --agent developer --task-id task-5

# Query perpetual memory
node .claude/tools/cli/auto-embed.cjs --query "how does routing work" --limit 10

# View statistics
node .claude/tools/cli/auto-embed.cjs --stats

# Pipe from stdin
echo "important finding" | node .claude/tools/cli/auto-embed.cjs --stdin --agent qa
```

## Agent Integration

All agents should embed significant findings at task completion:

```javascript
// In TaskUpdate(completed) metadata handler:
// Auto-embed the summary into perpetual memory
const summary = metadata.summary;
if (summary && summary.length > 20) {
  // The auto-embed tool handles categorization and dedup
  Bash({
    command: `node .claude/tools/cli/auto-embed.cjs --text "${summary.replace(/"/g, '\\"')}" --agent ${agentType} --task-id ${taskId}`,
  });
}
```

## Iron Laws

1. **NEVER store secrets, credentials, or PII** in perpetual memory -- sanitize before embedding.
2. **ALWAYS deduplicate** before storing -- duplicate embeddings waste storage and pollute retrieval.
3. **NEVER break existing memory-search.cjs** -- perpetual memory is an additional layer, not a replacement.
4. **ALWAYS include agent and task-id metadata** -- unattributed memories cannot be traced or audited.
5. **NEVER embed raw tool output verbatim** -- extract the insight, not the noise.

## Anti-Patterns

| Anti-Pattern                        | Why It Fails                                     | Correct Approach                                |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Embedding raw Bash output           | Noise drowns signal; embeddings are low quality  | Extract the finding or decision from the output |
| Skipping deduplication              | Storage bloat; retrieval quality degrades        | Always use dedup threshold (default 0.92)       |
| Replacing markdown memory files     | Breaks existing agent workflows that read .md    | Perpetual memory supplements, never replaces    |
| Storing without agent/task metadata | Cannot trace or audit memory provenance          | Always pass --agent and --task-id               |
| Embedding everything                | Context pollution; irrelevant results in queries | Only embed significant findings and decisions   |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
