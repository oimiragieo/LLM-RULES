---
paths:
  - .claude/skills/frontend-expert/**
---

# Frontend Expert Rules

## Core Principles

- Component-based architecture
- Responsive design (mobile-first)
- Accessibility (WCAG 2.1 AA minimum)
- Performance optimization (Core Web Vitals)
- Progressive enhancement

## Component Standards

- Single Responsibility Principle
- Composable and reusable
- Props interface for TypeScript
- Default props for optional values
- PropTypes or TypeScript for validation

## State Management

- Local state for component-specific data
- Global state for shared data (Context, Redux, Zustand)
- Server state with React Query or SWR
- URL state for navigation and filters
- Avoid prop drilling (use Context or state management)

## Performance Standards

- Code splitting with React.lazy
- Memoization with React.memo, useMemo, useCallback
- Virtual scrolling for long lists
- Image optimization (lazy loading, WebP)
- Bundle size monitoring (webpack-bundle-analyzer)

## Accessibility Standards

- Semantic HTML (header, nav, main, footer)
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management (focus trapping in modals)
- Color contrast WCAG AA minimum (4.5:1)

## Responsive Design

- Mobile-first CSS
- Breakpoints: 640px (tablet), 1024px (desktop)
- Fluid typography (clamp, rem)
- Flexible images (max-width: 100%)
- CSS Grid and Flexbox for layouts

## Error Handling

- Error boundaries for React errors
- Loading states for async operations
- Empty states for no data
- Error messages for failed requests
- Retry mechanisms for transient failures

## Anti-Patterns

- Prop drilling (use Context/state management)
- Inline styles (use CSS modules or styled-components)
- No loading/error states
- Large bundle sizes (no code splitting)
- No accessibility attributes

## Integration Points

- `react-expert` skill - React-specific patterns
- `mobile-first-design-rules` skill - Mobile design
- `api-development-expert` skill - API integration

## Related References

- `.claude/skills/frontend-expert/SKILL.md` - Frontend patterns
- `.claude/skills/react-expert/SKILL.md` - React best practices
- `.claude/skills/mobile-first-design-rules/SKILL.md` - Mobile-first design
