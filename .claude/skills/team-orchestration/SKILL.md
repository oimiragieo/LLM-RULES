---
name: team-orchestration
description: 6-phase multi-agent pipeline with approval gates. Orchestrates Plan→Design→Implement→Review→Test→Deploy phases with explicit entry/exit criteria, phase-level agent assignment, and human-in-the-loop approval checkpoints.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
agents: [master-orchestrator, planner, architect, developer, qa, devops, code-reviewer]
category: 'Planning & Architecture'
tags: [orchestration, pipeline, multi-agent, approval-gates, phases, team, workflow]
best_practices:
  - Always define entry/exit criteria for each phase before spawning agents
  - Require human approval at Plan→Design and Review→Deploy transitions
  - Track phase state in .claude/context/plans/ for resumability
  - Never advance to the next phase without explicit exit criteria verification
error_handling: strict
source: builtin
trust_score: 100
provenance_sha: afba8c1693518474
---

# Team Orchestration

## Overview

This skill provides a structured 6-phase multi-agent pipeline for medium-to-large feature work:

```
Plan → Design → Implement → Review → Test → Deploy
```

Each phase has:

- **Entry criteria**: conditions that must be met to start the phase
- **Exit criteria**: verifiable outputs that must be produced to leave the phase
- **Approval gate**: human or automated checkpoint before advancing
- **Agent assignment**: the specialist agent responsible for this phase

## When to Use

Use for:

- Features that require collaboration across 3+ agents
- Work that spans multiple files and subsystems
- Tasks where quality gates between phases are important
- Enterprise deliveries requiring audit trail of phase transitions

Do NOT use for:

- Single-file bug fixes (use `developer` directly)
- Simple Q&A or documentation-only changes
- Tasks estimated under 1 hour

## The Iron Law

```
NO PHASE ADVANCE WITHOUT VERIFIED EXIT CRITERIA
```

The orchestrator must verify every exit criterion before spawning the next phase's agent. If any criterion is unmet, the current phase remains active.

## Phase Definitions

### Phase 1: Plan

**Entry criteria:**

- User request received and understood
- Scope boundaries defined (in/out of scope)

**Assigned agent:** `planner`

**Actions:**

```bash
# Planner produces implementation plan
node .claude/tools/team-orchestration/team-orchestration.cjs --phase plan --task "{{task_description}}"
```

**Exit criteria (ALL must pass):**

- [ ] Implementation plan written to `.claude/context/plans/{{task-id}}-plan.md`
- [ ] Task decomposition lists ≥2 and ≤10 subtasks
- [ ] Risk/dependency section populated
- [ ] Plan reviewed by planner for completeness

**Approval gate:** HUMAN (user approves the plan before Design starts)

---

### Phase 2: Design

**Entry criteria:**

- Plan approved by human
- Plan file exists at `.claude/context/plans/{{task-id}}-plan.md`

**Assigned agent:** `architect`

**Actions:**

```bash
# Architect produces design document
node .claude/tools/team-orchestration/team-orchestration.cjs --phase design --plan ".claude/context/plans/{{task-id}}-plan.md"
```

**Exit criteria (ALL must pass):**

- [ ] Design doc written to `.claude/context/plans/{{task-id}}-design.md`
- [ ] API contracts / interfaces defined
- [ ] Data flow diagram or description present
- [ ] Security considerations noted

**Approval gate:** AUTOMATED (validation script checks doc completeness)

---

### Phase 3: Implement

**Entry criteria:**

- Design document exists and is complete
- No unresolved blockers from Design phase

**Assigned agent:** `developer`

**Actions:**

```bash
# Developer implements per design doc
# Uses tdd skill for code changes
Skill({ skill: 'tdd' })
```

**Exit criteria (ALL must pass):**

- [ ] All planned files created/modified
- [ ] `pnpm lint:fix` passes with 0 errors
- [ ] `pnpm format` produces no changes
- [ ] All new code has corresponding tests

**Approval gate:** AUTOMATED (lint + format + test run)

---

### Phase 4: Review

**Entry criteria:**

- Implementation complete
- All tests passing
- Lint/format clean

**Assigned agent:** `code-reviewer`

**Actions:**

```bash
# Code reviewer performs structured review
Skill({ skill: 'requesting-code-review' })
```

**Exit criteria (ALL must pass):**

- [ ] Code review report written to `.claude/context/reports/backend/{{task-id}}-review.md`
- [ ] Zero critical findings (severity: critical)
- [ ] All high-severity findings addressed or risk-accepted with justification

**Approval gate:** HUMAN (reviewer sign-off required before Test)

---

### Phase 5: Test

**Entry criteria:**

- Code review sign-off received
- No critical or unresolved high findings

**Assigned agent:** `qa`

**Actions:**

```bash
# QA runs full test suite and validates coverage
Skill({ skill: 'qa-workflow' })
```

**Exit criteria (ALL must pass):**

- [ ] Full test suite passes: `pnpm test`
- [ ] Test coverage report shows no regression from baseline
- [ ] Integration tests pass (if applicable)
- [ ] QA sign-off written to `.claude/context/reports/backend/{{task-id}}-qa.md`

**Approval gate:** AUTOMATED (test suite pass/fail)

---

### Phase 6: Deploy

**Entry criteria:**

- QA sign-off exists
- All tests passing
- Approval from Test phase

**Assigned agent:** `devops`

**Actions:**

```bash
# DevOps executes deployment
Skill({ skill: 'finishing-a-development-branch' })
```

**Exit criteria (ALL must pass):**

- [ ] Changes committed and pushed to remote
- [ ] Deployment verification performed
- [ ] CHANGELOG.md updated
- [ ] Deployment record written to `.claude/context/reports/backend/{{task-id}}-deploy.md`

**Approval gate:** HUMAN (deployment sign-off before marking pipeline complete)

---

## Phase State Tracking

Orchestrators MUST maintain phase state in a snapshot file:

```json
// .claude/context/plans/{{task-id}}.snapshot.json
{
  "taskId": "{{task-id}}",
  "currentPhase": "implement",
  "completedPhases": ["plan", "design"],
  "approvals": {
    "plan": { "approved": true, "by": "user", "at": "2026-03-22T..." },
    "design": { "approved": true, "by": "automated", "at": "2026-03-22T..." }
  },
  "agentAssignments": {
    "plan": "planner",
    "design": "architect",
    "implement": "developer",
    "review": "code-reviewer",
    "test": "qa",
    "deploy": "devops"
  },
  "resumable": true,
  "timestamp": "2026-03-22T..."
}
```

**Command to verify phase state:**

```bash
node -e "const s=require('./.claude/context/plans/{{task-id}}.snapshot.json');console.log('Phase:',s.currentPhase,'Completed:',s.completedPhases.join(','))"
```

## Phase Transition Protocol

Before advancing from phase N to N+1:

1. **Verify all exit criteria** — use the checklist in the phase definition
2. **Request approval** (if human gate) — pause and wait for user confirmation
3. **Record approval** — update snapshot.json with approval metadata
4. **Spawn next agent** — use `Task()` with explicit task_id

```
[ORCHESTRATOR] Phase 1 (Plan) exit criteria check:
  ✓ Plan file exists: .claude/context/plans/my-feature-plan.md
  ✓ 5 subtasks defined (within 2-10 range)
  ✓ Risk section populated
  ✓ Dependencies listed
GATE: Requesting human approval...
[HUMAN APPROVES]
[ORCHESTRATOR] Advancing to Phase 2 (Design)...
```

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Memory Protocol

**Before starting:**

Read `.claude/context/memory/learnings.md` for prior orchestration runs on similar tasks.

**After completing:**

- Append pipeline summary to `.claude/context/memory/learnings.md`
- Record phase duration data for future estimation
- Log any phase-skip decisions to `.claude/context/memory/decisions.md`

## Anti-Patterns

- Never skip a phase unless explicitly approved by the user with written justification
- Never advance without ALL exit criteria passing (not "most")
- Never reuse a task-id from a previous pipeline run
- Never proceed past a HUMAN gate without actual human confirmation
- Never run Design before Plan is approved — partial plans produce costly designs

## Related Skills

- `plan-generator` — generates implementation plans (used in Phase 1)
- `architecture-review` — deep architecture review (supplements Phase 2)
- `tdd` — test-driven implementation (used in Phase 3)
- `requesting-code-review` — code review dispatch (Phase 4)
- `qa-workflow` — QA validation loop (Phase 5)
- `finishing-a-development-branch` — branch completion (Phase 6)
- `swarm-coordination` — for running Implement phase with parallel agents

## Assigned Agents

- `master-orchestrator` (primary — runs the full pipeline)
- `planner` (Phase 1)
- `architect` (Phase 2)
- `developer` (Phase 3)
- `code-reviewer` (Phase 4)
- `qa` (Phase 5)
- `devops` (Phase 6)
