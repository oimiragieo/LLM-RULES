---
paths:
  - .claude/skills/ripgrep/**
---

# Ripgrep Search Rules

## Core Rules

- `MUST` start with `pnpm search:structure` to orient, then `pnpm search:code` for discovery
- `MUST` check `pnpm search:tokens` before reading files to know if they fit in context
- `MUST` use `pnpm search:compress` when a topic spans >32K tokens and you need compressed understanding
- `MUST` use raw `rg -F` for exact symbol/literal lookups when speed and determinism matter most
- `MUST` respect `.gitignore` and default excludes unless explicitly justified
- `MUST` constrain scope with globs/file types for repo-wide scans
- `MUST` ensure `pnpm code:index:reindex` has been run before relying on semantic results
- `MUST` use `rg`/`Grep` (not hybrid search) for exhaustive audit sweeps where completeness matters
- `SHOULD` prefer smaller, ranked outputs when context/token budget matters
- `SHOULD` rely on wrapper auto-discovery for binaries (node_modules/.bin, Scoop shims, PATH) before hardcoding paths
- Repeated `search:code` queries are auto-cached (~5ms hit). BM25 index auto-updates on file edits.

## Search Mode Selection (MANDATORY)

| Mode                           | Primary use                                | Latency | Contract                     |
| ------------------------------ | ------------------------------------------ | ------- | ---------------------------- |
| `pnpm search:structure`        | Architecture map, dependency orientation   | Fast    | First step before any edit   |
| `pnpm search:tokens [path]`    | Check if file/dir fits in context          | Fast    | Before reading files         |
| `pnpm search:code "query"`     | Discovery and mixed intent (~5ms cached)   | Fast    | Default discovery step       |
| `pnpm search:compress "query"` | Search + compress + dedup for large topics | ~2-5s   | When topic spans >32K tokens |
| `rg -F "literal"`              | Exact symbol/literal anchors               | Fastest | Required before risky edits  |
| `Grep` (built-in)              | Exhaustive pattern sweeps for audits       | Fast    | When completeness > ranking  |

Enforcement:

- Agents `MUST NOT` depend on `fzf` for required automated search paths.
- Agents `MUST` keep unattended flows non-interactive and reproducible.
- Agents `SHOULD` choose `ast:` mode only when lexical intent is insufficient.
- Agents `MUST` treat `Grep` as fallback-only; default enforcement is handled by `hybrid-search-enforcer` PreToolUse hook.

## Best Practices

- Use smart-case search (default) for case-insensitive matching
- Enable context lines with `-C 2` or `-C 3` during debugging
- Use literal search (`-F`) when pattern has no regex intent
- Exclude large directories with `-g "!node_modules/**"` (and similar project excludes)
- Prefer repository-relative paths in follow-up commands for reproducibility

### fzf Integration (SHOULD for Interactive Triage)

`fzf` is an interactive narrowing layer for `rg`/`rga` output.

- `SHOULD` use `rg|rga -> fzf` when result sets are large and operator selection is needed.
- `MUST` keep backend search deterministic (`rg -F`, scoped globs) before piping into `fzf`.
- `MUST NOT` treat `fzf` as semantic retrieval; it is selection UX, not ranking intelligence.
- `MUST NOT` make `fzf` a blocking dependency for CI/agent automation.

Examples:

```bash
# rg + fzf + preview
rg --line-number --no-heading --color=always "auth|token|session" . \
  | fzf --ansi --delimiter ":" \
    --preview "bat --color=always --style=numbers --highlight-line {2} {1}"

# rga + fzf for document-like formats
rga --line-number --no-heading --color=always "invoice|receipt|policy" . \
  | fzf --ansi --delimiter ":" \
    --preview "bat --color=always --style=numbers --line-range=:300 {1}"

# ast-grep + fzf for structural triage
ast-grep -p 'function $NAME($$$) { $$$ }' --lang javascript --files-with-matches . \
  | fzf --ansi --delimiter ":" \
    --preview "bat --color=always --style=numbers --line-range=:220 {}"
```

## Recommended: Hybrid Code Search

Use the hybrid search system for day-to-day code discovery:

- **Text search works instantly** with no setup (ripgrep-based BM25)
- **No upfront indexing**: Search immediately with no multi-hour batch index build
- **Lazy embeddings**: Semantic vectors update incrementally in background as files are edited
- **Hybrid scoring**: Reciprocal Rank Fusion (RRF) combines text matches + semantic similarity

### Search Commands

```bash
# Search code instantly (ripgrep-based)
pnpm search:code "authentication logic"
pnpm search:code "export class User"
pnpm search:code "import react"

# View project structure
pnpm search:structure

# Get file content with line numbers
pnpm search:file src/auth.ts 1 50
```

### How It Works

1. `pnpm code:index:reindex` builds BM25 text index + LanceDB vector embeddings
2. Embeddings generated in isolated subprocess (GPU-accelerated, restarted every 50 batches for ONNX memory safety)
3. `search:code` queries both BM25 (text) and vector (semantic) indexes
4. RRF merges text and semantic rankings into a single ordered result set
5. Post-edit hooks can incrementally update changed files

### Configuration

```bash
# Semantic search (default: on, requires index build)
HYBRID_EMBEDDINGS=on

# Embedding engine (fastembed recommended, GPU-accelerated)
LANCEDB_EMBEDDING_MODE=fastembed

# Subprocess embedding isolation (ONNX memory leak workaround, default: on)
EMBED_SUBPROCESS=on

# Disable semantic search (text-only, fastest, no index needed)
# HYBRID_EMBEDDINGS=off

# Daemon transport for repeated queries
HYBRID_SEARCH_DAEMON=on
HYBRID_DAEMON_PREWARM=true

# Daemon idle timeout (ms)
HYBRID_DAEMON_IDLE_MS=600000
```

### Daemon Performance Runbook (MANDATORY for repeated queries)

For multi-query sessions, agents `MUST` warm the daemon path before heavy search loops.

```bash
pnpm search:daemon:start
pnpm search:daemon:status
pnpm search:daemon:prewarm
pnpm search:code "authentication logic"
```

Shutdown when the search phase ends:

```bash
pnpm search:daemon:stop
```

Expected latency profile on this repository:

- Cold daemon first query (no prewarm): ~1.35s avg
- First query after prewarm: ~0.40s avg
- Warm repeated daemon queries: ~0.18-0.19s
- Direct mode (`HYBRID_SEARCH_DAEMON=off`): ~0.73s avg for repeated CLI calls

### Index Build Performance

| Metric                  | With GPU (RTX 4070) | CPU-only |
| ----------------------- | ------------------- | -------- |
| Index time (2843 files) | ~12 min             | ~17 min  |
| Main process memory     | ~200MB              | ~200MB   |
| Heap allocation needed  | 4GB                 | 4GB      |

### Measured Performance and Output (This Repo)

Using the same 5 queries on this repository:

| Mode                                         | Avg Latency | Avg Output Bytes | Best Use Case                      |
| -------------------------------------------- | ----------- | ---------------- | ---------------------------------- |
| `pnpm search:code` (`HYBRID_EMBEDDINGS=off`) | ~227ms      | ~461 bytes       | Fast discovery with compact output |
| `pnpm search:code` (`HYBRID_EMBEDDINGS=on`)  | ~734ms      | ~512 bytes       | Semantic/concept queries           |
| Raw `rg` literal search                      | ~35ms       | ~2478 bytes      | Exact symbol/literal lookup        |

Interpretation:

- Raw `rg` is fastest for exact literal/symbol lookups
- Hybrid search returns significantly smaller output payloads (often lower token pressure)
- Embeddings improve semantic recall, but add latency

### Decision Rule (Practical)

Use `pnpm search:code` when:

- Query is conceptual/natural language (`"auth flow for refresh tokens"`)
- You need ranked results and concise context for agent prompts
- You want lower output volume by default

Use raw `rg` when:

- Query is an exact symbol/literal (`TaskUpdate(`, `HybridLazyIndexer`, exact export names)
- You need the fastest possible lookup time
- You need advanced regex/PCRE2 behavior

### Large vs Small Files (Use-Case Guidance)

| Scenario                              | Prefer                                                  | Why                                                          |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Small file, exact identifier lookup   | Raw `rg`                                                | Lowest latency and direct hit precision                      |
| Small file, conceptual intent lookup  | `search:code` with embeddings on                        | Semantic ranking finds related code quickly                  |
| Large file, exact string/symbol       | Raw `rg` + `-F` + narrow `-g` filters                   | Fast scan with minimal semantic overhead                     |
| Large file, unknown location/behavior | `search:code` (embeddings off first, then on if needed) | Start with broad lexical recall, then semantic refinement    |
| Very noisy monorepo query             | `search:code`                                           | RRF ranking + capped output reduces token spill into prompts |

Operational note:

- For very large files/repos, always constrain file globs first.
- Enable embeddings only when text results are weak or query is intent-heavy.

### Measured by File Size (This Repo)

Sample size: 4 small files (0.5-5KB), 4 large files (30-109KB), literal token queries.

| Bucket      | `search:code` off | `search:code` on | `rg_repo`       | `rg_file`      |
| ----------- | ----------------- | ---------------- | --------------- | -------------- |
| Small files | ~230ms / ~2707B   | ~600ms / ~2965B  | ~34ms / ~17075B | ~15ms / ~1156B |
| Large files | ~228ms / ~2354B   | ~475ms / ~2847B  | ~35ms / ~17811B | ~15ms / ~6564B |

Takeaways:

- `rg_file` is fastest and best for targeted file-level checks.
- `rg_repo` remains fastest for repo-wide literal scans, but emits much larger output payloads.
- `search:code` has steadier latency across file sizes and typically lower output volume for prompt usage.

## Deterministic Fallback Ladder (MANDATORY)

Use this exact sequence when searching:

1. `MUST` run `pnpm search:code "<concept or mixed query>"` first for discovery.
2. If results are weak/empty, `MUST` re-run with `HYBRID_EMBEDDINGS=on`.
3. For exact identifiers/symbols, `MUST` switch to raw `rg -F "<literal>"` with scoped globs.
4. For single known files, `MUST` use file-targeted `rg -F "<literal>" path/to/file`.
5. For regex features (lookahead/backreference), `MAY` use `rg -P` with explicit justification.
6. If output is too noisy, `MUST` narrow scope (`-g`, path, or file type) before retrying.
7. If still noisy, `SHOULD` switch back to `search:code` for ranked compact results.

## Blocking Validation Gate (MANDATORY)

Before considering search/discovery complete for an implementation/review task, all checks below must pass:

- `MUST` capture at least one successful discovery command (`search:code` or `rg`) relevant to the target.
- `MUST` verify at least one exact anchor (`rg -F` symbol/literal) when modifying code paths.
- `MUST` ensure output volume is scoped (no unbounded repo-wide noisy dumps into agent context).
- `MUST` record final file targets (paths) derived from search before editing or review claims.
- If any check fails, task remains `BLOCKED` until search is re-run with tighter scope.

## Agent-Specific Usage Contracts

### developer

- `MUST` use discovery (`search:code`) before editing unfamiliar areas.
- `MUST` confirm callsites with `rg -F` before refactor/rename.
- `SHOULD` keep embeddings off by default and enable only when lexical recall is poor.

### code-reviewer

- `MUST` run exact-pattern checks (`rg -F`) for claimed findings.
- `MUST` use scoped globs to avoid false-positive flooding.
- `SHOULD` use `search:code` to discover semantically similar patterns/regressions.

### architect

- `MUST` start with `pnpm search:structure` then `search:code` concept queries.
- `SHOULD` use ranked hybrid results to identify subsystem boundaries and cross-cutting concerns.

### qa

- `MUST` verify test-impact callsites with exact `rg -F` checks.
- `SHOULD` use `search:code` for behavior-driven scenario discovery.

### security-architect

- `MUST` pair semantic threat discovery with exact dangerous-pattern checks (`rg -F "shell: true"`, etc.).
- `MUST` confirm findings with deterministic literals before raising high-severity claims.

### reverse-engineer / researcher

- `MUST` begin with structure + hybrid conceptual search.
- `SHOULD` pivot to exact literal/symbol validation once hypotheses are formed.

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

- Don’t run unscoped repo-wide regex searches when a path/glob is known.
- Don’t use `rg` regex mode for literals with symbols (`(`, `[`, `{`) when `-F` is intended.
- Don’t ignore `.gitignore` (`--no-ignore`) without explicit task-level reason.
- Don’t paste massive raw search output into context when ranked/sliced output is sufficient.
- Don’t claim “not found” until fallback ladder steps are exhausted.

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
