---
paths:
  - .claude/skills/code-analyzer/**
---

# Code Analyzer Rules

## Core Rules

- Analyze before refactoring (understand current state first)
- Run project-wide then drill into hotspots
- Track trends over time (not one-off)
- Use ESLint complexity rules alongside analysis

## Key Metrics

### Cyclomatic Complexity

- Measures decision paths in code
- Target: <10 per function (ESLint default: 20)
- Count: if, while, for, case, &&, ||, ?:, catch
- High complexity = hard to test, error-prone

### Lines of Code (LOC)

- Physical lines in file
- Target: <300 lines per file, <50 per function
- High LOC = difficult to maintain

### Maintainability Index

- Composite metric: complexity + LOC + Halstead volume
- Scale: 0-100 (higher = more maintainable)
- Target: >65 for production code

### Code Duplication

- Repeated code blocks
- Target: <5% duplication
- Use jscpd or similar tools

## ESLint Complexity Rules

Configure in `.eslintrc.json`:

```json
{
  "rules": {
    "complexity": ["error", 15],
    "max-depth": ["error", 4],
    "max-lines": ["warn", 300],
    "max-lines-per-function": ["warn", 50],
    "max-nested-callbacks": ["error", 3],
    "max-params": ["warn", 4],
    "max-statements": ["warn", 15]
  }
}
```

## Analysis Process

### 1. Project-Wide Analysis

```bash
node .claude/tools/analysis/project-analyzer/analyzer.mjs
```

Output shows:

- Total files, LOC, complexity
- Hotspots (files with highest complexity)
- Duplication report
- Maintainability scores

### 2. Filter by Threshold

- Focus on files with complexity >15
- Prioritize files with high complexity AND high churn (frequently changed)

### 3. Drill Into Hotspots

Analyze specific files/functions:

- Which functions have highest complexity?
- What's driving the complexity? (nested loops, conditionals)
- Can it be simplified? (extract functions, guard clauses)

### 4. Track Over Time

- Run analysis weekly
- Graph complexity trends
- Alert on degradation
- Celebrate improvements

## Common Complexity Sources

### Optional Chaining and Default Params

```typescript
// Each ? adds a branch
user?.profile?.settings?.theme ?? 'default';
// Complexity: 4 (3 optional chains + 1 nullish coalescing)
```

### Deeply Nested Conditionals

```typescript
// ❌ BAD - Complexity: 5
if (user) {
  if (user.active) {
    if (user.permissions) {
      if (user.permissions.canEdit) {
        // ...
      }
    }
  }
}

// ✅ GOOD - Complexity: 1
function canEdit(user) {
  return user?.active && user?.permissions?.canEdit;
}
if (canEdit(user)) {
  // ...
}
```

## Anti-Patterns

- Running analysis once and forgetting
- Ignoring high-complexity hotspots
- Not setting thresholds in CI
- Measuring everything, improving nothing

## Integration

### Pre-commit Hook

```bash
# Run analysis on changed files
node .claude/tools/analysis/project-analyzer/analyzer.mjs --changed
```

### CI Pipeline

```yaml
# Block PR if complexity exceeds threshold
- name: Check complexity
  run: |
    node .claude/tools/analysis/project-analyzer/analyzer.mjs --threshold 20
```

## Related Skills

- `code-quality-expert` - Code quality principles
- `code-reviewer` - Code review patterns
- `best-practices-guidelines` - General best practices

## Related References

- `.claude/skills/code-analyzer/SKILL.md` - Complete code analyzer documentation
- `.claude/tools/analysis/project-analyzer/analyzer.mjs` - Analysis tool
- `.claude/rules/code-standards.md` - Code organization
