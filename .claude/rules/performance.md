# Performance

## Hot Path Optimization

- Avoid unnecessary work in hot paths
- Cache expensive computations when safe
- Profile before optimizing (measure, don't guess)

## Token Budget & Context Management

- Keep prompts concise; remove redundant context
- Monitor context window usage (200K token budget)
- Use progressive disclosure for large skills/docs
- Compress context when approaching limits

## Code Indexing

- Use BM25-only mode for fast code search: `LANCEDB_EMBEDDING_MODE=off`
- Prefer `pnpm search:code` over manual grep for hybrid search
- Avoid loading unused modules (use lazy imports)

## Spawn Prompt Efficiency

- Keep spawn prompts under 2000 tokens
- Use template references instead of inline content
- Load skills on-demand via `Skill()` tool (not in spawn prompt)
- Remove prose/filler from prompts (directives only)

## Memory & Resource Management

- Clean up temporary files in `.claude/context/tmp/`
- Limit recursive operations (depth, timeout, max files)
- Use streaming for large file operations
