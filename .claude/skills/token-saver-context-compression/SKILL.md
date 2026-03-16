---
name: token-saver-context-compression
description: Search-aware context compression workflow for agent-studio. Use pnpm hybrid search + token-saver compression, then persist distilled learnings via MemoryRecord.
argument-hint: [file-or-text-and-query]
verified: true
lastVerifiedAt: 2026-03-16T00:00:00.000Z
version: 1.1.0
tools: []
---

# Token Saver Context Compression

Use this skill to reduce token usage while preserving grounded evidence. This integrates:

- `pnpm search:code` (hybrid retrieval)
- token-saver Python compression scripts
- MemoryRecord persistence into framework memory
- spawn prompt evidence injection (`[mem:*]` / `[rag:*]`)

## Activation

The token-saver skill can be invoked in two ways:

### Manual Invocation (always available)

```javascript
Skill({ skill: 'token-saver-context-compression' });
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

Note: These thresholds are router behavioral guidelines checked in CLAUDE.md Section 8. The `compression-trigger.cjs` triggers are separate heuristics (budget >90%, reads >10KB, fetches >5KB, periodic every 10 ops). There is no automated hook enforcing the 80K/120K/150K thresholds — they rely on the router reading `compression-reminder.txt`.

## When to Use

- `pnpm search:tokens` shows a file/directory exceeds 32K tokens
- Context is large or expensive and you need a compressed summary
- You need query-targeted compression before synthesis
- You need hard evidence sufficiency gating before persisting memory
- You're building a prompt and `search:code` results alone aren't enough context

## Iron Law

Do not persist compressed content directly to memory files from a subprocess.
Emit MemoryRecord payloads and let framework hooks process sync/indexing.

## Workflow

1. Retrieve candidate context (`pnpm search:code "<query>"`).

### Step 0.5: Check Actual Token Usage (ccusage-adapter)

Before compressing, query actual API token usage for today via `ccusage-adapter`. This lets you make
data-driven compression decisions instead of relying solely on heuristic thresholds.

```javascript
// Attempt to read actual token usage (graceful degradation — never blocks compression)
let usageData = null;
try {
  const ccusage = require('.claude/lib/utils/ccusage-adapter.cjs');
  usageData = ccusage.getTodayTotals();
} catch (_err) {
  // ccusage not installed or unavailable — fall back to heuristic estimation
}

if (usageData) {
  // Log actual usage for decision-making
  console.log('[token-saver] Actual usage today:', {
    inputTokens: usageData.inputTokens,
    outputTokens: usageData.outputTokens,
    cacheCreationTokens: usageData.cacheCreationTokens,
    cacheReadTokens: usageData.cacheReadTokens,
    totalCost: `$${usageData.totalCost.toFixed(4)}`,
  });

  // Use actual counts to decide compression aggressiveness
  // totalTokens > 80K  → standard compression
  // totalTokens > 120K → aggressive compression
  const totalTokens = usageData.inputTokens + usageData.outputTokens;
  if (totalTokens > 120_000) {
    console.log('[token-saver] HIGH pressure (>120K tokens) — aggressive compression mode');
  } else if (totalTokens > 80_000) {
    console.log('[token-saver] MODERATE pressure (>80K tokens) — standard compression mode');
  } else {
    console.log('[token-saver] LOW pressure (<80K tokens) — light compression');
  }
} else {
  // ccusage unavailable — fall through to heuristic estimation from compression-trigger.cjs
  console.log('[token-saver] ccusage unavailable — using heuristic token estimation');
}
```

**Fallback behavior**: when `getTodayTotals()` returns `null` (ccusage not installed, timeout, or
`CCUSAGE_DISABLED=1`), the workflow continues using existing heuristic thresholds from
`compression-trigger.cjs`. The step never blocks compression.

1. Compress using token-saver in JSON mode (`run_skill_workflow.py --output-format json`).
2. If evidence is insufficient and fail gate is on, stop.
3. Map distilled insights into MemoryRecord-ready payloads.
4. Persist through MemoryRecord so `.claude/hooks/memory/sync-memory-index.cjs` runs.

## Mapping Rule (Deterministic)

- `gotchas.json`:
  - text contains `gotcha|pitfall|anti-pattern|risk|warning|failure`
- `issues.md`:
  - text contains `issue|bug|error|incident|defect|gap`
- `decisions.md`:
  - text contains `decision|tradeoff|choose|selected|rationale`
- `patterns.json`:
  - default fallback for all remaining distilled evidence

## Tooling Commands

Preferred wrapper entrypoint:

```bash
node .claude/skills/token-saver-context-compression/scripts/main.cjs --query "<question>" --mode evidence_aware --limit 20 --fail-on-insufficient-evidence
```

Direct Python engine (advanced):

```bash
python .claude/skills/token-saver-context-compression/scripts/run_skill_workflow.py --file <path> --mode evidence_aware --query "<question>" --output-format json --fail-on-insufficient-evidence
```

## Output Contract

- Wrapper emits JSON with:
  - `search` summary
  - `compression` summary
  - `memoryRecords` grouped by target (`patterns`, `gotchas`, `issues`, `decisions`)
  - `evidence` sufficiency status

## Workflow References

- Skill workflow: `.claude/workflows/token-saver-context-compression-skill-workflow.md`
- Companion tool: `.claude/tools/token-saver-context-compression/token-saver-context-compression.cjs`
- Command surface: `.claude/commands/token-saver-context-compression.md`
- Citation format is unchanged:
  - memory entries become `[mem:xxxxxxxx]`
  - RAG entries remain `[rag:xxxxxxxx]`

## Integration with search:tokens

Use `pnpm search:tokens` to decide when to invoke this skill:

```bash
# Check if you need compression
pnpm search:tokens .claude/lib/memory
# Output: 60 files, 500KB, ~128K tokens ⚠ OVER CONTEXT

# Then compress with a targeted query
node .claude/skills/token-saver-context-compression/scripts/main.cjs \
  --query "how does memory persistence work" --mode evidence_aware --limit 10
```

The tool reads actual file content from search results (not just file paths), compresses via the Python engine, and extracts memory records classified by type (patterns, gotchas, issues, decisions).

## Adaptive Compression

Adaptive compression (adjusting compression ratio based on corpus size) is automatic and requires no env var configuration. When the input corpus is small, compression is lighter; when it is large, compression is more aggressive. This is controlled internally by the Python engine based on token counts.

## Requirements

- Node.js 18+
- Python 3.10+

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

## Memory Protocol (MANDATORY)

Before work:

```bash
cat .claude/context/memory/learnings.md
```

After work:

- Add integration learnings to `.claude/context/memory/learnings.md`
- Add integration risks to `.claude/context/memory/issues.md`
