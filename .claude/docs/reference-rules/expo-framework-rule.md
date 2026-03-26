---
paths:
  - .claude/skills/expo-framework-rule/**
---

# Expo Framework Rules

## Core Principles

- Use Expo SDK for cross-platform React Native apps
- Expo Go for rapid development and testing
- EAS Build for production builds
- File-based routing with Expo Router
- Expo Modules API for native functionality

## Project Structure Standards

- Use Expo SDK 50+ (latest stable)
- File-based routing in `app/` directory
- Shared components in `components/`
- API clients in `services/`
- Types in `types/` or co-located with components

## Development Standards

- Expo Go for development (no native builds needed)
- Hot reload for instant updates
- TypeScript for type safety
- ESLint and Prettier for code style
- expo-constants for environment variables

## Expo Router Standards

- File-based routing (app/index.tsx, app/profile.tsx)
- Dynamic routes with [id].tsx
- Layouts with \_layout.tsx
- Nested navigation with folder structure
- Type-safe navigation with useRouter hooks

## Native Functionality

- Use Expo SDK modules (expo-camera, expo-location)
- Config plugins for native configuration
- EAS Build for custom native code
- Avoid ejecting unless necessary
- Use expo-dev-client for custom native modules

## Performance Standards

- Lazy load screens and heavy components
- Optimize images with expo-image
- Use React.memo for expensive components
- Profile with React DevTools
- Minimize bundle size with tree shaking

## Anti-Patterns

- Ejecting without exhausting Expo SDK options
- Not using TypeScript
- Large unoptimized images
- Synchronous heavy operations on main thread
- No error boundaries

## Integration Points

- `mobile-first-design-rules` skill - Mobile UI/UX patterns
- `react-expert` skill - React best practices
- `frontend-expert` skill - UI patterns

## Related References

- `.claude/skills/expo-framework-rule/SKILL.md` - Expo patterns and examples
- `.claude/skills/mobile-first-design-rules/SKILL.md` - Mobile-first design
