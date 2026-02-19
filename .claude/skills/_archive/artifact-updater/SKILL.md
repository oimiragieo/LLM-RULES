---
name: artifact-updater
description: Unified maintenance workflow for updating existing framework artifacts (agents, skills, hooks, workflows). Enforces regression-safe delivery and automatic integration updates.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
best_practices:
  - Always verify artifact exists before updating
  - Use TDD: write regression tests for the reported issue/drift
  - Regenerate relevant registries after update
verified: false
lastVerifiedAt: 2026-02-19T05:29:09.098Z
---

# Artifact Updater Skill

Unified maintenance for all framework artifacts.

## Overview

As the ecosystem evolves, artifacts drift from current standards. This skill provides a single point of entry for refreshing any artifact while ensuring all downstream registries and documentation remain in sync.

## Workflow

### Step 0: Existence Check

```bash
test -f {{ARTIFACT_PATH}} && echo "EXISTS" || echo "NOT_FOUND"
```

### Step 1: Research

Research best practices for the target domain if the update is complex.

### Step 2: Update

Apply changes using `Edit` or `Write` tools.

### Step 3: Integrate

Regenerate relevant registries:

- Agent registry for agents
- Skill index for skills
- Command catalog for commands

## Memory Protocol (MANDATORY)

Standard memory protocol applies.
