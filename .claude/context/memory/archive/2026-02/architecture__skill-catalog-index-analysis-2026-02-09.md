# Skill Catalog/Index Gap Analysis

<!-- Agent: developer | Task: #14 | Session: 2026-02-09 -->

## Executive Summary

Comprehensive analysis of skill coverage across filesystem, skill-index.json, and skill-catalog.md. Found 13 missing skills in index, 4 missing in catalog, and 121 stale entries in index (archived sub-skills).

## Findings

### 1. Filesystem (Ground Truth)

- **Total**: 91 active skill directories
- **Special directories**: creators/ (3 creator sub-skills), integration/ (integration artifacts), workflow-patterns/

### 2. Skill-Index.json Coverage

- **Total in index**: 199 skills
- **Missing from index**: 13 skills
  - advanced-elicitation
  - artifact-integrator
  - best-practices-guidelines
  - code-semantic-search
  - code-structural-search
  - creators
  - dry-principle
  - integration
  - planning-with-files
  - prd-generator
  - sparc-methodology
  - spec-init
  - tauri-native-api-integration

- **Stale in index**: 121 skills (sub-skills from archived parent skills)
  - async-operations, logging-module-usage, library-usage, comprehensive-unit-testing-with-pytest, unit-testing-requirement, authentication-flow-rules, task-breakdown, brainstorming, strategic-planning-with-pseudocode, arxiv-mcp, operational-modes, recovery, project-analyzer, context-files-rules, history-and-next-task-rules, qa-workflow, verify-information-rule, thoughtful-and-accurate-responses, truthfulness-and-clarity-for-ai, handle-incomplete-tasks, continuous-improvement-focus, gitflow, commit-validator, smart-revert, commit-message-guidelines, version-control-rule, collaboration-and-version-control-rules, using-git-worktrees, gitops-workflow, finishing-a-development-branch (and 91 more)

**Analysis**: The skill-index generator is recursively including sub-skills from archived parent skills. These 121 sub-skills are from parents that were moved to `_archive/dead/` but the generator still processes them.

### 3. Skill-Catalog.md Coverage

- **Total mentions**: 92 unique skill names
- **Header claim**: "Total Skills: 95" (inaccurate)

- **Missing from catalog**: 4 skills
  - api-development-expert
  - creators (special directory)
  - integration (special directory)
  - workflow-patterns

- **Stale in catalog**: 5 skills
  - artifact-updater (never existed or archived)
  - command-creator (in creators/ subdirectory, not top-level)
  - rule-creator (in creators/ subdirectory, not top-level)
  - tool-creator (in creators/ subdirectory, not top-level)
  - testing-expert (deprecated alias for tdd)

## Recommendations

### High Priority (Blocking)

1. **Fix skill-index.json generator** to exclude archived skills
   - Currently processes `.claude/skills/_archive/dead/` contents
   - Should skip any `_archive/` or `_*` directories
   - Expected result: 91-92 skills instead of 199

2. **Add 4 missing skills to catalog**:
   ```markdown
   ## Languages
   | `api-development-expert` | REST API, OpenAPI, and API design patterns | api-designer |
   
   ## Other
   | `creators` | Special directory with command-creator, rule-creator, tool-creator sub-skills | N/A |
   | `integration` | Integration artifact templates and patterns | N/A |
   | `workflow-patterns` | Common workflow patterns (conditionals, loops, error handling) | N/A |
   ```

3. **Remove 5 stale entries from catalog**:
   - `artifact-updater` → not found on filesystem
   - `command-creator`, `rule-creator`, `tool-creator` → listed under `creators/` instead
   - `testing-expert` → deprecated alias (redirect to `tdd`)

4. **Update catalog header**: "Total Skills: 95" → "Total Skills: 91" (or 92 if counting creators/ as parent)

### Medium Priority (Cleanup)

1. **Document special directories** in catalog:
   - `creators/` contains 3 sub-skills (command-creator, rule-creator, tool-creator)
   - `integration/` contains integration artifact templates
   - `workflow-patterns/` contains common workflow pattern examples

2. **Verify creators/ subdirectory handling**:
   - Check if `creators/` should be indexed as 1 parent skill or 3 sub-skills
   - Current: subdirectories are NOT listed in top-level skill list
   - Recommended: Document in catalog that creators/ is a special directory

## Cross-Reference

- **Filesystem ground truth**: `.claude/skills/` (91 directories, excluding `_archive/`)
- **Index**: `.claude/config/skill-index.json` (199 skills, includes 121 stale)
- **Catalog**: `.claude/context/artifacts/catalogs/skill-catalog.md` (92 mentions, 4 missing)
- **Generator**: `.claude/tools/cli/generate-skill-index.cjs` (needs fix to exclude archived)

## Next Steps

1. Fix skill-index generator to exclude `_archive/` directories
2. Add 4 missing skills to catalog
3. Remove 5 stale entries from catalog
4. Update catalog header count
5. Re-run generator to verify 91-92 skill count
6. Validate catalog against filesystem one more time

## Memory Protocol

**Pattern**: Skill catalogs must be bidirectionally validated (filesystem ↔ index ↔ catalog). Automated generators can produce false positives if they process archived directories.

**Takeaway**: When archiving skills, ensure:
1. Move to `_archive/` directory
2. Remove from catalog manually
3. Verify generator excludes archived paths
4. Re-run generator to clean stale entries
