---
description: Prevents agent from getting stuck on complex inline shell commands
globs: ["**/*"]
alwaysApply: true
---

# Shell Command Safety Rules

## Problem
Complex `node -e` one-liners operating on large files (e.g., multi-MB JSON) frequently timeout or get killed in PowerShell, causing the agent to appear "stuck."

## Rules

1. **Simple checks only in `node -e`**: Single-operation commands like JSON.parse validation, key counting, or property reads. Max ~200 chars of JS logic.

2. **Write a temp script for complex work**: If the logic involves recursion, regex on large strings, multi-step transforms, or nested loops — write it to a `.cjs` file first, execute it, then delete it.

   ```bash
   # BAD: complex recursive cleanup in a one-liner
   node -e "function clean(o){if(Array.isArray(o)){...recursive...}...} ..."

   # GOOD: write to temp file, run, delete
   # 1. fsWrite to .claude/context/tmp/_fix.cjs
   # 2. node .claude/context/tmp/_fix.cjs
   # 3. deleteFile .claude/context/tmp/_fix.cjs
   ```

3. **Always set a timeout** on shell commands that touch large files: use `timeout: 15000` (15s) as a safety net.

4. **Avoid regex on full stringified JSON**: For large JSON files, use parsed object traversal instead of string matching. If you must search raw text, use `grepSearch` tool instead of in-process regex.

5. **One concern per command**: Don't combine validation + mutation + reporting in a single command. Split them.
