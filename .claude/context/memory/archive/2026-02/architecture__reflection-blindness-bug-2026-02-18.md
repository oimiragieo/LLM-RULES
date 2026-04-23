<!-- Agent: architect | Task: #10 | Session: 2026-02-18 -->

# Reflection Agent Blindness Bug: Score Fabrication on Missing Metadata

**Date:** 2026-02-18
**Severity:** P1 - Architecture Defect
**Status:** Confirmed
**Reported By:** Architect Agent (task-10)

---

## Executive Summary

The reflection-agent assigned a passing score of **0.79/1.0** to a fully orphaned skill
(`gemini-cli-security`) that had 9/9 integration checks FAILED and was completely invisible
to the framework. The agent received only:

```
"Task 2 completed without summary metadata"
```

Rather than flagging this as insufficient data, reflection fabricated a plausible success
narrative and awarded a PASS score. This is a systemic failure, not an isolated occurrence:
the missing metadata pattern has occurred 14+ times.

---

## 1. Reflection Agent Workflow Analysis

### 1.1 What the Workflow Specifies (Phase 1.4 Gate Conditions)

The reflection workflow (`reflection-workflow.md`, Phase 1, Section 1.4) defines these gate
conditions before proceeding to scoring:

```
- [ ] Task exists and has completed status
- [ ] Task has summary in metadata
- [ ] Task not already reflected (check reflection-log.jsonl)
- [ ] No active reflection in progress
```

The second gate — **"Task has summary in metadata"** — is a DOCUMENTED pre-condition for
proceeding to quality scoring. If the reflection agent followed this gate strictly, it would
have halted before scoring when it received the fallback string "Task 2 completed without
summary metadata."

### 1.2 What the Workflow Produces Instead

The reflection agent's workflow phases (Steps 1-8 in the agent definition) specify:

1. Acknowledge the task
2. Read task metadata, memory files, output artifacts
3. Analyze what was done
4. Score using rubrics
5. Generate RBT diagnosis
6. Extract patterns
7. Document memory updates
8. Report findings

The agent is designed to gather data from `metadata.filesModified`, `metadata.summary`,
and actual artifact files on disk. When `metadata.summary` is the fallback string, the
agent receives **one sentence of context** describing a failure, not a description of work.

### 1.3 What the Agent Did in Practice

Given only `"Task 2 completed without summary metadata"`, the agent:

1. Had no `filesModified` list to inspect
2. Had no artifacts to verify on disk
3. Had no description of what integration checks were performed
4. Had no way to know that 9/9 checks FAILED

Yet it proceeded to Phase 3 (quality scoring) and awarded 0.79/1.0. This means the agent
interpolated — it fabricated a plausible narrative based on the general task context
(skill creation), scoring it against rubric checkpoints it could not actually verify.

---

## 2. Root Cause Analysis: The Four Failure Layers

### Layer 1: Prompt Design Failure (Primary Cause)

**Finding:** The reflection agent's rubric scoring process does not have a mandatory
"data sufficiency gate" before scoring begins. The reflection workflow (Phase 1.4) lists
"Task has summary in metadata" as a gate condition, but this is expressed as a checkbox
in documentation — not enforced as code. The agent prompt says nothing like:
"If you receive only the fallback string 'Task X completed without summary metadata',
you MUST NOT produce a quality score. Return INSUFFICIENT_DATA instead."

The agent is designed to "evaluate objectively without bias toward passing outputs"
(reflection-agent.md, Behavioral Traits), but it is given **no explicit instruction** on
what to do when the evidence base is empty. Absent such instruction, LLMs default to
producing plausible-sounding output — which is exactly what happened.

**Impact:** Every time an agent omits TaskUpdate metadata, reflection silently produces
a fabricated score. The system does not distinguish between a well-evidenced assessment
and a hallucinated one.

### Layer 2: Verification Gap (Critical Contributing Cause)

**Finding:** For creation tasks, the reflection workflow specifies an Integration Health
Check (Phase 5.5, Step 4.5 in agent definition). This step requires:

1. Read artifact-graph.json
2. Call `quickIntegrationCheck()` for the artifact
3. Score integration (0-100%)
4. Classify score into RBT

This is listed as conditional on `isCreatorTask(task)`, which requires the task metadata
to identify it as a creator task. Without summary metadata, the task type is unknown.
More critically, even if the integration check ran, the check uses `artifact-graph.json`
— the same graph that showed the skill as unregistered. The integration check SHOULD
have returned 0% and triggered a "Critical Thorn."

**Why it did not run:** The agent had no `filesModified` list, no artifact ID, and no
way to identify which artifact to check. The integration health check was silently skipped.

**Impact:** The one mechanism designed to catch integration failures (ADR-100 Phase 5.5)
was bypassed precisely because the metadata was missing.

### Layer 3: Data Access Failure (Structural Cause)

**Finding:** The reflection agent receives its entire task context through what was passed
in the reflection queue entry. Looking at the actual code in `unified-reflection-events.cjs`
(lines 96-110):

```javascript
const entry = {
  taskId: update.taskId,
  trigger: 'task_completion',
  timestamp: new Date().toISOString(),
  priority: 'high',
};

if (toolInput.metadata && toolInput.metadata.summary) {
  entry.summary = toolInput.metadata.summary;
} else {
  const fallbackTaskId = update.taskId || 'unknown';
  entry.summary = `Task ${fallbackTaskId} completed without summary metadata`;
}
```

The queue entry contains ONLY: `taskId`, `trigger`, `timestamp`, `priority`, and
`summary`. It does NOT include:

- `filesModified` — the list of created/modified artifacts
- `outputArtifacts` — paths to report files
- `agent` — which agent produced the output
- `artifactType` — what kind of artifact was created

When the reflection agent receives this queue entry and calls `TaskGet({ taskId: "2" })`,
it may get slightly more data — but if artifact-integrator never provided summary metadata,
then `TaskGet` also returns minimal information. The reflection agent is structurally
dependent on the upstream agent behaving correctly.

**Impact:** The reflection system's data pipeline is a single-point-of-failure chain.
If any agent in the chain omits metadata, reflection cannot compensate.

### Layer 4: Metadata Dependency Failure (Enforcement Gap)

**Finding:** The TaskUpdate metadata contract is documented in TASK_TRACKING_GUIDE.md,
included in spawn prompts via the 70-line warning box, and referred to as Iron Law in
CLAUDE.md Section 5.5. Despite this, the missing metadata pattern has occurred 14+ times.

The reason is that there is **no enforcement hook** that blocks a TaskUpdate(completed)
call without summary metadata. The pre-completion-validation.cjs hook validates that
"work before marking complete" — but it does not enforce that `metadata.summary` must
be present. The routing-guard.cjs does not check metadata content. No hook does.

The enforcement is entirely documentation-based and relies on agent compliance, which
is demonstrably unreliable.

**Impact:** The 14+ occurrence pattern will continue indefinitely until a blocking hook
enforces the metadata contract at the TaskUpdate callsite.

---

## 3. What Independent Verification Would Have Looked Like

For `gemini-cli-security` (a skill-creation task), correct reflection behavior would have
been:

```
Phase 2 (Output Collection):
1. TaskGet({ taskId: "2" }) → metadata.summary is absent
   → GATE FAILURE: Task has no summary metadata
   → ACTION: Flag as INSUFFICIENT_DATA, do not score
   → OR (alternative): Attempt independent verification

Independent verification (for skill creation):
2. Read .claude/context/artifacts/catalogs/skill-catalog.md
   → Is "gemini-cli-security" listed? If not: FAIL
3. Check .claude/context/agent-registry.json
   → Is skill assigned to any agent? If not: FAIL
4. Check .claude/skills/gemini-cli-security/SKILL.md exists
   → File does not exist or is unregistered? FAIL
5. Check integration-queue.jsonl
   → Are there unprocessed integration entries? If yes: PASS still pending
6. Read artifact-graph.json
   → Integration score for this skill? 0% → CRITICAL THORN

Resulting score: NOT SCOREABLE (insufficient data)
Or if scored independently: ~0.05/1.0 (CRITICAL FAIL)
RBT:
  Thorns: [
    "No summary metadata provided by producing agent",
    "Skill not in skill-catalog.md",
    "No agent assignment in agent-registry.json",
    "SKILL.md not registered in framework",
    "Integration score: 0% (9/9 checks failed)"
  ]
```

The current agent does NONE of this. It does not read catalogs, does not check registries,
and does not verify artifact existence independently. It trusts the metadata it receives.

---

## 4. Proposed Fixes

### Fix A: Blocking Hook — Enforce TaskUpdate Metadata (P0, Immediate)

**Problem:** No enforcement exists for `metadata.summary` on TaskUpdate(completed).
**Solution:** Add a `PreToolUse(TaskUpdate)` check in `pre-completion-validation.cjs`
that blocks completion when metadata.summary is absent.

```javascript
// In pre-completion-validation.cjs (PreToolUse TaskUpdate)
if (params.status === 'completed') {
  if (!params.metadata || !params.metadata.summary) {
    return {
      allow: false,
      message:
        '[BLOCKED] TaskUpdate(completed) requires metadata.summary. ' +
        'Add: metadata: { summary: "one-line description of what was done", ' +
        'filesModified: [...] }',
    };
  }
}
```

**Impact:** Addresses the recurring #14+ pattern at the source. No reflection changes
needed — the data will exist before reflection runs.

**Risk:** Some agents (or spawning patterns) may not include summary. Mitigation: run in
`warn` mode first, escalate to `block` after one session of baseline measurement.

**Enforcement variable:** `TASKUPDATE_METADATA_ENFORCEMENT=block|warn|off` (default: warn)

### Fix B: Reflection Agent — INSUFFICIENT_DATA Gate (P1, Short-Term)

**Problem:** Reflection proceeds to scoring with empty evidence.
**Solution:** Add an explicit data sufficiency check at the start of Phase 2.

In the reflection agent definition, add after Step 1 (Reflect/Data Ingestion):

```
DATA SUFFICIENCY GATE (MANDATORY - before scoring):
- If task metadata.summary is absent OR equals the fallback string
  "Task X completed without summary metadata":
  → DO NOT score the task
  → Return: { score: null, status: "INSUFFICIENT_DATA",
              reason: "No summary metadata provided by producing agent" }
  → Record in reflection-log.jsonl with status: "insufficient_data"
  → Append to issues.md: recurring metadata omission by [agent]
  → STOP — do not proceed to rubric evaluation
```

This means reflection acknowledges it CANNOT evaluate what it CANNOT see.

### Fix C: Reflection Agent — Independent Artifact Verification for Creation Tasks (P1)

**Problem:** Reflection does not independently verify artifacts when metadata is absent.
**Solution:** For creation tasks (detected from task subject/trigger), add mandatory
artifact verification steps in Phase 5.5 (Integration Health Check) that run even without
metadata:

```
For skill creation tasks (subject contains "skill", "create", "gemini", etc.):
1. Search skill-catalog.md for artifact name
2. Check agent-registry.json for skill assignment
3. Check SKILL.md file existence at expected path
4. Check artifact-graph.json integration score
5. Check integration-queue.jsonl for pending entries

If ANY check fails AND no summary metadata exists:
→ Score: 0.0 (CRITICAL FAIL)
→ Thorn: "Artifact verification failed: [list failed checks]"
→ Thorn: "No summary metadata to cross-validate findings"
```

This transforms reflection from a passive metadata consumer to an active verifier.

### Fix D: Reflection Queue — Enrich Entry with Task Data (P2, Structural)

**Problem:** The reflection queue entry contains only: taskId, trigger, timestamp, priority, summary.
**Solution:** Enrich the queue entry in `unified-reflection-events.cjs` with all available
task metadata at queue time:

```javascript
// In handleTaskCompletion():
const entry = {
  taskId: update.taskId,
  trigger: 'task_completion',
  timestamp: new Date().toISOString(),
  priority: 'high',
  // Enrich with available metadata
  agent: toolInput.metadata?.agent || null,
  artifactType: toolInput.metadata?.artifactType || null,
  filesModified: toolInput.metadata?.filesModified || [],
  outputArtifacts: toolInput.metadata?.outputArtifacts || [],
  hasSummary: !!toolInput.metadata?.summary,
};
```

This allows the reflection agent to immediately know what was produced and whether
metadata was provided, without a secondary TaskGet call.

### Fix E: Reflection Log — Flag Insufficient-Data Scores (P2)

**Problem:** The reflection-log.jsonl currently has no way to distinguish evidenced
scores from fabricated scores.
**Solution:** Add a `dataQuality` field to reflection log entries:

```json
{
  "taskId": "2",
  "dataQuality": "insufficient",
  "score": null,
  "status": "INSUFFICIENT_DATA",
  "reason": "No summary metadata from producing agent"
}
```

vs:

```json
{
  "taskId": "42",
  "dataQuality": "full",
  "overallScore": 0.83,
  "status": "pass"
}
```

This enables monitoring: "what % of reflections run with insufficient data?"

---

## 5. Priority Matrix

| Fix | Description                                | Priority | Effort                          | Impact                                     |
| --- | ------------------------------------------ | -------- | ------------------------------- | ------------------------------------------ |
| A   | Blocking hook on TaskUpdate metadata       | P0       | Low (1 hook edit)               | Eliminates source of problem               |
| B   | INSUFFICIENT_DATA gate in reflection agent | P1       | Low (agent prompt edit)         | Prevents fabricated scores                 |
| C   | Independent artifact verification          | P1       | Medium (new verification steps) | Catches integration failures independently |
| D   | Enrich reflection queue entries            | P2       | Low (event handler edit)        | Better data for reflection                 |
| E   | dataQuality field in reflection log        | P2       | Low (schema change)             | Enables monitoring                         |

---

## 6. Architectural Assessment

### BACKWARD_PROPAGATION

**Pattern:** Reflection agent produces confident quality scores with zero evidence when
upstream agents omit TaskUpdate metadata. This pattern applies wherever reflection is
used as a quality gate for artifact creation tasks.

**Proposed Artifact:** `hook:pre-completion-metadata-validator`
**Affected Components:** [reflection-agent, artifact-integrator, developer, qa, planner,
code-reviewer, code-simplifier, architect, devops, technical-writer]
**Architectural Rationale:** The quality gate function of the reflection system is
entirely dependent on metadata that downstream agents are not enforcing. Standardizing
the enforcement at the TaskUpdate boundary eliminates the dependency across all 10+
affected agents and prevents reflection fabrication system-wide.
**Impact Radius:** 10+ agents + reflection system + quality gate integrity
**Priority:** P1 (critical architectural consistency)

---

## 7. Root Cause Summary (5 Bullets)

1. **No data sufficiency gate:** Reflection proceeds to rubric scoring even when it receives
   only the fallback string "Task X completed without summary metadata" — there is no
   checkpoint that says "stop, insufficient data."

2. **No enforcement hook:** TaskUpdate(completed) can be called without `metadata.summary`
   — the pre-completion-validation.cjs hook does not check for this field, allowing the
   recurring #14+ omission pattern to continue unblocked.

3. **Verification is passive, not active:** The reflection agent relies entirely on
   metadata provided by the producing agent; it does not independently verify artifact
   existence in catalogs, registries, or the filesystem for creation tasks.

4. **Integration health check bypassed:** The ADR-100 integration health check (Phase 5.5)
   requires an artifact ID from task metadata — without metadata, it silently skips,
   leaving integration failures undetected.

5. **LLM interpolation fills evidence gaps:** When evidence is absent, the LLM producing
   the reflection report generates a plausible narrative rather than reporting
   "INSUFFICIENT_DATA" — a predictable failure mode that requires explicit prompt-level
   countermeasures, not just documented expectations.

---

## 8. Recommended Implementation Order

1. **Immediately:** Add Fix A (blocking hook, warn mode) to `pre-completion-validation.cjs`
2. **Same session:** Add Fix B (INSUFFICIENT_DATA gate) to `reflection-agent.md` prompt
3. **Next session:** Implement Fix C (independent artifact verification) in reflection agent
4. **Backlog:** Fix D (enrich queue entries) and Fix E (dataQuality field in log)

---

_Report generated by: Architect Agent (task-10) | 2026-02-18_
