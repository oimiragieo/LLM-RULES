---
name: xlsx
description: Excel spreadsheet generation using openpyxl and xlsxwriter. Convert Claude output, data analysis results, and tabular data into formatted .xlsx files with charts, formulas, conditional formatting, and multiple sheets. Use for generating Excel reports programmatically.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit]
best_practices:
  - Use openpyxl for reading/modifying existing files
  - Use xlsxwriter for creating new files with advanced formatting
  - Never mix openpyxl and xlsxwriter on the same file
  - Always close xlsxwriter workbooks to flush output
  - Use named styles for consistent formatting across sheets
error_handling: graceful
streaming: not_applicable
verified: true
lastVerifiedAt: 2026-03-15T00:00:00.000Z
source: builtin
trust_score: 100
provenance_sha: 4658c37a3793b006
---

# Excel Spreadsheet Generation (xlsx)

## Overview

Generate `.xlsx` files programmatically to export data, build reports, and create dashboards. Two primary libraries:

- **openpyxl** — read/write/modify existing Excel files, formula support, full feature set
- **xlsxwriter** — write-only, high-performance for large datasets, richer chart/format API

## When to Invoke

`Skill({ skill: 'xlsx' })` when:

- User asks to "export to Excel", "create a spreadsheet", or "generate a report in Excel"
- Converting tabular data, query results, or analysis output to `.xlsx`
- Building financial models, dashboards, or structured reports
- Creating templated Excel outputs for recurring workflows

## Installation

```bash
pip install openpyxl xlsxwriter
# or
uv add openpyxl xlsxwriter
```

## Quick Start (openpyxl)

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Sales Report"

# Headers
headers = ["Product", "Q1", "Q2", "Q3", "Q4", "Total"]
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = PatternFill(start_color="1F497D", fill_type="solid")
    cell.alignment = Alignment(horizontal="center")

# Data rows
data = [
    ("Widget A", 45000, 52000, 61000, 58000),
    ("Widget B", 32000, 38000, 41000, 44000),
    ("Widget C", 18000, 21000, 19000, 23000),
]
for row_idx, row in enumerate(data, 2):
    for col_idx, value in enumerate(row, 1):
        ws.cell(row=row_idx, column=col_idx, value=value)
    # Add SUM formula for Total column
    ws.cell(row=row_idx, column=6, value=f"=SUM(B{row_idx}:E{row_idx})")

# Auto-fit column widths
for col in ws.columns:
    max_len = max(len(str(cell.value or "")) for cell in col)
    ws.column_dimensions[get_column_letter(col[0].column)].width = max_len + 4

wb.save("sales-report.xlsx")
```

## Named Styles

```python
from openpyxl.styles import NamedStyle, Font, Border, Side, PatternFill, Alignment

def create_styles(wb):
    # Header style
    header_style = NamedStyle(name="header")
    header_style.font = Font(bold=True, color="FFFFFF", size=12)
    header_style.fill = PatternFill(start_color="2E4057", fill_type="solid")
    header_style.alignment = Alignment(horizontal="center", vertical="center")
    thin = Side(border_style="thin", color="000000")
    header_style.border = Border(bottom=thin)
    wb.add_named_style(header_style)

    # Currency style
    currency_style = NamedStyle(name="currency")
    currency_style.number_format = '"$"#,##0.00'
    wb.add_named_style(currency_style)

    # Percent style
    percent_style = NamedStyle(name="percent")
    percent_style.number_format = '0.0%'
    wb.add_named_style(percent_style)

    return wb

wb = create_styles(Workbook())
ws = wb.active
ws["A1"].style = "header"
ws["B2"].style = "currency"
```

## Multiple Sheets

```python
def build_multi_sheet_report(data_by_region: dict, output_path: str):
    wb = Workbook()
    wb.remove(wb.active)  # Remove default sheet

    summary_ws = wb.create_sheet("Summary", 0)

    for region, data in data_by_region.items():
        ws = wb.create_sheet(region)
        # Write region data
        for row_idx, row in enumerate(data, 1):
            for col_idx, value in enumerate(row, 1):
                ws.cell(row=row_idx, column=col_idx, value=value)

        # Add cross-sheet reference to summary
        summary_ws.append([region, f"='{region}'!B2"])

    wb.save(output_path)
```

## Conditional Formatting

```python
from openpyxl.formatting.rule import ColorScaleRule, DataBarRule, CellIsRule
from openpyxl.styles import PatternFill

# Color scale (green-yellow-red)
color_scale = ColorScaleRule(
    start_type="min", start_color="63BE7B",
    mid_type="percentile", mid_value=50, mid_color="FFEB84",
    end_type="max", end_color="F8696B"
)
ws.conditional_formatting.add("B2:E10", color_scale)

# Highlight negative values in red
red_fill = PatternFill(start_color="FFC7CE", fill_type="solid")
negative_rule = CellIsRule(operator="lessThan", formula=["0"], fill=red_fill)
ws.conditional_formatting.add("B2:E10", negative_rule)
```

## Charts (openpyxl)

```python
from openpyxl.chart import BarChart, Reference

def add_bar_chart(ws, title, data_range, categories_range, position="G1"):
    chart = BarChart()
    chart.type = "col"
    chart.title = title
    chart.style = 10
    chart.y_axis.title = "Value"
    chart.x_axis.title = "Category"
    chart.width = 20
    chart.height = 12

    data = Reference(ws, **data_range)  # e.g., min_col=2, min_row=1, max_col=5, max_row=5
    cats = Reference(ws, **categories_range)  # e.g., min_col=1, min_row=2, max_row=5

    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    ws.add_chart(chart, position)
    return chart
```

## High-Performance with xlsxwriter (Large Datasets)

```python
import xlsxwriter

def export_large_dataset(rows: list[list], output_path: str, sheet_name="Data"):
    """Use xlsxwriter for 10K+ row exports — significantly faster than openpyxl."""
    workbook = xlsxwriter.Workbook(output_path)
    worksheet = workbook.add_worksheet(sheet_name)

    # Define formats
    header_fmt = workbook.add_format({
        "bold": True, "bg_color": "#1F497D", "font_color": "#FFFFFF",
        "border": 1, "align": "center"
    })
    money_fmt = workbook.add_format({"num_format": "$#,##0.00"})
    pct_fmt = workbook.add_format({"num_format": "0.0%"})
    date_fmt = workbook.add_format({"num_format": "yyyy-mm-dd"})

    # Write headers
    headers = rows[0] if rows else []
    for col, header in enumerate(headers):
        worksheet.write(0, col, header, header_fmt)

    # Write data rows using write_row for performance
    for row_idx, row in enumerate(rows[1:], 1):
        worksheet.write_row(row_idx, 0, row)

    # Auto-filter on headers
    worksheet.autofilter(0, 0, len(rows) - 1, len(headers) - 1)

    # Freeze top row
    worksheet.freeze_panes(1, 0)

    workbook.close()
    return output_path
```

## Agent Workflow: Claude Output → Excel

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class SheetSpec:
    name: str
    headers: list[str]
    rows: list[list[Any]]
    formats: dict[int, str] = None  # col_index -> format_name

def claude_output_to_excel(sheets: list[SheetSpec], output_path: str) -> str:
    """
    Convert Claude structured output to Excel file.

    sheets: List of SheetSpec objects describing each worksheet.
    """
    wb = Workbook()
    wb.remove(wb.active)

    for spec in sheets:
        ws = wb.create_sheet(spec.name)

        # Write headers
        for col, header in enumerate(spec.headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = Font(bold=True)
            cell.fill = PatternFill(start_color="D9E1F2", fill_type="solid")

        # Write rows
        for row_idx, row in enumerate(spec.rows, 2):
            for col_idx, value in enumerate(row, 1):
                ws.cell(row=row_idx, column=col_idx, value=value)

        # Auto-width
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 50)

    wb.save(output_path)
    return output_path

# Example: Export analysis results
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from openpyxl import Workbook

result = claude_output_to_excel([
    SheetSpec(
        name="Summary",
        headers=["Metric", "Value", "Change"],
        rows=[
            ["Revenue", "$2.1M", "+23%"],
            ["Users", "45,230", "+15%"],
            ["NPS", "72", "+8pts"],
        ]
    ),
    SheetSpec(
        name="Details",
        headers=["Date", "Product", "Amount", "Region"],
        rows=[
            ["2026-01-15", "Widget A", 12500, "North"],
            ["2026-01-16", "Widget B", 8900, "South"],
        ]
    ),
], "analysis-output.xlsx")
```

## Choosing: openpyxl vs xlsxwriter

| Feature                  | openpyxl | xlsxwriter       |
| ------------------------ | -------- | ---------------- |
| Read existing files      | YES      | No               |
| Modify existing files    | YES      | No               |
| Write new files          | YES      | YES              |
| Performance (large data) | Moderate | Excellent        |
| Formula support          | YES      | YES              |
| Charts                   | YES      | YES (better API) |
| Conditional formatting   | YES      | YES              |
| Tables (ListObject)      | YES      | YES              |
| Max rows (practical)     | ~100K    | Millions         |

**Rule:** Use openpyxl when reading/modifying, xlsxwriter when creating large new files.

## Output Location

Save generated `.xlsx` files to:

- User-specified path, or
- `.claude/context/artifacts/` for agent-generated reports

## Anti-Patterns

- Never use openpyxl `write_only` mode then try to read cells back
- Never forget `workbook.close()` with xlsxwriter — file is not flushed until close
- Never use string values for numbers in Excel cells — use native Python int/float
- Never build large spreadsheets cell-by-cell with openpyxl — use `write_row` with xlsxwriter
- Never leave merged cells in auto-width calculation — causes `AttributeError`

## Related Skills

- `pptx` — PowerPoint generation (for visual slide presentations)
- `data-expert` — Data processing, pandas, transformation pipelines
- `markitdown-converter` — Convert existing Excel files to Markdown for Claude

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md`

**After completing:** Record library version gotchas or performance patterns.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
