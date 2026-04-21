<!-- Agent: technical-writer | Task: #10 | Session: 2026-02-21 -->
# Self-Healing Protocol — Documentation Update

## Changes Made

- `.claude/CLAUDE.md`: Added Section 6.1 (Post-Outcome Evaluation) between Section 6 and Section 7, at line 442
- `.claude/workflows/core/router-decision.md`: Added Step 9.7 (Post-Outcome Evaluation) after Step 9.5, at line 1208

## What Changed

### CLAUDE.md — Section 6.1

New mandatory protocol section placed after Section 6 (Execution Rules) and before Section 7 (Skill Invocation Protocol). The section defines a three-step obligation for the router after every agent completion:

1. **COMPARE** expected vs actual deliverables using `requestedCount`/`deliveredCount` metadata fields
2. **DETECT** one of four failure signals: agent stall (HIGH), quantitative underdelivery (HIGH), missing expected file (MEDIUM), or missing summary metadata (LOW)
3. **RESPOND** with the appropriate self-healing action: log to issues.md, queue reflection, retry once, or escalate

The section also documents the backward-compatible `requestedCount`/`deliveredCount` task metadata convention and references the `post-completion-chain.cjs` hook backstop that fires even when the router skips the protocol.

### router-decision.md — Step 9.7

New workflow step inserted after Step 9.5 (Late-Notification Dedupe) and before Step 9.6 (Template Loading). Provides the concrete five-step procedure the router follows to evaluate each completed task:

1. Read completed task metadata via `TaskGet()`
2. Compare `requestedCount` against `deliveredCount`
3. Check `outputArtifacts` paths on disk
4. On signal detection: log, retry, queue reflection, or escalate per severity
5. Check `failure-signals.jsonl` for hook-emitted signals not yet processed

The rationale note explains the historical pattern: router observed underdelivery in chat but continued without logging or remediating.

## Verification

Read-back of CLAUDE.md lines 430-494 confirmed:
- Section 6.1 is placed between the `---` separator after Section 6 and `## 7) SKILL INVOCATION PROTOCOL`
- No content deleted; existing Section 6 and Section 7 content intact
- Failure signals table, Self-Healing Response, Task Metadata Convention, and Hook Backstop subsections all present

Read-back of router-decision.md lines 1198-1235 confirmed:
- Step 9.7 is inserted after Step 9.5 and before Step 9.6
- Step 9.6 heading and content unchanged
- Formatting consistent with surrounding workflow steps (### heading, numbered list, bold rationale note)
