# Team Orchestration Implementation Template

Use this template when invoking `team-orchestration` from a spawned agent.

## Phase Execution Template

```markdown
## Phase: {{phase_name}}

**Task ID:** {{task_id}}
**Assigned Agent:** {{agent_type}}
**Started:** {{iso_timestamp}}

### Entry Criteria Verification

- [ ] Previous phase `{{previous_phase}}` is marked complete in snapshot
- [ ] Snapshot exists at `.claude/context/plans/{{task_id}}.snapshot.json`
- [ ] All required inputs from previous phase are available: {{required_inputs}}

### Phase Actions

1. {{action_1}}
2. {{action_2}}
3. {{action_3}}

### Exit Criteria Checklist

- [ ] {{exit_criterion_1}}
- [ ] {{exit_criterion_2}}
- [ ] {{exit_criterion_3}}

### Approval Gate

**Gate Type:** {{gate_type}}
**Status:** {{gate_status}}
**Approved By:** {{approver}}
**Approval Timestamp:** {{approval_timestamp}}
```

## Snapshot Update Template

After completing a phase, the executing agent updates the snapshot:

```json
{
  "taskId": "{{task_id}}",
  "currentPhase": "{{next_phase}}",
  "completedPhases": ["{{completed_phases}}"],
  "approvals": {
    "{{phase_name}}": {
      "approvedBy": "{{approver}}",
      "timestamp": "{{approval_timestamp}}",
      "method": "{{approval_method}}"
    }
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
  "timestamp": "{{iso_timestamp}}"
}
```

## Spawn Prompt Template (for master-orchestrator)

When spawning a phase agent, include:

```
You are the {{agent_type}} agent executing phase `{{phase_name}}` of task `{{task_id}}`.

**Snapshot location:** .claude/context/plans/{{task_id}}.snapshot.json

**Entry criteria to verify before starting:**
{{entry_criteria_list}}

**Your deliverables for this phase:**
{{deliverables_list}}

**Exit criteria you must satisfy before completing:**
{{exit_criteria_list}}

**Approval gate:** {{gate_type}} — {{gate_instructions}}

After completing work, update the snapshot and call:
TaskUpdate({ taskId: '{{task_id}}-{{phase_name}}', status: 'completed', metadata: { phase: '{{phase_name}}', exitCriteriaVerified: true } })
```

## Phase-Specific Templates

### plan phase

- Deliverable: `.claude/context/plans/{{task_id}}-plan.md` with task breakdown
- Exit: Plan reviewed and approved by stakeholder

### design phase

- Deliverable: Architecture decision record or design doc
- Exit: Technical design approved by architect

### implement phase

- Deliverable: Code changes with tests
- Exit: All tests pass, lint/format clean

### review phase

- Deliverable: Code review report
- Exit: No critical findings; minor findings tracked

### test phase

- Deliverable: Test report with pass/fail counts
- Exit: All tests pass, coverage meets threshold

### deploy phase

- Deliverable: Deployment confirmation with rollback plan
- Exit: Health checks pass in target environment
