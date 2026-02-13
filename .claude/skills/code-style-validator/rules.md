---
paths:
  - .claude/skills/code-style-validator/**
---

# Code Style Validator Rules

## Core Rules

- Use AST-based validation, not regex
- Prefer existing linter rules before writing custom ones
- Provide auto-fix where possible
- Run in pre-commit and CI pipelines

## When to Use

- Before committing code
- In pre-commit hooks
- During code review
- In CI/CD pipelines
- To enforce consistent code style

## Best Practices

### AST-Based Validation

- Use ESLint (JavaScript/TypeScript) with AST selectors
- Use custom rules for project-specific patterns
- Listen for specific node types (FunctionDeclaration, ClassDeclaration, etc.)
- Use pattern matching for precise checks

### Validation Checks

**Naming Conventions:**

- Variables: camelCase (JS/TS) or snake_case (Python)
- Functions: camelCase (JS/TS) or snake_case (Python)
- Classes: PascalCase
- Constants: UPPER_CASE
- Private: prefix with underscore

**Formatting:**

- Indentation: 2 spaces (JS/TS) or 4 spaces (Python)
- Line length: 88-100 characters
- Trailing commas: Yes (JS/TS)
- Semicolons: Consistent usage

**Structure:**

- Import order: external, internal, relative
- Function length: < 50 lines
- File organization: exports, helpers, types

## Integration

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
changed_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|py)$')

for file in $changed_files; do
  if ! node validate-code-style.js "$file"; then
    echo "Code style validation failed for $file"
    exit 1
  fi
done
```

### CI/CD Pipeline

```yaml
# .github/workflows/code-style.yml
- name: Validate code style
  run: |
    node validate-code-style.js src/
    if [ $? -ne 0 ]; then
      echo "Code style validation failed"
      exit 1
    fi
```

## Anti-Patterns

- Using regex for code structure validation
- Writing custom rules without checking existing ESLint rules
- Forgetting auto-fix for simple issues
- Not running in CI (only local)
- Blocking commits for warnings (only errors should block)

## Output Format

```json
{
  "file": "src/components/Button.tsx",
  "valid": false,
  "issues": [
    {
      "line": 15,
      "column": 10,
      "rule": "naming-convention",
      "message": "Variable 'UserData' should be camelCase: 'userData'",
      "severity": "error"
    },
    {
      "line": 23,
      "column": 5,
      "rule": "indentation",
      "message": "Expected 2 spaces, found 4",
      "severity": "warning"
    }
  ],
  "summary": {
    "total": 2,
    "errors": 1,
    "warnings": 1
  }
}
```

## Related Skills

- `code-quality-expert` - Code quality guidelines
- `code-analyzer` - Static code analysis
- `tdd` - Test-driven development (includes lint/format gates)

## Related References

- `.claude/skills/code-style-validator/SKILL.md` - Complete validator documentation
- `.claude/rules/code-standards.md` - Lint and format requirements
- `.claude/rules/testing.md` - Code quality gates
