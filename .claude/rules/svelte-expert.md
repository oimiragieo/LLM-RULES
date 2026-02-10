# Svelte Expert Rules

## Core Principles

- Use Svelte 5 with runes for reactivity (prefer over Svelte 4)
- Write concise TypeScript code with accurate examples
- Use functional and declarative programming patterns
- Structure files: component logic, markup, styles, helpers, types
- Embrace Svelte's simplicity (avoid over-engineering)

## Svelte 5 Standards

### Reactivity

- Use runes for controlling reactivity (replaces `$:` reactive declarations)
- Runes provide explicit control over state and effects
- Use `bind:value` for two-way data binding
- Treat event handlers as properties for simpler integration

### Component Structure

- Use snippets and render tags for reusable markup chunks
- Reduce duplication with snippets
- Keep components small and focused

## Naming Conventions

- Component files: lowercase-with-hyphens (auth-form.svelte)
- Component names in imports: PascalCase (AuthForm)
- Variables, functions, props: camelCase (userName, handleClick)

## SvelteKit Standards

- Follow SvelteKit's file-based routing
- Use load functions for data fetching
- Implement proper error handling (error.svelte)
- Use actions for form handling
- Implement proper SEO with metadata

## Component Patterns

- Implement proper component composition and reusability
- Use Svelte's props for data passing
- Leverage reactive declarations for local state management
- Use stores for global state management
- Implement proper lifecycle management

## Accessibility

- Ensure proper semantic HTML structure
- Implement ARIA attributes where necessary
- Ensure keyboard navigation support
- Use `bind:this` for managing focus programmatically

## Performance

- Optimize component rendering
- Use lazy loading for routes and components
- Implement proper caching strategies
- Minimize bundle size with code splitting

## Integration Points

- Used by: `frontend-pro`, `svelte-pro`, `developer` (Svelte projects)
- Related skills: `typescript-expert`, `accessibility-tester`, `performance-engineer`
- Works with: `code-quality-expert`, `tdd`, `seo-expert`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
