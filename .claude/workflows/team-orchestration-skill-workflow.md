# team-orchestration Skill Workflow

## Overview

This workflow describes the full 6-phase pipeline managed by the `team-orchestration` skill:
**Plan → Design → Implement → Review → Test → Deploy**

Each phase has an explicit entry gate, exit criteria checklist, and an optional approval gate before advancing.

## When to Invoke

- For any HIGH or EPIC complexity task spanning multiple agents
- When a task requires formal phase tracking with approval gates
- When a `master-orchestrator` needs a structured pipeline to delegate to specialists
- When work spans multiple sessions and needs checkpoint persistence

## Initial Invocation

```javascript
Skill({ skill: 'team-orchestration' });
```

Then advance through phases:

```bash
# Start the pipeline
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase plan --task {{task_id}}

# Advance to next phase
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase design --task {{task_id}}
```

## Phase Definitions

### Phase 1: PLAN

**Purpose:** Decompose the task and define work packages.

**Entry criteria:**

- Task scope and requirements are clear
- `task_id` is set in `TaskCreate` or exists in `TaskList`

**Agent:** `planner` (sonnet model)

**Exit criteria checklist:**

- [ ] Requirements captured in `.claude/context/plans/<task_id>-plan.md`
- [ ] Sub-tasks created in `TaskCreate` with dependencies declared
- [ ] Risk items identified and documented
- [ ] Complexity classified (LOW/MEDIUM/HIGH/EPIC)

**Approval gate:** HUMAN (required for EPIC tasks; automated for others)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase plan --task {{task_id}}
```

**Expected output:** Snapshot at `.claude/context/plans/{{task_id}}.snapshot.json` with `phase: "plan"`, `status: "complete"`.

---

### Phase 2: DESIGN

**Purpose:** Define architecture and API contracts.

**Entry criteria:**

- Phase 1 (plan) complete and approved
- Plan file exists at `.claude/context/plans/<task_id>-plan.md`

**Agent:** `architect` (sonnet model)

**Exit criteria checklist:**

- [ ] Architecture decision documented in `decisions.md`
- [ ] API contracts / interface definitions created
- [ ] Data flow diagrams completed (if applicable)
- [ ] Security review completed (if auth/PII involved)

**Approval gate:** CONSENSUS (architect + security-architect)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase design --task {{task_id}}
```

---

### Phase 3: IMPLEMENT

**Purpose:** Write code following TDD.

**Entry criteria:**

- Phase 2 (design) complete and approved
- Interface contracts exist

**Agent:** `developer` (sonnet model)

**Exit criteria checklist:**

- [ ] All failing tests written first (Red phase)
- [ ] Minimal code written to pass tests (Green phase)
- [ ] Code refactored (Refactor phase)
- [ ] `pnpm lint:fix` passes with 0 errors
- [ ] `pnpm format` produces no changes
- [ ] All new tests pass

**Approval gate:** AUTOMATED (CI + lint/test gates)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase implement --task {{task_id}}
```

---

### Phase 4: REVIEW

**Purpose:** Code review for quality, security, and standards.

**Entry criteria:**

- Phase 3 (implement) complete
- All automated gates passing

**Agent:** `code-reviewer` (sonnet model)

**Exit criteria checklist:**

- [ ] Code review report generated
- [ ] All HIGH severity findings addressed
- [ ] Security review completed (if applicable)
- [ ] No regressions identified

**Approval gate:** HUMAN (review sign-off)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase review --task {{task_id}}
```

---

### Phase 5: TEST

**Purpose:** QA validation and end-to-end testing.

**Entry criteria:**

- Phase 4 (review) complete and approved
- All code review findings resolved

**Agent:** `qa` (sonnet model)

**Exit criteria checklist:**

- [ ] Integration tests pass
- [ ] Edge cases covered
- [ ] No P0/P1 bugs open
- [ ] Test coverage meets project threshold

**Approval gate:** AUTOMATED (test suite pass rate)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase test --task {{task_id}}
```

---

### Phase 6: DEPLOY

**Purpose:** Ship to production.

**Entry criteria:**

- Phase 5 (test) complete
- All tests passing
- CHANGELOG.md updated

**Agent:** `devops` (sonnet model)

**Exit criteria checklist:**

- [ ] Changelog updated
- [ ] Version bumped (if applicable)
- [ ] Deployment artifact built
- [ ] Health checks passing post-deploy

**Approval gate:** HUMAN (production deploy sign-off)

**Command:**

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase deploy --task {{task_id}}
```

---

## State Persistence

The pipeline state is persisted to:

```
.claude/context/plans/{{task_id}}.snapshot.json
```

This file contains:

- `currentPhase` — the active phase
- `completedPhases` — array of completed phases
- `approvalLog` — record of approval gate outcomes
- `agentOutputs` — key findings from each agent
- `phaseTimes` — ISO timestamps for start/end of each phase

If the session is interrupted, re-invoke with the same `task_id` and the pipeline resumes from the last persisted phase.

## Approval Gate Bypass

For automated pipelines or testing, gates can be bypassed with explicit justification:

```bash
node .claude/skills/team-orchestration/scripts/main.cjs \
  --phase deploy --task {{task_id}} \
  --skip-approval-gate \
  --justification "Automated CI pipeline with full test coverage"
```

Bypass events are logged to the snapshot with `{ gate, reason, timestamp, approver: "automated" }`.

## Error Handling

| Error                      | Behavior                                                        |
| -------------------------- | --------------------------------------------------------------- |
| Snapshot missing on resume | Create new snapshot from current phase                          |
| Invalid phase transition   | Block with warning; show current phase                          |
| Agent failure              | Mark phase `failed`; halt pipeline; require manual intervention |
| Approval gate rejected     | Mark phase `rejected`; pause pipeline; notify user              |

## Related Skills

- `gap-detection` — Run before Phase 1 to pre-populate known gaps into the plan
- `project-stage-detection` — Use to determine if team-orchestration is necessary (not needed for `new` stage)
- `plan-generator` — Alternative for simpler (LOW/MEDIUM) plans not needing full 6-phase pipeline
- `proactive-audit` — Run after Phase 6 to validate deployment quality
