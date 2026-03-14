---
name: design-systems
description: Design system lookup, CSS best practices, and AI-driven UI component generation via MCP tools
version: 1.0.0
category: frontend
agents: [frontend-pro, ui-components-expert, mobile-ux-reviewer]
---

# Design Systems

Access design token libraries, CSS documentation, and AI-driven component generation.

## Design Systems MCP (southleft/design-systems-mcp)

Semantic search across 188+ design systems (Material, Ant Design, Carbon, Chakra, etc.):

```bash
# Setup
npx @southleft/design-systems-mcp

# Example queries via MCP
mcp__design_systems__search_components({ query: "button with loading state" })
mcp__design_systems__get_tokens({ system: "material", category: "color" })
mcp__design_systems__get_patterns({ pattern: "form validation error" })
```

**Use cases**: Find existing component patterns before building custom, get design token values, compare component API across systems.

## CSS MCP (stolinski/css-mcp)

MDN CSS documentation + browser compatibility via MCP:

```bash
mcp__css__query_property({ property: "container-type" })  # Container queries
mcp__css__check_compat({ property: "has()", browsers: ["chrome", "firefox", "safari"] })
mcp__css__get_examples({ selector: ":is()" })
```

## Magic MCP — AI UI Component Generation (21st-dev)

Generate UI components from natural language:

```bash
# Configure Magic MCP with 21st-dev API key
mcp__magic__create_component({ description: "dark mode toggle with animation", framework: "react" })
mcp__magic__find_component({ query: "pricing table with feature comparison" })
```

## Design Token Standards

```css
/* CSS Custom Properties (recommended) */
--color-primary: #6366f1;
--spacing-md: 1rem;
--radius-lg: 0.5rem;
--font-sans: 'Inter', system-ui, sans-serif;

/* Token categories: color, spacing, typography, radius, shadow, z-index */
```

## Anti-Patterns

- Never hardcode hex colors in components — use design tokens
- Never reinvent components that exist in your design system
- Never use px for spacing in responsive layouts — use rem/em

## When to invoke

Skill({ skill: 'design-systems' }) for design token lookup, component pattern research, CSS best practices, AI component generation
