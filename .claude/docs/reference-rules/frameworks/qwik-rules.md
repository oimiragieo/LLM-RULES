# Qwik Rules

## Resumability Model

- Qwik serializes application state to HTML at SSR time — never rely on in-memory state surviving across server/client boundary
- Use `$` suffix for lazy-loadable functions: `component$`, `useTask$`, `useVisibleTask$`, `useOn$`
- Never capture large objects in closures passed to `$` functions — only serializable primitives, signals, and stores cross the boundary
- Lazy loading is automatic: every `$`-suffixed function becomes a separate chunk; no manual `React.lazy()` or dynamic imports needed
- Server-only code goes in `.server.ts` files or inside `server$()` — Qwik will never ship these to the client

## Components

- Define components with `component$(() => { ... })` — not function declarations or arrow functions without `$`
- Props are automatically typed via the generic: `component$<{ name: string }>((props) => { ... })`
- Use `useSignal<T>(initialValue)` for primitive reactive state; use `useStore<T>({})` for object reactive state
- Never destructure stores at the top of a component — destructuring breaks reactivity. Access via `store.field` in JSX
- Use `useComputed$(() => derivedValue)` for derived state — never recompute in JSX template expressions

## Event Handlers

- Prefix event handlers with `$` to enable lazy loading: `onClick$`, `onInput$`, `onChange$`
- Inline handlers: `<button onClick$={() => count.value++}>` — the closure is automatically extracted as a lazy chunk
- For reusable handlers, extract to a named `$` function: `const handleClick = $(() => { ... })`
- Never use native DOM `addEventListener` in components — use Qwik's `useOn$` or JSX event props instead
- `useOn$(event, handler$)` for programmatic event listeners that need cleanup on component destroy

## Data Loading (Loaders)

- Use `routeLoader$` for page-level data fetching — runs on the server, serialized to HTML, zero client JS for data
- Use `routeAction$` for form submissions and mutations — integrates with HTML `<Form>` for progressive enhancement
- Access loader data in components with `const data = useLoaderName()` — returns a signal, not a raw value
- Loaders run in parallel by default; declare dependencies with `loader.use()` only when ordering is required
- Never fetch data inside `component$` directly — use loaders for SSR data, `useResource$` for client-side fetching after interaction

## Anti-Patterns

- Never use `useVisibleTask$` for data that can be loaded server-side — it defeats SSR and ships unnecessary JS
- Never use `document` or `window` in component body — wrap in `useVisibleTask$` with `{ strategy: 'document-ready' }`
- Never import React hooks or React-specific libraries — Qwik has its own signal-based reactive primitives
- Never use `useTask$` with `track(() => signal.value)` for side effects that should be `useComputed$` — use the right primitive
- Never serialize non-serializable values (class instances, functions, Promises) in `useStore` or loader return values

## When to invoke

`Skill({ skill: 'qwik-expert' })` for Qwik resumability architecture, routing, and performance optimization
