# Advanced Elicitation Research Requirements (2026)

## Verified Reasoning Frameworks

- **Chain of Verification (CoVe)**: A 4-stage pipeline: Draft -> Plan Verification -> Verify Independently -> Revise. Proven to increase FACTSCORE by ~15%.
- **Meta-Prompting**: Uses a 'Conductor' model to decompose tasks and manage independent 'Expert' sub-queries. Optimized for task-agnostic scaffolding.
- **Dialectical Cognition Framework (DCF)**: Emphasizes _questioning over extraction_ using Socratic dialogue to surface hidden assumptions.
- **Meta Chain-of-Thought (Meta-CoT)**: Models the _underlying reasoning_ required to arrive at a conclusion, not just the steps.

## Implementation Levers

- **Reasoning Effort**: 2026 models support `low`, `medium`, and `high` effort levers. High effort is mandatory for architectural audits.
- **Thought Anchors**: Prioritize sentences involving 'backtracking' or 're-planning' as they disproportionately affect outcome quality.
- **System 2 Transition**: Moving from stimulus-response (System 1) to deliberative, recursive loops (System 2).

## Source References

- [Chain of Verification (Meta AI)](https://moazharu.medium.com/chain-of-verification-the-prompting-pattern-that-makes-llm-answers-check-themselves-f9563ea9e960)
- [Meta-Prompting (Stanford/Google)](https://github.com/suzgunmirac/meta-prompting)
- [Architecture of Thought (DCF Framework)](https://github.com/domelic/architecture-of-thought)
- [Thought Anchors Research (arXiv:2506.19143)](https://arxiv.org/abs/2506.19143)
