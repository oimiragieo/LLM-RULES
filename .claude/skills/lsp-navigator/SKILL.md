---
name: lsp-navigator
description: Compiler-level code intelligence via native LSP — definitions, references, types, call hierarchies, and diagnostics.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash]
verified: true
lastVerifiedAt: '2026-03-07'
dependencies: []
agents:
  - developer
  - qa
  - code-reviewer
  - architect
  - code-simplifier
  - nodejs-pro
  - typescript-pro
  - frontend-pro
  - nextjs-pro
  - advanced-debugging
  - reflection-agent
  - golang-pro
  - java-pro
  - python-pro
  - rust-pro
  - devops-troubleshooter
  - penetration-tester
  - security-architect
category: 'Code Intelligence'
tags:
  [
    lsp,
    navigation,
    definitions,
    references,
    types,
    call-hierarchy,
    code-intelligence,
    dead-code,
    diagnostics,
  ]
---

# LSP Navigator

> **PREREQUISITE**: LSP tools are deferred. Load first: ToolSearch({query:"select:LSP"})
> **CRITICAL**: LSP returns EMPTY for .cjs files. Use ripgrep for .cjs instead.

<identity>
Compiler-level code intelligence skill. Uses Claude Code's native LSP tool to provide
type-safe navigation: go-to-definition, find-references, hover info, call hierarchies,
and workspace symbol search. Includes an automated diagnostics runner for dead-code
detection and broken-import scanning. Complements text search (ripgrep), semantic search
(code-semantic-search), and structural search (code-structural-search) with compiler-
verified precision.
</identity>

<capabilities>
- Navigate to symbol definitions across the workspace (goToDefinition)
- Find all references to a symbol (findReferences)
- Get type information and documentation on hover (hover)
- List all symbols in a document (documentSymbol)
- Search symbols across the workspace by name (workspaceSymbol)
- Navigate to interface/abstract method implementations (goToImplementation)
- Build call hierarchy trees: callers (incomingCalls) and callees (outgoingCalls)
- Prepare call hierarchy items at a position (prepareCallHierarchy)
- **Automated diagnostics**: Run dead-code and broken-import scans via `lsp-diagnostics-runner.cjs`
</capabilities>

## When to Use

Use lsp-navigator when you need **compiler-verified precision** rather than text-based heuristics:

- Tracing where a symbol is defined (following imports, re-exports, index files)
- Finding every callsite of a function before refactoring
- Verifying parameter types and return types without reading the whole file
- Building complete call hierarchy trees for architecture review
- Validating that imports resolve correctly after a move/rename
- Checking what methods an interface requires vs. what a class provides

Use the **diagnostics runner** (`lsp-diagnostics-runner.cjs`) when you need:

- Bulk dead-code detection across many files (exports with zero importers)
- Broken import scanning (require() paths that don't resolve)
- Codebase health checks as part of QA or proactive-audit workflows

Do NOT use for:

- Discovering code you don't have a position for yet (use `pnpm search:code` first)
- Searching text inside comments or string literals (use ripgrep)
- Finding code by pattern shape (use code-structural-search)

## Operation Reference

| Operation              | Purpose                                                                                                         | Best For                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `goToDefinition`       | Find where a symbol is defined                                                                                  | Navigating to source of imported functions/classes |
| `findReferences`       | Find all usages of a symbol                                                                                     | Impact analysis before refactoring                 |
| `hover`                | Get type info and docs                                                                                          | Verifying parameter types, checking API contracts  |
| `documentSymbol`       | List all symbols in a file                                                                                      | File structure overview, finding entry points      |
| `workspaceSymbol`      | Search symbols by name                                                                                          | Finding functions/classes across the workspace     |
| `goToImplementation`   | Find implementations of interface                                                                               | Tracing concrete behavior of abstract types        |
| `prepareCallHierarchy` | Get call hierarchy item ⚠️ Always call this BEFORE incomingCalls/outgoingCalls or you get silent empty results. | Setting up for incoming/outgoing call analysis     |
| `incomingCalls`        | Find all callers                                                                                                | Understanding who depends on this function         |
| `outgoingCalls`        | Find all callees                                                                                                | Understanding what a function depends on           |

All operations require: `filePath` (absolute path), `line` (1-based), `character` (1-based).

## Search Intelligence Decision Table

| Question                            | Tool                                  | Why                                          |
| ----------------------------------- | ------------------------------------- | -------------------------------------------- |
| "Where is `foo` defined?"           | **lsp-navigator** (`goToDefinition`)  | Compiler-precise, follows imports/re-exports |
| "Who calls `foo`?"                  | **lsp-navigator** (`incomingCalls`)   | Complete call graph, not just text matches   |
| "What type does `foo` return?"      | **lsp-navigator** (`hover`)           | Compiler-resolved types, including generics  |
| "Find all usages of `foo`"          | **lsp-navigator** (`findReferences`)  | Compiler-aware, excludes comments/strings    |
| "Find files about authentication"   | **code-semantic-search**              | Conceptual search, not tied to symbol names  |
| "Find `foo` in all .cjs files"      | **ripgrep** (`rg -F "foo"`)           | Fastest for exact text, works without LSP    |
| "Find all async functions"          | **code-structural-search**            | AST pattern matching, language-agnostic      |
| "What functions are in this file?"  | **lsp-navigator** (`documentSymbol`)  | Structured symbol list with types            |
| "Find class X across workspace"     | **lsp-navigator** (`workspaceSymbol`) | Name-based but compiler-indexed              |
| "Find code similar to this pattern" | **code-semantic-search**              | Embedding-based similarity                   |
| "Find all try-catch blocks"         | **code-structural-search**            | AST pattern: `try { $$ } catch ($E) { $$ }`  |
| "What does this function call?"     | **lsp-navigator** (`outgoingCalls`)   | Full dependency graph of a function          |
| "Find `foo` in comments too"        | **ripgrep**                           | LSP excludes non-code; rg searches all text  |

**Decision Flowchart:**

```
START: What do you need?
  |
  +--> Need compiler-verified type/definition/reference info?
  |     YES --> lsp-navigator
  |     NO
  |      |
  +--> Need conceptual/intent-based code discovery?
  |     YES --> code-semantic-search / pnpm search:code
  |     NO
  |      |
  +--> Need AST pattern matching (structural shape)?
  |     YES --> code-structural-search
  |     NO
  |      |
  +--> Need exact text/literal match?
        YES --> ripgrep / rg -F
```

## Updated Search Hierarchy

The complete search preference order (see also `code-standards.md`):

```
1. pnpm search:code         -- hybrid BM25 + semantic (discovery, default)
2. lsp-navigator            -- compiler-level definitions, references, types
3. Skill({ skill: 'ripgrep' })          -- fast text/regex search
4. Skill({ skill: 'code-semantic-search' })  -- conceptual/intent search
5. Skill({ skill: 'code-structural-search' }) -- AST pattern matching
6. Grep                     -- FALLBACK ONLY (advanced regex, single-file)
```

Note: lsp-navigator sits at position 2 because once you know a symbol/location (found via position 1), LSP provides the most precise navigation. Discovery (position 1) is still needed to find initial entry points.

<instructions>

## Workflow Patterns

### Use Case 1: Developer Passive Self-Correction

After editing a file, verify types and references are correct:

```javascript
// After editing src/auth/jwt.ts line 45
// Step 1: Verify the function signature is correct
lsp_hover({ filePath: '/abs/path/src/auth/jwt.ts', line: 45, character: 10 });
// Step 2: Check that imported symbol resolves
lsp_goToDefinition({ filePath: '/abs/path/src/auth/jwt.ts', line: 3, character: 15 });
// Step 3: Verify references haven't broken
lsp_findReferences({ filePath: '/abs/path/src/auth/jwt.ts', line: 45, character: 10 });
```

Pattern: Edit → hover to verify types → goToDefinition to verify imports resolve → findReferences to verify callers still work.

### Use Case 2: Specialist Active Discovery

Creator/updater agents trace execution flows:

```javascript
// Tracing how a hook is called
// Step 1: Find the function definition
lsp_goToDefinition({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 15,
  character: 5,
});
// Step 2: Find all callers
lsp_prepareCallHierarchy({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 15,
  character: 5,
});
lsp_incomingCalls({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 15,
  character: 5,
});
// Step 3: Find what this function calls
lsp_outgoingCalls({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 15,
  character: 5,
});
```

Pattern: goToDefinition (anchor) → prepareCallHierarchy → incomingCalls (who calls me?) → outgoingCalls (what do I call?).

### Use Case 3: QA Instant Static Analysis

QA agent checks types without running full test suite:

```javascript
// After a code change, verify types across affected files
// Step 1: Get all symbols in the changed file
lsp_documentSymbol({ filePath: '/abs/path/src/middleware/auth.ts', line: 1, character: 1 });
// Step 2: For each exported symbol, check references still resolve
lsp_findReferences({ filePath: '/abs/path/src/middleware/auth.ts', line: 10, character: 15 });
// Step 3: Hover over key interfaces to verify type contracts
lsp_hover({ filePath: '/abs/path/src/middleware/auth.ts', line: 5, character: 20 });
```

Pattern: documentSymbol (what changed?) → findReferences (who's affected?) → hover (do types still match?).

### Use Case 4: Reflection Structural Post-Mortems

Reflection agent verifies agent claims:

```javascript
// Agent claimed it called `validateToken(token: string)` but review suggests wrong signature
// Step 1: Check actual type
lsp_hover({ filePath: '/abs/path/src/auth/validate.ts', line: 12, character: 10 });
// If hover shows `validateToken(token: JWTPayload)` not `string`, agent hallucinated
// Step 2: Check if the parameter type was changed recently
lsp_findReferences({ filePath: '/abs/path/src/auth/validate.ts', line: 12, character: 25 });
```

Pattern: hover (ground-truth type check) → findReferences (impact of the actual signature).

### Use Case 5: Automated Dead Code Detection

Use `documentSymbol` → `findReferences` as an automated sweep to detect exported symbols
with zero external references. This pattern powers the `lsp-diagnostics-runner.cjs` script.

```javascript
// Step 1: List all symbols in the file
lsp_documentSymbol({
  filePath: '/abs/path/.claude/lib/memory/memory-manager.cjs',
  line: 1,
  character: 1,
});

// Step 2: For each exported symbol, check for external references
lsp_findReferences({
  filePath: '/abs/path/.claude/lib/memory/memory-manager.cjs',
  line: 42,
  character: 15,
});
// If results contain only the defining file → potential dead export
```

**Automated script**: `.claude/tools/cli/lsp-diagnostics-runner.cjs` implements this pattern
using ripgrep as a fallback (since LSP has limited CJS support — see Anti-Patterns table).

```bash
# Run dead-exports check on all lib files
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --format markdown

# Exclude archived directories
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --exclude-pattern "_archive"
```

**Note on hook exports (false positives)**: Hook files (`.claude/hooks/**`) export functions
for testability but are invoked via stdin/stdout protocol, not `require()`. Their exports
appear as dead code because test suites use dynamic require; the diagnostics runner
marks hook export findings as LOW severity for this reason.

### Use Case 6: Hook Wiring Verification

Verify that hooks registered in `.claude/settings.json` exist on disk and their internal
`require()` chains resolve without errors.

```javascript
// Step 1: Locate the hook registration in settings.json
// (use ripgrep — LSP won't index JSON well for CJS references)
// rg "routing-guard" .claude/settings.json

// Step 2: Confirm the hook file exists and resolves its imports
lsp_goToDefinition({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 1,
  character: 1,
});

// Step 3: Check the exports the hook provides (for testability audit)
lsp_documentSymbol({
  filePath: '/abs/path/.claude/hooks/routing/routing-guard.cjs',
  line: 1,
  character: 1,
});
```

**Hybrid approach (more reliable for .cjs files)**: Combine ripgrep for settings.json
registration lookup with `require.resolve()` for import chain validation:

```bash
# Find all registered hooks
node -e "const s = require('./.claude/settings.json'); console.log(JSON.stringify(s.hooks, null, 2))"

# Verify a hook's require chain resolves
node -e "require('./.claude/hooks/routing/routing-guard.cjs'); console.log('OK')"
```

## Diagnostics Runner Tool (RECOMMENDED for .cjs codebases)

**Script**: `.claude/tools/cli/lsp-diagnostics-runner.cjs`

An automated scanner that finds dead code, broken imports, and unreferenced functions using
ripgrep + `require.resolve()`. Use this instead of manual LSP calls for bulk analysis of
`.cjs` CommonJS files (where native LSP has limited support).

### Quick Start

```bash
# Find exported symbols that nobody imports (dead code)
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports

# Find require() calls that don't resolve (broken imports)
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check broken-imports

# Run both checks, exclude archived code
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --check broken-imports --exclude-pattern "_archive"

# Target specific directories
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --glob ".claude/lib/routing/*.cjs"
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --glob ".claude/hooks/**/*.cjs"

# Output as markdown (for reports)
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports --format markdown --output report.md
```

### CLI Flags

| Flag                      | Default                | Description                                                                |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `--check <type>`          | (required)             | `dead-exports`, `broken-imports`, or `unreferenced-functions` (repeatable) |
| `--glob <pattern>`        | `.claude/lib/**/*.cjs` | File glob pattern to scan                                                  |
| `--exclude-pattern <pat>` | (none)                 | Exclude files matching pattern (e.g., `_archive`)                          |
| `--format <fmt>`          | `table`                | Output format: `table`, `json`, or `markdown`                              |
| `--output <file>`         | (stdout)               | Write results to file                                                      |

### Severity Levels

| Severity | Meaning                                                        |
| -------- | -------------------------------------------------------------- |
| HIGH     | Broken import (require doesn't resolve) — likely runtime error |
| MEDIUM   | Dead export in non-hook file — probably unused code            |
| LOW      | Dead export in hook file — expected (hooks export for testing) |

### When Agents Should Use This

- **qa** / **proactive-audit**: Run as part of codebase health checks
- **code-reviewer**: Check for dead exports in changed files before approving
- **architect**: Audit module dependencies and find disconnected subsystems
- **code-simplifier**: Identify dead code candidates for removal
- **developer**: Verify new exports are actually imported somewhere after implementation

### Important: Hook Export False Positives

Hook files (`.claude/hooks/**`) export functions for testability but are invoked via
stdin/stdout JSON protocol, not `require()`. Their exports always appear as "dead"
because no production code imports them — only test files do. The runner marks these
as LOW severity automatically. **Do not treat hook dead-exports as bugs.**

## Standard Invocation Pattern

```javascript
// Invoke as a skill for guidance, then use native LSP tool directly
Skill({ skill: 'lsp-navigator' });

// Then call LSP operations natively:
// lsp_goToDefinition({ filePath, line, character })
// lsp_findReferences({ filePath, line, character })
// lsp_hover({ filePath, line, character })
// lsp_documentSymbol({ filePath, line, character })
// lsp_workspaceSymbol({ filePath, line, character })
// lsp_goToImplementation({ filePath, line, character })
// lsp_prepareCallHierarchy({ filePath, line, character })
// lsp_incomingCalls({ filePath, line, character })
// lsp_outgoingCalls({ filePath, line, character })
```

</instructions>

## Agent-Specific Contracts

### developer (always)

Use lsp-navigator to self-correct after edits:

- After writing/editing code: hover to verify types, goToDefinition to verify imports
- Before completing a refactor: findReferences to verify no callsites were missed
- When unsure about an API: hover on the call site to see the actual signature

### qa (always)

Use lsp-navigator for lightweight static analysis:

- documentSymbol on changed files to inventory what was modified
- findReferences on exported symbols to find affected test targets
- hover on type boundaries to verify type contracts match test assumptions

### code-reviewer (always)

Use lsp-navigator to improve review accuracy:

- findReferences when a renamed function might have missed callsites
- goToDefinition to trace where imported symbols come from
- hover to verify reviewer understands the actual type being used

### architect (always)

Use lsp-navigator for architectural analysis:

- incomingCalls + outgoingCalls to build dependency maps
- workspaceSymbol to find all implementations of a pattern
- goToImplementation on interfaces to trace concrete implementations

### code-simplifier (always)

Use lsp-navigator for safe refactoring:

- findReferences before renaming — must be exhaustive, not text-based
- goToDefinition to understand the full scope of a symbol before changing it
- hover to verify types before extracting functions

### advanced-debugging (always)

Use lsp-navigator for root cause analysis:

- prepareCallHierarchy + incomingCalls to trace how a buggy path is reached
- outgoingCalls to understand what a suspect function depends on
- hover to verify types at boundary points where errors occur

### reflection-agent (contextual)

Use lsp-navigator to verify agent claims:

- hover to ground-truth type claims made by agents
- findReferences to verify "all callsites updated" claims are accurate

### security-architect (contextual)

Use lsp-navigator to trace data flows:

- outgoingCalls from entry points to trace how user input propagates
- findReferences on security-critical functions to verify all usages are safe
- goToImplementation on interfaces to find all concrete implementations that handle sensitive data

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execute hook: `hooks/pre-execute.cjs` validates `filePath` is absolute and `line`/`character` are positive integers before invoking any LSP operation.

## Iron Laws

1. **ALWAYS provide absolute file paths** — LSP requires full paths; relative paths cause silent failures or wrong-file resolution.
2. **ALWAYS use 1-based line and character numbers** — LSP protocol is 1-based; 0-based offsets produce off-by-one navigation errors.
3. **NEVER use LSP for text discovery** — LSP requires a known position to start from; use ripgrep or search:code to find initial entry points, then LSP to navigate from there.
4. **ALWAYS verify the LSP server is active for the file's language** — not all languages have LSP support in the workspace; fall back to ripgrep/structural search if LSP returns empty results.
5. **ALWAYS use `prepareCallHierarchy` before `incomingCalls`/`outgoingCalls`** — the call hierarchy operations require a prepared item from `prepareCallHierarchy` at the target position.

## Anti-Patterns

| Anti-Pattern                                                | Why It Fails                                                         | Correct Approach                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Using LSP to "search for" a concept                         | LSP needs a position, not a query                                    | Use search:code for discovery, then LSP for navigation   |
| Relative file paths                                         | LSP resolves against workspace root; may hit wrong file              | Always use absolute paths                                |
| 0-based line numbers                                        | Off-by-one errors; navigates to wrong symbol                         | LSP is 1-based for both line and character               |
| Skipping prepareCallHierarchy                               | incomingCalls/outgoingCalls need a prepared item                     | Always call prepareCallHierarchy first                   |
| Using LSP instead of rg for text-in-comments                | LSP only sees code symbols, not text in comments/strings             | Use ripgrep for text that includes non-code content      |
| Trusting empty LSP results as "no references"               | Language server may not be running or file may not be indexed        | Verify LSP is active; fall back to ripgrep if empty      |
| Using LSP on .cjs CommonJS files expecting TypeScript types | CJS files may have limited LSP support depending on workspace config | Fall back to ripgrep or structural search for .cjs files |

## CJS File Limitations (Reflection from LSP Deep Dive)

In practice, most LSP operations (`goToDefinition`, `findReferences`, `hover`) return empty
results for `.cjs` CommonJS files in this workspace. The TypeScript language server does not
fully index CJS modules without explicit `jsconfig.json` or `tsconfig.json` coverage.

**What this means:**

- For `.cjs` files: prefer ripgrep (`rg -F`) for reference counting and `require.resolve()` for import validation.
- LSP `documentSymbol` may work on `.cjs` files for listing top-level exports, but is unreliable.
- The hybrid approach (ripgrep + `require.resolve()`) proved more effective than LSP for the agent-studio codebase's `.cjs` hook and lib files.

**Recommendation**: Use LSP as the primary tool for `.ts` and `.js` (ESM) files. For `.cjs` files,
treat LSP as a secondary option and fall back to ripgrep immediately if LSP returns empty results.

## Windows Path Normalization (SE-01)

On Windows, `path.relative()` and other Node.js path utilities return backslash (`\`) separators
instead of forward slashes. LSP operations and file path comparisons expect forward-slash paths.

**Rules for Windows compatibility:**

- Always normalize paths before passing them to LSP operations: `filePath.replace(/\\/g, '/')`
- When comparing LSP result paths to local paths, normalize both sides
- The diagnostics runner (`lsp-diagnostics-runner.cjs`) handles this via its `normalizePath()` utility
- Use `[^/\\]*` in regex patterns if path normalization is uncertain
- Do NOT use `path.relative()` output directly in regex or glob patterns without normalizing

**Example:**

```javascript
// WRONG: path.relative() returns backslashes on Windows
const relPath = path.relative(projectRoot, filePath); // ".claude\\lib\\routing.cjs"

// CORRECT: normalize before use
const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
// ".claude/lib/routing.cjs"
```

This is Sharp Edge SE-01 in the codebase. See `.claude/rules/safety-rules.md` for full details.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

## Language Server Quick Reference

| Language | Server                       | Install                                       |
| -------- | ---------------------------- | --------------------------------------------- |
| C/C++    | `clangd`                     | `apt install clangd` / `brew install llvm`    |
| Go       | `gopls`                      | `go install golang.org/x/tools/gopls@latest`  |
| Python   | `pyright`                    | `npm i -g pyright`                            |
| Rust     | `rust-analyzer`              | `rustup component add rust-analyzer`          |
| Java     | `jdtls`                      | `brew install jdtls` / Eclipse JDT LS release |
| TS/JS    | `typescript-language-server` | `npm i -g typescript-language-server`         |
| Lua      | `lua-language-server`        | `brew install lua-language-server`            |
| Bash     | `bashls`                     | `npm i -g bash-language-server`               |
| JSON     | `jsonls`                     | `npm i -g vscode-langservers-extracted`       |
| YAML     | `yamlls`                     | `npm i -g yaml-language-server`               |
| TOML     | `taplo`                      | `cargo install taplo-cli`                     |
| Markdown | `marksman`                   | `brew install marksman` / GitHub releases     |

**Note**: Claude Code activates these automatically when installed — no manual start required.
LSP for `.cjs` files remains unreliable; use ripgrep as primary for CommonJS files.

## Hookify Pattern

Auto-enable LSP server selection via a PostToolUse(Read) hook:

```javascript
// .claude/hooks/lsp-enable.cjs
'use strict';
const path = require('path');

const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const filePath = input?.tool_input?.file_path || '';
const ext = path.extname(filePath);

const serverMap = {
  '.py': 'pyright',
  '.rs': 'rust-analyzer',
  '.go': 'gopls',
  '.ts': 'typescript-language-server',
  '.js': 'typescript-language-server',
  '.lua': 'lua-language-server',
  '.sh': 'bashls',
};

const server = serverMap[ext];
if (server) {
  process.stdout.write(JSON.stringify({ lspServer: server }));
}
process.exit(0);
```

Register in `.claude/settings.json`:

```json
{ "event": "PostToolUse", "tool": "Read", "command": "node .claude/hooks/lsp-enable.cjs" }
```
