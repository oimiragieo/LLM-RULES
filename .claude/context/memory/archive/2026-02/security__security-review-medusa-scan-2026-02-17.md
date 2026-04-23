<!-- Agent: security-architect | Task: #7 | Session: 2026-02-17 -->

# Security Review: Medusa Scan

- Generated: 2026-02-17T07:04:50.296Z
- Project: `C:/dev/projects/agent-studio`
- Medusa Installed: **yes**
- Medusa Version: **2026.3.0**
- Files Scanned (manual checks): **485**

## Severity Breakdown

| Source   | Critical | High | Medium | Low | Total |
| -------- | -------- | ---- | ------ | --- | ----- |
| Medusa   | 0        | 0    | 0      | 0   | 0     |
| Manual   | 0        | 1    | 172    | 0   | 173   |
| Combined | 0        | 1    | 172    | 0   | 173   |

## Top Findings

| Severity | Rule                  | File                                                                | Line | Message                                         |
| -------- | --------------------- | ------------------------------------------------------------------- | ---- | ----------------------------------------------- |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/memory/sync-memory-index.cjs                          | 180  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-RAW_JSON_PARSE | .claude/hooks/monitoring/\_archive/execution-limit-monitor-hook.cjs | 94   | Raw `JSON.parse` usage (prefer `safeParseJSON`) |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/reflection/unified-reflection-events.cjs              | 290  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/reflection/unified-reflection-events.cjs              | 312  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/reflection/unified-reflection-events.cjs              | 332  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified-completion.helpers.cjs      | 66   | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified-completion.helpers.cjs      | 72   | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified.helpers.cjs                 | 103  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified.helpers.cjs                 | 151  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified.helpers.cjs                 | 171  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/post-task-unified.helpers.cjs                 | 189  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/pre-tool-unified.guardrails.cjs               | 118  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/routing/pre-tool-unified.guardrails.cjs               | 122  | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-RAW_JSON_PARSE | .claude/hooks/safety/shell-injection-validator.cjs                  | 425  | Raw `JSON.parse` usage (prefer `safeParseJSON`) |
| MEDIUM   | MANUAL-EXEC_SYNC      | .claude/hooks/validation/check-console-log.cjs                      | 19   | Blocking shell execution (`execSync`)           |
| MEDIUM   | MANUAL-EXEC_SYNC      | .claude/hooks/validation/check-console-log.cjs                      | 29   | Blocking shell execution (`execSync`)           |
| MEDIUM   | MANUAL-EXEC_ASYNC     | .claude/hooks/validation/subagent-citation-guard.cjs                | 16   | Shell command execution (`exec`)                |
| MEDIUM   | MANUAL-RAW_JSON_PARSE | .claude/hooks/workflow/post-creation-integration.test.cjs           | 124  | Raw `JSON.parse` usage (prefer `safeParseJSON`) |
| MEDIUM   | MANUAL-RAW_JSON_PARSE | .claude/hooks/workflow/post-creation-integration.test.cjs           | 161  | Raw `JSON.parse` usage (prefer `safeParseJSON`) |
| MEDIUM   | MANUAL-RAW_JSON_PARSE | .claude/hooks/workflow/post-creation-integration.test.cjs           | 179  | Raw `JSON.parse` usage (prefer `safeParseJSON`) |

## Notes

- This review intentionally avoids recursive `Glob` calls to prevent ripgrep timeout failures.
- Manual checks cover shell execution risk and unsafe parsing patterns in high-value framework paths.
