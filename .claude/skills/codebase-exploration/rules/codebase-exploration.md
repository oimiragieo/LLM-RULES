# codebase-exploration Rules

## Purpose

7-phase progressive exploration protocol for analyzing unfamiliar codebases.

## Best Practices

- Always estimate token budget before diving in
- Use search-first, read-selectively approach
- Write findings to report file after each phase
- Never read entire large files — use offset/limit
- Invoke context-compressor when context exceeds 60K tokens

## Phases

1. Scope Gate: Estimate token budget
2. Structure Scan: Build directory map
3. Repo Map Generation: Extract signatures
4. Targeted Search: Find specific patterns
5. Selective Deep Reads: Read up to 10 files
6. Cross-Reference: Understand connections
7. Synthesis Checkpoint: Write final report

## Integration Points

See SKILL.md for complete documentation.
