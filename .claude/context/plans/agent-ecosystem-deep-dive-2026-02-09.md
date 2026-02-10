<!-- Agent: planner | Task: #25 | Session: 2026-02-09 -->

# Plan: Agent Ecosystem Deep-Dive Audit

## Executive Summary

Comprehensive audit of all 59 agents and their 600+ associated artifacts (93 skills, 66 tools, 28 templates, 87 schemas, 102 commands, hooks, workflows). The audit maps every agent to its ecosystem connections, identifies integration gaps, creates workflow diagrams, remediates gaps, and produces a final harmony report. Execution uses wave-based data collection (max 2 heavy agents in parallel) to prevent context overflow.

## Objectives

- Map every agent to its associated skills, tools, templates, rules, workflows, hooks, schemas, and commands
- Identify integration gaps where agents are missing connections
- Create Mermaid workflow diagrams for each major agent group
- Remediate all found gaps (missing assignments, broken references)
- Produce a comprehensive ecosystem harmony report

## Risk Constraints (CRITICAL)

- **Context overflow prevention**: Max 2 heavy agents in parallel (ADR from 2026-02-09 incident)
- **Report protocol**: All agents write detailed reports to `.claude/context/reports/` and return ONLY file path + 5-bullet summary (max 500 chars)
- **Wave execution**: Data collection broken into 5 waves of 7-16 agents each
- **Model budget**: haiku for data collection, sonnet for analysis, opus for architecture decisions

## Phases

---

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Validate audit approach, confirm artifact counts, establish baseline metrics
**Duration**: ~1 hour
**Parallel OK**: No (blocking)
**Dependencies**: None

#### Research Requirements (MANDATORY)

- [x] Internal codebase analysis (agent-registry.json, catalogs, routing-table.cjs)
- [x] Review known issues from memory files (70+ missing companions, 61% stub schemas)
- [x] Establish baseline metrics: 59 agents, 93 skills, 66 tools, 28 templates, 87 schemas, 102 commands

#### Hypothesis Framing

"We believe a systematic cross-reference audit of all 59 agents against their 600+ artifacts will reveal 30-50% of agents have incomplete integration (missing skills, routing keywords, or catalog entries). We'll know we're right when the gap analysis report quantifies exact missing connections per agent."

#### Constitution Checkpoint

1. **Research Completeness**
   - [x] Agent registry confirmed: 59 agents, all healthy
   - [x] Known issues reviewed: integration score 65%, 70+ missing companions
   - [x] Baseline established with exact counts from catalogs

2. **Technical Feasibility**
   - [x] Wave-based approach prevents context overflow
   - [x] All source files are readable (agent-registry.json, catalogs, routing-table.cjs)
   - [x] No blocking technical issues

3. **Security Review**
   - [x] Audit is read-only in Phases 1-4 (no security risk)
   - [x] Phase 5 remediation writes to non-security paths only
   - [x] No credentials or auth code involved

4. **Specification Quality**
   - [x] Success criteria: quantified gap count per agent
   - [x] Acceptance: harmony report with 0 critical gaps remaining
   - [x] Edge cases: agents not in registry but on filesystem (10 discrepancy)

**SUCCESS CRITERIA**: Phase 0 complete -- all gates passed.

#### Phase 0 Tasks

- [x] **0.1** Read agent-registry.json to confirm 59 agents (~5 min)
- [x] **0.2** Read AGENT_ROUTING_CARD.md to confirm categories (~5 min)
- [x] **0.3** Review learnings.md and issues.md for known gaps (~5 min)
- [x] **0.4** Design wave strategy for data collection (~10 min)

---

### Phase 1: Data Collection (MECHANICAL)

**Purpose**: Read every agent file and extract structured data (frontmatter, skills, model, type)
**Duration**: ~3 hours (5 waves, sequential)
**Dependencies**: Phase 0 complete
**Parallel OK**: Partial (max 2 agents per wave)

#### Wave Strategy

Each wave spawns 1-2 `researcher` agents (haiku model) that:

1. Read agent markdown files for the wave's category
2. Extract: name, type, model, skills[], routing keywords
3. Cross-reference against agent-registry.json entries
4. Write structured report to `.claude/context/reports/ecosystem-audit/`

#### Wave 1A: Core Agents (9 agents)

**Agents to audit**: architect, developer, planner, qa, pm, technical-writer, context-compressor, reflection-agent, router

- [ ] **1A.1** Read all 9 core agent files, extract frontmatter (~15 min)
  - **Target Agent**: `researcher` (haiku)
  - **Recommended Skills**: `ripgrep`
  - **Command**: Read `.claude/agents/core/*.md`, extract skills, model, type
  - **Verify**: Report exists at `.claude/context/reports/ecosystem-audit/wave-1a-core.md`

- [ ] **1A.2** Cross-reference core agents against routing-table.cjs keywords (~10 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read `.claude/lib/routing/routing-table.cjs`, map keywords to agents
  - **Verify**: Keyword mapping table in wave-1a report

#### Wave 1B: Review/Quality + Infrastructure/Ops (7 agents)

**Agents to audit**: code-reviewer, code-simplifier, security-architect, devops, devops-troubleshooter, incident-responder, database-architect

- [ ] **1B.1** Read all 7 agent files, extract frontmatter (~15 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read agent files, extract structured data
  - **Verify**: Report at `.claude/context/reports/ecosystem-audit/wave-1b-review-infra.md`

- [ ] **1B.2** Cross-reference against skill-catalog.md assignments (~10 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read skill-catalog.md, find skill-to-agent mappings
  - **Verify**: Skill assignment table in wave-1b report

#### Wave 1C: Language Specialists (10 agents)

**Agents to audit**: python-pro, typescript-pro, golang-pro, rust-pro, java-pro, php-pro, nodejs-pro, fastapi-pro, (+ 2 if present on filesystem but not in routing card)

- [ ] **1C.1** Read all language specialist agent files (~15 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read `.claude/agents/domain/*.md` for language specialists
  - **Verify**: Report at `.claude/context/reports/ecosystem-audit/wave-1c-language.md`

- [ ] **1C.2** Verify each language specialist has appropriate domain skills (~10 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Cross-reference frontmatter skills against skill-catalog.md
  - **Verify**: Skills gap table in wave-1c report

#### Wave 1D: Framework + Mobile/Desktop Specialists (9 agents)

**Agents to audit**: frontend-pro, nextjs-pro, sveltekit-expert, graphql-pro, ios-pro, android-pro, expo-mobile-developer, tauri-desktop-developer, (+ 1 if present)

- [ ] **1D.1** Read all framework and mobile agent files (~15 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read agent files for framework and mobile categories
  - **Verify**: Report at `.claude/context/reports/ecosystem-audit/wave-1d-framework-mobile.md`

- [ ] **1D.2** Cross-reference against command-catalog.md and template-catalog.md (~10 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Check which agents have associated commands and templates
  - **Verify**: Command/template mapping in wave-1d report

#### Wave 1E: Specialist Domains + Orchestrators + Meta (16 agents)

**Agents to audit**: data-engineer, ai-ml-specialist, web3-blockchain-expert, scientific-research-expert, gamedev-pro, mobile-ux-reviewer, researcher, c4-context, c4-container, c4-component, c4-code, master-orchestrator, evolution-orchestrator, party-orchestrator, swarm-coordinator, conductor-validator, reverse-engineer

- [ ] **1E.1** Read all remaining agent files (~20 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read agent files for remaining categories
  - **Verify**: Report at `.claude/context/reports/ecosystem-audit/wave-1e-specialist-orch.md`

- [ ] **1E.2** Cross-reference orchestrators against workflow-agent-map (~10 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Read `@WORKFLOW_AGENT_MAP.md`, verify orchestrator assignments
  - **Verify**: Workflow mapping in wave-1e report

#### Phase 1 Verification Gate

```
All 5 wave reports exist in .claude/context/reports/ecosystem-audit/
Each report contains: agent name, type, model, skills[], keywords, gaps[]
Total agents audited == 59 (or adjusted count from filesystem scan)
```

**SUCCESS CRITERIA**: All 59 agents have structured data extracted into wave reports.

---

### Phase 2: Cross-Reference Mapping (ANALYSIS)

**Purpose**: Build complete agent-to-ecosystem mapping matrix
**Duration**: ~2 hours
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes (2 agents)

#### Tasks

- [ ] **2.1** Build master agent-ecosystem matrix (~45 min)
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `ripgrep`, `code-semantic-search`
  - **Command**: Consolidate all 5 wave reports into single matrix:
    - Agent -> Skills (from frontmatter + skill-catalog.md)
    - Agent -> Rules (from `.claude/rules/` file matching)
    - Agent -> Schemas (from schema-catalog.md consumer lists)
    - Agent -> Commands (from command-catalog.md)
    - Agent -> Workflows (from @WORKFLOW_AGENT_MAP.md)
    - Agent -> Hooks (from @HOOK_AGENT_MAP.md)
    - Agent -> Templates (from template-catalog.md)
  - **Verify**: Matrix file at `.claude/context/reports/ecosystem-audit/agent-ecosystem-matrix.md`
  - **Rollback**: Delete matrix file, re-run from wave reports

- [ ] **2.2** Build reverse mapping: artifact -> consumers (~30 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `ripgrep`
  - **Command**: For each skill/tool/hook/workflow, list which agents consume it
  - **Verify**: Reverse mapping at `.claude/context/reports/ecosystem-audit/artifact-consumer-map.md`

- [ ] **2.3** Identify filesystem vs registry discrepancies (~15 min) [parallel OK]
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Compare `.claude/agents/**/*.md` file list against agent-registry.json entries
  - **Verify**: Discrepancy list in report (expected: 59 registry vs actual filesystem count)

#### Phase 2 Error Handling

If matrix consolidation fails:

1. Check if all 5 wave reports exist (Phase 1 gate)
2. Re-read missing reports
3. Retry consolidation
4. If still fails: escalate to opus-level architect

#### Phase 2 Verification Gate

```
agent-ecosystem-matrix.md exists with 59 rows (one per agent)
artifact-consumer-map.md exists with entries for skills, tools, hooks, workflows
Each agent row has: skills_count, rules_count, schemas_count, commands_count, workflows_count, hooks_count
```

**SUCCESS CRITERIA**: Complete bidirectional mapping of all agents to all artifact types.

---

### Phase 3: Gap Analysis (CRITICAL)

**Purpose**: Identify all integration gaps, missing connections, orphaned artifacts
**Duration**: ~2 hours
**Dependencies**: Phase 2 complete
**Parallel OK**: Partial

#### Gap Categories

| Gap Type                         | Description            | Severity |
| -------------------------------- | ---------------------- | -------- |
| Agent with <3 skills             | Agent too underpowered | HIGH     |
| Agent missing from routing-table | Agent undiscoverable   | CRITICAL |
| Skill not assigned to any agent  | Orphaned skill         | MEDIUM   |
| Agent missing rules file         | No behavioral guidance | HIGH     |
| Command with no backing skill    | Dead command           | LOW      |
| Schema with no consumer          | Orphaned schema        | LOW      |
| Workflow with no assigned agent  | Unexecutable workflow  | HIGH     |

#### Tasks

- [ ] **3.1** Agent integration gap analysis (~45 min)
  - **Target Agent**: `architect` (opus)
  - **Recommended Skills**: `architecture-review`, `complexity-assessment`
  - **Command**: For each agent, verify:
    - Has >= 3 skills assigned
    - Has routing keywords in routing-table.cjs
    - Has rules file in `.claude/rules/`
    - Has entry in agent-registry.json
    - Is referenced in @AGENT_ROUTING_TABLE.md
  - **Verify**: Gap report at `.claude/context/reports/ecosystem-audit/agent-gaps.md`

- [ ] **3.2** Orphaned artifact analysis (~30 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `ripgrep`
  - **Command**: Identify:
    - Skills not assigned to any agent
    - Commands with no backing skill
    - Schemas with no consumer
    - Templates with no consumer
    - Hooks not in settings.json
  - **Verify**: Orphan report at `.claude/context/reports/ecosystem-audit/orphaned-artifacts.md`

- [ ] **3.3** Cross-reference integrity check (~20 min) [parallel OK]
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Verify:
    - All agent-registry.json entries have valid filePath
    - All routing-table.cjs agents exist in registry
    - All skill-catalog.md entries have SKILL.md files
  - **Verify**: Integrity report at `.claude/context/reports/ecosystem-audit/integrity-check.md`

- [ ] **3.4** Quantified gap summary (~15 min)
  - **Target Agent**: `architect` (sonnet)
  - **Command**: Consolidate gaps 3.1-3.3 into quantified summary:
    - Total gaps by category
    - Severity distribution (CRITICAL/HIGH/MEDIUM/LOW)
    - Top 10 agents with most gaps
    - Top 10 most orphaned artifacts
  - **Verify**: Summary at `.claude/context/reports/ecosystem-audit/gap-summary.md`

#### Phase 3 Error Handling

If gap analysis produces >200 gaps:

1. Prioritize by severity (CRITICAL first)
2. Group by fix type (batch-fixable vs individual)
3. Consider splitting Phase 5 into multiple sub-phases

#### Phase 3 Verification Gate

```
agent-gaps.md exists with per-agent gap listings
orphaned-artifacts.md exists with categorized orphan lists
integrity-check.md exists with pass/fail for each check
gap-summary.md exists with quantified totals
```

--- CHECKPOINT: Commit Phase 1-3 changes before remediation ---

**Commit checkpoint**: Multi-file project (50+ report files). Commit creates recovery point.

```bash
git add .claude/context/reports/ecosystem-audit/ && git commit -m "checkpoint: ecosystem audit Phase 1-3 data collection and gap analysis complete"
```

**SUCCESS CRITERIA**: All gaps identified, quantified, and prioritized. Commit checkpoint saved.

---

### Phase 4: Workflow Diagram Creation (VISUALIZATION)

**Purpose**: Create Mermaid diagrams showing agent-ecosystem relationships
**Duration**: ~2 hours
**Dependencies**: Phase 3 complete
**Parallel OK**: Yes (2 agents)

#### Diagram Specifications

| Diagram               | Type            | Scope                                          | Max Nodes |
| --------------------- | --------------- | ---------------------------------------------- | --------- |
| System Overview       | graph TB        | All 59 agents grouped by category              | ~80       |
| Core Agent Ecosystem  | graph LR        | 9 core agents + their skills/hooks/workflows   | ~60       |
| Review Pipeline       | sequenceDiagram | code-reviewer -> qa -> security-architect flow | ~20       |
| Orchestrator Topology | graph TB        | 4 orchestrators + their agent coordination     | ~40       |
| Skill Distribution    | graph TB        | Skills -> Agent assignments (heat map style)   | ~100      |
| Artifact Dependency   | graph TB        | Agent -> Skill -> Hook -> Schema relationships | ~80       |

#### Tasks

- [ ] **4.1** Create system overview diagram (~30 min)
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create Mermaid graph TB showing all 59 agents grouped by category with inter-group connections
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/ecosystem-overview-2026-02-09.mmd`

- [ ] **4.2** Create core agent ecosystem diagram (~20 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create detailed diagram of 9 core agents showing skill, hook, and workflow connections
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/core-agent-ecosystem-2026-02-09.mmd`

- [ ] **4.3** Create review pipeline sequence diagram (~15 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create sequenceDiagram showing code-review -> QA -> security-architect flow
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/review-pipeline-2026-02-09.mmd`

- [ ] **4.4** Create orchestrator topology diagram (~15 min)
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create graph TB showing orchestrators and which agents they coordinate
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/orchestrator-topology-2026-02-09.mmd`

- [ ] **4.5** Create skill distribution diagram (~20 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create diagram showing skill-to-agent distribution with gap highlights
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/skill-distribution-2026-02-09.mmd`

- [ ] **4.6** Create artifact dependency diagram (~20 min) [parallel OK]
  - **Target Agent**: `architect` (sonnet)
  - **Recommended Skills**: `diagram-generator`
  - **Command**: Create diagram showing Agent -> Skill -> Hook -> Schema dependency chains
  - **Verify**: Diagram at `.claude/context/artifacts/diagrams/artifact-dependencies-2026-02-09.mmd`

#### Phase 4 Verification Gate

```
6 .mmd files exist in .claude/context/artifacts/diagrams/
Each diagram renders valid Mermaid syntax
No diagram exceeds 200 nodes
All diagrams reference agents from the ecosystem matrix (Phase 2)
```

**SUCCESS CRITERIA**: 6 Mermaid diagrams created, all valid and readable.

---

### Phase 5: Remediation (EXECUTION)

**Purpose**: Fix all identified gaps from Phase 3
**Duration**: ~4-6 hours (depends on gap count)
**Dependencies**: Phase 3 complete (Phase 4 can run in parallel)
**Parallel OK**: Partial (max 2 agents per wave)

#### Remediation Strategy

Fixes are batched by type for efficiency:

| Fix Type                        | Agent            | Model  | Batch Size     |
| ------------------------------- | ---------------- | ------ | -------------- |
| Add skills to agent frontmatter | developer        | sonnet | 10 agents/wave |
| Add routing keywords            | developer        | sonnet | 10 agents/wave |
| Update skill-catalog.md         | technical-writer | haiku  | All at once    |
| Update agent-registry.json      | developer        | sonnet | Full rebuild   |
| Create missing rules files      | technical-writer | haiku  | 5 files/wave   |
| Update @AGENT_ROUTING_TABLE.md  | technical-writer | haiku  | All at once    |

#### Tasks

- [ ] **5.1** Fix CRITICAL gaps: agents missing from routing-table (~30 min)
  - **Target Agent**: `developer` (sonnet)
  - **Recommended Skills**: `tdd`, `verification-before-completion`
  - **Command**: Add missing agents to `.claude/lib/routing/routing-table.cjs` with appropriate keywords
  - **Verify**: All 59 agents have routing keywords
  - **Rollback**: `git checkout -- .claude/lib/routing/routing-table.cjs`

- [ ] **5.2** Fix HIGH gaps: agents with <3 skills (~45 min)
  - **Target Agent**: `developer` (sonnet)
  - **Recommended Skills**: `verification-before-completion`
  - **Command**: Update agent frontmatter to include >= 3 relevant skills per agent
  - **Verify**: Every agent markdown has skills: [...] with >= 3 entries
  - **Rollback**: `git checkout -- .claude/agents/`

- [ ] **5.3** Fix HIGH gaps: agents missing rules files (~30 min)
  - **Target Agent**: `technical-writer` (haiku)
  - **Recommended Skills**: `writing-skills`
  - **Command**: Create `.claude/rules/{agent-name}.md` for agents missing them
  - **Verify**: Every agent has a corresponding rules file

- [ ] **5.4** Fix MEDIUM gaps: orphaned skills (~20 min)
  - **Target Agent**: `developer` (sonnet)
  - **Recommended Skills**: `verification-before-completion`
  - **Command**: Assign orphaned skills to appropriate agents (update frontmatter)
  - **Verify**: All skills in skill-catalog.md have at least one agent consumer

- [ ] **5.5** Update catalogs and registries (~30 min)
  - **Target Agent**: `technical-writer` (haiku)
  - **Recommended Skills**: `doc-generator`
  - **Command**: Update skill-catalog.md, agent-registry.json, @AGENT_ROUTING_TABLE.md with all changes
  - **Verify**: Catalogs reflect current state, no stale references

- [ ] **5.6** Rebuild agent-registry.json from filesystem (~15 min)
  - **Target Agent**: `developer` (sonnet)
  - **Command**: Run registry rebuild to ensure filesystem matches registry
  - **Verify**: agent-registry.json agent count matches `.claude/agents/**/*.md` file count

#### Phase 5 Error Handling

If remediation causes test failures:

1. Rollback to Phase 3 checkpoint commit
2. Fix the specific issue
3. Re-apply non-conflicting remediations
4. Create separate task for complex fixes

#### Phase 5 Verification Gate

```bash
# Verify all agents have routing keywords
node -e "const rt = require('./.claude/lib/routing/routing-table.cjs'); console.log('Agents with keywords:', Object.keys(rt).length)"

# Verify agent-registry.json is complete
node -e "const r = require('./.claude/context/agent-registry.json'); console.log('Registered agents:', r.metadata.totalAgents)"

# Verify no orphaned skills
# (Custom script would check skill-catalog.md against agent frontmatter)
```

**SUCCESS CRITERIA**: All CRITICAL and HIGH gaps resolved. MEDIUM gaps resolved where feasible. LOW gaps documented for future work.

---

### Phase 6: Final Report (DOCUMENTATION)

**Purpose**: Produce comprehensive ecosystem harmony report
**Duration**: ~1.5 hours
**Dependencies**: Phases 3, 4, 5 complete
**Parallel OK**: No

#### Tasks

- [ ] **6.1** Write comprehensive ecosystem harmony report (~60 min)
  - **Target Agent**: `technical-writer` (sonnet)
  - **Recommended Skills**: `doc-generator`, `writing-skills`, `verification-before-completion`
  - **Command**: Create report at `.claude/context/reports/ecosystem-audit/ecosystem-harmony-report-2026-02-09.md` containing:
    1. Executive summary with key metrics
    2. Agent-ecosystem matrix (from Phase 2)
    3. Gap analysis results (from Phase 3)
    4. Remediation summary (from Phase 5)
    5. Diagram references (from Phase 4)
    6. Remaining issues and recommendations
    7. Ecosystem health score (before/after)
  - **Verify**: Report exists with all 7 sections, references all diagrams

- [ ] **6.2** Update memory files with audit learnings (~15 min)
  - **Target Agent**: `technical-writer` (haiku)
  - **Command**: Append audit findings to:
    - `learnings.md`: Patterns discovered during audit
    - `decisions.md`: ADR for audit methodology
    - `issues.md`: Remaining gaps for future work
  - **Verify**: Memory files updated with dated entries

- [ ] **6.3** Create ecosystem health dashboard data (~15 min)
  - **Target Agent**: `researcher` (haiku)
  - **Command**: Extract key metrics into JSON for dashboard:
    - Total agents, skills, tools, commands
    - Integration completeness percentage
    - Gap counts by severity
    - Before/after comparison
  - **Verify**: Dashboard data at `.claude/context/reports/ecosystem-audit/health-metrics.json`

#### Phase 6 Verification Gate

```
ecosystem-harmony-report-2026-02-09.md exists with 7 sections
health-metrics.json exists with valid JSON
Memory files updated with audit entries
All 6 diagrams referenced in report
```

**SUCCESS CRITERIA**: Comprehensive report delivered with quantified before/after metrics.

---

### Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: All previous phases complete

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from the Agent Ecosystem Deep-Dive Audit plan. Review all reports in .claude/context/reports/ecosystem-audit/. Extract learnings to memory files. Check for evolution opportunities: do we need new agents or skills based on the gaps found? Are there patterns that suggest the framework should evolve?"
})
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk                                                    | Impact | Mitigation                                                 | Rollback                                              |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| Context overflow from too many parallel agents          | HIGH   | Max 2 heavy agents per wave; all reports to files          | Kill agents, restart wave                             |
| Agent files have inconsistent frontmatter formats       | MEDIUM | Normalize during Phase 1 extraction                        | Manual reading fallback                               |
| Gap count exceeds 200 (overwhelming remediation)        | HIGH   | Prioritize CRITICAL/HIGH only; defer LOW to follow-up task | Skip Phase 5, deliver gap report only                 |
| Registry rebuild breaks existing routing                | HIGH   | Git checkpoint before Phase 5                              | `git checkout -- .claude/context/agent-registry.json` |
| Mermaid diagrams exceed readability limits (200+ nodes) | MEDIUM | Split into focused sub-diagrams                            | Reduce scope per diagram                              |
| Phase 5 remediation introduces regressions              | MEDIUM | Run `pnpm test` after each wave                            | Rollback to Phase 3 checkpoint                        |

## Timeline Summary

| Phase              | Tasks            | Est. Time     | Parallel? | Model Budget             |
| ------------------ | ---------------- | ------------- | --------- | ------------------------ |
| 0: Research        | 4                | ~25 min       | No        | (planner - already done) |
| 1: Data Collection | 10 (5 waves x 2) | ~3 hours      | Partial   | haiku                    |
| 2: Cross-Reference | 3                | ~1.5 hours    | Yes       | sonnet                   |
| 3: Gap Analysis    | 4                | ~2 hours      | Partial   | opus + sonnet            |
| --- CHECKPOINT --- | 1                | ~5 min        | No        | ---                      |
| 4: Diagrams        | 6                | ~2 hours      | Yes       | sonnet                   |
| 5: Remediation     | 6                | ~4 hours      | Partial   | sonnet + haiku           |
| 6: Final Report    | 3                | ~1.5 hours    | No        | sonnet + haiku           |
| FINAL: Reflection  | 1                | ~30 min       | No        | sonnet                   |
| **Total**          | **38**           | **~15 hours** |           |                          |

## Agent Assignments Summary

| Phase     | Agent Type                    | Model                 | Count                       |
| --------- | ----------------------------- | --------------------- | --------------------------- |
| 0         | planner                       | opus                  | 1                           |
| 1         | researcher                    | haiku                 | 10 spawns (5 waves x 2)     |
| 2         | architect + researcher        | sonnet + haiku        | 3 spawns                    |
| 3         | architect + researcher        | opus + sonnet + haiku | 4 spawns                    |
| 4         | architect                     | sonnet                | 6 spawns (3 parallel pairs) |
| 5         | developer + technical-writer  | sonnet + haiku        | 6 spawns                    |
| 6         | technical-writer + researcher | sonnet + haiku        | 3 spawns                    |
| FINAL     | reflection-agent              | sonnet                | 1 spawn                     |
| **Total** |                               |                       | **34 agent spawns**         |

## Output Artifacts

| Artifact                      | Location                                                                         | Phase |
| ----------------------------- | -------------------------------------------------------------------------------- | ----- |
| Wave reports (5)              | `.claude/context/reports/ecosystem-audit/wave-*.md`                              | 1     |
| Agent-ecosystem matrix        | `.claude/context/reports/ecosystem-audit/agent-ecosystem-matrix.md`              | 2     |
| Artifact-consumer map         | `.claude/context/reports/ecosystem-audit/artifact-consumer-map.md`               | 2     |
| Agent gaps report             | `.claude/context/reports/ecosystem-audit/agent-gaps.md`                          | 3     |
| Orphaned artifacts report     | `.claude/context/reports/ecosystem-audit/orphaned-artifacts.md`                  | 3     |
| Integrity check report        | `.claude/context/reports/ecosystem-audit/integrity-check.md`                     | 3     |
| Gap summary                   | `.claude/context/reports/ecosystem-audit/gap-summary.md`                         | 3     |
| System overview diagram       | `.claude/context/artifacts/diagrams/ecosystem-overview-2026-02-09.mmd`           | 4     |
| Core agent ecosystem diagram  | `.claude/context/artifacts/diagrams/core-agent-ecosystem-2026-02-09.mmd`         | 4     |
| Review pipeline diagram       | `.claude/context/artifacts/diagrams/review-pipeline-2026-02-09.mmd`              | 4     |
| Orchestrator topology diagram | `.claude/context/artifacts/diagrams/orchestrator-topology-2026-02-09.mmd`        | 4     |
| Skill distribution diagram    | `.claude/context/artifacts/diagrams/skill-distribution-2026-02-09.mmd`           | 4     |
| Artifact dependency diagram   | `.claude/context/artifacts/diagrams/artifact-dependencies-2026-02-09.mmd`        | 4     |
| Ecosystem harmony report      | `.claude/context/reports/ecosystem-audit/ecosystem-harmony-report-2026-02-09.md` | 6     |
| Health metrics JSON           | `.claude/context/reports/ecosystem-audit/health-metrics.json`                    | 6     |
| **Total: 17 artifacts**       |                                                                                  |       |

## Execution Notes

### Context Overflow Prevention Protocol

1. **Wave execution**: Never spawn more than 2 heavy agents simultaneously
2. **Report protocol**: Agents write to `.claude/context/reports/ecosystem-audit/` and return only file path + 5-bullet summary
3. **Model selection**: Use haiku for mechanical data collection, sonnet for analysis, opus only for architectural decisions
4. **Compression**: If context exceeds 80K tokens during any phase, invoke `context-compressor` skill before continuing
5. **Sequential waves**: Complete one wave before starting next (prevents context accumulation)

### Parallel Execution Map

```
Phase 1:  Wave 1A → Wave 1B → Wave 1C → Wave 1D → Wave 1E  (sequential waves)
Phase 2:  [2.1] → [2.2 || 2.3]  (2.2 and 2.3 parallel after 2.1)
Phase 3:  [3.1 || 3.2] → [3.3] → [3.4]  (3.1 and 3.2 parallel)
Phase 4:  [4.1 || 4.2] → [4.3 || 4.4] → [4.5 || 4.6]  (paired parallel)
Phase 5:  [5.1] → [5.2] → [5.3] → [5.4] → [5.5] → [5.6]  (sequential for safety)
Phase 6:  [6.1] → [6.2 || 6.3]  (6.2 and 6.3 parallel after 6.1)
```
