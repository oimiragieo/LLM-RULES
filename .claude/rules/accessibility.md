# Accessibility Rules

## Core Principles

- Accessibility is not optional - it's a legal and ethical requirement
- Design for all users including those with disabilities
- Use semantic HTML as the foundation
- Test with real assistive technologies
- Follow WCAG 2.1 AA standards minimum

## Input Requirements

- Component or page to review
- Target WCAG level (A, AA, or AAA)
- Supported browsers and assistive technologies
- User interaction patterns (keyboard, screen reader, touch)

## Output Standards

### Required Accessibility Elements
1. **Semantic HTML**: Proper element choices (nav, main, article, button vs div)
2. **ARIA Attributes**: Labels, roles, states where semantic HTML insufficient
3. **Keyboard Navigation**: Tab order, focus management, shortcuts
4. **Screen Reader Support**: Alt text, ARIA labels, live regions
5. **Color Contrast**: WCAG ratios (4.5:1 for normal text, 3:1 for large text)
6. **Focus Indicators**: Visible focus states for all interactive elements

### WCAG 2.1 Levels

| Level | Description | Examples |
|-------|-------------|----------|
| **A** | Basic accessibility (minimum) | Alt text, keyboard navigation |
| **AA** | Deals with barriers (standard) | Color contrast, resizable text |
| **AAA** | Highest level (ideal) | Enhanced contrast, sign language |

## Semantic HTML Standards

**Use semantic elements over divs:**

```html
<!-- ❌ BAD -->
<div class="header">
  <div class="nav">
    <div class="nav-item" onclick="navigate()">Home</div>
  </div>
</div>

<!-- ✅ GOOD -->
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>
```

**Semantic element hierarchy:**

```html
<header> - Site/section header
<nav> - Navigation links
<main> - Primary content (one per page)
<article> - Self-contained content
<section> - Thematic grouping
<aside> - Tangential content
<footer> - Site/section footer
```

## ARIA Attributes Standards

**Only use ARIA when semantic HTML insufficient:**

```html
<!-- ❌ BAD - Unnecessary ARIA -->
<button role="button" aria-label="Submit">Submit</button>

<!-- ✅ GOOD - Semantic HTML -->
<button>Submit</button>

<!-- ✅ GOOD - ARIA when needed -->
<div role="button" tabindex="0" aria-label="Close dialog">×</div>
```

**Common ARIA patterns:**

| Pattern | ARIA Attributes | Use Case |
|---------|-----------------|----------|
| Button | `role="button"`, `tabindex="0"` | Non-button interactive element |
| Dialog | `role="dialog"`, `aria-modal="true"` | Modal overlays |
| Alert | `role="alert"`, `aria-live="assertive"` | Important notifications |
| Tab panel | `role="tabpanel"`, `aria-labelledby` | Tabbed interfaces |
| Combobox | `role="combobox"`, `aria-expanded` | Select dropdowns |

## Keyboard Navigation Standards

**All interactive elements must be keyboard accessible:**

- Tab: Navigate forward
- Shift+Tab: Navigate backward
- Enter/Space: Activate buttons/links
- Arrow keys: Navigate within components (tabs, menus)
- Escape: Close dialogs/menus

**Focus management:**

```javascript
// ❌ BAD - No focus trap in modal
function openModal() {
  modal.style.display = 'block';
}

// ✅ GOOD - Trap focus within modal
function openModal() {
  modal.style.display = 'block';
  modal.querySelector('button').focus();
  trapFocus(modal);
}
```

## Color Contrast Standards

**WCAG contrast ratios:**

| Text Size | Normal Text | Large Text (18pt+) |
|-----------|-------------|-------------------|
| **AA** | 4.5:1 | 3:1 |
| **AAA** | 7:1 | 4.5:1 |

**Check contrast:**

- Use browser DevTools or tools like WebAIM Contrast Checker
- Test with grayscale to verify readability
- Don't rely on color alone for information

```css
/* ❌ BAD - Insufficient contrast */
.text { color: #777; background: #fff; } /* 4.47:1 - fails AA */

/* ✅ GOOD - Sufficient contrast */
.text { color: #595959; background: #fff; } /* 7:1 - passes AAA */
```

## Screen Reader Support

**Alt text for images:**

```html
<!-- ❌ BAD - Missing alt or redundant -->
<img src="logo.png">
<img src="decorative.png" alt="decorative image">

<!-- ✅ GOOD -->
<img src="logo.png" alt="Company Logo">
<img src="decorative.png" alt="" role="presentation">
```

**ARIA labels for icon buttons:**

```html
<!-- ❌ BAD - No label -->
<button><i class="icon-close"></i></button>

<!-- ✅ GOOD -->
<button aria-label="Close dialog">
  <i class="icon-close" aria-hidden="true"></i>
</button>
```

**Live regions for dynamic content:**

```html
<!-- ✅ GOOD - Announce changes -->
<div role="alert" aria-live="assertive">
  Form submitted successfully
</div>

<div aria-live="polite" aria-atomic="true">
  Loading results...
</div>
```

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `<div>` for everything | No semantic meaning | Use semantic HTML |
| Click handlers on `<div>` | Not keyboard accessible | Use `<button>` |
| Images without alt text | Screen readers can't describe | Add meaningful alt |
| Color-only information | Color blind users miss info | Add text/icons |
| No focus indicators | Users don't know where they are | Add `:focus` styles |
| Auto-playing media | Disruptive for screen readers | Add controls |
| `tabindex` > 0 | Disrupts natural tab order | Use 0 or -1 only |

## Testing Checklist

Before finalizing accessibility review, verify:
- [ ] All images have alt text (or `alt=""` for decorative)
- [ ] All interactive elements keyboard accessible
- [ ] Tab order is logical
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA (4.5:1 normal, 3:1 large)
- [ ] Semantic HTML used (nav, main, article, etc.)
- [ ] ARIA labels on icon buttons
- [ ] Forms have proper labels
- [ ] Error messages announced to screen readers
- [ ] Dialogs trap focus and close on Escape
- [ ] Dynamic content uses ARIA live regions
- [ ] Tested with screen reader (NVDA, JAWS, VoiceOver)
- [ ] Tested with keyboard only (no mouse)
- [ ] Tested with browser zoom (200%)

## Testing Tools

**Automated:**
- axe DevTools (Chrome/Firefox extension)
- Lighthouse (Chrome DevTools)
- WAVE (WebAIM)
- Pa11y (CLI)

**Manual:**
- Screen readers: NVDA (Windows), JAWS (Windows), VoiceOver (Mac/iOS)
- Keyboard navigation
- Browser zoom (Ctrl/Cmd + +)
- Grayscale mode

## Iron Law

```
NO PRODUCTION DEPLOYMENT WITHOUT ACCESSIBILITY REVIEW FOR UI CHANGES
```

Any UI change must pass accessibility review before deployment.

## Integration Points

### Agents Using This Skill
- **developer** (secondary): Implements accessible components
- **code-reviewer**: Reviews accessibility in PRs
- **qa**: Tests accessibility compliance
- **frontend-pro**: Ensures accessible UI patterns

### Related Skills
- **frontend-expert**: UI component patterns
- **react-expert**: React accessibility patterns
- **mobile-first-design-rules**: Touch accessibility

### Workflows
- **feature-development-workflow.md**: Accessibility review in Review phase
- **code-review-workflow.md**: Accessibility checklist

## Related References

- `.claude/skills/accessibility/SKILL.md` - Complete skill documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
