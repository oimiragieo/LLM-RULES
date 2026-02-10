---
name: ripgrep
description: Enhanced code search with custom ripgrep binary supporting ES module extensions and advanced patterns.
version: 1.0.0
model: sonnet
invoked_by: user
user_invocable: true
tools: [Read, Write, Edit]
---

# Ripgrep Skill

<identity>
Enhanced code search with ripgrep binary. NOTE: Prefer `pnpm search:code` for discovery/ranking and smaller output payloads; prefer raw `rg` for fastest exact literal matching.
</identity>

<capabilities>
- **DEPRECATED**: Use `pnpm search:code "query"` instead (hybrid ripgrep + embeddings)
- Raw ripgrep access for advanced regex patterns (PCRE2 with -P flag)
- Custom file type definitions via .ripgreprc
- Integration with .gitignore and custom ignore patterns
</capabilities>

## ⚡ RECOMMENDED: Hybrid Lazy Code Search (Instant, No Batch Indexing)

Use the hybrid lazy search system for day-to-day code discovery:

- **Instant**: search works immediately with no warm-up indexing pass
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

1. Pre-prompt hook analyzes repository structure using ripgrep (~0.5s)
2. `search:code` executes fast text matching via ripgrep
3. Optional semantic embeddings add similarity-based ranking
4. Post-edit hook incrementally embeds only changed files
5. RRF merges text and semantic rankings into a single ordered result set

### Configuration

```bash
# Disable semantic search (text-only, fastest)
HYBRID_EMBEDDINGS=off

# Enable semantic search (requires LanceDB)
HYBRID_EMBEDDINGS=on

# Disable daemon transport (direct CLI execution)
HYBRID_SEARCH_DAEMON=off

# Auto-prewarm daemon on startup
HYBRID_DAEMON_PREWARM=true

# Daemon idle timeout in ms (default 600000)
HYBRID_DAEMON_IDLE_MS=600000
```

### Daemon + Prewarm Runbook

```bash
# Start, verify, prewarm
pnpm search:daemon:start
pnpm search:daemon:status
pnpm search:daemon:prewarm

# Search (daemon path)
pnpm search:code "authentication logic"

# Stop daemon
pnpm search:daemon:stop
```

Expected latency profile on this repository:

- Cold daemon first query (no prewarm): ~1.35s avg
- First query after prewarm: ~0.40s avg
- Warm repeated daemon queries: ~0.18-0.19s
- Direct mode (`HYBRID_SEARCH_DAEMON=off`): ~0.73s avg for repeated CLI calls

### Comparison with Batch Indexing

| Approach           | Startup   | First Search        | Memory | Disk   |
| ------------------ | --------- | ------------------- | ------ | ------ |
| Old Batch Indexing | 2+ hours  | Instant after index | 8-16GB | 2-5GB  |
| Hybrid Lazy Search | 0 seconds | ~0.5s               | <500MB | <100MB |

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

### Real-World Scenario Playbook (Tested Patterns)

Use these scenario patterns to choose the right search path quickly.

#### Scenario 1: Incident Triage (Unknown Root Cause)

Goal: find likely hotspots for a production symptom quickly without flooding context.

```bash
# 1) Start broad and semantic
pnpm search:code "task status not updating after completion"

# 2) Pivot to exact symbol checks once candidates appear
pnpm search:code "TaskUpdate("
```

Pattern:

- Start with `search:code` for intent-level recall.
- Narrow with literal/symbol queries once candidate files are identified.

#### Scenario 2: Fast Exact Lookup (You Know the Identifier)

Goal: locate exact definitions/usages as fast as possible.

```bash
# Repo-wide exact literal (stable example in this repo)
rg -F "TaskUpdate(" -g "*.cjs" -g "*.js" -g "*.ts" .

# Single-file exact lookup (fastest path)
rg -F "spawnSync" .claude/skills/skill-creator/scripts/create.cjs
```

Pattern:

- Use raw `rg -F` for exact symbol searches, especially for large files or known paths.

#### Scenario 3: Safe Refactor Prep

Goal: enumerate callsites before renaming or behavior changes.

```bash
# 1) Gather broad callsites
pnpm search:code "TaskUpdate completed status workflow"

# 2) Confirm exact callsites and edge usage
rg -F "TaskUpdate(" -g "*.cjs" -g "*.js" -g "*.ts"
```

Pattern:

- Hybrid first to find semantic variants.
- Raw `rg` second for deterministic callsite inventory.

#### Scenario 4: Security Audit Sweep

Goal: detect risky patterns and confirm exact high-confidence matches.

```bash
# Concept discovery (broad)
pnpm search:code "command injection shell true spawn"

# Exact dangerous usage checks
rg -F "shell: true" -g "*.cjs" -g "*.js"
rg -F "spawnSync(" -g "*.cjs" -g "*.js"
```

Pattern:

- Hybrid surfaces related risky code.
- Exact `rg` validates actionable matches for remediation.

#### Scenario 5: Architecture Onboarding (New Contributor/Agent)

Goal: understand structure before making changes.

```bash
# High-level map
pnpm search:structure

# Focused concept entry points
pnpm search:code "routing guard task lifecycle"
pnpm search:code "memory scheduler session context"
```

Pattern:

- Use structure first, then concept search by subsystem intent.

#### Scenario 6: Token-Constrained Agent Workflow

Goal: minimize prompt/context bloat while maintaining retrieval quality.

```bash
# Keep semantic off by default for speed and concise output
HYBRID_EMBEDDINGS=off pnpm search:code "workflow task completion guard"

# Enable semantic only when lexical matches are weak
HYBRID_EMBEDDINGS=on pnpm search:code "why task completion silently fails"
```

Pattern:

- Default to `HYBRID_EMBEDDINGS=off`.
- Turn on embeddings only for intent-heavy or poor lexical queries.
- If `HYBRID_EMBEDDINGS=off` returns no hits, re-run immediately with `HYBRID_EMBEDDINGS=on`.

### Reusable Query Patterns

- Concept query: `"authentication flow refresh token validation"`
- Mixed query: `"TaskUpdate completed status"`
- Exact query: `"TaskUpdate("` (prefer `rg -F` when speed is critical)
- Structure query: use `pnpm search:structure` before large edits
- File drill-down: `pnpm search:file <path> <startLine> <endLine>`

**Only use raw ripgrep (below) for:**

- Advanced PCRE2 regex patterns (lookahead/lookbehind)
- Custom file type filtering not supported by `search:code`
- Pipeline integration with other CLI tools

<instructions>
<execution_process>

## Overview

This skill provides access to ripgrep (rg) via the `@vscode/ripgrep` npm package, which automatically downloads the correct binary for your platform (Windows, Linux, macOS). Enhanced file type support for modern JavaScript/TypeScript projects.

**Binary Source**: `@vscode/ripgrep` npm package (cross-platform, auto-installed)

- Automatically handles Windows, Linux, macOS binaries
- No manual binary management required

**Optional Config**: `bin/.ripgreprc` (if present, automatically used)

## Why Use This Over Built-in Grep Tool?

| Feature                | Ripgrep Skill             | Built-in Grep Tool         |
| ---------------------- | ------------------------- | -------------------------- |
| ES Module Support      | ✅ .mjs, .cjs, .mts, .cts | ❌ Limited                 |
| Performance            | ✅ 10-100x faster         | ⚠️ Slower on large repos   |
| Gitignore Respect      | ✅ Automatic              | ⚠️ Manual filtering needed |
| Binary File Detection  | ✅ Automatic              | ❌ None                    |
| PCRE2 Advanced Regexes | ✅ With `-P` flag         | ❌ Limited                 |
| Custom Config          | ✅ .ripgreprc support     | ❌ None                    |

## Quick Start Commands

### Basic Search

```bash
# Search for pattern in all files
node .claude/skills/ripgrep/scripts/search.mjs "pattern"

# Search specific file types
node .claude/skills/ripgrep/scripts/search.mjs "pattern" -tjs
node .claude/skills/ripgrep/scripts/search.mjs "pattern" -tts

# Case-insensitive search
node .claude/skills/ripgrep/scripts/search.mjs "pattern" -i

# Search with context lines
node .claude/skills/ripgrep/scripts/search.mjs "pattern" -C 3
```

### Quick Search Presets

```bash
# Search JavaScript files (includes .mjs, .cjs)
node .claude/skills/ripgrep/scripts/quick-search.mjs js "pattern"

# Search TypeScript files (includes .mts, .cts)
node .claude/skills/ripgrep/scripts/quick-search.mjs ts "pattern"

# Search all .mjs files specifically
node .claude/skills/ripgrep/scripts/quick-search.mjs mjs "pattern"

# Search .claude directory for hooks
node .claude/skills/ripgrep/scripts/quick-search.mjs hooks "pattern"

# Search .claude directory for skills
node .claude/skills/ripgrep/scripts/quick-search.mjs skills "pattern"

# Search .claude directory for tools
node .claude/skills/ripgrep/scripts/quick-search.mjs tools "pattern"

# Search .claude directory for agents
node .claude/skills/ripgrep/scripts/quick-search.mjs agents "pattern"

# Search all files (no filter)
node .claude/skills/ripgrep/scripts/quick-search.mjs all "pattern"
```

## Common Patterns

### File Type Searches

```bash
# JavaScript files (includes .js, .mjs, .cjs)
rg "function" -tjs

# TypeScript files (includes .ts, .mts, .cts)
rg "interface" -tts

# Config files (.yaml, .yml, .toml, .ini)
rg "port" -tconfig

# Markdown files (includes .md, .mdc)
rg "# Heading" -tmd
```

### Advanced Regex

```bash
# Word boundary search
rg "\bfoo\b"

# Case-insensitive
rg "pattern" -i

# Smart case (case-insensitive unless uppercase present)
rg "pattern" -S  # Already default in .ripgreprc

# Multiline search
rg "pattern.*\n.*another" -U

# PCRE2 lookahead/lookbehind
rg -P "foo(?=bar)"        # Positive lookahead
rg -P "foo(?!bar)"        # Negative lookahead
rg -P "(?<=foo)bar"       # Positive lookbehind
rg -P "(?<!foo)bar"       # Negative lookbehind
```

### Filtering

```bash
# Exclude directories
rg "pattern" -g "!node_modules/**"
rg "pattern" -g "!.git/**"

# Include only specific directories
rg "pattern" -g ".claude/**"

# Exclude specific file types
rg "pattern" -Tjs  # Exclude JavaScript

# Search hidden files
rg "pattern" --hidden

# Search binary files
rg "pattern" -a
```

### Context and Output

```bash
# Show 3 lines before and after match
rg "pattern" -C 3

# Show 2 lines before
rg "pattern" -B 2

# Show 2 lines after
rg "pattern" -A 2

# Show only filenames with matches
rg "pattern" -l

# Show count of matches per file
rg "pattern" -c

# Show line numbers (default in .ripgreprc)
rg "pattern" -n
```

## PCRE2 Advanced Patterns

Enable PCRE2 mode with `-P` for advanced features:

### Lookahead and Lookbehind

```bash
# Find "error" only when followed by "critical"
rg -P "error(?=.*critical)"

# Find "test" not followed by ".skip"
rg -P "test(?!\.skip)"

# Find words starting with capital after "Dr. "
rg -P "(?<=Dr\. )[A-Z]\w+"

# Find function calls not preceded by "await "
rg -P "(?<!await )\b\w+\("
```

### Backreferences

```bash
# Find repeated words
rg -P "\b(\w+)\s+\1\b"

# Find matching HTML tags
rg -P "<(\w+)>.*?</\1>"
```

### Conditionals

```bash
# Match IPv4 or IPv6
rg -P "(\d{1,3}\.){3}\d{1,3}|([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}"
```

## Integration with Other Tools

### With fzf (Interactive Search)

```bash
# Search and interactively select file
rg --files | fzf

# Search pattern and open in editor
rg "pattern" -l | fzf | xargs code
```

### With vim

```bash
# Set ripgrep as grep program in .vimrc
set grepprg=rg\ --vimgrep\ --smart-case\ --follow
```

### Pipeline with Other Commands

```bash
# Search and count unique matches
rg "pattern" -o | sort | uniq -c

# Search and replace preview
rg "old" -l | xargs sed -i 's/old/new/g'
```

## Performance Optimization

### Tips for Large Codebases

1. **Use file type filters**: `-tjs` is faster than searching all files
2. **Exclude large directories**: `-g "!node_modules/**"`
3. **Use literal strings when possible**: `-F "literal"` (disables regex)
4. **Enable parallel search**: Ripgrep uses all cores by default
5. **Use .gitignore**: Ripgrep respects .gitignore automatically

### Benchmarks

Ripgrep is typically:

- **10-100x faster** than grep
- **5-10x faster** than ag (The Silver Searcher)
- **3-5x faster** than git grep

## Custom Configuration

The optional `.ripgreprc` file at `bin/.ripgreprc` (if present) contains:

```
# Extended file types
--type-add=js:*.mjs
--type-add=js:*.cjs
--type-add=ts:*.mts
--type-add=ts:*.cts
--type-add=md:*.mdc
--type-add=config:*.yaml
--type-add=config:*.yml
--type-add=config:*.toml
--type-add=config:*.ini

# Default options
--smart-case
--follow
--line-number
```

## Framework-Specific Patterns

### Searching .claude Directory

```bash
# Find all hooks
rg "PreToolUse\|PostToolUse" .claude/hooks/

# Find all skills
rg "^# " .claude/skills/ -tmd

# Find agent definitions
rg "^name:" .claude/agents/ -tmd

# Find workflow steps
rg "^### Step" .claude/workflows/ -tmd
```

### Common Agent Studio Searches

```bash
# Find all TaskUpdate calls
rg "TaskUpdate\(" -tjs -tts

# Find all skill invocations
rg "Skill\(\{" -tjs -tts

# Find all memory protocol sections
rg "## Memory Protocol" -tmd

# Find all BLOCKING enforcement comments
rg "BLOCKING|CRITICAL" -C 2
```

</execution_process>

<best_practices>

1. **Use file type filters** (`-tjs`, `-tts`) for faster searches
2. **Respect .gitignore** patterns (automatic by default)
3. **Use smart-case** for case-insensitive search (default in config)
4. **Enable PCRE2** (`-P`) only when advanced features needed
5. **Exclude large directories** with `-g "!node_modules/**"`
6. **Use literal search** (`-F`) when pattern has no regex
7. **Binary automatically managed** via `@vscode/ripgrep` npm package
8. **Use quick-search presets** for common .claude directory searches
   </best_practices>
   </instructions>

<examples>
<usage_example>
**Search for all TaskUpdate calls in the project:**

```bash
node .claude/skills/ripgrep/scripts/search.mjs "TaskUpdate" -tjs -tts
```

**Find all security-related hooks:**

```bash
node .claude/skills/ripgrep/scripts/quick-search.mjs hooks "security|SECURITY" -i
```

**Search for function definitions with PCRE2:**

```bash
node .claude/skills/ripgrep/scripts/search.mjs -P "^function\s+\w+\(" -tjs
```

</usage_example>
</examples>

## Binary Management

The search scripts use `@vscode/ripgrep` npm package which automatically:

- Detects your platform (Windows, Linux, macOS)
- Downloads the correct binary during `pnpm install`
- Handles all architecture variants (x64, ARM64, etc.)

No manual binary management required - the npm package handles everything automatically.

## Related Skills

- [`grep`](../grep/SKILL.md) - Built-in Claude Code grep (simpler, less features)
- [`glob`](../glob/SKILL.md) - File pattern matching

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
