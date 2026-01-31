# Code Index Auto-Update System

## Overview

The code semantic search index is automatically updated when source code files are modified, ensuring search results stay current without manual intervention.

## How It Works

### Automatic Updates via Hooks

**PostToolUse Hook** (`.claude/hooks/routing/code-index-updater.cjs`)

- **Trigger**: Runs automatically after `Write` or `Edit` operations
- **Behavior**:
  - Detects when code files (`.js`, `.ts`, `.py`, etc.) are modified
  - Debounces rapid changes (5 second window) to avoid excessive indexing
  - Triggers incremental index update for modified files
  - Fails gracefully if index system unavailable (doesn't block file operations)

### File Detection

The hook automatically indexes these file types:

- **JavaScript/TypeScript**: `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`
- **Python**: `.py`
- **Go**: `.go`
- **Rust**: `.rs`
- **Java**: `.java`
- **C#**: `.cs`
- **Ruby**: `.rb`
- **PHP**: `.php`
- **Swift**: `.swift`
- **Kotlin**: `.kt`
- **C/C++**: `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`

**Excluded automatically:**

- `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `coverage/`
- Minified/bundled files (`.min.js`, `.bundle.js`, `.map`)
- The index directory itself (`.claude/context/code-index/`)

## Configuration

### Environment Variables

```bash
# Disable automatic indexing
CODE_INDEX_AUTO_UPDATE=off

# Adjust debounce interval (default: 5000ms)
CODE_INDEX_DEBOUNCE_MS=3000
```

### Hook Configuration

The hook is registered in `.claude/settings.json`:

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "node .claude/hooks/routing/code-index-updater.cjs"
        }
      ]
    }
  ]
}
```

## Workflow

### Normal Operation

1. **Agent writes/edits code file** → `Write` or `Edit` tool executes
2. **PostToolUse hook triggers** → `code-index-updater.cjs` runs
3. **File detection** → Checks if file should be indexed
4. **Debounce** → Waits 5 seconds for additional changes
5. **Index update** → Re-indexes directory containing modified file
6. **Search ready** → Updated index available for semantic search

### Debouncing

Multiple rapid file changes are batched together:

- **First change**: Starts 5-second timer
- **Subsequent changes**: Reset timer, add files to batch
- **After 5 seconds**: Process all pending updates together

This prevents excessive indexing when:

- Multiple files edited in quick succession
- Auto-formatting triggers multiple writes
- Batch refactoring operations

## Manual Indexing

You can still manually trigger full indexing:

```bash
# Full index rebuild
node .claude/tools/cli/index-codebase.cjs index

# Index specific directory
node .claude/tools/cli/index-codebase.cjs index ./src

# Check index status
node .claude/tools/cli/index-codebase.cjs status
```

## Performance Considerations

### Current Implementation

- **Incremental updates**: Currently re-indexes the directory containing modified files
- **Background processing**: Indexing happens asynchronously (doesn't block file operations)
- **Fail-open**: If indexing fails, file operations still succeed

### Future Enhancements

When `IndexMaintainer` is implemented (from design docs):

- **True incremental updates**: Only re-index changed files using Merkle tree change detection
- **File-level updates**: Update single file instead of entire directory
- **Merkle tree optimization**: O(log n) change detection instead of full directory scan

## Troubleshooting

### Index Not Updating

1. **Check hook is enabled**:

   ```bash
   echo $CODE_INDEX_AUTO_UPDATE  # Should be empty or not "off"
   ```

2. **Check hook is registered**:

   ```bash
   grep "code-index-updater" .claude/settings.json
   ```

3. **Check file type**: Only code files are indexed (see File Detection above)

4. **Check index exists**:
   ```bash
   node .claude/tools/cli/index-codebase.cjs status
   ```
   If no index exists, run manual index first:
   ```bash
   node .claude/tools/cli/index-codebase.cjs index
   ```

### Index Updates Too Slow

- **Reduce debounce**: Set `CODE_INDEX_DEBOUNCE_MS=2000` for faster updates
- **Disable auto-update**: Set `CODE_INDEX_AUTO_UPDATE=off` and use manual indexing
- **Check file count**: Large directories take longer to index

### Index Updates Too Frequent

- **Increase debounce**: Set `CODE_INDEX_DEBOUNCE_MS=10000` for less frequent updates
- **Disable for specific operations**: Temporarily set `CODE_INDEX_AUTO_UPDATE=off`

## Integration with Semantic Search

Once the index is updated, agents can immediately use semantic search:

```javascript
// Agent invokes semantic search skill
Skill({ skill: 'code-semantic-search', args: 'find authentication logic' });

// Results include newly indexed code automatically
```

## Related Documentation

- **Index Design**: `.claude/docs/CODE_INDEXING_DESIGN.md`
- **CLI Tool**: `.claude/tools/cli/index-codebase.cjs`
- **Index Manager**: `.claude/lib/code-indexing/index-manager.cjs`
- **Semantic Search Skill**: `.claude/skills/code-semantic-search/SKILL.md`
