# Ripgrep Search Rules

## Core Rules

- Prefer `pnpm search:code` over raw ripgrep for hybrid text+semantic search
- Use ripgrep only for advanced PCRE2 patterns (lookahead/lookbehind)
- Always respect .gitignore patterns (automatic by default)
- Use file type filters (`-tjs`, `-tts`) for faster searches

## Best Practices

- Use smart-case search (default) for case-insensitive matching
- Enable context lines with `-C 3` when debugging
- Use literal search (`-F`) when pattern has no regex
- Exclude large directories with `-g "!node_modules/**"`

## Performance

- File type filters are 10-100x faster than searching all files
- Ripgrep uses all CPU cores by default
- Binary files are automatically skipped
- Gitignore respect prevents unnecessary scanning

## Common Patterns

### Find Function Definitions
```bash
rg "^function\s+\w+\(" -tjs
```

### Find Imports
```bash
rg "import.*from" -tts
```

### Case-Insensitive Search
```bash
rg "pattern" -i
```

### PCRE2 Lookahead
```bash
rg -P "error(?=.*critical)"
```

## Anti-Patterns

- Don't use ripgrep for simple filename searches (use Glob instead)
- Don't search binary files without `-a` flag
- Don't ignore gitignore (`--no-ignore`) without good reason
- Don't use ripgrep when semantic search is needed

## Integration

- **developer**: Code exploration, implementation discovery
- **code-reviewer**: Finding similar patterns
- **architect**: System understanding
- **reverse-engineer**: Understanding unfamiliar codebases

## Related Skills

- `code-semantic-search` - Find code by meaning
- `code-structural-search` - Find code by AST structure
- `grep` - Built-in Claude Code grep (simpler, less features)

## Related References

- `.claude/skills/ripgrep/SKILL.md` - Complete ripgrep skill documentation
- `.claude/rules/code-standards.md` - Hybrid search commands section
