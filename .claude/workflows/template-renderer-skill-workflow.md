# Template Renderer Skill Workflow

## Overview

This workflow demonstrates how to use the **template-renderer** skill.

## Skill Location

`.claude/skills/template-renderer/SKILL.md`

## Invocation Methods

### Method 1: Slash Command (User-Invocable)

```
/template-renderer [arguments]
```

### Method 2: Via Agent Assignment

Agents with this skill in their `skills:` frontmatter can use it automatically.

### Method 3: Direct Script Execution

```bash
node .claude/skills/template-renderer/scripts/main.cjs --help
```

## Example Usage

1. **Basic Invocation**

   ```
   /template-renderer
   ```

2. **With Arguments**

   ```
   /template-renderer --option value
   ```

## Assigning to Agents

To give an agent this skill, add to the agent's frontmatter:

```yaml
skills:
  - template-renderer
```

Or use the CLI:

```bash
node .claude/skills/skill-creator/scripts/create.cjs --assign "template-renderer" --agent "developer"
```

## Memory Integration

This skill follows the Memory Protocol:

- Reads: `.claude/context/memory/learnings.md`
- Writes to: `learnings.md`, `issues.md`, or `decisions.md`
