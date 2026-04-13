<!-- FIXED: frontmatter — interface contract, do not modify during autonomous updates -->
---
name: {{SKILL_NAME}}
description: {{BRIEF_DESCRIPTION}}. Use when {{USE_CASE}}.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: {{true_or_false}}
tools: [Read, Write, Edit, Bash, Glob, Grep]
assigned_agents: []  # MUST be populated by Step 7 of skill-creator
best_practices:

- {{BEST_PRACTICE_1}}
- {{BEST_PRACTICE_2}}
- {{BEST_PRACTICE_3}}
error_handling: strict
streaming: supported

---
<!-- /FIXED -->

# {{SKILL_DISPLAY_NAME}}

<!-- FIXED: post-creation checklist — integration contract, do not modify during autonomous updates -->

## POST-CREATION CHECKLIST (BLOCKING - DO NOT SKIP)

**After creating this skill, you MUST complete ALL steps:**

### Step 6: Update CLAUDE.md (BLOCKING)

Add skill to the appropriate reference file:

- `@SKILL_CATALOG_TABLE.md` for all skills (Section 7 canonical source)
- `@ENTERPRISE_WORKFLOWS.md` for enterprise workflow skills

**Entry format:**

````markdown
### {{SKILL_DISPLAY_NAME}}

Use when {{TRIGGER_CONDITION}}:

```javascript
Skill({ skill: '{{SKILL_NAME}}' });
```
````

{{BRIEF_DESCRIPTION}}

````

**Verify:**
```bash
grep "{{SKILL_NAME}}" .claude/docs/@SKILL_CATALOG_TABLE.md || echo "ERROR: SKILL CATALOG NOT UPDATED - BLOCKING!"
````

### Step 7: Assign to Agents (BLOCKING)

Update matching agents' `skills:` array based on domain:

| Domain        | Agents             |
| ------------- | ------------------ |
| Testing       | qa, developer      |
| Security      | security-architect |
| Planning      | planner, architect |
| Coding        | developer          |
| Documentation | technical-writer   |
| DevOps        | devops             |

**Verify:**

```bash
grep -r "{{SKILL_NAME}}" .claude/agents/ || echo "ERROR: No agents assigned - BLOCKING!"
```

### Step 8: Final Verification (BLOCKING)

- [ ] SKILL.md has valid YAML frontmatter
- [ ] Memory Protocol section present
- [ ] @SKILL_CATALOG_TABLE.md updated (grep verified)
- [ ] At least one agent assigned (grep verified)
- [ ] learnings.md updated with creation record

**WHY**: Skills not in the skill catalog are invisible to Router. Unassigned skills are never invoked.

<!-- /FIXED -->

---

<!-- EDITABLE: overview — skill behavior, safe for autonomous modification -->

## Overview

{{BRIEF_DESCRIPTION_OF_WHAT_THIS_SKILL_DOES}}

**Core principle:** {{CORE_PRINCIPLE}}

## When to Use

**Always:**

- {{TRIGGER_CONDITION_1}}
- {{TRIGGER_CONDITION_2}}
- {{TRIGGER_CONDITION_3}}

**Exceptions:**

- {{EXCEPTION_1}}
- {{EXCEPTION_2}}

<!-- /EDITABLE -->

<!-- FIXED: iron law — governance contract, do not modify during autonomous updates -->

## The Iron Law

```
{{IRON_LAW_STATEMENT}}
```

{{EXPLANATION_OF_WHY_THIS_LAW_EXISTS}}

**No exceptions:**

- {{RULE_1}}
- {{RULE_2}}

<!-- /FIXED -->

<!-- EDITABLE: workflow — execution details, safe for autonomous modification -->

## Workflow

### Phase 1: {{PHASE_1_NAME}}

{{DESCRIPTION_OF_PHASE_1}}

**Steps:**

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

**Example:**

```{{LANGUAGE}}
{{EXAMPLE_CODE_OR_COMMAND}}
```

### Phase 2: {{PHASE_2_NAME}}

{{DESCRIPTION_OF_PHASE_2}}

**Steps:**

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

### Phase 3: {{PHASE_3_NAME}}

{{DESCRIPTION_OF_PHASE_3}}

**Steps:**

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

<!-- /EDITABLE -->

<!-- EDITABLE: verification and examples — operational detail, safe for autonomous modification -->

## Verification Checklist

Before completing work using this skill:

- [ ] {{VERIFICATION_ITEM_1}}
- [ ] {{VERIFICATION_ITEM_2}}
- [ ] {{VERIFICATION_ITEM_3}}
- [ ] {{VERIFICATION_ITEM_4}}

## Common Mistakes

### ❌ {{MISTAKE_1}}

**Why it's wrong:** {{EXPLANATION}}

**Do this instead:** {{CORRECT_APPROACH}}

### ❌ {{MISTAKE_2}}

**Why it's wrong:** {{EXPLANATION}}

**Do this instead:** {{CORRECT_APPROACH}}

## Integration with Other Skills

This skill works well with:

- **{{SKILL_A}}**: {{HOW_THEY_WORK_TOGETHER}}
- **{{SKILL_B}}**: {{HOW_THEY_WORK_TOGETHER}}

## Examples

### Example 1: {{EXAMPLE_SCENARIO}}

**Input:** {{INPUT_DESCRIPTION}}

**Process:**

```{{LANGUAGE}}
{{EXAMPLE_PROCESS}}
```

**Output:** {{OUTPUT_DESCRIPTION}}

### Example 2: {{EXAMPLE_SCENARIO}}

**Input:** {{INPUT_DESCRIPTION}}

**Process:**

```{{LANGUAGE}}
{{EXAMPLE_PROCESS}}
```

**Output:** {{OUTPUT_DESCRIPTION}}

## Troubleshooting

### Issue: {{COMMON_ISSUE_1}}

**Symptoms:** {{SYMPTOMS}}

**Solution:** {{SOLUTION}}

### Issue: {{COMMON_ISSUE_2}}

**Symptoms:** {{SYMPTOMS}}

**Solution:** {{SOLUTION}}

<!-- /EDITABLE -->

<!-- FIXED: assigned agents — routing contract, do not modify during autonomous updates -->

## Assigned Agents

This skill has been assigned to the following agents:

| Agent       | Role             | Assignment Reason |
| ----------- | ---------------- | ----------------- |
| {{AGENT_1}} | {{AGENT_1_ROLE}} | {{REASON_1}}      |
| {{AGENT_2}} | {{AGENT_2_ROLE}} | {{REASON_2}}      |

**To add this skill to another agent:**

```bash
# Edit the agent file to add skill to frontmatter
# Example: .claude/agents/core/developer.md
# Add "{{SKILL_NAME}}" to the skills: array
```

<!-- /FIXED -->

<!-- FIXED: memory protocol — framework contract, do not modify during autonomous updates -->

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

<!-- /FIXED -->
