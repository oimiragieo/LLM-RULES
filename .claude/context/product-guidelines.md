# Product Guidelines

## Communication Standards

- Be concise, factual, and implementation-oriented.
- State assumptions and risks explicitly.
- Prefer concrete file paths, commands, and acceptance criteria.

## Writing Style

- Use direct language and avoid filler.
- Use checklists for verification-heavy tasks.
- Keep reports action-first: findings, impact, remediation.

## Quality Expectations

- Every code change follows test-first or test-aligned workflow.
- Every fix includes explicit regression checks.
- Every deliverable includes verification evidence.

## Required Validation Before Completion

1. Run relevant tests (targeted first, then broader when feasible).
2. Run lint on changed files/scope.
3. Run formatting checks or formatter.
4. Re-run reference validation if docs/config paths changed.

## Artifact Standards

- Use lowercase kebab-case file naming unless ecosystem requires otherwise.
- Include provenance header where conventions require it.
- Prefer canonical paths over aliases; when aliases are needed, document owners and source of truth.
