# Next.js Expert Rules

## Core Principles

- Use the App Router (all components in `app` directory)
- Implement Server Components by default (Client Components only when necessary)
- Use modern TypeScript syntax with proper typing
- Follow responsive design principles with Tailwind CSS
- Adhere to component-based architecture (modular, reusable components)

## Next.js 14/15 Standards

- Use Next.js Image component for optimized image loading
- Employ metadata API for SEO optimization
- Implement error handling using error boundaries and error.tsx files
- Use loading.tsx files for managing loading states
- Utilize route handlers (route.ts) for API routes in App Router
- Implement SSG and SSR using App Router conventions when appropriate

## Async Request API (Next.js 15)

- Always use async versions of runtime APIs:
  - `const cookieStore = await cookies()`
  - `const headersList = await headers()`
  - `const { isEnabled } = await draftMode()`
- Handle async params in layouts/pages:
  - `const params = await props.params`
  - `const searchParams = await props.searchParams`

## Data Fetching

- Implement efficient data fetching using server components
- Use `fetch` API with appropriate caching and revalidation strategies
- Implement Static Site Generation (SSG) for static pages
- Use Server-Side Rendering (SSR) for dynamic content

## Performance

- Optimize bundle size with dynamic imports
- Implement proper image optimization
- Use streaming and suspense for better UX
- Minimize client-side JavaScript

## Integration Points

- Used by: `frontend-pro`, `fullstack-architect`, `developer` (Next.js projects)
- Related skills: `react-expert`, `typescript-expert`, `api-designer`
- Works with: `performance-engineer`, `seo-expert`, `devops`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
