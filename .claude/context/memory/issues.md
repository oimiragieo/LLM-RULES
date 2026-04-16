# Issues\n\n*Memory index reset on 2026-04-01. Previous 572KB of routing warnings archived.*\n*Cap: 25KB per file (matching CC discipline).*\n

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.580Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.602Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-02T05:28:07.632Z

## Systemic: Missing TaskUpdate Metadata Contract (Ongoing — 2026-04-04)

**Pattern**: 18 reflection entries across sessions 2026-04-02 and 2026-04-04 contain only the fallback string 'Task N completed without summary metadata'. No scores can be extracted — reflection-agent INSUFFICIENT_DATA gate fires on all 18.

**Root cause**: Subagents completing tasks via TaskUpdate(completed) without providing metadata.summary. The pre-completion-validation.cjs hook either not enforcing or being bypassed.

**Impact**: Full audit trail broken for all tasks in those sessions. 383-387 gap-log entries of type missing_metadata confirm this is deeply systemic — not a one-off.

**Stale task compounding**: task-lifecycle-42 has been in_progress for 3400-3687 minutes (2+ days) and generates a gap-log entry on every prompt. This pollutes the gap log with noise making signal detection harder.

**Recommended fix**:

1. Enforce pre-completion-validation.cjs to BLOCK (not warn) when metadata.summary is absent.
2. Auto-close task-lifecycle-42 — it is a zombie task that will never complete.
3. Review post-completion-chain.cjs to ensure reflection spawn requests include task metadata, not just fallback strings.

**Reflection scores withheld**: All 18 reflections. DataQuality = insufficient. (See reflection-log.jsonl entries 2026-04-02, 2026-04-04.)

Source: reflection of session tasks (2026-04-02 to 2026-04-04)

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.639Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.654Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-04T21:15:27.678Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:43.990Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:44.086Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-04T21:20:44.131Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.300Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.324Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-07T22:26:38.346Z

**Update 2026-04-09**: Still unresolved. 11 additional reflection queue entries (tasks 1-7, 10-13) accumulated 2026-04-09 through 2026-04-10 — all carrying the same 807 gap observations about task-lifecycle-42 (now 939 min stale). Consolidated and batch-processed by preflight router (no per-entry spawn) because all entries are duplicates of the same systemic root cause. Action items unchanged: (1) auto-close task-lifecycle-42 to stop gap-log pollution, (2) make pre-completion-validation.cjs BLOCK missing metadata.summary, (3) fix post-completion-chain.cjs to carry real task metadata into reflection prompts instead of fallback strings.

**Update 2026-04-10**: 5 more entries (tasks 2–6, timestamps 04:10–04:24 UTC) processed by reflection-agent inline. Same pattern: 846 gap-log entries, ~840 from zombie task-lifecycle-42 (1520–1523 min stale for at least two of the entries — now spanning multiple days). All 5 tasks completed without metadata.summary. Batch reflection report written to context/reports/reflections/reflection-2026-04-10-batch-tasks-2-6-stale-task-pattern.md. Queue cleared. Root causes remain unaddressed — escalation recommended.

**Update 2026-04-11**: 5 new reflection entries (tasks 6, 7, 8, 10, 1) from ghidramcp-eval differential oracle session. Gap log now 873 total (+9 from last batch of 864). task-lifecycle-42 confirmed separately closed (Task #3 "completed" in this session) — gap log noise should decrease in subsequent sessions. 3 of 5 tasks had good metadata.summary (tasks 6, 7, 8, 10); task 1 had fallback string (score withheld). Ghidramcp-eval pattern: fault-injection tests, PYTHONPATH fix via sys.path.insert, oracle exception resilience. Strong delivery evidence from this session. Missing metadata root cause still unresolved for post-completion-chain.cjs.

**Update 2026-04-11 (evening batch)**: 5 more entries (tasks 11, 12, 24, 25, 26) batch-processed. Gap log now 912 total. Tasks 24/25/26 are NO metadata (score withheld — dataQuality: insufficient). Tasks 11/12 have partial metadata (summaries only): task 11 = "gitignore pass needed for 321 untracked files"; task 12 = "REVOLUTION_PLAN.md pruned, Phase 2 gate added, commit 343a35c1". Patterns remain identical to prior batches: (1) missing_metadata dominates gap log, (2) post-completion-chain.cjs fallback string still firing for most tasks. Queue cleared. Root causes remain unaddressed: enforce pre-completion-validation.cjs BLOCK on absent metadata.summary.

**Update 2026-04-12 (enterprise audit batch — tasks 38/40/41/42/43)**: 5 entries processed from 2026-04-11 enterprise audit remediation session. Gap log now 923 total. Tasks 38/40/41 arrived with fallback strings ("Task N completed without summary metadata") — dataQuality: insufficient for formal scoring, but session context (git log + user-provided task descriptions) confirms substantive delivery. Task 42 = PARTIAL data (format chore summary only). Task 43 = FULL data (SkillClaw research). Process adherence issue: 3/5 tasks still failing metadata contract. Good news: the gap-log noise from task-lifecycle-42 zombie should have diminished after it was auto-closed on 2026-04-11. The recurring missing_metadata pattern across 20+ sessions now constitutes a P0 systemic failure — pre-completion-validation.cjs MUST be upgraded from warn to BLOCK for absent metadata.summary. No further updates planned here; escalate to enforcement hook update.

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:11:44.707Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:11:44.728Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:11:44.750Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:17:56.335Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:17:56.357Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:17:56.375Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:21:52.499Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:21:52.518Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:21:52.538Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:24:23.388Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:24:23.406Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:24:23.421Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:27:38.491Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:27:38.512Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:27:38.530Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:42:16.021Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:42:16.045Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:42:16.067Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T05:46:20.576Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T05:46:20.592Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T05:46:20.608Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:16:41.502Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:16:41.518Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:16:41.535Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:21:49.473Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:21:49.489Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:21:49.503Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:24:06.274Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:24:06.291Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:24:06.306Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:26:25.413Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:26:25.430Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:26:25.448Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:28:47.450Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:28:47.467Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:28:47.482Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:31:02.024Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:31:02.040Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:31:02.054Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:44:20.608Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:44:20.626Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:44:20.644Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-12T06:50:27.710Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-12T06:50:27.749Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-12T06:50:27.787Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-13T05:28:23.171Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-13T05:28:23.200Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-13T05:28:23.226Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-13T05:30:30.055Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-13T05:30:30.087Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-13T05:30:30.109Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-13T15:50:17.153Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-13T15:50:17.181Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-13T15:50:17.201Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-13T16:08:59.428Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-13T16:08:59.449Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-13T16:08:59.467Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:14.794Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:14.812Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:14.829Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:48.488Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:48.507Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T00:45:48.524Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:02:52.632Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:02:52.649Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:02:52.664Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:10:42.827Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:10:42.842Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:10:42.857Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:05.552Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:05.610Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:05.673Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:37.575Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:37.600Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:12:37.682Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:08.868Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:08.893Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:08.931Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:38.831Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:38.910Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:13:39.110Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:24:18.060Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:24:18.084Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:24:18.107Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-15T01:36:26.417Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-15T01:36:26.443Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-15T01:36:26.467Z

**Update 2026-04-15 (tasks 3-7 batch)**: 5 entries processed from 2026-04-15 session. Gap log now 946+ total. SYSTEMIC ISSUE PERSISTS: task-lifecycle-42 continues generating stale-detection hits even though TaskList() confirms the task does not exist. This phantom detection pattern (durations 21-1957 min across entries) is caused by stale-task-detector.cjs having no TTL-based cleanup for missing task IDs — it keeps checking a ghost ID indefinitely. Tasks 6 and 7 again arrived without metadata.summary (fallback strings). Tasks 3 (48->3 test failures), 4 (28 Wave 5 Telegram tests), and 5 (5-phase audit: 2 HIGH security, CLAUDE.md drift, 17 orphaned root files, 10 untested files, 5 test smells) had substantive delivery evidence from session context. ROOT CAUSE TICKET (NEW): stale-task-detector.cjs must add TTL-based auto-expiry for task IDs absent from TaskList() after N consecutive detections to prevent gap-log flooding. Existing root causes (pre-completion-validation.cjs BLOCK enforcement, post-completion-chain.cjs metadata propagation) remain unaddressed.


## Hook permission_mode and agent_id in PreToolUse — Sub-agent Detection Broken (2026-04-16)

**Finding**: Claude Code does NOT inject agent_id into PreToolUse hook stdin payload. agent_id is ONLY available in SubagentStart/SubagentStop hook events. This means isRouterSession() in router-tool-lockdown.cjs cannot use hookInput.agent_id to detect sub-agent context for PreToolUse hooks.

**permission_mode values** (per official HOOKS.md): default, plan, acceptEdits, dontAsk, bypassPermissions. It IS in the common hook input fields on every event.

**Current detection fallback order** (isRouterSession in router-tool-lockdown):
1. hookInput.agent_id — always empty for PreToolUse (docs confirm not injected)
2. CLAUDE_AGENT_ID env var — only set when explicitly configured
3. hookInput.task_id — only if task context passed in hookInput
4. allowed_tools array without Task — negative signal only
5. CWD worktree check — weak signal
6. Default: assume ROUTER (returns true) — causes false-positive blocks

**Impact**: Sub-agents running without CLAUDE_AGENT_ID env or worktree CWD are treated as the router and have Write/Edit blocked. The [bypass] tag appears ONLY when permission_mode===bypassPermissions.

**Fix needed**: The Write blocks for sub-agent sessions need either (a) CLAUDE_AGENT_ID to be set in sub-agent spawn env, or (b) router-state.cjs task context to be updated when task is active, or (c) checkRouterWrite to accept hookInput and check permission_mode.

**RESOLVED 2026-04-16 (Phase 1 — commits 145d812c8 + 71c73db7a)**: Option (a) implemented. CLAUDE_AGENT_ID env var is now propagated into sub-agent spawn prompts, and checkRouterWrite() bypasses the router-write block when CLAUDE_AGENT_ID is set to a non-router value. This unblocks Write/Edit for developer, qa, and other specialist agents that were being incorrectly blocked. Phase 2 (write-pretool-bundle refactor to merge write-safety checks, pre-completion-validation.cjs SE-03 fix for non-zero exit code on unexpected errors) remains open — spec in `.claude/context/plans/2026-04-16-hook-deadlock-recovery-plan.md`.

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-16T21:16:57.065Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-16T21:16:57.079Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-16T21:16:57.093Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-16T21:19:10.458Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-16T21:19:10.475Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-16T21:19:10.492Z
