# shadcn/ui Rules

## Installation and Setup

- Install components individually via CLI: `npx shadcn@latest add button` — never install as a package dependency
- Never import from `@shadcn/ui` — shadcn/ui copies source into your project; import from `@/components/ui/button`
- Run `npx shadcn@latest init` once per project to scaffold `components.json`, Tailwind config, and `cn()` utility
- `components.json` controls the install target (`components/ui/`), import aliases, and CSS variable strategy — commit this file
- After adding a component, review the generated file — it is yours to own and modify, not a black-box dependency

## Component Usage

- Always use the `cn()` utility from `@/lib/utils` to merge class names: `cn('base-classes', conditionalClass && 'extra', className)`
- Pass `className` through to the root element to allow consumers to extend styles without forking the component
- Use the `asChild` prop (Radix `Slot`) to compose behavior onto a custom element: `<Button asChild><Link href="/">Home</Link></Button>`
- Never override styles with `!important` — use `cn()` ordering and Tailwind's variant system instead
- Prefer composing primitives (e.g., `<Card><CardHeader><CardTitle>`) over wrapping the whole component in a custom div

## Form Integration

- Use `<Form>` components with `react-hook-form` + Zod — shadcn ships `FormField`, `FormItem`, `FormLabel`, `FormMessage`
- Always wrap inputs in `<FormField control={form.control} name="field" render={...} />` to connect RHF state
- Use `<FormMessage />` for validation error display — never render errors manually next to inputs
- `<FormDescription>` provides accessible help text linked to the input via `aria-describedby` — use it for hints
- Call `form.handleSubmit(onValid, onInvalid)` in the `<form onSubmit>` handler — never call submit logic directly

## Theming

- All colors use CSS custom properties (e.g., `--background`, `--foreground`, `--primary`) — never hardcode hex values in components
- Override theme tokens in `globals.css` inside `:root` (light) and `.dark` (dark mode) selectors
- Use semantic token names (`bg-background`, `text-foreground`, `border-border`) in `className` — not raw Tailwind color utilities
- Set `darkMode: ['class']` in Tailwind config — shadcn toggles dark mode via `class` on `<html>`, not `prefers-color-scheme`
- Add new semantic tokens to `tailwind.config.ts` `extend.colors` referencing the CSS variable: `primary: 'hsl(var(--primary))'`

## Anti-Patterns

- Never eject all components at once (`shadcn add --all`) in a new project — adds unused code and inflates bundle
- Never modify files in `node_modules` to fix shadcn behavior — run `npx shadcn@latest add <component>` to get the source, then edit it
- Never use inline `style={{ color: 'red' }}` on shadcn components — use `cn()` with Tailwind utilities
- Never skip the `cn()` merge when composing class names — string concatenation breaks Tailwind's conflict resolution
- Never use shadcn components without the required peer dependencies (`radix-ui/*`, `tailwind-merge`, `class-variance-authority`)

## When to invoke

`Skill({ skill: 'shadcn-ui' })` for shadcn/ui component selection, theming, and form integration
