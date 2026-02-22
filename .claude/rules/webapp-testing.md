# Web App Testing

Use Playwright (Python) for automated browser testing of local web apps.

## When to Use

- Verifying frontend functionality end-to-end
- Debugging UI behavior that can't be caught by unit tests
- Capturing screenshots for visual regression
- Reading browser console logs for JS errors

## Quick Start Pattern

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:3000")
    # interact, assert, screenshot
    browser.close()
```

## Targets

- Static HTML: use `file://` URL
- Dev server: start server first, then `http://localhost:{port}`
- Always capture console errors: `page.on("console", print)`

## When to invoke

`Skill({ skill: 'webapp-testing' })` — for UI/browser test automation
