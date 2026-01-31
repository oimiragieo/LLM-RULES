# Web Design Skill Guide

**Comprehensive guide to the Web Design & Accessibility skill with 100+ dynamic guidelines.**

---

## Overview

The Web Design skill (`vercel-web-design-guidelines`) provides 100+ dynamic web design and accessibility guidelines fetched from https://vercel.com/docs/ai/rules. Focuses on WCAG 2.1 Level AA compliance, dark mode support, and internationalization.

**Key features:**

- 100+ dynamic guidelines (fetched from web)
- WCAG 2.1 Level AA accessibility compliance
- Dark mode and theme support
- Internationalization (i18n) best practices
- Form, image, and typography guidelines
- Touch optimization for mobile

**Skill invocation:**

```javascript
Skill({ skill: 'vercel-web-design-guidelines' });
```

---

## What It Does

The skill performs automated accessibility and design audits by fetching the latest guidelines from Vercel's documentation. It provides:

- Accessibility violations (WCAG 2.1 Level AA)
- Design pattern recommendations
- Dark mode support checks
- Internationalization guidelines
- Form accessibility patterns
- Image optimization recommendations
- Typography best practices
- Touch optimization for mobile

**Analysis scope:**

- Accessibility (WCAG 2.1)
- Forms
- Images
- Typography
- Dark Mode
- Internationalization
- Touch Optimization
- Semantic HTML

---

## Trigger Scenarios

Invoke this skill when:

1. **Accessibility Audits**

   - "Audit my website for accessibility"
   - "Is my site WCAG compliant"
   - "Check for accessibility issues"

2. **UI Review**

   - "Check my UI for design issues"
   - "Design review for this component"
   - "UI best practices check"

3. **Dark Mode Support**

   - "Design review for dark mode support"
   - "How do I implement dark mode"
   - "Dark theme best practices"

4. **Internationalization**
   - "Is my site ready for i18n"
   - "Multi-language support check"
   - "RTL layout support"

---

## Expected Outputs

### 1. Accessibility Violations

The skill identifies WCAG 2.1 Level AA violations:

```
CRITICAL Accessibility Issues (5 violations)
- Missing alt text on images (WCAG 1.1.1)
- Insufficient color contrast (WCAG 1.4.3)
- Form inputs missing labels (WCAG 3.3.2)

HIGH Accessibility Issues (8 violations)
- No skip to main content link (WCAG 2.4.1)
- Missing focus indicators (WCAG 2.4.7)
- Images not responsive (WCAG 1.4.10)

MEDIUM Accessibility Issues (12 violations)
- Non-semantic HTML (WCAG 1.3.1)
- Missing ARIA labels (WCAG 4.1.2)
```

### 2. Design Pattern Recommendations

For each violation, the skill provides:

- **WCAG guideline** - Which guideline is violated
- **Problem statement** - What the issue is
- **Fix suggestion** - How to fix it
- **Code example** - Implementation

### 3. Severity Levels

| Severity | Impact                           | Fix Priority |
| -------- | -------------------------------- | ------------ |
| CRITICAL | Prevents access for some users   | Immediate    |
| HIGH     | Significant usability barrier    | Soon         |
| MEDIUM   | Minor usability issue            | When time    |
| LOW      | Enhancement, not blocking        | Nice-to-have |

---

## Code Review Checklist

### Top 10 Accessibility Rules

Use this checklist for manual accessibility review:

#### 1. Alt Text for Images (CRITICAL - WCAG 1.1.1)

**Bad:**

```html
<img src="/logo.png" />
<!-- Missing alt text - screen readers can't describe image -->
```

**Good:**

```html
<img src="/logo.png" alt="Company Logo" />
<!-- Descriptive alt text -->

<!-- For decorative images -->
<img src="/decoration.png" alt="" />
<!-- Empty alt for decorative images -->
```

**Impact:** Enables screen reader users to understand images.

---

#### 2. Color Contrast (CRITICAL - WCAG 1.4.3)

**Bad:**

```css
.text {
  color: #999; /* Light gray */
  background-color: #fff; /* White */
  /* Contrast ratio: 2.8:1 - FAILS WCAG */
}
```

**Good:**

```css
.text {
  color: #595959; /* Darker gray */
  background-color: #fff; /* White */
  /* Contrast ratio: 4.6:1 - PASSES WCAG AA */
}
```

**Requirement:**

- Normal text: 4.5:1 minimum
- Large text (18pt+): 3:1 minimum

**Tools:**

- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Chrome DevTools Accessibility Panel

---

#### 3. Form Labels (CRITICAL - WCAG 3.3.2)

**Bad:**

```html
<input type="email" placeholder="Enter email" />
<!-- No label - screen readers can't identify field -->
```

**Good:**

```html
<label for="email">Email Address</label>
<input type="email" id="email" placeholder="you@example.com" />
<!-- Explicit label association -->
```

**Alternative (Implicit):**

```html
<label>
  Email Address
  <input type="email" placeholder="you@example.com" />
</label>
```

**Impact:** Screen readers can announce field purpose.

---

#### 4. Skip to Main Content (HIGH - WCAG 2.4.1)

**Bad:**

```html
<body>
  <header>
    <nav>
      <!-- 50 navigation links -->
    </nav>
  </header>
  <main>
    <!-- Main content -->
  </main>
</body>
<!-- No skip link - keyboard users must tab through all nav links -->
```

**Good:**

```html
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <header>
    <nav>
      <!-- 50 navigation links -->
    </nav>
  </header>
  <main id="main">
    <!-- Main content -->
  </main>
</body>

<style>
  .skip-link {
    position: absolute;
    left: -9999px; /* Offscreen */
  }
  .skip-link:focus {
    left: 0; /* Visible on focus */
  }
</style>
```

**Impact:** Keyboard users can skip repetitive navigation.

---

#### 5. Focus Indicators (HIGH - WCAG 2.4.7)

**Bad:**

```css
button:focus {
  outline: none; /* Removes focus indicator - ACCESSIBILITY VIOLATION */
}
```

**Good:**

```css
button:focus-visible {
  outline: 2px solid #0070f3; /* Custom focus indicator */
  outline-offset: 2px;
}
```

**Impact:** Keyboard users can see which element has focus.

---

#### 6. Responsive Images (HIGH - WCAG 1.4.10)

**Bad:**

```html
<img src="/image.jpg" width="800" height="600" />
<!-- Fixed size - doesn't scale on mobile -->
```

**Good:**

```html
<img src="/image.jpg" alt="Description" style="max-width: 100%; height: auto;" />
<!-- Responsive image -->
```

**Better (Next.js):**

```typescript
import Image from 'next/image';

<Image src="/image.jpg" alt="Description" width={800} height={600} />
<!-- Automatically responsive and optimized -->
```

**Impact:** Images don't overflow on small screens.

---

#### 7. Semantic HTML (MEDIUM - WCAG 1.3.1)

**Bad:**

```html
<div class="header">
  <div class="nav">
    <div class="link">Home</div>
  </div>
</div>
<div class="main">
  <div class="article">Content</div>
</div>
<!-- Non-semantic - screen readers can't identify structure -->
```

**Good:**

```html
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>
<main>
  <article>Content</article>
</main>
<!-- Semantic - screen readers can navigate by landmarks -->
```

**Impact:** Screen readers can navigate by landmarks (header, nav, main, etc.).

---

#### 8. ARIA Labels (MEDIUM - WCAG 4.1.2)

**Bad:**

```html
<button>
  <svg><!-- Icon --></svg>
</button>
<!-- No accessible name - screen readers read "button" -->
```

**Good:**

```html
<button aria-label="Close dialog">
  <svg><!-- Close icon --></svg>
</button>
<!-- Screen readers read "Close dialog button" -->
```

**Alternative:**

```html
<button>
  <svg aria-hidden="true"><!-- Icon --></svg>
  <span class="sr-only">Close dialog</span>
</button>

<style>
  .sr-only {
    position: absolute;
    left: -9999px;
  }
</style>
```

**Impact:** Screen readers can announce button purpose.

---

#### 9. Dark Mode Support (MEDIUM)

**Bad:**

```css
.card {
  background-color: #fff; /* White only - no dark mode */
  color: #000;
}
```

**Good (CSS Variables):**

```css
:root {
  --bg-color: #fff;
  --text-color: #000;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-color: #1a1a1a;
    --text-color: #fff;
  }
}

.card {
  background-color: var(--bg-color);
  color: var(--text-color);
}
```

**Better (Next.js + Tailwind):**

```typescript
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Content
</div>
```

**Impact:** Supports user preference for dark mode.

---

#### 10. RTL (Right-to-Left) Support (MEDIUM)

**Bad:**

```css
.container {
  margin-left: 20px; /* Hardcoded left margin */
}
```

**Good (Logical Properties):**

```css
.container {
  margin-inline-start: 20px; /* Works for LTR and RTL */
}
```

**JavaScript Support:**

```html
<html dir="rtl" lang="ar">
  <!-- Arabic - right-to-left -->
</html>
```

**Impact:** Supports languages that read right-to-left (Arabic, Hebrew).

---

## Real-World Examples

### Before/After: Accessibility Audit

**Before (14 violations):**

```html
<div class="header">
  <div class="nav">
    <div onclick="navigate()">Home</div>
  </div>
</div>
<div class="main">
  <img src="/hero.jpg" />
  <form>
    <input type="email" placeholder="Email" />
    <button style="outline: none;">Submit</button>
  </form>
</div>
```

**Violations:**

1. Non-semantic HTML (div instead of header/nav)
2. Missing alt text on image
3. Missing form label
4. Focus indicator removed
5. Button not keyboard accessible (onclick on div)

**After (0 violations):**

```html
<header>
  <nav>
    <a href="/">Home</a>
  </nav>
</header>
<main>
  <img src="/hero.jpg" alt="Hero image showing product features" />
  <form>
    <label for="email">Email Address</label>
    <input type="email" id="email" placeholder="you@example.com" />
    <button>Submit</button>
  </form>
</main>

<style>
  button:focus-visible {
    outline: 2px solid #0070f3;
  }
</style>
```

**Impact:** Full WCAG 2.1 Level AA compliance.

---

### Before/After: Dark Mode Support

**Before (No dark mode):**

```css
.card {
  background-color: #fff;
  color: #000;
  border: 1px solid #ccc;
}
```

**After (Dark mode support):**

```css
:root {
  --card-bg: #fff;
  --card-text: #000;
  --card-border: #ccc;
}

@media (prefers-color-scheme: dark) {
  :root {
    --card-bg: #1a1a1a;
    --card-text: #fff;
    --card-border: #333;
  }
}

.card {
  background-color: var(--card-bg);
  color: var(--card-text);
  border: 1px solid var(--card-border);
}
```

**Impact:** Supports user preference for dark mode.

---

## Performance Impact

**Execution time:** ~1000-2000ms (includes network fetch)

**Network requirement:** Yes (fetches guidelines from vercel.com)

**Caching:** Guidelines are cached for performance

---

## Categories Covered

### 1. Accessibility (WCAG 2.1 Level AA)

- Alt text for images (1.1.1)
- Color contrast (1.4.3)
- Form labels (3.3.2)
- Skip to main content (2.4.1)
- Focus indicators (2.4.7)
- Responsive images (1.4.10)
- Semantic HTML (1.3.1)
- ARIA labels (4.1.2)
- Keyboard navigation (2.1.1)
- Error messages (3.3.1)

### 2. Forms

- Label association
- Error handling
- Required fields
- Input validation
- Autocomplete attributes
- Field grouping (fieldset/legend)

### 3. Images

- Alt text
- Responsive images
- Lazy loading
- Image optimization
- Decorative images (empty alt)

### 4. Typography

- Font size (16px minimum)
- Line height (1.5 minimum)
- Line length (80 characters maximum)
- Font contrast

### 5. Dark Mode

- CSS variables
- prefers-color-scheme media query
- Dark color palette
- Contrast in dark mode

### 6. Internationalization (i18n)

- RTL support (logical properties)
- Language attribute (lang)
- Text direction (dir)
- Date/time formatting

### 7. Touch Optimization

- Touch target size (44x44px minimum)
- Touch spacing
- Tap highlight
- Touch gestures

---

## Combined with Other Skills

### Pattern 1: Full UI Review

```javascript
// Step 1: Architecture review
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Performance optimization
Skill({ skill: 'vercel-react-best-practices' });

// Step 3: Accessibility audit
Skill({ skill: 'vercel-web-design-guidelines' });
```

**Result:** Well-architected, performant, and accessible UI.

---

### Pattern 2: Pre-Deployment Checklist

```javascript
// Check accessibility before deployment
Skill({ skill: 'vercel-web-design-guidelines' });

// Deploy if no critical issues
Skill({ skill: 'vercel-deploy' });
```

**Result:** Only deploy accessible websites.

---

## Troubleshooting

### Issue: Network Timeout

**Problem:** `Error: Network timeout fetching guidelines`

**Solution:**

1. Check internet connection
2. Retry after delay
3. Use cached version if available

---

### Issue: False Positive Color Contrast

**Problem:** Contrast checker flags valid contrast.

**Solution:**

- Use WebAIM Contrast Checker to verify
- Check if gradients or overlays affecting contrast
- Test with actual screen readers

---

### Issue: Too Many Violations

**Problem:** 50+ violations on initial audit.

**Solution:**

1. Fix CRITICAL issues first (alt text, labels, contrast)
2. Fix HIGH issues next (skip link, focus indicators)
3. Fix MEDIUM issues when time allows
4. LOW issues are enhancements

**Priority order:**

1. CRITICAL - Blocks access
2. HIGH - Significant barrier
3. MEDIUM - Minor issue
4. LOW - Enhancement

---

## Testing Tools

### 1. axe DevTools (Browser Extension)

**Install:**

- Chrome: https://chrome.google.com/webstore (search "axe DevTools")
- Firefox: https://addons.mozilla.org/en-US/firefox/ (search "axe DevTools")

**Features:**

- Automated accessibility testing
- WCAG 2.1 compliance checks
- Detailed violation reports

### 2. Lighthouse (Chrome DevTools)

**Run:**

1. Open Chrome DevTools (F12)
2. Go to Lighthouse tab
3. Select "Accessibility" category
4. Click "Generate report"

**Metrics:**

- Accessibility score (target: 100)
- Violations by severity
- Manual checks required

### 3. Screen Reader Testing

**Recommended screen readers:**

- NVDA (Windows): https://www.nvaccess.org/
- JAWS (Windows): https://www.freedomscientific.com/
- VoiceOver (macOS): Built-in (Cmd + F5)

**Test checklist:**

- Navigate by headings (H key)
- Navigate by landmarks (D key)
- Navigate forms (F key)
- Tab through interactive elements
- Verify alt text is read

---

## Related Documentation

- [Skill Usage Guide](SKILL_USAGE_GUIDE.md) - Overview of all 5 skills
- [React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md) - Performance optimization
- [React Native Skill Guide](REACT_NATIVE_SKILL.md) - Mobile-specific patterns
- [Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md) - Component architecture
- [Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md) - Deployment automation

---

## Conclusion

The Web Design skill provides 100+ dynamic accessibility and design guidelines fetched from Vercel's documentation. Use this skill for accessibility audits, UI review, dark mode support, and internationalization checks.

**Invoke the skill:**

```javascript
Skill({ skill: 'vercel-web-design-guidelines' });
```

**Next steps:**

1. Run accessibility audit on your website
2. Fix CRITICAL issues (alt text, labels, contrast)
3. Fix HIGH issues (skip link, focus indicators)
4. Test with screen readers
5. Run Lighthouse audit for verification
6. Iterate until 100/100 accessibility score
