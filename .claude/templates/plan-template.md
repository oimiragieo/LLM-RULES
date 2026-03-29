# {{PLAN_TITLE}}

**Date**: {{DATE}}
**Framework Version**: {{FRAMEWORK_VERSION}}
**Status**: {{STATUS}}

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

### Overview

- **Total Tasks**: {{TOTAL_TASKS}}
- **Features Covered**: {{FEATURES_COUNT}}
- **Estimated Total Time**: {{ESTIMATED_TIME}}
- **Implementation Strategy**: {{STRATEGY}}

### Key Deliverables

{{KEY_DELIVERABLES_LIST}}

---

## Execution Flow (/plan command scope)

1. Load feature spec from input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect project type from context (web=frontend+backend, mobile=app+api)
   → Set structure decision based on project type
3. Fill the Constitution Check section from `.claude/context/memory/constitution.md` (if present).
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model, quickstart, agent-specific file (e.g. CLAUDE.md).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command

**IMPORTANT**: The /plan command STOPS at step 8. Phase 2 (task generation) is executed by the /tasks command (execute-plan). Phases 3–4 are implementation execution.

## Task Breakdown by Feature

<!-- Organize tasks by feature/capability being implemented -->

### Feature {{N}}: {{FEATURE_NAME}} ({{PRIORITY}})

**Priority**: {{PRIORITY}}
**Estimated Effort**: {{EFFORT_ESTIMATE}}

#### Tasks

- **Task #{{TASK_ID}}**: {{TASK_TITLE}} (~{{TASK_HOURS}} hours)
  - {{TASK_DESCRIPTION}}
  - {{ACCEPTANCE_CRITERIA}}
  - Blocked by: {{BLOCKING_TASKS}}

**Key Deliverables**:

- {{DELIVERABLE_1}}
- {{DELIVERABLE_2}}

**Success Criteria**:

- [ ] {{SUCCESS_CRITERION_1}}
- [ ] {{SUCCESS_CRITERION_2}}

---

## Implementation Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: {{PHASE_0_PURPOSE}}
**Duration**: {{PHASE_0_DURATION}}
**Parallel OK**: No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before creating ANY artifact:

- [ ] Minimum 3 Exa/WebSearch queries executed
- [ ] Minimum 3 external sources consulted
- [ ] Research report generated and saved
- [ ] Design decisions documented with rationale

**Research Output**: {{RESEARCH_OUTPUT_PATH}}

#### Constitution Checkpoint

**CRITICAL VALIDATION**: Before proceeding to Phase 1, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] Research report contains minimum 3 external sources
   - [ ] All [NEEDS CLARIFICATION] items resolved
   - [ ] ADRs created for major decisions

2. **Technical Feasibility**
   - [ ] Technical approach validated
   - [ ] Dependencies identified and available
   - [ ] No blocking technical issues

3. **Security Review**
   - [ ] Security implications assessed
   - [ ] Threat model documented if applicable
   - [ ] Mitigations identified for risks

4. **Specification Quality**
   - [ ] Acceptance criteria are measurable
   - [ ] Success criteria are clear
   - [ ] Edge cases considered

**If ANY item fails, return to research phase. DO NOT proceed to implementation.**

#### Phase 0 Tasks

- [ ] **0.1** {{RESEARCH_TASK_1}} (~{{HOURS}} hours)
  - **Research Queries**: {{QUERY_TOPICS}}
  - **Output**: {{OUTPUT_LOCATION}}
  - **Verify**: {{VERIFICATION_COMMAND}}

**Success Criteria**: Research complete, decisions documented, constitution checkpoint passed

---

#### Hypothesis Framing

For each major technical decision, state:
"We believe [approach] will [achieve outcome]. We'll know when [metric]."

#### Mandatory Reading

Before planning, agents MUST read these files:

- [List specific files with line ranges]
- [Include code snippets to mirror]

#### Patterns to Mirror

Copy these existing patterns from the codebase:

- [Pattern 1: file path + description]
- [Pattern 2: file path + description]

### Phase 1: {{PHASE_1_NAME}} ({{PHASE_1_TYPE}})

**Purpose**: {{PHASE_1_PURPOSE}}
**Duration**: {{PHASE_1_DURATION}}
**Parallel OK**: {{PARALLEL_OK}}
**Dependencies**: {{DEPENDENCIES}}

#### Critical Path

{{CRITICAL_PATH_DESCRIPTION}}

#### Tasks

- [ ] **1.1** {{TASK_TITLE}} (~{{HOURS}} hours)
  - **Files**: {{FILES_MODIFIED}}
  - **Command**: {{SPAWN_COMMAND}}
  - **Fix**: {{FIX_DESCRIPTION}}
  - **Verify**: {{VERIFICATION_COMMAND}}
  - **Rollback**: {{ROLLBACK_COMMAND}}
  - **Blocked by**: {{BLOCKING_TASKS}}

#### Phase 1 Error Handling

If any task fails:

1. Run rollback commands for completed tasks (reverse order)
2. Document error: `echo "Phase 1 failed: [error]" >> .claude/context/memory/issues.md`
3. Do NOT proceed to Phase {{NEXT_PHASE}}

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding
{{VERIFICATION_COMMANDS}}
```

**Success Criteria**: {{PHASE_SUCCESS_CRITERIA}}

---

### Phase {{N}}: {{PHASE_NAME}} ({{PHASE_TYPE}})

**Purpose**: {{PHASE_PURPOSE}}
**Duration**: {{PHASE_DURATION}}
**Parallel OK**: {{PARALLEL_OK}}
**Dependencies**: {{DEPENDENCIES}}

#### Parallel Tracks (if applicable)

- Track A: {{TRACK_A_DESCRIPTION}}
- Track B: {{TRACK_B_DESCRIPTION}}
- Track C: {{TRACK_C_DESCRIPTION}}

#### Tasks

- [ ] **{{N}}.1** {{TASK_TITLE}} (~{{HOURS}} hours) [{{TAG}}]
  - **Files**: {{FILES_MODIFIED}}
  - **Command**: {{SPAWN_COMMAND}}
  - **Fix**: {{FIX_DESCRIPTION}}
  - **Verify**: {{VERIFICATION_COMMAND}}

#### Phase {{N}} Verification Gate

```bash
{{VERIFICATION_COMMANDS}}
```

**Success Criteria**: {{PHASE_SUCCESS_CRITERIA}}

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'reflection-agent',
  model: 'sonnet',
  description: 'Session reflection and learning extraction',
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'Skill'],
  prompt:
    'You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created).',
});
```

**Success Criteria**:

- [ ] Reflection-agent spawned and completed
- [ ] Learnings extracted to `.claude/context/memory/learnings.md`
- [ ] Evolution opportunities logged if any detected

---

## Dependency Graph

```
{{DEPENDENCY_GRAPH_ASCII}}
```

**Legend**:

- `→` Sequential dependency (blocking)
- `||` Parallel execution allowed
- `⚠` Critical path item

---

## Agent Assignments

| Agent           | Tasks      | Total Effort |
| --------------- | ---------- | ------------ |
| **{{AGENT_1}}** | #{{TASKS}} | {{HOURS}}    |
| **{{AGENT_2}}** | #{{TASKS}} | {{HOURS}}    |

**Total**: {{TOTAL_HOURS}} hours (best case) / {{WORST_HOURS}} hours (worst case) = {{DAYS}} with {{NUM_DEVELOPERS}} developer(s)

---

## Timeline Summary

| Phase                     | Tasks | Duration      | Parallel?    | Key Deliverables          |
| ------------------------- | ----- | ------------- | ------------ | ------------------------- |
| **Phase 0: Research**     | {{N}} | {{HOURS}}     | No           | Research report, ADRs     |
| **Phase 1: {{NAME}}**     | {{N}} | {{HOURS}}     | {{YES}}      | {{DELIVERABLES}}          |
| **Phase {{N}}: {{NAME}}** | {{N}} | {{HOURS}}     | {{YES}}      | {{DELIVERABLES}}          |
| **Phase FINAL**           | 1     | 1-2 hours     | No           | Reflection, learnings     |
| **TOTAL**                 | {{N}} | **{{HOURS}}** | **{{DAYS}}** | **{{FEATURES}} features** |

**Realistic Timeline** (with parallel work, {{NUM_DEV}} developers):

- **Week 1**: {{WEEK_1_DESCRIPTION}}
- **Week 2**: {{WEEK_2_DESCRIPTION}}
- **Week {{N}}**: {{WEEK_N_DESCRIPTION}}

**Aggressive Timeline** (critical path only, {{NUM_DEV}} developers):

- **Week 1**: {{AGGRESSIVE_WEEK_1}}
- **Week 2**: {{AGGRESSIVE_WEEK_2}}
- **Total**: {{AGGRESSIVE_TOTAL}} for MVP ({{MVP_FEATURES}})

---

## Success Criteria

### Phase 0 (Research) Success

- [ ] Research report contains minimum 3 external sources with citations
- [ ] All [NEEDS CLARIFICATION] markers resolved
- [ ] ADRs documented for major decisions (format: decisions.md)
- [ ] Constitution checkpoint passed (all gates green)

### Phase 1 ({{PHASE_1_NAME}}) Success

- [ ] {{SUCCESS_CRITERION_1}}
- [ ] {{SUCCESS_CRITERION_2}}
- [ ] {{SUCCESS_CRITERION_3}}

### Phase {{N}} ({{PHASE_N_NAME}}) Success

- [ ] {{SUCCESS_CRITERION_1}}
- [ ] {{SUCCESS_CRITERION_2}}

### Overall Framework Success

- [ ] Framework Health Score remains ≥{{HEALTH_THRESHOLD}}/10
- [ ] Zero CRITICAL security issues introduced
- [ ] All existing tests pass ({{EXISTING_TEST_COUNT}} tests)
- [ ] New features have {{COVERAGE_THRESHOLD}}% test coverage
- [ ] Documentation updated for all new features
- [ ] {{OVERALL_METRIC}}

---

## Risks

### Technical Risks

| Risk                 | Impact  | Probability | Mitigation     |
| -------------------- | ------- | ----------- | -------------- |
| {{TECHNICAL_RISK_1}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |
| {{TECHNICAL_RISK_2}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |

### Compatibility Risks

| Risk                     | Impact  | Probability | Mitigation     |
| ------------------------ | ------- | ----------- | -------------- |
| {{COMPATIBILITY_RISK_1}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |
| {{COMPATIBILITY_RISK_2}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |

### User Experience Risks

| Risk          | Impact  | Probability | Mitigation     |
| ------------- | ------- | ----------- | -------------- |
| {{UX_RISK_1}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |
| {{UX_RISK_2}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |

### Security Risks

| Risk                | Impact  | Probability | Mitigation     |
| ------------------- | ------- | ----------- | -------------- |
| {{SECURITY_RISK_1}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |
| {{SECURITY_RISK_2}} | {{IMP}} | {{PROB}}    | {{MITIGATION}} |

---

## Files Created/Modified

### New Files ({{NEW_FILES_COUNT}} total)

**{{CATEGORY_1}}** ({{COUNT}}):

- `{{FILE_PATH_1}}`
- `{{FILE_PATH_2}}`

**{{CATEGORY_2}}** ({{COUNT}}):

- `{{FILE_PATH_1}}`
- `{{FILE_PATH_2}}`

### Modified Files ({{MODIFIED_FILES_COUNT}})

**{{CATEGORY}}** ({{COUNT}}):

- `{{FILE_PATH}}` ({{MODIFICATION_DESCRIPTION}})

---

## Expected Impact

### User Experience

**Before Implementation**:

- {{BEFORE_METRIC_1}}
- {{BEFORE_METRIC_2}}
- Time to {{GOAL}}: {{BEFORE_TIME}}

**After Implementation**:

- {{AFTER_METRIC_1}}
- {{AFTER_METRIC_2}}
- Time to {{GOAL}}: {{AFTER_TIME}} ({{IMPROVEMENT_PCT}}% reduction)

### Developer Experience

**Benefits**:

- {{BENEFIT_1}}
- {{BENEFIT_2}}
- {{BENEFIT_3}}

**Metrics**:

- {{METRIC_1}}
- {{METRIC_2}}
- {{METRIC_3}}

### Framework Capability

**New Capabilities**:

- {{CAPABILITY_1}}
- {{CAPABILITY_2}}
- {{CAPABILITY_3}}

**Framework Health**:

- Maintains ≥{{HEALTH_SCORE}}/10 health score
- Zero regression in existing tests
- New features: {{COVERAGE}}% test coverage
- Documentation: complete for all features

---

## Related Documents

### Research Phase 0 Outputs

- **Research Report**: `{{RESEARCH_REPORT_PATH}}`
- **Comparison Matrix**: `{{COMPARISON_MATRIX_PATH}}` (if applicable)
- **Technical Spike**: `{{SPIKE_REPORT_PATH}}` (if applicable)

### ADRs

- **ADR-{{N}}**: {{ADR_TITLE}} ({{TOPIC}})
- **ADR-{{N+1}}**: {{ADR_TITLE}} ({{TOPIC}})

### Workflows

- **{{WORKFLOW_NAME}}**: `{{WORKFLOW_PATH}}`

### Related Plans

- **{{RELATED_PLAN_NAME}}**: `{{PLAN_PATH}}` ({{RELATIONSHIP}})

---

## Security Review ({{DATE}})

- **Status**: {{STATUS}}
- **Overall Risk Level**: {{RISK_LEVEL}}
- **Critical Findings**: {{CRITICAL_COUNT}}
- **High Findings**: {{HIGH_COUNT}}
- **Medium Findings**: {{MEDIUM_COUNT}}
- **Low Findings**: {{LOW_COUNT}}
- **Required Mitigations**: {{REQUIRED_MITIGATIONS}}
- **Recommended Enhancements**: {{RECOMMENDED_COUNT}}
- **See Full Report**: `{{SECURITY_REPORT_PATH}}`

**Key Security Notes for Implementation**:

1. **Task #{{N}}**: {{SECURITY_NOTE_1}}
2. **Task #{{N+1}}**: {{SECURITY_NOTE_2}}

---

## Quick Wins Summary (< 1 hour each)

These can be done immediately for fast progress:

1. **{{PHASE}}.{{NUM}}** {{TASK_ID}}: {{TASK_TITLE}} (~{{MINUTES}} min)
2. **{{PHASE}}.{{NUM}}** {{TASK_ID}}: {{TASK_TITLE}} (~{{MINUTES}} min)

**Total Quick Wins**: ~{{TOTAL_TIME}} hours for {{COUNT}} tasks

---

## Agent Assignment Matrix

| Phase | Primary Agent    | Supporting Agents     |
| ----- | ---------------- | --------------------- |
| 0     | {{AGENT}}        | {{SUPPORTING_AGENTS}} |
| 1     | {{AGENT}}        | {{SUPPORTING_AGENTS}} |
| {{N}} | {{AGENT}}        | {{SUPPORTING_AGENTS}} |
| FINAL | REFLECTION-AGENT | -                     |

---

## Token Replacement Guide

This template uses the following tokens for customization:

| Token                       | Description                         | Example                                        | Required |
| --------------------------- | ----------------------------------- | ---------------------------------------------- | -------- |
| `{{PLAN_TITLE}}`            | Title of the implementation plan    | "Spec-Kit Integration Plan"                    | Yes      |
| `{{DATE}}`                  | Plan creation date (YYYY-MM-DD)     | "2026-01-28"                                   | Yes      |
| `{{FRAMEWORK_VERSION}}`     | Current framework version           | "Agent-Studio v3.1.0"                          | Yes      |
| `{{STATUS}}`                | Plan status                         | "Phase 0 - Research"                           | Yes      |
| `{{EXECUTIVE_SUMMARY}}`     | Brief overview of the plan          | "Implementation plan for..."                   | Yes      |
| `{{TOTAL_TASKS}}`           | Total number of tasks               | "14 atomic tasks"                              | Yes      |
| `{{ESTIMATED_TIME}}`        | Estimated total time                | "68-112 hours / 2-3 weeks"                     | Yes      |
| `{{STRATEGY}}`              | Implementation strategy             | "Foundation-first (templates) → Core features" | Yes      |
| `{{PHASE_N_NAME}}`          | Name of phase N                     | "Foundation", "Core Features"                  | Yes      |
| `{{PHASE_N_PURPOSE}}`       | Purpose of phase N                  | "Fix security vulnerabilities"                 | Yes      |
| `{{DEPENDENCIES}}`          | Dependencies for phase              | "Phase 0 complete"                             | Yes      |
| `{{PARALLEL_OK}}`           | Whether parallel execution allowed  | "Yes", "Partial", "No"                         | Yes      |
| `{{VERIFICATION_COMMANDS}}` | Commands to verify phase completion | "pnpm test -- --grep 'test'"                   | Yes      |
| `{{HEALTH_THRESHOLD}}`      | Minimum framework health score      | "8.5"                                          | Yes      |
| `{{COVERAGE_THRESHOLD}}`    | Minimum test coverage               | "100"                                          | Yes      |

### Optional Tokens

| Token                      | Default                                       | Description                  |
| -------------------------- | --------------------------------------------- | ---------------------------- |
| `{{NUM_DEVELOPERS}}`       | "1"                                           | Number of developers working |
| `{{MVP_FEATURES}}`         | "core features only"                          | What's included in MVP       |
| `{{RESEARCH_OUTPUT_PATH}}` | ".claude/context/artifacts/research-reports/" | Where research is saved      |

---

**Plan Created**: {{DATE}}
**Total Planning Time**: ~{{PLANNING_TIME}} minutes
**Total Tasks Created**: {{TOTAL_TASKS}} atomic tasks
**Estimated Implementation Time**: {{MIN_HOURS}}-{{MAX_HOURS}} hours ({{MIN_DAYS}}-{{MAX_DAYS}} days with parallelization)
**Security Review**: {{SECURITY_STATUS}} ({{SECURITY_DATE}}) - {{RISK_LEVEL}} risk, {{PROCEED_STATUS}}
**Next Phase**: {{NEXT_PHASE}} ({{NEXT_PHASE_NAME}})
