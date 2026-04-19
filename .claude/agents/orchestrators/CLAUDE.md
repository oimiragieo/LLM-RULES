---
name: CLAUDE
tools:
  - Read
  - Task
skills:
  - memory-search
  - ripgrep
  - code-semantic-search
  - code-structural-search
---

# Orchestrator Agents

Multi-agent coordinators that manage complex workflows requiring multiple specialists. They delegate work via `Task()` but never implement directly.

Search-First Protocol: use `pnpm search:code`, `ripgrep`, or hybrid search before changing orchestration routing so delegation rules stay aligned with the underlying agent prompts.

## Orchestrators

| File                        | Purpose                   | Key Details                                                                                                     |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `master-orchestrator.md`    | CEO agent                 | Manages project lifecycle, coordinates subagents, handles high-level requests. Never implements code.           |
| `evolution-orchestrator.md` | Framework evolution       | Orchestrates the EVOLVE workflow for creating new agents, skills, workflows, hooks, and schemas.                |
| `heartbeat-orchestrator.md` | Cron isolation            | Isolates cron job execution from router session. Registers heartbeat loops, spawns disposable sub-agents.       |
| `loop-operator.md`          | Iteration safety          | Governs autonomous loops with safety rails — max iterations, time budget, quality floor. Auto circuit-breaker.  |
| `party-orchestrator.md`     | Multi-agent collaboration | Compatibility orchestrator for Party Mode style collaboration. Routes through standard Task-based coordination. |
| `swarm-coordinator.md`      | Swarm management          | Queen/Worker topology. Handles consensus, task distribution, and result aggregation across agent swarms.        |
| `artifact-integrator.md`    | External integration      | Lead orchestrator for integrating GitHub repos, APIs, datasets. Enforces security-first multi-agent pipeline.   |

## Domain Routers

Hierarchical routing layer that selects the best specialist within a domain and delegates via `Task()`.

| File                            | Domain                                        |
| ------------------------------- | --------------------------------------------- |
| `domain-router-ai-ml.md`        | AI/ML specialists                             |
| `domain-router-arch-data.md`    | API, architecture, database, C4 modeling      |
| `domain-router-backend.md`      | Backend language/framework specialists        |
| `domain-router-infra.md`        | Infrastructure and DevOps                     |
| `domain-router-mobile.md`       | Mobile and desktop applications               |
| `domain-router-niche.md`        | Specialized niche domain experts              |
| `domain-router-product.md`      | Product, business, UX, marketing              |
| `domain-router-security.md`     | Security, resilience, performance, compliance |
| `domain-router-web-frontend.md` | Web frontend specialists                      |
