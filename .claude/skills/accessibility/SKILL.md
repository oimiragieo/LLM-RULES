---
name: accessibility
description: Ensure accessibility in UI components including semantic HTML, ARIA attributes, keyboard navigation, and WCAG 2.1 AA compliance.
version: 2.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: src/**/*.*
best_practices:
  - Use semantic HTML as foundation
  - Add ARIA only when semantic HTML insufficient
  - Test with real assistive technologies
  - Follow WCAG 2.1 AA minimum
error_handling: graceful
streaming: supported
---

# Accessibility Skill

<identity>
You are an accessibility expert specializing in WCAG 2.1 compliance, semantic HTML, ARIA attributes, keyboard navigation, and assistive technology support.
</identity>

<capabilities>
- Review code for accessibility compliance (WCAG 2.1 AA/AAA)
- Suggest semantic HTML improvements
- Implement proper ARIA attributes
- Ensure keyboard navigation support
- Verify color contrast ratios
- Test screen reader compatibility
- Generate accessibility audit reports
</capabilities>

<instructions>
## Step-by-Step Accessibility Review Process

### Step 1: Semantic HTML Audit

Review component structure for proper semantic elements:

**Check for:**

- `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>` instead of generic `<div>`
- `<button>` for clickable elements (not `<div onclick>`)
- `<a>` for navigation links
- `<form>`, `<input>`, `<label>` for forms
- Proper heading hierarchy (`<h1>` through `<h6>`)

**Example:**

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

### Step 2: ARIA Attributes Review

Add ARIA attributes ONLY when semantic HTML is insufficient:

**Common Patterns:**

| Use Case      | ARIA Attributes                         | Example                                         |
| ------------- | --------------------------------------- | ----------------------------------------------- |
| Custom button | `role="button"`, `tabindex="0"`         | `<div role="button" tabindex="0">`              |
| Modal dialog  | `role="dialog"`, `aria-modal="true"`    | `<div role="dialog" aria-modal="true">`         |
| Alert         | `role="alert"`, `aria-live="assertive"` | `<div role="alert">Error occurred</div>`        |
| Tab panel     | `role="tabpanel"`, `aria-labelledby`    | `<div role="tabpanel" aria-labelledby="tab-1">` |

**Rules:**

- Don't add redundant ARIA (`<button role="button">` is unnecessary)
- Use `aria-label` for icon buttons without text
- Use `aria-hidden="true"` for decorative elements
- Use `aria-live` regions for dynamic content

**Example:**

```html
<!-- Icon button needs aria-label -->
<button aria-label="Close dialog">
  <i class="icon-close" aria-hidden="true"></i>
</button>

<!-- Dynamic content needs live region -->
<div role="alert" aria-live="assertive">Form submitted successfully</div>
```

### Step 3: Keyboard Navigation Test

Verify all interactive elements are keyboard accessible:

**Requirements:**

- Tab: Navigate forward through interactive elements
- Shift+Tab: Navigate backward
- Enter/Space: Activate buttons and links
- Arrow keys: Navigate within components (tabs, menus, listboxes)
- Escape: Close dialogs and menus

**Focus Management:**

- Trap focus within modals (prevent tabbing outside)
- Return focus to trigger element when closing modal
- Skip to main content link for screen reader users
- Visible focus indicators (`:focus` styles)

**Example:**

```javascript
// Focus trap in modal
function openModal(modal) {
  modal.style.display = 'block';
  const firstFocusable = modal.querySelector('button, input, a');
  firstFocusable.focus();
  trapFocus(modal); // Prevent escape from modal
}

function trapFocus(container) {
  const focusableElements = container.querySelectorAll('button, input, select, textarea, a[href]');
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  container.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  });
}
```

### Step 4: Color Contrast Verification

Check all text meets WCAG contrast ratios:

**Standards:**

| Text Size                        | WCAG AA | WCAG AAA |
| -------------------------------- | ------- | -------- |
| Normal text (< 18pt)             | 4.5:1   | 7:1      |
| Large text (≥ 18pt or 14pt bold) | 3:1     | 4.5:1    |
| UI components                    | 3:1     | -        |

**Tools:**

- WebAIM Contrast Checker
- Browser DevTools color picker
- Grayscale test (convert to grayscale to verify readability)

**Example:**

```css
/* ❌ BAD - Insufficient contrast */
.text {
  color: #777;
  background: #fff;
} /* 4.47:1 - fails AA */

/* ✅ GOOD - Sufficient contrast */
.text {
  color: #595959;
  background: #fff;
} /* 7:1 - passes AAA */

/* ✅ GOOD - Don't rely on color alone */
.error {
  color: #d00;
  border-left: 4px solid #d00; /* Visual indicator beyond color */
}
.error::before {
  content: '⚠️ ';
} /* Icon indicator */
```

### Step 5: Screen Reader Support

Ensure proper screen reader experience:

**Alt Text for Images:**

```html
<!-- ❌ BAD - Missing or redundant alt -->
<img src="logo.png" />
<img src="decorative.png" alt="decorative image" />

<!-- ✅ GOOD -->
<img src="logo.png" alt="Company Logo" />
<img src="decorative.png" alt="" role="presentation" />
```

**ARIA Labels for Icon Buttons:**

```html
<!-- ❌ BAD - No label for screen readers -->
<button><i class="icon-delete"></i></button>

<!-- ✅ GOOD -->
<button aria-label="Delete item">
  <i class="icon-delete" aria-hidden="true"></i>
</button>
```

**Live Regions for Dynamic Content:**

```html
<!-- Announce errors immediately -->
<div role="alert" aria-live="assertive">Error: Invalid email address</div>

<!-- Announce status updates politely -->
<div aria-live="polite" aria-atomic="true">Loading results... 3 of 10 loaded</div>
```

### Step 6: Form Accessibility

Ensure all form inputs are properly labeled and validated:

**Requirements:**

- All inputs have associated `<label>` elements
- Use `<fieldset>` and `<legend>` for grouped inputs
- Show validation errors with `aria-describedby`
- Required fields marked with `aria-required="true"` or `required` attribute

**Example:**

```html
<!-- ✅ GOOD Form Structure -->
<form>
  <fieldset>
    <legend>Personal Information</legend>

    <label for="name">Name (required)</label>
    <input id="name" type="text" required aria-required="true" aria-describedby="name-error" />
    <span id="name-error" role="alert" class="error" aria-live="polite">
      <!-- Error message appears here -->
    </span>

    <label for="email">Email</label>
    <input id="email" type="email" aria-describedby="email-hint" />
    <span id="email-hint" class="hint">We'll never share your email</span>
  </fieldset>
</form>
```

### Step 7: Generate Accessibility Report

Document findings with:

- Total issues found (categorized by severity)
- WCAG level compliance status (A, AA, AAA)
- Specific violations with line numbers
- Recommended fixes with code examples
- Testing performed (automated + manual)
  </instructions>

<examples>
## Usage Examples

### Example 1: Review React Component

```javascript
Skill({ skill: 'accessibility' });
```

**Input**: React component with custom modal
**Output**:

- Semantic HTML recommendations
- ARIA attributes needed
- Keyboard navigation issues
- Focus trap implementation
- WCAG compliance report

### Example 2: Audit Color Contrast

```javascript
Skill({ skill: 'accessibility', args: 'color-contrast' });
```

**Input**: CSS file with color definitions
**Output**:

- List of failing contrast ratios
- Recommended color adjustments
- Before/after contrast scores

### Example 3: Form Accessibility Check

```javascript
Skill({ skill: 'accessibility', args: 'forms' });
```

**Input**: Form component
**Output**:

- Label associations verified
- Required field indicators
- Error message patterns
- Keyboard submission support
  </examples>

<best_practices>

## Best Practices

### DO

- Use semantic HTML as foundation (header, nav, main, article)
- Add ARIA only when semantic HTML insufficient
- Test with real screen readers (NVDA, JAWS, VoiceOver)
- Ensure keyboard navigation works without mouse
- Maintain 4.5:1 contrast for normal text (WCAG AA)
- Provide text alternatives for all non-text content
- Use focus indicators (visible :focus styles)
- Trap focus within modals
- Announce dynamic content with aria-live

### DON'T

- Use `<div>` for everything (no semantic meaning)
- Put click handlers on non-interactive elements
- Forget alt text on images
- Rely on color alone for information
- Remove focus indicators (outline: none)
- Auto-play media without controls
- Use `tabindex` > 0 (disrupts natural tab order)
- Create keyboard traps (user can't escape)
- Hide important content from screen readers

## Anti-Patterns

| Anti-Pattern           | Problem                       | Fix                            |
| ---------------------- | ----------------------------- | ------------------------------ |
| `<div onclick>`        | Not keyboard accessible       | Use `<button>`                 |
| No alt text            | Screen readers can't describe | Add meaningful `alt` attribute |
| Color-only info        | Color blind users miss it     | Add text/icons                 |
| No focus indicators    | Users lost in navigation      | Add `:focus` styles            |
| Auto-play media        | Disruptive for screen readers | Add controls, pause option     |
| `<div>` for everything | No semantic structure         | Use semantic HTML              |

## Testing Checklist

Before finalizing accessibility review:

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
      </best_practices>

## Integration Points

### Agents Using This Skill

- **developer**: Implements accessible components
- **code-reviewer**: Reviews accessibility in PRs
- **qa**: Tests accessibility compliance
- **frontend-pro**: Ensures accessible UI patterns
- **react-pro**: React-specific accessibility patterns

### Related Skills

- **frontend-expert**: UI component patterns
- **react-expert**: React accessibility patterns
- **mobile-first-design-rules**: Touch accessibility

### Workflows

- **feature-development-workflow.md**: Accessibility review in Review phase
- **code-review-workflow.md**: Accessibility checklist

## Related References

- `.claude/rules/accessibility.md` - Complete accessibility rules
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previously discovered accessibility patterns
- Common accessibility issues in this codebase
- Project-specific accessibility requirements

**After completing:**

- New accessibility pattern → `.claude/context/memory/learnings.md`
- Accessibility issue found → `.claude/context/memory/issues.md`
- Accessibility decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
