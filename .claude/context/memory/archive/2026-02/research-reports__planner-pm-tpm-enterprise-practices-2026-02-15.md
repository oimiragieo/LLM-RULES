# Planner + PM + TPM Enterprise Practices (2026-02-15)

## Scope

Research pass to update planner/PM orchestration and determine whether a dedicated TPM role is warranted.

## Findings

1. Product specification quality remains a top predictor of delivery flow; explicit epic/story decomposition with measurable acceptance criteria reduces downstream rework.
2. Program-level dependency/risk governance is distinct from product intent and implementation planning, which supports adding a TPM role instead of overloading PM or planner.
3. Agentic software workflows perform better when decomposition, validation gates, and reflection loops are explicit and stage-scoped (aligns with phased enterprise workflow).
4. Search-first context acquisition and evidence-grounded execution should remain mandatory before planning and orchestration output.

## Applied Updates

1. Hardened PM -> Planner handoff contract in `.claude/agents/core/pm.md` and `.claude/agents/core/planner.md`.
2. Added dedicated core agent: `.claude/agents/core/technical-program-manager.md`.
3. Wired router/routing/workflow/docs to recognize TPM and route cross-team dependency/milestone work.
4. Regenerated `.claude/context/agent-registry.json` and validated routing-table tests.

## Sources

- Martin Fowler — TDD: https://martinfowler.com/bliki/TestDrivenDevelopment.html
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- IEEE TSE meta-analysis (Rafique & Misic): https://doi.org/10.1109/TSE.2012.28
- TDFlow (agentic TDD/decomposition): https://arxiv.org/abs/2510.23761
- AgentStepper (SWE agent observability/debugging): https://arxiv.org/abs/2602.06593
- ALAS (validator isolation + localized repair): https://arxiv.org/abs/2511.03094
- AFlow (automatic workflow synthesis/search): https://arxiv.org/abs/2410.10762
- GitHub Docs — About Projects: https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
- GitHub Blog — Planning and tracking with templates: https://github.blog/developer-skills/github/use-your-project-as-a-source-of-truth-for-planning-and-tracking-work/
- DORA metrics overview: https://cloud.google.com/architecture/devops/devops-measurement-metrics
