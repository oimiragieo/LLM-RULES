# agent-updater Skill Workflow

1. Resolve target agent path and verify it exists.
2. Run framework grounding (`framework-context`) and research (`research-synthesis`).
3. Produce an exact patch plan:
   - prompt files
   - workflow files
   - hook enforcement points
   - validation commands
4. Produce risk-scored diff (`low|medium|high`) before editing.
5. Execute RED/GREEN/REFACTOR/VERIFY backlog.
6. Validate integration + regenerate agent registry + workflow/skill contract checks.
7. Record learnings and unresolved risks to memory; invoke `recommend-evolution` if net-new artifacts are required.
