## ADR-2026-02-21-010: Commit-Checkpoint Mandatory for Multi-File Pipelines (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #13 reflection — 13 files stranded in working tree after pipeline stall

**Decision:** Any agent workflow that modifies 5 or more files MUST include an explicit `git commit` step as the final action before calling `TaskUpdate({ status: 'completed' })`. Pipelines that skip the commit step leave work stranded and at risk.

**Implementation:**

1. Add `commitCheckpoint: true` to TaskUpdate metadata for tasks that made git commits
2. Add "git commit" as explicit step in pipeline templates for MEDIUM+ complexity tasks
3. Task summaries MUST distinguish "modified + committed" from "modified but not committed"
4. Router should check git status before declaring pipeline phase complete

**Evidence:** Task #13 (2026-02-21) modified 13 files across implementation, tests, and memory — all correct work — but commit agent stalled. Work survived (working tree intact), but best practice requires commit-before-complete for all multi-file tasks.

**Detection pattern:** TaskUpdate summary containing "modified in working tree but not committed" signals this anti-pattern.

**Related:** Issues.md: Pipeline Stall Before VCS Commit (2026-02-21, P1)

---

## ADR-2026-02-21-009: Hook Documentation Accuracy as Security Control Property (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #3 — SEC-ICE-002 spawnDepth audit revealed enforcement in wrong hook vs documentation

**Decision:** When a security control's enforcement location is documented (in ADRs, workflow docs, or @ENFORCEMENT_HOOKS.md), that documentation accuracy is itself a security property. Controls documented in hook A but implemented in hook B create a discoverability gap: future auditors and maintainers will look in the documented location, find nothing, and may incorrectly conclude the control is a "paper control."

**Rationale:**

- SEC-ICE-002 was documented as living in routing-guard.cjs, but enforcement is in pre-task-unified-core.cjs via loop-state-manager.cjs
- The control works correctly, but the documentation mismatch misleads future auditors
- In security engineering, auditability and discoverability are as important as the control itself

**Implementation:**

1. After any hook refactor or module relocation, update all documentation references naming the hook as an enforcement location
2. @ENFORCEMENT_HOOKS.md, ADRs, and workflow docs must agree with actual file locations
3. SEC-ICE-002 in ecosystem-creation-workflow.md should be updated to name pre-task-unified-core.cjs (P2 doc fix)

**Related:**

- Issues.md: SEC-ICE-002 RESOLVED → P2 documentation fix (2026-02-21)
- Task #3 audit report: `.claude/context/reports/reflections/spawn-depth-audit-2026-02-21.md`

---

## ADR-2026-02-21-007: Validate:Skills CI Gate as Mandatory Post-Creation Check (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #4 — validate:skills CI wiring discovered 177 registration drift errors on first run

**Decision:** `pnpm validate:skills` MUST be run after every skill/agent creation or update as a mandatory post-creation integration check. The script catches catalog/index/agent-file drift before it accumulates. With 177 errors found on first run, this tool surfaced latent ecosystem debt that other checks missed.

**Rationale:**

- 177 errors on first run demonstrates the scale of drift possible without systematic checking
- CI-gate-ready output means this can be wired into `pnpm metrics:ci` or `pnpm ci` script chains
- Complements reflection-agent Step 4.7 (post-creation check) with a repeatable CLI baseline

**Implementation:**

1. Script: `.claude/tools/cli/validate-skill-agent-consistency.mjs` (already exists)
2. pnpm script: `validate:skills` (wired in Task #4)
3. tool-catalog.md entry: added (Task #4)
4. Trigger: Run after any creator skill completes OR manually before commits touching .claude/skills or .claude/agents

**Consequences:**

- **Positive**: Drift caught before accumulation; ecosystem health verifiable in CI
- **Negative**: 177 existing errors require remediation sprint before gate can be enforced in block mode

**Related:**

- Issues.md: 177 Skill/Agent Registration Drift Errors (2026-02-21)
- Task #4 (2026-02-21)

---

## ADR-2026-02-21-008: Dep Scan Command Canonicalization (SEC-ICE-002) (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #6 — SEC-ICE-002 P1 paper control: canonical dep scan command documented

**Decision:** The canonical dependency vulnerability scan command for this project is `pnpm audit --audit-level=high`. This command is now referenced in `ecosystem-creation-workflow.md` post-creation-validation.md Item 7. All teams must use this exact command when performing dep scans to ensure consistent severity thresholds.

**Rationale:**

- Different audit-level settings produce inconsistent results (critical vs high vs moderate)
- Canonicalizing the command eliminates ambiguity in security reviews
- ecosystem-creation-workflow.md is the authoritative lifecycle doc; referencing Item 7 there ensures visibility

**Related:**

- SEC-ICE-002 P1 paper control (dependency scanning gap)
- Task #6 (2026-02-21)

---

## ADR-2026-02-21-006: CHANGELOG Pre-Commit Hook Enforcement Recommendation (2026-02-21 REFLECTION)

**Status:** PROPOSED
**Date:** 2026-02-21
**Trigger:** Batch reflection tasks #19-25 — Task #22 was a standalone CHANGELOG update task

**Observation:** When CHANGELOG update is a separate task (Task #22), it signals that developers do not update it inline with their commits. ADR-2026-02-21-004 mandates CHANGELOG for ALL, but no hook enforces this at commit time.

**Recommendation:** Add lightweight pre-commit hook check: verify CHANGELOG.md [Unreleased] section modified in any commit that includes non-trivial source code changes. If CHANGELOG not updated, emit warning (not block — to preserve developer velocity).

**Pattern evidence:** Task #22 existence proves the gap. A pre-commit warn mode would surface this gap in-flow without blocking.

**Related:** ADR-2026-02-21-004, Task #22 (2026-02-21)

---

## ADR-2026-02-21-004: Changelog-Mandatory-for-ALL Gate (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #23 — enterprise-workflow.md Document phase update

**Decision:** CHANGELOG update is a blocking Quality Gate 5 requirement for ALL complexity levels. `changelogUpdated: true` is required in TaskUpdate metadata for all Document phase completions.

**Rationale:**

- Previously, CHANGELOG was listed as a Document phase step but was only explicitly blocking for HIGH/EPIC in practice
- Making it blocking for ALL prevents the "too small to document" skip pattern (same root logic as missing-taskupdate-metadata-recurring)
- `changelogUpdated: true` metadata field enables machine-verifiable completion by the reflection-agent

**Evidence:** enterprise-workflow.md Quality Gate 5, line 722: `CHANGELOG updated (Keep a Changelog) | ALL | YES`

**Related:** Task #23 (2026-02-21), batch reflection report: `.claude/context/reports/reflections/batch-reflection-tasks-20-23-2026-02-21.md`

---

## ADR-2026-02-21-005: Documentation-as-Contract Pattern (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Cross-task analysis of Tasks #20 and #23

**Decision:** Workflow quality gate tables with explicit "Required For" and "Blocking?" columns function as machine-readable contracts. New phases MUST pair gate table conditions with corresponding TaskUpdate metadata fields to enable objective reflection scoring.

**Pattern:**

1. Workflow phase defines required outputs
2. Gate table specifies scope (ALL/MEDIUM+/HIGH+/EPIC) and blocking conditions
3. TaskUpdate metadata field provides verifiable completion signal
4. Reflection-agent checks metadata against gate requirements

**Examples:**

- Task #23: CHANGELOG → Quality Gate 5 (ALL, blocking) → `changelogUpdated: true`
- Existing: docs → Quality Gate 5 → `docsUpdated: [...]`

**Related:** Task #23 and Task #20 batch reflection (2026-02-21), `.claude/context/reports/reflections/batch-reflection-tasks-20-23-2026-02-21.md`

---

## ADR: smart-debug scope — domain developer agents (2026-02-21)

Decision: Add smart-debug to core developer.md only. Domain developer agents (python-pro, nodejs-pro, etc.) deferred to Phase 2 architect review to determine if they need it.
Rationale: Domain agents inherit from core developer patterns; architect should evaluate if the debugging upgrade is universal or role-specific.
Status: PENDING Phase 2 review

## ADR-2026-02-21-003: Skill-Index agentPrimary Must Be Verified After SKILL.md Frontmatter Updates (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug audit reflection (Task #4)

**Decision:** When updating SKILL.md frontmatter `agents:` field (or skill-catalog.md primary agents), the skill-index.json MUST be regenerated AND verified. Frontmatter updates alone are insufficient because `generate-skill-index.cjs` sources `agentPrimary` from `agent-skill-matrix.json` lookup tables, not directly from SKILL.md frontmatter.

**Root Cause Observed:**

- smart-debug SKILL.md frontmatter: `agents: [developer, devops-troubleshooter, qa]`
- skill-catalog.md: `developer, devops-troubleshooter, qa`
- skill-index.json agentPrimary: `["developer"]` — only one agent, missing two

**Resolution Chain:**

1. Update SKILL.md frontmatter agents field
2. Update `agent-skill-matrix.json` to add explicit agent → skill mappings
3. Run `node .claude/tools/cli/generate-skill-index.cjs`
4. Verify with: `node -e "const idx=require('./.claude/config/skill-index.json'); console.log(idx.skills['smart-debug'].agentPrimary)"`

**Applicability:** All skills with multi-agent assignments. Especially critical for skills that should be invoked by non-developer agents (devops-troubleshooter, qa, architect, security-architect) as the index mismatch makes them invisible to those agents' skill discovery.

**Related:**

- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-lint-2026-02-21.md`
- Issues.md: smart-debug CLAUDE.md Reference Gap (2026-02-21)

---

## ADR-2026-02-20-001: Enterprise Pipeline Two-Commit & APPROVED_WITH_NOTES Pattern (REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-20
**Trigger:** Enterprise supply chain security pipeline completion (Tasks 4, 10, 11, 12)

**Decision:** Adopt two-commit deployment strategy and APPROVED_WITH_NOTES security review outcome as enterprise SOP for high-stakes deployments.

**Evidence:**

- Task 4 (Pipeline Parent): 12 tasks executed without rework, 100% gap resolution (4/4), aggregate score 0.90 (EXCELLENT)
- Task 11 (Security Review): APPROVED_WITH_NOTES with 0 critical/high, 3 LOW findings, 30/30 checklist pass
- Task 12 (Deploy & Commit): Two clean commits (c4022e7d security, c5c8e3938 churn), 7130 files validated, zero unexpected modifications

**Implementation:**

1. **Two-Commit Model**: Separate git commits for (a) security fixes + environment configuration, (b) catalog/memory/skill updates
2. **Whitespace Exclusion**: Document whitespace-only diffs in commit messages; validate with `git diff --check`
3. **APPROVED_WITH_NOTES**: Formal security review outcome for mixed-severity findings (0 critical/high, N LOW)
4. **30/30 Checklist Standard**: Security reviews must pass complete checklist items

**Consequences:**

- **Positive**: Audit trail clarity, zero false positives in compliance scanning, deployment-safe approvals, reduced rework
- **Negative**: Requires commit discipline, increases total commit count, team training needed

**Applicability:** HIGH/EPIC deployments with security gates, compliance reviews, or governance changes. Consider for MEDIUM+ in regulated environments.

**Related:** Enterprise pipeline architecture, security review protocol, git workflow governance

---

## ADR-2026-02-21-001: Opt-in HITL Pattern for Debugging Skills (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 update (Tasks 4-5)

**Decision:** Debugging skills that include a human-in-the-loop reproduction gate MUST default to auto-reproduction (HITL=false) and provide HITL as opt-in via environment variable. Pattern: `SMART_DEBUG_HITL=false` (or unset) = auto-reproduce; `SMART_DEBUG_HITL=true` = pause for human reproduction.

**Rationale:**

- AI debugging agents can auto-reproduce most bugs (~80%) via existing tests/scripts
- Mandatory HITL blocks every debugging session waiting for human, even when unnecessary
- Opt-in HITL preserves escape hatch for UI-dependent bugs, hardware-specific conditions, race conditions requiring specific user timing
- Consistent with framework convention: features default to autonomous, humans opt-in

**Implementation:**

- SKILL.md frontmatter: document SMART_DEBUG_HITL env var in Configuration table
- .env: `SMART_DEBUG_HITL=false` in Section 2 (Feature Flags) with descriptive comment
- .env.example: same — ensures operators can discover and override

**Auto-reproduction fallback behavior:**

1. Run existing tests covering affected code path
2. Execute reproduction scripts if present
3. Trigger code path directly via CLI/API/unit invocation
4. If auto-reproduction succeeds: proceed to log analysis (no human pause)
5. If auto-reproduction fails: fall back to HITL — ask user to reproduce

**Applicability:** Any skill/agent that includes a human-gated step that could be automated. Default to autonomous; human-gate is opt-in.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR-2026-02-21-002: Hypothesis-Ranking Gate as Mandatory Debugging Pre-condition (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 Cursor Debug Mode implementation

**Decision:** Debugging skills MUST enforce a hypothesis-ranking gate before any code instrumentation. The gate is an Iron Law, not a guideline.

**Required hypothesis format:**

- Probability % (estimated likelihood)
- Supporting evidence (already observed)
- Falsification criteria (what would disprove it)
- Testing approach (how instrumentation confirms/denies)
- Expected symptoms (observable behavior if true)

**Minimum**: 3 hypotheses. Maximum: 5. Forces prioritization.

**Rationale:**

- Broad "exploratory logging" generates noise rather than signal
- Hypothesis-first constrains each log line to test a specific theory
- Probability ranking prevents spending instrumentation budget on low-probability causes first
- Falsification criteria enable definitive root cause confirmation (not just confirmation bias)

**Implementation (smart-debug v2.0 Iron Law):**

```
NO INSTRUMENTATION BEFORE RANKED HYPOTHESES.
NO FIX BEFORE LOG-CONFIRMED ROOT CAUSE.
NO COMPLETION BEFORE INSTRUMENTATION CLEANUP.
```

**Session-scoped instrumentation pattern:**

- Each log line must reference a hypothesis ID (H1, H2, etc.)
- Log to `debug-{sessionId}.log` in `.claude/context/tmp/`
- Cleanup: grep for session ID in source files, delete log file

**Applicability:** All debugging workflows where the root cause is not immediately obvious from static analysis.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR: Post-Session Skill Validation Harness (2026-02-21)

Status: Implemented
Decision: Dual-component validation approach — CLI tool for CI (validate-skill-agent-consistency.mjs) + reflection-agent Step 4.7 for runtime detection.
Rationale: Smart-debug audit revealed catalog/index/agent-file can drift silently. CLI tool catches drift in CI; reflection-agent catches it post-creation.
Impact: .claude/tools/cli/validate-skill-agent-consistency.mjs, .claude/agents/core/reflection-agent.md
