<!-- Agent: planner | Task: #64 | Session: 2026-02-07 -->

# TDD Implementation Plan: Template System Overhaul

**Version:** 1.0.0
**Date:** 2026-02-07
**Status:** Ready for Implementation
**Complexity:** HIGH (multi-file, cross-cutting, 5 components + 3 security fixes)
**Architecture:** `.claude/context/plans/template-overhaul-architecture-2026-02-07.md` (ADR-085)
**Security Review:** `.claude/context/reports/security/template-system-security-review-2026-02-07.md`

---

## Executive Summary

This plan implements the template system overhaul designed by the architect (Task #61), incorporating security fixes mandated by the security review (Task #63) and content upgrades identified by the researcher (Task #62). The plan follows strict TDD: every code change has RED tests written first, then GREEN implementation, then REFACTOR. Security fixes (SEC-TMPL-001, 002, 004) are Phase 1 -- before any template changes.

**Total:** 7 developer tasks across 5 phases, ~12-16 hours estimated effort.

---

## Phase Overview

| Phase | Name | Tasks | Est. Hours | Dependencies |
|-------|------|-------|------------|--------------|
| 1 | Security Hardening (MUST-FIX) | 1 task (3 fixes) | 2-3h | None (FIRST) |
| 2 | Spawn Template Resolver | 1 task | 2-3h | Phase 1 |
| 3 | Dead Template Cleanup + Archive | 1 task | 1-2h | None (parallel with Phase 2) |
| 4 | Template Upgrades + Catalog | 2 tasks | 3-4h | Phase 3 |
| 5 | Documentation + Creator Skill Fix | 2 tasks | 2-3h | Phase 3, 4 |
| POST | Code Review + QA | Pipeline | 1-2h | All phases |

---

## Phase 1: Security Hardening (BLOCKING -- Before All Other Work)

**Purpose:** Fix the 3 security findings that must be resolved before or during implementation.
**Parallel OK:** No. This phase blocks all subsequent phases.

### Task 1.1: Fix SEC-TMPL-001, SEC-TMPL-002, SEC-TMPL-004

**Estimated effort:** 2-3 hours
**Agent:** developer (TDD mode)

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/lib/spawn/prompt-assembler-security.test.cjs` | NEW | RED tests for SEC-TMPL-001 (path traversal) |
| `tests/hooks/spawn-prompt-validator-security.test.cjs` | NEW | RED tests for SEC-TMPL-002 (orchestrator bypass) |
| `tests/lib/spawn/prompt-factory-security.test.cjs` | NEW | RED tests for SEC-TMPL-004 (template injection) |
| `.claude/lib/spawn/prompt-assembler.cjs` | MODIFY | GREEN fix for SEC-TMPL-001 (lines 90-101) |
| `.claude/hooks/safety/spawn-prompt-validator.cjs` | MODIFY | GREEN fix for SEC-TMPL-002 (lines 356-368) |
| `.claude/lib/spawn/prompt-factory.cjs` | MODIFY | GREEN fix for SEC-TMPL-004 (lines 51-57) |

#### Tests to Write (RED Phase -- All Must Fail Initially)

**Test File 1: `tests/lib/spawn/prompt-assembler-security.test.cjs`**

```
SEC-TMPL-001: Path Traversal in getPresetRuleSnippet()

Test 1: "getPresetRuleSnippet returns empty string when ruleSnippetPath escapes PROJECT_ROOT via ../"
  - Setup: Create temp presets.json with ruleSnippetPath: "../../etc/passwd"
  - Expected: Returns '' (empty string)
  - Current behavior: Reads the file content (VULNERABLE)

Test 2: "getPresetRuleSnippet returns empty string for absolute path outside project"
  - Setup: ruleSnippetPath: "C:\\Windows\\System32\\drivers\\etc\\hosts" (or /etc/passwd)
  - Expected: Returns '' (empty string)

Test 3: "getPresetRuleSnippet returns content for valid path within project root"
  - Setup: ruleSnippetPath: ".claude/rules/coding-style.md" (exists)
  - Expected: Returns file content (non-empty string)

Test 4: "getPresetRuleSnippet returns empty string when snippetPath resolves to PROJECT_ROOT exactly"
  - Setup: ruleSnippetPath: "." (resolves to project root itself, not inside it)
  - Expected: Returns '' (edge case: path must be INSIDE project root, not equal to it)
```

**Test File 2: `tests/hooks/spawn-prompt-validator-security.test.cjs`**

```
SEC-TMPL-002: Orchestrator Spawn Validation Bypass

Test 1: "isOrchestratorSpawn returns false when description mentions orchestrator but subagent_type is developer"
  - Setup: { subagent_type: "developer", description: "Fix master-orchestrator bug in routing" }
  - Expected: false
  - Current behavior: true (VULNERABLE -- partial string match on description)

Test 2: "isOrchestratorSpawn returns true for exact subagent_type match"
  - Setup: { subagent_type: "master-orchestrator" }
  - Expected: true

Test 3: "isOrchestratorSpawn returns false for partial subagent_type match"
  - Setup: { subagent_type: "master-orchestrator-v2" }
  - Expected: false (exact match only)

Test 4: "isOrchestratorSpawn returns true for all known orchestrator types"
  - Setup: Loop through master-orchestrator, evolution-orchestrator, swarm-coordinator, party-orchestrator
  - Expected: true for each

Test 5: "isOrchestratorSpawn handles case insensitivity"
  - Setup: { subagent_type: "Master-Orchestrator" }
  - Expected: true (case-insensitive match)

Test 6: "isOrchestratorSpawn handles leading/trailing whitespace"
  - Setup: { subagent_type: "  master-orchestrator  " }
  - Expected: true (trimmed match)
```

**Test File 3: `tests/lib/spawn/prompt-factory-security.test.cjs`**

```
SEC-TMPL-004: Template Placeholder Injection

Test 1: "buildContextModePrompt sanitizes nested template placeholders in tool names"
  - Setup: activeToolNames containing "Read, {{available_tools}}, Write"
  - Expected: Substituted value contains "{ {available_tools} }" (spaced braces)
  - Current behavior: "{{available_tools}}" re-substituted (VULNERABLE)

Test 2: "buildContextModePrompt sanitizes nested template placeholders in context prompt"
  - Setup: contextPrompt containing "Use {{mode_system_prompts}} injection"
  - Expected: "{ {mode_system_prompts} }" in output (spaced braces)

Test 3: "buildContextModePrompt preserves normal content without double braces"
  - Setup: contextPrompt containing "Normal text with {single} braces"
  - Expected: Unchanged (single braces preserved)

Test 4: "buildContextModePrompt handles empty/null inputs gracefully"
  - Setup: contextName: null, modeNames: []
  - Expected: No errors, returns empty/default promptFragment
```

#### Implementation Steps (GREEN Phase)

**Fix 1: SEC-TMPL-001 (prompt-assembler.cjs, lines 90-101)**

Add path containment validation after `path.resolve()`:

```javascript
function getPresetRuleSnippet(presetId, projectRoot = PROJECT_ROOT) {
  if (!presetId) return '';
  const presets = loadPresets(projectRoot);
  const preset = presets[presetId];
  if (!preset?.ruleSnippetPath) return '';
  try {
    const snippetPath = path.resolve(projectRoot, preset.ruleSnippetPath);
    const normalizedRoot = path.resolve(projectRoot);
    // SEC-TMPL-001: Path containment - snippet must be inside project root
    if (!snippetPath.startsWith(normalizedRoot + path.sep)) return '';
    if (!fs.existsSync(snippetPath)) return '';
    return fs.readFileSync(snippetPath, 'utf-8').trim();
  } catch (_e) {
    return '';
  }
}
```

**Fix 2: SEC-TMPL-002 (spawn-prompt-validator.cjs, lines 356-368)**

Change from partial string match on description to exact subagent_type match:

```javascript
function isOrchestratorSpawn(toolInput) {
  const orchestratorTypes = [
    'master-orchestrator',
    'evolution-orchestrator',
    'swarm-coordinator',
    'party-orchestrator',
  ];
  // SEC-TMPL-002: Exact subagent_type match only (not partial description match)
  const subagentType = (toolInput.subagent_type || '').toLowerCase().trim();
  return orchestratorTypes.includes(subagentType);
}
```

**Fix 3: SEC-TMPL-004 (prompt-factory.cjs, lines 51-57)**

Add sanitization function to prevent nested template injection:

```javascript
function sanitizeSubstitutionValue(value) {
  return String(value)
    .replace(/\{\{/g, '{ {')  // Prevent nested template injection
    .replace(/\}\}/g, '} }');
}

// In buildContextModePrompt, before substitution:
fragmentBody = fragmentBody.replace(
  /\{\{\s*available_tools\s*\}\}/gi,
  sanitizeSubstitutionValue(activeToolNames.join(', '))
);
fragmentBody = fragmentBody.replace(
  /\{\{\s*context_system_prompt\s*\}\}/gi,
  sanitizeSubstitutionValue(contextPrompt)
);
fragmentBody = fragmentBody.replace(
  /\{\{\s*mode_system_prompts\s*\}\}/gi,
  sanitizeSubstitutionValue(modePrompts)
);
```

#### Verification Criteria

```bash
# All 3 new test files must pass
node --test tests/lib/spawn/prompt-assembler-security.test.cjs
node --test tests/hooks/spawn-prompt-validator-security.test.cjs
node --test tests/lib/spawn/prompt-factory-security.test.cjs

# Existing tests must not regress
node --test tests/lib/spawn/prompt-assembler.test.cjs
node --test tests/hooks/spawn-prompt-validator.test.cjs
node --test tests/lib/spawn/prompt-factory.test.cjs

# Lint must pass
npx eslint .claude/lib/spawn/prompt-assembler.cjs .claude/hooks/safety/spawn-prompt-validator.cjs .claude/lib/spawn/prompt-factory.cjs
```

**Success Criteria:**
- All 14+ new security tests pass (GREEN)
- All existing tests still pass (no regressions)
- ESLint clean on all modified files
- Path traversal via `../` returns empty string
- Orchestrator bypass via description no longer works
- Nested `{{}}` in substitution values are defanged

---

## Phase 2: Spawn Template Resolver

**Purpose:** Create the advisory spawn template resolver module.
**Dependencies:** Phase 1 complete (security fixes in place).
**Parallel OK:** No (depends on Phase 1).

### Task 2.1: Create spawn-template-resolver.cjs with Full TDD

**Estimated effort:** 2-3 hours
**Agent:** developer (TDD mode)

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/lib/spawn/spawn-template-resolver.test.cjs` | NEW | RED tests for resolver logic |
| `.claude/lib/spawn/spawn-template-resolver.cjs` | NEW | GREEN implementation |

#### Tests to Write (RED Phase)

**Test File: `tests/lib/spawn/spawn-template-resolver.test.cjs`**

```
Template Selection Priority Tests:

Test 1: "resolveSpawnTemplate returns explicit override when templateName provided and file exists"
  - Setup: resolveSpawnTemplate('developer', { templateName: 'subordinate-once.md' })
  - Expected: { templateName: 'subordinate-once.md', reason: 'explicit_override' }

Test 2: "resolveSpawnTemplate returns universal-agent-spawn.md when templateName provided but file missing"
  - Setup: resolveSpawnTemplate('developer', { templateName: 'nonexistent.md' })
  - Expected: { templateName: 'universal-agent-spawn.md', reason: 'default' }
  - Note: Falls through to default when explicit override file doesn't exist

Test 3: "resolveSpawnTemplate returns subordinate-once.md for oneShot mode"
  - Setup: resolveSpawnTemplate('developer', { oneShot: true })
  - Expected: { templateName: 'subordinate-once.md', reason: 'one_shot_mode' }

Test 4: "resolveSpawnTemplate returns orchestrator-spawn.md for known orchestrator types"
  - Setup: Loop through ['router', 'master-orchestrator', 'evolution-orchestrator', 'swarm-coordinator', 'party-orchestrator']
  - Expected: { templateName: 'orchestrator-spawn.md', reason: 'orchestrator_agent' }

Test 5: "resolveSpawnTemplate returns orchestrator-spawn.md for category=orchestrator"
  - Setup: resolveSpawnTemplate('custom-orch', { category: 'orchestrator' })
  - Expected: { templateName: 'orchestrator-spawn.md', reason: 'orchestrator_agent' }

Test 6: "resolveSpawnTemplate returns agent-identity-integration.md for hasIdentity=true"
  - Setup: resolveSpawnTemplate('developer', { hasIdentity: true })
  - Expected: { templateName: 'agent-identity-integration.md', reason: 'identity_frontmatter' }

Test 7: "resolveSpawnTemplate returns universal-agent-spawn.md as default"
  - Setup: resolveSpawnTemplate('developer')
  - Expected: { templateName: 'universal-agent-spawn.md', reason: 'default' }

Test 8: "resolveSpawnTemplate priority: oneShot beats orchestrator"
  - Setup: resolveSpawnTemplate('master-orchestrator', { oneShot: true })
  - Expected: { templateName: 'subordinate-once.md', reason: 'one_shot_mode' }

Test 9: "resolveSpawnTemplate priority: orchestrator beats identity"
  - Setup: resolveSpawnTemplate('master-orchestrator', { hasIdentity: true })
  - Expected: { templateName: 'orchestrator-spawn.md', reason: 'orchestrator_agent' }

Test 10: "resolveSpawnTemplate handles null/undefined agentType"
  - Setup: resolveSpawnTemplate(null)
  - Expected: { templateName: 'universal-agent-spawn.md', reason: 'default' }

Test 11: "resolveSpawnTemplate normalizes agentType case"
  - Setup: resolveSpawnTemplate('Master-Orchestrator')
  - Expected: { templateName: 'orchestrator-spawn.md', reason: 'orchestrator_agent' }

Test 12: "resolveSpawnTemplate templatePath points to correct directory"
  - Setup: result = resolveSpawnTemplate('developer')
  - Expected: result.templatePath contains 'templates/spawn/universal-agent-spawn.md'

Test 13: "ORCHESTRATOR_IDS export contains all expected identifiers"
  - Setup: Import ORCHESTRATOR_IDS from module
  - Expected: Set contains exactly ['router', 'master-orchestrator', 'evolution-orchestrator', 'swarm-coordinator', 'party-orchestrator']
```

#### Implementation Steps (GREEN Phase)

Implement the module exactly as designed in the architecture doc (Section 3.2):
- `resolveSpawnTemplate(agentType, options)` function
- Priority chain: explicit override > oneShot > orchestrator > identity > default
- Export `{ resolveSpawnTemplate, ORCHESTRATOR_IDS }`

#### Verification Criteria

```bash
# New tests must pass
node --test tests/lib/spawn/spawn-template-resolver.test.cjs

# Module loads without error
node -e "const m = require('./.claude/lib/spawn/spawn-template-resolver.cjs'); console.log(m.resolveSpawnTemplate('developer'));"

# Lint clean
npx eslint .claude/lib/spawn/spawn-template-resolver.cjs
```

**Success Criteria:**
- All 13 tests pass
- Module exports `resolveSpawnTemplate` and `ORCHESTRATOR_IDS`
- No external dependencies (only `fs`, `path`)
- Lint clean

---

## Phase 3: Dead Template Cleanup + Archive

**Purpose:** Archive 14 dead templates, delete 2, create archive README.
**Dependencies:** None (can run parallel with Phase 2).
**Parallel OK with Phase 2:** Yes.

### Task 3.1: Archive, Delete, and Create Archive Index

**Estimated effort:** 1-2 hours
**Agent:** developer

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/templates/_archive/README.md` | NEW | Archive index documenting all archived templates |
| `.claude/templates/_archive/spawn/bash-safe-background.md` | ARCHIVE | git mv from spawn/ |
| `.claude/templates/_archive/spawn/router-task-template.md` | ARCHIVE | git mv from spawn/ |
| `.claude/templates/_archive/claude-md-template.md` | ARCHIVE | git mv from root |
| `.claude/templates/_archive/project-brief.md` | ARCHIVE | git mv from root |
| `.claude/templates/_archive/prd.md` | ARCHIVE | git mv from root |
| `.claude/templates/_archive/ui-spec.md` | ARCHIVE | git mv from root |
| `.claude/templates/_archive/planning/findings.md` | ARCHIVE | git mv from planning/ |
| `.claude/templates/_archive/planning/progress.md` | ARCHIVE | git mv from planning/ |
| `.claude/templates/_archive/planning/task_plan.md` | ARCHIVE | git mv from planning/ |
| `.claude/templates/_archive/examples/example-adr-050.md` | ARCHIVE | git mv from examples/ |
| `.claude/templates/_archive/examples/example-specification.md` | ARCHIVE | git mv from examples/ |
| `.claude/templates/_archive/code-styles/dart.md` | ARCHIVE | git mv from code-styles/ |
| `.claude/templates/_archive/code-styles/csharp.md` | ARCHIVE | git mv from code-styles/ |
| `.claude/templates/_archive/code-styles/go.md` | ARCHIVE | git mv from code-styles/ |
| `.claude/templates/code-styles/html-css.md` | DELETE | git rm (no value) |
| `.claude/templates/code-styles/general.md` | DELETE | git rm (overlap with rules/) |

#### Pre-Flight Checks (BLOCKING)

Before archiving, verify no active references exist for archive candidates:

```bash
# For each archive candidate, verify zero active references
rg "bash-safe-background" --glob "!_archive/**" --glob "!*.md" .claude/
rg "router-task-template" --glob "!_archive/**" --glob "!*.md" .claude/
# ... (repeat for all 14)
```

#### MUST NOT Archive (Security Review Conditions)

- `security-design-checklist.md` -- MUST KEEP (STRIDE checklist, security-architect dependency)
- `error-recovery-template.md` -- MUST KEEP (error recovery patterns, hook development reference)

#### Implementation Steps

1. Create archive directory structure:
   ```bash
   mkdir -p .claude/templates/_archive/spawn
   mkdir -p .claude/templates/_archive/planning
   mkdir -p .claude/templates/_archive/examples
   mkdir -p .claude/templates/_archive/code-styles
   ```

2. Archive 14 templates via `git mv` (preserves history)

3. Delete 2 templates via `git rm`

4. Create `.claude/templates/_archive/README.md` with:
   - List of all archived templates with original paths
   - Reason for archival per template
   - Restoration instructions: `git mv .claude/templates/_archive/<path> .claude/templates/<path>`
   - Date of archival

5. Remove empty directories left behind (planning/, examples/)

#### Verification Criteria

```bash
# All 14 archived templates exist in _archive/
test -f .claude/templates/_archive/spawn/bash-safe-background.md && echo "OK"
test -f .claude/templates/_archive/code-styles/dart.md && echo "OK"
# ... (verify all 14)

# 2 deleted templates are gone
test ! -f .claude/templates/code-styles/html-css.md && echo "OK"
test ! -f .claude/templates/code-styles/general.md && echo "OK"

# Security-protected templates still exist
test -f .claude/templates/security-design-checklist.md && echo "OK"
test -f .claude/templates/error-recovery-template.md && echo "OK"

# Archive README exists
test -f .claude/templates/_archive/README.md && echo "OK"

# No broken references in active code
rg "code-styles/html-css" --glob "!_archive/**" .claude/ && echo "BROKEN REF!" || echo "OK"
rg "code-styles/general.md" --glob "!_archive/**" .claude/ && echo "BROKEN REF!" || echo "OK"
```

**Success Criteria:**
- 14 templates archived to `_archive/` via `git mv`
- 2 templates deleted via `git rm`
- Archive README with restoration instructions
- `security-design-checklist.md` and `error-recovery-template.md` NOT archived
- No broken references in active codebase

---

## Phase 4: Template Upgrades + Catalog

**Purpose:** Upgrade 3 templates based on researcher findings; create template catalog.
**Dependencies:** Phase 3 complete (need final template inventory).

### Task 4.1: Upgrade 3 Templates (ADR, Spec Merge, Python)

**Estimated effort:** 2 hours
**Agent:** developer

#### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/templates/adr-template.md` | MODIFY | Add MADR variant fields (status, deciders, date) |
| `.claude/templates/specification-template.md` | MODIFY | Merge spec-template.md content + add deployment section |
| `.claude/templates/spec-template.md` | ARCHIVE | git mv to _archive/ (merged into specification-template.md) |
| `.claude/templates/code-styles/python.md` | MODIFY | Upgrade with Python 3.12+ patterns, type hints, ruff |
| `.claude/templates/test-plan.md` | MODIFY | Add agile test plan variant alongside IEEE 829 |
| `.claude/templates/security-design-checklist.md` | MODIFY | Add DREAD scoring + ASVS references |
| `.claude/templates/reports/*.md` | MODIFY | Add executive summary section to all 5 report templates |

#### Implementation Steps

**Upgrade 1: ADR Template (MADR Enhancement)**

Add to YAML frontmatter:
```yaml
status: {{STATUS:proposed}}  # proposed | accepted | deprecated | superseded
deciders: [{{DECIDERS}}]     # List of decision participants
date: {{DATE}}               # ISO 8601 date
superseded_by: {{SUPERSEDED_BY:none}}  # ADR ID if superseded
```

**Upgrade 2: Spec Template Merge**

- Read `spec-template.md` for any unique content not in `specification-template.md`
- Merge unique sections into `specification-template.md`
- Add deployment section:
  ```markdown
  ## 12. Deployment Requirements

  ### 12.1 Deployment Strategy
  {{DEPLOYMENT_STRATEGY}}

  ### 12.2 Environment Requirements
  {{ENVIRONMENT_REQUIREMENTS}}

  ### 12.3 Rollback Procedure
  {{ROLLBACK_PROCEDURE}}
  ```
- Archive `spec-template.md` to `_archive/`

**Upgrade 3: Python Code Style**

Update with:
- Python 3.12+ patterns (match statements, type parameter syntax)
- Modern type hints (PEP 695 type aliases, PEP 604 union syntax)
- Ruff linter configuration references
- Docstring format (Google style)

**Upgrade 4: Test Plan (Agile Variant)**

Add alongside existing IEEE 829 content:
```markdown
## Agile Test Plan Variant

### User Story Testing
| Story ID | Test Scenario | Expected Result | Priority |
|----------|--------------|-----------------|----------|
| {{STORY_ID}} | {{SCENARIO}} | {{EXPECTED}} | {{PRIORITY}} |

### Sprint Test Summary
- Sprint: {{SPRINT_NUMBER}}
- Stories Tested: {{STORIES_TESTED}}
- Defects Found: {{DEFECTS_FOUND}}
```

**Upgrade 5: Security Checklist (DREAD + ASVS)**

Add DREAD scoring table:
```markdown
### DREAD Risk Assessment

| Threat | D | R | E | A | D | Total | Priority |
|--------|---|---|---|---|---|-------|----------|
| {{THREAT}} | {{DAMAGE}} | {{REPRODUCIBILITY}} | {{EXPLOITABILITY}} | {{AFFECTED_USERS}} | {{DISCOVERABILITY}} | {{TOTAL}} | {{PRIORITY}} |

### ASVS References
- V1: Architecture, Design and Threat Modeling
- V2: Authentication
- V3: Session Management
...
```

**Upgrade 6: Report Templates (Executive Summary)**

Add to each of the 5 report templates after the provenance header:
```markdown
## Executive Summary

{{EXECUTIVE_SUMMARY}}

**Key Findings:** {{KEY_FINDINGS_COUNT}} findings ({{CRITICAL_COUNT}} critical, {{HIGH_COUNT}} high)
**Recommendation:** {{RECOMMENDATION}}
```

#### Verification Criteria

```bash
# Verify MADR fields in ADR template
rg "status:.*proposed" .claude/templates/adr-template.md && echo "OK"
rg "deciders:" .claude/templates/adr-template.md && echo "OK"

# Verify spec-template.md archived
test -f .claude/templates/_archive/spec-template.md && echo "OK"
test ! -f .claude/templates/spec-template.md && echo "OK"

# Verify deployment section in specification-template.md
rg "Deployment Requirements" .claude/templates/specification-template.md && echo "OK"

# Verify Python 3.12+ content
rg "3\.12\|ruff\|PEP 695" .claude/templates/code-styles/python.md && echo "OK"

# Verify DREAD scoring in security checklist
rg "DREAD" .claude/templates/security-design-checklist.md && echo "OK"

# Verify executive summary in all report templates
for f in .claude/templates/reports/*.md; do rg "Executive Summary" "$f" || echo "MISSING: $f"; done
```

**Success Criteria:**
- ADR template has MADR frontmatter fields
- spec-template.md merged into specification-template.md and archived
- specification-template.md has deployment section
- Python style guide updated for 3.12+
- Test plan has agile variant section
- Security checklist has DREAD scoring + ASVS
- All 5 report templates have executive summary section

---

### Task 4.2: Create Template Catalog

**Estimated effort:** 1-2 hours
**Agent:** developer

#### Files to Create

| File | Action | Purpose |
|------|--------|---------|
| `.claude/context/artifacts/catalogs/template-catalog.md` | NEW | Full template catalog with all active templates |

#### Implementation Steps

Create the catalog following the schema defined in architecture doc Section 5.2. The catalog must contain entries for all ~27 active templates organized by category:

1. **Spawn Templates** (4): universal-agent-spawn, orchestrator-spawn, subordinate-once, agent-identity-integration
2. **Creator Templates** (4): agent-template, agent-context-template, skill-template, workflow-template
3. **Document Templates** (7): adr-template, plan-template, specification-template, tasks-template, architecture, security-design-checklist, test-plan, error-recovery-template
4. **Report Templates** (5): audit-report-template, implementation-report-template, plan-template (reports), reflection-report-template, research-report-template
5. **Code Style Templates** (3): typescript, javascript, python
6. **Utility Templates** (2): continuation, agent-skill-invocation-section

Each entry must include:
- Name, Path, Category, Status
- Used By Agents / Used By Skills
- Placeholder count
- Last Updated date
- Purpose (one-line)
- Usage instructions

#### Verification Criteria

```bash
# Catalog file exists
test -f .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"

# Contains all major categories
rg "## Spawn Templates" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
rg "## Creator Templates" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
rg "## Document Templates" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
rg "## Report Templates" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
rg "## Code Style Templates" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"

# Contains key templates
rg "universal-agent-spawn" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
rg "security-design-checklist" .claude/context/artifacts/catalogs/template-catalog.md && echo "OK"
```

**Success Criteria:**
- Catalog file created with structured entries for all ~27 active templates
- All categories represented
- Agent assignments documented per architecture Section 5.4
- Relative paths used (no absolute paths -- SEC-TMPL-006 compliance)

---

## Phase 5: Documentation + Creator Skill Fix

**Purpose:** Update README, fix template-creator SKILL.md phantom references.
**Dependencies:** Phase 3 (cleanup) and Phase 4 (upgrades/catalog).

### Task 5.1: Fix Template-Creator Skill (SKILL.md)

**Estimated effort:** 1 hour
**Agent:** developer

#### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/skills/template-creator/SKILL.md` | MODIFY | Fix phantom refs, add categories, assign agents |

#### Changes Required

1. **Fix Template Types table (line 76-83):**
   - Remove `hooks/`, `code/`, `schemas/` rows (directories don't exist)
   - Add `Spawn` row: `.claude/templates/spawn/` (4 templates)
   - Add `Report` row: `.claude/templates/reports/` (5 templates)
   - Add `Code Style` row: `.claude/templates/code-styles/` (3 templates)
   - Add `Document` row: `.claude/templates/` root (8 templates)

2. **Fix assigned_agents (line 12):**
   - Change from `assigned_agents: []` to `assigned_agents: [planner, architect, developer]`

3. **Fix Output Location Rules (lines 793-800):**
   - Remove `hooks/`, `code/`, `schemas/` entries
   - Add `spawn/`, `reports/`, `code-styles/` entries
   - Add note: "Future template categories (hooks, code, schemas) can be created when demand arises"

4. **Add catalog reference:**
   - Add reference to `.claude/context/artifacts/catalogs/template-catalog.md`

#### Verification Criteria

```bash
# No phantom directory references
rg "templates/hooks/" .claude/skills/template-creator/SKILL.md && echo "PHANTOM!" || echo "OK"
rg "templates/code/" .claude/skills/template-creator/SKILL.md && echo "PHANTOM!" || echo "OK"
rg "templates/schemas/" .claude/skills/template-creator/SKILL.md && echo "PHANTOM!" || echo "OK"

# Has assigned agents
rg "assigned_agents:.*planner" .claude/skills/template-creator/SKILL.md && echo "OK"

# Has spawn category
rg "Spawn.*templates/spawn" .claude/skills/template-creator/SKILL.md && echo "OK"
```

**Success Criteria:**
- No references to non-existent directories (hooks/, code/, schemas/)
- Agents assigned: planner, architect, developer
- All active template categories documented
- Catalog cross-reference added

---

### Task 5.2: Update Templates README

**Estimated effort:** 1-2 hours
**Agent:** developer

#### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `.claude/templates/README.md` | MODIFY | Add spawn/report sections, update tables, add archive docs |

#### Changes Required

1. **Add Spawn Templates section** after Workflow Templates:
   - Document all 4 active spawn templates
   - Purpose, file path, usage for each
   - Link to template-catalog.md for full details

2. **Add Report Templates section:**
   - Document all 5 report templates
   - Purpose, agent assignments, usage

3. **Update Code Style Templates section:**
   - Remove archived/deleted entries (dart, csharp, go, html-css, general)
   - Keep only: typescript, javascript, python
   - Note upgrades applied

4. **Update Quick Reference table:**
   - Add Spawn row
   - Add Report row
   - Update Code Style row (3 templates, not 8)
   - Remove Hook/Code/Schema rows or mark as "Future"

5. **Update Creator Skills table:**
   - Add workflow-creator, hook-creator, template-creator to existing 2 entries

6. **Add Archive Documentation section:**
   - Purpose of `_archive/` directory
   - How to restore: `git mv .claude/templates/_archive/<path> .claude/templates/<path>`
   - Link to `_archive/README.md`

7. **Add cross-reference to template-catalog.md:**
   ```markdown
   ## Full Template Catalog

   For complete template coverage with agent assignments and detailed metadata:
   See `.claude/context/artifacts/catalogs/template-catalog.md`
   ```

#### Verification Criteria

```bash
# Has spawn section
rg "## Spawn Templates" .claude/templates/README.md && echo "OK"

# Has report section
rg "## Report Templates" .claude/templates/README.md && echo "OK"

# No references to deleted templates
rg "html-css\|general\.md\|dart\.md\|csharp\.md\|go\.md" .claude/templates/README.md && echo "STALE!" || echo "OK"

# Has archive section
rg "Archive\|_archive" .claude/templates/README.md && echo "OK"

# Has catalog cross-reference
rg "template-catalog.md" .claude/templates/README.md && echo "OK"
```

**Success Criteria:**
- Spawn Templates section with 4 entries
- Report Templates section with 5 entries
- Code Style section updated (3 active only)
- Quick Reference table accurate
- Creator Skills table complete (all 6 creators)
- Archive section with restoration instructions
- Cross-reference to template-catalog.md

---

## Post-Implementation Pipeline

After all 5 phases complete, the following pipeline executes:

### Code Review

**Agent:** code-reviewer
- Review all modified files for code quality
- Verify security fixes are correct and complete
- Check for regressions in existing functionality
- Verify TDD red-green cycle was followed

### QA Validation

**Agent:** qa
- Run full test suite: `node --test tests/lib/spawn/*.test.cjs`
- Run security tests: all 3 new security test files
- Verify template file counts match expected state
- Validate catalog completeness against filesystem

### Lint Check

```bash
npx eslint .claude/lib/spawn/prompt-assembler.cjs
npx eslint .claude/lib/spawn/prompt-factory.cjs
npx eslint .claude/lib/spawn/spawn-template-resolver.cjs
npx eslint .claude/hooks/safety/spawn-prompt-validator.cjs
```

### Commit Checkpoint

Since this plan modifies 15+ files, apply commit checkpoint pattern:

```bash
# After Phase 1 (security) -- CHECKPOINT
git add -A && git commit -m "fix(security): SEC-TMPL-001,002,004 path traversal + validation bypass + injection"

# After Phases 2-3 (resolver + cleanup) -- CHECKPOINT
git add -A && git commit -m "feat(templates): spawn resolver + dead template cleanup (14 archived, 2 deleted)"

# After Phases 4-5 (upgrades + docs) -- FINAL
git add -A && git commit -m "feat(templates): catalog + upgrades + README/SKILL.md documentation"
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Security fix breaks spawn prompt assembly | Low | HIGH | Existing test suite + 14 new security tests |
| Archive breaks undiscovered references | Low | Medium | Pre-flight grep before every git mv |
| Template catalog becomes stale | Medium | Low | Template-creator skill updates catalog |
| Spec merge loses content | Low | Medium | Read both templates carefully; archive original |
| Existing tests regress | Low | High | Run full test suite after each phase |

---

## File Change Summary

| Phase | New Files | Modified Files | Archived | Deleted | Total |
|-------|-----------|----------------|----------|---------|-------|
| 1 | 3 test files | 3 source files | 0 | 0 | 6 |
| 2 | 1 test file + 1 module | 0 | 0 | 0 | 2 |
| 3 | 1 archive README | 0 | 14 | 2 | 17 |
| 4 | 1 catalog | 7 templates | 1 (spec-template) | 0 | 9 |
| 5 | 0 | 2 (README + SKILL.md) | 0 | 0 | 2 |
| **Total** | **6** | **12** | **15** | **2** | **36** |

---

## Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction.

**Tasks:**

1. Spawn reflection-agent to analyze completed template overhaul
2. Extract learnings and update memory files:
   - Pattern: TDD security fixes as blocking Phase 1
   - Pattern: Archive-before-delete for template cleanup
   - Decision: Advisory resolver over content injection (ADR-085)
3. Check for evolution opportunities:
   - Does the template-renderer skill need updates for new catalog?
   - Does the spawn-prompt-assembler hook benefit from resolver integration?

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected
