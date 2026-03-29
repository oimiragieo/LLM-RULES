# Browser Automation Skill Workflow

## Skill Location

`.claude/skills/browser-automation/SKILL.md`

## Invocation

- /browser-automation
- node .claude/skills/browser-automation/scripts/main.cjs --help

## Setup

```bash
pip install playwright && playwright install chromium
pip install playwright-stealth  # optional, for anti-detection
```

## Common Workflows

### Data Extraction

- Navigate to URLs and extract structured data
- Handle pagination and infinite scroll
- Save as JSON to `.claude/context/tmp/`

### Form Automation

- Fill and submit forms programmatically
- Handle multi-step workflows
- Persist auth sessions for repeated access

### Capture

- Full-page screenshots
- PDF generation for archival
- Save to `.claude/context/artifacts/`
