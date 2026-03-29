# Electron Pro Research Requirements (2026)

## Verified Architecture

```
Main Process (Node.js)
    ↓ IPC
Renderer Process (Chromium)
    ↑ contextBridge
Preload Script
```

## Security Configuration

```javascript
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
}
```

## Packaging Tools

- electron-builder (recommended)
- electron-forge
- electron-vite (dev + build)

## Source References

- [Electron Docs](https://www.electronjs.org/docs/latest)
- [electron-builder](https://www.electron.build)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
