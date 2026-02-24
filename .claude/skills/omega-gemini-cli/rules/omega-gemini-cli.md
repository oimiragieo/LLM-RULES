# omega-gemini-cli Rules

## Purpose

Use when the user wants to use Google Gemini for analysis, large files or codebases, sandbox execution, or brainstorming. Uses headless Gemini CLI scripts (no MCP). Triggers on "use Gemini", "analyze with Gemini", "large file", "sandbox", "brainstorm with Gemini".

## Best Practices

- Always run verify-setup.mjs before first invocation to check CLI availability
- Use stdin prompt delivery (built into ask-gemini.mjs) -- never pass prompt as positional arg directly to gemini CLI
- For file review, embed file content in prompt text -- no dedicated --file flag exists
- Use --json flag for machine-parseable output (wraps response in {"response":"..."} envelope)
- Use --sandbox / -s flag for code execution tasks requiring isolated sandbox
- Use --model gemini-2.5-flash or gemini-2.5-flash-lite to reduce quota/latency
- Set user expectations: simple queries ~2 min, large file/codebase review ~5-10 min

## Integration Points

See SKILL.md for complete documentation.
