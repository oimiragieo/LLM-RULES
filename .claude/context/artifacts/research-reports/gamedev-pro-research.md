# Research Report: gamedev-pro Agent

**Date**: 2026-01-25
**Researcher**: evolution-orchestrator via research-synthesis skill
**Artifact Type**: Agent
**Domain**: Game Development (Unity, Unreal, Godot, Cross-Engine)

---

## Research Scope Definition

**Artifact Type**: agent
**Domain/Capability**: Game development across multiple engines with ECS, game loops, shaders, physics
**Key Questions**:
1. What are the best practices for game development?
2. What implementation patterns exist for major game engines?
3. What tools/frameworks should be used?
4. What are the common pitfalls in game development?

**Existing Patterns to Examine**:
- `.claude/agents/domain/rust-pro.md` - Domain expert agent template
- `.claude/agents/domain/typescript-pro.md` - Domain expert agent template
- `.claude/skills/gamedev-expert/SKILL.md` - Existing gamedev skill (limited to DragonRuby)

---

## Research Queries Executed

| # | Query | Tool | Sources Found | Key Finding |
|---|-------|------|---------------|-------------|
| 1 | "game development best practices ECS entity component system" | Exa | 5 | ECS is core architecture for performance-critical games; Unity DOTS 1.4+ is mature |
| 2 | "Unity Unreal Godot cross-platform game development 2025" | Exa | 5 | Unity best for mobile/cross-platform, Unreal for AAA, Godot for indie/2D |
| 3 | "game development AI agent Claude patterns game engine integration" | Exa Code | 50+ | MCP integration with Godot, Unity ML-Agents, behavior trees common patterns |

---

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `rust-pro.md` - Uses opus model, comprehensive capabilities section, skill invocation protocol, memory protocol
- `typescript-pro.md` - Domain-specific capabilities, contextual skills, behavioral traits
- `gamedev-expert` skill - Consolidates DragonRuby patterns (limited scope)

**Conventions Identified:**
- **Naming**: kebab-case for agent name (`gamedev-pro`)
- **Structure**: Core Persona, Capabilities (extensive), Workflow, Skill Invocation Protocol, Memory Protocol
- **Tools**: Full toolkit including WebSearch for research
- **Output**: Skill invocation section with automatic and contextual skills

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Use ECS for performance-critical gameplay systems | Unity Docs, GameDeveloper.com | High | Multiple authoritative sources agree ECS enables data-oriented optimization |
| 2 | Separate game loop from rendering for predictable physics | Cross-platform guides | High | Fixed timestep physics prevents simulation instability |
| 3 | Use engine-specific scripting (C# for Unity, C++/Blueprints for Unreal, GDScript/C# for Godot) | Engine documentation | High | Native languages have best tooling support |
| 4 | Profile early and often with engine-specific tools | All engine docs | High | Performance issues compound; early detection critical |
| 5 | Implement object pooling for frequently spawned objects | GameDev patterns | High | Reduces GC pressure and allocation overhead |

**Confidence Levels:**
- **High**: Multiple authoritative sources agree
- **Medium**: Single authoritative source or multiple secondary sources
- **Low**: Limited evidence, requires validation

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Cover Unity, Unreal, Godot | These are the top 3 engines in 2025 | Itch.io engine survey, Medium | Could specialize in single engine |
| Use opus model | Complex domain requiring deep reasoning | Existing pro agents | Sonnet (faster but less capable) |
| Include gamedev-expert skill | Leverage existing DragonRuby patterns | Codebase analysis | Create new skill (duplicate effort) |
| Include tdd skill | Games need testing like all software | Best practices | Manual testing only (error-prone) |
| Add AI/ML integration capability | Modern games use ML (NPCs, procedural gen) | Exa research | Skip ML (limits capability) |

---

## Recommended Implementation

**File Location**: `.claude/agents/domain/gamedev-pro.md`

**Template to Use**: Follows rust-pro.md structure

**Skills to Invoke**:
- `gamedev-expert` - DragonRuby and general game patterns
- `tdd` - Test-driven development
- `debugging` - 4-phase debugging methodology
- `git-expert` - Version control best practices
- `verification-before-completion` - Quality gates
- `cpp` - C++ patterns for Unreal
- `task-management-protocol` - Task tracking

**Hooks Needed**: None specific to this agent

**Dependencies**:
- Existing gamedev-expert skill
- Standard agent infrastructure

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Engine-specific advice may not apply cross-platform | Medium | Medium | Clearly label engine-specific patterns |
| Game development changes rapidly | Low | Medium | Include WebSearch for current practices |
| Complex domain may overwhelm agent | Low | High | Use opus model, structured sections |

---

## Quality Gate Checklist

Before proceeding to artifact creation, verify:

- [x] Minimum 3 research queries executed (3 executed)
- [x] At least 3 external sources consulted (10+ sources)
- [x] Existing codebase patterns documented (rust-pro, typescript-pro, gamedev-expert)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented

---

## Next Steps

1. **Create agent file**: `.claude/agents/domain/gamedev-pro.md`
2. **Update CLAUDE.md routing table**: Add gamedev-pro entry
3. **Update router-enforcer.cjs**: Add game development keywords
4. **Validate against checklist**: Before marking complete

---

## Key Sources

1. Unity ECS Documentation: https://docs.unity3d.com/Packages/com.unity.entities@1.3/
2. GameDeveloper.com ECS Pattern: https://www.gamedeveloper.com/design/the-entity-component-system
3. Cross-Platform Game Dev Guide 2025: https://scand.com/company/blog/cross-platform-game-development/
4. Game Engine Comparison 2025: https://itch.io/blog/1067028/game-engine-showdown-2025
5. Unity ML-Agents: https://github.com/Unity-Technologies/ml-agents
6. Godot MCP Integration: https://github.com/ee0pdt/Godot-MCP
7. Unity Serialization Best Practices: https://docs.unity3d.com/6000.2/Documentation/Manual/script-serialization-best-practices.html
