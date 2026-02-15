# TDD Research Requirements (Updated 2026-02-15)

## Intent

Update the `tdd` skill to reflect current canonical TDD and AI-assisted TDD evidence while avoiding workflow overengineering.

## Sources (Exa-first, canonical + arXiv)

1. Martin Fowler, "Test Driven Development" (2023-12-11): https://martinfowler.com/bliki/TestDrivenDevelopment.html
2. Kent Beck, "Canon TDD" (2023-12-11): https://tidyfirst.substack.com/p/canon-tdd
3. Rafique & Misic, IEEE TSE meta-analysis DOI:10.1109/TSE.2012.28
4. LLM4TDD (arXiv:2312.04687): https://arxiv.org/abs/2312.04687
5. Test-Driven Development for Code Generation (arXiv:2402.13521): https://arxiv.org/abs/2402.13521
6. Tests as Prompt (arXiv:2505.09027): https://arxiv.org/abs/2505.09027
7. SWE-Flow (arXiv:2506.09003): https://arxiv.org/abs/2506.09003
8. TDFlow (arXiv:2510.23761): https://arxiv.org/abs/2510.23761
9. Class-level TDD generation (arXiv:2602.03557): https://arxiv.org/abs/2602.03557

## Actionable Constraints

1. Canon sequence is mandatory: scenario list -> one runnable test -> RED -> GREEN -> optional refactor -> repeat.
2. AI workflows must include anti-test-hacking checks and bounded repair loops.
3. Tests should stay short, deterministic, and requirement-facing (tests as executable specification).
4. Repository-scale work should decompose by failing test clusters; class-level work should sequence by method dependencies.
5. Preserve simplicity: no new orchestration subsystem, no mandatory multi-agent decomposition for all tasks.

## Mapping to Skill Artifacts

- `SKILL.md`: Canon loop, AI guardrails, repo/class guidance.
- `hooks/pre-execute.cjs`: input validation for TDD contract shape.
- `hooks/post-execute.cjs`: completion warnings when RED/GREEN evidence is missing.
- `schemas/input.schema.json`: defines invocation contract.
- `schemas/output.schema.json`: defines evidence-based output contract.
- `rules/tdd.md`: concise enforceable operating rules.
- `templates/implementation-template.md`: scenario backlog + evidence-first template.
- `references/tdd-memory-profile.md`: bounded runtime memory acceleration guidance.
- `.claude/workflows/tdd-skill-workflow.md`: concise TDD execution sequence.

## Non-Goals (Simplicity Guard)

- No autonomous test generation engine inside this skill.
- No mandatory mutation testing gate for all repos.
- No forced repository-wide refactor phase.
- No new runtime hook registration in `.claude/settings.json` for this update.
