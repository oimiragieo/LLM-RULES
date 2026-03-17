# UAT Verify-Work Workflow

**Purpose:** Systematically verify that completed work satisfies the acceptance criteria defined in the originating task or plan.

---

## Phase 1: Criteria Extraction

1. Read the task description, plan file, or user story that defines the feature.
2. Extract every explicit acceptance criterion — anything described as "must", "should", "expected to", or listed under "acceptance criteria", "definition of done", or "requirements".
3. If no acceptance criteria are present, derive them from the feature description and document your interpretation.
4. Record all criteria in a numbered list before proceeding.

---

## Phase 2: Evidence Collection

For each criterion identified in Phase 1:

1. Locate the code, configuration, or artifact that is claimed to satisfy the criterion.
2. Execute tests, run the feature, or inspect output to produce concrete evidence:
   - Run `pnpm test` or `node --test <file>` for automated test coverage.
   - Execute `Bash` commands to exercise the feature and capture output.
   - Read relevant source files to confirm implementation.
3. Capture all evidence: test output, command output, file excerpts, screenshots (if applicable).
4. Tag each piece of evidence to the criterion it addresses.

---

## Phase 3: Criteria Matching

For each criterion:

1. Compare the evidence collected against the criterion statement.
2. Assign a verdict of **PASS** or **FAIL** for the criterion.
3. For **PASS**: cite the specific evidence (test name, line output, file path).
4. For **FAIL**: document what was found vs. what was expected. Note any gap or missing implementation.

---

## Phase 4: Verdict

1. Tally PASS and FAIL counts across all criteria.
2. If **all criteria PASS** → overall verdict is **PASS**.
3. If **any criterion FAILs** → overall verdict is **FAIL**.
4. A partial PASS is not acceptable — every criterion must be satisfied for the feature to be considered complete.

---

## Phase 5: Report

1. Use the template at `.claude/templates/uat-results.md` to produce a UAT results report.
2. Fill in:
   - Feature name and date
   - Per-criterion PASS/FAIL with supporting evidence
   - Overall verdict
   - Any gaps or remediation steps if verdict is FAIL
3. Write the report to `.claude/context/reports/backend/uat-{feature}-{YYYY-MM-DD}.md`.
4. Call `TaskUpdate(completed)` with a summary referencing the report path.

---

## Anti-Patterns

- Never mark a task complete without running through all five phases.
- Never assign PASS to a criterion based on code inspection alone — execute the feature.
- Never skip evidence collection when the developer asserts "it works."
- Never produce a report that omits failing criteria — every FAIL must be documented.

## Related

- `.claude/skills/uat-verify/SKILL.md` — skill for invoking this workflow
- `.claude/templates/uat-results.md` — report template
