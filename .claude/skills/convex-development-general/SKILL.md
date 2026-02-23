---
name: convex-development-general
version: 1.1.0
category: "External Integrations"
agents: [developer]
tags: [convex, backend, realtime, database, serverless]
description: Applies general rules for Convex development, emphasizing schema design, validator usage, and correct handling of system fields.
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: "**/convex/**/*.*"
best_practices:
  - Follow the guidelines consistently
  - Apply rules during code review
  - Use as reference when writing new code
error_handling: graceful
streaming: supported
---

# Convex Development General Skill

<identity>
You are a coding standards expert specializing in convex development general.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for guideline compliance
- Suggest improvements based on best practices
- Explain why certain patterns are preferred
- Help refactor code to meet standards
</capabilities>

<instructions>
When reviewing or writing code, apply these guidelines:

- When working with Convex, prioritize correct schema definition using the `v` validator.
- Be aware of the automatically-generated system fields `_id` and `_creationTime`.
- See https://docs.convex.dev/database/types for available types.
  </instructions>

<examples>
Example usage:
```
User: "Review this code for convex development general compliance"
Agent: [Analyzes code against guidelines and provides specific feedback]
```
</examples>

## Iron Laws

1. **ALWAYS** define document schemas using Convex `v` validators — never rely on raw TypeScript types alone for runtime-enforced schema correctness.
2. **NEVER** manually include `_id` or `_creationTime` fields in schema definitions — they are automatically generated system fields and specifying them causes errors.
3. **ALWAYS** use `v.id("tableName")` for cross-document references — never store foreign keys as plain strings, which bypasses Convex's referential integrity tools.
4. **NEVER** perform direct database mutations from client-side code — all mutations must be defined as Convex mutation functions in the `convex/` directory.
5. **ALWAYS** add a `.take(n)` or pagination cursor to queries on potentially unbounded tables — never use `.collect()` without a limit on production data.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Using plain TypeScript interfaces as schema definitions | TypeScript types are compile-time only; Convex `v` validators enforce runtime shape and generate type-safe accessors | Define all table schemas with `defineTable(v.object({...}))` |
| Adding `_id` or `_creationTime` to defineTable schemas | Convex rejects schemas that include system fields, causing runtime initialization errors | Omit system fields; access them via `doc._id` and `doc._creationTime` after query |
| Storing cross-document references as plain `v.string()` | Loses Convex's cross-reference validation and type inference for joined queries | Use `v.id("tableName")` so Convex validates the reference type |
| Running `.collect()` on large tables without pagination | Returns all documents, causing memory spikes and timeouts on large datasets | Use `.paginate(opts)` or `.take(100)` with cursor-based pagination |
| Writing to the database from React client code directly | Bypasses access control, validation, and audit trail; creates untraceable mutations | All writes must go through a Convex `mutation` function in `convex/` |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
