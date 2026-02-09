# iOS Expert Rules

## Core Principles

- Write maintainable and clean Swift code
- Focus on latest iOS features and documentation (2024+)
- Use SwiftUI for modern UI development (prefer over UIKit for new code)
- Keep descriptions short and concise
- Follow Apple Human Interface Guidelines

## SwiftUI Standards

- Use built-in components (List, NavigationView, TabView, SF Symbols)
- Master layout tools (VStack, HStack, ZStack, Spacer, Padding)
- Use LazyVGrid and LazyHGrid for grids
- Use GeometryReader for dynamic layouts
- Add visual flair with shadows, gradients, blurs, custom shapes

## Project Structure

- **Sources**:
  - App: main files
  - Views: Home and Profile sections with ViewModels
  - Shared: reusable components and modifiers
  - Models: data models
  - ViewModels: view-specific logic
  - Services: Network, Persistence
  - Utilities: extensions, constants, helpers
- **Resources**: Assets, Localization, Fonts
- **Tests**: UnitTests, UITests

## UI Design

- Design for interaction (gestures, haptic feedback)
- Implement clear navigation patterns
- Use responsive elements for user engagement
- Apply animations with .animation() modifier
- Follow iOS-consistent design principles

## Performance

- Optimize view rendering
- Use lazy loading for large lists
- Implement proper state management
- Minimize unnecessary recompositions
- Profile with Instruments

## Testing

- Write unit tests for ViewModels
- Implement UI tests for critical flows
- Use XCTest framework
- Test on multiple device sizes
- Test accessibility features

## Integration Points

- Used by: `mobile-architect`, `ios-pro`, `developer` (iOS projects)
- Related skills: `swift-expert`, `mobile-app-patterns`, `accessibility-tester`
- Works with: `ui-designer`, `performance-engineer`, `security-architect`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
