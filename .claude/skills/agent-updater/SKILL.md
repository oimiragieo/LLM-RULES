---
name: agent-updater
description: Research-backed workflow to refresh existing agent prompts/frontmatter with diff-based risk scoring, TDD gates, and ecosystem validation.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, WebSearch, WebFetch, MemoryRecord]
args: '--agent <name-or-path> [--trigger reflection|evolve|manual] [--mode plan|execute]'
error_handling: graceful
streaming: supported
---

# Agent Updater

## Overview

Refresh existing agent definitions safely using research, explicit prompt/frontmatter diff analysis, and risk scoring before changes are applied.

## When to Use

- Reflection shows repeated low scores for a specific agent
- EVOLVE identifies agent capability drift in an existing role
- User requests updates to an existing agent prompt/skills/tools

## The Iron Law

Never modify agent prompts blind. Produce a diff plan with risk score and regression gates first.

## Workflow

1. Resolve target agent path and verify existence.
2. Invoke `framework-context` and `research-synthesis`.
3. Build prompt/frontmatter diff plan with risk score (`low|medium|high`).
4. Generate RED/GREEN/REFACTOR/VERIFY backlog.
5. Validate integration and regenerate agent registry if assignments changed.
6. Record learnings and unresolved risks in memory.

## Risk Scoring Model

- `high`: model/tool changes, permission mode changes, security hooks impact
- `medium`: skill array changes, routing keywords, major workflow protocol edits
- `low`: wording clarifications, examples, non-behavioral docs

## Tooling

- Search evidence with `pnpm search:code` and search skills.
- Use `token-saver-context-compression` only for large prompt diffs.
- Use `recommend-evolution` if update is insufficient and net-new artifact needed.

## Memory Protocol

Before: read `.claude/context/memory/learnings.md`
After: write learnings/decisions/issues updates.
