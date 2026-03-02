# Configuration Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-26

This document catalogs all environment variables used by the .claude framework, organized by category.

> **Note:** References to `unified-pre-write-hook.cjs` below are accurate. The hook registered in `settings.json` is `write-pretool-bundle.cjs`, which internally calls `unified-pre-write-hook.cjs`. Environment variables listed here are consumed by the inner hook via that bundle chain.

## Table of Contents

1. [Router Enforcement](#1-router-enforcement)
2. [EVOLVE Workflow](#2-evolve-workflow)
3. [Hook System](#3-hook-system)
4. [Memory System](#4-memory-system)
5. [Reflection System](#5-reflection-system)
6. [Safety Guards](#6-safety-guards)
7. [Performance & Debugging](#7-performance--debugging)

---

## 1. Router Enforcement

Variables controlling Router-First protocol enforcement.

### PLANNER_FIRST_ENFORCEMENT

**Purpose**: Controls automated enforcement of PLANNER-first requirement for HIGH/EPIC complexity tasks.

**Values**:

- `block` (default) - Blocks TaskCreate without PLANNER spawn
- `warn` - Allows TaskCreate but logs warning
- `off` - Disables enforcement (for debugging only)

**Used By**:

- `routing-guard.cjs`
- `routing-guard.cjs`

**Example**:

```bash
export PLANNER_FIRST_ENFORCEMENT=warn  # Development mode
export PLANNER_FIRST_ENFORCEMENT=block # Production (default)
```

**Documentation**: `.claude/docs/ROUTER_ENFORCEMENT.md`

### ROUTER_WRITE_GUARD

**Purpose**: Blocks Router from directly editing/writing files (forces agent spawning).

**Values**:

- `block` (default) - Prevents Router from using Edit/Write tools
- `warn` - Allows but logs warning
- `off` - Disables enforcement

**Used By**:

- `unified-pre-write-hook.cjs`

**Example**:

```bash
export ROUTER_WRITE_GUARD=off  # Allow Router to write (dangerous)
```

**Documentation**: `.claude/docs/ROUTER_ENFORCEMENT.md`

### SECURITY_REVIEW_ENFORCEMENT

**Purpose**: Enforces security architect review for security-sensitive changes.

**Values**:

- `block` (default) - Blocks changes without security review
- `warn` - Allows but logs warning
- `off` - Disables enforcement

**Used By**:

- `routing-guard.cjs`

**Example**:

```bash
export SECURITY_REVIEW_ENFORCEMENT=warn
```

---

## 2. EVOLVE Workflow

Variables controlling the self-evolution system.

### EVOLVE_AUTO_START

**Purpose**: Enables automatic EVOLVE workflow triggering when artifact creation is blocked.

**Values**:

- `false` (default) - Manual EVOLVE trigger required
- `true` - Auto-spawn evolution-orchestrator on blocking

**Used By**:

- `unified-pre-write-hook.cjs`

**Example**:

```bash
export EVOLVE_AUTO_START=true   # Enable auto-evolution
```

**Security**: Includes circuit breaker, sensitive path blocking, spawn depth tracking. See [EVOLVE Auto-Start](./SELF_EVOLUTION.md#9-evolve-auto-start-opt-out-mode).

**Documentation**: `.claude/docs/SELF_EVOLUTION.md`

### EVOLVE_RATE_LIMIT

**Purpose**: Circuit breaker rate limiting for EVOLVE auto-start.

**Values**:

- `3` (default) - Max 3 evolutions per hour
- `N` (integer) - Custom limit

**Used By**:

- `unified-pre-write-hook.cjs` (circuit breaker logic)

**Example**:

```bash
export EVOLVE_RATE_LIMIT=5  # Allow 5 evolutions per hour
```

**Documentation**: `.claude/docs/SELF_EVOLUTION.md`

### EVOLVE_ENFORCEMENT_OVERRIDE

**Purpose**: Bypass EVOLVE workflow enforcement for emergency artifact creation.

**Values**:

- Not set (default) - EVOLVE required for artifact creation
- `true` - Bypass EVOLVE enforcement

**Used By**:

- `unified-pre-write-hook.cjs`

**Example**:

```bash
export EVOLVE_ENFORCEMENT_OVERRIDE=true  # Emergency bypass
```

**Warning**: Only use for emergencies. Creates technical debt if artifacts lack research backing.

---

## 3. Hook System

Variables controlling hook execution and behavior.

### REFLECTION_ENABLED

**Purpose**: Master switch for reflection system hooks.

**Values**:

- `true` (default) - Reflection hooks enabled
- `false` - All reflection hooks disabled

**Used By**:

- `.claude/hooks/reflection/unified-reflection-handler.cjs`
- `.claude/hooks/reflection/reflection-queue-processor.cjs`
- `.claude/hooks/reflection/reflection-step0-guard.cjs`

**Example**:

```bash
export REFLECTION_ENABLED=false  # Disable reflection
```

**Documentation**: `.claude/docs/MEMORY_SYSTEM.md`

### REFLECTION_HOOK_MODE

**Purpose**: Controls reflection hook enforcement mode.

**Values**:

- `block` (default) - Reflection hooks block on failure
- `warn` - Log warnings but don't block
- `off` - Disable reflection hooks

**Used By**:

- All hooks in `.claude/hooks/reflection/`

**Example**:

```bash
export REFLECTION_HOOK_MODE=warn
```

### HOOK_FAIL_OPEN

**Purpose**: Security override for hook failures (debugging only).

**Values**:

- Not set (default) - Hooks fail closed (deny on error)
- `true` - Hooks fail open (allow on error)

**Used By**:

- Most hooks with error handling
- `unified-pre-write-hook.cjs`
- `routing-guard.cjs`

**Example**:

```bash
export HOOK_FAIL_OPEN=true  # Debugging only - DANGEROUS
```

**Warning**: Security risk. Only use for debugging hook errors. Never use in production.

### FILE_PLACEMENT_OVERRIDE

**Purpose**: Bypass file placement validation.

**Values**:

- Not set (default) - File placement enforced
- `true` - Bypass file placement rules

**Used By**:

- `unified-pre-write-hook.cjs`

**Example**:

```bash
export FILE_PLACEMENT_OVERRIDE=true  # Bypass placement checks
```

**Documentation**: `.claude/docs/FILE_PLACEMENT_RULES.md`

---

## 4. Memory System

Variables controlling memory management.

### CLAUDE_CODE_TASK_LIST_ID

**Purpose**: Shared task list ID for cross-session coordination.

**Values**:

- Not set (default) - Session-specific task list
- `<project-name>` - Shared task list identifier

**Used By**:

- Claude Code task tools (TaskCreate, TaskList, TaskUpdate)

**Example**:

```bash
export CLAUDE_CODE_TASK_LIST_ID="agent-studio-tasks"
```

**Documentation**: `.claude/docs/MEMORY_SYSTEM.md`, `.claude/skills/task-management-protocol/SKILL.md`

### MEMORY_LEARNINGS_ARCHIVE_THRESHOLD_KB

**Purpose**: Threshold for auto-archiving `learnings.md`.

**Values**:

- `40` (default) - Archive when `learnings.md` exceeds 40KB
- `N` (integer) - Custom threshold in KB

**Used By**:

- `.claude/lib/memory/memory-manager.cjs`

**Example**:

```bash
export MEMORY_LEARNINGS_ARCHIVE_THRESHOLD_KB=50
```

### MEMORY_LEARNINGS_WARN_THRESHOLD_KB

**Purpose**: Warning threshold for memory health output.

**Values**:

- `40` (default) - Warn when `learnings.md` exceeds 40KB
- `N` (integer) - Custom threshold in KB

**Used By**:

- `.claude/lib/memory/memory-manager.cjs`

**Example**:

```bash
export MEMORY_LEARNINGS_WARN_THRESHOLD_KB=40
```

### MEMORY_ACCESS_TRACKING / MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS

**Purpose**: Controls access-count sidecar updates for `patterns.json` / `gotchas.json`.

**Values**:

- `MEMORY_ACCESS_TRACKING`: `on|off` (default: `on`)
- `MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS`: number (default: `300000`)

**Used By**:

- `.claude/lib/memory/memory-manager.cjs`

**Example**:

```bash
export MEMORY_ACCESS_TRACKING=on
export MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS=300000
```

---

## 5. Reflection System

Variables controlling quality reflection and learning.

### REFLECTION_BATCH_SIZE

**Purpose**: Number of reflection queue entries to process in batch.

**Values**:

- `10` (default) - Process 10 entries per batch
- `N` (integer) - Custom batch size

**Used By**:

- `.claude/agents/core/reflection-agent.md`
- Reflection queue processor

**Example**:

```bash
export REFLECTION_BATCH_SIZE=20
```

### REFLECTION_MIN_SCORE

**Purpose**: Minimum rubric score threshold for reflection alerts.

**Values**:

- `0.7` (default) - Alert on scores < 0.7
- `N` (float 0.0-1.0) - Custom threshold

**Used By**:

- `.claude/agents/core/reflection-agent.md`

**Example**:

```bash
export REFLECTION_MIN_SCORE=0.8  # Higher quality threshold
```

---

## 6. Safety Guards

Variables controlling safety and validation systems.

### LOOP_PREVENTION_THRESHOLD

**Purpose**: Maximum loops before blocking recursive calls.

**Values**:

- `5` (default) - Block after 5 identical calls
- `N` (integer) - Custom threshold

**Used By**:

- `pre-task-unified.cjs`

**Example**:

```bash
export LOOP_PREVENTION_THRESHOLD=10
```

### VALIDATION_STRICT_MODE

**Purpose**: Enable strict validation for all artifacts.

**Values**:

- `false` (default) - Standard validation
- `true` - Strict validation (fail on warnings)

**Used By**:

- `.claude/lib/workflow/workflow-validator.js`
- `.claude/schemas/*.json` validators

**Example**:

```bash
export VALIDATION_STRICT_MODE=true
```

---

## 7. Performance & Debugging

Variables for performance tuning and debugging.

### PROJECT_ROOT

**Purpose**: Override project root detection (for testing/nested projects).

**Values**:

- Auto-detected (default) - Walks up to find `.claude/CLAUDE.md`
- `/absolute/path` - Custom project root

**Used By**:

- `.claude/lib/utils/project-root.cjs`
- All hooks and tools that write files

**Example**:

```bash
export PROJECT_ROOT=/home/user/projects/my-project
```

**Warning**: Only use for testing or unusual project structures.

### DEBUG_HOOKS

**Purpose**: Enable verbose hook execution logging.

**Values**:

- Not set (default) - Standard logging
- `true` - Verbose hook logging

**Used By**:

- All hooks (optional debug logging)

**Example**:

```bash
export DEBUG_HOOKS=true
```

### SKIP_VALIDATION

**Purpose**: Skip artifact validation for performance (development only).

**Values**:

- Not set (default) - Validation enabled
- `true` - Skip validation

**Used By**:

- `.claude/tools/cli/validate-agents.js`
- Creator skills (agent-creator, skill-creator, etc.)

**Example**:

```bash
export SKIP_VALIDATION=true  # Development only
```

**Warning**: Never use in production. Bypasses quality gates.

---

## Configuration Profiles

Recommended environment variable combinations for common scenarios.

### Production (Default)

```bash
# Router enforcement
export PLANNER_FIRST_ENFORCEMENT=block
export ROUTER_WRITE_GUARD=block
export SECURITY_REVIEW_ENFORCEMENT=block

# EVOLVE workflow
export EVOLVE_AUTO_START=false
export EVOLVE_RATE_LIMIT=3

# Safety
export HOOK_FAIL_OPEN=false  # or unset

# Reflection
export REFLECTION_ENABLED=true
export REFLECTION_HOOK_MODE=block
```

### Development (Permissive)

```bash
# Router enforcement - warn mode
export PLANNER_FIRST_ENFORCEMENT=warn
export ROUTER_WRITE_GUARD=warn
export SECURITY_REVIEW_ENFORCEMENT=warn

# EVOLVE workflow
export EVOLVE_AUTO_START=false  # Manual control
export EVOLVE_RATE_LIMIT=5

# Debugging
export DEBUG_HOOKS=true
export REFLECTION_HOOK_MODE=warn
```

### Rapid Prototyping (Auto-Evolution)

```bash
# Router enforcement
export PLANNER_FIRST_ENFORCEMENT=block
export ROUTER_WRITE_GUARD=block

# EVOLVE workflow - auto-start enabled
export EVOLVE_AUTO_START=true
export EVOLVE_RATE_LIMIT=10  # Higher limit for prototyping

# Safety still enforced
export SECURITY_REVIEW_ENFORCEMENT=block
export REFLECTION_ENABLED=true
```

### Emergency/Debug (DANGEROUS - Use Sparingly)

```bash
# Bypass enforcement
export PLANNER_FIRST_ENFORCEMENT=off
export ROUTER_WRITE_GUARD=off
export SECURITY_REVIEW_ENFORCEMENT=off
export EVOLVE_ENFORCEMENT_OVERRIDE=true
export FILE_PLACEMENT_OVERRIDE=true

# Fail open on errors
export HOOK_FAIL_OPEN=true

# Skip validation
export SKIP_VALIDATION=true

# ONLY USE FOR:
# - Emergency bug fixes
# - Hook debugging
# - Infrastructure recovery
```

**Warning**: Emergency profile disables ALL safety guards. Revert to production profile immediately after debugging.

---

## Related Documentation

- **Router Enforcement**: `.claude/docs/ROUTER_ENFORCEMENT.md`
- **Self-Evolution System**: `.claude/docs/SELF_EVOLUTION.md`
- **Memory System**: `.claude/docs/MEMORY_SYSTEM.md`
- **File Placement Rules**: `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Hook Reference**: `.claude/docs/HOOKS_REFERENCE.md`

---

**Version**: 1.0.0
**Last Updated**: 2026-01-26
