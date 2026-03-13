# TypeScript Development Standards

## Strict Configuration

Always use `strict: true` in tsconfig.json. Never disable individual strict checks to silence errors.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true
  }
}
```

## No `any`

- Ban `any` type — use `unknown` for untyped data, narrow before use
- Use `satisfies` operator for type-safe object literals
- Use type predicates (`value is T`) for runtime narrowing

```typescript
// BAD
function parse(data: any) {
  return data.name;
}

// GOOD
function parse(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return String((data as { name: unknown }).name);
  }
  throw new Error('Invalid data');
}
```

## Discriminated Unions

Model state as discriminated unions — never use optional fields to represent state variants.

```typescript
// BAD
interface State {
  loading?: boolean;
  data?: string;
  error?: Error;
}

// GOOD
type State =
  | { status: 'loading' }
  | { status: 'success'; data: string }
  | { status: 'error'; error: Error };
```

## Exhaustive Checks

Use `never` for exhaustive switch statements:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

switch (state.status) {
  case 'loading':
    return '...';
  case 'success':
    return state.data;
  case 'error':
    return state.error.message;
  default:
    return assertNever(state);
}
```

## Generic Constraints

- Constrain generics to the minimum interface required
- Use `extends` constraints, not `any`
- Prefer built-in utility types: `Partial<T>`, `Required<T>`, `Pick<T,K>`, `Omit<T,K>`, `Record<K,V>`, `Readonly<T>`

```typescript
// BAD
function getKey<T>(obj: T, key: string): any { ... }

// GOOD
function getKey<T, K extends keyof T>(obj: T, key: K): T[K] { ... }
```

## Type vs Interface

- Use `interface` for object shapes that may be extended/implemented
- Use `type` for unions, intersections, mapped types, and aliases
- Never use `namespace` in modern TypeScript

## Import Organization

Use `import type` for type-only imports to improve tree-shaking:

```typescript
import type { User } from './types';
import { createUser } from './user-service';
```

## When to Invoke

Reference these standards for any TypeScript file. For deep TypeScript architecture, use the `typescript-pro` agent.
