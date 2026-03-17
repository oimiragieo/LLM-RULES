# UAT Results: {{FEATURE_NAME}}

**Date:** {{DATE}}
**Overall Verdict:** {{PASS|FAIL}}
**Criteria Satisfied:** {{N}} / {{TOTAL}}

---

## Summary

Brief description of what was tested and the outcome.

---

## Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | {{criterion}} | {{PASS/FAIL}} | {{evidence}} |
| 2 | {{criterion}} | {{PASS/FAIL}} | {{evidence}} |
| 3 | {{criterion}} | {{PASS/FAIL}} | {{evidence}} |

---

## Evidence Details

### Criterion 1: {{criterion}}

**Status:** {{PASS/FAIL}}

**Evidence:**

```
{{evidence — paste test output, command output, or file excerpt here}}
```

---

## Gaps and Remediation

{{gaps — list any failing criteria and the steps required to remediate them. If all criteria passed, write "None."}}

---

## Result

**{{FEATURE_NAME}} UAT status: {{PASS|FAIL}}**

- Criteria evaluated: {{TOTAL}}
- Criteria passed: {{N}}
- Criteria failed: {{TOTAL - N}}

<!-- Agent: uat-verify | Task: #{{taskId}} | Session: {{DATE}} -->
