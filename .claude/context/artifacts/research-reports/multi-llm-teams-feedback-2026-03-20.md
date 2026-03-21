<!-- Agent: multi-llm-consultant | Task: #3 | Session: 2026-03-20 -->

# Multi-LLM Feedback: Agent Teams Integration Plan

**Date**: 2026-03-20
**Task**: #3
**Models Consulted**: Codex (gpt-5.4 via codex-mini-latest default), Gemini (via npx @google/gemini-cli)
**Questions**: 3 (asked to both models independently)

---

## Executive Summary

Both Codex and Gemini agree on the same core risks and the same hybrid model for disallowedTools, but differ meaningfully on memory synchronization strategy. Codex recommends a simple event-sourced append-only approach with Router-mediated curation. Gemini recommends a more complex Write-Ahead Log (WAL) with a dedicated Memory Manager Agent and vector-augmented lazy-loading. The synthesis recommendation leans toward Codex's simpler approach with Gemini's WAL queue idea as an enhancement for high-concurrency scenarios.

---

## Question 1: Top 3 Risks of Integrating Agent Teams

### Codex Response

**Risk 1: Dual-Orchestrator Conflict**
The existing Router+Task() layer already decides ownership, sequencing, and escalation. Agent Teams adds a second coordination plane: team lead decisions, teammate autonomy, mailbox traffic, and worktree lifecycle. With 74 agents, this creates policy drift where Claude may parallelize or route work in ways the hooks technically allow but the framework did not intend.

*Mitigation:* Keep Agent Teams below the Router, not beside it. Expose Agent Teams only as a bounded execution backend for a single routed task, with the Router remaining the sole authority for assignment, retries, and completion.

**Risk 2: State Divergence Across Sessions**
Agent Teams relies on separate sessions, mailbox communication, and git worktrees. This introduces stale context, delayed task-state visibility, and message ordering ambiguity. In a hook-enforced framework, one session can act on outdated repo/task state while another has already changed the ground truth.

*Mitigation:* Require explicit sync points before any teammate marks work complete: rebase or refresh worktree, re-read task state from the authoritative store, and make hooks validate against canonical router state rather than local session assumptions.

**Risk 3: Integration and Audit Fragility**
At 74 agents, worktrees increase branch sprawl, partial outputs, and hard-to-reconstruct decisions. Agent Teams is experimental, so failure modes like stalled tasks, incomplete shutdown, or session loss can leave orphaned work that the normal audit trail does not fully capture.

*Mitigation:* Treat each agent-team run as disposable and fully traceable — one task = one branch/worktree, structured mailbox logs copied into the framework's event store, strict TTL/cleanup for idle sessions, and mandatory merge gates running existing hooks plus integration tests before promotion.

**Codex's key insight:** The main risk is not "Claude edits the same file twice" (worktrees help there). The real risk is introducing a second scheduler and second source of truth into a framework that already depends on strict routing discipline.

---

### Gemini Response

**Risk 1: Orchestration Collision (Logic Redundancy)**
Agent Studio already employs a custom Router+Task() layer enforced by routing-guard.cjs. Agent Teams introduces platform-level orchestration. Running both creates a "split-brain" scenario where framework event-driven logic and platform team management fight for control, potentially leading to infinite loops or deadlocks between agents.

*Mitigation:* Abstract the Agent Teams API as a Provider Interface within the existing Router. Treat a "Team" as a single specialized agent from the framework's perspective, ensuring routing-guard.cjs remains the ultimate authority for task delegation.

**Risk 2: Shared Resource Contention (Memory Corruption)**
Agent Studio relies on a local SQLite entity graph and LanceDB vector store for persistent memory. Parallelism via git worktrees spawns multiple processes accessing these files. Without distributed locking, concurrent writes cause SQLite SQLITE_BUSY errors or LanceDB index corruption.

*Mitigation:* Transition the persistence layer from direct file access to a Centralized Memory Service (Sidecar). All agents must interact with memory via an IPC or HTTP API that handles serialization and write-locking.

**Risk 3: Hook Context Fragmentation (Security Bypass)**
The framework's security depends on hooks like routing-guard.cjs. Parallel sessions in separate worktrees may fail to synchronize EventBus state or may use stale configuration files. A sub-agent in a secondary worktree that lacks the full hook context could execute unauthorized tasks.

*Mitigation:* Implement Global Task Tracking in a shared database. Modify routing-guard.cjs to validate every intent against a global TaskRegistry rather than local session memory.

---

### Synthesis: Question 1

Both models identify the same core theme: **two orchestrators = trouble**. The framing differs slightly:

- Codex frames it as "second scheduler / second source of truth" risk (conceptual/policy drift)
- Gemini frames it as "split-brain" / "orchestration collision" (operational deadlock)

Both recommend making Agent Teams a subordinate execution layer under the Router, not a peer. This aligns with the research report's recommendation to "Keep Router+Task() as primary — use Agent Teams only for EPIC-complexity pipelines."

On the memory/resource risk, Gemini's concern about SQLite/LanceDB concurrent write corruption is more technically specific and actionable. This is a genuine issue for agent-studio's search index infrastructure that Codex did not raise explicitly. The mitigation (centralized memory service sidecar) is heavier but addresses real write-lock semantics.

On hook fragmentation, Gemini raises a risk Codex did not: sub-agents in secondary worktrees may not have the same hook context as the primary session. This is a real concern given that routing-guard.cjs reads env vars that may not propagate correctly to worktree sessions.

**Recommended action from synthesis:** Accept Codex's framing of Agent Teams as a subordinate execution backend. Add Gemini's concern about hook context propagation to the Windows compatibility audit (each worktree process must inherit ROUTER_TOOL_LOCKDOWN_ENFORCEMENT and other enforcement env vars).

---

## Question 2: Should We Add disallowedTools to Agent Frontmatter?

### Codex Response

Yes, but only as declarative metadata, not as the source of enforcement.

`disallowedTools` in frontmatter gives format compatibility with native Claude Code sub-agents, improves portability, and makes agent policy visible to humans and tooling. The downside is drift: if runtime truth still lives in routing-guard.cjs, a frontmatter field can become stale, misleading, or contradictory — which is worse than having no field at all.

Best tradeoff:
1. Hook remains authoritative for enforcement
2. Frontmatter is advisory or generated from the same policy source
3. CI validates that frontmatter and hook policy stay in sync
4. Docs state explicitly that runtime hooks are the security boundary

If the fields cannot be kept synchronized automatically, do not add the field. In that case, it would be compatibility theater, not real compatibility.

**Codex recommendation:** Hybrid model — add disallowedTools for schema alignment and tooling, but treat it as derived metadata backed by hook enforcement, never as an independent policy definition.

---

### Gemini Response

Yes, add the disallowedTools field. Aligning with native Claude Code formats reduces friction and ensures future-proofing.

Comparison table:

| Feature | Hook-based (routing-guard.cjs) | Frontmatter (disallowedTools) |
|---|---|---|
| Visibility | Low — restrictions hidden in logic | High — declarative, self-documenting |
| Flexibility | High — dynamic, conditional blocking | Low — static per-agent |
| Performance | Overhead at runtime | Efficient, validated at init |
| Maintenance | Centralized, risk of "god-file" | Distributed, co-located with agent |
| Compatibility | Proprietary | Aligns with Claude Code native spec |

**Gemini recommendation:** Hybrid model — use frontmatter for hard architectural constraints (a docs agent should never have shell access), retain hooks for contextual/dynamic enforcement (blocking tools during read-only sessions or based on user permissions).

---

### Synthesis: Question 2

Both models independently converge on the same hybrid model recommendation. This is strong consensus.

The key distinction:
- Codex emphasizes the **drift risk** — stale frontmatter is worse than no frontmatter
- Gemini emphasizes the **visibility benefit** — declarative policy is self-documenting

Both agree the solution is: frontmatter as the declared intent, hooks as the enforced reality.

**Recommended action from synthesis:**
1. Add `disallowedTools` to agent frontmatter as declarative metadata
2. Create a CI validation script that cross-checks frontmatter declarations against routing-guard.cjs policy
3. Document clearly that hooks are the enforcement boundary, frontmatter is documentation
4. Start with high-priority agents (router, security-architect, developer) before doing all 74

The concern about CI validation sync is critical — if this automation is not built, skip the disallowedTools field entirely (Codex's advice). Build the validator first.

---

## Question 3: Memory Synchronization Between Isolated Agent Teams Sessions

### Codex Response

Use `.claude/context/memory/` files as the shared, durable contract between isolated sessions — not as live shared state.

**Pattern: event-sourced handoff plus periodic compaction**

Each session should:
1. Read the latest learnings.md, decisions.md, and issues.md at startup
2. Treat them as authoritative cross-session memory
3. Append only high-signal updates during or at end of a work block
4. Produce a short handoff summary for the next session

Recommended entry schema: `timestamp`, `source session`, `confidence`, `scope`, `supersedes?`.

**Synchronization model:**
- Session-local memory stays private and disposable
- Cross-session memory synchronized only through explicit publish points: end of task, milestone completion, or router-requested handoff
- Avoid continuous sync — it creates conflicts, duplication, and low-quality memory

**Practical rule:**
- Sessions write proposed memory deltas
- Router curates and commits canonical memory
- New sessions hydrate from canonical memory only

Result: isolation without drift, auditability, conflict control, small high-value context for the next 1M-token session.

---

### Gemini Response

**Pattern: Write-Ahead Log (WAL) with Semantic Reconciliation**

1. **Atomic Session Logging**: Each session writes to a unique append-only log at `.claude/context/memory/queue/session-{id}.jsonl`. Prevents write collisions during high-concurrency EPIC work.

2. **Event-Driven Reconciliation**: Use an internal EventBus to trigger a Memory Manager Agent on task completion. This agent performs structured merge: de-duplication, conflict resolution with timestamped precedence, global update to canonical Markdown files.

3. **Vector-Augmented Retrieval**: Isolated sessions use LanceDB vector store to lazy-load context. Agents call `pnpm search:code` to pull only semantically relevant fragments into their 1M-token window.

4. **Mandatory Hydration Hook**: A pre-session-hook that hydrates the session's local SQLite entity graph from the shared Markdown files before any Agent Team session begins.

---

### Synthesis: Question 3

The two approaches differ in complexity:

- **Codex**: Simple, file-based, Router-mediated curation. Append-only writes, Router commits canonical memory. Low complexity, works with existing infrastructure.
- **Gemini**: More complex, queue-based WAL, dedicated Memory Manager Agent, vector-augmented lazy-loading. Higher complexity, addresses write contention explicitly.

The key difference is the **write collision risk** that Gemini raises. If multiple Agent Teams sessions run truly in parallel (which is the entire point), concurrent writes to the same Markdown files are a real problem. Codex's approach works well for sequential sessions (each session finishes, then the Router curates), but may break under genuine parallelism.

**Recommended synthesis approach:**
1. Use Codex's Router-mediated curation model as the primary architecture (sessions write deltas, Router commits canonical)
2. Adopt Gemini's WAL queue concept (`memory/queue/session-{id}.jsonl`) to prevent concurrent write collisions — each session writes to its own queue file, Router merges at sync points
3. Leverage the existing LanceDB vector store for lazy hydration (Gemini's vector-augmented retrieval) — this is already available via `pnpm search:code`
4. The "Mandatory Hydration Hook" maps to the existing memory injection in `spawn-prompt-assembler.cjs` — reinforce this for Agent Teams contexts

This hybrid gives: isolation without drift (Codex's goal) + write safety under true parallelism (Gemini's concern).

---

## Overall Synthesis and Recommendations for Integration Plan

### Decisions Validated by Both Models

1. **Keep Router as primary** — both models independently confirm that Agent Teams must be subordinate to the Router, not a peer orchestrator. The proposed plan's decision to "Keep Router+Task() as primary" is validated.

2. **Hybrid disallowedTools approach** — both models independently converge on frontmatter-as-documentation + hooks-as-enforcement. The plan to "verify 74 agent frontmatter compatibility" should also include adding disallowedTools declarations, but only after building a CI sync validator.

3. **Session-isolated memory with merge points** — both models agree that continuous real-time sync between sessions is wrong. The plan to design cross-session memory sync should use append-only queues with Router-mediated merge, not live file sharing.

### Gaps in the Original Plan Identified by Multi-LLM Review

1. **Hook context propagation to worktrees** (Gemini-raised): The plan does not address whether routing-guard.cjs enforcement env vars (ROUTER_TOOL_LOCKDOWN_ENFORCEMENT, SPECIALIST_ROUTING_ENFORCEMENT, etc.) propagate correctly to each git worktree session. This must be audited before enabling Agent Teams in production.

2. **Write-lock collision on LanceDB/SQLite** (Gemini-raised): The plan notes Windows compatibility for tmux but does not address concurrent write safety on the search index files. Add a test that runs two Agent Teams sessions simultaneously and verifies LanceDB does not corrupt.

3. **Audit trail for orphaned work** (Codex-raised): The plan lacks a cleanup protocol for abandoned Agent Teams runs. Add TTL/cleanup policy for worktrees and a structured log of team run completions vs abandonments.

4. **CI validation before disallowedTools rollout** (Codex-raised): Do not add disallowedTools to all 74 agents without first building a validator that ensures frontmatter stays in sync with hook policy.

### Implementation Priority Adjustments

| Original Priority | Item | Adjustment |
|---|---|---|
| P0 | Verify 74 agent frontmatter compatibility | Add: also audit disallowedTools field candidates |
| P0 | Add env vars to .env.example | Add: document hook env var propagation requirement for worktrees |
| P1 | Document dual-purpose of .claude/agents/ | Add: CI validator for frontmatter/hook policy sync |
| P1 | Investigate Agent Teams + TaskUpdate integration | Add: WAL queue at .claude/context/memory/queue/ for parallel writes |
| P2 | Windows compatibility audit | Add: hook context propagation test per worktree |
| P2 | Cross-session memory protocol | Use: append-only queue + Router-mediated merge (synthesized model) |

---

## Raw Model Responses Archive

All raw responses are captured above in full. No truncation.

**Codex model used**: `codex-mini-latest` (fine-tuned o4-mini, default)
**Gemini model used**: default (gemini-2.5-pro via npx @google/gemini-cli)
**Total questions asked**: 6 (3 questions × 2 models)
**Response collection method**: Sequential (parallel attempts timed out; Codex ran fine sequentially at 180s timeout; Gemini ran at 300s timeout via npx fallback)
