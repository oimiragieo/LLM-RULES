# Git Expert Rules

## Core Principles

- Advanced Git operations guided through efficient CLI commands
- Token optimization through command templates instead of long explanations
- Focus on complex workflows (rebase, cherry-pick, stash, bisect, reflog)
- Safety-first approach for destructive operations
- Team collaboration patterns built-in

## When to Use

Use git-expert when:
- Performing advanced Git operations (interactive rebase, cherry-pick, bisect)
- Recovering from Git mistakes (lost commits, broken history)
- Optimizing Git workflows for teams
- Managing complex branching strategies
- Troubleshooting Git issues

## Standards

### Branching Strategies

**Gitflow**:
```bash
# Feature branch from develop
git checkout develop
git checkout -b feature/feature-name

# Finish feature
git checkout develop
git merge --no-ff feature/feature-name
git branch -d feature/feature-name
```

**Trunk-Based Development**:
```bash
# Short-lived feature branch
git checkout main
git checkout -b feature-short-lived

# Merge when done (same day)
git checkout main
git merge feature-short-lived
git branch -d feature-short-lived
```

**Feature Branches**:
```bash
# Long-running feature
git checkout -b feature/big-feature
# Work, commit multiple times
# Rebase onto main before merge
git checkout feature/big-feature
git rebase main
git checkout main
git merge feature/big-feature
```

### Advanced Workflows

**Interactive Rebase**:
```bash
# Rewrite last 3 commits
git rebase -i HEAD~3

# Squash commits
pick abc123 First commit
squash def456 Second commit (will squash into first)
squash ghi789 Third commit (will squash into first)

# Reorder commits
pick def456 Commit that should be first
pick abc123 Commit that should be second

# Drop commits
pick abc123 Keep this
drop def456 Remove this
pick ghi789 Keep this
```

**Cherry-Pick**:
```bash
# Pick specific commit from another branch
git cherry-pick abc123

# Pick range of commits
git cherry-pick abc123..def456

# Cherry-pick without committing (review first)
git cherry-pick -n abc123
```

**Stash Workflows**:
```bash
# Save work in progress
git stash push -m "WIP: feature description"

# List stashes
git stash list

# Apply specific stash
git stash apply stash@{2}

# Apply and drop
git stash pop

# Create branch from stash
git stash branch feature-from-stash stash@{1}
```

**Bisect for Bug Hunting**:
```bash
# Start bisect
git bisect start
git bisect bad  # Current commit is bad
git bisect good abc123  # Known good commit

# Git will checkout middle commit
# Test it
git bisect bad  # if broken
git bisect good  # if working

# Git finds first bad commit
git bisect reset  # return to original state
```

**Reflog Recovery**:
```bash
# View reflog (all HEAD movements)
git reflog

# Recover lost commit
git checkout abc123  # from reflog

# Recover deleted branch
git checkout -b recovered-branch abc123

# Undo bad rebase
git reset --hard HEAD@{5}  # from before rebase
```

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Force push to main | Destroys team history | Never force push to shared branches |
| No branch strategy | Chaotic collaboration | Adopt gitflow or trunk-based |
| Large commits | Hard to review/revert | Small, focused commits |
| No descriptive messages | Lost context | Use conventional commits |
| Committing secrets | Security breach | Use .gitignore, scan with tools |
| Working directly on main | No isolation | Always use feature branches |

## Common Commands

### Rewriting History

```bash
# Change last commit message
git commit --amend -m "New message"

# Add files to last commit
git add forgotten-file.txt
git commit --amend --no-edit

# Split last commit into two
git reset HEAD~1
git add file1.txt
git commit -m "First part"
git add file2.txt
git commit -m "Second part"
```

### Undoing Changes

```bash
# Unstage file
git restore --staged file.txt

# Discard local changes
git restore file.txt

# Revert commit (create new commit undoing it)
git revert abc123

# Reset to previous commit (dangerous)
git reset --hard HEAD~1

# Undo reset (if just done)
git reset --hard HEAD@{1}
```

### Searching History

```bash
# Find when code changed
git log -S "function name" --oneline

# Find commit that changed file
git log --follow --oneline path/to/file

# Show commits by author
git log --author="Name" --oneline

# Show commits in date range
git log --since="2 weeks ago" --until="yesterday"
```

## Integration Points

**Related Skills**:
- `git-workflow` - Commit conventions and pre-commit requirements
- `code-reviewer` - PR review workflow
- `verification-before-completion` - Pre-commit validation

**Related Agents**:
- `developer` - Uses Git for version control
- `code-reviewer` - Reviews Git diffs
- `devops` - Manages Git workflows in CI/CD

**Related Workflows**:
- TDD workflow - Commit after each red-green-refactor cycle
- Feature workflow - Git branching strategy
- Release workflow - Tagging and versioning

## Safety Protocols

**Before force operations**:
```bash
# Always backup before force push
git push origin feature-branch --force-with-lease

# Never force push to main/master/develop
# Instead, revert and push forward
git revert abc123
git push origin main
```

**Before destructive resets**:
```bash
# Create backup branch first
git branch backup-before-reset

# Then reset
git reset --hard HEAD~5

# Recover if needed
git checkout backup-before-reset
```

## Best Practices

1. **Atomic commits**: One logical change per commit
2. **Descriptive messages**: Follow conventional commits
3. **Frequent pulls**: Stay synced with team
4. **Branch per feature**: Isolate work
5. **Rebase before merge**: Clean history
6. **Never rewrite public history**: Only rewrite local/WIP branches
7. **Use --force-with-lease**: Safer than --force
8. **Test before push**: All tests pass

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
