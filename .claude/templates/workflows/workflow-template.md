# {{WORKFLOW_NAME}} Workflow

{{BRIEF_DESCRIPTION_OF_WORKFLOW_PURPOSE}}

**Extended Thinking**: {{DETAILED_EXPLANATION_OF_WORKFLOW_RATIONALE_AND_APPROACH}}

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating this workflow, you MUST update CLAUDE.md:**

1. Add to Section 3 "Multi-Agent Workflows" with path reference
2. Update learnings.md with integration summary
3. Assign trigger conditions in routing documentation

**Verification:**

```bash
grep "{{WORKFLOW_FILE_NAME}}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md NOT UPDATED!"
```

**WHY**: Workflows not documented in CLAUDE.md will never be invoked by the Router.

---

## Configuration Options

### Option 1: {{OPTION_CATEGORY}}

- **{{VALUE_1}}**: {{DESCRIPTION}}
- **{{VALUE_2}}**: {{DESCRIPTION}}
- **{{VALUE_3}}**: {{DESCRIPTION}}

### Option 2: {{OPTION_CATEGORY}}

- **{{VALUE_1}}**: {{DESCRIPTION}}
- **{{VALUE_2}}**: {{DESCRIPTION}}

## Prerequisites

Before starting this workflow:

1. **Required context**: {{CONTEXT_REQUIREMENTS}}
2. **Required files**: {{FILE_REQUIREMENTS}}
3. **Required permissions**: {{PERMISSION_REQUIREMENTS}}

## Phase 1: {{PHASE_1_NAME}}

### Step 1: {{STEP_NAME}}

**Agent**: {{AGENT_NAME}}

**Task Spawn**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: '{{TASK_DESCRIPTION}}',
  prompt: `You are the {{AGENT_NAME}} agent.

## Task
{{TASK_DESCRIPTION}}

## Instructions
1. Read your agent definition: .claude/agents/{{CATEGORY}}/{{AGENT_FILE}}.md
2. **Invoke skills**: Skill({ skill: "{{SKILL_NAME}}" })
3. {{INSTRUCTION_3}}
4. {{INSTRUCTION_4}}
5. Save output to: .claude/context/{{OUTPUT_PATH}}

## Context
- {{CONTEXT_ITEM_1}}
- {{CONTEXT_ITEM_2}}

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: {{OUTPUT_DESCRIPTION}}

### Step 2: {{STEP_NAME}}

**Agent**: {{AGENT_NAME}}

**Task Spawn**:

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'general-purpose',
  description: '{{TASK_DESCRIPTION}}',
  prompt: `You are the {{AGENT_NAME}} agent.

## Task
{{TASK_DESCRIPTION}}

## Instructions
1. Read your agent definition: .claude/agents/{{CATEGORY}}/{{AGENT_FILE}}.md
2. Read previous phase output: .claude/context/{{PREVIOUS_OUTPUT_PATH}}
3. {{INSTRUCTION_3}}
4. Save output to: .claude/context/{{OUTPUT_PATH}}

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: {{OUTPUT_DESCRIPTION}}

## Phase 2: {{PHASE_2_NAME}}

### Step 3: {{STEP_NAME}} (Parallel)

**Agents**: {{AGENT_A}} + {{AGENT_B}} (spawned in parallel)

**Task Spawn**:

```javascript
// Spawn both agents in parallel for efficiency
Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  description: '{{AGENT_A}} reviewing {{ARTIFACT}}',
  prompt: `You are the {{AGENT_A}} agent.

## Task
Review {{ARTIFACT}} for {{REVIEW_FOCUS_A}}.

## Instructions
1. Read your agent definition: .claude/agents/{{CATEGORY}}/{{AGENT_A_FILE}}.md
2. Review: .claude/context/{{ARTIFACT_PATH}}
3. Document findings in: .claude/context/reports/{{AGENT_A}}-review.md
`,
});

Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  description: '{{AGENT_B}} reviewing {{ARTIFACT}}',
  prompt: `You are the {{AGENT_B}} agent.

## Task
Review {{ARTIFACT}} for {{REVIEW_FOCUS_B}}.

## Instructions
1. Read your agent definition: .claude/agents/{{CATEGORY}}/{{AGENT_B_FILE}}.md
2. Review: .claude/context/{{ARTIFACT_PATH}}
3. Document findings in: .claude/context/reports/{{AGENT_B}}-review.md
`,
});
```

**Expected Output**: Review documents from both agents

## Phase 3: {{PHASE_3_NAME}}

### Step 4: {{STEP_NAME}}

**Agent**: {{AGENT_NAME}}

**Prerequisites**: Phases 1 and 2 must be complete

**Task Spawn**:

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'general-purpose',
  description: '{{TASK_DESCRIPTION}}',
  prompt: `You are the {{AGENT_NAME}} agent.

## Task
{{TASK_DESCRIPTION}}

## Instructions
1. Read your agent definition: .claude/agents/{{CATEGORY}}/{{AGENT_FILE}}.md
2. Read review outputs:
   - .claude/context/reports/{{AGENT_A}}-review.md
   - .claude/context/reports/{{AGENT_B}}-review.md
3. {{CONSOLIDATION_INSTRUCTION}}
4. Save final output to: .claude/context/{{FINAL_OUTPUT_PATH}}

## Memory Protocol
1. Record final decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: {{FINAL_OUTPUT_DESCRIPTION}}

## Workflow Verification

### Phase Gate Checks

After each phase, verify:

**Phase 1 Complete:**

- [ ] {{VERIFICATION_ITEM}}
- [ ] {{VERIFICATION_ITEM}}

**Phase 2 Complete:**

- [ ] {{VERIFICATION_ITEM}}
- [ ] {{VERIFICATION_ITEM}}

**Phase 3 Complete:**

- [ ] {{VERIFICATION_ITEM}}
- [ ] {{VERIFICATION_ITEM}}

### Final Deliverables

- [ ] {{DELIVERABLE_1}} at `{{PATH}}`
- [ ] {{DELIVERABLE_2}} at `{{PATH}}`
- [ ] Memory files updated
- [ ] CLAUDE.md references this workflow

## Error Recovery

### If Phase 1 fails:

1. {{RECOVERY_STEP}}
2. {{RECOVERY_STEP}}
3. Restart Phase 1

### If Phase 2 review finds blockers:

1. {{RECOVERY_STEP}}
2. {{RECOVERY_STEP}}
3. Re-run reviews

### If Phase 3 consolidation conflicts:

1. {{RECOVERY_STEP}}
2. {{RECOVERY_STEP}}
3. Escalate to user for decision

## Related Workflows

- **{{RELATED_WORKFLOW_1}}**: {{RELATIONSHIP_DESCRIPTION}}
- **{{RELATED_WORKFLOW_2}}**: {{RELATIONSHIP_DESCRIPTION}}

## Customization Points

This workflow can be adapted for:

1. **{{CUSTOMIZATION_1}}**: Modify {{WHAT_TO_MODIFY}}
2. **{{CUSTOMIZATION_2}}**: Adjust {{WHAT_TO_ADJUST}}
3. **{{CUSTOMIZATION_3}}**: Add {{WHAT_TO_ADD}}
