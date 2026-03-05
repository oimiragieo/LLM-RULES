## <!-- Agent: developer | Task: #5 | Session: 2026-03-05 -->

verified: true
lastVerifiedAt: 2026-03-05T00:00:00.000Z
name: web-artifacts-builder
description: Build elaborate, multi-component web artifacts using React 18 + TypeScript + Tailwind CSS + shadcn/ui. Produces a single self-contained HTML file with all assets inlined. Use for complex artifacts requiring state management, routing, or shadcn/ui components. NOT for simple single-file HTML/JSX.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
agents: [frontend-pro, developer, nextjs-pro]
category: frontend
tags: [react, typescript, tailwind, shadcn, artifacts, html, bundle, vite, parcel]
aliases: [artifact-builder, react-artifact, web-artifact]
best_practices:

- Initialize with init-artifact.sh before any code
- Use shadcn/ui components from the pre-installed catalog
- Bundle with bundle-artifact.sh to get single-file HTML output
- Avoid Inter font, purple gradients, centered layouts (AI slop)
- Present artifact first, test only if issues arise
- Keep all state in React — no external APIs unless explicitly requested
  error_handling: strict
  streaming: supported

---

# Web Artifacts Builder

> "Build powerful, multi-component web artifacts deployable directly in Claude conversations."

## Overview

This skill enables building elaborate React applications that bundle into a single self-contained HTML file. The output is deployable as a Claude artifact or shared as a standalone file with all JavaScript, CSS, and dependencies inlined.

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS 3.4.1 + shadcn/ui

## When to Invoke

Use this skill when:

- Building an interactive tool, calculator, dashboard, or form
- The artifact needs React state management (not a static page)
- The artifact uses shadcn/ui components (buttons, dialogs, tables, etc.)
- Multiple components with routing or complex interactions
- User says "build me an artifact" or "create a React app"

**Do NOT use** for simple single-file HTML artifacts — just write the HTML directly.

## Five-Step Workflow

### Step 1: Initialize Project

```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

The `scripts/init-artifact.sh` script creates a fully configured project:

- React 18 + TypeScript (via Vite)
- Tailwind CSS 3.4.1 with shadcn/ui theming
- Path aliases (`@/`) configured
- 40+ shadcn/ui components pre-installed
- All Radix UI dependencies included
- Parcel configured for bundling via `.parcelrc`
- Node 18+ compatibility (auto-pins Vite version)

**After init, project structure:**

```
<project-name>/
├── src/
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Entry point
│   └── components/      # Your components here
├── index.html           # Entry HTML (required for bundling)
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

### Step 2: Develop the Artifact

Edit the generated files. Key patterns:

#### Using shadcn/ui Components

All 40+ components are pre-installed. Import directly:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MyArtifact() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Tool</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter value..." />
        <Button className="mt-2">Submit</Button>
      </CardContent>
    </Card>
  );
}
```

#### State Management Pattern

```tsx
import { useState } from 'react';

interface AppState {
  items: string[];
  input: string;
  loading: boolean;
}

export function App() {
  const [state, setState] = useState<AppState>({
    items: [],
    input: '',
    loading: false,
  });

  const addItem = () => {
    if (!state.input.trim()) return;
    setState(prev => ({
      ...prev,
      items: [...prev.items, prev.input],
      input: '',
    }));
  };

  return <div className="min-h-screen bg-background p-8">{/* ... */}</div>;
}
```

#### Available shadcn/ui Components

```
accordion, alert, alert-dialog, aspect-ratio, avatar,
badge, breadcrumb, button, calendar, card, carousel,
chart, checkbox, collapsible, command, context-menu,
dialog, drawer, dropdown-menu, form, hover-card,
input, input-otp, label, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar,
skeleton, slider, sonner, switch, table, tabs,
textarea, toast, toggle, toggle-group, tooltip
```

#### Design Guidelines

Avoid AI slop patterns:

- No `font-family: Inter` or `font-sans` as primary (use a distinctive font)
- No purple gradient headers
- No centered-everything layout
- No uniform `rounded-lg` on every element

Use intentional design:

```tsx
// Good: distinctive typography + intentional colors
<h1 className="text-4xl font-black tracking-tight text-slate-900">
  Tool Title
</h1>

// Good: purposeful layout with breathing room
<div className="grid grid-cols-[300px_1fr] gap-8 min-h-screen">
  <aside className="border-r border-slate-200 p-6">...</aside>
  <main className="p-8">...</main>
</div>
```

### Step 3: Bundle to Single HTML File

```bash
bash scripts/bundle-artifact.sh
```

**Requirements**: `index.html` must exist in the project root.

**What the script does:**

1. Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
2. Creates `.parcelrc` config with path alias support
3. Builds with Parcel (no source maps, optimized)
4. Inlines all assets (JS, CSS, fonts, images) into `bundle.html`

**Output**: `bundle.html` — a single self-contained file, shareable as a Claude artifact.

### Step 4: Share Artifact

Display `bundle.html` in the Claude conversation. The artifact renders directly in the conversation interface.

For file system access, the artifact is at:

```
<project-name>/bundle.html
```

### Step 5: Test (Optional)

Testing is optional. Present the artifact first — test only if issues arise or if explicitly requested. Testing adds latency between request and delivery.

If testing is needed:

```bash
# Playwright/Puppeteer for visual verification
npx playwright screenshot bundle.html screenshot.png
```

## Common Development Tasks

### Adding a New Page/View

```tsx
// Simple tab-based navigation (no router needed for single-page artifacts)
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function App() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewPanel />
      </TabsContent>
      <TabsContent value="settings">
        <SettingsPanel />
      </TabsContent>
    </Tabs>
  );
}
```

### Adding Data Tables

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Item {
  id: string;
  name: string;
  value: number;
  status: 'active' | 'inactive';
}

function DataTable({ items }: { items: Item[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.value}</TableCell>
            <TableCell>
              <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                {item.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

### Adding Charts

```tsx
// Recharts is available via shadcn/ui chart component
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

const data = [
  { month: 'Jan', value: 400 },
  { month: 'Feb', value: 300 },
  { month: 'Mar', value: 600 },
];

function MyChart() {
  return (
    <ChartContainer config={{ value: { label: 'Value', color: '#2563eb' } }}>
      <BarChart data={data}>
        <XAxis dataKey="month" />
        <YAxis />
        <ChartTooltip />
        <Bar dataKey="value" fill="var(--color-value)" />
      </BarChart>
    </ChartContainer>
  );
}
```

## Troubleshooting

| Issue                              | Cause                         | Fix                                                        |
| ---------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Bundle fails with path alias error | `@/` not resolved             | Check `.parcelrc` has `parcel-resolver-tspaths`            |
| Styles not applying                | Tailwind not in content paths | Verify `tailwind.config.js` includes `./src/**/*.{ts,tsx}` |
| Components not found               | shadcn not installed          | Run `npx shadcn@latest add <component>`                    |
| Bundle too large                   | External dependencies inlined | Use CDN-linked deps or tree-shake imports                  |
| White screen in artifact           | Runtime error                 | Check browser console, add error boundary                  |

## Memory Protocol

Before starting artifact development:

```bash
cat .claude/context/memory/learnings.md | grep -i "artifact\|react\|shadcn\|tailwind"
```

Record patterns after completion:

- Effective component combinations → `.claude/context/memory/learnings.md`
- Bundling issues → `.claude/context/memory/issues.md`

## Related Skills

- `frontend-design` — Aesthetic principles, anti-AI-slop guidelines
- `react-expert` — React hooks, patterns, performance
- `shadcn-ui` — Deep shadcn/ui component customization
- `styling-expert` — Tailwind CSS advanced patterns
- `webapp-testing` — Testing web artifacts with Playwright
