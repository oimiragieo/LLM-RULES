<!-- Agent: architect | Task: planner-pm-synthesis | Session: 2026-02-15 -->

# Planner-PM Enterprise Improvement Proposal

**Date:** 2026-02-15
**Scope:** Cross-cutting gap analysis of PM, Planner, and TPM agent contracts with concrete enforcement proposals.

---

## 1. Cross-Cutting Gap Analysis

### 1.1 Handoff Gaps (PM -> Planner -> Developer -> QA)

| Handoff | Documented Contract | Runtime Enforcement | Gap |
|---------|--------------------|--------------------|-----|
| PM -> Planner | PM-to-Planner Collaboration Contract in `pm.md` and `planner.md` | **None** -- no hook validates PRD exists before planner starts | G1: Unenforceable contract |
| Planner -> Developer | Microtask DAG with `owned_paths`, `target_agent` | **None** -- no schema validates DAG completeness | G2: Plans can omit DAG metadata |
| Developer -> QA | Enterprise workflow Gate 2 (tests pass) | `quality-gates.cjs` checks file existence only | G3: No verification that tests actually cover plan acceptance criteria |
| QA -> Deploy | Gate 4 (CI passes) | Checks artifact existence | G4: No link back to PRD success metrics |
| Any -> Reflection | Phase 6 (learnings recorded) | Gate 6 checks file existence | G5: Reflection has no access to PRD success metrics to evaluate |

### 1.2 Validation Gaps

| What | Current State | Gap |
|------|--------------|-----|
| Plan structure | `plan.schema.json` exists but requires only `title` + `objectives` | G6: No required `tasks[].target_agent`, no `acceptance_checks`, no `verification_command` |
| PRD structure | `skill-prd-generator-output.schema.json` exists | G7: No schema validates PRD-to-Plan linkage fields (plan_link, phase_status) |
| Task completion metadata | `pre-completion-validation.cjs` validates creator artifacts | G8: No validation that `summary` and `filesModified` metadata are present on non-creator tasks |
| Constitution checkpoint | Documented in planner.md (4 gates) | G9: Entirely prose-based -- no hook or script enforces checkpoint passage |
| PM backlog for large pipelines | Documented in learnings.md as mandatory for >5 waves | G10: No enforcement mechanism; remains a suggestion |

### 1.3 Enforcement Gaps

| Rule | Where Documented | Enforcement Hook | Gap |
|------|-----------------|-----------------|-----|
| Planner-first for HIGH/EPIC | CLAUDE.md Section 1.2 Gate 1 | `routing-guard.cjs` Check 1 | Enforced (no gap) |
| PM required for HIGH/EPIC product work | `enterprise-workflow.md` complexity rubric | **None** | G11: Router can skip PM for HIGH product features |
| TPM required for cross-team EPIC | `enterprise-workflow.md` | **None** | G12: No routing keyword or hook triggers TPM spawn |
| Plan must include Phase 0 research | `planner.md` Phase 0 section | **None** | G13: Plan can be written without research phase |
| Plan must end with reflection phase | `planner.md` Mandatory Final Phase | **None** | G14: No post-write validation of plan structure |
| Task must specify `target_agent` | `planner.md` Task Agent Assignment | **None** | G15: Tasks can be created without agent recommendation |

### 1.4 Duplication and Overlap

| Area | PM Owns | Planner Owns | Overlap |
|------|---------|-------------|---------|
| Complexity assessment | Invokes `complexity-assessment` skill | Invokes `complexity-assessment` skill | Both assess complexity independently -- no shared result |
| Research synthesis | Invokes `research-synthesis` | Invokes `research-synthesis` in Phase 0 | PM researches for PRD, planner re-researches for plan |
| Plan generation | Invokes `plan-generator` skill | Invokes `plan-generator` skill | PM should not generate plans; planner should not generate PRDs |
| Task creation | Uses `TaskCreate` for stories | Uses `TaskCreate` for microtasks | Same tool, different granularity -- no schema distinguishes them |

### 1.5 Missing Feedback Loops

| Loop | Expected | Actual |
|------|----------|--------|
| QA results -> PM success metrics | QA validates tests pass -> PM checks product metrics achieved | **Missing**: QA never references PRD success metrics |
| Developer completion -> Planner plan update | Developer marks microtask done -> plan status updates | **Missing**: No mechanism to update plan document when tasks complete |
| Reflection learnings -> PM/Planner improvement | Reflection extracts patterns -> PM/Planner adjust approach | **Missing**: Reflection agent has no structured output that PM/Planner read on next run |
| Code review findings -> Planner risk adjustment | Reviewer finds issues -> plan risk section updates | **Missing**: One-shot review with no backflow |

---

## 2. Enterprise Improvement Proposals

### P0-1: PM-Gated Plan Start (Handoff Enforcement)

**Problem:** Planner can start without a PRD for HIGH/EPIC work, producing plans disconnected from product intent.

**Impact:** Plans miss acceptance criteria, scope drifts, PM rework required after implementation starts.

**Proposed Solution:**
- Extend `routing-guard.cjs` Check 1 (planner-first) with a sub-check: when complexity >= HIGH and intent matches `feature|product|roadmap`, require PM agent to have been spawned in the current workflow before planner spawns.
- Add environment variable `PM_BEFORE_PLANNER_ENFORCEMENT=warn|block|off` (default: warn).
- File: `.claude/hooks/routing/routing-guard.cjs` (extend existing Check 1 logic).

**Concrete Check:** `PM_BEFORE_PLANNER_ENFORCEMENT=block node -e "require('.claude/hooks/routing/routing-guard-core.checks-router.cjs')"` -- unit test that blocks planner spawn when PM not spawned for HIGH feature.

**Priority:** P0 | **Effort:** S | **Dependencies:** None

---

### P0-2: Plan Structure Validation Hook

**Problem:** Plans lack required fields (`target_agent`, `acceptance_checks`, `verification_command`) because `plan.schema.json` only requires `title` + `objectives`.

**Impact:** Router cannot auto-route tasks to correct agents; QA cannot verify acceptance criteria; developers lack verification commands.

**Proposed Solution:**
- Update `plan.schema.json` to require per-task: `target_agent` (enum of known agents), `acceptance_checks` (array, minItems: 1), `verification_command` (string).
- Add a `plan-structure-validator.cjs` post-write hook that validates any file written to `.claude/context/plans/` against the updated schema.
- File: `.claude/schemas/plan.schema.json` (update), `.claude/hooks/validation/plan-structure-validator.cjs` (new or extend `unified-pre-write-hook.cjs`).

**Concrete Check:** `node -e "const Ajv = require('ajv'); const s = require('.claude/schemas/plan.schema.json'); const v = new Ajv().compile(s); console.log(v({title:'x',objectives:['y'],tasks:[{id:'1',title:'t'}]}));"` -- must return `false` (missing target_agent).

**Priority:** P0 | **Effort:** M | **Dependencies:** None

---

### P0-3: Task Completion Metadata Enforcement

**Problem:** `pre-completion-validation.cjs` only validates creator-type task completions. Non-creator tasks can complete with `status: "completed"` and no `summary` or `filesModified` metadata.

**Impact:** Task state becomes opaque; handoff context is lost; reflection agent gets empty completion records.

**Proposed Solution:**
- Extend `pre-completion-validation.cjs` to require `metadata.summary` (string, minLength: 10) on ALL `status: "completed"` transitions, not just creator tasks.
- Add `COMPLETION_METADATA_ENFORCEMENT=warn|block|off` (default: warn, escalate to block after 1 sprint).
- File: `.claude/hooks/validation/pre-completion-validation.cjs` (modify).

**Concrete Check:** Unit test in `tests/hooks/pre-completion-validation.test.cjs` -- `TaskUpdate({ status: 'completed' })` without metadata.summary must emit warning/block.

**Priority:** P0 | **Effort:** S | **Dependencies:** None

---

### P1-1: PRD-to-Plan Linkage Schema

**Problem:** PRD and Plan are disconnected documents. No structured field links a plan back to its PRD, and no mechanism verifies the plan covers all PRD acceptance criteria.

**Impact:** Plans can miss PRD requirements silently. No traceability from PRD -> Plan -> Task -> Test.

**Proposed Solution:**
- Add `prd_link` (URI to PRD file) and `prd_acceptance_mapping` (object mapping PRD criterion ID to plan task ID) to `plan.schema.json`.
- Add `plan_link` field to PRD template at `.claude/templates/prd-template.md`.
- Create a `prd-plan-coverage-check.cjs` CLI tool that cross-references PRD acceptance criteria against plan tasks.
- File: `.claude/schemas/plan.schema.json` (update), `.claude/templates/prd-template.md` (update), `.claude/tools/cli/prd-plan-coverage-check.cjs` (new).

**Concrete Check:** `node .claude/tools/cli/prd-plan-coverage-check.cjs --prd specs/foo-prd.md --plan plans/foo-plan.md` -- exits 0 if all PRD criteria mapped, exits 1 with list of unmapped criteria.

**Priority:** P1 | **Effort:** M | **Dependencies:** P0-2

---

### P1-2: Constitution Checkpoint Enforcement

**Problem:** Planner's 4-gate constitution checkpoint (research completeness, technical feasibility, security review, specification quality) is entirely prose. No code validates gate passage.

**Impact:** Plans proceed to implementation with unresolved unknowns, missing security review, or vague acceptance criteria.

**Proposed Solution:**
- Create `constitution-checkpoint.cjs` library in `.claude/lib/workflow/` that evaluates 4 gates from plan metadata:
  - Gate 1: Research report file exists and contains >= 3 source citations.
  - Gate 2: Plan has no `[NEEDS CLARIFICATION]` markers.
  - Gate 3: If complexity >= HIGH, security review artifact exists.
  - Gate 4: All tasks have `acceptance_checks` with at least one entry.
- Wire into `quality-gates.cjs` as a sub-gate of Gate 1 (Design -> Implement).
- File: `.claude/lib/workflow/constitution-checkpoint.cjs` (new), `.claude/lib/workflow/quality-gates.cjs` (extend `evaluateGate1`).

**Concrete Check:** `node -e "const cc = require('.claude/lib/workflow/constitution-checkpoint.cjs'); console.log(cc.evaluate({ researchReport: null }));"` -- must return `{ passed: false, blocking: ['Research report missing'] }`.

**Priority:** P1 | **Effort:** M | **Dependencies:** P0-2

---

### P1-3: TPM Auto-Spawn for Cross-Team EPIC

**Problem:** TPM agent exists but has no routing trigger. Cross-team EPIC work can proceed without dependency tracking or RAID management.

**Impact:** Cross-team dependencies are unmanaged; blocked tasks discovered late; no phase-gate governance.

**Proposed Solution:**
- Add `technical-program-manager` to `routing-guard.cjs` as a required co-spawn when complexity == EPIC and task count > 10.
- Add routing keywords `cross-team|program|milestone|dependency-tracking|raid` to `routing-table.cjs` for TPM.
- Add `TPM_EPIC_ENFORCEMENT=warn|block|off` (default: warn).
- File: `.claude/hooks/routing/routing-guard.cjs` (extend), `.claude/lib/routing/routing-table.cjs` (extend).

**Concrete Check:** `SPECIALIST_ROUTING_ENFORCEMENT=block node tests/hooks/routing-guard.test.cjs` -- test case spawning EPIC without TPM must be blocked.

**Priority:** P1 | **Effort:** S | **Dependencies:** None

---

### P1-4: PM Backlog Requirement for Large Pipelines

**Problem:** Pipelines > 5 waves lack explicit in-scope/out-of-scope/deferred sections, causing scope creep (documented in learnings.md).

**Impact:** User expectations misaligned with deliverables; config consolidation mentioned but never delivered (2026-02-13 incident).

**Proposed Solution:**
- Create PM backlog template at `.claude/templates/pm/pm-backlog-template.md` with required sections: in-scope, out-of-scope, deferred, success-metrics.
- Add complexity check to `routing-guard.cjs`: when estimated task count > 15 (proxy for >5 waves), require PM spawn with backlog creation directive.
- File: `.claude/templates/pm/pm-backlog-template.md` (new), `.claude/hooks/routing/routing-guard.cjs` (extend).

**Concrete Check:** Verify template exists: `test -f .claude/templates/pm/pm-backlog-template.md && echo PASS`.

**Priority:** P1 | **Effort:** S | **Dependencies:** None

---

### P1-5: Microtask DAG Schema Enforcement

**Problem:** Planner's microtask DAG protocol is MANDATORY for MEDIUM+ but has no schema validation. Plans can omit `owned_paths`, `forbidden_paths`, `depends_on`, and `parallel_group`.

**Impact:** Router cannot parallelize safely; file conflicts between concurrent agents; no dependency ordering.

**Proposed Solution:**
- Create `microtask-dag.schema.json` with required fields: `task_id`, `target_agent`, `owned_paths` (array, minItems: 1), `depends_on` (array), `parallel_group` (string), `acceptance_checks` (array, minItems: 1).
- Add overlap-detection validation: no two tasks in the same `parallel_group` may share `owned_paths`.
- Wire into plan-structure-validator (P0-2) as a sub-check for MEDIUM+ complexity plans.
- File: `.claude/schemas/microtask-dag.schema.json` (new), extend P0-2 validator.

**Concrete Check:** `node -e "const v = require('.claude/tools/cli/validate-dag.cjs'); console.log(v.validate([{task_id:'M1',target_agent:'developer',owned_paths:['src/a.ts'],parallel_group:'G1'},{task_id:'M2',target_agent:'qa',owned_paths:['src/a.ts'],parallel_group:'G1'}]));"` -- must return conflict error.

**Priority:** P1 | **Effort:** M | **Dependencies:** P0-2

---

### P2-1: QA-to-PRD Success Metric Linkage

**Problem:** QA validates tests pass but never checks whether PRD success metrics are achieved. Product validation is disconnected from technical validation.

**Impact:** Features ship that pass tests but miss the product goal (e.g., response time target, user flow completion rate).

**Proposed Solution:**
- Add optional `prd_success_metrics` field to QA completion metadata schema.
- QA agent prompt update: if PRD exists for current workflow, read success metrics and include metric assessment in completion report.
- File: `.claude/agents/core/qa.md` (extend verification protocol), `.claude/hooks/validation/pre-completion-validation.cjs` (add warning if HIGH+ workflow has PRD but QA completion lacks metric assessment).

**Concrete Check:** QA agent completion metadata for HIGH workflow with PRD must include `metadata.prdMetricsAssessed: true`.

**Priority:** P2 | **Effort:** S | **Dependencies:** P1-1

---

### P2-2: Plan Status Auto-Update on Task Completion

**Problem:** When a developer completes a microtask, the plan document is not updated. Plan becomes stale immediately.

**Impact:** Stale plans cause Router to re-assign completed work; reflection agent reads outdated plan state.

**Proposed Solution:**
- Extend `post-completion-chain.cjs` to update plan document when task completion metadata includes `planFile` and `taskId` fields.
- Update plan task status from `pending` to `completed` in the markdown.
- File: `.claude/hooks/workflow/post-completion-chain.cjs` (extend).

**Concrete Check:** After TaskUpdate completed with `metadata: { planFile: '...', planTaskId: 'M1' }`, verify plan file has `M1` status changed to `completed`.

**Priority:** P2 | **Effort:** M | **Dependencies:** P0-2, P1-5

---

### P2-3: Reflection-to-PM/Planner Feedback Loop

**Problem:** Reflection agent extracts learnings to `learnings.md` but PM and Planner do not systematically read these before their next run.

**Impact:** Same mistakes repeat across pipelines; no structured learning transfer.

**Proposed Solution:**
- Add a `recent_learnings` injection to spawn-prompt-assembler for PM and Planner agents: extract last 5 learnings from `learnings.md` and inject into spawn prompt.
- Add a `pipeline_retrospective` field to reflection agent output schema that specifically calls out PM and Planner improvement recommendations.
- File: `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs` (extend), `.claude/agents/core/reflection-agent.md` (extend output protocol).

**Concrete Check:** Spawn prompt for planner includes `## Recent Learnings` section with >= 1 entry from `learnings.md`.

**Priority:** P2 | **Effort:** S | **Dependencies:** None

---

### P2-4: Skill Overlap Resolution (PM vs Planner)

**Problem:** PM and Planner both have `plan-generator`, `complexity-assessment`, `spec-gathering` assigned. PM should not generate implementation plans; Planner should not write PRDs.

**Impact:** Confused agent behavior; PM generating implementation tasks; Planner creating PRD-like documents.

**Proposed Solution:**
- Remove `plan-generator` from PM skill assignments (PM produces PRDs, not plans).
- Remove `spec-gathering` from Planner skill assignments (Planner consumes specs, not gathers them).
- Add `prd-generator` to PM's automatic skills.
- Document clear boundary: PM owns product intent (PRD, epics, stories); Planner owns execution intent (plans, microtasks, DAGs).
- File: `.claude/agents/core/pm.md` (update skills), `.claude/agents/core/planner.md` (update skills).

**Concrete Check:** `grep -c 'plan-generator' .claude/agents/core/pm.md` returns 0. `grep -c 'spec-gathering' .claude/agents/core/planner.md` returns 0.

**Priority:** P2 | **Effort:** S | **Dependencies:** None

---

## 3. Concrete Checks Catalog

| # | Check Name | Type | Command/Verification | Enforces |
|---|-----------|------|---------------------|----------|
| 1 | pm-before-planner | hook | `PM_BEFORE_PLANNER_ENFORCEMENT=block` in routing-guard test | PM spawned before planner for HIGH features |
| 2 | plan-structure-valid | hook+schema | `ajv validate -s plan.schema.json -d plan.json` must fail without target_agent | Plans have agent assignments + acceptance checks |
| 3 | completion-metadata-present | hook | `tests/hooks/pre-completion-validation.test.cjs` -- TaskUpdate(completed) without summary blocks | All completions carry summary metadata |
| 4 | prd-plan-coverage | ci | `node .claude/tools/cli/prd-plan-coverage-check.cjs --prd X --plan Y` exits 0 | Plan covers all PRD criteria |
| 5 | constitution-checkpoint | gate | `node -e "require('.claude/lib/workflow/constitution-checkpoint.cjs').evaluate(...)"` returns passed:true | Research + security + feasibility + quality pass before implementation |
| 6 | tpm-epic-spawn | hook | `routing-guard.test.cjs` test case -- EPIC without TPM blocked | TPM present for cross-team EPIC |
| 7 | pm-backlog-exists | gate | `test -f .claude/templates/pm/pm-backlog-template.md` | Template exists for large pipeline backlogs |
| 8 | dag-no-path-overlap | schema+ci | `node .claude/tools/cli/validate-dag.cjs plan.json` exits 0 | No parallel task file conflicts |
| 9 | qa-prd-metrics | hook | QA completion for HIGH+ with PRD includes `prdMetricsAssessed` | QA validates product metrics |
| 10 | plan-status-sync | test | After task completion, plan file reflects updated status | Plan document stays current |
| 11 | reflection-feedback-inject | test | Planner spawn prompt contains `## Recent Learnings` | Learnings flow back to planning |
| 12 | skill-overlap-resolved | ci | PM agent file has no `plan-generator`; Planner has no `spec-gathering` | Clear PM/Planner boundary |

---

## 4. Workflow Integration Map

```
Triage -> Design -> Implement -> Review -> Deploy -> Document -> Reflect
  PM       Planner   Developer   Review    DevOps   TechWriter  Reflection
  +TPM     +Arch     +QA(gate)   +SecArch

  [G11]    [G6,G9]   [G3,G8]    [--]      [G4]     [--]        [G5]
  [G10]    [G13,G14] [G15]
  [G12]    [G2,G7]
```

**Phase-to-gap mapping:**

- **Triage (PM):** G10 (no PM backlog enforcement), G11 (PM not required for HIGH features), G12 (TPM not triggered for EPIC)
- **Design (Planner):** G2 (DAG metadata optional), G6 (plan schema weak), G7 (no PRD-plan link), G9 (constitution checkpoint unenforced), G13 (research phase skippable), G14 (reflection phase skippable)
- **Implement (Developer):** G3 (tests not linked to acceptance criteria), G8 (completion metadata optional), G15 (tasks lack agent assignment)
- **Review:** No identified gaps (routing-guard enforces specialist routing)
- **Deploy:** G4 (no PRD success metric verification)
- **Document:** No identified gaps
- **Reflect:** G5 (reflection has no PRD context to evaluate)

---

## 5. Implementation Roadmap

### Wave 1: P0 Quick Wins (Unblock Everything Else)

**Duration:** 1-2 days | **Files:** 4 modified, 0 new

| Deliverable | File | Change |
|------------|------|--------|
| P0-1: PM-before-planner check | `.claude/hooks/routing/routing-guard-core.checks-router.cjs` | Add sub-check to existing planner-first logic |
| P0-2: Plan schema update | `.claude/schemas/plan.schema.json` | Add `target_agent`, `acceptance_checks`, `verification_command` to tasks |
| P0-2: Plan write validation | `.claude/hooks/validation/unified-pre-write-hook.cjs` | Add plan path schema validation in existing hook |
| P0-3: Completion metadata check | `.claude/hooks/validation/pre-completion-validation.cjs` | Extend to require summary on all completions |

**Verification:** `pnpm test` passes; routing-guard tests include PM-before-planner case; pre-completion tests include summary enforcement case.

### Wave 2: P1 Structural Improvements (2-4 days)

**Duration:** 3-5 days | **Files:** 5 modified, 3 new

| Deliverable | File | Change |
|------------|------|--------|
| P1-1: PRD-plan linkage | `.claude/schemas/plan.schema.json`, `.claude/templates/prd-template.md` | Add cross-reference fields |
| P1-1: Coverage checker | `.claude/tools/cli/prd-plan-coverage-check.cjs` | New CLI tool |
| P1-2: Constitution checkpoint | `.claude/lib/workflow/constitution-checkpoint.cjs` | New library module |
| P1-2: Gate 1 extension | `.claude/lib/workflow/quality-gates.cjs` | Wire constitution sub-gate |
| P1-3: TPM routing | `.claude/hooks/routing/routing-guard.cjs`, `.claude/lib/routing/routing-table.cjs` | Add TPM keywords + EPIC co-spawn |
| P1-4: PM backlog template | `.claude/templates/pm/pm-backlog-template.md` | New template |
| P1-5: DAG schema | `.claude/schemas/microtask-dag.schema.json` | New schema with overlap detection |

**Verification:** `pnpm test` passes; `node .claude/tools/cli/prd-plan-coverage-check.cjs --help` exits 0; DAG schema rejects overlapping paths.

### Wave 3: P2 Polish and Analytics (3-5 days)

**Duration:** 3-5 days | **Files:** 5 modified, 0 new

| Deliverable | File | Change |
|------------|------|--------|
| P2-1: QA PRD metrics | `.claude/agents/core/qa.md` | Extend verification protocol |
| P2-2: Plan status sync | `.claude/hooks/workflow/post-completion-chain.cjs` | Auto-update plan on task completion |
| P2-3: Reflection feedback | `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs` | Inject recent learnings for PM/Planner |
| P2-4: Skill overlap fix | `.claude/agents/core/pm.md`, `.claude/agents/core/planner.md` | Remove overlapping skills |

**Verification:** Planner spawn prompt contains learnings section; PM agent has `prd-generator` in automatic skills; `grep plan-generator .claude/agents/core/pm.md` returns nothing.

---

## BACKWARD_PROPAGATION

**Pattern:** PM-to-Planner handoff contract repeated across enterprise workflow, feature development workflow, and planner/PM agent definitions with no runtime enforcement.
**Proposed Artifact:** hook:pm-planner-handoff-gate
**Affected Components:** [pm.md, planner.md, enterprise-workflow.md, feature-development-workflow.md, routing-guard.cjs, quality-gates.cjs]
**Architectural Rationale:** Standardizing handoff enforcement eliminates the most common source of disconnected plans (HIGH features planned without PRD), reducing downstream rework by an estimated 30-40%.
**Impact Radius:** 6 components + all HIGH/EPIC workflows + 59 agent ecosystem
**Priority:** P1

---

**Pattern:** Microtask DAG metadata (`owned_paths`, `parallel_group`, `depends_on`) used by planner but not validated by any schema, hook, or gate.
**Proposed Artifact:** schema:microtask-dag
**Affected Components:** [planner.md, plan.schema.json, routing-guard.cjs, quality-gates.cjs, enterprise-workflow.md]
**Architectural Rationale:** Without DAG validation, Router cannot safely parallelize tasks. File conflicts between concurrent agents are currently possible and undetected.
**Impact Radius:** 5 components + all MEDIUM/HIGH/EPIC workflows
**Priority:** P1
