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
- Add provenance headers for generated files:

  ```markdown
  <!-- Agent: {type} | Task: #{id} | Session: {date} -->
  ```

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

## AI-Generated Code Review (Multi-Layered)

**Layer 1: Automated Linting** (catches syntax, style)

- ESLint, Prettier, TypeScript compiler
- Runs on every file save

**Layer 2: AI Code Review** (catches logic, patterns)

- `code-reviewer` agent reviews PRs
- Checks for: logic errors, security issues, performance problems
- Identifies code smells and anti-patterns

**Layer 3: Human Architecture Review** (catches design issues)

- Human reviews: API design, architecture decisions
- Focus: Does this solve the right problem?

**Pattern**: Automate the trivial, AI reviews the tactical, humans review the strategic.

## Hybrid Search Commands

**MANDATORY**: Agents MUST use framework search tools before falling back to Grep.
Search preference order (highest to lowest):

1. `pnpm search:code` — hybrid semantic + BM25 (recommended default)
2. `Skill({ skill: 'lsp-navigator' })` — compiler-level definitions, references, types (once position is known)
3. `Skill({ skill: 'ripgrep' })` — fast text search in agent flows
4. `Skill({ skill: 'code-semantic-search' })` — conceptual/intent search
5. `Skill({ skill: 'code-structural-search' })` — AST-based search
6. `Grep` — FALLBACK ONLY (advanced regex, single-file checks)

**Anti-Pattern**: Using `Grep` as primary code discovery tool. Grep does not leverage BM25 ranking or semantic understanding and produces lower-quality results for broad searches.

**Code Search Tools**:

- `pnpm search:code "pattern"` - Semantic + BM25 hybrid search
- `pnpm search:structure "class:MyClass"` - Structural code search (AST-based)
- `pnpm search:file "filename"` - Fast filename search

**When to Use**:

- Semantic search: Find similar patterns, discover existing solutions
- Structural search: Precise code matching (all uses of interface X)
- File search: Locate files by name

**Skills**:

- `lsp-navigator` - Compiler-level definitions, references, types
- `code-semantic-search` - Semantic code search skill
- `code-structural-search` - Structural (AST) search skill
- `ripgrep` - Fast text search skill

## LSP Navigation

Use `lsp-navigator` for **compiler-verified precision** once you have a known file position:

```javascript
Skill({ skill: 'lsp-navigator' });

// Then invoke native LSP operations directly:
// lsp_goToDefinition({ filePath, line, character })   — find where a symbol is defined
// lsp_findReferences({ filePath, line, character })   — find all usages
// lsp_hover({ filePath, line, character })            — get type info
// lsp_documentSymbol({ filePath, line, character })   — list file symbols
// lsp_workspaceSymbol({ filePath, line, character })  — search workspace symbols
// lsp_goToImplementation({ filePath, line, character }) — find implementations
// lsp_prepareCallHierarchy({ filePath, line, character }) — prepare call hierarchy
// lsp_incomingCalls({ filePath, line, character })    — who calls this?
// lsp_outgoingCalls({ filePath, line, character })    — what does this call?
```

**Rules**: Always use absolute paths. Always use 1-based line/character. Always call
`prepareCallHierarchy` before `incomingCalls`/`outgoingCalls`. Fall back to ripgrep
if LSP returns empty (server may not be running for that language).

**When to use LSP vs other search**:

| Question                   | Tool                           |
| -------------------------- | ------------------------------ |
| "Where is `foo` defined?"  | lsp-navigator (goToDefinition) |
| "Who calls `foo`?"         | lsp-navigator (incomingCalls)  |
| "Find files about auth"    | pnpm search:code               |
| "Find `foo` in all files"  | ripgrep (rg -F)                |
| "Find all async functions" | code-structural-search         |

**Example**:

```bash
# Find all authentication patterns
pnpm search:code "JWT token validation"

# Find all classes implementing UserInterface
pnpm search:structure "class:*:implements:UserInterface"

# Find config files
pnpm search:file "config"
```

## Lint and Format (MANDATORY)

- Run `pnpm lint:fix` before committing any code changes
- Run `pnpm format` before committing any code changes
- Both must pass with zero errors/changes before a task is marked complete
- This is a BLOCKING requirement - no exceptions

## Related References

- `.claude/agents/specialized/code-reviewer.md` - Code review agent
- `.claude/skills/lsp-navigator/SKILL.md` - LSP navigation skill (compiler-level)
- `.claude/skills/code-semantic-search/SKILL.md` - Semantic search skill
- `.claude/skills/code-structural-search/SKILL.md` - Structural search skill
