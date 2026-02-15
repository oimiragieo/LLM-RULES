# troubleshooting-regression Skill Workflow

1. Reproduce with `claude -p "<prompt>" -d` (or select latest debug log).
2. Analyze debug log using `node .claude/skills/troubleshooting-regression/scripts/main.cjs`.
3. Classify findings by owner hook/module and severity.
4. Patch smallest safe fix and add regression test.
5. Run targeted tests + lint/format for touched scope.
6. Re-run debug prompt and confirm non-reproduction.
7. Record learnings/issues in memory artifacts.
