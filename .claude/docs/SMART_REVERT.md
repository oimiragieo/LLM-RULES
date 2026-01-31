# Smart Revert Guide

## Overview

Smart revert enables feature-level rollback using git notes metadata.

Instead of reverting individual commits by hash, you can:

- Revert entire features by name
- Revert entire bugs by ID
- Revert with dependency checking
- Revert with automatic correct sequencing

## How It Works

### Step 1: Logical Unit Detection

Commits grouped by Task ID from git notes:

```
Task #6 (Dark Mode):
  - abc123: Add dark mode toggle
  - def456: Update all components for dark mode

Task #7 (Button Refactor):
  - ghi789: Refactor button component
  - jkl012: Update button tests
  - mno345: Update button documentation
```

### Step 2: Dependency Checking

System checks: Does anything depend on this feature?

```
Want to revert: Task #6 (Dark Mode)
Depends on it: None
Dependent on it: None
→ Safe to revert
```

```
Want to revert: Task #7 (Button Refactor)
Depends on it: Task #8 (uses new button API)
→ Warn: Reverting will break Task #8
```

### Step 3: Revert Execution

Commits reverted in **reverse order** (newest first):

```bash
# For Task #6 (Dark Mode):
git revert -n def456  # Newest first
git revert -n abc123  # Oldest last

# This prevents conflicts
```

### Step 4: Verification

```
✓ Reverts successful
✓ No merge conflicts
✓ Ready to commit (git commit -m "Revert dark mode")
✓ Audit trail preserved (git notes attached)
```

## Usage

### Revert by Feature Name

```
User: "Revert the dark mode feature"

System:
1. Search git notes for "dark mode"
2. Find related commits via logical-unit-tracker
3. Check dependencies
4. Execute reverts
5. Show result
```

**Example:**

```bash
$ node .claude/lib/utils/logical-unit-tracker.cjs revert-by-name "dark mode"

Found Task #6: Dark Mode (2 commits)
  - abc123: Add dark mode toggle
  - def456: Update components for dark mode

Checking dependencies...
  No dependencies found. Safe to revert.

Revert these commits? (yes/no): yes

Reverting in reverse order...
  [1/2] Reverting def456... ✓
  [2/2] Reverting abc123... ✓

Success! Dark mode feature reverted.
Ready to commit? Run: git commit -m "Revert dark mode feature"
```

### Revert by Task ID

```
User: "Revert task #6"

System:
1. Lookup Task #6 from git notes
2. Group all related commits
3. Execute reverts in reverse order
4. Verify success
```

**Example:**

```bash
$ node .claude/lib/utils/logical-unit-tracker.cjs revert-task 6

Task #6: Dark Mode (2 commits)
  Dependencies: None
  Dependents: None

Reverting...
  [1/2] Reverting def456... ✓
  [2/2] Reverting abc123... ✓

Success! Task #6 reverted.
```

### Interactive Selection

```
User: "Show me what I can revert"

System:
1. List all tasks with commits
2. Show dependency graph
3. User selects which to revert
4. Confirm before executing
```

**Example:**

```bash
$ node .claude/lib/utils/logical-unit-tracker.cjs list-tasks

Available tasks to revert:

  [6] Dark Mode (2 commits)
      - No dependencies
      - No dependents
      - Safe to revert

  [7] Button Refactor (3 commits)
      - Depends on: None
      - Dependents: Task #8 (Modal)
      - Warning: Reverting will break Task #8

  [8] Modal Component (1 commit)
      - Depends on: Task #7
      - Dependents: None
      - Cannot revert without reverting Task #7 first

Select task to revert (6, 7, 8): 6
```

## Best Practices

1. **Use descriptive task IDs** - Makes feature identification easier
2. **Keep commits atomic** - One logical change per commit
3. **Attach git notes** - Enables logical unit tracking (automatic with git-notes-audit hook)
4. **Check dependencies** - Always review before reverting
5. **Test after revert** - Run tests to ensure clean state

## Troubleshooting

### No Git Notes Found

**Symptom**: "Can't find commits for feature X"

**Cause**: Feature predates git-notes-audit hook

**Solution**:

1. Manually add git notes for commits:
   ```bash
   git notes add -m "TASK-#6: Dark Mode" abc123
   git notes add -m "TASK-#6: Dark Mode" def456
   ```
2. Or revert by commit hash (old method):
   ```bash
   git revert def456 abc123
   ```

### Dependency Conflicts

**Symptom**: "Revert failed: other features depend on this"

**Options:**

1. Revert dependent features first:
   ```bash
   # Revert Task #8 (depends on #7)
   node .claude/lib/utils/logical-unit-tracker.cjs revert-task 8
   # Then revert Task #7
   node .claude/lib/utils/logical-unit-tracker.cjs revert-task 7
   ```
2. Just disable the feature (don't revert):
   - Add feature flag
   - Set to disabled
3. Cherry-pick specific fixes instead:
   ```bash
   git cherry-pick <sha-of-fix>
   ```

### Revert Conflicts

**Symptom**: "Merge conflicts during revert"

**Resolution:**

1. Resolve conflicts manually:
   ```bash
   # Edit conflicted files
   git add .
   git revert --continue
   ```
2. Or abort and handle differently:
   ```bash
   git revert --abort
   # Try reverting individual commits
   ```

## Examples

### Example 1: Revert Dark Mode Feature

```bash
# Commits for Task #6 (Dark Mode):
# abc123: Add theme toggle
# def456: Update components
# ghi789: Fix CSS issues

User: "Revert dark mode"

System:
1. Find commits: abc123, def456, ghi789
2. Check dependencies: None found
3. Confirm: "Revert 3 commits? [yes/no]"
4. Execute: git revert -n ghi789 def456 abc123 (reverse)
5. Result: "3 reverts applied. Ready to commit."

# User commits the revert:
$ git commit -m "Revert dark mode feature"
```

### Example 2: Revert Blocked by Dependency

```bash
# Task #7 (Button Refactor) blocks Task #8 (Uses new button)

User: "Revert button refactor"

System:
1. Find commits for Task #7
2. Check dependencies: Task #8 depends on this
3. Warn: "Task #8 (New Modal) uses this button. Revert anyway?"
4. Options:
   A) Revert both #7 and #8
   B) Don't revert
   C) Manual revert (handle conflicts yourself)

User: "A" (revert both)

System:
1. Revert Task #8 first (dependent)
2. Then revert Task #7 (dependency)
3. Result: "Both tasks reverted successfully."
```

### Example 3: Revert with Merge Conflict

```bash
# Task #6 conflicts with later changes

User: "Revert task #6"

System:
1. Find commits for Task #6
2. Execute revert
3. Conflict detected!

Output:
  CONFLICT (content): Merge conflict in src/theme.css

  Revert paused. To resolve:
  1. Edit src/theme.css to resolve conflict
  2. Run: git add src/theme.css
  3. Run: git revert --continue

User: [resolves conflict]
$ git add src/theme.css
$ git revert --continue

System:
  Revert completed successfully.
```

## API Reference

### Node.js API

```javascript
const logicalUnitTracker = require('./.claude/lib/utils/logical-unit-tracker.cjs');

// Group commits by task
const groups = await logicalUnitTracker.groupByTask(repoPath, 'HEAD~10..HEAD');
// Returns: { "6": [{hash, message, note, metadata}], "7": [...] }

// Find dependencies
const deps = await logicalUnitTracker.findDependencies(repoPath, '7', {
  transitive: true, // Include transitive dependencies
});
// Returns: ["6"] if Task #7 depends on Task #6

// Check revert safety
const safety = await logicalUnitTracker.checkRevertSafety(repoPath, '6', {
  force: false, // Set to true to bypass safety checks
});
// Returns: { safe: boolean, blockers: [], warning: string, warnings: [] }

// Revert entire task
const result = await logicalUnitTracker.revertTask(repoPath, '6');
// Returns: { success: boolean, conflicts: boolean, message: string }

// Find task by name
const tasks = await logicalUnitTracker.findTaskByName(repoPath, 'Dark Mode');
// Returns: ["6"] if Task #6 has "Dark Mode" in git notes
```

### Command Line Interface

```bash
# List available tasks
node .claude/lib/utils/logical-unit-tracker.cjs list-tasks

# Revert by task ID
node .claude/lib/utils/logical-unit-tracker.cjs revert-task 6

# Revert by feature name
node .claude/lib/utils/logical-unit-tracker.cjs revert-by-name "dark mode"

# Check dependencies
node .claude/lib/utils/logical-unit-tracker.cjs check-deps 7

# Group commits by task
node .claude/lib/utils/logical-unit-tracker.cjs group-commits "HEAD~10..HEAD"
```

## Security Considerations

- Notes contain task metadata (not secrets)
- Revert operations logged in git history (immutable)
- Verification hash prevents tampering
- Full audit trail via git notes

## Performance

- Logical unit detection: <500ms (100 commits)
- Dependency checking: <100ms (transitive depth 3)
- Revert execution: <1s per commit
- Verification: <100ms

## Integration with git-notes-audit Hook

The `git-notes-audit.cjs` hook automatically creates git notes on every commit:

**Note Format:**

```json
{
  "taskId": "6",
  "timestamp": "2026-01-29T10:30:00Z",
  "author": "user@example.com",
  "metadata": {
    "phase": "implementation",
    "track": "user-auth_20250115"
  }
}
```

**Benefits:**

- No manual note creation required
- Automatic task grouping
- Context preserved for every commit
- Enables dependency detection

**Setup:**

The hook is automatically installed via:

```bash
# Install git-notes-audit hook
cp .claude/hooks/git/git-notes-audit.cjs .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

After installation, every commit automatically gets a git note with task metadata.

## Workflow Integration

### With smart-revert Skill

The `smart-revert` skill uses `logical-unit-tracker.cjs` internally:

```
User: "/smart-revert dark mode"

smart-revert skill:
1. Invokes: logicalUnitTracker.findTaskByName(repo, 'dark mode')
2. Found Task #6
3. Invokes: logicalUnitTracker.checkRevertSafety(repo, '6')
4. Safe to revert
5. Confirms with user
6. Invokes: logicalUnitTracker.revertTask(repo, '6')
7. Reports success
```

### With conductor Workflow

Conductor tracks automatically use git notes:

```markdown
## Track: user-auth_20250115

### Phase 1: Setup

- [x] Task 1.1: Create repo `abc123`

### Phase 2: Implementation

- [x] Task 2.1: Add dark mode `def456`
```

When reverting Task 2.1:

1. Find commits with git note `TASK-#2.1`
2. Revert in reverse order
3. Update plan.md to mark task incomplete

## Related Documentation

- **Skill**: `.claude/skills/smart-revert/SKILL.md`
- **Utility**: `.claude/lib/utils/logical-unit-tracker.cjs`
- **Hook**: `.claude/hooks/git/git-notes-audit.cjs`
- **Tests**: `tests/smart-revert-enhanced.test.cjs`

## Memory Protocol (MANDATORY)

**Before using:**
Read `.claude/context/memory/learnings.md` for project-specific revert patterns.

**After successful revert:**
Record any learnings or issues in:

- `.claude/context/memory/learnings.md` (successful patterns)
- `.claude/context/memory/issues.md` (revert conflicts or blockers)
- `.claude/context/memory/decisions.md` (why revert was needed)

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
