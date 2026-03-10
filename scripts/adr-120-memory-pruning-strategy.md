# ADR-120: Memory File Pruning Strategy

**Date:** 2026-03-10
**Status:** Accepted
**Supersedes:** None

## Context

Memory files (learnings.md, decisions.md, issues.md, reflection-log.jsonl) grow unbounded across sessions. When injected into spawn prompts, large files cause "Prompt is too long" failures.

## Decision

**Line-count truncation is SEMANTICALLY UNSAFE** (Gemini 2.5 + Codex independently confirmed):
- Causes Foundational Amnesia: oldest entries (most important) pruned first
- Anti-Pattern Regrowth: scar tissue (failed approaches) lost, failures repeat
- Semantic Fragmentation: conclusions without supporting rationale

**Correct strategy:** Archive-by-size-threshold rotation:
1. Active files have size thresholds (learnings.md: 500 lines, decisions.md: 800 lines)
2. When threshold exceeded: move older half to archive/, keep recent half active
3. reflection-log.jsonl: 50KB threshold, keep last 50 lines active
4. Archive files are searchable via memory-search.cjs for historical context

## Enforcement

- `scripts/check-memory-bloat.cjs` — CI gate, exits non-zero if thresholds exceeded
- `scripts/prune-reflection-log.cjs` — automated pruning for reflection log
- NPM scripts: `pnpm memory:check` and `pnpm memory:prune`

## Pinned Invariants (NEVER prune these sections)

decisions.md MUST always retain a `## Pinned Invariants` section at the top with:
- Security model decisions (shell:false, safeParseJSON)
- Routing iron laws (specialist-first, gate 4)
- Active architectural constraints
