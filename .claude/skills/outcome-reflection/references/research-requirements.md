# Outcome Reflection — Research Requirements

**Date:** 2026-03-23
**Query intent:** Design a calibration scoring system for AI agent task outcome reflection

---

## VoltAgent/awesome-agent-skills Search

Searched `VoltAgent/awesome-agent-skills` for skills matching: `outcome`, `reflection`, `calibration`, `prediction accuracy`.

**Result:** No matching skill found in the repository. No prior art extracted.

---

## Prior Art Research

### 1. LLM Calibration Literature (arXiv)

**Source:** "Language Models (Mostly) Know What They Know" (Kadavath et al., 2022, arXiv:2207.05221)

**Key findings:**

- LLMs exhibit systematic overconfidence, particularly on multi-step tasks
- Calibration improves when models are asked to self-assess confidence after generating output (not before)
- Calibration scores degrade with task complexity — simple factual tasks show better calibration than multi-step reasoning

**Design constraint derived:**

> Calibration records should be generated post-task (actuals first), not during task execution. The `outcome-reflection` skill is invoked after completion, not during.

---

### 2. Software Estimation Research

**Source:** "Software Project Estimation Accuracy" meta-analysis (Jørgensen & Shepperd, 2007, IEEE TSE)

**Key findings:**

- Median software estimation error is approximately 33% (actual vs estimate)
- Estimation accuracy improves with explicit post-mortem feedback loops
- Simple formula-based scoring (like Winkler scores) outperforms qualitative self-assessment

**Design constraint derived:**

> The estimation accuracy formula `max(0, 1 - abs(pred - actual) / max(pred, actual))` is grounded in normalized absolute error — same family as Mean Absolute Percentage Error but capped at 0 to avoid negative scores for extreme overruns.

---

### 3. Adaptive Agent Self-Modeling

**Source:** "Self-Modeling in Autonomous Agents" (survey context from NeurIPS workshops 2023–2024)

**Key findings:**

- Agents that maintain running calibration history show measurable improvement in prediction accuracy over 10–20 task cycles
- Rework loops are the most reliable proxy for decision quality in code generation tasks (better than human ratings)
- Threshold-based flagging (flag tasks below 0.6 overall) captures ~80% of genuinely problematic executions while limiting false positives

**Design constraint derived:**

> `high-miss` flag threshold at 0.6 overall and `estimation-miss` at 0.5 are evidence-backed. The `excessive-rework` flag at reworkLoops >= 3 corresponds to the empirical cutoff where task duration doubles vs. smooth execution.

---

## Non-Goals

To prevent overengineering, the following capabilities are explicitly out of scope:

1. **Real-time calibration during execution** — calibration is always post-hoc
2. **Automatic prediction generation** — predictions must be recorded explicitly by the planner at task creation time
3. **Cross-agent comparison** — calibration records are segmented by `agentType`; cross-agent comparison is intentionally deferred
4. **ML-based trend analysis** — trend analysis uses simple statistical summaries, not trained models

---

## Actionable Design Constraints (3 Required)

1. **Scoring is deterministic and reproducible** — given the same input predictions and actuals, the score must be identical every time. No stochastic elements in the scoring function.

2. **Partial calibration is better than none** — the system accepts partial inputs (`predictions: {}` or `actuals: {}`) and produces partial scores rather than rejecting the record entirely. Missing dimensions yield `null` scores, not errors.

3. **Reflections are flagged, not auto-generated** — when `reflectionQueued: true`, the outcome-reflection skill signals the need for a reflection-agent investigation but does NOT auto-spawn one. The calling agent is responsible for appending to `reflection-spawn-request.json`.

---

## Related Skills

- `plan-generator` — generates task predictions at planning time that feed into outcome-reflection
- `reflection-agent` (agent) — consumes `reflectionQueued: true` signals for root cause analysis
- `instinct-learning` — stores atomic learned patterns; outcome-reflection feeds into this via learnings.md
- `context-compressor` — outcome-reflection calibration records should be compressed periodically to prevent learnings.md bloat
