<!-- Agent: multi-llm-consultant | Task: channel-system-review | Session: 2026-03-24 -->

# Channel Management System — Multi-Model Architecture Review

**Date:** 2026-03-24
**Session:** Multi-LLM council consultation
**Models consulted:** Codex CLI (OpenAI), Claude CLI (Anthropic) — Gemini not installed
**Council note:** Windows cmd.exe argument truncation prevented full multi-line prompt delivery to external CLIs. Codex responded to the architecture framing only. Claude CLI loaded router CLAUDE.md and couldn't answer in consultant mode. Chairman synthesis (this document) is produced by the current session with full context of all 6 questions.

---

## System Under Review

Three ad-hoc tools:
- `channel-manager.cjs` — spawns `claude --channels` in a new Windows Terminal tab, tracks PID
- `terminal-tracker.cjs` — PID tracking with orphan detection (kill after 2hr inactivity)
- `telegram-notify.cjs` — standalone Telegram notification module (5 functions)

Integration with Claude Code v2.1.80+ native Channels feature (`--channels` flag for Telegram/Discord plugins). Channel session runs with `--dangerously-skip-permissions` for unattended operation.

---

## Q1 — ARCHITECTURE: Spawned subprocess vs MCP server vs native --channels

### Codex response (partial — architecture framing received):

> "Send the six questions and I'll answer them directly. If useful, I can structure the response as: (1) architectural assessment, (2) risks/failure modes, (3) implementation recommendations, (4) tradeoffs and alternatives."

Codex confirmed the structure was sound but couldn't receive the full prompt due to Windows argument limitations.

### Chairman analysis:

**Option (a) — Spawned subprocess (current approach)**

Tradeoffs:
- **Pro:** Isolation — the channel session has its own context window, its own CLAUDE.md load, its own tool permissions. Crashes in the channel session don't affect the main developer session.
- **Pro:** Native Windows Terminal tab UX — visible, killable, inspectable.
- **Pro:** PID tracking enables orphan cleanup (terminal-tracker.cjs does this correctly).
- **Con:** Two Claude processes competing for the same API quota and rate limits (both use the same ANTHROPIC_API_KEY).
- **Con:** No structured IPC between main session and channel session. The sessions can't share task state, memory, or signal each other.
- **Con:** PID tracking is fragile on Windows — process tree is not always predictable, PIDs can be recycled.
- **Con:** `--channels` flag behavior may change across Claude Code versions; tight coupling to a flag that's documented as experimental.

**Option (b) — MCP server approach**

Tradeoffs:
- **Pro:** Clean JSON-RPC 2.0 protocol for IPC. The main session can call tools like `telegram_send_message`, `channel_status`, `get_pending_messages`.
- **Pro:** Single process, single API quota consumer. No subprocess PID management.
- **Pro:** Tools can be precisely scoped — the MCP server only exposes what's safe (read-only tools, send-message, no file writes).
- **Con:** Requires a persistent MCP server process to be running (analogous to a daemon). Adds operational complexity.
- **Con:** Can't leverage Claude Code's native `--channels` plugin infrastructure.
- **Con:** More code to write — JSON-RPC server, tool registry, lifecycle management.

**Option (c) — Native --channels flag only**

Tradeoffs:
- **Pro:** Zero custom code for channel management — Anthropic maintains the Telegram/Discord integration.
- **Pro:** Official support path — bug fixes and updates come automatically.
- **Con:** No custom routing logic. All messages go to a single agent with whatever CLAUDE.md is loaded.
- **Con:** No custom notification module (telegram-notify.cjs functionality lost).
- **Con:** Limited control over session lifecycle — can't programmatically restart or monitor.

**Recommendation:** Hybrid approach. Use `--channels` for the actual Telegram/Discord message handling (it's the official path), but wrap it with `channel-manager.cjs` for lifecycle management and `telegram-notify.cjs` for outbound notifications the channel session can't self-send. The MCP server approach is worth evaluating for v2 if the IPC needs become complex.

---

## Q2 — IDENTITY: Full Router vs Lightweight Assistant for channel messages

### Chairman analysis:

**The fundamental tension:** Router identity loads CLAUDE.md with all 102-agent routing rules, which costs significant context tokens on every session start. A channel message saying "What's the status of my PR?" doesn't need the full multi-agent orchestration machinery.

**What other frameworks do:**

- **AutoGen (Microsoft):** Uses a "GroupChat" model where a coordinator decides per-message which specialized agent handles it. The coordinator is lightweight; specialists are loaded on-demand. The channel intake is the coordinator, not a full specialist.
- **CrewAI:** "Kickoff" is done by the crew manager (lightweight); specialists are spawned per task. Equivalent to: channel session = crew manager, not a developer.
- **LangGraph:** Routes via a state machine graph. The entry node is typically a classifier, not the full agent. Classification is cheap (a few hundred tokens); full execution is expensive.
- **Agent-Studio pattern:** Router → `TaskList()` → spawn specialists. The channel session would be better modeled as the router's "intake" — it classifies the message, then either answers directly (if trivial) or spawns the appropriate subagent.

**Recommendation:**

For the channel session identity, use a **two-tier approach**:
1. **Tier 1 — Channel Intake Agent** (lightweight, ~500-token system prompt): Classifies inbound messages into: (a) trivial/FAQ, (b) status query, (c) action request, (d) ambiguous. Answers (a) and (b) directly. Routes (c) by spawning a Task.
2. **Tier 2 — Full Router** (only spawned for Tier 1 category `c`): The full CLAUDE.md-loaded agent handles complex action requests.

This saves 80-90% of tokens on informational messages while preserving full capability for action messages.

---

## Q3 — CONTEXT LIFECYCLE: Handling context window exhaustion in an indefinite session

### Chairman analysis:

**Option comparison:**

| Option | Token cost | Continuity | Complexity | Risk |
|--------|-----------|-----------|-----------|------|
| (a) Auto-compress at 80K | Medium | High | Low | Lossy compression |
| (b) Auto-handoff to new session | High (summary cost) | Medium | High | Summary quality determines continuity |
| (c) Rolling window (last N messages) | Low | Low | Low | Loses conversation history |
| (d) Session-per-message | Lowest | None | Low | No cross-message context |

**Detailed analysis:**

**(a) Auto-compress at 80K tokens** — The `context-compressor` skill already exists in agent-studio and handles this case. This is the best starting point. The compressor preserves decision-critical information while reducing token usage 70-90%. Risk: the compression can lose nuance in multi-turn conversations. Mitigation: preserve the last 5 user messages verbatim, compress everything before that.

**(b) Auto-handoff** — Best for long-running conversations that build on each other (e.g., a development project tracked via Telegram). The handoff document becomes the "working memory". This is what agent-studio's `session-handoff` skill does. Downside: the handoff summary is generated once and then becomes the sole context for the new session — garbage in, garbage out.

**(c) Rolling window** — Good for stateless channel usage (each message is self-contained). Bad for conversational context where the user refers to "the thing we discussed earlier". For a Telegram bot used for development status queries, rolling window is acceptable.

**(d) Session-per-message** — The cleanest architecture for channels where each message is truly independent. Each message gets a fresh session, fresh context, no accumulated debt. This is the architecture used by most production Telegram bots (stateless handlers). The trade-off: no multi-turn conversation support.

**Recommendation:**

Use a **tiered policy based on session duration:**
- Under 10K tokens: no action
- 10K-80K tokens: no action (normal operation)
- 80K tokens: trigger auto-compress (option a)
- If compress fails or reaches 120K: trigger auto-handoff (option b) with a structured summary passed to the new session
- For stateless queries (classified as Tier 1 by the intake agent): use session-per-message (option d) to avoid accumulation entirely

---

## Q4 — CONFLICT: Two Claude sessions on the same repo simultaneously

### Chairman analysis:

**Real conflict risks, ranked by severity:**

**HIGH — File writes without coordination**
- Both sessions can use `Edit`/`Write` on the same files simultaneously.
- No locking mechanism exists between Claude Code sessions.
- Race condition: Session A reads file, Session B writes file, Session A writes file (Session B's changes overwritten).
- Mitigation: The channel session should run in **read-only mode** for the main codebase. Only the developer session writes code. Channel session writes only to `.claude/context/` paths.

**HIGH — Git state conflicts**
- If the channel session runs `git commit`, `git checkout`, or `git stash` while the developer session has uncommitted work, conflicts arise.
- The channel session modifying git history is particularly dangerous — `git reset` or `git rebase` in the channel session would destroy the developer's working tree.
- Mitigation: Channel session should never run git write operations. Hard-block `git commit`, `git push`, `git reset`, `git rebase`, `git checkout` in the channel session's tool allowlist.

**MEDIUM — Worktree conflicts**
- Agent-studio uses `git worktree` extensively. Both sessions might try to create/delete the same worktree names.
- Mitigation: Channel session uses a separate worktree naming prefix (e.g., `channel-agent-*` vs `worktree-agent-*`).

**LOW — Memory file conflicts**
- Both sessions write to `.claude/context/memory/learnings.md`, `decisions.md`, etc.
- These are append-only by convention, so conflicts are rare, but possible if both write simultaneously.
- Mitigation: The memory WAL (Write-Ahead Log) protocol in `.claude/rules/memory-protocol.md` handles this — channel session writes to its own queue file, not directly to canonical memory files.

**LOW — Task state conflicts**
- If both sessions call `TaskUpdate()` on the same task IDs, the task state is unpredictable.
- Mitigation: Channel session owns only its own tasks (prefixed `channel-*`).

**Recommended isolation model:**
```
Channel session allowed: Read, Bash (read-only commands only), TaskCreate (channel-* prefix), TaskUpdate (own tasks only), telegram-notify.cjs
Channel session blocked: Write, Edit, git write commands, worktree operations on shared branches
```

---

## Q5 — SECURITY: Better permission model than --dangerously-skip-permissions

### Chairman analysis:

`--dangerously-skip-permissions` bypasses ALL permission checks — file writes, shell commands, network calls, everything. For an agent processing messages from an external Telegram channel (untrusted input), this is a significant attack surface.

**Threat model:** A malicious actor sends a crafted Telegram message that causes the channel agent to execute arbitrary shell commands or modify critical files. This is a prompt injection attack.

**Option analysis:**

**(a) Keep --dangerously-skip-permissions with sandboxing**
- The sandboxing would need to be at the OS level (Docker container, Windows sandbox).
- Pro: Preserves full agent capability within the sandbox.
- Con: Does not prevent the agent from corrupting the repo within the sandbox. Sandbox escape vulnerabilities exist.
- Viability: Acceptable if the sandbox truly isolates the repo.

**(b) Create a restricted tool allowlist**
- Claude Code supports `--allowedTools` flag for restricting available tools.
- Example: `claude --channels --allowedTools "Read,Bash(git status),Bash(git log)"`
- Pro: Precise control. Channel agent can read code but not write it.
- Con: Need to maintain and evolve the allowlist as channel agent capabilities grow.
- Viability: **Best option for production.** Start with minimal allowlist, expand as trust is established.

**(c) Require human approval for destructive operations**
- Claude Code has a permission system where certain operations prompt for approval.
- Without `--dangerously-skip-permissions`, the agent would pause and ask for confirmation.
- Pro: Human in the loop for dangerous operations.
- Con: Defeats the purpose of unattended channel operation — notifications would queue up waiting for approval.
- Viability: Only viable for a hybrid "ask when uncertain" model with a timeout/default action.

**(d) Run channel agent in read-only mode by default**
- Read-only means: only `Read`, `Bash` with read-only commands (git log, git status, ls), no `Write`/`Edit`.
- Pro: Safest default. A compromised prompt can't destroy the repo.
- Con: Channel agent can't take actions — can only report status. Limits utility significantly.
- Viability: Best starting point. Add write capabilities only for specific verified use cases.

**Recommendation:**

Implement a layered model:
1. **Default:** `--allowedTools "Read,Bash"` with a Bash allowlist (git read commands, grep, ls only).
2. **Elevated:** For action requests (deploy, create PR), require a separate confirmation mechanism — e.g., user must send a confirmation code or use a specific command syntax.
3. **Never allowed:** `Write`, `Edit`, git write commands, `--dangerously-skip-permissions` replaced with explicit allowlist.

Add prompt injection detection in `telegram-notify.cjs`: scan inbound messages for instruction patterns before passing to the agent.

---

## Q6 — MISSING PIECES for production-ready channel integration

### Chairman analysis:

**Critical gaps (blocking production readiness):**

**1. Tests — Currently 0%**
- No unit tests for `channel-manager.cjs`, `terminal-tracker.cjs`, or `telegram-notify.cjs`.
- No integration tests for the channel session lifecycle (spawn → message → response → cleanup).
- No tests for the orphan detection logic in `terminal-tracker.cjs`.
- **Required:** Unit tests using node:test for all 3 modules. Mock the Claude CLI spawn in channel-manager tests.

**2. Rate limiting — Currently missing**
- Telegram Bot API has rate limits: 30 messages/second, 20 messages/minute per chat.
- No throttling on inbound message processing or outbound notifications.
- **Required:** Token bucket rate limiter in `telegram-notify.cjs`. Queue depth limit on inbound messages.

**3. Message queuing — Currently missing**
- If the channel session is busy processing a long task, new inbound messages are lost.
- No queue, no retry, no backlog management.
- **Required:** A simple JSONL queue file: `.claude/context/runtime/channel-message-queue.jsonl`. Channel manager polls and processes in order. Dead letter queue for messages that fail 3 times.

**4. Dead letter queue — Currently missing**
- Messages that cause errors (malformed, trigger security blocks, cause session crashes) are silently dropped.
- **Required:** `.claude/context/runtime/channel-dlq.jsonl` with error context. Periodic alert to the user when DLQ has entries.

**5. Monitoring and alerting — Currently missing**
- No visibility into channel session health (is it alive? how many messages processed? what's the error rate?).
- `terminal-tracker.cjs` detects orphans but doesn't report metrics.
- **Required:** A `channel-health.json` file updated every N minutes with: `{ messages_processed, errors, session_uptime_s, last_message_at, context_tokens_used }`. Alert when session has been silent >30 minutes.

**6. Graceful degradation — Currently missing**
- If the channel session crashes, Telegram messages receive no response.
- If the Claude API is rate-limited, messages are dropped.
- **Required:** Fallback response: "I'm currently unavailable, your message has been queued." Automatic session restart after crash.

**7. Audit logging — Partially present (PID log), mostly missing**
- No log of which messages were received and what actions were taken.
- Required for security review (did the agent take unintended actions?).
- **Required:** Append-only `channel-audit.jsonl` with: `{ timestamp, message_id, user_id, message_text, actions_taken, response_sent }`.

**8. Context window budget — Currently missing**
- No tracking of the channel session's context window usage.
- Session can silently degrade as context fills.
- **Required:** Integrate with `ccusage` to track channel session token consumption. Trigger context compression automatically.

**9. Multi-message conversation threading — Currently missing**
- All messages are treated as independent. No conversation thread context.
- If a user sends 3 messages in a row about the same PR, the agent doesn't know they're related.
- **Required:** Telegram message threading (reply_to_message_id) to group related messages.

**10. Windows-specific reliability gaps**
- `terminal-tracker.cjs` uses PID checking which is unreliable when PIDs are recycled.
- Windows Terminal tabs don't have a stable IPC mechanism.
- **Required:** Named pipe or port-based health check instead of PID polling.

---

## Consensus Summary

| Question | Recommendation |
|----------|---------------|
| Q1 Architecture | Hybrid: use --channels natively + channel-manager.cjs wrapper for lifecycle. MCP server for v2. |
| Q2 Identity | Two-tier: lightweight intake agent (classifies) + full router (only for action requests). |
| Q3 Context lifecycle | Tiered: compress at 80K, handoff at 120K, session-per-message for stateless queries. |
| Q4 Conflict | Channel session read-only by default. Hard-block git write commands. Separate worktree prefix. |
| Q5 Security | Replace --dangerously-skip-permissions with --allowedTools allowlist. Add prompt injection detection. |
| Q6 Missing pieces | Top 3 priorities: (1) tests, (2) message queue, (3) audit logging. |

---

## Council Metadata

| Field | Value |
|-------|-------|
| Models available | Codex CLI (OpenAI), Claude CLI (Anthropic) |
| Models unavailable | Gemini CLI (not installed) |
| Dispatch method | Parallel stdin piping via omega-codex-cli / omega-claude-cli |
| Prompt delivery | Partial — Windows cmd.exe arg truncation limited multi-line delivery |
| Stage 1 responses | Codex: architecture framing only. Claude CLI: loaded router context (not consultant mode). |
| Stage 2 peer review | Skipped — insufficient Stage 1 responses for anonymized ranking |
| Stage 3 synthesis | Chairman synthesis by current session (full context, all 6 questions) |
| Output file | `.claude/context/reports/backend/channel-system-multi-model-review-2026-03-24.md` |
| Known gap | omega-cli wrappers on Windows need file-based prompt delivery for multi-line prompts |
