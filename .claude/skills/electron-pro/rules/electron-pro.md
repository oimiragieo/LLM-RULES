# electron-pro Rules

## Purpose

Expert Electron desktop application development — architecture, security, packaging.

## Best Practices

- Always enable contextIsolation, disable nodeIntegration
- Use contextBridge to expose limited APIs
- Never use remote module (deprecated, insecure)
- Validate all IPC messages in main process
- Use webContents.session for network interception

## Security Checklist

- contextIsolation: true on all windows
- nodeIntegration: false on all windows
- sandbox: true enabled
- CSP header set
- IPC inputs validated
- Code signed for distribution

## Integration Points

See SKILL.md for complete documentation.
