# troubleshooting-regression Skill Rule

1. Always diagnose from debug evidence first, not assumptions.
2. Exclude external MCP startup/auth noise unless the failure is framework-caused.
3. Use hybrid search (`pnpm search:code`) before broad file reads for codebase triage.
4. Use `token-saver-context-compression` only when context pressure is high or logs are too large.
5. Validate each fix with a targeted test and one debug rerun before marking resolved.
