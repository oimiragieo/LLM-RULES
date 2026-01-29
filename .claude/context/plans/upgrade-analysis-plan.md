# Plan: Comprehensive Upgrade Analysis - Plugin Marketplace vs Enterprise Framework

## Overview

**TRANSFORMATION STRATEGY**: Extract VALUE from archived Claude Code Plugins marketplace by transforming plugin capabilities into our framework's artifact types (skills, agents, hooks, workflows, schemas). We are NOT adopting plugin architecture - we are MINING patterns and capabilities to enhance our existing router-first enterprise orchestration system.

**Key Insight**: Archived codebase is a **marketplace architecture** (72 plugins, granular, user-installable) while our system is an **enterprise orchestration framework** (monolithic, router-first, multi-agent coordination). Different architectures offer complementary strengths.

**User Constraints (IRON LAWS)**:
1. **Transform, Don't Install**: Convert plugins → skills (with tools/workflows/hooks/schemas)
2. **Update, Don't Duplicate**: Enhance existing skills/agents rather than create parallel systems
3. **No Plugin Architecture**: Do NOT install plugins unless proven significantly better for our design
4. **Keep Current Architecture**: Lazy-load MCP, context management, router-first stays unchanged
5. **Integration Focus**: Extract VALUE (patterns, capabilities), transform into OUR artifact types

## Transformation Mapping Strategy

### Decision Tree: Plugin Component → Framework Artifact

```
Plugin Component Analysis:
├─ If capability/tool/command → Which existing SKILL to enhance? OR create new skill?
│   └─ Rule: UPDATE existing if >=60% overlap, CREATE new if unique domain
├─ If agent pattern/persona → Which existing AGENT to enhance? OR create new agent?
│   └─ Rule: UPDATE existing if same role, CREATE new if distinct specialization
├─ If validation logic/guard → Extract to HOOK (.claude/hooks/)
│   └─ Rule: Safety/validation logic becomes pre/post hooks
├─ If orchestration/coordination → Extract to WORKFLOW (.claude/workflows/)
│   └─ Rule: Multi-agent patterns become workflow documents
├─ If data structure/contract → Extract to SCHEMA (.claude/schemas/)
│   └─ Rule: Validation structures become JSON schemas
└─ If utility/helper → Extract to LIB or TOOLS (.claude/lib/, .claude/tools/)
    └─ Rule: Shared code becomes reusable utilities
```

### Update vs Create Matrix

| Scenario | Action | Rationale | Example |
|----------|--------|-----------|---------|
| Existing skill covers 60%+ | **UPDATE existing** | Maintain cohesion, avoid duplication | kubernetes-ops plugin → UPDATE devops skill |
| New domain/specialization | **CREATE new** | Clear separation of concerns | ai-ml plugin → CREATE ai-ml-specialist agent |
| Cross-cutting pattern | **EXTRACT to hook/workflow** | Reusable across agents | rate-limiter plugin → EXTRACT to hook |
| Validation structure | **EXTRACT to schema** | Enforce consistency | api-contract plugin → EXTRACT to schema |
| Utility function | **EXTRACT to lib/tools** | Shared infrastructure | kubectl-wrapper → EXTRACT to tools/integrations/ |

### Transformation Examples (Concrete)

#### Example 1: Plugin with Agent + Skill → UPDATE Existing
```
Plugin: "kubernetes-ops" (agent + skill + tools)
Analysis:
- Agent role: DevOps/Infrastructure (overlaps with existing "devops" agent)
- Skill: kubectl wrappers, k8s validation (new capability for devops)
- Tools: kubectl CLI wrapper, helm commands

Transformation:
→ UPDATE .claude/agents/specialized/devops.md: Add kubernetes expertise to backstory
→ UPDATE .claude/skills/devops/SKILL.md: Add kubernetes-ops section with kubectl commands
→ EXTRACT .claude/tools/integrations/kubernetes/kubectl-wrapper.cjs
→ CREATE .claude/schemas/k8s-deployment.json for validation

Rationale: devops agent already covers infrastructure, adding kubernetes is enhancement not duplication
```

#### Example 2: Plugin with Workflow Pattern → EXTRACT to Workflow
```
Plugin: "full-stack-orchestrator" (orchestration pattern for frontend+backend+db)
Analysis:
- Orchestration pattern: Coordinate frontend-pro, backend-pro, database-architect agents
- No specific tools/skills, pure coordination logic

Transformation:
→ EXTRACT .claude/workflows/enterprise/full-stack-development-workflow.md
→ UPDATE master-orchestrator agent to reference new workflow
→ No new agents created (use existing domain agents)

Rationale: Orchestration is workflow, not agent. Reuse existing agents, add coordination pattern.
```

#### Example 3: Plugin with Safety Logic → EXTRACT to Hook
```
Plugin: "api-rate-limiter" (safety validation for API calls)
Analysis:
- Validation logic: Check API call rate, block if >100/min
- Schema: Rate limit configuration structure

Transformation:
→ EXTRACT .claude/hooks/safety/api-rate-limiter.cjs (PreToolUse hook)
→ CREATE .claude/schemas/rate-limit-config.json
→ UPDATE relevant agents (researcher, data-engineer) to be aware of rate limits

Rationale: Safety logic is hook, not skill. Enforce at framework level, not agent level.
```

## Executive Summary

**Archived System ("Plugins Marketplace")**:
- 72 focused, single-purpose plugins
- 108 specialized agents across 23 categories
- 129 agent skills with progressive disclosure
- Three-tier model strategy (Opus 4.5 / Sonnet 4.5 / Haiku 4.5)
- Designed for Claude Code users installing specific capabilities

**Current System ("Agent-Studio Enterprise")**:
- Unified multi-agent orchestrator
- Router-first architecture with spawning protocol
- Comprehensive memory system (3-tier: active, archived, embedded)
- Event-driven orchestration with observability
- Designed for enterprise teams with complex workflows

## Constitution Checkpoint Status

### Gate 1: Research Completeness
- [ ] Research plugin architecture patterns (3+ sources)
- [ ] Research progressive disclosure implementations
- [ ] Research three-tier model strategies
- [ ] Document comparison findings in research report

### Gate 2: Technical Feasibility
- [ ] Validate plugin concepts can integrate with router-first architecture
- [ ] Verify skill progressive disclosure compatible with our Skill() tool
- [ ] Check model strategy aligns with our spawning protocol

### Gate 3: Security Review
- [ ] Assess security implications of plugin isolation patterns
- [ ] Review access control differences between architectures
- [ ] Evaluate risks of adopting external patterns

### Gate 4: Specification Quality
- [ ] Acceptance criteria: Clear gap analysis with measurable improvements
- [ ] Success criteria: Prioritized roadmap with effort estimates
- [ ] Edge cases: Identify breaking changes vs additive enhancements

---

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research transformation patterns (plugin → skill/agent/hook/workflow/schema), establish mapping criteria, validate integration approach
**Duration**: 6-8 hours
**Parallel OK**: Partial (research tasks can run in parallel)

**Focus**: HOW to transform plugin capabilities into our framework, NOT whether to adopt plugin architecture

#### Research Requirements (MANDATORY)

Before creating ANY implementation plan:

- [ ] Minimum 3 research queries on plugin architecture patterns
- [ ] Minimum 3 external sources consulted (Anthropic docs, Claude Code guides, architecture patterns)
- [ ] Research report generated and saved
- [ ] Design decisions documented with rationale

**Research Output**: `.claude/context/artifacts/research-reports/upgrade-analysis-research-2026-01-29.md`

#### Phase 0 Tasks

- [ ] **0.1** Research transformation patterns (~2 hours)
  - **Queries**: "plugin to skill migration patterns", "capability extraction from modular systems", "framework integration best practices"
  - **Output**: Research findings on transformation strategies, mapping criteria, integration patterns
  - **Verify**: Research report exists with 3+ external sources on transformation (not plugin adoption)

- [ ] **0.2** Create transformation decision tree (~2 hours)
  - **Command**: Document "Plugin X contains Y capability → Which artifact type (skill/agent/hook/workflow/schema)?" decision logic
  - **Output**: `.claude/context/artifacts/transformation-decision-tree.md`
  - **Verify**: Decision tree covers all artifact types with mapping criteria

- [ ] **0.3** Document transformation strategy ADR (~1 hour)
  - **ADR**: ADR-061: Transformation Strategy - Plugin Capabilities to Framework Artifacts
  - **Output**: `.claude/context/memory/decisions.md`
  - **Verify**: ADR explains WHY transform (not adopt), HOW to map capabilities, WHEN to update vs create

- [ ] **0.4** Security review of pattern extraction (~1 hour)
  - **Focus**: Assess risks of adopting external patterns WITHOUT adopting external architecture
  - **Output**: Security assessment of transformation approach (not plugin isolation)
  - **Verify**: Transformation preserves router-first security model

**Success Criteria**: All constitution checkpoint gates passed, research complete

---

### Phase 1: Capability Inventory & Transformation Mapping

**Purpose**: Catalog plugin CAPABILITIES (not structure), map to our artifact types, identify enhancements for existing artifacts
**Dependencies**: Phase 0 complete (transformation decision tree created)
**Parallel OK**: Yes (inventory tasks are independent)
**Duration**: 4-6 hours

**Focus**: What capabilities exist, WHERE they fit in our framework (skill/agent/hook/workflow/schema), WHICH existing artifacts to update

#### Tasks

- [ ] **1.1** Catalog plugin CAPABILITIES (not agents) (~2 hours) [⚡ parallel OK]
  - **Command**: Parse marketplace.json, extract WHAT each plugin does (capability, not structure)
  - **Output**: `.claude/context/artifacts/plugin-capabilities-catalog.json`
  - **Verify**: JSON maps plugin → capability list (e.g., "kubernetes-ops: kubectl wrappers, k8s validation, deployment monitoring")

- [ ] **1.2** Map capabilities to our artifact types (~2 hours)
  - **Command**: Apply transformation decision tree to each capability
  - **Output**: `.claude/context/artifacts/capability-to-artifact-mapping.json`
  - **Verify**: JSON maps capability → artifact type + existing artifact to UPDATE or CREATE new
  - **Example**: `{ "kubernetes-ops kubectl": { "type": "skill", "action": "UPDATE", "target": ".claude/skills/devops/SKILL.md" } }`

- [ ] **1.3** Inventory EXISTING artifacts needing enhancement (~2 hours) [⚡ parallel OK]
  - **Command**: For each "UPDATE" mapping, read current artifact and assess enhancement scope
  - **Output**: `.claude/context/artifacts/existing-artifacts-enhancement-inventory.json`
  - **Verify**: JSON lists artifact path, current capabilities, proposed enhancements, effort estimate

- [ ] **1.4** Identify NEW artifact creation needs (~1 hour)
  - **Command**: For each "CREATE" mapping, validate no existing artifact covers >=60% of capability
  - **Output**: `.claude/context/artifacts/new-artifacts-creation-inventory.json`
  - **Verify**: JSON lists NEW artifacts needed with justification (no existing match)

- [ ] **1.5** Create Update vs Create Matrix (~1 hour)
  - **Command**: Synthesize mappings into decision matrix
  - **Output**: `.claude/context/artifacts/update-vs-create-matrix.md`
  - **Verify**: Matrix shows: Capability | Artifact Type | Action (UPDATE/CREATE) | Target | Effort | Rationale

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding
test -f .claude/context/artifacts/archived-agents-inventory.json && \
test -f .claude/context/artifacts/current-agents-inventory.json && \
test -f .claude/context/artifacts/missing-agents-analysis.md && \
echo "✓ Phase 1 complete"
```

**Success Criteria**: Complete inventories created, gap analysis documented with priorities

---

### Phase 2: Pattern Extraction & Transformation Strategies

**Purpose**: Extract PATTERNS (not implementations) that fit our architecture, document HOW to transform them into our artifact types
**Dependencies**: Phase 1 complete (capability mapping exists)
**Parallel OK**: Partial (pattern extraction independent, synthesis sequential)
**Duration**: 5-7 hours

**Focus**: Extract PATTERNS we can adapt, NOT implementations to port. Transformation guidance for each pattern.

#### Tasks

- [ ] **2.1** Extract progressive disclosure pattern WITH transformation guidance (~2 hours)
  - **Command**: Analyze skill structure (metadata → instructions → resources tiers)
  - **Output**: `.claude/context/artifacts/patterns/progressive-disclosure-transformation.md`
  - **Verify**: Document includes: Pattern description, HOW to adapt to Skill() tool, token savings, transformation steps
  - **Transformation Example**: "Add tiered metadata to .claude/skills/**/SKILL.md frontmatter, update Skill() tool to lazy-load tiers"

- [ ] **2.2** Extract three-tier model strategy WITH transformation guidance (~2 hours)
  - **Command**: Parse model assignments (Opus/Sonnet/Haiku), map to our spawning protocol
  - **Output**: `.claude/context/artifacts/patterns/three-tier-model-transformation.md`
  - **Verify**: Document includes: Pattern criteria, HOW to integrate with Task() spawn template, cost analysis
  - **Transformation Example**: "Add model selection logic to router-decision.md, update Universal Spawn Template with model tier field"

- [ ] **2.3** Extract capability granularity principles (~2 hours)
  - **Command**: Analyze plugin size (avg 3.4 components), identify if OUR skills are too monolithic
  - **Output**: `.claude/context/artifacts/patterns/capability-granularity-assessment.md`
  - **Verify**: Document assesses OUR current skills, recommends splits (e.g., "devops skill → split into kubernetes-ops, docker-ops, ci-cd-ops")

- [ ] **2.4** Extract agent identity enhancements (~1 hour)
  - **Command**: Compare plugin agent descriptions to our agent identity fields (ADR-057), identify gaps
  - **Output**: `.claude/context/artifacts/patterns/agent-identity-enhancements.md`
  - **Verify**: Document lists enhancement opportunities for EXISTING agents (not new agents)

- [ ] **2.5** Synthesize transformation opportunities (~2 hours)
  - **Command**: Rank patterns by: UPDATE existing artifacts (priority) > CREATE new artifacts (secondary)
  - **Output**: `.claude/context/artifacts/transformation-opportunities-ranked.md`
  - **Verify**: Synthesis ranks by: P1 (updates to core skills/agents), P2 (new domain skills), P3 (polish)

#### Phase 2 Verification Gate

```bash
# All pattern documents must exist
test -f .claude/context/artifacts/patterns/progressive-disclosure-pattern.md && \
test -f .claude/context/artifacts/patterns/three-tier-model-strategy.md && \
test -f .claude/context/artifacts/integration-opportunities-synthesis.md && \
echo "✓ Phase 2 complete"
```

**Success Criteria**: Key patterns extracted, integration opportunities ranked by P1/P2/P3

---

### Phase 3: Transformation Roadmap & Prioritization

**Purpose**: Prioritize transformations (updates FIRST, new artifacts SECOND) and create phased implementation roadmap
**Dependencies**: Phase 2 complete (transformation opportunities ranked)
**Parallel OK**: No (requires sequential synthesis)
**Duration**: 3-4 hours

**Focus**: Sequence = Enhance existing → Create new → Extract patterns. Transformation roadmap, NOT adoption roadmap.

#### Tasks

- [ ] **3.1** Priority 1 (Critical Transformations): Updates to EXISTING artifacts (~1 hour)
  - **Criteria**: Enhances existing skills/agents; low risk; immediate value
  - **Examples**: Add progressive disclosure to Skill() tool, enhance devops agent with kubernetes capabilities
  - **Output**: `.claude/context/artifacts/roadmap/p1-artifact-updates.md`
  - **Verify**: P1 = UPDATES only (no new artifacts), <8 items, transformation steps documented
  - **Format**: `UPDATE .claude/skills/devops/SKILL.md: Add kubernetes kubectl wrappers (extract from kubernetes-ops plugin)`

- [ ] **3.2** Priority 2 (High-Value Transformations): NEW artifacts for gaps (~1 hour)
  - **Criteria**: Significant capability gap; no existing artifact covers >=60%; justified creation
  - **Examples**: Create kubernetes-expert skill (if devops too broad), create ai-ml-specialist agent
  - **Output**: `.claude/context/artifacts/roadmap/p2-artifact-creation.md`
  - **Verify**: P2 = CREATE only (new artifacts), <10 items, justification for each (why not UPDATE existing?)
  - **Format**: `CREATE .claude/skills/kubernetes-ops/SKILL.md: No existing skill covers k8s orchestration (devops is CI/CD focused)`

- [ ] **3.3** Priority 3 (Pattern Extraction): Architectural enhancements (~1 hour)
  - **Criteria**: Framework-level patterns (not specific artifacts); optional polish
  - **Examples**: EVOLVE workflow enhancements, skill catalog categorization improvements
  - **Output**: `.claude/context/artifacts/roadmap/p3-pattern-integration.md`
  - **Verify**: P3 = PATTERNS only (not artifacts), <5 items, marked optional

- [ ] **3.4** Create transformation roadmap (~1 hour)
  - **Command**: Synthesize into phased roadmap: P1 updates → P2 creation → P3 patterns
  - **Output**: `.claude/context/artifacts/roadmap/transformation-roadmap-2026.md`
  - **Verify**: Roadmap phases respect EVOLVE workflow (research → transform → validate), effort estimates, rollback plans

#### Phase 3 Verification Gate

```bash
# Roadmap and priorities must exist
test -f .claude/context/artifacts/roadmap/p1-critical-upgrades.md && \
test -f .claude/context/artifacts/roadmap/implementation-roadmap-2026.md && \
echo "✓ Phase 3 complete"
```

**Success Criteria**: P1/P2/P3 priorities documented, implementation roadmap created

---

### Phase 4: Transformation Guidance & Quick Wins

**Purpose**: Create concrete transformation examples and identify quick wins (<4 hours implementation)
**Dependencies**: Phase 3 complete (transformation roadmap created)
**Parallel OK**: Partial (examples and quick wins can overlap)
**Duration**: 2-3 hours

**Focus**: HOW to transform (concrete examples), WHAT to do first (quick wins), WHY transformation preserves our architecture

#### Tasks

- [ ] **4.1** Create concrete transformation examples (~1 hour)
  - **Command**: Document 3 detailed examples: Plugin X → Artifact Y transformation with step-by-step instructions
  - **Output**: `.claude/context/artifacts/transformation-examples.md`
  - **Verify**: Examples cover: skill update, agent enhancement, workflow extraction. Each has: before/after, transformation steps, validation
  - **Example**: "kubernetes-ops plugin → UPDATE .claude/skills/devops/SKILL.md: 1) Extract kubectl commands, 2) Add 'kubernetes' capability section, 3) Update invocation examples"

- [ ] **4.2** Document architectural preservation strategy (~1 hour)
  - **Command**: Explain HOW transformation preserves router-first, governance, centralized control (vs plugin marketplace's granularity)
  - **Output**: `.claude/context/artifacts/architectural-preservation-strategy.md`
  - **Verify**: Document shows: Transformation does NOT change architecture, Capabilities integrated into existing artifacts, Router remains authoritative

- [ ] **4.3** Generate quick-win transformation tasks (~1 hour)
  - **Command**: Identify P1 transformations implementable in <4 hours (single skill/agent updates)
  - **Output**: `.claude/context/artifacts/quick-wins-transformations.md`
  - **Verify**: Quick wins list has 3-5 items with: Target artifact, Source capability, Transformation steps, Effort estimate (<4h)
  - **Example**: "Quick Win #1: Add 'kubernetes' section to devops skill (~2 hours): Extract kubectl wrappers from kubernetes-ops plugin, integrate into existing SKILL.md"

#### Phase 4 Verification Gate

```bash
# Final deliverables must exist
test -f .claude/context/artifacts/upgrade-analysis-executive-summary.md && \
test -f .claude/context/artifacts/quick-wins-recommendations.md && \
echo "✓ Phase 4 complete"
```

**Success Criteria**: Executive summary created, risks documented, quick wins identified

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
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed upgrade analysis work, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Plugin architecture incompatible with router-first | High | Phase 0 research validates compatibility before implementation | N/A (research only) |
| Progressive disclosure conflicts with Skill() tool | Medium | Design adapter pattern to bridge architectures | Revert skill metadata changes |
| Three-tier model strategy breaks spawning protocol | Medium | Test model selection in isolated environment first | Revert to current single-model approach |
| Missing context: Archived codebase has undocumented features | Low | Focus on documented patterns only | Defer undocumented features to future research |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Focus |
|-------|-------|-----------|-----------|-------|
| 0     | 4     | 6-8 hours | Partial   | Transformation patterns research |
| 1     | 5     | 4-6 hours | Yes       | Capability mapping to artifacts |
| 2     | 5     | 5-7 hours | Partial   | Pattern extraction + transformation guidance |
| 3     | 4     | 3-4 hours | No        | Transformation roadmap (updates → creation → patterns) |
| 4     | 3     | 2-3 hours | Partial   | Concrete examples + quick wins |
| FINAL | 3     | 1 hour    | No        | Reflection + learning extraction |
| **Total** | **24** | **~21-29 hours** | | |

**Estimated Calendar Time**: 3-4 days (with parallelization)

**Transformation Focus**: ~60% of effort on UPDATE existing artifacts, ~30% on CREATE new, ~10% on pattern extraction

## Key Deliverables

### Research Phase (Phase 0)
- Research report with 3+ external sources
- Architectural differences ADR
- Security assessment

### Inventory Phase (Phase 1)
- Archived agents inventory (108 agents)
- Current agents inventory
- Archived skills inventory (129 skills)
- Current skills inventory
- Missing capabilities gap analysis

### Pattern Extraction (Phase 2)
- Progressive disclosure pattern
- Three-tier model strategy
- Plugin granularity principles
- Agent identity best practices
- Integration opportunities synthesis

### Roadmap (Phase 3)
- P1 critical upgrades list
- P2 high-value features list
- P3 polish enhancements list
- Implementation roadmap 2026

### Recommendations (Phase 4)
- Executive summary
- Integration risks and mitigations
- Quick wins recommendations

## Success Metrics

### Transformation Quality
- [ ] Transformation decision tree created (Plugin X → Artifact Y mapping criteria)
- [ ] >=15 plugin capabilities mapped to artifact types (skill/agent/hook/workflow/schema)
- [ ] Update vs Create matrix shows >=60% UPDATE actions (preserve existing architecture)
- [ ] >=3 concrete transformation examples documented (before/after with steps)

### Deliverable Quality
- [ ] P1 roadmap contains ONLY updates to existing artifacts (<8 items)
- [ ] P2 roadmap contains ONLY justified new artifacts (<10 items, each with "why not UPDATE?" rationale)
- [ ] P3 roadmap contains ONLY pattern-level enhancements (<5 items, optional)
- [ ] >=3 quick wins identified (single artifact updates, <4 hours each)

### Architectural Preservation
- [ ] Transformation strategy ADR documents WHY transform (not adopt)
- [ ] Architectural preservation document explains HOW router-first stays unchanged
- [ ] No plugin installation recommendations (unless proven significantly better)
- [ ] All transformations integrate with existing governance model

## Next Steps After Completion

1. **Immediate**: Implement quick wins (Phase 4.3)
2. **Short-term** (1-2 weeks): Execute P1 critical upgrades
3. **Medium-term** (1-2 months): Execute P2 high-value features
4. **Long-term** (3-6 months): Evaluate P3 polish enhancements

---

**Plan Created**: 2026-01-29
**Created By**: Planner Agent (Strategic Project Manager)
**Status**: Ready for Phase 0 Research
