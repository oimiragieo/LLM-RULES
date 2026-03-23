# Playwright Testing Rules

## Page Object Model

- Encapsulate all page interactions in Page Object classes; never scatter `page.locator(...)` calls across test files
- One Page Object per logical page or major component; name files `<page-name>.page.ts`
- Expose only high-level actions from Page Objects (`login(email, password)`) not low-level selectors (`emailInput`)
- Page Objects must not contain assertions — assertions belong in the test itself
- Extend `BasePage` with shared navigation helpers (`goto`, `waitForNetworkIdle`) to avoid duplication

## Fixtures

- Define shared state in `test.extend<{}>()` fixtures in `fixtures/index.ts`; import into every spec that needs them
- Use `scope: 'test'` (default) for per-test setup; use `scope: 'worker'` only for expensive shared resources (DB seed, auth state)
- Authenticate once per worker with `storageState` fixture to avoid login on every test
- Clean up fixtures in teardown even on test failure; use try/finally inside fixture setup
- Never use global `beforeAll` for auth setup — use fixtures so parallelism is safe

## Locator Best Practices

- Prefer user-visible locators in this order: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > `getByTestId`
- Use `data-testid` attributes as a last resort; they indicate missing semantic HTML
- Never use CSS class selectors or XPath in tests — they break on styling refactors
- Chain locators to narrow scope: `page.getByRole('dialog').getByRole('button', { name: 'Submit' })`
- Use `locator.filter({ hasText: '...' })` for lists; avoid `nth(0)` unless positional order is semantically meaningful

## Storage State (Auth)

- Generate `storageState` files with `playwright/auth/<role>.json` naming; commit them only if they contain no secrets
- Use `page.context().storageState({ path })` at the end of auth setup to serialize session cookies and localStorage
- Reference auth state in `playwright.config.ts` `use.storageState` per project, not per test
- Regenerate auth state in CI on auth-related code changes; stale state causes flaky auth failures
- Never hardcode credentials in test files; load from `process.env` or a secrets manager

## Avoiding waitForTimeout

- Never use `page.waitForTimeout(ms)` — it is a fixed sleep that makes tests slow and flaky
- Replace with `page.waitForSelector`, `page.waitForResponse`, `locator.waitFor({ state: 'visible' })`, or `expect(locator).toBeVisible()`
- For async data loading, use `page.waitForResponse(url => url.includes('/api/'))` to gate on network completion
- Use `expect(locator).toBeVisible({ timeout: 5000 })` to wait with an explicit deadline and clear failure message
- For animations, use `locator.waitFor({ state: 'stable' })` instead of sleeping for animation duration

## Anti-Patterns

- Never share mutable state between tests — each test must be independent and runnable in isolation
- Never use `test.only` in committed code; it silently disables the full test suite in CI
- Never hardcode base URLs — always use `baseURL` from `playwright.config.ts`
- Never assert on implementation details (DOM structure, class names) — assert on user-visible text and behavior
- Never ignore `expect` return values; awaiting `expect(locator).toBeVisible()` is mandatory (it returns a Promise)

## When to invoke

`Skill({ skill: 'webapp-testing' })` for Playwright E2E test authoring and Page Object Model design
