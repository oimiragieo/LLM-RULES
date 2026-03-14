---
name: electron-pro
description: Expert Electron desktop application development — main/renderer process architecture, IPC communication, native OS APIs (menus, tray, notifications, dialogs), auto-updates, code signing, packaging with electron-builder/forge, security hardening (contextIsolation, sandbox), and performance optimization. Use for building cross-platform desktop apps.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit]
best_practices:
  - Always enable contextIsolation and disable nodeIntegration in renderer
  - Use contextBridge to expose limited APIs to renderer
  - Never use remote module (deprecated and insecure)
  - Validate all IPC messages in main process
  - Use webContents.session for network interception
error_handling: graceful
streaming: not_applicable
verified: false
lastVerifiedAt: 2026-03-14T00:00:00.000Z
---

# Electron Pro Skill

## Overview

Full-stack Electron desktop app development — from architecture through distribution. Covers process model, security hardening, native OS integration, IPC patterns, packaging, and auto-update.

## Process Architecture

```
┌─────────────────────────────────────┐
│           Main Process              │
│  (Node.js — full system access)     │
│  app, BrowserWindow, Menu, Tray     │
│  nativeImage, shell, ipcMain        │
└──────────────┬──────────────────────┘
               │ IPC (structured clone)
┌──────────────┴──────────────────────┐
│          Renderer Process           │
│  (Chromium — sandboxed by default)  │
│  Web UI: React/Vue/Svelte/vanilla   │
│  ipcRenderer (via contextBridge)    │
└─────────────────────────────────────┘
               │ contextBridge
┌──────────────┴──────────────────────┐
│            Preload Script           │
│  Bridge between main and renderer   │
│  Exposes safe APIs via contextBridge│
└─────────────────────────────────────┘
```

## Security-First Setup (MANDATORY)

```javascript
// main.js — Always use these security options
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true, // REQUIRED: isolates renderer from preload
    sandbox: true, // RECOMMENDED: OS-level sandbox
    nodeIntegration: false, // REQUIRED: never expose Node to renderer
    webSecurity: true, // REQUIRED: never disable
    allowRunningInsecureContent: false,
  },
});

// NEVER do this — security violation:
// nodeIntegration: true
// contextIsolation: false
// Use remote: require('@electron/remote') only if absolutely necessary
```

## Preload + contextBridge

```javascript
// preload.js — the ONLY safe bridge to Node
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose specific, validated methods only
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: content => {
    if (typeof content !== 'string') throw new Error('Invalid content');
    return ipcRenderer.invoke('dialog:saveFile', content);
  },
  onUpdateAvailable: callback => {
    // One-way: main → renderer
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  // Platform info (read-only)
  platform: process.platform,
});

// renderer.js — use the exposed API
window.electronAPI.openFile().then(filePath => {
  console.log('Selected:', filePath);
});
```

## IPC Communication Patterns

```javascript
// main.js — handle IPC calls
const { ipcMain, dialog, app } = require('electron');

// Two-way: renderer calls, main responds
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled) return null;
  return filePaths[0];
});

// Validate inputs — never trust renderer
ipcMain.handle('fs:readFile', async (event, filePath) => {
  // Validate path is within allowed directories
  const allowed = path.join(app.getPath('userData'), 'files');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowed)) {
    throw new Error('Path traversal denied');
  }
  return fs.promises.readFile(resolved, 'utf8');
});

// One-way: main → renderer push
win.webContents.send('update-available', { version: '1.2.0' });

// One-way: renderer → main fire-and-forget
// preload: ipcRenderer.send('log', message)
// main: ipcMain.on('log', (event, message) => console.log(message))
```

## Native OS Integration

### Menu

```javascript
const { Menu, MenuItem } = require('electron');

const template = [
  {
    label: 'File',
    submenu: [
      { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
      { label: 'Open', accelerator: 'CmdOrCtrl+O', click: () => openFileDialog() },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ],
  },
  // macOS: add app menu as first item
  ...(process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }],
        },
      ]
    : []),
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));
```

### System Tray

```javascript
const { Tray, Menu, nativeImage } = require('electron');

const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'));
const tray = new Tray(icon);
tray.setToolTip('My App');
tray.setContextMenu(
  Menu.buildFromTemplate([
    { label: 'Open', click: () => win.show() },
    { label: 'Quit', click: () => app.quit() },
  ])
);
tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
```

### Notifications

```javascript
const { Notification } = require('electron');

// Check support first
if (Notification.isSupported()) {
  new Notification({
    title: 'Build Complete',
    body: 'Your project compiled successfully.',
    icon: path.join(__dirname, 'assets/icon.png'),
  }).show();
}
```

### Dialogs

```javascript
const { dialog } = require('electron');

// Open file
const { filePaths } = await dialog.showOpenDialog(win, {
  title: 'Select Config File',
  filters: [{ name: 'JSON', extensions: ['json'] }],
  properties: ['openFile'],
});

// Save file
const { filePath } = await dialog.showSaveDialog(win, {
  defaultPath: 'export.csv',
  filters: [{ name: 'CSV', extensions: ['csv'] }],
});

// Message box
const { response } = await dialog.showMessageBox(win, {
  type: 'question',
  buttons: ['Yes', 'No'],
  message: 'Are you sure you want to delete this?',
});
```

### Shell Operations

```javascript
const { shell } = require('electron');

// Open in default browser/app — safe for user-initiated actions
await shell.openExternal('https://example.com');

// Open file in default app
await shell.openPath('/path/to/file.pdf');

// Reveal in Finder/Explorer
shell.showItemInFolder('/path/to/file');
```

## App Lifecycle

```javascript
const { app, BrowserWindow } = require('electron');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Wait for ready-to-show to avoid flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  // Or for dev server: mainWindow.loadURL('http://localhost:5173');

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create on activate if no windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit on all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

## Auto-Update (electron-updater)

```javascript
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', info => {
  win.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', info => {
  win.webContents.send('update-downloaded', info);
});

// Triggered by renderer when user clicks "Install"
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});
```

## Packaging with electron-builder

```json
// package.json
{
  "build": {
    "appId": "com.company.myapp",
    "productName": "My App",
    "directories": { "output": "dist" },
    "mac": {
      "category": "public.app-category.productivity",
      "hardenedRuntime": true,
      "entitlements": "build/entitlements.mac.plist",
      "notarize": true
    },
    "win": {
      "target": ["nsis", "portable"],
      "signingHashAlgorithms": ["sha256"]
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Utility"
    },
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "your-repo"
    }
  }
}
```

```bash
# Build for current platform
pnpm exec electron-builder

# Build for all platforms (requires cross-platform CI)
pnpm exec electron-builder --mac --win --linux
```

## Deep Linking

```javascript
// Register protocol
app.setAsDefaultProtocolClient('myapp');

// Handle on macOS/Linux
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Handle on Windows (second instance)
app.on('second-instance', (event, commandLine) => {
  const url = commandLine.find(arg => arg.startsWith('myapp://'));
  if (url) handleDeepLink(url);
  mainWindow?.focus();
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
```

## Performance

```javascript
// Lazy load windows
let settingsWindow = null;
function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ ... });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// Background processing — use utility process (Electron 22+)
const { utilityProcess } = require('electron');
const child = utilityProcess.fork(path.join(__dirname, 'worker.js'));
child.postMessage({ task: 'process', data });
child.on('message', ({ result }) => console.log(result));

// Session — block unnecessary requests
win.webContents.session.webRequest.onBeforeRequest(
  { urls: ['https://tracking.example.com/*'] },
  (details, callback) => callback({ cancel: true })
);
```

## Development Workflow

```bash
# Start dev with hot reload (electron-vite recommended)
pnpm exec electron-vite dev

# Or with webpack/parcel
concurrently "pnpm build:renderer --watch" "wait-on http://localhost:5173 && electron ."

# Open DevTools programmatically (dev only)
if (process.env.NODE_ENV === 'development') {
  win.webContents.openDevTools();
}

# Debug main process
electron --inspect=9229 .
# Then attach Chrome DevTools at chrome://inspect
```

## Anti-Patterns

- `nodeIntegration: true` — exposes all of Node.js to web content (RCE vector)
- `contextIsolation: false` — allows renderer to access preload scope directly
- `webSecurity: false` — disables CORS and mixed content protections
- `shell.openExternal(userInput)` without validation — SSRF/open redirect vector
- `eval()` or `Function()` in renderer — CSP bypass
- Storing secrets in renderer process — use main process + keychain
- Using `remote` module — deprecated, insecure, causes memory leaks

## Security Checklist

- [ ] `contextIsolation: true` on all windows
- [ ] `nodeIntegration: false` on all windows
- [ ] `sandbox: true` enabled
- [ ] CSP header set on loaded HTML
- [ ] All IPC inputs validated in main process
- [ ] No `shell.openExternal(untrustedUrl)` without validation
- [ ] `webSecurity: true` (default, do not disable)
- [ ] Code signed for distribution (macOS notarization required)

## Related

- Electron docs: <https://www.electronjs.org/docs/latest>
- electron-builder: <https://www.electron.build>
- electron-vite: <https://electron-vite.org>
- Electron security: <https://www.electronjs.org/docs/latest/tutorial/security>
