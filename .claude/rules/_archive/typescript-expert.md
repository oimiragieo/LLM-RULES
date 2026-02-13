---
paths:
  - .claude/skills/typescript-expert/**
---

# TypeScript Expert Rules

## Core Principles

- Use TypeScript for all code (prefer TypeScript over JavaScript)
- Prefer interfaces over types; avoid enums, use maps instead
- Use modern JavaScript/TypeScript features and best practices
- Prefer functional programming patterns; minimize use of classes
- Use descriptive variable names (e.g., isExtensionEnabled, hasPermission)

## Type Safety Standards

- Provide appropriate type definitions and interfaces for all code
- Avoid `any` types; use proper type annotations
- Use strict TypeScript compiler settings
- Implement generic types where appropriate
- Use type guards for runtime type checking

## Code Structure

- File structure: Exported component, subcomponents, helpers, static content, types
- Use "function" keyword for pure functions; omit semicolons
- Avoid unnecessary curly braces in conditional statements
- For single-line statements, omit curly braces
- Use concise, one-line syntax for simple conditionals (e.g., `if (condition) doSomething()`)

## Integration Points

- Used by: `typescript-pro`, `frontend-pro`, `nodejs-pro`, `developer` (TypeScript projects)
- Related skills: `react-expert`, `nextjs-expert`, `nodejs-expert`
- Works with: `code-quality-expert`, `tdd`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
