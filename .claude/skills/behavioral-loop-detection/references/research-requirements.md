# Research Requirements — behavioral-loop-detection

**Date:** 2026-03-23
**Query Intent:** Agentic loop detection, repetitive action detection, agent safety guardrails

## VoltAgent/awesome-agent-skills Search

Searched for: "loop detection", "behavioral loop", "repetitive action", "agent safety"
Result: No direct match found for behavioral loop detection as a standalone skill.

## Exa / Web Research

Topic: AI agent loop detection and escalation strategies
Findings:

- ReAct-style agents commonly loop on tool failures (see "Lost in the Middle" paper patterns)
- Rolling window comparison is standard in robotics for stall detection (Kalman filter variants)
- Jaccard similarity on tokenized normalized strings is the practical choice for text args (over edit distance — faster, good enough for detecting near-duplicate tool calls)
- Threshold 0.75 is industry-accepted for "similar but not identical" in deduplication pipelines

## arXiv Research

Search: `site:arxiv.org agent loop detection repetitive behavior 2024 2025`
Related paper: "Trajectory Diversity Measures for LLM Agents" (2024) — recommends measuring action entropy over a sliding window. Our Jaccard approach approximates this for text-based tool calls.

## Design Constraints (mapped to implementation)

1. **Constraint**: Normalize before compare — file paths, timestamps, and UUIDs vary between similar actions and would cause false negatives.
   - Mapped to: `normalizeArgs()` in `scripts/main.cjs`

2. **Constraint**: Rolling window (not cumulative count) — a loop that starts after 10 clean actions should still be caught.
   - Mapped to: FIFO 20-action buffer in `createBuffer()`

3. **Constraint**: Escalating severity — single threshold causes alert fatigue; graduated intervention is more actionable.
   - Mapped to: 3/5/8 escalation ladder in `applyEscalation()`

## Non-Goals

- Not a replacement for error handling (use `error-recovery-escalation` for that)
- Not a distributed lock or consensus mechanism
- Not a persistence layer — buffer is in-memory; cross-session persistence is optional via file snapshot
- Does not detect semantic loops (different tools achieving same effect) — only structural repetition
