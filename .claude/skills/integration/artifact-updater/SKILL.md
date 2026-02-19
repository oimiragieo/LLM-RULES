---
name: artifact-updater
description: Update existing artifacts (skills, agents, hooks, workflows, templates, schemas, commands, rules, tools) with proper validation and integration
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash]
args: '--type <artifact-type> --path <artifact-path> [--changes <description>]'
best_practices:
  - Always validate artifact exists before updating
  - Run post-update integration checklist
  - Queue cross-creator review for breaking changes
error_handling: graceful
streaming: supported
verified: false
lastVerifiedAt: 2026-02-19T05:29:09.098Z
---

# Artifact Updater

```
+======================================================================+
|  WARNING: ARTIFACT UPDATE WORKFLOW IS MANDATORY - READ THIS FIRST    |
+======================================================================+
|                                                                      |
|  This skill updates existing artifacts with proper validation:       |
|    1. Detect artifact type (skill/agent/hook/workflow/etc)          |
|    2. Load and validate existing artifact                           |
|    3. Apply requested changes                                       |
|    4. Run post-update integration checklist                         |
|    5. Queue cross-creator review if needed                          |
|                                                                      |
|  DO NOT edit artifact files directly - use this skill instead.       |
|                                                                      |
+======================================================================+
```

## Purpose

Unified workflow for updating existing artifacts across all creator types. Replaces ghost updater skills (agent-updater, skill-updater, hook-updater, workflow-updater, schema-updater).

## When to Use

- Updating an existing skill, agent, hook, workflow, template, schema, command, rule, or tool
- Modifying artifact frontmatter or metadata
- Adding new sections to existing artifacts
- Deprecating or archiving artifacts

## Workflow

### Step 1: Detect Artifact Type

Determine what type of artifact is being updated based on file path:

| Path Pattern                   | Artifact Type | Creator Skill    |
| ------------------------------ | ------------- | ---------------- |
| `.claude/skills/**/SKILL.md`   | skill         | skill-creator    |
| `.claude/agents/**/*.md`       | agent         | agent-creator    |
| `.claude/hooks/**/*.cjs`       | hook          | hook-creator     |
| `.claude/workflows/**/*.md`    | workflow      | workflow-creator |
| `.claude/templates/**/*`       | template      | template-creator |
| `.claude/schemas/**/*.json`    | schema        | schema-creator   |
| `.claude/commands/*.md`        | command       | command-creator  |
| `.claude/rules/*.md`           | rule          | rule-creator     |
| `.claude/tools/**/*.{cjs,mjs}` | tool          | tool-creator     |

### Step 2: Load and Validate Existing Artifact

```javascript
const { readFile } = require('fs/promises');
const path = require('path');

async function loadArtifact(artifactPath) {
  // Verify artifact exists
  const content = await readFile(artifactPath, 'utf-8');

  // Parse frontmatter (for skills, agents, commands, schemas)
  // Validate structure

  return { content, metadata };
}
```

### Step 3: Apply Changes

Based on change type:

**Frontmatter Update:**

```javascript
// Parse YAML frontmatter
// Update specified fields
// Preserve existing fields
// Rewrite with updated frontmatter
```

**Content Update:**

```javascript
// Load full content
// Apply requested modifications
// Preserve structure and formatting
// Write back
```

**Deprecation:**

```javascript
// Add deprecation notice to frontmatter
// Add deprecation warning to content
// DO NOT delete file (breaks references)
```

### Step 4: Run Post-Update Integration Checklist

```javascript
const { runIntegrationChecklist } = require('.claude/lib/creator-commons.cjs');

// Run integration checklist for this artifact type
const result = await runIntegrationChecklist(artifactType, artifactPath);

// Check for failures
if (result.mustHave.some(item => !item.passed)) {
  console.error(
    'Post-update integration failed:',
    result.mustHave.filter(i => !i.passed)
  );
}
```

Integration checklist verifies:

- Catalog/registry entry still exists and is valid
- CLAUDE.md references updated if needed
- Agent assignments still valid
- No broken cross-references introduced

### Step 5: Queue Cross-Creator Review

```javascript
const { queueCrossCreatorReview } = require('.claude/lib/creator-commons.cjs');

// Queue for review if breaking changes detected
if (isBreakingChange(changes)) {
  await queueCrossCreatorReview(artifactType, artifactPath, {
    changeType: 'update',
    description: changeDescription,
    breakingChanges: true,
  });
}
```

## Breaking Changes Detection

Changes that require cross-creator review:

**Skills:**

- Removing or renaming a skill
- Changing skill frontmatter `name` field
- Removing required arguments

**Agents:**

- Changing agent routing keywords
- Modifying agent type (core/domain/specialized)
- Removing assigned skills

**Hooks:**

- Changing hook lifecycle (PreToolUse → PostToolUse)
- Modifying validation logic (blocking → non-blocking)
- Removing environment variable support

**Workflows:**

- Removing workflow phases
- Changing phase dependencies
- Modifying quality gates

**Schemas:**

- Removing required fields
- Changing field types
- Making fields non-nullable

## Usage Examples

### Update Skill Frontmatter

```bash
Skill({
  skill: 'artifact-updater',
  args: '--type skill --path .claude/skills/tdd/SKILL.md --changes "Add new tool: TaskUpdate"'
})
```

### Update Agent Description

```bash
Skill({
  skill: 'artifact-updater',
  args: '--type agent --path .claude/agents/core/developer.md --changes "Add TDD workflow reference"'
})
```

### Deprecate Hook

```bash
Skill({
  skill: 'artifact-updater',
  args: '--type hook --path .claude/hooks/old-hook.cjs --changes "Deprecate in favor of new-hook.cjs"'
})
```

## Related Skills

- `skill-creator` - Create new skills
- `agent-creator` - Create new agents
- `hook-creator` - Create new hooks
- `workflow-creator` - Create new workflows
- `artifact-integrator` - Deep integration analysis

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New update pattern → `.claude/context/memory/learnings.md`
- Update issue found → `.claude/context/memory/issues.md`
- Breaking change decision → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
