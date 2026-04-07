---
name: hook-updater
description: Research-backed hook refresh workflow for updating existing hooks with TDD checkpoints and settings.json registration validation.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord]
args: '--hook <name-or-path> [--trigger reflection|evolve|manual|stale] [--mode plan|execute]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-04-07'
dependencies: [research-synthesis]
category: framework-management
tags: [hooks, updater, maintenance, framework]
aliases: [update-hook, refresh-hook]
---

# Hook Updater

## Overview

Use this skill to refresh an existing hook safely: research current best practices, compare against current implementation, generate a TDD patch backlog, apply updates, and verify ecosystem integration including settings.json registration.

## When to Use

- Reflection flags stale or malfunctioning hook behavior
- EVOLVE determines hook capability exists but quality is outdated
- User asks to audit/refresh an existing hook
- Hook exit code or stdin protocol issues detected

## The Iron Law

Never update a hook blindly. Every refresh must be evidence-backed, TDD-gated, and integration-validated.

## Workflow

### Step 0: Evaluate Current State

1. Read the hook file and understand its purpose
2. Check settings.json registration (which events, which matchers)
3. Run existing tests if they exist
4. Identify issues: wrong API pattern, missing registration, broken requires

### Step 1: Research Best Practices

1. Read `.claude/hooks/CLAUDE.md` for hook conventions
2. Review similar hooks in the same category for patterns
3. Check `.claude/rules/hooks.md` for hook rules
4. Use `Skill({ skill: 'research-synthesis' })` if external research needed

### Step 2: Generate Patch Backlog

1. List specific changes needed (TDD-style: test first, then implement)
2. Prioritize by risk: registration fixes > exit code fixes > logic improvements
3. Estimate scope: <30 lines = auto-apply, >30 lines = plan mode

### Step 3: Apply Updates

1. Write or update tests first (RED phase)
2. Apply hook changes (GREEN phase)
3. Refactor for clarity (REFACTOR phase)
4. Use `Edit` tool — never rewrite the entire file

### Step 4: Verify Integration

1. Confirm hook is registered in `.claude/settings.json` for correct events
2. Verify hook exit codes: 0=allow, 2=block, 1=error (SE-03)
3. Verify stdin JSON parsing follows the standard protocol
4. Run `pnpm lint:fix && pnpm format`
5. Run hook-specific tests

### Step 5: Record

1. Log changes via `MemoryRecord` if significant
2. Update CHANGELOG.md entry

## Domain-Specific Validation

- Hook MUST be registered in settings.json under appropriate event
- Hook MUST use stdin JSON protocol (not programmatic function exports)
- Hook MUST exit 0 (allow) or 2 (block) — never exit 1 for blocking
- Hook MUST wrap body in try/catch, exit 0 on unexpected errors (SE-03)
- Hook require() paths MUST be file-relative (../../lib/...), not CWD-relative

## Anti-Patterns

- Updating a hook without checking its settings.json registration
- Changing exit codes without understanding the 0/1/2 semantics
- Converting a stdin-protocol hook to programmatic API (or vice versa)
- Removing error handling to "simplify" the hook
