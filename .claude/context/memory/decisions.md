## ADR-2026-02-22-003: Proactive-Audit as Mandatory Final Pipeline Step (2026-02-22 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Reflection of tasks #28-31 — proactive-audit skill created, CLAUDE.md Step 0.7 added

**Decision:** Whenever a pipeline session creates, modifies, or deletes framework artifacts (hooks, skills, agents, workflows, schemas, templates, CLAUDE.md, routing-table.cjs), the router MUST spawn a QA agent with `Skill({ skill: 'proactive-audit' })` as the final pipeline step before claiming completion.

**Rationale:**
- Framework artifacts have integration dependencies (catalog, index, settings.json, agent frontmatter) that are easy to miss
- No prior mechanism existed to detect broken hooks, missing skill registrations, or routing gaps post-pipeline
- Router Step 0.7 provides automatic invocation via CLAUDE.md enforcement

**Evidence:** Tasks #29 and #30 created skills that appear in catalog but not in skill-index.json — proactive-audit check S-05 would have caught this.

**Scope:** All pipelines touching `.claude/hooks/`, `.claude/skills/`, `.claude/agents/`, `.claude/workflows/`, `.claude/schemas/`, `.claude/CLAUDE.md`, `.claude/lib/routing/routing-table.cjs`

**Related:**
- CLAUDE.md Section 0.1 Step 0.7
- `.claude/skills/proactive-audit/SKILL.md`
- `.claude/context/plans/proactive-audit-design-2026-02-22.md`

---

## ADR-2026-02-22-004: skill-index.json Requires Manual Regeneration After SKILL.md Creation (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Both webmcp-browser-tools and proactive-audit missing from skill-index.json despite SKILL.md files existing

**Decision:** skill-index.json is NOT auto-populated when SKILL.md files are created manually. The `generate-skill-index.cjs` script must be run explicitly as part of post-creation integration. This is now a mandatory step in skill-creator workflow.

**Command:** `node .claude/tools/cli/generate-skill-index.cjs`

**When to run:** After any new SKILL.md creation, OR after updating `agents:` field in existing SKILL.md frontmatter.

---

## ADR-2026-02-22-001: Post-Creation Integration Documentation Pattern (2026-02-22 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Meta-reflection of Task #12 (Task #13) — Task 12 documented skill-creator post-creation integration failures using a systematic template

**Decision:** When documenting creation-phase or post-creation workflow failures, use a six-step documentation structure that combines problem analysis with actionable solutions:

**Documentation Template**:

1. **Observed Behavior** — What happened (specific examples, counts, dates)
2. **Impact Assessment** — Why it matters (consequences, scope, affected users/systems)
3. **Root Cause** — Why it happened (mechanism, systemic factors)
4. **Workaround** — How to fix now (step-by-step checklist, agent selection guidance)
5. **Pattern** — How to prevent future (reusable process, applicable contexts)
6. **Agent Selection** — Which tool to use (explicit guidance on agents to use vs. avoid, with empirical evidence)

**Rationale**:

- Task 12 reflection used this template and achieved 0.90 rubric score (EXCELLENT)
- Structure balances diagnosis (steps 1-3) with action (steps 4-6)
- Empirical evidence in step 6 (artifact-integrator ran twice, zero changes) prevents theoretical assumptions
- Template is reusable for all future creator-workflow issues

**Implementation**:

- Document in `.claude/context/memory/learnings.md` as reusable pattern
- Train reflection-agent to use this template for all creation-phase issues
- Include examples: skill-creator gaps, agent-creator gaps, workflow issues

**Related**:

- Task #12 Reflection: Skill-Creator Post-Creation Integration Failures (exemplar)
- Reflection Report: `.claude/context/reports/reflections/reflection-task-13-meta-reflection-2026-02-22.md`

---

## ADR-2026-02-22-002: Reflection-Agent Spawning via Skill() Breaks Atomic Handshake (2026-02-22 REFLECTION)

**Status:** OPEN (BLOCKER)
**Date:** 2026-02-22
**Trigger:** Reflection-agent invoked for tasks 21, 22, 14; cannot call TaskUpdate for atomic completion

**Issue**: Reflection-agent needs TaskUpdate tool to complete atomic handshake (processedReflectionIds metadata). When spawned via Skill() instead of Task(), tool whitelist does not include TaskUpdate.

**Analysis**:

- Reflection-agent should be spawned as `Task()` with full task-lifecycle tool access
- Router Step 0 specifies: "reflection-agent MUST call TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })"
- If spawned as a skill instead of agent task, tool restrictions prevent handshake completion
- Results in orphaned reflection-spawn-request.json entries (marked processed: false forever)

**Decision**: Reflection-agent MUST always be spawned as `Task()`, never as `Skill()`.

**Evidence**:

- Error: "No such tool available: TaskUpdate" when reflection-agent calls TaskUpdate()
- Briefing requirement CLAUDE.md Section 0.1: "reflection-agent MUST call TaskUpdate"
- Atomic handshake pattern (MANDATORY): processedReflectionIds in metadata

**Related**:

- ISSUE: Reflection-Agent Cannot Complete Atomic Handshake (2026-02-22)
- `.claude/context/reports/reflections/reflection-tasks-21-22-14-insufficient-data-2026-02-22.md`

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

## ADR-2026-02-21-012: Gap Capture via Session Gap Log

**Status:** Accepted
**Date:** 2026-02-21

**Context:** The router regularly identifies gaps, failures, retries, and warnings during pipeline execution but had no mechanism to persist these observations. Reflection agents received "Task N completed without summary metadata" — completely blind to what the router observed. This caused learnings to be silently dropped.

**Decision:** Implement a session-scoped JSONL gap log at `.claude/context/runtime/session-gap-log.jsonl`. The router writes gap entries inline using Bash. `reflection-queue-processor.cjs` auto-injects gap context into every reflection spawn prompt. `post-completion-chain.cjs` extracts agent-reported gaps from `TaskUpdate` metadata. `reflection-agent.md` includes an explicit Step 1.5 to analyze gap entries.

**Approach A+B+D(partial):**

- **A (contract):** CLAUDE.md Gap Observation Protocol + router-decision.md Step 9.5 mandate router to write gap entries
- **B (automation):** `reflection-queue-processor.cjs` reads and injects gap log into every reflection prompt automatically
- **D partial:** `post-completion-chain.cjs` extracts `metadata.gapLog` arrays from agent TaskUpdate calls

**Files changed:** CLAUDE.md, router-decision.md, reflection-queue-processor.cjs, post-completion-chain.cjs, reflection-agent.md, session-gap-log-entry.schema.json, schema-catalog.md

**Consequences:**

- Reflection agents now receive full cross-agent pipeline context automatically
- Router observations (retries, stalls, integration gaps, placeholder outputs) are no longer silently lost
- `session-gap-log.jsonl` is session-scoped runtime file (not committed to git)
- Reflection prompts capped at 20 most recent gap entries to control prompt size
- Gap extraction in post-completion-chain.cjs is wrapped in try/catch — non-critical path

**Rejected approaches:**

- Approach C (capture-issue skill): Router cannot invoke Skill() per Tool Lockdown
- Approach D standalone: Only captures agent-reported gaps, not router-observed gaps
