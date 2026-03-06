# Chrome Browser Skill Workflow

## Overview

This workflow demonstrates how to use the **chrome-browser** skill.

## Skill Location

`.claude/skills/chrome-browser/SKILL.md`

## Invocation Methods

### Method 1: Slash Command (User-Invocable)

```
/chrome-browser [arguments]
```

### Method 2: Via Agent Assignment

Agents with this skill in their `skills:` frontmatter can use it automatically.

### Method 3: Direct Script Execution

```bash
node .claude/skills/chrome-browser/scripts/main.cjs --help
```

## Example Usage

1. **Basic Invocation**

   ```
   /chrome-browser
   ```

2. **With Arguments**

   ```
   /chrome-browser --option value
   ```

## Assigning to Agents

To give an agent this skill, add to the agent's frontmatter:

```yaml
skills:
  - chrome-browser
```

Or use the CLI:

```bash
node .claude/skills/skill-creator/scripts/create.cjs --assign "chrome-browser" --agent "developer"
```

## Memory Integration

This skill follows the Memory Protocol:

- Reads: `.claude/context/memory/learnings.md`
- Writes to: `learnings.md`, `issues.md`, or `decisions.md`
