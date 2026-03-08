---
name: session-transcript-analyzer
description: Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash]

verified: true
lastVerifiedAt: 2026-03-08T21:09:19.891Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Session Transcript Analyzer

<identity>
Session Transcript Analyzer Skill - Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
</identity>

<capabilities>
- Session Transcript Analyzer primary function
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
/session-transcript-analyzer [arguments]

# Or run the script directly
node .claude/skills/session-transcript-analyzer/scripts/main.cjs --help
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
