---
name: building-secure-contracts
description: Smart contract and secure API contract security analysis — invariant checking, access control, reentrancy, and integer overflow patterns
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Grep, Bash, WebFetch]

verified: true
lastVerifiedAt: 2026-02-21T19:39:39.620Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Building Secure Contracts

<identity>
Building Secure Contracts Skill - Smart contract and secure API contract security analysis — invariant checking, access control, reentrancy, and integer overflow patterns
</identity>

<capabilities>
- Building Secure Contracts primary function
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
/building-secure-contracts [arguments]

# Or run the script directly
node .claude/skills/building-secure-contracts/scripts/main.cjs --help
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
