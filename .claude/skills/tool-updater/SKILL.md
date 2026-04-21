---
name: tool-updater
description: Research-backed CLI tool refresh workflow for updating existing tools with TDD checkpoints and CLI invocation validation.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord]
args: '--tool <name-or-path> [--trigger reflection|evolve|manual|stale] [--mode plan|execute]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-04-07'
dependencies: [research-synthesis]
category: framework-management
tags: [tools, cli, updater, maintenance, framework]
aliases: [update-tool, refresh-tool]
source: builtin
trust_score: 100
provenance_sha: 414c640407561b93
---

# Tool Updater

## Overview

Use this skill to refresh an existing CLI tool safely: research current best practices, compare against current implementation, generate a TDD patch backlog, apply updates, and verify CLI invocation.

## When to Use

- Tool has broken require() paths or runtime errors
- Tool's CLI interface needs updating (new flags, changed behavior)
- Reflection flags stale or low-performing tool
- User asks to audit/refresh an existing tool

## The Iron Law

Never update a tool blindly. Every refresh must be evidence-backed, TDD-gated, and integration-validated.

## Workflow

### Step 0: Evaluate Current State

1. Read the tool file and understand its purpose
2. Check if it's registered in package.json scripts
3. Test `node <tool-path> --help` for CLI interface
4. Identify issues: broken requires, missing error handling, stale logic

### Step 1: Research Best Practices

1. Read `.claude/tools/cli/CLAUDE.md` for tool conventions
2. Review similar tools for patterns (especially `cli-wrapper.cjs` usage)
3. Check if tool uses `wrapCLITool()` from `../../lib/utils/cli-wrapper.cjs`
4. Use `Skill({ skill: 'research-synthesis' })` if external research needed

### Step 2: Generate Patch Backlog

1. List specific changes needed
2. Prioritize: broken requires > CLI interface > error handling > logic
3. Estimate scope: <30 lines = auto-apply, >30 lines = plan mode

### Step 3: Apply Updates

1. Write or update tests first (RED phase)
2. Apply tool changes (GREEN phase)
3. Refactor for clarity (REFACTOR phase)
4. Use `Edit` tool — never rewrite the entire file

### Step 4: Verify Integration

1. Verify tool loads without MODULE_NOT_FOUND errors
2. Verify `--help` output is correct and complete
3. Verify tool handles missing args gracefully (exit 1 with usage)
4. If CLI tool, verify package.json script entry exists or add one
5. Run `pnpm lint:fix && pnpm format`
6. Run tool-specific tests

### Step 5: Record

1. Log changes via `MemoryRecord` if significant
2. Update CHANGELOG.md entry

## Domain-Specific Validation

- Tool MUST load without MODULE_NOT_FOUND errors
- Tool MUST handle `--help` flag and missing arguments gracefully
- Tool require() paths MUST be file-relative, not CWD-relative
- Tool MUST use `shell: false` for any child process spawning (SE security rule)
- Tool SHOULD use `wrapCLITool()` for consistent CLI behavior
- Tool SHOULD be registered in package.json if user-facing

## Anti-Patterns

- Using CWD-relative requires (`./.claude/lib/...`) instead of file-relative (`../../lib/...`)
- Swallowing errors silently in catch blocks
- Hardcoding paths that should be computed from `__dirname`
- Using `shell: true` in spawn/exec calls
