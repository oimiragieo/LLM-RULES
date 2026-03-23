# gap-detection Skill Workflow

## Overview

This workflow describes how to invoke and consume the `gap-detection` skill for scanning a project for missing documentation, undocumented files, and project health issues.

## When to Invoke

- At the start of any session on an unfamiliar codebase
- After receiving a new project to integrate
- As a prerequisite to planning tasks on `early` or `mid` stage projects
- During `proactive-audit` pipeline for `mature` stage projects
- After the `project-stage-detection` skill returns stage `early`

## Invocation

```javascript
Skill({ skill: 'gap-detection' });
```

Or via CLI:

```bash
node .claude/skills/gap-detection/scripts/main.cjs \
  --dir /path/to/project \
  --check all \
  --output-format json
```

## Phase 1: Input Preparation

**Pre-conditions:**

- Target project directory is known and accessible
- `project-stage-detection` has been run (recommended but not required)

**Inputs:**

- `targetDir` — absolute path to the project root (default: cwd)
- `checks` — array of check types: `["docs", "tests", "todos", "coverage"]`

**Validation:**

- Confirm `targetDir` exists with `fs.existsSync(targetDir)`
- Confirm checks array contains valid enum values

## Phase 2: Scan Execution

**Command:**

```bash
node .claude/skills/gap-detection/scripts/main.cjs \
  --dir {{target_dir}} \
  --check all \
  --output-format json
```

**Expected output:** JSON report file written to `.claude/context/tmp/gap-detection-<timestamp>.json`

**Verify:**

```bash
ls .claude/context/tmp/gap-detection-*.json | tail -1
```

## Phase 3: Result Parsing

Parse the JSON report:

```javascript
const fs = require('fs');
const reportFiles = require('child_process')
  .execSync('ls -1t .claude/context/tmp/gap-detection-*.json', { encoding: 'utf8' })
  .trim()
  .split('\n');
const report = JSON.parse(fs.readFileSync(reportFiles[0], 'utf8'));

// Access findings
const { gaps, summary, recommendations } = report;
console.log(`Found ${gaps.length} gaps across ${summary.totalFilesScanned} files`);
```

## Phase 4: Findings Triage

Prioritize findings by severity:

| Severity | Action                                                 |
| -------- | ------------------------------------------------------ |
| HIGH     | Create task immediately; block planning until resolved |
| MEDIUM   | Include as prerequisite task in the plan               |
| LOW      | Add as advisory items; address in polish phase         |

**Decision rule:**

- If `gaps.filter(g => g.severity === 'high').length > 0` → spawn `developer` to address high gaps before continuing
- If only MEDIUM/LOW gaps → include `recommendations` in the plan as advisory items

## Phase 5: Downstream Routing

After gap-detection completes:

| Condition                             | Next Skill                        |
| ------------------------------------- | --------------------------------- |
| High-severity gaps found              | Spawn `developer` to address gaps |
| No high-severity gaps, stage is `mid` | Invoke `proactive-audit`          |
| Stage is `early`, foundational gaps   | Invoke `project-onboarding`       |
| Stage is `mature`, minor gaps         | Continue with original task       |

## Integration with project-stage-detection

Typical combined invocation:

```javascript
// Step 1: Detect stage
Skill({ skill: 'project-stage-detection' });
// Parse result.stage

// Step 2: If early or mid, run gap detection
if (['early', 'mid'].includes(result.stage)) {
  Skill({ skill: 'gap-detection' });
}
```

## Output Artifacts

- Report file: `.claude/context/tmp/gap-detection-<YYYY-MM-DD-HHmmss>.json`
- Summary fields: `totalFilesScanned`, `undocumentedFiles`, `todoCount`, `fixmeCount`, `lowCoverageFiles`
- Gaps array: each entry has `{ id, file, severity, type, message, recommendation }`

## Error Handling

| Error                      | Action                                        |
| -------------------------- | --------------------------------------------- |
| `targetDir` does not exist | Exit with code 1; report to user              |
| No readable files found    | Emit empty report; log warning                |
| Check type unsupported     | Warn and skip; continue with supported checks |

## Related Skills

- `project-stage-detection` — Run before gap-detection to set context
- `proactive-audit` — Deeper audit for mature projects
- `project-onboarding` — Onboarding flow for new/early projects
- `team-orchestration` — Use gap-detection findings to scope Phase 1 (Plan)
