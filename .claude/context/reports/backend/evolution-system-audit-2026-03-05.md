<!-- Agent: architect | Task: #7 | Session: 2026-03-05 -->

# Evolution System Audit Report

**Date:** 2026-03-05
**Scope:** EVOLVE workflow, evolution-orchestrator, creator skills, enforcement hooks, end-to-end flow
**Auditor:** Architect Agent (Task #7 - Phase 6: Evolution System Audit)

---

## Executive Summary

The EVOLVE workflow is **architecturally well-designed** but **operationally disconnected from the router**. The workflow definition, state machine, enforcement hooks, companion check system, and post-creation integration hook all exist and are functional. However, the router never automatically triggers the evolution-orchestrator -- it routes "no matching agent" to agent-creator directly, bypassing EVOLVE entirely. Additionally, 5 of 6 creator skills lack machine-readable `dependencies: [research-synthesis]` in frontmatter, and the research-enforcement hook has a coverage gap (missing 3 artifact path types).

**Overall Verdict: 4 PASS, 3 FAIL, 1 PARTIAL**

---

## Area 1: Evolution Orchestrator Agent Definition

**Verdict: FAIL (partial)**

**Evidence:**
- File: `.claude/agents/orchestrators/evolution-orchestrator.md`
- Has `model: opus` (line 7) -- PASS
- Has `Task` tool in tools list (line 20) -- PASS
- Has `research-synthesis` in skills (line 33) -- PASS
- Has all 6 EVOLVE phases documented in instructions -- PASS
- **MISSING creator skills in frontmatter:** `hook-creator`, `schema-creator`, `template-creator`, `workflow-creator` are absent from the skills list despite Phase L (LOCK) requiring the orchestrator to invoke creator skills for artifact creation

**Impact:** The evolution-orchestrator cannot invoke 4 of 6 creator skills during Phase L without them in its skill assignments. The skills it HAS are: `agent-creator`, `skill-creator`, `research-synthesis`, `artifact-lifecycle`, `command-creator`, `rule-creator`, `verification-before-completion`, `ripgrep`, `code-semantic-search`, `code-structural-search`, `task-management-protocol`.

**Fix:** Add `hook-creator`, `schema-creator`, `template-creator`, `workflow-creator` to frontmatter skills list.

---

## Area 2: EVOLVE Workflow Phases

**Verdict: PASS**

**Evidence:**
- File: `.claude/workflows/core/evolution-workflow.md`
- All 6 phases defined: Evaluate, Validate, Obtain, Lock, Verify, Enable
- State machine with valid transitions documented (Mermaid diagram + transition table)
- Phase O (OBTAIN) correctly requires minimum 3 research queries
- Quality gates defined between every phase transition
- References 6 enforcement hooks: `audit-skill-recency.cjs`, `conflict-detector.cjs`, `research-enforcement.cjs`, `evolution-state-guard.cjs`, `quality-gate-validator.cjs`, `artifact-scoring-ledger-hook.cjs`
- State persistence via `evolution-state.json` (file-based state machine)

**Notes:** The workflow document is comprehensive and well-structured. No gaps found in the workflow definition itself.

---

## Area 3: Creator Skill research-synthesis Dependencies

**Verdict: FAIL**

**Evidence:**
Checked all 6 creator skill SKILL.md frontmatter for `dependencies:` field:

| Creator Skill    | Has `dependencies: [research-synthesis]`? |
|------------------|------------------------------------------|
| agent-creator    | NO                                       |
| skill-creator    | NO                                       |
| workflow-creator | NO                                       |
| hook-creator     | NO                                       |
| template-creator | **YES** (line 15)                        |
| schema-creator   | NO                                       |

**Result:** 5 of 6 creator skills lack machine-readable dependency declaration.

**Impact:** While `research-enforcement.cjs` enforces research at write-time (runtime enforcement), the lack of frontmatter `dependencies:` means:
1. Skill discovery tooling cannot determine prerequisites
2. Companion-check.cjs cannot validate research was done before creator invocation
3. Automated pipelines that read skill metadata will skip the research step

**Fix:** Add `dependencies: [research-synthesis]` to frontmatter of all 5 remaining creator skills.

---

## Area 4: Evolution Trigger Detection in Routing

**Verdict: FAIL (critical)**

**Evidence:**
- `router-decision.md` lines 555-564: "No matching agent" maps to `agent-creator` (NOT evolution-orchestrator)
- `router-decision.md` lines 1375-1379: "If Step 6 finds no matching agent" instructions say to spawn agent-creator, then spawn the new agent
- `routing-guard.cjs`: Searched for "evolution", "capability_gap", "evolve" -- ZERO matches found
- The routing table (`routing-table.cjs`) has no evolution-orchestrator entry for capability gap detection

**Impact:** This is the most critical finding. The EVOLVE workflow is never automatically triggered. When the router encounters a capability gap ("no matching agent"), it:
1. Spawns agent-creator directly (skipping Evaluate, Validate, Obtain phases)
2. Bypasses the evolution state machine entirely
3. Bypasses research-enforcement (since agent-creator may not write to artifact paths through the hook-guarded path)
4. Never invokes evolution-orchestrator at all

The only way evolution-orchestrator runs is via explicit user request ("evolve the framework" or similar). There is no automatic detection and routing.

**Fix:**
1. Add evolution-orchestrator to routing table for capability-gap intent keywords
2. Update router-decision.md Step 6 to route "no matching agent" to evolution-orchestrator (not agent-creator)
3. Add capability_gap detection in routing-guard.cjs (Check N+1)

---

## Area 5: Companion Check System

**Verdict: PASS**

**Evidence:**
- File: `.claude/lib/creators/companion-check.cjs` (461 lines)
- Loads `companionMatrix` from `ecosystem-impact-graph.json` -- verified populated with 9 artifact types: agent, skill, hook, workflow, command, rule, tool, template, schema
- `checkCompanions()` validates required/recommended/optional companions
- Supports 5 check strategies: file-exists, grep-in-file, json-key-exists, glob-match, settings-registered
- `getAutoSpawnSuggestions()` generates spawn suggestions (kill switch: `AUTO_COMPANION_SPAWN=off` by default)
- `formatCompanionChecklist()` produces markdown output
- Used by creator skills during Step 0.5 (companion check before creation)

**Notes:** The companion check system is well-implemented and functional. The companionMatrix covers all artifact types.

---

## Area 6: Post-Creation Integration Hook

**Verdict: PASS**

**Evidence:**
- File: `.claude/hooks/workflow/post-creation-integration.cjs` (601 lines)
- PostToolUse hook on TaskUpdate -- detects creator completions
- `isCreatorCompletion()` checks both `metadata.creatorType` and pattern matches in summary text
- `quickIntegrationCheck()` uses artifact-graph.cjs to find integration gaps
- `runEcosystemImpactAnalysisWithTimeout()` runs impact analysis with timeout budget
- `appendToQueueWithImpact()` writes to `integration-queue.jsonl` with sanitized impact report
- Auto-spawns artifact-integrator when queue size >= `INTEGRATION_BATCH_SIZE` (default 5)
- Advisory mode by default (`INTEGRATION_ENFORCEMENT=warn`), can be set to block

**Notes:** This is one of the most complete components in the evolution pipeline. Comprehensive error handling, timeout budgeting, and configurable enforcement.

---

## Area 7: Artifact Integrator Capabilities

**Verdict: PARTIAL**

**Evidence:**
- File: `.claude/agents/orchestrators/artifact-integrator.md` exists
- Searched for "integration-queue" in artifact-integrator.md -- ZERO matches
- The artifact-integrator agent definition does not reference `integration-queue.jsonl`
- The post-creation-integration hook writes to the queue and spawns artifact-integrator, but passes context via spawn prompt (not queue file)
- artifact-integrator has its own integrated pipeline for external repositories (including research + security audit)

**Impact:** The artifact-integrator processes integration requests but does not directly read integration-queue.jsonl. The queue is consumed indirectly:
1. Post-creation hook accumulates entries in the queue
2. When batch size threshold is reached, hook spawns artifact-integrator with context
3. Router Step 0.5 also checks the queue and spawns artifact-integrator

This works but the artifact-integrator itself has no native awareness of the queue format. If the spawn prompt omits queue context, integration entries are orphaned.

**Fix:** Consider adding explicit integration-queue.jsonl processing to artifact-integrator's instructions.

---

## Area 8: End-to-End Flow

**Verdict: FAIL (chain broken)**

**End-to-End Trace:**

```
User: "I need an agent that can do X" (capability gap)
  |
  v
Router: Classifies intent, checks routing table
  |
  v
Router: "No matching agent" -> routes to agent-creator  [BREAK POINT]
  |                                                       |
  |  (Should route to evolution-orchestrator)              |
  |                                                       v
  |                                              agent-creator runs
  |                                              WITHOUT research-synthesis
  |                                              (no dependencies: field)
  |
  v  (If evolution-orchestrator WERE spawned):
  |
  EVALUATE -> VALIDATE -> OBTAIN (research) -> LOCK (create) -> VERIFY -> ENABLE
                            |                    |                |
                            v                    v                v
                    research-enforcement.cjs  companion-check.cjs  quality-gate-validator.cjs
                    (checks 3/6 paths)       (fully functional)   (fully functional)
                            |
                            v
                    MISSING: .claude/hooks/
                    MISSING: .claude/templates/
                    MISSING: .claude/schemas/
```

**Chain Breaks:**

1. **Router level (CRITICAL):** Router routes capability gaps to agent-creator, not evolution-orchestrator. The EVOLVE workflow is never triggered automatically.

2. **Research enforcement coverage (HIGH):** `research-enforcement.cjs` ARTIFACT_PATH_PATTERNS only covers 3 of 6 artifact types:
   - COVERED: `.claude/agents/`, `.claude/skills/`, `.claude/workflows/`
   - MISSING: `.claude/hooks/`, `.claude/templates/`, `.claude/schemas/`

3. **Creator skill dependencies (MEDIUM):** 5/6 creators lack `dependencies: [research-synthesis]` in frontmatter.

4. **Evolution-orchestrator skills (MEDIUM):** Missing 4 creator skills needed for Phase L.

---

## Findings Summary

| # | Area | Verdict | Severity | Description |
|---|------|---------|----------|-------------|
| F1 | Evolution Orchestrator | FAIL | MEDIUM | Missing 4 creator skills in frontmatter (hook-creator, schema-creator, template-creator, workflow-creator) |
| F2 | EVOLVE Workflow | PASS | -- | All 6 phases, gates, state machine properly defined |
| F3 | Creator Dependencies | FAIL | MEDIUM | 5/6 creators lack `dependencies: [research-synthesis]` in frontmatter |
| F4 | Trigger Detection | FAIL | CRITICAL | Router routes capability gaps to agent-creator, bypassing EVOLVE entirely |
| F5 | Companion Check | PASS | -- | Fully functional with populated companionMatrix (9 types) |
| F6 | Post-Creation Integration | PASS | -- | Comprehensive implementation with auto-spawn and timeout budgeting |
| F7 | Artifact Integrator | PARTIAL | LOW | No native integration-queue.jsonl awareness; relies on spawn prompt context |
| F8 | End-to-End Flow | FAIL | CRITICAL | Chain broken at router level; research enforcement missing 3 artifact path types |

---

## Remediation Priority

### P0 (Critical - blocks evolution from working)
1. **F4:** Update router-decision.md to route "no matching agent" to evolution-orchestrator instead of agent-creator
2. **F4:** Add evolution/capability-gap keywords to routing table

### P1 (High - reduces enforcement coverage)
3. **F8:** Add `.claude/hooks/`, `.claude/templates/`, `.claude/schemas/` to research-enforcement.cjs ARTIFACT_PATH_PATTERNS
4. **F1:** Add missing 4 creator skills to evolution-orchestrator frontmatter

### P2 (Medium - metadata correctness)
5. **F3:** Add `dependencies: [research-synthesis]` to 5 remaining creator skill frontmatter files
6. **F7:** Add integration-queue.jsonl processing instructions to artifact-integrator agent definition

---

## Verified Components (Healthy)

- `evolution-state-guard.cjs` -- Valid state machine transition enforcement, proper exit codes, fail-open on errors
- `quality-gate-validator.cjs` -- Placeholder detection, Memory Protocol checks, Task Progress Protocol validation
- `evolution-state.json` -- Populated with real evolution history (2 entries, last: 2026-03-01)
- `ecosystem-impact-graph.json` -- companionMatrix populated with all 9 artifact types
- `companion-check.cjs` -- 461 lines, 5 check strategies, functional
- `post-creation-integration.cjs` -- 601 lines, comprehensive PostToolUse hook
- `evolution-workflow.md` -- Complete 6-phase workflow with Mermaid diagrams

---

*End of Evolution System Audit Report*
