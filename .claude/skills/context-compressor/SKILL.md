---
name: context-compressor
description: Search-aware context compression workflow. Reduces token usage while preserving decision-critical information. Integrates pnpm hybrid search, Python compression engine, ccusage cost tracking, and MemoryRecord persistence.
version: 2.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write]
best_practices:
  - Preserve decision-critical information
  - Remove redundant content
  - Use structured formats
  - Maintain traceability
  - Ground evidence before persisting
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-03-17T00:00:00.000Z
---

# Context Compressor Skill

<identity>
Context Compressor Skill — Search-aware context compression. Reduces token usage while preserving decision-critical information. Integrates hybrid search retrieval, Python compression engine, ccusage cost tracking, and MemoryRecord persistence into framework memory.
</identity>

<capabilities>
- Compressing conversation history
- Summarizing code and documentation
- Extracting key decisions and context
- Creating efficient memory snapshots
- Reducing redundancy in context
- Evidence-aware compression with hybrid retrieval
- API cost tracking via ccusage-adapter
- Adaptive compression based on corpus size
- MemoryRecord persistence with deduplication
</capabilities>

<instructions>
<execution_process>

## Activation

The context-compressor skill can be invoked in two ways:

### Manual Invocation (always available)

```javascript
Skill({ skill: 'context-compressor' });
```

Use this when context pressure is high, `pnpm search:tokens` shows a file/directory exceeds 32K tokens, or you need query-targeted compression.

### Auto-enforcement via compression-reminder.txt (requires AUTO_COMPRESSION_PHASE_3=1)

Set `AUTO_COMPRESSION_PHASE_3=1` in `.env` to enable the compression-reminder.txt trigger:

```bash
# In .env
AUTO_COMPRESSION_PHASE_3=1
```

When enabled, `compression-trigger.cjs` writes `.claude/context/runtime/compression-reminder.txt` whenever a compression event fires. The router reads this file and spawns `context-compressor` automatically.

**Without this env var**: compression events are logged to `.claude/context/compression-stats.jsonl` but no `compression-reminder.txt` is written, so the router does not auto-spawn compression. The skill must be invoked manually.

**Token thresholds** enforced by the router (from CLAUDE.md Section 8):

- **80K tokens** — spawn `context-compressor` proactively
- **120K tokens** — compression mandatory before new spawns
- **150K tokens** — no new agent spawns until compression completes

## When to Use

- `pnpm search:tokens` shows a file/directory exceeds 32K tokens
- Context is large or expensive and you need a compressed summary
- You need query-targeted compression before synthesis
- You need hard evidence sufficiency gating before persisting memory
- You're building a prompt and `search:code` results alone aren't enough context
- Context approaching 150K tokens
- Session ending with incomplete work
- Multi-agent handoff needed
- Long conversation history (>10 messages)
- Background agent reporting to main session

## Step 0.5: Check Actual Token Usage + Cost (ccusage-adapter)

Before compressing, query actual API token usage and cost for today via `ccusage-adapter`.

```javascript
let usageData = null;
let costs = null;
try {
  const ccusage = require('.claude/lib/utils/ccusage-adapter.cjs');
  usageData = ccusage.getTodayTotals();
  if (usageData) {
    costs = ccusage.calculateCost(usageData, process.env.CCUSAGE_MODEL || 'opus');
  }
} catch (_err) {
  // ccusage not installed or unavailable — fall back to heuristic estimation
}

if (usageData && costs) {
  const totalTokens = usageData.inputTokens + usageData.outputTokens;
  if (totalTokens > 120_000) {
    // HIGH pressure — aggressive compression mode
  } else if (totalTokens > 80_000) {
    // MODERATE pressure — standard compression mode
  } else {
    // LOW pressure — light compression
  }
}
// On failure: fall through to heuristic estimation from compression-trigger.cjs
```

**Status file**: the `ccusage-statusline` hook writes a live status to `.claude/context/runtime/ccusage-status.txt` on every prompt.

## Pricing Table

> Last verified: March 2026 (sources: Silicon Data, IntuitionLabs, DevTk.AI)

| Model                        | Input    | Output   | Cache Write (1.25×) | Cache Read (0.10×) |
| ---------------------------- | -------- | -------- | ------------------- | ------------------ |
| `opus` → Claude Opus 4.6     | $5.00/M  | $25.00/M | $6.25/M             | $0.50/M            |
| `sonnet` → Claude Sonnet 4.6 | $3.00/M  | $15.00/M | $3.75/M             | $0.30/M            |
| `haiku` → Claude Haiku 4.5   | $1.00/M  | $5.00/M  | $1.25/M             | $0.10/M            |

Set `CCUSAGE_MODEL=sonnet` or `CCUSAGE_MODEL=haiku` to match your active model.

### Step 1: Identify Compressible Content

Content types that can be compressed:

| Type          | Compression Strategy                         | Ratio  |
| ------------- | -------------------------------------------- | ------ |
| Code          | Keep signatures, summarize implementations   | 80-90% |
| Conversations | Extract decisions, drop small talk           | 70-80% |
| Documentation | Keep headings and key points                 | 60-70% |
| Errors        | Keep message and location, drop stack frames | 90-95% |
| Logs          | Keep patterns, drop repetitions              | 85-95% |

### Step 2: Apply Compression Techniques

**Technique 1: Decision Extraction**

Before:

```
User: Should we use Redis or Memcached?
Assistant: Let me analyze both options...
[500 words of analysis]
Recommendation: Redis for pub/sub support.
User: Ok let's use Redis.
```

After:

```
Decision: Use Redis (chosen for pub/sub support)
```

**Technique 2: Code Summarization**

Before:

```javascript
// 100 lines of UserService implementation
```

After:

```
UserService: CRUD operations for users
- Methods: create, read, update, delete, findByEmail
- Dependencies: db, validator, logger
- Location: src/services/user.js
```

**Technique 3: Error Compression**

Before:

```
Error: Cannot read property 'id' of undefined
    at UserController.getUser (src/controllers/user.js:45:23)
    ... 20 more stack frames
```

After:

```
Error: Cannot read 'id' of undefined @ src/controllers/user.js:45
Cause: User object is null when accessing .id
```

### Step 3: Structure Compressed Output

Use consistent formats:

```markdown
## Session Summary

### Decisions Made

- [D1] Use Redis for caching
- [D2] JWT for authentication

### Files Modified

- src/auth/jwt.js (new)
- src/config/redis.js (updated)

### Open Items

- [ ] Add rate limiting
- [ ] Write tests for JWT
```

### Step 4: Evidence-Aware Compression (Full Pipeline)

For heavy-context compression with grounded evidence:

1. Retrieve candidate context (`pnpm search:code "<query>"`).
2. Compress using the Python engine in JSON mode.
3. If evidence is insufficient and fail gate is on, stop.
4. Map distilled insights into MemoryRecord-ready payloads.
5. Persist through MemoryRecord so `.claude/hooks/memory/sync-memory-index.cjs` runs.

**Tooling Commands:**

Preferred wrapper entrypoint:

```bash
node .claude/skills/context-compressor/scripts/main.cjs --query "<question>" --mode evidence_aware --limit 20 --fail-on-insufficient-evidence
```

Direct Python engine (advanced):

```bash
python .claude/skills/context-compressor/scripts/run_skill_workflow.py --file <path> --mode evidence_aware --query "<question>" --output-format json --fail-on-insufficient-evidence
```

### Step 5: Validate Compression

Ensure critical info preserved:

- [ ] All decisions captured
- [ ] Key file locations retained
- [ ] Error causes documented
- [ ] Next steps clear
- [ ] Token count reduced by 60-90%
- [ ] Evidence citations included (`[mem:*]` / `[rag:*]`)

</execution_process>

<best_practices>

1. **Preserve Decisions**: Never lose decision rationale
2. **Keep Locations**: File paths and line numbers are critical
3. **Summarize, Don't Delete**: Transform verbose content
4. **Use References**: Point to files instead of including content
5. **Test Recovery**: Can you continue work from compressed context?
6. **Ground Evidence**: Run `pnpm search:code` before compressing for evidence-aware mode
7. **Check Cost First**: Use ccusage-adapter to decide compression aggressiveness
8. **Persist Findings**: Use MemoryRecord immediately after compression

</best_practices>
</instructions>

## Mapping Rule (Deterministic)

Memory classification for distilled insights:

- `gotchas.json` — text contains `gotcha|pitfall|anti-pattern|risk|warning|failure`
- `issues.md` — text contains `issue|bug|error|incident|defect|gap`
- `decisions.md` — text contains `decision|tradeoff|choose|selected|rationale`
- `patterns.json` — default fallback for all remaining distilled evidence

## Output Contract

- Wrapper emits JSON with:
  - `search` summary
  - `compression` summary
  - `memoryRecords` grouped by target (`patterns`, `gotchas`, `issues`, `decisions`)
  - `evidence` sufficiency status

## Integration with search:tokens

Use `pnpm search:tokens` to decide when to invoke this skill:

```bash
# Check if you need compression
pnpm search:tokens .claude/lib/memory
# Output: 60 files, 500KB, ~128K tokens ⚠ OVER CONTEXT

# Then compress with a targeted query
node .claude/skills/context-compressor/scripts/main.cjs \
  --query "how does memory persistence work" --mode evidence_aware --limit 10
```

## Cost Tracking Components

| File                                              | Role                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `.claude/lib/utils/ccusage-adapter.cjs`           | Parses JSONL session logs, sums tokens, calculates cost via `PRICING` table       |
| `.claude/hooks/monitoring/ccusage-statusline.cjs` | `UserPromptSubmit` hook — runs adapter each prompt, writes status to runtime file |
| `.claude/context/runtime/ccusage-status.txt`      | Live status file — read by router for pipeline summaries                          |

## Workflow Integration

**Router Decision:** `.claude/workflows/core/router-decision.md`

- Router spawns agents that use this skill for context-efficient handoffs
- Used in long-running sessions to maintain continuity

**Related Skills:**

- `session-handoff` — Creates full session handoff documents
- `swarm-coordination` — Multi-agent context sharing
- `task-management-protocol` — Task metadata for context handoff

## Maintenance Instructions (for skill-updater)

When `skill-updater` refreshes this skill, verify Claude API pricing via Exa search and update both the Pricing Table and `PRICING` constant in `.claude/lib/utils/ccusage-adapter.cjs`.

## Iron Law

Do not persist compressed content directly to memory files from a subprocess.
Emit MemoryRecord payloads and let framework hooks process sync/indexing.

---

## Iron Laws

1. **ALWAYS** run hybrid search (`pnpm search:code`) before compressing to retrieve grounded evidence for the distilled output
2. **NEVER** compress context that still has open uncertainties — resolve ambiguities before compressing
3. **ALWAYS** persist distilled learnings via MemoryRecord immediately after compression
4. **NEVER** discard evidence that contradicts the current working hypothesis during compression
5. **ALWAYS** inject `[mem:*]` and `[rag:*]` citations in the compressed output for downstream spawn prompt grounding

## Anti-Patterns

| Anti-Pattern                             | Why It Fails                                       | Correct Approach                                  |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Compressing without prior hybrid search  | Output lacks grounded evidence, hallucination risk | Run `pnpm search:code` first, embed citations     |
| Discarding contradicting evidence        | Creates false confidence in distilled output       | Preserve all conflicting signals in summary       |
| No MemoryRecord after compression        | Learnings lost on next context reset               | Persist key findings immediately via MemoryRecord |
| Compressing too late (past 80K tokens)   | Severe accuracy degradation before compression     | Trigger compression at 80K tokens, not at limit   |
| Skipping `[mem:*]` / `[rag:*]` citations | Downstream agents cannot verify claims             | Always annotate evidence sources in output        |
| Deleting information instead of summarizing | Permanent loss of context                       | Transform verbose content, never delete           |
| Losing decision rationale                | Future agents cannot understand why choices were made | Always include rationale in compressed decisions |
| Vague summaries ("worked on auth")       | Cannot resume work from summary                    | Include specific file paths, outcomes, next steps |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "context compression token pressure"
```

Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
