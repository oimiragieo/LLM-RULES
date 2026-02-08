<!-- Agent: planner | Task: #17 | Session: 2026-02-08 -->

# Implementation Plan: Unified Ecosystem Creation Protocol

**Plan ID:** impl-ecosystem-creation-2026-02-08
**Status:** Ready for Execution
**Complexity:** HIGH (cross-cutting changes to hooks, library modules, and creator skills)
**Total Steps:** 15
**Estimated Duration:** 6-8 hours (single developer session)
**ADR:** ADR-104 (Proposed, Phase 1A)

---

## Executive Summary

This plan implements the Unified Ecosystem Creation Protocol designed in Phase 1 (Tasks #14-16). It addresses 3 CRITICAL security vulnerabilities, creates shared creator infrastructure, adds 3 missing creators, and builds an ecosystem-impact-analyzer that replaces advisory cross-triggering with automated impact analysis. The plan is ordered security-first, infrastructure-second, features-third.

## Phase 1 Source Reports

- Architecture: `.claude/context/reports/architecture/ecosystem-creation-protocol-design-2026-02-08.md`
- Security: `.claude/context/reports/security/creator-ecosystem-security-review-2026-02-08.md`
- Complexity: `.claude/context/reports/architecture/creator-skills-complexity-audit-2026-02-08.md`

---

## Implementation Steps

### Step 1: Fix CRITICAL-002 and CRITICAL-003 -- Protect settings.json and agent-registry.json

**Priority:** P0 (Security -- MUST be first)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/routing/unified-creator-guard.cjs` -- Add 2 new entries to CREATOR_CONFIGS array

**Changes:**
1. Add `CREATOR_CONFIGS` entry for `settings.json`:
   ```javascript
   {
     creator: 'hook-creator',
     patterns: [/\.claude[/\\]settings\.json$/i],
     artifactType: 'config:settings',
     primaryFile: 'settings.json',
   }
   ```
2. Add `CREATOR_CONFIGS` entry for `agent-registry.json`:
   ```javascript
   {
     creator: 'agent-creator',
     patterns: [/\.claude[/\\]context[/\\]agent-registry\.json$/i],
     artifactType: 'config:agent-registry',
     primaryFile: 'agent-registry.json',
   }
   ```

**Test Requirements:**
- Test that writes to `.claude/settings.json` are BLOCKED unless hook-creator is active
- Test that writes to `.claude/context/agent-registry.json` are BLOCKED unless agent-creator is active
- Test that existing creator paths still work (regression)

**Dependencies:** None (first step)

**Success Criteria:** `findRequiredCreator('.claude/settings.json')` returns `{ creator: 'hook-creator', artifactType: 'config:settings' }`

---

### Step 2: Fix HIGH-002 -- Add TTL Bounds Checking

**Priority:** P0 (Security)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/routing/unified-creator-guard.cjs` -- Modify DEFAULT_TTL_MS initialization

**Changes:**
Replace:
```javascript
const DEFAULT_TTL_MS = 3 * 60 * 1000;
```
With a bounded version that reads env var with min/max enforcement:
```javascript
const MIN_TTL_MS = 30 * 1000;   // 30 seconds minimum
const MAX_TTL_MS = 10 * 60 * 1000; // 10 minutes maximum
const DEFAULT_TTL_MS = (() => {
  const envVal = Number(process.env.CREATOR_STATE_TTL_MS);
  if (!envVal || !Number.isFinite(envVal) || envVal <= 0) return 3 * 60 * 1000;
  return Math.max(MIN_TTL_MS, Math.min(envVal, MAX_TTL_MS));
})();
```

**Test Requirements:**
- Test default TTL is 180000ms when no env var set
- Test `CREATOR_STATE_TTL_MS=Infinity` clamps to MAX_TTL_MS (600000)
- Test `CREATOR_STATE_TTL_MS=-1` falls back to default
- Test `CREATOR_STATE_TTL_MS=10000` (below min) clamps to MIN_TTL_MS (30000)
- Test `CREATOR_STATE_TTL_MS=120000` (within bounds) is accepted

**Dependencies:** None (can run parallel with Step 1)

**Success Criteria:** No TTL value outside [30s, 10min] range can be set

---

### Step 3: Extend unified-creator-guard for Rules, Commands, and Tools

**Priority:** P1 (Security -- prevents invisible artifacts)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/routing/unified-creator-guard.cjs` -- Add 3 new CREATOR_CONFIGS entries

**Changes:**
Add entries for the 3 unguarded artifact types:
```javascript
{
  creator: 'rule-creator',
  patterns: [/\.claude[/\\]rules[/\\][^/\\]+\.md$/i],
  artifactType: 'rule',
  primaryFile: '*.md',
},
{
  creator: 'command-creator',
  patterns: [/\.claude[/\\]commands[/\\][^/\\]+\.md$/i],
  artifactType: 'command',
  primaryFile: '*.md',
},
{
  creator: 'tool-creator',
  patterns: [/\.claude[/\\]tools[/\\](?!_archive)[^/\\]+[/\\][^/\\]+\.(?:cjs|mjs)$/i],
  artifactType: 'tool',
  primaryFile: '*.cjs|*.mjs',
  excludePatterns: [/\.test\.cjs$/i, /_archive[/\\]/i],
}
```

**IMPORTANT:** Since these creators do not exist yet (created in Steps 10-12), set enforcement to `warn` mode for these 3 types until creators are available. Add a `warnOnlyCreators` array:
```javascript
const WARN_ONLY_CREATORS = ['rule-creator', 'command-creator', 'tool-creator'];
```
When `findRequiredCreator()` returns a creator in `WARN_ONLY_CREATORS`, issue a warning instead of blocking.

**Test Requirements:**
- Test that writing to `.claude/rules/new-rule.md` triggers warn (not block)
- Test that writing to `.claude/commands/new-cmd.md` triggers warn (not block)
- Test that writing to `.claude/tools/cli/new-tool.cjs` triggers warn (not block)
- Test that `_archive/` paths are excluded
- Test that existing 6 creator paths still block (regression)

**Dependencies:** Step 1 (builds on same CREATOR_CONFIGS array)

**Success Criteria:** All 9 artifact types (original 6 + rules + commands + tools) are covered by the guard with appropriate enforcement levels

---

### Step 4: Create creator-commons.cjs -- Shared Creator Infrastructure

**Priority:** P1 (Infrastructure -- foundation for Steps 5-12)
**Target Agent:** `nodejs-pro`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Create:**
- `.claude/lib/creators/creator-commons.cjs` (~200 lines)

**Responsibilities:**
1. **`validatePostCreation(artifactType, artifactPath, options)`** -- Runs a common post-creation checklist:
   - Verify file exists at `artifactPath`
   - Verify provenance header is present
   - Verify memory protocol was followed (learnings.md updated)
   - Return checklist results as structured object

2. **`updateCatalog(catalogPath, entry)`** -- Appends a structured entry to a catalog markdown file:
   - Validates catalog file exists
   - Appends entry in consistent format
   - Uses atomicWriteSync for safety

3. **`queueCrossCreatorReview(artifactType, artifactPath, impactGraph)`** -- Looks up the ecosystem-impact-graph and queues review items:
   - Reads ecosystem-impact-graph.json
   - For each `shouldHave` trigger, evaluates condition
   - Returns list of suggested companion artifacts to create
   - Writes suggestions to integration-queue.jsonl

4. **`validateSchema(artifactType, content)`** -- Validates artifact content against its JSON schema:
   - Loads schema from `.claude/schemas/{artifactType}-definition.schema.json`
   - Validates frontmatter (YAML) against schema
   - Returns validation result with errors

5. **`runIntegrationChecklist(artifactType, artifactPath)`** -- Wraps validate-integration.cjs call:
   - Standardized invocation pattern
   - Returns structured pass/fail results

**Test Requirements:**
- Unit tests for each of the 5 functions
- Test `validatePostCreation` detects missing provenance header
- Test `updateCatalog` appends to existing catalog
- Test `queueCrossCreatorReview` reads impact graph and generates suggestions
- Test `validateSchema` loads and validates against real schemas
- Test error handling for missing files/schemas

**Dependencies:** None (can start in parallel with Steps 1-3)

**Success Criteria:** All 5 functions exported and tested; module loads without errors

---

### Step 5: Create ecosystem-impact-graph.json

**Priority:** P1 (Infrastructure -- required by creator-commons and impact analyzer)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Create:**
- `.claude/context/runtime/ecosystem-impact-graph.json`

**Content:** Use the schema designed in the architecture report (Section 4.2), covering all 9 artifact types with their mustHave, shouldHave, and niceToHave downstream actions. Include:

- **agent** -> mustHave: routing-table, agent-registry, agent-config, CLAUDE.md; shouldHave: skills, hooks, workflows, commands
- **skill** -> mustHave: CLAUDE.md, skill-catalog, agent assignment, skill-index; shouldHave: command, schema
- **hook** -> mustHave: settings.json, @HOOK_AGENT_MAP, hooks/README, test; shouldHave: @ENFORCEMENT_HOOKS
- **workflow** -> mustHave: CLAUDE.md, @WORKFLOW_AGENT_MAP; shouldHave: agent workflow sections, command
- **template** -> mustHave: template-catalog, README, consuming skills
- **schema** -> mustHave: schema-catalog; shouldHave: validator wiring
- **command** -> mustHave: command-catalog, skill link verification
- **rule** -> mustHave: content structure validation
- **tool** -> mustHave: tool-catalog; shouldHave: package.json script, skill wiring

**Test Requirements:**
- Validate JSON is well-formed
- Validate all artifact types are present
- Validate structure matches expected schema (version, artifactTypes, each with mustHave/shouldHave arrays)

**Dependencies:** None

**Success Criteria:** JSON file is valid, all 9 artifact types have entries, and creator-commons.cjs can read it

---

### Step 6: Create ecosystem-impact-analyzer.cjs

**Priority:** P1 (Core feature)
**Target Agent:** `nodejs-pro`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Create:**
- `.claude/lib/creators/ecosystem-impact-analyzer.cjs` (~150 lines)

**Responsibilities:**
1. **`analyzeImpact(artifactType, artifactPath, artifactContent)`** -- Main entry point:
   - Loads ecosystem-impact-graph.json
   - Looks up the artifact type
   - Evaluates each mustHave/shouldHave/niceToHave action
   - For mustHave actions: checks if already completed (e.g., catalog entry exists)
   - Returns structured impact report:
     ```javascript
     {
       artifactType: 'agent',
       artifactPath: '.claude/agents/core/new-agent.md',
       mustHave: [{ action: 'update-routing-table', status: 'pending', target: 'CLAUDE.md' }],
       shouldHave: [{ action: 'review-skills', trigger: 'skill-creator', condition: 'agent needs skills' }],
       niceToHave: [{ action: 'review-template', trigger: 'template-creator' }],
       completionScore: 0.4  // 40% of mustHave done
     }
     ```

2. **`checkMustHaveCompletion(action, artifactPath)`** -- Checks if a specific mustHave action is complete:
   - For catalog updates: checks if artifact name appears in catalog file
   - For registry updates: checks if artifact appears in registry JSON
   - For CLAUDE.md updates: checks if artifact is referenced

3. **`generateImpactSummary(impactReport)`** -- Human-readable markdown summary of impact analysis

**Test Requirements:**
- Test analyzeImpact for agent type returns correct mustHave/shouldHave lists
- Test analyzeImpact for skill type returns command suggestion in shouldHave
- Test checkMustHaveCompletion detects missing catalog entry
- Test checkMustHaveCompletion detects present catalog entry
- Test with missing/malformed impact graph (graceful degradation)

**Dependencies:** Step 5 (needs ecosystem-impact-graph.json)

**Success Criteria:** `analyzeImpact('agent', path)` returns correct impact analysis with mustHave/shouldHave breakdown

---

### Step 7: Add Write-Time Schema Validation to unified-creator-guard

**Priority:** P1 (Security -- addresses HIGH-004)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/routing/unified-creator-guard.cjs` -- Add content validation after path validation passes

**Changes:**
After the existing `findRequiredCreator` + `isCreatorActive` check passes (allowing the write), add a PostToolUse content validation step. This validates that the written content matches the expected schema for that artifact type.

Implementation approach: Add a new function `validateArtifactContent(artifactType, content)`:
1. Load the schema for the artifact type from `.claude/schemas/`
2. For markdown artifacts (skills, agents, workflows): extract YAML frontmatter and validate required fields
3. For JSON artifacts (schemas, registries): validate against JSON schema
4. For CJS artifacts (hooks): validate required exports pattern
5. On validation failure: log warning (not block -- content validation starts in warn mode)

Schema mapping:
```javascript
const SCHEMA_MAP = {
  'skill': 'skill-definition.schema.json',
  'agent': 'agent-definition.schema.json',
  'hook': 'hook-definition.schema.json',
  'workflow': 'workflow-definition.schema.json',
  'schema': null, // self-referential
  'config:settings': null, // no schema yet
  'config:agent-registry': 'agent-config.schema.json',
};
```

**Test Requirements:**
- Test that a skill SKILL.md with valid frontmatter passes validation
- Test that a skill SKILL.md missing required `name` field triggers warning
- Test that a JSON schema with valid structure passes
- Test that validation failure produces a warning (not a block)
- Test that validation is skipped for artifact types with no schema

**Dependencies:** Step 1 (needs CREATOR_CONFIGS structure), Step 4 (uses creator-commons validateSchema)

**Success Criteria:** Artifact content is validated against schemas at write time (warn mode)

---

### Step 8: Create Unified artifact-updater Skill

**Priority:** P1 (Eliminates 5 dead-end updater references)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Create:**
- `.claude/skills/artifact-updater/SKILL.md` (~250 lines)

**NOTE:** This step creates the skill content file only. The skill MUST be integrated via the proper creator workflow. However, since the artifact-updater IS a skill being created, the developer should invoke `Skill({ skill: 'skill-creator' })` to create it properly. If skill-creator cannot be used (circular dependency), create manually and document the integration gap for artifact-integrator to handle.

**Skill Design:**
1. **Input:** artifact type (agent|skill|hook|workflow|template|schema) + artifact path
2. **Determine update scope:** Read existing artifact, diff with intended changes
3. **Delegate to appropriate creator in "update mode":**
   - Set an `UPDATE_MODE=true` context flag
   - Invoke the creator skill with `args: { mode: 'update', existingPath: '...' }`
   - Creator skips creation steps, runs only post-update validation + catalog sync
4. **Post-update validation:**
   - Re-run validatePostCreation from creator-commons
   - Check catalog/registry entries are still correct
   - Update memory (learnings.md)

**Why unified instead of 5 separate updaters:**
- Single skill reduces maintenance burden
- Parameterized by artifact type -- one set of update logic
- Delegates to specialized creators when needed (they know their specific post-steps)
- Eliminates 5 ghost skill references in existing creators

**Test Requirements:**
- Verify skill file structure matches skill-definition.schema.json
- Verify skill has correct frontmatter (name, version, assigned agents)

**Dependencies:** Step 4 (uses creator-commons)

**Success Criteria:** artifact-updater skill exists and is registered in skill-catalog

---

### Step 9: Update Existing Creators to Use creator-commons

**Priority:** P2 (Deduplication -- reduces maintenance burden)
**Target Agent:** `code-simplifier`
**Recommended Skills:** `verification-before-completion`

**Files to Modify:**
- `.claude/skills/skill-creator/SKILL.md` -- Add reference to creator-commons for post-creation validation
- `.claude/skills/agent-creator/SKILL.md` -- Add reference to creator-commons
- `.claude/skills/hook-creator/SKILL.md` -- Add reference to creator-commons
- `.claude/skills/workflow-creator/SKILL.md` -- Add reference to creator-commons
- `.claude/skills/template-creator/SKILL.md` -- Add reference to creator-commons
- `.claude/skills/schema-creator/SKILL.md` -- Add reference to creator-commons

**Changes for each creator:**
1. **Replace Step 0 updater delegation:** Change "delegate to {type}-updater" to "delegate to artifact-updater"
   - Replace: `Skill({ skill: 'agent-updater' })` -> `Skill({ skill: 'artifact-updater', args: 'agent' })`
   - This fixes all 5 dead-end updater references

2. **Add creator-commons reference in Integration Verification step:**
   - Add note: "Use creator-commons.cjs `validatePostCreation()` for standardized validation"
   - Add note: "Use creator-commons.cjs `queueCrossCreatorReview()` for ecosystem impact analysis"

3. **Replace advisory cross-triggering language:**
   - Replace: "consider if companion creators are needed"
   - With: "Run `queueCrossCreatorReview()` from creator-commons to identify required companion artifacts"

**NOTE:** This is an incremental enhancement, NOT a rewrite. The creator SKILL.md files are updated with 3 targeted changes each, not restructured.

**Test Requirements:**
- Verify each modified SKILL.md still has valid frontmatter
- Verify "artifact-updater" replaces all 5 ghost updater references (grep verification)
- Verify "consider if companion" advisory language is replaced (grep verification)

**Dependencies:** Step 4 (creator-commons), Step 8 (artifact-updater)

**Success Criteria:** Zero references to non-existent updater skills; cross-triggering uses creator-commons

---

### Step 10: Create command-creator Skill

**Priority:** P1 (Most impactful missing creator -- 17 commands exist)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Create:**
- `.claude/skills/command-creator/SKILL.md` (~200 lines)

**Skill Design (follows ADR-087 thin-delegator pattern):**
1. **Step 0:** Check if command already exists -> delegate to artifact-updater
2. **Step 1:** Identify backing skill (required -- every command must delegate to a skill)
3. **Step 2:** Generate command file content:
   ```yaml
   ---
   disable-model-invocation: true
   ---
   Invoke the {skill-name} skill and follow it exactly as presented to you
   ```
4. **Step 3:** Write to `.claude/commands/{name}.md`
5. **Step 4 (BLOCKING):** Update command-catalog.md
6. **Step 5 (BLOCKING):** Verify backing skill exists in `.claude/skills/{name}/SKILL.md`
7. **Step 6:** Update CLAUDE.md Section 7.1 (if command is significant)
8. **Step 7:** Update memory (learnings.md)
9. **Step 8:** Run creator-commons `queueCrossCreatorReview()` for ecosystem impact

**Post-Creation Steps:** Uses creator-commons.cjs for validation and catalog update

**Test Requirements:**
- Verify SKILL.md has valid frontmatter
- Verify thin-delegator YAML pattern is documented correctly

**Dependencies:** Step 4 (creator-commons), Step 3 (guard coverage)

**Success Criteria:** command-creator skill exists and can generate valid thin-delegator commands

---

### Step 11: Create rule-creator Skill

**Priority:** P2 (11 rules exist, lower complexity)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Create:**
- `.claude/skills/rule-creator/SKILL.md` (~180 lines)

**Skill Design:**
1. **Step 0:** Check if rule already exists -> delegate to artifact-updater
2. **Step 1:** Determine rule content (headings, actionable items, constraints)
3. **Step 2:** Validate no conflict with existing rules (read all `.claude/rules/*.md`)
4. **Step 3:** Write to `.claude/rules/{name}.md` with provenance header
5. **Step 4:** Validate content structure (must have `#` heading, bullet points)
6. **Step 5:** Update memory (learnings.md)
7. **Step 6:** Run creator-commons `queueCrossCreatorReview()`

**NOTE:** Rules are auto-loaded by Claude Code from `.claude/rules/` -- no catalog/registry update needed. The rule-creator's primary value is content validation and conflict detection.

**Test Requirements:**
- Verify SKILL.md has valid frontmatter
- Verify rule structure validation catches rules without headings

**Dependencies:** Step 4 (creator-commons), Step 3 (guard coverage)

**Success Criteria:** rule-creator skill exists and validates rule structure

---

### Step 12: Create tool-creator Skill

**Priority:** P3 (66 tools exist, most complex missing creator)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Create:**
- `.claude/skills/tool-creator/SKILL.md` (~220 lines)

**Skill Design:**
1. **Step 0:** Check if tool already exists -> delegate to artifact-updater
2. **Step 1:** Determine tool category (cli, analysis, integrations, maintenance, etc.)
3. **Step 2:** Generate tool script skeleton with proper exports
4. **Step 3:** Write to `.claude/tools/{category}/{name}.cjs`
5. **Step 4 (BLOCKING):** Update tool-catalog.md
6. **Step 5:** Add package.json script entry (if CLI-invocable)
7. **Step 6:** Wire to skill (if skill-backed tool)
8. **Step 7:** Update memory (learnings.md)
9. **Step 8:** Run creator-commons `queueCrossCreatorReview()`

**Test Requirements:**
- Verify SKILL.md has valid frontmatter
- Verify tool categories match existing `.claude/tools/` subdirectories

**Dependencies:** Step 4 (creator-commons), Step 3 (guard coverage)

**Success Criteria:** tool-creator skill exists and documents the standard tool creation workflow

---

### Step 13: Integrate ecosystem-impact-analyzer into post-creation-integration Hook

**Priority:** P1 (Wires the analyzer into the existing hook pipeline)
**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/workflow/post-creation-integration.cjs` -- Add ecosystem-impact-analyzer call after creator completion detection

**Changes:**
When `isCreatorCompletion()` detects a creator task completion:
1. Load ecosystem-impact-analyzer.cjs
2. Call `analyzeImpact(artifactType, artifactPath)`
3. Write impact analysis results to integration-queue.jsonl (existing queue)
4. Include `mustHave` completion status in the queue entry
5. If any mustHave items are incomplete, add a warning to the hook output

**Integration pattern (lazy-load, graceful degradation):**
```javascript
let impactAnalyzer;
try {
  impactAnalyzer = require('../../lib/creators/ecosystem-impact-analyzer.cjs');
} catch (_err) {
  impactAnalyzer = null; // Graceful degradation
}

// In isCreatorCompletion handler:
if (impactAnalyzer) {
  const report = impactAnalyzer.analyzeImpact(artifactType, artifactPath);
  if (report.mustHave.some(a => a.status === 'pending')) {
    // Append to integration queue with impact details
  }
}
```

**Test Requirements:**
- Test that creator completion triggers impact analysis
- Test that mustHave items with 'pending' status are queued
- Test graceful degradation when ecosystem-impact-analyzer is not available
- Test that non-creator completions do not trigger analysis

**Dependencies:** Step 6 (ecosystem-impact-analyzer.cjs)

**Success Criteria:** Post-creation hook automatically runs impact analysis and queues integration items

---

### Step 14: Update unified-creator-guard WARN_ONLY_CREATORS After Creator Skills Exist

**Priority:** P2 (Promotes warn to block after creators are available)
**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

**Files to Modify:**
- `.claude/hooks/routing/unified-creator-guard.cjs` -- Remove entries from WARN_ONLY_CREATORS for creators that now exist

**Changes:**
After Steps 10-12 create the 3 new creator skills:
1. Remove `'command-creator'` from `WARN_ONLY_CREATORS` (command-creator now exists)
2. Remove `'rule-creator'` from `WARN_ONLY_CREATORS` (rule-creator now exists)
3. Remove `'tool-creator'` from `WARN_ONLY_CREATORS` (tool-creator now exists)

This promotes enforcement from warn to block for all 9 artifact types.

**Test Requirements:**
- Test that writing to `.claude/rules/test.md` is now BLOCKED (not warned)
- Test that writing to `.claude/commands/test.md` is now BLOCKED (not warned)
- Test that writing to `.claude/tools/cli/test.cjs` is now BLOCKED (not warned)
- Test that all 9 artifact types now block unauthorized writes

**Dependencies:** Steps 10-12 (new creators must exist first)

**Success Criteria:** All 9 artifact types enforced at block level

---

### Step 15: Verification and Commit Checkpoint

**Priority:** P0 (Validation)
**Target Agent:** `qa`
**Recommended Skills:** `tdd`, `verification-before-completion`, `checklist-generator`

**Verification Checklist:**
1. [ ] **Security:** `settings.json` writes blocked without hook-creator active
2. [ ] **Security:** `agent-registry.json` writes blocked without agent-creator active
3. [ ] **Security:** TTL bounds enforced (30s-10min range)
4. [ ] **Guard:** All 9 artifact types covered by unified-creator-guard
5. [ ] **Infrastructure:** creator-commons.cjs exports 5 functions, all tested
6. [ ] **Infrastructure:** ecosystem-impact-graph.json has 9 artifact type entries
7. [ ] **Infrastructure:** ecosystem-impact-analyzer.cjs analyzes impact correctly
8. [ ] **Schema:** Write-time schema validation warns on invalid content
9. [ ] **Updater:** artifact-updater skill exists and is registered
10. [ ] **Creators:** command-creator skill exists (verify with SKILL.md structure)
11. [ ] **Creators:** rule-creator skill exists (verify with SKILL.md structure)
12. [ ] **Creators:** tool-creator skill exists (verify with SKILL.md structure)
13. [ ] **Integration:** post-creation-integration runs impact analysis on creator completion
14. [ ] **Dedup:** Zero references to ghost updater skills (agent-updater, skill-updater, etc.)
15. [ ] **Regression:** Existing 6 creator paths still blocked correctly

**Test Command:** `pnpm test` (all tests must pass)

**Commit Checkpoint:** If all 15 verification items pass, commit with:
```
feat: implement unified ecosystem creation protocol (ADR-104)

- Fix CRITICAL-002/003: Protect settings.json and agent-registry.json
- Fix HIGH-002: Add TTL bounds checking (30s-10min)
- Add creator-commons.cjs shared infrastructure
- Add ecosystem-impact-graph.json and analyzer
- Add write-time schema validation (warn mode)
- Create 3 missing creators: command, rule, tool
- Create unified artifact-updater skill
- Extend unified-creator-guard to 9 artifact types
- Replace 5 ghost updater references with artifact-updater
```

**Dependencies:** Steps 1-14

**Success Criteria:** All tests pass, commit created

---

## Dependency Graph

```
Step 1 (protect settings/registry) ----+
Step 2 (TTL bounds) ---+                |
                       |                |
                       v                v
Step 3 (extend guard) <--- needs CREATOR_CONFIGS from Step 1
                       |
Step 4 (creator-commons) ------ parallel ------+
Step 5 (impact-graph) ------- parallel ------+  |
                                              |  |
                                              v  v
Step 6 (impact-analyzer) <--- needs Step 5    |
Step 7 (schema validation) <--- needs Step 4  |
                                              |
Step 8 (artifact-updater) <--- needs Step 4   |
                                              |
Step 9 (update existing creators) <--- needs Steps 4, 8
                                              |
Step 10 (command-creator) <--- needs Steps 3, 4
Step 11 (rule-creator) <--- needs Steps 3, 4
Step 12 (tool-creator) <--- needs Steps 3, 4
                                              |
Step 13 (integrate analyzer) <--- needs Step 6
Step 14 (promote warn to block) <--- needs Steps 10-12
                                              |
Step 15 (verify + commit) <--- needs ALL
```

**Parallelizable groups:**
- Group A (parallel): Steps 1, 2, 4, 5
- Group B (after A): Steps 3, 6, 7, 8
- Group C (after B): Steps 9, 10, 11, 12, 13
- Group D (after C): Steps 14, 15

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Guard changes break existing creator workflows | HIGH | MEDIUM | Run regression tests after Steps 1-3; test all 6 existing creator paths |
| Schema validation produces false positives | MEDIUM | MEDIUM | Start in warn mode (not block); tune before promoting to block |
| creator-commons introduces coupling | MEDIUM | LOW | Keep commons functions stateless; use dependency injection for file paths |
| Impact graph becomes stale | LOW | MEDIUM | Graph is declarative JSON; validate on every read; log unknown artifact types |
| New creators conflict with existing manual creation patterns | MEDIUM | LOW | WARN_ONLY_CREATORS pattern allows gradual enforcement |
| Circular dependency: creating skills via skill-creator | LOW | LOW | Document manual creation as fallback for bootstrap scenarios |

---

## Files Created/Modified Summary

**New files (8):**
1. `.claude/lib/creators/creator-commons.cjs` (~200 lines)
2. `.claude/lib/creators/ecosystem-impact-analyzer.cjs` (~150 lines)
3. `.claude/context/runtime/ecosystem-impact-graph.json` (~100 lines)
4. `.claude/skills/artifact-updater/SKILL.md` (~250 lines)
5. `.claude/skills/command-creator/SKILL.md` (~200 lines)
6. `.claude/skills/rule-creator/SKILL.md` (~180 lines)
7. `.claude/skills/tool-creator/SKILL.md` (~220 lines)
8. Tests: `tests/lib/creators/creator-commons.test.cjs` + `ecosystem-impact-analyzer.test.cjs`

**Modified files (8):**
1. `.claude/hooks/routing/unified-creator-guard.cjs` (Steps 1, 2, 3, 7, 14)
2. `.claude/hooks/workflow/post-creation-integration.cjs` (Step 13)
3. `.claude/skills/skill-creator/SKILL.md` (Step 9 -- updater reference + commons)
4. `.claude/skills/agent-creator/SKILL.md` (Step 9)
5. `.claude/skills/hook-creator/SKILL.md` (Step 9)
6. `.claude/skills/workflow-creator/SKILL.md` (Step 9)
7. `.claude/skills/template-creator/SKILL.md` (Step 9)
8. `.claude/skills/schema-creator/SKILL.md` (Step 9)

**Total: 16 files (8 new + 8 modified) -- COMMIT CHECKPOINT REQUIRED (>10 files)**

---

## Commit Checkpoint Pattern

Since this plan modifies 16 files, a commit checkpoint is REQUIRED after Phase 1 (Steps 1-7, security + infrastructure) before proceeding to Phase 2 (Steps 8-14, features).

**Checkpoint 1 (after Step 7):**
```
checkpoint: security fixes + shared infrastructure for ecosystem protocol
```

**Checkpoint 2 (after Step 14):**
```
checkpoint: new creators + analyzer integration complete
```

**Final commit (Step 15):**
```
feat: implement unified ecosystem creation protocol (ADR-104)
```

---

## Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction

**Tasks:**
1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected
- ADR-104 status updated from "Proposed" to "Accepted"
