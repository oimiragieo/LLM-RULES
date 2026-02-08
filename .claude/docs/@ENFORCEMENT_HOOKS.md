# Enforcement Hooks Reference

> **See also:** @HOOK_AGENT_MAP.md for complete hook-agent mapping matrix
> **NOTE**: `routing-guard.cjs` has grown large and complex. It is a candidate for future refactoring into smaller, more focused modules (e.g. `complexity-guard.cjs`, `security-guard.cjs`).
> **Source:** CLAUDE.md Section 1.3
> **Version:** v2.2.1
> **Last Updated:** 2026-02-07

---

## PURPOSE

Detailed enforcement hook specifications for router-first protocol, including hook names, triggers, enforcement modes, and override environment variables. This document covers the 10 most critical hooks that enforce the framework's core safety and routing protocols.

---

## CONTENT

## Critical Hooks Overview

| Hook                         | Location                   | Trigger                 | Default | Key Env Variables                                          |
| ---------------------------- | -------------------------- | ----------------------- | ------- | ---------------------------------------------------------- |
| `routing-guard.cjs`          | `.claude/hooks/routing/`   | PreToolUse(Task)        | block   | `PLANNER_FIRST_ENFORCEMENT`, `SECURITY_REVIEW_ENFORCEMENT` |
| `unified-creator-guard.cjs`  | `.claude/hooks/routing/`   | PreToolUse(Write, Edit) | block   | `CREATOR_GUARD`                                            |
| `unified-pre-write-hook.cjs` | `.claude/hooks/safety/`    | PreToolUse(Write, Edit) | block   | Multiple (11 consolidated checks)                          |
| `bash-command-validator.cjs` | `.claude/hooks/safety/`    | PreToolUse(Bash)        | block   | `BASH_VALIDATOR_FAIL_OPEN`                                 |
| `shell-injection-validator.cjs` | `.claude/hooks/safety/` | PreToolUse(Bash)        | block   | `SHELL_INJECTION_VALIDATOR`                                |
| `pre-task-unified.cjs`       | `.claude/hooks/routing/`   | PreToolUse(Task)        | block   | `TASKLIST_FIRST_ENFORCEMENT`, `LOOP_PREVENTION_MODE`       |
| `tool-scope-validator.cjs`   | `.claude/hooks/routing/`   | PreToolUse(All)         | warn    | `TOOL_SCOPE_VALIDATOR`                                     |
| `reflection-step0-guard.cjs` | `.claude/hooks/reflection/`| PreToolUse(TaskList)    | warn    | `REFLECTION_STEP0_ENFORCEMENT`                             |
| `config-model-validator.cjs` | `.claude/hooks/routing/`   | PreToolUse(Task)        | warn    | `CONFIG_MODEL_VALIDATOR`                                   |
| `error-tracker-hook.cjs`     | `.claude/hooks/monitoring/`| PostToolUse(All)        | N/A     | None (monitoring only)                                     |
| `post-creation-integration.cjs` | `.claude/hooks/workflow/` | PostToolUse(TaskUpdate) | warn | `INTEGRATION_ENFORCEMENT` |

---

## 1. routing-guard.cjs

**Location:** `.claude/hooks/routing/routing-guard.cjs`
**Event Type:** PreToolUse(Task)
**Default Enforcement:** block
**Purpose:** Enforces router-first protocol and CLAUDE.md Gates 1-3

### Consolidated Enforcement Checks

This hook consolidates multiple router enforcement policies:

1. **Planner-first enforcement** (`PLANNER_FIRST_ENFORCEMENT`)
   - Blocks TaskCreate for HIGH/EPIC complexity unless PLANNER spawned first
   - Default: `block`
   - Override: `PLANNER_FIRST_ENFORCEMENT=warn|off`
   - Rationale: Complex tasks require planning before implementation

2. **Task-create complexity guard**
   - Prevents router from creating complex tasks directly
   - Requires spawning PLANNER for multi-step, multi-file, or architecture tasks
   - Enforces CLAUDE.md Gate 1 (Complexity)

3. **Security review guard** (`SECURITY_REVIEW_ENFORCEMENT`)
   - Enforces security-architect inclusion for auth/authz/credentials changes
   - Default: `block`
   - Override: `SECURITY_REVIEW_ENFORCEMENT=warn|off`
   - Enforces CLAUDE.md Gate 2 (Security)

4. **Router self-check**
   - Validates router passed Gates 1-4 before spawning
   - Cannot be disabled
   - Enforces CLAUDE.md Section 1.2 protocol

5. **Documentation routing guard**
   - Ensures documentation requests route to technical-writer
   - Part of routing-guard.cjs enforcement

### Environment Variables

```bash
# Planner-first enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off  # Default: block

# Security review enforcement
SECURITY_REVIEW_ENFORCEMENT=block|warn|off  # Default: block

# Router self-check (cannot be disabled)
ROUTER_SELF_CHECK=block|warn  # Default: block (off not allowed)
```

---

## 2. unified-creator-guard.cjs

**Location:** `.claude/hooks/routing/unified-creator-guard.cjs`
**Event Type:** PreToolUse(Write), PreToolUse(Edit)
**Default Enforcement:** block
**Purpose:** Enforces Gate 4 (Creator Workflow) for all artifact types

### Blocked Paths

Direct writes to these paths are blocked and must use creator skills:

- `.claude/skills/**/SKILL.md` → skill-creator required
- `.claude/agents/**/*.md` → agent-creator required
- `.claude/hooks/**/*.cjs` → hook-creator required
- `.claude/workflows/**/*.md` → workflow-creator required
- `.claude/templates/**/*` → template-creator required
- `.claude/schemas/**/*.json` → schema-creator required

### Why Enforcement Matters

Direct writes bypass post-creation steps:

- CLAUDE.md routing updates
- Catalog/registry updates
- Agent assignments
- Schema validation
- Memory recording (learnings/decisions/issues)

This creates "invisible artifacts" that are not discoverable by agents or tooling.

### Environment Variables

```bash
# Creator workflow enforcement
CREATOR_GUARD=block|warn|off  # Default: block

# Examples:
# Disable for emergency fixes (dangerous)
CREATOR_GUARD=off claude

# Warn-only mode for development
CREATOR_GUARD=warn claude
```

---

## 3. unified-pre-write-hook.cjs

**Location:** `.claude/hooks/safety/unified-pre-write-hook.cjs`
**Event Type:** PreToolUse(Write), PreToolUse(Edit)
**Default Enforcement:** block (fail-closed)
**Purpose:** Consolidates 11 write safety checks into 1 hook

### Consolidated Checks (11 total)

This hook consolidates these original hooks:

1. `context-mode-tool-guard.cjs` - Context mode validation
2. `file-placement-guard.cjs` - Forbidden locations (root, user home, Windows reserved names)
3. `write-content-scanner.cjs` - Content scanning for secrets, patterns
4. `write-size-validator.cjs` - File size limits
5. `routing-guard.cjs` (subset) - Router write restrictions
6. `router-write-guard.cjs` - Router cannot use Write/Edit
7. `unified-creator-guard.cjs` - Creator workflow paths
8. `tdd-check.cjs` - TDD enforcement (informational)
9. `plan-evolution-guard.cjs` - Plan file integrity
10. `unified-evolution-guard.cjs` - Evolution state integrity
11. `suggest-compact.cjs` - File size suggestions (informational)

### Forbidden Write Locations

- Project root: `C:\dev\projects\agent-studio\` (files should be in subdirectories)
- User home paths: `C:\Users\` (no writes to user directories)
- Windows reserved names: `nul`, `con`, `prn`, `aux`, `com1`-`com9`, `lpt1`-`lpt9`
- Temp files outside: `.claude/context/tmp/` (all temp files must use designated directory)
- Report root: `.claude/context/artifacts/` (use subdirectories like `artifacts/catalogs/`)

### Environment Variables

This hook uses multiple environment variables (one per consolidated check):

```bash
# Context mode guard
CONTEXT_MODE_TOOL_GUARD=block|warn|off  # Default: warn

# File placement guard
FILE_PLACEMENT_GUARD=block|warn|off  # Default: block

# Write content scanner
WRITE_CONTENT_SCANNER=block|warn|off  # Default: block

# Write size validator
WRITE_SIZE_VALIDATOR=block|warn|off  # Default: warn

# Router write guard
ROUTER_WRITE_GUARD=block|warn|off  # Default: block

# Creator guard
CREATOR_GUARD=block|warn|off  # Default: block

# Plan evolution guard
PLAN_EVOLUTION_GUARD=block|warn|off  # Default: block
```

---

## 4. bash-command-validator.cjs

**Location:** `.claude/hooks/safety/bash-command-validator.cjs`
**Event Type:** PreToolUse(Bash)
**Default Enforcement:** block (fail-closed)
**Purpose:** Validates bash commands using safety validator registry

### Command Safety Categories

The hook uses `.claude/hooks/safety/validators/registry.cjs` with these validators:

- **Database validators** (`database-validators.cjs`) - Prevents destructive SQL
- **Filesystem validators** (`filesystem-validators.cjs`) - Prevents `rm -rf /`, wildcard deletions
- **Git validators** (`git-validators.cjs`) - Prevents force push, hard reset
- **Network validators** (`network-validators.cjs`) - Validates URLs, prevents SSRF
- **Process validators** (`process-validators.cjs`) - Prevents background process abuse
- **Shell validators** (`shell-validators.cjs`) - Prevents shell injection patterns

### Blocked Command Examples

```bash
# Blocked: Root deletion
rm -rf /

# Blocked: Force push to main
git push --force origin main

# Blocked: Destructive SQL
DROP TABLE users;

# Blocked: System device redirect
echo "data" >> /dev/sda
```

### Environment Variables

```bash
# Validator enforcement
BASH_VALIDATOR_FAIL_OPEN=false|true  # Default: false (fail-closed)

# When true, hook allows operations on validation errors
# DANGEROUS: Should only be used for debugging
```

### Exit Codes

- `0` - Allow operation (command is safe or no validator exists)
- `2` - Block operation (command is dangerous)

The hook **fails closed** on errors - if validation fails to run, the command is blocked by default.

---

## 5. shell-injection-validator.cjs

**Location:** `.claude/hooks/safety/shell-injection-validator.cjs`
**Event Type:** PreToolUse(Bash)
**Default Enforcement:** block
**Purpose:** Prevents shell injection attacks via command chaining and substitution

### Detected Injection Patterns

```javascript
// Chained commands
{ pattern: /;\s*rm\s+-rf/, message: 'Chained rm -rf command detected' }
{ pattern: /\|\s*rm\s+-rf/, message: 'Piped rm -rf command detected' }
{ pattern: /&&\s*rm\s+-rf/, message: 'Conditional rm -rf command detected' }

// Code injection
{ pattern: /eval\s+/, message: 'eval command injection risk' }
{ pattern: />>\s*\/dev\//, message: 'System device redirect detected' }

// Command substitution
{ pattern: /\$\([^)]*rm/, message: 'Command substitution with rm' }
{ pattern: /`[^`]*rm/, message: 'Backtick execution with rm' }
```

### Dangerous Target Patterns

```javascript
// Root deletion
{ pattern: /rm\s+-rf\s+\/(?!\w)/, message: 'rm -rf / (root deletion)' }

// Home deletion
{ pattern: /rm\s+-rf\s+~/, message: 'rm -rf ~ (home deletion)' }

// Wildcard deletion
{ pattern: /rm\s+-rf\s+\*/, message: 'rm -rf * (wildcard deletion)' }
```

### Environment Variables

```bash
# Injection validator enforcement
SHELL_INJECTION_VALIDATOR=block|warn|off  # Default: block

# Examples:
# Disable for advanced shell scripting (not recommended)
SHELL_INJECTION_VALIDATOR=warn claude
```

### Examples

```bash
# ❌ BLOCKED: Chained rm -rf
find tests/; rm -rf /

# ❌ BLOCKED: eval injection
eval "malicious"

# ❌ BLOCKED: Command substitution
echo $(rm -rf /)

# ❌ BLOCKED: Device redirect
cat data >> /dev/sda

# ✅ ALLOWED: Safe find command
find tests/ -name "*.test.*"

# ✅ ALLOWED: Safe conditional
cd tests/ && npm test
```

---

## 6. pre-task-unified.cjs

**Location:** `.claude/hooks/routing/pre-task-unified.cjs`
**Event Type:** PreToolUse(Task)
**Default Enforcement:** block
**Purpose:** Consolidates agent spawn validation and loop prevention

### Consolidated Checks (3 total)

This hook consolidates these original hooks:

1. **agent-context-pre-tracker.cjs** - Sets mode='agent' before task starts
2. **routing-guard.cjs** (subset) - Planner-first, security review, self-check
3. **loop-prevention.cjs** - Prevents runaway agent spawn loops

### Loop Prevention Logic

Tracks spawn patterns to detect runaway loops:

- **Evolution budget**: Maximum 3 evolution attempts per cooldown period
- **Cooldown period**: 5 minutes (300,000ms) between evolution attempts
- **Depth limit**: Maximum 5 nested spawns
- **Pattern threshold**: 3 identical spawn patterns triggers loop detection

### Environment Variables

```bash
# Router self-check
ROUTER_SELF_CHECK=block|warn|off  # Default: block

# Planner-first enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off  # Default: block

# Security review enforcement
SECURITY_REVIEW_ENFORCEMENT=block|warn|off  # Default: block

# Loop prevention
LOOP_PREVENTION_MODE=block|warn|off  # Default: block

# Loop state file
LOOP_STATE_FILE=.claude/context/runtime/loop-state.json
```

### Loop Detection Example

```bash
# Scenario: Router repeatedly spawns planner for same request
# 1st spawn: Allowed
# 2nd spawn: Allowed
# 3rd spawn: Allowed
# 4th spawn: BLOCKED (pattern threshold reached)

# Error message:
# "Loop detected: identical spawn pattern repeated 3 times"
```

---

## 7. tool-scope-validator.cjs

**Location:** `.claude/hooks/routing/tool-scope-validator.cjs`
**Event Type:** PreToolUse(All)
**Default Enforcement:** warn
**Purpose:** Ensures agents only use tools in their allowed_tools list

### Always-Allowed Tools

These tools are always allowed regardless of allowed_tools list:

- `Read` - Read files
- `TaskList` - List tasks
- `TaskGet` - Get task details
- `AskUserQuestion` - Ask user for clarification

### Validation Logic

1. Get current agent's `allowed_tools` (from spawn context)
2. Get current tool being called
3. If tool not in `allowed_tools` and not in always-allowed list, block/warn
4. Exception: If `allowed_tools` is empty, allow all tools (router mode)

### Environment Variables

```bash
# Tool scope enforcement
TOOL_SCOPE_VALIDATOR=block|warn|off  # Default: warn

# Examples:
# Block mode (strict enforcement)
TOOL_SCOPE_VALIDATOR=block claude

# Warn mode (log but allow)
TOOL_SCOPE_VALIDATOR=warn claude

# Disabled (dangerous)
TOOL_SCOPE_VALIDATOR=off claude
```

### Example

```javascript
// Agent spawned with allowed_tools: ["Read", "Write", "Edit"]

// ✅ ALLOWED: Write (in allowed_tools)
Write({ file_path: "...", content: "..." })

// ✅ ALLOWED: Read (always allowed)
Read({ file_path: "..." })

// ❌ BLOCKED/WARNED: Bash (not in allowed_tools)
Bash({ command: "npm test" })
// Warning: "Tool Bash not in allowed_tools: [Read, Write, Edit]"
```

---

## 8. reflection-step0-guard.cjs

**Location:** `.claude/hooks/reflection/reflection-step0-guard.cjs`
**Event Type:** PreToolUse(TaskList)
**Default Enforcement:** warn
**Purpose:** Enforces Step 0 (reflection processing) before Router continues

### Reflection Step 0 Protocol

CLAUDE.md Section 0 requires:

1. Check if `.claude/context/runtime/reflection-reminder.txt` exists
2. If exists, read it and `.claude/context/runtime/reflection-spawn-request.json`
3. Spawn reflection-agent for each request (or first batch)
4. Delete reminder file and clear/trim spawn request file
5. Only then proceed to TaskList() and routing

### Hook Behavior

**When reminder exists and Router calls TaskList() without processing reflections:**

- **Block mode** (`block`): Prevents TaskList until reflections are handled
- **Warn mode** (`warn`): Allows TaskList but emits warning
- **Off mode** (`off`): Disabled

### Environment Variables

```bash
# Reflection step 0 enforcement
REFLECTION_STEP0_ENFORCEMENT=block|warn|off  # Default: warn

# Disable all reflection
REFLECTION_ENABLED=false  # Disables entire reflection system

# Maximum pending reflections before auto-clearing
MAX_PENDING_REFLECTIONS=5  # Default: 5
```

### Deadlock Prevention

If reflection queue grows beyond `MAX_PENDING_REFLECTIONS`, the hook auto-clears oldest entries to prevent deadlock.

---

## 9. config-model-validator.cjs

**Location:** `.claude/hooks/routing/config-model-validator.cjs`
**Event Type:** PreToolUse(Task)
**Default Enforcement:** warn
**Purpose:** Validates spawn model matches config.yaml (ADR-075)

### Model Resolution Precedence

1. Explicit `model:` in Task() call (override)
2. Agent frontmatter `model:` field
3. **config.yaml `agents.{type}.model`** (RECOMMENDED - source of truth)
4. Complexity-based default (opus for planners, haiku for compressors)
5. Fallback: sonnet

### Validation Logic

1. Extract agent type from spawn prompt
2. Resolve configured model from `config.yaml`
3. Compare spawn model with configured model
4. If mismatch, block/warn based on enforcement mode

### Environment Variables

```bash
# Config model validator enforcement
CONFIG_MODEL_VALIDATOR=block|warn|off  # Default: warn

# Examples:
# Block mode (strict config.yaml enforcement)
CONFIG_MODEL_VALIDATOR=block claude

# Warn mode (log mismatches but allow)
CONFIG_MODEL_VALIDATOR=warn claude
```

### Example

```yaml
# config.yaml
agents:
  planner:
    model: claude-opus-4-5-20251101
  developer:
    model: claude-sonnet-4-5
```

```javascript
// ✅ ALLOWED: Model matches config.yaml
Task({
  subagent_type: "planner",
  model: "claude-opus-4-5-20251101",  // Matches config
  prompt: "..."
})

// ❌ BLOCKED/WARNED: Model mismatch
Task({
  subagent_type: "planner",
  model: "claude-sonnet-4-5",  // Mismatch (should be opus)
  prompt: "..."
})
// Warning: "Model mismatch for planner: expected claude-opus-4-5-20251101, got claude-sonnet-4-5"
```

---

## 10. error-tracker-hook.cjs

**Location:** `.claude/hooks/monitoring/error-tracker-hook.cjs`
**Event Type:** PostToolUse(All)
**Default Enforcement:** N/A (monitoring only)
**Purpose:** Tracks tool errors for metrics and debugging

### Error Detection Heuristics

Detects errors from tool output:

1. **Structured output**: `{ error: { message, name, stack } }`
2. **String output**: Lines starting with `Error:`, `[ERROR]`, `ERROR:`
3. **Unhandled exceptions**: Lines containing `Unhandled error` or `Unhandled exception`

### Error Coercion

Converts various error formats to standard Error object:

```javascript
// Structured error
{ error: { message: "File not found", name: "ENOENT" } }
// → new Error("File not found")

// String error
"Error: Cannot read property 'id' of undefined"
// → new Error("Error: Cannot read property 'id' of undefined")
```

### Error Log Storage

Errors are logged to:

- `.claude/context/runtime/error-log.jsonl` (JSONL format, one error per line)
- Event bus for real-time monitoring
- Metrics collector for aggregation

### No Environment Variables

This hook is always enabled and has no enforcement modes - it is monitoring-only.

---

## 11. post-creation-integration.cjs

**Location:** `.claude/hooks/workflow/post-creation-integration.cjs`
**Event Type:** PostToolUse(TaskUpdate)
**Default Enforcement:** warn (advisory)
**Purpose:** Detects creator skill completions and queues integration analysis

### Detection Methods

The hook detects creator completions using two methods:

1. **Explicit metadata**: `metadata.creatorType` field (preferred)
2. **Pattern matching**: Regex on subject/summary text (fallback)

Supports all 6 creator types: skill, agent, hook, workflow, template, schema

### Integration Check

Uses `ArtifactGraph.isFullyIntegrated()` to perform quick integration check:

- Returns `{ integrated, score, missing }` object
- Graceful degradation: returns 'unknown' if graph missing or node not found
- Synchronous operations (graph is small, ~80KB max)

### Queue Format

Writes to `.claude/context/runtime/integration-queue.jsonl` (JSONL with rotation):

- Max 500 lines, trims oldest 100 processed entries when exceeded
- Entry format: `{ timestamp, artifactId, creatorType, changeType, source, gaps, priority, processed }`
- Atomic writes (append-only, no file locking needed)

### Advisory Mode

The hook **always returns** `{ allow: true }` regardless of integration status:

- Never blocks task completion
- Logs diagnostics to stderr
- Returns message with gap count on stdout
- Fail-open philosophy: catch all errors and pass through (exit 0)

### Environment Variables

```bash
# Integration enforcement mode
INTEGRATION_ENFORCEMENT=warn|block  # Default: warn

# Block mode (DANGEROUS - blocks creator completions with must-have gaps)
INTEGRATION_ENFORCEMENT=block claude
```

### Blocking Mode (INTEGRATION_ENFORCEMENT=block)

When set to `block`, the hook will **prevent task completion** if the created artifact has must-have integration gaps:

- Blocks if integration score < 1.0 and must-have items missing
- Allows if only should-have or nice-to-have items missing
- Returns `{ allow: false, message: "..." }` with gap details

**Use with caution:** Blocking mode can prevent legitimate creator completions if integration items are not yet populated.

### Performance

Execution time: ~198ms (includes Node.js startup overhead ~50-100ms)
Well under 100ms budget for non-blocking hooks.

---

## Enforcement Modes

| Mode    | Behavior                        | Use Case                         |
| ------- | ------------------------------- | -------------------------------- |
| `block` | Prevents action, throws error   | Production (default for security hooks) |
| `warn`  | Logs warning but allows action  | Development, debugging           |
| `off`   | Disables enforcement completely | Emergency fixes only (dangerous) |

---

## Hook Registration

Hooks are registered in `.claude/settings.json`:

```json
{
  "hooks": {
    "routing-guard.cjs": {
      "trigger": "PreToolUse",
      "tool": "Task",
      "enabled": true
    },
    "unified-creator-guard.cjs": {
      "trigger": "PreToolUse",
      "tool": ["Write", "Edit"],
      "enabled": true
    },
    "unified-pre-write-hook.cjs": {
      "trigger": "PreToolUse",
      "tool": ["Write", "Edit"],
      "enabled": true
    },
    "bash-command-validator.cjs": {
      "trigger": "PreToolUse",
      "tool": "Bash",
      "enabled": true
    },
    "shell-injection-validator.cjs": {
      "trigger": "PreToolUse",
      "tool": "Bash",
      "enabled": true
    },
    "pre-task-unified.cjs": {
      "trigger": "PreToolUse",
      "tool": "Task",
      "enabled": true
    },
    "tool-scope-validator.cjs": {
      "trigger": "PreToolUse",
      "tool": "*",
      "enabled": true
    },
    "reflection-step0-guard.cjs": {
      "trigger": "PreToolUse",
      "tool": "TaskList",
      "enabled": true
    },
    "config-model-validator.cjs": {
      "trigger": "PreToolUse",
      "tool": "Task",
      "enabled": true
    },
    "error-tracker-hook.cjs": {
      "trigger": "PostToolUse",
      "tool": "*",
      "enabled": true
    }
  }
}
```

---

## Override Environment Variables Summary

```bash
# Routing enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off        # Default: block
SECURITY_REVIEW_ENFORCEMENT=block|warn|off      # Default: block
ROUTER_SELF_CHECK=block|warn                    # Default: block (off not allowed)
TASKLIST_FIRST_ENFORCEMENT=block|warn|off       # Default: block

# Creator enforcement
CREATOR_GUARD=block|warn|off                    # Default: block

# Write safety checks (11 consolidated)
CONTEXT_MODE_TOOL_GUARD=block|warn|off          # Default: warn
FILE_PLACEMENT_GUARD=block|warn|off             # Default: block
WRITE_CONTENT_SCANNER=block|warn|off            # Default: block
WRITE_SIZE_VALIDATOR=block|warn|off             # Default: warn
ROUTER_WRITE_GUARD=block|warn|off               # Default: block
PLAN_EVOLUTION_GUARD=block|warn|off             # Default: block

# Bash safety
BASH_VALIDATOR_FAIL_OPEN=false|true             # Default: false (fail-closed)
SHELL_INJECTION_VALIDATOR=block|warn|off        # Default: block

# Tool scope
TOOL_SCOPE_VALIDATOR=block|warn|off             # Default: warn

# Reflection
REFLECTION_STEP0_ENFORCEMENT=block|warn|off     # Default: warn
REFLECTION_ENABLED=true|false                   # Default: true

# Model validation
CONFIG_MODEL_VALIDATOR=block|warn|off           # Default: warn

# Loop prevention
LOOP_PREVENTION_MODE=block|warn|off             # Default: block
```

---

## RELATED REFERENCES

- **@HOOK_AGENT_MAP.md** - Complete hook-agent mapping matrix
- **@ENVIRONMENT_CONFIG.md** - Environment variable configuration
- **@EVOLUTION_WORKFLOW.md** - research-enforcement.cjs (Phase O)
- **CLAUDE.md Section 1.2** - Self-check gates enforced by routing-guard.cjs
- **CLAUDE.md Section 1.3** - Hook enforcement summary

---

## BACK TO MAIN

See **CLAUDE.md** Section 1.3 for inline summary.
