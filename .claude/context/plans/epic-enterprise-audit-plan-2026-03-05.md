<!-- Agent: planner | Task: #task-1 | Session: 2026-03-05 -->

# EPIC Enterprise Audit Plan — Agent Studio Framework

**Version:** 1.0.0
**Complexity:** EPIC
**Created:** 2026-03-05
**Output:** `.claude/context/plans/epic-enterprise-audit-plan-2026-03-05.md`

---

## Overview

Comprehensive 8-area enterprise audit of the agent-studio framework covering: agent search tool compliance, agent search tool tests, memory system usage, ripgrep skill wiring, token-saver skill wiring, reflection agent deep dive, evolution system deep dive, and core fundamentals (routing, hooks, spawn templates, TaskUpdate enforcement).

**Hypothesis:** We believe that systematically auditing all 72 agents across 8 dimensions will surface wiring gaps, missing skill assignments, broken hooks, and untested paths that degrade framework reliability. We will know we are right when each audit area produces a concrete findings report with zero false-positives and actionable remediation tasks.

---

## Constitution Checkpoint (Phase 0 — PASSED)

1. **Research Completeness**: Context gathered from agent-registry.json (72 agents), agent-skill-matrix.json (core/domain/specialized/orchestrator), skill-index.json (265 skills), reflection-agent.md, ripgrep/SKILL.md, token-saver-context-compression/SKILL.md, universal-agent-spawn.md, spawn-prompt-assembler.memory.cjs, routing-guard.cjs, @EVOLUTION_WORKFLOW.md
2. **Technical Feasibility**: All audit targets exist and are readable; test infrastructure (`pnpm test`) available; no blocking technical issues
3. **Security Review**: Audit includes spawn-prompt-assembler injection sanitization review, routing-guard enforcement mode verification, creator-guard bypass analysis
4. **Specification Quality**: Each audit area has measurable acceptance criteria (pass/fail per agent, concrete file paths, test commands)

---

## Key Findings from Context Gathering

1. **72 agents** in registry (CLAUDE.md says 66 — stale reference)
2. **agent-skill-matrix.json** shows consistent "always" arrays across ALL domain/specialized agents: `verification-before-completion`, `task-management-protocol`, `memory-search`, `ripgrep`, `code-semantic-search`, `code-structural-search`, `token-saver-context-compression`
3. **reflection-agent** has NO "always" skills in the matrix — only primary/secondary. Missing: `task-management-protocol`, `ripgrep`, `code-semantic-search`, `code-structural-search`, `token-saver-context-compression`, `memory-search`, `verification-before-completion`. However, its frontmatter DOES list these skills — so this is a matrix-vs-frontmatter discrepancy
4. **router** has empty "always" array in the matrix (expected — router does not execute work)
5. **aso-specialist, brand-guardian, compliance-checker, feedback-synthesizer, marketing-strategist, ux-researcher** have "always" arrays but MISSING `task-management-protocol` — only have the 6 search/verification skills
6. **Orchestrators** (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator, artifact-integrator) need separate validation — they may not appear in agent-skill-matrix.json
7. **routing-guard.cjs** is a thin wrapper delegating to `routing-guard-core.cjs` — enforcement defaults are all `block`
8. **spawn-prompt-assembler.memory.cjs** has injection sanitization (INJECTION_PATTERNS), 3600-char memory budget cap, semantic match injection

---

## Execution Topology

### Parallel Wave Architecture (Max 2 Heavy Agents per Wave)

**Critical constraint from MEMORY.md:** Max 2 heavy agents in parallel to prevent context overflow. Each agent MUST write report to file and return only file path + 5-bullet summary.

### Microtask DAG

| task_id | target_agent | owned_paths | forbidden_paths | depends_on | dependency_type | parallel_group | acceptance_checks | deliverable |
|---------|-------------|-------------|-----------------|------------|----------------|----------------|-------------------|-------------|
| M1 | `qa` | `tests/audit/agent-search-compliance.test.cjs` | `src/**`, `.claude/agents/**` | - | - | G1 | `node --test tests/audit/agent-search-compliance.test.cjs` passes | Test file + report |
| M2 | `qa` | `tests/audit/agent-search-wiring.test.cjs` | `src/**`, `.claude/agents/**` | - | - | G1 | `node --test tests/audit/agent-search-wiring.test.cjs` passes | Test file + report |
| M3 | `code-reviewer` | `.claude/context/reports/backend/memory-system-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | M1 | related | G2 | Report exists with per-agent findings | Audit report |
| M4 | `code-reviewer` | `.claude/context/reports/backend/ripgrep-skill-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | M2 | related | G2 | Report exists with per-agent findings | Audit report |
| M5 | `code-reviewer` | `.claude/context/reports/backend/token-saver-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | - | - | G3 | Report exists with per-agent findings | Audit report |
| M6 | `code-reviewer` | `.claude/context/reports/backend/reflection-agent-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | - | - | G3 | Report exists with per-agent findings | Audit report |
| M7 | `code-reviewer` | `.claude/context/reports/backend/evolution-system-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | - | - | G4 | Report exists with per-agent findings | Audit report |
| M8 | `code-reviewer` | `.claude/context/reports/backend/core-fundamentals-audit-2026-03-05.md` | `.claude/agents/**`, `tests/**` | - | - | G4 | Report exists with per-agent findings | Audit report |
| M9 | `developer` | Remediation files per findings | - | M1-M8 | blocks | G5 | `pnpm lint:fix` + `pnpm format` pass | Fixed files |
| M10 | `devops` | Git commit | - | M9 | blocks | G6 | `git log --oneline -1` shows commit | Committed changes |
| M11 | `reflection-agent` | `.claude/context/reports/reflections/` | - | M10 | blocks | G7 | Reflection report exists | Reflection report |

### Parallelization Guardrails

- Max active parallel microtasks: **2** (per MEMORY.md P0 constraint)
- Parallel execution allowed only within a group with zero path overlap
- Cross-group tasks run by DAG topological order
- Merge gate runs after each parallel group before next group starts
- Each agent writes report to `.claude/context/reports/backend/` and returns ONLY file path + 5-bullet summary (max 500 chars)

---

## Phases

### Phase 1: Search Tool Compliance Tests (G1 — Parallel Wave)

**Purpose:** Create automated tests that verify ALL 72 agents have correct search skill assignments across 3 layers (frontmatter, agent-skill-matrix.json, agent-registry.json)
**Duration:** ~2 hours
**Parallel OK:** Yes (2 tasks, zero path overlap)

#### Task M1: Agent Search Tool Compliance Test Suite

**Target Agent:** `qa`
**Recommended Skills:** `tdd`, `verification-before-completion`, `ripgrep`

**Description:**
Create `tests/audit/agent-search-compliance.test.cjs` that:

1. Reads `.claude/context/agent-registry.json` and parses all 72 agents
2. For EACH agent (excluding `router`), verifies the `skills` array contains:
   - `ripgrep`
   - `code-semantic-search`
   - `code-structural-search`
3. For agents that should have them (all except router), verifies:
   - `token-saver-context-compression`
   - `memory-search`
   - `verification-before-completion`
   - `task-management-protocol`
4. Cross-references with `agent-skill-matrix.json` "always" arrays
5. Reports discrepancies as test failures with agent name and missing skill

**Test structure:**
```javascript
// test: every non-router agent has search skills in registry
// test: every non-router agent has search skills in agent-skill-matrix.json "always"
// test: frontmatter skills match registry skills (no orphans)
// test: agent count matches expected (72)
```

**Acceptance Criteria:**
- Test file exists at `tests/audit/agent-search-compliance.test.cjs`
- `node --test tests/audit/agent-search-compliance.test.cjs` runs (may have expected failures for known gaps)
- Test output clearly identifies which agents are missing which skills

#### Task M2: Agent Search Tool Wiring Regression Tests

**Target Agent:** `qa`
**Recommended Skills:** `tdd`, `verification-before-completion`, `ripgrep`

**Description:**
Create `tests/audit/agent-search-wiring.test.cjs` that:

1. Validates the 3-layer skill resolution system integrity:
   - Layer 1: Agent frontmatter `skills:` array (from `.claude/agents/**/*.md`)
   - Layer 2: `agent-skill-matrix.json` assignments (primary/secondary/always/contextual)
   - Layer 3: `skill-index.json` agentPrimary/agentSupporting arrays
2. For EACH of the 4 search skills (`ripgrep`, `code-semantic-search`, `code-structural-search`, `token-saver-context-compression`):
   - Verify skill exists in `skill-index.json`
   - Verify `agentPrimary` list includes expected agents
   - Count total agents assigned vs total agents in registry
3. Detect regression patterns:
   - Agent added to registry but missing from skill-index agentPrimary
   - Agent in skill-index but removed from registry
   - Agent in matrix "always" but not in skill-index agentPrimary

**Acceptance Criteria:**
- Test file exists at `tests/audit/agent-search-wiring.test.cjs`
- `node --test tests/audit/agent-search-wiring.test.cjs` runs
- Coverage report identifies wiring gaps per skill per layer

**Success Criteria Phase 1:** Both test files exist and run. Test output documents all wiring discrepancies.

---

### Phase 2: Memory & Skill Audits (G2 — Parallel Wave)

**Purpose:** Deep audit of memory system usage and ripgrep skill wiring
**Duration:** ~2 hours
**Dependencies:** Phase 1 complete (test results inform audit focus)
**Parallel OK:** Yes (2 tasks, zero path overlap)

#### Task M3: Memory System Usage Audit

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/memory-system-audit-2026-03-05.md` covering:

1. **spawn-prompt-assembler memory injection** — Read `spawn-prompt-assembler.memory.cjs`:
   - Verify INJECTION_PATTERNS blocklist covers OWASP prompt injection vectors
   - Verify MEMORY_INJECTION_MAX_CHARS budget (3600 default)
   - Verify semantic match injection caps results to 3
   - Verify `capTierBSection()` correctly truncates oversized content
2. **MemoryRecord tool availability** — Check `universal-agent-spawn.md`:
   - Verify `MemoryRecord` is in the `allowed_tools` list
   - Verify spawn template documents MemoryRecord usage
   - Check if any agent definitions override allowed_tools to EXCLUDE MemoryRecord
3. **memory-search skill assignment** — Cross-reference:
   - `agent-skill-matrix.json`: verify ALL non-router agents have `memory-search` in "always"
   - `skill-index.json`: verify `memory-search` skill has all expected agents in agentPrimary
   - Flag agents missing from either
4. **STM/MTM/LTM pipeline integrity**:
   - Verify `session-end-memory-promotion.cjs` exists and is registered in settings.json
   - Verify `memory-tiers.cjs` handles promotion correctly
   - Verify `generate-embeddings.cjs` indexes mtm/ and ltm/ (fix from session 2026-03-03)
5. **Known issues to validate** (from MEMORY.md):
   - `aso-specialist`, `brand-guardian`, `compliance-checker`, `feedback-synthesizer`, `marketing-strategist`, `ux-researcher` missing `task-management-protocol` in matrix "always"
   - reflection-agent has NO "always" skills in matrix (vs frontmatter which lists them)

**Acceptance Criteria:**
- Report exists at declared path
- Per-agent pass/fail matrix for memory-search assignment
- Specific file:line references for any security findings

#### Task M4: Ripgrep Skill Wiring Audit

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/ripgrep-skill-audit-2026-03-05.md` covering:

1. **skill-index.json validation**:
   - Read `ripgrep` entry in skill-index.json
   - Verify `agentPrimary` list matches expected agents (should be ~58+ agents)
   - Identify any agents in registry but NOT in ripgrep agentPrimary
   - Verify `requiredTools` is `["Read", "Write", "Edit"]`
2. **Agent frontmatter verification** (sample 10 agents across categories):
   - Read frontmatter of: developer, qa, architect, python-pro, security-architect, devops, code-reviewer, reflection-agent, master-orchestrator, evolution-orchestrator
   - Verify each has `ripgrep` in their `skills:` frontmatter array
3. **agent-skill-matrix.json cross-reference**:
   - Verify ripgrep appears in "always" array for ALL non-router agents
   - Flag any agent where ripgrep is in frontmatter but NOT in matrix (or vice versa)
4. **SKILL.md content validation**:
   - Verify `.claude/skills/ripgrep/SKILL.md` exists
   - Verify it references `pnpm search:code` as primary search method
   - Verify `tools:` field in SKILL.md frontmatter
   - Verify `verified: true` status

**Acceptance Criteria:**
- Report exists at declared path
- Per-agent pass/fail matrix for ripgrep assignment across 3 layers
- Discrepancy list with specific agents and layers

**Success Criteria Phase 2:** Both audit reports exist with concrete per-agent findings.

---

### Phase 3: Token-Saver & Reflection Audits (G3 — Parallel Wave)

**Purpose:** Deep audit of token-saver skill and reflection agent system
**Duration:** ~2 hours
**Dependencies:** None (independent of Phase 1-2)
**Parallel OK:** Yes (2 tasks, zero path overlap)

#### Task M5: Token-Saver Skill Audit

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/token-saver-audit-2026-03-05.md` covering:

1. **skill-index.json validation**:
   - Read `token-saver-context-compression` entry
   - Verify agentPrimary list covers all expected agents
   - Identify gaps vs agent-registry.json
2. **agent-skill-matrix.json cross-reference**:
   - Verify `token-saver-context-compression` in "always" array for ALL non-router agents
   - Flag missing agents
3. **SKILL.md content validation**:
   - Read `.claude/skills/token-saver-context-compression/SKILL.md`
   - Verify integration with `pnpm search:code`
   - Verify MemoryRecord persistence instructions
   - Verify `tools: []` field (token-saver has no required tools)
4. **Functional integration check**:
   - Verify CLAUDE.md Section 8.5 lists `token-saver-context-compression` as high-impact skill
   - Verify `universal-agent-spawn.md` does NOT preload token-saver in every spawn (should be on-demand)
   - Verify Router token saver routing rule: "Router does not run token-saver directly"
5. **Context window budget integration**:
   - Verify Section 8.2 thresholds (80K/120K/150K) are documented
   - Verify `compression-reminder.txt` mechanism is wired

**Acceptance Criteria:**
- Report exists at declared path
- Per-agent assignment matrix
- Functional integration findings

#### Task M6: Reflection Agent Deep Dive

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/reflection-agent-audit-2026-03-05.md` covering:

1. **reflection-agent.md analysis**:
   - Read full agent definition
   - Verify RECE loop phases (Reflect -> Evaluate -> Correct -> Execute)
   - Verify rubric dimensions and weights (Completeness 25%, Accuracy 25%, Clarity 15%, Consistency 15%, Actionability 20%)
   - Verify tools list includes: Bash, Edit, Glob, Grep, MemoryRecord, Read, Skill, TaskCreate, TaskGet, TaskList, TaskUpdate, Write
   - Verify model: sonnet, temperature: 0.4, maxTurns: 18
2. **Reflection hooks verification**:
   - Verify `reflection-step0-guard.cjs` exists in `.claude/hooks/reflection/`
   - Verify it blocks TaskList when pending reflections exist
   - Verify `reflection-cleanup.cjs` exists and handles atomic handshake
   - Verify `REFLECTION_STEP0_ENFORCEMENT` env var support (default: block)
3. **Spawn request processing**:
   - Verify `reflection-spawn-request.json` format and location
   - Verify `reflection-reminder.txt` trigger mechanism
   - Verify Router Step 0 processing order
4. **Atomic handshake protocol**:
   - Verify reflection-agent calls `TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })`
   - Verify cleanup hook reads `processedReflectionIds` from metadata
   - Verify cleanup removes processed requests from spawn request file
5. **Known issue validation**:
   - MEMORY.md states "NEVER spawn reflection-agent with `run_in_background: true`" — verify this is enforced or documented
   - Verify reflection-agent has NO "always" skills in agent-skill-matrix.json (potential gap)
   - Verify frontmatter vs matrix discrepancy for search skills

**Acceptance Criteria:**
- Report exists at declared path
- RECE loop verification pass/fail
- Hook chain verification pass/fail
- Atomic handshake verification pass/fail

**Success Criteria Phase 3:** Both audit reports exist with concrete findings.

---

### Phase 4: Evolution & Core Fundamentals Audits (G4 — Parallel Wave)

**Purpose:** Deep audit of evolution system and core routing/hook/spawn fundamentals
**Duration:** ~2 hours
**Dependencies:** None (independent)
**Parallel OK:** Yes (2 tasks, zero path overlap)

#### Task M7: Evolution System Deep Dive

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/evolution-system-audit-2026-03-05.md` covering:

1. **EVOLVE workflow verification**:
   - Read `.claude/workflows/core/evolution-workflow.md`
   - Verify 6-phase structure: E(Evaluate) -> V(Validate) -> O(Obtain/Research) -> L(Lock) -> V(Verify) -> E(Enable & Monitor)
   - Verify Phase O is marked MANDATORY and cannot be skipped
   - Verify minimum 3 Exa/WebSearch queries requirement
   - Verify minimum 3 external sources requirement
   - Verify research report output path: `.claude/context/artifacts/research-reports/`
2. **evolution-orchestrator.md analysis**:
   - Read `.claude/agents/orchestrators/evolution-orchestrator.md`
   - Verify model: opus (required for complex reasoning)
   - Verify it has `Task` tool for delegating to creator skills
   - Verify it invokes `research-synthesis` skill
   - Verify frontmatter skills list
3. **Enforcement hooks verification**:
   - Verify `research-enforcement.cjs` exists in `.claude/hooks/evolution/`
   - Verify `evolution-state-guard.cjs` exists and enforces state transitions
   - Verify `conflict-detector.cjs` prevents naming conflicts
   - Verify `artifact-scoring-ledger-hook.cjs` exists
4. **State tracking verification**:
   - Verify `.claude/context/evolution-state.json` format
   - Verify state tracks: current phase, research entries, evolution history
5. **Creator skill integration**:
   - Verify CLAUDE.md requires `research-synthesis` BEFORE any creator skill
   - Verify creator skills list: agent-creator, skill-creator, workflow-creator, hook-creator, template-creator, schema-creator
   - Verify companion-check.cjs step is documented
   - Verify post-creation-integration.cjs queues integration analysis

**Acceptance Criteria:**
- Report exists at declared path
- EVOLVE phase verification pass/fail
- Hook existence verification pass/fail
- Creator integration verification pass/fail

#### Task M8: Core Fundamentals Audit

**Target Agent:** `code-reviewer`
**Recommended Skills:** `code-analyzer`, `verification-before-completion`, `ripgrep`

**Description:**
Write audit report to `.claude/context/reports/backend/core-fundamentals-audit-2026-03-05.md` covering:

1. **Routing system**:
   - Verify `routing-guard.cjs` delegates to `routing-guard-core.cjs`
   - Verify 8 enforcement modes all default to `block`:
     - PLANNER_FIRST_ENFORCEMENT
     - SECURITY_REVIEW_ENFORCEMENT
     - CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT
     - HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT
     - ROUTER_BASH_GUARD
     - SPECIALIST_ROUTING_ENFORCEMENT
     - TASKLIST_FIRST_ENFORCEMENT
     - INTENT_AGENT_MATCH
   - Verify `routing-table.cjs` exists at `.claude/lib/routing/routing-table.cjs`
   - Verify `fuzzy-intent-matcher.cjs` exists at `.claude/lib/routing/fuzzy-intent-matcher.cjs`
   - Verify routing table source of truth is `routing-table-intent-keywords-data.cjs`
2. **Creator guards**:
   - Verify `unified-creator-guard.cjs` blocks direct writes to:
     - `.claude/skills/**/SKILL.md`
     - `.claude/agents/**/*.md`
     - `.claude/hooks/**/*.cjs`
     - `.claude/workflows/**/*.md`
     - `.claude/templates/**/*`
     - `.claude/schemas/**/*.json`
   - Verify `CREATOR_GUARD` env var support (block/warn/off)
3. **Hook system integrity**:
   - Verify all hooks registered in `.claude/settings.json` have corresponding files
   - Verify no dead hooks (registered but file deleted)
   - Verify hook categories follow fail-open/fail-closed policy:
     - Security hooks: fail-closed (exit 2)
     - Advisory hooks: fail-open (exit 0)
     - Post hooks: fail-open (exit 0)
4. **Spawn template completeness**:
   - Verify `universal-agent-spawn.md` includes:
     - TaskUpdate protocol (in_progress -> completed)
     - MemoryRecord MANDATORY section
     - Search-first protocol
     - Tool profiles (read-only, code-changes, verification)
     - Prompt budget rules (<1.5k chars)
   - Verify `orchestrator-spawn.md` exists with Task tool + opus model requirement
   - Verify `subordinate-once.md` exists
5. **TaskUpdate enforcement**:
   - Verify `pre-completion-validation.cjs` validates completion metadata
   - Verify required metadata fields: summary, filesModified, discoveries, memoriesRecorded
   - Verify CLAUDE.md Section 5.5-5.6 documents iron laws

**Acceptance Criteria:**
- Report exists at declared path
- Routing enforcement verification pass/fail per mode
- Creator guard path verification pass/fail
- Hook registration vs file existence pass/fail
- Spawn template completeness pass/fail

**Success Criteria Phase 4:** Both audit reports exist with concrete findings.

---

### Phase 5: Commit Checkpoint (G5)

**Purpose:** Commit Phase 1-4 changes before remediation to create a recovery point
**Duration:** ~15 minutes
**Dependencies:** M1-M8 complete

**Note:** This plan touches 10+ files (2 test files + 6 audit reports + potential remediation). Commit checkpoint is REQUIRED per plan template rules.

#### Task M9: Remediation of Critical Findings

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`, `debugging`

**Description:**
Based on findings from M1-M8 audit reports, fix CRITICAL and HIGH findings:

**Known issues to remediate (from context gathering):**
1. **agent-skill-matrix.json gaps**: Add `task-management-protocol` to "always" arrays for: `aso-specialist`, `brand-guardian`, `compliance-checker`, `feedback-synthesizer`, `marketing-strategist`, `ux-researcher`
2. **reflection-agent matrix gap**: Add "always" skills array to reflection-agent entry in agent-skill-matrix.json (matching its frontmatter)
3. **CLAUDE.md agent count**: Update "66 agents" reference to "72 agents" if confirmed stale
4. **Any additional CRITICAL findings** from audit reports M3-M8

**Constraints:**
- ONLY fix CRITICAL/HIGH findings
- Do NOT modify agent frontmatter files (owned by agent-creator skill)
- Do NOT modify hook files (owned by hook-creator skill)
- Focus on configuration files: agent-skill-matrix.json, CLAUDE.md references
- Run `pnpm lint:fix` and `pnpm format` after all changes
- Run `pnpm test:framework` to verify no regressions

**Acceptance Criteria:**
- `pnpm lint:fix` exits clean
- `pnpm format` produces no changes
- `pnpm test:framework` passes
- Known gaps (items 1-3 above) are fixed

**Success Criteria Phase 5:** All critical findings remediated, lint/format clean, tests pass.

---

### Phase 6: Git Commit (G6)

**Purpose:** Commit all audit artifacts and remediations
**Duration:** ~10 minutes
**Dependencies:** M9 complete

#### Task M10: Commit Audit Results

**Target Agent:** `devops`
**Recommended Skills:** `git-expert`, `commit-validator`, `verification-before-completion`

**Description:**
1. Stage ONLY these files (never `git add -A`):
   - `tests/audit/agent-search-compliance.test.cjs`
   - `tests/audit/agent-search-wiring.test.cjs`
   - `.claude/context/reports/backend/memory-system-audit-2026-03-05.md`
   - `.claude/context/reports/backend/ripgrep-skill-audit-2026-03-05.md`
   - `.claude/context/reports/backend/token-saver-audit-2026-03-05.md`
   - `.claude/context/reports/backend/reflection-agent-audit-2026-03-05.md`
   - `.claude/context/reports/backend/evolution-system-audit-2026-03-05.md`
   - `.claude/context/reports/backend/core-fundamentals-audit-2026-03-05.md`
   - `.claude/context/plans/epic-enterprise-audit-plan-2026-03-05.md`
   - Any remediation files from M9 (agent-skill-matrix.json, etc.)
2. Commit message:
   ```
   feat(audit): EPIC enterprise audit — 8-area framework compliance

   - Agent search tool compliance tests (72 agents)
   - Memory system, ripgrep, token-saver wiring audits
   - Reflection agent and evolution system deep dives
   - Core fundamentals audit (routing, hooks, spawn, TaskUpdate)
   - Remediation of critical agent-skill-matrix gaps

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
3. Verify commit landed: `git log --oneline -1`
4. Do NOT push (user will decide)

**Acceptance Criteria:**
- `git log --oneline -1` shows the audit commit
- No unintended files were staged
- Commit message follows conventional commit format

**Success Criteria Phase 6:** Commit exists with correct message and scoped files.

---

### Phase FINAL: Evolution & Reflection Check

**Purpose:** Quality assessment and learning extraction
**Duration:** ~30 minutes
**Dependencies:** M10 complete

#### Task M11: Session Reflection

**Target Agent:** `reflection-agent`
**Recommended Skills:** `insight-extraction`, `session-handoff`, `verification-before-completion`

**Description:**
1. Read all 6 audit reports from `.claude/context/reports/backend/`
2. Read test results from M1-M2
3. Read session gap log: `.claude/context/runtime/session-gap-log.jsonl`
4. Analyze:
   - Which audit areas had the most findings?
   - Were there patterns across audit areas (e.g., same agents repeatedly missing skills)?
   - Which remediation items remain for future sessions?
   - What process improvements would make future audits more efficient?
5. Extract learnings to `.claude/context/memory/learnings.md`
6. Generate reflection report to `.claude/context/reports/reflections/`

**Acceptance Criteria:**
- Reflection report exists
- Learnings extracted to memory
- Remaining remediation items documented

---

## Router Execution Instructions

### Wave Execution Order

```
Wave 1 (G1): M1 + M2 in parallel (qa + qa) — 2 agents
  ↓ (merge gate: both tests exist and run)
Wave 2 (G2): M3 + M4 in parallel (code-reviewer + code-reviewer) — 2 agents
  ↓ (merge gate: both reports exist)
Wave 3 (G3): M5 + M6 in parallel (code-reviewer + code-reviewer) — 2 agents
  ↓ (merge gate: both reports exist)
Wave 4 (G4): M7 + M8 in parallel (code-reviewer + code-reviewer) — 2 agents
  ↓ (merge gate: both reports exist)
Wave 5 (G5): M9 sequential (developer) — 1 agent
  ↓ (merge gate: lint/format clean, tests pass)
Wave 6 (G6): M10 sequential (devops) — 1 agent
  ↓ (merge gate: commit exists)
Wave 7 (G7): M11 sequential (reflection-agent) — 1 agent
```

### Spawn Model Assignments

| Task | Agent | Model | Rationale |
|------|-------|-------|-----------|
| M1 | qa | sonnet | Test creation, standard complexity |
| M2 | qa | sonnet | Test creation, standard complexity |
| M3 | code-reviewer | sonnet | Audit review, read-heavy |
| M4 | code-reviewer | sonnet | Audit review, read-heavy |
| M5 | code-reviewer | sonnet | Audit review, read-heavy |
| M6 | code-reviewer | sonnet | Audit review, read-heavy |
| M7 | code-reviewer | sonnet | Audit review, read-heavy |
| M8 | code-reviewer | sonnet | Audit review, read-heavy |
| M9 | developer | sonnet | Configuration fixes |
| M10 | devops | sonnet | Git operations |
| M11 | reflection-agent | sonnet | Per frontmatter model setting |

### Agent Report Contract (MANDATORY)

Every agent in this pipeline MUST:
1. Write report/artifact to the declared `owned_paths` file
2. Return to router ONLY: file path + 5-bullet summary (max 500 chars total)
3. Call `TaskUpdate({ status: 'completed', metadata: { summary, filesModified, discoveries, memoriesRecorded } })`
4. Call `MemoryRecord` for any discoveries worth preserving
5. Call `TaskList()` after completion

### Drain Gate Validation

Before claiming pipeline complete, Router MUST:
1. `TaskList()` — verify ZERO tasks in `in_progress` or `pending`
2. `git status -s` — verify clean working tree (after commit)
3. Verify all 6 audit reports exist at declared paths
4. Verify both test files exist at declared paths

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context overflow from parallel agents | HIGH | Max 2 agents per wave; reports to file only |
| Agent fails to call TaskUpdate | HIGH | Router manually updates after each wave |
| Devops agent fails to commit | MEDIUM | Router verifies `git log` after spawn; retry with nodejs-pro if needed |
| Agent modifies out-of-scope files | MEDIUM | `forbidden_paths` in DAG; `git diff --name-only` after each wave |
| Test files exceed 500-line ESLint limit | LOW | Keep tests focused; split if needed |
| Audit reports are placeholder stubs | MEDIUM | Router reads first 10 lines of each report to verify substance |

---

## Summary

- **11 microtasks** across **7 waves**
- **4 agent types**: qa, code-reviewer, developer, devops, reflection-agent
- **8 deliverables**: 2 test files + 6 audit reports
- **Known pre-findings**: 6 agents missing `task-management-protocol`, reflection-agent matrix gap, stale agent count in CLAUDE.md
- **Total estimated duration**: ~10-12 hours of agent time
