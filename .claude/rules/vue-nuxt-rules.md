# Vue 3 + Nuxt Development Standards

## Composition API and `<script setup>`

- Always use `<script setup lang="ts">` — it is the recommended SFC syntax for Vue 3 and produces smaller compiled output
- Define component props with TypeScript generics: `const props = defineProps<{ title: string; count?: number }>()`
- Define emits with TypeScript generics: `const emit = defineEmits<{ update: [value: string]; close: [] }>()`
- Use `withDefaults` to provide default prop values: `withDefaults(defineProps<Props>(), { count: 0 })`
- Expose only necessary internals with `defineExpose({ refresh })` — unexposed refs are private by default

## Reactivity Primitives

- Use `ref()` for primitive values and `reactive()` for plain objects; never mix patterns arbitrarily
- In Vue 3.5+, use reactive destructure with `const { count } = defineProps<...>()` — the compiler maintains reactivity
- Use `computed()` for derived state; never re-derive values inline in templates
- Use `readonly()` when passing reactive state down to child components that should not mutate it
- Prefer `shallowRef()` and `shallowReactive()` for large objects where deep reactivity is unnecessary

## Template Refs

- In Vue 3.5+, use `useTemplateRef('name')` instead of `const el = ref(null)` + `ref="name"` attribute
- Access template refs only after `onMounted` — refs are null during SSR and before mount
- Type template refs explicitly: `const input = useTemplateRef<HTMLInputElement>('input')`

## Watchers

- Use `watchEffect()` for effects that should re-run when any tracked dependency changes
- Use `watch(source, callback)` when you need the previous value or want explicit source control
- Always return a cleanup function from `watchEffect` for subscriptions and timers
- Use `{ immediate: true }` on `watch` only when you need the callback to fire on mount
- Avoid watching deeply nested objects without `{ deep: true }` — changes to nested properties are not tracked by default

## Component Patterns

- Co-locate component files in feature directories: `features/auth/LoginForm.vue`
- Name components in PascalCase; file names must match: `UserCard.vue` exports `UserCard`
- Extract reusable logic into composables under `composables/use*.ts` naming convention
- Composables must be called at the top level of `<script setup>` — not inside conditions or loops
- Use `provide`/`inject` for deeply nested shared state; avoid prop drilling beyond 2-3 levels

## Nuxt 3 Data Fetching

- Use `useFetch('/api/...')` for component-level data fetching with SSR hydration — never use `fetch()` directly in `<script setup>`
- Use `useAsyncData(key, () => $fetch('/api/...'))` when you need a custom key for deduplication or need to call non-`$fetch` async functions
- Always provide a unique, deterministic `key` to `useAsyncData` — duplicate keys cause data to be shared between unrelated calls
- Handle `{ data, pending, error, refresh }` destructured from both composables — always check `error.value` before rendering
- Use `lazy: true` option for non-critical data that does not block navigation

## Nuxt Server Routes

- Place server routes in `server/api/` and `server/routes/` — Nuxt auto-registers them
- Name files with HTTP method suffix for method-scoped handlers: `server/api/users.get.ts`, `server/api/users.post.ts`
- Use `defineEventHandler(async (event) => { ... })` — always return serializable data or use `sendStream`/`sendRedirect`
- Access request body with `await readBody(event)` and query params with `getQuery(event)` — never access `event.node.req` directly
- Validate inputs with Zod inside server handlers: `const body = z.object({...}).parse(await readBody(event))`

## Page and Layout Conventions

- Use `definePageMeta({ layout: 'admin', middleware: ['auth'] })` to configure pages declaratively
- Place shared layout in `layouts/default.vue`; use `<NuxtLayout name="admin">` for named layouts
- Use `<NuxtLink>` instead of `<a>` for internal navigation — it prefetches and handles client-side routing
- Use `navigateTo('/path')` for programmatic navigation in server-side middleware and composables
- Prefix route middleware with the page name when it is page-specific: `middleware/auth.ts` (global) vs inline `definePageMeta({ middleware: [() => {...}] })`

## Runtime Config and Environment Variables

- Access public config with `useRuntimeConfig().public.apiBase` — these are exposed to the client bundle
- Access private config with `useRuntimeConfig().secretKey` in server-only code — never read private keys in `<script setup>`
- Define all config in `nuxt.config.ts` under `runtimeConfig` — never access `process.env` directly in app code
- Use `.env` files for local development; never commit `.env` to version control

## Anti-Patterns

- Never use the Options API in new components — `<script setup>` is the standard for Vue 3
- Never mutate props directly — emit an event and let the parent update the value
- Never use `document` or `window` at the top level of `<script setup>` — wrap in `onMounted` or `if (import.meta.client)`
- Never use `v-html` with user-supplied content — always sanitize with DOMPurify first
- Never access private `runtimeConfig` keys in client-side code — they are stripped at build time but the pattern is dangerous
- Never use `$fetch` inside `useAsyncData` without a unique key — causes request deduplication failures on navigation

## When to invoke

`Skill({ skill: 'vue-expert' })` for Vue 3 Composition API, Pinia state management, and component architecture
