# Mobile-First Design Rules

## Core Principles

- Design for mobile first, scale up for desktop
- Touch-friendly targets (44×44px minimum)
- Responsive typography with system font scaling
- Progressive enhancement for larger screens
- Performance-first (minimize assets, lazy load)

## Layout Standards

- Stack vertically on mobile
- Use flexbox and grid for responsive layouts
- Breakpoints: 640px (tablet), 1024px (desktop)
- Safe areas for notched devices
- Collapsible navigation on small screens

## Typography Standards

- System fonts for performance (San Francisco, Roboto)
- Responsive font sizes (16px base on mobile)
- Line height 1.5 for readability
- Limit line length (60-80 characters)
- Use rem/em for scalable typography

## Touch Interaction Standards

- Tap targets: 44×44px minimum (iOS) / 48×48px (Android)
- Spacing between touch targets: 8px minimum
- Swipe gestures for navigation
- Pull-to-refresh for content updates
- Haptic feedback for important actions

## Performance Standards

- Optimize images for mobile (WebP, AVIF)
- Lazy load images below the fold
- Minimize initial bundle size
- Prefetch critical resources
- Use service workers for offline support

## Accessibility Standards

- High contrast (WCAG AA minimum)
- Support system font size adjustments
- Screen reader labels on interactive elements
- Keyboard navigation support
- Focus indicators visible

## Anti-Patterns

- Desktop-first design (mobile afterthought)
- Small touch targets (<44px)
- Fixed font sizes (breaks accessibility)
- No viewport meta tag
- Large unoptimized images

## Integration Points

- `expo-framework-rule` skill - Expo/React Native patterns
- `frontend-expert` skill - Web frontend patterns
- `accessibility-tester` agent - Accessibility review

## Related References

- `.claude/skills/mobile-first-design-rules/SKILL.md` - Mobile-first patterns
- `.claude/skills/expo-framework-rule/SKILL.md` - Expo framework specifics
