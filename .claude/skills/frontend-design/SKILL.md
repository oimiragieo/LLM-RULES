---
# Agent: developer | Task: #5 | Session: 2026-03-05
verified: true
lastVerifiedAt: 2026-03-05T00:00:00.000Z
name: frontend-design
description: Create distinctive, production-grade web interfaces with intentional aesthetic direction. Avoids generic AI aesthetics (centered layouts, Inter/Arial, purple gradients, uniform corners). Use for UI components, dashboards, landing pages, React/HTML/CSS layouts where design quality matters.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
agents: [frontend-pro, developer, nextjs-pro]
category: frontend
tags: [ui, design, css, react, typography, animation, components, aesthetics]
aliases: [ui-design, design-system, frontend-aesthetics]
best_practices:
  - Choose a bold aesthetic direction and execute it with precision
  - Avoid generic AI slop — centered layouts, Inter/Arial/Roboto, purple gradients, uniform rounded corners
  - Select fonts that are characterful and context-appropriate, not default safe choices
  - Commit to a cohesive color palette with dominant and sharp accent colors
  - Prioritize high-impact motion (page load, key transitions) over scattered micro-interactions
  - Match code complexity to vision — elaborate for maximalist, restrained for minimalist
error_handling: strict
streaming: supported
---

# Frontend Design

> "Every design should feel specifically crafted for its context, never cookie-cutter."

## Overview

This skill enables creation of distinctive, production-grade frontend interfaces that avoid the generic AI-generated aesthetic that has become ubiquitous. The goal is intentional design that reflects the specific context, brand, and purpose of the interface.

## When to Invoke

- Building UI components, dashboards, or page layouts
- User requests "make this look good" or "design a UI"
- React, HTML, CSS, or Tailwind styling work
- Any request where visual quality and distinctiveness matter

## The Anti-AI-Slop Principle

Generic AI-generated interfaces share predictable patterns that signal laziness:

**Overused patterns to AVOID:**

- Centered hero layout with heading + subtext + CTA button
- Inter, Arial, Roboto, or system-ui as primary font
- Purple-to-blue gradient as accent color
- Uniform 8px or 12px border-radius everywhere
- Card grids with identical padding and shadow
- Soft pastel color palette with low contrast
- Animated gradient text as a "premium" signal
- Generic icons (plus, arrow, chevron) for decorative purposes

**What to do instead:**

- Choose an aesthetic direction and commit to it fully
- Make typography do real work — size contrast, weight variation, spacing rhythm
- Use color that creates tension or warmth, not just fills space
- Let layout breathe asymmetrically — not everything needs to be centered

## Aesthetic Directions

### Brutalist Minimal

```css
/* High contrast, raw, confident */
:root {
  --bg: #ffffff;
  --text: #000000;
  --accent: #ff0000;
  --border: 2px solid #000000;
  --radius: 0px;
}

.card {
  border: var(--border);
  padding: 2rem;
  background: var(--bg);
}
```

**Typography**: Bold grotesques (Neue Haas Grotesk, Aktiv Grotesk, GT America)
**Motion**: Sharp, instant transitions — no easing
**Layout**: Rigid grid, full bleed, stark whitespace

### Maximalist Editorial

```css
/* Rich, layered, expressive */
:root {
  --bg: #0a0a0f;
  --text: #e8e3d9;
  --accent: #c9a84c;
  --accent-2: #7b5ea7;
}

.hero {
  position: relative;
  overflow: hidden;
  background: radial-gradient(ellipse at 30% 50%, #1a0a2e, transparent);
}
```

**Typography**: Serif headlines (Playfair Display, Canela, GT Sectra) + tight monospace for data
**Motion**: Cinematic reveals, staggered content entry, parallax depth
**Layout**: Overlapping elements, diagonal breaks, generous negative space

### Warm Artisan

```css
/* Organic, crafted, human */
:root {
  --bg: #faf8f4;
  --text: #2c2416;
  --accent: #c17b4a;
  --accent-muted: #e8d5c0;
}

.surface {
  background: var(--bg);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.06),
    0 4px 16px rgba(0, 0, 0, 0.04);
}
```

**Typography**: Humanist serifs (Lora, Freight Text) + friendly sans (Sora, Plus Jakarta Sans)
**Motion**: Gentle, spring-based animations
**Layout**: Asymmetric columns, hand-crafted feel

### High-Tech Data

```css
/* Dense, precise, functional */
:root {
  --bg: #0d1117;
  --text: #c9d1d9;
  --accent: #58a6ff;
  --grid: rgba(255, 255, 255, 0.04);
  --mono: 'JetBrains Mono', 'Fira Code', monospace;
}

.data-panel {
  background: rgba(13, 17, 23, 0.95);
  border: 1px solid rgba(48, 54, 61, 0.8);
  font-family: var(--mono);
}
```

**Typography**: Monospace throughout, tight line height, numerical data in tabular figures
**Motion**: Real-time updates, pulsing activity indicators
**Layout**: Dense grids, information hierarchy via size/weight/color

## Typography System

### Font Selection Principles

Don't reach for Inter, Arial, or system-ui. Choose fonts that carry meaning:

| Intention             | Good Choices                    | Avoid             |
| --------------------- | ------------------------------- | ----------------- |
| Premium / Editorial   | Canela, GT Sectra, Freight Text | Georgia           |
| Technical / Precise   | JetBrains Mono, IBM Plex Mono   | Courier           |
| Modern / Professional | GT America, Neue Haas Grotesk   | Inter, Helvetica  |
| Warm / Approachable   | Sora, Plus Jakarta Sans, Nunito | Roboto, Open Sans |
| Bold / Display        | Clash Display, Cabinet Grotesk  | Futura            |

### Type Scale

Use a clear hierarchy:

```css
/* Display: hero headlines */
.text-display {
  font-size: clamp(3rem, 8vw, 7rem);
  font-weight: 900;
  line-height: 0.95;
}

/* Heading: section titles */
.text-h1 {
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 700;
  line-height: 1.1;
}

/* Body: readable text */
.text-body {
  font-size: 1rem;
  line-height: 1.65;
  letter-spacing: 0.01em;
}

/* Caption: secondary info */
.text-caption {
  font-size: 0.8125rem;
  line-height: 1.4;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

## Color System

### Commit to a palette

```css
:root {
  /* Dominant: 60% of UI */
  --color-base: #f7f4ef;
  --color-surface: #ffffff;

  /* Secondary: 30% of UI */
  --color-text: #1a1510;
  --color-text-muted: #6b5e4e;

  /* Accent: 10% of UI */
  --color-accent: #c17b4a; /* primary actions */
  --color-accent-sharp: #e05a2b; /* hover/active states */
}
```

The 60/30/10 rule prevents overwhelming accent usage.

## Motion Design

### Page Load Sequence

High-impact reveals on page load (not scattered micro-interactions):

```css
/* Staggered content entry */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-heading {
  animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.hero-sub {
  animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
}
.hero-cta {
  animation: slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
}
```

### Purposeful Transitions

```css
/* State transitions: fast and responsive */
.button {
  transition:
    background-color 150ms ease,
    transform 100ms ease;
}
.button:hover {
  transform: translateY(-1px);
}
.button:active {
  transform: translateY(0);
}

/* Panel reveals: deliberate */
.modal {
  transition:
    opacity 250ms ease,
    transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Using Animation Libraries

For complex sequences:

- **Framer Motion** (React) — spring physics, layout animations, shared element transitions
- **GSAP** — timeline-based, scroll-triggered, high-performance
- **CSS @starting-style** — native enter/exit animations (modern browsers)

## Layout Principles

### Break the Grid

Don't constrain everything to a uniform container:

```css
/* Full-bleed accent with contained content */
.section-dark {
  background: #0d1117;
  /* No max-width here */
}

.section-dark .content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}
```

### Generous Negative Space

```css
/* Let elements breathe */
.hero {
  padding: 12rem 0 8rem;
}
.section {
  padding: 8rem 0;
}
.card {
  padding: 2.5rem;
}
```

### Intentional Asymmetry

```css
/* 60/40 split instead of 50/50 */
.two-column {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 4rem;
}
```

## Component Quality Checklist

Before declaring a component done:

- [ ] Typography uses system-distinct font (not Inter/Arial/system-ui)
- [ ] Colors are intentional, not default Tailwind palette
- [ ] Hover/focus states are designed (not just opacity change)
- [ ] Motion exists and is purposeful (not zero or scattered everywhere)
- [ ] Spacing creates visual rhythm (not uniform padding everywhere)
- [ ] The design would look at home in a portfolio, not a boilerplate

## Memory Protocol

Before designing interfaces:

```bash
cat .claude/context/memory/learnings.md | grep -i "design\|ui\|frontend\|css"
```

After completing design work, record patterns:

- Effective typography combinations → `.claude/context/memory/learnings.md`
- Color system decisions → `.claude/context/memory/decisions.md`

## Related Skills

- `web-artifacts-builder` — Build React + Tailwind + shadcn/ui artifacts
- `react-expert` — React component patterns
- `styling-expert` — Tailwind CSS, CSS-in-JS patterns
- `shadcn-ui` — shadcn/ui component customization
- `enhance-prompt` — Transform vague UI requests into design specs
