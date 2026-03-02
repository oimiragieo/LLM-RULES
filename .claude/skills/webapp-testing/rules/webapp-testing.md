# webapp-testing Rules

## Purpose

Test local web applications using Playwright with Python. Verify frontend functionality, debug UI behavior, capture screenshots, and view browser console logs. Supports static HTML files, dynamic webapps with running servers, and automated test generation.

## Best Practices

- Always run helper scripts with --help first before reading source code
- Wait for networkidle state before inspecting dynamic content
- Use CSS selectors over XPath for element discovery
- Capture screenshots at key interaction points for visual verification
- Check browser console logs for JavaScript errors alongside visual checks

## Integration Points

See SKILL.md for complete documentation.
