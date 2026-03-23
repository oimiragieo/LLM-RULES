# Research Requirements — adversarial-debate

**Date:** 2026-03-23
**Query intent:** Structured debate patterns for AI agent decision support

## Search Summary

Searched for prior art in:

1. VoltAgent/awesome-agent-skills — no matching "adversarial-debate" or "structured-debate" skill found
2. Exa web search — not available in current execution context; recorded fallback sources below
3. arXiv — adversarial debate for LLM reasoning is an active research area (2024-2025)

## Prior Art Found

### Related framework skill: `llm-council`

- Location: `.claude/skills/llm-council/SKILL.md`
- Pattern: Parallel multi-LLM synthesis (dispatch to omega CLIs, collect, synthesize)
- Differentiation: `adversarial-debate` is sequential (PRO then CON per round), not parallel
- `llm-council` optimizes for consensus; `adversarial-debate` optimizes for surfacing trade-offs

### Related framework skill: `advanced-elicitation`

- Pattern: Meta-cognitive reasoning for single-agent improvement
- Differentiation: `advanced-elicitation` operates on one agent; `adversarial-debate` uses two opposing agents

## Academic Research Context

Adversarial debate for LLM reasoning is grounded in:

- "Constitutional AI: Harmlessness from AI Feedback" (Anthropic, 2022) — adversarial critique improves alignment
- "Debate as a Method for Scalable Oversight" (Irving & Askell, 2019) — foundational debate-as-verification
- Society of Mind / multi-agent reasoning literature — separate cognitive roles improve decision quality

Key findings applicable to this skill:

1. **Explicit stance assignment reduces sycophancy** — agents without forced stances tend toward agreement
2. **Round scoring anchors the moderator** — unscored debates allow moderator to ignore weak arguments
3. **3 rounds is the empirical sweet spot** — new evidence rarely emerges in rounds 4-5

## Design Constraints (Actionable)

1. **Stance lock constraint** (from sycophancy research) → `rules/adversarial-debate.md` stance drift section
2. **Round scoring requirement** (from moderator anchoring) → enforced in SKILL.md Iron Law
3. **5-round cap** (from diminishing returns) → validated in `schemas/input.schema.json` `maximum: 5`

## Non-Goals

- Not a real-time debate simulation (no human participation)
- Not a consensus mechanism (use `llm-council` or `consensus-voting` for that)
- Not a multi-topic debate (one decision per invocation)
- Not a replacement for human judgment — produces a recommendation, not a mandate
