<!-- Agent: developer | Task: #3 | Session: 2026-02-23 -->

# omega-codex-cli Skill Update Report

**Date:** 2026-02-23
**File:** `.claude/skills/omega-codex-cli/SKILL.md`
**Version:** 1.0.0 → 1.1.0

## Summary

- **Authentication expanded**: Added `CODEX_API_KEY` as the preferred CI env var (alongside `OPENAI_API_KEY`); documented `codex login`, `codex login --device-auth`, and `codex login --with-api-key` flows for ChatGPT-authenticated sessions (Plus/Pro/Team/Edu/Enterprise)
- **New flags documented**: Added `--ask-for-approval` (untrusted/on-request/never), `--add-dir`, `--oss` (Ollama), `--search`, `--image/-i`, `--output-last-message/-o`, `--output-schema`, `--ephemeral`, `--no-alt-screen`, `--enable/--disable`, and `--dangerously-bypass-approvals-and-sandbox` — none were in the original skill
- **Deprecated pattern removed**: `on-failure` approval mode is deprecated per official docs; replaced by `on-request` or `never`; noted as deprecated in the approval modes table
- **Model updated**: Added `gpt-5.3-codex` as the current primary model and `gpt-5.3-codex-spark` (Pro research preview); prior skill had no model guidance beyond the generic `--model MODEL` flag
- **New sections added**: Authentication (two paths: ChatGPT login vs API key), Approval Modes table, Sandbox Policies table, Session Management (`codex exec resume`), MCP Integration (`codex mcp list/add/remove`), Feature Flags (`codex features list/enable/disable`)

## Research Sources Consulted

- [OpenAI Codex CLI Reference](https://developers.openai.com/codex/cli/reference/) — canonical flag list
- [OpenAI Codex Non-Interactive Mode](https://developers.openai.com/codex/noninteractive) — `codex exec` specifics
- [OpenAI Codex CLI Features](https://developers.openai.com/codex/cli/features/) — sandbox/approval overview
- [Codex Models](https://developers.openai.com/codex/models/) — current model names
- [openai/codex GitHub README](https://github.com/openai/codex/blob/main/README.md) — installation methods

## What Was Confirmed Current

- `codex exec "PROMPT" --skip-git-repo-check` as the core headless invocation pattern
- `--json` / `--experimental-json` for JSONL event stream output
- `--sandbox workspace-write` as the safe default sandbox mode
- Cross-platform wrapper approach (cmd.exe on Windows, direct on Unix)
- `--timeout-ms` pattern (implemented in wrapper scripts, not a native flag)
