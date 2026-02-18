# Accessibility Research Requirements (2026)

## Verified Tech Stack

- **Engine**: axe-core v4.11+ (Supports WCAG 2.2)
- **Runner**: Playwright (Industry standard for 2026 E2E)
- **Library**: `@axe-core/playwright`
- **Reporter**: `axe-html-reporter` for human-readable audits

## WCAG 2.2 Critical Tags

Use these tags in `AxeBuilder` to ensure 2026 compliance:

- `wcag2a`, `wcag2aa` (Base)
- `wcag21a`, `wcag21aa` (Legacy +)
- `wcag22aa` (2026 Standard)
- `best-practice` (Axe specific)

## Implementation Patterns

### Playwright Integration

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('a11y audit', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

## design Constraints

1. **Target Size**: 24x24px minimum (Success Criterion 2.5.8).
2. **Focus Not Obscured**: Check for sticky elements (Success Criterion 2.4.11).
3. **Accessible Auth**: Allow password managers/copy-paste (Success Criterion 3.3.8).

## Source References

- [W3C WCAG 2.2 Requirements](https://w3c.github.io/wcag/requirements/22/)
- [Playwright Accessibility Guide](https://playwright.dev/docs/accessibility-testing)
- [Deque axe-core Rule Descriptions](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
