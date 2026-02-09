# React Expert Rules

## Core Principles

- Use functional components with hooks (prefer over class components)
- Follow the Rules of Hooks (always call at top level, never conditionally)
- Implement proper memoization (useMemo, useCallback, React.memo)
- Use TypeScript for type safety
- Keep components small and focused (single responsibility)

## Component Standards

- Use composition over inheritance
- Extract reusable logic into custom hooks
- Keep hooks focused and simple
- Split large components into smaller, focused ones
- Implement proper prop types with TypeScript

## State Management

- Use useState for local component state
- Implement useReducer for complex state logic
- Use Context API for shared state (avoid prop drilling)
- Keep state as close to where it's used as possible
- Use state management libraries only when necessary

## Performance

- Use appropriate dependency arrays in useEffect
- Implement cleanup in useEffect when needed
- Avoid unnecessary re-renders (React DevTools profiling)
- Implement proper lazy loading
- Use proper key props in lists

## React 19 Features

- Use `use` hook for consuming Promises and Context directly
- Leverage `useFormStatus` hook for form state management
- Use `useActionState` for form actions and state management
- Implement Document Metadata API for better SEO
- Use `ref` as a prop directly without needing `forwardRef`
- Use `useOptimistic` hook for optimistic UI updates

## Integration Points

- Used by: `frontend-pro`, `react-pro`, `developer` (React projects)
- Related skills: `nextjs-expert`, `typescript-expert`, `accessibility-tester`
- Works with: `code-quality-expert`, `tdd`, `performance-engineer`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
