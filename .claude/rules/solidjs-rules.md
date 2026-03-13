# SolidJS Rules

## Signals

- Create reactive primitives with `createSignal<T>(initialValue)` — always provide a type parameter for non-primitive values
- Access signal values by calling the getter: `count()` not `count` — forgetting `()` returns the function, not the value
- Use setter with updater function for derived updates: `setCount(c => c + 1)` — avoids stale closure bugs
- Never destructure signals: `const [count, setCount] = createSignal(0)` is the only valid pattern
- Signals outside components are global singletons — use them only for true application-global state

## createMemo

- Use `createMemo(() => ...)` for derived values that depend on signals; never recompute in JSX template expressions
- `createMemo` caches and only re-runs when its tracked dependencies change — do not add side effects inside it
- Prefer `createMemo` over `createEffect` for values used in the template; `createEffect` is for side effects only
- Provide an equality function `createMemo(() => ..., undefined, { equals: (a, b) => ... })` when memoizing objects to avoid spurious re-runs
- Do not call signals inside `createMemo` conditionally — all signals must be accessed unconditionally to ensure tracking

## createEffect

- Use `createEffect(() => ...)` for side effects that run when reactive dependencies change (logging, DOM manipulation, subscriptions)
- `createEffect` runs after rendering; for pre-render side effects use `createRenderEffect`
- Return a cleanup function from `createEffect` for subscriptions: `createEffect(() => { const sub = subscribe(); return () => sub.unsubscribe(); })`
- Avoid setting signals inside `createEffect` to prevent infinite loops; use `batch()` if multiple signal updates must be atomic
- Never use `createEffect` for derived UI state — use `createMemo` instead

## For and Show Components

- Always use `<For each={items()}>` for rendering lists — never `.map()` in JSX; `<For>` is keyed by item identity
- Provide a `fallback` prop to `<For>` for empty-state rendering: `<For each={items()} fallback={<p>Empty</p>}>`
- Use `<Show when={condition()} fallback={<Fallback />}>` for conditional rendering — replaces ternary expressions in templates
- `<Show>` unmounts and remounts children when `when` flips; use `<Show keyed>` to preserve identity across condition changes
- Use `<Switch>` + `<Match>` for multi-branch conditionals; avoid deeply nested `<Show>` trees

## createStore

- Use `createStore<T>(initialState)` for nested reactive objects; plain `createSignal` is insufficient for deep mutation tracking
- Mutate store with setter path syntax: `setStore('user', 'name', 'Alice')` — never mutate the store object directly
- Use `produce` from `solid-js/store` for Immer-style mutations: `setStore(produce(s => { s.items.push(newItem) }))`
- Access nested store values as plain properties: `store.user.name` — no `()` needed (store uses Proxy)
- Avoid spreading store objects; spreading breaks reactivity by creating plain object snapshots

## batch()

- Wrap multiple signal/store updates in `batch(() => { ... })` to coalesce re-renders into a single synchronous update
- `batch` is synchronous — do not `await` inside it; all updates must be synchronous
- Use `batch` when a single user action triggers 3+ signal updates to avoid intermediate render states
- `createEffect` defers until after the batch completes — do not rely on effects seeing intermediate states within a batch
- `untrack(() => signal())` reads a signal without subscribing to it; use in effects to read without creating dependencies

## Anti-Patterns

- Never use `useEffect` patterns from React — SolidJS does not re-render components; components run once
- Never conditionally call `createSignal`, `createMemo`, or `createEffect` — hooks are not subject to React's rules but must be called at component initialization time
- Never store the result of `createSignal` in a ref or closure that outlives the reactive root — signals must be created in a root (`createRoot` or component)
- Never access store properties inside `batch` and expect them to reflect updates made in the same batch — reads are synchronous but derived computations batch
- Never use index as key in `<For>` — SolidJS uses referential equality; index keys cause unnecessary DOM churn on list reorder

## When to invoke

`Skill({ skill: 'solidjs-expert' })` for SolidJS reactivity design, component architecture, and store management
