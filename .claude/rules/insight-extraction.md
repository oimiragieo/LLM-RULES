# Insight Extraction Rules

## Core Principles

- Sessions produce learnings - capture them before context is lost
- Extract patterns, not just facts
- Focus on actionable insights (not "worked on X")
- Distinguish between project-specific and universal patterns
- Insights inform future agents and users

## Extraction Categories

### Pattern Insights
- Recurring code patterns discovered
- Architectural patterns that worked/failed
- Testing patterns that caught bugs
- Workflow patterns that were efficient

### Technical Insights
- Performance optimizations discovered
- Library/API behaviors learned
- Platform-specific gotchas
- Integration challenges solved

### Process Insights
- Workflow improvements
- Tool usage patterns
- Communication patterns
- Collaboration patterns

### Decision Insights
- Why certain approaches were chosen
- Alternatives considered and rejected
- Trade-offs made
- Context that influenced decisions

## Standards

- Extract insights immediately after task completion
- Write to `.claude/context/memory/learnings.md`
- Include context (why insight matters)
- Provide examples when possible
- Tag insights by domain (code, workflow, architecture)
- Link to related decisions.md entries

## Insight Format

```markdown
### [Pattern Name] (YYYY-MM-DD)

**Context**: [When/where this applies]

**Insight**: [What was learned]

**Example**: [Concrete example]

**Impact**: [Why this matters]

**Related**: [Links to decisions/files]
```

## Anti-Patterns

- Recording what was done (not what was learned)
- Vague insights ("X is good")
- Insights without context
- Duplicate insights (check existing first)
- Forgetting to extract after long sessions
- Storing insights only in task metadata

## Extraction Triggers

Extract insights when:
- Task completed successfully
- Bug fixed (record root cause and prevention)
- Pattern discovered during implementation
- Unexpected behavior encountered
- Session ending with valuable learnings
- Decision made with significant rationale

## Integration Points

- **Memory Protocol**: Write to learnings.md
- **Session Handoff**: Include key insights
- **Task Management**: Reference insights in task metadata
- **Reflection Agent**: Reviews and consolidates insights
