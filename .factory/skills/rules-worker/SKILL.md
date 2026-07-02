---
name: rules-worker
description: Compresses and merges CLAUDE.md and rules files to fit under the 40K character cap
---

# Rules Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that modify `.claude/CLAUDE.md` or `.claude/rules/*.md` files — compression, merging, restructuring, frontmatter changes, cross-reference updates.

## Work Procedure

1. **Read the feature description carefully.** Understand exactly which files to modify, what to preserve, and what to compress/merge.

2. **Baseline measurement.** Before ANY changes, run the character count script from AGENTS.md to record the current total. Record individual file sizes for files you'll modify.

3. **Write tests first (red).** Create test file at `tests/rules/<descriptive-name>.test.cjs`. Tests should verify:
   - Character count targets (file size assertions)
   - Content preservation (grep for required concepts/markers)
   - Structural integrity (frontmatter validity, cross-reference resolution)
   - Merge completeness (all source content present in merged file)
   Run tests — they should FAIL (red).

4. **Implement changes.**
   - For compression: Read the file, identify verbose/redundant text, rewrite concisely. Preserve ALL semantic content — compress the expression, not the meaning.
   - For merges: Read ALL source files, combine into one with logical section organization. Delete originals AFTER verifying merge.
   - For frontmatter: Add valid YAML frontmatter with `---` delimiters, `description:` and `globs:` or `paths:` keys.
   - For cross-references: Search ALL .claude/rules/*.md and .claude/CLAUDE.md for references to deleted/renamed files. Update every reference.

5. **Run tests (green).** All tests pass. Fix any failures.

6. **Verify character count.** Run the total character count script. Must be under target.

7. **Run lint and format.**
   ```
   pnpm lint
   pnpm format:check
   ```

8. **Manual verification.** Read each modified file end-to-end. Verify no critical content was lost. Check that the file reads naturally and coherently — not just mechanically compressed.

## Example Handoff

```json
{
  "salientSummary": "Compressed CLAUDE.md from 11,163 to 7,012 chars (-37%) by removing verbose examples and deduplicating routing table with agents.md. All 9 section anchors preserved, 3 IRON LAW markers retained, all @-references valid. Total CLAUDE.md+rules now at 37,450 chars (under 38K target).",
  "whatWasImplemented": "Rewrote CLAUDE.md removing: verbose Self-Check Gates examples (3 paragraphs → 3 bullet points), duplicated routing table entries (already in agents.md), expanded tool descriptions (replaced with cross-references). Preserved all section headings, IRON LAW markers, @-references, and routing table structure.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node -e \"const fs=require('fs');const p=require('path');let t=fs.readFileSync('.claude/CLAUDE.md','utf8').length;fs.readdirSync('.claude/rules').filter(f=>f.endsWith('.md')).forEach(f=>{t+=fs.readFileSync(p.join('.claude/rules',f),'utf8').length});console.log('Total:',t,t<40000?'PASS':'FAIL')\"",
        "exitCode": 0,
        "observation": "Total: 37450 PASS"
      },
      {
        "command": "node --test tests/rules/claudemd-compression.test.cjs",
        "exitCode": 0,
        "observation": "8 tests passing"
      },
      {
        "command": "pnpm lint",
        "exitCode": 0,
        "observation": "0 errors"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/rules/claudemd-compression.test.cjs",
        "cases": [
          { "name": "CLAUDE.md is between 6500 and 7500 chars", "verifies": "VAL-RC-003" },
          { "name": "all section anchors present", "verifies": "VAL-RC-002" },
          { "name": "at least 3 IRON LAW markers", "verifies": "VAL-RC-013" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A rules file contains content you're unsure whether to preserve or remove
- Merging files creates a result that exceeds the per-file compression target
- Cross-references point to files outside .claude/rules/ that you shouldn't modify
- The total character count cannot reach the target without removing critical content
