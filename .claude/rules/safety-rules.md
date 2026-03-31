---
description: Safety rules — sharp edges, shell command hygiene, and file deletion discipline
globs: ['**/*']
alwaysApply: true
---

# Safety Rules

## Sharp Edges — Hazard Patterns

### SE-01: Windows Backslash Paths

- `path.relative()` returns `\` on Windows — NEVER use in regex or glob patterns
- ALWAYS normalize: `.replace(/\\/g, '/')`
- Use `[^/\\]*` in regex if normalization is uncertain

### SE-02: Prototype Pollution

- NEVER use `JSON.parse()` directly on untrusted input — use `safeParseJSON()` from `.claude/lib/utils/safe-json.cjs`
- Filter `__proto__`, `constructor`, `prototype` keys before merging objects

### SE-03: Hook Exit Codes

- Hooks must exit `0` (allow) or `2` (block) — exit `1` is treated as error, NOT block
- Always wrap hook body in try/catch and exit `0` on unexpected errors

### SE-04: Async Swallowing

- Never `await` inside `forEach` — use `for...of` or `Promise.all(arr.map(...))`
- Always attach `.catch()` to fire-and-forget promises — never let them go unhandled

### SE-05: ReDoS in Glob-to-Regex

- Glob patterns converted to regex must escape special chars FIRST, then convert `**`/`*`
- `**/dir/**` → `(.*/)?dir(/.*)?` (leading `**/` optional, trailing `/**` optional)
- Never use `[^/]*` without confirming paths are normalized to forward slashes

### SE-06: DST Arithmetic

- Never add/subtract fixed milliseconds for day-boundary calculations — use date libraries
- `Date.now() + 86400000` is wrong across DST boundaries

### SE-07: Array Mutation During Iteration

- Never splice/push/pop an array you are currently iterating with `for...of` or `forEach`
- Copy the array first: `[...arr].forEach(...)` or collect mutations, apply after loop

## Shell Command Safety

Complex `node -e` one-liners on large files frequently timeout in PowerShell.

1. **Simple checks only in `node -e`**: Single-operation commands. Max ~200 chars of JS logic.

2. **Write a temp script for complex work**: If logic involves recursion, regex on large strings, multi-step transforms — write to a `.cjs` file first, execute it, then delete it.

   ```bash
   # GOOD: write to temp file, run, delete
   # 1. fsWrite to .claude/context/tmp/_fix.cjs
   # 2. node .claude/context/tmp/_fix.cjs
   # 3. deleteFile .claude/context/tmp/_fix.cjs
   ```

3. **Always set a timeout** on shell commands that touch large files: use `timeout: 15000` (15s).

4. **Avoid regex on full stringified JSON**: Use parsed object traversal; use `grepSearch` tool for text search.

5. **One concern per command**: Don't combine validation + mutation + reporting. Split them.

## File Deletion Safety

### Untracked Files Are NOT Disposable (IRON LAW)

**NEVER delete untracked files without explicit user confirmation.**

Untracked files (`??` in `git status`) are often in-progress work. Deleting them destroys work permanently — no git recovery.

### Before ANY File Deletion

1. **Check if tracked:** `git ls-files <path>` — if empty, the file is untracked
2. **If untracked:** ASK the user before deleting. No exceptions.
3. **If tracked:** Deletion is recoverable via git, but still confirm for non-trivial files

### Rules

- Never bulk-delete untracked files during cleanup
- Never assume untracked files are "test artifacts" or "stale"
- `git clean` is FORBIDDEN without explicit user request
- When cleaning up a working tree, only revert tracked file changes — leave untracked files alone

### Anti-Patterns (NEVER)

- `rm` on untracked files without asking
- Assuming `??` status means "safe to delete"
- Batch-deleting files matching a pattern without reviewing each
