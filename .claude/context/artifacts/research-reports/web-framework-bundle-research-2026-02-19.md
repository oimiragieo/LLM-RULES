<!-- Agent: researcher | Task: #17 | Session: 2026-02-19 -->

# Research Report: Web Framework Best Practices for Enterprise Bundle Generation

**Date**: 2026-02-19
**Researcher**: researcher agent
**Task**: #17 (Phase 1: Domain research for Tier B/C skills)
**Batch/Phase**: Phase 1 - Web Framework Domain Research
**Sources Consulted**: 15 web searches, 30+ authoritative sources

---

## Executive Summary

This report synthesizes current (2025-2026) best practices across seven web framework domains: Next.js 15, React 19, SvelteKit/Svelte 5, FastAPI, GraphQL, and cross-cutting concerns (build tools, accessibility, security). Key findings: React 19 compiler eliminates most manual memoization; Next.js 15 defaults to dynamic rendering with staleTime=0; Svelte 5 runes replace all legacy reactivity patterns; FastAPI + SQLAlchemy 2.0 async is the production-ready Python stack; GraphQL DataLoader 3.0 (breadth-first) resolves N+1 up to 5x faster; and CVE-2025-55182 is a critical RSC RCE requiring immediate patching to React 19.0.1+/19.1.2+/19.2.1+.
---

## Research Methodology

### Search Queries Executed

| # | Query | Results |
|---|-------|---------|
| 1 | Next.js 15 App Router Server Components best practices 2025 | 10 |
| 2 | Next.js Server Actions patterns production 2025 | 10 |
| 3 | React 19 new features hooks patterns best practices | 10 |
| 4 | React Server Components RSC patterns anti-patterns 2025 | 10 |
| 5 | SvelteKit 2.0 runes reactivity patterns best practices 2025 | 10 |
| 6 | Svelte 5 state derived effect runes patterns | 10 |
| 7 | FastAPI async SQLAlchemy 2.0 Pydantic v2 patterns 2025 | 10 |
| 8 | FastAPI dependency injection background tasks production patterns | 10 |
| 9 | GraphQL schema design DataLoader N+1 federation patterns 2025 | 10 |
| 10 | GraphQL subscriptions real-time patterns best practices 2025 | 10 |
| 11 | Web framework AI code assistant validation constraints hallucination prevention 2025 | 10 |
| 12 | React performance optimization React.memo useCallback useMemo patterns 2025 | 10 |
| 13 | API rate limiting authentication middleware patterns web frameworks 2025 | 10 |
| 14 | Frontend build tools Vite Turbopack RSC streaming 2025 2026 | 10 |
| 15 | Web accessibility WCAG 2.2 framework integration patterns React Svelte | 10 |

### Key Sources Consulted

| # | Title | URL |
|---|-------|-----|
| 1 | Next.js 15 Official Blog | https://nextjs.org/blog/next-15 |
| 2 | Next.js App Router Docs | https://nextjs.org/docs/app |
| 3 | React v19 Official Blog | https://react.dev/blog/2024/12/05/react-19 |
| 4 | React 19.2 Release Notes | https://react.dev/blog/2025/10/01/react-19-2 |
| 5 | Critical RSC Vulnerability CVE-2025-55182 | https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components |
| 6 | Svelte Runes Introduction | https://svelte.dev/blog/runes |
| 7 | Svelte state Docs | https://svelte.dev/docs/svelte/$state |
| 8 | Svelte derived Docs | https://svelte.dev/docs/svelte/$derived |
| 9 | Svelte effect Docs | https://svelte.dev/docs/svelte/$effect |
| 10 | FastAPI Background Tasks | https://fastapi.tiangolo.com/tutorial/background-tasks/ |
| 11 | Apollo GraphQL N+1 Guide | https://www.apollographql.com/docs/graphos/schema-design/guides/handling-n-plus-one |
| 12 | WunderGraph DataLoader 3.0 | https://wundergraph.com/blog/dataloader_3_0_breadth_first_data_loading |
| 13 | GraphQL Subscriptions Official | https://graphql.org/learn/subscriptions/ |
| 14 | WCAG 2 Overview W3C | https://www.w3.org/WAI/standards-guidelines/wcag/ |
| 15 | React Stack Patterns 2026 | https://www.patterns.dev/react/react-2026/ |
| 16 | Vercel: Whats New in React 19 | https://vercel.com/blog/whats-new-in-react-19 |
| 17 | React 19 Compiler useMemo obsolete | https://isitdev.com/react-19-compiler-usememo-usecallback-dead-2025/ |
| 18 | FSE 2025 API Hallucination in LLMs | https://arxiv.org/abs/2505.05057 |
| 19 | Zuplo Rate Limiting Best Practices 2025 | https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025 |
| 20 | FastAPI Production Patterns 2025 | https://orchestrator.dev/blog/2025-1-30-fastapi-production-patterns/ |
---

## Detailed Findings

### Framework 1: Next.js 15 (App Router + Server Actions)

**Current Stable Version**: Next.js 15.x (Turbopack now stable default dev bundler)

**Key Insights:**

- Server Components are the default; wrap only interactive islands in the use-client directive
- Next.js 15 changed default staleTime to 0 for Page segments - always reflects latest data (breaking change from 14.x)
- Turbopack is the stable default bundler in Next.js 15; cold start under 50ms vs Webpack
- Rendering: dynamic=auto (default static), force-dynamic (SSR), force-static (SSG), revalidate=60 (ISR)
- Server Actions: async functions with use-server directive; return errors as data not exceptions
- useActionState (from react) manages form action result + pending + error state in one hook
- useFormStatus (from react-dom) provides pending indicator; must be inside a form descendant
- serverActions.allowedOrigins config required for reverse proxy / multi-layer architectures
- use() hook enables streaming async data in Server Components (React 19 integration)
- File conventions: page.tsx (route UI), layout.tsx (persistent wrapper), loading.tsx (Suspense fallback)

**Critical Anti-Patterns:**

- Placing use-client on layout or root components (sends entire subtree to client)
- Using JSON.parse on unvalidated user input in Server Actions (injection risk)
- Throwing errors in Server Actions instead of returning structured error object to client
- Using dynamic=force-static on pages that need fresh data
- Importing Server Component into Client Component (invalid composition pattern)
- Using useEffect in Server Component (hooks are client-only)

**Validation Constraints for AI Assistants:**

- Validate: use-server and use-client directives are first line of file before any imports
- Validate: Server Actions are async functions
- Validate: revalidateTag() or revalidatePath() called after mutations
- Detect: useEffect inside a Server Component (invalid)
- Detect: missing error handling in Server Action response
- Detect: React version < 19.0.1 (CVE-2025-55182 vulnerable)

**Essential Output Fields:**

- rendering_strategy: static | ssr | isr | dynamic
- uses_server_actions: boolean
- turbopack_enabled: boolean
- caching_strategy: revalidate-interval | tag-based | none
- data_fetching_pattern: fetch-in-component | server-action | api-route

**Top 5 Tools/Libraries:**

1. next (15.x) - framework core
2. @vercel/analytics - performance analytics
3. next-auth / better-auth - authentication
4. nuqs - URL query string state management (RSC-compatible)
5. @tanstack/react-query - client-side cache for RSC hybrid apps
---

### Framework 2: React 19 (Server Components + New Hooks)

**Current Stable Version**: React 19.2.x (released Oct 2025)

**CRITICAL SECURITY**: CVE-2025-55182 - RCE via RSC Flight Payload Deserialization. Fixed in React 19.0.1, 19.1.2, 19.2.1+. Update immediately.

**Key Insights:**

- React Compiler (2025): automatically memoizes components and props; manual useMemo/useCallback now obsolete for React 19 new code
- useActionState(action, initialState) - manages form action state + pending + error in one hook
- useFormStatus() - must be inside a form descendant; exposes pending, data, method, action
- useOptimistic(state, reducer) - optimistic UI before server confirms; auto-reverts on failure
- use(promise | context) - callable in loops/conditionals; first-class promise support during render
- Server Components reduce bundle size by 20%+ (early production reports)
- Container/Presentational pattern maps cleanly: server container fetches, client component renders
- React Query remains relevant for client-side interaction caching alongside RSC
- Automatic form reset after successful Server Action for uncontrolled form components

**Critical Anti-Patterns:**

- N+1 data fetching: each list item triggers separate server fetch per RSC component
- Sending unnecessary fields across RSC wire (over-fetching increases response size)
- Using useEffect for data fetching (use RSC or use() hook instead)
- Adding manual useMemo/useCallback without profiler evidence when React Compiler is enabled
- Not upgrading to patched RSC version (CVE-2025-55182)
- Using useFormStatus outside of a form descendant (invalid hook context)

**Validation Constraints for AI Assistants:**

- Validate: useFormStatus called inside a form descendant component
- Validate: useActionState action parameter is an async function
- Detect: unnecessary useMemo/useCallback when React Compiler is enabled
- Detect: useEffect for data fetching (suggest RSC or use() instead)
- Detect: React version < 19.0.1 (CVE-2025-55182)
- Detect: hook used conditionally without use() API (violates React hooks rules)

**Essential Output Fields:**

- react_version: semver (must be >=19.2.1 for security)
- uses_compiler: boolean
- server_components_enabled: boolean
- hooks_used: array of hook names
- data_fetching_strategy: rsc | react-query | swr | fetch-in-effect

**Top 5 Tools/Libraries:**

1. react + react-dom (19.2.x) - core
2. @tanstack/react-query (v5) - client-side async state management
3. react-hook-form - form management with minimal re-renders
4. zod - runtime schema validation for form/action data
5. @react-aria (Adobe) - accessible UI primitives