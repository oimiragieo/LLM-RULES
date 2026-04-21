<!-- Agent: developer | Task: #4 | Session: 2026-02-23 -->

# omega-claude-cli Skill Update Report

**Date:** 2026-02-23
**Skill:** omega-claude-cli
**Version:** 1.0.0 → 2.0.0

## Summary

- Upgraded SKILL.md from v1.0.0 to v2.0.0 with `verified: true` and `lastVerifiedAt: 2026-02-23T00:00:00.000Z`
- Added 25+ Native CLI flags table covering `--output-format json/stream-json`, `--json-schema`, `--allowedTools`, `--disallowedTools`, `--permission-mode`, `--continue`, `--resume`, `--fork-session`, `--max-turns`, `--max-budget-usd`, `--mcp-config`, `--betas`, and more
- Added Permission Modes table documenting `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions` with use-case guidance
- Added JSON Output Structure section, Multi-Turn Sessions examples, Anti-Patterns table (6 entries), Environment Variables table, and `<identity>`/`<capabilities>` sections
- Added two Iron Laws (#6 plan mode for read-only analysis, #7 injection risk with untrusted prompts) and updated `-p` mode terminology to official "Agent SDK" naming

## Files Modified

- `.claude/skills/omega-claude-cli/SKILL.md`
