---
name: agent-enhancement-worker
description: Agent frontmatter enhancements — disallowedTools, mcpServers scoping, fork_eligible field
---

# Agent Enhancement Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that enhance agent definition schema and prompt assembler to support new frontmatter fields (disallowedTools, mcpServers, fork_eligible).

## Work Procedure

1. **Read the feature description carefully.** Understand which schema fields to add and how they affect prompt assembly.

2. **Read source files.** Before modifying:
   - Read `.claude/schemas/agent-definition.schema.json` for current schema
   - Read `.claude/lib/spawn/prompt-assembler-data.cjs` for how agent fields are consumed
   - Read `.claude/lib/spawn/prompt-assembler.cjs` for assembly pipeline
   - Read at least 2 existing agent files to understand frontmatter patterns

3. **Write tests first (red).** Create test file at `tests/lib/spawn/<descriptive-name>.test.cjs`. Tests must cover:
   - Schema validation (valid/invalid inputs for each field)
   - Prompt assembly effects (tools excluded, servers scoped)
   - Conflict resolution (disallowedTools vs tools)
   - Default values (fork_eligible defaults false)
   - Round-trip (create → validate → assemble → verify)
   Run tests — they should FAIL (red).

4. **Implement changes.**
   - Schema: Add fields with proper types, descriptions, defaults
   - disallowedTools: Array of strings, filter tools in filterAndDescribeTools()
   - mcpServers: Array of strings with maxItems:20, scope MCP section in prompt
   - fork_eligible: Boolean, default false, validation only (no assembly effect yet)
   - Conflict: disallowedTools wins over tools (exclude takes precedence)
   - Log warning on conflict, don't throw

5. **Run tests (green).** All tests pass.

6. **Run lint.**
   ```
   pnpm lint
   npx prettier --check <modified-files>
   ```

## Example Handoff

```json
{
  "salientSummary": "Added disallowedTools, mcpServers, fork_eligible to agent schema. Prompt assembler excludes disallowed tools and scopes MCP servers. 30 tests.",
  "whatWasImplemented": "Schema updated with 3 new fields. filterAndDescribeTools() filters disallowedTools. buildMcpSection() scopes to agent's mcpServers. Conflict logging for tools/disallowedTools overlap.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/lib/spawn/agent-enhancements.test.cjs", "exitCode": 0, "observation": "30 tests passing" },
      { "command": "pnpm lint", "exitCode": 0, "observation": "0 errors" }
    ]
  }
}
```

## When to Return to Orchestrator

- Agent schema has a different structure than expected
- Prompt assembler doesn't have clear extension points for filtering
- MCP section generation isn't separated enough to scope per agent
