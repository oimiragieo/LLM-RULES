# adversarial-debate Skill Workflow

**Skill:** `adversarial-debate`
**Category:** Specialized Patterns
**Invocation:** `Skill({ skill: 'adversarial-debate' })`

---

## When to Invoke

Before committing to a significant technical decision where multiple viable options exist.
Trigger conditions:
- Architecture choices (microservices vs monolith, SQL vs NoSQL, etc.)
- Technology stack decisions
- Security trade-offs (strict vs permissive controls)
- Design approach with non-obvious cost/benefit profile

---

## Workflow

### Phase 1: Define the Debate

Establish the three-component debate setup:

```
Topic:     {{SPECIFIC_DECISION_TO_BE_MADE}}
Pro Stance: {{OPTION_A_WITH_RATIONALE}}
Con Stance: {{OPTION_B_WITH_RATIONALE}}
Rounds:    {{N}} (1–5, default 3)
Context:   {{RELEVANT_CONSTRAINTS_AND_CONTEXT}}
```

**Verify:** Pro and Con stances are genuinely opposing (not just weak vs strong framing).

### Phase 2: Generate Debate Scaffold

```bash
node .claude/skills/adversarial-debate/scripts/main.cjs \
  --topic "{{TOPIC}}" \
  --pro "{{PRO_STANCE}}" \
  --con "{{CON_STANCE}}" \
  --rounds {{N}}
```

**Expected output:** JSON debate scaffold with round structure.

### Phase 3: Execute Debate Rounds

For each round 1..N:

**PRO agent turn:**
> Present the strongest evidence for `{{PRO_STANCE}}` in context of `{{TOPIC}}`.
> Reference: specific examples, metrics, or proven patterns.
> Rebut the previous CON argument if this is round 2+.

**CON agent turn:**
> Present the strongest evidence for `{{CON_STANCE}}` in context of `{{TOPIC}}`.
> Reference: specific examples, metrics, or proven patterns.
> Rebut the previous PRO argument directly.

**Score each round** on four dimensions (1–5 each):
- Specificity (generic → concrete examples)
- Evidence quality (assertion → data/precedent)
- Rebuttal quality (ignored → directly addressed)
- Relevance to context (tangential → tightly coupled)

### Phase 4: Moderator Synthesis

After all rounds complete, the moderator agent synthesizes:

```markdown
## Synthesis: {{TOPIC}}

### Score Summary
| Round | PRO | CON |
|-------|-----|-----|
| 1     | {{P1}} | {{C1}} |
| ...   | ...  | ...  |
| Total | {{PTOTAL}} | {{CTOTAL}} |

### Key Arguments That Held Up Under Scrutiny
- PRO: [strongest surviving argument]
- CON: [strongest surviving argument]

### Decision Factors That Were Not Adequately Addressed
- [Any gaps that remain unresolved]

### Recommendation
**{{OPTION}}** with {{confidence}}% confidence.

Rationale: [1–2 sentences citing specific debate evidence]

### Conditions Under Which This Recommendation Changes
- [Condition 1]
- [Condition 2]
```

### Phase 5: Record Decision

```markdown
<!-- Append to .claude/context/memory/decisions.md -->

## ADR-XXX: {{TOPIC}}
**Date:** {{DATE}}
**Decision:** {{CHOSEN_OPTION}}
**Confidence:** {{CONFIDENCE}}%
**Debate Scores:** PRO {{PTOTAL}} / CON {{CTOTAL}}
**Rationale:** [From synthesis]
**Reversibility:** {{Reversible|Partially reversible|Irreversible}}
```

---

## Scoring Reference

| Score | Specificity | Evidence | Rebuttal | Relevance |
|-------|-------------|----------|----------|-----------|
| 5 | Named components, metrics | Cited data/precedents | Directly dismantled | Core constraint addressed |
| 3 | Moderately specific | Anecdotal support | Partially addressed | Tangentially relevant |
| 1 | Generic claim | No support | Ignored | Off-topic |

**Flag for re-run** if:
- Any round score differential > 8 (debate too one-sided)
- Both agents argue from the same evidence (stances have drifted)
- Confidence < 60% after N rounds (consider adding rounds)

---

## Integration Points

| Component | Role |
|-----------|------|
| `architect` agent | Primary invoker for architecture decisions |
| `planner` agent | Invokes before plan finalization |
| `security-architect` agent | Invokes for security trade-off analysis |
| `decisions.md` | Receives ADR records from Phase 5 |

---

## Related Skills

- `brainstorming` — explore options before debate (use if stances are unclear)
- `plan-generator` — structured planning using debate-derived decisions
- `architecture-review` — validate post-debate architectural choices
