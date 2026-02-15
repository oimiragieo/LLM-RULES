# Research Requirements: token-saver-context-compression

## Date and Intent

- Date: 2026-02-15
- Intent: keep context compression minimal, evidence-grounded, and compatible with agent-studio memory + spawn citation flow.

## Exa-First Requirement

- Exa should be used first for external research queries on context compression, RAG grounding, and agent memory best practices.
- If Exa is unavailable in runtime, document fallback sources and proceed with deterministic local design.

## Fallback Sources Used

- Local framework sources:
  - `.claude/lib/spawn/prompt-assembler.cjs`
  - `.claude/hooks/routing/spawn-prompt-assembler.cjs`
  - `.claude/hooks/memory/sync-memory-index.cjs`
  - `.claude/tools/cli/hybrid-search.cjs`

## Actionable Design Constraints

1. Output from wrapper must be JSON and deterministic.
2. Memory persistence must flow through MemoryRecord or tool-level write path so sync/index hooks remain authoritative.
3. Citation format must remain unchanged (`[mem:*]` / `[rag:*]`) and is handled by existing spawn pipeline.

## Non-Goals

- No direct changes to spawn citation format.
- No automatic hook trigger for this skill in v1.
- No replacement of existing EventBus or memory index architecture.
