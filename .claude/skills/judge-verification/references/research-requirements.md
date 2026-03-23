# Judge Verification — Research Requirements

## Research Summary

**Date:** 2026-03-23
**Query Intent:** Design an independent LLM judge for evaluating AI agent task completion with minimal false positives.

---

## VoltAgent/awesome-agent-skills Search

Searched for: `judge verification`, `llm evaluation`, `task completion scoring`

**Result:** No direct match for an independent judge verification skill. Found related patterns:

- `agent-evaluation` skill in local catalog (LLM-as-judge for agent outputs — different scope; evaluates agent quality, not task completion)
- `verification-before-completion` skill (completion gate — complementary, not overlapping)
- `goal-backward-verification` skill (verify outputs match goals — partial overlap)

**Design decision:** Build a new skill focused on independence, evidence-gating, and multi-dimensional scoring.

---

## Prior Art Analysis

### RAGAS Framework (RAG Evaluation)

- Source: https://github.com/explodinggradients/ragas
- Relevance: Multi-dimension scoring (faithfulness, answer relevance, context precision) with 0-1 normalized scores
- Pattern extracted: Independent judge with no access to generator's reasoning; score each dimension separately

### Constitutional AI (Anthropic)

- Source: https://arxiv.org/abs/2212.08073
- Relevance: Self-critique and revision. Judge evaluates output against principles.
- Pattern extracted: Explicit rubric per dimension prevents rationalized scores

### G-EVAL (NLG Evaluation)

- Source: https://arxiv.org/abs/2303.16634
- Relevance: LLM-based evaluation with chain-of-thought scoring
- Pattern extracted: Structured JSON output for scores + reasoning. Evidence-first evaluation.

### MT-Bench / LMSYS Chatbot Arena

- Source: https://arxiv.org/abs/2306.05685
- Relevance: Multi-turn evaluation, positional bias in judges
- Pattern extracted: Always require evidence artifacts (never rely on self-report); evidence gate catches "position bias" (favoring last action regardless of quality)

---

## Key Design Constraints (Mapped to Artifacts)

### Constraint 1: Evidence Gate is Non-Negotiable

**Source:** G-EVAL + MT-Bench research showing LLM judges are biased toward verbose self-reports
**Mapping:** `schemas/output.schema.json` — `evidenceOfCompletion` dimension with min 15/25 threshold for PASS
**Hook:** `rules/judge-verification.md` — "Never accept verbal claim of completion as evidence (dim3)"

### Constraint 2: Independence from Executing Agent

**Source:** RAGAS design principle; Constitutional AI feedback loop literature
**Mapping:** `SKILL.md` — "The judge is independent. It has no access to the executing agent's internal reasoning."
**Hook:** `rules/judge-verification.md` — "Never pass the executing agent's chain-of-thought to the judge."

### Constraint 3: CONDITIONAL is Not PASS

**Source:** MT-Bench positional bias — models tend to "round up" borderline cases
**Mapping:** `SKILL.md` verdict formula — CONDITIONAL requires human review, never auto-promoted
**Hook:** `rules/judge-verification.md` — "CONDITIONAL requires human review — Do not auto-promote CONDITIONAL to PASS."

---

## Non-Goals

- **NOT** a regression test runner (that is the `qa` agent)
- **NOT** a code reviewer (that is `code-reviewer` skill)
- **NOT** a general LLM evaluator (that is `agent-evaluation` skill)
- **NOT** an automated CI gate (evidence must be examined per-task, not automated)

---

## arXiv References

1. **"Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"** — Zheng et al. 2023 (arXiv:2306.05685)
   - Key finding: LLM judges show positional bias and verbosity bias; rubric scoring mitigates both

2. **"G-EVAL: NLG Evaluation using GPT-4 with Better Human Alignment"** — Liu et al. 2023 (arXiv:2303.16634)
   - Key finding: Structured JSON output + explicit CoT scoring improves judge reliability

3. **"Constitutional AI: Harmlessness from AI Feedback"** — Bai et al. 2022 (arXiv:2212.08073)
   - Key finding: Independent feedback (judge not seeing generator's reasoning) produces more honest assessments

---

## Local Skill Comparison

| Skill                            | Overlap                   | Difference                                                                                    |
| -------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `verification-before-completion` | Both verify completion    | judge-verification is independent; VBC uses executing agent's context                         |
| `goal-backward-verification`     | Both check goal alignment | judge-verification scores multi-dimension; GBVC is binary pass/fail                           |
| `agent-evaluation`               | Both use LLM-as-judge     | agent-evaluation evaluates agent quality over time; judge-verification is per-task completion |
| `qa-workflow`                    | Both ensure quality       | qa-workflow runs tests; judge-verification evaluates evidence of passing                      |
