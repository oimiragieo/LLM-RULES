---
name: skills-repair-worker
description: Fixes skill tests, catalog mismatches, missing workflows, and improves ecosystem gate scores
---

# Skills Repair Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Creating missing skill scripts (scripts/main.cjs)
- Adding missing SKILL.md sections
- Fixing catalog/index agent assignment mismatches
- Restoring missing workflow artifacts
- Improving skill ecosystem gate scores to >= 80

## Work Procedure

1. **Read the feature description.** Identify which skills need fixing and what specific changes are needed.

2. **For missing scripts/main.cjs files:**
   - Read the existing SKILL.md to understand what the script should do
   - Look at similar skills' scripts/main.cjs for patterns (e.g., `.claude/skills/context-compressor/scripts/main.cjs`)
   - The script typically: parses input, validates parameters, returns execution plan or result
   - Must be requireable without error
   - Write the test first, then create the script

3. **For missing SKILL.md sections:**
   - Read the test file to understand exactly what content is expected
   - Read similar skills that have the expected sections
   - Add the section with substantive content (not stubs)

4. **For catalog/index mismatches:**
   - Run `pnpm validate:skills` to get the full mismatch list
   - Read `.claude/config/skill-index.json` to understand structure
   - Update either the catalog metadata in SKILL.md or the index entry to match
   - Prefer updating the index to match SKILL.md (source of truth)

5. **For workflow restoration:**
   - Check `.claude/workflows/_archive/` for the file
   - If it exists in archive, restore it to active directory
   - If it doesn't exist, create it following existing workflow patterns

6. **For ecosystem gate score improvement:**
   - Run `pnpm skills:ecosystem:gate` to see which skills score < 80
   - For each low-scoring skill, check what's missing (the gate checks: scripts, hooks, schemas, rules, commands, templates, references, companion tools, workflow)
   - Add the minimum required artifacts to reach score 80
   - Follow existing patterns from high-scoring skills
   - NEVER create empty stub files -- all artifacts must have real content

7. **Run skill tests after each batch of changes:**
   ```
   node --test tests/skills/<skill-name>.test.cjs
   pnpm validate:skills
   pnpm validate:workflow-skill-contracts
   pnpm skills:ecosystem:gate
   ```

8. **Commit** with descriptive message per batch.

## Example Handoff

```json
{
  "salientSummary": "Created scripts/main.cjs for token-saver-context-compression, token-saver-adaptive-ratio, and token-saver-memory-dedup. All 3 skill tests now pass. Added Router Gap Detection section to skill-creator SKILL.md. Added Activation section with compression-reminder.txt reference to token-saver SKILL.md. Fixed 20 of 79 catalog/index mismatches.",
  "whatWasImplemented": "3 new scripts/main.cjs files following context-compressor pattern. 2 SKILL.md section additions. 20 skill-index.json agent assignment corrections.",
  "whatWasLeftUndone": "59 remaining catalog/index mismatches (separate feature).",
  "verification": {
    "commandsRun": [
      { "command": "node --test tests/skills/token-saver-context-compression.test.cjs", "exitCode": 0, "observation": "All tests pass" },
      { "command": "pnpm validate:skills", "exitCode": 0, "observation": "20 fewer mismatches" }
    ],
    "interactiveChecks": []
  },
  "tests": { "added": [], "coverage": "Existing test suites now pass" },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A skill requires domain knowledge not available in codebase
- Ecosystem gate scoring criteria are unclear
- A workflow artifact requires complex cross-skill dependencies
- More than 20 skills need improvement in a single feature (too large scope)
