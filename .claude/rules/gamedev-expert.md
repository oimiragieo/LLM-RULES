# Game Development Expert Rules

## Core Principles

- Write concise, idiomatic code with accurate examples
- Follow framework conventions (DragonRuby, Unity, Unreal)
- Use appropriate programming patterns (OOP, functional)
- Prefer iteration and modularization over duplication
- Structure files according to framework conventions

## DragonRuby Standards

### Naming Conventions

- Use snake_case for file names, method names, variables
- Use CamelCase for class and module names
- Follow DragonRuby naming conventions

### Syntax and Formatting

- Follow Ruby Style Guide (https://rubystyle.guide/)
- Use Ruby's expressive syntax (unless, ||=, &.)
- Prefer single quotes for strings unless interpolation needed

### Error Handling

- Use exceptions for exceptional cases (not control flow)
- Implement proper error logging
- Provide user-friendly error messages

## Unity Standards

- Use C# for Unity scripting
- Follow Unity component-based architecture
- Implement proper MonoBehaviour lifecycle management
- Use ScriptableObjects for game data
- Implement object pooling for performance

## Game Design Patterns

- Entity-Component-System (ECS) for performance
- State machines for game logic
- Observer pattern for event systems
- Object pooling for frequently instantiated objects
- Command pattern for input handling

## Performance

- Optimize draw calls and batching
- Implement level-of-detail (LOD) systems
- Use profiling tools (Unity Profiler, custom profilers)
- Minimize garbage collection allocations
- Optimize physics calculations

## Testing

- Write unit tests for game logic
- Implement integration tests for systems
- Playtest regularly for gameplay feedback
- Profile performance regularly
- Test on target platforms

## Integration Points

- Used by: `game-architect`, `gamedev-pro`, `developer` (game projects)
- Related skills: `graphics-programming`, `physics-engine`, `ai-behavior`
- Works with: `performance-engineer`, `ui-designer`, `audio-engineer`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
