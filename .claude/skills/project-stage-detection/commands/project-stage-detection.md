# project-stage-detection Command

## Usage

```
Skill({ skill: 'project-stage-detection' })
```

Or via CLI:

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs [--dir <path>] [--json]
```

## Arguments

| Argument | Type   | Required | Description                                             |
| -------- | ------ | -------- | ------------------------------------------------------- |
| `--dir`  | string | NO       | Project root to analyze (defaults to current directory) |
| `--json` | flag   | NO       | Output compact JSON (default is pretty-printed JSON)    |

## Examples

**Detect stage of current directory:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs
```

**Detect stage of a specific project:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs --dir /path/to/my-project
```

**Output compact JSON for scripting:**

```bash
node .claude/skills/project-stage-detection/scripts/main.cjs --dir . --json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const r=JSON.parse(d);console.log(r.stage)"
```

## Output Format

```json
{
  "stage": "mid",
  "score": 7,
  "maxScore": 12,
  "confidence": 58,
  "projectRoot": "/path/to/project",
  "indicators": [
    { "id": "source_dir", "label": "Source directory exists", "present": true, "weight": 2 },
    ...
  ],
  "missingIndicators": ["CI/CD pipeline configured", "CHANGELOG.md present"],
  "recommendations": [
    "Add CHANGELOG.md and keep it updated",
    "Configure CI/CD pipeline"
  ],
  "timestamp": "2026-03-22T10:00:00.000Z"
}
```

## Stage Values

| Stage    | Score Range | Description                                   |
| -------- | ----------- | --------------------------------------------- |
| `new`    | 0–2         | Empty or freshly initialized project          |
| `early`  | 3–5         | Has core structure but missing infrastructure |
| `mid`    | 6–7         | Functional codebase, quality gaps remain      |
| `mature` | 8+          | Full quality infrastructure in place          |

## Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success — detection complete              |
| 1    | Error — directory not found or unreadable |
