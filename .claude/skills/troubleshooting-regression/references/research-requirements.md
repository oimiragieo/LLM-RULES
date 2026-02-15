# troubleshooting-regression Research Requirements

## Research Record

- Date: 2026-02-15
- Intent: design a low-overhead regression troubleshooting skill aligned with existing memory/search/token-saver guardrails.

## Exa-first Policy

- Preferred: Exa MCP (`mcp__exa__web_search_exa`, `mcp__exa__get_code_context_exa`) for current debugging/agent-orchestration patterns.
- Fallback: WebFetch + arXiv when Exa is unavailable.

## Evidence-backed constraints

1. Keep diagnosis deterministic and log-first to avoid speculative patching.
2. Prefer retrieval-first (`pnpm search:code`) before broad direct file reads in triage loops.
3. Use compression (`token-saver-context-compression`) only under context pressure; do not force it for small traces.

## Non-goals

- No autonomous remediation loop inside this skill.
- No replacement of existing router/task lifecycle hooks.
- No direct mutation of memory index internals.
