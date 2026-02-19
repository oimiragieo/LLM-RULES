# skill-updater Skill Workflow

> Source of truth: `.claude/workflows/updaters/skill-updater-workflow.yaml`. This file is a short summary.

1. Resolve target skill and classify trigger (`reflection`, `evolve`, `manual`, `stale_skill`).
2. Ground with `framework-context` + memory files.
3. Run `research-synthesis` (Exa/arXiv/internal parity checks).
4. Optionally run `assimilate` for external benchmark parity.
5. Build RED/GREEN/REFACTOR/VERIFY backlog.
6. Apply updates with minimal patch set and rerun failing tests.
7. Validate integration + regenerate skill/agent registries.
8. Record learnings and, if unresolved gaps remain, invoke `recommend-evolution`.
