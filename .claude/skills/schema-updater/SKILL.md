---
name: schema-updater
description: Research-backed JSON Schema refresh workflow for updating existing schemas with validation checkpoints and cross-reference verification.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, MemoryRecord]
args: '--schema <name-or-path> [--trigger reflection|evolve|manual|stale] [--mode plan|execute]'
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-04-07'
dependencies: [research-synthesis]
category: framework-management
tags: [schemas, updater, maintenance, framework, json-schema]
aliases: [update-schema, refresh-schema]
---

# Schema Updater

## Overview

Use this skill to refresh an existing JSON Schema safely: research current best practices, compare against the artifact it validates, generate a TDD patch backlog, apply updates, and verify ecosystem integration.

## When to Use

- Schema no longer matches the artifact structure it validates
- New fields added to skills/agents/hooks/workflows but schema not updated
- Reflection flags schema validation failures
- User asks to audit/refresh an existing schema

## The Iron Law

Never update a schema blindly. Every refresh must be evidence-backed, TDD-gated, and integration-validated.

## Workflow

### Step 0: Evaluate Current State

1. Read the schema file and understand what it validates
2. Find the artifacts it validates (skills, agents, hooks, workflows)
3. Compare schema required fields against actual artifact structure
4. Identify gaps: missing fields, wrong types, stale descriptions

### Step 1: Research Best Practices

1. Read `.claude/schemas/CLAUDE.md` for schema conventions
2. Review similar schemas for patterns
3. Check JSON Schema Draft-07 specification compliance
4. Use `Skill({ skill: 'research-synthesis' })` if external research needed

### Step 2: Generate Patch Backlog

1. List specific changes needed
2. Prioritize: required field additions > type corrections > description updates
3. Ensure backward compatibility where possible

### Step 3: Apply Updates

1. Write or update validation tests first (RED phase)
2. Apply schema changes (GREEN phase)
3. Refactor for clarity (REFACTOR phase)
4. Use `Edit` tool — never rewrite the entire file

### Step 4: Verify Integration

1. Verify schema is valid JSON Schema Draft-07
2. Verify `$id` and `$schema` fields are present and correct
3. Validate at least 3 existing artifacts against the updated schema
4. Run `pnpm lint:fix && pnpm format`
5. Run schema validation tests

### Step 5: Record

1. Log changes via `MemoryRecord` if significant
2. Update CHANGELOG.md entry

## Domain-Specific Validation

- Schema MUST be valid JSON Schema Draft-07 (`$schema: "http://json-schema.org/draft-07/schema#"`)
- Schema MUST have `$id` field matching its file path
- Schema MUST be referenced by at least one validator or test
- Required fields MUST match actual artifact structure
- Default values MUST match framework conventions

## Anti-Patterns

- Adding required fields that break existing valid artifacts
- Removing fields without checking all consumers
- Using features beyond Draft-07 (e.g., Draft-2020-12 `prefixItems`)
- Making the schema so strict it rejects valid edge cases
