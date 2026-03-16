<!-- Project Constitution: operational constraints, not decision records -->
<!-- This file is auto-injected into spawn prompts alongside decisions.md -->

# Agent Studio — Project Constitution

## Technology Stack

- **Runtime:** Node.js >=22.5.0 (required for `node --test` and native fetch)
- **Package manager:** pnpm (never npm or yarn)
- **Module system:** CommonJS (`.cjs` for hooks/lib, `.mjs` for ESM tools)
- **Test runner:** `node --test` (built-in, no Jest or Vitest)
- **Linter/formatter:** ESLint + Prettier via `pnpm lint:fix` and `pnpm format`

## Critical Implementation Rules

1. **safeParseJSON()** — ALWAYS use `.claude/lib/utils/safe-json.cjs` instead of raw `JSON.parse()` on untrusted input. Prevents prototype pollution and crash on malformed JSON.

2. **shell: false** — ALL `child_process.spawn()` calls MUST use `shell: false` with array arguments. Never `shell: true`. Prevents command injection.

3. **Normalize Windows paths** — `path.relative()` returns backslashes on Windows. ALWAYS normalize with `.replace(/\\/g, '/')` before using in regex or glob.

4. **Hook exit codes** — Hooks MUST exit `0` (allow/advisory) or `2` (block). Exit `1` is treated as error, NOT block. Security hooks: fail-closed (`exit 2`). Advisory hooks: fail-open (`exit 0`).

5. **No direct writes to creator paths** — `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `.claude/workflows/`, `.claude/templates/`, `.claude/schemas/` are Gate 4 protected. Use creator skills (`skill-creator`, `agent-creator`, `hook-creator`).

6. **TaskUpdate protocol** — FIRST call `TaskUpdate(in_progress)`, do work, LAST call `TaskUpdate(completed)`. Missing TaskUpdate = invisible progress, duplicate work.

7. **No console.log in production** — Use structured logging or stderr. `check-console-log.cjs` Stop hook enforces this.

## Framework Architecture Invariants

- Router spawns agents via `Task()` — never executes work directly
- Agents are specialists — use the correct agent (technical-writer for docs, qa for tests, devops for deploys)
- Memory writes via `MemoryRecord` tool — never write to `patterns.json`, `gotchas.json`, `open-findings.json` directly
- All hooks in `.claude/hooks/` must handle errors gracefully (safeParseJSON, try/catch)
- Settings.json hook registration requires Claude Code session restart to take effect
