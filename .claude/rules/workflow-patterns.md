# Workflow Patterns

TDD task implementation patterns - red-green-refactor cycle, phase checkpoints, git commits, and verification protocols for quality assurance.

## When to Use

- Implementing tasks from a track's plan.md
- Following TDD red-green-refactor cycle
- Completing phase checkpoints
- Managing git commits and notes
- Understanding quality assurance gates
- Handling verification protocols
- Recording progress in plan files

## TDD Task Lifecycle (11 Steps)

1. **Select Next Task** - Read plan.md, identify next pending task
2. **Mark In Progress** - Update plan.md to `[~]`
3. **RED - Write Failing Tests** - Define expected behavior
4. **GREEN - Implement Minimum Code** - Make tests pass
5. **REFACTOR - Improve Clarity** - Enhance code quality
6. **Verify Coverage** - Check 80% target
7. **Document Deviations** - Note changes from plan
8. **Commit Implementation** - Focused commit with message
9. **Attach Git Notes** - Rich task summary
10. **Update Plan with SHA** - Mark complete with commit SHA
11. **Commit Plan Update** - Track progress

## Quality Assurance Gates

Before marking any task complete:

- **Passing Tests** - All tests pass, no regressions
- **Coverage >= 80%** - New code has adequate coverage
- **Style Compliance** - Linting passes, formatting correct
- **Documentation** - Public APIs documented, complex logic explained
- **Type Safety** - Type hints present, type checker passes
- **No Linting Errors** - Zero linter errors, warnings addressed
- **Security Audit** - No secrets, input validation, auth correct

## Phase Completion Protocol

1. Identify changed files since last checkpoint
2. Ensure test coverage for all modified files
3. Run full test suite
4. Generate manual verification checklist
5. **WAIT for user approval** (do NOT proceed without it)
6. Create checkpoint commit after approval
7. Record checkpoint SHA in plan.md

## Git Integration

**Commit Message Format**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: feat, fix, refactor, test, docs, chore

**Git Notes**: Attach detailed summaries with `git notes add`

**SHA Recording**: Always record commit SHA when completing tasks

## Related References

- `.claude/skills/workflow-patterns/SKILL.md` - Complete workflow specification
- `.claude/skills/tdd/SKILL.md` - TDD methodology
- `.claude/skills/verification-before-completion/SKILL.md` - Completion gates
