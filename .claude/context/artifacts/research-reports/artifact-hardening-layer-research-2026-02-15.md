# Artifact Hardening Layer Research (2026-02-15)

## Objective

Design an enforceable runtime quality layer for agent-studio:

1. Unified artifact scoring ledger
2. Mandatory regression gate
3. Automated remediation queue
4. Integration into EVOLVE + reflection loops

## Sources (Exa/arXiv + canonical repo references)

1. Automated structural testing of LLM-based agents (arXiv:2601.18827): https://arxiv.org/abs/2601.18827
2. Evo-Memory benchmark for self-evolving memory (arXiv:2511.20857): https://arxiv.org/abs/2511.20857
3. MemoryAgentBench (arXiv:2507.05257): https://arxiv.org/abs/2507.05257
4. LifelongAgentBench (arXiv:2505.11942): https://arxiv.org/abs/2505.11942
5. SWE-Bench Pro long-horizon benchmark (arXiv:2509.16941): https://arxiv.org/abs/2509.16941
6. Dapr Agents (observability + stateful workflows): https://github.com/dapr/dapr-agents
7. Solace Agent Mesh (event-driven multi-agent orchestration): https://github.com/SolaceLabs/solace-agent-mesh

## Key findings applied

- Structural testing and trace-first evaluation should be continuous and machine-readable (not only narrative logs).
- Memory/evolution systems need persistent event streams for incremental scoring and regression detection.
- Long-horizon agent reliability depends on explicit gates in CI/workflow transitions, not post-hoc review.
- Automated remediation should be queue-based with explicit open/resolve state transitions.

## Chosen implementation pattern

- JSONL append-only runtime streams:
  - `.claude/context/runtime/artifact-score-ledger.jsonl`
  - `.claude/context/runtime/remediation-queue.jsonl`
- PostToolUse TaskUpdate hook writes score entries and opens/resolves remediation items.
- CI regression gate fails on:
  - score below pass threshold
  - excessive negative regression delta
  - unresolved high/critical remediation items
- EVOLVE VERIFY phase now requires regression gate pass before ENABLE.

## Why this is simplest viable

- Reuses existing TaskUpdate metadata flow and hook architecture.
- Adds one new runtime hook and one CLI gate; no invasive workflow engine rewrite.
- Keeps data contract explicit via schemas while remaining backward-compatible.
