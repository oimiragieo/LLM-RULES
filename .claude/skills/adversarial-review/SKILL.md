---
name: adversarial-review
description: Force adversarial code review stance that eliminates confirmation bias — reviewer must find issues or re-analyze
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, Grep]

verified: true
lastVerifiedAt: 2026-03-16T08:03:42.279Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Adversarial Review

<identity>
Adversarial Review Skill - Force adversarial code review stance that eliminates confirmation bias — reviewer must find issues or re-analyze
</identity>

<capabilities>
- Adversarial Review primary function
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
/adversarial-review [arguments]

# Or run the script directly
node .claude/skills/adversarial-review/scripts/main.cjs --help
```

</usage_example>
</examples>

## Search Protocol

For code discovery and search tasks, follow this priority order:

1. \`pnpm search:code "<query>"\` (Primary intent-based search).
2. \`ripgrep\` (for exact keyword/regex matches).
3. semantic/structural search via code tools if available.

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
\`\`\`

**After completing:**

- New pattern -> \`.claude/context/memory/learnings.md\`
- Issue found -> \`.claude/context/memory/issues.md\`
- Decision made -> \`.claude/context/memory/decisions.md\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
