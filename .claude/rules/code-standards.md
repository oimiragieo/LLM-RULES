# Code Standards

## Code Organization

- Prefer small, cohesive files over large ones
- Keep interfaces narrow; separate concerns by feature
- Use `.cjs` extension for CommonJS modules (hooks, Node.js scripts)
- Use `.mjs` or `.ts` extension for ESM modules (tools, library code)
- Place tests in `tests/` directory mirroring source structure

## Code Style

- Favor immutability; avoid in-place mutation
- Validate inputs and handle errors explicitly
- Avoid ad-hoc console logging in production code
- Use lowercase kebab-case for filenames (e.g., `user-service.js`)
- Add provenance headers for agent-generated files: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`

## Patterns

- Prefer composition over inheritance
- Keep async boundaries explicit
- Use structured logging for diagnostics (not console.log)
- Avoid deeply nested conditionals (extract to functions)
- Apply single responsibility principle

## Error Handling

- Validate all inputs at boundaries
- Use explicit error handling (try/catch, .catch())
- Provide user-friendly error messages for 4xx errors
- Include debugging context for 5xx errors
- Never swallow exceptions silently

## Best Practices

- Make code self-documenting through clear naming
- Extract magic numbers to named constants
- Keep functions focused on one task
- Document public APIs and complex logic
- Leave code cleaner than you found it

## Code Review (Multi-Layered)

Three layers: (1) Automated linting — ESLint, Prettier, TypeScript. (2) AI code review — `code-reviewer` agent reviews PRs for logic errors, security, performance. (3) Human architecture review — API design, architectural decisions.

## Search Tools (MANDATORY)

Use framework search tools before `Grep`. Priority order:

1. `pnpm search:code` — hybrid semantic + BM25 (default)
2. `Skill({ skill: 'lsp-navigator' })` — compiler-level definitions/references (when file position known)
3. `Skill({ skill: 'ripgrep' })` — fast text search
4. `Skill({ skill: 'code-semantic-search' })` — conceptual/intent search
5. `Skill({ skill: 'code-structural-search' })` — AST-based search
6. `Grep` — FALLBACK ONLY

**Anti-Pattern**: Using `Grep` as primary code discovery tool.

## LSP Navigation

Use `lsp-navigator` skill for compiler-verified symbol lookups (goToDefinition, findReferences, hover, incomingCalls, outgoingCalls). Always use absolute paths and 1-based line/character. Call `prepareCallHierarchy` before `incomingCalls`/`outgoingCalls`. Fall back to ripgrep if LSP returns empty.

## Lint and Format (MANDATORY)

- Run `pnpm lint:fix` before committing any code changes
- Run `pnpm format` before committing any code changes
- Both must pass with zero errors/changes — no exceptions

## Related References

- `.claude/agents/specialized/code-reviewer.md` - Code review agent
- `.claude/skills/lsp-navigator/SKILL.md` - LSP navigation skill
