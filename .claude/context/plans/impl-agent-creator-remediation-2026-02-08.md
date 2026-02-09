<!-- Agent: planner | Task: #69 | Session: 2026-02-08 -->

# Plan: Agent-Creator Process Remediation for 10 Agents

## Executive Summary

10 new enterprise-grade agents (541-870 lines each) were created without following the agent-creator SKILL.md process. While the agents are well-written with deep domain expertise, enforcement hooks, routing exclusions, and skill invocation protocols, they are missing several mandatory process steps: keyword research reports, companion checks, Response Approach / Behavioral Traits / Example Interactions sections (Iron Law #10), reference comparison against python-pro.md, integration verification, agent-config.json entries, and dedicated workflows. This plan efficiently fills the gaps without rewriting what is already excellent.

## Complexity Assessment

| Dimension     | Assessment                                    |
| ------------- | --------------------------------------------- |
| Complexity    | STANDARD (batch repetitive work, no research) |
| Workflow Type | Remediation                                   |
| Confidence    | 0.85                                          |

**Reasoning**: 10 agents need the same set of fixes applied. The work is repetitive and well-defined. No architectural decisions needed. Main risk is context limits from reading/editing 10 large files.

## Current State Assessment

### What IS Done Well (Do NOT Redo)

| Section                                                 | Status | Notes                                                                      |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Frontmatter (name, model, tools, skills, context_files) | DONE   | All required YAML fields present                                           |
| Enforcement Hooks table                                 | DONE   | Correctly uses Implementer archetype hooks                                 |
| Related Workflows table                                 | DONE   | Present (but needs domain-development-workflow addition for domain agents) |
| Core Persona                                            | DONE   | Well-crafted identity, style, motto                                        |
| Routing Exclusions                                      | DONE   | Detailed exclusion tables with re-route advice                             |
| Workflow (Steps 0-N)                                    | DONE   | Deep domain-specific workflows                                             |
| Domain Expertise                                        | DONE   | Extensive domain knowledge sections                                        |
| Code Search Optimization                                | DONE   | Full hybrid search sections with examples                                  |
| Task Progress Protocol                                  | DONE   | Correct pattern with TaskUpdate                                            |
| Skill Invocation Protocol                               | DONE   | Automatic + Contextual skill tables                                        |
| Memory Protocol                                         | DONE   | Standard ASSUME INTERRUPTION pattern                                       |
| context_files                                           | DONE   | Includes @.claude/context/memory/learnings.md                              |
| CLAUDE.md routing table                                 | DONE   | All 10 agents in Quick Routing table                                       |
| @AGENT_ROUTING_TABLE.md                                 | DONE   | All 10 agents listed                                                       |
| routing-table.cjs keywords                              | DONE   | Keywords added (but not Exa-researched)                                    |

### What IS Missing (Must Fix)

| Gap                                                                    | SKILL.md Step  | Severity | Effort per Agent     |
| ---------------------------------------------------------------------- | -------------- | -------- | -------------------- |
| Response Approach section (8 steps)                                    | Step 5 / IL#10 | HIGH     | ~5 min               |
| Behavioral Traits section (10+ traits)                                 | Step 5 / IL#10 | HIGH     | ~5 min               |
| Example Interactions section (8+ examples)                             | Step 5 / IL#10 | HIGH     | ~5 min               |
| Step 0 uses Read() not Skill()                                         | Step 5         | MEDIUM   | ~3 min               |
| Related Workflows: domain-development-workflow missing (domain agents) | Step 7.6       | MEDIUM   | ~2 min               |
| Related Workflows: reflection-workflow missing                         | Step 7.6       | LOW      | ~2 min               |
| Keyword research reports saved                                         | Step 2.5       | LOW      | ~10 min              |
| Companion check run                                                    | Step 0.5       | LOW      | ~2 min               |
| Reference comparison vs python-pro.md                                  | Step 5         | LOW      | ~3 min               |
| Integration verification (validate-integration.cjs)                    | Step 10        | MEDIUM   | ~2 min               |
| Registry regeneration verification                                     | Step 11        | LOW      | ~1 min               |
| agent-config.json updated                                              | Step 12        | MEDIUM   | ~2 min               |
| Dedicated workflow created                                             | Step 8         | LOW      | Deferred (see below) |
| extended_thinking field removal (2 agents)                             | Step 6         | MEDIUM   | ~1 min               |
| context_strategy: full -> lazy_load (llm-architect)                    | Step 6         | LOW      | ~1 min               |

### Severity Definitions

- **HIGH**: Missing sections that define execution behavior (agent is less effective without them)
- **MEDIUM**: Missing integration steps that affect discoverability or violate standards
- **LOW**: Process artifacts that document decisions but don't affect runtime behavior

## Prioritized Remediation Approach

### Decision: Defer vs Do

| Gap                   | Decision | Rationale                                                                                                                                            |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Response Approach     | DO       | Iron Law #10, defines 8-step execution strategy                                                                                                      |
| Behavioral Traits     | DO       | Iron Law #10, defines agent personality                                                                                                              |
| Example Interactions  | DO       | Iron Law #10, helps users understand agent capabilities                                                                                              |
| Step 0 Skill() fix    | DO       | Agents should invoke skills, not read them                                                                                                           |
| Domain workflow ref   | DO       | Domain agents need domain-development-workflow reference                                                                                             |
| Keyword research      | DO       | Required by Step 2.5, but use WebSearch since Exa unavailable                                                                                        |
| Companion check       | DO       | Quick validation step                                                                                                                                |
| Integration verify    | DO       | Quick validation step                                                                                                                                |
| agent-config.json     | DO       | Required for tool defaults enrichment                                                                                                                |
| Registry regeneration | DO       | Quick verification step                                                                                                                              |
| Dedicated workflows   | DEFER    | Agents already have deep workflow sections inline; separate workflow files add maintenance burden without clear benefit for these specialized agents |
| extended_thinking fix | DO       | Not standard per SKILL.md Step 6                                                                                                                     |
| context_strategy fix  | DO       | Should be lazy_load per SKILL.md template                                                                                                            |

## The 10 Agents

| #   | Agent                   | Category    | Current Lines | Has Response Approach | Has Behavioral Traits | Has Example Interactions |
| --- | ----------------------- | ----------- | ------------- | --------------------- | --------------------- | ------------------------ |
| 1   | llm-architect           | domain      | ~658          | NO                    | NO                    | NO                       |
| 2   | prompt-engineer         | domain      | ~660          | NO                    | NO                    | NO                       |
| 3   | mcp-developer           | domain      | ~660          | NO                    | NO                    | NO                       |
| 4   | api-designer            | domain      | ~591          | NO                    | NO                    | NO                       |
| 5   | microservices-architect | domain      | ~670          | NO                    | NO                    | NO                       |
| 6   | sre-engineer            | specialized | ~660          | NO                    | NO                    | NO                       |
| 7   | performance-engineer    | specialized | ~650          | NO                    | NO                    | NO                       |
| 8   | penetration-tester      | specialized | ~679          | NO                    | NO                    | NO                       |
| 9   | accessibility-tester    | specialized | ~650          | NO                    | NO                    | NO                       |
| 10  | chaos-engineer          | specialized | ~660          | NO                    | NO                    | NO                       |

## Phases

### Phase 0: Research & Validation (FOUNDATION)

**Purpose**: Research keywords for each agent domain, run companion checks, validate fields
**Duration**: ~2-3 hours
**Dependencies**: None
**Parallel OK**: Yes (research tasks are independent)

#### Tasks

- [ ] **0.1** Research keywords for all 10 agents via WebSearch (~60 min)
  - Target Agent: `researcher`
  - Recommended Skills: `research-synthesis`
  - Description: For each of the 10 agents, execute 3+ web searches to gather domain keywords, common tasks, and terminology. Save keyword research reports to `.claude/context/artifacts/research-reports/agent-keywords-[name].md` for each agent.
  - Agents to research: llm-architect, prompt-engineer, mcp-developer, api-designer, microservices-architect, sre-engineer, performance-engineer, penetration-tester, accessibility-tester, chaos-engineer
  - Output format per report: High-Confidence Keywords, Medium-Confidence Keywords, Action Verbs, Problem Indicators
  - Verify: All 10 keyword research files exist in `.claude/context/artifacts/research-reports/`

- [ ] **0.2** Run companion checks for all 10 agents (~15 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: For each agent, run `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs` to identify companion artifacts. Document findings. Run `validate-integration.cjs` for each agent file. Run field validation checklist from Step 6 of agent-creator SKILL.md.
  - Verify: Companion check output documented, integration validation results for all 10

- [ ] **0.3** Compare all 10 agents against python-pro.md reference (~20 min)
  - Target Agent: `code-reviewer`
  - Recommended Skills: `checklist-generator`, `verification-before-completion`
  - Description: For each of the 10 agents, compare section structure against python-pro.md. Document which sections are missing: Response Approach, Behavioral Traits, Example Interactions. Also flag any frontmatter issues (extended_thinking, context_strategy). Produce a comparison matrix.
  - Verify: Comparison matrix produced with per-agent gap list

**Success Criteria**: All 10 keyword reports saved, companion checks documented, reference comparison complete

---

### Phase 1: Add Missing Sections to All 10 Agents

**Purpose**: Add Response Approach (8 steps), Behavioral Traits (10+), Example Interactions (8+) to each agent, fix Step 0 Skill() calls, fix frontmatter issues
**Dependencies**: Phase 0.3 (need comparison matrix to know exact gaps)
**Duration**: ~3-4 hours
**Parallel OK**: Yes (each agent is independent; can split into 2-3 parallel tasks of 3-4 agents each)

#### Task Batching Strategy

Split 10 agents into 3 batches to manage context limits:

- **Batch A** (4 domain agents): llm-architect, prompt-engineer, mcp-developer, api-designer
- **Batch B** (1 domain + 2 specialized): microservices-architect, sre-engineer, performance-engineer
- **Batch C** (3 specialized): penetration-tester, accessibility-tester, chaos-engineer

#### Tasks

- [ ] **1.1** Remediate Batch A: 4 domain agents (~75 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: For each agent in Batch A (llm-architect, prompt-engineer, mcp-developer, api-designer), apply these edits:
    1. **Add Response Approach section** (after Routing Exclusions or Domain Expertise, before Task Progress Protocol): 8 numbered steps specific to each agent's domain. Follow python-pro.md pattern.
    2. **Add Behavioral Traits section** (after Response Approach): 10+ domain-specific traits. Follow python-pro.md pattern.
    3. **Add Example Interactions section** (after Behavioral Traits): 8+ example request/action pairs in table format. Follow python-pro.md pattern.
    4. **Fix Step 0**: Replace `Read` calls with `Skill()` calls where Step 0 uses Read instead of Skill invocation.
    5. **Fix frontmatter**: Remove `extended_thinking: true` from llm-architect. Change `context_strategy: full` to `lazy_load` in llm-architect.
    6. **Add domain-development-workflow** to Related Workflows table for all 4 domain agents.
    7. **Add reflection-workflow** to Related Workflows table if missing.
  - Verify: Each agent file has Response Approach, Behavioral Traits, Example Interactions sections. `pnpm lint:fix` and `pnpm format` pass.

- [ ] **1.2** Remediate Batch B: 3 agents (~55 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Same edits as 1.1 for microservices-architect (domain), sre-engineer (specialized), performance-engineer (specialized).
    - Domain agent (microservices-architect): Add domain-development-workflow to Related Workflows.
    - Specialized agents: Do NOT add domain-development-workflow (they use Implementer workflow set).
  - Verify: Each agent file has all three sections. Lint/format pass.

- [ ] **1.3** Remediate Batch C: 3 agents (~55 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Same edits as 1.1 for penetration-tester, accessibility-tester, chaos-engineer (all specialized).
    - Fix frontmatter: Remove `extended_thinking: true` from penetration-tester.
    - Specialized agents: Do NOT add domain-development-workflow.
  - Verify: Each agent file has all three sections. Lint/format pass.

#### Section Templates

**Response Approach** (customize per domain):

```markdown
## Response Approach

1. **Acknowledge**: Confirm understanding of the task
2. **Discover**: Read memory files, check task list, search codebase
3. **Analyze**: Understand requirements, constraints, and context
4. **Plan**: Determine approach and tools needed
5. **Execute**: Perform the work using tools and skills
6. **Verify**: Check output quality and completeness
7. **Document**: Update memory with learnings and decisions
8. **Report**: Summarize what was done and results
```

**Behavioral Traits** (customize per domain):

```markdown
## Behavioral Traits

- [10+ domain-specific traits following python-pro.md pattern]
```

**Example Interactions** (customize per domain):

```markdown
## Example Interactions

| User Request                 | Agent Action |
| ---------------------------- | ------------ |
| [8+ rows specific to domain] |
```

**Success Criteria**: All 10 agents have Response Approach (8 steps), Behavioral Traits (10+ items), Example Interactions (8+ examples). Frontmatter issues fixed. Step 0 uses Skill() not Read().

---

### Phase 2: Integration Verification & Registry Updates

**Purpose**: Update agent-config.json, regenerate registry, run integration verification, verify routing-table keywords
**Dependencies**: Phase 1 (agents must be remediated first)
**Duration**: ~1-2 hours
**Parallel OK**: Partial

#### Commit Checkpoint

**CHECKPOINT**: Before starting Phase 2, commit Phase 0-1 changes. This creates a recovery point for the 10 modified agent files + 10 keyword research reports.

```bash
git add .claude/agents/domain/*.md .claude/agents/specialized/*.md .claude/context/artifacts/research-reports/agent-keywords-*.md
git commit -m "checkpoint: Phase 0-1 agent remediation - sections + research reports"
```

#### Tasks

- [ ] **2.1** Update agent-config.json for all 10 agents (~20 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Add entries for all 10 agents to `.claude/config/agent-config.json`. For each agent, add:
    - `tools`: match frontmatter tools array
    - `thinkingDefault`: `none` for sonnet agents, `medium` for opus agents
    - `phase`: appropriate phase (coding for developers, planning for architects)
  - Verify: `grep` for each agent name in agent-config.json returns a match

- [ ] **2.2** Regenerate agent registry and verify (~10 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Run `node .claude/tools/cli/generate-agent-registry.cjs`. Verify all 10 agents appear in `.claude/context/agent-registry.json` with correct capabilities and skills.
  - Verify: `grep` for each agent name in agent-registry.json returns a match. Total agent count is 59.

- [ ] **2.3** Run integration verification for all 10 agents (~20 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: For each of the 10 agents, run `node .claude/tools/cli/validate-integration.cjs .claude/agents/<category>/<agent-name>.md`. Fix any failures. Re-run until all pass.
  - Verify: All 10 agents pass integration verification with exit code 0

- [ ] **2.4** Verify routing-table.cjs keywords are adequate (~15 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Cross-reference the keyword research reports from Phase 0.1 with the keywords currently in routing-table.cjs. Add any high-confidence keywords that are missing. Ensure disambiguation rules exist where keywords overlap between agents.
  - Verify: Each agent has at least 5 high-confidence keywords in routing-table.cjs

**Success Criteria**: agent-config.json has all 10 entries, registry has all 10 agents, integration verification passes for all 10, keywords verified against research

---

### Phase 3: Code Review & QA

**Purpose**: Verify all remediation is correct and complete
**Dependencies**: Phase 2
**Duration**: ~1.5 hours
**Parallel OK**: Yes (review and QA can run in parallel)

#### Tasks

- [ ] **3.1** Code review of all 10 remediated agents (~45 min)
  - Target Agent: `code-reviewer`
  - Recommended Skills: `checklist-generator`, `verification-before-completion`
  - Description: Review all 10 agent files against the agent-creator SKILL.md completion checklist. Verify:
    - [ ] Response Approach section present with 8 numbered steps (domain-specific)
    - [ ] Behavioral Traits section present with 10+ domain-specific traits
    - [ ] Example Interactions section present with 8+ examples (domain-specific)
    - [ ] Step 0 uses Skill() not Read() for skill loading
    - [ ] No extended_thinking field in any agent
    - [ ] All context_strategy fields are lazy_load
    - [ ] Related Workflows include domain-development-workflow for domain agents
    - [ ] Keyword research reports exist for all 10 agents
    - [ ] agent-config.json entries exist for all 10
    - [ ] agent-registry.json entries exist for all 10
  - Verify: Code review report produced with PASS/FAIL per agent per criterion

- [ ] **3.2** QA validation (~30 min)
  - Target Agent: `qa`
  - Recommended Skills: `checklist-generator`, `verification-before-completion`, `tdd`
  - Description: Run full validation suite:
    - `pnpm lint:fix` (must produce 0 errors)
    - `pnpm format` (must produce no changes)
    - `node .claude/tools/cli/validate-integration.cjs` for all 10 agents
    - Verify agent-registry.json is valid JSON with 59 agents
    - Verify agent-config.json is valid JSON with 10 new entries
    - Spot-check 3 agents for section quality (not just existence)
  - Verify: QA report with all checks passing

**Success Criteria**: Code review and QA both pass with no blocking issues

---

### Phase 4: Commit, Document & Reflect

**Purpose**: Commit all changes, update documentation references, extract learnings
**Dependencies**: Phase 3
**Duration**: ~45 min
**Parallel OK**: Partial

#### Tasks

- [ ] **4.1** Commit all remediation changes (~15 min)
  - Target Agent: `devops`
  - Recommended Skills: `verification-before-completion`
  - Description: Stage and commit all changes with conventional commit format:
    - Agent file changes: `fix: remediate 10 agents with missing agent-creator process steps`
    - Config changes: `chore: add 10 new agents to agent-config.json`
    - Research reports: `docs: add keyword research reports for 10 new agents`
  - Verify: `git log --oneline -5` shows clean commits, `git status` is clean

- [ ] **4.2** Update documentation references (~15 min)
  - Target Agent: `technical-writer`
  - Recommended Skills: `doc-generator`, `verification-before-completion`
  - Description: Update @WORKFLOW_AGENT_MAP.md to include new agents in the Domain Specialist Workflow Set (domain agents) and Implementer Workflow Set (specialized agents). Verify the agent count references (59) are consistent across all documentation files.
  - Verify: @WORKFLOW_AGENT_MAP.md updated, agent counts consistent

- [ ] **4.3** Extract learnings to memory (~10 min)
  - Target Agent: `developer`
  - Recommended Skills: `verification-before-completion`
  - Description: Append to `.claude/context/memory/learnings.md`:
    - Pattern: Batch agent creation without agent-creator process results in missing sections
    - Remedy: Always use agent-creator SKILL.md even for manual bulk creation
    - Specific gaps found: Response Approach, Behavioral Traits, Example Interactions, keyword research, agent-config.json
    - Recommendation: Add automated validation that checks for Iron Law #10 sections in all agent files
  - Verify: Learnings appended to memory file

**Success Criteria**: All changes committed, documentation updated, learnings recorded

---

### Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 4

**Tasks**:

1. Spawn reflection-agent to analyze completed remediation work
2. Extract learnings and update memory files
3. Check for evolution opportunities (e.g., automated agent section validator hook)

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk                                     | Impact | Mitigation                             | Rollback                        |
| ---------------------------------------- | ------ | -------------------------------------- | ------------------------------- |
| Context limits editing large agent files | Medium | Batch into 3 groups of 3-4 agents      | Commit checkpoint after Phase 1 |
| Keyword research without Exa MCP         | Low    | Use WebSearch as fallback (adequate)   | N/A                             |
| Lint/format breaks on edited files       | Low    | Run lint:fix + format after each batch | git stash and retry             |
| Integration verification failures        | Low    | Fix failures before proceeding         | Revert to checkpoint            |

## Timeline Summary

| Phase     | Tasks  | Est. Time       | Parallel? |
| --------- | ------ | --------------- | --------- |
| 0         | 3      | 2-3 hours       | Yes       |
| 1         | 3      | 3-4 hours       | Yes       |
| 2         | 4      | 1-2 hours       | Partial   |
| 3         | 2      | 1.5 hours       | Yes       |
| 4         | 3      | 45 min          | Partial   |
| FINAL     | 1      | 15 min          | No        |
| **Total** | **16** | **~9-11 hours** |           |

## Agent Assignment Summary

| Task  | Target Agent       | Recommended Skills                                             |
| ----- | ------------------ | -------------------------------------------------------------- |
| 0.1   | `researcher`       | `research-synthesis`                                           |
| 0.2   | `developer`        | `verification-before-completion`                               |
| 0.3   | `code-reviewer`    | `checklist-generator`, `verification-before-completion`        |
| 1.1   | `developer`        | `verification-before-completion`                               |
| 1.2   | `developer`        | `verification-before-completion`                               |
| 1.3   | `developer`        | `verification-before-completion`                               |
| 2.1   | `developer`        | `verification-before-completion`                               |
| 2.2   | `developer`        | `verification-before-completion`                               |
| 2.3   | `developer`        | `verification-before-completion`                               |
| 2.4   | `developer`        | `verification-before-completion`                               |
| 3.1   | `code-reviewer`    | `checklist-generator`, `verification-before-completion`        |
| 3.2   | `qa`               | `checklist-generator`, `verification-before-completion`, `tdd` |
| 4.1   | `devops`           | `verification-before-completion`                               |
| 4.2   | `technical-writer` | `doc-generator`, `verification-before-completion`              |
| 4.3   | `developer`        | `verification-before-completion`                               |
| FINAL | `reflection-agent` | N/A                                                            |

## Appendix: Per-Agent Frontmatter Fixes

| Agent                   | Remove extended_thinking | Fix context_strategy | Other |
| ----------------------- | ------------------------ | -------------------- | ----- |
| llm-architect           | YES                      | full -> lazy_load    | --    |
| prompt-engineer         | Check                    | --                   | --    |
| mcp-developer           | Check                    | --                   | --    |
| api-designer            | --                       | --                   | --    |
| microservices-architect | Check                    | --                   | --    |
| sre-engineer            | --                       | --                   | --    |
| performance-engineer    | Check                    | --                   | --    |
| penetration-tester      | YES                      | --                   | --    |
| accessibility-tester    | Check                    | --                   | --    |
| chaos-engineer          | Check                    | --                   | --    |

**"Check"** means verify during Phase 1 -- the planner only read 3 agents in detail, remaining 7 need inspection during implementation.

## Appendix: Related Workflows Per Agent Type

### Domain Agents (5): llm-architect, prompt-engineer, mcp-developer, api-designer, microservices-architect

Per @WORKFLOW_AGENT_MAP.md Section 2 "Domain Specialist Workflow Set":

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. domain-development-workflow (UNIVERSAL for all domain agents)
5. external-integration (optional)

### Specialized Agents (5): sre-engineer, performance-engineer, penetration-tester, accessibility-tester, chaos-engineer

Per @WORKFLOW_AGENT_MAP.md Section 2 "Implementer Workflow Set":

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. external-integration (for agents that interact with external systems)
