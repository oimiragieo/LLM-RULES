---
name: adversarial-debate
description: N-round opposing-stance debates for trade-off analysis. Assigns pro/con roles to agents, runs structured debate rounds with quality scoring, and produces a moderator synthesis with confidence-rated recommendation. Generalizable to architecture, technology, security, and design decisions.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, Skill, TaskUpdate, TaskCreate, TaskGet]
agents: [architect, planner, security-architect, general-assistant]
category: Specialized Patterns
tags: [debate, trade-off, analysis, decision, architecture, pro-con, adversarial, reasoning]
best_practices:
  - Assign clear opposing stances before debate begins — never let agents pick their own stance mid-round
  - Require each rebuttal to explicitly address the prior argument (no topic drift)
  - Score each round immediately before proceeding to prevent recency bias
  - Moderator must cite specific debate evidence in the final recommendation
  - Limit rounds to 3-5 to keep arguments focused; more rounds rarely change outcome
error_handling: graceful
streaming: supported
related_skills: [llm-council, advanced-elicitation, plan-generator, sequential-thinking]
verified: false
lastVerifiedAt: 2026-03-23T00:00:00.000Z
---

# Adversarial Debate

## Overview

Runs a structured N-round debate between two opposing agents (pro and con) on any decision-requiring topic, then synthesizes a moderator recommendation. Built for architectural decisions, technology choices, security trade-offs, and design reviews — anywhere strong opinions exist and the right answer is non-obvious.

## When to Use

- Architecture decision records (ADRs) needing structured justification
- Technology selection (e.g., Redis vs Postgres, REST vs GraphQL)
- Security trade-off analysis (e.g., strict vs permissive auth policy)
- Design review of competing approaches
- Any HIGH/EPIC task where the planner identifies genuine disagreement among specialists

Do **not** use for:

- Settled best practices (where there is consensus)
- Simple implementation tasks
- Decisions already made and documented in ADRs

## Iron Law

```
NO RECOMMENDATION WITHOUT CITED DEBATE EVIDENCE
```

The moderator's synthesis MUST reference specific arguments made during rounds. A recommendation that ignores debate content is invalid.

## Debate Protocol

### Pre-Debate: Stance Assignment

Before any rounds begin, the invoking agent MUST define:

1. **Topic** — one clear decision question (not open-ended)
2. **Pro stance** — what the PRO agent advocates for
3. **Con stance** — what the CON agent argues against / alternative
4. **Number of rounds** — default 3, max 5
5. **Success criteria** — what a good recommendation looks like

**Example:**

```
Topic: Should we use event sourcing for the order service?
Pro stance: Yes — event sourcing provides audit trail and temporal queries
Con stance: No — event sourcing adds complexity; CRUD with snapshots is sufficient
Rounds: 3
```

### Round Structure

Each round follows this fixed sequence:

**Step 1: PRO Argument**

```
PRO agent argues its stance with:
- 1 primary argument (specific, concrete)
- 1 supporting piece of evidence (metric, case study, or first-principles reasoning)
- 1 anticipated objection pre-addressed
```

**Step 2: CON Rebuttal**

```
CON agent responds with:
- Direct refutation of PRO's primary argument (must engage it — no deflection)
- 1 counter-argument from CON's stance
- 1 counter-evidence or challenge to PRO's evidence
```

**Step 3: Round Score**

Score each round immediately using this rubric (0–10 per dimension):

| Dimension        | Description                                           |
| ---------------- | ----------------------------------------------------- |
| Specificity      | Arguments use concrete examples, not vague claims     |
| Evidence         | Claims backed by data, precedent, or first principles |
| Rebuttal Quality | Directly addresses opposing argument, no deflection   |
| Relevance        | Arguments stay on the stated topic                    |

**Round Score = mean(Specificity, Evidence, Rebuttal Quality, Relevance)**

Track cumulative scores per agent across rounds.

### Final Synthesis (Moderator)

After all rounds, the moderator agent produces a structured synthesis:

```markdown
## Debate Summary

**Topic:** [restate topic]
**Rounds completed:** N
**PRO total score:** X.X/10
**CON total score:** X.X/10

## Key Arguments

**Strongest PRO argument:** [cite round + argument]
**Strongest CON argument:** [cite round + argument]

## Decision Factors

List 3-5 factors that should determine which stance wins in context:

1. Factor: [e.g., team expertise] → Favors: [PRO/CON/neutral]
2. ...

## Recommendation

**Decision:** [clear recommendation — not "it depends"]
**Confidence:** [High / Medium / Low]
**Rationale:** [2-3 sentences citing specific debate evidence from rounds]

## Conditions / Caveats

[Any conditions under which the recommendation should be revisited]
```

## Workflow

### Step 0: Load Context and Memory

```bash
# Check for prior debate results on same topic
grep -r "adversarial-debate" C:/dev/projects/agent-studio/.claude/context/memory/decisions.md 2>/dev/null | tail -5
```

Check `.claude/context/memory/decisions.md` for prior ADRs on same topic. If a prior debate exists, acknowledge it and note whether conditions have changed.

### Step 1: Parse and Validate Input

Validate input against `schemas/input.schema.json`:

```bash
node .claude/skills/adversarial-debate/hooks/pre-execute.cjs '{"topic":"...","proStance":"...","conStance":"...","rounds":3}'
```

**Expected output:** `{ "valid": true }` or error listing missing fields.

### Step 2: Run Debate Rounds

For each round 1..N:

1. PRO agent produces its argument (following Round Structure above)
2. CON agent produces rebuttal (must reference PRO's specific argument)
3. Score the round using the rubric — output a score table
4. Record round to `scripts/main.cjs` output buffer

### Step 3: Moderator Synthesis

After all rounds, produce the Final Synthesis following the template in `templates/implementation-template.md`.

The moderator MUST:

- Reference at least 2 specific round arguments by round number
- State a single clear recommendation (not "it depends without conditions")
- Assign a confidence level (High/Medium/Low) with justification

### Step 4: Persist Decision

Append result to `.claude/context/memory/decisions.md`:

```bash
echo "## [$(date +%Y-%m-%d)] Adversarial Debate: {TOPIC}
- Recommendation: {DECISION}
- Confidence: {CONFIDENCE}
- Rounds: {N}
- Cite: {KEY_EVIDENCE_SUMMARY}" >> .claude/context/memory/decisions.md
```

### Step 5: Emit Observability Event

```javascript
const { sendEvent } = require('.claude/tools/observability/send-event.cjs');
sendEvent({
  tool_name: 'adversarial-debate',
  agent_id: process.env.AGENT_ID || 'unknown',
  session_id: process.env.SESSION_ID || 'unknown',
  outcome: 'success',
});
```

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook: `hooks/pre-execute.cjs` — validates topic, stances, rounds range (1-5).
Post-execution hook: `hooks/post-execute.cjs` — emits observability event via `send-event.cjs`.

## Anti-Patterns

- **Never let agents pick their own stances** — stance drift produces muddled debates
- **Never skip round scoring** — unscored debates allow moderator bias in synthesis
- **Never produce "it depends" recommendations** without explicit conditions listed
- **Never use more than 5 rounds** — beyond round 3, new arguments rarely emerge
- **Never invoke debate for trivial decisions** — overhead not justified for settled questions

## Related Skills

- `llm-council` — parallel multi-LLM synthesis (complementary: debate is sequential, council is parallel)
- `advanced-elicitation` — meta-cognitive reasoning for single-agent analysis
- `plan-generator` — use debate output as an ADR input to plan-generator
- `sequential-thinking` — structured problem decomposition for the topic before debate

## Memory Protocol

**Before starting:** Read `.claude/context/memory/decisions.md` for prior ADRs on related topics.

**After completing:** Append structured summary to `.claude/context/memory/decisions.md` with date, topic, recommendation, confidence, and key evidence citations.

**Do not write directly to** `patterns.json`, `gotchas.json`, or `open-findings.json` — use `MemoryRecord` tool.
