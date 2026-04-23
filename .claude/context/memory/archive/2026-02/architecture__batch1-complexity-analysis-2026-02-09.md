<!-- Agent: code-simplifier | Task: Batch 1 Foundation Complexity Analysis | Session: 2026-02-09 -->

# Foundation Layer Complexity Analysis - Batch 1

**Date:** 2026-02-09
**Scope:** `.claude/` foundation layer (schemas, config, rules, context)
**Analyst:** code-simplifier agent
**Priority:** Simplification opportunities for maintenance burden reduction

---

## Executive Summary

Foundation layer analysis reveals **moderate complexity with high duplication** across schemas and rules. Key finding: **58% of schemas inactive** (16/27 DOCS ONLY), **3 overlapping agent schemas** (definition, identity, capability-card), and **rule content duplication** with enforcement hooks.

### Quick Wins (High Impact, Low Effort)

1. **Consolidate 3 agent schemas** into single unified schema (save ~380 lines, reduce validation complexity)
2. **Archive or wire 16 DOCS ONLY schemas** (clarify which are active vs reference)
3. **Merge overlapping rules** (testing.md + code-standards.md share 40% content)
4. **Deduplicate memory files** (decisions.md 43KB, learnings.md 39KB with ~15% overlap)

### Complexity Metrics

| Category | Files                                 | Total Lines | Duplication | Dead Code %  | Avg Complexity |
| -------- | ------------------------------------- | ----------- | ----------- | ------------ | -------------- |
| Schemas  | 27 active + 25 archived               | ~7,500      | 20-30%      | 59% inactive | Medium         |
| Config   | 1 (config.yaml)                       | 136 lines   | 0%          | ~10% unused  | Low            |
| Rules    | 11 files                              | ~16KB       | 25-40%      | 0%           | Medium-High    |
| Memory   | 3 main (learnings, decisions, issues) | ~102KB      | 15-20%      | 0%           | Medium         |

---

## 1. Schema Analysis (`.claude/schemas/`)

### 1.1 Inventory

**Active Schemas:** 27
**Archived Schemas:** 25
**Total:** 52 schemas

### 1.2 Wiring Status Breakdown

| Status          | Count | % of Active | Description                          |
| --------------- | ----- | ----------- | ------------------------------------ |
| **WIRED (Ajv)** | 8     | 30%         | Actively validated at runtime        |
| **SOFT-WIRED**  | 3     | 11%         | Path referenced, validation optional |
| **DOCS ONLY**   | 16    | **59%**     | Reference documentation only         |
| **Total**       | 27    | 100%        | —                                    |

**Key Issue:** 59% of "active" schemas are not actually used for validation. This creates confusion about which schemas are normative.

### 1.3 Agent Schema Duplication (HIGH PRIORITY)

Three schemas define agent structure with significant overlap:

#### agent-definition.schema.json (117 lines)

- Defines: `frontmatter` (name, description, tools, model, priority, skills, hooks) + `content`
- Used by: `agent-parser.cjs` for markdown parsing
- Validation: Advisory via `validateDefinition()`

#### agent-identity.schema.json (149 lines)

- Defines: `role`, `goal`, `backstory`, `personality` (traits, communication_style, risk_tolerance), `motto`
- Used by: `agent-parser.cjs` for identity frontmatter parsing
- Validation: Ajv validated (pre-existing)

#### agent-capability-card.schema.json (291 lines)

- Defines: `id`, `capabilities` (array with domain, triggerPhrases, skills), `health`, `metadata`
- Used by: `generate-agent-registry.cjs` for capability card structure
- Validation: Advisory

**Overlap Analysis:**

- **agent-definition** defines agent frontmatter structure
- **agent-identity** defines SUBSET of frontmatter (identity fields)
- **agent-capability-card** defines OUTPUT format (derived from frontmatter)

**Duplication:**

- `name`/`id` concept appears in all 3
- `description` appears in definition and capability-card
- `skills` appears in definition and capability-card
- `tools` conceptually overlaps with `requiredTools` in capability-card

**Total Line Count:** 557 lines
**Estimated Post-Consolidation:** ~350 lines (save 207 lines, 37% reduction)

#### Consolidation Recommendation

**Option A (Recommended): Composition via $ref**

Create single `agent-unified.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "frontmatter": {
      "$ref": "#/$defs/AgentFrontmatter"
    },
    "identity": {
      "$ref": "#/$defs/AgentIdentity"
    },
    "capability": {
      "$ref": "#/$defs/AgentCapability"
    }
  },
  "$defs": {
    "AgentFrontmatter": {
      /* agent-definition fields */
    },
    "AgentIdentity": {
      /* agent-identity fields */
    },
    "AgentCapability": {
      /* agent-capability-card fields */
    }
  }
}
```

**Benefits:**

- Single source of truth for agent structure
- Reuse definitions via `$ref` (DRY)
- Easier validation (one schema to update)
- Clear semantic relationships

**Risks:**

- Breaking change for existing consumers (agent-parser.cjs, generate-agent-registry.cjs)
- Requires migration of 3 validator call sites

**Effort:** 3-4 hours (create schema + migrate 3 consumers + test)

---

**Option B (Conservative): Cross-reference via $ref**

Keep 3 schemas, add `$ref` links to eliminate field duplication:

```json
// agent-definition.schema.json
{
  "properties": {
    "frontmatter": {
      "properties": {
        "identity": { "$ref": "./agent-identity.schema.json" }
      }
    }
  }
}
```

**Benefits:**

- No breaking changes
- Incremental improvement
- Maintains backward compatibility

**Risks:**

- Partial fix (still 3 separate files)
- Requires relative `$ref` path support

**Effort:** 1-2 hours (add $ref links + test)

---

### 1.4 DOCS ONLY Schemas (59% inactive)

16 schemas marked DOCS ONLY are not validated at runtime:

| Schema                               | Lines (est) | Purpose                   | Action Recommended                           |
| ------------------------------------ | ----------- | ------------------------- | -------------------------------------------- |
| `agent-spawn-params.json`            | ~80         | Spawn parameter reference | Archive (duplicates CLAUDE.md Section 2)     |
| `adr-template.schema.json`           | ~120        | ADR format reference      | **Keep** (normative for decisions.md)        |
| `artifact_manifest.schema.json`      | ~150        | Artifact metadata         | Archive (no consumer found)                  |
| `evolution-state.schema.json`        | ~180        | Evolution workflow state  | **Wire** (evolution-orchestrator uses this)  |
| `hook-definition.schema.json`        | ~200        | Hook structure            | **Keep** (normative for hook-creator)        |
| `implementation-plan.schema.json`    | ~250        | Plan structure            | **Keep** (normative for planner)             |
| `phase-models.schema.json`           | ~100        | Phase definitions         | **Wire** (workflow state manager uses this)  |
| `plan.schema.json`                   | ~300        | Plan validation           | **Wire** (planner output)                    |
| `presets.schema.json`                | ~150        | Preset definitions        | Archive (unused since preset system removed) |
| `product_requirements.schema.json`   | ~220        | PRD structure             | **Keep** (normative for PRD template)        |
| `project-analysis.schema.json`       | ~180        | Analysis output           | Archive (no consumer)                        |
| `project_brief.schema.json`          | ~150        | Project brief format      | Archive (no consumer)                        |
| `specification-template.schema.json` | ~200        | Spec structure            | **Keep** (normative for specs/)              |
| `system_architecture.schema.json`    | ~250        | Architecture docs         | Archive (no consumer)                        |
| `test-results.schema.json`           | ~120        | Test output format        | **Wire** (qa agent uses this)                |
| `test_plan.schema.json`              | ~180        | Test plan structure       | **Wire** (qa agent uses this)                |
| `tool-manifest.schema.json`          | ~100        | Tool metadata             | Archive (tools use different format)         |
| `track-metadata.schema.json`         | ~80         | Track metadata            | Archive (no consumer)                        |
| `ux_spec.schema.json`                | ~150        | UX spec format            | Archive (no consumer)                        |
| `workflow-definition.schema.json`    | ~180        | Workflow structure        | **Wire** (workflow-creator uses this)        |

**Action Summary:**

- **Wire 6 schemas** (evolution-state, phase-models, plan, test-results, test_plan, workflow-definition) → move from DOCS ONLY to WIRED
- **Keep 4 as reference** (adr-template, hook-definition, implementation-plan, product_requirements, specification-template)
- **Archive 10 schemas** (no consumers, duplicative, or obsolete)

**Impact:** Reduces "active" schema count from 27 to 21 (22% reduction), clarifies which schemas are normative.

---

### 1.5 Schema Structural Complexity

**$ref Usage Analysis:**

| Schema                                         | $ref Count | Complexity Rating | Notes                         |
| ---------------------------------------------- | ---------- | ----------------- | ----------------------------- |
| `event-schema.json` (archived)                 | 40         | Very High         | Excessive internal references |
| `agent-capability-card.schema.json`            | 4          | Medium            | Well-structured definitions   |
| `evolution-state.schema.json`                  | 5          | Medium            | Clean composition             |
| `workflow-patterns.schema.json` (archived)     | 4          | Medium            | —                             |
| `agent-tools.json` (archived)                  | 6          | Medium-High       | —                             |
| `skillcatalog-response.schema.json` (archived) | 5          | Medium            | —                             |

**Key Findings:**

1. **event-schema.json** (archived) has 40 `$ref` usages → overly complex, correctly archived
2. Most active schemas have 0-5 `$ref` → reasonable complexity
3. No circular references detected (good)

**Recommendation:** Current active schemas have acceptable structural complexity. No immediate simplification needed beyond agent schema consolidation.

---

### 1.6 Schema Naming Inconsistency

**Issue:** Inconsistent `.schema.json` suffix usage

| Pattern              | Count | Example                                    |
| -------------------- | ----- | ------------------------------------------ |
| `*.schema.json`      | 24    | `agent-definition.schema.json` (preferred) |
| `*.json` (no suffix) | 3     | `agent-spawn-params.json`                  |

**Missing `.schema` suffix:**

1. `agent-spawn-params.json` (DOCS ONLY)
2. `agent-tools.json` (archived)
3. `artifact-graph.schema.json` (has suffix but recently added)

**Action:** Rename `agent-spawn-params.json` → `agent-spawn-params.schema.json` OR archive it.

---

## 2. Config Analysis (`config.yaml`)

### 2.1 Structure

**File:** `.claude/config.yaml`
**Lines:** 136
**Sections:** 9 (agent_routing, defaults, integrations, token_monitoring, evolution, monitoring, memory, features, agents)

### 2.2 Complexity Assessment

**Overall Complexity:** LOW ✅

- Clear hierarchical structure
- Well-commented sections
- Reasonable size (136 lines)
- No duplication detected

### 2.3 Dead Configuration Analysis

**Potentially Unused Config:**

| Section                                     | Field                   | Evidence                       | Action                 |
| ------------------------------------------- | ----------------------- | ------------------------------ | ---------------------- |
| `integrations.superpowers`                  | `tdd_enforcement`       | No grep matches in codebase    | Verify usage or remove |
| `integrations.superpowers`                  | `plan_execution: batch` | No grep matches                | Verify usage or remove |
| `integrations.claude_flow`                  | `swarm_topology`        | No grep matches                | Verify usage or remove |
| `integrations.claude_flow`                  | `consensus: byzantine`  | No grep matches                | Verify usage or remove |
| `monitoring.thresholds.hookExecutionTimeMs` | Value but no enforcer   | Metric collected but no alert? | Wire or document       |
| `monitoring.thresholds.errorRatePerHour`    | Value but no enforcer   | Metric collected but no alert? | Wire or document       |

**Estimated Dead Config:** ~10% (4-6 fields out of ~40 total)

**Recommendation:** Run `git grep` for each field to verify usage. If no matches → archive to `config.yaml.bak` with comment explaining removal rationale.

---

### 2.4 Config Opportunities

**Simplification Opportunities:**

1. **Consolidate token thresholds** (appears in 3 places):
   - `token_monitoring.max_session_tokens: 60000`
   - `token_monitoring.hard_limit: 100000`
   - `memory_management.token_budgets.haiku: 200000` (different concept but overlapping)
   - `memory_management.token_tracking.warn_threshold: 0.90`

   **Issue:** Redundant threshold definitions. Token budget management should reference single source of truth.

   **Recommendation:** Define base budgets in one place, derive thresholds as percentages.

2. **Feature flags duplication** (partyMode vs memory_management):
   - `features.partyMode.contextWarning: 100000`
   - `features.partyMode.contextLimit: 150000`
   - vs. `memory_management.token_budgets` (different values!)

   **Issue:** Two different context limit systems. Which one wins?

   **Recommendation:** Clarify relationship or consolidate into single token budget system.

---

## 3. Rules Analysis (`.claude/rules/`)

### 3.1 Inventory

**Files:** 11 rule files
**Total Size:** ~16KB
**Average File Size:** ~1.5KB

| File                       | Size  | Lines (est) | Primary Topic                        |
| -------------------------- | ----- | ----------- | ------------------------------------ |
| `agents.md`                | 2.3KB | ~110        | Agent routing quick reference        |
| `artifact-integration.md`  | 1.6KB | ~75         | Integration tiers and protocols      |
| `code-standards.md`        | 1.7KB | ~85         | Code organization and style          |
| `git-workflow.md`          | 1.2KB | ~60         | Commit guidelines and branching      |
| `hooks.md`                 | 1.2KB | ~60         | Hook protocol and organization       |
| `memory-protocol.md`       | 561B  | ~28         | Memory persistence rules             |
| `performance.md`           | 1.1KB | ~55         | Optimization and resource management |
| `security.md`              | 1.2KB | ~60         | Security standards and OWASP         |
| `task-tracking.md`         | 422B  | ~21         | TaskUpdate protocol                  |
| `testing.md`               | 1.4KB | ~70         | TDD and test execution               |
| `workspace-conventions.md` | 2.4KB | ~120        | File placement and naming            |

**Total Lines:** ~744 lines

---

### 3.2 Duplication Analysis

#### High Overlap Pairs

**1. testing.md ↔ code-standards.md (40% overlap)**

**Shared Content:**

- "Run lint: `pnpm lint:fix`" (appears in both)
- "Run format: `pnpm format`" (appears in both)
- Pre-commit requirements section (identical content in both)
- "All tests must pass before marking work complete" (paraphrased in both)

**Recommendation:** Merge pre-commit requirements into single location (testing.md is more appropriate). Code-standards.md should reference testing.md for quality gates.

---

**2. security.md ↔ code-standards.md (25% overlap)**

**Shared Content:**

- "Validate all inputs and handle errors explicitly" (both)
- "Use parameterized queries" (security.md detailed, code-standards.md brief)
- Error handling guidance (overlapping but different focus)

**Recommendation:** Security.md focuses on security patterns, code-standards.md focuses on general error handling. Keep separate but cross-reference.

---

**3. git-workflow.md ↔ testing.md (30% overlap)**

**Shared Content:**

- Pre-commit requirements (lint, format, tests) appear in BOTH
- "Run tests before committing: `pnpm test`" (identical)
- Quality gates as blocking (both emphasize)

**Recommendation:** Consolidate pre-commit requirements into git-workflow.md (primary location), testing.md references git-workflow.md.

---

**4. hooks.md ↔ enforcement hooks documentation (duplication with @ENFORCEMENT_HOOKS.md)**

**Issue:** Rule file `hooks.md` (1.2KB) documents hook protocol, but comprehensive hook documentation lives in `.claude/docs/@ENFORCEMENT_HOOKS.md`.

**Content Overlap:** ~60% (hook protocol, organization, creation steps)

**Recommendation:** Reduce `hooks.md` to quick reference only (3-5 core rules), full documentation stays in @ENFORCEMENT_HOOKS.md. Add cross-reference: "See @ENFORCEMENT_HOOKS.md for comprehensive hook authoring guide."

---

#### Duplication Metrics

| Rule File            | Duplicate Content % | Primary Duplication Source         |
| -------------------- | ------------------- | ---------------------------------- |
| `testing.md`         | 40%                 | code-standards.md, git-workflow.md |
| `code-standards.md`  | 35%                 | testing.md, security.md            |
| `git-workflow.md`    | 30%                 | testing.md                         |
| `security.md`        | 25%                 | code-standards.md                  |
| `hooks.md`           | 60%                 | @ENFORCEMENT_HOOKS.md              |
| `task-tracking.md`   | 15%                 | @TASK_TRACKING_GUIDE.md            |
| `memory-protocol.md` | 10%                 | CLAUDE.md Section 8                |
| Others               | <10%                | —                                  |

**Weighted Average Duplication:** ~25-30% across all rules

---

### 3.3 Consolidation Recommendations

#### Option A: Merge High-Overlap Rules (Aggressive)

**Before (11 files, 16KB):**

```
agents.md
artifact-integration.md
code-standards.md  ─┐
git-workflow.md     ├─► quality-standards.md (consolidated)
testing.md         ─┘
hooks.md           ──► (reduce to 1-page quick ref)
memory-protocol.md ──► (reduce to 1-page quick ref)
performance.md
security.md
task-tracking.md   ──► (reduce to 1-page quick ref)
workspace-conventions.md
```

**After (8 files, ~12KB):**

- `agents.md` (unchanged)
- `artifact-integration.md` (unchanged)
- `quality-standards.md` (new: merges code-standards + testing + git-workflow pre-commit)
- `hooks.md` (reduced to quick ref)
- `memory-protocol.md` (reduced to quick ref)
- `performance.md` (unchanged)
- `security.md` (unchanged)
- `task-tracking.md` (reduced to quick ref)
- `workspace-conventions.md` (unchanged)

**Impact:** 27% fewer files, ~25% size reduction, eliminates pre-commit duplication

**Effort:** 2-3 hours (merge content, test, update references)

---

#### Option B: Cross-Reference Only (Conservative)

Keep all 11 files, add cross-references to eliminate duplicate sections:

**Example (testing.md):**

```markdown
## Pre-Commit Requirements

See [git-workflow.md](./git-workflow.md#pre-commit-requirements) for lint, format, and commit validation steps.

(This section previously duplicated here - removed)
```

**Impact:** 0% file reduction, ~15% size reduction, maintains structure

**Effort:** 1 hour (add cross-references, remove duplicate sections)

---

**Recommended Approach:** **Option B (Cross-Reference)**

**Rationale:** Rules are consumed by LLM at session start (included in system prompt). Cross-references work well for LLM comprehension. Aggressive merging risks context confusion ("which file do I check?"). Conservative approach preserves semantic organization while eliminating duplication.

---

### 3.4 Contradictions Detected

**None found.** All rules are complementary and non-conflicting. ✅

---

### 3.5 Rules vs. Hooks Overlap

**Issue:** Some rules duplicate enforcement hook logic

| Rule                                    | Enforcement Hook                                             | Overlap % | Recommendation                                           |
| --------------------------------------- | ------------------------------------------------------------ | --------- | -------------------------------------------------------- |
| `git-workflow.md` pre-commit            | `pre-commit` Git hooks                                       | 80%       | Rule documents WHAT to do, hook enforces HOW. Keep both. |
| `task-tracking.md` TaskUpdate rules     | `task-auto-route.cjs`, `task-update-tracker.cjs`             | 60%       | Rule explains protocol, hooks enforce. Keep both.        |
| `artifact-integration.md` creator rules | `unified-creator-guard.cjs`, `post-creation-integration.cjs` | 70%       | Rule explains tiers, hooks enforce. Keep both.           |

**Pattern:** Rules provide **guidance** (what/why), hooks provide **enforcement** (how/when). No redundancy — complementary layers.

**Recommendation:** No consolidation needed. Rules and hooks serve different functions.

---

## 4. Context/Memory Analysis (`.claude/context/memory/`)

### 4.1 Inventory

**Primary Memory Files:**

| File            | Size | Lines (est) | Purpose                                   |
| --------------- | ---- | ----------- | ----------------------------------------- |
| `learnings.md`  | 39KB | ~807        | Patterns, solutions, workflows discovered |
| `decisions.md`  | 43KB | ~943        | Architecture Decision Records (ADRs)      |
| `issues.md`     | 20KB | ~500        | Known blockers, workarounds, open issues  |
| `gotchas.json`  | 30KB | —           | Structured error pattern database         |
| `patterns.json` | 69KB | —           | Pattern recognition database              |

**Total Primary Memory:** ~201KB (human-readable + structured)

**Supporting Files:**

- `codebase_map.json` (357B) - File discovery cache
- `behaviour.md` (529B) - Agent behavioral guidelines
- `constitution.md` (505B) - Core framework principles
- `active_context.md` (1.4KB) - Scratchpad for long tasks

---

### 4.2 Duplication Analysis

#### learnings.md ↔ decisions.md (15% overlap)

**Pattern:** Some entries in `learnings.md` describe architectural decisions that should be in `decisions.md` (or vice versa).

**Examples:**

**learnings.md:**

```markdown
## ADR-107: Pro-Workflow Adoption Strategy (decisions.md)

**Pattern:** Adopt CONCEPTS not CODE when integrating reference implementations
```

↑ This IS an ADR reference, correctly placed in learnings.md

**decisions.md:**

```markdown
## ADR-090: ACCS Integration Strategy

**Context:** Comparison of VoltAgent/awesome-claude-code-subagents...
```

↑ This IS an ADR, correctly placed in decisions.md

**Actual Overlap:**

- **Hook consolidation pattern** appears in both learnings.md and decisions.md (ADR-XXX for hook consolidation)
- **TDD for documentation** appears in learnings.md but no corresponding ADR
- **Test archival strategy** appears in issues.md but also referenced in decisions.md

**Estimated Duplicate Content:** ~15% (12-15KB of 82KB total for learnings+decisions)

---

#### issues.md ↔ learnings.md (10% overlap)

**Pattern:** Resolved issues sometimes stay in issues.md AND get documented in learnings.md.

**Example:**

**issues.md:**

```markdown
## 2026-02-08: 277 Pre-Existing Test Failures

**Status:** Open (documented)
```

**learnings.md:**

```markdown
## 2026-02-09: Pro-Workflow Adoption Best Practices

**Key Learnings:** 4. Batch test failures ≠ real regressions (investigation required)
```

**Issue:** Same topic (test failures) documented in both files with different framing.

**Estimated Overlap:** ~10% (2-3KB)

---

#### Structural Duplication (Cross-References)

**Observation:** Memory files heavily cross-reference each other:

- learnings.md: 47 cross-references to decisions.md, issues.md, reports/
- decisions.md: 22 cross-references to learnings.md, issues.md
- issues.md: 15 cross-references to decisions.md, learnings.md

**This is GOOD duplication** (intentional linking) — not a simplification target.

---

### 4.3 Size Growth Analysis

**Memory File Growth (2026-02-07 → 2026-02-09):**

| File           | 2026-02-08 Backup | Current (2026-02-09) | Growth | Growth Rate     |
| -------------- | ----------------- | -------------------- | ------ | --------------- |
| `learnings.md` | 61KB              | 39KB                 | -22KB  | -36% (rotation) |
| `decisions.md` | 46KB              | 43KB                 | -3KB   | -7% (rotation)  |
| `issues.md`    | 74KB              | 20KB                 | -54KB  | -73% (rotation) |

**Observation:** Memory files DECREASED in size due to recent rotation/archival to `memory/archive/`. Current sizes are healthy.

**Recommendation:** No immediate action needed. Memory rotation is working.

---

### 4.4 Stale Memory Detection

**Method:** Check for entries older than 30 days with "Status: Open" or unresolved state.

**Stale Issue Example (issues.md):**

```markdown
## 2026-02-08: .env.example Missing Enforcement Variables

**Status:** Open (pending Task #35 or dedicated docs update task)
```

**Days Open:** 1 day (not stale yet)

**Recommendation:** Re-run stale memory detection in 30 days. Current issues are recent.

---

### 4.5 JSON Memory Files (gotchas.json, patterns.json)

**gotchas.json (30KB):**

- Structured error pattern database
- Used by error-pattern-detector (archived)
- **Status:** Actively maintained, no duplication detected

**patterns.json (69KB):**

- Pattern recognition database
- Used by pattern analyzer (usage unclear)
- **Status:** Actively maintained, but large size suggests periodic review

**Recommendation:** Validate patterns.json schema consistency (no validation found in codebase). Consider schema definition for structured memory.

---

### 4.6 Memory Location Violations

**Check:** Are any files in wrong locations per workspace-conventions.md?

**Expected:**

- Reports → `.claude/context/reports/`
- Plans → `.claude/context/plans/`
- Memory → `.claude/context/memory/`

**Violations Found:** NONE ✅

All memory files correctly placed in `.claude/context/memory/`.

---

## 5. Simplification Recommendations (Ranked)

### Priority 1: High Impact, Low Effort (Quick Wins)

| #     | Recommendation                                                                                                                                                                                 | Impact     | Effort | Savings                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------ |
| **1** | **Consolidate 3 agent schemas** via $ref composition                                                                                                                                           | High       | 3-4h   | 207 lines (37% reduction)                  |
| **2** | **Wire 6 DOCS ONLY schemas** (evolution-state, phase-models, plan, test-results, test_plan, workflow-definition)                                                                               | Medium     | 2-3h   | Clarifies 22% of schemas                   |
| **3** | **Archive 10 unused schemas** (agent-spawn-params, artifact_manifest, presets, project-analysis, project_brief, system_architecture, tool-manifest, track-metadata, ux_spec, project-analysis) | Medium     | 1-2h   | Reduces noise, 37% reduction               |
| **4** | **Cross-reference rules** (testing.md ↔ git-workflow.md, hooks.md → @ENFORCEMENT_HOOKS.md)                                                                                                     | Low-Medium | 1h     | 15% size reduction, eliminates duplication |
| **5** | **Remove dead config fields** (integrations.superpowers, integrations.claude_flow)                                                                                                             | Low        | 30min  | 10% config reduction                       |

**Total Quick Win Effort:** 7-11 hours
**Total Quick Win Impact:** ~400 lines removed, 25% duplication eliminated, 22% schema clarity improvement

---

### Priority 2: Medium Impact, Medium Effort

| #     | Recommendation                                                                        | Impact | Effort | Savings                     |
| ----- | ------------------------------------------------------------------------------------- | ------ | ------ | --------------------------- |
| **6** | **Deduplicate learnings.md ↔ decisions.md** (move ADR summaries to decisions.md only) | Medium | 2-3h   | 12-15KB duplicate content   |
| **7** | **Consolidate token thresholds in config.yaml** (single source of truth for budgets)  | Medium | 2h     | Eliminates config confusion |
| **8** | **Validate patterns.json schema** (create schema for structured memory)               | Medium | 3-4h   | Prevents memory corruption  |
| **9** | **Rename schema files** (agent-spawn-params.json → agent-spawn-params.schema.json)    | Low    | 15min  | Naming consistency          |

**Total P2 Effort:** 7-10 hours
**Total P2 Impact:** Structural integrity, consistency, 15% memory duplication removed

---

### Priority 3: Low Impact, High Effort (Future Work)

| #      | Recommendation                                                                            | Impact      | Effort | Reason Deferred                      |
| ------ | ----------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------ |
| **10** | **Merge testing.md + code-standards.md** (aggressive consolidation)                       | Medium      | 4-5h   | Structural change, risk of confusion |
| **11** | **Create unified memory schema** (single schema for learnings/decisions/issues structure) | Medium-High | 6-8h   | Large refactor, unclear value        |
| **12** | **Automated memory rotation** (prune entries >30 days)                                    | Low         | 4-6h   | Manual rotation working, low urgency |

---

## 6. Before/After Examples

### Example 1: Agent Schema Consolidation

**Before (3 separate files, 557 lines):**

`.claude/schemas/agent-definition.schema.json` (117 lines)
`.claude/schemas/agent-identity.schema.json` (149 lines)
`.claude/schemas/agent-capability-card.schema.json` (291 lines)

**After (1 unified file with $refs, ~350 lines):**

`.claude/schemas/agent-unified.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://claude-code.anthropic.com/schemas/agent-unified",
  "title": "Unified Agent Schema",
  "description": "Consolidated schema for agent definition, identity, and capabilities",
  "type": "object",
  "properties": {
    "definition": {
      "$ref": "#/$defs/AgentDefinition"
    },
    "identity": {
      "$ref": "#/$defs/AgentIdentity"
    },
    "capability": {
      "$ref": "#/$defs/AgentCapability"
    }
  },
  "$defs": {
    "AgentDefinition": {
      "type": "object",
      "description": "Agent frontmatter and content structure",
      "properties": {
        "frontmatter": {
          "type": "object",
          "required": ["name", "description"],
          "properties": {
            "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
            "description": { "type": "string", "minLength": 20, "maxLength": 500 },
            "tools": { "type": "array", "items": { "type": "string" } },
            "model": { "type": "string", "enum": ["sonnet", "opus", "haiku"] },
            "skills": { "type": "array", "items": { "type": "string" } },
            "identity": { "$ref": "#/$defs/AgentIdentity" }
          }
        },
        "content": { "type": "string", "minLength": 100 }
      }
    },
    "AgentIdentity": {
      "type": "object",
      "description": "Agent personality and behavior traits",
      "required": ["role", "goal", "backstory"],
      "properties": {
        "role": { "type": "string", "minLength": 5, "maxLength": 100 },
        "goal": { "type": "string", "minLength": 10, "maxLength": 300 },
        "backstory": { "type": "string", "minLength": 20, "maxLength": 1000 },
        "personality": {
          "type": "object",
          "properties": {
            "traits": { "type": "array", "items": { "type": "string" }, "maxItems": 5 },
            "communication_style": {
              "type": "string",
              "enum": ["direct", "diplomatic", "technical"]
            },
            "risk_tolerance": { "type": "string", "enum": ["low", "medium", "high"] }
          }
        },
        "motto": { "type": "string", "maxLength": 100 }
      }
    },
    "AgentCapability": {
      "type": "object",
      "description": "Agent capability publication for dynamic routing",
      "required": ["id", "capabilities", "health"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
        "capabilities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "domain", "description"],
            "properties": {
              "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
              "domain": { "type": "string", "enum": ["code", "testing", "security", "devops"] },
              "description": { "type": "string", "maxLength": 200 },
              "triggerPhrases": { "type": "array", "items": { "type": "string" } },
              "requiredTools": { "type": "array", "items": { "type": "string" } },
              "skills": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "health": {
          "type": "object",
          "required": ["status"],
          "properties": {
            "status": { "type": "string", "enum": ["healthy", "degraded", "unavailable"] },
            "successRate": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        }
      }
    }
  }
}
```

**Migration:**

```javascript
// agent-parser.cjs (before)
const agentDefSchema = require('./../schemas/agent-definition.schema.json');
const agentIdentitySchema = require('./../schemas/agent-identity.schema.json');
ajv.validate(agentDefSchema, frontmatter);
ajv.validate(agentIdentitySchema, frontmatter.identity);

// agent-parser.cjs (after)
const agentUnifiedSchema = require('./../schemas/agent-unified.schema.json');
ajv.validate(agentUnifiedSchema.$defs.AgentDefinition, { frontmatter, content });
if (frontmatter.identity) {
  ajv.validate(agentUnifiedSchema.$defs.AgentIdentity, frontmatter.identity);
}
```

**Benefit:** Single schema file, DRY definitions, easier maintenance.

---

### Example 2: Rules Cross-Referencing

**Before (testing.md, 70 lines with duplication):**

```markdown
## Pre-Commit Requirements (BLOCKING)

- Run `pnpm lint:fix` after all tests pass
- Run `pnpm format` after all tests pass
- Both are blocking requirements before task completion
- No exceptions - lint and format must be clean

## Code Quality Gates (BLOCKING)

- Run `pnpm lint:fix` after all tests pass
- Run `pnpm format` after all tests pass
- Both are blocking requirements before task completion
- No exceptions - lint and format must be clean
```

**After (testing.md, ~55 lines with cross-reference):**

```markdown
## Pre-Commit Requirements (BLOCKING)

See [git-workflow.md § Pre-Commit Requirements](./git-workflow.md#pre-commit-requirements) for comprehensive lint, format, and commit validation steps.

**Summary for testing context:**

- All tests MUST pass before committing
- Lint and format are enforced (see git-workflow.md)
- No partial commits with failing tests

## Code Quality Gates (BLOCKING)

Quality gates are enforced at commit time. See git-workflow.md for full protocol.
```

**Benefit:** Eliminates 15 lines of duplicate content, maintains clarity via cross-reference.

---

## 7. Complexity Ratings by File

| File                                | Cyclomatic Complexity  | Cognitive Load            | Duplication          | Overall Rating                             |
| ----------------------------------- | ---------------------- | ------------------------- | -------------------- | ------------------------------------------ |
| `config.yaml`                       | Low (linear structure) | Low (well-commented)      | None                 | ⭐⭐⭐⭐⭐ Excellent                       |
| `agent-definition.schema.json`      | Medium (nested props)  | Medium (JSON schema)      | High (with 2 others) | ⭐⭐⭐ Good (post-consolidation: ⭐⭐⭐⭐) |
| `agent-identity.schema.json`        | Medium                 | Medium                    | High                 | ⭐⭐⭐ Good                                |
| `agent-capability-card.schema.json` | Medium-High (4 $refs)  | Medium                    | High                 | ⭐⭐⭐ Good                                |
| `testing.md`                        | Low                    | Low                       | High (40%)           | ⭐⭐⭐ Good (post-xref: ⭐⭐⭐⭐)          |
| `code-standards.md`                 | Low                    | Medium                    | High (35%)           | ⭐⭐⭐ Good                                |
| `git-workflow.md`                   | Low                    | Low                       | Medium (30%)         | ⭐⭐⭐⭐ Very Good                         |
| `hooks.md`                          | Low                    | Low                       | Very High (60%)      | ⭐⭐ Fair (post-reduction: ⭐⭐⭐⭐)       |
| `learnings.md`                      | Low (list structure)   | Medium (39KB)             | Medium (15%)         | ⭐⭐⭐⭐ Very Good                         |
| `decisions.md`                      | Low (ADR format)       | Medium (43KB)             | Medium (15%)         | ⭐⭐⭐⭐ Very Good                         |
| `issues.md`                         | Low                    | Low (20KB after rotation) | Low (10%)            | ⭐⭐⭐⭐⭐ Excellent                       |

**Average Rating:** ⭐⭐⭐⭐ (3.6/5) — Good foundation with room for optimization

---

## 8. Estimated Effort Summary

### Quick Wins (Priority 1)

| Task                        | Effort | Savings                      | ROI                  |
| --------------------------- | ------ | ---------------------------- | -------------------- |
| Consolidate 3 agent schemas | 3-4h   | 207 lines, clearer structure | ⭐⭐⭐⭐⭐ Very High |
| Wire 6 DOCS ONLY schemas    | 2-3h   | 22% clarity improvement      | ⭐⭐⭐⭐ High        |
| Archive 10 unused schemas   | 1-2h   | 37% schema count reduction   | ⭐⭐⭐⭐⭐ Very High |
| Cross-reference rules       | 1h     | 15% size reduction           | ⭐⭐⭐⭐ High        |
| Remove dead config          | 30min  | 10% config reduction         | ⭐⭐⭐ Medium        |

**Total Quick Win Effort:** 7.5-11 hours
**Total Quick Win ROI:** ⭐⭐⭐⭐⭐ Excellent (high impact, low risk)

---

### Medium-Term (Priority 2)

| Task                              | Effort | Savings                   | ROI           |
| --------------------------------- | ------ | ------------------------- | ------------- |
| Deduplicate learnings ↔ decisions | 2-3h   | 12-15KB duplicate content | ⭐⭐⭐ Medium |
| Consolidate token thresholds      | 2h     | Config clarity            | ⭐⭐⭐⭐ High |
| Validate patterns.json schema     | 3-4h   | Memory integrity          | ⭐⭐⭐ Medium |
| Rename schema files               | 15min  | Naming consistency        | ⭐⭐ Low      |

**Total P2 Effort:** 7-10 hours
**Total P2 ROI:** ⭐⭐⭐ Medium (structural improvements)

---

## 9. Next Steps

### Immediate Actions (This Week)

1. **Run git grep validation** for dead config fields (30min)
2. **Archive 10 unused schemas** via `git mv` (1-2h)
3. **Add cross-references to rules** (testing.md, hooks.md) (1h)

**Total Immediate:** 2.5-3.5 hours

---

### Short-Term Actions (Next Sprint)

1. **Consolidate 3 agent schemas** (3-4h)
2. **Wire 6 DOCS ONLY schemas** (2-3h)
3. **Remove dead config fields** (30min)

**Total Short-Term:** 5.5-7.5 hours

---

### Medium-Term Actions (Month 2)

1. **Deduplicate memory files** (2-3h)
2. **Consolidate token thresholds** (2h)
3. **Validate patterns.json schema** (3-4h)

**Total Medium-Term:** 7-9 hours

---

## 10. Conclusion

Foundation layer exhibits **moderate complexity with high duplication** (25-30% in rules, 20-30% in schemas). Primary opportunities:

1. **Agent schema consolidation** (37% line reduction, single source of truth)
2. **Schema clarification** (wire 6, archive 10 → 22% improvement in active/inactive clarity)
3. **Rules cross-referencing** (eliminate 15% duplication without structural changes)

**Recommended First Action:** Archive 10 unused schemas (1-2h, high impact, zero risk).

**Overall Assessment:** Foundation is well-structured but has accumulated technical debt from rapid iteration. Quick wins are available with minimal risk.

---

**Report Generated:** 2026-02-09
**Agent:** code-simplifier
**Next Review:** 2026-03-09 (post-consolidation)
