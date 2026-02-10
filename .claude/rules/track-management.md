# Track Management

Track management methodology - creating and managing logical work units (features, bugs, refactors) through specification, planning, and implementation phases.

## What is a Track?

A track is a logical work unit (feature, bug fix, major refactor) that moves through:

1. **Specification** - Requirements and design
2. **Planning** - Task breakdown and dependencies
3. **Implementation** - TDD execution

## When to Use

- Starting new features
- Complex bug fixes requiring multiple files
- Major refactoring efforts
- Work spanning multiple sessions

## Track Structure

```
.claude/context/tracks/<track-name>_<YYYYMMDD>/
  ├── spec.md          # Requirements and design
  ├── plan.md          # Task breakdown
  ├── tech-stack.md    # Dependencies and tools
  └── progress.md      # Session logs
```

## Track Lifecycle

1. **Create Track** - Initialize directory and files
2. **Write Specification** - Document requirements
3. **Generate Plan** - Break into tasks
4. **Implement Tasks** - Follow TDD workflow
5. **Complete Track** - Verify and close

## Task States

- `[ ]` - Pending
- `[~]` - In Progress
- `[x]` - Complete (with commit SHA)
- `[-]` - Skipped (with reason)
- `[!]` - Blocked (with blocker description)

## Related References

- `.claude/skills/track-management/SKILL.md` - Complete track specification
- `.claude/skills/workflow-patterns/SKILL.md` - Task implementation patterns
