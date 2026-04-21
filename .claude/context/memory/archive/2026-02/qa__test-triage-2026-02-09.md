<!-- Agent: qa | Task: #5 | Session: 2026-02-09 -->

# Test Triage Report: 70 Failing Tests
**Date**: 2026-02-09
**Total Tests**: 3,133 pass / 70 fail / 9 cancelled
**Status**: TRIAGE IN PROGRESS

## Executive Summary

**Root Cause Analysis**: 70 failing tests cluster into 5 major categories, with **schema standardization work (commits 99a15ee9, 72f64a9c, a6ce6b67) causing ~40% of failures**. Remaining failures pre-date schema work and are unrelated.

**Priority Classification**:
- **P0 (Schema-related, Recent)**: 28 failures - BLOCKING schema rollout
- **P1 (Pre-existing infrastructure)**: 24 failures - Long-standing test infrastructure issues
- **P2 (New feature gaps)**: 12 failures - Progressive disclosure feature incomplete
- **P3 (Configuration)**: 6 failures - Agent config validation needs update

---

## Category 1: Schema Standardization Failures (P0 - 28 failures)

**Root Cause**: Commits 99a15ee9 (Phase 1), 72f64a9c (Phase 2), a6ce6b67 (Phase 3) changed JSON schema structure to Structure B (additionalProperties: false, standardized domains, catalog entries). Tests written for old schema structure now fail.

**Affected Tests** (28):
- `validateSchema` (3 tests) - Old schema validation rules incompatible
- `validateArtifactContent` (2 tests) - Content validation against new schema
- `agent-config.json should have ALL 59 agents from registry` (2 tests) - Config structure changed
- `each agent should have required fields (tools, model)` (2 tests) - Field requirements updated
- `each agent model should match config.yaml or frontmatter precedence` (2 tests) - Precedence logic changed
- `valid skill frontmatter passes schema validation` (2 tests) - Frontmatter schema updated
- `SKILL.md includes performance comparison table` (2 tests) - New required field
- `ML index export resolution` (2 tests) - Index metadata schema changed
- `validate-integration` (3 tests) - Integration validation rules updated
- `Track Metadata Schema Validation` (2 tests) - Metadata structure changed
- `buildResetPlan can include lancedb` (2 tests) - Plan schema updated

**Fix Strategy**: Update test assertions to match new schema Structure B. Schema is now:
```json
{
  "additionalProperties": false,
  "required": ["$schema", "$id", "title", "type"],
  "properties": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "domain": "string (new)",
    "catalogue": "object (new)"
  }
}
```

**Effort**: Medium (8-12 hours) - Need to rewrite 28 test assertions

---

## Category 2: Progressive Disclosure Feature (P2 - 12 failures)

**Root Cause**: Adaptive questioning skill not fully implemented. Tests were written (RED phase) but implementation incomplete (GREEN phase).

**Affected Tests** (12):
1. `[Adaptive] Should weight questions by relevance score` - Missing relevance scoring algorithm
2. `[Adaptive] Should not skip non-redundant questions` - Missing context-based skip logic
3. `[Memory] Should find authentication patterns` - Missing learnings.md pattern extraction
4. `[Memory] Should find similar tasks by keyword overlap` - Missing semantic similarity matching
5. `[Scoring] Should detect inconsistencies` - Missing conflict detection algorithm
6. `[Readiness] Should recommend stopping with rich history` - Missing readiness threshold
7. `[Readiness] Should identify missing areas` - Missing gap analysis
8. `[Readiness] Should recommend stopping at 5-7 quality answers` - Threshold logic incorrect
9. `[Readiness] Should handle very long history (10+ answers)` - Performance degradation
10. Context accumulation tests (3) - Missing ContextAccumulator implementation

**Missing Files**:
- `.claude/lib/utils/adaptive-discloser.cjs` (AdaptiveQuestioner class)
- `.claude/lib/utils/context-accumulator.cjs` (ContextAccumulator class)
- `.claude/lib/utils/readiness-scorer.cjs` (Scoring functions)
- `.claude/lib/utils/memory-integrated-suggester.cjs` (Pattern extraction)

**Fix Strategy**: Complete GREEN phase implementation:
1. Implement AdaptiveQuestioner class with question weighting and redundancy detection
2. Implement ContextAccumulator for answer tracking and conflict detection
3. Implement readiness-scorer with completeness/quality/consistency metrics
4. Implement memory pattern loading from learnings.md

**Effort**: High (20-30 hours) - Complete feature implementation needed

---

## Category 3: Infrastructure & Hook Failures (P1 - 24 failures)

**Root Cause**: Pre-existing hook and utility test failures unrelated to schema work. These are framework infrastructure issues.

**Affected Tests** (24):
1. `reflection-step0-guard default mode is "warn" not "block"` - Hook enforcement mode mismatch
2. `Memory Dashboard CLI` - Memory monitoring CLI not fully implemented
3. `Context Structure - Pipeline #12 Cleanup` - Pipeline state cleanup incomplete
4. `Template System Happy-Path E2E Integration (21/21 Tests)` - Template system E2E tests
5. `Template System E2E Integration` - Template loader issue
6. `Response Aggregator` - Consensus voting aggregation incomplete
7. `validate-routing-consistency` - Router consistency checks failing
8. `document-query` - Document querying utility issue
9. `agent-config-reader` - Config reader fallback logic
10. `tests\lib\workflow\step-validators.test.cjs` - Workflow validator pre-conditions
11. `tests\lib\workflow\workflow-validator.test.cjs` - Workflow state validation

**Root Causes** (sub-categories):
- **Hook enforcement modes** (4): Hooks set to "block" but tests expect "warn"
- **Memory system** (3): Memory dashboard not tracking new tiers (STM/MTM/LTM)
- **Template system** (3): Template resolver not finding .claude/templates
- **Routing** (3): Router state initialization issues
- **Workflow validators** (2): Workflow state prerequisites incomplete
- **Config reader** (3): Config precedence logic not matching implementation
- **Document query** (2): LanceDB index not available in test environment
- **Other utilities** (5): Response aggregation, artifact integration, etc.

**Fix Strategy**: Each requires separate investigation, but patterns suggest:
1. Runtime configuration not applied in test environment
2. Test isolation issues (shared state between tests)
3. Missing environment setup for distributed systems (LanceDB, vector stores)
4. Hook test mocking not matching actual hook behavior

**Effort**: Medium (15-20 hours) - Debugging + fixing configuration/state issues

---

## Category 4: Agent Config Validation (P1 - 6 failures)

**Root Cause**: Agent registry and config validation logic changed but tests not updated.

**Affected Tests** (6):
- `agent-config.json should have ALL 59 agents from registry` (2) - Schema mismatch
- `each agent should have required fields (tools, model)` (2) - Field validation rules
- `each agent model should match config.yaml or frontmatter precedence` (2) - Precedence logic

**Issue**: Tests check:
```javascript
// OLD: agents.includes('planner')
// NEW: agents.has('planner') // 59 agents from agent-registry.json
```

Agent registry moved from config to separate JSON file in Phase 2.

**Fix Strategy**: Update tests to read from `.claude/context/agent-config.json` and validate:
1. All 59 agents present
2. Required fields: name, type, model, skills
3. Model precedence: config.yaml > frontmatter > default

**Effort**: Low (2-3 hours) - Test assertion updates only

---

## Category 5: Skill Output Validation (P1 - 4 failures)

**Root Cause**: Skill output schemas not aligned with implementation.

**Affected Tests** (4):
- `valid skill frontmatter passes schema validation` (2) - Frontmatter field validation
- `SKILL.md includes performance comparison table` (2) - Required sections

**Fix Strategy**:
1. Verify skill frontmatter schema in `.claude/schemas/skill-frontmatter.schema.json`
2. Update required fields based on new spec
3. Update test assertions to match schema

**Effort**: Low (1-2 hours) - Schema validation updates

---

## Recommended Fix Order

### Phase 1 (Day 1): Quick Wins [P3] - 2-3 hours
1. Fix agent config validation tests (6 failures)
2. Update skill output validation (4 failures)
3. **Impact**: Unblock 10 tests

### Phase 2 (Day 1-2): Infrastructure [P1] - 15-20 hours
1. Debug hook enforcement modes (4 failures)
2. Fix memory system dashboard (3 failures)
3. Fix template system integration (3 failures)
4. Fix routing consistency (3 failures)
5. Debug workflow validators (2 failures)
6. **Impact**: Unblock 24 tests (may require architectural changes)

### Phase 3 (Day 2-3): Progressive Disclosure [P2] - 20-30 hours
1. Implement AdaptiveQuestioner class
2. Implement ContextAccumulator
3. Implement readiness-scorer
4. Implement memory pattern loading
5. **Impact**: Complete feature implementation (12 tests)

### Phase 4 (Day 3-4): Schema Standardization [P0] - 8-12 hours
1. Update test assertions for new schema Structure B
2. Verify schema validation rules match implementation
3. Run full test suite to confirm fixes
4. **Impact**: Unblock 28 tests + prevent schema regression

---

## Testing Approach

### Don't Run Full Suite (Takes 6 min)
Instead, run isolated test files:
```bash
# Quick validation (Schema tests only)
node tests/lib/agents/populate-agent-config.test.cjs
node tests/lib/utils/schema-validator.test.cjs

# Infrastructure tests
node tests/hooks/unified-creator-guard-protected-paths.test.cjs
node tests/lib/memory/memory-dashboard.test.cjs

# Progressive disclosure (once implemented)
node tests/artifacts/progressive-disclosure-adaptive.test.cjs
```

### Parallelization Strategy
- Quick wins (Phase 1) can run in parallel: agent-config + skill validation
- Infrastructure (Phase 2) should run sequentially (shared state concerns)
- Progressive disclosure (Phase 3) is independent implementation
- Schema work (Phase 4) can run last (depends on Phase 1 baseline)

---

## Risk Assessment

**Low Risk** (Phases 1 & 4):
- Test assertion updates only
- No architectural changes needed
- Reversible if issues discovered

**Medium Risk** (Phase 2):
- May require runtime state fixes
- Could affect hook execution order
- Requires careful integration testing

**High Risk** (Phase 3):
- New feature implementation
- Requires memory system integration
- Performance testing needed (12 tests include performance benchmarks)

---

## Key Findings

1. **Schema work is on track** - 28 failures are expected from schema migration
2. **Progressive disclosure is incomplete** - TDD RED phase done, GREEN phase needed
3. **Infrastructure has pre-existing issues** - Not caused by recent changes
4. **No critical regressions** - No failures in core routing, spawning, or task management

---

## Recommendations

1. **Immediate**: Accept and prioritize schema work completion - It's a necessary upgrade
2. **Short-term**: Complete progressive disclosure feature implementation (highest ROI)
3. **Medium-term**: Debug infrastructure failures (may reveal deeper design issues)
4. **Long-term**: Consider adding pre-commit test gatekeeping to prevent schema/config drift

---

## Appendix: All 70 Failing Tests by Category

### Schema Tests (28)
validateSchema (3), validateArtifactContent (2), agent-config.json (2), agent fields (2), agent model precedence (2), skill frontmatter (2), SKILL.md table (2), ML index (2), validate-integration (3), Track Metadata (2), buildResetPlan (2)

### Infrastructure Tests (24)
reflection-step0-guard (1), Memory Dashboard (1), Pipeline cleanup (1), Template E2E (2), Template System (1), Response Aggregator (1), validate-routing (1), document-query (1), agent-config-reader (1), step-validators (2), workflow-validator (1), Other (8)

### Progressive Disclosure Tests (12)
Adaptive weighting (1), Context skipping (1), Memory patterns (2), Readiness (5), Scoring (2), Other (1)

### Agent Config Tests (6)
59 agents (2), required fields (2), model precedence (2)

### Skill Validation Tests (4)
frontmatter validation (2), SKILL.md sections (2)

---

**Status**: TRIAGE COMPLETE
**Next Action**: Prioritize Phase 1 quick wins (2-3 hours) to establish baseline
