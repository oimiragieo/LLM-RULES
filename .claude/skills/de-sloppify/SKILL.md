---
name: de-sloppify
description: Two-agent cleanup pattern. Implementer works freely, then a dedicated cleanup agent removes unused imports, console.logs, commented-out code, dead code, and formatting issues. Produces a diff of what was cleaned.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Grep, Glob]
agents: [developer, code-simplifier, code-reviewer, qa]
category: Quality
tags: [cleanup, code-quality, dead-code, unused-imports, formatting, diff]
best_practices:
  - Always run implementer phase first — cleanup phase only runs on committed/staged work
  - Cleanup agent must not change behavior — structural only
  - Produce a diff so reviewers can verify no logic was altered
  - Run pnpm lint:fix and pnpm format after cleanup completes
error_handling: strict
---

# De-Sloppify

## Overview

De-Sloppify implements a **two-agent pattern** for code cleanup:

1. **Implementer** — works freely, writes code without worrying about polish
2. **Cleanup Agent** — runs after implementation, removes all slop without touching logic

This separation prevents "cleanup anxiety" from slowing down implementation while still producing clean final code.

## When to Use

```javascript
Skill({ skill: 'de-sloppify' });
```

Invoke when:

- Implementation is complete but the code contains known slop (unused imports, leftover console.logs, commented-out code)
- Before committing a feature branch
- After a rapid prototyping session
- As a post-implementation cleanup gate

## Iron Law

```
CLEANUP AGENT MUST NOT CHANGE BEHAVIOR.
Every removal must be verifiable as dead code, unused import,
or formatting-only. If there is any doubt — LEAVE IT.
```

## What Gets Cleaned

| Category                 | Examples                                     | Safe to Remove |
| ------------------------ | -------------------------------------------- | -------------- |
| **Unused imports**       | `import foo from 'foo'` — never referenced   | YES            |
| **console.log / debug**  | `console.log('debug here')`, `console.error` | YES            |
| **Commented-out code**   | `// const old = foo()` (code, not docs)      | YES            |
| **Dead code**            | Unreachable branches, unused variables       | YES            |
| **Trailing whitespace**  | Spaces at end of lines                       | YES            |
| **Extra blank lines**    | 3+ consecutive blank lines                   | YES            |
| **TODO with no context** | `// TODO` (no ticket, no description)        | On flag only   |

## What Must NOT Be Cleaned

| Category                 | Why                                           |
| ------------------------ | --------------------------------------------- |
| Commented doc blocks     | `/** ... */` JSDoc, `/* ... */` section notes |
| `console.error` in catch | May be intentional error logging              |
| Disabled test blocks     | `// it.skip(...)` — intentional               |
| Feature-flag dead code   | May be awaiting activation                    |
| Complex logic            | Even if it looks unused — leave it            |

## Workflow

### Phase 1: Implementer Works Freely

The implementer completes the feature without cleanup overhead. This is normal development.

### Phase 2: Cleanup Agent Runs

After implementation, invoke de-sloppify. The cleanup agent runs these checks in order:

#### Step 1: Snapshot Pre-Cleanup State

**Command:**

```bash
git diff HEAD -- {{target_files}} > C:/dev/projects/agent-studio/.claude/context/tmp/pre-cleanup-snapshot.diff
```

**Expected output:** A diff file capturing current state.

**Verify:** File exists at `.claude/context/tmp/pre-cleanup-snapshot.diff`.

#### Step 2: Find Unused Imports

**Command (JavaScript/TypeScript):**

```bash
node C:/dev/projects/agent-studio/.claude/skills/de-sloppify/scripts/main.cjs \
  --action find-unused-imports \
  --files "{{comma_separated_file_paths}}"
```

**Expected output:** JSON array of `{ file, line, import }` objects for unused imports.

**Verify:** Exit code 0 and valid JSON array.

#### Step 3: Find Console Logs

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/de-sloppify/scripts/main.cjs \
  --action find-console-logs \
  --files "{{comma_separated_file_paths}}"
```

**Expected output:** JSON array of `{ file, line, statement }` objects.

**Verify:** Exit code 0 and valid JSON array.

#### Step 4: Find Commented-Out Code

**Command:**

```bash
node C:/dev/projects/agent-studio/.claude/skills/de-sloppify/scripts/main.cjs \
  --action find-commented-code \
  --files "{{comma_separated_file_paths}}"
```

**Expected output:** JSON array of candidate commented-out code blocks.

**Verify:** Exit code 0 and valid JSON array.

#### Step 5: Apply Cleanup

For each finding that is safe to remove, use `Edit` to remove the line(s). Apply changes conservatively — when in doubt, leave it.

#### Step 6: Format and Lint

**Command:**

```bash
cd C:/dev/projects/agent-studio && pnpm lint:fix && pnpm format
```

**Expected output:** `0 errors, 0 warnings` from lint; no changes from format.

**Verify:** Both commands exit 0 with no output indicating issues.

#### Step 7: Generate Cleanup Diff

**Command:**

```bash
git diff -- {{target_files}}
```

**Expected output:** A diff showing only removals (lines starting with `-`). No additions should appear unless they are indentation fixes.

**Verify:** Review the diff — confirm every removed line was dead code or formatting. If any functional line was removed, revert with `git checkout -- <file>`.

#### Step 8: Report

Produce a cleanup summary:

```
De-Sloppify Report
==================
Files processed: N
Unused imports removed: N
Console.logs removed: N
Commented-out code blocks removed: N
Dead code blocks removed: N
Formatting fixes applied: N

Diff: git diff HEAD -- <files>
```

## Anti-Patterns

- Never remove a `console.error` inside a catch block without confirming it is debug-only
- Never remove commented code that contains a ticket reference or TODO explanation
- Never run cleanup on uncommitted work from the implementer — take a snapshot first
- Never combine cleanup and logic changes in the same commit
- Never use regex to find "unused" code — use the CLI scanner or lint output only

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook (`hooks/pre-execute.cjs`) validates:

- `action` is a known enum value
- `files` is a non-empty array of paths

Post-execution hook (`hooks/post-execute.cjs`) emits observability event to `.claude/context/runtime/tool-events.jsonl`.

## Assigned Agents

- `developer` — runs cleanup after implementation
- `code-simplifier` — incorporates de-sloppify as a cleanup step
- `code-reviewer` — recommends de-sloppify when reviewing slop-heavy PRs
- `qa` — verifies cleanup did not alter behavior

## Memory Protocol

**Before starting:** Read `.claude/context/memory/learnings.md` for cleanup patterns specific to this codebase.

**After completing:** Append summary to `.claude/context/memory/learnings.md`:

```
**de-sloppify** — [date] Cleaned N files. Removed: M unused imports, K console.logs, J commented blocks.
```

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Related Skills

- `code-simplifier` — structural refactoring (de-sloppify is style-only)
- `finishing-a-development-branch` — includes de-sloppify as a phase
- `codebase-cleaner` — broader cleanup including file-level slop
