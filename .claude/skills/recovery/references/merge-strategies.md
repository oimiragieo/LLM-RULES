# Merge Strategies Reference

This document describes merge strategies for handling code conflicts during recovery. These are reference patterns from the Auto-Claude framework, provided for context when recovering from multi-agent or parallel work scenarios.

## Overview

When multiple agents or sessions modify the same files, merge conflicts can occur. These strategies help resolve conflicts automatically when possible.

## Append Strategies

### Append Functions

**Use Case**: Adding new functions to a file without modifying existing code.

**Pattern**:

1. Identify insert position (before `module.exports` in JS, at end otherwise)
2. Append new functions with proper spacing
3. Preserve existing code untouched

**Example**:

```javascript
// Original file
function existingFunction() { ... }

// After append
function existingFunction() { ... }

function newFunction() { ... }  // <-- Appended
```

**When to Use**:

- New feature implementation
- Adding utility functions
- Non-conflicting additions

### Append Methods

**Use Case**: Adding new methods to existing classes.

**Pattern**:

1. Identify target class
2. Find class closing brace
3. Insert methods before closing brace
4. Maintain proper indentation

**Example**:

```python
class UserService:
    def get_user(self): ...

    def update_user(self): ...  # <-- Appended
```

### Append Statements

**Use Case**: Adding variables, comments, or other statements.

**Pattern**:

1. Determine appropriate location (imports, constants, code)
2. Append with proper newlines
3. No conflict detection needed for pure additions

---

## Import Strategy

**Use Case**: Combining import statements from multiple sources.

**Pattern**:

1. Find import section end in file
2. Collect all new imports to add
3. Deduplicate against existing imports
4. Remove imports marked for deletion
5. Insert new imports at section end

**Deduplication Logic**:

```python
# Collect existing imports
existing_imports = set(line for line in lines if is_import_line(line))

# Filter new imports
new_imports = [
    imp for imp in imports_to_add
    if imp not in existing_imports
    and imp not in imports_to_remove
]
```

**Language Detection**:

- Python: `import X` or `from X import Y`
- JavaScript/TypeScript: `import X from` or `require(`
- Go: `import "package"`
- Rust: `use crate::` or `use std::`

---

## Ordering Strategies

### Order By Dependency

**Use Case**: Changes that depend on each other must be applied in correct order.

**Pattern**:

1. Build dependency graph from changes
2. Topological sort to determine order
3. Apply changes in sorted order
4. Handle circular dependencies by escalating

**Example**:

```
Change A: Add function `validate()`
Change B: Add function `process()` which calls `validate()`

Order: A must be applied before B
```

### Order By Time

**Use Case**: Apply changes in chronological order when no dependencies.

**Pattern**:

1. Sort changes by timestamp
2. Apply in chronological order
3. Newer changes override older for same location

---

## Conflict Resolution

### Automatic Resolution

These conflicts can be resolved automatically:

| Scenario                            | Strategy       |
| ----------------------------------- | -------------- |
| Adding non-overlapping functions    | Append         |
| Adding imports (no conflicts)       | Import merge   |
| Adding methods to different classes | Append methods |
| Changes in different files          | No conflict    |

### Manual Resolution Required

These conflicts require human intervention:

| Scenario                                 | Reason                       |
| ---------------------------------------- | ---------------------------- |
| Same line modified differently           | Ambiguous intent             |
| Conflicting imports (different versions) | Version decision needed      |
| Structural changes overlap               | Architecture decision needed |
| Delete vs modify conflict                | Intent unclear               |

---

## Integration with Recovery

When recovering from failures that involve merge conflicts:

1. **Identify Conflict Type**
   - Same file modified by multiple agents?
   - Structural vs content conflict?

2. **Apply Strategy**
   - If additive only: use append strategies
   - If imports only: use import merge
   - If complex: escalate to human

3. **Validate Result**
   - Run syntax check
   - Run tests
   - Verify no regressions

4. **Record Decision**
   - Log which strategy was used
   - Record in attempt history
   - Update memory with pattern

---

## Best Practices

1. **Prefer Additive Changes**: Appending is safer than modifying
2. **Keep Changes Small**: Smaller changes have fewer conflicts
3. **One File Per Task**: Minimize multi-file modifications
4. **Test After Merge**: Always validate merged result
5. **Document Conflicts**: Record why conflicts occurred for learning

---

## Related Skills

- `git-expert` - Git operations and conflict resolution
- `smart-revert` - Reverting changes safely
- `codebase-integration` - Integrating external code
