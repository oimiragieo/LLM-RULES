<!-- Agent: architect | Task: #4 | Session: 2026-02-11 -->

# Architecture Review - 2026-02-11

## Executive Summary

Comprehensive architecture review of the agent-studio codebase revealing a **highly sophisticated but over-engineered** multi-agent orchestration framework. The system demonstrates excellent modularity and separation of concerns, but suffers from **accidental complexity**, **configuration sprawl**, and **orphaned artifact debt**.

**Health Score**: 7.2/10 (Good, but opportunities for simplification)

**Key Findings**:

- **CRITICAL**: Configuration scattered across 6+ locations creates single source of truth violations
- **HIGH**: Hook system has 39 active hooks + 50+ archived (57% archive rate suggests over-engineering)
- **HIGH**: 100 skills with 214 archived (68% archive rate indicates batch creation without validation)
- **MEDIUM**: Duplicate routing logic across 4 modules (routing-guard, routing-table, fuzzy-intent-matcher, semantic-router)
- **MEDIUM**: Memory subsystem has 15+ modules with overlapping responsibilities
- **LOW**: Excellent test coverage (passing), linting clean, well-documented

---

## CRITICAL ARCHITECTURE DEBT

### 1. Configuration Sprawl (P0 - Blocking Maintainability)

**Problem**: System configuration fragmented across 6+ locations with no single source of truth.

**Locations**:

1. `.claude/settings.json` (hook registration, tool config, 305 lines)
2. `.claude/config.yaml` (agent model assignments)
3. `package.json` (114 npm scripts, tool wiring)
4. `.env` (runtime environment overrides)
5. `.claude/lib/utils/environment.cjs` (environment variable defaults)
6. `.claude/context/runtime/workflow-state.json` (workflow state)

**Impact**:

- **Developer confusion**: "Which config file controls model selection?"
- **Inconsistent behavior**: env vars override config.yaml which overrides frontmatter
- **Merge conflicts**: 6 files touched per configuration change
- **Audit difficulty**: Security settings scattered across multiple files

**Evidence**:

```
Model resolution precedence (5 layers):
1. Explicit model: in Task() call
2. Agent frontmatter
3. config.yaml agents.{type}.model  ← RECOMMENDED but not enforced
4. Complexity defaults
5. Fallback: sonnet
```

**Recommendation**:

**CONSOLIDATE** to 2 configuration files:

- `.claude/config.yaml` → **static** config (agent models, hook registration, skill assignments)
- `.env` → **runtime** overrides (enforcement modes, feature flags)

**Migration Path**:

1. Create unified schema: `schemas/config-unified.json`
2. Migrate hook registration from settings.json → config.yaml
3. Deprecate environment.cjs defaults (use config.yaml)
4. Write migration script: `scripts/migrate-config-consolidation.mjs`
5. Update 23 references to old config locations

**Complexity Reduction**: 6 files → 2 files (67% reduction)

---

### 2. Hook System Over-Engineering (P0 - Performance & Complexity)

**Problem**: Hook system has **57% archive rate** (50+ archived hooks / 39 active) indicating systematic over-creation.

**Evidence**:

```
Active hooks: 39
Archived hooks: 50+ (in _archive/)
Archive rate: 57% (more than half built then abandoned)
```

**Hook Consolidation History** (from learnings.md):

- 2026-02-08: **6 wildcard hooks consolidated into 2** (`pre-tool-unified.cjs`, `post-tool-metrics-unified.cjs`)
- Result: **67% hook overhead reduction**

**Current Hook Distribution** (settings.json):

| Event Type         | Hooks  | Redundancy Risk |
| ------------------ | ------ | --------------- |
| PreToolUse         | 16     | HIGH            |
| PostToolUse        | 8      | MEDIUM          |
| PostToolUseFailure | 2      | LOW             |
| UserPromptSubmit   | 1      | LOW             |
| SessionEnd         | 2      | LOW             |
| Stop               | 2      | LOW             |
| **TOTAL**          | **31** | **-**           |

**Redundancy Examples**:

1. **Routing validation** appears in 3 hooks:
   - `routing-guard.cjs` (PreToolUse Task, Bash, Glob, Grep)
   - `pre-task-unified.cjs` (PreToolUse Task)
   - `spawn-prompt-assembler.cjs` (PreToolUse Task)

2. **Memory tracking** appears in 2 hooks:
   - `sync-memory-index.cjs` (PostToolUse Edit/Write)
   - `code-index-updater.cjs` (PostToolUse Edit/Write)

3. **Reflection workflow** appears in 2 hooks:
   - `unified-reflection-handler.cjs` (PostToolUse Task/TaskUpdate/Bash, PostToolUseFailure Task/TaskUpdate/Bash)
   - `reflection-queue-processor.cjs` (SessionEnd)

**Performance Impact**:

- **Hook execution time** measured by `post-tool-metrics-unified.cjs`
- **Target**: <100ms per hook
- **Red flags**: Hook >500ms (investigate), >1s (disable/refactor)
- **Current**: No hooks exceed 500ms (confirmed in learnings.md)

**Recommendation**:

**AUDIT and CONSOLIDATE** hooks with redundant responsibilities:

1. **Merge routing validation**: routing-guard + pre-task-unified → single routing hook
2. **Merge memory tracking**: sync-memory-index + code-index-updater → single indexer hook
3. **Document hook responsibility matrix**: Create `docs/HOOK_RESPONSIBILITY_MAP.md`
4. **Establish hook creation gate**: Hooks require ADR + integration plan before creation

**Complexity Reduction**: 31 hooks → ~20 hooks (35% reduction)

---

### 3. Artifact Orphan Debt (P1 - Integration Health)

**Problem**: Created artifacts not integrated with framework → "invisible artifacts" problem.

**Evidence** (from learnings.md):

- **Schema orphan rate**: 63% hollow schemas (stub-only, no validation logic)
- **Skill archive rate**: 68% (214 archived / 314 total created)
- **Integration gaps**: 70+ missing companion artifacts (workflows, hooks, schemas)
- **Root cause**: Batch creation optimizes throughput over depth

**Batch Creation Quality Issues**:

| Artifact Type | Batch Quality | Depth Issue                    |
| ------------- | ------------- | ------------------------------ |
| Rules         | 100%          | ✅ Simple structure (works)    |
| Commands      | 100%          | ✅ Thin delegation (works)     |
| Catalogs      | 100%          | ✅ List-based (works)          |
| **Schemas**   | **39%**       | ❌ Domain-specific (61% stubs) |
| **Skills**    | **32%**       | ❌ Depth required (68% dead)   |
| **Workflows** | **?**         | ❌ Multi-agent (unknown rate)  |

**Integration Health Score** (from ecosystem audit):

- **Baseline**: 98.2% across 58 agents (excellent)
- **BUT**: Integration scoring **excludes orphan artifacts** (only measures registered artifacts)
- **True health**: Unknown (orphans not counted)

**Recommendation**:

**IMPLEMENT TIERED ARTIFACT CREATION** (from learnings.md pattern):

| Tier       | Artifacts                              | Depth                                                | Quality Gate                  |
| ---------- | -------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| **Tier 1** | Complex (tdd, security, debugging)     | Full (SKILL.md + rule + schema + command + workflow) | ADR + integration plan + test |
| **Tier 2** | Domain (python-expert, typescript-pro) | Standard (SKILL.md + rule + lightweight schema)      | Integration checklist         |
| **Tier 3** | Simple (helper skills)                 | Minimal (SKILL.md + rule only)                       | Catalog registration only     |

**Action Items**:

1. **Audit 214 archived skills**: Determine if any should be restored (likely <10%)
2. **Audit 63% hollow schemas**: Delete or enhance (prefer deletion if no references)
3. **Create companion detection tool**: `.claude/tools/analysis/detect-missing-companions.mjs`
4. **Enforce post-creation integration**: `post-creation-integration.cjs` hook (exists, needs teeth)

---

## HIGH PRIORITY IMPROVEMENTS

### 4. Routing Logic Duplication (P1 - Consistency)

**Problem**: Intent → Agent routing logic duplicated across 4 modules with potential inconsistencies.

**Modules**:

1. **routing-table.cjs** (`.claude/lib/routing/`) - 200+ lines, keyword → agent map
2. **fuzzy-intent-matcher.cjs** (`.claude/lib/routing/`) - Semantic similarity scoring
3. **semantic-router.cjs** (`.claude/lib/routing/`) - Embedding-based routing (overlaps fuzzy?)
4. **routing-guard.cjs** (`.claude/hooks/routing/`) - Enforcement logic (blocks/warns misrouting)

**Duplication Evidence**:

- `routing-table.cjs` has **literal keyword map**: `{ bug: 'developer', docs: 'technical-writer' }`
- `fuzzy-intent-matcher.cjs` has **similar logic** but uses string similarity
- `semantic-router.cjs` uses **embeddings** for intent matching (different approach, same goal)
- `routing-guard.cjs` **re-implements** specialist-first checks (duplicates routing-table logic)

**Inconsistency Risk**:

- Updating routing keywords requires touching 2-4 files
- No single source of truth for "security → security-architect"
- Fuzzy vs semantic routing decision is unclear (when to use which?)

**Recommendation**:

**CONSOLIDATE** routing logic into single decision tree:

1. **Keep**: `routing-table.cjs` as **single source of truth** (keyword → agent map)
2. **Merge**: fuzzy-intent-matcher + semantic-router → `intelligent-router.cjs` (fuzzy fallback to semantic)
3. **Simplify**: routing-guard reads routing-table.cjs (no duplicate logic)
4. **Document**: Create `docs/ROUTING_DECISION_TREE.md` (when fuzzy, when semantic, when literal)

**Pattern**:

```javascript
// routing-table.cjs - Single source of truth
module.exports = {
  LITERAL_KEYWORDS: { bug: 'developer', docs: 'technical-writer' },
  INTENT_PATTERNS: { refactor: 'code-simplifier', cleanup: 'code-simplifier' },
  SPECIALIST_OVERRIDE: true, // Enforce specialist-first
};

// intelligent-router.cjs - Unified matching
function route(intent) {
  // 1. Try literal keyword match (routing-table.cjs)
  // 2. Try fuzzy match on intent patterns
  // 3. Fall back to semantic embeddings
  // 4. Default to developer (if no specialist match)
}
```

**Complexity Reduction**: 4 routing modules → 2 modules (50% reduction)

---

### 5. Memory Subsystem Complexity (P1 - Cognitive Load)

**Problem**: Memory management has **15+ modules** with overlapping responsibilities.

**Evidence** (from lib/memory/):

```
15 memory modules identified:
1. audit-trail-integration.cjs
2. entity-query.cjs
3. intent-analyzer.cjs
4. learnings-parser.cjs
5. memory-areas.cjs
6. memory-constants.cjs
7. memory-deduplicator.cjs
8. memory-entity-links.cjs
9. memory-extraction-writer.cjs
10. memory-extractor.cjs
11. memory-retention-config.cjs
12. memory-search.cjs
13. run-extraction-pipeline.cjs
14. session-summary.cjs
15. (5 prompt templates in prompts/)
```

**Overlap Examples**:

- **Memory search**: `memory-search.cjs` + `entity-query.cjs` (both query memory)
- **Memory extraction**: `memory-extractor.cjs` + `memory-extraction-writer.cjs` (extract vs write)
- **Memory constants**: `memory-constants.cjs` + `memory-areas.cjs` + `memory-retention-config.cjs` (all config)

**Cognitive Load**:

- **Question**: "How do I search memory for 'authentication patterns'?"
- **Answer**: Unclear whether to use `memory-search.cjs` or `entity-query.cjs` or both

**Recommendation**:

**CONSOLIDATE** memory modules into 4 cohesive layers:

1. **Storage Layer**: `memory-storage.cjs` (read/write memory files)
2. **Query Layer**: `memory-query.cjs` (search, entity-query, intent-analyzer → merged)
3. **Extraction Layer**: `memory-extraction.cjs` (extractor + writer → merged)
4. **Lifecycle Layer**: `memory-lifecycle.cjs` (retention, rotation, deduplication)

**Migration**:

- Create `lib/memory/core/` directory
- Move consolidated modules to core/
- Archive old modules to `lib/memory/_archive/`
- Update 20+ imports across codebase

**Complexity Reduction**: 15 modules → 4 modules (73% reduction)

---

### 6. Tool Catalog Wiring Inconsistency (P2 - Discoverability)

**Problem**: 66 active tools but only ~30% wired to package.json scripts (rest discoverable only via catalog).

**Evidence** (from tool-catalog.md):

```
Total Tools: 66 active
Wired to package.json: ~20 tools (estimate from package.json scripts)
Not scripted: ~46 tools (70%)
Wiring status: 3-state model (CLI/MCP/reference-only) but inconsistently applied
```

**Examples of unwired tools**:

- `detect-orphans.mjs` → not scripted (should be `pnpm detect:orphans`)
- `git-notes-verify.cjs` → not scripted (should be `pnpm verify:git-notes`)
- `ecosystem-assessor/` → not scripted (should be `pnpm assess:ecosystem`)

**Impact**:

- **Developer confusion**: "How do I run tool X?"
- **Reduced usage**: Unwired tools are invisible to `pnpm` tab-completion
- **Catalog drift**: tool-catalog.md "wiring status" manually maintained (error-prone)

**Recommendation**:

**SYSTEMATIC TOOL WIRING**:

1. **Audit all 66 tools**: Determine which should be CLI-executable vs library-only
2. **Wire CLI tools to package.json**: Use pattern `pnpm <category>:<tool-name>`
   - Analysis tools: `pnpm analyze:ecosystem`, `pnpm analyze:bottlenecks`
   - Validation tools: `pnpm validate:cujs`, `pnpm validate:routing`
   - Maintenance tools: `pnpm maintain:archive-memory`, `pnpm maintain:compact-db`
3. **Generate wiring manifest**: Create `.claude/tools/wiring-manifest.json` (auto-generated from package.json)
4. **Automate catalog sync**: `scripts/sync-tool-catalog.mjs` (reads wiring-manifest → updates tool-catalog.md)

**Benefit**: 100% wiring clarity + auto-updated catalog

---

## MEDIUM PRIORITY IMPROVEMENTS

### 7. Test Coverage Gaps for Complex Hooks (P2 - Quality)

**Problem**: Complex hooks (routing-guard, pre-tool-unified) have **limited test coverage** for edge cases.

**Evidence**:

- `tests/hooks/` has tests for individual hooks
- **BUT**: Multi-hook interaction tests missing
- **Example**: What happens when routing-guard blocks + spawn-prompt-validator warns simultaneously?

**Untested Scenarios**:

1. **Hook cascade failures**: Hook A blocks → Hook B never runs → unexpected state
2. **Hook timeout race conditions**: Hook takes 4.9s → timeout at 5s → partial state change
3. **Hook error recovery**: Hook crashes mid-execution → stdin/stdout left in bad state

**Recommendation**:

**ADD INTEGRATION TESTS** for hook pipelines:

1. Create `tests/hooks/integration/` directory
2. Test multi-hook scenarios: `test-routing-pipeline.test.cjs`
3. Test failure modes: `test-hook-cascade-failure.test.cjs`
4. Test timeout handling: `test-hook-timeout-recovery.test.cjs`

**Pattern**:

```javascript
// test-routing-pipeline.test.cjs
test('routing-guard blocks + spawn-prompt-validator warns', async () => {
  const result = await simulateToolUse('Task', {
    subagent_type: 'developer', // Wrong, should be code-simplifier
    prompt: 'Refactor code',
    // Omit task_id → spawn-prompt-validator warns
  });
  assert.strictEqual(result.blocked, true); // routing-guard blocks
  assert.strictEqual(result.warnings.length, 1); // validator warns
});
```

---

### 8. Agent Duplication: router.md Exists Twice (P2 - Confusion)

**Problem**: Router agent defined in TWO locations with potential inconsistency.

**Evidence**:

```
.claude/agents/router.md          ← Root level (older?)
.claude/agents/core/router.md     ← Core directory (canonical?)
```

**From learnings.md (2026-02-09)**:

> **Pattern**: `.claude/agents/router.md` (root) is a DUPLICATE of `.claude/agents/core/router.md` - delete root

**Impact**:

- **Which is canonical?** Edits to one may not reflect in the other
- **Routing discovery**: Agent registry points to which file?
- **Merge conflicts**: Changes to router behavior touch 2 files

**Recommendation**:

**DELETE** root-level `router.md`:

```bash
git rm .claude/agents/router.md
# Confirm .claude/agents/core/router.md is canonical
# Update any references (likely none, since registry uses core/)
```

---

### 9. Skill Catalog Size vs Usability Trade-off (P2 - Cognitive Load)

**Problem**: 100 skills create **discovery and selection paralysis** for agents.

**Evidence**:

- **Skill catalog**: 100 active skills across 14 categories
- **Archived skills**: 214 (68% archive rate suggests many created, few used)
- **Agent question**: "Which skill do I use for debugging?" → 11 options in "Core Development" category

**Skill Proliferation Examples**:

- **Security category**: 11 skills (security-architect, auth-security-expert, binary-analysis-patterns, memory-forensics, ...)
  - **Question**: When to use security-architect vs auth-security-expert?
  - **Answer**: Unclear without reading both SKILL.md files

- **Code search category**: 4 skills (ripgrep, code-semantic-search, code-structural-search, frontend-expert)
  - **Overlap**: All can search code, but with different approaches

**Recommendation**:

**CREATE SKILL DECISION TREE**:

1. **Document**: `.claude/docs/SKILL_SELECTION_GUIDE.md`
2. **Decision tree format**:

   ```
   Need to search code?
   ├─ Keyword search → ripgrep
   ├─ Concept search → code-semantic-search
   └─ Structural pattern → code-structural-search

   Need security review?
   ├─ Auth/JWT specific → auth-security-expert
   ├─ General OWASP/STRIDE → security-architect
   └─ Binary reverse engineering → binary-analysis-patterns
   ```

3. **Integrate with agent prompts**: Include skill decision tree in agent spawn templates

**Alternative**: **Consolidate overlapping skills** (e.g., merge 11 security skills → 3-4 core security skills)

---

### 10. Workflow Catalog Missing Canonical Structure (P2 - Discoverability)

**Problem**: 28 workflow files across 3 directories with no canonical structure or indexing.

**Evidence**:

```
28 workflows found:
- .claude/workflows/core/ (7 workflows)
- .claude/workflows/enterprise/ (3 workflows)
- .claude/workflows/operations/ (4 workflows)
- .claude/workflows/ (14 root-level workflows)
```

**Discovery Issues**:

- **Question**: "Which workflow do I use for architecture reviews?"
- **Answer**: Could be `architecture-review-skill-workflow.md` OR part of `enterprise/feature-development-workflow.md`

**Catalog Status**:

- No `workflow-catalog.md` exists (unlike skill-catalog, tool-catalog, etc.)
- **workflow-registry.json** exists but only tracks 2 workflows:
  ```json
  { "creator-registry.json", "workflow-registry.json" }
  ```
  (Appears incomplete or corrupted)

**Recommendation**:

**CREATE WORKFLOW CATALOG**:

1. Generate: `.claude/context/artifacts/catalogs/workflow-catalog.md`
2. Structure:
   - Category-based organization (Core, Enterprise, Operations, Skill-specific)
   - Quick reference table (Workflow | Purpose | When to Use | Agents)
   - Integration map (Which workflows invoke which agents)
3. Auto-generate via script: `scripts/generate-workflow-catalog.mjs`
4. Link from CLAUDE.md Section 8.6

---

## LOW PRIORITY NICE-TO-HAVES

### 11. Package.json Script Naming Inconsistency (P3 - DX)

**Problem**: 114 npm scripts use inconsistent naming patterns.

**Patterns Observed**:

- `validate:cujs` (colon separator)
- `validate-agents.mjs` (hyphen separator in file name)
- `memory:sync-json` (colon + hyphen hybrid)
- `test:framework:hooks` (double colon nesting)

**Recommendation**:

**STANDARDIZE** to single pattern: `<category>:<action>:<target>`

Examples:

- `validate:agents` (not `validate-agents`)
- `test:framework:hooks` (not `test:framework-hooks`)
- `memory:sync:json` (not `memory:sync-json`)

---

### 12. Hook Archive Directory Name Inconsistency (P3 - Clarity)

**Problem**: Archived hooks live in `_archive/` but some active hooks have nested `_archive/` subdirectories.

**Evidence**:

```
.claude/hooks/_archive/         ← Global archive (50+ hooks)
.claude/hooks/routing/_archive/ ← Routing-specific archive (1 hook)
.claude/hooks/monitoring/_archive/ ← Monitoring-specific archive
```

**Recommendation**:

**CONSOLIDATE** all archived hooks to single `.claude/hooks/_archive/` directory with subdirectories:

```
.claude/hooks/_archive/routing/
.claude/hooks/_archive/monitoring/
.claude/hooks/_archive/safety/
```

---

## POSITIVE ARCHITECTURE PATTERNS (KEEP)

### Excellent Separation of Concerns

**Pattern**: `.claude/lib/` for business logic, `.claude/hooks/` for lifecycle interception, `.claude/tools/` for CLI utilities.

**Evidence**:

- No hook directly implements business logic (all delegate to lib/)
- No lib/ module depends on hooks (clean dependency graph)
- Tools can be invoked standalone without framework

**Result**: **Testable, composable, maintainable**

---

### Hook Consolidation Success (2026-02-08)

**Achievement**: Reduced 6 wildcard hooks → 2 unified hooks (67% reduction).

**Pattern**:

- `pre-tool-unified.cjs` - Consolidates 11 safety checks
- `post-tool-metrics-unified.cjs` - Consolidates metrics collection

**Result**: **Faster hook execution, simpler debugging**

**Recommendation**: **Apply same pattern to routing hooks** (see Issue #4)

---

### Excellent Documentation Coverage

**Evidence**:

- 100% of agents have README-style descriptions
- 100% of skills have structured SKILL.md files
- CLAUDE.md is comprehensive (6000+ lines, but well-organized)

**Result**: **Low onboarding friction for new contributors**

---

### Clean Test Suite (No Failures)

**Evidence**:

```
pnpm lint → 0 errors
pnpm test → All tests passing
```

**Result**: **High confidence in core functionality**

---

## ARCHITECTURAL METRICS

| Metric                       | Count | Health       |
| ---------------------------- | ----- | ------------ |
| **Agents**                   | 59    | ✅ Healthy   |
| **Skills (active)**          | 100   | ⚠️ High      |
| **Skills (archived)**        | 214   | ❌ Bloat     |
| **Hooks (active)**           | 39    | ⚠️ High      |
| **Hooks (archived)**         | 50+   | ❌ Bloat     |
| **Tools (active)**           | 66    | ✅ Healthy   |
| **Tools (archived)**         | 25    | ✅ Healthy   |
| **Workflows**                | 28    | ✅ Healthy   |
| **Lib modules**              | 100+  | ⚠️ High      |
| **Configuration files**      | 6     | ❌ Sprawl    |
| **Routing modules**          | 4     | ❌ Dup       |
| **Memory modules**           | 15    | ❌ Complex   |
| **Integration health score** | 98.2% | ✅ Excellent |

---

## PRIORITIZED ACTION PLAN

### Immediate (This Week)

1. **DELETE duplicate router.md** (.claude/agents/router.md)
2. **CONSOLIDATE config** (settings.json → config.yaml for hook registration)
3. **DOCUMENT skill decision tree** (.claude/docs/SKILL_SELECTION_GUIDE.md)

### Short-term (This Month)

4. **MERGE routing logic** (4 modules → 2 modules)
5. **AUDIT 214 archived skills** (delete permanently or restore with justification)
6. **CONSOLIDATE memory modules** (15 → 4 layers)
7. **GENERATE workflow catalog** (.claude/context/artifacts/catalogs/workflow-catalog.md)

### Long-term (Next Quarter)

8. **CREATE tiered artifact creation process** (prevent future orphans)
9. **ADD hook integration tests** (test multi-hook scenarios)
10. **WIRE remaining tools to package.json** (66 tools → 100% wired)

---

## CONCLUSION

The agent-studio architecture is **fundamentally sound** with excellent separation of concerns, comprehensive documentation, and high integration health. However, **accidental complexity** from batch artifact creation and **configuration sprawl** creates unnecessary cognitive load.

**Key Insight**: The framework suffers from **over-engineering through batch creation** rather than **under-engineering through neglect**. This is a **quality problem, not capability problem**.

**Recommended Focus**:

1. **Simplify**: Reduce configuration locations, consolidate overlapping modules
2. **Document**: Create decision trees for skill/workflow selection
3. **Enforce**: Prevent orphan artifacts through post-creation integration gates
4. **Measure**: Track artifact usage (detect 0-reference artifacts automatically)

**Success Criteria**:

- Configuration files: 6 → 2 (67% reduction)
- Routing modules: 4 → 2 (50% reduction)
- Memory modules: 15 → 4 (73% reduction)
- Archived artifacts: Audit → delete or restore (target <10% archive rate)

**Estimated Effort**: 2-3 weeks (1 developer full-time)

---

## APPENDIX: STRUCTURAL HEALTH INDICATORS

### ✅ Healthy Patterns

- **Modular design**: lib/, hooks/, tools/ separation
- **Test coverage**: All tests passing, lint clean
- **Documentation**: Comprehensive skill/agent/workflow docs
- **Integration health**: 98.2% baseline across 58 agents
- **Hook consolidation**: 6 → 2 unified hooks (2026-02-08 success)

### ⚠️ Warning Signs

- **High archive rates**: 68% skills, 57% hooks (over-creation)
- **Configuration sprawl**: 6 files for config management
- **Module overlap**: 4 routing modules, 15 memory modules
- **Catalog drift**: Manual maintenance → errors

### ❌ Red Flags

- **Orphan artifacts**: 214 archived skills (invisible to framework)
- **Duplicate files**: router.md in 2 locations
- **Inconsistent wiring**: 70% tools not scripted to package.json
- **No workflow catalog**: 28 workflows, no index

---

**Report Generated**: 2026-02-11
**Agent**: architect
**Task**: #4
**Session**: Code Quality Audit - Phase 4 (Architecture Review)
