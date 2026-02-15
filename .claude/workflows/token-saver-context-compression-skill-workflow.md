# token-saver-context-compression Skill Workflow

1. Capture user query and compression mode.
2. Retrieve candidate context with `pnpm search:code`.
3. Run wrapper script in JSON mode with evidence gate enabled.
4. Review MemoryRecord-ready payload grouping (patterns/gotchas/issues/decisions).
5. Persist via MemoryRecord/tool-level write path and verify spawn citation eligibility.
6. Record learnings and validation outcomes.
