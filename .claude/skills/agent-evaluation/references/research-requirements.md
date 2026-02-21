<!-- Agent: developer | Task: #2 | Session: 2026-02-21 -->

# Research Requirements: agent-evaluation Skill

**Date**: 2026-02-21
**Query Intent**: LLM-as-judge evaluation frameworks, multi-dimension rubrics, AI output quality measurement

## Research Methodology

| Query                                                   | Source                   | Findings                                |
| ------------------------------------------------------- | ------------------------ | --------------------------------------- |
| "LLM-as-judge evaluation framework best practices 2025" | researcher agent context | 5-dimension rubric pattern established  |
| "AI output quality evaluation rubric scoring"           | researcher agent context | 1-5 scale, weighted composite           |
| "agent evaluation groundedness accuracy coherence"      | researcher agent context | Evidence citation requirement           |
| VoltAgent/awesome-agent-skills search                   | GitHub (no match found)  | No matching skill in curated collection |

## Key Findings

### Design Constraints (mapped to skill design)

1. **5-dimension rubric** (accuracy, groundedness, coherence, completeness, helpfulness) — mirrors established LLM evaluation literature (G-Eval, MT-Bench). Weights: accuracy 30%, groundedness 25%, completeness 20%, coherence 15%, helpfulness 10%.

2. **Evidence citation required** — Every dimension score must cite a direct quote or file:line reference. Prevents grade inflation from vague scoring.

3. **Verdict threshold gates** — Composite <2.5 = POOR/FAILING -> must rework before completion. Enables integration with `verification-before-completion` as a pre-gate.

### Non-Goals

- NOT a performance benchmark (latency, cost) — use separate tooling
- NOT a security audit — use `security-architect`
- NOT a code linter — use `pnpm lint:fix`

### Codebase Patterns Examined

- `.claude/skills/verification-before-completion/SKILL.md` — Pairs with this skill as downstream gate
- `.claude/skills/checklist-generator/SKILL.md` — Similar quality gate pattern
- `.claude/skills/tdd/SKILL.md` — Reference skill for SKILL.md structure

## Sources

- Researcher-provided context (task-2 batch A)
- LMSYS Chatbot Arena evaluation methodology (established rubric patterns)
- G-Eval paper patterns (multi-dimension LLM evaluation)
- Exa MCP unavailable — used researcher agent context as primary source
- Fallback: WebFetch + arXiv for LLM evaluation methodology validation
