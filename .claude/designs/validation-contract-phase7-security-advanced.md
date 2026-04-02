# Validation Contract: Phase 7 — Security & Advanced Integration

> **Status**: Draft
> **Date**: 2026-03-31
> **Scope**: Security hardening, hook input/routing features, and agent frontmatter enhancements
> **Source Files**:
>
> - `.claude/hooks/safety/unified-pre-write-hook.cjs` (write validation hook)
> - `.claude/hooks/safety/bash-command-validator.cjs` (bash validation)
> - `.claude/schemas/agent-definition.schema.json` (agent frontmatter schema)
> - `.claude/lib/routing/denial-feedback-reader.cjs` (denial log reader)
>   **Reference**: `claude-code-main/feature-review2026.md` §12, §30, §37

---

## Milestone 1 — Security Hardening (`VAL-SH-*`)

### VAL-SH-001: Case-normalized path comparison in write hook

The `file-placement-guard` check in `unified-pre-write-hook.cjs` normalizes file paths to lowercase before comparing against protected path patterns on case-insensitive filesystems (Windows, macOS).

**Pass condition**: A write to `.cLauDe/hooks/safety/evil.cjs` is blocked identically to `.claude/hooks/safety/evil.cjs`. The guard calls `.toLowerCase()` (or equivalent) on the normalized path before testing against `disallowedPatterns`.

**Fail condition**: `.cLauDe/hooks/` bypasses the `/\.claude\/` regex because the mixed-case path does not match the lowercase pattern.

**Evidence**: Unit test submits tool input with `file_path: '.cLauDe/hooks/safety/evil.cjs'`. Assert the check returns `{ pass: false, result: 'block' }`.

---

### VAL-SH-002: Case normalization covers all protected-path regexes

Every regex in the `disallowedPatterns` array and every path comparison in `SECURITY_CRITICAL_PATTERNS` uses the case-normalized path, not the raw input.

**Pass condition**: Paths `.GIT/config`, `NODE_MODULES/pkg/index.js`, and `.Claude/Context/Code-Index/x` are all blocked.

**Fail condition**: Any mixed-case variant of a protected path passes the guard.

**Evidence**: Unit test loops over `['.GIT/config', 'NODE_MODULES/pkg/index.js', '.Claude/Context/Code-Index/x']` and asserts each returns `{ pass: false }`.

---

### VAL-SH-003: UNC path blocking in write hook

The `file-placement-guard` check rejects file paths starting with `\\` or `//` (UNC paths) to prevent NTLM credential leaks on Windows.

**Pass condition**: A write to `\\\\evil-server\\share\\payload.js` is blocked with a message mentioning "UNC" or "network path".

**Fail condition**: UNC paths pass through to the remaining checks and are evaluated as relative paths.

**Evidence**: Unit test submits `file_path: '\\\\server\\share\\file.js'`. Assert `{ pass: false, result: 'block' }` with message matching `/UNC|network.path/i`.

---

### VAL-SH-004: UNC blocking covers forward-slash variant

UNC paths using forward slashes (`//server/share/file`) are also blocked, since `path.resolve()` on Windows normalizes these to backslash UNC paths.

**Pass condition**: `//evil-server/share/payload.js` is blocked.

**Fail condition**: Only backslash UNC paths are caught; forward-slash variants pass.

**Evidence**: Unit test submits `file_path: '//server/share/file.js'`. Assert block result.

---

### VAL-SH-005: Bash validator patterns aligned with CC dangerousPatterns

The bash command validator (via `validators/registry.cjs`) blocks or flags all commands from Claude Code's `dangerousPatterns.ts` list: `python`, `python3`, `node`, `deno`, `tsx`, `ruby`, `perl`, `php`, `lua`, `npx`, `bunx`, `eval`, `exec`, `sudo`, `ssh`.

**Pass condition**: For each command prefix in the CC dangerous patterns list, submitting that prefix as a bare command (e.g., `eval "rm -rf /"`) through `validateCommand()` returns `{ valid: false }` or the bash-command-validator exits 2.

**Fail condition**: Any CC dangerous-pattern command is accepted without validation.

**Evidence**: Unit test iterates the CC dangerous patterns list. For each, calls `validateCommand('<pattern> test_payload')` and asserts `valid === false` or a warning/block result. Document any intentional allowlist exceptions (e.g., `node --version` may be safe-listed).

---

### VAL-SH-006: Bash validator does not over-block safe substrings

The dangerous-pattern matching uses word boundaries or command-position detection, not naive substring matching.

**Pass condition**: Commands like `echo "this is not a python script"`, `cat nodejs-readme.md`, and `git log --oneline` are NOT blocked by the dangerous-pattern check.

**Fail condition**: Innocent commands containing "python", "node", or "exec" as substrings are blocked.

**Evidence**: Unit test submits `['echo "python is great"', 'cat nodejs.txt', 'git log --oneline']` and asserts all pass validation.

---

### VAL-SH-007: Write hook protected paths aligned with CC filesystem.ts

The `file-placement-guard` and `SECURITY_CRITICAL_PATTERNS` in `unified-pre-write-hook.cjs` cover all paths from CC's `filesystem.ts` protected list: `.gitconfig`, `.gitmodules`, `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`, `.ripgreprc`, `.mcp.json`, `.claude.json`, plus directories `.git`, `.vscode`, `.idea`, `.claude`.

**Pass condition**: Writes to each of the above files (at project root or home directory) trigger a block or elevated permission check. The `.claude` directory is already covered; the others must be added or verified.

**Fail condition**: Any file from CC's protected list can be written without a block or warning from the write hook.

**Evidence**: Unit test submits writes to each CC-protected path. Assert each returns block or warn result. Document which are new additions vs already covered.

---

### VAL-SH-008: Path traversal blocks cover encoded variants

The existing `..` traversal check also catches URL-encoded (`%2e%2e`) and backslash-mixed (`..\\`) traversal attempts.

**Pass condition**: Paths containing `%2e%2e/`, `..\\`, and `.\\.\\` are all blocked.

**Fail condition**: Only literal `..` is checked; encoded or backslash variants bypass the guard.

**Evidence**: Unit test submits `['foo/%2e%2e/etc/passwd', 'foo/..\\\\bar', 'foo/.\\\\./bar']` and asserts all blocked.

---

## Milestone 2 — Hook Input & Routing (`VAL-HR-*`)

### VAL-HR-001: Bash hook returns updatedInput to inject safety prefixes

The bash-command-validator hook returns a `hookSpecificOutput.updatedInput` field to prepend safety prefixes to commands (e.g., `set -euo pipefail` for multi-line bash scripts) when the command lacks explicit error handling.

**Pass condition**: A multi-line bash command without `set -e` produces hook output containing `updatedInput.command` starting with `set -euo pipefail;\n`. Single-line commands and commands already containing `set -e` are unchanged.

**Fail condition**: The hook only blocks/allows but never modifies the command via `updatedInput`.

**Evidence**: Unit test invokes the hook with `{ tool_name: 'Bash', tool_input: { command: 'echo a\necho b' } }`. Assert stdout JSON includes `hookSpecificOutput.updatedInput.command` starting with `set -euo pipefail`.

---

### VAL-HR-002: updatedInput preserves original command when no prefix needed

When the command already has `set -e` or is a single-line command, the hook does not inject `updatedInput` (or returns it unchanged).

**Pass condition**: `{ command: 'git status' }` produces no `updatedInput` in hook output. `{ command: 'set -e; echo a\necho b' }` also produces no `updatedInput`.

**Fail condition**: Single-line commands or already-safe commands get unnecessary prefixes.

**Evidence**: Unit test asserts `hookSpecificOutput` is absent or `updatedInput` is absent for single-line and already-safe commands.

---

### VAL-HR-003: Denial feedback integrated into routing suggestions

When `denial-feedback-reader.cjs`'s `getDenialFeedback()` reports ≥3 denials for a specific tool, the routing system (or a routing hook) uses this data to suggest alternative agents that don't require the denied tool.

**Pass condition**: Given a `denial-log.json` with 3+ entries for tool `Bash`, the routing feedback includes a `suggestions` array with at least one agent name that does not list `Bash` in its tools.

**Fail condition**: Denial counts are tracked but never surfaced as routing suggestions.

**Evidence**: Seed `denial-log.json` with 3 entries `{ tool: 'Bash', reason: 'denied' }`. Call a routing feedback function. Assert response includes `suggestions` with ≥1 agent entry. Verify suggested agents lack `Bash` in their `tools` frontmatter.

---

### VAL-HR-004: Denial feedback gracefully handles empty or missing log

When `denial-log.json` is absent, empty, or corrupted, the routing feedback returns an empty suggestion set without crashing.

**Pass condition**: `getDenialFeedback()` with missing file returns `{ totalDenials: 0, suggestions: [], fileExists: false }`. No exceptions thrown.

**Fail condition**: Missing file causes a crash or unhandled error in the routing integration.

**Evidence**: Delete `denial-log.json`. Call routing feedback. Assert empty result with `fileExists: false`. Repeat with an empty file and with `{invalid json}`.

---

### VAL-HR-005: suppressOutput on verbose security hooks

Security hooks that produce verbose diagnostic output (bash-command-validator block messages, write-content-scanner warnings) set `suppressOutput: true` in their hook response to prevent cluttering the agent's conversation context.

**Pass condition**: When bash-command-validator blocks a command, the hook's JSON stdout includes `"suppressOutput": true` alongside the block decision. The formatted block box is written to stderr (for human debugging) but not injected into the agent's context.

**Fail condition**: Block messages appear in the agent's conversation as `additionalContext`, consuming context window tokens.

**Evidence**: Unit test captures both stdout and stderr from the hook on a blocked command. Assert stdout JSON has `suppressOutput: true`. Assert stderr contains the formatted block box. Assert stdout does NOT contain the block box text.

---

### VAL-HR-006: suppressOutput not set on allow decisions

When hooks allow a command (exit 0), `suppressOutput` is not set (or is `false`), ensuring normal hook advisory messages can still flow through.

**Pass condition**: A safe command produces hook output without `suppressOutput: true`.

**Fail condition**: All hook responses include `suppressOutput: true`, silencing legitimate advisory messages.

**Evidence**: Unit test invokes bash hook with `git status`. Assert stdout JSON does not contain `suppressOutput: true`.

---

## Milestone 3 — Agent Enhancements (`VAL-AE-*`)

### VAL-AE-001: disallowedTools enforced in agent frontmatter schema

The `agent-definition.schema.json` validates `disallowedTools` as an array of strings with `maxItems: 100`. The prompt assembler reads `disallowedTools` from frontmatter and excludes those tools from the agent's available tool pool.

**Pass condition**: An agent with `disallowedTools: ["Bash", "Write"]` in frontmatter, when assembled via `assembleSpawnPrompt()`, produces a tool section that does NOT contain `Bash` or `Write`. Schema validation passes for the frontmatter.

**Fail condition**: `disallowedTools` is accepted by the schema but ignored by the prompt assembler, or blocked tools still appear in the assembled prompt.

**Evidence**: Unit test creates agent config with `disallowedTools: ['Bash']`. Calls prompt assembler. Asserts `AVAILABLE_TOOLS` section does not contain `Bash`. Validates frontmatter against schema — no errors.

---

### VAL-AE-002: disallowedTools and tools do not conflict silently

If a tool appears in both `tools` and `disallowedTools`, the schema validator or assembler raises a warning/error rather than silently including or excluding it.

**Pass condition**: Frontmatter with `tools: ["Bash", "Read"]` and `disallowedTools: ["Bash"]` either fails schema validation or produces a logged warning during assembly. The tool is excluded (disallow wins).

**Fail condition**: The conflict is silently ignored and the tool is included.

**Evidence**: Unit test creates conflicting frontmatter. Asserts either schema validation error or assembler warning log. Asserts `Bash` is NOT in the final tool pool.

---

### VAL-AE-003: mcpServers field in agent frontmatter schema

The `agent-definition.schema.json` includes an `mcpServers` property that allows per-agent MCP server scoping. The field accepts an array of server name strings.

**Pass condition**: Schema validation passes for `mcpServers: ["filesystem", "github"]`. The field is typed as `{ type: "array", items: { type: "string" }, maxItems: 20 }`.

**Fail condition**: `mcpServers` is rejected by schema validation, or accepts non-string items.

**Evidence**: Validate `{ frontmatter: { name: "test", description: "...", mcpServers: ["fs"] }, content: "..." }` against schema — passes. Validate with `mcpServers: [123]` — fails. Validate with `mcpServers: "not-array"` — fails.

---

### VAL-AE-004: mcpServers scoping propagated to spawn prompt

When an agent's frontmatter includes `mcpServers`, the prompt assembler's MCP section only includes instructions for the specified servers, not all registered MCP servers.

**Pass condition**: Agent with `mcpServers: ["github"]` produces an MCP section mentioning only `github` server. A server named `filesystem` (registered globally) does NOT appear in this agent's prompt.

**Fail condition**: All MCP servers are included regardless of per-agent scoping.

**Evidence**: Unit test mocks MCP registry with `["github", "filesystem", "slack"]`. Creates agent with `mcpServers: ["github"]`. Asserts assembled prompt's MCP section contains `github` but not `filesystem` or `slack`.

---

### VAL-AE-005: fork_eligible field in agent frontmatter schema

The `agent-definition.schema.json` includes a `fork_eligible` boolean field (`default: false`) to mark agents as candidates for CC's upcoming fork-subagent optimization.

**Pass condition**: Schema validation passes for `fork_eligible: true` and `fork_eligible: false`. Omitting the field defaults to `false`.

**Fail condition**: `fork_eligible` is rejected by the schema, or non-boolean values are accepted.

**Evidence**: Validate frontmatter with `fork_eligible: true` — passes. Validate with `fork_eligible: "yes"` — fails. Validate without the field — passes (default false).

---

## Milestone 4 — Cross-Area Integration (`VAL-CROSS-*`)

### VAL-CROSS-012: Case-normalized paths block mixed-case .claude write + prompt cache stability

End-to-end test: an agent assembled with the prompt assembler (cache-stable tool ordering from Phase 6) attempts to write to `.cLauDe/hooks/evil.cjs`. The write hook blocks it, and the assembled prompt's tool list remains cache-stable across the block-and-retry cycle.

**Pass condition**: (1) Write to `.cLauDe/hooks/evil.cjs` is blocked by the case-normalized guard. (2) The prompt assembled before and after the blocked write attempt produces identical tool sections (no cache break from the security event).

**Fail condition**: The write succeeds, or the security hook event causes a cache-break in the prompt assembler.

**Evidence**: Integration test assembles prompt, simulates write hook check on `.cLauDe/hooks/evil.cjs`, reassembles prompt. Assert write blocked. Assert both prompts' tool sections are byte-identical.

---

### VAL-CROSS-013: Denial tracking feeds routing after security blocks

End-to-end flow: bash-command-validator blocks a dangerous command → PermissionDenied hook logs to `denial-log.json` → `getDenialFeedback()` returns updated counts → routing suggests an alternative agent.

**Pass condition**: After 3 sequential bash blocks, `getDenialFeedback().toolCounts.Bash >= 3` and the routing suggestion includes a non-Bash agent.

**Fail condition**: Blocks don't persist to the denial log, or the log is not read by the routing feedback system.

**Evidence**: Integration test triggers 3 bash blocks via the validator hook. Reads `denial-log.json` — asserts 3 entries. Calls routing feedback — asserts suggestion array is non-empty with an agent that lacks `Bash` tool.

---

### VAL-CROSS-014: suppressOutput prevents security noise in context window budget

End-to-end: a verbose security block with `suppressOutput: true` does NOT contribute to the context-window-monitor's token tracking. The blocked message's tokens are not counted against the agent's context budget.

**Pass condition**: After a bash block with `suppressOutput: true`, the context-window-monitor's next measurement does not include the block message's tokens in its usage calculation.

**Fail condition**: Suppressed output still counts toward context usage, defeating the purpose.

**Evidence**: Integration test records context token count, triggers a verbose bash block with suppressOutput, records context token count again. Assert delta is ≤50 tokens (metadata only, not the full block message).

---

### VAL-CROSS-015: Agent disallowedTools + fork_eligible + mcpServers schema round-trip

End-to-end: an agent definition file with all three new frontmatter fields (`disallowedTools`, `mcpServers`, `fork_eligible`) validates against the schema, assembles into a correct prompt, and the agent file can be round-tripped (read → parse → validate → write → re-read) without data loss.

**Pass condition**: Agent file with `disallowedTools: ["Bash"], mcpServers: ["github"], fork_eligible: true` passes schema validation. Assembled prompt excludes `Bash`, includes only `github` MCP server. Written-and-re-read frontmatter retains all three fields with original values.

**Fail condition**: Any field is lost, corrupted, or ignored during the round-trip.

**Evidence**: Integration test creates agent MD file with all three fields. Parses with frontmatter parser. Validates against schema. Calls prompt assembler. Asserts tool exclusion and MCP scoping. Writes file back. Re-reads and asserts deep equality of frontmatter.

---

## Summary

| Milestone              | ID Range                      | Count  |
| ---------------------- | ----------------------------- | ------ |
| Security Hardening     | VAL-SH-001 – VAL-SH-008       | 8      |
| Hook Input & Routing   | VAL-HR-001 – VAL-HR-006       | 6      |
| Agent Enhancements     | VAL-AE-001 – VAL-AE-005       | 5      |
| Cross-Area Integration | VAL-CROSS-012 – VAL-CROSS-015 | 4      |
| **Total**              |                               | **23** |

### ID Registry

| ID            | Title                                                         |
| ------------- | ------------------------------------------------------------- |
| VAL-SH-001    | Case-normalized path comparison in write hook                 |
| VAL-SH-002    | Case normalization covers all protected-path regexes          |
| VAL-SH-003    | UNC path blocking in write hook                               |
| VAL-SH-004    | UNC blocking covers forward-slash variant                     |
| VAL-SH-005    | Bash validator patterns aligned with CC dangerousPatterns     |
| VAL-SH-006    | Bash validator does not over-block safe substrings            |
| VAL-SH-007    | Write hook protected paths aligned with CC filesystem.ts      |
| VAL-SH-008    | Path traversal blocks cover encoded variants                  |
| VAL-HR-001    | Bash hook returns updatedInput to inject safety prefixes      |
| VAL-HR-002    | updatedInput preserves original command when no prefix needed |
| VAL-HR-003    | Denial feedback integrated into routing suggestions           |
| VAL-HR-004    | Denial feedback gracefully handles empty or missing log       |
| VAL-HR-005    | suppressOutput on verbose security hooks                      |
| VAL-HR-006    | suppressOutput not set on allow decisions                     |
| VAL-AE-001    | disallowedTools enforced in prompt assembler                  |
| VAL-AE-002    | disallowedTools and tools do not conflict silently            |
| VAL-AE-003    | mcpServers field in agent frontmatter schema                  |
| VAL-AE-004    | mcpServers scoping propagated to spawn prompt                 |
| VAL-AE-005    | fork_eligible field in agent frontmatter schema               |
| VAL-CROSS-012 | Case-normalized paths + prompt cache stability                |
| VAL-CROSS-013 | Denial tracking feeds routing after security blocks           |
| VAL-CROSS-014 | suppressOutput prevents security noise in context budget      |
| VAL-CROSS-015 | Agent schema new fields round-trip                            |
