# Lock Order Contract

This document defines the canonical lock acquisition order for runtime state mutations.

## Required Order

1. `workflow-state.lock`
2. `memory-tiers.lock`

`LOCK_ORDER: workflow-state -> memory-tiers`

## Rule

If a code path may acquire both locks, it must always acquire `workflow-state.lock` first, then `memory-tiers.lock`, and release in reverse order.

Do not introduce any code path that acquires `memory-tiers.lock` first and then attempts `workflow-state.lock`.

## Why

Consistent lock ordering prevents deadlocks under concurrent workflow + memory writes.

## Enforcement

- In-code lock comments in:
  - `.claude/lib/workflow/workflow-state-lock.cjs`
  - `.claude/lib/memory/memory-tiers-lock.cjs`
- Contract test:
  - `tests/lib/workflow/lock-order-contract.test.cjs`
