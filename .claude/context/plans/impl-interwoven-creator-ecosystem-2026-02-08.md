<!-- Agent: planner | Task: #42 | Session: 2026-02-08 -->

# Implementation Plan: Interwoven Creator Ecosystem

**Date:** 2026-02-08
**Status:** READY FOR EXECUTION
**Complexity:** HIGH (16+ files, cross-cutting, new library module, workflow changes)
**Estimated Duration:** 3-4 hours (developer implementation)
**Estimated Files Modified:** 18 (3 created, 15 modified)
**Blocking Security Requirements:** SEC-ICE-001, SEC-ICE-002

---

## Executive Summary

Implement the Interwoven Creator Ecosystem: a companion artifact tracking system that reduces orphaned artifact rate from ~70% to <20%. The plan is structured in 6 phases with a commit checkpoint after Phase 3 (10+ files threshold met).

**Key Deliverables:**
- Pre-work simplification (shared utilities)
- `companion-check.cjs` library module with security hardening
- `companionMatrix` in `ecosystem-impact-graph.json`
- Updated artifact-integrator with companion analysis
- Step 0.5 in all 9 creator skills
- Research-first protocol enhancement
- Ecosystem creation workflow documentation
- Unit + integration tests
- Lint/format clean

---

## Phase 0: Pre-Work Simplification (MANDATORY FIRST)

**Purpose:** Extract shared utilities BEFORE adding new features to prevent duplication.
**Dependencies:** None
**Parallel OK:** Yes (Steps 0.1 and 0.2 are independent)
**Target Agent:** `code-simplifier`
**Recommended Skills:** `verification-before-completion`

### Step 0.1: Extract `safeParseJSON` to Shared Utility

**Files to create:**
- `.claude/lib/utils/safe-json.cjs`

**Files to modify:**
- `.claude/lib/creators/creator-commons.cjs` (replace inline safeParseJSON with import)
- `.claude/lib/creators/ecosystem-impact-analyzer.cjs` (replace inline safeParseJSON with import)

**Detailed Changes:**

1. Create `.claude/lib/utils/safe-json.cjs`:
   ```javascript
   'use strict';
   /**
    * Safe JSON parse with prototype pollution prevention.
    * Extracted from creator-commons.cjs and ecosystem-impact-analyzer.cjs
    * to eliminate duplication (SEC-ICE-005 remediation).
    * @param {string} str - JSON string
    * @returns {Object|null} Parsed object or null
    */
   function safeParseJSON(str) {
     try {
       const parsed = JSON.parse(str);
       if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
         const clean = Object.create(null);
         for (const key of Object.keys(parsed)) {
           if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
             continue;
           }
           clean[key] = parsed[key];
         }
         return Object.assign({}, clean);
       }
       return parsed;
     } catch (_e) {
       return null;
     }
   }
   module.exports = { safeParseJSON };
   ```

2. In `creator-commons.cjs`:
   - Add `const { safeParseJSON } = require('../utils/safe-json.cjs');` after existing requires
   - Remove the inline `safeParseJSON` function (lines 43-61)
   - Keep `safeParseJSON` in module.exports for backward compatibility (re-export)

3. In `ecosystem-impact-analyzer.cjs`:
   - Add `const { safeParseJSON } = require('../utils/safe-json.cjs');` after existing requires
   - Remove the inline `safeParseJSON` function (lines 36-53)
   - Keep `safeParseJSON` in module.exports for backward compatibility (re-export)

**Estimated LOC:** 25 new, 38 removed = net -13
**Testing:** Existing tests for both files must still pass. Add 3 unit tests for `safe-json.cjs`.

---

### Step 0.2: Extract Path Normalization to Shared Utility

**Files to create:**
- `.claude/lib/utils/path-helpers.cjs`

**Detailed Changes:**

1. Create `.claude/lib/utils/path-helpers.cjs`:
   ```javascript
   'use strict';
   const path = require('path');

   /**
    * Normalize path separators to forward slashes (cross-platform).
    * Critical for Windows compatibility -- see MEMORY.md learnings.
    * @param {string} filePath
    * @returns {string}
    */
   function normalizePath(filePath) {
     return filePath.replace(/\\/g, '/');
   }

   /**
    * Extract artifact name from path.
    * Handles skill files (SKILL.md -> parent dir name) and schema files (.schema suffix).
    * @param {string} artifactPath
    * @returns {string} Lowercase artifact name
    */
   function extractArtifactName(artifactPath) {
     return path
       .basename(artifactPath, path.extname(artifactPath))
       .replace(/\.schema$/, '')
       .replace(/^SKILL$/, '')
       .toLowerCase();
   }

   /**
    * Get parent directory name (lowercase).
    * Used for skill lookups where the directory name IS the skill name.
    * @param {string} filePath
    * @returns {string}
    */
   function getParentDirName(filePath) {
     return path.basename(path.dirname(filePath)).toLowerCase();
   }

   /**
    * Validate artifact name against safe pattern.
    * SEC-ICE-001: Prevents path traversal via artifact names.
    * Pattern: lowercase alphanumeric with hyphens, no dots/slashes/spaces.
    * @param {string} name
    * @returns {boolean}
    */
   function isValidArtifactName(name) {
     if (!name || typeof name !== 'string') return false;
     return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || /^[a-z0-9]$/.test(name);
   }

   /**
    * Validate that a resolved path is within the project root.
    * SEC-ICE-001: Prevents path traversal attacks.
    * @param {string} resolvedPath - Absolute path to validate
    * @param {string} projectRoot - Project root directory
    * @returns {boolean}
    */
   function isPathWithinProject(resolvedPath, projectRoot) {
     const normalizedResolved = normalizePath(path.resolve(resolvedPath));
     const normalizedRoot = normalizePath(path.resolve(projectRoot));
     return normalizedResolved.startsWith(normalizedRoot + '/') ||
            normalizedResolved === normalizedRoot;
   }

   module.exports = {
     normalizePath,
     extractArtifactName,
     getParentDirName,
     isValidArtifactName,
     isPathWithinProject,
   };
   ```

**Estimated LOC:** 55 new
**Testing:** Add 8 unit tests covering each function, especially Windows path edge cases and SEC-ICE-001 validation.

**Note:** Existing files that use inline path normalization should be updated to import from this utility in future refactoring, but this is P2 (not blocking for companion matrix).

---

### Step 0.3: Templatize Step 0 Prose in Creator Skills (DEFERRED to Phase 3)

**Rationale:** While the simplification report recommends this, the actual Step 0 changes overlap with Step 0.5 (companion check) additions. We will simplify the Step 0 prose to a 3-line reference WHILE adding Step 0.5 in Phase 3, achieving both goals in one pass.

---

### Phase 0 Verification Gate

```bash
# All existing tests must pass
pnpm test
# New utility tests must pass
node --test tests/lib/utils/safe-json.test.cjs
node --test tests/lib/utils/path-helpers.test.cjs
```

**Success Criteria:**
- [ ] `safe-json.cjs` created with `safeParseJSON` function
- [ ] `path-helpers.cjs` created with 5 functions including SEC-ICE-001 validators
- [ ] Both `creator-commons.cjs` and `ecosystem-impact-analyzer.cjs` import from shared utility
- [ ] All existing tests pass (zero regressions)
- [ ] New utility tests pass

---

## Phase 1: Companion Matrix Data Structure

**Purpose:** Add `companionMatrix` to ecosystem-impact-graph.json.
**Dependencies:** None (can run parallel with Phase 0)
**Parallel OK:** Yes (data-only change, no code dependencies)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

### Step 1.1: Add `companionMatrix` to ecosystem-impact-graph.json

**Files to modify:**
- `.claude/context/data/ecosystem-impact-graph.json`

**Detailed Changes:**

Add a `companionMatrix` top-level key after the existing `artifactTypes` section. The full matrix content is specified in the architecture report (Section 5). Key structure for all 9 artifact types:

```json
{
  "companionMatrix": {
    "agent": {
      "required": [
        { "companionType": "routing-entry", "relationship": "...", "checkStrategy": "grep-in-file", "checkTarget": "...", "autoCreate": false, "creatorSkill": "agent-creator" },
        { "companionType": "registry-entry", ... },
        { "companionType": "claude-md-entry", ... }
      ],
      "recommended": [ ... ],
      "optional": []
    },
    "skill": { ... },
    "hook": { ... },
    "workflow": { ... },
    "command": { ... },
    "rule": { ... },
    "tool": { ... },
    "template": { ... },
    "schema": { ... }
  }
}
```

Use the EXACT companion matrix from the architecture report Section 5 "Full Companion Matrix" (lines 180-496 of the design report). This is the canonical data specification.

**Estimated LOC:** ~275 lines added to JSON file (file grows from ~327 to ~600 lines)

**Security Note:** All `autoCreate` values MUST be `false` EXCEPT for `test` companions (per architecture decision -- prevents circular creation loops). Verify this constraint before marking complete.

---

### Phase 1 Verification Gate

```bash
# JSON must be valid
node -e "JSON.parse(require('fs').readFileSync('.claude/context/data/ecosystem-impact-graph.json','utf8'));console.log('valid')"
# Existing analyzer tests must pass
node --test tests/lib/creators/ecosystem-impact-analyzer.test.cjs
```

**Success Criteria:**
- [ ] `companionMatrix` key exists with 9 artifact types
- [ ] Each type has `required`, `recommended`, `optional` arrays
- [ ] Each companion has all 6 fields: `companionType`, `relationship`, `checkStrategy`, `checkTarget`, `autoCreate`, `creatorSkill`
- [ ] `autoCreate: true` ONLY for `test` type companions
- [ ] JSON is valid (parseable)
- [ ] Existing analyzer tests still pass

---

## Phase 2: companion-check.cjs Library Module

**Purpose:** Create the core pre-creation companion checking library.
**Dependencies:** Phase 0 (needs `safe-json.cjs` and `path-helpers.cjs`), Phase 1 (needs `companionMatrix` data)
**Parallel OK:** No (depends on Phase 0 + Phase 1)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

### Step 2.1: Create companion-check.cjs

**Files to create:**
- `.claude/lib/creators/companion-check.cjs`

**Detailed Changes:**

Implement the API specified in the architecture report Section 6 (lines 512-685):

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { isValidArtifactName, isPathWithinProject, normalizePath } = require('../utils/path-helpers.cjs');

// Constants for SEC-ICE-002 auto-spawn limits
const MAX_AUTO_SPAWN_DEPTH = 2;
const MAX_AUTO_SPAWNS_PER_EVENT = 5;
const AUTO_SPAWN_COOLDOWN_MS = 30000;

// Artifact name validation regex (SEC-ICE-001)
const VALID_ARTIFACT_NAME = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
```

**Exported Functions:**

1. `checkCompanions(artifactType, artifactName, options = {})` -> `CompanionCheckResult`
   - Validates `artifactName` with `isValidArtifactName()` (SEC-ICE-001 -- BLOCKING)
   - Validates `artifactType` against known enum (9 types)
   - Loads companion matrix from graph
   - Iterates required/recommended/optional tiers
   - Runs check strategy for each companion
   - Returns structured result with `missing`, `present`, `completionScore`, `summary`

2. `formatCompanionChecklist(result)` -> `string`
   - Generates markdown checklist suitable for injection into creator prompts
   - Groups by tier (required/recommended/optional)
   - Uses `[x]` for present, `[ ]` for missing
   - Includes relationship description for each item

3. `loadCompanionMatrix(graphPath)` -> `Object|null`
   - Reads ecosystem-impact-graph.json
   - Returns the `companionMatrix` section (not full graph)
   - Graceful degradation: returns null if missing/corrupt

4. `validateAutoSpawnLimits(spawnHistory)` -> `{ allowed: boolean, reason: string }`
   - SEC-ICE-002: Checks depth limit (max 2)
   - SEC-ICE-002: Checks per-event cap (max 5)
   - SEC-ICE-002: Checks cooldown (30s between spawns from same source)
   - SEC-ICE-002: Checks `AUTO_COMPANION_SPAWN` env var kill switch
   - SEC-ICE-002: Cycle detection via visited Set

**Check Strategy Implementations:**

```javascript
const CHECK_STRATEGIES = {
  'file-exists': (resolvedTarget, artifactName, projectRoot) => {
    const fullPath = path.resolve(projectRoot, resolvedTarget);
    if (!isPathWithinProject(fullPath, projectRoot)) return false; // SEC-ICE-001
    return fs.existsSync(fullPath);
  },
  'grep-in-file': (resolvedTarget, artifactName, projectRoot) => {
    if (!resolvedTarget) return false;
    const fullPath = path.resolve(projectRoot, resolvedTarget);
    if (!isPathWithinProject(fullPath, projectRoot)) return false; // SEC-ICE-001
    if (!fs.existsSync(fullPath)) return false;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      return content.toLowerCase().includes(artifactName.toLowerCase());
    } catch (_err) { return false; }
  },
  'json-key-exists': (resolvedTarget, artifactName, projectRoot) => {
    const fullPath = path.resolve(projectRoot, resolvedTarget);
    if (!isPathWithinProject(fullPath, projectRoot)) return false; // SEC-ICE-001
    if (!fs.existsSync(fullPath)) return false;
    try {
      const json = safeParseJSON(fs.readFileSync(fullPath, 'utf8'));
      return json && artifactName in json;
    } catch (_err) { return false; }
  },
  'glob-match': (resolvedTarget, artifactName, projectRoot) => {
    // Simple glob check using fs.readdirSync + pattern matching
    // No heavy dependencies (no minimatch)
    // Implementation: resolve parent dir, list files, match pattern
    // ...
  },
  'settings-registered': (resolvedTarget, artifactName, projectRoot) => {
    const fullPath = path.resolve(projectRoot, resolvedTarget);
    if (!isPathWithinProject(fullPath, projectRoot)) return false;
    if (!fs.existsSync(fullPath)) return false;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      return content.includes(artifactName);
    } catch (_err) { return false; }
  },
};
```

**Target interpolation:**

```javascript
function interpolateTarget(template, artifactName) {
  if (!template) return null;
  // SEC-ICE-001: Validate name before interpolation
  if (!isValidArtifactName(artifactName)) return null;
  return template.replace(/\{name\}/g, artifactName);
}
```

**Estimated LOC:** 250-300 lines
**Complexity:** MEDIUM (multiple check strategies, security validation, structured output)

---

### Step 2.2: Create companion-check tests

**Files to create:**
- `tests/lib/creators/companion-check.test.cjs`

**Test Categories (minimum 20 tests):**

1. **Input Validation (5 tests):**
   - Invalid artifact type returns empty result
   - Invalid artifact name (path traversal `../../hack`) returns error (SEC-ICE-001)
   - Valid artifact name passes validation
   - Single-char artifact name (`a`) passes
   - Name with whitespace/slashes rejected

2. **Check Strategies (5 tests):**
   - `file-exists` returns true for existing file
   - `file-exists` returns false for missing file
   - `grep-in-file` finds artifact name in target file
   - `grep-in-file` returns false when name not found
   - `settings-registered` checks settings.json

3. **Companion Matrix Loading (3 tests):**
   - Loads matrix from valid graph file
   - Returns null for missing graph file
   - Returns null for corrupt JSON

4. **Check Results (4 tests):**
   - All required present -> completionScore = 1.0
   - Mixed required -> proportional score
   - Missing required companions appear in `missing` array
   - Present companions appear in `present` array

5. **Format Checklist (3 tests):**
   - Generates valid markdown with checkboxes
   - Present items use `[x]`, missing use `[ ]`
   - Groups by tier (required/recommended/optional)

6. **Auto-Spawn Limits (SEC-ICE-002) (5 tests):**
   - Depth > 2 blocked
   - Per-event > 5 blocked
   - Cycle detection blocks circular references
   - Kill switch `AUTO_COMPANION_SPAWN=off` blocks all
   - Within limits -> allowed

**Estimated LOC:** 200-250 lines of tests

---

### Phase 2 Verification Gate

```bash
node --test tests/lib/creators/companion-check.test.cjs
# Must pass with 20+ tests, 0 failures
```

**Success Criteria:**
- [ ] `companion-check.cjs` exports `checkCompanions`, `formatCompanionChecklist`, `loadCompanionMatrix`, `validateAutoSpawnLimits`
- [ ] SEC-ICE-001: artifact names validated before any path construction
- [ ] SEC-ICE-001: all resolved paths validated within PROJECT_ROOT
- [ ] SEC-ICE-002: depth limit, per-event cap, cycle detection, cooldown, kill switch implemented
- [ ] All 20+ tests passing
- [ ] Graceful degradation when matrix is missing

---

## CHECKPOINT: Commit Phase 0-2 Changes

**Rationale:** 10+ files modified/created. Commit creates recovery point before Phase 3 (creator skill updates across 9 files).

```bash
git add .claude/lib/utils/safe-json.cjs .claude/lib/utils/path-helpers.cjs .claude/lib/creators/companion-check.cjs .claude/lib/creators/creator-commons.cjs .claude/lib/creators/ecosystem-impact-analyzer.cjs .claude/context/data/ecosystem-impact-graph.json tests/lib/utils/ tests/lib/creators/companion-check.test.cjs
git commit -m "feat: add companion-check library and shared utilities for Interwoven Creator Ecosystem"
```

---

## Phase 3: Creator Skill Updates (Step 0.5 + Research-First)

**Purpose:** Add Step 0.5 (companion check) to all 9 creator skills and update research tool priority.
**Dependencies:** Phase 2 (needs companion-check.cjs)
**Parallel OK:** Yes (each creator skill can be updated independently)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

### Step 3.1: Add Step 0.5 to All 9 Creator Skills

**Files to modify (9 files):**
1. `.claude/skills/agent-creator/SKILL.md`
2. `.claude/skills/skill-creator/SKILL.md`
3. `.claude/skills/hook-creator/SKILL.md`
4. `.claude/skills/workflow-creator/SKILL.md`
5. `.claude/skills/creators/command-creator/SKILL.md`
6. `.claude/skills/creators/rule-creator/SKILL.md`
7. `.claude/skills/creators/tool-creator/SKILL.md`
8. `.claude/skills/template-creator/SKILL.md`
9. `.claude/skills/schema-creator/SKILL.md`

**Step 0.5 Text to Insert (after Step 0, before Step 1 in each):**

```markdown
### Step 0.5: Companion Check (MANDATORY)

Before proceeding with creation, check what companion artifacts already exist:

1. Load companion-check: `require('.claude/lib/creators/companion-check.cjs')`
2. Run `checkCompanions('{ARTIFACT_TYPE}', artifactName)`
3. Review the companion checklist:
   - **Required companions missing?** WARN in output (will be addressed post-creation by artifact-integrator)
   - **Recommended companions missing?** NOTE for follow-up
4. Include the formatted checklist in your creation context

This step is informational (does not block creation) but ensures awareness of the full integration landscape.
```

Replace `{ARTIFACT_TYPE}` with the appropriate type for each creator:
- agent-creator -> `'agent'`
- skill-creator -> `'skill'`
- hook-creator -> `'hook'`
- workflow-creator -> `'workflow'`
- command-creator -> `'command'`
- rule-creator -> `'rule'`
- tool-creator -> `'tool'`
- template-creator -> `'template'`
- schema-creator -> `'schema'`

**Additionally, simplify Step 0 prose** in each creator by replacing the ~30-line duplicate block with a 3-line reference:

```markdown
### Step 0: Existence Check (MANDATORY - FIRST STEP)

**BEFORE creating any artifact, follow the [Artifact Updater Protocol](.claude/skills/integration/artifact-updater/SKILL.md).**

If artifact exists, delegate to `artifact-updater`. If new, continue to Step 0.5.
```

**Estimated LOC per file:** +15 (Step 0.5), -25 (Step 0 simplification) = net -10 per file, ~-90 total

---

### Step 3.2: Update research-synthesis SKILL.md with Tool Priority

**Files to modify:**
- `.claude/skills/research-synthesis/SKILL.md`

**Detailed Changes:**

Add a "Tool Priority" section (as specified in architecture report Section 8.1):

```markdown
## Tool Priority (IRON LAW)

Use tools in this priority order:

1. **mcp__Exa__web_search_exa** - Preferred for web research (better quality, structured results)
2. **mcp__Exa__get_code_context_exa** - Preferred for code examples and context
3. **mcp__Ref__ref_search_documentation** - Preferred for official documentation lookup
4. **WebSearch** - Fallback when MCP tools are unavailable
5. **WebFetch** - Fallback for fetching specific URLs

**Why MCP-first:** MCP tools provide higher-quality, structured results with better code context. WebSearch/WebFetch are generic fallbacks.
```

---

### Step 3.3: Update agent-creator Step 2 with MCP Tool References

**Files to modify:**
- `.claude/skills/agent-creator/SKILL.md` (already modified in 3.1)

**Detailed Changes:**

In Step 2 (Research Domain), replace WebSearch references with MCP-first pattern:

```markdown
### Step 2: Research Domain

Research using MCP tools (preferred) or WebSearch (fallback):

1. **Code context:** `mcp__Exa__get_code_context_exa` for implementation patterns
2. **Best practices:** `mcp__Exa__web_search_exa` for domain expertise patterns
3. **Documentation:** `mcp__Ref__ref_search_documentation` for official docs
4. **Fallback:** `WebSearch` if MCP tools are unavailable
```

---

### Phase 3 Verification Gate

```bash
# Verify Step 0.5 text exists in all 9 creators
# Verify research-synthesis has Tool Priority section
# All existing tests still pass
pnpm test
```

**Success Criteria:**
- [ ] All 9 creator skills contain "Step 0.5: Companion Check" section
- [ ] All 9 creator skills have simplified Step 0 (3-line reference)
- [ ] `research-synthesis/SKILL.md` has "Tool Priority" section
- [ ] `agent-creator/SKILL.md` Step 2 uses MCP-first references
- [ ] All existing tests pass

---

## Phase 4: artifact-integrator Enhancement

**Purpose:** Add Step 3.1 (companion matrix analysis) and auto-spawn safety to artifact-integrator.
**Dependencies:** Phase 2 (needs companion-check.cjs)
**Parallel OK:** Can run parallel with Phase 3
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

### Step 4.1: Add Step 3.1 to artifact-integrator SKILL.md

**Files to modify:**
- `.claude/skills/artifact-integrator/SKILL.md`

**Detailed Changes:**

After the existing Step 3 (Generate Integration Plan), add:

```markdown
### Step 3.1: Companion Matrix Analysis (NEW)

After generating the standard integration plan (Step 3), check companions:

1. Load companion-check: `require('.claude/lib/creators/companion-check.cjs')`
2. For each artifact processed from integration-queue.jsonl:
   a. Run `checkCompanions(artifactType, artifactName)`
   b. For REQUIRED missing companions:
      - If `autoCreate: true` AND `creatorSkill` is set: propose TaskCreate (subject to auto-spawn limits)
      - If `autoCreate: false`: Create advisory task noting the gap
   c. For RECOMMENDED missing companions:
      - Create advisory tasks (lower priority)
   d. Include companion checklist in the integration report

**Auto-Spawn Safety (SEC-ICE-002 - MANDATORY):**

Before proposing ANY auto-spawn of a creator:
1. Check `AUTO_COMPANION_SPAWN` env var (default: `warn`)
   - `off`: Do NOT auto-spawn. Only create advisory tasks.
   - `warn`: Log warning + create advisory tasks (do not auto-spawn)
   - `block`: Auto-spawn is enabled with limits below
2. Validate via `validateAutoSpawnLimits(spawnHistory)`:
   - Max depth: 2 (direct companions only)
   - Max per event: 5 spawns
   - Cooldown: 30s between spawns from same source
   - Cycle detection: abort if artifact type already in visited Set
3. Log all auto-spawn decisions to spawn-log.jsonl with `source: 'companion-check'`

**Deduplication:** Compare companion tasks against existing `mustHave` integration tasks. Dedup key: `(artifactType, artifactName, companionType)`. Skip if already covered by standard integration plan.
```

**Estimated LOC:** +40 lines added to SKILL.md

---

### Phase 4 Verification Gate

```bash
# Verify Step 3.1 exists in artifact-integrator
# Verify SEC-ICE-002 safety section is present
pnpm test
```

**Success Criteria:**
- [ ] artifact-integrator SKILL.md contains "Step 3.1: Companion Matrix Analysis"
- [ ] Auto-spawn safety section present with all 5 SEC-ICE-002 controls
- [ ] Deduplication strategy documented
- [ ] All existing tests pass

---

## Phase 5: Ecosystem Creation Workflow Documentation

**Purpose:** Create unified workflow doc and update router references.
**Dependencies:** Phases 2-4 complete (workflow references all new components)
**Parallel OK:** No (needs final component inventory)
**Target Agent:** `technical-writer`
**Recommended Skills:** `doc-generator`, `writing-skills`, `verification-before-completion`

### Step 5.1: Create ecosystem-creation-workflow.md

**Files to create:**
- `.claude/workflows/core/ecosystem-creation-workflow.md`

**Content:** Use the full workflow specification from the architecture report Section 9 (lines 813-912), including:

1. Overview of the 6-phase creation lifecycle
2. Phase descriptions (Request Routing -> Research -> Pre-Creation Check -> Creation -> Post-Creation Integration -> Companion Creation)
3. Mermaid sequence diagram showing the full flow
4. Integration points table
5. References to companion-check.cjs, artifact-integrator, creator skills

**Estimated LOC:** 100-120 lines

---

### Step 5.2: Update CLAUDE.md and Router References (ADVISORY)

**Files to modify:**
- `.claude/CLAUDE.md` -- Add reference to ecosystem-creation-workflow in Section 8.6 Enterprise Workflows
- `.claude/docs/@ENTERPRISE_WORKFLOWS.md` -- Add ecosystem-creation-workflow entry

**Note:** These are documentation-only changes (markdown). The CLAUDE.md update adds a single table row to the Enterprise Workflows section. The @ENTERPRISE_WORKFLOWS.md adds a brief workflow entry.

**Estimated LOC:** +5 lines per file

---

### Phase 5 Verification Gate

```bash
# Verify workflow file exists and contains required sections
# Verify CLAUDE.md reference added
```

**Success Criteria:**
- [ ] `ecosystem-creation-workflow.md` exists with all 6 phases documented
- [ ] Mermaid sequence diagram included
- [ ] Integration points table present
- [ ] CLAUDE.md Section 8.6 references new workflow
- [ ] @ENTERPRISE_WORKFLOWS.md updated

---

## Phase 6: Quality Gates (BLOCKING)

**Purpose:** Run full test suite, lint, and format.
**Dependencies:** All previous phases complete
**Parallel OK:** No (final validation)
**Target Agent:** `qa`
**Recommended Skills:** `tdd`, `verification-before-completion`, `checklist-generator`

### Step 6.1: Run Full Test Suite

```bash
pnpm test
```

All tests MUST pass. If any fail, fix before proceeding.

### Step 6.2: Run Lint and Format

```bash
pnpm lint:fix
pnpm format
```

Both MUST produce zero errors and zero changes. These are BLOCKING requirements per workspace conventions.

### Step 6.3: Verify Security Requirements

Manually verify:
- [ ] SEC-ICE-001: `isValidArtifactName()` called before ANY path construction in companion-check.cjs
- [ ] SEC-ICE-001: `isPathWithinProject()` called for ALL resolved paths
- [ ] SEC-ICE-002: `MAX_AUTO_SPAWN_DEPTH = 2` constant defined
- [ ] SEC-ICE-002: `MAX_AUTO_SPAWNS_PER_EVENT = 5` constant defined
- [ ] SEC-ICE-002: `AUTO_SPAWN_COOLDOWN_MS = 30000` constant defined
- [ ] SEC-ICE-002: `AUTO_COMPANION_SPAWN` env var check present
- [ ] SEC-ICE-002: Cycle detection via visited Set present

---

### Phase 6 Verification Gate

**Success Criteria:**
- [ ] All tests pass (0 failures)
- [ ] `pnpm lint:fix` produces 0 errors
- [ ] `pnpm format` produces 0 changes
- [ ] All SEC-ICE-001 controls verified
- [ ] All SEC-ICE-002 controls verified

---

## Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction.
**Dependencies:** All implementation phases complete.

**Tasks:**

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command:**
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from the Interwoven Creator Ecosystem plan, extract learnings to memory files, and check for evolution opportunities."
})
```

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Complete File Inventory

### Files to Create (3)

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `.claude/lib/utils/safe-json.cjs` | 0.1 | Shared safe JSON parser |
| 2 | `.claude/lib/utils/path-helpers.cjs` | 0.2 | Shared path utilities + SEC-ICE-001 validators |
| 3 | `.claude/lib/creators/companion-check.cjs` | 2.1 | Pre-creation companion checker |

### Files to Create (Tests) (3)

| # | File | Phase | Tests |
|---|------|-------|-------|
| 1 | `tests/lib/utils/safe-json.test.cjs` | 0.1 | 3 tests |
| 2 | `tests/lib/utils/path-helpers.test.cjs` | 0.2 | 8 tests |
| 3 | `tests/lib/creators/companion-check.test.cjs` | 2.2 | 20+ tests |

### Files to Create (Docs) (1)

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `.claude/workflows/core/ecosystem-creation-workflow.md` | 5.1 | Unified creation workflow |

### Files to Modify (15)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `.claude/lib/creators/creator-commons.cjs` | 0.1 | Import safeParseJSON from shared utility |
| 2 | `.claude/lib/creators/ecosystem-impact-analyzer.cjs` | 0.1 | Import safeParseJSON from shared utility |
| 3 | `.claude/context/data/ecosystem-impact-graph.json` | 1.1 | Add companionMatrix (9 artifact types) |
| 4 | `.claude/skills/agent-creator/SKILL.md` | 3.1-3.3 | Step 0 simplification + Step 0.5 + MCP tools |
| 5 | `.claude/skills/skill-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 6 | `.claude/skills/hook-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 7 | `.claude/skills/workflow-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 8 | `.claude/skills/creators/command-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 9 | `.claude/skills/creators/rule-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 10 | `.claude/skills/creators/tool-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 11 | `.claude/skills/template-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 12 | `.claude/skills/schema-creator/SKILL.md` | 3.1 | Step 0 simplification + Step 0.5 |
| 13 | `.claude/skills/research-synthesis/SKILL.md` | 3.2 | Add Tool Priority section |
| 14 | `.claude/skills/artifact-integrator/SKILL.md` | 4.1 | Add Step 3.1 companion matrix analysis |
| 15 | `.claude/CLAUDE.md` | 5.2 | Add ecosystem-creation-workflow reference |

**Total: 22 files (7 created + 15 modified)**

---

## Dependency Graph (DAG)

```
Phase 0.1 (safe-json) ──┐
Phase 0.2 (path-helpers) ├── Phase 2 (companion-check) ──┬── Phase 3 (creator skills)
Phase 1 (matrix data) ──┘                                ├── Phase 4 (integrator)
                                                          └── Phase 5 (workflow docs)
                                                                    │
                                                              Phase 6 (quality gates)
                                                                    │
                                                              Phase FINAL (reflection)
```

**Parallelism:**
- Phase 0.1 and 0.2 can run in parallel
- Phase 0.1/0.2 and Phase 1 can run in parallel
- Phase 3 and Phase 4 can run in parallel (after Phase 2)
- Phase 5 must wait for Phases 3 and 4
- Phase 6 must wait for all

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Path traversal via artifact names | HIGH | MEDIUM | SEC-ICE-001: strict regex validation + project root check |
| Auto-spawn amplification | HIGH | LOW | SEC-ICE-002: depth 2, cap 5, cycle detection, kill switch |
| Circular companion dependencies | MEDIUM | LOW | autoCreate: false for cross-type, dedup in integrator |
| Stale companion matrix | LOW | MEDIUM | Version controlled in git, schema validation on load |
| Test regressions | MEDIUM | LOW | Full test suite run before commit |
| Creator skill update errors | LOW | LOW | Template-based Step 0.5 text reduces variation risk |

---

## Timeline Summary

| Phase | Tasks | Files | Est. Time | Parallel? |
|-------|-------|-------|-----------|-----------|
| 0: Pre-Work | 2 | 4 create + 2 modify | 30 min | Partial (0.1 ∥ 0.2) |
| 1: Matrix Data | 1 | 1 modify | 15 min | Yes (∥ Phase 0) |
| CHECKPOINT | - | - | 5 min | - |
| 2: Library | 2 | 2 create | 45 min | No (after 0+1) |
| 3: Creator Skills | 3 | 10 modify | 30 min | Partial (after 2) |
| 4: Integrator | 1 | 1 modify | 15 min | Yes (∥ Phase 3) |
| 5: Workflow Docs | 2 | 2 create + 1 modify | 20 min | No (after 3+4) |
| 6: Quality Gates | 3 | 0 (testing) | 15 min | No (final) |
| FINAL: Reflection | 1 | 0 | 15 min | No (after 6) |
| **Total** | **15** | **22 files** | **~3 hours** | |

---

## Task Decomposition for Router

The following TaskCreate calls should be used to execute this plan:

### Task 1: Pre-Work Simplification (Phase 0)
```
Target Agent: `code-simplifier`
Recommended Skills: `verification-before-completion`
Description: Extract safeParseJSON to .claude/lib/utils/safe-json.cjs and path utilities to .claude/lib/utils/path-helpers.cjs. Update creator-commons.cjs and ecosystem-impact-analyzer.cjs to import from shared utilities. Write tests. SEC-ICE-001 validators must be in path-helpers.
```

### Task 2: Companion Matrix Data (Phase 1)
```
Target Agent: `developer`
Recommended Skills: `tdd`, `verification-before-completion`
Description: Add companionMatrix to ecosystem-impact-graph.json with all 9 artifact types. Use exact structure from architecture report Section 5. Validate JSON. Run existing analyzer tests.
```

### Task 3: companion-check.cjs Library (Phase 2)
```
Target Agent: `developer`
Recommended Skills: `tdd`, `verification-before-completion`
Description: Create .claude/lib/creators/companion-check.cjs with checkCompanions, formatCompanionChecklist, loadCompanionMatrix, validateAutoSpawnLimits. Implement all 5 check strategies. Enforce SEC-ICE-001 and SEC-ICE-002. Write 20+ tests. Commit checkpoint after this task.
```

### Task 4: Creator Skill Updates (Phase 3)
```
Target Agent: `developer`
Recommended Skills: `verification-before-completion`
Description: Add Step 0.5 Companion Check to all 9 creator skills. Simplify Step 0 to 3-line reference. Update research-synthesis with Tool Priority section. Update agent-creator Step 2 with MCP tools.
```

### Task 5: artifact-integrator Enhancement (Phase 4)
```
Target Agent: `developer`
Recommended Skills: `verification-before-completion`
Description: Add Step 3.1 Companion Matrix Analysis to artifact-integrator SKILL.md. Include SEC-ICE-002 auto-spawn safety section and deduplication strategy.
```

### Task 6: Workflow Documentation (Phase 5)
```
Target Agent: `technical-writer`
Recommended Skills: `doc-generator`, `writing-skills`, `verification-before-completion`
Description: Create .claude/workflows/core/ecosystem-creation-workflow.md with 6-phase lifecycle, Mermaid sequence diagram, integration points table. Update CLAUDE.md Section 8.6 and @ENTERPRISE_WORKFLOWS.md.
```

### Task 7: Quality Gates (Phase 6)
```
Target Agent: `qa`
Recommended Skills: `tdd`, `verification-before-completion`, `checklist-generator`
Description: Run full test suite (pnpm test), lint (pnpm lint:fix), format (pnpm format). Verify all SEC-ICE-001 and SEC-ICE-002 controls. All must pass with 0 errors.
```

---

## Constitution Checkpoint (Post-Phase 0 Research)

Phase 0 research was conducted by 4 parallel agents (Tasks #38-41). All 4 gates pass:

1. **Research Completeness:** 5 research queries, 50 external sources, research report complete (Task #40)
2. **Technical Feasibility:** Architecture validated, all dependencies available, no blocking issues (Task #38)
3. **Security Review:** 6 findings documented, 2 blocking (SEC-ICE-001, SEC-ICE-002) with mitigations defined (Task #39)
4. **Specification Quality:** Acceptance criteria measurable, edge cases documented, success criteria clear (Task #41)

**Verdict:** ALL 4 GATES PASS. Proceed to implementation.

---

**End of Plan**
