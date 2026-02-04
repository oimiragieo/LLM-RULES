# QA Library

## criteria.cjs

Provides bounded QA loop criteria and signoff status helpers.

Key exports:

- `getQaSignoffStatus`
- `isQaApproved` / `isQaRejected` / `isFixesApplied`
- `getQaIterationCount`
- `isBuildComplete`
- `shouldRunQa` / `shouldRunFixes`

## report.cjs

Tracks QA iteration history and recurring issues.

Key exports:

- `recordIteration`
- `getIterationHistory`
- `hasRecurringIssues`
- `getRecurringIssueSummary`
- `escalateToHuman`

Plan data lives under `.claude/context/plans/<planId>/`.

See `.claude/docs/AGENT_CONFIG_AND_QA_REFERENCE.md` for the full reference.
