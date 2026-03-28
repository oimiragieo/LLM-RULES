---
name: creator-fix-worker
description: Fixes the skill-creator and agent-creator systems (SKILL.md refactoring, hook fixes, template fixes)
---

# Creator Fix Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that fix the skill-creator and agent-creator systems: refactoring SKILL.md files, fixing the creator guard TTL, eliminating dual creation paths, breaking circular dependencies, fixing templates, and improving post-creation quality validation.

## Work Procedure

1. **Read the feature description** — it specifies which creator system issue to fix.

2. **Read the analysis reports** — The detailed failure analysis is at:
   - `.claude/context/reports/skill-agent-system-analysis.md`
   - `.claude/context/reports/backend/skill-creation-failure-analysis-20260327.md`

3. **Read the target files** — Use Grep to find the exact code. Key files:
   - `.claude/skills/skill-creator/SKILL.md` (2,161 lines — do NOT read entirely, use grep)
   - `.claude/skills/agent-creator/SKILL.md` (1,811 lines — do NOT read entirely, use grep)
   - `.claude/hooks/routing/unified-creator-guard.cjs` (TTL logic)
   - `.claude/skills/skill-creator/scripts/create-actions.cjs` (enterprise default)
   - `.claude/skills/skill-creator/scripts/create-templates.cjs` (template fields)
   - `.claude/hooks/workflow/post-creation-integration.cjs` (registration)

4. **Write tests FIRST (red)** — Test the expected behavior:
   - For SKILL.md refactoring: test that file line count <= 500 and docs/ exists
   - For TTL: test that DEFAULT_TTL_MS >= 1800000 or event-based completion works
   - For templates: test that generated frontmatter includes all required fields
   - For registration: test that each integration step has independent error handling

5. **Implement the fix (green)** — Make targeted changes:

   **For SKILL.md refactoring (VAL-CRT-001/002):**
   - Identify reference-only content (examples, checklists, research details)
   - Create `docs/` subfolder within the skill directory
   - Move reference content to separate .md files in docs/
   - Add relative links from SKILL.md to docs/
   - Keep core procedure steps, frontmatter, and templates in SKILL.md
   - Target: <= 500 lines

   **For TTL fix (VAL-CRT-003):**
   - Update DEFAULT_TTL_MS and MAX_TTL_MS constants in unified-creator-guard.cjs
   - OR implement event-based completion with fallback reaper

   **For template fixes (VAL-CRT-006):**
   - Add missing fields to template generation in create-templates.cjs
   - Ensure agents, category, tags are populated

6. **Run tests** — `node --test tests/` for relevant test files.

7. **Run validation** — `pnpm validate:full:parallel` to catch reference integrity issues.

## Example Handoff

```json
{
  "salientSummary": "Refactored skill-creator/SKILL.md from 2,161 lines to 487 lines by extracting reference content to docs/ subfolder. Created 4 reference docs: research-gate.md, security-scan-checklist.md, enterprise-bundle-details.md, typed-search-dorks.md. Core procedure preserved with relative links. All existing tests pass.",
  "whatWasImplemented": "Split SKILL.md into core procedure (487 lines) + 4 reference documents in .claude/skills/skill-creator/docs/. Added relative links for on-demand loading. Preserved all creation steps, frontmatter, and template references. No content deleted, only relocated.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "wc -l .claude/skills/skill-creator/SKILL.md",
        "exitCode": 0,
        "observation": "487 lines"
      },
      {
        "command": "ls .claude/skills/skill-creator/docs/",
        "exitCode": 0,
        "observation": "4 files: research-gate.md, security-scan-checklist.md, enterprise-bundle-details.md, typed-search-dorks.md"
      },
      {
        "command": "pnpm validate:full:parallel",
        "exitCode": 0,
        "observation": "All validation passes, no broken references"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Verified SKILL.md still contains core creation steps 1-8",
        "observed": "All 8 steps present with relative links to reference docs"
      },
      {
        "action": "Verified no content was deleted by comparing total line count",
        "observed": "Original 2161 lines = 487 (SKILL.md) + 1674 (docs/). All content accounted for."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/skills/skill-creator-refactor.test.cjs",
        "cases": [
          { "name": "SKILL.md is <= 500 lines", "verifies": "VAL-CRT-001 line count" },
          {
            "name": "docs/ subfolder exists with reference files",
            "verifies": "VAL-CRT-001 reference extraction"
          },
          {
            "name": "SKILL.md contains relative links to docs/",
            "verifies": "VAL-CRT-010 relative references"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The SKILL.md has content that's ambiguous whether it's procedure or reference
- Post-creation hooks require changes to settings.json hook registration
- Template changes would break existing skill definitions
- Registration changes need coordination with routing system changes (M1/M2)
