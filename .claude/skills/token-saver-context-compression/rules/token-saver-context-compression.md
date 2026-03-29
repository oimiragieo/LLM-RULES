# token-saver-context-compression Rules

## Purpose

Context window optimization by compressing large payloads before reasoning. Alias for context-compressor skill.

## Best Practices

- Compress when approaching token budget limits (80K+)
- Preserve critical information during compression
- Use summarization for large file reads
- Apply during multi-agent context handoff

## Integration Points

See SKILL.md and context-compressor skill for complete documentation.
