---
paths:
  - .claude/skills/context-driven-development/**
---

# Context-Driven Development Rules

## Core Principles

- Treat project context as managed artifacts alongside code
- Context is versionable, reviewable, and discoverable
- Context decay is technical debt
- Shared context vocabulary prevents misalignment
- Context files are first-class citizens in the project

## Context Artifacts

### Configuration Context

- `.claude/config.yaml` - Agent models, settings, feature flags
- `.env.example` - Environment variable templates
- `package.json` - Dependencies, scripts, metadata

### Memory Context

- `.claude/context/memory/learnings.md` - Patterns and solutions
- `.claude/context/memory/decisions.md` - ADRs and architecture choices
- `.claude/context/memory/issues.md` - Known blockers and workarounds
- `.claude/context/memory/named/` - Topic-specific persistent notes

### Agent Context

- `.claude/agents/**/*.md` - Agent definitions and capabilities
- `.claude/context/agent-registry.json` - Agent discovery and routing
- `.claude/skills/**/*.md` - Reusable agent behaviors

### Workflow Context

- `.claude/workflows/**/*.md` - Multi-agent orchestration patterns
- `.claude/context/workflow-state.json` - Runtime workflow state

## Standards

- Context files must be self-documenting
- Use markdown for human-readable context
- Use JSON/YAML for machine-readable context
- Version control all context artifacts
- Keep context files under 20KB (rotate if larger)
- Update context atomically with code changes

## Context Lifecycle

1. **Creation**: Document context when creating features
2. **Evolution**: Update context as project grows
3. **Rotation**: Archive stale context (monthly for memory)
4. **Discovery**: Provide search/query interfaces
5. **Validation**: Ensure context accuracy

## Anti-Patterns

- Hardcoding behavior that should be configurable
- Letting context files grow unbounded
- Inconsistent context vocabulary across files
- Context updates in separate PRs from code changes
- Assuming context without verification
- Ignoring context decay (outdated ADRs, stale learnings)

## Integration Points

- **Agents**: Read context files at task start
- **Memory Protocol**: Update memory files after work
- **Router**: Uses agent-registry.json for routing
- **Workflows**: Reference shared workflow definitions
- **Skills**: Document patterns in learnings.md
