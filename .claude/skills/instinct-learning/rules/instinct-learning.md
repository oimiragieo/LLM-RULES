# Instinct Learning Rules

## Core Principles

- Every instinct MUST have an observed basis — never fabricate `source_context`
- Confidence scores are honest assessments, not aspirational targets
- Project scope isolates low-confidence instincts from cross-project contamination
- Auto-promotion at 0.8 is automatic and cannot be manually triggered early

## Confidence Discipline

- Set confidence based on observation count, not desired certainty
- First observation: 0.3–0.4 max
- Repeated confirmation in same project: increment by 0.1–0.15 per validation
- Cross-project confirmation: increment by 0.2
- Never skip directly to 0.8 without evidence

## Anti-Patterns

- Never record compound behaviors — split into atomic instincts
- Never set confidence to 0.9 without at least 3 independent confirmations
- Never ignore promoted instincts during task planning
- Never bypass auto-promotion by directly editing instincts.jsonl

## Integration Points

- `memory-search` — query existing knowledge before recording new instincts
- `reflection-agent` — surfaces instincts worth recording after task completion
- `session-handoff` — includes high-confidence instincts in handoff context

## When to Invoke

```javascript
Skill({ skill: 'instinct-learning' });
```

Invoke when an agent observes a reliable pattern that should persist beyond the current session.
