---
name: debug-log-analysis
description: 'Structured debug log analysis for Claude Code sessions — auto-discovers most recent log, runs reducer, extracts error patterns, correlates with full log, produces observability report. Fills 5 identified gaps: hook error body capture, agent identity, file path tracking, stall correlation, success visibility.'
version: 1.3.0
model: sonnet
invoked_by: both
user_invocable: true
category: Debugging
agents: [reflection-agent, devops-troubleshooter, developer]
tags: [debugging, observability, debug-log, errors, reflection, telemetry]
tools: [Read, Write, Bash, Grep]
args:
  - name: session_id
    description: 'Specific session UUID to analyze (default: most recent log)'
    required: false
  - name: output_path
    description: 'Where to write the analysis report (default: auto-generated)'
    required: false
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-03-05'
---

**Mode: Cognitive/Prompt-Driven** — No standalone utility script; use via agent context.

# Debug Log Analysis

Structured workflow for extracting actionable signal from Claude Code session debug logs. Use during reflection cycles, incident response, or when diagnosing agent failures.

## When to Use

- After any session with unexpected agent failures or stalls
- When reflection-agent needs telemetry to contextualize task completions
- When debugging hook errors that appear opaque in task outputs
- When the router reports "agent completed but didn't call TaskUpdate"

## Prerequisites

The `scripts/reduce-debug-log.mjs` script auto-detects the most recent log when no file argument is provided. It copies the log to `.tmp/` and produces a reduced version there.

## Step 0: Determine Analysis Mode

Two modes are available:

**Auto mode (recommended):** Let `pnpm debug:reduce` find and process the most recent log automatically.

**Manual mode:** Provide a specific session UUID or log file path.

## Step 1: Locate and Reduce the Debug Log

**IMPORTANT: Always find the most recent log dynamically. NEVER hardcode session UUIDs.**

### Auto mode (preferred)

```bash
# Auto-detect most recent log, copy to .tmp/, reduce in place
cd /c/dev/projects/agent-studio && node scripts/reduce-debug-log.mjs 2>&1

# The script prints:
# Auto-detected debug log: /home/user/.claude/debug/{session-uuid}.txt
# Copied to: .tmp/{session-uuid}.txt
# Original: N lines -> kept (issue-like): M -> ... -> after dedupe: K
# Output: .tmp/{session-uuid}-reduced.txt
```

Capture the output paths from the script output for subsequent steps.

### Manual mode (when a specific session is needed)

```bash
# List recent debug logs sorted by modification time (most recent first)
ls -t "$HOME/.claude/debug/"*.txt 2>/dev/null | head -5

# Or on Windows (Git Bash):
ls -t "$USERPROFILE/.claude/debug/"*.txt 2>/dev/null | head -5
```

Pick the target log path, then:

```bash
# Copy to temp (never operate on the original)
mkdir -p .claude/context/tmp
cp "$HOME/.claude/debug/{session-uuid}.txt" ".claude/context/tmp/debug-session-copy.txt"

# Run reducer with explicit output path
node scripts/reduce-debug-log.mjs \
  ".claude/context/tmp/debug-session-copy.txt" \
  --output ".claude/context/tmp/debug-session-reduced.txt"
```

### Verify reduction succeeded

```bash
# Check sizes
wc -l ".claude/context/tmp/debug-session-copy.txt"
wc -l ".claude/context/tmp/debug-session-reduced.txt"
```

Expected: reduced file is 1-5% of original line count (98%+ noise removed).

## Step 2: Compare Original vs Reduced

Calculate what was filtered out to understand the filter quality:

```bash
ORIGINAL_LINES=$(wc -l < ".claude/context/tmp/debug-session-copy.txt")
REDUCED_LINES=$(wc -l < ".claude/context/tmp/debug-session-reduced.txt")
echo "Original: $ORIGINAL_LINES lines | Reduced: $REDUCED_LINES lines"
echo "Kept: $(echo "scale=1; $REDUCED_LINES * 100 / $ORIGINAL_LINES" | bc)%"
```

Note any anomalies — e.g., if reduction is less than 90%, the session had unusually many errors.

## Step 3: Read Reduced Log

Read `.claude/context/tmp/debug-session-reduced.txt` in full.

## Step 4: Categorize Error Patterns in Reduced Log

For each line in the reduced log, classify into:

| Category                    | Signal Pattern                                                 | Action                                   |
| --------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| **Hook Block (Write)**      | `PreToolUse:Write` + block                                     | Count; find triggering agent + file path |
| **Hook Block (TaskUpdate)** | `PreToolUse:TaskUpdate` + burst                                | Count; find looping agent                |
| **Read Miss**               | `File does not exist` or placeholder text                      | Count; list missing files                |
| **Token Overflow**          | `FileTooLargeError` or `token limit`                           | Count; identify large files              |
| **Streaming Stall**         | Gap > 60s between log entries                                  | Sum duration; note what preceded stall   |
| **Agent Drop**              | `TaskUpdate not called` or `agent returned` without completion | List by task ID                          |
| **Tool Error**              | `EISDIR`, `ENOENT`, `sibling tool call errored`                | Categorize by tool                       |

## Step 5: Cross-Reference Top Errors in Full Log

For the top 3 most frequent error categories:

1. Grep the FULL (unreduced) log copy for the error signature
2. Find the 10 lines before and after each occurrence
3. Identify: which tool call triggered it, which agent was running, what it was trying to do

```bash
# Use the full copy (not the original, not the reduced)
grep -n "PreToolUse:Write" ".claude/context/tmp/debug-session-copy.txt" | head -30
grep -n "File does not exist" ".claude/context/tmp/debug-session-copy.txt" | head -30
grep -n "timeout" ".claude/context/tmp/debug-session-copy.txt" -i | head -30
```

## Step 6: Cleanup Temp Files

After analysis, clean up the working copy (keep the reduced file for the report if needed):

```bash
rm -f ".claude/context/tmp/debug-session-copy.txt"
# Optionally keep the reduced file for reference; delete when done
# rm -f ".claude/context/tmp/debug-session-reduced.txt"
```

## Step 7: Produce Structured Report

Write to `.claude/context/reports/reflections/debug-log-analysis-{YYYY-MM-DD}.md`:

```markdown
<!-- Agent: reflection-agent | Skill: debug-log-analysis | Session: {YYYY-MM-DD} -->

# Debug Log Analysis — {YYYY-MM-DD}

**Source log:** {path to original log — auto-detected or provided}
**Session UUID:** {session-uuid extracted from filename}
**Log statistics:**

- Original: {N} lines / {bytes} bytes
- Reduced: {M} lines / {bytes} bytes
- Reduction ratio: {X}%
  **Analysis timestamp:** {ISO-8601}

## Error Summary

| Category           | Count | Severity | Root Cause |
| ------------------ | ----- | -------- | ---------- |
| Hook Block (Write) | N     | CRITICAL | ...        |
| Read Miss          | N     | HIGH     | ...        |
| ...                |       |          |            |

## Top 3 Deep Dives

### 1. {Most frequent error}

**Frequency:** N occurrences
**First occurrence:** line {N}, timestamp {T}
**Context:** {what the agent was doing}
**Root cause:** {why it happened}
**Fix:** {concrete recommendation}

### 2. ...

### 3. ...

## Observability Gaps Found

List any gaps where the log entry doesn't have enough info to diagnose the error.

## Recommendations

- [ ] Immediate P0: {fix}
- [ ] P1: {fix}
- [ ] P2: {fix}
```

## Known Observability Gaps (Agent-Studio v2026-02)

These gaps exist in the current debug log format:

1. **Hook rejection body not logged** — When `unified-creator-guard.cjs` blocks a Write, the rejection reason is not captured in the debug log. You see `PreToolUse:Write blocked` but not WHY.
   - Workaround: Check `process.stderr` output separately; or read the hook source to infer the rule that fired.

2. **Agent identity missing from error lines** — Error lines don't include which spawned agent caused the error.
   - Workaround: Correlate timestamps with task spawn/completion entries.

3. **Read failure file path omitted** — `File does not exist` lines don't always include the file path.
   - Workaround: Look at the preceding tool call line for the attempted path.

4. **Streaming stalls unattributed** — A 5+ minute stall appears as a timestamp gap with no context.
   - Workaround: The tool call preceding the gap is the likely cause.

5. **No success logging** — Only failures are prominent. Successful tool calls produce minimal log entries.
   - Workaround: Count total tool uses from task summary metadata.

## Integration with Reflection

Reflection agents should invoke this skill for HIGH-priority reflection requests:

```javascript
// In reflection agent, for high-priority triggers:
if (priority === 'high' && debugLogPath) {
  Skill({ skill: 'debug-log-analysis' });
  // Include findings in reflection report
}
```

## Iron Laws

1. **ALWAYS** copy the debug log before any analysis — never operate on the original file; in-place operations corrupt the forensic artifact.
2. **NEVER** report a root cause based on a single grep match — always read at least 10 lines of context before and after the match to understand what the agent was actually doing.
3. **ALWAYS** run the reducer script (Step 2) before attempting to read a full debug log — unfiltered debug logs contain 98%+ noise that obscures real signals.
4. **NEVER** skip the structured error report (Step 6) — an informal verbal summary is not a deliverable; the markdown report is required for reflection-agent to incorporate findings.
5. **ALWAYS** write new recurring error patterns to `.claude/context/memory/issues.md` — patterns not written to memory will recur invisibly across sessions.

## Anti-Patterns

| Anti-Pattern                              | Why It Fails                                                         | Correct Approach                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Grepping the original log file directly   | Modifies timestamps, corrupts forensic artifact, no rollback         | Always copy first: `cp debug.txt .claude/context/tmp/debug-{date}.txt`              |
| Reading the full unreduced log            | 98%+ noise-to-signal ratio; analysis takes hours and misses patterns | Run `reduce-debug-log.mjs` first; work from the reduced output                      |
| Reporting root cause from single grep hit | Single matches are often false positives from unrelated tool calls   | Read ±10 lines of context for every match before concluding root cause              |
| Informal verbal summary instead of report | Reflection agent can't parse informal summaries into memory entries  | Write the full structured markdown report to `.claude/context/reports/reflections/` |
| Skipping memory writes after analysis     | Error patterns recur invisibly; no institutional learning            | Write every new pattern to issues.md or learnings.md before task complete           |

## Memory Protocol (MANDATORY)

**After completing:**

- New error pattern found → `.claude/context/memory/issues.md`
- New observability gap found → `.claude/context/memory/issues.md`
- Pattern that recurs across sessions → `.claude/context/memory/learnings.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
