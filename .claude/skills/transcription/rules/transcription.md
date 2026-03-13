# Transcription Rules

## Core Principles

- Always use `faster-whisper` backend by default — it is 4x faster than `openai-whisper` on the same hardware
- Never pass user-provided file paths directly to shell commands without validation — validate path exists before execution
- For GPU transcription, confirm CUDA/ROCm availability before specifying `--device cuda`
- For Apple Silicon, use `--device mlx` — it is the fastest option on that platform
- Use `--output_dir` always — never rely on default cwd output placement

## Anti-Patterns

- Do NOT use `transcribe-anything` via `shell: true` — always use `spawn` with array args (`shell: false`)
- Do NOT hardcode `--hf_token` values in prompts or scripts — read from environment variables
- Do NOT assume language — let auto-detection run unless the source language is known with confidence
- Do NOT use `tiny` model for production transcription — accuracy is too low for most use cases
- Do NOT process audio files larger than 90MB with Groq without chunking — the package handles this automatically

## Model Selection Guide

| Use Case | Recommended Model | Reason |
|----------|------------------|--------|
| Quick/draft | small | Speed priority |
| General purpose | large-v3 | Best accuracy/speed balance |
| Technical content | large-v3 + --initial_prompt | Domain vocabulary helps |
| Low-resource devices | medium | Balance of resources |

## Integration Points

- `ai-ml-expert` agent — use for multi-model pipelines that include transcription
- `researcher` agent — use when transcribing research talks or lectures
- `developer` agent — use for integration into Python/Node workflows
- `markitdown-converter` skill — combine for audio → Markdown conversion pipelines
