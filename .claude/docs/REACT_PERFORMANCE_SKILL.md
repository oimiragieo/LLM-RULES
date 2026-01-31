# React Performance Skill Guide

**Comprehensive guide to the React Performance optimization skill with 59 production-ready rules.**

---

## Overview

The React Performance skill (`vercel-react-best-practices`) analyzes React and Next.js code for 59 optimization rules across 8 categories, developed by Vercel Labs for production use.

**Key features:**

- 59 production-ready optimization rules
- 8 categories from CRITICAL to LOW priority
- Code examples for every rule (bad vs good)
- Performance impact estimates
- React 19 compatible

**Skill invocation:**

```javascript
Skill({ skill: 'vercel-react-best-practices' });
```

---

## What It Does

The skill performs automated code analysis to identify performance issues in React/Next.js applications. It provides:

- Rule violation detection
- Severity classification
- Fix suggestions with code examples
- Performance impact estimates

**Analysis scope:**

- Async patterns and waterfalls
- Bundle size optimization
- Server-side performance
- Client-side data fetching
- Re-render optimization
- Rendering performance
- JavaScript micro-optimizations
- Advanced patterns

---

## Trigger Scenarios

Invoke this skill when:

1. **Code Review**

   - "Review this React component for performance"
   - "Check this code for optimization opportunities"
   - "Can you analyze this Next.js page for performance issues"

2. **Performance Problems**

   - "My component re-renders too often"
   - "The app feels slow, how do I optimize"
   - "Performance is degrading, help me fix it"

3. **Bundle Size Issues**

   - "How do I reduce my Next.js bundle size"
   - "My JavaScript bundle is too large"
   - "Lighthouse shows poor performance score"

4. **Optimization Planning**
   - "What performance optimizations should I prioritize"
   - "How can I make this component faster"
   - "Best practices for React performance"

---

## Expected Outputs

### 1. Rule Violations

The skill identifies violations sorted by priority:

```
CRITICAL (5 violations)
- async-defer-await: Move await into branches
- bundle-barrel-files: Avoid barrel file imports
- ...

HIGH (7 violations)
- server-side-deduplication: Deduplicate fetch requests
- ...

MEDIUM (12 violations)
- rerender-memo: Use React.memo for expensive components
- ...

LOW (9 violations)
- advanced-use-latest: Use useLatest pattern
- ...
```

### 2. Fix Suggestions

For each violation, the skill provides:

- **Problem statement** - What the issue is
- **Bad code example** - Current antipattern
- **Good code example** - Recommended pattern
- **Performance impact** - Expected improvement

### 3. Severity Levels

| Severity   | Impact                           | Fix Priority |
| ---------- | -------------------------------- | ------------ |
| CRITICAL   | Major performance degradation    | Immediate    |
| HIGH       | Significant slowdown             | Soon         |
| MEDIUM     | Noticeable impact under load     | When time    |
| LOW        | Marginal gains, advanced pattern | Nice-to-have |

---

## Code Review Checklist

### Top 10 Most Important Rules

Use this checklist for manual code review:

#### 1. Move `await` Into Branches (CRITICAL)

**Bad:**

```typescript
async function getData() {
  const data = await fetchData(); // Always awaits, even if not needed
  if (condition) {
    return data;
  }
  return null;
}
```

**Good:**

```typescript
async function getData() {
  if (condition) {
    const data = await fetchData(); // Only await when needed
    return data;
  }
  return null;
}
```

**Impact:** Eliminates unnecessary async operations.

---

#### 2. Avoid Barrel File Imports (CRITICAL)

**Bad:**

```typescript
import { Button } from '@/components'; // Barrel file - imports entire module
```

**Good:**

```typescript
import { Button } from '@/components/Button'; // Direct import - tree-shakeable
```

**Impact:** Reduces bundle size by 20-50% in large apps.

---

#### 3. Use `React.cache()` for Server Components (HIGH)

**Bad:**

```typescript
// No deduplication - multiple fetches
export async function Page1() {
  const data = await fetch('/api/data');
}
export async function Page2() {
  const data = await fetch('/api/data'); // Duplicate fetch
}
```

**Good:**

```typescript
import { cache } from 'react';

const getData = cache(async () => {
  return await fetch('/api/data');
});

export async function Page1() {
  const data = await getData(); // Cached
}
export async function Page2() {
  const data = await getData(); // Uses cache
}
```

**Impact:** Eliminates duplicate server requests.

---

#### 4. Use `Promise.all()` for Parallel Fetching (CRITICAL)

**Bad:**

```typescript
const user = await fetchUser();
const posts = await fetchPosts(); // Sequential - slow
```

**Good:**

```typescript
const [user, posts] = await Promise.all([
  fetchUser(),
  fetchPosts(), // Parallel - fast
]);
```

**Impact:** Reduces latency by 50-80% for parallel operations.

---

#### 5. Use `React.memo()` for Expensive Components (MEDIUM)

**Bad:**

```typescript
function ExpensiveComponent({ data }) {
  // Re-renders on every parent update
  return <ComplexVisualization data={data} />;
}
```

**Good:**

```typescript
const ExpensiveComponent = React.memo(function ({ data }) {
  // Only re-renders when data changes
  return <ComplexVisualization data={data} />;
});
```

**Impact:** Prevents unnecessary re-renders.

---

#### 6. Lazy Load Components (CRITICAL)

**Bad:**

```typescript
import HeavyChart from './HeavyChart'; // Always in bundle

function Dashboard() {
  return showChart ? <HeavyChart /> : null;
}
```

**Good:**

```typescript
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./HeavyChart'), { loading: () => <Spinner /> });

function Dashboard() {
  return showChart ? <HeavyChart /> : null;
}
```

**Impact:** Reduces initial bundle size by 30-60%.

---

#### 7. Deduplicate SWR/React Query Requests (MEDIUM-HIGH)

**Bad:**

```typescript
function Component1() {
  const { data } = useSWR('/api/data', fetcher); // Fetch 1
}
function Component2() {
  const { data } = useSWR('/api/data', fetcher); // Duplicate fetch
}
```

**Good:**

```typescript
// SWR automatically deduplicates - but verify config
const swrConfig = {
  dedupingInterval: 2000, // Dedupe requests within 2 seconds
};
```

**Impact:** Reduces network requests by 50-90%.

---

#### 8. Avoid Inline Function Definitions (MEDIUM)

**Bad:**

```typescript
function Parent() {
  return <Child onClick={() => console.log('click')} />; // New function every render
}
```

**Good:**

```typescript
function Parent() {
  const handleClick = useCallback(() => console.log('click'), []);
  return <Child onClick={handleClick} />; // Stable reference
}
```

**Impact:** Prevents child component re-renders.

---

#### 9. Use `content-visibility: auto` for Long Lists (MEDIUM)

**Bad:**

```css
.list-item {
  /* No optimization */
}
```

**Good:**

```css
.list-item {
  content-visibility: auto; /* Browser skips offscreen rendering */
  contain-intrinsic-size: 500px; /* Estimate height */
}
```

**Impact:** 30-50% faster initial render for long lists.

---

#### 10. Optimize SVG Size (MEDIUM)

**Bad:**

```typescript
<svg>
  <!-- Lots of unnecessary metadata and precision -->
</svg>
```

**Good:**

```bash
# Use SVGO to optimize
npx svgo input.svg -o output.svg
```

**Impact:** Reduces SVG size by 30-80%.

---

## Real-World Examples

### Before/After: Bundle Size Optimization

**Before (2.5 MB bundle):**

```typescript
import { Button, Card, Modal, Tooltip } from '@/components'; // Barrel import
import _ from 'lodash'; // Full lodash
import moment from 'moment'; // Full moment
```

**After (800 KB bundle):**

```typescript
import { Button } from '@/components/Button'; // Direct imports
import debounce from 'lodash/debounce'; // Specific lodash function
import { format } from 'date-fns'; // Lighter alternative to moment
```

**Impact:** Bundle reduced by 68% (2.5 MB → 800 KB).

---

### Before/After: Re-render Optimization

**Before (100+ re-renders):**

```typescript
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <Child onClick={() => setCount(count + 1)} />
      {/* Child re-renders on every Parent update */}
    </div>
  );
}
```

**After (2 re-renders):**

```typescript
function Parent() {
  const [count, setCount] = useState(0);
  const handleClick = useCallback(() => setCount((c) => c + 1), []);
  return (
    <div>
      <MemoizedChild onClick={handleClick} />
      {/* Child only re-renders when handleClick changes (never) */}
    </div>
  );
}

const MemoizedChild = React.memo(Child);
```

**Impact:** Reduced re-renders by 98% (100+ → 2).

---

### Before/After: Async Waterfall Elimination

**Before (1200ms total):**

```typescript
async function loadData() {
  const user = await fetchUser(); // 400ms
  const posts = await fetchPosts(user.id); // 400ms (waits for user)
  const comments = await fetchComments(posts[0].id); // 400ms (waits for posts)
  // Total: 1200ms sequential
}
```

**After (400ms total):**

```typescript
async function loadData() {
  const user = await fetchUser(); // 400ms
  const [posts, profile] = await Promise.all([
    fetchPosts(user.id), // Parallel
    fetchProfile(user.id), // Parallel
  ]);
  // Total: 400ms (parallelized)
}
```

**Impact:** Reduced load time by 67% (1200ms → 400ms).

---

## Performance Impact Estimates

| Category                       | Rules | Expected Improvement          |
| ------------------------------ | ----- | ----------------------------- |
| Eliminating Waterfalls         | 5     | 50-80% faster page loads      |
| Bundle Size Optimization       | 5     | 30-60% smaller bundles        |
| Server-Side Performance        | 7     | 40-70% fewer server requests  |
| Client-Side Data Fetching      | 4     | 50-90% fewer duplicate fetches|
| Re-render Optimization         | 12    | 60-95% fewer re-renders       |
| Rendering Performance          | 9     | 20-50% faster initial render  |
| JavaScript Micro-Optimizations | 8     | 5-15% faster execution        |
| Advanced Patterns              | 9     | 10-30% edge case improvements |

**Note:** Improvements vary based on application complexity and existing optimization level.

---

## Combined with Other Skills

### Pattern 1: Full Performance Review

```javascript
// Step 1: Architecture review
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Performance optimization
Skill({ skill: 'vercel-react-best-practices' });

// Step 3: Accessibility audit
Skill({ skill: 'vercel-web-design-guidelines' });
```

**Result:** Comprehensive code review covering architecture, performance, and accessibility.

---

### Pattern 2: Pre-Deployment Checklist

```javascript
// Check performance before deployment
Skill({ skill: 'vercel-react-best-practices' });

// Deploy if no critical issues
Skill({ skill: 'vercel-deploy' });
```

**Result:** Only deploy code that passes performance checks.

---

## Troubleshooting

### Issue: Too Many Low Priority Violations

**Solution:** Focus on CRITICAL and HIGH priority first. Low priority rules are advanced optimizations that provide marginal gains.

**Priority order:**

1. CRITICAL - Fix immediately
2. HIGH - Fix soon
3. MEDIUM - Fix when time allows
4. LOW - Nice-to-have

---

### Issue: False Positives

**Solution:** Some rules may flag intentional patterns. Use judgment to decide if a violation is valid.

**Example:**

```typescript
// Flagged: "Avoid inline functions"
<Button onClick={() => track('click')} />

// May be acceptable if:
// 1. Button rarely re-renders
// 2. Tracking is essential
// 3. Performance impact is negligible
```

---

### Issue: Conflicting Rules

**Solution:** Prioritize by impact. If two rules conflict, choose the one with higher severity.

**Example:**

- Rule A (CRITICAL): Use `Promise.all()` for parallel fetching
- Rule B (LOW): Avoid Promise.all() for error handling

**Resolution:** Use `Promise.all()` (CRITICAL wins).

---

## Related Documentation

- [Skill Usage Guide](SKILL_USAGE_GUIDE.md) - Overview of all 5 skills
- [React Native Skill Guide](REACT_NATIVE_SKILL.md) - Mobile-specific optimization
- [Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md) - Component architecture
- [Web Design Skill Guide](WEB_DESIGN_SKILL.md) - Accessibility and design
- [Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md) - Deployment automation
- [Skill Build System](SKILL_BUILD.md) - Skill compilation and validation

---

## Rule Categories

### 1. Eliminating Waterfalls (5 rules, CRITICAL)

- Move `await` into branches
- Use `Promise.all()` for parallel fetching
- Defer await in API routes
- Optimize async middleware
- Eliminate sequential data dependencies

### 2. Bundle Size Optimization (5 rules, CRITICAL)

- Avoid barrel file imports
- Use dynamic imports
- Lazy load components
- Tree-shake lodash
- Optimize moment.js (use date-fns)

### 3. Server-Side Performance (7 rules, HIGH)

- Use `React.cache()` for deduplication
- Parallel data fetching in Server Components
- Cache database queries
- Optimize API routes
- Use ISR for static content
- Deduplicate fetch requests
- Optimize middleware

### 4. Client-Side Data Fetching (4 rules, MEDIUM-HIGH)

- Use SWR/React Query for deduplication
- Cache API responses
- Prefetch data on hover
- Use optimistic updates

### 5. Re-render Optimization (12 rules, MEDIUM)

- Use `React.memo()` for expensive components
- Use `useCallback()` for stable callbacks
- Use `useMemo()` for expensive calculations
- Avoid inline functions
- Lift state up
- Split components
- Use context carefully
- Avoid anonymous functions in JSX
- Use key prop correctly
- Avoid unnecessary state
- Batch state updates
- Use refs for non-rendering values

### 6. Rendering Performance (9 rules, MEDIUM)

- Optimize SVG size
- Use `content-visibility: auto`
- Defer non-critical CSS
- Optimize images (next/image)
- Use virtualization for long lists
- Avoid layout thrashing
- Use CSS containment
- Optimize font loading
- Lazy load below-the-fold content

### 7. JavaScript Micro-Optimizations (8 rules, LOW-MEDIUM)

- Batch DOM updates
- Cache function results
- Avoid `Function.bind()` in render
- Use `requestAnimationFrame()` for animations
- Debounce/throttle event handlers
- Avoid unnecessary array methods
- Use Set/Map for lookups
- Avoid string concatenation in loops

### 8. Advanced Patterns (9 rules, LOW)

- Use `useLatest()` pattern
- Use `useLayoutEffect()` carefully
- Use `useRef()` for mutable values
- Avoid `useEffect()` for derived state
- Use `useTransition()` for non-urgent updates (React 18+)
- Use `useDeferredValue()` for debouncing (React 18+)
- Use `startTransition()` for large updates (React 18+)
- Optimize `useContext()` re-renders
- Use `useId()` for SSR-safe IDs (React 18+)

---

## Performance Measurement

After applying fixes, measure improvements using:

### 1. Lighthouse (Chrome DevTools)

```bash
# Run Lighthouse audit
npm run build
npm run start
# Open Chrome DevTools -> Lighthouse -> Generate report
```

**Metrics:**

- Performance score (target: 90+)
- First Contentful Paint (target: <1.8s)
- Time to Interactive (target: <3.8s)
- Total Blocking Time (target: <200ms)
- Cumulative Layout Shift (target: <0.1)

### 2. Next.js Bundle Analyzer

```bash
npm install @next/bundle-analyzer
```

**Config:**

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({});
```

**Run:**

```bash
ANALYZE=true npm run build
```

### 3. React DevTools Profiler

Record component re-renders and identify performance bottlenecks.

**Steps:**

1. Open React DevTools
2. Go to Profiler tab
3. Click Record
4. Interact with app
5. Stop recording
6. Analyze flame graph

---

## Conclusion

The React Performance skill provides 59 production-ready optimization rules developed by Vercel Labs. Use this skill for code review, performance optimization, and pre-deployment checks to ensure your React/Next.js applications run fast and efficiently.

**Invoke the skill:**

```javascript
Skill({ skill: 'vercel-react-best-practices' });
```

**Next steps:**

1. Run skill on your codebase
2. Fix CRITICAL issues immediately
3. Fix HIGH issues soon
4. Measure improvements with Lighthouse
5. Iterate until performance targets met
