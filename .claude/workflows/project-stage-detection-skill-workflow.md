# project-stage-detection Skill Workflow

## Overview

This workflow describes how to invoke `project-stage-detection`, parse its output, and route to the appropriate downstream skill based on the detected stage.

## When to Invoke

- Before planning tasks on any unfamiliar repository
- On session start when working with a new codebase
- Before spawning agents on a project that hasn't been analyzed this session
- When the `planner` needs maturity context to scope work correctly
- After `artifact-integrator` onboards an external repository

## Invocation

```javascript
Skill({ skill: 'project-stage-detection' });
```

Or via CLI:

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs \
  --dir /path/to/project --json
```

## Phase 1: Detection

**Command:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs \
  --dir {{project_root}} --json
```

**Expected output:** Valid JSON on stdout with fields: `stage`, `score`, `maxScore`, `confidence`, `projectRoot`, `indicators`, `missingIndicators`, `recommendations`, `timestamp`.

**Verify:** Exit code 0 and JSON contains `stage` in `["new", "early", "mid", "mature"]`.

## Phase 2: Parse Result

```javascript
const result = JSON.parse(output);
const { stage, score, confidence, missingIndicators, recommendations } = result;
```

**Confidence interpretation:**
| Confidence | Meaning |
|-----------|---------|
| 0-25% | Very few indicators present; result is a weak signal |
| 26-50% | Partial signals; result is provisional |
| 51-75% | Moderate confidence; result is likely accurate |
| 76-100% | Strong signal; result is reliable |

If `confidence < 30`, surface the result as advisory (not deterministic) and ask the user to confirm.

## Phase 3: Stage-Based Routing

Based on `result.stage`:

### Stage: `new`

```
Project has no meaningful structure yet.
→ Invoke: project-onboarding
→ Goal: scaffold project structure and key files
→ Skip: gap-detection, proactive-audit (nothing to audit yet)
```

### Stage: `early`

```
Project has core structure but is missing infrastructure.
→ Invoke: gap-detection (to find what's missing)
→ Invoke: project-onboarding (to fill the gaps)
→ missingIndicators will point to the specific gaps
```

### Stage: `mid`

```
Functional codebase with quality gaps.
→ Invoke: gap-detection (surface specific gaps)
→ Invoke: proactive-audit (deeper health check)
→ Include recommendations in planning context
```

### Stage: `mature`

```
Full quality infrastructure in place.
→ Proceed directly with the requested task
→ Optionally invoke: proactive-audit for continuous improvement
→ No scaffolding or onboarding needed
```

## Phase 4: Routing Decision Tree

```
result.stage == "new"
  └─ → project-onboarding

result.stage == "early"
  └─ → gap-detection
       └─ → project-onboarding (if critical gaps found)

result.stage == "mid"
  └─ → gap-detection
       └─ proceed with task (high-sev gaps → fix first)
       └─ proactive-audit (parallel, advisory)

result.stage == "mature"
  └─ proceed with task
  └─ proactive-audit (optional, background)
```

## Phase 5: Planner Integration

When spawning a planner for a HIGH/EPIC task, include the stage detection result in the prompt:

```
Project stage: {{stage}} (Score: {{score}}/{{maxScore}}, Confidence: {{confidence}}%)

Missing indicators:
{{missingIndicators}}

Recommendations from stage detection:
{{recommendations}}

Adjust task complexity and scaffolding assumptions accordingly.
```

## Phase 6: Cache Result

Store in task metadata to avoid redundant re-detection:

```javascript
TaskUpdate({
  taskId: '{{task_id}}',
  status: 'in_progress',
  metadata: {
    projectStage: result.stage,
    projectStageScore: result.score,
    projectStageConfidence: result.confidence,
    projectStageMissingIndicators: result.missingIndicators,
    projectStageDetectedAt: result.timestamp,
  },
});
```

Downstream agents can read this via `TaskGet({ taskId: '{{task_id}}' })`.

## Output Artifacts

No persistent files created. Output is JSON on stdout.

For caching, the result should be stored in task metadata (see Phase 6) or appended to `.claude/context/memory/learnings.md` with the cache key `${projectRoot}-${datestamp}`.

## Error Handling

| Error                               | Behavior                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| Directory does not exist            | Exit code 1; surface error to user                                 |
| Directory is not readable           | Exit code 1; surface error to user                                 |
| Empty directory                     | Returns `stage: "new"` with score 0                                |
| `.claude/` directory passed as root | Will detect `.claude/` infrastructure as project code — avoid this |

## Related Skills

- `gap-detection` — Recommended follow-up for `early` and `mid` stages
- `project-onboarding` — Primary downstream for `new` stage projects
- `proactive-audit` — Recommended for `mid` and `mature` stage projects
- `team-orchestration` — Should invoke this skill before Phase 1 (Plan)
- `plan-generator` — Planner should run this before decomposing tasks
