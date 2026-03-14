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

## TypeScript with AI/LLM Integration

When integrating with the Anthropic SDK or other LLM APIs, apply strict typing at every boundary.

**Typed Anthropic SDK Usage:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { Message, ContentBlock } from '@anthropic-ai/sdk/resources/messages';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generate(prompt: string): Promise<string> {
  const message: Message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  // Narrow content block type before accessing text
  const textBlock = message.content.find(
    (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text'
  );
  if (!textBlock) throw new Error('No text content in response');
  return textBlock.text;
}
```

**Zod for Runtime Validation of LLM Outputs:**

LLM responses are `unknown` at runtime — always parse with Zod before use:

```typescript
import { z } from 'zod';

const TaskPlanSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      agent: z.enum(['developer', 'qa', 'devops', 'technical-writer']),
      priority: z.number().int().min(1).max(5),
    })
  ),
  estimatedSteps: z.number().int().positive(),
});

type TaskPlan = z.infer<typeof TaskPlanSchema>;

async function parseLLMPlan(rawOutput: unknown): Promise<TaskPlan> {
  const result = TaskPlanSchema.safeParse(rawOutput);
  if (!result.success) {
    throw new Error(`Invalid LLM output: ${result.error.message}`);
  }
  return result.data;
}
```

**Rules:**

- Never use `as` casts on LLM response bodies — use Zod `safeParse` and handle the error branch
- Define SDK type imports with `import type` to prevent bundling type-only symbols
- Use discriminated unions for multi-step agent state machines (not `status?: string`)
- Export Zod schemas alongside their inferred types so consumers can validate at their own boundaries
