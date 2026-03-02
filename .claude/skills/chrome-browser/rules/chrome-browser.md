# chrome-browser Rules

## Purpose

Browser automation with two integrations - Chrome DevTools MCP (always available, performance tracing) and Claude-in-Chrome extension (authenticated sessions, GIF recording). Use DevTools for testing/debugging, Claude-in-Chrome for authenticated workflows.

## Best Practices

- Use Chrome DevTools MCP for testing and debugging (always available)
- Use Claude-in-Chrome for authenticated workflows (Google Docs, Gmail)
- Filter console output with patterns to avoid verbosity
- Dismiss modal dialogs manually if they appear

## Integration Points

See SKILL.md for complete documentation.
