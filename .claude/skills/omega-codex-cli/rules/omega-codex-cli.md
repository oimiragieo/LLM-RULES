# omega-codex-cli Rules

## Purpose

Shell out to OpenAI Codex CLI for headless code generation, analysis, and question-answering. Optimized for code tasks. Requires OPENAI_API_KEY env var.

## Best Practices

- Always run verify-setup.mjs before first invocation
- Ensure OPENAI_API_KEY env var is set before use
- Use --json for JSONL event stream output in automation pipelines
- Use --timeout-ms for long-running tasks to prevent hangs
- Use --sandbox for isolated workspace-write mode

## Integration Points

See SKILL.md for complete documentation.
