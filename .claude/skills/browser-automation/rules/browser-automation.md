# browser-automation Rules

## Purpose

Programmatic web automation using Playwright Python for data extraction, form filling, multi-step workflows, auth session management, screenshot/PDF capture, and anti-detection patterns.

## Iron Law

```
NEVER USE time.sleep() — use page.wait_for_selector() or wait_for_load_state()
```

## Best Practices

- Use storage state to persist authenticated sessions across runs
- Prefer role-based locators (get_by_role, get_by_label) over CSS selectors
- Always use context managers (with sync_playwright() as p) for resource cleanup
- Set realistic user-agent and viewport to avoid bot detection
- Use page.wait_for_selector() instead of time.sleep() for dynamic content

## Anti-Patterns

| Anti-Pattern             | Correct Approach                                     |
| ------------------------ | ---------------------------------------------------- |
| `time.sleep()` for waits | `page.wait_for_selector()` / `wait_for_load_state()` |
| CSS selectors for forms  | `get_by_label()`, `get_by_role()`                    |
| Re-login each run        | `context.storage_state()` persistence                |
| Committing auth state    | Add `auth-state.json` to `.gitignore`                |

## Related Skills

- `webapp-testing` — QA assertions, visual regression, test suites
- `chrome-browser` — Interactive MCP DevTools control
