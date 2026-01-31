# Safe Background Bash Task Template

**Purpose:** Template for spawning background Bash tasks with proper CWD initialization and shell injection prevention.

**Related:** ADR-077 (Shell Command Security Architecture)

---

## Required Pattern (MANDATORY)

All background Bash tasks MUST start with CWD initialization:

```bash
cd "$PROJECT_ROOT" || { echo "Failed to change to project root"; exit 1; }

# Your command here
find tests/ -name "*.test.*" | wc -l
```

**Why This Matters:**

- Background tasks execute in undefined CWD (not PROJECT_ROOT)
- Without `cd "$PROJECT_ROOT"`, relative paths resolve from system root (/)
- This causes filesystem traversal and data exposure

**Examples:**

```bash
# ❌ WRONG (will search from root /)
Bash({
  command: 'find tests/ -name "*.test.*"',
  run_in_background: true
});

# ✅ CORRECT (searches from PROJECT_ROOT)
Bash({
  command: 'cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"',
  run_in_background: true
});
```

---

## Variable Quoting (MANDATORY)

All variables MUST be quoted to prevent word splitting and globbing:

```bash
# ❌ WRONG: Unquoted variables
cd $PROJECT_ROOT
find $DIR -name $PATTERN

# ✅ CORRECT: Quoted variables
cd "$PROJECT_ROOT"
find "$DIR" -name "$PATTERN"
```

**Common Variables:**

- `"$PROJECT_ROOT"` - Project root directory
- `"$HOME"` - User home directory
- `"$PWD"` - Current working directory
- `"$USER"` - Current user

**Why Quoting Matters:**

- Prevents failures when paths have spaces: `/c/Program Files/`
- Prevents shell globbing: `*` expanded unexpectedly
- Prevents word splitting: `$VAR` split into multiple arguments

---

## Dangerous Patterns (BLOCKED)

These patterns are BLOCKED by shell-injection-validator.cjs:

### Chained rm Commands

```bash
# ❌ BLOCKED: Semicolon chaining
find tests/; rm -rf /

# ❌ BLOCKED: Piped rm
find tests/ | rm -rf /

# ❌ BLOCKED: AND-chained rm
cd /tmp && rm -rf /
```

### Dangerous Targets

```bash
# ❌ BLOCKED: Root deletion
rm -rf /

# ❌ BLOCKED: Home deletion
rm -rf ~

# ❌ BLOCKED: Wildcard deletion
rm -rf *
```

### Command Injection

```bash
# ❌ BLOCKED: eval
eval "malicious code"

# ❌ BLOCKED: Command substitution with rm
echo $(rm -rf /)

# ❌ BLOCKED: Backtick execution
echo `rm -rf /tmp`

# ❌ BLOCKED: Device redirects
cat data >> /dev/sda
```

---

## Safe Command Examples

### Example 1: Find and Count Test Files

```bash
cd "$PROJECT_ROOT" || exit 1
find tests/ -name "*.test.*" -type f | wc -l
```

### Example 2: Search Code for Pattern

```bash
cd "$PROJECT_ROOT" || exit 1
grep -r "TODO" src/ --include="*.js"
```

### Example 3: Git Log Analysis

```bash
cd "$PROJECT_ROOT" || exit 1
git log --oneline --since="1 week ago" | wc -l
```

### Example 4: Node Script Execution

```bash
cd "$PROJECT_ROOT" || exit 1
node scripts/analyze-dependencies.cjs
```

### Example 5: Multiline Background Task

```bash
cd "$PROJECT_ROOT" || exit 1

# Set variables
TESTS_DIR="tests"
PATTERN="*.test.*"

# Count test files
find "$TESTS_DIR" -name "$PATTERN" -type f | wc -l
```

---

## Unsafe Examples (Will Be Blocked)

### Example 1: Missing CWD (BLOCKED)

```bash
# ❌ BLOCKED by bash-cwd-validator.cjs
find tests/ -name "*.test.*"

# Error: Background task missing: cd "$PROJECT_ROOT"
```

### Example 2: Unquoted Variables (WARNED)

```bash
# ⚠️ WARNED by variable-quoting-validator.cjs (Phase 2)
cd $PROJECT_ROOT
find $DIR -name $PATTERN

# Warning: Unquoted variables detected: $PROJECT_ROOT, $DIR, $PATTERN
# Fix: Quote variables: "$VAR" instead of $VAR
```

### Example 3: Shell Injection (BLOCKED)

```bash
# ❌ BLOCKED by shell-injection-validator.cjs
cd "$PROJECT_ROOT" || exit 1; find tests/; rm -rf /

# Error: [SHELL-INJECTION] Chained rm -rf command detected
```

---

## Validation Hooks

Three validation hooks protect background Bash tasks:

### 1. bash-cwd-validator.cjs (CRITICAL)

- **Purpose:** Blocks background tasks without `cd "$PROJECT_ROOT"`
- **Mode:** `block` (default), `warn`, `off`
- **Environment:** `BASH_CWD_VALIDATOR=block|warn|off`

### 2. shell-injection-validator.cjs (CRITICAL)

- **Purpose:** Blocks dangerous patterns (`rm -rf /`, `eval`, etc.)
- **Mode:** `block` (default), `warn`, `off`
- **Environment:** `SHELL_INJECTION_VALIDATOR=block|warn|off`

### 3. variable-quoting-validator.cjs (HIGH - Phase 2)

- **Purpose:** Warns about unquoted variables (`$VAR` vs `"$VAR"`)
- **Mode:** `warn` (default), `off`
- **Environment:** `BASH_QUOTING_VALIDATOR=warn|off`

---

## Checklist for Safe Background Tasks

Before spawning a background Bash task:

- [ ] Command starts with `cd "$PROJECT_ROOT" || exit 1`
- [ ] All variables are quoted: `"$VAR"` not `$VAR`
- [ ] No dangerous patterns (`rm -rf /`, `eval`, backticks, etc.)
- [ ] No redirects to system devices (`/dev/`)
- [ ] No chained `rm` commands (`;`, `&&`, `|`)
- [ ] Tested in foreground mode first (verify expected output)

---

## Error Handling

Always include error handling for CWD initialization:

```bash
# ✅ BEST: Exit with error message if CWD fails
cd "$PROJECT_ROOT" || { echo "Failed to change to project root"; exit 1; }

# ✅ GOOD: Exit silently if CWD fails
cd "$PROJECT_ROOT" || exit 1

# ❌ WRONG: No error handling (command continues in wrong directory)
cd "$PROJECT_ROOT" && find tests/
```

---

## Integration with Spawn Templates

When spawning agents that use background Bash:

```javascript
Task({
  subagent_type: 'developer',
  description: 'Count test files in background',
  allowed_tools: ['Bash', 'TaskUpdate', 'TaskList'],
  prompt: `You are DEVELOPER.

## Background Bash Protocol (MANDATORY)

Read template: .claude/templates/spawn/bash-safe-background.md

ALL background Bash tasks MUST:
1. Start with: cd "$PROJECT_ROOT" || exit 1
2. Quote all variables: "$VAR" not $VAR
3. Avoid dangerous patterns (rm -rf /, eval, etc.)

Task: Count test files in tests/ directory using background Bash.

Example:
\`\`\`javascript
Bash({
  command: 'cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*" -type f | wc -l',
  run_in_background: true
});
\`\`\`
`,
});
```

---

## Related Documentation

- **ADR-077:** Shell Command Security Architecture
- **Audit:** `.claude/context/artifacts/audits/BACKGROUND-TASK-SHELL-AUDIT.md`
- **Hooks:**
  - `.claude/hooks/safety/bash-cwd-validator.cjs`
  - `.claude/hooks/safety/shell-injection-validator.cjs`
  - `.claude/hooks/safety/variable-quoting-validator.cjs` (Phase 2)
- **Issues:**
  - SHELL-SECURITY-001 (CWD initialization)
  - SHELL-SECURITY-002 (Shell injection)
  - SHELL-SECURITY-003 (Variable quoting)

---

**Last Updated:** 2026-01-31
**Phase:** Phase 1 (CRITICAL fixes)
**Status:** ACTIVE
