# QA Bounded Loop Workflow

This workflow defines a bounded QA loop for a plan directory containing
`implementation_plan.json`. It uses the QA criteria and report modules to
decide when to run QA, apply fixes, or escalate.

## Inputs

- `planDir`: Absolute or project-relative path to a plan directory, e.g.
  `.claude/context/plans/001-feature-name/`

## Steps

1. **Load criteria**
   - Use `.claude/lib/qa/criteria.cjs` to evaluate:
     - `shouldRunQa(planDir)`
     - `shouldRunFixes(planDir)`
     - `getQaIterationCount(planDir)`
2. **Run QA**
   - If `shouldRunQa(planDir)` is false, exit.
   - Run QA review per your QA workflow/skill.
3. **Record iteration**
   - Record the QA verdict and issues summary via
     `.claude/lib/qa/report.cjs` `recordIteration(planDir, verdict, issuesSummary)`.
4. **Fixes and revalidation**
   - If QA rejected and `shouldRunFixes(planDir)` is true, apply fixes, update
     `qa_signoff` in `implementation_plan.json`, then loop to Step 2.
5. **Escalation**
   - If recurring issues are detected (`hasRecurringIssues(planDir)`), or
     `getQaIterationCount(planDir)` reaches the max threshold, call
     `escalateToHuman(planDir, reason)` and stop.

## Notes

- This workflow is **bounded** by `MAX_QA_ITERATIONS` in `criteria.cjs`.
- It is designed to be fail-safe: if plan data is missing, it should exit without
  blocking the main workstream.
