# Android Expert Rules

## Core Principles

- Use Kotlin for all new Android development
- Follow Material Design 3 guidelines and components
- Implement clean architecture (domain, data, presentation layers)
- Use Kotlin coroutines and Flow for async operations
- Implement dependency injection using Hilt

## Jetpack Compose Standards

- Follow unidirectional data flow with ViewModel and UI State
- Use Compose navigation for screen management
- Implement proper state hoisting and composition
- Use remember and derivedStateOf appropriately
- Follow composable function naming conventions (PascalCase)

## Performance

- Minimize recomposition using proper keys
- Use proper lazy loading (LazyColumn, LazyRow)
- Implement efficient image loading (Coil, Glide)
- Use proper state management to prevent unnecessary updates
- Follow proper lifecycle awareness
- Implement proper memory management

## Testing

- Write unit tests for ViewModels and UseCases
- Implement UI tests using Compose testing framework
- Use fake repositories for testing
- Implement proper test coverage (>80%)
- Use proper testing coroutine dispatchers

## Architecture

- Adapt to existing project architecture
- Use MVVM or MVI pattern
- Implement repository pattern for data access
- Use Room for local database
- Use Retrofit for network calls

## UI Guidelines

- Implement proper recomposition optimization
- Use proper Compose modifiers ordering
- Implement proper preview annotations (@Preview)
- Use proper state management with MutableState
- Follow Material Design 3 theming

## Integration Points

- Used by: `mobile-architect`, `android-pro`, `developer` (Android projects)
- Related skills: `kotlin-expert`, `mobile-app-patterns`, `accessibility-tester`
- Works with: `ui-designer`, `performance-engineer`, `security-architect`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
