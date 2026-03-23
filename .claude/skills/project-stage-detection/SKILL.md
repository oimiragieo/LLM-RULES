---
name: project-stage-detection
description: 'Detect project maturity stage (new/early/mid/mature) from file structure and route to appropriate onboarding workflow'
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Glob, Grep]
agents: [planner, architect, developer, master-orchestrator]
category: 'Validation & Quality'
tags: [project-health, onboarding, maturity, detection, routing]
---

# Project Stage Detection

## Purpose

Detect the maturity stage of a software project by analyzing its file structure, configuration files, documentation, and test coverage. Route to the appropriate onboarding or initialization workflow based on the detected stage.

## When to Invoke

```javascript
Skill({ skill: 'project-stage-detection' });
```

Invoke when:

- Starting work on an unfamiliar repository
- Onboarding a new project into agent-studio
- Determining which workflow to apply (bootstrap vs. enhance vs. optimize)
- Assessing project health at session start
- The planner needs context about project maturity before decomposing tasks

## Stage Definitions

| Stage    | Description                                         | Indicators                           |
| -------- | --------------------------------------------------- | ------------------------------------ |
| `new`    | Freshly initialized, no meaningful content          | Only boilerplate files, no src/      |
| `early`  | Has core structure but missing key components       | src/ exists, no tests or CI          |
| `mid`    | Functional codebase, gaps in quality infrastructure | Tests exist, no CI/CD or sparse docs |
| `mature` | Full-featured with CI/CD, tests, docs, linting      | All quality gates present            |

## Workflow

### Step 1: Collect File Structure Evidence

**Command:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs --dir <project_root>
```

**Expected output:** JSON with `stage`, `confidence`, `indicators`, and `recommendations`.

**Verify:** Exit code 0 and valid JSON with a `stage` field.

### Step 2: Evaluate Stage Indicators

The script checks for these indicators, scoring each:

| Indicator                     | Weight | Checked Path(s)                          |
| ----------------------------- | ------ | ---------------------------------------- |
| Source directory exists       | HIGH   | `src/`, `lib/`, `app/`                   |
| Tests exist                   | HIGH   | `tests/`, `test/`, `spec/`, `__tests__/` |
| CI/CD pipeline configured     | HIGH   | `.github/workflows/`, `.gitlab-ci.yml`   |
| Package.json / pyproject.toml | MED    | `package.json`, `pyproject.toml`         |
| README exists and non-trivial | MED    | `README.md` (>500 bytes)                 |
| Linting configured            | MED    | `.eslintrc*`, `.ruff.toml`, `pylintrc`   |
| Documentation directory       | LOW    | `docs/`, `.claude/docs/`                 |
| Changelog present             | LOW    | `CHANGELOG.md`, `CHANGELOG.rst`          |
| Dependencies locked           | LOW    | `package-lock.json`, `pnpm-lock.yaml`    |

### Step 3: Compute Stage Score

| Score Range | Stage    |
| ----------- | -------- |
| 0–2         | `new`    |
| 3–5         | `early`  |
| 6–7         | `mid`    |
| 8–9         | `mature` |

**Command to verify score:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs --dir . --json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d);console.log('Stage:',r.stage,'Score:',r.score,'Confidence:',r.confidence)"
```

### Step 4: Route to Appropriate Workflow

Based on the detected stage:

| Stage    | Recommended Action                                    |
| -------- | ----------------------------------------------------- |
| `new`    | Invoke `project-onboarding` skill to bootstrap        |
| `early`  | Invoke `gap-detection` to find missing infrastructure |
| `mid`    | Invoke `gap-detection` then `proactive-audit`         |
| `mature` | Invoke `gap-detection` as health check only           |

**Routing command:**

```javascript
// After detection
if (result.stage === 'new') {
  Skill({ skill: 'project-onboarding' });
} else {
  Skill({ skill: 'gap-detection' });
}
```

### Step 5: Write Detection Report

**Output location:** `.claude/context/reports/backend/project-stage-report-YYYY-MM-DD.md`

**Report format:**

```markdown
# Project Stage Detection Report

**Date:** {{date}}
**Project:** {{project_root}}
**Detected Stage:** {{stage}}
**Confidence:** {{confidence}}%

## Evidence

{{indicators_table}}

## Recommendations

{{recommendations_list}}
```

## Output Schema

See `schemas/output.schema.json` for the full structured output contract.

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Assigned Agents

- `planner` — uses on task start to calibrate workflow complexity
- `architect` — uses for brownfield assessment before redesign
- `developer` — uses to determine onboarding steps for new repos
- `master-orchestrator` — uses to route to correct initialization workflow

## Memory Protocol

**Before starting:**

Read `.claude/context/memory/learnings.md` for any previously detected stage for this project. If the stage was recently detected (within 7 days), skip re-detection and use cached result.

**After completing:**

Append to `.claude/context/memory/learnings.md`:

```markdown
## Project Stage Detection — {{date}}

- Project: {{project_root}}
- Stage: {{stage}} (confidence: {{confidence}}%)
- Key gaps: {{gap_summary}}
- Recommended next action: {{next_action}}
```

## Anti-Patterns

- Never hard-code stage thresholds — always compute from indicators.
- Never report `mature` for a project with no tests — tests are a required `mature` indicator.
- Never run detection on `.claude/` subdirectories — scan the project root only.
- Never block on missing files — handle gracefully with `existsSync` checks.
