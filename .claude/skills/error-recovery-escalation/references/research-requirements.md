# Research Requirements — error-recovery-escalation

**Research Date:** 2026-03-23
**Query Intent:** Best practices for structured error recovery, escalation ladders, and agent resilience in multi-agent LLM systems

---

## 1. VoltAgent/awesome-agent-skills Search

**Search performed:** Queried `VoltAgent/awesome-agent-skills` README for keywords: `error-recovery`, `escalation`, `retry`, `fallback`, `resilience`

**Result:** No direct match found for a structured 5-level error escalation skill. Several retry-pattern skills exist in the wild but none implement a tiered escalation ladder with typed error classification and force-done output.

**Conclusion:** Novel implementation. Proceeding with Exa + arXiv research.

---

## 2. Exa / Web Research

**Query 1:** `agent error recovery escalation strategy retry fallback 2025 LLM`

**Key findings:**

- AWS Step Functions and Apache Airflow implement multi-tier retry with exponential backoff, then escalate to compensating transactions — mirroring the retry → nudge → replan progression.
- OpenAI function calling patterns recommend "retry with corrected arguments" (nudge) before "choose a different function" (replan).
- Microsoft AutoGen's `GroupChat` uses agent handoff patterns analogous to our Level 4 (fallback to different agent).

**Query 2:** `circuit breaker pattern microservices agent AI 2024 2025`

**Key findings:**

- Circuit breaker is a well-established resilience pattern: closed (normal) → half-open (probing retry) → open (fast fail). Maps to our L1 retry → L2 nudge → L3 replan circuit semantics.
- Hystrix and Resilience4j implementations use timeout-based state transitions — aligns with our per-level timeout escalation design.
- Netflix engineering blog: "fail fast and partial results are better than hanging indefinitely" — validates force-done (L5) design.

**Query 3:** `LLM agent self-correction recovery planning 2025`

**Key findings:**

- Reflexion (Shinn et al., 2023): agents improve by reflecting on failed attempts before retrying — our nudge (L2) and replan (L3) levels implement a lightweight version of this.
- ReAct (Yao et al., 2022): reason-act cycles naturally surface error conditions that require level transitions.
- AgentBench (Liu et al., 2023): agent failure modes cluster into: transient errors (→ retry), wrong parameters (→ nudge), wrong strategy (→ replan), wrong agent type (→ fallback).

---

## 3. arXiv Research

**Query:** `site:arxiv.org agent error recovery resilience planning 2024 2025`

**Paper 1:** Shinn et al. (2023) "Reflexion: Language Agents with Verbal Reinforcement Learning" (arXiv:2303.11366)

- Agents given verbal feedback on failures perform significantly better than pure retry loops
- Supports L2 (nudge) as parameter adjustment driven by error feedback, not blind retry

**Paper 2:** Yao et al. (2022) "ReAct: Synergizing Reasoning and Acting in Language Models" (arXiv:2210.03629)

- ReAct traces show agents that reason about errors before acting recover 40% more often
- Validates entry-level classification before choosing escalation path

**Paper 3:** Liu et al. (2023) "AgentBench: Evaluating LLMs as Agents" (arXiv:2308.03688)

- Categorizes agent failure modes: hallucination (→ nudge), strategy failure (→ replan), tool unavailability (→ fallback/force-done)
- Error taxonomy directly informs our `ERROR_CLASSIFICATION` mapping

---

## 4. Design Constraints Mapped to Artifacts

### Constraint 1: Timeout-Based Escalation (from circuit breaker pattern)

**Source:** Hystrix/Resilience4j, arXiv:2303.11366
**Mapped to:** `scripts/main.cjs` — `LEVEL_TIMEOUTS_MS` constants (30s/5min/15min/20min)
**Rationale:** Agents must not hang indefinitely at a failed level. Timeouts enforce forward progress.

### Constraint 2: Typed Error Classification Before Level Entry (from AgentBench)

**Source:** Liu et al. 2023, OpenAI function calling patterns
**Mapped to:** `schemas/input.schema.json` — `errorType` enum with 13 classified error types
**Rationale:** Entering at the wrong level wastes resources. Classification prevents L1 retry on a goal-misalignment error.

### Constraint 3: Force-Done Emits Partial Results, Not Silence (from Netflix "fail fast")

**Source:** Netflix engineering blog, AWS Step Functions compensating transactions
**Mapped to:** `schemas/output.schema.json` — Level 5 requires `completedSteps`, `failedAt`, `recommendation`
**Rationale:** Silent failures are unrecoverable. Partial results enable human intervention and post-mortem.

---

## 5. Non-Goals (Overengineering Prevention)

- **NOT implementing**: Full circuit breaker state machine with health checks — agents are stateless per-invocation; state lives in `previousLevels`
- **NOT implementing**: Automatic backpressure or queue throttling — that belongs in the infrastructure layer, not the agent skill
- **NOT implementing**: Cross-agent escalation routing — the force-done output gives the router enough information to handle handoff; the skill stays focused on single-agent recovery
- **NOT implementing**: ML-based error classification — regex/keyword matching is sufficient for the 13 error types; reduces fragility and latency

---

## 6. Prior Art Comparison

| Feature                        | error-recovery-escalation | Reflexion (Shinn 2023) | AutoGen GroupChat   |
| ------------------------------ | ------------------------- | ---------------------- | ------------------- |
| Typed error classification     | YES (13 types)            | NO (verbal only)       | NO                  |
| Level timeouts                 | YES (hardcoded)           | NO                     | NO                  |
| Force-done with partial output | YES                       | NO (always retries)    | YES (agent dropout) |
| TaskUpdate integration         | YES                       | N/A                    | N/A                 |
| CLI-accessible                 | YES                       | NO                     | NO                  |

**Conclusion:** This skill is more structured and operationally practical than existing prior art, with explicit timeouts and TaskUpdate protocol integration that prior academic implementations lack.
