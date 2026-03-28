# Token Saver Context Compression

Alias for `context-compressor`. Provides context window optimization by compressing large payloads before reasoning.

## When to Use

- Context approaching budget limits (80K+ tokens)
- Large file reads that can be summarized
- Multi-agent pipelines with context handoff
- Any scenario where `context-compressor` would be used

## Usage

```javascript
Skill({ skill: 'context-compressor' });
```

This skill exists as a named alias so agents referencing `token-saver-context-compression` in their skills arrays resolve correctly. The implementation lives in `context-compressor`.
