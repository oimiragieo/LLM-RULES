# New Hook Events — Validation Contract

> **Area**: new-hook-events (Mission 5)
> **Scope**: SubagentStart, PermissionDenied, SessionStart hook implementations and cross-area interactions.
> **Generated**: 2026-03-31

---

### VAL-NE-001: SubagentStart hook validates Iron Law compliance without blocking legitimate spawns

The SubagentStart hook inspects the subagent prompt for Iron Law violations (router session attempting to execute tools directly rather than delegating via Task). When a subagent prompt contains only routing/delegation instructions (Task, TaskCreate, TaskList, Read, AskUserQuestion, etc. — the whitelist from `router-tool-lockdown.cjs`), the hook exits 0 with `{ allow: true }`. When the prompt instructs a subagent spawned by the router to directly call banned tools (Bash, Edit, Write, Glob, Grep, WebSearch, WebFetch, mcp__filesystem__*), the hook emits a warning to stderr but still exits 0 (advisory). The hook MUST NOT exit 2 or return `{ allow: false }` for any subagent spawn — it is strictly advisory to avoid blocking legitimate worker agents that are expected to use tools.
Evidence: Unit test feeds the hook with (a) a clean delegation prompt → assert exit 0, no warning; (b) a prompt with "run `Bash(rm -rf /)`" from a router context → assert exit 0 with stderr warning containing "Iron Law"; (c) a worker-agent prompt with Bash/Edit usage → assert exit 0, no warning (workers are allowed tools). Confirm hook script exists at `.claude/hooks/lifecycle/subagent-start-iron-law.cjs` and is registered under `SubagentStart` in `settings.json`.

### VAL-NE-002: SubagentStart hook gracefully handles malformed or missing input

The SubagentStart hook receives subagent metadata via stdin (JSON with fields like `agent_name`, `prompt`, `parent_session`). When stdin is empty, contains invalid JSON, or is missing expected fields, the hook must fail open — exit 0 with `{ allow: true }` — and log the parse error to stderr. It must never crash with an uncaught exception, and must never block the subagent spawn due to its own internal error.
Evidence: Unit test pipes (a) empty string, (b) `"not json"`, (c) `{}` (missing `prompt` field), (d) `null` to the hook's stdin. All four cases exit 0. stderr contains a diagnostic message like `[SUBAGENT_START] Failed to parse input`. No uncaught exception in stderr.

### VAL-NE-003: PermissionDenied hook logs denial patterns to denial-log.json

The PermissionDenied hook receives denial event data (tool name, reason, timestamp) and appends a structured JSON entry to `.claude/context/runtime/denial-log.json`. Each entry contains at minimum: `tool`, `reason`, `timestamp`, and `session_id`. The hook exits 0 (advisory) — it must never interfere with the denial flow itself. If the runtime directory does not exist, the hook creates it. If the file does not exist, the hook creates it with an initial array `[]`.
Evidence: Unit test with a temp `projectRoot`: (a) pipe a valid denial event → assert `denial-log.json` exists and contains one entry with correct fields; (b) pipe a second event → assert array now has 2 entries; (c) verify `runtime/` directory was auto-created. Hook exits 0 in all cases. Confirm hook script exists at `.claude/hooks/lifecycle/permission-denied-logger.cjs` and is registered under `PermissionDenied` in `settings.json`.

### VAL-NE-004: PermissionDenied hook does not grow denial-log.json unboundedly

The denial-log.json file must be bounded. When the entry count exceeds `MAX_DENIAL_LOG_ENTRIES` (default 500, overridable via env var `DENIAL_LOG_MAX_ENTRIES`), the hook trims the oldest entries to keep only the most recent `MAX_DENIAL_LOG_ENTRIES`. The file size must never exceed 1 MB. If the file is corrupted (invalid JSON), the hook resets it to `[]` and logs a warning to stderr rather than crashing.
Evidence: Unit test: (a) pre-populate `denial-log.json` with 500 entries, append one more → assert length is 500 (oldest trimmed); (b) write a corrupt file → hook resets to `[]` with new entry, stderr contains "reset" or "corrupted" message; (c) verify file size < 1 MB after 500 entries. Env var override: set `DENIAL_LOG_MAX_ENTRIES=10`, write 15 entries → assert length is 10.

### VAL-NE-005: PermissionDenied hook does not block or alter the denial flow

The PermissionDenied hook must be strictly advisory (exit 0). If the hook crashes, the denial must still proceed normally — Claude Code's PermissionDenied event fires after the denial has already occurred, so the hook is a passive observer. The hook must complete within its `timeout_ms` (recommended: 5000ms). If file I/O to `denial-log.json` fails (disk full, permissions error), the hook logs the error to stderr and exits 0.
Evidence: Unit test: (a) simulate disk write failure by making `denial-log.json` read-only → hook exits 0, stderr contains I/O error; (b) inject `throw new Error('boom')` in the main logic → verify try/catch wrapper catches it, hook exits 0. Integration: verify `settings.json` registration has `timeout_ms` ≤ 5000 and no `async: false` that could delay the flow.

### VAL-NE-006: SessionStart hook registers watchPaths for critical config files

The SessionStart hook returns a JSON result containing a `watchPaths` array with absolute paths to critical configuration files: `agent-registry.json` (from `.claude/config/`), `settings.json` (from `.claude/`), and the session state directory (`.claude/context/`). These paths must resolve correctly relative to the project root. The hook exits 0 and the `watchPaths` are valid, existing filesystem paths (or their parent directories exist).
Evidence: Unit test: run hook with the project root set to a temp directory containing the expected file structure. Assert output JSON contains `watchPaths` array with ≥3 entries. Each path is absolute (starts with `/` or drive letter on Windows). Each path's parent directory exists on disk. Confirm hook script exists at `.claude/hooks/lifecycle/session-start-watchpaths.cjs` and is registered under `SessionStart` in `settings.json`.

### VAL-NE-007: SessionStart hook does not crash and prevents session from starting

The SessionStart hook is the first hook to fire in any Claude Code session. If it crashes with an uncaught exception or returns malformed JSON, it could prevent the entire session from starting. The hook must wrap all logic in try/catch and return a valid JSON result (`{ allow: true }`) even on internal failure. When `PROJECT_ROOT` cannot be resolved, the hook returns `{ allow: true, watchPaths: [] }` (empty watchPaths, no crash). On Windows, paths in `watchPaths` use the correct path separator and handle drive letters.
Evidence: Unit test: (a) run hook with `PROJECT_ROOT` pointing to a non-existent directory → exit 0, output is `{ allow: true, watchPaths: [] }`; (b) corrupt the hook's required module path → verify try/catch catches MODULE_NOT_FOUND, exits 0; (c) on Windows, assert paths use backslash or forward slash consistently (no mixed separators). Integration: manually add `SessionStart` hook to settings.json, start a Claude Code session → session starts successfully.

### VAL-NE-008: SessionStart watchPaths returns only valid, existing paths

The `watchPaths` array must not contain paths to files or directories that do not exist, as this could cause Claude Code's file watcher to error or waste resources. Before including a path, the hook checks `fs.existsSync()`. Paths that don't exist are omitted with a stderr warning. The array is deduplicated (no duplicate paths).
Evidence: Unit test: (a) create a temp project root with only `settings.json` present (no `agent-registry.json`) → assert `watchPaths` contains settings.json path but NOT agent-registry.json, stderr warns about missing file; (b) assert no duplicate entries in the array; (c) all returned paths pass `fs.existsSync()`.

### VAL-NE-009: All three new hooks are registered in settings.json with correct structure

After implementation, `settings.json` must contain three new hook event categories: `SubagentStart`, `PermissionDenied`, and `SessionStart`. Each must follow the existing registration pattern: array of objects with `matcher` (string) and `hooks` (array of `{ type: "command", command: "cd ... && node .claude/hooks/..." }`). Each registration must include `timeout_ms` (per VAL-HO-005 from hook-overhaul-contract). The `settings.json` file must remain valid JSON after adding these entries. The existing 7 hook event categories (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SessionEnd`, `PreCompact`, `Stop`) must be unmodified.
Evidence: Parse `settings.json` → assert `hooks.SubagentStart`, `hooks.PermissionDenied`, `hooks.SessionStart` exist as arrays. Assert each hook object has `type: "command"`, a `command` string referencing a `.cjs` file, and `timeout_ms` as a number. Assert the 7 pre-existing event categories are unchanged (diff against baseline). Run `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"` → exit 0.

### VAL-NE-010: New hook scripts use project-root.cjs and safeParseJSON consistently

All three new hook scripts must follow established security patterns: (a) resolve project root via `require('../../lib/utils/project-root.cjs')` or `path.resolve(__dirname, '..', '..', '..')` — never `process.cwd()`; (b) parse all stdin JSON via `safeParseJSON` (from `hook-input.cjs`) — never raw `JSON.parse` on untrusted input; (c) output results via `formatResult()` from `hook-input.cjs`; (d) include `'use strict';` at the top.
Evidence: `rg 'process\\.cwd\\(\\)' .claude/hooks/lifecycle/subagent-start-iron-law.cjs .claude/hooks/lifecycle/permission-denied-logger.cjs .claude/hooks/lifecycle/session-start-watchpaths.cjs` returns zero matches. `rg 'JSON\\.parse' <same files>` returns zero matches outside of safeParseJSON wrappers. `rg 'use strict' <same files>` returns one match per file.

---

## Cross-Area Assertions

### VAL-CROSS-NE-001: Hook overhaul consolidation coexists with new event hooks

After the hook-overhaul milestone (VAL-HO-*) consolidates and deduplicates existing hooks, adding 3 new event categories (`SubagentStart`, `PermissionDenied`, `SessionStart`) must not regress any overhaul changes. Specifically: (a) consolidated PostToolUse wildcard hook still fires all 4 sub-functions; (b) consolidated UserPromptSubmit advisory hook still fires all 6 sub-functions; (c) deduplicated `routing-guard.cjs`, `write-pretool-bundle.cjs`, `sync-memory-index.cjs` each have exactly 1 registration; (d) all `timeout_ms` values remain set on existing hooks. The new event categories must be appended after the existing ones in the JSON structure — they do not alter existing arrays.
Evidence: Parse `settings.json` after both milestones complete. Assert VAL-HO-001 through VAL-HO-015 still pass. Assert VAL-NE-009 passes. Run `pnpm test:framework:hooks` → exit 0. Diff `settings.json` before and after new-event-hooks milestone — only additions under `SubagentStart`, `PermissionDenied`, `SessionStart` keys; zero modifications to existing event category arrays.

### VAL-CROSS-NE-002: Rules compression does not break SubagentStart Iron Law references

The rules-compression milestone compresses/minifies `.claude/rules/` files to reduce context window usage. The SubagentStart hook references Iron Law concepts (router tool whitelist, banned tool list) that may be defined in `CLAUDE.md` or `.claude/rules/hooks.md`. After rules compression, the hook's hardcoded tool whitelist (`ROUTER_WHITELISTED_TOOLS` from `router-tool-lockdown.cjs`) must remain the source of truth — the hook must NOT dynamically parse compressed rules files to determine the whitelist. If the whitelist is imported from a shared module, that module must not be affected by rules compression.
Evidence: After rules compression, run SubagentStart hook with a router-context prompt containing banned tools → assert same warning behavior as before compression. Verify hook source imports the whitelist from `router-tool-lockdown.cjs` or defines it inline — not from any `.md` rules file. `pnpm test:framework:hooks` passes after rules compression.

### VAL-CROSS-NE-003: PermissionDenied denial-log.json feeds routing feedback loop

The denial-log.json written by the PermissionDenied hook must be consumable by the routing system for adaptive routing. Specifically: (a) the `user-prompt-unified.core.cjs` routing hook or a new routing-feedback module can read `denial-log.json` and extract denial patterns (e.g., "tool X denied 5 times in 10 minutes → suggest alternative agent"); (b) the JSON schema of each denial entry is stable and documented; (c) when `denial-log.json` is absent or empty, the routing feedback module gracefully returns no suggestions (no crash). This spans the new-hook-events and routing milestones.
Evidence: Unit test: create a `denial-log.json` with 5 entries for the same tool, call the routing feedback function → assert it returns a suggestion or pattern summary. Unit test: call with missing file → assert no error, empty result. Schema test: validate 10 sample denial entries against a JSON schema with required fields (`tool`, `reason`, `timestamp`, `session_id`).

### VAL-CROSS-NE-004: settings.json valid and complete after ALL Mission 5 milestones

After all three Mission 5 milestones complete (rules-compression, hook-overhaul, new-hook-events), `settings.json` must: (a) parse without error via `JSON.parse`; (b) contain all 10 hook event categories (original 7 + SubagentStart + PermissionDenied + SessionStart); (c) retain `version`, `max_tokens`, `env`, `rag_enabled`, `rag_threshold`, `auto_context_pruning`, `mcpServers` top-level keys unchanged; (d) have every hook registration include `timeout_ms`; (e) have no duplicate hook registrations for the same script within the same event category; (f) total hook count is within bounds (40–70 registrations, accounting for consolidation reductions and new additions). This is the final structural integrity gate for the entire mission.
Evidence: `node -e "const s=JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); const cats=Object.keys(s.hooks); console.log('categories:', cats.length, cats); let total=0; for(const c of cats){total+=s.hooks[c].reduce((n,g)=>n+g.hooks.length,0)} console.log('total hooks:', total); const missing=[];for(const c of cats){for(const g of s.hooks[c]){for(const h of g.hooks){if(!h.timeout_ms)missing.push(h.command)}}} console.log('missing timeout_ms:', missing.length)"` — assert categories=10, total hooks in [40,70], missing timeout_ms=0.

---

## Summary Matrix

| ID | Title | Key Risk | Key Files |
|----|-------|----------|-----------|
| VAL-NE-001 | SubagentStart Iron Law compliance | Blocks legitimate spawns | `subagent-start-iron-law.cjs`, `router-tool-lockdown.cjs` |
| VAL-NE-002 | SubagentStart malformed input | Uncaught exception kills spawn | `subagent-start-iron-law.cjs` |
| VAL-NE-003 | PermissionDenied logs denials | Missing denial data | `permission-denied-logger.cjs`, `denial-log.json` |
| VAL-NE-004 | Denial log bounded growth | Unbounded file size | `permission-denied-logger.cjs`, `denial-log.json` |
| VAL-NE-005 | PermissionDenied fail-open | Hook blocks denial flow | `permission-denied-logger.cjs` |
| VAL-NE-006 | SessionStart watchPaths | Invalid paths crash watcher | `session-start-watchpaths.cjs`, `settings.json` |
| VAL-NE-007 | SessionStart crash safety | Session fails to start | `session-start-watchpaths.cjs` |
| VAL-NE-008 | watchPaths validity | Non-existent paths | `session-start-watchpaths.cjs` |
| VAL-NE-009 | Registration in settings.json | Missing/malformed registration | `settings.json` |
| VAL-NE-010 | Security patterns (project-root, safeParseJSON) | Injection / wrong cwd | All 3 new hook scripts |
| VAL-CROSS-NE-001 | Hook overhaul + new events coexistence | Overhaul regressions | `settings.json`, all consolidated hooks |
| VAL-CROSS-NE-002 | Rules compression + SubagentStart | Broken Iron Law references | `subagent-start-iron-law.cjs`, `.claude/rules/` |
| VAL-CROSS-NE-003 | Denial log → routing feedback | Schema mismatch, crash on empty | `denial-log.json`, `user-prompt-unified.core.cjs` |
| VAL-CROSS-NE-004 | settings.json integrity post-Mission 5 | Structural corruption | `settings.json` |
