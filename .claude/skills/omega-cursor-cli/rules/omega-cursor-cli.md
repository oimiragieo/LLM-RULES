# omega-cursor-cli Rules

## Purpose

Shell out to Cursor Agent CLI for headless IDE-aware code tasks. Supports multi-model routing (auto mode routes to Claude, Gemini, GPT). Requires Cursor Pro/Business subscription.

## Best Practices

- Always run verify-setup.mjs before first invocation
- Cursor subscription is required -- most restrictive availability of all omega tools
- Use --yolo for non-interactive headless mode (auto-approves all tool calls)
- Use --trust for workspace trust without prompting
- Use auto model for Cursor's intelligent model routing

## Integration Points

See SKILL.md for complete documentation.
