---
name: pptx
description: PowerPoint presentation generation using python-pptx. Create slides from Claude output, data analysis, or structured content. Covers slide templates, shapes, charts, tables, and themed presentations. Use for generating .pptx files programmatically.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit]
best_practices:
  - Use slide layouts from presentation template for consistent styling
  - Store all text in placeholder shapes, never in raw textboxes
  - Use Pt() and Emu() for all measurements — never raw integers
  - Set slide dimensions before adding content
  - Use master slides for branding consistency
error_handling: graceful
streaming: not_applicable
verified: true
lastVerifiedAt: 2026-03-15T00:00:00.000Z
---

# PowerPoint Generation (pptx)

## Overview

Generate `.pptx` files programmatically using `python-pptx`. Convert Claude output, data analysis results, research reports, and structured data into polished PowerPoint presentations.

## When to Invoke

`Skill({ skill: 'pptx' })` when:

- User asks to "create a presentation", "generate slides", or "make a PowerPoint"
- Converting a report, analysis, or structured document into slide format
- Generating recurring report slides from data
- Creating template-based presentations programmatically

## Installation

```bash
pip install python-pptx
# or
uv add python-pptx
```

## Quick Start

```python
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

# Create presentation
prs = Presentation()

# Set slide dimensions (widescreen 16:9)
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)

# Add title slide using layout 0
title_layout = prs.slide_layouts[0]
slide = prs.slides.add_slide(title_layout)
title = slide.shapes.title
subtitle = slide.placeholders[1]

title.text = "Q1 2026 Business Review"
subtitle.text = "Prepared by Claude Agent"

# Add content slide using layout 1 (title + content)
content_layout = prs.slide_layouts[1]
slide = prs.slides.add_slide(content_layout)
slide.shapes.title.text = "Key Findings"

tf = slide.placeholders[1].text_frame
tf.text = "Revenue grew 23% YoY"
p = tf.add_paragraph()
p.text = "Customer retention at 94%"
p.level = 1  # Indent level

prs.save("presentation.pptx")
```

## Slide Layouts Reference

Standard layouts available in default template:

| Index | Name                  | Use For                     |
| ----- | --------------------- | --------------------------- |
| 0     | Title Slide           | Opening slide               |
| 1     | Title and Content     | Main content slides         |
| 2     | Title and Two Content | Side-by-side comparison     |
| 5     | Title Only            | Charts or images with title |
| 6     | Blank                 | Custom layouts              |

```python
# List all layouts in a template
for i, layout in enumerate(prs.slide_layouts):
    print(f"{i}: {layout.name}")
```

## Text Formatting

```python
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

def format_paragraph(paragraph, text, size=18, bold=False, color=None, align=PP_ALIGN.LEFT):
    run = paragraph.add_run()
    run.text = text
    font = run.font
    font.size = Pt(size)
    font.bold = bold
    if color:
        font.color.rgb = RGBColor(*color)  # e.g., (0x1F, 0x49, 0x7D) for dark blue
    paragraph.alignment = align
    return run

# Usage
tf = slide.placeholders[1].text_frame
tf.clear()  # Clear existing content
p = tf.paragraphs[0]
format_paragraph(p, "Important Metric: 94%", size=24, bold=True, color=(0x1F, 0x49, 0x7D))
```

## Tables

```python
from pptx.util import Inches

def add_table_slide(prs, title, headers, rows):
    """Add a slide with a formatted table."""
    slide = prs.slides.add_slide(prs.slide_layouts[5])  # Title Only
    slide.shapes.title.text = title

    # Position: left, top, width, height
    left = Inches(0.5)
    top = Inches(1.5)
    width = Inches(12.3)
    height = Inches(0.8 * (len(rows) + 1))

    table = slide.shapes.add_table(
        len(rows) + 1, len(headers), left, top, width, height
    ).table

    # Header row
    for col_idx, header in enumerate(headers):
        cell = table.cell(0, col_idx)
        cell.text = header
        cell.text_frame.paragraphs[0].runs[0].font.bold = True

    # Data rows
    for row_idx, row in enumerate(rows):
        for col_idx, value in enumerate(row):
            table.cell(row_idx + 1, col_idx).text = str(value)

    return slide

# Usage
headers = ["Product", "Revenue", "Growth"]
rows = [
    ("Widget A", "$1.2M", "+23%"),
    ("Widget B", "$890K", "+15%"),
    ("Widget C", "$450K", "-5%"),
]
add_table_slide(prs, "Revenue by Product", headers, rows)
```

## Charts

```python
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

def add_bar_chart(slide, title, categories, series_name, values):
    """Add a bar chart to a slide."""
    chart_data = ChartData()
    chart_data.categories = categories
    chart_data.add_series(series_name, values)

    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Inches(1), Inches(1.5),   # left, top
        Inches(11), Inches(5.5),  # width, height
        chart_data
    ).chart

    chart.has_title = True
    chart.chart_title.text_frame.text = title
    chart.has_legend = False

    return chart

# Usage
slide = prs.slides.add_slide(prs.slide_layouts[5])
slide.shapes.title.text = "Monthly Revenue"
add_bar_chart(
    slide,
    "Revenue by Month (2026)",
    ["Jan", "Feb", "Mar"],
    "Revenue ($K)",
    (450, 520, 610)
)
```

## Images

```python
from pptx.util import Inches

def add_image_slide(prs, title, image_path, caption=None):
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = title

    # Center image on slide
    pic = slide.shapes.add_picture(
        image_path,
        left=Inches(1.5),
        top=Inches(1.5),
        width=Inches(10),
    )

    if caption:
        txBox = slide.shapes.add_textbox(
            Inches(1.5), Inches(6.8), Inches(10), Inches(0.5)
        )
        tf = txBox.text_frame
        tf.text = caption
        tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    return slide
```

## Agent Workflow: Claude Output → Slides

```python
import json
from pptx import Presentation
from pptx.util import Inches, Pt

def claude_output_to_slides(slide_data: list[dict], output_path: str):
    """
    Convert Claude structured output to a PowerPoint file.

    Expected slide_data format:
    [
      {"type": "title", "title": "...", "subtitle": "..."},
      {"type": "content", "title": "...", "bullets": ["...", "..."]},
      {"type": "table", "title": "...", "headers": [...], "rows": [[...], ...]},
    ]
    """
    prs = Presentation()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)

    for slide_spec in slide_data:
        if slide_spec["type"] == "title":
            slide = prs.slides.add_slide(prs.slide_layouts[0])
            slide.shapes.title.text = slide_spec["title"]
            if "subtitle" in slide_spec:
                slide.placeholders[1].text = slide_spec["subtitle"]

        elif slide_spec["type"] == "content":
            slide = prs.slides.add_slide(prs.slide_layouts[1])
            slide.shapes.title.text = slide_spec["title"]
            tf = slide.placeholders[1].text_frame
            tf.text = slide_spec["bullets"][0]
            for bullet in slide_spec["bullets"][1:]:
                p = tf.add_paragraph()
                p.text = bullet
                p.level = 1

        elif slide_spec["type"] == "table":
            add_table_slide(
                prs,
                slide_spec["title"],
                slide_spec["headers"],
                slide_spec["rows"]
            )

    prs.save(output_path)
    return output_path

# Example: Generate from Claude JSON output
slide_data = [
    {"type": "title", "title": "Q1 2026 Report", "subtitle": "Generated by Claude"},
    {"type": "content", "title": "Key Highlights", "bullets": [
        "Revenue up 23% YoY",
        "New customer acquisition: +450",
        "NPS score improved to 72",
    ]},
    {"type": "table", "title": "Regional Performance",
     "headers": ["Region", "Revenue", "Target", "Variance"],
     "rows": [["North", "$2.1M", "$2.0M", "+5%"], ["South", "$1.8M", "$2.0M", "-10%"]]},
]
claude_output_to_slides(slide_data, "q1-report.pptx")
```

## Using Existing Templates

```python
# Load existing branded template
prs = Presentation("company-template.pptx")

# Add slide using template's layouts
# Template layouts preserve branding (fonts, colors, logos)
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "New Content Slide"
```

## Output Location

Save generated `.pptx` files to:

- User-specified path, or
- `.claude/context/artifacts/` for agent-generated presentations

## Anti-Patterns

- Never use raw integer values for sizes — always `Pt()`, `Inches()`, or `Emu()`
- Never add text directly to slide (use placeholder shapes for layout consistency)
- Never hardcode colors without using `RGBColor` — inconsistent on dark/light themes
- Never forget `tf.clear()` before setting text on a reused placeholder
- Never use `slide_layouts[6]` (blank) for content — placeholder positions will be missing

## Related Skills

- `xlsx` — Excel spreadsheet generation (tabular data export)
- `diagram-generator` — Mermaid diagrams (for embedding architecture diagrams)
- `markitdown-converter` — Convert existing files to Markdown for Claude processing

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md`

**After completing:** Record any `python-pptx` version compatibility issues or slide layout gotchas.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
