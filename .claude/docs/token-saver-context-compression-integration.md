# Token Saver Context Compression Integration

## Objective

Integrate token-saver with agent-studio memory/search/spawn as a thin, deterministic pipeline:

1. Retrieve with hybrid search (`pnpm search:code`)
2. Compress with token-saver (`run_skill_workflow.py --output-format json`)
3. Emit MemoryRecord payloads (do not write memory files directly from subprocess)
4. Let memory hooks/indexing and spawn prompt assembly reuse existing `[mem:*]` / `[rag:*]` behavior

## Critical Constraint

Persistence must flow through MemoryRecord (or tool-level Write/Edit) so `.claude/hooks/memory/sync-memory-index.cjs` executes and indexed retrieval stays consistent.

## Decisions

1. **Skill location**: vendored in `.claude/skills/context-compressor/`
2. **Trigger**: manual skill invocation only (v1; no automatic hooks)
3. **Search source**: existing hybrid search (`pnpm search:code`)
4. **Interop format**: JSON-only for wrapper/pipeline
5. **Citations**: unchanged (`[mem:*]`, `[rag:*]`)

## Wrapper Contract

Inputs:

- `query` (required)
- `mode`: `baseline | query_guided | evidence_aware` (default `evidence_aware`)
- `limit` (default `20`)
- `failOnInsufficientEvidence` (default `true`)
- `persistFiles` (default `false`; local testing utility only)

Outputs:

- `search`: query + hit count
- `compression`: mode + corpus path
- `evidence`: sufficiency flag
- `memoryRecords`: grouped records for `patterns`, `gotchas`, `issues`, `decisions`

## Deterministic Mapping Rule

- `gotchas` if text matches: `gotcha|pitfall|anti-pattern|risk|warning|failure`
- `issues` if text matches: `issue|bug|error|incident|defect|gap`
- `decisions` if text matches: `decision|tradeoff|choose|selected|rationale`
- `patterns` fallback for all other distilled evidence

Reference implementation: `.claude/skills/context-compressor/scripts/main.cjs` (`classifyMemoryTarget`, `mapCompressionToMemoryRecords`).

## Test Strategy

1. Unit: evidence gate + mapping behavior
2. Integration: wrapper memory record application and prompt memory citation eligibility
3. Search alignment: `code-semantic-search` delegates to hybrid search; `tool-search` searches tool-manifest directly
