<!-- Agent: architect | Task: #7 | Session: 2026-03-05 -->

# Evolution System Deep Dive Audit

**Date:** 2026-03-05
**Agent:** architect
**Task:** #7

---

## Executive Summary

The evolution system is architecturally sound with a well-defined 6-phase EVOLVE state machine, comprehensive hook enforcement, and active state tracking (126 completed evolutions). However, several wiring gaps exist: 5 of 6 creator skills lack a formal `dependencies: [research-synthesis]` frontmatter field, the evolution-orchestrator frontmatter is missing 4 creator skills it references in its body, and the `post-creation-integration.cjs` hook is registered but the CLAUDE.md incorrectly states it lives in `routing/` when it actually lives in `workflow/`.

**Critical Findings:** 1 | **High Findings:** 3 | **Medium Findings:** 3 | **Low Findings:** 2

---

## 1. EVOLVE Workflow Analysis

**File:** `.claude/workflows/core/evolution-workflow.md` (1143 lines)

### State Machine Definition

The EVOLVE workflow defines a 6-phase state machine:

| Phase | Name | Purpose |
|-------|------|---------|
| E | Evaluate | Detect capability gap, classify complexity |
| V | Validate | Confirm gap is real, check for existing solutions |
| O | Obtain/Research | MANDATORY research phase (min 3 queries, 3 sources) |
| L | Lock | Create artifact via creator skill |
| V | Verify | Test, validate, quality gate |
| E | Enable | Wire into ecosystem, update registries |

**Mermaid diagram present:** Lines 85-101 (correct state transitions documented)

### Phase O Enforcement

- **Line 304:** `> **CRITICAL**: This phase CANNOT be skipped. NO artifact creation without research.`
- **Line 398:** `- [ ] Minimum 3 research queries executed (with evidence in report)`
- **Line 399:** `- [ ] Minimum 3 external sources consulted (URLs documented)`
- **Line 394:** Research report output path: `.claude/context/artifacts/research-reports/<artifact-name>-research.md`

**VERDICT:** Phase O is well-documented with explicit non-bypass language.

### Hook References

The workflow references 6 enforcement hooks at lines 779-787:

| Hook | File | Purpose |
|------|------|---------|
| research-enforcement | `.claude/hooks/evolution/research-enforcement.cjs` | Blocks creation without research |
| evolution-state-guard | `.claude/hooks/evolution/evolution-state-guard.cjs` | Validates state transitions |
| conflict-detector | `.claude/hooks/evolution/conflict-detector.cjs` | Prevents duplicate artifacts |
| quality-gate-validator | `.claude/hooks/evolution/quality-gate-validator.cjs` | Enforces quality gates |
| artifact-scoring-ledger-hook | `.claude/hooks/quality/artifact-scoring-ledger-hook.cjs` | Scores artifact quality |
| audit-skill-recency | `.claude/hooks/session/audit-skill-recency.cjs` | Checks skill freshness |

### Iron Laws

Lines 838-870 define Iron Laws including:
- Research-first (no creation without Phase O)
- Single artifact per evolution (prevents scope creep)
- State persistence (every phase writes to evolution-state.json)
- Quality gate enforcement (Verify phase cannot be skipped)

**FINDING [LOW] EVO-01:** The evolution-state schema at lines 878-903 does not include `pendingProposals` or `status` fields, but the actual `evolution-state.json` file contains both. Schema is outdated relative to implementation.

---

## 2. Evolution Orchestrator Analysis

**File:** `.claude/agents/orchestrators/evolution-orchestrator.md` (1004 lines)

### Frontmatter Configuration

- **Model:** `opus` (line 7) -- correct for orchestrator complexity
- **Tools:** includes `Task` tool (line 20) -- required for orchestrator delegation
- **Extended thinking:** enabled (line 13)

### Frontmatter Skills List

```yaml
skills:
  - agent-creator
  - artifact-lifecycle
  - command-creator
  - research-synthesis
  - ripgrep
  - rule-creator
  - skill-creator
  - task-management-protocol
  - verification-before-completion
```

**FINDING [HIGH] EVO-02:** The evolution-orchestrator frontmatter `skills` array is **missing 4 creator skills** that the orchestrator body references and invokes:
- `workflow-creator` (referenced at line ~450+ in body)
- `hook-creator` (referenced in body for hook creation)
- `template-creator` (referenced in body)
- `schema-creator` (referenced in body)

These skills ARE invoked via `Skill()` calls in the orchestrator body text, but are NOT declared in the frontmatter. This means the 3-layer skill resolution system (frontmatter + agent-skill-matrix + skill-index) may not properly associate these skills with the evolution-orchestrator. The orchestrator CAN still invoke them at runtime via `Skill()`, but tooling that relies on frontmatter (registry generation, proactive audit skill checks) will report false negatives.

### Research-Synthesis Invocation

- Line 223: research-synthesis is invoked as part of Phase O
- Line 682: referenced again in the workflow body
- The orchestrator correctly enforces research-first by invoking `Skill({ skill: 'research-synthesis' })` before any creator skill

### Registry Presence

The evolution-orchestrator IS present in `agent-registry.json`:
- ID: `evolution-orchestrator`
- Category: `orchestrator`
- File path: `.claude/agents/orchestrators/evolution-orchestrator.md`
- Description: "Meta-agent that orchestrates the EVOLVE workflow..."
- Routing keyword: `evolution-orchestrator`

**VERDICT:** Orchestrator is properly registered and routable, but frontmatter skills list is incomplete.

---

## 3. Evolution Hooks Audit

### Hook File Existence

All 6 hooks referenced by the workflow exist on disk:

| Hook | Path | Exists | Registered in settings.json |
|------|------|--------|-----------------------------|
| research-enforcement.cjs | `.claude/hooks/evolution/` | YES | YES (line 111) |
| evolution-state-guard.cjs | `.claude/hooks/evolution/` | YES | YES (line 120) |
| quality-gate-validator.cjs | `.claude/hooks/evolution/` | YES | YES (lines 129, 200) |
| conflict-detector.cjs | `.claude/hooks/evolution/` | YES | YES (line 138) |
| artifact-scoring-ledger-hook.cjs | `.claude/hooks/quality/` | YES | YES (line 237) |
| audit-skill-recency.cjs | `.claude/hooks/session/` | YES | YES (line 33) |

### research-enforcement.cjs Deep Dive

- **Lines 1-50 read.** Header confirms PreToolUse hook for Write/Edit operations.
- Enforces: Cannot create artifact files without completing research phase.
- Checks `evolution-state.json` for at least `MIN_RESEARCH_ENTRIES = 3` research entries.
- Enforcement modes: `RESEARCH_ENFORCEMENT=block|warn|off` (default: block)
- **SEC-008 compliant:** Fails CLOSED (exit 2 on errors) to prevent security bypass.
- Uses `safeReadJSON` (not raw `JSON.parse`) for SEC-007 prototype pollution prevention.
- Uses shared utilities from `.claude/lib/utils/` (hook-input, project-root, state-cache, safe-json).

### settings.json Registration

All evolution hooks are properly registered in `.claude/settings.json` with correct file paths. The `quality-gate-validator.cjs` is registered TWICE (lines 129 and 200) for different trigger contexts, which is intentional (PreToolUse on different tool types).

**VERDICT:** All hooks exist, are registered, and follow security best practices.

---

## 4. State Tracking Analysis

**File:** `.claude/context/evolution-state.json` (1304 lines)

### Structure

```json
{
  "version": 1,
  "lastEvolution": "2026-03-01-dynamic-api-integration-update",
  "evolutions": [...],     // 126 entries
  "pendingProposals": ...,
  "status": ...,
  "skills": ...
}
```

- **126 completed evolutions** tracked since system inception
- **Last evolution:** 2026-03-01 (dynamic-api-integration-update)
- **Top-level keys:** version, lastEvolution, evolutions, pendingProposals, status, skills

### Evolution Entry Format (from first entry)

```json
{
  "id": "2026-03-01-dynamic-api-integration-update",
  "skill": "dynamic-api-integration",
  "version": "1.2.0",
  "date": "2026-03-01",
  "type": "skill-updater",
  "summary": "Added agents/category/tags frontmatter..."
}
```

**FINDING [MEDIUM] EVO-03:** The evolution entry format in the actual file includes only `id`, `skill`, `version`, `date`, `type`, `summary`. The evolution-workflow.md schema (lines 878-903) specifies additional fields like `phase`, `researchReport`, `qualityScore`, `artifactType`, `artifactPath`. The runtime state diverges from the documented schema -- either the hooks are not writing all fields, or the schema was expanded after the bulk of evolutions were recorded.

**VERDICT:** State tracking is functional and actively used. Schema drift between documentation and runtime is a medium concern.

---

## 5. Creator Skill Integration

### Creator Skill Inventory

All 6 creator skills exist on disk:

| Skill | Path | Exists | Has `dependencies: [research-synthesis]` |
|-------|------|--------|-------------------------------------------|
| agent-creator | `.claude/skills/agent-creator/SKILL.md` | YES | NO |
| skill-creator | `.claude/skills/skill-creator/SKILL.md` | YES | NO |
| workflow-creator | `.claude/skills/workflow-creator/SKILL.md` | YES | NO |
| hook-creator | `.claude/skills/hook-creator/SKILL.md` | YES | NO |
| template-creator | `.claude/skills/template-creator/SKILL.md` | YES | YES |
| schema-creator | `.claude/skills/schema-creator/SKILL.md` | YES | NO |

**FINDING [CRITICAL] EVO-04:** Only 1 of 6 creator skills (`template-creator`) has the formal `dependencies: [research-synthesis]` frontmatter field. The CLAUDE.md Section 3 states: "Always invoke research-synthesis BEFORE any other creator skill (agent-creator, skill-creator, workflow-creator, hook-creator, template-creator, schema-creator)." This is an **Iron Law** in documentation but is NOT encoded in 5 of 6 creator skill frontmatters.

**Impact:** The research-enforcement.cjs hook enforces research at the Write/Edit level (checking evolution-state.json for research entries). However, if a creator skill is invoked OUTSIDE the EVOLVE workflow (e.g., directly by a developer), there is no frontmatter-level signal that research-synthesis is a prerequisite. The hook enforcement partially compensates, but frontmatter is the canonical declaration mechanism for skill dependencies.

**Mitigating factor:** The `agent-creator` frontmatter does include `best_practices: ["Research domain before creating agent"]` -- but this is advisory, not enforced.

### Companion-Check Integration

- `companion-check.cjs` exists at: `.claude/lib/creators/companion-check.cjs`
- It is a **library module**, NOT a hook (not in `.claude/hooks/`)
- Referenced by all 12 creator/updater skills' SKILL.md files (agent-creator, skill-creator, workflow-creator, hook-creator, template-creator, schema-creator, plus their updater counterparts, command-creator, rule-creator, tool-creator, artifact-lifecycle)
- The companion-check is invoked programmatically within creator skill workflows, not as a hook registration

**VERDICT:** companion-check is correctly implemented as a shared library callable from creator skills.

### Post-Creation Integration

- `post-creation-integration.cjs` exists at: `.claude/hooks/workflow/post-creation-integration.cjs`
- Registered in settings.json at line 241
- Triggers on PostToolUse of TaskUpdate (detects creator completions)
- Queues integration analysis for artifact-integrator

**FINDING [MEDIUM] EVO-05:** The CLAUDE.md Section 1.3 references `post-creation-integration.cjs` as if it is in the routing category, but it actually lives in `.claude/hooks/workflow/`. This is a documentation inaccuracy -- not a functional issue, since settings.json has the correct path.

### process-evolution-queue.cjs

- Located at: `.claude/hooks/process-evolution-queue.cjs` (root of hooks directory)
- Implements a polling processor with exclusive file-based locking
- Reads evolution dispatch plans from `.claude/context/runtime/evolution-dispatch-plan.json`
- Uses `POLL_INTERVAL_MS = 60000` (1-minute polling)

**FINDING [LOW] EVO-06:** This hook lives in the root `.claude/hooks/` directory rather than in `.claude/hooks/evolution/` alongside the other evolution hooks. Minor organizational inconsistency.

---

## 6. Gaps and Broken Wiring

### Gap Summary

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| EVO-01 | LOW | evolution-workflow.md | Schema in docs outdated vs actual evolution-state.json structure |
| EVO-02 | HIGH | evolution-orchestrator.md | Frontmatter missing 4 creator skills (workflow-creator, hook-creator, template-creator, schema-creator) |
| EVO-03 | MEDIUM | evolution-state.json | Runtime entries have fewer fields than documented schema |
| EVO-04 | CRITICAL | Creator skills (5 of 6) | Missing `dependencies: [research-synthesis]` in frontmatter |
| EVO-05 | MEDIUM | CLAUDE.md Section 1.3 | Documents post-creation-integration as routing hook; actually in workflow/ |
| EVO-06 | LOW | process-evolution-queue.cjs | Misplaced in hooks root instead of hooks/evolution/ |
| EVO-07 | HIGH | evolution-orchestrator.md | No explicit error recovery documented for Phase O failure (research fails) |
| EVO-08 | HIGH | Creator skills | No automated test verifying research-synthesis prerequisite enforcement |
| EVO-09 | MEDIUM | evolution-state.json | No size rotation mechanism -- 126 entries growing indefinitely (1304 lines) |

### EVO-07 Detail (HIGH)

The evolution-orchestrator body describes the happy path extensively but does not document what happens when Phase O (research) fails -- e.g., when WebSearch/WebFetch are unavailable, rate-limited, or return no results. The research-enforcement hook will block creation, but the orchestrator has no documented fallback strategy (retry with different queries, degrade to local-only research, abort with clear error message).

### EVO-08 Detail (HIGH)

There are no integration tests verifying that invoking a creator skill without prior research-synthesis invocation is actually blocked by the research-enforcement hook. The hook exists and has correct logic, but the end-to-end path (creator skill -> Write attempt -> hook intercept -> block) is untested. If the hook registration is accidentally removed from settings.json, the Iron Law silently stops being enforced.

### EVO-09 Detail (MEDIUM)

The evolution-state.json file has 126 entries across 1304 lines and will grow indefinitely. Unlike the memory system (which has rotation via memory-rotator.cjs for files exceeding 20KB), evolution-state.json has no rotation or archival mechanism. At current growth rate (~126 entries in ~5 days), this could become unwieldy within weeks.

---

## Architectural Assessment

### What Works Well

1. **Hook enforcement chain is complete.** All 6 referenced hooks exist, are registered, and follow security best practices (fail-closed, safeParseJSON, shared utilities).
2. **State tracking is active.** 126 evolutions tracked with consistent entry format.
3. **research-enforcement.cjs is well-implemented.** SEC-008 compliant, uses proper enforcement modes, checks minimum research entries.
4. **companion-check is correctly factored.** Lives in shared library, referenced by all creator skills.
5. **Evolution orchestrator is properly registered** in agent-registry.json with correct routing.

### What Needs Remediation

1. **[CRITICAL] Add `dependencies: [research-synthesis]` to 5 creator skill frontmatters** -- this is the single most important fix. It makes the Iron Law machine-readable.
2. **[HIGH] Add 4 missing creator skills to evolution-orchestrator frontmatter** -- ensures registry/audit tooling correctly maps skill ownership.
3. **[HIGH] Add Phase O failure recovery documentation** to evolution-orchestrator.md.
4. **[HIGH] Create integration test for research-enforcement end-to-end path.**
5. **[MEDIUM] Implement evolution-state.json rotation** or archival (similar to memory-rotator.cjs pattern).

---

## Files Analyzed

| File | Lines | Status |
|------|-------|--------|
| `.claude/workflows/core/evolution-workflow.md` | 1143 | Fully read |
| `.claude/agents/orchestrators/evolution-orchestrator.md` | 1004 | Fully read |
| `.claude/context/agent-registry.json` | ~8500 | Grep-searched |
| `.claude/context/evolution-state.json` | 1304 | Structure verified |
| `.claude/hooks/evolution/research-enforcement.cjs` | ~200 | First 50 lines read |
| `.claude/hooks/evolution/evolution-state-guard.cjs` | ~200 | Existence verified |
| `.claude/hooks/evolution/conflict-detector.cjs` | ~200 | Existence verified |
| `.claude/hooks/evolution/quality-gate-validator.cjs` | ~200 | Existence verified |
| `.claude/hooks/quality/artifact-scoring-ledger-hook.cjs` | ~200 | Existence verified |
| `.claude/hooks/session/audit-skill-recency.cjs` | ~200 | Existence verified |
| `.claude/hooks/process-evolution-queue.cjs` | ~200 | First 30 lines read |
| `.claude/hooks/workflow/post-creation-integration.cjs` | ~200 | Existence verified |
| `.claude/lib/creators/companion-check.cjs` | ~200 | Existence verified |
| `.claude/settings.json` | ~300 | Grep-searched for registrations |
| 6x Creator skill SKILL.md frontmatters | varies | Fully extracted |
