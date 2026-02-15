# troubleshooting-regression Implementation Template

## Inputs
- `prompt`: optional reproduction prompt for `claude -p ... -d`
- `logPath`: optional explicit debug log path
- `mode`: `quick|full`
- `strict`: fail if high-severity findings exist

## Steps
1. Resolve debug log path (explicit or latest in `%USERPROFILE%\\.claude\\debug`).
2. Parse lines and filter non-framework MCP noise.
3. Normalize findings with owner file + fix action.
4. Emit actionable JSON summary and strict failure state.
5. Record learnings/issues after fix verification.
