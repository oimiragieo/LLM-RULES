# Subagent Memory Contract

## Purpose

Defines how memory and retrieval evidence must be injected into subagent prompts and how agents cite that evidence.

## Injection Format

The spawn prompt assembler injects evidence IDs in these forms:

- Memory evidence: `[mem:<8-hex>]`
- RAG/code evidence: `[rag:<8-hex>]`

Evidence IDs are stable per injected snippet and must be preserved verbatim in generated output.

## Agent Requirements

1. If using injected memory context, cite at least one relevant `[mem:...]` ID.
2. If using retrieved code/research context, cite at least one relevant `[rag:...]` ID.
3. Do not invent IDs that were not injected in the prompt.
4. If no evidence was injected, state that explicitly and avoid fabricated citations.

## Retrieval Behavior Contract

Subagents should assume memory retrieval is hybrid by default (keyword + LanceDB vector fusion):

1. Retrieval may return evidence sourced from `keyword`, `lancedb`, or fused `hybrid`.
2. `MEMORY_SEMANTIC_SEARCH=off` forces keyword-only retrieval.
3. Vector failures must be treated as graceful fallback (not task failure) when keyword evidence exists.
4. Similarity thresholding applies to vector branch results only; keyword evidence remains eligible.

## Structured Memory Write Contract (Mandatory)

When subagents persist structured learnings (patterns, gotchas, discoveries):

1. Use `MemoryRecord` (tool/flow) for structured memory writes.
2. Do not use `Write`/`Edit` directly on:
   - `.claude/context/memory/patterns.json`
   - `.claude/context/memory/gotchas.json`
   - `.claude/context/memory/open-findings.json`
   - `.claude/context/memory/access-stats.json`
3. Direct writes to these files are blocked by pre-tool guardrails.
4. Validation gate: run `pnpm validate:agent-memory`.

## Evaluation Requirements

Live and fallback evals should measure:

- `evidence_injection_rate`
- `citation_use_rate`
- `groundedness_rate`
- `output_observed_rate`

## Implementation Pointers

- Prompt injection core: `.claude/lib/spawn/prompt-assembler-sections.cjs`
- Task spawn path: `.claude/hooks/routing/spawn-prompt-assembler.runtime.cjs`
- Live/fallback eval harness: `tests/evals/subagent-memory-rag-live.eval.cjs`
- Hook E2E citation checks: `tests/hooks/spawn-prompt-assembler-citation-e2e.test.cjs`
