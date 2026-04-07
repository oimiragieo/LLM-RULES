---
name: template-updater
description: Research-backed template refresh workflow for updating existing templates with placeholder verification and rendering validation.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord]
args: '--template <name-or-path> [--trigger reflection|evolve|manual|stale] [--mode plan|execute]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-04-07'
dependencies: [research-synthesis]
category: framework-management
tags: [templates, updater, maintenance, framework]
aliases: [update-template, refresh-template]
---

# Template Updater

## Overview

Use this skill to refresh an existing template safely: research current best practices, compare against current implementation, verify placeholder completeness, apply updates, and validate rendering.

## When to Use

- Template produces outdated or incorrect output when rendered
- New framework conventions make template content stale
- Reflection flags template quality issues
- User asks to audit/refresh an existing template

## The Iron Law

Never update a template blindly. Every refresh must be evidence-backed, TDD-gated, and integration-validated.

## Workflow

### Step 0: Evaluate Current State

1. Read the template file and understand its purpose
2. Identify all `{{PLACEHOLDER}}` tokens and their expected values
3. Check which creators/skills use this template
4. Identify issues: missing placeholders, outdated content, wrong structure

### Step 1: Research Best Practices

1. Read `.claude/templates/CLAUDE.md` for template conventions
2. Review similar templates for patterns
3. Check the `template-renderer` skill for rendering expectations
4. Use `Skill({ skill: 'research-synthesis' })` if external research needed

### Step 2: Generate Patch Backlog

1. List specific changes needed
2. Prioritize: structural fixes > content updates > formatting improvements
3. Ensure all placeholders are documented

### Step 3: Apply Updates

1. Write or update rendering tests first (RED phase)
2. Apply template changes (GREEN phase)
3. Refactor for clarity (REFACTOR phase)
4. Use `Edit` tool — never rewrite the entire file

### Step 4: Verify Integration

1. Verify all `{{PLACEHOLDER}}` tokens are documented in the template header
2. Test rendering with `Skill({ skill: 'template-renderer' })`
3. Verify output matches expected structure for the artifact type
4. Run `pnpm lint:fix && pnpm format`

### Step 5: Record

1. Log changes via `MemoryRecord` if significant
2. Update CHANGELOG.md entry

## Domain-Specific Validation

- All `{{PLACEHOLDER}}` tokens MUST be documented with description and example
- Template MUST render without errors when all placeholders are provided
- Template output MUST match the target artifact's expected structure
- Conditional sections MUST handle missing optional placeholders gracefully

## Anti-Patterns

- Adding placeholders without documenting them
- Hardcoding values that should be placeholders
- Breaking the template's rendering by changing placeholder names
- Removing sections that creators depend on
