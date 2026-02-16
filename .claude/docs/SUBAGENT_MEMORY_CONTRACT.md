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

## Evaluation Requirements

Live and fallback evals should measure:

- `evidence_injection_rate`
- `citation_use_rate`
- `groundedness_rate`
- `output_observed_rate`

## Implementation Pointers

- Prompt injection: `.claude/lib/spawn/prompt-assembler.cjs`
- Task spawn path: `.claude/hooks/routing/spawn-prompt-assembler.cjs`
- Live/fallback eval harness: `tests/evals/subagent-memory-rag-live.eval.cjs`
- Hook E2E citation checks: `tests/hooks/spawn-prompt-assembler-citation-e2e.test.cjs`
