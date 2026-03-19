---
name: memory-audit
description: Comprehensive health check across CC auto-memory and agent-studio memory systems — detects orphans, duplicates, staleness, and threshold violations
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Grep, Glob, TaskUpdate]
args: '[--auto-fix] [--report-only]'
agents: [memory-manager, qa, architect, developer]
category: 'Memory & Context'
tags: [memory, audit, health-check, observability, dedup]
---

# Memory Audit

Structured diagnostic sensor for both memory systems. Returns a health report with scores, findings, and recommendations. The skill is **read-only** by default — it measures and reports but does not modify memory. Use `--auto-fix` for safe cleanup of orphans and stale files only.

## When to Invoke

```javascript
Skill({ skill: 'memory-audit' });
```

- After every 10 sessions (recommended)
- During proactive-audit pipeline
- When agents report memory-related failures
- Before session handoff (verify memory health)
- When router suspects memory bloat or staleness

## Workflow

### Step 1: CC Auto-Memory Health Check

**Command:**

```bash
MEMORY_DIR=$(find ~/.claude/projects/ -path "*/memory/MEMORY.md" -printf "%h\n" 2>/dev/null | head -1)
echo "=== CC Auto-Memory ==="
wc -l < "$MEMORY_DIR/MEMORY.md" 2>/dev/null
ls -1 "$MEMORY_DIR/" 2>/dev/null | wc -l
grep -c "^type:" "$MEMORY_DIR/"*.md 2>/dev/null | grep -v MEMORY
```

**Thresholds:**

| Metric          | OK   | WARN    | CRITICAL           |
| --------------- | ---- | ------- | ------------------ |
| MEMORY.md lines | <150 | 150-199 | >=200 (truncated!) |
| Total files     | <20  | 20-30   | >30                |
| Feedback ratio  | <70% | 70-85%  | >85% (skewed)      |

**Check:** Flag files present in directory but not referenced in MEMORY.md (orphaned).

### Step 2: Agent-Studio Memory Health Check

**Command:**

```bash
echo "=== Agent-Studio Memory ==="
du -sh .claude/context/memory/
find .claude/context/memory/ -type f | wc -l
wc -l .claude/context/memory/learnings.md .claude/context/memory/decisions.md .claude/context/memory/issues.md 2>/dev/null
find .claude/context/memory/ -name "delegations.pid-*.json" | wc -l
find .claude/context/memory/ -name "*.bak" | wc -l
```

**Thresholds:**

| Metric               | OK   | WARN    | CRITICAL                |
| -------------------- | ---- | ------- | ----------------------- |
| Directory size       | <5MB | 5-10MB  | >10MB                   |
| Total files          | <120 | 120-200 | >200                    |
| learnings.md lines   | <300 | 300-500 | >500 (blocks spawning!) |
| decisions.md lines   | <200 | 200-400 | >400                    |
| issues.md lines      | <300 | 300-500 | >500                    |
| Delegation PID files | 0    | 1-10    | >10                     |
| .bak files           | 0    | 1-3     | >3                      |

**Verify:** STM/MTM/LTM directories exist with content.

### Step 3: JSON Data Store Health

**Command:**

```bash
for f in access-stats.json codebase_map.json gotchas.json patterns.json open-findings.json; do
  echo -n "$f: "
  wc -c < ".claude/context/memory/$f" 2>/dev/null || echo "MISSING"
done
```

**Checks:**

- `access-stats.json`: verify entries have distinct accessCount values (not all identical = bulk counter, useless)
- `codebase_map.json`: count entries vs 500-entry cap
- `gotchas.json`: count entries, check for hash-based duplicates
- `patterns.json`: count entries, check for hash-based duplicates
- `open-findings.json`: flag findings with `status: "resolved"` older than 30 days (stale)

### Step 4: Cross-System Dedup Detection

Compare content between CC auto-memory reference files and agent-studio JSON stores:

1. Extract gotchas/patterns from CC `reference_technical_fixes.md` and `reference_context_management.md`
2. Compare against `gotchas.json` and `patterns.json` entries
3. Use simple substring matching (>50 char overlap = potential duplicate)
4. Report duplicates with source locations but do NOT auto-delete

**Policy (Gemini consensus):** CC auto-memory = thin index/pointers. Agent-studio = deep store. When duplicates found, recommend keeping detail in agent-studio, adding pointer in CC.

### Step 5: Named Memory Assessment

**Command:**

```bash
find .claude/context/memory/named/ -type f ! -name ".gitkeep" | wc -l
```

- If 0: flag as "unused API — 70+ lib modules support it but nothing uses it"
- If >0: verify entries are loadable via `node -e "require('.claude/lib/memory/memory-manager.cjs').listMemories()"`

### Step 6: Staleness Detection

**Command:**

```bash
find .claude/context/memory/ -name "*.json" -mtime +30 -not -path "*/archive/*" -not -path "*/ltm/*"
find .claude/context/memory/metrics/ -name "*.json" -mtime +30
```

Flag entries older than 30 days for review. Do NOT auto-delete — report only.

### Step 7: Generate Report

Write structured report to `.claude/context/reports/memory-audit-{YYYY-MM-DD}.md`:

```markdown
# Memory System Health Report — {date}

## Health Score: {0-100}/100

## Summary Table

| System | Metric | Current | Threshold | Status |
| ------ | ------ | ------- | --------- | ------ |

## Findings

### P0 (Critical)

### P1 (High)

### P2 (Low)

## Recommendations

1. ...
```

**Health Score Calculation:**

- Start at 100
- CRITICAL finding: -15 points each
- WARN finding: -5 points each
- Orphan detected: -3 points each
- Duplicate detected: -2 points each
- Score floor: 0

## Auto-Fix Mode (--auto-fix)

When invoked with `--auto-fix`, the skill will safely clean:

- Delegation PID files older than 24 hours
- .bak rotation artifacts
- Metrics files older than 30 days
- Empty placeholder files (except .gitkeep)

**Will NOT auto-fix:**

- CC auto-memory files (requires user confirmation)
- learnings.md/decisions.md/issues.md pruning (requires semantic judgment)
- Cross-system dedup resolution (requires agent reasoning)
- Named memory API deprecation (architectural decision)

## Memory Protocol

**Before starting:** Read `.claude/context/memory/learnings.md` for prior audit results.
**After completing:** Write audit summary to `learnings.md`. Record any new gotchas to `gotchas.json` via `MemoryRecord`.

## Anti-Patterns

- Never auto-delete CC auto-memory files without user confirmation
- Never modify agent-studio memory during audit (read-only by default)
- Never report raw file contents in summary (counts and sizes only)
- Never skip cross-system dedup check
- Never run auto-fix on CC auto-memory directory

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Related Skills

- `context-compressor` — compress context when audit finds bloat
- `memory-search` — semantic search across memory stores
- `proactive-audit` — broader framework health check that includes memory
