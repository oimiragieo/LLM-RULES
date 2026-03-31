# Cleanup Always

Every agent MUST run this cleanup scan at the end of any task that modifies files. No exceptions.

## Step 1: Project Root Scan

Check for unexpected files in the project root. Anything outside: `.`, `node_modules`, `src`, `tests`, `scripts`, `dist`, `build`, `docs`, `.claude`, `.git`, `package.json`, `pnpm-lock.yaml`, `tsconfig.*`, `eslint.*`, `prettier.*`, `README`, `LICENSE`, `CHANGELOG`, `CLAUDE.md`, `.env*`, `.gitignore` — is AI slop. Delete or move it before marking complete.

## Step 2: Temp Directory Check

Delete any temp files in `.claude/context/tmp/` older than the current session. Temp files do not persist across sessions.

## Step 3: Stale Worktree Check

Run `git worktree prune`. Any `worktree-agent-*` branch not currently active should be pruned.

## Step 4: Reflection Logging

If slop was found, log to `.claude/context/runtime/session-gap-log.jsonl` with `type:"cleanup"` and append a reflection request to `.claude/context/runtime/reflection-spawn-request.json` with `trigger:"ai-slop-found"`.

## AI Slop Patterns

`*-debug*.txt/log`, `debug-*.json`, `dump-*.cjs/js/json`, `rename_*.cjs`, `test-out.txt`, `lint-output.txt`, UUID-named temp files, `*.analysis.md` (outside `.claude/context/`), any `.cjs/.js/.mjs` not in `package.json`, any `.md` not `README/CLAUDE/LICENSE/CHANGELOG`.

## Correct File Locations

Debug/temp → `.claude/context/tmp/` | Reports → `.claude/context/reports/` | Plans → `.claude/context/plans/` | Research → `.claude/context/artifacts/research-reports/` | Lint output → stdout only (never persisted)

## Related References

- `.claude/rules/safety-rules.md` — Do not delete untracked files without confirmation
- `.claude/rules/workspace-conventions.md` — Canonical file placement rules
