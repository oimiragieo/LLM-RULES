# Context Compressor Skill Workflow (Legacy Progressive-Disclosure Alias)

## Overview

This workflow demonstrates how to use the **context-compressor** skill (the active replacement for legacy progressive-disclosure usage).

## Skill Location

`.claude/skills/context-compressor/SKILL.md`

## Invocation Methods

### Method 1: Slash Command (User-Invocable)

```
/context-compressor [arguments]
```

### Method 2: Via Agent Assignment

Agents with this skill in their `skills:` frontmatter can use it automatically.

### Method 3: Direct Script Execution

```bash
node .claude/skills/context-compressor/scripts/main.cjs --help
```

## Example Usage

1. **Basic Invocation**

   ```
    /context-compressor
   ```

2. **With Arguments**
   ```
    /context-compressor --option value
   ```

## Assigning to Agents

To give an agent this skill, add to the agent's frontmatter:

```yaml
skills:
  - context-compressor
```

Or use the CLI:

```bash
node .claude/skills/skill-creator/scripts/create.cjs --assign "context-compressor" --agent "developer"
```

## Memory Integration

This skill follows the Memory Protocol:

- Reads: `.claude/context/memory/learnings.md`
- Writes to: `learnings.md`, `issues.md`, or `decisions.md`
