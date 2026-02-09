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

### Context Window Reality (2026 Research)

**Marketing vs Reality**:

- Models advertise 200K tokens but performance drops significantly past 32K
- Attention mechanisms degrade around 130K tokens (unreliable retrieval)
- "Lost in the middle" problem: middle tokens have lower recall than beginning/end

**Best Practices**:

- Keep active context under 32K tokens for reliable performance
- Past 100K tokens: expect 20-40% accuracy drop on retrieval tasks
- Use compression at 80K tokens, not 180K
- See `context-compressor` skill for compression strategies

### Semantic Caching

**Pattern**: Cache similar prompts to avoid redundant LLM calls.

**Implementation**:

- Hash prompt embeddings, not raw text (semantically similar = cache hit)
- 15-minute TTL for web fetch results (see WebFetch tool)
- Agent spawn prompts cache task context (reduce re-reads)

**Savings**: 50-70% reduction in LLM API calls for repeated operations

### RAG Over Long Context

**When to use RAG instead of stuffing context**:

- Document corpus > 100K tokens
- Need precise retrieval (needle in haystack)
- Budget constraints (RAG = cheaper than long context)

**Implementation**:

- Hybrid search (BM25 + semantic embeddings)
- See `pnpm search:code` for code search
- Vector stores in `.claude/context/data/` (LanceDB)

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

## Related References

- `context-compressor` skill - Progressive context compression strategies
- `.claude/lib/memory/` - Memory subsystem implementation
- `ADR-102` - Memory management rebuild (hierarchical tiers)
