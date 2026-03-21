# Research Report: android-pro Agent

**Date**: 2026-01-25
**Researcher**: research-synthesis skill
**Artifact Type**: agent
**Domain**: Native Android Development

---

## Research Scope Definition

**Artifact Type**: agent
**Domain/Capability**: Native Android development with Kotlin and Jetpack Compose
**Key Questions**:
1. What are the best practices for modern Android development?
2. What architecture patterns are recommended (MVVM, Clean Architecture)?
3. What tools/frameworks should be used (Hilt, Room, Retrofit)?
4. What are common pitfalls and performance optimizations?

**Existing Patterns to Examine**:
- `.claude/agents/domain/ios-pro.md` - iOS native development agent (parallel structure)
- `.claude/agents/domain/expo-mobile-developer.md` - Cross-platform mobile agent
- `.claude/skills/android-expert/SKILL.md` - Existing Android skill to assign

---

## Research Queries Executed

| # | Query | Tool | Sources Found | Key Finding |
|---|-------|------|---------------|-------------|
| 1 | "Android development best practices 2024 2025 Kotlin Jetpack Compose architecture patterns" | Exa | 5 | MVVM + Clean Architecture is the dominant pattern; Compose is now standard |
| 2 | "Kotlin Jetpack Compose modern Android app architecture MVVM Clean Architecture guidelines" | Exa | 5 | Three-layer architecture (Presentation, Domain, Data) with Hilt DI |
| 3 | "Android SDK Gradle build system dependency injection Hilt Room database Retrofit" | Exa | 5 | Hilt replaces Dagger for DI; Room + Retrofit + Coroutines are standard stack |
| 4 | "Android Kotlin Jetpack Compose ViewModel StateFlow navigation code examples patterns" | Exa Code | 30+ | StateFlow for UI state, unidirectional data flow, Compose Navigation |

---

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `.claude/agents/domain/ios-pro.md` - Native iOS development agent with similar structure: Core Persona, Responsibilities, Technology Stack, Workflow, Code Templates, Common Tasks, Best Practices, Verification Protocol
- `.claude/agents/domain/expo-mobile-developer.md` - Cross-platform mobile agent showing mobile-specific patterns and testing approaches

**Conventions Identified:**
- **Naming**: kebab-case for agent names (e.g., `android-pro`)
- **Structure**: YAML frontmatter + markdown body with defined sections
- **Tools**: Standard tools array + task tools + Skill
- **Skills**: Include domain skill + task-management-protocol + verification skills
- **Output**: Define output locations for artifacts

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Use MVVM + Clean Architecture with three layers (Presentation, Domain, Data) | Multiple Medium articles, LinkedIn posts | High | Multiple authoritative sources agree on this pattern |
| 2 | Use Hilt for dependency injection instead of manual Dagger | Stackademic, Medium articles | High | Official Google recommendation, reduces boilerplate |
| 3 | Use StateFlow for UI state management with ViewModel | Exa code search, Android Developers | High | Compose-native, lifecycle-aware, replaces LiveData |
| 4 | Follow Material Design 3 guidelines for UI | Android Jetpack Compose guides | High | Official Google design system |
| 5 | Use Kotlin Coroutines and Flow for async operations | All research sources | High | Native Kotlin async, replaces RxJava |
| 6 | Implement unidirectional data flow (UDF) | Multiple architecture articles | High | Prevents state inconsistencies |
| 7 | Use Room for local database, Retrofit for networking | Jay Dwivedi tutorial, multiple sources | High | Official Jetpack libraries |
| 8 | Write unit tests with JUnit, UI tests with Compose testing framework | Production-ready Todo article | High | Google recommended testing stack |
| 9 | Use Gradle with Kotlin DSL for build configuration | Modern Android patterns | Medium | Newer approach, better IDE support |
| 10 | Minimize recomposition using proper keys and remember | Performance guidelines | High | Critical for Compose performance |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Model after ios-pro.md structure | Parity between platforms, consistent agent design | Codebase pattern | Expo-mobile-developer structure (too cross-platform focused) |
| Assign android-expert skill | Existing skill with Jetpack Compose patterns | Skill catalog | Creating new skill (unnecessary, skill exists) |
| Include verification-before-completion skill | Ensures quality gates before task completion | ios-pro.md pattern | Manual verification (less reliable) |
| Use sonnet model by default | Standard for domain agents | CLAUDE.md patterns | opus (overkill for most tasks) |
| Include task tools (TaskUpdate, TaskList, TaskCreate, TaskGet) | Required for task synchronization | CLAUDE.md Iron Laws | No task tools (breaks tracking) |
| Include TDD workflow | Best practice for quality code | TDD skill, ios-pro.md | No TDD (lower quality output) |

---

## Recommended Implementation

**File Location**: `.claude/agents/domain/android-pro.md`

**Template to Use**: Based on `.claude/agents/domain/ios-pro.md` structure

**Skills to Invoke**:
- `android-expert` - Core Android/Jetpack Compose patterns
- `testing-expert` - Comprehensive testing strategies
- `tdd` - Test-Driven Development workflow
- `debugging` - Systematic debugging methodology
- `verification-before-completion` - Quality gates
- `task-management-protocol` - Task synchronization

**Hooks Needed**:
- None specific to this agent (uses existing routing hooks)

**Dependencies**:
- Existing skills: android-expert, tdd, testing-expert, debugging, verification-before-completion
- Router registration: CLAUDE.md Section 3 routing table
- Router enforcer: router-enforcer.cjs keyword registration

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Overlap with expo-mobile-developer | Medium | Medium | Clear description distinguishing native-only Android from cross-platform |
| android-expert skill may be outdated | Low | Medium | Skill uses current Jetpack Compose patterns, reviewed during research |
| Router may confuse with expo for "mobile" requests | Medium | Medium | Add specific keywords for "native android", "kotlin", "jetpack compose" |
| Missing router-enforcer keywords | High | High | Add comprehensive Android keywords to router-enforcer.cjs |

---

## Quality Gate Checklist

Before proceeding to artifact creation, verify:

- [x] Minimum 3 research queries executed (4 executed)
- [x] At least 3 external sources consulted (15+ sources)
- [x] Existing codebase patterns documented (ios-pro.md, expo-mobile-developer.md)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented

---

## Technology Stack Summary

### Languages & Frameworks
- **Kotlin 2.0+**: Modern Kotlin with coroutines, flows, sealed classes
- **Jetpack Compose**: Declarative UI framework (Compose 1.6+)
- **Material Design 3**: Modern Material You design system

### Architecture Components
- **ViewModel**: Lifecycle-aware state holder
- **StateFlow/SharedFlow**: Reactive state management
- **Hilt**: Dependency injection
- **Navigation Compose**: Type-safe navigation

### Data & Persistence
- **Room**: Local SQLite database
- **DataStore**: Preferences and proto storage
- **Retrofit + OkHttp**: Networking
- **Kotlin Serialization**: JSON parsing

### Testing Frameworks
- **JUnit 5**: Unit testing
- **Mockk/Mockito-Kotlin**: Mocking
- **Compose Testing**: UI testing
- **Espresso**: Instrumentation testing (legacy)
- **Robolectric**: Local JVM testing

### Build Tools
- **Gradle 8+**: Build system with Kotlin DSL
- **Android Gradle Plugin**: Android-specific build
- **Version Catalogs**: Dependency management

---

## Next Steps

1. **Create agent file**: `.claude/agents/domain/android-pro.md`
2. **Update CLAUDE.md routing table**: Add android-pro entry
3. **Update router-enforcer.cjs**: Add Android-specific keywords
4. **Update skill-catalog.md**: Verify android-expert is listed
5. **Record in evolution-state.json**: Log the evolution

---

**Research Complete**: YES
**Proceed with creation**: YES
**Confidence Level**: High
