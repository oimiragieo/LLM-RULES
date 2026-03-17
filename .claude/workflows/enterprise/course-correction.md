# Course Correction Workflow

<!-- Agent: developer | Task: #6 | Session: 2026-03-17 -->

A structured multi-phase workflow for detecting and responding to sprint deviations, scope changes, and unexpected blockers that require plan revision.

## When to Use

Invoke this workflow when:

- A sprint is more than 20% off-track on velocity or scope
- A critical blocker is discovered that invalidates the current plan
- New information arrives that changes priority or feasibility
- A dependency fails or a third-party API changes
- Stakeholder requirements shift mid-sprint

**Slash command:** `/correct-course <reason>`

---

## Phase 1: Trigger Detection

**Agent:** `developer` or `planner`
**Goal:** Identify and classify the deviation from the current plan.

### Steps

1. Read the current plan from `.claude/context/plans/` and compare against actual progress.
2. Classify the trigger type:
   - `scope-change` — requirements have shifted
   - `blocker` — a dependency or technical constraint is blocking progress
   - `velocity-drop` — team is behind on estimates
   - `priority-shift` — business priority has changed
   - `external-dependency` — third-party or upstream change
3. Assess severity: `low | medium | high | critical`
4. Document the trigger in a structured `sprint-change-proposal` (see schema).

### Output

A populated `sprint-change-proposal.schema.json` document with `trigger`, `reason`, and preliminary `impact` fields.

---

## Phase 2: Impact Assessment

**Agent:** `architect` or `planner`
**Goal:** Assess the full downstream impact of the detected trigger.

### Steps

1. Map all tasks currently `in_progress` or `pending` that are affected.
2. Estimate effort delta (positive = more work, negative = less work).
3. Identify which tasks can be:
   - **Continued** with minor adjustment
   - **Replanned** with new estimates
   - **Deferred** to the next sprint
   - **Dropped** from scope
4. Assign `riskLevel`: `low | medium | high | critical`
5. List `tasksAffected` with task IDs and impact summaries.

### Output

A completed `impact` section in the `sprint-change-proposal` document, including `tasksAffected`, `riskLevel`, and `effortDelta`.

---

## Phase 3: Revised Plan

**Agent:** `planner`
**Goal:** Generate a revised sprint plan based on the impact assessment.

### Steps

1. Invoke `Skill({ skill: 'plan-generator' })` in `course-correction` mode.
2. For each affected task, generate a `proposedChange`:
   - `action`: one of `add | remove | defer | reprioritize | rescope`
   - `target`: task ID or feature name
   - `rationale`: one-sentence justification
3. Recalculate sprint capacity and velocity projections.
4. Produce an updated plan file at `.claude/context/plans/` with a `-revised` suffix.
5. Ensure all `must-haves` are preserved; move `should-haves` to backlog if needed.

### Output

An updated plan document and a complete `proposedChanges` array in the change proposal.

---

## Phase 4: Stakeholder Approval

**Agent:** `planner` or `general-assistant`
**Goal:** Get acknowledgment from the user/stakeholder before executing the revised plan.

### Steps

1. Present a concise summary of the course correction:
   - What changed and why (trigger)
   - What the impact is (effort, risk, affected tasks)
   - What the proposed changes are (add/remove/defer)
2. Use `AskUserQuestion` to request explicit approval:
   ```
   "Course correction proposal ready. Do you approve the revised plan? (yes/no)"
   ```
3. If **approved**: proceed to Phase 5.
4. If **rejected**: return to Phase 3 with stakeholder feedback, adjust the revised plan.
5. Record the approval in `approvedBy` and `timestamp` fields of the change proposal.

### Output

A signed-off change proposal with `approvedBy` set.

---

## Phase 5: Execute

**Agent:** `developer`, `qa`, `devops` (as needed)
**Goal:** Execute the revised plan according to the approved `proposedChanges`.

### Steps

1. Apply each `proposedChange` in order:
   - `add` → create new task via `TaskCreate`
   - `remove` → close the task via `TaskUpdate(completed, { reason: "dropped from scope" })`
   - `defer` → update task metadata with `{ deferredTo: "next-sprint" }`
   - `reprioritize` → update task priority in `TaskUpdate`
   - `rescope` → update task description and estimates
2. Update the active plan file markers (`[ ]` → `[~]` → `[x]`).
3. Spawn the appropriate specialist agents to execute newly-added or rescoped tasks.
4. Run `pnpm test` after each significant change to ensure no regressions.
5. After all changes are applied, run `pnpm lint:fix && pnpm format`.
6. Commit with message: `fix(sprint): course correction — <trigger type>`

### Output

All proposed changes implemented, tests passing, plan file updated, commit created.

---

## Change Proposal Schema

All course corrections MUST produce a valid `sprint-change-proposal.schema.json` document.
Schema location: `.claude/schemas/sprint-change-proposal.schema.json`

**Minimum required fields:**
- `reason` — human-readable description of why correction is needed
- `impact` — structured impact object with `tasksAffected` and `riskLevel`
- `proposedChanges` — array of change objects with `action`, `target`, `rationale`

---

## Anti-Patterns

- Never skip Phase 4 (Stakeholder Approval) for `high` or `critical` risk changes
- Never execute without a completed impact assessment
- Never drop a `must-have` task without explicit user confirmation
- Never reuse a stale plan file — always create a `-revised` copy

## Related References

- `.claude/schemas/sprint-change-proposal.schema.json` — Change proposal validation schema
- `.claude/commands/correct-course.md` — Slash command entry point
- `.claude/skills/plan-generator/SKILL.md` — Plan generation skill
- `.claude/workflows/enterprise/feature-development-workflow.md` — Standard development workflow
