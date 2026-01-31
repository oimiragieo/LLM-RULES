# Composition Patterns Skill Guide

**Comprehensive guide to the React Composition Patterns skill with 10 architectural patterns including React 19 updates.**

---

## Overview

The Composition Patterns skill (`vercel-composition-patterns`) provides 10 React component composition patterns for building scalable, maintainable component architectures. Includes React 19 API changes and migration guidance.

**Key features:**

- 10 composition patterns for component architecture
- React 19 API updates and migration guidance
- Compound components, context patterns, hooks patterns
- Design system foundations
- Scalability best practices

**Skill invocation:**

```javascript
Skill({ skill: 'vercel-composition-patterns' });
```

---

## What It Does

The skill provides architectural recommendations for structuring React components. It teaches:

- Compound component patterns
- Context-based composition
- Hooks-based patterns
- Render props and HOCs (when to use)
- Design system patterns
- React 19 API changes

**Analysis scope:**

- Component architecture
- State management patterns
- Composition vs inheritance
- Design system foundations
- API migration (React 18 → 19)

---

## Trigger Scenarios

Invoke this skill when:

1. **Component Refactoring**

   - "Help me refactor my component"
   - "How should I structure this component"
   - "Component is too complex, how do I simplify"

2. **Architecture Planning**

   - "Component composition best practices"
   - "How do I build a design system"
   - "Scalable component architecture"

3. **React 19 Migration**

   - "React 19 API changes"
   - "How do I migrate to React 19"
   - "What's new in React 19"

4. **Design Patterns**
   - "Should I use render props or hooks"
   - "Compound component pattern examples"
   - "Context vs prop drilling"

---

## Expected Outputs

### 1. Architectural Recommendations

The skill provides pattern suggestions based on use case:

```
Pattern Recommendation: Compound Components
- Use for: Complex components with multiple parts
- Benefits: Flexible API, controlled composition
- Example: <Select>, <Tabs>, <Accordion>

Pattern Recommendation: Context-based Composition
- Use for: Deeply nested state sharing
- Benefits: Eliminates prop drilling
- Example: Theme, Auth, Configuration
```

### 2. Code Examples

For each pattern, the skill provides:

- **Use case** - When to apply the pattern
- **Implementation** - How to implement the pattern
- **Benefits** - Why this pattern is better
- **Trade-offs** - Downsides to consider

### 3. React 19 Migration Guidance

| API Change               | React 18                | React 19                        |
| ------------------------ | ----------------------- | ------------------------------- |
| `ReactDOM.render()`      | Deprecated              | Use `createRoot()`              |
| `useId()`                | Optional                | Recommended for SSR-safe IDs    |
| `useTransition()`        | Optional                | Better support                  |
| `useDeferredValue()`     | Optional                | Better support                  |
| `<Suspense>`             | Limited                 | Full support                    |
| Server Components        | Not available           | Available (Next.js 13+)         |
| `use()` hook             | Not available           | New hook for promises/context   |

---

## Code Review Checklist

### Top 10 Composition Patterns

Use this checklist for architectural review:

#### 1. Compound Components (RECOMMENDED)

**Use case:** Complex components with multiple related parts.

**Example: Tabs Component**

**Bad (Flat API):**

```typescript
<Tabs
  tabs={[
    { label: 'Tab 1', content: <div>Content 1</div> },
    { label: 'Tab 2', content: <div>Content 2</div> },
  ]}
/>
// Inflexible, hard to customize
```

**Good (Compound):**

```typescript
<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
// Flexible, composable, customizable
```

**Benefits:**

- Flexible API
- Easy to extend
- Clear composition

**Implementation:**

```typescript
const TabsContext = createContext(null);

function Tabs({ children, defaultValue }) {
  const [activeTab, setActiveTab] = useState(defaultValue);
  return <TabsContext.Provider value={{ activeTab, setActiveTab }}>{children}</TabsContext.Provider>;
}

function TabsTrigger({ value, children }) {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  return (
    <button onClick={() => setActiveTab(value)} aria-selected={activeTab === value}>
      {children}
    </button>
  );
}

function TabsContent({ value, children }) {
  const { activeTab } = useContext(TabsContext);
  return activeTab === value ? <div>{children}</div> : null;
}
```

---

#### 2. Context-Based Composition (RECOMMENDED)

**Use case:** Sharing state across deeply nested components without prop drilling.

**Bad (Prop Drilling):**

```typescript
function App() {
  const [theme, setTheme] = useState('light');
  return <Header theme={theme} setTheme={setTheme} />;
}

function Header({ theme, setTheme }) {
  return <Nav theme={theme} setTheme={setTheme} />;
}

function Nav({ theme, setTheme }) {
  return <ThemeToggle theme={theme} setTheme={setTheme} />;
}
// Drilling props through 3 levels
```

**Good (Context):**

```typescript
const ThemeContext = createContext(null);

function App() {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <Header />
    </ThemeContext.Provider>
  );
}

function Header() {
  return <Nav />;
}

function Nav() {
  return <ThemeToggle />;
}

function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme}</button>;
}
```

**Benefits:**

- Eliminates prop drilling
- Clear data flow
- Easy to refactor

---

#### 3. Hooks-Based Patterns (RECOMMENDED)

**Use case:** Reusable stateful logic across components.

**Example: `useToggle` Hook**

**Bad (Duplicated Logic):**

```typescript
function Component1() {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen(!isOpen);
  // Duplicated in every component
}

function Component2() {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen(!isOpen);
  // Duplicated again
}
```

**Good (Custom Hook):**

```typescript
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

function Component1() {
  const [isOpen, toggle] = useToggle();
  // Reusable logic
}

function Component2() {
  const [isOpen, toggle] = useToggle();
  // Same logic, no duplication
}
```

**Benefits:**

- Reusable logic
- No duplication
- Easy to test

---

#### 4. Render Props (LEGACY - Use Hooks)

**Use case:** Sharing logic between components (pre-hooks era).

**Migration: Render Props → Hooks**

**Old (Render Props):**

```typescript
<MouseTracker render={(position) => <div>Mouse: {position.x}, {position.y}</div>} />
```

**New (Custom Hook):**

```typescript
function useMouse() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMove = (e) => setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);
  return position;
}

function Component() {
  const position = useMouse();
  return <div>Mouse: {position.x}, {position.y}</div>;
}
```

**Recommendation:** Prefer hooks over render props for new code.

---

#### 5. Higher-Order Components (LEGACY - Use Hooks)

**Use case:** Wrapping components with additional logic (pre-hooks era).

**Migration: HOC → Hooks**

**Old (HOC):**

```typescript
const withAuth = (Component) => {
  return (props) => {
    const user = useAuth(); // Can't use hooks in HOC
    return user ? <Component {...props} /> : <Login />;
  };
};
```

**New (Custom Hook):**

```typescript
function useRequireAuth() {
  const user = useAuth();
  if (!user) {
    return <Login />;
  }
  return user;
}

function ProtectedComponent() {
  const user = useRequireAuth();
  if (user === null) return null; // Handle loading
  return <div>Protected content</div>;
}
```

**Recommendation:** Prefer hooks over HOCs for new code.

---

#### 6. Controlled vs Uncontrolled Components

**Use case:** Managing form state.

**Uncontrolled (Internal State):**

```typescript
function UncontrolledInput() {
  const inputRef = useRef(null);
  const handleSubmit = () => {
    console.log(inputRef.current.value); // Read DOM directly
  };
  return <input ref={inputRef} defaultValue="initial" />;
}
```

**Controlled (External State):**

```typescript
function ControlledInput() {
  const [value, setValue] = useState('initial');
  const handleSubmit = () => {
    console.log(value); // Read from state
  };
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}
```

**Recommendation:**

- Use **controlled** for forms with validation
- Use **uncontrolled** for simple forms

---

#### 7. Composition Over Inheritance

**Use case:** Building flexible components.

**Bad (Inheritance):**

```typescript
class Button extends Component {}
class PrimaryButton extends Button {} // Fragile hierarchy
class SecondaryButton extends Button {}
```

**Good (Composition):**

```typescript
function Button({ variant = 'primary', children }) {
  const styles = {
    primary: 'bg-blue-500',
    secondary: 'bg-gray-500',
  };
  return <button className={styles[variant]}>{children}</button>;
}

<Button variant="primary">Click</Button>
<Button variant="secondary">Cancel</Button>
```

**Recommendation:** Always prefer composition over inheritance in React.

---

#### 8. React 19: `use()` Hook

**Use case:** Reading promises and context in components (React 19+).

**React 18:**

```typescript
function Component() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData().then(setData);
  }, []);
  if (!data) return <Loading />;
  return <div>{data}</div>;
}
```

**React 19:**

```typescript
import { use } from 'react';

function Component() {
  const data = use(fetchData()); // Suspends automatically
  return <div>{data}</div>;
}
```

**Benefits:**

- Simpler code
- Automatic suspense
- Better error handling

---

#### 9. React 19: Server Components

**Use case:** Data fetching on the server (Next.js 13+).

**Client Component (React 18):**

```typescript
'use client';
function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/data').then((res) => res.json()).then(setData);
  }, []);
  return <div>{data}</div>;
}
```

**Server Component (React 19):**

```typescript
async function Page() {
  const data = await fetch('/api/data').then((res) => res.json());
  return <div>{data}</div>;
}
```

**Benefits:**

- Faster initial load
- No client-side hydration
- SEO-friendly

---

#### 10. Design System Foundations

**Use case:** Building reusable component libraries.

**Pattern:**

```typescript
// 1. Design tokens
const tokens = {
  colors: {
    primary: '#0070f3',
    secondary: '#7928ca',
  },
  spacing: {
    sm: '8px',
    md: '16px',
    lg: '24px',
  },
};

// 2. Base components
function Button({ variant = 'primary', size = 'md', children }) {
  const styles = {
    backgroundColor: tokens.colors[variant],
    padding: tokens.spacing[size],
  };
  return <button style={styles}>{children}</button>;
}

// 3. Composed components
function Card({ children }) {
  return (
    <div style={{ padding: tokens.spacing.md }}>
      {children}
    </div>
  );
}

function CardHeader({ children }) {
  return <h2 style={{ marginBottom: tokens.spacing.sm }}>{children}</h2>;
}

// Usage
<Card>
  <CardHeader>Title</CardHeader>
  <p>Content</p>
  <Button variant="primary" size="md">Action</Button>
</Card>
```

---

## React 19 Highlights

### Key API Changes

| Feature                 | Status      | Description                                  |
| ----------------------- | ----------- | -------------------------------------------- |
| `use()` hook            | New         | Read promises and context                    |
| Server Components       | Stable      | Data fetching on server                      |
| `<Suspense>`            | Improved    | Better fallback handling                     |
| `useTransition()`       | Improved    | Better concurrent rendering                  |
| `useDeferredValue()`    | Improved    | Better deferred updates                      |
| `useId()`               | Recommended | SSR-safe unique IDs                          |
| `ReactDOM.render()`     | Removed     | Use `createRoot()` instead                   |
| `ReactDOM.hydrate()`    | Removed     | Use `hydrateRoot()` instead                  |

### Migration Guide

#### 1. Update ReactDOM API

**React 18:**

```typescript
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));
```

**React 19:**

```typescript
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

#### 2. Use `use()` Hook for Promises

**React 18:**

```typescript
function Component() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData().then(setData);
  }, []);
}
```

**React 19:**

```typescript
import { use } from 'react';
function Component() {
  const data = use(fetchData()); // Simpler
}
```

#### 3. Migrate to Server Components

**React 18:**

```typescript
'use client';
function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api').then(setData);
  }, []);
}
```

**React 19:**

```typescript
async function Page() {
  const data = await fetch('/api').then((res) => res.json());
  return <div>{data}</div>;
}
```

---

## Performance Impact

| Pattern                  | Performance Impact                     |
| ------------------------ | -------------------------------------- |
| Compound Components      | Neutral (architecture benefit)         |
| Context-based Composition| Can cause re-renders (optimize context)|
| Hooks-based Patterns     | Positive (reduces duplication)         |
| Render Props             | Negative (use hooks instead)           |
| HOCs                     | Negative (use hooks instead)           |
| Server Components        | Positive (faster initial load)         |
| `use()` hook             | Positive (simpler suspense)            |

**Recommendation:** Use modern patterns (hooks, server components) for best performance.

---

## Combined with Other Skills

### Pattern 1: Architecture + Performance

```javascript
// Step 1: Architecture review
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Performance optimization
Skill({ skill: 'vercel-react-best-practices' });
```

**Result:** Well-architected and performant components.

---

### Pattern 2: Architecture + Accessibility

```javascript
// Step 1: Architecture review
Skill({ skill: 'vercel-composition-patterns' });

// Step 2: Accessibility audit
Skill({ skill: 'vercel-web-design-guidelines' });
```

**Result:** Well-architected and accessible components.

---

## Troubleshooting

### Issue: Context Causing Too Many Re-renders

**Problem:** Every context update re-renders all consumers.

**Solution:** Split context into multiple smaller contexts.

**Bad:**

```typescript
const AppContext = createContext({
  user: null,
  theme: 'light',
  settings: {},
}); // Single context - all updates trigger all consumers
```

**Good:**

```typescript
const UserContext = createContext(null);
const ThemeContext = createContext('light');
const SettingsContext = createContext({});
// Separate contexts - only relevant consumers re-render
```

---

### Issue: Compound Components Not Working

**Problem:** Child components can't access parent context.

**Solution:** Ensure context provider wraps all children.

**Bad:**

```typescript
function Tabs({ children }) {
  const [activeTab, setActiveTab] = useState('tab1');
  return <div>{children}</div>; // Missing context provider
}
```

**Good:**

```typescript
function Tabs({ children }) {
  const [activeTab, setActiveTab] = useState('tab1');
  return <TabsContext.Provider value={{ activeTab, setActiveTab }}>{children}</TabsContext.Provider>;
}
```

---

## Related Documentation

- [Skill Usage Guide](SKILL_USAGE_GUIDE.md) - Overview of all 5 skills
- [React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md) - Performance optimization
- [React Native Skill Guide](REACT_NATIVE_SKILL.md) - Mobile-specific patterns
- [Web Design Skill Guide](WEB_DESIGN_SKILL.md) - Accessibility and design
- [Vercel Deploy Skill Guide](VERCEL_DEPLOY_SKILL.md) - Deployment automation

---

## Conclusion

The Composition Patterns skill provides 10 architectural patterns for building scalable React applications, including React 19 API updates and migration guidance. Use this skill for component refactoring, architecture planning, and React 19 migration.

**Invoke the skill:**

```javascript
Skill({ skill: 'vercel-composition-patterns' });
```

**Next steps:**

1. Review your component architecture
2. Identify patterns to apply (compound, context, hooks)
3. Migrate legacy patterns (render props, HOCs) to hooks
4. Plan React 19 migration
5. Build design system foundations
