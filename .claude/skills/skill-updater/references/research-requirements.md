# Research Requirements for skill-updater

## Mandatory Inputs

- Target skill name/path
- Trigger (`reflection`, `evolve`, `manual`)
- Current gap statement (what is stale or failing)

## Research Protocol (Exa/arXiv + Internal)

1. Exa-first: 3+ focused queries on current best practices for the skill domain.
2. arXiv/canonical source: at least one source for methodology-heavy refreshes (TDD, eval harnesses, agent quality loops, memory/RAG behavior).
3. Internal parity: verify current implementation with `pnpm search:code`, `ripgrep`, semantic/structural search skills.
4. Optional external benchmark parity: invoke `assimilate` when external frameworks materially differ.

## Output Requirement

Produce a refresh report with:

1. Current-state findings
2. Source-backed gaps
3. TDD backlog (RED/GREEN/REFACTOR/VERIFY)
4. Integration updates required (catalog, CLAUDE, agent assignments, indexes)
