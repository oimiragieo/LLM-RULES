---
name: recommend-evolution
description: Detect capability gaps and record standardized evolution recommendations.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Skill]
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Recommend Evolution

## Overview

Recommend ecosystem evolution when repeated evidence indicates missing capability, and record the recommendation in a standard machine-readable format.

## When to Use

- Reflection identifies recurring delivery failures with the same root cause
- Router/analysis signals no suitable agent or skill for recurring requests
- Repeated integration gaps imply missing artifact type or policy
- User explicitly requests a new capability path

## Iron Laws

1. **NEVER** spawn evolution-orchestrator directly from this skill — this skill records recommendations only; execution decisions belong to the orchestrator and approval pipeline.
2. **ALWAYS** validate trigger type against defined thresholds before recording a recommendation — vague observations are not triggers; require concrete failure counts or routing misses.
3. **NEVER** create a new evolution request when artifact-integrator or skill-updater would address the gap — reserve evolution for net-new capabilities, not integration or update gaps.
4. **ALWAYS** append the recommendation to the JSONL queue AND include the required report block in the current output — dual recording ensures the recommendation is discoverable at both runtime and review time.
5. **NEVER** proceed with a recommendation without evidence — single failures are noise; trigger thresholds exist for a reason.

<identity>
Evolution recommendation skill for reflection/planning agents.
</identity>

<capabilities>
- Trigger classification (`repeated_error`, `no_agent`, `integration_gap`, `user_request`, `rubric_regression`, `stale_skill`, `other`)
- Recommendation-vs-integration decision branching
- Dual recording mode: JSONL runtime queue + reflection report block
</capabilities>

## Trigger Taxonomy Note

`recommend-evolution` uses a **cause-oriented trigger taxonomy** (`repeated_error`, `no_agent`, `integration_gap`, `user_request`, `rubric_regression`, `stale_skill`, `other`).

This intentionally differs from `skill-updater`, which uses a **caller-oriented trigger taxonomy** (`reflection`, `evolve`, `manual`, `stale_skill`) to describe who/what initiated the update path.

<instructions>
<execution_process>

### Step 0: Validate Trigger Type

Use these thresholds:

- `repeated_error`: same class of failure in 5+ tasks
- `rubric_regression`: repeated score drop below threshold for same class of task
- `no_agent`: recurring need with no valid routing match
- `integration_gap`: existing artifact integration missing (prefer artifact-integrator)
- `user_request`: explicit request for capability not available
- `stale_skill`: audit pipeline reports verified artifact older than 6 months or invalid `lastVerifiedAt`

### Step 1: Decide Recommendation Path

- If gap is integration of existing artifact, prefer:
  `Skill({ skill: 'artifact-integrator' })`
- If gap is stale/underperforming existing skill, prefer:
  `Skill({ skill: 'skill-updater' })`
- If gap requires net-new capability/artifact, continue with evolution recommendation
- If no artifact change needed, update memory only and exit

### Step 2: Create Standard Recommendation Payload

Build one JSON object with required fields:

```json
{
  "timestamp": "2026-02-14T00:00:00.000Z",
  "source": "reflection-agent",
  "trigger": "repeated_error",
  "evidence": "Same routing failure observed in 6 tasks over 2 days.",
  "suggestedArtifactType": "skill",
  "summary": "Create a new routing-context skill for reflection-time grounding.",
  "status": "proposed"
}
```

Schema reference:
`.claude/schemas/evolution-request.schema.json`

### Step 3: Record Recommendation

1. Append JSON line to:
   `.claude/context/runtime/evolution-requests.jsonl`
2. Add required report block:

```markdown
## Evolution Recommendation

- Trigger: <trigger>
- Evidence: <evidence>
- Suggested Artifact Type: <type|null>
- Summary: <1-2 sentences>
- Queue Record: `.claude/context/runtime/evolution-requests.jsonl`
```

### Step 3: Output

Return recommendation summary and what was recorded.

</execution_process>
</instructions>

<examples>
<usage_example>
**Example Invocations**:

```javascript
// Repeated failure pattern -> recommend skill creation
Skill({
  skill: 'recommend-evolution',
  args: '--trigger repeated_error --suggestedArtifactType skill',
});

// Routing miss -> recommend new agent/workflow discussion
Skill({ skill: 'recommend-evolution', args: '--trigger no_agent --suggestedArtifactType agent' });
```

</usage_example>
</examples>

## Anti-Patterns

| Anti-Pattern                                                                     | Why It Fails                                                                               | Correct Approach                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Spawning evolution-orchestrator directly from this skill                         | Violates single-responsibility; bypasses approval and resource gates                       | Record recommendation to JSONL queue only; let the orchestrator decide on execution                |
| Recording an evolution request for an integration gap that already has artifacts | Creates unnecessary new artifacts when an integration fix would suffice                    | Check artifact-integrator path first; escalate only if gap requires net-new capability             |
| Submitting a recommendation without trigger evidence                             | Uninformed evolution wastes resources and pollutes the queue with noise                    | Require concrete evidence: failure counts, routing miss logs, or explicit user request             |
| Routing stale-skill triggers through this skill instead of skill-updater         | Wrong escalation path; creates evolution requests for work that belongs in an update cycle | Route stale_skill triggers directly to skill-updater; only escalate if the skill cannot be updated |
| Triggering evolution after a single failure instance                             | Single failures are noise; premature evolution wastes build capacity                       | Apply defined thresholds: 5+ repeated errors, consistent routing misses across sessions            |

## Memory Protocol (MANDATORY)

**Before starting:**

Read `.claude/context/memory/learnings.md` using `Read` or Node `fs.readFileSync` (cross-platform).

**After completing:**

- Recommendation pattern -> `.claude/context/memory/learnings.md`
- Ambiguous trigger logic -> `.claude/context/memory/issues.md`
- Evolution policy decision -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
