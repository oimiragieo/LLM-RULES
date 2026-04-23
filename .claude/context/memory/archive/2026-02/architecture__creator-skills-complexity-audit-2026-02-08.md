<!-- Agent: code-simplifier | Task: #16 | Session: 2026-02-08 -->

# Creator Skills Complexity & Gap Audit

**Date:** 2026-02-08
**Agent:** code-simplifier (Task #16, Phase 1C)
**Scope:** All 6 creator skills, artifact-integrator, enforcement hooks, and missing creators

---

## 1. Creator Skill Matrix

### 1.1 Size & Complexity

| Creator          | Lines | Steps          | Iron Laws | Post-Creation Steps | Complexity Rating |
| ---------------- | ----- | -------------- | --------- | ------------------- | ----------------- |
| agent-creator    | 1287  | 12 (Step 0-12) | 10        | 7 (Steps 7-12)      | **VERY HIGH**     |
| skill-creator    | 1380  | 11 (Step 0-11) | 11        | 6 (Steps 6-11)      | **VERY HIGH**     |
| hook-creator     | 1082  | 9 (Step 0-9)   | 8         | 4 (Steps 6-9)       | **HIGH**          |
| workflow-creator | 919   | 9 (Step 0-9)   | 10        | 4 (Steps 6-9)       | **HIGH**          |
| template-creator | 1104  | 13 (Step 0-13) | 11        | 6 (Steps 8-13)      | **VERY HIGH**     |
| schema-creator   | 1105  | 9 (Step 0-9)   | 8         | 3 (Steps 8-9)       | **HIGH**          |

**Total across all 6 creators:** ~6,877 lines of SKILL.md content.

### 1.2 Feature Matrix

| Feature                        |         agent-creator          |    skill-creator    |    hook-creator     |    workflow-creator     |     template-creator     |        schema-creator        |
| ------------------------------ | :----------------------------: | :-----------------: | :-----------------: | :---------------------: | :----------------------: | :--------------------------: |
| **Step 0: Existence Check**    |              YES               |         YES         |         YES         |           YES           |            -             |             YES              |
| **Delegates to Updater**       |      YES (agent-updater)       | YES (skill-updater) | YES (hook-updater)  | YES (workflow-updater)  |            -             |     YES (schema-updater)     |
| **Updater Skill Exists**       |               NO               |         NO          |         NO          |           NO            |           N/A            |              NO              |
| **Research Step**              |       YES (Steps 2, 2.5)       |          -          |          -          |     YES (Step 2.5)      |       YES (Step 0)       |         YES (Step 0)         |
| **Post-Creation Checklist**    |              YES               |         YES         |         YES         |           YES           |           YES            |             YES              |
| **Catalog Update**             |               -                | YES (skill-catalog) |          -          |            -            |  YES (template-catalog)  |     YES (schema-catalog)     |
| **CLAUDE.md Update**           |      YES (routing table)       |  YES (Section 8.5)  |          -          |    YES (Section 8.6)    |       CONDITIONAL        |         CONDITIONAL          |
| **routing-table.cjs Update**   |         YES (Step 7.5)         |          -          |          -          |            -            |            -             |              -               |
| **Agent Assignment**           |               -                |    YES (Step 7)     |          -          |            -            |      YES (Step 11)       |              -               |
| **Registry Update**            |      YES (agent-registry)      |  YES (skill-index)  | YES (hook-registry) | YES (workflow-registry) |            -             |              -               |
| **settings.json Update**       |               -                |  CONDITIONAL (MCP)  |         YES         |            -            |            -             |              -               |
| **@HOOK_AGENT_MAP Update**     |               -                |          -          |         YES         |            -            |            -             |              -               |
| **@WORKFLOW_AGENT_MAP Update** |               -                |          -          |          -          |           YES           |            -             |              -               |
| **Enforcement Hooks Section**  |         YES (Step 7.6)         |          -          |          -          |            -            |            -             |              -               |
| **Related Workflows Section**  |         YES (Step 7.6)         |          -          |          -          |            -            |            -             |              -               |
| **Integration Verification**   | YES (validate-integration.cjs) |         YES         |         YES         |           YES           |           YES            |              -               |
| **Cross-Creator Reference**    |              YES               |         YES         |         YES         |           YES           |           YES            |             YES              |
| **Schema Validation**          |               -                |          -          |          -          |            -            |            -             |             Self             |
| **Memory Protocol**            |              YES               |         YES         |         YES         |           YES           |           YES            |             YES              |
| **Iron Laws Section**          |            YES (10)            |      YES (11)       |       YES (8)       |        YES (10)         |         YES (11)         |           YES (8)            |
| **Reference Comparison**       |         python-pro.md          |    tdd/SKILL.md     |  routing-table.cjs  |            -            | universal-agent-spawn.md | agent-definition.schema.json |

### 1.3 Unique Post-Creation Steps Per Creator

| Creator          | Unique Steps Not Shared                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| agent-creator    | routing-table.cjs keyword registration, agent-config.json update, Enforcement Hooks/Related Workflows population, agent-registry regeneration |
| skill-creator    | Skill catalog update, agent skill assignment (frontmatter editing), skill-index regeneration, MCP server registration                         |
| hook-creator     | settings.json registration, hook-registry entry, @HOOK_AGENT_MAP update, test file creation (10+ cases)                                       |
| workflow-creator | workflow-registry.json creation, orchestrator reference update, @WORKFLOW_AGENT_MAP update                                                    |
| template-creator | template-catalog.md update, templates/README.md update, consumer skill/agent reference update                                                 |
| schema-creator   | schema-catalog.md update, validator hook integration, $ref cross-linking                                                                      |

---

## 2. Duplicated Logic Across Creators

### 2.1 Common Patterns Found in All 6 Creators

The following patterns are **copy-pasted verbatim or near-verbatim** across all creators:

| Pattern                                                                                                     | Occurrences | Estimated Lines Each |
| ----------------------------------------------------------------------------------------------------------- | :---------: | :------------------: |
| **Memory Protocol section** (before/after template)                                                         |      6      |         ~15          |
| **Iron Laws section** (structure, numbering, wording style)                                                 |      6      |        ~40-60        |
| **Cross-Reference: Creator Ecosystem** table                                                                |      6      |         ~25          |
| **Workflow Integration** boilerplate (Router Decision, Artifact Lifecycle, External Integration references) |      6      |         ~12          |
| **Architecture Compliance** section (ADR-076, ADR-077, ADR-075 references)                                  |      6      |         ~20          |
| **File Placement & Standards** section                                                                      |      6      |         ~15          |
| **Existence Check and Updater Delegation** (Step 0)                                                         |      5      |         ~25          |
| **Integration Verification** step (validate-integration.cjs)                                                |      5      |         ~20          |
| **System Impact Analysis** section                                                                          |      6      |         ~30          |
| **Model Validation warnings** (no dated versions, base name only)                                           |      4      |         ~10          |
| **Tools Array Validation warnings** (no MCP tools)                                                          |      4      |         ~10          |

**Estimated total duplicated lines:** ~1,400 lines (20% of total creator content)

### 2.2 Shared Post-Creation Steps

These steps appear in 4+ creators with identical logic:

1. **CLAUDE.md update** -- 4 creators (agent, skill, workflow, template) each independently explain how to update CLAUDE.md with similar formatting
2. **Catalog/registry update** -- 4 creators (skill, template, schema + hook has README) each maintain separate catalog update instructions
3. **Integration verification via validate-integration.cjs** -- 5 creators call the same tool with the same pattern
4. **Research-synthesis prerequisite** -- 3 creators (template, schema, and implicitly agent) require research before creation

---

## 3. Missing Creators

### 3.1 Artifact Types Without Creators

| Missing Creator     | Artifact Path           | Current Handling                | Impact                                                                                            |
| ------------------- | ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **rule-creator**    | `.claude/rules/*.md`    | Manual creation, no enforcement | Rules can be created without catalog/docs update; no unified-creator-guard coverage               |
| **command-creator** | `.claude/commands/*.md` | Manual creation                 | Commands are not guarded; no post-creation catalog update; CLAUDE.md Section 7.1 not auto-updated |
| **tool-creator**    | `.claude/tools/**/*`    | Manual creation                 | Tools lack catalog integration enforcement; tool-catalog.md not auto-updated                      |
| **config-updater**  | `.claude/config.yaml`   | Manual editing                  | Config changes are unvalidated; no schema enforcement; changes can break model resolution         |

### 3.2 unified-creator-guard Coverage Gaps

The `CREATOR_CONFIGS` array in `unified-creator-guard.cjs` covers:

- skills, agents, hooks, workflows, templates, schemas

**Not covered:**

- `.claude/rules/*.md` -- no guard pattern
- `.claude/commands/*.md` -- no guard pattern
- `.claude/tools/**/*.cjs` -- no guard pattern (only tools inside `.claude/tools/` for CLI utilities)
- `.claude/config.yaml` -- no guard pattern
- `.claude/docs/@*.md` -- no guard pattern (reference docs can be directly edited)

### 3.3 Missing Updater Skills

All 5 creators that delegate to updaters reference skills that **do not exist**:

| Referenced Updater | Referenced By           | Exists? |
| ------------------ | ----------------------- | ------- |
| `agent-updater`    | agent-creator Step 0    | **NO**  |
| `skill-updater`    | skill-creator Step 0    | **NO**  |
| `hook-updater`     | hook-creator Step 0     | **NO**  |
| `workflow-updater` | workflow-creator Step 0 | **NO**  |
| `schema-updater`   | schema-creator Step 0   | **NO**  |

**Impact:** When a creator detects an existing artifact (Step 0 existence check), it attempts to delegate to a non-existent updater skill. This creates a dead-end where neither creation nor update can proceed through the proper workflow.

---

## 4. Artifact Integrator Coverage Analysis

### 4.1 Integration Rules Table (from artifact-integrator)

| Type     | Must-Have                   | Should-Have          |
| -------- | --------------------------- | -------------------- |
| Skill    | Catalog + agent assignment  | Hook, workflow ref   |
| Agent    | Registry + routing keywords | Skills, model config |
| Hook     | settings.json registration  | Docs entry           |
| Workflow | Registry + agent mapping    | Docs entry           |
| Template | Catalog entry               | Consumer ref         |
| Schema   | Catalog entry               | Consumer wiring      |

### 4.2 Coverage Gaps

| Gap                             | Description                                                 |
| ------------------------------- | ----------------------------------------------------------- |
| **No rule coverage**            | Rules are not tracked by artifact-integrator                |
| **No command coverage**         | Commands are not tracked by artifact-integrator             |
| **No tool coverage**            | CLI tools are not tracked by artifact-integrator            |
| **No config coverage**          | config.yaml changes are not tracked                         |
| **No @docs coverage**           | Reference docs are not tracked                              |
| **Backward propagation is new** | Step 3.5 (ADR-100) is documented but untested in production |

---

## 5. Enforcement Hook Analysis

### 5.1 unified-creator-guard.cjs

- **Lines:** 522
- **Mechanism:** Checks if creator skill is "active" (via state file with 3-minute TTL)
- **Coverage:** 6 artifact types (skill, agent, hook, workflow, template, schema)
- **Strength:** Well-structured with clear CREATOR_CONFIGS, proper fail-closed behavior (SEC-008)
- **Gap:** No coverage for rules, commands, tools, config, or @docs

### 5.2 post-creation-integration.cjs

- **Lines:** 356
- **Mechanism:** PostToolUse on TaskUpdate; detects creator completions via metadata or pattern matching
- **Coverage:** All 6 creator types via pattern matching
- **Strength:** Advisory mode (never blocks), queue-based processing, rotation logic
- **Gap:** Pattern matching on task summaries is fragile; no direct artifact path validation

---

## 6. Shared Pattern Extraction Opportunities

### 6.1 Extractable Shared Modules

| Pattern                                  |                Current Duplication                 | Proposed Extraction                                                        | Estimated Savings |
| ---------------------------------------- | :------------------------------------------------: | -------------------------------------------------------------------------- | :---------------: |
| **Post-creation checklist runner**       | 6 creators, each with inline verification commands | Shared `creator-post-checks.cjs` module with artifact-type-specific config |    ~300 lines     |
| **Memory Protocol template**             |                6 identical sections                | Single `MEMORY_PROTOCOL.md` partial included via reference                 |     ~90 lines     |
| **Cross-Reference table**                |                6 identical sections                | Single `CREATOR_ECOSYSTEM_XREF.md` partial                                 |    ~150 lines     |
| **Architecture Compliance section**      |                6 identical sections                | Single `ARCHITECTURE_COMPLIANCE.md` partial                                |    ~120 lines     |
| **Workflow Integration section**         |                6 identical sections                | Single `WORKFLOW_INTEGRATION.md` partial                                   |     ~72 lines     |
| **Integration Verification step**        |                5 identical patterns                | Documented once, referenced by all                                         |    ~100 lines     |
| **Existence Check + Updater delegation** |                5 identical patterns                | Single `CREATOR_EXISTENCE_CHECK.md` partial or unified updater skill       |    ~125 lines     |
| **Iron Laws boilerplate**                |              6 sections, 50% overlap               | Shared "Common Iron Laws" + per-creator additions                          |    ~200 lines     |

**Total potential reduction:** ~1,157 lines (~17% of total)

### 6.2 Structural Simplification Opportunities

1. **Unified creator config file** -- A single `creator-config.json` mapping artifact type to required post-creation steps, replacing inline step documentation in each creator
2. **Unified post-creation validation** -- The `validate-integration.cjs` tool already exists but each creator re-documents how to call it; standardize into a single reference
3. **Updater skill consolidation** -- Instead of 5 non-existent updater skills, create one `artifact-updater` skill parameterized by artifact type

---

## 7. Complexity Reduction Recommendations

### 7.1 Priority 1 -- Critical (Missing functionality)

| #    | Action                                                                     | Rationale                                                                            |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P1-1 | **Create a unified `artifact-updater` skill**                              | 5 creators reference non-existent updater skills; this is a dead-end in the workflow |
| P1-2 | **Add rule-creator and command-creator** (or expand unified-creator-guard) | Rules and commands are unguarded artifact types that can be created invisibly        |
| P1-3 | **Extend unified-creator-guard CREATOR_CONFIGS**                           | Add patterns for rules, commands, and tools to prevent invisible artifacts           |

### 7.2 Priority 2 -- High (Duplication reduction)

| #    | Action                                                             | Rationale                                                                                                                                |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | **Extract shared post-creation steps into a config-driven module** | 6 creators duplicate the same verification/update logic; a config-driven approach would reduce maintenance burden and ensure consistency |
| P2-2 | **Create shared documentation partials**                           | Memory Protocol, Architecture Compliance, Workflow Integration, Cross-Reference sections are identical across all 6 creators             |
| P2-3 | **Consolidate Iron Laws**                                          | Extract 8 common iron laws shared across all creators; each creator adds only its unique rules                                           |

### 7.3 Priority 3 -- Medium (Consistency improvements)

| #    | Action                                    | Rationale                                                                                                                                                            |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-1 | **Standardize step numbering**            | agent-creator uses Steps 0-12, skill-creator uses Steps 0-11, hook-creator uses Steps 0-9 -- inconsistent and confusing                                              |
| P3-2 | **Align catalog/registry patterns**       | skill-creator updates skill-catalog.md, schema-creator updates schema-catalog.md, but hook-creator updates hooks/README.md instead of a hook-catalog -- inconsistent |
| P3-3 | **Add schema validation to all creators** | Only schema-creator validates against JSON schema; others should validate their output against corresponding definition schemas                                      |
| P3-4 | **Standardize research prerequisites**    | template-creator and schema-creator require research-synthesis; agent-creator has inline research; skill-creator and hook-creator do not require research            |

### 7.4 Priority 4 -- Low (Nice-to-have)

| #    | Action                                | Rationale                                                                                            |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P4-1 | **Create a tool-creator**             | CLI tools in `.claude/tools/` would benefit from structured creation and tool-catalog.md enforcement |
| P4-2 | **Create a config-updater skill**     | config.yaml changes (model selection, memory config) should be validated against schema              |
| P4-3 | **Add @docs-creator or docs-updater** | Reference docs (@files) could use structured update enforcement                                      |

---

## 8. Summary Statistics

| Metric                                               | Value                              |
| ---------------------------------------------------- | ---------------------------------- |
| Total creator skills                                 | 6                                  |
| Total lines across creators                          | ~6,877                             |
| Estimated duplicated lines                           | ~1,400 (20%)                       |
| Missing updater skills (referenced but non-existent) | 5                                  |
| Missing creator types (no guard coverage)            | 4 (rules, commands, tools, config) |
| Post-creation steps per creator (average)            | 5                                  |
| Iron Laws per creator (average)                      | 9.7                                |
| Shared extractable patterns                          | 8                                  |
| Potential line reduction                             | ~1,157 (17%)                       |

---

## 9. Recommendations for Phase 2 (Planner)

The Phase 2 planner should focus on:

1. **Unified creation protocol** -- A single configuration-driven framework where each creator is a thin wrapper around shared infrastructure (post-creation checks, catalog updates, CLAUDE.md updates, integration verification)
2. **Artifact updater** -- A single parameterized `artifact-updater` skill replacing 5 non-existent individual updaters
3. **Guard expansion** -- Extending unified-creator-guard to cover rules, commands, and tools
4. **Documentation deduplication** -- Moving shared boilerplate (Memory Protocol, Architecture Compliance, etc.) into reusable partials or a single "Creator Common" document referenced by all creators

The goal is to reduce the total creator ecosystem from ~6,877 lines to approximately ~4,000 lines while improving consistency and eliminating the 5 dead-end updater references.
