# omega-codex-cli Rules

## Purpose

Shell out to OpenAI Codex CLI for headless code generation, analysis, and question-answering. Optimized for code tasks. Requires OPENAI_API_KEY env var.

## Models

- **Default:** `codex-mini-latest` (fine-tuned o4-mini, low-latency, $1.50/$6 per 1M tokens with 75% caching discount)
- **GPT-5.4:** `gpt-5.4` — 1M context, computer-use, state-of-the-art coding (released ~2026-03-05); pass via `--model gpt-5.4`
- **GPT-5.4 Pro:** `gpt-5.4-pro` — higher capacity variant; use for research/benchmark tasks
- Do not override the default unless you need GPT-5.4's extended context or computer-use capability

## Best Practices

- Always run verify-setup.mjs before first invocation
- Ensure OPENAI_API_KEY env var is set before use
- Use --json for JSONL event stream output in automation pipelines
- Use --timeout-ms for long-running tasks to prevent hangs
- Use --sandbox for isolated workspace-write mode
- Use --model gpt-5.4 for tasks requiring 1M context or computer-use agentic flows

## Integration Points

See SKILL.md for complete documentation.
