# gap-detection Command

## Usage

```
/gap-detection [--dir <path>] [--checks <list>]
```

## Description

Scans a directory for documentation gaps, test coverage holes, and quality issues. Produces a structured report with actionable findings ranked by blast radius.

## Arguments

| Argument   | Type   | Description                                     | Default                                                  |
| ---------- | ------ | ----------------------------------------------- | -------------------------------------------------------- |
| `--dir`    | string | Directory to scan                               | Current working directory                                |
| `--checks` | list   | Checks to run: `no-readme,no-test,todos,no-doc` | All checks                                               |
| `--output` | string | Report output path                              | `.claude/context/tmp/gap-detection-report-YYYY-MM-DD.md` |

## Examples

```bash
# Scan current directory (all checks)
node .claude/skills/gap-detection/scripts/main.cjs

# Scan a specific directory
node .claude/skills/gap-detection/scripts/main.cjs --dir /path/to/project

# Run only TODO and README checks
node .claude/skills/gap-detection/scripts/main.cjs --checks todos,no-readme
```

## Output

A markdown report written to `.claude/context/tmp/` containing:

- Summary table with gap counts per category
- Top 20 priority gaps with file paths
- Recommended next actions

## Skill Invocation

```javascript
Skill({ skill: 'gap-detection' });
```
