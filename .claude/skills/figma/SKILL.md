---
name: figma
description: Figma design-to-code workflow. Read Figma files, inspect components, extract design tokens, and translate designs to implementation. Use when working with Figma designs, extracting styles, or building design systems.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebFetch]
agents: [frontend-expert, styling-expert, ui-components-expert]
category: design
tags: [figma, design, ui, design-tokens, design-system, components]
best_practices:
  - Extract design tokens before building components
  - Use Figma REST API for programmatic access
  - Map Figma auto-layout to CSS flexbox/grid
  - Preserve design intent over pixel-perfect matching
error_handling: graceful
streaming: supported
verified: false
---

# Figma

Extract design information from Figma files for implementation. Covers design token extraction, component inspection, and design-to-code translation.

## When to Use

- Translating Figma designs into frontend code
- Extracting design tokens (colors, typography, spacing) from Figma
- Inspecting Figma component structure for implementation planning
- Building or updating a design system from Figma sources
- Mapping Figma auto-layout properties to CSS

## Prerequisites

- Figma Personal Access Token (set as `FIGMA_ACCESS_TOKEN` env var)
- Figma file URL or file key

## Core API Endpoints

### Get File

```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY"
```

### Get File Nodes (specific components)

```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/nodes?ids=NODE_ID1,NODE_ID2"
```

### Get Image Exports

```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/images/FILE_KEY?ids=NODE_ID&format=svg"
```

### Get File Styles

```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/styles"
```

### Get File Components

```bash
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/components"
```

## Design Token Extraction Workflow

### Step 1: Fetch File Styles

```bash
# Get all published styles
curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/styles" | jq '.meta.styles'
```

### Step 2: Map to CSS Variables

```css
/* Colors */
:root {
  --color-primary: #2563eb; /* From Figma: Primary/500 */
  --color-secondary: #7c3aed; /* From Figma: Secondary/500 */
  --color-surface: #ffffff; /* From Figma: Surface/Default */
}

/* Typography */
:root {
  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;
  --text-xl: 1.25rem; /* From Figma: Heading/XL */
  --text-base: 1rem; /* From Figma: Body/Base */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
}

/* Spacing */
:root {
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-4: 1rem; /* 16px */
  --space-8: 2rem; /* 32px */
}
```

### Step 3: Auto-Layout to CSS Mapping

| Figma Auto-Layout | CSS Equivalent                           |
| ----------------- | ---------------------------------------- |
| Horizontal        | `display: flex; flex-direction: row;`    |
| Vertical          | `display: flex; flex-direction: column;` |
| Space between     | `justify-content: space-between;`        |
| Packed (start)    | `justify-content: flex-start;`           |
| Gap: 16           | `gap: 1rem;`                             |
| Padding: 16,24    | `padding: 1rem 1.5rem;`                  |
| Fill container    | `flex: 1;` or `width: 100%;`             |
| Hug contents      | `width: fit-content;`                    |

### Step 4: Component Inspection

For each Figma component, extract:

1. **Name** - Component name and variant properties
2. **Structure** - Child node tree (frames, text, images)
3. **Styles** - Applied color, text, and effect styles
4. **Constraints** - Responsive behavior rules
5. **Variants** - All component variants and their properties

## Iron Laws

1. **ALWAYS extract design tokens before building components** — building without tokens leads to hardcoded values that break when the design system updates.
2. **NEVER hardcode Figma colors/spacing** — always map to CSS variables or design token constants that reference the Figma source.
3. **ALWAYS map Figma auto-layout to CSS flexbox** — auto-layout is a direct 1:1 mapping to flexbox; using other layout methods loses design intent.
4. **NEVER export raster images when SVG is available** — SVGs scale cleanly and reduce bundle size; only use PNG/JPEG for photographs.
5. **ALWAYS preserve Figma component naming** in code component names — divergent naming breaks the design-development feedback loop.

## Anti-Patterns

| Anti-Pattern                | Why It Fails                     | Correct Approach                               |
| --------------------------- | -------------------------------- | ---------------------------------------------- |
| Hardcoded hex colors        | Breaks on design system update   | Use CSS variables mapped from Figma tokens     |
| Ignoring auto-layout        | Layout doesn't match design      | Map auto-layout 1:1 to flexbox/grid            |
| Pixel-perfect obsession     | Wastes time, ignores responsive  | Match design intent, not exact pixels          |
| Skipping component variants | Missing states (hover, disabled) | Extract ALL Figma variants                     |
| Manual token extraction     | Error-prone, doesn't scale       | Use Figma REST API for programmatic extraction |

## Figma MCP Server Tools (figma/mcp-server-guide)

When the official Figma MCP server is running, these 12 tools are available:

| Tool                         | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `get_design_context`         | Get full design context for a file/node (components, styles, layout) |
| `generate_figma_design`      | Generate new designs from natural language description               |
| `get_variable_defs`          | Extract all design tokens (colors, spacing, typography variables)    |
| `get_screenshot`             | Capture rendered screenshot of a frame/component                     |
| `code_connect_map`           | Map Figma components to their code counterparts                      |
| `create_design_system_rules` | Auto-generate design system documentation                            |
| `get_figjam`                 | Access FigJam board content and sticky notes                         |
| `generate_diagram`           | Generate Figma diagram from Mermaid input                            |
| `get_components`             | List all published components in a file                              |
| `get_styles`                 | Extract all defined styles (color, text, effect)                     |
| `export_assets`              | Export assets as PNG/SVG/PDF with scale options                      |
| `get_annotations`            | Retrieve design annotations and spec notes                           |
| `get_metadata`               | Get XML layer representation of a file/node for programmatic parsing |
| `whoami`                     | Get current user identity, plan tier, and available seat count       |

**MCP Setup**: Install Figma Desktop app -> Settings -> Enable MCP server
**Auth**: Uses active Figma session (no API key needed for local MCP)
**Key workflow**: get_design_context -> code_connect_map -> export_assets for design-to-code
**Identity check**: Use `whoami` to verify plan tier before calling enterprise-only tools

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
