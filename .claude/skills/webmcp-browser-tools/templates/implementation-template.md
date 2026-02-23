# WebMCP Tool Registration — Implementation Template

Use this template when adding WebMCP tool registration to a web application.

## Vanilla JavaScript

```javascript
// webmcp-tools.js — register this at app initialization

const WEBMCP_TOOLS = [
  {
    name: '<tool-name>',
    description: '<What this tool does and when an agent should call it>',
    inputSchema: {
      type: 'object',
      properties: {
        '<param>': {
          type: 'string',
          description: '<What this parameter means>',
        },
      },
      required: ['<param>'],
    },
    execute({ '<param>' }, agent) {
      // agent object: { id, name } — identifies which agent is calling
      // Return MCP-compatible content array
      const result = /* call your existing app function */;
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  },
];

export function registerWebMCPTools() {
  if (!('modelContext' in window.navigator)) {
    console.warn('WebMCP not supported in this browser — skipping tool registration');
    return;
  }
  window.navigator.modelContext.provideContext({ tools: WEBMCP_TOOLS });
  console.log(`[WebMCP] Registered ${WEBMCP_TOOLS.length} tools`);
}
```

## React (via @mcp-b/react-webmcp)

```bash
npm install @mcp-b/react-webmcp
```

```jsx
import { useTool } from '@mcp-b/react-webmcp';

function MyComponent({ data }) {
  useTool({
    name: '<tool-name>',
    description: '<What this tool does>',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    },
    execute({ query }) {
      // Has access to component props and state
      const result = data.filter(item => item.matches(query));
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });

  return <div>{/* your component UI */}</div>;
}
```

## Polyfill-first (for today, before native browser support)

```bash
npm install @mcp-b/webmcp-polyfill
```

```javascript
import '@mcp-b/webmcp-polyfill';
// Now window.navigator.modelContext is available in all browsers
// Use the same Vanilla JS pattern above
```

## Checklist

- [ ] Tools have clear, agent-readable descriptions
- [ ] All inputs have JSON Schema definitions
- [ ] Handlers are wrapped in try/catch with error content returns
- [ ] Feature-detected behind `if ('modelContext' in window.navigator)`
- [ ] Polyfill installed for cross-browser support (`@mcp-b/webmcp-polyfill`)
- [ ] Tools registered at app initialization (not lazy)
- [ ] Tested in Chrome 146 Canary with `Experimental Web Platform Features` enabled
