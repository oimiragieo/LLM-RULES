---
name: deep-research
description: Multi-step autonomous research methodology for deep investigation tasks with structured synthesis
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, WebSearch, WebFetch, Bash, Grep, Glob]
agents: [researcher, planner, architect]
category: 'Research & Investigation'
tags: [research, deep-research, investigation, synthesis, multi-step, autonomous]
best_practices:
  - Define explicit scope and success criteria before starting
  - Use multiple independent sources to cross-validate findings
  - Synthesize into actionable insights, not just summaries
  - Validate findings with primary sources
error_handling: graceful
streaming: supported
---

# Deep Research

<identity>
Deep Research Skill — Multi-step autonomous research methodology for structured, evidence-based investigation and synthesis.
</identity>

<capabilities>
- 5-phase autonomous research workflow (Scope → Search → Synthesis → Validation → Report)
- Multi-source evidence gathering with cross-validation
- Structured output with citations and confidence ratings
- Gap detection and iterative depth expansion
- Actionable recommendation generation
</capabilities>

## When to Use

- Task requires investigation across multiple sources before drawing a conclusion
- Evidence-based answers needed, not pattern-matched guesses
- Question spans multiple domains and needs synthesis
- Accuracy of findings is critical to downstream decisions

**Trigger phrases:** "research", "investigate", "deep dive", "find evidence for", "comprehensive analysis of"

## Iron Law

**Never synthesize without reading sources.** Every claim in the final report must trace to a source retrieved during Phase 2.

## 5-Phase Process

**Phase 1: Scope** — Restate as one research question. Define 3–5 sub-questions, success criteria, constraints, and non-goals. Cannot proceed without a written scope block.

**Phase 2: Multi-Source Search** — Run 3+ `WebSearch` queries. `WebFetch` each source URL. `pnpm search:code` for prior-art. Maintain evidence log: URL, claim, confidence (HIGH/MEDIUM/LOW), sub-question. Each sub-question needs ≥2 independent sources.

**Phase 3: Synthesis** — Group evidence by sub-question. CONSENSUS (2+ sources) → HIGH; CONFLICT → LOW, flag for user. Build synthesis matrix. Label unsupported claims `[UNVERIFIED]`.

**Phase 4: Validation**

- [ ] Source freshness — appropriate time period?
- [ ] Contradiction check — resolve or flag CONFLICT items.
- [ ] Assumption audit — 3 assumptions stated explicitly?
- [ ] Scope alignment — each finding maps to a Phase 1 sub-question?
- [ ] Confidence calibration — downgrade single-source HIGH ratings.

**Phase 5: Report** — Save to `.claude/context/reports/backend/<topic>-research-<YYYY-MM-DD>.md` with sections: Executive Summary, Findings (finding + confidence + evidence per sub-question), Conflicts, Recommended Actions, Knowledge Gaps, Sources.

## Tool Usage

| Tool            | Phase | Purpose                       |
| --------------- | ----- | ----------------------------- |
| `WebSearch`     | 2A    | Broad source discovery        |
| `WebFetch`      | 2B    | Extract content from URLs     |
| `Read` / `Grep` | 2C    | Search codebase for prior art |
| `Write`         | 5     | Save report                   |

## Output Locations

- Reports: `.claude/context/reports/backend/<topic>-research-<YYYY-MM-DD>.md`
- Evidence logs (temp): `.claude/context/tmp/research-evidence-<YYYY-MM-DD>.md`

## Search Protocol

1. `pnpm search:code "<query>"` — primary intent-based search
2. `Skill({ skill: 'ripgrep' })` — exact keyword/regex matches
3. `WebSearch` / `WebFetch` — external sources
4. `Grep` — fallback for single-file targeted checks

## Iron Laws

1. **NEVER proceed to Phase 3 without ≥2 sources per sub-question.**
2. **ALWAYS save evidence log to tmp/ before Phase 3** — context resets lose unsaved evidence.
3. **ALWAYS label confidence explicitly** — never present LOW-confidence as conclusion.
4. **NEVER paper over gaps** — unknown answers must be flagged, not omitted.
5. **ALWAYS verify report file exists** before marking task complete.

## Anti-Patterns

- No scope block before searching → unfocused evidence, unsynthesizable
- Single source per claim → cross-validate with ≥2 independent sources
- Synthesizing while searching → introduces confirmation bias; complete Phase 2 first
- Omitting CONFLICT evidence → flag all conflicts explicitly in report

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

Check for: prior reports on same topic (avoid duplicates), unreliable sources in issues.md, relevant ADRs in decisions.md.

**After completing:**

- New research pattern -> `.claude/context/memory/learnings.md`
- Unreliable source identified -> `.claude/context/memory/issues.md`
- Methodology decision -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Save evidence log and partial findings before Phase 3.
