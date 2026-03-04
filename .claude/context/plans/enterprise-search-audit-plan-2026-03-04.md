<!-- Agent: planner | Task: #1 | Session: 2026-03-04 -->

# Plan: Enterprise Agent Search Tool Compliance Audit

## Overview

Comprehensive EPIC-tier audit of the agent-studio framework to verify all agents comply with the search-first protocol (CLAUDE.md Section 7). Identifies agents missing search skills in `agent-skill-matrix.json`, develops TDD tests for compliance validation, fixes gaps, validates with multi-LLM review, and finalizes with lint/format/commit.

## Complexity: EPIC

**Estimated Duration**: 8-12 hours across 5 phases
**Total Microtasks**: 18
**Files Modified Estimate**: 15-25 files

---

## Phase 0: Research & Planning (FOUNDATION) -- COMPLETE

**Status**: DONE (this plan)
**Research Findings**:
- `agent-skill-matrix.json` fully analyzed (1060 lines)
- `agent-registry.json` confirms 72 registered agents
- CLAUDE.md Section 7 defines search-first protocol
- ADR-2026-03-01-063 established orphaned skill wiring batch pattern

### Constitution Checkpoint -- PASSED

1. **Research Completeness**: agent-skill-matrix.json, agent-registry.json, CLAUDE.md Section 7, learnings.md, decisions.md all reviewed
2. **Technical Feasibility**: Changes are JSON config + agent frontmatter updates; no blocking dependencies
3. **Security Review**: No security implications (skill assignment is configuration, not code execution)
4. **Specification Quality**: Acceptance criteria are measurable (skill arrays in JSON, test pass/fail)

---

## Phase 1: Deep Investigation (RUNNING)

**Purpose**: Two architect agents (task-2, task-3) are already running this phase.
**Status**: IN PROGRESS
**Duration**: 1-2 hours

### Task 1.1 (task-2): Agent Search Tool Audit
- **Target Agent**: `architect`
- **Status**: Running
- **Scope**: Audit all 72 agents for search-first protocol compliance
- **Deliverable**: Report at `.claude/context/reports/backend/search-tool-audit-2026-03-04.md`

### Task 1.2 (task-3): Reflection/Evolution/Memory Audit
- **Target Agent**: `architect`
- **Status**: Running
- **Scope**: Audit reflection, evolution, and memory subsystems
- **Deliverable**: Report at `.claude/context/reports/backend/reflection-evolution-memory-audit-2026-03-04.md`

### Pre-Investigation Findings (from planner analysis)

**Agents with FULL search compliance** (7 skills in always array):
- developer, planner, architect, qa, technical-writer, pm, context-compressor
- python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, frontend-pro, nodejs-pro
- ios-pro, java-pro, nextjs-pro, php-pro, sveltekit-expert, tauri-desktop-developer
- expo-mobile-developer, data-engineer, graphql-pro, ai-ml-specialist, android-pro
- gamedev-pro, web3-blockchain-expert, api-designer, mcp-developer
- code-reviewer, security-architect, devops, devops-troubleshooter, incident-responder
- conductor-validator, reverse-engineer, database-architect, accessibility-tester
- chaos-engineer, penetration-tester, performance-engineer, sre-engineer
- advanced-debugging, code-simplifier

**Agents MISSING code-semantic-search + code-structural-search + memory-search** (14 agents):
1. `mobile-ux-reviewer` - has ripgrep + token-saver only
2. `scientific-research-expert` - has ripgrep + token-saver only
3. `multi-llm-consultant` - has ripgrep + token-saver only
4. `llm-architect` - has ripgrep + token-saver only
5. `microservices-architect` - has ripgrep + token-saver only
6. `prompt-engineer` - has ripgrep + token-saver only
7. `pm-coordinator` - has ripgrep + token-saver only (also missing verification-before-completion)
8. `kubernetes-specialist` - has ripgrep + token-saver only
9. `medical-research-triage` - has ripgrep + token-saver only (also missing verification-before-completion)
10. `c4-context` - has ripgrep + token-saver only
11. `c4-container` - has ripgrep + token-saver only
12. `c4-component` - has ripgrep + token-saver only
13. `c4-code` - has ripgrep + token-saver only
14. `researcher` - has ripgrep + token-saver only (also missing verification-before-completion)

**Orchestrators with minimal search** (5 agents, only ripgrep):
15. `master-orchestrator` - ripgrep only
16. `swarm-coordinator` - ripgrep only
17. `evolution-orchestrator` - ripgrep only
18. `party-orchestrator` - ripgrep only (also missing verification-before-completion)
19. `artifact-integrator` - ripgrep only

**Core agents with gaps**:
20. `technical-program-manager` - missing all search skills except none; only has verification-before-completion
21. `reflection-agent` - empty always array (may be intentional)
22. `router` - empty always array (intentional -- router uses Task() only)

**Summary**: 19 agents need search skill additions. Router and reflection-agent exemptions are intentional.

---

## Phase 2: Test Development (TDD)

**Purpose**: Write tests that validate agent search skill compliance
**Dependencies**: Phase 1 reports reviewed for any additional findings
**Duration**: 2-3 hours
**Parallel OK**: Yes (after Phase 1 reports available)

### Task 2.1: Write Agent Search Compliance Tests
- **Target Agent**: `qa`
- **Recommended Skills**: `tdd`, `verification-before-completion`
- **Owned Paths**: `tests/lib/config/agent-search-compliance.test.cjs`
- **Forbidden Paths**: `.claude/context/config/*`, `.claude/agents/**`
- **Depends On**: Phase 1 completion
- **Parallel Group**: G2

**Test Specification (TDD Red phase)**:

```javascript
// tests/lib/config/agent-search-compliance.test.cjs
const { describe, it } = require('node:test');
const assert = require('node:assert');

// Test 1: All non-exempt agents have ripgrep in always array
// Test 2: All code-focused agents have code-semantic-search in always array
// Test 3: All code-focused agents have code-structural-search in always array
// Test 4: All non-orchestrator agents have memory-search in always array
// Test 5: All agents have token-saver-context-compression in always array
// Test 6: All non-exempt agents have verification-before-completion in always array
// Test 7: Exempt agents (router, reflection-agent) correctly have empty always arrays
// Test 8: Orchestrators have at minimum ripgrep in always array
// Test 9: No agent has duplicate skills in always array
// Test 10: All agents in matrix exist in agent-registry.json
```

**Acceptance Checks**:
- Test file exists at `tests/lib/config/agent-search-compliance.test.cjs`
- Tests run with `node --test tests/lib/config/agent-search-compliance.test.cjs`
- All tests FAIL initially (Red phase -- skills not yet added)
- Tests cover all 72 registered agents

### Task 2.2: Write Agent Frontmatter Search Skill Tests
- **Target Agent**: `qa`
- **Recommended Skills**: `tdd`, `verification-before-completion`, `ripgrep`
- **Owned Paths**: `tests/agents/agent-frontmatter-search-skills.test.cjs`
- **Forbidden Paths**: `.claude/agents/**`, `.claude/context/config/*`
- **Depends On**: Phase 1 completion
- **Parallel Group**: G2

**Test Specification**:

```javascript
// tests/agents/agent-frontmatter-search-skills.test.cjs
// Test 1: All agent .md files with skills: frontmatter include ripgrep
// Test 2: Code-focused agents include code-semantic-search in frontmatter
// Test 3: Code-focused agents include code-structural-search in frontmatter
// Test 4: Frontmatter skills are consistent with agent-skill-matrix.json always array
// Test 5: No agent frontmatter references non-existent skills
```

**Acceptance Checks**:
- Test file exists
- Tests run and initially fail for agents missing skills
- Tests cover all agent .md files in .claude/agents/

---

## Phase 3: Fixes -- Agent Skill Matrix + Frontmatter Updates

**Purpose**: Add missing search skills to agents identified in Phase 1
**Dependencies**: Phase 2 tests written (Green phase)
**Duration**: 2-3 hours

### COMMIT CHECKPOINT (Phase 2 complete)
Before starting Phase 3, commit all Phase 2 test files:
```bash
git add tests/lib/config/agent-search-compliance.test.cjs tests/agents/agent-frontmatter-search-skills.test.cjs
git commit -m "test: add agent search skill compliance tests (TDD Red phase)"
```

### Task 3.1: Fix agent-skill-matrix.json -- Domain Agents
- **Target Agent**: `developer`
- **Recommended Skills**: `tdd`, `verification-before-completion`
- **Owned Paths**: `.claude/context/config/agent-skill-matrix.json` (domain section only)
- **Forbidden Paths**: `.claude/agents/**`, `tests/**`
- **Depends On**: Task 2.1
- **Parallel Group**: G3a
- **Dependency Type**: blocks

**Changes Required** (add to `always` array for each):

| Agent | Add Skills |
|-------|-----------|
| `mobile-ux-reviewer` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `scientific-research-expert` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `multi-llm-consultant` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `llm-architect` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `microservices-architect` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `prompt-engineer` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `pm-coordinator` | `verification-before-completion`, `memory-search`, `code-semantic-search`, `code-structural-search` |
| `kubernetes-specialist` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `medical-research-triage` | `verification-before-completion`, `memory-search`, `code-semantic-search`, `code-structural-search` |

**Acceptance Checks**:
- `node --test tests/lib/config/agent-search-compliance.test.cjs` -- domain agent tests pass
- JSON is valid (no syntax errors)

### Task 3.2: Fix agent-skill-matrix.json -- Specialized + C4 Agents
- **Target Agent**: `developer`
- **Recommended Skills**: `tdd`, `verification-before-completion`
- **Owned Paths**: `.claude/context/config/agent-skill-matrix.json` (specialized section only)
- **Forbidden Paths**: `.claude/agents/**`, `tests/**`
- **Depends On**: Task 2.1
- **Parallel Group**: G3a (SEQUENTIAL with 3.1 -- same file)
- **Dependency Type**: blocks

**Changes Required**:

| Agent | Add Skills |
|-------|-----------|
| `c4-context` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `c4-container` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `c4-component` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `c4-code` | `memory-search`, `code-semantic-search`, `code-structural-search` |
| `researcher` | `verification-before-completion`, `memory-search`, `code-semantic-search`, `code-structural-search` |

**Acceptance Checks**:
- All specialized agent tests pass
- JSON valid

### Task 3.3: Fix agent-skill-matrix.json -- Core + Orchestrators
- **Target Agent**: `developer`
- **Recommended Skills**: `tdd`, `verification-before-completion`
- **Owned Paths**: `.claude/context/config/agent-skill-matrix.json` (core + orchestrators sections)
- **Forbidden Paths**: `.claude/agents/**`, `tests/**`
- **Depends On**: Task 3.2 (same file, sequential)
- **Parallel Group**: G3a (SEQUENTIAL)
- **Dependency Type**: blocks

**Changes Required**:

| Agent | Add Skills |
|-------|-----------|
| `technical-program-manager` | `memory-search`, `ripgrep`, `code-semantic-search`, `code-structural-search`, `token-saver-context-compression` |
| `master-orchestrator` | `token-saver-context-compression` |
| `swarm-coordinator` | `token-saver-context-compression` |
| `evolution-orchestrator` | `token-saver-context-compression` |
| `party-orchestrator` | `verification-before-completion`, `token-saver-context-compression` |
| `artifact-integrator` | `token-saver-context-compression` |

**Note**: Orchestrators intentionally use minimal search (they delegate to specialists). Adding full semantic/structural search is NOT recommended -- they only need ripgrep for quick scanning. But token-saver is universally useful.

**Acceptance Checks**:
- All core + orchestrator tests pass
- JSON valid
- `node --test tests/lib/config/agent-search-compliance.test.cjs` -- ALL tests pass (Green phase)

### Task 3.4: Update Agent Frontmatter Files
- **Target Agent**: `developer`
- **Recommended Skills**: `tdd`, `verification-before-completion`, `ripgrep`
- **Owned Paths**: `.claude/agents/domain/*.md`, `.claude/agents/specialized/*.md`, `.claude/agents/core/technical-program-manager.md`
- **Forbidden Paths**: `.claude/context/config/*`, `tests/**`
- **Depends On**: Task 3.3
- **Parallel Group**: G3b
- **Dependency Type**: blocks

**Files to Update** (add missing skills to frontmatter `skills:` list):
1. `.claude/agents/domain/mobile-ux-reviewer.md`
2. `.claude/agents/domain/scientific-research-expert.md`
3. `.claude/agents/domain/multi-llm-consultant.md`
4. `.claude/agents/domain/llm-architect.md`
5. `.claude/agents/domain/microservices-architect.md`
6. `.claude/agents/domain/prompt-engineer.md`
7. `.claude/agents/domain/pm-coordinator.md`
8. `.claude/agents/domain/kubernetes-specialist.md`
9. `.claude/agents/domain/medical-research-triage.md`
10. `.claude/agents/specialized/c4-context.md`
11. `.claude/agents/specialized/c4-container.md`
12. `.claude/agents/specialized/c4-component.md`
13. `.claude/agents/specialized/c4-code.md`
14. `.claude/agents/specialized/researcher.md` (or `.claude/agents/core/researcher.md`)
15. `.claude/agents/core/technical-program-manager.md`

**Acceptance Checks**:
- `node --test tests/agents/agent-frontmatter-search-skills.test.cjs` -- ALL tests pass
- All agent .md files have valid YAML frontmatter

### Task 3.5: Regenerate Agent Registry
- **Target Agent**: `developer`
- **Recommended Skills**: `verification-before-completion`
- **Owned Paths**: `.claude/context/agent-registry.json`
- **Forbidden Paths**: `.claude/agents/**`, `tests/**`
- **Depends On**: Task 3.4
- **Parallel Group**: G3c
- **Dependency Type**: blocks

**Commands**:
```bash
pnpm agents:registry
```

**Acceptance Checks**:
- `agent-registry.json` regenerated successfully
- Registry reflects new skill assignments for all 19 fixed agents
- `pnpm validate` passes

---

## Phase 4: Multi-LLM Review

**Purpose**: Validate changes with external LLM review using Gemini/Codex CLIs
**Dependencies**: Phase 3 complete, all tests passing
**Duration**: 1-2 hours

### COMMIT CHECKPOINT (Phase 3 complete)
```bash
git add .claude/context/config/agent-skill-matrix.json .claude/agents/ .claude/context/agent-registry.json
git commit -m "fix(agents): add missing search skills to 19 agents for search-first compliance"
```

### Task 4.1: Gemini Review of Changes
- **Target Agent**: `multi-llm-consultant`
- **Recommended Skills**: `verification-before-completion`
- **Owned Paths**: `.claude/context/reports/backend/gemini-search-audit-review-2026-03-04.md`
- **Forbidden Paths**: `.claude/context/config/*`, `.claude/agents/**`, `tests/**`
- **Depends On**: Phase 3 commit checkpoint
- **Parallel Group**: G4

**Review Scope**:
- Validate agent-skill-matrix.json changes are consistent
- Check for any agents still missing search skills
- Verify no over-assignment (orchestrators should NOT have full semantic search)
- Confirm test coverage is adequate

**Acceptance Checks**:
- Review report exists
- No critical findings blocking merge

### Task 4.2: Cross-Validation with pnpm validate
- **Target Agent**: `qa`
- **Recommended Skills**: `verification-before-completion`, `qa-workflow`
- **Owned Paths**: `.claude/context/reports/backend/qa-search-audit-validation-2026-03-04.md`
- **Forbidden Paths**: `.claude/context/config/*`, `.claude/agents/**`
- **Depends On**: Phase 3 commit checkpoint
- **Parallel Group**: G4

**Commands**:
```bash
pnpm validate
pnpm test
pnpm lint:fix
pnpm format
```

**Acceptance Checks**:
- `pnpm validate` passes
- `pnpm test` passes (all tests including new compliance tests)
- `pnpm lint:fix` produces no changes
- `pnpm format` produces no changes

---

## Phase 5: Finalization

**Purpose**: Final commit, cleanup, memory updates
**Dependencies**: Phase 4 complete, all validations passing
**Duration**: 30 min

### Task 5.1: Final Lint/Format/Test and Commit
- **Target Agent**: `devops`
- **Recommended Skills**: `git-expert`, `verification-before-completion`
- **Owned Paths**: (git operations only)
- **Forbidden Paths**: `src/**`
- **Depends On**: Phase 4 completion
- **Parallel Group**: G5

**Commands**:
```bash
pnpm lint:fix
pnpm format
pnpm test
git add -A  # Only if all above pass
git commit -m "chore(agents): enterprise search audit -- add compliance tests, fix 19 agent skill gaps"
```

**Acceptance Checks**:
- Clean lint, format, test results
- Commit created successfully
- `git log --oneline -1` shows the commit

### Task 5.2: Memory Updates
- **Target Agent**: `developer`
- **Recommended Skills**: `verification-before-completion`, `memory-search`
- **Owned Paths**: `.claude/context/memory/learnings.md`, `.claude/context/memory/decisions.md`
- **Forbidden Paths**: `.claude/context/config/*`, `.claude/agents/**`, `tests/**`
- **Depends On**: Task 5.1
- **Parallel Group**: G5b

**Updates**:
- Append ADR to `decisions.md`: ADR documenting search-first compliance audit, agents fixed, rationale for orchestrator exemptions
- Append to `learnings.md`: Pattern for batch skill wiring audits, test-driven compliance validation

---

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 5 complete

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Routing Command (Router-owned)**:
Ask Router to spawn:
- `subagent_type: "reflection-agent"`
- `description: "Session reflection and learning extraction for enterprise search audit"`
- Prompt requiring learnings extraction and evolution recommendations

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Execution Topology

### Microtask DAG

| task_id | target_agent          | owned_paths                                          | forbidden_paths                    | depends_on   | dependency_type | parallel_group | acceptance_checks                              |
| ------- | --------------------- | ---------------------------------------------------- | ---------------------------------- | ------------ | --------------- | -------------- | ---------------------------------------------- |
| M1      | planner               | `.claude/context/plans/*`                            | `src/**`                           | -            | -               | G0             | Plan file exists                               |
| M2      | architect (task-2)    | `.claude/context/reports/backend/*`                  | `.claude/context/config/*`         | M1           | blocks          | G1             | Audit report exists                            |
| M3      | architect (task-3)    | `.claude/context/reports/backend/*`                  | `.claude/context/config/*`         | M1           | blocks          | G1             | Audit report exists                            |
| M4      | qa                    | `tests/lib/config/*`                                 | `.claude/agents/**`                | M2,M3        | blocks          | G2             | Tests exist, run, fail (Red)                   |
| M5      | qa                    | `tests/agents/*`                                     | `.claude/agents/**`                | M2,M3        | blocks          | G2             | Tests exist, run, fail (Red)                   |
| M6      | developer             | `.claude/context/config/agent-skill-matrix.json`     | `.claude/agents/**`, `tests/**`    | M4           | blocks          | G3a-seq        | Domain agent tests pass                        |
| M7      | developer             | `.claude/context/config/agent-skill-matrix.json`     | `.claude/agents/**`, `tests/**`    | M6           | blocks          | G3a-seq        | Specialized agent tests pass                   |
| M8      | developer             | `.claude/context/config/agent-skill-matrix.json`     | `.claude/agents/**`, `tests/**`    | M7           | blocks          | G3a-seq        | Core+orchestrator tests pass                   |
| M9      | developer             | `.claude/agents/domain/*`, `.claude/agents/specialized/*`, `.claude/agents/core/technical-program-manager.md` | `.claude/context/config/*`, `tests/**` | M8 | blocks | G3b | Frontmatter tests pass |
| M10     | developer             | `.claude/context/agent-registry.json`                | `.claude/agents/**`, `tests/**`    | M9           | blocks          | G3c            | Registry regenerated, validate passes          |
| M11     | multi-llm-consultant  | `.claude/context/reports/backend/*`                  | `.claude/context/config/*`         | M10          | related         | G4             | Review report exists                           |
| M12     | qa                    | `.claude/context/reports/backend/*`                  | `.claude/context/config/*`         | M10          | related         | G4             | All validation commands pass                   |
| M13     | devops                | (git only)                                           | `src/**`                           | M11,M12      | blocks          | G5             | Commit created                                 |
| M14     | developer             | `.claude/context/memory/*`                           | `.claude/context/config/*`         | M13          | related         | G5b            | ADR + learnings appended                       |
| M15     | reflection-agent      | `.claude/context/reports/reflections/*`              | `.claude/context/config/*`         | M14          | related         | G6             | Reflection report exists                       |

### Parallelization Guardrails

- Max active parallel microtasks: 2 (context overflow prevention per MEMORY.md)
- M2 + M3 can run in parallel (G1) -- different report files
- M4 + M5 can run in parallel (G2) -- different test directories
- M6, M7, M8 MUST be sequential (G3a-seq) -- same JSON file
- M11 + M12 can run in parallel (G4) -- different outputs
- Cross-group tasks run by DAG topological order
- Merge gate runs after each parallel group before next group starts

### Critical Path

M1 -> M2/M3 (parallel) -> M4/M5 (parallel) -> M6 -> M7 -> M8 -> M9 -> M10 -> M11/M12 (parallel) -> M13 -> M14 -> M15

**Estimated total duration**: 8-12 hours
**Estimated files modified**: 22 (1 JSON config + 15 agent .md files + 2 test files + 1 registry + 2 memory files + 1 plan)
