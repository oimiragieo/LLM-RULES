# Adversarial Debate Rules

## Core Principles

- Every debate requires pre-assigned stances — agents never pick their own
- Rebuttals MUST directly engage the prior argument — deflection invalidates the round
- Score every round before proceeding — do not batch scores at the end
- The moderator's recommendation must cite at least 2 round arguments by round number
- Confidence ratings: High (evidence dominated one side), Medium (close scores), Low (inconclusive)

## Stance Drift Prevention

Once stances are assigned, neither agent may change position mid-debate. If an agent's argument sounds like it agrees with the opponent, flag as stance drift and re-prompt.

## Round Cap

Maximum 5 rounds. After round 3, evaluate whether new arguments are emerging. If rounds 3 and beyond repeat prior points, stop early and proceed to synthesis.

## Recommendation Quality Gate

A recommendation is INVALID if it:

- Says "it depends" without listing specific conditions
- Does not reference round evidence
- Is not phrased as a clear decision (prefer X over Y)

## Anti-Patterns

- Never let agents debate without a defined topic — ambiguous topics produce ambiguous outcomes
- Never skip the round score table — it feeds the moderator's evidence base
- Never produce more than 5 rounds — returns diminish rapidly

## Integration Points

- `llm-council` — parallel multi-LLM synthesis (use for consensus, debate for conflict resolution)
- `plan-generator` — use debate output to populate ADR section of implementation plan
- `architecture-review` — invoke debate for competing architecture approaches
- `security-architect` — invoke debate for security policy trade-offs
