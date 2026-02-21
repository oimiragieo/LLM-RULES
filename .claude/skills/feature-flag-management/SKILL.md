---
name: feature-flag-management
description: Feature flag lifecycle management — toggling features safely, gradual rollouts, A/B testing patterns, and flag cleanup to prevent technical debt
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebFetch]

verified: true
lastVerifiedAt: 2026-02-21T19:40:03.656Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Feature Flag Management

<identity>
Feature Flag Management Skill - Feature flag lifecycle management — toggling features safely, gradual rollouts, A/B testing patterns, and flag cleanup to prevent technical debt
</identity>

<capabilities>
- Feature Flag Management primary function
- Integration with agent ecosystem
- Standardized output generation
</capabilities>

<instructions>
<execution_process>

### Step 1: Gather Context

Read relevant files and understand requirements

### Step 2: Execute

Perform the skill's main function using available tools

### Step 3: Output

Return results and save artifacts if applicable

</execution_process>

<best_practices>

1. **Follow existing project patterns**: Follow this practice for best results
2. **Document all outputs clearly**: Follow this practice for best results
3. **Handle errors gracefully**: Follow this practice for best results

</best_practices>
</instructions>

<examples>
<usage_example>
**Example Commands**:

```bash
# Invoke this skill
/feature-flag-management [arguments]

# Or run the script directly
node .claude/skills/feature-flag-management/scripts/main.cjs --help
```

</usage_example>
</examples>

## Memory Protocol (MANDATORY)

**Before starting:**
```bash
cat .claude/context/memory/learnings.md
```

**After completing:**
- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
