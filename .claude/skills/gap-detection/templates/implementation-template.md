# Gap Detection Implementation Template

Use this template when implementing a gap-detection workflow for a specific project.

## Setup

```bash
# Run the gap-detection scan
node .claude/skills/gap-detection/scripts/main.cjs --dir {{project_dir}}
```

## Gap Report Template

```markdown
## Gap Detection Report — {{date}}

### Executive Summary

- Files scanned: {{total_files}}
- Critical gaps: {{critical_count}}
- Documentation coverage: {{doc_coverage}}%
- Test coverage (file-level): {{test_coverage}}%

### Findings

| Category   | Count | Priority |
| ---------- | ----- | -------- |
| NO_README  | {{n}} | {{p}}    |
| NO_TEST    | {{n}} | {{p}}    |
| TODO/FIXME | {{n}} | {{p}}    |
| NO_DOC     | {{n}} | {{p}}    |

### Action Plan

- [ ] {{action_1}}
- [ ] {{action_2}}
- [ ] {{action_3}}
```

## Integration with Planner

After running gap-detection, feed the report into the planner:

```javascript
Skill({ skill: 'plan-generator' });
// Context: gap-detection report at {{report_path}}
```
