# Skill Usage Guide

**Complete guide to using the 5 integrated agent skills for React, web design, and deployment automation.**

---

## Overview

This guide covers how to use the five production-ready skills integrated from the archived `agent-skills-main` project:

1. **React Performance** (59 rules) - React/Next.js optimization
2. **React Native** (38 rules) - Mobile-specific best practices
3. **Composition Patterns** (10 rules) - Component architecture patterns
4. **Web Design** (100+ rules) - Accessibility and design guidelines
5. **Vercel Deploy** - Automated deployment for 40+ frameworks

These skills provide domain expertise that agents can invoke during code review, optimization, and deployment tasks.

## What Are Skills?

Skills are reusable capabilities that agents invoke to perform specialized tasks. They encapsulate best practices, workflows, and technical knowledge in a standardized format.

**Key characteristics:**

- **Invoked via `Skill()` tool** - Agents call skills, not just read them
- **Discoverable** - Cataloged for easy lookup
- **Structured** - Consistent format with clear triggers and outputs
- **Production-ready** - Developed by Vercel Labs for real-world use

**426+ skills available** across development, security, DevOps, scientific research, and more.

## Quick Start

### How to Invoke Skills

Agents use the `Skill()` tool to invoke skills:

```javascript
// Invoke React Performance skill
Skill({ skill: 'vercel-react-best-practices' });

// Invoke Web Design skill
Skill({ skill: 'vercel-web-design-guidelines' });

// Invoke Vercel Deploy skill
Skill({ skill: 'vercel-deploy' });
```

**Important:** Just reading the skill file does NOT apply the skill. Agents must use the `Skill()` tool to activate the workflow.

### When to Use Each Skill

| Skill                    | Trigger Scenarios                                                              |
| ------------------------ | ------------------------------------------------------------------------------ |
| **React Performance**    | Code review, optimization, performance issues, bundle size problems            |
| **React Native**         | Mobile optimization, FlatList slow, animation issues, Expo performance         |
| **Composition Patterns** | Component architecture, refactoring, design systems, React 19 API changes      |
| **Web Design**           | Accessibility audits, UI review, WCAG compliance, dark mode, internationalized |
| **Vercel Deploy**        | Deployment automation, CI/CD setup, framework detection, production deploys    |

---

## Skill Inventory

### 1. React Performance (`vercel-react-best-practices`)

**What it does:** Analyzes React/Next.js code for 59 production-ready optimization rules across 8 categories.

**Performance impact:** ~500-1000ms execution time

**Trigger scenarios:**

- "Review this React component for performance"
- "How do I optimize my Next.js bundle"
- "My component re-renders too often"
- "Can you check for performance issues"

**Expected outputs:**

- Rule violations found (sorted by priority: CRITICAL → HIGH → MEDIUM → LOW)
- Severity levels for each violation
- Fix suggestions with code examples
- Performance impact estimates

**Code review checklist:** [See React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md#code-review-checklist)

**Combined with:**

- Composition Patterns (for architectural refactoring)
- Web Design (for UX performance)

---

### 2. React Native (`vercel-react-native-skills`)

**What it does:** Analyzes React Native and Expo code for 38 mobile-specific optimization rules.

**Performance impact:** ~300-500ms execution time

**Trigger scenarios:**

- "My FlatList is slow, how do I optimize"
- "React Native performance issues"
- "Expo app optimization"
- "Mobile animation recommendations"

**Expected outputs:**

- Mobile-specific rule violations
- Platform-specific suggestions (iOS vs Android)
- Memory management recommendations
- Animation performance patterns

**Code review checklist:** [See React Native Skill Guide](REACT_NATIVE_SKILL.md#code-review-checklist)

**Combined with:**

- Composition Patterns (for component design)

---

### 3. Composition Patterns (`vercel-composition-patterns`)

**What it does:** Provides 10 React component composition patterns including React 19 API updates.

**Performance impact:** ~200-300ms execution time

**Trigger scenarios:**

- "Help me refactor my component"
- "How should I structure this component"
- "Component composition best practices"
- "React 19 API changes"

**Expected outputs:**

- Architectural recommendations
- Pattern suggestions (compound components, context patterns, etc.)
- React 19 migration guidance
- Code structure improvements

**Code review checklist:** [See Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md#code-review-checklist)

**Combined with:**

- React Performance (for optimization)
- Web Design (for accessibility)

---

### 4. Web Design (`vercel-web-design-guidelines`)

**What it does:** Provides 100+ dynamic web design and accessibility guidelines fetched from https://vercel.com/docs/ai/rules.

**Performance impact:** ~1000-2000ms (includes network fetch)

**Trigger scenarios:**

- "Audit my website for accessibility"
- "Check my UI for design issues"
- "Is my site WCAG compliant"
- "Design review for dark mode support"

**Expected outputs:**

- Accessibility violations (WCAG 2.1 Level AA)
- Design pattern recommendations
- Dark mode support checks
- Internationalization (i18n) guidelines
- Touch optimization recommendations

**Code review checklist:** [See Web Design Skill Guide](WEB_DESIGN_SKILL.md#code-review-checklist)

**Categories covered:**

- Accessibility
- Forms
- Images
- Typography
- Dark Mode
- Internationalization
- Touch Optimization

**Combined with:**

- React Performance (for component UX)

---

### 5. Vercel Deploy (`vercel-deploy`)

**What it does:** One-command deployment automation for 40+ frameworks with automatic framework detection.

**Performance impact:** ~1000-3000ms (depends on framework and network)

**Trigger scenarios:**

- "Deploy my app to production"
- "How do I push this to Vercel"
- "Set up CI/CD deployment"

**Expected outputs:**

- Framework detection results
- Deployment configuration
- Deployment status
- Environment variable setup guidance

**Supported frameworks:** Next.js, React, Vue, Angular, SvelteKit, Nuxt, Astro, Remix, Solid, Qwik, and 30+ more.

**Code review checklist:** [See Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md#code-review-checklist)

**Combined with:**

- Other skills for pre-deployment optimization

---

## Skill Composition

Combining multiple skills provides comprehensive code review:

### Full Stack Review Pattern

```javascript
// Step 1: Architecture review
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Performance optimization
Skill({ skill: 'vercel-react-best-practices' });

// Step 3: Accessibility audit
Skill({ skill: 'vercel-web-design-guidelines' });

// Step 4: Deploy
Skill({ skill: 'vercel-deploy' });
```

### Mobile App Review Pattern

```javascript
// Step 1: Component architecture
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Mobile optimization
Skill({ skill: 'vercel-react-native-skills' });
```

### Pre-Deployment Checklist Pattern

```javascript
// Step 1: Performance check
Skill({ skill: 'vercel-react-best-practices' });

// Step 2: Accessibility check
Skill({ skill: 'vercel-web-design-guidelines' });

// Step 3: Deploy
Skill({ skill: 'vercel-deploy' });
```

---

## Performance Impact

| Skill                | Execution Time | Network Required | Blocking? |
| -------------------- | -------------- | ---------------- | --------- |
| React Performance    | 500-1000ms     | No               | No        |
| React Native         | 300-500ms      | No               | No        |
| Composition Patterns | 200-300ms      | No               | No        |
| Web Design           | 1000-2000ms    | Yes              | No        |
| Vercel Deploy        | 1000-3000ms    | Yes              | Yes       |

**Note:** Execution times are estimates. Actual time depends on code size and network conditions.

---

## Troubleshooting

### Skill Not Found

**Problem:** `Error: Skill 'vercel-react-best-practices' not found`

**Solution:**

1. Check skill catalog: `cat .claude/context/artifacts/skill-catalog.md`
2. Verify skill name matches catalog entry
3. Check skill exists: `ls .claude/skills/vercel-react-best-practices/`

### Network Timeout (Web Design Skill)

**Problem:** `Error: Network timeout fetching guidelines`

**Solution:**

1. Check internet connection
2. Retry after delay
3. Use cached version if available

### Deployment Failed (Vercel Deploy)

**Problem:** `Error: Deployment failed - framework not detected`

**Solution:**

1. Check framework manifest exists (package.json, etc.)
2. Verify framework is in supported list
3. Manually specify framework if needed

---

## Best Practices

### 1. Invoke Skills Early

Invoke skills during code review and planning, not just at deployment.

```javascript
// GOOD: Review before implementation
Skill({ skill: 'vercel-composition-patterns' });
// ... implement with pattern guidance ...

// BAD: Review after implementation
// ... implement blindly ...
Skill({ skill: 'vercel-react-best-practices' }); // Too late, need refactoring
```

### 2. Combine Skills for Comprehensive Reviews

Use multiple skills together for complete code review.

```javascript
// Comprehensive review
Skill({ skill: 'vercel-composition-patterns' }); // Architecture
Skill({ skill: 'vercel-react-best-practices' }); // Performance
Skill({ skill: 'vercel-web-design-guidelines' }); // Accessibility
```

### 3. Prioritize by Severity

Focus on CRITICAL and HIGH priority violations first.

**Priority order:**

1. CRITICAL - Fix immediately (performance waterfalls, security issues)
2. HIGH - Fix soon (bundle size, re-render optimization)
3. MEDIUM - Fix when time allows (micro-optimizations)
4. LOW - Nice-to-have (advanced patterns)

### 4. Use React 19 Patterns

Composition Patterns skill includes React 19 API changes. Use these patterns for new projects.

### 5. Run Accessibility Audits Before Launch

Always run Web Design skill before production deployment to catch WCAG compliance issues.

---

## Examples

### Example 1: Component Performance Review

```javascript
// User asks: "Review this component for performance"

// Agent invokes skills
Skill({ skill: 'vercel-react-best-practices' });

// Output:
// - Found 3 CRITICAL issues (unnecessary re-renders)
// - Found 2 HIGH issues (bundle size)
// - Suggested fixes with code examples
```

### Example 2: Mobile App Optimization

```javascript
// User asks: "My FlatList is slow"

// Agent invokes skill
Skill({ skill: 'vercel-react-native-skills' });

// Output:
// - FlatList optimization patterns
// - Memory management recommendations
// - Performance measurement guidance
```

### Example 3: Pre-Deployment Checklist

```javascript
// User asks: "Deploy to production"

// Agent runs checklist
Skill({ skill: 'vercel-react-best-practices' }); // Performance check
Skill({ skill: 'vercel-web-design-guidelines' }); // Accessibility check
Skill({ skill: 'vercel-deploy' }); // Deploy

// Output:
// - Performance: PASS (no critical issues)
// - Accessibility: PASS (WCAG 2.1 AA compliant)
// - Deployment: SUCCESS (deployed to production)
```

---

## Related Documentation

- [React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md)
- [React Native Skill Guide](REACT_NATIVE_SKILL.md)
- [Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md)
- [Web Design Skill Guide](WEB_DESIGN_SKILL.md)
- [Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md)
- [Skills System Reference](SKILLS.md)
- [Skill Build System](SKILL_BUILD.md)

---

## Skill Catalog

For complete list of all 426+ available skills, see:

**File:** `.claude/context/artifacts/skill-catalog.md`

**Categories:**

- Core Development (TDD, debugging, testing)
- Security (auth, encryption, security review)
- DevOps (deployment, monitoring, infrastructure)
- Domain Experts (Python, Rust, Go, TypeScript, React, etc.)
- Scientific Research (bioinformatics, cheminformatics, ML)
- Frameworks (Next.js, React Native, SvelteKit, etc.)

**Invoke any skill:** `Skill({ skill: 'skill-name' });`
