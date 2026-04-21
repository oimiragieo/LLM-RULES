<!-- Agent: architect | Task: v2.3.0-S4-phase1 | Session: 2026-04-21 -->

# ADR-2026-04-21: Hook Exit-Code Contract — Add Escalation (Code 3) and Retry-Degraded (Code 4)

**Status:** Proposed
**Date:** 2026-04-21
**Source:** Architect agent, v2.3.0 Slice S4 phase 1 (contract-only; dispatcher implementation deferred to S4 phase 2)
**Supersedes:** Extends (does not replace) the fail-open/fail-closed policy in `.claude/rules/hooks.md`

---

## 1. Context

The current hook exit-code contract (documented in `.claude/rules/hooks.md` and `.claude/hooks/CLAUDE.md`) defines three terminal outcomes:

| Exit Code | Semantics | Router Behavior |
| --------- | --------- | ---------------- |
| `0`       | Allow     | Tool call proceeds |
| `2`       | Block     | Tool call refused; message surfaced to agent |
| `1`       | Error     | Treated as non-blocking / fail-open (advisory and post hooks) |

This 2-valued block/allow contract has served well for deterministic safety enforcement (creator guard, routing guard, shell-injection validator). Enforcement is observed across ~124 `process.exit()` sites in 30+ hook files — **every one uses exit 0 or exit 2** (confirmed via ripgrep sweep 2026-04-21). There are **zero hooks** currently using exit codes ≥3, so the namespace is clean.

**Gap identified:** Exit 2 is terminal. The agent sees a blocking message and must either manually work around it or fail. Two recurring patterns demand structured intermediate outcomes:

1. **Safety-but-unclear-fix** — Hook detects a condition it cannot automatically resolve but where a human decision is cheap (e.g., "this write pattern looks suspicious; needs user confirmation"). Today these either hard-block (frustrating) or fail-open (unsafe).
2. **Capability-tier mismatch** — Hook observes that the current model/agent is likely to repeat a failure (e.g., Opus spawn for a task the router policy now classifies as haiku-appropriate). Today this is silently accepted or hard-blocked with no graceful downgrade path.

Both patterns currently require out-of-band handling (queue files, reflection loops) which is lossy and racy.

## 2. Decision

Extend the exit-code contract with **two new opt-in codes**. The existing `0`/`2`/`1` semantics are unchanged — all 124+ existing `process.exit()` sites continue to behave identically.

| Exit Code | Semantics             | Router Behavior                                                                                                                                   |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`       | Allow                 | **Unchanged.** Tool proceeds.                                                                                                                     |
| `2`       | Block                 | **Unchanged.** Tool refused; message surfaced.                                                                                                    |
| `1`       | Error (fail-open)     | **Unchanged.** Advisory/post hooks treat as non-blocking.                                                                                         |
| **`3`**   | **Escalate-to-user**  | Router calls `TaskUpdate({ status: 'blocked', blockerType: <parsed>, needsFrom: 'user', blocker: <hook-stderr> })`. Tool call is deferred, not refused. |
| **`4`**   | **Retry-with-degraded-model** | Router respawns the originating task with `model: 'haiku'` override. Subject to max-retry counter (default `2`), after which exit 4 escalates to exit 3 behavior. |

### 2.1 Hook-side contract addendum

Hooks opting into exit 3 MUST emit a structured stderr trailer on the last line (parsed by the dispatcher):

```
ESCALATE: blockerType=<safety|capability|policy|permission> reason=<short string>
```

Hooks opting into exit 4 MUST emit:

```
DEGRADE: reason=<short string> attempt=<integer>
```

Missing/malformed trailers default to `blockerType='safety'` and `reason='unspecified'` — the exit code itself is authoritative; the trailer is informational.

### 2.2 Router dispatch logic (Phase 2 scope — documented here for completeness)

Pseudocode for the router's post-hook-execution dispatcher:

```javascript
switch (hookExitCode) {
  case 0:
    return allow();
  case 2:
    return block(hookStderr);
  case 3: {
    const { blockerType, reason } = parseEscalateTrailer(hookStderr);
    TaskUpdate({
      taskId: currentTaskId,
      status: 'blocked',
      metadata: { blocker: reason, blockerType, needsFrom: 'user' },
    });
    return defer();
  }
  case 4: {
    const attempts = incrementRetryCounter(currentTaskId);
    if (attempts > MAX_DEGRADE_RETRIES /* default 2 */) {
      // Degraded retry exhausted — escalate
      return dispatchExitCode(3, `degrade_exhausted: ${hookStderr}`);
    }
    return respawnWithOverride({ model: 'haiku', reason: parseDegradeTrailer(hookStderr).reason });
  }
  default:
    // exit 1 or unknown — fail-open per existing policy
    return allow();
}
```

## 3. Consequences

### 3.1 Positive

- **Fully backward compatible.** All 124+ existing `process.exit()` sites remain valid; exit 3/4 are opt-in.
- **Structured escalation.** Replaces ad-hoc queue files and out-of-band reflection triggers with a single typed contract.
- **Budget-friendly.** Exit 4 enables graceful Opus→haiku degradation without failing user-visible tasks, cutting token spend on capability-mismatched work.
- **Auditable.** TaskUpdate(blocked) surfaces escalations in the standard task list; no hidden state.
- **Matches existing memory conventions.** `blockerType`, `needsFrom` fields already defined in `task-tracking.md` handoff schema.

### 3.2 Risks and mitigations

| Risk                                                          | Mitigation                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Exit 4 loops if haiku also triggers exit 4                    | `MAX_DEGRADE_RETRIES=2` counter; on exhaustion, escalates to exit-3 behavior. Counter keyed by `taskId`.                            |
| Hook authors misuse exit 3 for genuine blocks                 | Document in `.claude/rules/hooks.md`: exit 3 = "needs human input", exit 2 = "hard policy violation". Lint rule in hook-creator.    |
| Dispatcher bug re-enters exit-4 path without counter increment | Centralize respawn in router dispatch; prohibit direct hook→respawn paths.                                                          |
| Malformed stderr trailer                                      | Dispatcher defaults are safe (`safety`/`unspecified`); never parse-fails.                                                           |
| Exit 3 taskId resolution when hook fires outside a task       | Dispatcher falls back to surfacing escalation as a user message (no TaskUpdate) when `currentTaskId` is null.                       |

### 3.3 Neutral

- Existing hooks require **zero changes**.
- Contract change requires **one** router dispatcher modification (S4 phase 2, separate change).
- Observability: exit 3/4 events should be emitted to `.claude/context/runtime/tool-events.jsonl` alongside existing allow/block events.

## 4. Alternatives Considered

| Alternative                                | Rejected because                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structured JSON on stderr**              | Breaks existing contract. Hooks already use stderr for human-readable messages. Parsing JSON everywhere adds fragility and back-compat risk. |
| **Marker file** (`.claude/context/runtime/hook-escalation.json`) | Ties hook outcome to filesystem state; racy in concurrent tool calls; breaks on Windows file locking.                                    |
| **Extended codes via env var** (e.g., `HOOK_ESCALATE=safety` + exit 2) | Racy across concurrent hook invocations; env vars don't reliably round-trip in the hook spawn protocol. |
| **Three-valued exit (keep 0/1/2, overload 1)** | Exit 1 already has defined fail-open semantics in advisory hooks. Overloading breaks that contract and existing behavior.              |

## 5. References

- ArXiv [2604.11088] — "Negative-constraint hooks outperform prompt guidance for LLM agent safety." Strengthens the decision to keep exit 2 (hard block) as a distinct terminal outcome rather than collapsing everything into escalation paths. Supports the decision to add NEW codes rather than remap existing ones.
- ArXiv [2604.15579] — "Symbolic guardrails enforce 74% of policy without utility loss." Motivates the escalation path (code 3) over hard-blocking: structured handoff to user preserves the other 26% where policy is ambiguous.
- Exa research — NeMo Guardrails defense-in-depth (Llama Guard → Guardrails AI → NeMo → deterministic matching). Industry pattern validates layered escalation: deterministic block for clear violations, structured handoff for ambiguous cases.
- `.claude/rules/hooks.md` §Fail-Open vs Fail-Closed Policy — existing contract being extended.
- `.claude/rules/task-tracking.md` §Agent-to-Agent Coordination — `blockerType`/`needsFrom` schema reused verbatim.
- `.claude/hooks/CLAUDE.md` — hook directory catalog (124+ `process.exit()` sites inventoried 2026-04-21).

## 6. Implementation Phases

### Phase 1 — Contract definition (this ADR; v2.3.0-S4 phase 1)

- **Scope:** ADR only. No code changes. No hook changes. No router changes.
- **Deliverable:** This document.
- **Gate:** ADR merged to `decisions.md` index.

### Phase 2 — Router dispatcher + minimal opt-in hook (v2.3.0-S4 phase 2)

- **Scope:** Implement dispatcher switch in router post-hook-execution. Add `MAX_DEGRADE_RETRIES` config. Wire observability events. One pilot hook opts into exit 3 (candidate: `pre-tool-unified.cjs` guardrails branch for ambiguous writes).
- **Acceptance tests** (see §7 below).

### Phase 3 — Hook migration recommendations (future, not v2.3.0)

- **Scope:** Document migration guidance. Identify hook candidates where current exit-2 sites are actually ambiguous-policy (candidates for exit 3) or capability-tier issues (candidates for exit 4). Update hook-creator skill to surface the 4-value contract.
- **Non-goal:** Mass migration. Contract remains opt-in indefinitely.

## 7. Acceptance Tests (Phase 2)

| # | Scenario                                              | Expected Router Behavior                                                                                                  |
| - | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1 | Hook exits `0`                                        | Tool proceeds. No behavior change.                                                                                         |
| 2 | Hook exits `2`                                        | Tool refused. Message surfaced. No behavior change.                                                                        |
| 3 | Hook exits `1`                                        | Advisory hooks: allow (fail-open). Security hooks in fail-closed category: block per existing policy. No behavior change. |
| 4 | Hook exits `3` with trailer `ESCALATE: blockerType=safety reason=ambiguous-write` | Router calls `TaskUpdate({ status: 'blocked', blockerType: 'safety', needsFrom: 'user', blocker: 'ambiguous-write' })`. Tool deferred. |
| 5 | Hook exits `3` with no trailer                        | Router calls `TaskUpdate({ ..., blockerType: 'safety', blocker: 'unspecified' })`. No parse failure.                       |
| 6 | Hook exits `4` with trailer `DEGRADE: reason=opus-mismatch attempt=1` (first attempt) | Router respawns task with `model: 'haiku'` override. Retry counter = 1.                                          |
| 7 | Hook exits `4` twice consecutively for same `taskId`  | First respawn succeeds (counter=1). Second respawn succeeds (counter=2). Third exit-4 escalates to exit-3 behavior.        |
| 8 | Hook exits `4` when `currentTaskId` is null           | Treated as exit 3 (cannot respawn without task context). Escalation surfaces as user message.                              |
| 9 | Unknown exit code (e.g., `5`)                         | Dispatcher default: fail-open (exit-1 semantics). Logged as anomaly to `tool-events.jsonl`.                                |

---

## Investigation Findings (Phase 1 scoping)

**Current convention confirmed (no surprises):**

- 124 `process.exit()` call sites across 30+ hook files. Every site uses `0`, `1`, or `2`.
- Exit codes 3–9 are completely unused → namespace is clean for new codes.
- Fail-open vs fail-closed policy is clearly documented in `.claude/rules/hooks.md` and consistently applied.
- `blockerType` + `needsFrom` metadata schema already exists in task-tracking handoff contract — new exit-3 semantics reuse it 1:1 with no schema invention.

**Objections considered during investigation:**

- **"Why not use the existing reflection queue for escalations?"** Reflection queue is post-hoc and out-of-band; it doesn't defer the tool call. Exit 3 is synchronous with the dispatcher, avoiding the race where a tool completes successfully before its escalation is processed.
- **"Isn't exit 4 just a form of circuit breaker?"** Yes, with a specific policy (model downgrade). Circuit breakers in the existing codebase use different mechanisms (e.g., `pre-tool-unified.cjs` uses an internal counter + block). Exit 4 standardizes the pattern at the contract level.
- **"Could this be done with a single new exit code (e.g., exit 3 = 'escalate', with payload choosing action)?"** Rejected: the two actions differ fundamentally in router semantics (block-and-wait vs respawn-and-continue). Conflating them into one code requires parsing stderr to decide flow — brittle and harder to audit.

## Recommended Phase 2 Follow-Up Task

**Task description** (for planner to decompose):

> **Implement hook exit-code dispatcher for codes 3 and 4 (v2.3.0 S4 phase 2).**
>
> Per ADR-2026-04-21, extend router's post-hook-execution path to:
> (1) Parse exit codes 3 and 4 with stderr trailers (`ESCALATE:` / `DEGRADE:`).
> (2) On exit 3: call `TaskUpdate({ status: 'blocked', blockerType, needsFrom: 'user', blocker })` with parsed trailer values; default to `safety`/`unspecified` on missing trailer.
> (3) On exit 4: increment per-`taskId` retry counter (persist in `.claude/context/runtime/degrade-retries.json`); respawn task with `model: 'haiku'` override; after `MAX_DEGRADE_RETRIES=2` escalate to exit-3 behavior.
> (4) Emit `hook_escalate` and `hook_degrade` events to `.claude/context/runtime/tool-events.jsonl`.
> (5) Pilot: convert one ambiguous-write branch in `pre-tool-unified.cjs` from exit 2 → exit 3 with trailer; verify acceptance tests §7.1–§7.9 pass.
> (6) Update `.claude/rules/hooks.md` fail-open/fail-closed policy table with rows for codes 3 and 4.
> (7) No changes to the 123+ existing `process.exit(0|2)` sites. Opt-in only.
>
> **Estimated complexity:** MEDIUM (single dispatcher module + pilot hook + rules doc + tests).
> **Dependencies:** This ADR (Phase 1) merged.
> **Out of scope for Phase 2:** Mass migration of existing hooks, hook-creator skill updates (those are Phase 3).
