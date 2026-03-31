---
description: Hook system rules and patterns for .claude/hooks/**
paths:
  - '.claude/hooks/**'
  - '.claude/settings.json'
---

# Hooks

## Core Rules

- Hooks must never break the tool pipeline
- Use stderr for logging; stdout for structured hook outputs only
- All hooks must handle errors gracefully (exit 0 on non-critical failures)

## Hook Protocol

- Hooks use **stdin/stdout JSON protocol**
- Input: JSON object via stdin with tool invocation details
- Output: JSON object via stdout with `{ allow: true/false, message?: string }`
- Exit codes: `0` = allow, `2` = block
- Never use blocking operations or network calls in pre-commit hooks

## Chain-of-Responsibility

Hooks execute in priority order (routing → safety → validation) via `.claude/settings.json`. Early exit on first block.

## Performance Budget

Target: <100ms per hook. Hooks block tool execution — slow hooks = slow workflows. `post-tool-metrics-unified.cjs` tracks execution time. Hook >500ms: investigate. Hook >1s: disable.

## Hook Organization

Hooks live in `.claude/hooks/` organized by concern:

- `routing/` - Agent routing and spawning validation
- `safety/` - File safety, path validation, Windows compatibility
- `validation/` - Input validation, schema validation
- `reflection/` - Reflection enforcement and verification
- `git/` - Git-related hooks (pre-commit, commit-msg)

## Creating New Hooks

- Use `hook-creator` skill; test with `pnpm test:hooks`; add try/catch wrapping

## Fail-Open vs Fail-Closed Policy

| Category                                 | Policy      | Exit Code         | Examples                                        |
| ---------------------------------------- | ----------- | ----------------- | ----------------------------------------------- |
| Security hooks (routing, creator, write) | Fail-closed | `process.exit(2)` | `routing-guard.cjs`, `write-pretool-bundle.cjs` |
| Advisory hooks (metrics, audit)          | Fail-open   | `process.exit(0)` | `post-tool-metrics-unified.cjs`                 |
| Post hooks (PostToolUse)                 | Fail-open   | `process.exit(0)` | `post-completion-chain.cjs`                     |

Security hooks that fail-open create bypass vectors (SEC-008).

## Related References

- `@ENFORCEMENT_HOOKS.md` - Complete hook catalog
- `.claude/hooks/` - Hook implementation directory
