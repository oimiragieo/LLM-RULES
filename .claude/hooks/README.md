# Hooks System

Agent Studio provides a hooks system for enforcing safety rules, routing protocols, and session management across agent workflows.

## Overview

Hooks are JavaScript modules that execute at specific points in the agent lifecycle. They provide:

- **Safety validation** - Command validation before execution
- **Routing enforcement** - Ensure Router-First protocol compliance
- **Session management** - Memory reminders and session state
- **Quality gates** - TDD compliance checks

## Hook Categories

### Safety Hooks

Located in `.claude/hooks/safety/`

#### TDD Check (consolidated into `unified-pre-write-hook.cjs`)

Validates that code changes follow Test-Driven Development workflow. Previously a standalone `tdd-check.cjs` hook, now consolidated as a check within `unified-pre-write-hook.cjs`.

**When it runs:** Before code edits (via `unified-pre-write-hook.cjs`)
**What it checks:** Test exists, test fails (RED), implementation passes (GREEN)

#### Validators (`safety/validators/`)

Command validation system integrated from Auto-Claude. Provides pre-execution validation for potentially dangerous commands.

**Available validators:**

- `shell-validators.cjs` - Bash/sh/zsh command validation
- `database-validators.cjs` - PostgreSQL, MySQL, Redis, MongoDB protection
- `filesystem-validators.cjs` - chmod, rm, dangerous file operations
- `git-validators.cjs` - Git config/push protection
- `process-validators.cjs` - kill/pkill/killall validation
- `registry.cjs` - Central command registry and validation interface

### Routing Hooks

Located in `.claude/hooks/routing/`

#### Router Enforcer (`router-enforcer.cjs`, uses `routing-table.cjs`)

Enforces Router-First protocol for all user interactions.

**When it runs:** On user message receipt
**What it enforces:** All requests must go through Router agent before execution

### Session Hooks

Located in `.claude/hooks/session/`

#### Memory Reminder (`memory-reminder.cjs`)

Reminds agents to read and update memory files.

**When it runs:** Session start, periodic intervals
**What it does:** Prompts reading learnings.md before starting work

### Memory Injection

Located in `.claude/hooks/routing/`

#### Spawn Prompt Assembler (`spawn-prompt-assembler.cjs`)

Injects memory context (Gotchas, Patterns) into agent spawn prompts.

**When it runs:** PreToolUse (Task)
**What it does:** Enhances agent prompts with relevant memory context.

### Git Hooks

Located in `.claude/hooks/git/`

#### Changelog Reminder (`changelog-reminder.cjs`)

Warns when code files are staged for commit but `CHANGELOG.md` [Unreleased] section was not also staged.

**When it runs:** git pre-commit (called from `.git/hooks/pre-commit`)
**What it checks:**

- Detects staged code files matching `*.ts`, `*.js`, `*.cjs`, `*.mjs`, `*.json` (excluding lock files)
- Checks whether `CHANGELOG.md` is included in the staged files
- If code is staged but CHANGELOG.md is not: prints a warning to stderr

**Enforcement mode:** `CHANGELOG_REMINDER_MODE=warn|off` (default: `warn`, always exits 0)
**ADR reference:** ADR-2026-02-21-004 and ADR-2026-02-21-006 (CHANGELOG inline with code commits)
**Test file:** `.claude/hooks/git/changelog-reminder.test.cjs`

### Memory Hooks

Located in `.claude/hooks/memory/`

#### Format Memory (`format-memory.cjs`)

Ensures memory files maintain consistent format and structure.

**When it runs:** After memory file updates
**What it does:** Validates YAML frontmatter, sorts entries, removes duplicates

## Using the Validator System

### Basic Usage

```javascript
const { validateCommand } = require('./.claude/hooks/safety/validators/registry.cjs');

// Validate a command before execution
const result = validateCommand('rm -rf /tmp/cache');
if (!result.valid) {
  console.error(`Unsafe command: ${result.error}`);
  process.exit(1);
}
```

### Validation Result Structure

```javascript
{
  valid: boolean,      // Whether command is safe to execute
  error: string,       // Error message if invalid (empty if valid)
  hasValidator: boolean // Whether a validator exists for this command
}
```

### Command Coverage

The validator system protects against dangerous operations in:

**Shell Interpreters:**

- `bash`, `sh`, `zsh` - Blocks destructive flags, eval injection

**Databases:**

- `dropdb`, `dropuser`, `psql` - PostgreSQL protection
- `mysql`, `mysqladmin` - MySQL protection
- `redis-cli` - Redis FLUSHDB/FLUSHALL protection
- `mongosh`, `mongo` - MongoDB dropDatabase protection

**Filesystem:**

- `chmod` - Prevents 777, recursive dangerous perms
- `rm` - Blocks recursive deletion of critical paths

**Git:**

- `git config` - Prevents credential.helper modification
- `git push --force` - Blocks force push without confirmation

**Process Management:**

- `kill`, `pkill`, `killall` - Prevents system process termination

### Adding Custom Validators

Register new validators in `registry.cjs`:

```javascript
const { registerValidator } = require('./registry.cjs');

// Add custom validator
registerValidator('mycommand', commandString => {
  if (commandString.includes('--dangerous')) {
    return { valid: false, error: 'Dangerous flag detected' };
  }
  return { valid: true, error: '' };
});
```

### Integration Examples

**In Bash tool wrapper:**

```javascript
const { validateCommand } = require('./.claude/hooks/safety/validators/registry.cjs');

function executeBashCommand(cmd) {
  const validation = validateCommand(cmd);
  if (!validation.valid) {
    throw new Error(`Command blocked: ${validation.error}`);
  }
  // Execute command...
}
```

**In pre-commit hooks:**

```javascript
const { validators } = require('./.claude/hooks/safety/validators/registry.cjs');

// Check all git commands in staging
for (const cmd of gitCommands) {
  const result = validators.git.validateGitCommand(cmd);
  if (!result.valid) {
    console.error(`Blocked: ${result.error}`);
    process.exit(1);
  }
}
```

## Validator Architecture

### Registry Pattern

The validator system uses a central registry (`registry.cjs`) that maps command names to validator functions:

```javascript
const VALIDATOR_REGISTRY = new Map([
  ['bash', shellValidators.validateBashCommand],
  ['rm', filesystemValidators.validateRmCommand],
  ['git', gitValidators.validateGitCommand],
  // ... more validators
]);
```

### Validator Function Signature

All validators follow a consistent interface:

```javascript
/**
 * @param {string} commandString - Full command string to validate
 * @returns {{valid: boolean, error: string}} Validation result
 */
function validateCommand(commandString) {
  // Validation logic
  if (dangerous) {
    return { valid: false, error: 'Reason why dangerous' };
  }
  return { valid: true, error: '' };
}
```

### No Validator = Allow by Default

Commands without registered validators are **allowed by default**. This prevents blocking legitimate commands while providing protection for known dangerous operations.

```javascript
validateCommand('ls -la');
// Returns: { valid: true, error: '', hasValidator: false }
```

## Hook Execution

Hooks are executed via `run-hook.cmd` (Windows) or shell scripts (Unix):

```bash
# Execute a hook
.claude/hooks/run-hook.cmd safety/unified-pre-write-hook

# With arguments
.claude/hooks/run-hook.cmd routing/router-enforcer --user-message "Fix the bug"
```

## Best Practices

1. **Fail Fast** - Hooks should exit quickly if validation fails
2. **Clear Errors** - Provide specific error messages explaining why validation failed
3. **No Side Effects** - Validators should not modify state, only validate
4. **Performance** - Keep validation logic lightweight (< 10ms per check)
5. **Extensibility** - Use registry pattern for easy addition of new validators

## Source Attribution

The validator system (`safety/validators/`) was integrated from the **Auto-Claude** autonomous coding framework. Original Python validators were converted to CommonJS for portability.

**Auto-Claude Repository:** https://github.com/cyanheads/Auto-Claude

## See Also

- `.claude/skills/recovery/` - Error recovery patterns
- `.claude/skills/tdd/` - Test-Driven Development workflow
- `.claude/context/memory/learnings.md` - Project learnings and patterns
