# Research Requirements — ralph-loop

## Research Date

2026-02-28

## Query Intent

Understand the Ralph Wiggum / Ralph Loop pattern for autonomous Claude Code iteration, compare community implementations with our existing tooling, and design a production-grade skill.

## Exa Sources

1. **claudefa.st/blog/guide/mechanics/ralph-wiggum-technique** — Complete technical guide covering stop hooks, completion promises, verification-first workflows, two-phase (plan/execute) separation, UI verification protocol, cost economics (~$10.42/hr on Sonnet).

2. **yuv.ai/blog/ralph-claude-code** — Frank Bria's implementation details: dual-condition exit gate (heuristic + model confirmation), circuit breaker pattern (3 repeated actions = exit), session continuity, rate limiting, cost controls (--max-cost, --timeout).

3. **github.com/alfredolopez80/multi-agent-ralph-loop** (86 stars) — Full orchestration system with memory-driven planning, multi-agent coordination, Agent Teams integration, security validation. Shell + Python + JS. Topics: ralph-loop, state-machine, eval-driven-development.

4. **blog.logrocket.com/ralph-claude-code/** — "The completion primitive in agentic systems isn't simply 'run in a loop.' It's 'run in a loop with verifiable stop conditions.'" Key patterns: circuit breakers, explicit completion signal, exit gates.

5. **dev.to/sivarampg** — Matt Pocock endorsement: "Ralph Wiggum + Opus 4.5 is really, really good." Core mechanics: stop hook with exit code 2, state file tracking, git history visibility between iterations.

6. **playbooks.com/skills/kimasplund/claude_cognitive_reasoning/ralph-loop-integration** — Cognitive reasoning integration: completion promise gating, state persistence in `.claude/ralph-loop.local.md`, high-confidence threshold (>90%) gating.

## VoltAgent Search

Searched VoltAgent/awesome-agent-skills README for "ralph" — no matching skill found. Proceeding with Exa/community research.

## arXiv Sources

1. **COCO: Cognitive Operating System with Continuous Oversight** (arxiv:2508.13815) — Decoupled monitoring architecture with O(1) overhead. Three innovations: Contextual Rollback (stateful restart with error diagnostics), Bidirectional Reflection (mutual validation preventing oscillation), Heterogeneous Cross-Validation (ensemble disagreement). 6.5% average improvement. Relevant: contextual rollback maps to our guardrails pattern.

2. **AutoLabs: Cognitive Multi-Agent Systems with Self-Correction** (arxiv:2509.25651) — Self-correcting multi-agent architecture for autonomous execution. Iterative self-correction before generating output. Ablation study: reasoning capacity is most critical factor (85% error reduction). Relevant: iterative self-correction is the core Ralph pattern.

3. **CorrectAD: A Self-Correcting Agentic System** (arxiv:2511.13297) — PM-Agent formulates requirements, generative model simulates data, pipeline is end-to-end model-agnostic. Relevant: agent-role separation (PM vs executor) parallels our router/agent separation.

## Design Constraints (mapped to artifacts)

1. **Circuit breaker is mandatory** — Community consensus: without it, loops burn tokens on repeated failures. Maps to: `hooks/pre-execute.cjs` (detect repeated state), `schemas/input.schema.json` (maxIterations, circuitBreakerThreshold).

2. **State file must be checked BEFORE stdin read** — GitHub issue #234 on official plugin: stop hook reading stdin blocks ALL sessions, not just ralph sessions. Maps to: `scripts/main.cjs` (early exit check).

3. **Dual-condition exit** — Both heuristic (completion signal in output) AND verification (tests pass / validation succeeds). Maps to: `rules/ralph-loop.md` (verification-first principle).

## Non-Goals

- Not replacing Claude Code's native task management (CLAUDE_CODE_TASK_LIST_ID)
- Not implementing multi-model orchestration (single Claude Code session)
- Not providing a web UI or dashboard
- Not managing git branching (that's the user's responsibility)
