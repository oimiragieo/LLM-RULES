---
name: user-flow-validator
description: Test user journey assertions against real surfaces (Web UI, CLI, API) with evidence collection and isolation boundaries
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, Grep]

verified: true
lastVerifiedAt: 2026-03-16T08:04:24.827Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
source: builtin
trust_score: 100
provenance_sha: f13a93542aec9903
---

# User Flow Validator

<identity>
User Flow Validator Skill - Test user journey assertions against real surfaces (Web UI, CLI, API) with evidence collection and isolation boundaries
</identity>

<capabilities>
- User Flow Validator primary function
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
/user-flow-validator [arguments]

# Or run the script directly
node .claude/skills/user-flow-validator/scripts/main.cjs --help
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
