# omega-claude-cli Rules

## Purpose

Shell out to Claude Code CLI to invoke a second Claude session headlessly. Useful for cross-validation, second opinions, and isolated analysis without sharing current agent context. Requires Anthropic account.

## Best Practices

- Always run verify-setup.mjs before first invocation
- Use for second-opinion validation where context isolation matters
- Use --timeout-ms to prevent indefinite hangs
- --dangerously-skip-permissions is required for headless mode (already in wrapper)
- Use format-output.mjs to strip conversational text framing from JSON responses

## Integration Points

See SKILL.md for complete documentation.
