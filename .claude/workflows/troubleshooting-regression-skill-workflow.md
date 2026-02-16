# troubleshooting-regression Skill Workflow

1. Reproduce with `claude -p "<prompt>" -d` (or select latest debug log).
2. Run trace query first: `pnpm trace:query --trace-id <traceId> --compact --since <ISO-8601> --limit 200` (or `--component` + `--event` fallback).
3. Analyze debug log using `node .claude/skills/troubleshooting-regression/scripts/main.cjs`.
4. Classify findings by owner hook/module and severity.
5. Patch smallest safe fix and add regression test.
6. Run targeted tests + lint/format for touched scope.
7. Re-run debug prompt and confirm non-reproduction.
8. Record learnings/issues in memory artifacts, including trace id(s) and trace-query command used.
