<!-- Agent: developer | Task: #skill-updater | Session: 2026-02-15 -->

# Skill-Updater Research Synthesis (2026-02-15)

## Objective

Define a best-practice workflow for refreshing existing skills (not net-new creation) with measurable regression protection, low complexity, and ecosystem consistency.

## External Sources

- Martin Fowler, TDD (2023): https://martinfowler.com/bliki/TestDrivenDevelopment.html
- Kent Beck, Canon TDD (2023): https://tidyfirst.substack.com/p/canon-tdd
- IEEE TDD meta-analysis: https://doi.org/10.1109/TSE.2012.28
- LLM4TDD: https://arxiv.org/abs/2312.04687
- Test-Driven Development for Code Generation: https://arxiv.org/abs/2402.13521
- Tests as Prompt: https://arxiv.org/abs/2505.09027
- SWE-Flow: https://arxiv.org/abs/2506.09003
- TDFlow: https://arxiv.org/abs/2510.23761
- Class-level TDD generation: https://arxiv.org/abs/2602.03557
- Automated structural testing for LLM agents: https://arxiv.org/abs/2601.18827
- Agent-generated tests analysis: https://arxiv.org/abs/2602.07900
- SWE-Bench Pro: https://arxiv.org/abs/2509.16941

## Synthesis

1. Refresh workflows should remain test-first and regression-gated; avoid broad rewrites.
2. LLM-agent update loops perform best when they combine deterministic test gates with explicit evidence-based planning.
3. For agent frameworks, structural contracts (schemas + hook checks + integration validation) reduce drift.
4. Keep update workflows specialized and thin: target artifact update process should call existing creator/integrator tools instead of re-implementing them.

## Design Decisions for skill-updater

1. Keep `artifact-updater` as generic updater; add `skill-updater` as skill-specific refresh orchestrator.
2. Require `research-synthesis` before refresh recommendations.
3. Add optional `assimilate` for parity benchmarking, not default.
4. Encode TDD stages in output contract for deterministic execution.
5. Reuse existing memory/search/token-saver path rather than introducing new storage systems.

## Simplicity Guardrails

- No new daemon/hook dependency required for v1.
- No changes to citation format (`[mem:*]`, `[rag:*]` remain unchanged).
- No new persistence store; use existing memory files + sync hooks.
