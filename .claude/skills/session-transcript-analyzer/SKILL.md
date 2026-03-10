---
name: session-transcript-analyzer
description: Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash]

verified: true
lastVerifiedAt: 2026-03-08T21:09:19.891Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Session Transcript Analyzer

<identity>
Session Transcript Analyzer Skill - Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
</identity>

<capabilities>
- Locate Claude Code session transcripts (`.jsonl`) in `~/.claude/projects/` by session ID or by recency
- Pair each transcript with its corresponding debug log (`.txt`) in `~/.claude/debug/`
- Parse JSONL transcript events: count user turns, tool invocations, and tool errors
- Parse debug log lines: detect router lockdown violations, context-length overflows, and JSON parse failures
- Generate a structured Markdown report with overview metrics, tool usage summary, and heuristic findings
- Write report to `.tmp/transcript-analysis-<session-prefix>.md` or a caller-specified path
</capabilities>

<instructions>
<execution_process>

### Step 1: Locate the transcript

Determine the target session. Two modes:

- **Explicit session ID**: pass `--session <uuid>` to scan `~/.claude/projects/<project-dir>/` for a `.jsonl` file whose name contains the UUID.
- **Auto-detect** (no `--session`): scan the project directory (derived from `process.cwd()`) for the most recently modified `.jsonl` file. Fall back to a global scan of `~/.claude/projects/` if the project directory does not exist.

Project folder name derivation: replace the drive colon+backslash with `--`, then replace remaining path separators with `-`.
Example: `C:\dev\projects\agent-studio` → `C--dev-projects-agent-studio`.

### Step 2: Pair with a debug log

Once the session ID is extracted from the transcript filename (`<uuid>.jsonl`), look for a matching debug log at `~/.claude/debug/<uuid>.txt`. If not found, do a prefix/contains scan of the debug directory. Warn but continue if no debug log is found.

### Step 3: Parse the JSONL transcript

Read the file line by line. Skip blank or malformed lines. For each valid JSON object:

- Count **user messages**: `event.type === 'user'` where `event.message.content[0].type === 'text'`
- Count **tool invocations**: content blocks with `type === 'tool_use'`; accumulate per-tool counts in a frequency map
- Collect **tool failures**: content blocks with `type === 'tool_result'` and `is_error === true`

### Step 4: Parse the debug log

Read line by line. Collect lines that match any of:

- `[ERROR]` or `error:` — general errors
- `BLOCKED` — hook blocks (router lockdown, creator guard)
- `prompt is too long` — context-length API errors
- `SyntaxError: Unterminated string in JSON` — hook JSON parse failures

### Step 5: Run heuristics and generate report

Build a Markdown report with these sections:

1. **Overview Metrics**: user turns, tool invocations, tool errors, debug log error count
2. **Tool Usage Summary**: sorted frequency table of tool names
3. **Heuristic Findings** (flag each category if count > 0):
   - Router Protocol Violations (`ROUTER-LOCKDOWN`, `TASK-CREATE VIOLATION`)
   - Context Length Exceeded (`prompt is too long`)
   - Hook JSON Parse Failures (`Unterminated string in JSON`)
   - If none triggered: print a clean-system message
4. **Top Tool Failures**: first 5 tool_result errors with truncated content (150 chars)

### Step 6: Write report

Default output path: `.tmp/transcript-analysis-<first-8-chars-of-uuid>.md` (create `.tmp/` if needed).
If `--out <path>` was supplied, write there instead.

</execution_process>

<best_practices>

1. **Tolerate malformed lines**: wrap `JSON.parse()` in try/catch per line; never abort on a single bad line.
2. **Warn, don't fail, on missing debug log**: the transcript alone provides useful metrics; missing debug log loses only heuristic signal.
3. **Truncate tool failure content to 150 chars** to keep the report readable; collapse newlines to spaces.
4. **Derive project dir from `process.cwd()`** not from a hardcoded path — supports running from any agent-studio checkout location.
5. **Show only the first 5 tool failures** in the report; full data is in the transcript for deeper inspection.

</best_practices>
</instructions>

<examples>
<usage_example>
**Analyze the most recent session (auto-detect):**

```bash
node scripts/analyze-session-transcript.mjs
# or
pnpm debug:analyze
```

**Analyze a specific session by UUID:**

```bash
node scripts/analyze-session-transcript.mjs --session f1326443-490f-486b-bb67-01c72bf42408
```

**Write report to a custom path:**

```bash
node scripts/analyze-session-transcript.mjs --out .claude/context/reports/backend/session-analysis-2026-03-10.md
```

**Typical report output structure:**

```markdown
# Session Analysis Report: f1326443-490f-486b-bb67-01c72bf42408

Generated: 2026-03-10T12:00:00.000Z

## Overview Metrics

- **User Turns:** 14
- **Tool Invocations:** 87
- **Tool Errors:** 3
- **Debug Log Errors:** 2

## Tool Usage Summary

- `Read`: 34 times
- `Edit`: 18 times
- `Bash`: 15 times
- `Write`: 12 times
- `TaskUpdate`: 8 times

## Heuristic Findings

### Context Length Exceeded (API Error)

The orchestrator accumulated too many tokens and crashed the API request.
Occurred **1** times.

## Top Tool Failures (from Transcript UI)

- `toolu_01ABC`: File not found: .claude/context/runtime/stale-tasks.json...
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
