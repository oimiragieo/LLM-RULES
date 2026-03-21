<!-- Agent: researcher | Task: #11 | Session: 2026-03-20 -->

# Research Report: Worktree Agent Context Bloat Solutions

**Topic**: Preventing context overflow and stale worktree accumulation in Claude Code multi-agent worktree workflows
**Date**: 2026-03-20
**Task**: #11
**Researcher**: researcher agent

---

## Executive Summary

Worktree agents in agent-studio accumulate context to ~967K tokens because each agent runs its full tool-use loop without early compression or hard context caps. When `autocompact` fires, the entire oversized context is sent to the API — hitting billing rate limits. Separately, 14 stale worktree directories persist with no TTL enforcement. Three categories of solutions emerge from research: (1) **maxTurns throttling** to bound agent turn count; (2) **context compression hooks** triggered earlier than the current 150K threshold; and (3) **TTL-based worktree pruning** using `git worktree prune --expire`. The codebase already has most primitives (`maxTurns: 18`, `worktree-auto-cleanup.cjs`, `session-budget-watchdog.cjs`) but critical gaps remain: agents in worktrees are not constrained to a lower `maxTurns` budget, compression fires too late, and the TTL cleanup relies on TaskUpdate(completed) — which worktree agents skip (known issue from `feedback_worktree_taskupdate.md`).

---

## Research Methodology

| # | Query | Tool | Type |
|---|-------|------|------|
| 1 | Claude Code worktree sub-agent context management 2025 | WebSearch | External |
| 2 | LLM agent context window management autocompact overflow prevention 2025 | WebSearch | External |
| 3 | git worktree cleanup automation TTL age-based pruning CI scripts | WebSearch | External |
| 4 | Claude Code maxTurns context limit sub-agent isolation spawn settings 2025 | WebSearch | External |
| 5 | arxiv.org/html/2511.22729v1 — Solving Context Window Overflow in AI Agents | WebFetch | Academic |
| 6 | Memory search — existing patterns in codebase | Bash/Grep | Internal |
| 7 | Worktree cleanup hook / session-budget-watchdog inspection | Read/Bash | Internal |

---

## Sources Consulted

| Source | URL | Relevance |
|--------|-----|-----------|
| Claude Code Docs — Sub-Agents | https://code.claude.com/docs/en/sub-agents | HIGH — maxTurns, isolation frontmatter |
| richsnapp.com — Context Management with Subagents | https://www.richsnapp.com/article/2025/10-05-context-management-with-subagents-in-claude-code | HIGH — subagent isolation pattern |
| ccswarm GitHub | https://github.com/nwiizo/ccswarm | MEDIUM — multi-agent worktree architecture |
| arxiv 2511.22729 — Context Window Overflow | https://arxiv.org/html/2511.22729v1 | HIGH — memory pointer approach |
| JetBrains Research — Efficient Context Management | https://blog.jetbrains.com/research/2025/12/efficient-context-management/ | HIGH — observation masking |
| git-worktree docs — prune --expire | https://git-scm.com/docs/git-worktree | MEDIUM — TTL pruning |
| factory.ai — Context Window Problem | https://factory.ai/news/context-window-problem | MEDIUM — scaling agents |
| Internal: worktree-auto-cleanup.cjs | .claude/hooks/cleanup/worktree-auto-cleanup.cjs | HIGH — existing implementation |
| Internal: session-budget-watchdog.cjs | .claude/hooks/session/session-budget-watchdog.cjs | HIGH — existing thresholds |
| Internal: spawn-token-guard.cjs | .claude/hooks/routing/spawn-token-guard.cjs | HIGH — compression trigger |

---

## Detailed Findings

### Finding 1: The Core Problem — Context Accumulates Without a Hard Ceiling

**Evidence**: Current `maxTurns: 18` is set in agent frontmatter but applies to ALL agents equally regardless of whether they run in a worktree. A worktree agent doing a complex 18-turn task accumulates substantial context before context-compressor fires.

The `spawn-token-guard.cjs` warns at 80K and blocks at 120K for **spawn prompts** — but this guards the prompt being sent TO the agent, not the agent's own internal context accumulation during its run. An agent receiving a 30K token prompt can still accumulate 930K tokens of additional context through tool-use turns before autocompact fires.

**Root cause**: There is no per-session token budget enforcement INSIDE a spawned agent's run loop. The `session-budget-watchdog.cjs` fires at 140K/160K/180K for the main router session, but spawned agents in worktrees are separate sessions with separate budgets.

**Impact**: 967K tokens = approximately 53 tool-use turns × ~18K tokens each. With `maxTurns: 18` this means each turn is accumulating ~54K tokens on average — implying very large tool outputs (file reads, test runs, etc.) that are not being summarized.

---

### Finding 2: The Autocompact Problem — Late Trigger + Full Context Sent

**External Research (JetBrains, 2025)**: The standard industry approach has two layers:
- **Observation masking**: Large tool outputs are replaced with summaries inline. Only summaries appear in context; raw data is stored externally.
- **LLM summarization**: When context approaches limit, the conversation is summarized.

Claude Code's `autocompact` implements the second layer (LLM summarization) but fires too late — it sends the full 967K context to the API, which triggers billing rate limits before the compression can complete.

**External Research (arxiv 2511.22729)**: A better approach replaces large tool outputs with **memory pointers** at tool-output time (not at overflow time). Token savings of 7x demonstrated (6,411 → 842 tokens for same data). Key insight: intervene at the point of large output creation, not retrospectively.

**Gap in agent-studio**: The compression trigger at `150K` is designed for the router's context, not for sub-agent sessions. Sub-agent sessions that read large files, run tests, or receive verbose command output bypass this trigger because they are separate processes.

---

### Finding 3: maxTurns Is the Primary Lever — And It's Underused

**External Research (Claude Code docs)**: Sub-agent frontmatter supports `maxTurns` which caps the tool-use loop. This is the simplest, most direct way to prevent context runaway.

**Current state in codebase**: All agents use `maxTurns: 18`. This is set in frontmatter but is not reduced for worktree-isolated agents. A worktree agent doing a complex refactor will use all 18 turns.

**Industry pattern (ccswarm)**: The ccswarm framework uses specialized agents with bounded turn counts per domain. Frontend agents, backend agents, QA agents are given separate maxTurns budgets calibrated to their expected tool-use depth.

**Key insight**: Worktree agents should have LOWER `maxTurns` than main-session agents, because:
1. They run a single focused task (not multi-task orchestration)
2. If they exhaust turns, the router can re-spawn with fresh context
3. A 10-turn hard cap prevents runaway while still completing most single-file tasks

**Recommended value**: `maxTurns: 10` for worktree agents (vs current 18). This caps worst-case context at ~10 × ~18K = ~180K tokens maximum, which is under the autocompact threshold.

---

### Finding 4: Stale Worktree Accumulation — The Cleanup Hook Has a Dependency Gap

**Internal finding**: `worktree-auto-cleanup.cjs` triggers on `TaskUpdate(status: 'completed')`. The TTL is encoded in the branch name (`worktree-agent-<id>-<timestamp>`) and cleaned after 24h.

**Known issue**: Per `feedback_worktree_taskupdate.md` in user memory: "Worktree agents skip TaskUpdate(completed); verify TaskList after". This means the primary trigger for cleanup never fires for worktree agents.

**Result**: 14 stale worktree directories accumulate because agents complete their work but never emit `TaskUpdate(completed)`, so `worktree-auto-cleanup.cjs` never runs for them.

**External solution (git docs)**: `git worktree prune --expire <duration>` is a time-based cleanup that does NOT depend on agents emitting events. It removes worktrees that have been absent from the filesystem for longer than the specified duration.

```bash
# Remove worktrees not modified in 24 hours
git worktree prune --expire 24.hours.ago

# Remove worktrees not accessed in 7 days
git worktree prune --expire 7.days.ago
```

**Gap**: There is no cron-based or heartbeat-triggered worktree age check. The cleanup is 100% event-driven (TaskUpdate), and since that event is skipped by worktree agents, cleanup never happens.

---

### Finding 5: Context Isolation Pattern — Subagent Summaries, Not Full Output

**External Research (richsnapp.com, Claude Code docs)**: The documented best practice is:

> "By delegating [verbose operations] to a subagent, the verbose output stays in the subagent's context while only the relevant summary returns to your main conversation."

This is exactly what agent-studio's worktree pattern does architecturally — but the sub-agent itself still accumulates all the verbose output in its OWN context, leading to the 967K token problem within the subagent.

**The missing piece**: Worktree agents need to compress their own intermediate tool outputs WITHIN their session, not just produce a summary at the end. Specifically:
- After running tests (potentially MBs of output), the agent should discard raw output and keep only pass/fail counts
- After reading multiple large files, the agent should keep only the relevant sections it referenced
- After bash commands with large stdout, keep only the actionable lines

**Pattern from ccswarm**: Each specialized agent in ccswarm has a "mailbox" — a structured output format — rather than returning raw tool outputs to the coordinator. This forces summarization at the tool-output boundary.

---

### Finding 6: Existing Infrastructure Is Mostly Correct — Needs Tuning

**What already works**:
- `worktree-auto-cleanup.cjs` — correct cleanup algorithm, just missing TTL-based fallback
- `session-budget-watchdog.cjs` — correct threshold model (140K/160K/180K), but only monitors router session
- `spawn-token-guard.cjs` — correct prevention for oversized spawn prompts
- `maxTurns: 18` — correct mechanism, wrong value for worktree agents
- Branch name TTL encoding (`worktree-agent-<id>-<timestamp>`) — correct, but never read

**What is missing**:
1. Time-based fallback cleanup (cron/heartbeat calling `git worktree prune --expire`)
2. Reduced `maxTurns` for worktree-bound agent spawns
3. Per-agent session context monitoring (not just router session)
4. Observation masking / early summarization in worktree agents

---

## Academic References

| Paper | ID | Relevance |
|-------|----|-----------|
| Solving Context Window Overflow in AI Agents | arxiv:2511.22729 | HIGH — memory pointer approach, 7x token reduction |
| Cutting Through the Noise: Smarter Context Management for LLM-Powered Agents | JetBrains Research 2025 | HIGH — observation masking and LLM summarization taxonomy |

---

## Practical Recommendations

### P0 — Immediate Fixes (No New Code Required)

**P0.1: Reduce maxTurns for worktree agents**
- When the router spawns a Task for a worktree agent, override `maxTurns` to 10 in the spawn prompt
- This caps worst-case context accumulation at ~180K tokens (10 turns × ~18K each)
- Implementation: Add `maxTurns: 10` to worktree agent spawn prompts in `universal-agent-spawn.md` or `developer.md` frontmatter override section

**P0.2: Add time-based worktree cleanup to heartbeat loop**
- `heartbeat-orchestrator` should call `git worktree prune --expire 24.hours.ago` on each heartbeat cycle
- This is time-based and does NOT require TaskUpdate(completed) to fire
- Also: add `git worktree list` to detect worktrees > WORKTREE_TTL_MS and remove them via `git worktree remove --force`

```bash
# Add to heartbeat orchestrator workflow
git worktree prune --expire 24.hours.ago
git worktree list --porcelain | grep "worktree" | ...check age via stat...
```

### P1 — Short-Term Improvements (Small Code Changes)

**P1.1: Add TTL check independent of TaskUpdate in worktree-auto-cleanup.cjs**
- Currently the hook fires ONLY on `TaskUpdate(completed)`. Add a second trigger: run the TTL check on EVERY hook invocation, scanning `$PROJECT_ROOT/.claude/worktrees/` for directories where the branch timestamp (already encoded in the name) is older than `WORKTREE_TTL_MS`.
- This decouples cleanup from agent behavior — cleanup happens on any activity, not just TaskUpdate.

**P1.2: Add UserPromptSubmit context budget watchdog for worktree sessions**
- `session-budget-watchdog.cjs` currently monitors the router session. Extend it (or create `worktree-budget-watchdog.cjs`) to inject compression warnings into worktree agent sessions.
- Fire at 80K tokens (not 140K) for worktree agents, since their tasks should complete in under 80K.
- If a worktree agent hits 80K, inject: "CONTEXT ALERT: compress intermediate outputs now using context-compressor skill before continuing."

**P1.3: Add worktree cleanup to the cleanup-always protocol**
- Modify `cleanup-always.md` Step 3 to explicitly check for worktrees older than `WORKTREE_TTL_MS` and remove them, not just prune stale administrative entries.

### P2 — Architectural Improvements (Larger Changes)

**P2.1: Implement observation masking for worktree agents**
- Inspired by arxiv:2511.22729 memory pointers approach
- Wrap large tool outputs (Bash commands, file reads > 5K chars) in a summarizer before they enter context
- PostToolUse hook `observation-masker.cjs` triggers when tool output exceeds 5K chars, replaces with `[COMPRESSED: <summary> | Full output stored at .claude/context/tmp/obs-<id>.txt]`
- This intervenes at output creation time, not at overflow time

**P2.2: Add per-agent session context metric to budget-tracker.json**
- The budget-tracker currently tracks the router session. Extend to track child sessions by session ID.
- Each spawned agent emits its token count via a PostToolUse hook to `budget-tracker.json` under its session ID.
- Router can query `budget-tracker.json` to detect runaway sub-agents and terminate them early.

**P2.3: Worktree agent context budget in spawn metadata**
- When spawning a worktree agent, include `contextBudget: 80000` in task metadata
- Agent reads this at startup and self-enforces by compressing at 80% of budget
- This makes context budgeting explicit and per-task rather than global

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| maxTurns: 10 is too low for complex tasks | Agent fails to complete, task restarts | MEDIUM | Set 10 for developer worktree agents, 15 for architect agents; monitor |
| Aggressive TTL prune removes active worktree | Data loss if agent is mid-task | LOW | Check for active lock file before pruning; only prune completed/stale |
| Observation masker corrupts context | Agent has wrong information | MEDIUM | Store full output to tmp, only compress in context — never discard |
| Budget-tracker.json write contention | Race condition in parallel agents | LOW | Use file-based locking (proper-lockfile, already in codebase) |
| Compression at 80K triggers too often | Overhead on small tasks | LOW | Only enable for worktree sessions, not main router session |

---

## Implementation Roadmap

### Week 1 (P0 — No new code)
- [ ] Add `git worktree prune --expire 24.hours.ago` to heartbeat-orchestrator workflow
- [ ] Update universal-agent-spawn.md to include `maxTurns: 10` hint for worktree spawns
- [ ] Update `cleanup-always.md` Step 3 to include age-based worktree removal

### Week 2 (P1 — Small code changes)
- [ ] Modify `worktree-auto-cleanup.cjs` to add TTL-based scan independent of TaskUpdate
- [ ] Create `worktree-budget-watchdog.cjs` with 80K threshold for worktree sessions
- [ ] Test cleanup on 14 stale worktrees in current state

### Week 3-4 (P2 — Architecture)
- [ ] Design observation masker hook (requires hook-creator)
- [ ] Extend budget-tracker.json schema for sub-session tracking
- [ ] Prototype per-task context budget in spawn metadata

---

## Key Conclusions

1. **The 967K token problem is primarily a maxTurns + large tool output problem.** Reducing maxTurns from 18 to 10 for worktree agents is the fastest fix with the highest impact.

2. **The 14 stale worktrees are a consequence of the known TaskUpdate(completed) skip issue.** The fix is time-based cleanup that doesn't depend on agent behavior.

3. **Autocompact fires too late.** The compression trigger should fire at 80K for worktree agents (not 150K), because worktree tasks should complete in under 80K tokens.

4. **The infrastructure exists.** `worktree-auto-cleanup.cjs`, `session-budget-watchdog.cjs`, and `spawn-token-guard.cjs` are all correctly designed — they just have the wrong thresholds and missing triggers for worktree-specific scenarios.

5. **Long-term: observation masking at tool-output time (not at overflow time) is the industry best practice.** This reduces token accumulation by 7x per arxiv:2511.22729 and prevents the problem at its source rather than fighting it at the 150K overflow boundary.
