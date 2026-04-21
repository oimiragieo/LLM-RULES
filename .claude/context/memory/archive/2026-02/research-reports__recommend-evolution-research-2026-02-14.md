# Evolution Recommendation Research (2026-02-14)

## Scope

Research synthesis for `recommend-evolution` trigger policy and recording format using current repository process and workflow docs.

## Source Set

- `.claude/CLAUDE.md` (Section 4 EVOLVE, creator workflow rules)
- `.claude/workflows/core/evolution-workflow.md`
- `.claude/workflows/core/post-creation-validation.md`
- `.claude/skills/artifact-integrator/SKILL.md`
- `.claude/agents/core/reflection-agent.md`
- `.claude/context/evolution-state.json`

## Findings

### 1. Evolution Trigger Semantics

- Existing EVOLVE policy already recognizes:
  - explicit user request for missing capability
  - no matching agent/routing miss
  - systemic pattern signals indicating capability gaps
- Reflection workflow is the right producer of recommendations, not the direct executor of evolution.

### 2. Distinction: Evolution vs Integration vs Memory-only

- `artifact-integrator` handles missing integration of existing artifacts.
- Evolution recommendation is for net-new capability or structural ecosystem changes.
- Memory-only update is sufficient when no new artifact is required.

### 3. Recording Strategy

- Runtime queue pattern is already used elsewhere (`*.jsonl`, reminder files, spawn request files).
- A dedicated queue file at `.claude/context/runtime/evolution-requests.jsonl` aligns with existing runtime-state conventions.
- A report block is still needed for human auditability and immediate operator context.

### 4. Safety Boundary

- Recommendation skill should not auto-spawn `evolution-orchestrator`.
- Auto-consumption of recommendations is a separate routing/hook feature and should not be coupled to producer behavior.

### 5. Validation and Governance

- Integration checks depend on `validate-integration.cjs` and catalog/agent discoverability.
- `evolution-state.json` exists and remains the audit surface for workflow-level state.
- A schema contract improves consistency and enables future validation tooling.

## Design Implications for `recommend-evolution`

- Implement trigger classification with explicit thresholds.
- Require both JSONL enqueue and report block output.
- Keep orchestration handoff explicit and manual unless a future consumer is added.
- Standardize payload via `.claude/schemas/evolution-request.schema.json`.
