# Browser Automation Research Requirements (2026)

## Verified Tech Stack

- **Library**: Playwright Python
- **Anti-detection**: playwright-stealth (optional)
- **Session Persistence**: storage_state JSON files

## Setup

```bash
pip install playwright
playwright install chromium
pip install playwright-stealth  # optional, for anti-detection
```

## Core Patterns

### Navigation and Extraction

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 ...",
        viewport={"width": 1280, "height": 720}
    )
    page = context.new_page()
    page.goto(url)
    page.wait_for_load_state("networkidle")
    items = [i.inner_text() for i in page.get_by_role("listitem").all()]
```

### Form Filling

```python
page.get_by_label("Email").fill("user@example.com")
page.get_by_label("Password").fill("secret")
with page.expect_navigation():
    page.get_by_role("button", name="Submit").click()
```

### Auth Session Management

```python
# Save session
context.storage_state(path="auth-state.json")

# Reuse session
context = browser.new_context(storage_state="auth-state.json")
```

### Anti-Detection

```python
browser = p.chromium.launch(
    args=["--disable-blink-features=AutomationControlled"]
)
page.add_init_script(
    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
)
```

## Agent Usage

- Save extracted data to `.claude/context/tmp/` as structured JSON
- Save screenshots/PDFs to `.claude/context/artifacts/`
- Never commit `auth-state.json` — add to `.gitignore`

## Source References

- [Playwright Python Documentation](https://playwright.dev/python/docs/intro)
- [Playwright Best Practices](https://playwright.dev/python/docs/best-practices)
