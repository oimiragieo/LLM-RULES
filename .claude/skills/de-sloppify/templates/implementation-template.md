# De-Sloppify — Implementation Template

Use this template when integrating de-sloppify into a cleanup workflow after implementation.

## Pre-Cleanup: Snapshot Current State

```bash
# Snapshot current changes before cleanup
git diff HEAD -- {{target_files}} > C:/dev/projects/agent-studio/.claude/context/tmp/pre-cleanup-snapshot.diff
```

**Verify:** File exists at `.claude/context/tmp/pre-cleanup-snapshot.diff`.

## Phase 1: Scan for Slop

Run all three scanners on target files:

```bash
# Step 1: Find unused imports
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-unused-imports \
  --files "{{comma_separated_file_paths}}"

# Step 2: Find console logs
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-console-logs \
  --files "{{comma_separated_file_paths}}"

# Step 3: Find commented-out code
node .claude/skills/de-sloppify/scripts/main.cjs \
  --action find-commented-code \
  --files "{{comma_separated_file_paths}}"
```

**Expected output for each:** JSON array (may be empty `[]` if no findings).

## Phase 2: Review Findings

For each finding, verify it is safe to remove:

- Unused imports: Confirm the identifier truly does not appear elsewhere in the file
- Console logs: Confirm it is not inside a catch block (for console.error)
- Commented code: Confirm it has no ticket reference, TODO explanation, or `it.skip` pattern

**When in doubt — LEAVE IT.**

## Phase 3: Apply Cleanup

For each confirmed finding, use `Edit` to remove the specific line(s).
Apply conservatively — one finding at a time.

## Phase 4: Format and Lint

```bash
cd C:/dev/projects/agent-studio && pnpm lint:fix && pnpm format
```

**Expected:** Exit 0 with no errors.

## Phase 5: Verify Diff

```bash
git diff -- {{target_files}}
```

**Expected:** Only removals (lines starting with `-`). No additions except indentation fixes.
Review every removed line — confirm it was dead code or formatting only.

## Phase 6: Report

```
De-Sloppify Report
==================
Files processed: N
Unused imports removed: N
Console.logs removed: N
Commented-out code blocks removed: N
Formatting fixes: N
```

## Agent Roles

- **Implementer**: Works freely, writes code. Does not clean up.
- **Cleanup Agent**: Invokes this skill after implementation. Does NOT touch logic.
