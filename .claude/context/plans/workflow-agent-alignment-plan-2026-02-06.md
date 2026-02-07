<!-- Agent: planner | Task: #43 | Session: 2026-02-06 -->

# Plan: Workflow-to-Agent Alignment

## Executive Summary

Add a standardized "## Related Workflows" section to all 49 agent files, mapping each agent to its relevant workflows from the 24 existing workflow files. Create missing workflows for underserved agent categories (domain agents, PM, DevOps, code review, refactoring). Produce a cross-reference document (@WORKFLOW_AGENT_MAP.md) and update enterprise workflow catalogs. This plan builds on the successful hook-agent alignment pattern (Task #41-42) and follows the same section-after-enforcement-hooks placement strategy.

## Objectives

- Map all 49 agents to their relevant workflows (zero agents with NO workflow references)
- Create 4 new workflows for agent categories currently without workflow coverage
- Add workspace-conventions reference to ALL agents (standardized output behavior)
- Create @WORKFLOW_AGENT_MAP.md cross-reference document (modeled after @HOOK_AGENT_MAP.md)
- Update @ENTERPRISE_WORKFLOWS.md catalog with new workflows

## Current State Analysis

### Existing Workflows (24 files)

| # | Workflow | Path | Primary Agent(s) |
|---|---------|------|-------------------|
| 1 | Router Decision | `core/router-decision.md` | router |
| 2 | Evolution | `core/evolution-workflow.md` | evolution-orchestrator |
| 3 | Enterprise Orchestration | `core/enterprise-workflow.md` | router, master-orchestrator |
| 4 | Reflection | `core/reflection-workflow.md` | reflection-agent |
| 5 | Artifact Lifecycle | `core/skill-lifecycle.md` | evolution-orchestrator |
| 6 | External Integration | `core/external-integration.md` | architect, planner, security-architect |
| 7 | Post-Creation Validation | `core/post-creation-validation.md` | evolution-orchestrator |
| 8 | Feature Development | `enterprise/feature-development-workflow.md` | planner, developer, qa, code-reviewer |
| 9 | C4 Architecture | `enterprise/c4-architecture-workflow.md` | c4-code, c4-component, c4-container, c4-context |
| 10 | Swarm Coordination | `enterprise/swarm-coordination-skill-workflow.md` | swarm-coordinator |
| 11 | Incident Response | `operations/incident-response.md` | incident-responder, devops-troubleshooter |
| 12 | QA Bounded Loop | `operations/qa-bounded-loop.md` | qa |
| 13 | Hook Consolidation | `operations/hook-consolidation.md` | developer, devops |
| 14 | Security Audit | `security-architect-skill-workflow.md` | security-architect |
| 15 | Database Design | `database-architect-skill-workflow.md` | database-architect |
| 16 | Architecture Review | `architecture-review-skill-workflow.md` | architect, security-architect, code-reviewer |
| 17 | Chrome Browser | `chrome-browser-skill-workflow.md` | (any agent with chrome-browser skill) |
| 18 | Consensus Voting | `consensus-voting-skill-workflow.md` | swarm-coordinator, architect, pm |
| 19 | Context Compression | `context-compressor-skill-workflow.md` | context-compressor |
| 20 | Conductor Setup | `conductor-setup-workflow.md` | conductor-validator |
| 21 | Template Renderer | `template-renderer-skill-workflow.md` | (any agent with template-renderer skill) |
| 22 | Progressive Disclosure | `progressive-disclosure-skill-workflow.md` | planner, pm, architect |
| 23 | Enterprise Feature Dev | `core/feature-development-workflow.md` | planner, developer, qa |
| 24 | README | `README.md` | (documentation only) |

### Agents Without Workflow Coverage (Gaps)

| Gap | Agents Affected | Needed Workflow |
|-----|-----------------|-----------------|
| Domain development | 22 domain agents | `domain-development-workflow.md` |
| Code review process | code-reviewer | `code-review-workflow.md` |
| Refactoring/simplification | code-simplifier | (use feature-development-workflow.md) |
| PM processes | pm | `product-management-workflow.md` |
| Documentation | technical-writer | `documentation-workflow.md` |
| Research | researcher, scientific-research-expert | (use research-synthesis skill workflow) |
| DevOps | devops, devops-troubleshooter | (use incident-response + hook-consolidation) |
| Reverse engineering | reverse-engineer | (specialized - no workflow needed, use security audit) |

## Phases

### Phase 1: Create Missing Workflows (~2 hours)

**Purpose**: Fill workflow gaps so every agent category has at least one relevant workflow
**Dependencies**: None
**Parallel OK**: Yes (each workflow is independent)

#### Tasks

- [ ] **1.1** Create `domain-development-workflow.md` (~45 min)
  - **Path**: `.claude/workflows/domain-development-workflow.md`
  - **Content**: Common workflow for all 22 domain agents (python-pro, rust-pro, etc.)
  - **Structure**: TDD-based development cycle with language-specific conventions
  - **Sections**: Overview, When to Use, TDD Cycle (Red-Green-Refactor), Language Conventions Table, Output Standards, Integration with feature-development-workflow
  - **References**: Red-Green-Refactor Cycle (RGRC) best practice from research
  - **Verify**: File exists and contains TDD cycle, language conventions table, provenance header

- [ ] **1.2** Create `code-review-workflow.md` (~30 min)
  - **Path**: `.claude/workflows/code-review-workflow.md`
  - **Content**: Two-pass review process (correctness first, quality second)
  - **Structure**: Pass 1 (spec compliance, logic correctness), Pass 2 (code quality, style, DRY), Output format
  - **References**: Two-Pass Review best practice from research
  - **Verify**: File exists and contains two-pass review phases

- [ ] **1.3** Create `product-management-workflow.md` (~30 min)
  - **Path**: `.claude/workflows/product-management-workflow.md`
  - **Content**: Sprint planning, backlog refinement, stakeholder updates
  - **Structure**: Backlog Grooming, Sprint Planning, Stakeholder Communication, Metric Tracking
  - **References**: INVEST criteria best practice from research
  - **Verify**: File exists and contains INVEST criteria, sprint workflow

- [ ] **1.4** Create `documentation-workflow.md` (~30 min)
  - **Path**: `.claude/workflows/documentation-workflow.md`
  - **Content**: Diataxis framework (tutorials, how-to guides, reference, explanation)
  - **Structure**: Documentation Type Detection, Diataxis Matrix, Output Standards
  - **References**: Diataxis documentation framework best practice from research
  - **Verify**: File exists and contains Diataxis framework sections

**Success Criteria**: 4 new workflow files created, each with proper frontmatter, provenance header, and best-practice methodology

#### Phase 1 Verification Gate

```
Verify all 4 workflow files exist:
- .claude/workflows/domain-development-workflow.md
- .claude/workflows/code-review-workflow.md
- .claude/workflows/product-management-workflow.md
- .claude/workflows/documentation-workflow.md
```

---

### Phase 2: Add "## Related Workflows" to ALL 49 Agents (~3 hours)

**Purpose**: Every agent file gets a standardized Related Workflows section with specific file paths
**Dependencies**: Phase 1 (new workflows must exist first)
**Parallel OK**: Yes (by agent category)

#### Section Placement Rule

The `## Related Workflows` section goes AFTER the `## Enforcement Hooks` section and BEFORE the `## Core Persona` section in every agent file. This follows the governance-first pattern:

```markdown
## Enforcement Hooks
[existing hook table]

## Related Workflows                    <-- NEW SECTION (insert here)
[workflow references table + workspace conventions]

## Core Persona
[existing content]
```

#### Section Template

```markdown
## Related Workflows

The following workflows guide this agent's execution:

| Workflow | Path | When to Use |
|----------|------|-------------|
| [Name] | `.claude/workflows/[path]` | [brief trigger description] |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**Output Standards** (from workspace-conventions):
- Reports: `.claude/context/reports/[domain]/`
- Plans: `.claude/context/plans/`
- Artifacts: `.claude/context/artifacts/[category]/`
- Naming: lowercase kebab-case with ISO date suffix
- Provenance: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
```

#### Task 2.1: Core Agents (9 agents) (~45 min)

Add Related Workflows section to each core agent:

**planner.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Planning new features |
| Enterprise Orchestration | `.claude/workflows/core/enterprise-workflow.md` | Understanding phase routing |
| External Integration | `.claude/workflows/core/external-integration.md` | Planning external integrations |
| Progressive Disclosure | `.claude/workflows/progressive-disclosure-skill-workflow.md` | Gathering requirements |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**developer.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Implementing features (TDD) |
| Enterprise Orchestration | `.claude/workflows/core/enterprise-workflow.md` | Understanding phase routing |
| Hook Consolidation | `.claude/workflows/operations/hook-consolidation.md` | Modifying hook infrastructure |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**qa.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | QA phase of feature work |
| QA Bounded Loop | `.claude/workflows/operations/qa-bounded-loop.md` | Bounded QA iteration cycles |
| Enterprise Orchestration | `.claude/workflows/core/enterprise-workflow.md` | Understanding review phase |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**architect.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Architecture Review | `.claude/workflows/architecture-review-skill-workflow.md` | Architecture assessments |
| C4 Architecture | `.claude/workflows/enterprise/c4-architecture-workflow.md` | C4 documentation |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Design phase |
| External Integration | `.claude/workflows/core/external-integration.md` | Integrating external systems |
| Consensus Voting | `.claude/workflows/consensus-voting-skill-workflow.md` | Multi-agent decisions |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**security-architect.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Security Audit | `.claude/workflows/security-architect-skill-workflow.md` | Security assessments |
| Architecture Review | `.claude/workflows/architecture-review-skill-workflow.md` | Architecture security review |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Security review gate |
| External Integration | `.claude/workflows/core/external-integration.md` | Integration security |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**code-reviewer.md** (code-reviewer is specialized, not core, but listed here for clarity):
| Workflow | Path | When to Use |
|----------|------|-------------|
| Code Review | `.claude/workflows/code-review-workflow.md` | Code review process (two-pass) |
| Architecture Review | `.claude/workflows/architecture-review-skill-workflow.md` | Architecture assessments |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Code review gate |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**technical-writer.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Documentation | `.claude/workflows/documentation-workflow.md` | Diataxis documentation creation |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Documentation phase |
| Post-Creation Validation | `.claude/workflows/core/post-creation-validation.md` | Ensuring doc integration |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**pm.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Product Management | `.claude/workflows/product-management-workflow.md` | Sprint/backlog management |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Feature lifecycle |
| Consensus Voting | `.claude/workflows/consensus-voting-skill-workflow.md` | Team decisions |
| Progressive Disclosure | `.claude/workflows/progressive-disclosure-skill-workflow.md` | Requirement gathering |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**context-compressor.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Context Compression | `.claude/workflows/context-compressor-skill-workflow.md` | Session optimization |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**reflection-agent.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Reflection | `.claude/workflows/core/reflection-workflow.md` | Post-task quality assessment |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

- **Verify**: Each of the 9 core agents has a Related Workflows section between Enforcement Hooks and Core Persona

#### Task 2.2: Specialized Agents (11 agents) (~45 min)

Add Related Workflows section to each specialized agent:

**database-architect.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Database Design | `.claude/workflows/database-architect-skill-workflow.md` | Schema design, migrations |
| Architecture Review | `.claude/workflows/architecture-review-skill-workflow.md` | Data architecture review |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**incident-responder.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Incident Response | `.claude/workflows/operations/incident-response.md` | Production incidents (OODA loop) |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**devops.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Incident Response | `.claude/workflows/operations/incident-response.md` | Production incidents |
| Hook Consolidation | `.claude/workflows/operations/hook-consolidation.md` | Infrastructure maintenance |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | CI/CD implementation |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**devops-troubleshooter.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Incident Response | `.claude/workflows/operations/incident-response.md` | Troubleshooting and debugging |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**code-simplifier.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Refactoring within feature work |
| Code Review | `.claude/workflows/code-review-workflow.md` | Quality assessment before simplifying |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**reverse-engineer.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Security Audit | `.claude/workflows/security-architect-skill-workflow.md` | Vulnerability research |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**researcher.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Evolution | `.claude/workflows/core/evolution-workflow.md` | Pre-creation research (Phase O) |
| External Integration | `.claude/workflows/core/external-integration.md` | External source evaluation |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**conductor-validator.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Conductor Setup | `.claude/workflows/conductor-setup-workflow.md` | CDD validation |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**c4-code.md**, **c4-component.md**, **c4-container.md**, **c4-context.md** (4 C4 agents):
| Workflow | Path | When to Use |
|----------|------|-------------|
| C4 Architecture | `.claude/workflows/enterprise/c4-architecture-workflow.md` | C4 documentation generation |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

- **Verify**: Each of the 11 specialized agents has a Related Workflows section

#### Task 2.3: Orchestrator Agents (5 agents) (~30 min)

Add Related Workflows section to each orchestrator:

**router.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Router Decision | `.claude/workflows/core/router-decision.md` | Every user request (master routing) |
| Enterprise Orchestration | `.claude/workflows/core/enterprise-workflow.md` | Phase management |
| Evolution | `.claude/workflows/core/evolution-workflow.md` | Capability gap detection |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**master-orchestrator.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Enterprise Orchestration | `.claude/workflows/core/enterprise-workflow.md` | Multi-phase project management |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | Feature coordination |
| Consensus Voting | `.claude/workflows/consensus-voting-skill-workflow.md` | Multi-agent decisions |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**evolution-orchestrator.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Evolution | `.claude/workflows/core/evolution-workflow.md` | EVOLVE process (artifact creation) |
| Artifact Lifecycle | `.claude/workflows/core/skill-lifecycle.md` | Artifact management |
| Post-Creation Validation | `.claude/workflows/core/post-creation-validation.md` | Integration validation |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**swarm-coordinator.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Swarm Coordination | `.claude/workflows/enterprise/swarm-coordination-skill-workflow.md` | Multi-agent swarms |
| Consensus Voting | `.claude/workflows/consensus-voting-skill-workflow.md` | Byzantine consensus |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**party-orchestrator.md**:
| Workflow | Path | When to Use |
|----------|------|-------------|
| Swarm Coordination | `.claude/workflows/enterprise/swarm-coordination-skill-workflow.md` | Party Mode coordination |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

- **Verify**: Each of the 5 orchestrator agents has a Related Workflows section

#### Task 2.4: Domain Agents (22 agents) (~60 min)

Add Related Workflows section to ALL 22 domain agents. Each domain agent gets the same base workflow table with a language-specific note:

**Common Template for ALL Domain Agents**:

```markdown
## Related Workflows

The following workflows guide this agent's execution:

| Workflow | Path | When to Use |
|----------|------|-------------|
| Domain Development | `.claude/workflows/domain-development-workflow.md` | TDD development cycle |
| Feature Development | `.claude/workflows/enterprise/feature-development-workflow.md` | End-to-end feature work |
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |

**Output Standards** (from workspace-conventions):
- Reports: `.claude/context/reports/`
- Artifacts: `.claude/context/artifacts/`
- Naming: lowercase kebab-case with ISO date suffix
- Provenance: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
```

**Domain agents to update (22 files)**:
1. `domain/ai-ml-specialist.md`
2. `domain/android-pro.md`
3. `domain/data-engineer.md`
4. `domain/expo-mobile-developer.md`
5. `domain/fastapi-pro.md`
6. `domain/frontend-pro.md`
7. `domain/gamedev-pro.md`
8. `domain/golang-pro.md`
9. `domain/graphql-pro.md`
10. `domain/ios-pro.md`
11. `domain/java-pro.md`
12. `domain/mobile-ux-reviewer.md`
13. `domain/nextjs-pro.md`
14. `domain/nodejs-pro.md`
15. `domain/php-pro.md`
16. `domain/python-pro.md`
17. `domain/rust-pro.md`
18. `domain/scientific-research-expert.md`
19. `domain/sveltekit-expert.md`
20. `domain/tauri-desktop-developer.md`
21. `domain/typescript-pro.md`
22. `domain/web3-blockchain-expert.md`

**Special cases**:
- `data-engineer.md`: Add Database Design workflow
- `scientific-research-expert.md`: Add Evolution workflow (research phase)
- `mobile-ux-reviewer.md`: Same as other domain agents (has Bash tool, acts as implementer)
- `web3-blockchain-expert.md`: Add Security Audit workflow

- **Verify**: Each of the 22 domain agents has a Related Workflows section

#### Phase 2 Verification Gate

```
Check all 49 agent files contain "## Related Workflows" section:
  grep -r "## Related Workflows" .claude/agents/ --include="*.md" | wc -l
  Expected: 49

Check all 49 agent files reference workspace-conventions:
  grep -r "workspace-conventions" .claude/agents/ --include="*.md" | wc -l
  Expected: 49
```

**Success Criteria**: All 49 agents have Related Workflows section with specific file paths and workspace-conventions reference

---

### Phase 3: Cross-Reference Documentation (~1.5 hours)

**Purpose**: Create mapping document and update catalogs for discoverability
**Dependencies**: Phase 1 + Phase 2 complete
**Parallel OK**: Partial (3.1 can run in parallel with 3.2)

**COMMIT CHECKPOINT**: Before starting Phase 3, commit Phase 1-2 changes. This plan modifies 49 agent files + 4 new workflow files (53 total, exceeds 10-file threshold). Commit creates recovery point.

```
git add .claude/agents/ .claude/workflows/domain-development-workflow.md .claude/workflows/code-review-workflow.md .claude/workflows/product-management-workflow.md .claude/workflows/documentation-workflow.md
git commit -m "feat: workflow-agent alignment - add Related Workflows sections to all 49 agents, create 4 new workflows"
```

#### Tasks

- [ ] **3.1** Create `@WORKFLOW_AGENT_MAP.md` (~45 min)
  - **Path**: `.claude/docs/@WORKFLOW_AGENT_MAP.md`
  - **Structure**: Modeled after @HOOK_AGENT_MAP.md
  - **Content**:
    - Section 1: Workflow-Agent Matrix (28 workflows x 6 agent archetypes)
    - Section 2: Agent archetype definitions (same 6 as @HOOK_AGENT_MAP.md: Router, Implementer, Reviewer, Documenter, Orchestrator, Researcher)
    - Section 3: Workflow categories (Core, Enterprise, Operations, Domain, Skill-specific)
    - Section 4: Missing workflow gap analysis (for future reference)
    - Section 5: Cross-references to @ENTERPRISE_WORKFLOWS.md, @AGENT_ROUTING_TABLE.md, CLAUDE.md 8.6
  - **Verify**: File exists, contains matrix table, contains cross-references

- [ ] **3.2** Update `@ENTERPRISE_WORKFLOWS.md` (~20 min)
  - **Path**: `.claude/docs/@ENTERPRISE_WORKFLOWS.md`
  - **Changes**:
    - Add 4 new workflows to the catalog table
    - Add cross-reference to @WORKFLOW_AGENT_MAP.md in RELATED REFERENCES section
    - Update workflow count in PURPOSE section
  - **Verify**: All 28 workflows listed, cross-reference exists

- [ ] **3.3** Update `CLAUDE.md` Reference Index (~10 min)
  - **Path**: `.claude/CLAUDE.md`
  - **Changes**: Add `@WORKFLOW_AGENT_MAP.md` entry to the Reference Index table (Section 8.6)
  - **Verify**: `grep "WORKFLOW_AGENT_MAP" .claude/CLAUDE.md` returns match

- [ ] **3.4** Update `workflows/README.md` (~15 min)
  - **Path**: `.claude/workflows/README.md`
  - **Changes**:
    - Add entries for the 4 new workflows under "Root Level Workflows" section
    - Update "Key Workflows by Scenario" section with new entries:
      - Code Review -> `code-review-workflow.md`
      - Domain Development -> `domain-development-workflow.md`
      - Product Management -> `product-management-workflow.md`
      - Documentation -> `documentation-workflow.md`
    - Update last-updated date
  - **Verify**: All 4 new workflows mentioned in README

#### Phase 3 Verification Gate

```
Verify @WORKFLOW_AGENT_MAP.md exists and has content:
  ls -la .claude/docs/@WORKFLOW_AGENT_MAP.md

Verify @ENTERPRISE_WORKFLOWS.md updated:
  grep "domain-development" .claude/docs/@ENTERPRISE_WORKFLOWS.md

Verify CLAUDE.md updated:
  grep "WORKFLOW_AGENT_MAP" .claude/CLAUDE.md

Verify workflows/README.md updated:
  grep "domain-development" .claude/workflows/README.md
```

**Success Criteria**: Cross-reference document created, catalogs updated, navigation links working

---

### Phase 4: Final Validation and Commit (~30 min)

**Purpose**: Verify the entire alignment is correct and consistent
**Dependencies**: Phase 3 complete
**Parallel OK**: No (sequential validation)

#### Tasks

- [ ] **4.1** Validate all 49 agents have Related Workflows section (~10 min)
  - **Command**: `grep -rl "## Related Workflows" .claude/agents/ --include="*.md" | wc -l`
  - **Expected**: 49
  - **Verify**: Count equals 49

- [ ] **4.2** Validate all workflow file paths in agent files are valid (~10 min)
  - **Command**: Extract all workflow paths from agent files, verify each file exists
  - **Verify**: Zero broken references

- [ ] **4.3** Validate workspace-conventions referenced in all 49 agents (~5 min)
  - **Command**: `grep -rl "workspace-conventions" .claude/agents/ --include="*.md" | wc -l`
  - **Expected**: 49
  - **Verify**: Count equals 49

- [ ] **4.4** Final commit (~5 min)
  - **Command**: Commit all Phase 3-4 changes
  - **Message**: `docs: workflow-agent alignment - cross-reference docs and validation`
  - **Verify**: Clean git status

#### Phase 4 Verification Gate

```
Final checks (all must pass):
1. 49 agent files with "## Related Workflows" ✓
2. 28 workflow files exist (24 existing + 4 new) ✓
3. @WORKFLOW_AGENT_MAP.md exists with matrix ✓
4. @ENTERPRISE_WORKFLOWS.md updated ✓
5. CLAUDE.md Reference Index updated ✓
6. workflows/README.md updated ✓
7. Zero broken workflow path references ✓
```

**Success Criteria**: All validation checks pass, clean git status

---

### Phase F: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from the workflow-agent alignment plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
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
| Incorrect workflow-agent mapping | Medium | Validate paths exist before writing | `git revert` the commit |
| Breaking existing agent sections | High | Use Edit (not Write) with precise string matching | `git checkout -- .claude/agents/` |
| Missing agents in batch update | Medium | Count verification (49 check) at each phase gate | Re-run missed agents |
| Workflow path typos | Low | Automated path validation in Phase 4.2 | Fix and re-commit |
| Commit checkpoint failure | Medium | Commit Phase 1-2 before Phase 3 | Revert to checkpoint |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Files Modified |
|-------|-------|-----------|-----------|----------------|
| 1 | 4 | ~2 hours | Yes | 4 new workflows |
| 2 | 4 | ~3 hours | Yes (by category) | 49 agent files |
| 3 | 4 | ~1.5 hours | Partial | 4 reference docs |
| 4 | 4 | ~30 min | No | Validation only |
| F | 3 | ~15 min | No | Memory files |
| **Total** | **19** | **~7 hours** | | **57 files** |

## Workflow-Agent Mapping Reference

### Complete Agent-to-Workflow Mapping (Quick Reference)

#### Core Agents (9)
| Agent | Primary Workflows | Count |
|-------|-------------------|-------|
| planner | feature-dev, enterprise, external-integration, progressive-disclosure | 4+WC |
| developer | feature-dev, enterprise, hook-consolidation | 3+WC |
| qa | feature-dev, qa-bounded-loop, enterprise | 3+WC |
| architect | arch-review, c4-arch, feature-dev, external-integration, consensus | 5+WC |
| security-architect | security-audit, arch-review, feature-dev, external-integration | 4+WC |
| code-reviewer | code-review, arch-review, feature-dev | 3+WC |
| technical-writer | documentation, feature-dev, post-creation-validation | 3+WC |
| pm | product-management, feature-dev, consensus, progressive-disclosure | 4+WC |
| context-compressor | context-compression | 1+WC |
| reflection-agent | reflection | 1+WC |

#### Specialized Agents (11)
| Agent | Primary Workflows | Count |
|-------|-------------------|-------|
| database-architect | database-design, arch-review | 2+WC |
| incident-responder | incident-response | 1+WC |
| devops | incident-response, hook-consolidation, feature-dev | 3+WC |
| devops-troubleshooter | incident-response | 1+WC |
| code-simplifier | feature-dev, code-review | 2+WC |
| reverse-engineer | security-audit | 1+WC |
| researcher | evolution, external-integration | 2+WC |
| conductor-validator | conductor-setup | 1+WC |
| c4-code | c4-architecture | 1+WC |
| c4-component | c4-architecture | 1+WC |
| c4-container | c4-architecture | 1+WC |
| c4-context | c4-architecture | 1+WC |

#### Orchestrator Agents (5)
| Agent | Primary Workflows | Count |
|-------|-------------------|-------|
| router | router-decision, enterprise, evolution | 3+WC |
| master-orchestrator | enterprise, feature-dev, consensus | 3+WC |
| evolution-orchestrator | evolution, artifact-lifecycle, post-creation-validation | 3+WC |
| swarm-coordinator | swarm-coordination, consensus | 2+WC |
| party-orchestrator | swarm-coordination | 1+WC |

#### Domain Agents (22) -- All get same base set
| Agent | Primary Workflows | Count |
|-------|-------------------|-------|
| All 22 domain agents | domain-development, feature-dev | 2+WC |
| data-engineer (extra) | + database-design | 3+WC |
| scientific-research-expert (extra) | + evolution (research) | 3+WC |
| web3-blockchain-expert (extra) | + security-audit | 3+WC |

**WC** = Workspace Conventions (always included)

## Implementation Notes

1. **Pattern from Hook Alignment**: This plan follows the same successful pattern used for hook-agent alignment (Task #41-42): batch updates by agent category, standardized section template, cross-reference documentation.

2. **Edit Strategy**: Use `Edit` tool with precise `old_string` matching on the line `## Core Persona` to insert the Related Workflows section before it. This is the safest insertion point since all 49 agents already have this section.

3. **Domain Agent Batch**: The 22 domain agents all get the same template. The developer implementing this should use a consistent approach (e.g., process all domain agents in a single pass with the common template).

4. **New Workflows**: The 4 new workflows should be created BEFORE updating agent files (Phase 1 before Phase 2). This ensures all referenced paths are valid.

5. **Total File Count**: 57 files modified (49 agents + 4 new workflows + 4 reference docs). This exceeds the 10-file threshold, so the commit checkpoint in Phase 3 is REQUIRED.
