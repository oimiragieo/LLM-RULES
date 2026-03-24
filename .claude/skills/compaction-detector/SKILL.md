---
name: compaction-detector
description: Detect Claude Code context compaction events in session JSONL logs. Identifies compaction boundaries, measures token delta before/after, reports compaction events with timestamps and token impact.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Grep, TaskUpdate]

verified: true
lastVerifiedAt: 2026-03-23T23:18:04.669Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Compaction Detector

<identity>
Compaction Detector Skill - Detect Claude Code context compaction events in session JSONL logs. Identifies compaction boundaries, measures token delta before/after, reports compaction events with timestamps and token impact.
</identity>

<capabilities>
- Detect context compaction events in Claude Code session JSONL logs
- Measure token delta (before/after) at each compaction boundary
- Report compaction events with ISO timestamps, turn index, and token impact
- Parse multi-session or single-session JSONL files
- Output structured compaction report to stdout or file
</capabilities>

<instructions>
<execution_process>

### Step 1: Locate the Session Log File

Claude Code session logs are stored as JSONL files. Find the target log:

```bash
# Default log location (adjust path for your OS)
# macOS / Linux
ls -lt ~/.claude/projects/*/logs/*.jsonl | head -5

# Windows (Git Bash / WSL)
ls -lt "/c/Users/$USER/.claude/projects/"*/logs/*.jsonl 2>/dev/null | head -5

# Or search by project path hash
find ~/.claude/projects -name "*.jsonl" -newer /tmp/sentinel 2>/dev/null
```

**Expected output:** One or more `.jsonl` file paths with modification timestamps.
**Verify:** File is non-empty — `wc -l <path>` should return > 0.

### Step 2: Identify Compaction Boundary Lines

Each line in a Claude Code session JSONL is a JSON object. Compaction events are identified by a sharp drop in `usage.input_tokens` between consecutive turns — the context was summarised and reset to a smaller window.

**Command — extract token counts with line numbers:**

```bash
SESSION_LOG="<absolute-path-to-session.jsonl>"

grep -n '"input_tokens"' "$SESSION_LOG" \
  | awk -F'[":,]' '{
      for(i=1;i<=NF;i++) {
        if($i ~ /input_tokens/) { print NR, $(i+2); break }
      }
    }'
```

**Simpler alternative using `jq` (if available):**

```bash
jq -r 'select(.usage.input_tokens != null) | [.timestamp, .usage.input_tokens, .usage.output_tokens] | @tsv' \
  "$SESSION_LOG"
```

**Expected output:** Tab-separated rows: `<timestamp>  <input_tokens>  <output_tokens>`

### Step 3: Detect Token Drop Events

A compaction event occurs when `input_tokens[N] < input_tokens[N-1] * 0.5` (tokens dropped by more than 50%).

**Command — detect drops with awk:**

```bash
SESSION_LOG="<absolute-path-to-session.jsonl>"

grep '"input_tokens"' "$SESSION_LOG" \
  | grep -oP '"input_tokens"\s*:\s*\K[0-9]+' \
  | awk '
    NR > 1 {
      pct = ($1 / prev) * 100
      if (pct < 50) {
        printf "COMPACTION at line %d: %d -> %d tokens (%.1f%% retained)\n", \
               NR, prev, $1, pct
      }
    }
    { prev = $1 }
  '
```

**Expected output:**

```
COMPACTION at line 47: 98234 -> 8102 tokens (8.2% retained)
COMPACTION at line 203: 112450 -> 9341 tokens (8.3% retained)
```

**Verify:** Each reported line number corresponds to a real turn boundary. Cross-check with `sed -n '<line>p' "$SESSION_LOG" | jq .timestamp`.

### Step 4: Extract Timestamps for Each Compaction

For each compaction line number identified in Step 3, extract the ISO timestamp:

```bash
SESSION_LOG="<absolute-path-to-session.jsonl>"
COMPACTION_LINE=47   # Replace with actual line number

# Extract timestamp from that JSONL line
sed -n "${COMPACTION_LINE}p" "$SESSION_LOG" \
  | grep -oP '"timestamp"\s*:\s*"\K[^"]+'
```

**Alternative with jq:**

```bash
sed -n "${COMPACTION_LINE}p" "$SESSION_LOG" | jq -r '.timestamp // "unknown"'
```

**Expected output:** `2026-03-21T14:32:07.441Z`

### Step 5: Compute Token Delta Per Compaction Event

For each compaction boundary, calculate:

- `tokens_before`: input_tokens on the line immediately before the drop
- `tokens_after`: input_tokens on the compaction line
- `delta`: tokens_before - tokens_after
- `retention_pct`: (tokens_after / tokens_before) \* 100

**Full pipeline — produces structured TSV:**

```bash
SESSION_LOG="<absolute-path-to-session.jsonl>"

paste \
  <(grep -n '"input_tokens"' "$SESSION_LOG" | grep -oP '^\d+') \
  <(grep '"input_tokens"' "$SESSION_LOG" | grep -oP '"input_tokens"\s*:\s*\K[0-9]+') \
  | awk '
    NR > 1 {
      delta = prev_tokens - $2
      pct   = ($2 / prev_tokens) * 100
      if (pct < 50) {
        printf "%s\t%d\t%d\t%d\t%.1f\n", \
               prev_line, $1, prev_tokens, $2, pct
      }
    }
    { prev_line = $1; prev_tokens = $2 }
  ' \
  | column -t -s $'\t' \
    -N "BOUNDARY_LINE,COMPACTION_LINE,TOKENS_BEFORE,TOKENS_AFTER,RETENTION_PCT"
```

**Expected output:**

```
BOUNDARY_LINE  COMPACTION_LINE  TOKENS_BEFORE  TOKENS_AFTER  RETENTION_PCT
46             47               98234          8102          8.2
202            203              112450         9341          8.3
```

### Step 6: Produce Structured Report

Emit the compaction report as JSON to stdout or save to a file:

```bash
SESSION_LOG="<absolute-path-to-session.jsonl>"
OUTPUT_FILE=".claude/context/tmp/compaction-report-$(date +%Y%m%d-%H%M%S).json"

python3 - "$SESSION_LOG" "$OUTPUT_FILE" <<'PYEOF'
import json, sys, os, re
from datetime import datetime, timezone

log_path = sys.argv[1]
out_path  = sys.argv[2]

lines = open(log_path).readlines()
events = []
prev_tokens = None
prev_ts     = None

for i, raw in enumerate(lines):
    try:
        obj = json.loads(raw)
    except Exception:
        continue
    tokens = (obj.get("usage") or {}).get("input_tokens")
    ts     = obj.get("timestamp")
    if tokens is None:
        continue
    if prev_tokens is not None and tokens < prev_tokens * 0.5:
        events.append({
            "line_number":    i + 1,
            "timestamp":      ts or "unknown",
            "tokens_before":  prev_tokens,
            "tokens_after":   tokens,
            "delta":          prev_tokens - tokens,
            "retention_pct":  round(tokens / prev_tokens * 100, 1)
        })
    prev_tokens = tokens
    prev_ts     = ts

report = {
    "session_log":       log_path,
    "analyzed_at":       datetime.now(timezone.utc).isoformat(),
    "total_lines":       len(lines),
    "compaction_count":  len(events),
    "events":            events
}

os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w") as f:
    json.dump(report, f, indent=2)

print(json.dumps(report, indent=2))
PYEOF
```

**Expected output (stdout + file):**

```json
{
  "session_log": "/home/user/.claude/projects/abc123/logs/session.jsonl",
  "analyzed_at": "2026-03-21T15:00:00.000Z",
  "total_lines": 312,
  "compaction_count": 2,
  "events": [
    {
      "line_number": 47,
      "timestamp": "2026-03-21T14:32:07.441Z",
      "tokens_before": 98234,
      "tokens_after": 8102,
      "delta": 90132,
      "retention_pct": 8.2
    },
    {
      "line_number": 203,
      "timestamp": "2026-03-21T14:58:33.117Z",
      "tokens_before": 112450,
      "tokens_after": 9341,
      "delta": 103109,
      "retention_pct": 8.3
    }
  ]
}
```

**Verify:** `compaction_count` matches the number of events in the `events` array.

</execution_process>

<best_practices>

1. **Always use absolute paths** for `SESSION_LOG` — relative paths fail when the shell CWD differs.
2. **Check file size before parsing** — files >10MB should be processed line-by-line (streaming), not loaded into memory.
3. **Threshold tuning** — the default 50% drop threshold catches most compactions. Use 30% for aggressive detection or 70% for conservative (fewer false positives on large tool outputs).
4. **Handle missing timestamps gracefully** — not all JSONL lines include `timestamp`; fall back to line number as the event identifier.
5. **Use `python3` pipeline for production** — the awk pipeline is fast for quick checks; the Python script is more reliable for malformed JSON or multi-byte characters.

</best_practices>
</instructions>

<examples>
<usage_example>
**Quick check — does this session have any compactions?**

```bash
SESSION_LOG="$HOME/.claude/projects/$(ls -t ~/.claude/projects | head -1)/logs/session.jsonl"

grep '"input_tokens"' "$SESSION_LOG" \
  | grep -oP '"input_tokens"\s*:\s*\K[0-9]+' \
  | awk 'NR>1 && ($1/prev)<0.5 {print "Compaction found: "prev" -> "$1} {prev=$1}'
```

**Full structured report:**

```bash
Skill({ skill: 'compaction-detector' })
# Then supply the session log path when prompted
```

**Pipe report into jq for summary:**

```bash
node .claude/skills/compaction-detector/scripts/main.cjs --log "$SESSION_LOG" \
  | jq '{count: .compaction_count, events: [.events[] | {ts: .timestamp, delta: .delta}]}'
```

</usage_example>
</examples>

## Search Protocol

For code discovery and search tasks, follow this priority order:

1. \`pnpm search:code "<query>"\` (Primary intent-based search).
2. \`ripgrep\` (for exact keyword/regex matches).
3. semantic/structural search via code tools if available.

## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
\`\`\`

**After completing:**

- New pattern -> \`.claude/context/memory/learnings.md\`
- Issue found -> \`.claude/context/memory/issues.md\`
- Decision made -> \`.claude/context/memory/decisions.md\`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
