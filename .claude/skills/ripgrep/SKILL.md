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
Enhanced code search with custom ripgrep binary supporting ES module extensions (.mjs/.cjs/.mts/.cts) and advanced patterns.
</identity>

<capabilities>
- Fast recursive code search across project files
- Support for ES module extensions (.mjs, .cjs, .mts, .cts)
- Advanced regex patterns (PCRE2 with -P flag)
- Custom file type definitions via .ripgreprc
- Performance-optimized for large codebases
- Integration with .gitignore and custom ignore patterns
</capabilities>

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
