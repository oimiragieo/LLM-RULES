# skill-updater Skill Workflow

1. Resolve target skill and classify trigger (`reflection`, `evolve`, `manual`).
2. Ground with `framework-context` + memory files.
3. Run `research-synthesis` (Exa/arXiv/internal parity checks).
4. Optionally run `assimilate` for external benchmark parity.
5. Build RED/GREEN/REFACTOR/VERIFY backlog.
6. Apply updates with minimal patch set and rerun failing tests.
7. Validate integration + regenerate skill/agent registries.
8. Record learnings and, if unresolved gaps remain, invoke `recommend-evolution`.
