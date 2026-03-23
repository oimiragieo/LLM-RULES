# Instinct Learning — Research Requirements

## Research Date: 2026-03-23

## Search Performed

Searched VoltAgent/awesome-agent-skills for "instinct learning confidence memory" — no direct match found.

Conceptual basis drawn from:

1. Behavioral learning systems (confidence-weighted knowledge stores)
2. Agent memory persistence patterns in agent-studio (learnings.md, patterns.json precedents)
3. Graduated confidence scoring (similar to spaced repetition systems — Anki, SM-2 algorithm)

## Design Constraints (Mapped to Implementation)

1. **Project isolation prevents cross-contamination** → `scope: "project"` field + `project` name stored per record. Global promotion only at 0.8+.

2. **Confidence must be earned, not assigned** → Confidence range 0.3–0.9 (not 1.0), with pre-execute hook enforcing the range.

3. **Atomic instincts only** → 200-char limit on `text` field, enforced in schema and CLI.

## Non-Goals

- NOT a full RAG or semantic search system (that's `memory-search`)
- NOT a replacement for `learnings.md` (instincts are behavioral, not factual)
- NOT user-facing memory notes (use `session-handoff` for handoff context)
- Does NOT auto-delete low-confidence instincts (agents decide when to prune)
