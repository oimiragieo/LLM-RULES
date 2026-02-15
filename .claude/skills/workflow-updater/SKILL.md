---
name: workflow-updater
description: Refresh existing workflows with phase-gate regression checks and idempotency validation.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord, WebSearch, WebFetch]
args: '--workflow <name-or-path> [--trigger reflection|evolve|manual]'
error_handling: graceful
streaming: supported
---

# Workflow Updater

Refresh existing workflows safely with explicit gate validation, transition integrity checks, and idempotency regression tests.

## Iron Law

No workflow refresh without proving gate correctness and idempotent phase progression.

## Core Steps

1. Resolve existing workflow file.
2. Research best-practice patterns (`research-synthesis`; optional `assimilate`).
3. Build RED tests for gate regressions and duplicate transition handling.
4. Apply minimal workflow updates.
5. Verify workflow validation + integration docs + registry references.

## Memory + Search

Use existing memory/search stack for evidence and record updated workflow learnings in memory files.
