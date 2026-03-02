# agent-evaluation Rules

## Purpose

LLM-as-judge evaluation framework with 5-dimension rubric (accuracy, groundedness, coherence, completeness, helpfulness) for scoring AI-generated content quality with weighted composite scores and evidence citations

## Best Practices

- Always evaluate all 5 dimensions before computing composite score
- Cite specific evidence from the output being evaluated for each dimension score
- Use the weighted composite (not simple average) for final verdict
- Pair with verification-before-completion for pre-completion quality gates
- Document evaluation verdicts in task metadata for traceability

## Integration Points

See SKILL.md for complete documentation.
