# Prompt Caching Notes

Use this note when the user cares about cost reduction across repeated prompts, not just one-off compression.

## Stability hierarchy

Arrange prompt content from most stable to most volatile:

1. tool definitions
2. system instructions
3. compressed context or RAG payload
4. few-shot examples
5. chat history
6. dynamic metadata
7. immediate user query

Why this matters: prompt caching is based on exact prefix reuse. If volatile text appears early, the expensive prefix stops being reusable.

## Practical policy

- Put large compressed context before the newest user question.
- Keep timestamps, UUIDs, request IDs, and session metadata near the end.
- Prefer deterministic serialization for stable sections.
- For repeated workflows, reuse the same stable prefix layout whenever possible.

## Provider telemetry fields worth watching

| Provider       | Field                                       |
| -------------- | ------------------------------------------- |
| Claude         | `cache_read_input_tokens`                   |
| OpenAI / Codex | `usage.prompt_tokens_details.cached_tokens` |
| Gemini         | `cachedContentTokenCount`                   |

If those stay at zero across repeated prompts with the same stable prefix, the harness or prompt assembly is likely invalidating cache reuse.

## Repo concepts reflected by this skill

This skill package is the lightweight local surface of the bigger project. The broader repo also includes:

- stable-prefix cacheability audits
- provider/harness compatibility guidance
- deterministic `prompt_cache_key` helpers
- history compaction that keeps recent volatile turns at the tail

Use the skill when you want local compression help. Use the full repo and docs when you need deeper observability or MCP-based automation.
