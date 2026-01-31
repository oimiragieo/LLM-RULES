# Plan: Phase 2 - Runtime Skill Discovery (SkillCatalog Tool)

## Executive Summary

Design and implement SkillCatalog(), a runtime tool enabling agents to dynamically discover and select skills based on domain, category, tags, and agent type. This transforms static pre-injection (Phase 1) into dynamic runtime queries, allowing agents to discover new skills instantly without agent prompt modifications.

**Core Value**: Agents transition from "what skills do I have?" (static) to "what skills exist for this task?" (dynamic).

## Objectives

1. **Design SkillCatalog() Tool Specification** - Define tool signature, parameters, return format, and error handling
2. **Implement Query Engine** - Build filtering logic for domain/category/tag/agent-type queries
3. **Integrate with skill-index.json** - Leverage Phase 1A artifact as single source of truth
4. **Update Framework Documentation** - Add SkillCatalog to CLAUDE.md Section 1.4 and agent guides
5. **Create Comprehensive Tests** - Unit, integration, and performance tests (<100ms query target)
6. **Document Agent Usage Patterns** - When/how agents should use SkillCatalog vs pre-injected skills

## Success Criteria

- [ ] SkillCatalog tool specification complete and validated
- [ ] Query engine implemented with filtering (domain, category, tags, agent-type)
- [ ] All queries complete in <100ms (p95)
- [ ] Integration tests show agents successfully discovering skills at runtime
- [ ] CLAUDE.md Section 1.4 updated with SkillCatalog reference
- [ ] Agent documentation includes usage patterns and examples
- [ ] ADR-070 created documenting Runtime Skill Discovery pattern

## Context and Background

### Phase 1 Recap (Current State)

Phase 1 implemented **static skill pre-injection**:

```javascript
// Agent spawns with AVAILABLE_SKILLS section (15-20 skills)
// Pre-injected by router based on agent type
// Agent uses one if needed: Skill({ skill: 'tdd' })
```

**Limitations of Phase 1**:
- Skills hardcoded in agent spawn prompts
- New skills require agent prompt regeneration
- Agents cannot discover skills outside pre-selected list
- No runtime flexibility for task-specific skill selection

### Phase 2 Goal (Runtime Discovery)

Phase 2 adds **dynamic skill discovery**:

```javascript
// Agent queries available skills at runtime
const skills = SkillCatalog({ domain: 'testing' });
// Returns: ['tdd', 'qa-workflow', 'comprehensive-unit-testing-with-pytest']

// Agent selects best skill for current task
const bestSkill = skills.find(s => s.recommended);
Skill({ skill: bestSkill.name });
```

**Benefits**:
- ✅ Agents discover skills dynamically (not hardcoded)
- ✅ New skills instantly available (no agent changes)
- ✅ Task-specific skill selection (agent picks best fit)
- ✅ Query filters: domain, category, agent-type, tags
- ✅ Backward compatible with Phase 1 pre-injection

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research skill discovery patterns, validate technical approach, assess integration risks
**Duration**: 6-8 hours
**Parallel OK**: No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before implementing SkillCatalog:

- [ ] Minimum 3 WebSearch queries executed on skill discovery patterns
- [ ] Minimum 3 external sources consulted (IDE autocomplete, VS Code extensions, framework docs)
- [ ] Research report generated comparing query patterns (exact match vs fuzzy, synchronous vs async)
- [ ] Design decisions documented with rationale (ADR-070)

**Research Topics**:
1. **Tool Discovery Patterns**: How do IDEs/frameworks enable runtime capability discovery?
   - VS Code extension marketplace API
   - npm package discovery patterns
   - Claude Desktop skill/MCP tool registration
   - GitHub Actions marketplace search

2. **Query Performance**: Best practices for <100ms query targets
   - In-memory indexing patterns
   - Lazy loading vs pre-caching
   - Filter optimization strategies

3. **Integration Risks**: Potential conflicts with Phase 1
   - Backward compatibility requirements
   - Migration path for existing agents
   - Caching invalidation when new skills added

**Research Output**: `.claude/context/artifacts/research-reports/phase-2-skill-discovery-research.md`

#### Constitution Checkpoint

**CRITICAL VALIDATION**: Before proceeding to Phase 2A, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] Research report contains minimum 3 external sources with citations
   - [ ] All query patterns compared (exact match vs fuzzy search)
   - [ ] ADR-070 created: Runtime Skill Discovery Pattern

2. **Technical Feasibility**
   - [ ] Query approach validated (exact match recommended for simplicity)
   - [ ] skill-index.json confirmed as adequate data source
   - [ ] No blocking issues with in-memory caching

3. **Integration Review**
   - [ ] Backward compatibility with Phase 1 confirmed
   - [ ] Migration path for existing agents documented
   - [ ] No breaking changes to existing spawn templates

4. **Specification Quality**
   - [ ] Tool signature is clear and unambiguous
   - [ ] Return format includes all necessary fields (name, domain, description, requiredTools, tags)
   - [ ] Error handling covers all edge cases (no results, invalid filters, malformed queries)

**If ANY item fails, return to research phase. DO NOT proceed to implementation.**

#### Phase 0 Tasks

- [ ] **0.1** Research skill discovery patterns in IDEs and frameworks (~3 hours)
  - **Queries**: "VS Code extension discovery API", "npm package search patterns", "Claude MCP tool registration"
  - **Output**: `.claude/context/artifacts/research-reports/phase-2-skill-discovery-research.md`
  - **Verify**: Research report exists with 3+ sources

- [ ] **0.2** Document SkillCatalog design decisions (~2 hours)
  - **ADR**: ADR-070: Runtime Skill Discovery Pattern
  - **Output**: `.claude/context/memory/decisions.md`
  - **Verify**: ADR includes query approach (exact match), caching strategy (in-memory), and error handling

- [ ] **0.3** Validate backward compatibility with Phase 1 (~1 hour)
  - **Test**: Verify AVAILABLE_SKILLS (Phase 1) and SkillCatalog (Phase 2) can coexist
  - **Output**: Compatibility test results documented
  - **Verify**: No breaking changes to existing agent spawn prompts

**Success Criteria**: Research complete, ADR-070 created, constitution checkpoint passed (all 4 gates green)

---

### Phase 2A: Tool Specification & Design

**Purpose**: Define SkillCatalog tool signature, parameters, return format, and error handling
**Dependencies**: Phase 0 complete
**Duration**: 4-6 hours
**Parallel OK**: No (foundation for 2B-2D)

#### Tasks

- [ ] **2A.1** Define SkillCatalog tool signature (~2 hours)
  - **Spec**:
    ```javascript
    SkillCatalog(options?: {
      domain?: string,           // e.g., 'testing', 'research', 'security'
      category?: string,         // e.g., 'code-quality', 'architecture'
      agentType?: string,        // e.g., 'developer', 'qa', 'researcher'
      tags?: string[],           // e.g., ['async', 'performance']
      limit?: number             // max results (default: 10, max: 50)
    }): SkillResult[]
    ```
  - **Verify**: `cat .claude/context/plans/phase-2-skillcatalog-design-plan-20260131.md | grep "SkillCatalog("`

- [ ] **2A.2** Define SkillResult return format (~1 hour)
  - **Format**:
    ```javascript
    {
      name: 'tdd',
      domain: 'testing',
      category: 'test-driven-development',
      description: 'Test-driven development workflow',
      requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
      tags: ['testing', 'tdd', 'red-green-refactor'],
      recommended: true  // recommended for this agent type (if agentType filter used)
    }
    ```
  - **Verify**: `grep -A 10 "SkillResult" .claude/context/plans/phase-2-skillcatalog-design-plan-20260131.md`

- [ ] **2A.3** Design error handling and edge cases (~2 hours)
  - **Errors**:
    - "No skills found matching criteria" (lenient: suggest similar skills)
    - "Invalid domain/category" (strict: return empty array + suggestion)
    - "Agent type not recognized" (lenient: return all skills without recommendation flag)
  - **Edge Cases**:
    - Empty query (no filters) → return all skills (limited by `limit` param)
    - Multiple filters → AND logic (all must match)
    - Invalid `limit` (< 1 or > 50) → clamp to valid range
  - **Verify**: Test cases documented in plan

#### Phase 2A Verification Gate

```bash
# All specifications complete
grep -E "(SkillCatalog|SkillResult|error handling)" .claude/context/plans/phase-2-skillcatalog-design-plan-20260131.md && echo "✓ Spec complete"
```

**Success Criteria**: Tool signature, return format, and error handling fully specified

---

### Phase 2B: Implementation (Query Engine)

**Purpose**: Build filtering logic for domain/category/tag/agent-type queries with in-memory caching
**Dependencies**: Phase 2A complete
**Duration**: 8-10 hours
**Parallel OK**: No (sequential implementation)

#### Tasks

- [ ] **2B.1** Create `.claude/lib/tools/skill-catalog.cjs` (~3 hours)
  - **Implementation**:
    - Load skill-index.json at startup (in-memory cache)
    - Expose `SkillCatalog(options)` function
    - Apply filters sequentially (domain → category → tags → agentType)
    - Return limited results (default: 10, max: 50)
  - **Command**: `touch .claude/lib/tools/skill-catalog.cjs`
  - **Verify**: `ls -la .claude/lib/tools/skill-catalog.cjs`

- [ ] **2B.2** Implement domain filter (~1 hour)
  - **Logic**: `skills.filter(s => s.domain === options.domain)`
  - **Verify**: Unit test passes for domain filter

- [ ] **2B.3** Implement category filter (~1 hour)
  - **Logic**: `skills.filter(s => s.category === options.category)`
  - **Verify**: Unit test passes for category filter

- [ ] **2B.4** Implement tags filter (~2 hours)
  - **Logic**: `skills.filter(s => options.tags.every(tag => s.tags.includes(tag)))`
  - **Verify**: Unit test passes for tags filter (AND logic)

- [ ] **2B.5** Implement agentType filter with recommendation flag (~2 hours)
  - **Logic**:
    ```javascript
    // Map agentType to recommended skills
    const recommendations = {
      developer: ['tdd', 'code-reviewer', 'debugging'],
      qa: ['qa-workflow', 'tdd', 'comprehensive-unit-testing-with-pytest'],
      researcher: ['research-synthesis', 'arxiv-mcp']
    };

    // Filter and mark recommended
    skills.map(s => ({
      ...s,
      recommended: recommendations[options.agentType]?.includes(s.name) || false
    }));
    ```
  - **Verify**: Unit test passes for agentType filter + recommendation flag

- [ ] **2B.6** Add in-memory caching and cache invalidation (~1 hour)
  - **Caching**: Load skill-index.json once at startup, cache in module scope
  - **Invalidation**: Re-read skill-index.json when file modification detected
  - **Verify**: Performance test shows <50ms query time with caching

#### Phase 2B Error Handling

If any task fails:

1. Run: `git stash && git checkout -- .claude/lib/tools/skill-catalog.cjs`
2. Document: `echo "Phase 2B failed: $(date)" >> .claude/context/memory/issues.md`
3. Do NOT proceed to Phase 2C

#### Phase 2B Verification Gate

```bash
# All filters implemented
node .claude/lib/tools/skill-catalog.cjs --test && echo "✓ Query engine working"

# Performance test
time node -e "require('.claude/lib/tools/skill-catalog.cjs').SkillCatalog({ domain: 'testing' })" | grep -E "real.*0m0\.[0-9]{2}s" && echo "✓ <100ms query time"
```

**Success Criteria**: Query engine implemented, all filters functional, <100ms query performance

---

### Phase 2C: Integration with Framework

**Purpose**: Register SkillCatalog as a tool, update CLAUDE.md, and document agent usage
**Dependencies**: Phase 2B complete
**Duration**: 4-6 hours
**Parallel OK**: Partial (documentation can run in parallel with integration)

#### Tasks

- [ ] **2C.1** Register SkillCatalog in CLAUDE.md Section 1.4 (~2 hours) [⚡ parallel OK]
  - **Command**: `Edit .claude/CLAUDE.md` (add SkillCatalog to Core Tools table)
  - **Entry**:
    ```markdown
    | **SkillCatalog** | Capability Discovery | Query available skills by domain/category/tags | ✅ All agents |
    ```
  - **Verify**: `grep "SkillCatalog" .claude/CLAUDE.md | grep "Capability Discovery"`

- [ ] **2C.2** Update router documentation (~1 hour) [⚡ parallel OK]
  - **File**: `.claude/agents/core/router.md`
  - **Section**: Add "SkillCatalog Usage" section with examples
  - **Verify**: `grep -A 5 "SkillCatalog Usage" .claude/agents/core/router.md`

- [ ] **2C.3** Document agent usage patterns (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/docs/SKILL_CATALOG_GUIDE.md`
  - **Content**:
    - When to use SkillCatalog vs pre-injected skills
    - Query examples (domain, category, tags, agentType)
    - Best practices (caching results, filtering recommendations)
    - Integration with Skill() tool
  - **Verify**: `ls -la .claude/docs/SKILL_CATALOG_GUIDE.md`

- [ ] **2C.4** Make SkillCatalog available to all agents (~1 hour)
  - **Implementation**: Export SkillCatalog from `.claude/lib/tools/index.cjs`
  - **Verify**: `grep "SkillCatalog" .claude/lib/tools/index.cjs`

#### Phase 2C Verification Gate

```bash
# All integration points updated
grep "SkillCatalog" .claude/CLAUDE.md && \
grep "SkillCatalog" .claude/agents/core/router.md && \
ls .claude/docs/SKILL_CATALOG_GUIDE.md && \
echo "✓ Integration complete"
```

**Success Criteria**: SkillCatalog registered in CLAUDE.md, router documentation updated, usage guide created

---

### Phase 2D: Testing & Validation

**Purpose**: Create unit, integration, and performance tests for SkillCatalog
**Dependencies**: Phase 2C complete
**Duration**: 6-8 hours
**Parallel OK**: Partial (unit and integration tests can run in parallel)

#### Tasks

- [ ] **2D.1** Create unit tests for filter logic (~3 hours) [⚡ parallel OK]
  - **File**: `tests/lib/tools/skill-catalog.test.cjs`
  - **Tests**:
    - Domain filter (exact match)
    - Category filter (exact match)
    - Tags filter (AND logic)
    - AgentType filter (recommendation flag)
    - Limit parameter (default 10, max 50, clamping)
    - Empty query (returns all skills)
    - No results (returns empty array)
  - **Command**: `node --test tests/lib/tools/skill-catalog.test.cjs`
  - **Verify**: `echo $?` (exit code 0)

- [ ] **2D.2** Create integration tests (agents using SkillCatalog) (~3 hours) [⚡ parallel OK]
  - **File**: `tests/integration/skill-catalog-usage.test.cjs`
  - **Tests**:
    - Developer agent discovers testing skills
    - QA agent discovers QA workflow skills
    - Researcher agent discovers research skills
    - Agent selects recommended skill
    - Agent invokes discovered skill via Skill()
  - **Command**: `node --test tests/integration/skill-catalog-usage.test.cjs`
  - **Verify**: `echo $?` (exit code 0)

- [ ] **2D.3** Create performance tests (~2 hours)
  - **File**: `tests/performance/skill-catalog-performance.test.cjs`
  - **Tests**:
    - Query time <100ms (p95) for all filter combinations
    - In-memory caching reduces query time to <50ms
    - Cache invalidation triggers re-read correctly
  - **Command**: `node tests/performance/skill-catalog-performance.test.cjs`
  - **Verify**: `grep "PASS" tests/performance/skill-catalog-performance.test.cjs.log`

#### Phase 2D Verification Gate

```bash
# All tests passing
node --test tests/lib/tools/skill-catalog.test.cjs && \
node --test tests/integration/skill-catalog-usage.test.cjs && \
node tests/performance/skill-catalog-performance.test.cjs && \
echo "✓ All tests passing"
```

**Success Criteria**: All unit, integration, and performance tests passing

---

### Phase 2E: Documentation & ADR

**Purpose**: Create ADR-070, update learnings, and finalize documentation
**Dependencies**: Phase 2D complete
**Duration**: 3-4 hours
**Parallel OK**: Yes (all documentation tasks independent)

#### Tasks

- [ ] **2E.1** Create ADR-070: Runtime Skill Discovery Pattern (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/context/memory/decisions.md`
  - **Sections**:
    - **Context**: Phase 1 pre-injection limitations
    - **Decision**: Add SkillCatalog() tool for runtime discovery
    - **Alternatives Considered**: Fuzzy search (rejected - too complex), async queries (rejected - adds latency)
    - **Consequences**: +Dynamic discovery, -Slightly increased query overhead
  - **Verify**: `grep -A 10 "ADR-070" .claude/context/memory/decisions.md`

- [ ] **2E.2** Update learnings.md with Phase 2 patterns (~1 hour) [⚡ parallel OK]
  - **Entry**:
    ```markdown
    ## Phase 2: Runtime Skill Discovery (2026-01-31)

    ### Pattern: SkillCatalog() for dynamic skill queries
    - Agents can discover skills at runtime without pre-injection
    - Query filters: domain, category, tags, agentType
    - In-memory caching ensures <100ms query performance
    - Backward compatible with Phase 1 pre-injection

    ### Key Learnings
    - Exact match queries preferred over fuzzy search (simplicity + predictability)
    - In-memory caching critical for <100ms target
    - AgentType filter with recommendation flag guides skill selection
    ```
  - **Verify**: `grep "Phase 2: Runtime Skill Discovery" .claude/context/memory/learnings.md`

- [ ] **2E.3** Create usage examples in SKILL_CATALOG_GUIDE.md (~1 hour) [⚡ parallel OK]
  - **Examples**:
    1. Find testing skills: `SkillCatalog({ domain: 'testing' })`
    2. Find code review skills: `SkillCatalog({ domain: 'code', tags: ['review'] })`
    3. Find recommended skills for developer: `SkillCatalog({ agentType: 'developer', limit: 5 })`
    4. Find security skills: `SkillCatalog({ tags: ['security'] })`
  - **Verify**: `grep -c "SkillCatalog({" .claude/docs/SKILL_CATALOG_GUIDE.md` (≥4 examples)

#### Phase 2E Verification Gate

```bash
# All documentation complete
grep "ADR-070" .claude/context/memory/decisions.md && \
grep "Phase 2: Runtime Skill Discovery" .claude/context/memory/learnings.md && \
[ $(grep -c "SkillCatalog({" .claude/docs/SKILL_CATALOG_GUIDE.md) -ge 4 ] && \
echo "✓ Documentation complete"
```

**Success Criteria**: ADR-070 created, learnings updated, usage examples documented

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan (Phase 2: Runtime Skill Discovery), extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|-----------|----------|
| Query performance <100ms | High | In-memory caching, lazy loading | Revert to Phase 1 pre-injection only |
| Stale skill data (new skills not discovered) | Medium | Auto-regenerate skill-index.json on Skill creation | Manual cache invalidation |
| Query overload (too many agent queries) | Low | Monitor query frequency, add rate limiting if needed (Phase 3) | N/A |
| Complex queries confuse agents | Medium | Simple API (3-4 common filters), clear documentation | N/A |
| Tool not available (skill-catalog.cjs missing) | High | Graceful error with suggestion, fallback to pre-injection | git checkout HEAD -- .claude/lib/tools/ |
| Backward compatibility break | High | Validate Phase 1 pre-injection still works | Revert all Phase 2 changes |

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 0 (Research) | 3 | 6-8 hours | No |
| 2A (Spec) | 3 | 4-6 hours | No |
| 2B (Implementation) | 6 | 8-10 hours | No |
| 2C (Integration) | 4 | 4-6 hours | Partial |
| 2D (Testing) | 3 | 6-8 hours | Partial |
| 2E (Documentation) | 3 | 3-4 hours | Yes |
| FINAL (Reflection) | 1 | 1-2 hours | No |
| **Total** | **23** | **~33-44 hours** | |

---

## Implementation Notes

### Tool Specification Details

**SkillCatalog() Signature**:

```javascript
/**
 * Query available skills by domain, category, tags, or agent type
 * @param {Object} options - Query filters
 * @param {string} [options.domain] - Skill domain (e.g., 'testing', 'research')
 * @param {string} [options.category] - Skill category (e.g., 'code-quality')
 * @param {string} [options.agentType] - Agent type for recommendations
 * @param {string[]} [options.tags] - Tags (AND logic)
 * @param {number} [options.limit=10] - Max results (max: 50)
 * @returns {SkillResult[]} - Array of matching skills
 */
function SkillCatalog(options = {}) {
  // Implementation in Phase 2B
}
```

**SkillResult Format**:

```javascript
{
  name: string,           // Skill name (e.g., 'tdd')
  domain: string,         // Domain (e.g., 'testing')
  category: string,       // Category (e.g., 'test-driven-development')
  description: string,    // Brief description
  requiredTools: string[], // Tools needed (e.g., ['Read', 'Write', 'Edit', 'Bash'])
  tags: string[],         // Tags (e.g., ['testing', 'tdd', 'red-green-refactor'])
  recommended: boolean    // True if recommended for agentType (if filter used)
}
```

### Query Examples (Concrete)

**Example 1: Find testing skills**
```javascript
const skills = SkillCatalog({ domain: 'testing' });
// Returns: [
//   { name: 'tdd', domain: 'testing', category: 'test-driven-development', ... },
//   { name: 'qa-workflow', domain: 'testing', category: 'quality-assurance', ... },
//   { name: 'comprehensive-unit-testing-with-pytest', domain: 'testing', category: 'unit-testing', ... }
// ]
```

**Example 2: Find skills for code review**
```javascript
const skills = SkillCatalog({ domain: 'code', tags: ['review'] });
// Returns: [
//   { name: 'code-reviewer', domain: 'code', tags: ['review', 'quality'], ... },
//   { name: 'code-simplifier', domain: 'code', tags: ['review', 'refactoring'], ... }
// ]
```

**Example 3: Find recommended skills for developer**
```javascript
const skills = SkillCatalog({ agentType: 'developer', limit: 5 });
// Returns: [
//   { name: 'tdd', recommended: true, ... },
//   { name: 'code-reviewer', recommended: true, ... },
//   { name: 'debugging', recommended: true, ... },
//   { name: 'code-simplifier', recommended: false, ... },
//   { name: 'comment-usage', recommended: false, ... }
// ]
```

**Example 4: Find security skills**
```javascript
const skills = SkillCatalog({ tags: ['security'] });
// Returns: [
//   { name: 'security-architect', domain: 'architecture', tags: ['security', 'threat-modeling'], ... }
// ]
```

### Agent Usage Pattern

**When agent needs a skill:**

```javascript
// Option A: Use pre-injected AVAILABLE_SKILLS (Phase 1 - still works)
Skill({ skill: 'tdd' });

// Option B: Query at runtime (Phase 2 - NEW)
const skills = SkillCatalog({ domain: 'testing' });
const bestSkill = skills.find(s => s.recommended) || skills[0];
Skill({ skill: bestSkill.name });

// Option C: Combine both (agent uses pre-injection for common cases, queries for edge cases)
```

### Comparison to Phase 1

| Aspect | Phase 1 (Pre-Injection) | Phase 2 (Runtime Discovery) |
|--------|--------------------------|------------------------------|
| Skill discovery | Static (at spawn) | **Dynamic (at runtime)** |
| When skills available | After spawn | **Immediately (any time)** |
| Agent flexibility | Pre-selected (15-20 skills) | **Agent chooses from all skills** |
| New skills | Require agent respin | **Instant availability** |
| Complexity | Simple | **Medium** |
| When to use | Most cases (80%) | Advanced use cases (20%) |
| Query overhead | None | <100ms per query |

### Integration Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Agent spawns (with Phase 1 AVAILABLE_SKILLS)             │
│   ↓                                                       │
│ Agent reads AVAILABLE_SKILLS section (Phase 1)           │
│   ↓                                                       │
│ Agent can ALSO call SkillCatalog() at runtime (Phase 2)  │
│   ↓                                                       │
│ SkillCatalog queries skill-index.json (from Phase 1A)    │
│   ↓                                                       │
│ Returns filtered list of skills                          │
│   ↓                                                       │
│ Agent picks best skill                                   │
│   ↓                                                       │
│ Agent calls Skill({ skill: selectedSkill.name })         │
└──────────────────────────────────────────────────────────┘
```

### Files Modified Summary

| File | Change | Phase |
|------|--------|-------|
| `.claude/lib/tools/skill-catalog.cjs` | Create (new query engine) | 2B |
| `.claude/CLAUDE.md` (Section 1.4) | Add SkillCatalog to Core Tools table | 2C |
| `.claude/agents/core/router.md` | Add SkillCatalog usage section | 2C |
| `.claude/docs/SKILL_CATALOG_GUIDE.md` | Create (usage guide) | 2C |
| `.claude/lib/tools/index.cjs` | Export SkillCatalog | 2C |
| `tests/lib/tools/skill-catalog.test.cjs` | Create (unit tests) | 2D |
| `tests/integration/skill-catalog-usage.test.cjs` | Create (integration tests) | 2D |
| `tests/performance/skill-catalog-performance.test.cjs` | Create (performance tests) | 2D |
| `.claude/context/memory/decisions.md` | Add ADR-070 | 2E |
| `.claude/context/memory/learnings.md` | Add Phase 2 learnings | 2E |

**Files NOT Modified** (Phase 1 remains unchanged):
- `.claude/lib/skill-build/skill-index-generator.cjs` (Phase 1A)
- `.claude/hooks/skills/pre-spawn-skill-validator.cjs` (Phase 1B)
- `.claude/lib/skill-build/skill-injector.cjs` (Phase 1D)
- All agent spawn templates (Phase 1D)

---

## Next Steps After Phase 2

**Phase 3: Agent Capability Cards** (future - not in this plan):
- Agents publish what they can do (capabilities registry)
- Orchestrators discover agent capabilities dynamically
- Self-healing: isolation of failed agents based on capability loss

**Phase 2 is self-contained and valuable on its own** - no dependencies on Phase 3.

---

## Acceptance Criteria (Final Validation)

Before marking this plan complete, verify:

- [ ] SkillCatalog tool implemented and tested
- [ ] All query filters functional (domain, category, tags, agentType)
- [ ] Query performance <100ms (p95)
- [ ] CLAUDE.md Section 1.4 updated
- [ ] Router documentation includes SkillCatalog usage
- [ ] SKILL_CATALOG_GUIDE.md created with examples
- [ ] All tests passing (unit + integration + performance)
- [ ] ADR-070 created and reviewed
- [ ] Learnings documented in learnings.md
- [ ] Backward compatibility with Phase 1 validated
- [ ] Phase 1 pre-injection still works unchanged

---

**Plan Status**: Draft
**Created**: 2026-01-31
**Author**: PLANNER (Claude Sonnet 4.5)
**Framework Version**: Agent-Studio v2.2.1
