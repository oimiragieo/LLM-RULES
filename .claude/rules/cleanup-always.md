# Cleanup Always

Every agent MUST run this cleanup scan at the end of any task that modifies files.
No exceptions. Slop in the project root is a framework health failure.

## Step 1: Project Root Scan

```bash
ls -1 C:/dev/projects/agent-studio/ | grep -vE '^(\.|node_modules|src|tests|scripts|dist|build|docs|\.claude|\.git|package\.json|package-lock\.json|pnpm-lock\.yaml|tsconfig.*|eslint.*|prettier.*|jest.*|vitest.*|README|LICENSE|CHANGELOG|CLAUDE\.md|\.env.*|\.gitignore|\.npmrc|\.nvmrc|\.node-version)$'
```

If this outputs ANYTHING — those files are slop. Delete or move them before marking the task complete.

## Step 2: Temp Directory Check

```bash
ls -1 C:/dev/projects/agent-studio/.claude/context/tmp/ 2>/dev/null | head -20
```

Delete any files older than the current session. Temp files do not persist across sessions.

## Step 3: Stale Worktree Check

```bash
git worktree prune
git worktree list
```

Any worktree with a branch matching `worktree-agent-*` that is not currently active should be pruned. The `git worktree prune` command handles this automatically.

## Step 4: Reflection Logging

If you found and deleted slop in Steps 1–2, log it to the session gap log:

```bash
echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","type":"cleanup","agent":"<your-agent-type>","description":"Deleted AI slop from project root: <filenames>","context":"end-of-task cleanup scan"}' >> .claude/context/runtime/session-gap-log.jsonl
```

If slop was found, also queue a reflection so the root cause is investigated:

```json
// Append to .claude/context/runtime/reflection-spawn-request.json
{
  "id": "<uuid>",
  "trigger": "ai-slop-found",
  "priority": "low",
  "context": "Cleanup scan found unexpected files in project root: <filenames>. Investigate which agent/task created them and add guardrails."
}
```

## What Counts as AI Slop?

Files that should NOT exist in the project root after a task completes:

- `*-debug*.txt`, `*-debug*.log`, `debug-*.json`
- `dump-*.cjs`, `dump-*.js`, `dump-*.json`
- `rename_*.cjs`, `revert_*.cjs`, `update_*.cjs`
- `test-out.txt`, `lint-output.txt`, `eslint.json`, `errors.json`
- Files matching `[0-9a-f]{8}-[0-9a-f]{4}-*` (UUID-named temp files)
- `new_session_analysis.md`, `*.analysis.md` (unless in `.claude/context/`)
- Any `.cjs`, `.js`, `.mjs` file that is not in `package.json` scripts or tracked as a project source file
- Any `.md` file that is not `README.md`, `CLAUDE.md`, `LICENSE`, or `CHANGELOG.md`

## Where Files SHOULD Go

| File Type         | Correct Location                           |
| ----------------- | ------------------------------------------ |
| Debug output      | `.claude/context/tmp/`                     |
| Analysis reports  | `.claude/context/reports/`                 |
| Plans             | `.claude/context/plans/`                   |
| Research          | `.claude/context/artifacts/research-reports/` |
| One-off scripts   | `.claude/tools/cli/` (if kept) or deleted  |
| Test output       | `.claude/context/tmp/` or deleted          |
| Lint output       | Never persisted — pipe to stdout only      |

## Related References

- `.claude/skills/finishing-a-development-branch/SKILL.md` — Cleanup Scan phase
- `.claude/skills/proactive-audit/SKILL.md` — Root Cleanliness Check
- `.claude/rules/file-deletion-safety.md` — Do not delete untracked files without confirmation
- `.claude/rules/workspace-conventions.md` — Canonical file placement rules
