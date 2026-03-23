---
name: gap-detection
description: Detect missing docs, undocumented files, project health issues, and coverage gaps on session start or on-demand. Scans for README gaps, TODO/FIXME counts, and test coverage holes.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Glob, Grep]
agents: [developer, qa, architect, planner]
category: 'Validation & Quality'
tags: [gap-detection, health-check, documentation, coverage, onboarding]
best_practices:
  - Always run on session start for unfamiliar repositories
  - Report findings as actionable issues, not just counts
  - Prioritize gaps by blast radius (public API > internal > test helpers)
  - Cross-reference README vs actual file structure
error_handling: strict
---

# Gap Detection

## Overview

This skill performs a structured health-check scan on session start (or on-demand) to surface:

1. Files missing README / documentation headers
2. Test coverage gaps (source files without corresponding test files)
3. TODO / FIXME counts and locations
4. Undocumented public APIs and exports

Use this skill before beginning any significant work in an unfamiliar codebase, or as a recurring quality gate.

## When to Use

- Session start in a new or unfamiliar repository
- Before planning a feature to understand existing quality debt
- During code review to identify undocumented additions
- As part of a proactive-audit pipeline

## The Iron Law

```
NO HEALTH REPORT WITHOUT EVIDENCE — EVERY FINDING MUST CITE FILE AND LINE
```

Never report a gap without a concrete file path and (when applicable) line number. Vague summaries are not actionable.

## Workflow

### Step 1: Scan for undocumented source files

**Command:**

```bash
# Find source files without a README at their directory level
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.cjs" -o -name "*.mjs" -o -name "*.py" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" \
  -print | while read f; do
    dir=$(dirname "$f")
    if [ ! -f "$dir/README.md" ] && [ ! -f "$dir/index.md" ]; then
      echo "NO_README: $f"
    fi
  done | sort -u
```

**Expected output:** Lines of form `NO_README: ./src/utils/helper.ts`

**Verify:** Exit code 0; non-empty output means gaps exist.

### Step 2: Find test coverage gaps

**Command:**

```bash
# Find source files that have no matching test file
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.cjs" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" \
  ! -path "*/tests/*" ! -path "*/__tests__/*" ! -path "*.test.*" ! -path "*.spec.*" \
  -print | while read src; do
    base=$(basename "$src" | sed 's/\.[^.]*$//')
    dir=$(dirname "$src")
    if ! find . -path "*/tests/*" -name "${base}.test.*" 2>/dev/null | grep -q .; then
      if ! find . -name "${base}.test.*" 2>/dev/null | grep -q .; then
        echo "NO_TEST: $src"
      fi
    fi
  done
```

**Expected output:** Lines of form `NO_TEST: ./src/auth/jwt.ts`

**Verify:** Exit code 0; any NO_TEST lines are coverage gaps.

### Step 3: Count and locate TODO/FIXME markers

**Command:**

```bash
grep -rn --include="*.ts" --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.py" \
  -E "(TODO|FIXME|HACK|XXX):" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  . 2>/dev/null | sort
```

**Expected output:** `./src/auth/jwt.ts:42: // TODO: add token rotation`

**Verify:** Total count printed via `| wc -l` appended to output.

### Step 4: Detect undocumented public exports

**Command:**

```bash
# Find exported functions/classes without JSDoc or inline comment above them
grep -rn --include="*.ts" --include="*.js" -E "^export (function|class|const|async function)" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  . 2>/dev/null | while IFS=: read file line content; do
    prevline=$((line - 1))
    comment=$(sed -n "${prevline}p" "$file" 2>/dev/null | grep -E "(/\*|\*/|//)" || true)
    if [ -z "$comment" ]; then
      echo "NO_DOC: $file:$line $content"
    fi
  done
```

**Expected output:** `NO_DOC: ./src/api/router.ts:15 export function handleRequest`

**Verify:** Exit code 0.

### Step 5: Compile health report

After running Steps 1–4, produce a structured report with:

- **Summary table**: counts per category (NO_README, NO_TEST, TODO/FIXME, NO_DOC)
- **Top 10 highest-priority gaps** (ranked by: public API > module entrypoints > internals)
- **Recommended next actions** (e.g., "Add README to `src/auth/`, add tests for `jwt.ts`")

**Report format:**

```markdown
## Gap Detection Report — {{date}}

| Category   | Count |
| ---------- | ----- |
| NO_README  | {{n}} |
| NO_TEST    | {{n}} |
| TODO/FIXME | {{n}} |
| NO_DOC     | {{n}} |

### Priority Gaps

1. {{file:line}} — {{reason}}
   ...

### Recommended Actions

- [ ] {{action}}
      ...
```

**Verify:** Report written to `.claude/context/tmp/gap-detection-report-{{date}}.md`.

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Memory Protocol

**Before starting:**

Read `.claude/context/memory/learnings.md` for prior gap scans and known chronic issues.

**After completing:**

- Append gap summary to `.claude/context/memory/learnings.md` with date and repo path
- If critical gaps found (0% test coverage on a module, zero README in public API dir), append to `.claude/context/memory/issues.md`

## Anti-Patterns

- Never report "no gaps found" without actually running the scan commands
- Never produce a gap report without file paths — vague summaries are unusable
- Never suppress TODO/FIXME output — they represent deferred debt
- Never run on `node_modules/`, `dist/`, `.git/` directories

## Related Skills

- `proactive-audit` — broader audit including hook syntax and agent consistency
- `tdd` — use after gap-detection to address test coverage gaps
- `debugging` — follow-up for runtime gaps identified during scan
- `context-compressor` — compress large gap reports before handing off

## Assigned Agents

- `developer` (primary — runs on feature work)
- `qa` (primary — runs before test strategy)
- `architect` (supporting — runs before architecture reviews)
- `planner` (supporting — runs before planning sessions)
