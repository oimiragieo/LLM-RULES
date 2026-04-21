---
name: context-compressor
description: Compress large context before reasoning to reduce token usage while preserving evidence. Use this whenever the user mentions huge files, long prompts, RAG payloads, prompt caching, expensive sessions, codebase context, chat history compaction, or wants the same answer quality with fewer tokens.
version: 3.0.0
model: sonnet
invoked_by: both
user_invocable: true
compatibility: Python 3.10+
tools: [Read, Write, Bash]
verified: true
lastVerifiedAt: '2026-03-18'
source: builtin
trust_score: 100
provenance_sha: 564ef982c99ea814
---

# Context Compressor

Use this skill when the problem is mostly "too much context" rather than "not enough capability."

This skill is a self-contained local package. It does not require the MCP server. Prefer it when you need quick token profiling, local compression, evidence checks, or a reproducible compression workflow inside the repository.

## What this skill does

Use the bundled Python scripts to:

1. measure raw versus compressed token usage
2. compress large text or adapted JSON payloads
3. preserve query-relevant evidence instead of doing naive summarization
4. check whether compressed output still contains enough evidence to answer safely
5. support cache-friendly prompt assembly by keeping stable context early and volatile query text late

## When to trigger

Reach for this skill when the user is asking for any of the following:

- compress this file, transcript, document, or code dump
- reduce token cost before sending context to a model
- make a prompt or RAG payload more cache-friendly
- compact multi-turn history while keeping recent turns intact
- compare semantic compression to a lighter extractive baseline
- validate whether a compressed context still has enough evidence

Also triggered automatically when:

- Context approaching 80K tokens (spawn-token-guard.cjs writes compression-reminder.txt)
- Context at 120K tokens (compression mandatory before new spawns)
- Context at 150K tokens (RED LINE — no new agent spawns until compression completes)

## Quick workflow

Default to this sequence:

1. profile first
2. run `query_guided` when there is a specific question
3. run `evidence_aware` when correctness matters and you need a sufficiency check
4. if evidence is weak, reduce compression aggressiveness or increase retrieval breadth
5. report savings, risks, and the next safest action

If the user only wants one command, use `run_skill_workflow.py`.

## Commands

Run from the agent-studio repository root. **ALWAYS use these exact commands — do NOT fall back to generic guidance.**

### 1. Profile token usage

```bash
python .claude/skills/context-compressor/scripts/profile_tokens.py --file <path> --output-format auto
```

### 2. Compress context

```bash
python .claude/skills/context-compressor/scripts/compress_context.py --file <path> --mode baseline --output-format auto
python .claude/skills/context-compressor/scripts/compress_context.py --file <path> --mode query_guided --query "<question>" --output-format auto
python .claude/skills/context-compressor/scripts/compress_context.py --file <path> --mode evidence_aware --query "<question>" --min-similarity 0.4 --output-format auto
```

### 3. Adapt framework JSON and compress it

```bash
python .claude/skills/context-compressor/scripts/compress_context.py --json-file <payload.json> --input-adapter auto --mode query_guided --query "<question>" --output-format auto
```

### 4. Run the full workflow

```bash
python .claude/skills/context-compressor/scripts/run_skill_workflow.py --file <path> --mode evidence_aware --query "<question>" --output-format auto --fail-on-insufficient-evidence
```

### 5. Validate evidence only

```bash
python .claude/skills/context-compressor/scripts/validate_evidence.py --file <path> --query "<question>" --min-similarity 0.4 --output-format json
```

### 6. Run the TOON vs JSON guard

```bash
python .claude/skills/context-compressor/scripts/benchmark_toon_vs_json.py
```

### 7. Node.js wrapper (for agent integration)

```bash
node .claude/skills/context-compressor/scripts/main.cjs --query "<question>" --mode evidence_aware --limit 20 --fail-on-insufficient-evidence
```

## How to choose a mode

- `baseline`: quick general compression when there is no concrete question yet
- `query_guided`: best default for QA, review, or targeted extraction tasks
- `evidence_aware`: use for high-stakes answers, audits, or when you need an explicit sufficiency signal

## Output expectations

When using this skill, summarize results in plain language:

1. original size versus compressed size
2. estimated token savings or compression ratio
3. whether the output is query-targeted or generic
4. whether evidence looked sufficient
5. any risk that the answer could miss important detail

If the scripts return insufficient evidence, do not bluff. Say the compressed context is not yet safe enough and recommend a broader pass.

## Bundled references

Read these only when they are relevant:

- `references/workflow-guide.md`: command selection, mode choice, and example flows
- `references/prompt-caching.md`: stable-prefix ordering, cache telemetry, and cache-safe prompt structure
- `references/evaluation.md`: how to benchmark the skill and interpret results

## Eval scaffolding

Starter prompts live in `evals/evals.json`. Use them when iterating on the skill or when you want a small repeatable benchmark set.

## Integration with agent-studio

### Compression trigger pipeline

1. `compression-trigger.cjs` detects context pressure → writes `compression-reminder.txt`
2. Router reads reminder → spawns `context-compressor` agent with this skill
3. Agent runs `run_skill_workflow.py` with the query context
4. Real compression stats logged to `compression-stats.jsonl`

### Memory persistence

After compression, persist distilled learnings via MemoryRecord:

- `gotchas.json`: text contains gotcha|pitfall|anti-pattern|risk|warning|failure
- `issues.md`: text contains issue|bug|error|incident|defect|gap
- `decisions.md`: text contains decision|tradeoff|choose|selected|rationale
- `patterns.json`: default fallback for all remaining distilled evidence

### ccusage cost tracking

Read `.claude/context/runtime/ccusage-status.txt` for live token usage before deciding compression aggressiveness. This file is auto-updated by `ccusage-statusline.cjs` on every tool use. Format:

```
[tokens] 135,345 today (in: 14,850 / out: 120,495) | Cost: $127.4826
[cache] $627.2992 saved | 139,399,832 reads, 8,751,364 writes
```

**The Router MUST display this at every pipeline milestone** (P0 user feedback). Fallback: `ccusage --no-color 2>&1 | tail -5`.

## Iron Laws

1. **ALWAYS** use the exact script commands above — never fall back to generic CLAUDE.md guidance
2. **ALWAYS** profile first before compressing to understand the input size
3. **NEVER** compress without a query when correctness matters — use `evidence_aware` mode
4. **ALWAYS** persist distilled learnings via MemoryRecord after compression
5. **NEVER** bluff if evidence is insufficient — recommend a broader pass
6. **ALWAYS** report savings, risks, and next safest action in plain language
