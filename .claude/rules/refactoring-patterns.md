# Refactoring Patterns

Systematic techniques for improving code structure without changing behavior. Always have tests passing before refactoring, and run them after each step.

## Core Principle

One refactoring at a time. Never mix refactoring with behavior changes in the same commit.

## Extract Method / Function

When a code block can be named and reused:

```typescript
// BEFORE
function processOrder(order: Order) {
  const tax = order.total * 0.08;
  const shipping = order.weight > 5 ? 15 : 5;
  const finalTotal = order.total + tax + shipping;
  // ... 20 more lines
}

// AFTER
function calculateTax(total: number): number { return total * 0.08; }
function calculateShipping(weight: number): number { return weight > 5 ? 15 : 5; }

function processOrder(order: Order) {
  const finalTotal = order.total + calculateTax(order.total) + calculateShipping(order.weight);
}
```

## Replace Magic Numbers with Named Constants

```typescript
// BEFORE
if (score > 0.85) { ... }
setTimeout(fn, 86400000);

// AFTER
const CONFIDENCE_THRESHOLD = 0.85;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
if (score > CONFIDENCE_THRESHOLD) { ... }
setTimeout(fn, ONE_DAY_MS);
```

## Introduce Parameter Object

When a function takes 3+ related parameters:

```typescript
// BEFORE
function createUser(firstName: string, lastName: string, email: string, role: string) { }

// AFTER
interface CreateUserParams { firstName: string; lastName: string; email: string; role: string; }
function createUser(params: CreateUserParams) { }
```

## Remove Flag Arguments

Boolean flags are a code smell — split into two functions:

```typescript
// BEFORE
function render(data: Data, isVerbose: boolean) { }

// AFTER
function render(data: Data) { }
function renderVerbose(data: Data) { }
```

## Decompose Conditional

Extract complex boolean logic into named predicates:

```typescript
// BEFORE
if (user.role === 'admin' && user.verified && !user.suspended && Date.now() < user.expiresAt) { }

// AFTER
function isActiveAdmin(user: User): boolean {
  return user.role === 'admin' && user.verified && !user.suspended && Date.now() < user.expiresAt;
}
if (isActiveAdmin(user)) { }
```

## Replace Conditional with Map/Strategy

When switching on type/kind with similar structure:

```typescript
// BEFORE
function getIcon(type: string): string {
  if (type === 'error') return '❌';
  if (type === 'warning') return '⚠️';
  if (type === 'info') return 'ℹ️';
  return '?';
}

// AFTER
const ICONS: Record<string, string> = { error: '❌', warning: '⚠️', info: 'ℹ️' };
function getIcon(type: string): string { return ICONS[type] ?? '?'; }
```

## Inline Variable (Remove Unnecessary Intermediary)

```typescript
// BEFORE — variable adds no clarity
const result = getUserById(id);
return result;

// AFTER
return getUserById(id);
```

## Move Function

If a function uses data from another class/module more than its own, move it there.

## Safe Refactoring Sequence

1. Ensure all tests pass (green state)
2. Make one small refactoring change
3. Run tests — must still pass
4. Commit the refactoring
5. Repeat

Never refactor and add features in the same step.

## When to Invoke

Use the `code-simplifier` agent for large-scale refactoring. Invoke this rule for any code cleanup task.
