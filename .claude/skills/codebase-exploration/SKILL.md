# Codebase Exploration

## Overview

7-phase progressive exploration protocol for analyzing unfamiliar codebases while keeping token usage under 34K. Based on research into SWE-bench top performers, LocAgent, and OpenHands — the key insight is **search-first, read-selectively, write-findings-immediately**.

**Core principle:** Never read a file to discover what's in it. Use search to locate, then read to confirm.

## When to Invoke

```javascript
Skill({ skill: 'codebase-exploration' });
```

Invoke when:

- Analyzing an external or unfamiliar codebase
- Onboarding a GitHub repository into the ecosystem
- Investigating a codebase to answer a specific question
- Performing due diligence on third-party code

**Token budget: 34K total. Hard stop at 60K — invoke `token-saver-context-compression` immediately.**

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.
Pre-execution hook: `hooks/pre-execute.cjs`
Post-execution hook: `hooks/post-execute.cjs`

---

## Phase 0: Scope Gate (~500 tokens)

Estimate token budget BEFORE diving in. This prevents context overflow.

**Actions:**

```bash
# Count files, excluding noise directories
find . -type f | grep -v node_modules | grep -v .git | grep -v __pycache__ | grep -v dist | grep -v build | grep -v .venv | wc -l

# Estimate token budget of relevant subtree
# ~4 chars per token, so: file_count * avg_file_size_bytes / 4 = token_estimate
# Or use: pnpm search:tokens . (if analyzing our own repo)
```

**Decision gate:**

- < 100 files AND < 30K estimated tokens: **Proceed as single agent**
- 100-500 files OR 30K-100K tokens: **Single agent with Phase 6 compression checkpoint**
- > 500 files OR > 100K tokens: **Recommend multi-agent decomposition via planner**

**Multi-agent decomposition protocol (when >100K tokens):**

1. Spawn planner to decompose by concern/directory into 2-4 chunks
2. Each researcher agent gets one chunk + the repo map from Phase 2
3. Each writes to a separate report file in `.claude/context/tmp/exploration-<timestamp>/`
4. A synthesizer agent reads all reports and produces unified analysis
5. Report paths: `chunk-1-findings.md`, `chunk-2-findings.md`, etc.

**Write scope assessment to report file immediately. Do not hold in context.**

---

## Phase 1: Structure Scan (~2K tokens)

**Goal:** Build a mental map without reading any file content.

```bash
# Directory tree, depth 3, exclude noise
find . -maxdepth 3 -type d | grep -v node_modules | grep -v .git | grep -v __pycache__ | grep -v dist | grep -v build | grep -v .venv | sort

# File count per top-level directory
for d in */; do echo "$d: $(find $d -type f 2>/dev/null | wc -l)"; done

# Identify language stack from file extensions
find . -type f | grep -v node_modules | grep -v .git | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -15
```

**Output:** Write directory tree + language stack to report file. Note top-level directories and likely purpose.

---

## Phase 2: Repo Map Generation (~5K tokens) — MANDATORY

**Goal:** Extract function/class signatures without reading bodies.

```bash
# Read README (first 100 lines only — use offset/limit)
# Read({ file_path: "README.md", limit: 100 })

# Read package manifest
# Read({ file_path: "package.json" }) or pyproject.toml, Cargo.toml, go.mod

# Extract function/class signatures via ripgrep
rg "^export |^class |^function |^def |^func |^type |^interface |^const " \
  --type-add 'src:*.{ts,js,py,go,rs,java}' -t src \
  --no-heading -l | head -30

# Map import/dependency graph (find most-imported modules)
rg "^import |^from |require\(" -l | head -30
```

**Write repo map to report file immediately — do not hold raw output in context.**

Include in report:

- Project type (library, API, CLI, SaaS, etc.)
- Language/framework stack
- Key entry points
- Top-level exported symbols

---

## Phase 3: Targeted Search (~5K tokens)

**Goal:** Use search tools to find specific patterns WITHOUT reading full files.

```bash
# Find entry points from manifest
# (read manifest → extract main/bin/scripts → note filenames)

# Find API routes / endpoints
rg "app\.(get|post|put|delete|use)\(" -l    # Express
rg "@app\.(route|get|post)" -l              # Flask/FastAPI
rg "router\.(get|post|put)" -l             # Other routers

# Find test patterns
rg "describe\(|it\(|test\(|def test_" -l | head -20

# Find configuration patterns
rg "process\.env\.|os\.environ\." -l | head -20

# Find database/storage patterns
rg "db\.(query|find|select)|mongoose\.|prisma\." -l | head -20
```

**Write search findings to report. Move to Phase 4 only for files identified by search.**

---

## Phase 4: Selective Deep Reads (~15K tokens, MAX 10 files)

**Rules:**

1. NEVER read a file without a specific question to answer
2. ALWAYS use `Read` with `offset/limit` — never read entire large files
3. Maximum 200 lines per read operation
4. Maximum 10 files total in this phase
5. After reading each file, write a 2-3 sentence summary to report IMMEDIATELY

**Pattern:**

```bash
# Step 1: Find the exact line number of what you need
rg -n "function processOrder" src/core/engine.ts

# Step 2: Read only that section
# Read({ file_path: "src/core/engine.ts", offset: 142, limit: 50 })

# Step 3: Write finding to report file immediately
# Write 2-3 sentence summary before reading next file
```

**If context exceeds 60K tokens after this phase:**

```javascript
Skill({ skill: 'token-saver-context-compression' });
```

---

## Phase 5: Cross-Reference (~5K tokens)

**Goal:** Understand component connections without reading more files.

```bash
# Find all callers of a key function
rg "processOrder\(" -l

# Find all implementations of a pattern
rg "implements OrderProcessor" -l

# Trace data flow
rg "db\.(query|find|select|get)" -l

# Find circular dependencies (who imports whom)
rg "require\('./auth'\|from './auth'" -l
```

**If LSP tools are available (TypeScript/JavaScript projects):**

```javascript
// lsp_goToDefinition — find where a symbol is defined
// lsp_findReferences — find all usages
// lsp_incomingCalls — who calls this function?
// lsp_outgoingCalls — what does this function call?
// Note: LSP requires a running language server; fall back to ripgrep if empty results
```

**Write dependency/call flow diagram (text-based) to report.**

---

## Phase 6: Synthesis Checkpoint (~2K tokens)

**Goal:** Free context by writing all findings to report file.

```bash
# Write comprehensive report to .claude/context/tmp/ or .claude/context/reports/
# Include: project type, architecture, key features (file:line refs), dependencies, test coverage
```

**Report structure:**

```markdown
# Codebase Analysis: [Project Name]

## Project Profile
- Type: [library/API/CLI/SaaS/etc]
- Language: [primary language + version]
- Framework: [frameworks detected]
- Entry points: [file:line refs]

## Architecture
[Text diagram of key components and connections]

## Key Findings
1. [Finding with file:line reference]
2. [Finding with file:line reference]

## Dependencies
- Production: [key deps]
- Dev: [key deps]

## Test Coverage Assessment
- Test files: [count, location]
- Framework: [jest/pytest/etc]

## Unknowns / Follow-up Questions
- [What couldn't be determined without deeper analysis]
```

**Return to caller:** file path + 5-bullet summary (max 500 chars). Do NOT inline the full report.

---

## Tool Selection Matrix (External Repos)

| Need | Tool | Why |
|------|------|-----|
| File discovery | `Glob` | Fast pattern matching |
| Content search | `Grep` (ripgrep) | Regex across whole repo |
| Targeted read | `Read` with `offset/limit` | Windowed, token-efficient |
| Structure patterns | `ast-grep` (if installed) | Language-aware |
| Definitions | LSP (if server available) | Compiler-level accuracy |
| External context | `WebFetch` + docs URL | Find docs, articles about the project |
| Compression | `token-saver-context-compression` | When >60K tokens |

**Tools NOT available for external repos:**

- `pnpm search:code` — requires index build (internal repo only)
- `pnpm search:structure` — internal repo only
- Semantic search — requires vector embeddings

---

## Anti-Patterns

- **NEVER** read files breadth-first — always search-first, read-selectively
- **NEVER** accumulate raw tool output in context — write findings to files immediately
- **NEVER** read entire large files — use `offset/limit` for all reads (max 200 lines)
- **NEVER** guess at file contents — use `rg -n` to find exact line numbers first
- **NEVER** proceed past 60K tokens without invoking `token-saver-context-compression`
- **NEVER** read more than 10 files in Phase 4

## Iron Laws

1. **ALWAYS** write findings to a report file after each phase — not at the end; raw tool output accumulated in context triggers "lost in the middle" degradation.
2. **ALWAYS** use `offset/limit` on `Read` for any file over 200 lines — full-file reads of large files consume 5-15K tokens in a single operation.
3. **NEVER** start Phase 4 without completing Phase 3 search — reading files without search context is breadth-first anti-pattern.
4. **ALWAYS** invoke `token-saver-context-compression` when context exceeds 60K tokens — not after; at the boundary.
5. **ALWAYS** return only a file path + 5-bullet summary — the report file is the artifact, not the inline response.

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "codebase exploration external repo analysis"
```

Read `.claude/context/memory/learnings.md`
Read `.claude/context/memory/decisions.md`

**After completing:**

- New exploration pattern → `.claude/context/memory/learnings.md`
- Tool limitation discovered → `.claude/context/memory/issues.md`
- Decomposition decision → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
