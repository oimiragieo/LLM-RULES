# Agent Studio Troubleshooting Runbook

This guide captures high-frequency failures seen in real debug sessions and the fixes that resolved them.

Use with:

- `.claude/docs/@TASK_TRACKING_GUIDE.md`
- `.claude/docs/@ENFORCEMENT_HOOKS.md`
- `.claude/docs/MEMORY_SYSTEM.md`
- `.claude/docs/@ENVIRONMENT_CONFIG.md`

## 1. Quick Triage Checklist

1. Confirm Step 0 actually ran in debug log.
2. Confirm memory-first behavior before `Task` (core memory reads recorded).
3. Confirm `TaskList` was called before `Task`.
4. Confirm spawned agents call `TaskUpdate(in_progress)` before heavy tools.
5. Check if PreTool hooks are blocking (and why).
6. Separate framework issues from MCP/server startup noise.

## 2. Log-First Commands

PowerShell snippets:

```powershell
$debugDir = Join-Path $env:USERPROFILE ".claude\debug"
$p = Join-Path $debugDir "<session>.txt"
Select-String -Path $p -Pattern "force-step0-execution|reflection-step0-guard|TaskList|TaskUpdate|TASKUPDATE-FIRST|MEMORY-FIRST|READ SAFETY|AGENT-GUARDRAIL|Hook PreToolUse:.*error|Read tool validation error"
```

```powershell
Select-String -Path $p -Pattern "No pending reflections|status\":\"no_pending\"|executePreToolHooks called for tool: TaskUpdate"
```

```powershell
Select-String -Path $p -Pattern "Large direct Read|requires search evidence first|context-compressor|Bash redirection\/heredoc"
```

## 2.1 Trace-First Commands

Use trace data before broad code changes for incident/debug/root-cause work:

```bash
pnpm trace:query --trace-id <traceId> --compact --since <ISO-8601> --limit 200
```

If trace id is unknown:

```bash
pnpm trace:query --component <component-name> --event <event-name> --since <ISO-8601> --limit 200
```

Capture the exact command and trace id(s) in your report so follow-up agents can reproduce the same timeline.

## 3. Known Failure Modes and Fixes

### A. "No tasks/task updates" feeling, but session is running

Symptoms:

- UI appears to skip task status updates.
- Agents run tools directly and output feels detached from task lifecycle.

Check:

- Search for `executePreToolHooks called for tool: TaskUpdate`.
- Search for repeated `TASKUPDATE-FIRST` blocks.

Root causes seen:

- Sparse subagent hook payload missing `allowed_tools` and `task_id`.
- Over-strict `TASKUPDATE-FIRST` default (`block`) caused deadlock loops.

Fixes applied:

- Agent-scope fallback detection:
  - `CLAUDE_AGENT_ID` fallback.
  - Router-state fallback (`taskSpawned`/`mode=agent`).
- Bootstrap fallback to honor spawn-time `in_progress` marker from `pre-task-unified`.
- Safer default for `TASKUPDATE_FIRST_ENFORCEMENT`: `warn`.

### B. Step 0 "not shown" in UI

Symptoms:

- You do not see explicit reflection text in assistant response.

Check:

- In log, confirm:
  - `Checking for pending reflections (Step 0)`
  - `No pending reflections, proceeding with normal flow`
  - `hook:reflection-step0-guard ... status:"no_pending"`

Notes:

- If these lines exist, Step 0 is working even if the response text is concise.
- This is usually presentation/noise, not execution failure.

### C. Random cmd windows opening/closing on Windows

Symptoms:

- Terminal pop-ups during edit/memory indexing.

Root cause seen:

- Detached background `spawn(...)` without `windowsHide: true`.

Fix applied:

- `.claude/hooks/memory/sync-memory-index.cjs` now uses `windowsHide: true` for detached embedding generation.

### D. Repeated noisy Grep failures

Symptoms:

- Frequent `Hook PreToolUse:Grep ... error` entries.
- Agents repeatedly attempt forbidden grep patterns.

Root cause:

- Hybrid search enforcement too strict by default for noisy audit workloads.

Fix applied:

- `hybrid-search-enforcer` default mode changed to `warn`.
- Guidance still emitted, but fewer hard-stop loops.

### E. Wrong task id in injected prompt body (`task-1` placeholders)

Symptoms:

- Spawn payload has one task id, but embedded prompt text mentions another.

Fix applied:

- Spawn prompt task-id normalization rewrites embedded `Task ID`, `taskId`, `task_id` placeholders to the real task id.

### F. "Read tool validation error: File does not exist."

Symptoms:

- Host-level read errors in debug output.

Fix pattern:

- In `pre-tool-unified` read safety:
  - Never allow missing path reads to hit host unchecked.
  - Block with actionable message.
  - Use reflection/report/task-output placeholders only where policy allows.

### G. Task spawn blocked by memory-first enforcement

Symptoms:

- `Task()` denied with `[MEMORY-FIRST]` message.
- Router appears ready to spawn but task does not start.

Root cause:

- No recent core memory read evidence in session governance state.
- Expected reads are:
  - `.claude/context/memory/patterns.json`
  - `.claude/context/memory/gotchas.json`
  - `.claude/context/memory/decisions.md`
  - `.claude/context/memory/issues.md`

Fix:

1. Read one or more core memory files before spawning.
2. Retry `Task()`.
3. If enforcement is too strict for a special flow, temporarily set `TASK_REQUIRE_CORE_MEMORY_READ=off` for that run only.

### H. Large Read blocked by search/token-saver gates

Symptoms:

- `Read` blocked with:
  - `requires search evidence first`, or
  - `Context pressure is high ... invoke context-compressor`.

Root cause:

- Large unwindowed project reads require recent search evidence.
- When token pressure is high, token-saver evidence is required before large reads.

Fix:

1. Run `pnpm search:code -- "<query>" --limit 5` (or hybrid search).
2. Retry `Read` with `offset/limit` (or line window).
3. If prompted, invoke `Skill({ skill: "context-compressor" })` and retry.

### I. Bash artifact-write guard appears inconsistent

Symptoms:

- One hook logs a deny for `cat > .claude/context/reports/backend/...`, but command still executes.

Root cause seen:

- Multi-hook flow where one PreTool hook denies but another path still allows.
- Fixed by enforcing artifact-write blocking in both:
  - `pre-tool-unified` guardrails
  - `bash-command-validator` (inside `bash-pretool-bundle`)

Fix:

1. Verify logs show deny from both paths when testing:
   - `[AGENT-GUARDRAIL] Bash redirection/heredoc ... blocked`
   - `BLOCKED: Dangerous Command Detected ... Bash writes to .claude/context/reports ...`
2. Ensure agents use `Write/Edit` for reports/memory artifacts.

### J. Hook state parsing security regressions

Symptoms:

- Hook crashes or suspicious behavior when runtime state files are malformed.

Root cause:

- Raw `JSON.parse` used on untrusted runtime state.

Fix:

- Use `safeParseJSON` in hooks that parse runtime state files (e.g., governance/token SLO state).

### K. Git status always dirty after tests/runs

Common noisy files:

- `.claude/context/data/memory.db`
- `.claude/context/memory/codebase_map.json`
- test fixture memory metrics/access files

Recommended workflow:

1. Commit only intentional code/test/doc edits.
2. Restore runtime artifacts before commit if they were not part of work.

### L. shadcn MCP HTTP 500

Symptoms:

- MCP server `shadcn` returns HTTP 500 on every connect attempt (e.g. `https://www.shadcn.io/api/mcp`).
- Connection never recovers; stderr shows MCP startup/auth noise.

Root cause:

- External shadcn MCP endpoint may be down, rate-limited, or misconfigured in Cursor/user MCP settings.

Fix:

1. If you do not need shadcn/ui component lookups, **disable the shadcn MCP server** in your Cursor MCP configuration (user or project). Disabling an unused MCP server is safe and stops the 500 errors.
2. If the project uses `.claude/.mcp.json`, you can add `shadcn` to `disabledMcpServers` if your host supports that.
3. See also `.claude/docs/GETTING_STARTED.md` (MCP server timeouts) for general guidance on disabling unused servers.

## 4. Distinguish Framework vs External Noise

Framework-actionable:

- Hook block loops (`TASKUPDATE-FIRST`, route guards).
- Spawn prompt assembly/task-id mismatches.
- Read safety policy behavior.

Usually external/non-blocking:

- MCP startup errors (`shadcn`, `filesystem` usage stderr, etc.).
- Model feature limitations on Haiku (`tool_reference`/tool search disabled).

## 5. Model-Specific Notes

Haiku caveats:

- `ToolSearchTool`/tool-reference behavior is reduced.
- Expect extra "tool search disabled" debug lines.
- For strict routing/tool-reference behavior, Sonnet/Opus is more stable.

## 6. Recommended Stable Defaults

- `TASKUPDATE_FIRST_ENFORCEMENT=warn`
- `HYBRID_GREP_ENFORCEMENT=warn`
- `TASK_REQUIRE_CORE_MEMORY_READ=on`
- `READ_REQUIRE_SEARCH_FIRST=on`
- `READ_TOKEN_SAVER_ENFORCEMENT=on`
- `REFLECTION_STEP0_ENFORCEMENT=block` (keep strict)
- Keep spawn-time in-progress marker enabled in `pre-task-unified`.

## 7. Verification Gate After Any Hook Change

Run:

```bash
node --test tests/hooks/pre-task-unified-core.test.cjs
node --test tests/hooks/pre-tool-unified-taskupdate-first.test.cjs
node --test tests/hooks/pre-tool-unified-read-safety.test.cjs
node --test tests/hooks/pre-tool-unified-guardrails.test.cjs
node --test tests/hooks/bash-command-validator.test.cjs
node --test tests/hooks/bash-pretool-bundle.test.cjs
node --test tests/hooks/hybrid-search-enforcer.test.cjs
node --test tests/hooks/spawn-prompt-assembler-task-id-normalization.test.cjs
pnpm lint
```

Then do one real debug pass:

- `claude --dangerously-skip-permissions --chrome -d`
- Run a standard audit prompt.
- Confirm in log:
  - Step 0 lines present
  - MEMORY PROTOCOL reminder includes `patterns.json` + `gotchas.json`
  - TaskList before Task
  - Memory-first Task gate either satisfied or intentionally disabled
  - At least one early TaskUpdate for each spawned agent
  - Large Read guard behavior (search-first + windowing + token-saver when needed)
  - Bash artifact writes (`cat >`, `>>`, `tee`) are blocked for `.claude/context/{reports,memory}`
  - No infinite block loops

## 8. Escalation Path

If a regression reappears:

1. Capture debug log path.
2. Diff only this span:
   - first `Task` spawn
   - first 10 subagent tool calls
   - first `TaskUpdate` call (or absence)
3. Patch one guard at a time and rerun targeted tests before full-suite/lint.

## 9. Search-First Troubleshooting Patterns (Use `pnpm search` First)

Use built-in search before broad `Read`/`Glob` scans. This aligns with read-safety enforcement and reduces token waste.

Core patterns:

```bash
pnpm search:code -- "TASKUPDATE-FIRST" --limit 10
pnpm search:code -- "MEMORY-FIRST" --limit 10
pnpm search:code -- "Bash redirection/heredoc" --limit 10
pnpm search:code -- "requires search evidence first" --limit 10
pnpm search:code -- "context-compressor" --limit 10
```

When debugging a specific hook:

```bash
pnpm search:code -- "pre-tool-unified.read-safety" --limit 10
pnpm search:code -- "pre-task-unified-core" --limit 10
pnpm search:code -- "bash-command-validator" --limit 10
```

Troubleshooting workflow:

1. Search first (`pnpm search:code`).
2. Read only the top matching files/sections with offset/limit.
3. Re-run prompt and verify behavior in debug log.
4. Patch smallest enforcement point, then rerun targeted tests.

## 10. Repeatable Live Debug Process (PowerShell)

Use this loop when validating router + subagent behavior end-to-end.

```powershell
# 1) Snapshot newest debug file before run
$debugDir = Join-Path $env:USERPROFILE ".claude\debug"
$before = Get-ChildItem $debugDir -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

# 2) Run a controlled prompt that forces desired behavior
$prompt = @'
Read `.claude/context/memory/decisions.md`, then spawn one Task and report
whether memory/search/read-safety/guardrails were applied.
'@
claude -p $prompt --dangerously-skip-permissions -d

# 3) Resolve the new debug file
$after = Get-ChildItem $debugDir -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$log = $after.FullName
"BEFORE=$($before.Name)"
"AFTER=$($after.Name)"
"LOG=$log"

# 4) Extract only actionable signals
Select-String -Path $log -Pattern `
  "force-step0-execution|MEMORY-FIRST|TASKUPDATE-FIRST|READ SAFETY|AGENT-GUARDRAIL|permissionDecision\":\"deny|File does not exist|MaxFileReadTokenExceededError" `
  -CaseSensitive:$false
```

Notes:

- Ignore MCP startup/auth noise unless it blocks the run itself.
- Treat `File does not exist`, `MaxFileReadTokenExceededError`, and repeated hook denies as actionable.
- Re-run the same prompt after each patch to confirm regression is fixed.

## 11. Debug Log Location

Use environment variables so paths are portable:

```powershell
$debugDir = Join-Path $env:USERPROFILE ".claude\debug"
Get-ChildItem $debugDir -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

Typical resolved path on Windows:

- `C:\Users\<username>\.claude\debug\`

## 12. Troubleshooting Regression Matrix

Run these after major hook/router/skill changes. Reuse the live debug process in Section 10.

### A. Semantic/Hybrid Search First

Prompt template:

```text
Use search-first workflow: run `pnpm search:code -- "memory" --limit 5` before any broad Read. Then produce a short summary.
```

Expected:

- Debug log shows `Bash` call with `pnpm search:code`.
- No blocked large `Read` for missing search evidence.
- If large read occurs, it is windowed (`offset/limit`) or explicitly blocked with guidance.

### B. Observability and Runtime Signals

Prompt template:

```text
Attempt one action that should be blocked by guardrails and one that should be allowed, then summarize outcomes.
```

Expected:

- One clear deny path (`permissionDecision":"deny`) and one allow path.
- Runtime state files in `.claude/context/runtime/` update (task/governance/queue artifacts as applicable).
- No unhandled hook exceptions.

### C. Task Lifecycle Integrity

Prompt template:

```text
Spawn two subagents to analyze different files and ensure each reports TaskUpdate(in_progress) then TaskUpdate(completed).
```

Expected:

- `TaskList` occurs before `Task`.
- Each spawned task shows `TaskUpdate` start and completion.
- No stuck tasks in runtime state.

### D. Router Guardrail Contracts

Prompt template:

```text
Run a high-complexity implementation request and follow required planning/security/architect sequencing.
```

Expected:

- Planner-first/security/architect gates trigger when required.
- If violated, explicit block message appears.
- Recovery path succeeds when corrected.

### E. Bash Artifact-Write Safety

Prompt template:

```text
Try creating `.claude/context/reports/qa/test-guard.md` using `cat >` and `echo >`, then report whether blocked.
```

Expected:

- Bash redirection to `.claude/context/reports` or `.claude/context/memory` is blocked.
- Message indicates use `Write/Edit` instead.
- Equivalent `Write` or `Edit` operation is allowed.

### F. Token Pressure + Token Saver

Prompt template:

```text
Process a large-context task; if read-safety indicates context pressure, invoke context-compressor before large reads.
```

Expected:

- Under pressure, read-safety requires token-saver before large reads.
- After token-saver evidence, large read path proceeds with windowing.

### G. Reflection + Evolution Path

Prompt template:

```text
Perform a repeated-failure analysis and check whether reflection/evolution runtime artifacts are created and deduplicated.
```

Expected:

- Reflection Step 0 messages present.
- Reflection/evolution artifacts written under `.claude/context/runtime/`.
- No duplicate phase-advance/idempotency regression.

### H. Pass/Fail Log Sweep

Use this after each scenario:

```powershell
$debugDir = Join-Path $env:USERPROFILE ".claude\debug"
$log = (Get-ChildItem $debugDir -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
Select-String -Path $log -Pattern `
  "MEMORY-FIRST|TASKUPDATE-FIRST|READ SAFETY|AGENT-GUARDRAIL|permissionDecision\":\"deny|force-step0-execution|File does not exist|MaxFileReadTokenExceededError" `
  -CaseSensitive:$false
```

Treat `File does not exist` and `MaxFileReadTokenExceededError` as actionable unless intentionally induced by the test.

## 13. Recent Session Learnings & Fixes (2026-02-23/24)

### A. Specialist Routing Keyword Lockout & Deadlocks

Symptoms:

- Repeated loops where the Router fails to spawn `Task(developer)` because of `SPECIALIST-OVERRIDE` keyword blocks in the prompt (e.g., prompt contains "research options", triggering the `researcher` lockdown).
- Eventual timeout or out-of-memory crash (Bun panic) as token counts climb over 160K when the Router falls back to running tools (like bash) directly to bypass the lockdown.

Root Cause:

- `SPECIALIST_ROUTING_ENFORCEMENT` was defaulted to `block`, which hard-blocked any request that accidentally mentioned a phrase matching a specialist without actually needing them.

Fix Applied:

- Default `SPECIALIST_ROUTING_ENFORCEMENT` changed to `warn` in `.claude/lib/utils/enforcement-defaults.cjs`.
- Subagent misroutings are now appended locally to `.claude/context/memory/issues.md` to feed into the Reflection Agent analysis cycle without completely blocking execution.

### B. Bun Panics under Memory Pressure

Symptoms:

- Spawning nested `claude` (Bun) subprocesses over large artifact repositories causes memory explosions, resulting in complete failure: `panic(main thread): switch on corrupt value`.

Root Cause:

- Heavy headless updates (like `skill-update-headless.cjs` orchestrating deep repository changes and spawning CLI subprocesses) saturate Node/Bun memory bounds under Windows concurrency.

Mitigation Applied:

- Bypass `skill-update-headless.cjs` orchestrator where possible using pure single-threaded functional replacements or run integrations synchronously and selectively instead of en masse.

### C. Orphaned Git Worktrees Cleanup

Symptoms:

- Dozens of residual git `worktree-agent-[id]` branches left behind after interrupted runs, polluting `git branch` and `git worktree list`.

Fix Applied:

- Cleaned the environment using:
  - `git worktree prune`
  - `git branch | Select-String "worktree-agent-" | ForEach-Object { git branch -D $_.ToString().Trim(' +*') }`
- Always verify worktree bounds are clear if tests unexpectedly abort or the main thread crashes.

### D. ESLint Scaffolding Stubs

Symptoms:

- `pnpm lint:fix` fails with `no-unused-vars` on `context` in newly scaffolded skill hooks (`post-execute.cjs`).
- Fails with `max-lines` inside core routing implementation logic like `routing-guard-core.checks-task.cjs`.

Fix Applied:

- Scaffolder function stubs modified to use `_context` or explicitly ignored.
- Logically cohesive routing files suppressed with `/* eslint-disable max-lines */`.

## 14. Recent Session Learnings & Fixes (2026-03-14)

### A. Visible Terminal Pop-ups from Background Daemons on Windows

Symptoms:

- A new `cmd.exe` or terminal window visibly opens when the system attempts to spawn a background daemon (like the telegram heartbeat loop or cron runner).

Root Cause:

- Using Node's `cp.spawn()` with `{ detached: true, shell: true }` on Windows inherently forces a visible console window to spawn. Though `windowsHide: true` exists, it is often overridden or ignored when `shell: true` is mandated to resolve the CLI binary path (e.g. executing the global `claude` CLI).

Fix Applied:

- Avoid manual Node shell scripts for daemon supervision entirely.
- **Native LLM Orchestration:** Delegated the background spawning responsibility to the Router agent at Step 0.5. The Router natively uses `Task({ subagent_type: 'heartbeat-orchestrator' })` after checking the short-TTL `heartbeat-session-ping.json` file. The CLI's native subagent tool spawns invisibly without `cmd.exe` pop-ups.

### B. YAML Parse Errors in Agent Frontmatter

Symptoms:

- Validating the ecosystem fails with: `"invalid frontmatter yaml"`.

Root Cause:

- Strings in the YAML header starting with an `@` symbol (often used for relative documentation links like `@.claude/context/memory/learnings.md`) are treated as syntax errors by `js-yaml` unless quoted.

Fix:

- Standardize on wrapping `@`-prefixed paths in double-quotes in all YAML blocks: `"- \"@.claude/context/memory/learnings.md\""`.

### C. Missing Core Contract Headers

Symptoms:

- `pnpm validate:full` fails with `Missing required heading: ## Token Saver Invocation Rule` on random agents.

Fix:

- Run `npm run agents:contract:backfill` or directly `node .claude/tools/cli/backfill-agent-template-contract.cjs --apply` to automatically restore lost boilerplate sections to all 70+ agents without needing manual edits. Always follow up with `npm run gen:all-registries`.

### D. Orphaned Reflection/Evolution Hooks

Symptoms:

- `unified-reflection-handler.cjs` correctly produces `evolution-dispatch-plan.json` but the system never automatically self-heals or routes those requests to the `agent-updater`/`skill-updater`.

Root Cause:

- The executor script `process-evolution-queue.cjs` was orphaned and never wired into the heartbeat loop.

Fix Applied:

- Integrated `process-evolution-queue.cjs` into `.claude/tools/cli/evolution-check.cjs`. The daily `evolution-24h` heartbeat now natively pushes the output payloads directly into the central orchestrator's `cron-actions-queue.jsonl`.

### E. Zombie Worktrees Surviving Cleanups

Symptoms:

- `.claude/worktrees/agent-*` directories accumulate heavily, surviving both the post-task cleanup hook and the 12-hour background cron sweeps.

Root Cause:

- The `worktree-auto-cleanup.cjs` hook explicitly skips deleting its own directory to prevent Windows `EBUSY` locks. It then skips deleting all other active directories because they are shielded by a 2-hour TTL.
- The background `worktree-prune.cjs` script was measuring age using `fs.statSync` on the root agent directory, which completely fails because inner file changes do not update the directory's root timestamp on some filesystems, preventing the 12-hour threshold from expiring.

Fix Applied:

- Added a "slop auto-detection" block in the daily `evolution-check.cjs` that safely spawns `devops` when more than 15 worktrees accumulate.
- Changed `worktree-prune.cjs` to strictly parse the embedded 13-digit Unix Epoch integer from the `worktree-agent-<id>-<timestamp>` string, guaranteeing absolute age verification.

### F. High LLM Prompt Cache Misses

Symptoms:

- Anthropic/Gemini caching dashboards report near 0% cache hit rates despite using statically defined agent boundaries.

Root Cause:

- The `spawn-prompt-assembler` prepended dynamic meta fields (massive 300-word Warning Message Boxes and per-session Task UUID injections) to the absolute top of the system prompt. Because prompt caching requires exact prefix matching, this constantly changing preamble immediately busted the cache line before it could hit the static Tool/Agent rules.

Fix Applied:

- Inverted the `spawn-prompt-assembler-sections.cjs` architectural layout. Statically declared items (Tools, Skills, Memory RAG, Agent Constitution) are explicitly array-concatenated first.
- Dynamic warning fields (`ensureMandatorySpawnPreflight`) and UUIDs were relocated to append onto the absolute bottom of the payload.

### G. Deep Insight Log Diagnostics / Telemetry

Symptoms:

- LLM tasks fail silently or you need to audit a massive (e.g., 5MB-10MB) session log that crashes context windows when `view_file` is used directly.

Root Cause:

- Raw agent interactions (especially those hitting code generation and memory RAG) produce enormous `.claude/debug/*.txt` log files that are difficult for an agent to read via grep without saturating tokens.

Fix Applied / Tooling Available:

- ALWAYS use `node scripts/reduce-debug-log.mjs <log_path>` to squash massive debug logs (often achieving 90%+ noise reduction by extracting only hook decisions, exceptions, and side-channel metadata) before trying to read them.
- Never run `node scripts/reduce-debug-log.mjs <log_path>` on the debug file directly. Instead, copy the file to a new location and run the script on the copy (preferably a .tmp folder).
- To detect UI tool blockers (like git conflicts or authentication denies) that do not appear in background logs, run `node scripts/analyze-session-transcript.mjs <log_path>`. This compiles a markdown report detailing `Tool Errors`, systemic bypasses, and top tool failures grouped by intent.

## 15. Hook MODULE_NOT_FOUND After Worktree Cleanup (P0 — Most Common)

**Symptoms:**

- All hooks fail with `Error: Cannot find module '...\.claude\worktrees\agent-XXXX\.claude\hooks\...'`
- Every tool call shows "hook error" in output
- Session becomes unenforceable (no security, no metrics, no validation)

**Root Cause:**

Claude Code changes the session CWD to a worktree path when spawning subagents. When the worktree is later pruned or deleted, the CWD points to a non-existent directory. All hooks that use relative paths fail because the process cannot resolve them from a directory that no longer exists.

**5-Step Diagnostic Playbook:**

1. **Analyze error signature**: Look for a worktree path in the MODULE_NOT_FOUND message. A path containing `.claude/worktrees/agent-` confirms this issue.
2. **Understand worktree architecture**: `git worktree add` checks out only committed files. Any hook `.cjs` file that exists locally but is not committed to git will not exist in the worktree.
3. **Verify settings.json hook commands**: Check `.claude/settings.json` and confirm every `"command"` value uses the absolute `cd` prefix pattern: `cd "C:/dev/projects/agent-studio" && node .claude/hooks/...`
4. **Check git tracking**: Run `git ls-files .claude/hooks/` and compare against every hook referenced in `settings.json`. Any hook present in `settings.json` but absent from `git ls-files` output will crash worktree agents.
5. **Auto-fix**: Run `node .claude/lib/utils/hook-file-validator.cjs` for automated diagnosis, or manually run `git add .claude/hooks/ && git commit -m "chore: track all hook files"`.

**Prevention:**

- Hook commands in `settings.json` must always use the absolute cd prefix: `cd "C:/dev/projects/agent-studio" && node .claude/hooks/path/to/hook.cjs`
- All hook `.cjs` files must be committed to git. An untracked hook is invisible inside any worktree.
- The `pre-spawn-hook-check.cjs` validation hook warns when untracked hooks are detected before a spawn.

**Quick Fix (session already broken):**

Start a fresh session. The new session initializes with the correct CWD pointing to the project root. Then commit any untracked hooks to prevent recurrence.

## 16. Creator Guard Blocks Agent or Skill Edits

**Symptoms:** `CREATOR_GUARD: Write blocked` when attempting to edit files under `.claude/agents/`, `.claude/skills/`, or `.claude/hooks/`

**Root Cause:** `unified-creator-guard.cjs` enforces Gate 4 of the router policy. Direct writes to creator-managed paths are blocked regardless of content or intent — including restorations and copies of existing content.

**Fix:** Use the correct creator or updater skill for the path being modified:

- Agent files: `Skill({ skill: 'agent-updater' })`
- Skill files: `Skill({ skill: 'skill-updater' })`
- Hook files: `Skill({ skill: 'hook-creator' })`
- Workflow files: `Skill({ skill: 'workflow-creator' })`

**Emergency Override (development only):** Set `CREATOR_GUARD=warn` in `.env` to downgrade blocks to warnings. Never use `warn` or `off` in a production session.

**Reference:** `.claude/docs/@ENFORCEMENT_HOOKS.md` — `unified-creator-guard.cjs` section

## 17. Agent Spawn Fails: "Failed to resolve base branch HEAD"

**Symptoms:** The `Task` tool returns `Failed to resolve base branch "HEAD": git rev-parse failed` or similar git resolution errors when trying to spawn a subagent.

**Root Cause:** The session CWD is inside a worktree directory that has already been pruned or deleted. Git cannot resolve `HEAD` because the working tree path no longer exists on disk.

**Fix:**

```bash
git worktree prune
rm -rf .claude/worktrees/agent-*
```

Then retry the spawn from the same session. The git state will be clean and HEAD will resolve correctly.

**Prevention:** Run `git worktree prune` as part of session startup. The `worktree-prune-on-start.cjs` hook does this automatically on each UserPromptSubmit event.

## 18. Tests Timeout or Hang Indefinitely

**Symptoms:** `pnpm test` stops producing output and never exits, or times out after the 120-second limit.

**Root Cause:** Two common causes:

1. A `setTimeout` or `setInterval` without `.unref()` keeps the Node.js event loop alive after tests finish. The process cannot exit naturally.
2. A SQLite database file is held open across test cases. The next test that tries to delete or recreate the file hits a Windows `EBUSY` lock.

**Fix for timer leaks:** Add `.unref()` to any timer that should not block process exit:

```javascript
const timer = setTimeout(callback, delay);
timer.unref(); // allows process to exit if this is the only pending handle
```

**Fix for SQLite locks:** Call `db.close()` in `afterEach` before any `fs.rmSync` or file cleanup:

```javascript
afterEach(() => {
  db.close();
  fs.rmSync(dbPath, { force: true });
});
```

**Reference:** MEMORY.md — "TaskStateMachine TTL timer" entry confirms `.unref()` is required on all internal timers.

## 19. Context Overflow / "Prompt is too long"

**Symptoms:** An agent spawn fails immediately with an error containing "Prompt is too long" or "context length exceeded". No tools are called by the spawned agent.

**Root Cause:** The total context passed to the model — system prompt, injected rules, conversation history, and spawn prompt — exceeds the model's input limit. This is most likely to occur in long sessions where conversation history has accumulated.

**Fix options (in order of preference):**

1. Spawn `context-compressor` to compress the current session context, then retry the spawn.
2. Start a fresh session. Long-running sessions accumulate context that cannot be trimmed without a reset.
3. Reduce the spawn prompt size. Keep spawn prompts under 2KB by referencing plan file paths rather than inlining plan content.

**Prevention:**

- Keep spawn prompts under 2KB. Reference files by path; do not inline large blocks of content.
- Compress context proactively at 80K tokens (see Section 8 of CLAUDE.md).
- If `learnings.md` exceeds 500 lines, prune it before the session begins — large memory files are injected into every spawn prompt and inflate total context.

## 20. Worktree Agents Commit to Their Branch, Not Main

**Symptoms:** An agent reports successful completion, but `git log --oneline main` shows no new commits. Running `git branch` reveals one or more `worktree-agent-*` branches with recent commits.

**Root Cause:** Worktree agents default to the branch that was checked out in their worktree. Unless the spawn prompt explicitly instructs the agent to work on `main`, commits land on the isolated worktree branch.

**Recovery:**

```bash
# Find the worktree branch with the work
git log --oneline worktree-agent-XXXX -5

# Cherry-pick or merge the commits to main
git switch main
git cherry-pick <commit-sha>
```

**Prevention:** Include an explicit instruction in all spawn prompts: "Commit your changes directly to the `main` branch. Do not create a new branch."

The developer agent's worktree isolation logic also has a bypass for `.claude/` paths — `shouldOverrideWorktreeIsolation()` returns `true` for framework artifact paths and forces `isolation: none`, which means those agents always operate on the main branch.

## 21. ESLint Blocks Commit (Pre-commit Hook)

**Symptoms:** A `git commit` is rejected with output containing `COMMIT BLOCKED: ESLint issues detected` or `ESLint found N problem(s)`.

**Root Cause:** The project runs ESLint in `--max-warnings=0` mode. Any warning is treated as a hard failure. Common triggers include: using `JSON.parse()` instead of `safeParseJSON()` in hook files, using `shell: true` in child process spawns, or introducing `console.log` in production code.

**Fix:**

```bash
pnpm lint:fix
```

This auto-fixes many violations. For remaining issues, inspect the ESLint output and resolve manually.

**Common violations and their correct forms:**

| Violation                           | Fix                                                           |
| ----------------------------------- | ------------------------------------------------------------- |
| `JSON.parse(untrustedInput)`        | Use `safeParseJSON()` from `.claude/lib/utils/safe-json.cjs`  |
| `spawn(..., { shell: true })`       | Use `spawn(cmd, args, { shell: false })` with array arguments |
| `console.log(...)` in non-test code | Use structured logging or remove the statement                |

After fixing, run `pnpm lint:fix && pnpm format` and confirm both exit cleanly before retrying the commit.

## Related Resources

- `Skill({ skill: 'worktree-hook-doctor' })` — Automated hook diagnosis
- `.claude/lib/utils/hook-file-validator.cjs` — Hook file validation utility
- `.claude/docs/@ENFORCEMENT_HOOKS.md` — Hook enforcement reference
- `.claude/docs/@ENVIRONMENT_CONFIG.md` — Environment variable overrides for enforcement modes
- `.claude/docs/DEVELOPER_WORKFLOW.md` — Standard development workflow
