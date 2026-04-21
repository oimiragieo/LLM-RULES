# omega-gemini-cli Skill Update Report

<!-- Agent: developer | Task: #1 | Session: 2026-02-23 -->

**Date:** 2026-02-23
**Skill:** omega-gemini-cli
**Version:** 2.0.0 → 2.1.0
**Status:** UPDATED

## Summary (5 bullets)

- **Gemini 3 models added as default**: Added `gemini-3-pro`, `gemini-3-flash`, `gemini-3.1-pro-preview` to the models table; noted that Gemini 3 is now enabled by default since CLI v0.29.0, replacing Gemini 2.5 as the primary tier.
- **Model aliases documented**: Added `auto` (intelligent routing), `pro`, `flash`, `flash-lite` shorthand aliases supported natively by the CLI — `auto` performs smart routing between Flash and Pro based on task complexity.
- **Deprecated flags flagged and Iron Laws updated**: `--allowed-tools` is now deprecated (replaced by `--policy`); `--all-files`/`-a` is fully REMOVED in current versions; `--telemetry-*` flags removed (use env vars). Two new Iron Laws added (7 and 8) covering these deprecations.
- **New CLI flags and commands documented**: Added full native flag table including `--approval-mode` (preferred over `--yolo`), `--output-format stream-json` (JSONL streaming), `--resume`, `--prompt-interactive`, `--list-sessions`, `--delete-session`, `--policy`; documented interactive slash commands `/logout`, `/plan`, `/rewind`, `/prompt-suggest`.
- **JSON output stats field and Anti-Patterns section added**: Updated JSON envelope docs to reflect the new `stats` field (token usage + latency); added a complete Anti-Patterns table covering deprecated flag misuse, model selection patterns, and `/logout` scope limitations.

## What Was Confirmed Current

- Core `ask-gemini.mjs` wrapper pattern (stdin prompt delivery) remains correct and up to date
- `--yolo` flag still works as a legacy alias (no change to existing scripts required)
- Exit codes 41, 42, 44, 52, 53 confirmed still valid
- npx fallback mechanism confirmed still needed and correct
- Node.js 18+ script requirement / Node.js 20+ for the CLI itself confirmed
- Response time expectations (2–10 minutes) confirmed appropriate

## Deprecated Patterns Removed or Flagged

- `--allowed-tools` noted as DEPRECATED (now `--policy` engine)
- `--all-files` / `-a` noted as REMOVED (breaking change)
- `--telemetry-*` flags noted as REMOVED
- Model table no longer shows `gemini-3-pro-preview` / `gemini-3-flash-preview` (preview flags removed — now GA)

## Research Sources Consulted

- [Gemini CLI Release Notes](https://geminicli.com/docs/changelogs/)
- [Gemini CLI Headless Mode Reference](https://geminicli.com/docs/cli/headless/)
- [Gemini CLI Cheatsheet](https://geminicli.com/docs/cli/cli-reference/)
- [Gemini 3 on Gemini CLI](https://geminicli.com/docs/get-started/gemini-3/)
- [@google/gemini-cli npm package](https://www.npmjs.com/package/@google/gemini-cli) (v0.29.5 latest)
- [GitHub: google-gemini/gemini-cli releases](https://github.com/google-gemini/gemini-cli/releases)
