# Agent Studio Troubleshooting Runbook

This guide captures high-frequency failures seen in real debug sessions and the fixes that resolved them.

Use with:
- `.claude/docs/@TASK_TRACKING_GUIDE.md`
- `.claude/docs/@ENFORCEMENT_HOOKS.md`
- `.claude/docs/MEMORY_SYSTEM.md`
- `.claude/docs/@ENVIRONMENT_CONFIG.md`

## 1. Quick Triage Checklist

1. Confirm Step 0 actually ran in debug log.
2. Confirm `TaskList` was called before `Task`.
3. Confirm spawned agents call `TaskUpdate(in_progress)` before heavy tools.
4. Check if PreTool hooks are blocking (and why).
5. Separate framework issues from MCP/server startup noise.

## 2. Log-First Commands

PowerShell snippets:

```powershell
$p="C:/Users/<you>/.claude/debug/<session>.txt"
Select-String -Path $p -Pattern "force-step0-execution|reflection-step0-guard|TaskList|TaskUpdate|TASKUPDATE-FIRST|Hook PreToolUse:.*error|Read tool validation error"
```

```powershell
Select-String -Path $p -Pattern "No pending reflections|status\":\"no_pending\"|executePreToolHooks called for tool: TaskUpdate"
```

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

### G. Git status always dirty after tests/runs

Common noisy files:
- `.claude/context/data/memory.db`
- `.claude/context/memory/codebase_map.json`
- test fixture memory metrics/access files

Recommended workflow:
1. Commit only intentional code/test/doc edits.
2. Restore runtime artifacts before commit if they were not part of work.

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
- `REFLECTION_STEP0_ENFORCEMENT=block` (keep strict)
- Keep spawn-time in-progress marker enabled in `pre-task-unified`.

## 7. Verification Gate After Any Hook Change

Run:

```bash
node --test tests/hooks/pre-tool-unified-taskupdate-first.test.cjs
node --test tests/hooks/pre-tool-unified-read-safety.test.cjs
node --test tests/hooks/hybrid-search-enforcer.test.cjs
node --test tests/hooks/spawn-prompt-assembler-task-id-normalization.test.cjs
pnpm lint
```

Then do one real debug pass:
- `claude --dangerously-skip-permissions --chrome -d`
- Run a standard audit prompt.
- Confirm in log:
  - Step 0 lines present
  - TaskList before Task
  - At least one early TaskUpdate for each spawned agent
  - No infinite block loops

## 8. Escalation Path

If a regression reappears:
1. Capture debug log path.
2. Diff only this span:
   - first `Task` spawn
   - first 10 subagent tool calls
   - first `TaskUpdate` call (or absence)
3. Patch one guard at a time and rerun targeted tests before full-suite/lint.
