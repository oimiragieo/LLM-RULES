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

| Hook                            | Location                    | Trigger                                     | Default | Key Env Variables                                                                                                    |
| ------------------------------- | --------------------------- | ------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `routing-guard.cjs`             | `.claude/hooks/routing/`    | PreToolUse(Task, Edit, Write, NotebookEdit) | block   | `PLANNER_FIRST_ENFORCEMENT`, `SECURITY_REVIEW_ENFORCEMENT`, `TASKLIST_FIRST_ENFORCEMENT`, `STATE_STALE_THRESHOLD_MS` |
| `unified-creator-guard.cjs`     | `.claude/hooks/routing/`    | PreToolUse(Write, Edit)                     | block   | `CREATOR_GUARD`                                                                                                      |
| `unified-pre-write-hook.cjs`    | `.claude/hooks/safety/`     | PreToolUse(Write, Edit)                     | block   | Multiple (11 consolidated checks)                                                                                    |
| `bash-command-validator.cjs`    | `.claude/hooks/safety/`     | PreToolUse(Bash)                            | block   | `BASH_VALIDATOR_FAIL_OPEN`                                                                                           |
| `shell-injection-validator.cjs` | `.claude/hooks/safety/`     | PreToolUse(Bash)                            | block   | `SHELL_INJECTION_VALIDATOR`                                                                                          |
| `pre-task-unified.cjs`          | `.claude/hooks/routing/`    | PreToolUse(Task)                            | block   | `TASKLIST_FIRST_ENFORCEMENT`, `LOOP_PREVENTION_MODE`                                                                 |
| `tool-scope-validator.cjs`      | `.claude/hooks/routing/`    | PreToolUse(All)                             | warn    | `TOOL_SCOPE_VALIDATOR`                                                                                               |
| `reflection-step0-guard.cjs`    | `.claude/hooks/reflection/` | PreToolUse(TaskList)                        | block   | `REFLECTION_STEP0_ENFORCEMENT`                                                                                       |
| `error-tracker-hook.cjs`        | `.claude/hooks/monitoring/` | PostToolUse(All)                            | N/A     | None (monitoring only)                                                                                               |
| `post-creation-integration.cjs` | `.claude/hooks/workflow/`   | PostToolUse(TaskUpdate)                     | warn    | `INTEGRATION_ENFORCEMENT`                                                                                            |
| `drift-detector.cjs`            | `.claude/hooks/session/`    | UserPromptSubmit                            | N/A     | None (always enabled, informational)                                                                                 |
| `adaptive-quality-gate.cjs`     | `.claude/hooks/session/`    | PreToolUse(Edit, Write, NotebookEdit)       | N/A     | None (always enabled, informational)                                                                                 |
| `post-edit-scanner.cjs`         | `.claude/hooks/session/`    | PostToolUse(Edit)                           | N/A     | None (always enabled, informational)                                                                                 |
| `pre-compact.cjs`               | `.claude/hooks/session/`    | Stop                                        | N/A     | None (always enabled, informational)                                                                                 |

**Note:** `config-model-validator.cjs` and `intent-agent-match.cjs` were consolidated into `routing-guard.cjs` (Check 11 and Check 10 respectively) as of 2026-02-09. `task-status-enforcement.cjs` was consolidated into `pre-completion-validation.cjs` as of 2026-02-09. `creator-compliance-validator.cjs` was consolidated into `pre-completion-validation.cjs` as of 2026-02-09.

---

## 1. routing-guard.cjs

**Location:** `.claude/hooks/routing/routing-guard.cjs`
**Event Type:** PreToolUse(Task), PreToolUse(Edit), PreToolUse(Write), PreToolUse(NotebookEdit)
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

6. **Router write/edit guard**
   - Blocks Router from using Write/Edit/NotebookEdit (except allowed paths)
   - Enforces tool restrictions in CLAUDE.md Section 1.1
   - Allows writes to `.claude/context/memory/` and `.claude/context/runtime/` for state management

7. **State staleness detection**
   - Detects stale state files (older than `STATE_STALE_THRESHOLD_MS`)
   - Forces router mode if state file is stale
   - Default threshold: 600000ms (10 minutes)
   - Invalid timestamps force fallback to router mode

8. **TaskList-first gate** (`TASKLIST_FIRST_ENFORCEMENT`)
   - Requires TaskList() called before Task() spawns
   - Default: `block`
   - Override: `TASKLIST_FIRST_ENFORCEMENT=block|off`
   - Enforces CLAUDE.md Section 0 routing protocol

### Environment Variables

```bash
# Planner-first enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off  # Default: block

# Security review enforcement
SECURITY_REVIEW_ENFORCEMENT=block|warn|off  # Default: block

# Router self-check (cannot be disabled)
ROUTER_SELF_CHECK=block|warn  # Default: block (off not allowed)

# TaskList-first gate
TASKLIST_FIRST_ENFORCEMENT=block|warn|off  # Default: block

# State staleness threshold
STATE_STALE_THRESHOLD_MS=number  # Default: 600000 (10 minutes)
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
Write({ file_path: '...', content: '...' });

// ✅ ALLOWED: Read (always allowed)
Read({ file_path: '...' });

// ❌ BLOCKED/WARNED: Bash (not in allowed_tools)
Bash({ command: 'npm test' });
// Warning: "Tool Bash not in allowed_tools: [Read, Write, Edit]"
```

---

## 8. reflection-step0-guard.cjs

**Location:** `.claude/hooks/reflection/reflection-step0-guard.cjs`
**Event Type:** PreToolUse(TaskList)
**Default Enforcement:** block
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
REFLECTION_STEP0_ENFORCEMENT=block|warn|off  # Default: block

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
  task_id: 'task-1',
  subagent_type: 'planner',
  model: 'claude-opus-4-5-20251101', // Matches config
  prompt: '...',
});

// ❌ BLOCKED/WARNED: Model mismatch
Task({
  task_id: 'task-2',
  subagent_type: 'planner',
  model: 'claude-sonnet-4-5', // Mismatch (should be opus)
  prompt: '...',
});
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

## 12. creator-compliance-validator.cjs

**Location:** `.claude/hooks/validation/creator-compliance-validator.cjs`
**Event Type:** PreToolUse(TaskUpdate)
**Default Enforcement:** warn
**Purpose:** Validates post-creation integration compliance (Layer 3)

**Note:** creator-compliance-validator.cjs was consolidated into `pre-completion-validation.cjs` as of 2026-02-09.

### When It Runs

- Intercepts TaskUpdate when `status` is being set to `"completed"`
- Only checks tasks that modified/created artifact files (agents, skills, hooks, workflows, templates, schemas)
- Graceful degradation: allows completion if no artifact files detected

### Compliance Checks

Validates required integrations per artifact type:

| Artifact Type | Required Integration   | Check Method               |
| ------------- | ---------------------- | -------------------------- |
| Agent         | agent-registry.json    | Search for agent name      |
| Agent         | routing-table.cjs      | Search for routing keyword |
| Agent         | CLAUDE.md              | Search for agent reference |
| Skill         | skill-catalog.md       | Search for skill name      |
| Hook          | settings.json          | Search for hook path       |
| Workflow      | @WORKFLOW_AGENT_MAP.md | Search for workflow name   |
| Template      | template-catalog.md    | Search for template name   |
| Schema        | schema-catalog.md      | Search for schema name     |

### Detection Logic

1. Extracts `metadata.filesCreated` and `metadata.filesModified` from TaskUpdate
2. Filters files matching creator output paths (`.claude/agents/**`, `.claude/skills/**`, etc.)
3. For each creator file, extracts artifact name and checks required integrations
4. Returns violations list with details

### Environment Variables

```bash
# Creator compliance enforcement mode
CREATOR_COMPLIANCE_ENFORCEMENT=block|warn|off  # Default: warn

# Warn mode (logs violations, queues integration tasks)
CREATOR_COMPLIANCE_ENFORCEMENT=warn claude

# Block mode (prevents task completion until integrations complete)
CREATOR_COMPLIANCE_ENFORCEMENT=block claude

# Off mode (disables compliance checking)
CREATOR_COMPLIANCE_ENFORCEMENT=off claude
```

### Integration Queue

In warn mode, violations are queued to `.claude/context/runtime/integration-queue.jsonl`:

```json
{
  "timestamp": "2026-02-08T12:00:00.000Z",
  "artifactPath": ".claude/agents/domain/python-expert.md",
  "artifactType": "agent",
  "missingIntegration": "registry",
  "detail": "NOT found in agent-registry.json",
  "source": "creator-compliance-validator",
  "processed": false
}
```

Router Step 0.5 checks this queue and spawns `artifact-integrator` if unprocessed entries exist.

### Example

```javascript
// ❌ BLOCKED: Agent created but not in registry
TaskUpdate({
  taskId: '5',
  status: 'completed',
  metadata: {
    filesCreated: ['.claude/agents/domain/python-expert.md'],
  },
});
// Block message: "CREATOR COMPLIANCE VIOLATION - python-expert not found in agent-registry.json"

// ✅ ALLOWED: All integrations present
TaskUpdate({
  taskId: '5',
  status: 'completed',
  metadata: {
    filesCreated: ['.claude/agents/domain/python-expert.md'],
  },
});
// After: agent-creator updated agent-registry.json, routing-table.cjs, CLAUDE.md
```

### Fail-Open Safety

If the hook encounters errors during validation:

- Logs error to stderr
- Allows task completion (fail-open)
- Returns `{ allow: true }` with error message

This prevents blocking legitimate completions due to validation bugs.

---

## 13. SEC-ICE-001: Artifact Name Validation

**Location:** `.claude/lib/creators/companion-check.cjs` (library, not hook)
**Scope:** All creator skills
**Default Enforcement:** block (validation failure prevents creation)
**Purpose:** Prevents path traversal attacks via malicious artifact names

### Threat Model

Malicious artifact names can exploit path construction to write files outside intended directories:

```javascript
// Attack attempt
artifactName: '../../etc/passwd';
// Would construct: .claude/skills/../../etc/passwd → /etc/passwd

// Attack attempt
artifactName: '..\\..\\Windows\\System32\\config';
// Would construct: .claude\skills\..\..\Windows\System32\config
```

### Validation Rules

Artifact names MUST match strict regex: `^[a-z0-9][a-z0-9-]*[a-z0-9]$`

**Allowed:**

- Lowercase letters (a-z)
- Numbers (0-9)
- Hyphens (-) as separators
- Must start and end with alphanumeric (no leading/trailing hyphens)

**Blocked:**

- Path separators (`/`, `\`)
- Parent directory references (`..`)
- Uppercase letters (consistency)
- Special characters (except hyphens)
- Leading/trailing hyphens

### Implementation

All 9 creator skills call `isValidArtifactName(name)` before path construction:

```javascript
const { isValidArtifactName } = require('.claude/lib/creators/companion-check.cjs');

if (!isValidArtifactName(artifactName)) {
  throw new Error(`Invalid artifact name: ${artifactName}`);
}
```

### Test Coverage

22 tests across 3 functions:

- `isValidArtifactName()` - 10 tests (valid/invalid names)
- `normalizePath()` - 6 tests (Windows backslash, Unix forward slash)
- `isPathWithinProject()` - 6 tests (path traversal detection)

### Examples

```javascript
// ✅ ALLOWED
isValidArtifactName('my-skill'); // true
isValidArtifactName('auth-middleware'); // true
isValidArtifactName('skill2024'); // true

// ❌ BLOCKED
isValidArtifactName('my_skill'); // false (underscore)
isValidArtifactName('../passwd'); // false (parent ref)
isValidArtifactName('My-Skill'); // false (uppercase)
isValidArtifactName('-leading'); // false (leading hyphen)
```

---

## 13. SEC-ICE-002: Auto-Spawn Amplification Limits

**Location:** `.claude/lib/creators/companion-check.cjs` (library, not hook)
**Scope:** Companion matrix auto-spawn logic
**Default Enforcement:** block (limits enforced before auto-spawning)
**Purpose:** Prevents recursive companion spawning creating exponential agent proliferation

### Threat Model

Without limits, companion auto-spawning can create amplification attacks:

```
User creates skill A
  → Auto-spawns agent B (companion, depth 1)
    → Auto-spawns skill C (companion, depth 2)
      → Auto-spawns agent D (companion, depth 3) ← BLOCKED
      → Auto-spawns skill E (companion, depth 3) ← BLOCKED
      → ... (exponential growth)
```

**Attack vectors:**

- Depth amplification: A → B → C → D → ... (unbounded depth)
- Per-event amplification: A → (B, C, D, E, F, ...) (unbounded breadth)
- Cycle amplification: A → B → A → B → ... (infinite loop)

### Protection Layers

#### 1. Depth Limit

**Maximum 2 levels** of auto-spawn:

```
creator → companion (depth 1) → sub-companion (depth 2) → STOP
```

**Why 2?**

- Depth 1: Primary companions (catalog, agent assignment)
- Depth 2: Secondary companions (examples, documentation)
- Depth 3+: Manual review (prevents runaway recursion)

#### 2. Per-Event Cap

**Maximum 5 auto-spawns** per creation event:

```
create skill → auto-spawn 5 must-have companions → STOP
```

**Why 5?**

- Typical artifact has 2-3 must-have companions
- Cap allows for 5 even in complex cases
- Prevents single event from spawning 10-50 agents

#### 3. Cycle Detection

**DAG tracking** prevents circular dependencies:

```
skill-creator → agent-creator → skill-creator (BLOCKED - cycle detected)
hook-creator → settings.json → schema-creator (ALLOWED - no cycle)
```

Uses breadth-first search to detect cycles before spawning.

#### 4. Kill Switch

**Environment variable `AUTO_SPAWN_COMPANIONS=off`** disables all auto-spawning:

```bash
# Disable auto-spawn completely (manual review only)
AUTO_SPAWN_COMPANIONS=off claude
```

**Use cases:**

- Emergency: Auto-spawn misbehaving
- Development: Testing without side effects
- Manual control: User wants full oversight

### Implementation

Auto-spawn checks run in this order (fail-fast):

```javascript
// 1. Kill switch (highest priority)
if (process.env.AUTO_SPAWN_COMPANIONS === 'off') return false;

// 2. Depth limit
if (currentDepth >= 2) return false;

// 3. Per-event cap
if (spawnsThisEvent >= 5) return false;

// 4. Cycle detection
if (detectsCycle(currentPath, companion)) return false;

// All checks passed → allow auto-spawn
return true;
```

### Test Coverage

6 tests covering all protection layers:

- Kill switch enforcement (1 test)
- Depth limit enforcement (2 tests)
- Per-event cap enforcement (1 test)
- Cycle detection (2 tests)

### Environment Variables

```bash
# Kill switch (disable all auto-spawning)
AUTO_SPAWN_COMPANIONS=on|off  # Default: on

# Auto-spawn depth limit
AUTO_SPAWN_DEPTH_LIMIT=number  # Default: 2

# Auto-spawn per-event cap
AUTO_SPAWN_EVENT_CAP=number  # Default: 5
```

### Examples

```bash
# Normal operation (limits enforced)
# User creates skill A → 2 must-have companions auto-spawned (within limits)

# Emergency: Disable auto-spawn
AUTO_SPAWN_COMPANIONS=off claude

# Conservative: Lower depth limit to 1
AUTO_SPAWN_DEPTH_LIMIT=1 claude

# Permissive: Raise per-event cap to 10 (not recommended)
AUTO_SPAWN_EVENT_CAP=10 claude
```

---

## Enforcement Modes

| Mode    | Behavior                        | Use Case                                |
| ------- | ------------------------------- | --------------------------------------- |
| `block` | Prevents action, throws error   | Production (default for security hooks) |
| `warn`  | Logs warning but allows action  | Development, debugging                  |
| `off`   | Disables enforcement completely | Emergency fixes only (dangerous)        |

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

# State management
STATE_STALE_THRESHOLD_MS=number                 # Default: 600000 (10 minutes)

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
REFLECTION_STEP0_ENFORCEMENT=block|warn|off     # Default: block
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

---

## 14. Session Hooks (Pro-Workflow Adoption)

**Location:** `.claude/hooks/session/`
**Event Types:** UserPromptSubmit, PreToolUse(Edit|Write), PostToolUse(Edit), Stop
**Default Enforcement:** Non-blocking (informational only, always exit 0)
**Purpose:** Session quality monitoring and state preservation

---

## 15. conflict-detector.cjs

**Location:** `.claude/hooks/evolution/conflict-detector.cjs`
**Event Type:** PreToolUse(Write)
**Default Enforcement:** block
**Purpose:** Enforces no naming conflicts when creating new artifact files

### Artifact Categories Checked

- `.claude/agents/**/*.md` (agent files)
- `.claude/skills/**/SKILL.md` (skill files)
- `.claude/workflows/**/*.md` (workflow files)

### Naming Convention Validation

**Pattern:** `^[a-z][a-z0-9-]*$` (kebab-case, lowercase, starts with letter)

**Examples:**

- ✅ `python-pro`, `mobile-ux-reviewer`, `c4-context`
- ❌ `Python-Pro` (uppercase), `_mobile` (underscore), `2-agents` (starts with number)

### Conflict Detection

The hook:

1. Extracts artifact name from file path
2. Searches existing artifacts in the same category
3. Blocks write if name already exists

**Message Format:**

```
[NAMING CONFLICT] Artifact "python-expert" already exists in agents.
Choose a unique name or enhance the existing artifact.
Run: Grep("python-expert", ".claude/agents/") to see existing artifact.
```

### Environment Variables

```bash
# Conflict detector enforcement
CONFLICT_DETECTOR=block|warn|off  # Default: block

# Disable for emergency artifact creation (not recommended)
CONFLICT_DETECTOR=off claude
```

**Why Enforcement Matters:**

- Prevents accidental overwrites of existing artifacts
- Enforces consistent naming conventions across all artifacts
- Guides creators to enhance existing artifacts instead of creating duplicates
- Ensures artifacts are discoverable (valid names work with search/indexing)

---

## 16. validate-skill-invocation.cjs

**Location:** `.claude/hooks/safety/validate-skill-invocation.cjs`
**Event Type:** PreToolUse(Read)
**Default Enforcement:** warn (informational only, never blocks)
**Purpose:** Reminds agents to use Skill() tool instead of reading SKILL.md files directly

### Detection Pattern

Matches paths: `.claude/skills/{skill-name}/SKILL.md`

### Hook Behavior

When agent uses `Read()` on a SKILL.md file:

- Extracts skill name from path
- Returns warning message (exit 0, non-blocking)
- Suggests using `Skill({ skill: "{name}" })` instead

**Message Format:**

```
Consider using Skill({ skill: "tdd" }) instead of reading SKILL.md directly.
Reading is allowed for reference, but Skill() tool applies the workflow.
```

### Why This Matters

**Reading vs Invoking:**

- `Read('SKILL.md')` - Gets content but doesn't apply workflow context
- `Skill({ skill: 'name' })` - Loads skill and applies it to current task

**Use Cases:**

- ✅ Reading for reference: Allowed (warning shown)
- ✅ Invoking skill: Use Skill() tool (proper workflow)

**No Environment Variables** - Always enabled, informational only (never blocks)

---

## 17. code-index-updater.cjs

**Location:** `.claude/hooks/routing/code-index-updater.cjs`
**Event Type:** PostToolUse(Write|Edit)
**Default Enforcement:** N/A (monitoring only, non-blocking)
**Purpose:** Automatically triggers incremental code index updates when source files are modified

### Indexable File Extensions

`.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, `.py`, `.go`, `.rs`, `.java`, `.cs`, `.rb`, `.php`, `.swift`, `.kt`, `.cpp`, `.cc`, `.cxx`, `.c`, `.h`, `.hpp`

### Excluded Patterns

- `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `coverage/`
- Minified files: `.min.`, `.bundle.`, `.map`
- Index itself: `.claude/context/code-index/`

### Update Strategy

1. **Incremental Update (Merkle tree):** O(log n) change detection, fast
2. **Fallback (directory index):** If incremental fails, index file's directory
3. **Debounced:** 5-second window to batch rapid changes (configurable)
4. **Non-blocking:** Runs in background, doesn't block file operations

### Lock Mechanism

- **Lock file:** `.claude/context/code-index/.indexing.lock`
- **Timeout:** 10 seconds (stale locks auto-removed)
- **Cross-process coordination:** Prevents concurrent indexing

### Environment Variables

```bash
# Disable auto-indexing
CODE_INDEX_AUTO_UPDATE=off  # Default: on

# Adjust debounce interval
CODE_INDEX_DEBOUNCE_MS=5000  # Default: 5000ms
```

### Integration with Memory

Best-effort updates to `codebase_map.json`:

- Records discovered files for memory system
- Skips `.claude/context/` files (internal state)
- Fails gracefully if memory system unavailable

**Why This Matters:**

- Keeps code index fresh without manual intervention
- Enables semantic search on recently modified code
- Debouncing prevents excessive indexing during rapid edits
- Fails open - indexing errors never block file operations

---

## 18. state-reset.cjs

**Location:** `.claude/hooks/session/state-reset.cjs`
**Event Type:** UserPromptSubmit
**Default Enforcement:** N/A (always enabled, non-blocking)
**Purpose:** Resets router state on every user prompt to prevent stale state bypassing enforcement

### What Gets Reset

**File:** `.claude/context/runtime/router-state.json`

**Reset Fields:**

- `mode: 'router'` (always starts in router mode)
- `taskSpawned: false` (prevents bypass of routing protocol)
- `taskListCalledSincePrompt: false` (enforces TaskList-first)
- `complexity: 'trivial'` (resets complexity assessment)
- `requiresPlannerFirst: false` (resets planner gate)
- `requiresSecurityReview: false` (resets security gate)
- `plannerSpawned: false` (resets planner tracking)
- `securitySpawned: false` (resets security tracking)

**Preserved Fields:**

- `sessionId` (maintains session continuity)

### Why This Matters

**Problem Solved (PROC-007):**

- Prevents stale `taskSpawned: true` from bypassing routing protocol
- Ensures every user prompt starts with clean state
- Prevents enforcement drift across multiple prompts

**Remediation Pattern:**

- Part of PROC-007 Option A (state reset on every prompt)
- Complements Fix 4b (staleness detection in routing-guard.cjs)
- Fail-open on errors (logs error but doesn't block prompt)

**Safety Net:**
If state reset fails, routing-guard.cjs detects stale state via:

- `STATE_STALE_THRESHOLD_MS` (default: 600000ms / 10 minutes)
- Invalid timestamps trigger fallback to router mode

**No Environment Variables** - Always enabled, runs on UserPromptSubmit

---

### drift-detector.cjs

**Event Type:** UserPromptSubmit
**Purpose:** Tracks original session intent, warns on drift after 6+ edits with <20% keyword overlap

**State File:** `.claude/context/runtime/drift-state.json`

**Behavior:**

- Captures original intent from first user prompt
- Tracks edit count per session
- Compares current prompt keywords with original intent
- Warns when drift detected (6+ edits, <20% keyword overlap)
- Always exits 0 (informational only, never blocks)

**No Environment Variables** - Always enabled, informational only

**Example:**

```
Session starts with "Add authentication to the app"
... 6 edits later, prompt is "Refactor database schema"
→ Warning: "Session drift detected: Current task diverges from original intent"
```

---

### adaptive-quality-gate.cjs

**Event Type:** PreToolUse(Edit|Write|NotebookEdit)
**Purpose:** Counts edits per session, suggests quality checkpoints at adaptive thresholds

**State File:** `.claude/context/runtime/edit-counter.json`
**Metrics Input:** `.claude/context/runtime/session-metrics.json` (corrections_count, prompt_count)

**Adaptive Thresholds:**

- **High correction rate** (>25%): first=3, second=6, repeat=6 (more aggressive)
- **Default**: first=5, second=10, repeat=10
- **Low correction rate** (<5%): first=10, second=20, repeat=20 (less aggressive)

**Warning Progression:**

1. First threshold: "Consider running: pnpm lint:fix && pnpm format"
2. Second threshold: "Strongly recommend running: pnpm lint:fix && pnpm format && pnpm test"
3. Repeat threshold: Every N edits after second threshold

**Hook Protocol:**

- ALWAYS exits 0 (non-blocking)
- ALWAYS passes through original input to stdout unchanged
- Graceful degradation: malformed counter file resets to 1, missing metrics file uses defaults
- Atomic file writes (tmp + rename)

**No Environment Variables** - Always enabled, informational only

---

### post-edit-scanner.cjs

**Event Type:** PostToolUse(Edit)
**Purpose:** Scans edited files for console.log, TODOs, hardcoded secrets

**Scan Limits:**

- First 500 lines per file
- Max 5 issues reported per invocation

**Detected Patterns:**

- `console.log`, `console.error`, `console.warn` (production anti-pattern)
- `TODO`, `FIXME`, `HACK` (incomplete work)
- Common secret patterns (API keys, tokens, passwords)

**Hook Protocol:**

- ALWAYS exits 0 (non-blocking)
- ALWAYS passes through original input to stdout unchanged
- Emits warnings to stderr

**No Environment Variables** - Always enabled, informational only

**Example:**

```
After editing auth.ts:
→ Warning: "console.log found at line 45: consider using structured logging"
→ Warning: "TODO found at line 120: incomplete implementation"
```

---

### pre-compact.cjs

**Event Type:** Stop
**Purpose:** Saves session state snapshot before context compaction

**State File:** `.claude/context/runtime/pre-compact-snapshot.json`

**Snapshot Structure:**

```json
{
  "timestamp": "2026-02-09T12:00:00.000Z",
  "editCount": 42,
  "correctionCount": 5,
  "promptCount": 10,
  "originalIntent": "Add authentication to the app",
  "driftEditCount": 6
}
```

**Source Files:**

- `edit-counter.json` (editCount)
- `session-metrics.json` (correctionCount, promptCount)
- `drift-state.json` (originalIntent, driftEditCount)

**Graceful Degradation:**

- Missing source files → defaults (0 or empty string)
- Malformed JSON → defaults (no crash)
- Always exits 0 (non-blocking)

**Hook Protocol:**

- ALWAYS exits 0 (non-blocking)
- ALWAYS passes through original input to stdout unchanged
- Atomic file writes (tmp + rename)
- Logs to stderr (not stdout)

**No Environment Variables** - Always enabled, runs on Stop event

---

## BACK TO MAIN

See **CLAUDE.md** Section 1.3 for inline summary.
