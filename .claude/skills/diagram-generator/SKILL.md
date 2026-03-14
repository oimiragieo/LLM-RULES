---
name: diagram-generator
description: Generates architecture, database, and system diagrams using Mermaid syntax. Creates visual representations of system architecture, database schemas, component relationships, data flows, and standalone HTML exports.
version: 1.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Glob, Grep]
best_practices:
  - Use Mermaid syntax for all diagrams
  - Extract structure from code and documentation
  - Keep diagrams under 200 nodes
  - Generate both high-level and detailed views
error_handling: graceful
streaming: supported
templates: [architecture-diagram, database-diagram, component-diagram, sequence-diagram]
verified: true
lastVerifiedAt: 2026-03-13T00:00:00.000Z
---

<identity>
Diagram Generator — creates Mermaid diagrams and standalone HTML exports for architecture, schemas, flows, and all supported diagram types.
</identity>

## Diagram Types

| Type      | Keyword           | Best For                    |
| --------- | ----------------- | --------------------------- |
| Flowchart | `flowchart TB/LR` | Decision flows, processes   |
| Sequence  | `sequenceDiagram` | API interactions, protocols |
| Class     | `classDiagram`    | OOP structure, interfaces   |
| State     | `stateDiagram-v2` | Lifecycle, state machines   |
| ER        | `erDiagram`       | Database schemas            |
| Gantt     | `gantt`           | Project timelines           |
| Pie       | `pie`             | Distribution, composition   |
| Mindmap   | `mindmap`         | Hierarchical mind maps      |
| Timeline  | `timeline`        | Chronological events        |
| Git Graph | `gitGraph`        | Branch visualization        |
| Kanban    | `kanban`          | Task boards                 |
| Quadrant  | `quadrantChart`   | 2x2 matrix                  |

## Processing Limits

- **File chunk limit: 1000 files per diagram (HARD LIMIT)**
- Visual limit: ~200 nodes max per diagram
- Large codebases: split by subsystem/layer; generate overview first then details

## Standalone HTML Output Mode

**Trigger phrases:** "export as HTML", "standalone diagram", "interactive diagram"

Generate a self-contained HTML file with embedded Mermaid.js CDN, dark/light toggle button, and responsive CSS (max-width: 1200px):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>TITLE</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
      mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
    <style>
      body {
        font-family: system-ui;
        max-width: 1200px;
        margin: 2rem auto;
        background: #1e1e2e;
        color: #cdd6f4;
      }
    </style>
  </head>
  <body>
    <h1>TITLE</h1>
    <button
      onclick="let d=!d;mermaid.initialize({startOnLoad:false,theme:d?'dark':'default'});document.querySelector('.mermaid').removeAttribute('data-processed');mermaid.run()"
    >
      Toggle Theme
    </button>
    <div class="mermaid">MERMAID_CONTENT</div>
  </body>
</html>
```

**Default:** dark mode (`background: #1e1e2e`, `color: #cdd6f4`)
**Output:** `.claude/context/artifacts/diagrams/{subject}-{YYYY-MM-DD}.html`

## Output Location

- Mermaid files: `.claude/context/artifacts/diagrams/{subject}-{type}-{YYYY-MM-DD}.mmd`
- HTML files: `.claude/context/artifacts/diagrams/{subject}-{YYYY-MM-DD}.html`

## Iron Laws

1. Mermaid syntax only — no ASCII art or PlantUML.
2. Never exceed 200 nodes per diagram.
3. Never write diagrams outside `.claude/context/artifacts/diagrams/`.
4. Label all non-obvious connections.
5. Enforce 1000-file hard limit — chunk large codebases.

## When to invoke

`Skill({ skill: 'diagram-generator' })` for architecture diagrams, HTML exports, mindmaps, timelines, git visualizations, kanban boards, and quadrant charts.
