# De-Sloppify Skill Workflow

## Overview

This workflow documents the two-phase cleanup process using the de-sloppify skill.

## Trigger

Invoke after implementation completes but before committing a feature:

```javascript
Skill({ skill: 'de-sloppify' });
```

## Phase 1: Implementer (Normal Development)

The implementer works freely. No cleanup anxiety. Write code, add console.logs, leave commented-out experiments. This phase completes when the feature works.

**Output:** Dirty but functional code.

## Phase 2: Cleanup Agent

The cleanup agent runs after implementation:

### Step 1: Snapshot

```bash
git diff HEAD -- {{target_files}} > .claude/context/tmp/pre-cleanup-snapshot.diff
```

### Step 2: Run Scanners

```bash
# Unused imports
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-unused-imports \
  --files "{{comma_separated_file_paths}}"

# Console logs
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-console-logs \
  --files "{{comma_separated_file_paths}}"

# Commented-out code
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-commented-code \
  --files "{{comma_separated_file_paths}}"
```

### Step 3: Conservative Removal

For each confirmed finding — verify, then use `Edit` to remove.
When in doubt: LEAVE IT.

### Step 4: Format and Lint

```bash
cd C:/dev/projects/agent-studio && pnpm lint:fix && pnpm format
```

### Step 5: Verify Diff

```bash
git diff -- {{target_files}}
```

Review: all removals should be dead code or formatting only. No logic changes.

### Step 6: Report

```
De-Sloppify Report
==================
Files processed: N
Unused imports removed: N
Console.logs removed: N
Commented-out blocks removed: N
Formatting fixes: N
```

## Iron Law

**CLEANUP AGENT MUST NOT CHANGE BEHAVIOR.**

Every removal must be verifiable as dead code, unused import, or formatting-only.
If there is any doubt — LEAVE IT.

## Agents

| Agent             | Role                                                 |
| ----------------- | ---------------------------------------------------- |
| `developer`       | Implementer — works freely, invokes cleanup after    |
| `code-simplifier` | Cleanup agent — structural only                      |
| `code-reviewer`   | Recommends de-sloppify when reviewing slop-heavy PRs |
| `qa`              | Verifies cleanup did not alter behavior              |
