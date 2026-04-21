---
name: uat-verify
description: Verify completed work against acceptance criteria, collect evidence, and produce a PASS/FAIL UAT report
version: 1.0.0
tools:
  - Read
  - Bash
  - Grep
  - Glob
  - TaskUpdate
source: builtin
trust_score: 100
provenance_sha: be9f7b3ee10b09d8
---

# UAT Verify Skill

## Purpose

Systematically verify that a completed feature or task satisfies every acceptance criterion before marking work done. Produces a structured PASS/FAIL report with concrete evidence.

## When to Invoke

`Skill({ skill: 'uat-verify' })`

Invoke when:

- A developer or agent has marked work complete and you need to independently verify it
- A task has acceptance criteria that must be validated before closing
- A pull request or deliverable needs UAT sign-off
- You need to produce an evidence-backed completion report

---

## Workflow

### Step 1: Extract Acceptance Criteria

Read the task, plan, or user story:

```bash
# Read task details
TaskGet({ taskId: '<id>' })
# or read plan file
Read('.claude/context/plans/<feature>-plan.md')
```

Extract all acceptance criteria into a numbered list. Look for:

- Bullet points under "Acceptance Criteria", "Definition of Done", "Requirements"
- "must", "should", "expected to", "given/when/then" patterns
- Explicit test assertions or feature descriptions

### Step 2: Collect Evidence Per Criterion

For each criterion, execute verification steps:

```bash
# Run automated tests
node --test tests/path/to/feature.test.cjs

# Execute feature and capture output
Bash({ command: '<command that exercises the feature>' })

# Inspect implementation
Read('<path/to/implementation/file>')

# Search for required patterns
Grep({ pattern: '<pattern>', path: '<directory>' })
```

Tag every output to the criterion it evidences.

### Step 3: Score Each Criterion PASS or FAIL

For each criterion:

- **PASS** — evidence directly satisfies the criterion statement. Cite: test name, line output, or file reference.
- **FAIL** — evidence is missing, contradicts the criterion, or the feature does not behave as specified. Document the gap.

### Step 4: Produce Verdict

- All criteria PASS → overall **PASS**
- Any criterion FAIL → overall **FAIL**

### Step 5: Write Results Report

Use the UAT results template:

```
Read('.claude/templates/uat-results.md')
```

Fill in all placeholders. Write the completed report to:
`.claude/context/reports/backend/uat-{feature}-{YYYY-MM-DD}.md`

Then call:

```javascript
TaskUpdate({
  taskId: '<id>',
  status: 'completed',
  metadata: {
    summary: 'UAT complete: PASS/FAIL — N/M criteria satisfied',
    reportPath: '.claude/context/reports/backend/uat-{feature}-{YYYY-MM-DD}.md',
  },
});
```

---

## Anti-Patterns

- Never claim PASS without executing the feature — reading code is not proof it works
- Never skip failing criteria in the report — all FAILs must be documented
- Never produce a "partial PASS" — the verdict is binary
- Never run test execution inside a read-only review — use Bash to actually execute

## Related

- `.claude/workflows/enterprise/verify-phase-uat.md` — detailed 5-phase workflow
- `.claude/templates/uat-results.md` — report template
