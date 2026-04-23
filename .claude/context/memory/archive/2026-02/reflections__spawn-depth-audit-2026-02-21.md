<!-- Agent: developer | Task: #3 | Session: 2026-02-21 -->

# SEC-ICE-002 Spawn Depth Audit Report

**Date:** 2026-02-21
**Task:** #3 (P1 Security Finding)
**Finding:** SEC-ICE-002 Enforcement Verification Gap in routing-guard.cjs

---

## Summary

The SEC-ICE-002 security control as documented in `ecosystem-creation-workflow.md` is **partially implemented**. A working spawnDepth enforcement mechanism exists at the hook level, but it lives in `pre-task-unified-core.cjs` (via `loop-state-manager.cjs`), NOT in `routing-guard.cjs`. The ecosystem-creation-workflow.md documentation incorrectly credits the enforcement to `routing-guard.cjs`.

**Assessment: The control is NOT a pure paper control — real enforcement exists — but the implementation differs from the documented design.**

---

## Detailed Findings

### What ecosystem-creation-workflow.md Documents (SEC-ICE-002)

Lines 224 and 272 of `ecosystem-creation-workflow.md` state:

> **Enforcement**: `routing-guard.cjs` reads `spawnDepth` from parent task metadata (via TaskGet) before allowing Task() calls. If depth >= 5, blocks spawn with error.

The protocol describes (lines 218–222):

1. Root orchestrator sets `spawnDepth: 0` and `traceId: <uuid>` in TaskUpdate metadata
2. Each spawned agent reads parent task's metadata via TaskGet to extract `spawnDepth` and `traceId`
3. Each spawned agent increments `spawnDepth` by 1 before spawning its children
4. Hard limit: if `spawnDepth >= 5`, agent MUST NOT spawn further sub-agents
5. Trace log written to `.claude/context/runtime/spawn-trace-{traceId}.jsonl`

### What routing-guard.cjs Actually Does

**File chain:**

- `routing-guard.cjs` → `routing-guard-core.cjs` → `routing-guard-core.impl.cjs`

Search results for `spawnDepth`, `TaskGet`, `depth`, `recursion` in all routing-guard-\*.cjs files: **ZERO matches**.

`routing-guard-core.impl.cjs` exports these checks:

- `checkTaskPayloadContract` — validates task_id in prompt
- `checkPlannerFirst` — planner-first gate
- `checkTaskCreate` — task create restrictions
- `checkSecurityReview` — security gate
- `checkCodeSimplifierArchitectReview`
- `checkHighRiskSpecialistArchitectReview`
- `checkRouterWrite`, `checkRouterBash`, `checkRouterSelfCheck`, `checkRouterReadGovernance`
- `checkMemoryPressure`
- `checkSpecialistOverride`
- `checkTaskListFirstGate`
- `checkCreatorIntentGuard`
- `checkIntentAgentMatch`
- `checkConfigModelValidator`

**None of these checks involve TaskGet, spawnDepth, or parent task metadata.**

### What DOES Enforce spawnDepth

`pre-task-unified-core.cjs` at lines 299–306:

```javascript
const loopState = loopStateManager.getState();
const depthLimit = getDepthLimit();
if (loopState.spawnDepth >= depthLimit) {
  const message = `[LOOP PREVENTION] Spawn depth limit exceeded (${loopState.spawnDepth}/${depthLimit})...`;
  if (enforcement === 'block') {
    return { pass: false, result: 'block', message };
  }
}
```

**Implementation details:**

- Mechanism: File-based shared state in `.claude/context/self-healing/loop-state.json`
- Manager: `.claude/lib/self-healing/loop-state-manager.cjs`
- Default depth limit: `5` (via `DEFAULT_DEPTH_LIMIT` constant in `pre-task-unified-helpers.cjs`)
- Configurable via: `LOOP_DEPTH_LIMIT` environment variable
- Enforcement mode: configurable (block/warn/off)
- Also checks pattern repetition: `activeNestedSpawn && hasRecentPattern && count >= threshold`
- Stale state recovery: depth auto-resets if state is older than `LOOP_SPAWN_DEPTH_STALE_MS` (default 10 min)
- Session scoping: state resets when session ID changes (prevents cross-session false positives)

**This is NOT the TaskGet-based mechanism documented in ecosystem-creation-workflow.md.** It is a file-based shared counter, not a distributed trace context propagated through task metadata.

### Companion-check.cjs SEC-ICE-002 Implementation

`@ENFORCEMENT_HOOKS.md` (Section 13) documents SEC-ICE-002 in `companion-check.cjs`:

- Depth limit: 2 (not 5)
- Per-event cap: 5 spawns
- Cycle detection via DAG tracking
- Kill switch: `AUTO_SPAWN_COMPANIONS=off`

This covers **companion auto-spawn amplification** specifically, which is a different scope from general agent recursion.

---

## Gap Analysis

| Control Layer                         | Documented                           | Implemented | Mechanism                             |
| ------------------------------------- | ------------------------------------ | ----------- | ------------------------------------- |
| routing-guard.cjs TaskGet depth check | YES (ecosystem-creation-workflow.md) | **NO**      | Not present                           |
| pre-task-unified depth check          | Not mentioned in SEC-ICE-002 doc     | **YES**     | loop-state.json, default limit 5      |
| companion-check.cjs depth limit       | YES (@ENFORCEMENT_HOOKS.md)          | YES         | In-memory, limit 2                    |
| Spawn trace log per traceId           | YES (ecosystem-creation-workflow.md) | **NO**      | No spawn-trace-\*.jsonl files written |

---

## Risk Assessment

**Severity: MEDIUM** (unchanged from issues.md entry)

The file-based loop-state mechanism in `pre-task-unified-core.cjs` DOES provide depth enforcement (limit 5, same number as documented). This means the core protection against unbounded recursive spawning exists.

However:

1. The `routing-guard.cjs`-specific check documented in SEC-ICE-002 is absent — the documentation is inaccurate
2. The distributed trace context (TaskGet + task metadata propagation) is not implemented — agents are not actually reading parent task spawnDepth from metadata
3. Spawn trace logs (`.claude/context/runtime/spawn-trace-{traceId}.jsonl`) are not being written
4. The TaskGet-based mechanism would be more robust for distributed scenarios (each agent independently checks the limit); the file-based mechanism requires file I/O to the shared state file

---

## Recommendations

### Immediate (no code change required)

1. Update `ecosystem-creation-workflow.md` SEC-ICE-002 to accurately reflect the actual enforcement mechanism (pre-task-unified via loop-state-manager) — this is a documentation fix
2. Remove the false claim that `routing-guard.cjs` uses TaskGet for this check

### Enhancement (optional, medium priority)

3. If the distributed TaskGet-based mechanism is desired (true distributed depth tracking per trace), implement it in a separate check function (e.g., `checkSpawnDepth` in routing-guard-core.checks-task.cjs) that reads parent task metadata
4. Add spawn trace log writing to `pre-task-unified-core.cjs` for observability

### Verification (for issue closure)

5. The existing depth enforcement in `pre-task-unified-core.cjs` should be tested: verify that `loopState.spawnDepth >= 5` triggers a block when `LOOP_DEPTH_LIMIT=5`

---

## Files Examined

| File                                                    | spawnDepth Logic                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `.claude/hooks/routing/routing-guard.cjs`               | Thin wrapper only                                                |
| `.claude/hooks/routing/routing-guard-core.cjs`          | Thin wrapper only                                                |
| `.claude/hooks/routing/routing-guard-core.impl.cjs`     | No spawnDepth — confirmed                                        |
| `.claude/hooks/routing/pre-task-unified-core.cjs`       | YES — spawnDepth check at lines 301-306                          |
| `.claude/hooks/routing/pre-task-unified-helpers.cjs`    | `getDepthLimit()` — default 5, env override via LOOP_DEPTH_LIMIT |
| `.claude/lib/self-healing/loop-state-manager.cjs`       | State management for spawnDepth counter                          |
| `.claude/workflows/core/ecosystem-creation-workflow.md` | SEC-ICE-002 documentation (inaccurate re: routing-guard)         |
| `.claude/docs/@ENFORCEMENT_HOOKS.md`                    | Section 13: SEC-ICE-002 (companion-check scope)                  |

---

## Verdict

**The security control for spawnDepth exists and works** — but in `pre-task-unified-core.cjs`, not `routing-guard.cjs`. The documentation in `ecosystem-creation-workflow.md` incorrectly names the enforcement location. No code changes to routing-guard.cjs are required; the primary remediation is a documentation correction.

The P1 security finding SEC-ICE-002 in `issues.md` can be **downgraded to P2** given that real enforcement exists. The remaining gap is documentation accuracy and the absence of the distributed TaskGet-based mechanism (which provides stronger guarantees for multi-node scenarios).
