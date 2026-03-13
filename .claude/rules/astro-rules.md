# Astro Rules

## .astro File Structure

- Follow the three-section order: frontmatter fence (`---`), template markup, optional `<style>` and `<script>` tags
- All TypeScript/JavaScript logic goes in the frontmatter; never inline complex expressions in template attributes
- Import components, utilities, and content at the top of frontmatter; keep prop destructuring below imports
- Use `Astro.props` for typed props; define a `Props` interface in the frontmatter for every component that accepts props
- Mark server-only code with `export const prerender = false` when mixing SSG and SSR pages in the same project

## Islands Architecture

- Add client directives only when interactivity is required: `client:load` for above-the-fold, `client:idle` for below-the-fold, `client:visible` for lazy load on scroll
- Default to zero client JS; every `client:*` directive ships a JS bundle — audit with `astro build --verbose`
- Use `client:only="<framework>"` for components that use browser APIs unavailable at build time (e.g., `localStorage`)
- Keep Island components small and focused; large islands defeat the purpose of partial hydration
- Pass serializable props to Islands; functions, class instances, and circular references cannot cross the server/client boundary

## Content Collections

- Define all collections in `src/content/config.ts` with a Zod schema; untyped collections are a maintenance hazard
- Use `getCollection('<name>')` to retrieve entries; never read `src/content/` files with `fs` directly
- Filter draft posts with `getCollection('blog', ({ data }) => !data.draft)` — never rely on file naming conventions
- Use `entry.render()` to get the rendered `<Content />` component; do not parse MDX manually
- Organize content by collection folder (`src/content/blog/`, `src/content/docs/`) and keep filenames as slugs

## Image Optimization

- Always use the `<Image />` component from `astro:assets` for local images — never raw `<img>` with relative paths
- Provide explicit `width` and `height` props to prevent layout shift (CLS)
- Use `<Picture />` for art-directed responsive images requiring multiple sources
- Store images in `src/assets/` (processed by Astro) not `public/` (served as-is with no optimization)
- Set `quality` to 80 for JPEG/WebP; use `format="avif"` for modern browser targets

## SSR Patterns

- Set `output: 'server'` in `astro.config.mjs` for full SSR; use `output: 'hybrid'` to opt specific pages into SSR while defaulting to SSG
- Access request cookies via `Astro.cookies.get('<name>')` — never use `document.cookie` in server code
- Use `Astro.redirect('/login')` for server-side redirects; never use `window.location` in frontmatter
- Read environment variables from `import.meta.env` (build-time) or `process.env` (runtime SSR); never mix them
- Use middleware (`src/middleware.ts`) for auth checks; do not repeat auth logic in every page frontmatter

## Anti-Patterns

- Never import React/Vue/Svelte components in Astro files without the corresponding integration installed
- Never use `document` or `window` in Astro frontmatter — it runs on the server; use `client:only` for browser-only logic
- Never skip the `alt` attribute on `<Image />`; Astro enforces it at build time as an accessibility requirement
- Never put secrets in `import.meta.env.PUBLIC_*` variables — they are exposed to the browser bundle
- Never use `@astrojs/react` `client:load` on a static component with no event handlers — it ships React runtime for nothing

## When to invoke

`Skill({ skill: 'astro-expert' })` for Astro project setup, Islands architecture decisions, and Content Collections design
