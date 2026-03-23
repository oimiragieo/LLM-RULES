# project-stage-detection Implementation Template

Use this template when integrating project-stage-detection into an agent workflow.

## Standard Invocation

```javascript
Skill({ skill: 'project-stage-detection' });
```

## CLI Invocation

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs \
  --dir {{project_root}} \
  --json
```

Replace `{{project_root}}` with the absolute path to the project directory being analyzed.

## Output Parsing (Node.js)

```javascript
const { execFileSync } = require('child_process');
const path = require('path');

function detectProjectStage(projectRoot) {
  const scriptPath = path.resolve(
    __dirname,
    '../../../../skills/project-stage-detection/scripts/main.cjs'
  );
  const output = execFileSync('node', [scriptPath, '--dir', projectRoot, '--json'], {
    encoding: 'utf8',
    shell: false,
  });
  return JSON.parse(output);
}

const result = detectProjectStage('{{project_root}}');
// result.stage     => "new" | "early" | "mid" | "mature"
// result.score     => 0-12
// result.confidence => 0-100
// result.missingIndicators => string[]
// result.recommendations   => string[]
```

## Stage-Based Routing Template

After detection, route to the appropriate downstream skill:

```javascript
const result = detectProjectStage('{{project_root}}');

switch (result.stage) {
  case 'new':
    // Route to onboarding
    Skill({ skill: 'project-onboarding' });
    break;
  case 'early':
    // Route to gap-detection then onboarding
    Skill({ skill: 'gap-detection' });
    break;
  case 'mid':
    // Route to proactive-audit
    Skill({ skill: 'proactive-audit' });
    break;
  case 'mature':
    // Route to gap-detection for continuous improvement
    Skill({ skill: 'gap-detection' });
    Skill({ skill: 'proactive-audit' });
    break;
}
```

## Pre-Task Integration (Planner Pattern)

Include this block at the top of any planning task that operates on an unfamiliar repository:

````markdown
### Step 0: Detect Project Stage

Before decomposing tasks, detect the project's current maturity stage:

**Command:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs \
  --dir {{project_root}} --json
```
````

**Expected output:** JSON with `stage`, `score`, `confidence`, `missingIndicators`, `recommendations`.

**Verify:** Exit code 0 and valid JSON with `stage` field in ["new","early","mid","mature"].

**Use result to:**

- Adjust task granularity (new/early = more scaffolding tasks, mature = refinement tasks)
- Flag missing infrastructure (`missingIndicators`) as prerequisite tasks
- Include `recommendations` as advisory items in the plan output

```

## Agent Spawn Prompt Snippet

When spawning a subagent that should be aware of project stage:

```

Before beginning your task, run project stage detection:

node .claude/skills/project-stage-detection/scripts/main.cjs \
 --dir {{project_root}} --json

Parse the result. If stage is "new" or "early", assume minimal existing infrastructure
and plan accordingly. If stage is "mid" or "mature", assume CI/CD, tests, and source
structure exist — verify before adding them.

````

## Caching Pattern

To avoid re-detection within the same session, store the result in the task metadata:

```javascript
// After detection, store in task metadata
TaskUpdate({
  taskId: '{{task_id}}',
  status: 'in_progress',
  metadata: {
    projectStage: result.stage,
    projectStageScore: result.score,
    projectStageConfidence: result.confidence,
    projectStageMissingIndicators: result.missingIndicators,
  },
});

// In subsequent spawned agents, read from task metadata
const task = TaskGet({ taskId: '{{task_id}}' });
const { projectStage } = task.metadata;
````

## Recommendations Display Template

When surfacing results to the user:

```markdown
## Project Stage Detection Results

**Stage:** {{stage}} (Score: {{score}}/{{maxScore}}, Confidence: {{confidence}}%)

**Missing Indicators:**
{{#each missingIndicators}}

- {{this}}
  {{/each}}

**Recommendations:**
{{#each recommendations}}

- {{this}}
  {{/each}}
```

## Anti-Patterns

- Do NOT run detection inside a loop — call once and cache the result.
- Do NOT pass a path that includes `.claude/` as the project root — this scans agent infrastructure, not project code.
- Do NOT use `stageOverride` in production workflows — it bypasses evidence-based detection.
- Do NOT make routing decisions based solely on `confidence < 50` results — prompt for user confirmation instead.
