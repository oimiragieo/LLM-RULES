# CRITICAL ARCHITECTURAL FINDING: Rules Bloat Kills Agent Context

**Date**: 2026-03-19
**Severity**: CRITICAL (P0)
**Impact**: Agents fail with "Prompt is too long", exhaust context before completing work

## Problem
- 141 rules files (857KB total) are auto-injected into EVERY agent spawn
- Plus 35KB CLAUDE.md = ~200K+ tokens consumed before agent starts working
- Agent effective working context: nearly zero
- Result: agents fail, exhaust context mid-task, produce truncated reports

## Evidence
- developer agent: "Prompt is too long" (0 tool uses, 0 tokens)
- architect agent: exhausted context after 47 tool calls, no report written
- code-reviewer agent: exhausted context after 34 tool calls, no report written
- Only lightweight agents (Explore, researcher) completed successfully

## Root Cause
Rules (.claude/rules/*.md) are Claude Code's always-on injection mechanism.
Skills (.claude/skills/*/SKILL.md) are loaded on-demand via Skill() tool.
141 rules files should be ~15 universal rules + 126 on-demand skills.

## Largest Offenders
- ripgrep.md (14KB) — should be a skill only
- plugin-development.md (11KB) — should be a skill only
- database-architect.md (11KB) — should be a skill only
- on-call-handoff-patterns.md (10KB) — should be a skill only
- accessibility.md (8KB) — should be a skill only

## Fix Required
1. Keep only universal rules as .claude/rules/ (~15 files, ~50KB total)
2. Convert remaining 126 rules to skills (loaded on-demand)
3. Universal rules: code-standards, security, testing, git-workflow, hooks, memory-protocol, task-tracking, deviation-rules, cleanup-always, file-deletion-safety, sharp-edges, workspace-conventions, context-compressor, shell-command-safety, documentation-always

## Impact of Fix
- Agent spawn context: ~200K tokens → ~30K tokens
- Agent working context: nearly zero → 170K+ tokens
- Agent completion rate: ~30% → ~90%+
