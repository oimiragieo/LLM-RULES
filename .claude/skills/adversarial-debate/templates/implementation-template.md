# Adversarial Debate — Synthesis Template

Use this template for the moderator's final synthesis after all rounds complete.

---

## Debate Summary

**Topic:** {{TOPIC}}
**Date:** {{DATE}}
**Rounds completed:** {{ROUNDS}}
**PRO stance:** {{PRO_STANCE}}
**CON stance:** {{CON_STANCE}}

### Score Breakdown

| Round | PRO Score | CON Score |
| ----- | --------- | --------- |

{{ROUND_SCORE_TABLE}}
| **Total** | **{{PRO_TOTAL}}/10** | **{{CON_TOTAL}}/10** |

---

## Key Arguments

**Strongest PRO argument (Round {{PRO_BEST_ROUND}}):**

> {{PRO_BEST_ARGUMENT}}

**Strongest CON argument (Round {{CON_BEST_ROUND}}):**

> {{CON_BEST_ARGUMENT}}

---

## Decision Factors

List 3-5 contextual factors that determine which stance wins in this specific situation:

| Factor       | Favors              |
| ------------ | ------------------- |
| {{FACTOR_1}} | {{FACTOR_1_FAVORS}} |
| {{FACTOR_2}} | {{FACTOR_2_FAVORS}} |
| {{FACTOR_3}} | {{FACTOR_3_FAVORS}} |

---

## Recommendation

**Decision:** {{RECOMMENDATION}}

**Confidence:** {{CONFIDENCE}} <!-- High / Medium / Low -->

**Rationale:**
{{RATIONALE_CITING_ROUNDS}}

**Conditions / Caveats:**
{{CAVEATS}}

---

## ADR Record

This debate informs ADR-{{ADR_NUMBER}}: {{ADR_TITLE}}

Append to `.claude/context/memory/decisions.md`:

```
## [{{DATE}}] Adversarial Debate: {{TOPIC}}
- Recommendation: {{RECOMMENDATION}}
- Confidence: {{CONFIDENCE}}
- PRO score: {{PRO_TOTAL}}/10 | CON score: {{CON_TOTAL}}/10
- Key evidence: {{KEY_EVIDENCE_SUMMARY}}
```
