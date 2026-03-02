---
name: dispatching-parallel-agents
description: Concurrent investigation of independent failures. Use when multiple unrelated issues need parallel resolution.
version: 1.1.0
verified: true
lastVerifiedAt: '2026-02-28'
category: 'Orchestration & Coordination'
agents: [planner, master-orchestrator, developer]
tags: [parallel-agents, fan-out, diagnosis, concurrent, synthesis]
model: sonnet
invoked_by: both
user_invocable: true
tools: [Task, Read]
best_practices:
  - Only parallelize truly independent issues
  - Group by domain/subsystem
  - Verify no conflicts after integration
error_handling: graceful
streaming: supported
---

# Dispatching Parallel Agents

## Overview

When you have multiple unrelated failures (different test files, different subsystems, different bugs), investigating them sequentially wastes time. Each investigation is independent and can happen in parallel.

**Core principle:** Dispatch one agent per independent problem domain. Let them work concurrently.

## When to Use

```dot
digraph when_to_use {
    "Multiple failures?" [shape=diamond];
    "Are they independent?" [shape=diamond];
    "Single agent investigates all" [shape=box];
    "One agent per problem domain" [shape=box];
    "Can they work in parallel?" [shape=diamond];
    "Sequential agents" [shape=box];
    "Parallel dispatch" [shape=box];

    "Multiple failures?" -> "Are they independent?" [label="yes"];
    "Are they independent?" -> "Single agent investigates all" [label="no - related"];
    "Are they independent?" -> "Can they work in parallel?" [label="yes"];
    "Can they work in parallel?" -> "Parallel dispatch" [label="yes"];
    "Can they work in parallel?" -> "Sequential agents" [label="no - shared state"];
}
```

**Use when:**

- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**

- Failures are related (fix one might fix others)
- Need to understand full system state
- Agents would interfere with each other

## The Pattern

### 1. Identify Independent Domains

Group failures by what's broken:

- File A tests: Tool approval flow
- File B tests: Batch completion behavior
- File C tests: Abort functionality

Each domain is independent - fixing tool approval doesn't affect abort tests.

### 2. Create Focused Agent Tasks

Each agent gets:

- **Specific scope:** One test file or subsystem
- **Clear goal:** Make these tests pass
- **Constraints:** Don't change other code
- **Expected output:** Summary of what you found and fixed

### 3. Dispatch in Parallel

```typescript
// In Claude Code / AI environment
Task('Fix agent-tool-abort.test.ts failures');
Task('Fix batch-completion-behavior.test.ts failures');
Task('Fix tool-approval-race-conditions.test.ts failures');
// All three run concurrently
```

### 4. Review and Integrate

When agents return:

- Read each summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

## Agent Prompt Structure

Good agent prompts are:

1. **Focused** - One clear problem domain
2. **Self-contained** - All context needed to understand the problem
3. **Specific about output** - What should the agent return?

```markdown
Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:

1. "should abort tool with partial output capture" - expects 'interrupted at' in message
2. "should handle mixed completed and aborted tools" - fast tool aborted instead of completed
3. "should properly track pendingToolCount" - expects 3 results but gets 0

These are timing/race condition issues. Your task:

1. Read the test file and understand what each test verifies
2. Identify root cause - timing issues or actual bugs?
3. Fix by:
   - Replacing arbitrary timeouts with event-based waiting
   - Fixing bugs in abort implementation if found
   - Adjusting test expectations if testing changed behavior

Do NOT just increase timeouts - find the real issue.

Return: Summary of what you found and what you fixed.
```

## Common Mistakes

**X Too broad:** "Fix all the tests" - agent gets lost
**V Specific:** "Fix agent-tool-abort.test.ts" - focused scope

**X No context:** "Fix the race condition" - agent doesn't know where
**V Context:** Paste the error messages and test names

**X No constraints:** Agent might refactor everything
**V Constraints:** "Do NOT change production code" or "Fix tests only"

**X Vague output:** "Fix it" - you don't know what changed
**V Specific:** "Return summary of root cause and changes"

## When NOT to Use

**Related failures:** Fixing one might fix others - investigate together first
**Need full context:** Understanding requires seeing entire system
**Exploratory debugging:** You don't know what's broken yet
**Shared state:** Agents would interfere (editing same files, using same resources)

## Real Example from Session

**Scenario:** 6 test failures across 3 files after major refactoring

**Failures:**

- agent-tool-abort.test.ts: 3 failures (timing issues)
- batch-completion-behavior.test.ts: 2 failures (tools not executing)
- tool-approval-race-conditions.test.ts: 1 failure (execution count = 0)

**Decision:** Independent domains - abort logic separate from batch completion separate from race conditions

**Dispatch:**

```
Agent 1 -> Fix agent-tool-abort.test.ts
Agent 2 -> Fix batch-completion-behavior.test.ts
Agent 3 -> Fix tool-approval-race-conditions.test.ts
```

**Results:**

- Agent 1: Replaced timeouts with event-based waiting
- Agent 2: Fixed event structure bug (threadId in wrong place)
- Agent 3: Added wait for async tool execution to complete

**Integration:** All fixes independent, no conflicts, full suite green

**Time saved:** 3 problems solved in parallel vs sequentially

## Key Benefits

1. **Parallelization** - Multiple investigations happen simultaneously
2. **Focus** - Each agent has narrow scope, less context to track
3. **Independence** - Agents don't interfere with each other
4. **Speed** - 3 problems solved in time of 1

## Verification

After agents return:

1. **Review each summary** - Understand what changed
2. **Check for conflicts** - Did agents edit same code?
3. **Run full suite** - Verify all fixes work together
4. **Spot check** - Agents can make systematic errors

## Real-World Impact

From debugging session (2025-10-03):

- 6 failures across 3 files
- 3 agents dispatched in parallel
- All investigations completed concurrently
- All fixes integrated successfully
- Zero conflicts between agent changes

## Iron Laws

1. **NEVER** parallelize tasks that share mutable state or write to the same files — concurrent writes cause race conditions, merge conflicts, and lost changes.
2. **ALWAYS** define forbidden paths and owned paths for each parallel agent before spawning — agents without explicit path ownership will step on each other.
3. **ALWAYS** synthesize all agent findings before implementing any changes — acting on partial parallel results before synthesis creates conflicting fixes.
4. **NEVER** spawn more parallel agents than there are truly independent investigation domains — forced parallelism on related issues creates coordination overhead without benefit.
5. **ALWAYS** verify zero conflicts exist between all agent changes before marking the parallel dispatch complete — unverified integration is not complete integration.

## Anti-Patterns

| Anti-Pattern                                             | Why It Fails                                                                           | Correct Approach                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Spawning parallel agents on the same files               | Race condition; last write wins; one agent's fix silently overwrites another's         | Define `owned_paths` per agent; ensure no overlap before spawning                       |
| Acting on the first agent result without waiting for all | Creates partial, conflicting state before synthesis is done                            | Wait for all parallel agents to complete; synthesize before any implementation          |
| Parallelizing sequential dependencies                    | Agent B depends on Agent A's output; parallel execution causes B to work on stale data | Map dependencies first; only parallelize truly independent domains                      |
| No conflict verification step after integration          | Conflicting changes are silently accepted; system is left in invalid state             | Always run a conflict-check pass after all parallel agents complete                     |
| Using parallel dispatch for simple 2-step tasks          | Parallelism overhead exceeds benefit for short tasks                                   | Use parallel dispatch only when each investigation domain requires 3+ independent steps |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
