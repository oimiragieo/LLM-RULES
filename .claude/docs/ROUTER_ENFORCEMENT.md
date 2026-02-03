# Router Enforcement System

## Overview

The Router Enforcement System prevents the Router (Claude) from bypassing the Router-First Protocol by creating tasks directly instead of spawning a PLANNER agent. This hybrid multi-layer enforcement system combines prompt engineering, advisory hooks, and blocking hooks to enforce proper delegation.

**Status**: Active
**ADR**: ADR-006 (Accepted 2026-01-25)
**Configuration**: `PLANNER_FIRST_ENFORCEMENT` environment variable

**Note**: `user-prompt-unified.cjs` performs complexity classification using `routing-table.cjs` on UserPromptSubmit. `router-enforcer.cjs` is an advisory standalone helper and is not registered by default in `settings.json`.

## The Problem

Despite explicit Router protocols in CLAUDE.md and router-decision.md, the Router violates the protocol by:

1. Creating tasks directly (TaskCreate) for complex/HIGH/EPIC requests
2. Acting as both Router and Planner simultaneously
3. Ignoring advisory hooks that recommend spawning PLANNER

**Root Cause**: LLMs respond to immediate task pressure over abstract rules, even when rules are explicit and comprehensive.

## The Solution: Hybrid Enforcement

A 5-component system with multiple layers of enforcement:

```
Layer 1: Prompt Engineering (CLAUDE.md Section 1.2)
         ↓
Layer 2: State Enhancement (router-state.cjs)
         ↓
Layer 3: Advisory Detection (user-prompt-unified.cjs, uses routing-table.cjs)
         ↓
Layer 4: Spawn Tracking (agent-context-tracker.cjs)
         ↓
Layer 5: BLOCKING Enforcement (task-create-guard.cjs)
```

## Architecture

### Component 1: State Enhancement (router-state.cjs)

**Location**: `.claude/hooks/routing/router-state.cjs`
**Hook Type**: `UserPromptSubmit` (pre-execution)
**Purpose**: Tracks complexity classification and agent spawn events (written by user-prompt-unified.cjs)

**Extended State Schema**:

```javascript
{
  complexity: "LOW" | "MEDIUM" | "HIGH" | "EPIC",
  plannerSpawned: boolean,
  securitySpawned: boolean,
  lastUserMessage: string,
  timestamp: number
}
```

**Behavior**:

- Updated by user-prompt-unified.cjs during UserPromptSubmit
- Does NOT classify complexity itself (user-prompt-unified.cjs does that)
- Provides state persistence across hook invocations

### Component 2: Classification Storage (user-prompt-unified.cjs)

**Location**: `.claude/hooks/routing/user-prompt-unified.cjs` (routing data in `.claude/lib/routing/routing-table.cjs`)
**Hook Type**: `UserPromptSubmit` (pre-execution)
**Purpose**: Classifies complexity and saves to router-state.cjs

**Complexity Detection**:

```javascript
const COMPLEXITY_INDICATORS = {
  EPIC: ['migrate', 'refactor entire', 'rewrite', 'redesign'],
  HIGH: [
    'integrate',
    'authentication',
    'security',
    'database schema',
    'payment',
    'multi-step',
    'architecture',
  ],
  MEDIUM: ['feature', 'add', 'update', 'enhance'],
  LOW: ['fix', 'bug', 'typo', 'update doc'],
};
```

**Output**: Advisory message (printed when running `router-enforcer.cjs` manually) recommending PLANNER for HIGH/EPIC complexity

```
🔀 ROUTER ANALYSIS
Intent: integration
Complexity: HIGH
Recommended agents:
  1. planner (score: 3)
  2. security-architect (score: 3)

⚠️  MULTI-AGENT PLANNING REQUIRED
 → Architect review: REQUIRED
 → Security review: REQUIRED
```

### Component 3: Spawn Tracking (agent-context-tracker.cjs)

**Location**: `.claude/hooks/safety/agent-context-tracker.cjs`
**Hook Type**: `PreToolUse` (before Task tool)
**Purpose**: Detects when PLANNER or SECURITY-ARCHITECT agents are spawned

**Detection Logic**:

```javascript
if (taskPrompt.includes('You are PLANNER') || taskPrompt.includes('You are the PLANNER')) {
  await saveRouterState({ plannerSpawned: true });
}

if (taskPrompt.includes('You are SECURITY-ARCHITECT')) {
  await saveRouterState({ securitySpawned: true });
}
```

**Integration**: Updates router-state.cjs with spawn flags

### Component 4: TaskCreate Guard (task-create-guard.cjs) - NEW

**Location**: `.claude/hooks/safety/task-create-guard.cjs`
**Hook Type**: `PreToolUse` (before TaskCreate tool)
**Purpose**: BLOCKS TaskCreate for complex tasks if PLANNER not spawned

**Enforcement Logic**:

```javascript
const state = await loadRouterState();

// HIGH/EPIC complexity + no PLANNER = BLOCK
if ((state.complexity === 'HIGH' || state.complexity === 'EPIC') && !state.plannerSpawned) {
  console.error(`
╔═══════════════════════════════════════════════════════════════════════════╗
║ ❌ BLOCKED: TaskCreate for ${state.complexity} complexity without PLANNER ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Router MUST spawn PLANNER agent first for complex tasks                  ║
║                                                                           ║
║ CORRECT flow:                                                             ║
║   1. Router analyzes request → complexity: ${state.complexity}            ║
║   2. Router spawns PLANNER: Task({ prompt: "You are PLANNER..." })       ║
║   3. PLANNER creates tasks via TaskCreate                                 ║
║                                                                           ║
║ See: CLAUDE.md Section 1.2 Gate 1 (Complexity Check)                     ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);

  process.exit(1); // BLOCK
}
```

**Configuration**: Controlled by `PLANNER_FIRST_ENFORCEMENT` environment variable

**Allowed Scenarios**:

- LOW/MEDIUM complexity (Router may create tasks directly)
- HIGH/EPIC complexity + PLANNER spawned (proper delegation)
- Disabled via environment variable

### Component 5: Documentation (CLAUDE.md Section 1.2)

**Location**: `CLAUDE.md`
**Section**: 1.2 SELF-CHECK PROTOCOL (MANDATORY)
**Purpose**: Explicit 3-gate decision tree with STOP gates

**Gate 1: Complexity Check**:

```
1. Is this a multi-step task?
2. Does it require code changes across multiple files?
3. Does it require architectural decisions?

If ANY YES → STOP. Spawn PLANNER first.
```

**Gate 2: Security Check**:

```
1. Does it involve authentication, authorization, or credentials?
2. Does it modify security-critical code?
3. Does it involve external integrations?

If ANY YES → STOP. Include SECURITY-ARCHITECT in review.
```

**Gate 3: Tool Check**:

```
1. Am I about to use a blacklisted tool?
2. Am I about to create tasks directly (TaskCreate) for complex requests?

If ANY YES → STOP. Spawn an agent instead.
```

**TaskCreate Restriction**:

Router may use TaskCreate ONLY for:

- Trivial/Low complexity tasks (single-file, single-operation)
- Tasks created BY a spawned PLANNER agent

Router must NOT use TaskCreate for:

- High/Epic complexity tasks (spawn PLANNER first)
- Implementation tasks (spawn DEVELOPER)
- Security-sensitive tasks (spawn SECURITY-ARCHITECT)

## Configuration

Set the enforcement mode via environment variable:

```bash
# Block mode (default) - TaskCreate blocked for HIGH/EPIC without PLANNER
PLANNER_FIRST_ENFORCEMENT=block claude

# Warn mode - Show warning but allow
PLANNER_FIRST_ENFORCEMENT=warn claude

# Off mode - Disable guard (advisory only)
PLANNER_FIRST_ENFORCEMENT=off claude
```

**Modes**:

| Mode              | Behavior                      | Use Case                       |
| ----------------- | ----------------------------- | ------------------------------ |
| `block` (default) | Exit 1, prevents TaskCreate   | Production, strict enforcement |
| `warn`            | Exit 0, prints warning        | Development, debugging         |
| `off`             | Disabled, advisory hooks only | Emergency override             |

## Enforcement Flow

```
User: "Add authentication to the app"
  ↓
[UserPromptSubmit Hook] router-enforcer.cjs
  → Classifies complexity: HIGH
  → Saves to router-state: { complexity: "HIGH" }
  → Outputs advisory: "MULTI-AGENT PLANNING REQUIRED"
  ↓
Claude Router Decision Point:

  Option A (CORRECT):
    Task({ prompt: "You are PLANNER..." })  ← Spawn PLANNER
      ↓
    [PreToolUse Hook] agent-context-tracker.cjs
      → Detects "You are PLANNER"
      → Updates router-state: { plannerSpawned: true }
      ↓
    PLANNER creates tasks via TaskCreate
      ↓
    [PreToolUse Hook] task-create-guard.cjs
      → Checks: complexity=HIGH, plannerSpawned=true
      → ALLOWS (proper delegation)

  Option B (BLOCKED):
    TaskCreate({ subject: "Add auth" })  ← Router creates task directly
      ↓
    [PreToolUse Hook] task-create-guard.cjs
      → Checks: complexity=HIGH, plannerSpawned=false
      → BLOCKS with error message and exit 1
```

## Violation Examples

### Example 1: Multi-Step Task Violation

**Wrong**:

```
User: "Add authentication to the app"
Router: TaskCreate({ subject: "Add auth", description: "Implement JWT auth" })
        [Router creating implementation task directly]
```

**Correct**:

```
User: "Add authentication to the app"
Router: [ROUTER] Analyzing: Multi-step, security-sensitive
        TaskList() → Task({ prompt: "You are PLANNER. Design auth feature..." })
        [Spawn PLANNER to design, then SECURITY-ARCHITECT to review]
```

### Example 2: Security Check Violation

**Wrong**:

```
User: "Update the user authentication logic"
Router: Task({ prompt: "You are DEVELOPER. Update auth..." })
        [Missing security review for auth changes]
```

**Correct**:

```
User: "Update the user authentication logic"
Router: [ROUTER] Security-sensitive change detected
        Task({ prompt: "You are DEVELOPER..." })
        Task({ prompt: "You are SECURITY-ARCHITECT. Review auth changes..." })
        [Parallel spawn: DEVELOPER + SECURITY-ARCHITECT]
```

### Example 3: Tool Check Violation

**Wrong**:

```
User: "What TypeScript files are in the project?"
Router: Glob({ pattern: "**/*.ts" })
        [Router using blacklisted Glob tool directly]
```

**Correct**:

```
User: "What TypeScript files are in the project?"
Router: Task({ prompt: "You are DEVELOPER. List all TypeScript files..." })
        [Spawn agent to explore codebase]
```

## Related Files

| File                                             | Purpose                   | Hook Type               |
| ------------------------------------------------ | ------------------------- | ----------------------- |
| `.claude/hooks/routing/router-state.cjs`         | State persistence         | UserPromptSubmit        |
| `.claude/hooks/routing/router-enforcer.cjs`      | Complexity classification | UserPromptSubmit        |
| `.claude/hooks/safety/agent-context-tracker.cjs` | Spawn tracking            | PreToolUse (Task)       |
| `.claude/hooks/safety/task-create-guard.cjs`     | TaskCreate blocking       | PreToolUse (TaskCreate) |
| `CLAUDE.md` Section 1.2                          | Self-check protocol       | Documentation           |
| `.claude/workflows/core/router-decision.md`      | Complete routing workflow | Workflow                |

## Testing

Test the enforcement system:

```bash
# 1. Verify hooks are registered
cat .claude/settings.json | grep -E "router-state|router-enforcer|agent-context-tracker|task-create-guard"

# 2. Test complexity detection
echo "Add authentication to the app" | node .claude/hooks/routing/router-enforcer.cjs

# 3. Test blocking behavior (requires Claude Code session)
# Submit: "Integrate external authentication library"
# Expected: Advisory + BLOCK if Router tries TaskCreate without spawning PLANNER
```

## Troubleshooting

### False Positives

If task-create-guard.cjs blocks legitimate low-complexity tasks:

1. Check router-state.cjs: `cat .claude/context/state/router-state.json`
2. Verify complexity classification in router-enforcer.cjs
3. Temporarily disable: `PLANNER_FIRST_ENFORCEMENT=off`
4. Report issue to framework maintainers

### Hook Not Running

If enforcement not active:

1. Verify hook registration: `cat .claude/settings.json`
2. Check hook execution permissions: `ls -la .claude/hooks/safety/task-create-guard.cjs`
3. Test hook manually: `node .claude/hooks/safety/task-create-guard.cjs '{"tool":"TaskCreate","input":{"subject":"test"}}'`
4. Check Claude Code hook support version

## Key Learnings

**Why Multiple Layers?**

1. **Prompt Engineering Alone Fails**: LLMs ignore abstract rules under task pressure
2. **Advisory Hooks Ignored**: Router dismisses warnings as "suggestions"
3. **Blocking Hooks Required**: Hard enforcement via exit codes prevents violations
4. **State Tracking Essential**: Hooks must share context (complexity, spawn events)
5. **Escape Hatch Needed**: Environment variable for edge cases or emergencies

**Design Principles**:

1. **Defense in Depth**: Multiple layers catch violations at different points
2. **Fail Closed**: Default to blocking, not allowing
3. **Configurable**: Environment variable for different strictness levels
4. **Observable**: Clear error messages explain WHY blocked
5. **Auditable**: All decisions logged to router-state.json

## Future Enhancements

Potential improvements (not yet implemented):

1. **Complexity Confidence Score**: Track how confident classification is
2. **User Override**: Allow user to confirm Router's direct task creation
3. **Learning Mode**: Record violations for improving complexity detection
4. **Spawn Chain Validation**: Ensure PLANNER spawns appropriate agents
5. **Audit Log**: Comprehensive log of all enforcement decisions

## References

- **ADR-006**: Router Enforcement - Hybrid Multi-Layer Approach
- **CLAUDE.md**: Section 1.2 (Self-Check Protocol)
- **router-decision.md**: Complete routing workflow
- **Issues**: SEC-001, SEC-002, SEC-003 (security validator fixes)
