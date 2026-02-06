# Updater Workflows Implementation Plan

**Plan ID:** UPDATER-WORKFLOWS-2026-01-31
**Author:** PLANNER Agent
**Date:** 2026-01-31
**Status:** Phase 0 - Design Complete
**Complexity:** EPIC (7 phases, 35+ tasks, 10+ files)

---

## Executive Summary

Implement 6 updater workflows (agent, hook, skill, workflow, template, schema) to enable safe, versioned updates to existing artifacts. Tests exist (1641 lines, 210 test cases) but no implementations. Each updater must follow EVOLVE phases, back up artifacts, validate schemas, update registries, and record learnings.

**Key Challenge:** Updaters are DIFFERENT from creators - they modify existing artifacts with backward compatibility, not create new ones.

**Business Value:**
- Safe artifact updates without breaking changes
- Version-controlled artifact evolution
- Automated registry synchronization
- Rollback capability for failed updates

---

## Context

### Existing Infrastructure

1. **Creator Skills** (6 functional implementations)
   - `.claude/skills/agent-creator/SKILL.md`
   - `.claude/skills/skill-creator/SKILL.md`
   - `.claude/skills/hook-creator/SKILL.md`
   - `.claude/skills/workflow-creator/SKILL.md`
   - `.claude/skills/template-creator/SKILL.md`
   - `.claude/skills/schema-creator/SKILL.md`

2. **Test Suite** (complete, 210 test cases)
   - `tests/workflows/updaters/agent-updater-workflow.test.cjs`
   - `tests/workflows/updaters/skill-updater-workflow.test.cjs`
   - `tests/workflows/updaters/hook-updater-workflow.test.cjs`
   - `tests/workflows/updaters/workflow-updater-workflow.test.cjs`
   - `tests/workflows/updaters/template-updater-workflow.test.cjs`
   - `tests/workflows/updaters/schema-updater-workflow.test.cjs`

3. **EVOLVE Workflow** (foundation pattern)
   - `.claude/workflows/core/evolution-workflow.md`
   - 6 phases: evaluate → validate → obtain → lock → verify → enable

4. **Enforcement Hooks** (operational)
   - `unified-creator-guard.cjs` - Blocks direct artifact writes
   - `research-enforcement.cjs` - Enforces research phase
   - `evolution-state-guard.cjs` - State machine enforcement
   - `conflict-detector.cjs` - Naming/capability conflicts

### Test Expectations (from test suite analysis)

**All 6 updaters must:**

1. **YAML Structure**
   - Parse as valid YAML workflow
   - `name: "{artifact}-updater-workflow"`
   - `artifact_type: "{artifact}"`
   - `updater_config.backup_enabled: true`

2. **EVOLVE Phases** (all 6 required)
   - `evaluate`: Load existing artifact, validate change justification
   - `validate`: Check protected sections, dependency impact
   - `obtain`: Research best practices (3+ queries)
   - `lock`: Create backup, apply changes
   - `verify`: Validate schema, check required sections
   - `enable`: Update registries, record learnings, cleanup backup

3. **Phase-Specific Requirements**
   - Each phase has `steps[]` and `gates[]` arrays
   - LOCK phase MUST have backup step + backup gate
   - ENABLE phase MUST update memory + cleanup backup
   - Artifact-specific validation (YAML frontmatter for agents, tool changes for skills, etc.)

4. **Compensate Section**
   - Rollback actions per phase
   - LOCK compensate MUST have `restore_backup` action

5. **Iron Laws**
   - `iron_laws[]` section exists
   - MUST enforce backup requirement

6. **WorkflowEngine Integration**
   - Workflow loads successfully with `WorkflowEngine.load()`
   - `engine.isValid === true`

### Key Differences: Creator vs Updater

| Aspect | Creator | Updater |
|--------|---------|---------|
| **Input** | Requirements (new capability) | Existing artifact + change request |
| **Research** | Best practices for NEW artifact | Compatibility impact, migration strategies |
| **Validation** | Naming conflicts, capability gaps | Protected sections, breaking changes |
| **Backup** | Not needed (creating from scratch) | **MANDATORY** (modifying existing) |
| **Registry Update** | Add new entry | Update existing entry |
| **Memory Recording** | "Created X" | "Updated X from v1.0 to v1.1" |
| **Rollback** | Delete artifact | Restore from backup |

---

## Objectives

1. **Primary:** Create 6 updater workflows passing all 210 test cases
2. **Secondary:** Reusable patterns for updater common logic
3. **Tertiary:** Integration points with creator skills for version tracking

---

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose:** Research updater patterns, validate approach, design architecture
**Duration:** 6-8 hours
**Parallel OK:** No (blocking)

#### Research Requirements (MANDATORY)

Before creating ANY workflow artifact:

- [ ] Minimum 3 Exa/WebSearch queries executed
- [ ] Minimum 3 external sources consulted
- [ ] Research report generated and saved
- [ ] Design decisions documented with rationale

**Research Queries:**

1. "YAML workflow update patterns backward compatibility"
2. "Artifact versioning strategies schema evolution"
3. "Safe file modification rollback backup strategies"

**Research Output:** `.claude/context/artifacts/research-reports/updater-workflows-research-2026-01-31.md`

#### Constitution Checkpoint

**CRITICAL VALIDATION:** Before proceeding to Phase 1, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] Research report contains minimum 3 external sources with citations
   - [ ] All [NEEDS CLARIFICATION] items resolved
   - [ ] ADR-077 created for updater architecture decision

2. **Technical Feasibility**
   - [ ] WorkflowEngine supports YAML workflow execution
   - [ ] Backup strategy validated (atomic-write.cjs can create backups)
   - [ ] No blocking technical issues

3. **Security Review**
   - [ ] Backup restoration security assessed (prevent arbitrary file writes)
   - [ ] Protected sections mechanism validated
   - [ ] Compensate actions prevent data loss

4. **Specification Quality**
   - [ ] Test expectations translated to acceptance criteria
   - [ ] EVOLVE phase mapping clear for each artifact type
   - [ ] Edge cases documented (concurrent updates, partial failures)

**If ANY gate fails, return to research. DO NOT proceed to implementation.**

#### Phase 0 Tasks

- [ ] **0.1** Research updater workflow patterns (~2 hours)
  - **Queries:** "YAML workflow update patterns", "schema evolution strategies", "safe file modification rollback"
  - **Output:** `.claude/context/artifacts/research-reports/updater-workflows-research-2026-01-31.md`
  - **Verify:** Research report exists with 3+ sources

- [ ] **0.2** Analyze test suite expectations (~2 hours)
  - **Command:** `grep -r "should have" tests/workflows/updaters/*.test.cjs > test-expectations.txt`
  - **Verify:** All test expectations documented
  - **Deliverable:** Test expectation matrix per updater

- [ ] **0.3** Design updater architecture (~2 hours)
  - **Deliverable:** Architecture decision record (ADR-077)
  - **Includes:** Common patterns, shared utilities, phase mapping table
  - **Verify:** ADR-077 exists in `.claude/context/memory/decisions.md`

- [ ] **0.4** Map creator skill integration points (~1 hour)
  - **Analysis:** Where should creators invoke updaters?
  - **Deliverable:** Integration point specification
  - **Example:** "When skill-creator detects existing SKILL.md, invoke skill-updater instead of creating new"

**Success Criteria:** Research complete, ADR-077 documented, constitution checkpoint passed

---

### Phase 1: Workflow Design Specification

**Purpose:** Define structure for each of 6 updater workflows
**Dependencies:** Phase 0 complete
**Duration:** 6-8 hours
**Parallel OK:** Partial (workflows can be designed in parallel after common pattern established)

#### Tasks

- [ ] **1.1** Design common updater workflow template (~2 hours)
  - **Command:** `Read .claude/workflows/core/evolution-workflow.md` for EVOLVE pattern
  - **Deliverable:** `.claude/templates/workflows/updater-workflow-template.yaml`
  - **Includes:** All 6 EVOLVE phases, updater_config, compensate, iron_laws
  - **Verify:** Template has all required sections (name, artifact_type, phases, updater_config)

- [ ] **1.2** Specify agent-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing agent, validate frontmatter, check change justification
  - **VALIDATE:** Check protected sections (identity, capabilities), dependency impact (agents invoking this)
  - **OBTAIN:** Research agent patterns, check similar updates
  - **LOCK:** Backup agent file, apply changes via Edit tool
  - **VERIFY:** Validate YAML frontmatter, check required sections
  - **ENABLE:** Update learnings.md, cleanup backup on success
  - **Deliverable:** Phase specification document

- [ ] **1.3** Specify skill-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing skill, check change scope
  - **VALIDATE:** Check tool changes (new tools require validation), consumer impact (agents using skill)
  - **OBTAIN:** Research skill patterns
  - **LOCK:** Backup SKILL.md, apply changes
  - **VERIFY:** Validate skill structure, memory protocol section
  - **ENABLE:** Update skill catalog, update learnings.md
  - **Deliverable:** Phase specification document

- [ ] **1.4** Specify hook-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing hook, assess hook type (safety/routing/audit)
  - **VALIDATE:** Check breaking changes (function signatures), test coverage
  - **OBTAIN:** Research hook patterns
  - **LOCK:** Backup hook.cjs, apply changes
  - **VERIFY:** Run hook tests, check error handling
  - **ENABLE:** Update CLAUDE.md Section 1.3, update learnings.md
  - **Deliverable:** Phase specification document

- [ ] **1.5** Specify workflow-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing workflow, parse YAML
  - **VALIDATE:** Check state machine changes, phase additions/removals
  - **OBTAIN:** Research workflow patterns
  - **LOCK:** Backup workflow.md, apply changes
  - **VERIFY:** Validate workflow structure, check agents/skills references
  - **ENABLE:** Update CLAUDE.md Section 8.6, update learnings.md
  - **Deliverable:** Phase specification document

- [ ] **1.6** Specify template-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing template, identify token changes
  - **VALIDATE:** Check template consumers (what uses this template?), breaking token changes
  - **OBTAIN:** Research template patterns
  - **LOCK:** Backup template file, apply changes
  - **VERIFY:** Validate token syntax, check template-renderer compatibility
  - **ENABLE:** Update template catalog, update learnings.md
  - **Deliverable:** Phase specification document

- [ ] **1.7** Specify schema-updater-workflow phases (~1 hour) [⚡ parallel OK]
  - **EVALUATE:** Load existing schema, check version compatibility
  - **VALIDATE:** Check schema consumers, breaking changes (required -> optional is safe, opposite is breaking)
  - **OBTAIN:** Research JSON schema evolution best practices
  - **LOCK:** Backup schema.json, apply changes
  - **VERIFY:** Validate JSON schema syntax, check backward compatibility
  - **ENABLE:** Update schema registry, update learnings.md
  - **Deliverable:** Phase specification document

#### Phase 1 Verification Gate

```bash
# All phase specifications created
ls .claude/context/artifacts/architecture/updater-specs/*.md | wc -l
# Expected: 6 (one per updater)

# Template created
test -f .claude/templates/workflows/updater-workflow-template.yaml && echo "✓ Template exists"
```

**Success Criteria:** 6 updater phase specifications created, common template designed

---

### Phase 2: Creator Skill Integration Points

**Purpose:** Define where/how creators invoke updaters
**Dependencies:** Phase 1 complete
**Duration:** 3-4 hours
**Parallel OK:** No (requires Phase 1 specs)

#### Tasks

- [ ] **2.1** Design creator-updater handoff protocol (~2 hours)
  - **Analysis:** When should creator detect "update existing" vs "create new"?
  - **Pattern:** If artifact exists at expected path → invoke updater, else create
  - **Command:** `grep -r "Write.*SKILL.md" .claude/skills/skill-creator/scripts/*.cjs`
  - **Deliverable:** Handoff specification document
  - **Example:**
    ```javascript
    // In skill-creator/scripts/create.cjs
    const skillPath = `.claude/skills/${name}/SKILL.md`;
    if (fs.existsSync(skillPath)) {
      console.log(`Skill ${name} exists. Invoking skill-updater...`);
      await Skill({ skill: 'skill-updater', args: `--name ${name} --changes "${changes}"` });
      return;
    }
    // Otherwise, proceed with creation
    ```

- [ ] **2.2** Map updater input parameters (~1 hour)
  - **What info creators pass to updaters:**
    - `--name` (artifact name)
    - `--changes` (description of what to change)
    - `--justification` (why this change is needed)
    - `--version` (optional: target version)
    - `--research-report` (optional: path to research if creator already researched)
  - **Deliverable:** Parameter specification table
  - **Verify:** Parameters map to test expectations

- [ ] **2.3** Design success/failure handling (~1 hour)
  - **Success:** Updater returns updated artifact path + version
  - **Failure scenarios:**
    - Backup creation failed → Rollback: None (change not applied)
    - Schema validation failed → Rollback: Restore backup
    - Registry update failed → Rollback: Restore backup, log issue
  - **Deliverable:** Error handling specification
  - **Pattern:** Compensate actions restore backup on any LOCK+ failure

#### Phase 2 Verification Gate

```bash
# Handoff protocol documented
test -f .claude/context/artifacts/architecture/creator-updater-handoff.md && echo "✓ Handoff spec exists"

# Parameter spec documented
grep -q "updater input parameters" .claude/context/artifacts/architecture/creator-updater-handoff.md && echo "✓ Parameters documented"
```

**Success Criteria:** Creator-updater handoff protocol defined, error handling specified

---

### Phase 3: Implementation Sequence & Shared Utilities

**Purpose:** Determine implementation order and extract reusable patterns
**Dependencies:** Phase 2 complete
**Duration:** 4-6 hours
**Parallel OK:** Partial (utilities can be developed in parallel)

#### Tasks

- [ ] **3.1** Prioritize updater implementation order (~1 hour)
  - **Recommended Order:** skill → agent → hook → workflow → template → schema
  - **Rationale:**
    - **Skill first:** Simplest (single file, clear structure)
    - **Agent second:** Similar to skill but with routing table updates
    - **Hook third:** Requires test execution validation
    - **Workflow fourth:** Complex (state machine validation)
    - **Template fifth:** Requires template-renderer integration check
    - **Schema last:** Most complex (backward compatibility validation)
  - **Deliverable:** Implementation sequence with estimated effort per updater

- [ ] **3.2** Extract common updater utilities (~3 hours)
  - **Utility 1:** `backup-manager.cjs` (create/restore/cleanup backups)
    ```javascript
    createBackup(filePath) -> backupPath
    restoreBackup(backupPath, originalPath) -> success
    cleanupBackup(backupPath) -> success
    ```
  - **Utility 2:** `registry-updater.cjs` (update CLAUDE.md, catalogs, learnings.md)
    ```javascript
    updateRegistry(artifactType, name, action: 'add'|'update'|'remove') -> success
    ```
  - **Utility 3:** `protected-section-validator.cjs` (check if changes affect protected sections)
    ```javascript
    validateProtectedSections(artifactType, oldContent, newContent) -> { valid, violations }
    ```
  - **Location:** `.claude/lib/updater/`
  - **Tests:** `tests/unit/updater/` (3 utility test files)
  - **Verify:** All 3 utilities have test files

- [ ] **3.3** Create updater workflow YAML template renderer (~2 hours)
  - **Purpose:** Generate YAML workflow files from template + artifact-specific config
  - **Template:** `.claude/templates/workflows/updater-workflow-template.yaml`
  - **Config:** Artifact-specific step overrides
  - **Output:** 6 YAML workflow files in `tests/workflows/updaters/`
  - **Tool:** Invoke `template-renderer` skill with updater template
  - **Verify:** Generated YAML parses successfully

#### Phase 3 Verification Gate

```bash
# Utilities created
ls .claude/lib/updater/*.cjs | wc -l
# Expected: 3 (backup-manager, registry-updater, protected-section-validator)

# Utility tests created
ls tests/unit/updater/*.test.cjs | wc -l
# Expected: 3

# Template renderer works
node .claude/skills/template-renderer/scripts/main.cjs --template updater-workflow-template --output /tmp/test.yaml && echo "✓ Template rendering works"
```

**Success Criteria:** Implementation order defined, 3 shared utilities created with tests

---

### Phase 4: YAML Workflow Implementation (Skill Updater First)

**Purpose:** Implement skill-updater-workflow.yaml as reference implementation
**Dependencies:** Phase 3 complete
**Duration:** 8-10 hours
**Parallel OK:** No (this is the template for others)

#### Tasks

- [ ] **4.1** Create skill-updater-workflow.yaml structure (~2 hours)
  - **Command:** Copy from updater-workflow-template.yaml
  - **Location:** `tests/workflows/updaters/skill-updater-workflow.yaml`
  - **Customize:** artifact_type: "skill", updater_config specific to skills
  - **Verify:** YAML parses with `parseWorkflow()`

- [ ] **4.2** Implement EVALUATE phase for skill-updater (~1 hour)
  - **Steps:**
    1. `load_existing_skill`: Read existing SKILL.md file
    2. `parse_frontmatter`: Extract YAML frontmatter (name, version, tools, etc.)
    3. `validate_change_request`: Ensure change justification provided
  - **Gates:**
    1. Skill file exists
    2. YAML frontmatter is valid
    3. Change request includes justification
  - **Verify:** Test passes "should have step to load existing skill"

- [ ] **4.3** Implement VALIDATE phase for skill-updater (~1 hour)
  - **Steps:**
    1. `check_tool_changes`: If tools added, validate availability
    2. `check_consumer_impact`: Grep for agents invoking this skill
    3. `identify_protected_sections`: Memory Protocol, Purpose cannot be removed
  - **Gates:**
    1. No breaking tool removals
    2. Consumer impact documented
  - **Verify:** Test passes "should have step to check tool changes"

- [ ] **4.4** Implement OBTAIN phase for skill-updater (~1 hour)
  - **Steps:**
    1. `research_skill_patterns`: WebSearch for similar skill updates
    2. `analyze_existing_codebase`: Grep for similar skills
    3. `document_research`: Save research report
  - **Gates:**
    1. Minimum 3 research sources
    2. Research report exists
  - **Verify:** Research enforcement hook would pass

- [ ] **4.5** Implement LOCK phase for skill-updater (~2 hours)
  - **Steps:**
    1. `create_backup`: Use backup-manager.cjs
    2. `apply_changes`: Use Edit tool to modify SKILL.md
    3. `record_lock`: Update evolution-state.json
  - **Gates:**
    1. Backup created successfully
    2. Backup file exists at expected path
  - **Verify:** Test passes "should have step to create backup"

- [ ] **4.6** Implement VERIFY phase for skill-updater (~1 hour)
  - **Steps:**
    1. `validate_skill_structure`: Check required sections exist
    2. `check_memory_protocol`: Ensure Memory Protocol section present
    3. `run_skill_tests`: If tests exist, run them
  - **Gates:**
    1. Skill structure valid
    2. Memory Protocol exists
  - **Verify:** Test passes "should have step to check memory protocol"

- [ ] **4.7** Implement ENABLE phase for skill-updater (~1 hour)
  - **Steps:**
    1. `update_skill_catalog`: Use registry-updater.cjs
    2. `update_learnings`: Append to learnings.md
    3. `cleanup_backup`: Remove backup on success
  - **Gates:**
    1. Skill catalog updated
    2. Learnings recorded
    3. Backup cleaned up
  - **Verify:** Test passes "should have step to update skill catalog"

- [ ] **4.8** Implement compensate actions for skill-updater (~1 hour)
  - **Compensate LOCK:** Restore backup
  - **Compensate VERIFY:** Restore backup
  - **Compensate ENABLE:** Keep backup (manual recovery needed)
  - **Verify:** Test passes "should have restore_backup action in lock compensate"

- [ ] **4.9** Define iron_laws for skill-updater (~30 min)
  - **Law 1:** Backup MUST be created before any modification
  - **Law 2:** Memory Protocol section MUST NOT be removed
  - **Law 3:** Skills with active consumers MUST document breaking changes
  - **Verify:** Test passes "should enforce backup requirement"

#### Phase 4 Error Handling

If any task fails:

1. Run: `git checkout -- tests/workflows/updaters/skill-updater-workflow.yaml`
2. Document: `echo "Phase 4 failed: $(date)" >> .claude/context/memory/issues.md`
3. Do NOT proceed to Phase 5

#### Phase 4 Verification Gate

```bash
# skill-updater-workflow.yaml exists
test -f tests/workflows/updaters/skill-updater-workflow.yaml && echo "✓ File exists"

# All tests pass for skill-updater
node tests/workflows/updaters/skill-updater-workflow.test.cjs
# Expected: X passing, 0 failing

# WorkflowEngine loads successfully
node -e "const {WorkflowEngine} = require('./.claude/lib/workflow/workflow-engine.cjs'); const e = new WorkflowEngine('tests/workflows/updaters/skill-updater-workflow.yaml'); e.load().then(() => console.log(e.isValid ? '✓ Valid' : '✗ Invalid'))"
```

**Success Criteria:** skill-updater-workflow.yaml complete, all 35 skill-updater tests passing

---

### Phase 5: Replicate Pattern for Remaining 5 Updaters

**Purpose:** Use skill-updater as template for agent, hook, workflow, template, schema updaters
**Dependencies:** Phase 4 complete
**Duration:** 20-25 hours (5 updaters × 4-5 hours each)
**Parallel OK:** Yes (all 5 can be implemented in parallel after skill-updater complete)

#### Shared Pattern for Each Updater

For each of: agent, hook, workflow, template, schema

1. Copy skill-updater-workflow.yaml
2. Rename to `{artifact}-updater-workflow.yaml`
3. Update `artifact_type:` field
4. Customize EVALUATE phase (load artifact, parse structure)
5. Customize VALIDATE phase (protected sections, impact analysis)
6. Customize VERIFY phase (artifact-specific validation)
7. Customize ENABLE phase (registry updates specific to artifact type)
8. Run tests: `node tests/workflows/updaters/{artifact}-updater-workflow.test.cjs`
9. Fix failures until all tests pass

#### Tasks (Parallel Execution)

- [ ] **5.1** Implement agent-updater-workflow.yaml (~5 hours) [⚡ parallel OK]
  - **Customize EVALUATE:** Parse agent frontmatter (identity, capabilities, model)
  - **Customize VALIDATE:** Check routing table references (CLAUDE.md Section 3)
  - **Customize VERIFY:** Validate agent frontmatter YAML
  - **Customize ENABLE:** Update CLAUDE.md routing table, learnings.md
  - **Tests Expected:** 35-40 tests
  - **Verify:** All agent-updater tests passing

- [ ] **5.2** Implement hook-updater-workflow.yaml (~5 hours) [⚡ parallel OK]
  - **Customize EVALUATE:** Identify hook type (safety/routing/audit/etc.)
  - **Customize VALIDATE:** Check function signature changes, test coverage
  - **Customize VERIFY:** Run hook tests (test-hook.cjs if exists)
  - **Customize ENABLE:** Update CLAUDE.md Section 1.3 (enforcement hooks table)
  - **Tests Expected:** 35-40 tests
  - **Verify:** All hook-updater tests passing

- [ ] **5.3** Implement workflow-updater-workflow.yaml (~5 hours) [⚡ parallel OK]
  - **Customize EVALUATE:** Parse workflow YAML (phases, state machine)
  - **Customize VALIDATE:** Check state machine changes, phase additions/removals
  - **Customize VERIFY:** Validate workflow structure with WorkflowEngine
  - **Customize ENABLE:** Update CLAUDE.md Section 8.6 (enterprise workflows table)
  - **Tests Expected:** 35-40 tests
  - **Verify:** All workflow-updater tests passing

- [ ] **5.4** Implement template-updater-workflow.yaml (~5 hours) [⚡ parallel OK]
  - **Customize EVALUATE:** Parse template tokens ({{PLACEHOLDER}} syntax)
  - **Customize VALIDATE:** Check template consumers, breaking token changes
  - **Customize VERIFY:** Validate token syntax, test with template-renderer
  - **Customize ENABLE:** Update template catalog
  - **Tests Expected:** 35-40 tests
  - **Verify:** All template-updater tests passing

- [ ] **5.5** Implement schema-updater-workflow.yaml (~5 hours) [⚡ parallel OK]
  - **Customize EVALUATE:** Parse JSON schema, check version field
  - **Customize VALIDATE:** Check schema consumers, breaking changes (required fields added)
  - **Customize VERIFY:** Validate JSON schema syntax, backward compatibility check
  - **Customize ENABLE:** Update schema registry, version bump
  - **Tests Expected:** 35-40 tests
  - **Verify:** All schema-updater tests passing

#### Phase 5 Verification Gate

```bash
# All 6 YAML workflow files exist
ls tests/workflows/updaters/*-updater-workflow.yaml | wc -l
# Expected: 6

# All test suites pass
for file in tests/workflows/updaters/*.test.cjs; do
  echo "Running $file..."
  node "$file" || exit 1
done
# Expected: All passing

# Total test count
grep -r "it(" tests/workflows/updaters/*.test.cjs | wc -l
# Expected: ~210 (35 tests × 6 updaters)
```

**Success Criteria:** All 6 updater workflows implemented, 210 tests passing

---

### Phase 6: Integration Testing & Documentation

**Purpose:** Test updater invocation from creator skills, document usage
**Dependencies:** Phase 5 complete
**Duration:** 6-8 hours
**Parallel OK:** Partial (docs can be written in parallel with integration tests)

#### Tasks

- [ ] **6.1** Create integration tests (~3 hours)
  - **Test Scenario 1:** skill-creator detects existing skill → invokes skill-updater
  - **Test Scenario 2:** agent-creator detects existing agent → invokes agent-updater
  - **Test Scenario 3:** Updater fails validation → restores backup
  - **Test Scenario 4:** Concurrent updates to same artifact → conflict detection
  - **Location:** `tests/integration/creator-updater-integration.test.mjs`
  - **Verify:** All 4 scenarios pass

- [ ] **6.2** Update creator skills to invoke updaters (~2 hours)
  - **Files to modify:**
    - `.claude/skills/skill-creator/scripts/create.cjs`
    - `.claude/skills/agent-creator/scripts/create.cjs`
    - `.claude/skills/hook-creator/scripts/create.cjs`
    - `.claude/skills/workflow-creator/scripts/create.cjs`
    - `.claude/skills/template-creator/scripts/create.cjs`
    - `.claude/skills/schema-creator/scripts/create.cjs`
  - **Pattern:** Add existence check at top of create script
    ```javascript
    if (fs.existsSync(artifactPath)) {
      console.log(`${artifactType} exists. Invoking ${artifactType}-updater...`);
      return invokeUpdater(artifactType, name, changes);
    }
    ```
  - **Verify:** Creators invoke updaters when artifact exists

- [ ] **6.3** Document updater usage (~2 hours) [⚡ parallel OK]
  - **Create:** `.claude/docs/UPDATER_WORKFLOWS.md`
  - **Sections:**
    1. Overview: When to use updaters vs creators
    2. Invocation: How to invoke each updater
    3. Parameters: Required/optional args
    4. EVOLVE phases: What happens in each phase
    5. Rollback: How to recover from failed updates
    6. Troubleshooting: Common issues and fixes
  - **Verify:** Documentation complete with examples

- [ ] **6.4** Update CLAUDE.md to reference updaters (~1 hour) [⚡ parallel OK]
  - **Add to Section 4 (SELF-EVOLUTION):**
    ```markdown
    ### Updater Workflows (ADR-077)

    When an artifact already exists, use updaters instead of creators:

    | Updater | Workflow | Purpose |
    |---------|----------|---------|
    | skill-updater | `.claude/workflows/updaters/skill-updater-workflow.yaml` | Update existing skills |
    | agent-updater | `.claude/workflows/updaters/agent-updater-workflow.yaml` | Update existing agents |
    | ... (6 total)
    ```
  - **Verify:** CLAUDE.md has updater reference

#### Phase 6 Verification Gate

```bash
# Integration tests exist
test -f tests/integration/creator-updater-integration.test.mjs && echo "✓ Integration tests exist"

# Integration tests pass
node tests/integration/creator-updater-integration.test.mjs
# Expected: All scenarios passing

# Documentation exists
test -f .claude/docs/UPDATER_WORKFLOWS.md && echo "✓ Documentation exists"

# CLAUDE.md updated
grep -q "updater-workflow" .claude/CLAUDE.md && echo "✓ CLAUDE.md updated"
```

**Success Criteria:** Integration tests passing, documentation complete, CLAUDE.md updated

---

### Phase 7: Evolution & Reflection Check (MANDATORY)

**Purpose:** Quality assessment and learning extraction
**Dependencies:** Phase 6 complete
**Duration:** 2-3 hours
**Parallel OK:** No (final phase)

#### Tasks

- [ ] **7.1** Spawn reflection-agent (~1 hour)
  - **Command:**
    ```javascript
    Task({
      subagent_type: "reflection-agent",
      description: "Session reflection and learning extraction for updater workflows implementation",
      prompt: `You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md.

      Analyze the completed updater workflows implementation:
      - 6 YAML workflows created (agent, skill, hook, workflow, template, schema)
      - 3 shared utilities (backup-manager, registry-updater, protected-section-validator)
      - 210 tests passing
      - Integration with creator skills
      - Documentation complete

      Extract learnings to .claude/context/memory/learnings.md and check for evolution opportunities.`
    });
    ```
  - **Verify:** Reflection-agent task created and completed

- [ ] **7.2** Extract learnings (~1 hour)
  - **Learnings to capture:**
    1. Updater pattern reusability (all 6 followed same structure)
    2. Backup strategy effectiveness (atomic-write.cjs worked well)
    3. Test-first approach value (tests guided implementation)
    4. Creator-updater handoff clarity (existence check pattern simple and effective)
  - **Output:** `.claude/context/memory/learnings.md` (append)
  - **Verify:** Learnings recorded with date, summary, key insights

- [ ] **7.3** Check for evolution opportunities (~30 min)
  - **Questions:**
    - Should we create a generic "artifact-updater" skill that dispatches to specific updaters?
    - Should backup-manager become a standalone skill?
    - Should we add version-control integration (git tags) for artifact updates?
  - **Output:** If opportunities found, log to evolution-state.json suggestions queue
  - **Verify:** Evolution opportunities documented

- [ ] **7.4** Update ADR-077 with final status (~30 min)
  - **Status:** Accepted → Implemented
  - **Add Implementation Date:** 2026-01-31
  - **Add Consequences (Actual):** What trade-offs actually materialized?
  - **Verify:** ADR-077 status updated in decisions.md

#### Phase 7 Verification Gate

```bash
# Reflection-agent completed
TaskList | grep "reflection-agent" | grep "completed"
# Expected: Status = completed

# Learnings extracted
grep -q "Updater Workflows Implementation" .claude/context/memory/learnings.md && echo "✓ Learnings recorded"

# ADR-077 updated
grep -A 5 "ADR-077" .claude/context/memory/decisions.md | grep -q "Status: Implemented" && echo "✓ ADR updated"
```

**Success Criteria:** Reflection complete, learnings extracted, ADR-077 finalized

---

## Files to Create/Modify

### New Files Created (15 files)

**Workflows (6):**
1. `tests/workflows/updaters/skill-updater-workflow.yaml`
2. `tests/workflows/updaters/agent-updater-workflow.yaml`
3. `tests/workflows/updaters/hook-updater-workflow.yaml`
4. `tests/workflows/updaters/workflow-updater-workflow.yaml`
5. `tests/workflows/updaters/template-updater-workflow.yaml`
6. `tests/workflows/updaters/schema-updater-workflow.yaml`

**Utilities (3):**
7. `.claude/lib/updater/backup-manager.cjs`
8. `.claude/lib/updater/registry-updater.cjs`
9. `.claude/lib/updater/protected-section-validator.cjs`

**Tests (4):**
10. `tests/unit/updater/backup-manager.test.cjs`
11. `tests/unit/updater/registry-updater.test.cjs`
12. `tests/unit/updater/protected-section-validator.test.cjs`
13. `tests/integration/creator-updater-integration.test.mjs`

**Documentation (1):**
14. `.claude/docs/UPDATER_WORKFLOWS.md`

**Templates (1):**
15. `.claude/templates/workflows/updater-workflow-template.yaml`

### Files Modified (7 files)

**Creator Skills (6):**
1. `.claude/skills/skill-creator/scripts/create.cjs` (add existence check)
2. `.claude/skills/agent-creator/scripts/create.cjs` (add existence check)
3. `.claude/skills/hook-creator/scripts/create.cjs` (add existence check)
4. `.claude/skills/workflow-creator/scripts/create.cjs` (add existence check)
5. `.claude/skills/template-creator/scripts/create.cjs` (add existence check)
6. `.claude/skills/schema-creator/scripts/create.cjs` (add existence check)

**Framework Documentation (1):**
7. `.claude/CLAUDE.md` (add Section 4 updater reference)

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Blocking? |
|-------|-------|-----------|-----------|-----------|
| 0 - Research & Planning | 4 | 6-8 hours | No | Yes (MANDATORY) |
| 1 - Workflow Design | 7 | 6-8 hours | Partial | No |
| 2 - Creator Integration | 3 | 3-4 hours | No | No |
| 3 - Shared Utilities | 3 | 4-6 hours | Partial | No |
| 4 - Skill Updater (Reference) | 9 | 8-10 hours | No | Yes (template for Phase 5) |
| 5 - Remaining 5 Updaters | 5 | 20-25 hours | Yes (all 5 parallel) | No |
| 6 - Integration & Docs | 4 | 6-8 hours | Partial | No |
| 7 - Reflection | 4 | 2-3 hours | No | No |
| **Total** | **39** | **55-72 hours** | | |

**Estimated Calendar Time:**
- **With parallelization:** 7-9 days (assuming 8-hour work days, Phase 5 done in parallel)
- **Sequential:** 12-15 days

---

## Risk Analysis

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|-------------|------------|----------|
| **Phase 0 research incomplete** | HIGH | LOW | Constitution checkpoint blocks progress | Extend research phase |
| **Test expectations unclear** | HIGH | MEDIUM | Analyze test files thoroughly in Phase 0 | Re-read tests, clarify with test analysis task |
| **Backup strategy fails** | CRITICAL | LOW | Use atomic-write.cjs (proven in codebase) | Manual file restoration from git |
| **YAML parsing errors** | MEDIUM | MEDIUM | Validate with WorkflowEngine after each change | Fix YAML syntax incrementally |
| **Registry updates break routing** | HIGH | LOW | Test creator-updater integration in Phase 6 | Restore CLAUDE.md from git |
| **Protected sections validation too strict** | MEDIUM | MEDIUM | Start with conservative rules, relax later | Update protected-section-validator.cjs rules |
| **Creator skill modifications break existing functionality** | HIGH | LOW | Add existence check at top, minimal changes | `git checkout -- .claude/skills/*/scripts/create.cjs` |
| **210 tests don't all pass** | CRITICAL | MEDIUM | Implement test-first (run tests after each phase) | Fix failing tests incrementally, don't proceed if blocking |

---

## Success Criteria

**Phase 0 (Research):**
- [ ] Constitution checkpoint passed (all 4 gates green)
- [ ] Research report with 3+ external sources
- [ ] ADR-077 created with updater architecture

**Phase 1 (Design):**
- [ ] 6 updater phase specifications created
- [ ] Common workflow template designed

**Phase 2 (Integration):**
- [ ] Creator-updater handoff protocol defined
- [ ] Parameter specification documented

**Phase 3 (Utilities):**
- [ ] 3 shared utilities created with tests
- [ ] Implementation sequence prioritized

**Phase 4 (Skill Updater):**
- [ ] skill-updater-workflow.yaml complete
- [ ] All 35 skill-updater tests passing

**Phase 5 (Remaining Updaters):**
- [ ] All 6 updater workflows implemented
- [ ] 210 total tests passing

**Phase 6 (Integration):**
- [ ] Integration tests passing (4 scenarios)
- [ ] Creator skills invoke updaters
- [ ] Documentation complete
- [ ] CLAUDE.md updated

**Phase 7 (Reflection):**
- [ ] Reflection-agent spawned and completed
- [ ] Learnings extracted to memory
- [ ] ADR-077 finalized

**Overall Success:**
- [ ] All 210 tests passing
- [ ] 6 updater workflows operational
- [ ] Creators seamlessly invoke updaters
- [ ] Documentation enables self-service usage
- [ ] Rollback capability validated

---

## Appendix A: Test Expectations Matrix

### Common to All Updaters

| Test | Expected Behavior |
|------|-------------------|
| File existence | `{artifact}-updater-workflow.yaml` exists in `tests/workflows/updaters/` |
| YAML parsing | Workflow parses without errors |
| Valid structure | `validateWorkflow()` returns `valid: true` |
| Name | `workflow.name === "{artifact}-updater-workflow"` |
| Artifact type | `workflow.artifact_type === "{artifact}"` |
| Backup enabled | `workflow.updater_config.backup_enabled === true` |
| All 6 EVOLVE phases | evaluate, validate, obtain, lock, verify, enable all present |
| Steps arrays | Each phase has `steps[]` with length >= 1 |
| Gates arrays | Each phase has `gates[]` with length >= 1 |
| Compensate section | `workflow.compensate` exists |
| Restore backup action | `workflow.compensate.lock` includes restore action |
| Iron laws | `workflow.iron_laws` exists |
| Backup law | `iron_laws` includes backup requirement |
| WorkflowEngine load | `engine.load()` succeeds, `engine.isValid === true` |

### Skill-Updater Specific

| Phase | Expected Steps |
|-------|----------------|
| EVALUATE | Load existing skill, parse frontmatter |
| VALIDATE | Check tool changes, consumer impact |
| LOCK | Create backup, apply changes |
| VERIFY | Check memory protocol |
| ENABLE | Update skill catalog |

### Agent-Updater Specific

| Phase | Expected Steps |
|-------|----------------|
| EVALUATE | Load existing agent, validate justification |
| VALIDATE | Check protected sections, dependency impact |
| VERIFY | Validate YAML frontmatter, required sections |
| ENABLE | Update memory, cleanup backup |

(Similar tables for hook, workflow, template, schema - see test files for complete expectations)

---

## Appendix B: EVOLVE Phase Mapping for Each Updater

### Skill Updater

| EVOLVE Phase | Steps | Gates | Compensate |
|--------------|-------|-------|------------|
| **EVALUATE** | 1. Load SKILL.md<br>2. Parse frontmatter<br>3. Validate change request | 1. Skill exists<br>2. Frontmatter valid<br>3. Justification provided | None (read-only) |
| **VALIDATE** | 1. Check tool changes<br>2. Check consumer impact<br>3. Identify protected sections | 1. No breaking tool removals<br>2. Impact documented | None (validation only) |
| **OBTAIN** | 1. WebSearch skill patterns<br>2. Analyze codebase<br>3. Document research | 1. 3+ sources<br>2. Report exists | None (research only) |
| **LOCK** | 1. Create backup<br>2. Apply changes (Edit)<br>3. Record lock | 1. Backup exists | Restore backup |
| **VERIFY** | 1. Validate structure<br>2. Check memory protocol<br>3. Run skill tests | 1. Structure valid<br>2. Memory protocol present | Restore backup |
| **ENABLE** | 1. Update skill catalog<br>2. Update learnings<br>3. Cleanup backup | 1. Catalog updated<br>2. Learnings recorded | Keep backup (manual) |

### Agent Updater

(Similar table with agent-specific steps: frontmatter validation, routing table updates, etc.)

### Hook Updater

(Similar table with hook-specific steps: test execution, function signature validation, etc.)

### Workflow Updater

(Similar table with workflow-specific steps: state machine validation, phase structure, etc.)

### Template Updater

(Similar table with template-specific steps: token validation, template-renderer compatibility, etc.)

### Schema Updater

(Similar table with schema-specific steps: backward compatibility, version bumping, etc.)

---

## Appendix C: Shared Utility Specifications

### backup-manager.cjs

**Purpose:** Create, restore, and cleanup artifact backups

**API:**

```javascript
/**
 * Create a timestamped backup of a file
 * @param {string} filePath - Original file path
 * @returns {Promise<string>} Backup file path
 */
async function createBackup(filePath)

/**
 * Restore a file from backup
 * @param {string} backupPath - Backup file path
 * @param {string} originalPath - Original file path
 * @returns {Promise<boolean>} Success status
 */
async function restoreBackup(backupPath, originalPath)

/**
 * Delete a backup file
 * @param {string} backupPath - Backup file path
 * @returns {Promise<boolean>} Success status
 */
async function cleanupBackup(backupPath)
```

**Implementation Notes:**
- Use `.claude/context/backups/` for backup storage
- Backup filename format: `{original-name}.{timestamp}.bak`
- Atomic writes via `atomic-write.cjs`
- Backup retention: Keep for 7 days, then auto-cleanup

### registry-updater.cjs

**Purpose:** Update CLAUDE.md routing tables, skill catalog, agent assignments

**API:**

```javascript
/**
 * Update artifact registry
 * @param {string} artifactType - 'agent'|'skill'|'hook'|'workflow'|'template'|'schema'
 * @param {string} name - Artifact name
 * @param {string} action - 'add'|'update'|'remove'
 * @param {object} metadata - Additional info (version, path, description)
 * @returns {Promise<boolean>} Success status
 */
async function updateRegistry(artifactType, name, action, metadata)
```

**Registry Locations:**

| Artifact Type | Registry Location(s) |
|---------------|----------------------|
| agent | `.claude/CLAUDE.md` Section 3 (routing table) |
| skill | `.claude/CLAUDE.md` Section 8.5 + `.claude/context/artifacts/catalogs/skill-catalog.md` |
| hook | `.claude/CLAUDE.md` Section 1.3 (enforcement hooks) |
| workflow | `.claude/CLAUDE.md` Section 8.6 (enterprise workflows) |
| template | `.claude/templates/README.md` (if exists) |
| schema | `.claude/schemas/README.md` (if exists) |

**Implementation Notes:**
- Use `Edit` tool for targeted updates
- Preserve existing formatting
- Validate registry structure after update
- Record update in learnings.md

### protected-section-validator.cjs

**Purpose:** Prevent destructive changes to critical artifact sections

**API:**

```javascript
/**
 * Validate changes don't affect protected sections
 * @param {string} artifactType - Type of artifact
 * @param {string} oldContent - Original content
 * @param {string} newContent - Modified content
 * @returns {object} { valid: boolean, violations: string[] }
 */
function validateProtectedSections(artifactType, oldContent, newContent)
```

**Protected Sections by Artifact Type:**

| Artifact Type | Protected Sections |
|---------------|-------------------|
| **Skill** | `## Purpose`, `## Memory Protocol (MANDATORY)` |
| **Agent** | `---` (frontmatter), `## Identity`, `## Core Capabilities` |
| **Hook** | Function signature (first `function` or `async function` declaration) |
| **Workflow** | `---` (frontmatter), `## State Machine` |
| **Template** | Required tokens (e.g., `{{PLAN_TITLE}}` in plan-template) |
| **Schema** | `required` fields (adding is OK, removing is violation) |

**Validation Logic:**

```javascript
// Example for skills
const protectedHeaders = ['## Purpose', '## Memory Protocol'];
for (const header of protectedHeaders) {
  const oldHas = oldContent.includes(header);
  const newHas = newContent.includes(header);

  if (oldHas && !newHas) {
    violations.push(`Protected section removed: ${header}`);
  }
}
```

---

## Appendix D: Creator-Updater Integration Pattern

### Before (Creator Only)

```javascript
// .claude/skills/skill-creator/scripts/create.cjs
async function createSkill(name, description, tools) {
  const skillPath = `.claude/skills/${name}/SKILL.md`;

  // Always create new skill
  await Write(skillPath, generateSkillContent(name, description, tools));

  // Update registries
  await updateSkillCatalog(name, description);
}
```

### After (Creator + Updater Integration)

```javascript
// .claude/skills/skill-creator/scripts/create.cjs
async function createSkill(name, description, tools, changes = null) {
  const skillPath = `.claude/skills/${name}/SKILL.md`;

  // Check if skill already exists
  if (fs.existsSync(skillPath)) {
    console.log(`Skill ${name} already exists. Invoking skill-updater...`);

    // Delegate to updater
    const updaterResult = await Skill({
      skill: 'skill-updater',
      args: {
        name: name,
        changes: changes || description, // Use description as change request if not provided
        justification: `Update requested via skill-creator`,
      }
    });

    if (updaterResult.success) {
      console.log(`Skill ${name} updated successfully to version ${updaterResult.version}`);
      return updaterResult;
    } else {
      console.error(`Skill update failed: ${updaterResult.error}`);
      console.log(`To create new skill with different name, use: --name ${name}-v2`);
      throw new Error(`Skill ${name} exists and update failed`);
    }
  }

  // Otherwise, proceed with creation
  console.log(`Creating new skill: ${name}`);
  await Write(skillPath, generateSkillContent(name, description, tools));
  await updateSkillCatalog(name, description);

  return { success: true, action: 'created', path: skillPath, version: '1.0.0' };
}
```

**Key Changes:**

1. **Existence Check:** Before writing, check if artifact exists
2. **Delegation:** If exists, invoke appropriate updater skill
3. **Return Value:** Standardized `{ success, action, path, version, error? }`
4. **User Guidance:** Suggest alternative if update fails (e.g., create with `-v2` suffix)

---

**END OF PLAN**

**Next Steps (for DEVELOPER agent):**
1. Read this plan thoroughly
2. Claim Phase 0 Task 0.1 (Research)
3. Begin constitution checkpoint process
4. DO NOT skip Phase 0 - research is MANDATORY
