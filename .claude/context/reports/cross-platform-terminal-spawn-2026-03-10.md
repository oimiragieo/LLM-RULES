<!-- Agent: researcher | Task: #13 | Session: 2026-03-10 -->

# Cross-Platform Terminal Spawn Research
## Phase 4: Shift Change Context Handoff — Visible Interactive Terminal Window

**Date:** 2026-03-10
**Purpose:** When a hook fires, open a new, immediately-visible, interactive terminal window running `claude` (or any command) on macOS and Linux.

---

## Executive Summary

Opening a visible GUI terminal window programmatically from Node.js requires platform-specific strategies. macOS uses `osascript` (AppleScript) targeting Terminal.app or iTerm2. Linux uses terminal emulator binaries directly (`gnome-terminal`, `xterm`, `konsole`, `kitty`, `wezterm`). When a multiplexer is active (`$TMUX` or `$ZELLIJ`), use the multiplexer API instead. Headless Linux (no `$DISPLAY`) falls back to tmux or user instructions. The complete decision tree and exact snippets follow.

---

## macOS Research

### 1. `open -a Terminal <command>` — Does It Work?

**No — `open` does not accept a command to run.** `open -a Terminal` opens the terminal but cannot pass an initial command. It only opens the application.

The correct approach is `osascript` (AppleScript).

### 2. Terminal.app via osascript — Exact Pattern

**Scenario: Terminal.app is already running (most common)**

```applescript
tell application "Terminal"
  if it is running then
    do script "COMMAND"
  else
    do script "COMMAND" in window 1
  end if
  activate
end tell
```

**Node.js spawn:**
```javascript
const { spawn } = require('child_process');

function openTerminalAppMacOS(command) {
  const script = `
tell application "Terminal"
  if it is running then
    do script "${command.replace(/"/g, '\\"')}"
  else
    do script "${command.replace(/"/g, '\\"')}" in window 1
  end if
  activate
end tell`;

  const proc = spawn('osascript', ['-e', script], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

**Important gotcha:** When Terminal is NOT running, `do script "CMD"` alone opens in a new window. When Terminal IS running, `do script "CMD"` (without `in window 1`) opens a NEW window (not a tab in the existing window). This is the desired behavior for "new visible window".

**Background execution:** `proc.unref()` + `detached: true` makes the osascript call fire-and-forget. The parent Node.js process does not wait.

### 3. iTerm2 — AppleScript API

iTerm2 has two API generations:

**Modern API (iTerm2 3.x+, recommended):**
```applescript
tell application "iTerm"
  create window with default profile command "COMMAND"
end tell
```

**Older API (still works, fallback):**
```applescript
tell application "iTerm"
  set myterm to (make new terminal)
  tell myterm
    set mss to (make new session at the end of sessions)
    tell mss
      activate
      exec command "/bin/bash -c \"COMMAND\""
    end tell
  end tell
end tell
```

**Node.js spawn for iTerm2:**
```javascript
function openITerm2(command) {
  const script = `
tell application "iTerm"
  create window with default profile command "/bin/bash -c \\"${command.replace(/"/g, '\\"')}\\""
end tell`;

  const proc = spawn('osascript', ['-e', script], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

**Note:** AppleScript for iTerm2 is still functional but the iTerm2 team recommends the Python API for advanced scripting. For simple "open window + run command" the AppleScript approach is reliable.

### 4. `$TERM_PROGRAM` Detection Values

| Terminal | `$TERM_PROGRAM` value |
|---|---|
| Terminal.app | `Apple_Terminal` |
| iTerm2 | `iTerm.app` |
| VS Code integrated terminal | `vscode` |
| Hyper | `Hyper` |
| Warp | `WarpTerminal` |
| Ghostty | `ghostty` |
| Kitty (macOS) | `xterm-kitty` (check `$TERM` not `$TERM_PROGRAM`) |
| tmux (inside tmux) | Set to the outer terminal's value OR unset |

**Detection snippet:**
```javascript
function getMacTerminalProgram() {
  return process.env.TERM_PROGRAM || '';
}

function detectMacTerminal() {
  const t = getMacTerminalProgram();
  if (t === 'iTerm.app') return 'iterm2';
  if (t === 'Apple_Terminal') return 'terminal_app';
  if (t === 'WarpTerminal') return 'warp';
  if (t === 'vscode') return 'vscode';
  // Default fallback on macOS
  return 'terminal_app';
}
```

### 5. Warp and VS Code Terminal — Special Cases

**Warp** does not expose a stable AppleScript or CLI API for opening new windows programmatically. Best approach: fall back to Terminal.app osascript (opens a Terminal.app window even if user normally uses Warp).

**VS Code integrated terminal** — if `$TERM_PROGRAM === 'vscode'`, the hook is running inside a VS Code terminal. Spawning a new window via osascript is valid; it opens a native Terminal.app window, which is fine.

---

## Linux Research

### 1. Terminal Detection on Linux

**Priority order for detection:**

1. `$TERM_PROGRAM` — set by some terminals (e.g., `xterm-kitty` for kitty)
2. `$XDG_CURRENT_DESKTOP` — indicates desktop environment
3. `which` checks for available binaries in priority order
4. `$DISPLAY` — if unset or empty, headless environment

```javascript
const { execSync } = require('child_process');

function detectLinuxTerminal() {
  // Check for tmux first (platform-agnostic)
  if (process.env.TMUX) return 'tmux';
  if (process.env.ZELLIJ) return 'zellij';

  // Check DISPLAY — if missing, headless
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return 'headless';
  }

  // Check XDG_CURRENT_DESKTOP for desktop-specific terminal
  const de = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase();

  // Check which binaries are available (in priority order)
  const candidates = [
    'wezterm', 'kitty', 'alacritty', 'gnome-terminal',
    'konsole', 'xfce4-terminal', 'xterm',
  ];

  for (const bin of candidates) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      return bin;
    } catch {
      // not found, continue
    }
  }

  return 'xterm'; // last resort
}
```

**XDG_CURRENT_DESKTOP values:**

| Desktop | `$XDG_CURRENT_DESKTOP` |
|---|---|
| GNOME | `GNOME` or `ubuntu:GNOME` |
| KDE Plasma | `KDE` |
| XFCE | `XFCE` |
| MATE | `MATE` |
| LXQt | `LXQt` |
| Cinnamon | `X-Cinnamon` |

### 2. gnome-terminal — Exact Spawn Pattern

**Modern syntax (gnome-terminal 3.x+):**
```bash
gnome-terminal -- bash -c "COMMAND; exec bash"
```

**IMPORTANT FLAG DEPRECATIONS:**
- `-x COMMAND` — **deprecated**, still works but prints warning
- `-e COMMAND` — **deprecated**, still works but prints warning
- `--command='COMMAND'` — **deprecated**
- `--` — **current recommended separator**

**Why `exec bash` at the end?** Without it, the terminal window closes immediately when the command exits. Adding `; exec bash` keeps the shell alive for interactive use after the initial command completes. For `claude` specifically (which is long-running), this is not needed.

**Node.js spawn:**
```javascript
function openGnomeTerminal(command) {
  const proc = spawn('gnome-terminal', ['--', 'bash', '-c', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

**GNOME-terminal PID gotcha:** `gnome-terminal` forks immediately and the spawned process ID is a DBus broker process, not the terminal itself. Do not rely on the returned PID to track the window lifecycle.

### 3. xterm — Exact Spawn Pattern

```javascript
function openXterm(command) {
  const proc = spawn('xterm', ['-e', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

`xterm -e COMMAND` keeps the window open as long as COMMAND runs. For interactive `claude`, this is correct behavior.

### 4. konsole (KDE)

```javascript
function openKonsole(command) {
  const proc = spawn('konsole', ['-e', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

Or for a named tab:
```javascript
spawn('konsole', ['--new-tab', '-e', command], { shell: false, detached: true, stdio: 'ignore' }).unref();
```

### 5. kitty

```javascript
function openKitty(command) {
  const proc = spawn('kitty', [command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

Or explicitly new window:
```javascript
spawn('kitty', ['--', command], { shell: false, detached: true, stdio: 'ignore' }).unref();
```

### 6. alacritty

```javascript
function openAlacritty(command) {
  const proc = spawn('alacritty', ['-e', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

### 7. wezterm

```javascript
function openWezterm(command) {
  const proc = spawn('wezterm', ['start', '--', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

### 8. `$DISPLAY` / Wayland / Headless Detection

```javascript
function hasDisplay() {
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}
```

**If no display:**
- Try tmux: `tmux new-window "COMMAND"` (if `$TMUX` is set)
- Try creating a new tmux session: `tmux new-session -d -s handoff 'COMMAND'; tmux attach -t handoff`
- Otherwise: print instructions to the user

### 9. tmux Support (Cross-Platform)

When `$TMUX` is set, tmux is the most reliable approach regardless of platform:

```javascript
function openInTmux(command) {
  const proc = spawn('tmux', ['new-window', command], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
}
```

---

## Complete Decision Tree

```
function spawnTerminalWindow(command):

  // ── MULTIPLEXER LAYER (cross-platform) ─────────────────────────────────
  if process.env.TMUX:
    → spawn: tmux new-window "COMMAND"
    return

  if process.env.ZELLIJ:
    → spawn: zellij action new-tab --command COMMAND
    return

  // ── WINDOWS LAYER ──────────────────────────────────────────────────────
  if process.platform === 'win32':
    if process.env.WT_SESSION:
      → spawn: cmd.exe /c wt new-tab -- powershell -NoExit -Command "COMMAND"
    else:
      → spawn: powershell Start-Process powershell -ArgumentList '-NoExit','-Command','COMMAND'
    return

  // ── macOS LAYER ────────────────────────────────────────────────────────
  if process.platform === 'darwin':
    termProg = process.env.TERM_PROGRAM || ''

    if termProg === 'iTerm.app':
      → osascript: tell iTerm to "create window with default profile command COMMAND"
    else:
      → osascript: tell Terminal to "do script COMMAND" + activate
    return

  // ── LINUX LAYER ────────────────────────────────────────────────────────
  if process.platform === 'linux':
    if no DISPLAY and no WAYLAND_DISPLAY:
      → HEADLESS fallback (see below)
      return

    // Priority order: prefer feature-rich modern terminals
    terminal = first available from:
      [wezterm, kitty, alacritty, gnome-terminal, konsole, xfce4-terminal, xterm]

    switch terminal:
      'wezterm'       → spawn: wezterm start -- COMMAND
      'kitty'         → spawn: kitty -- COMMAND
      'alacritty'     → spawn: alacritty -e COMMAND
      'gnome-terminal'→ spawn: gnome-terminal -- bash -c COMMAND
      'konsole'       → spawn: konsole -e COMMAND
      'xfce4-terminal'→ spawn: xfce4-terminal -e COMMAND
      'xterm'         → spawn: xterm -e COMMAND
    return

  // ── HEADLESS FALLBACK ──────────────────────────────────────────────────
  // No GUI display available
  if tmux is installed:
    if TMUX_TMPDIR or existing tmux server:
      → tmux new-session -d -s context-handoff "COMMAND"
      → print: "New tmux session 'context-handoff' created. Run: tmux attach -t context-handoff"
    else:
      → print: "Run in a new terminal: COMMAND"
  else:
    → print: "Open a new terminal and run: COMMAND"
```

---

## Complete Node.js Implementation

```javascript
// terminal-spawn.cjs — Cross-platform terminal window spawner
'use strict';

const { spawn, execSync } = require('child_process');

/**
 * Open a new visible, interactive terminal window running the given command.
 * Fire-and-forget (detached, unref'd).
 *
 * @param {string} command - The command to run (e.g. "claude")
 * @param {object} [opts]
 * @param {string} [opts.cwd] - Working directory for the command
 */
function spawnTerminalWindow(command, opts = {}) {
  const platform = process.platform;

  // ── MULTIPLEXER: tmux ──────────────────────────────────────────────────
  if (process.env.TMUX) {
    return spawnDetached('tmux', ['new-window', command], opts.cwd);
  }

  // ── MULTIPLEXER: zellij ───────────────────────────────────────────────
  if (process.env.ZELLIJ) {
    return spawnDetached('zellij', ['action', 'new-tab', '--command', command], opts.cwd);
  }

  // ── WINDOWS ───────────────────────────────────────────────────────────
  if (platform === 'win32') {
    if (process.env.WT_SESSION) {
      // Windows Terminal
      return spawnDetached('cmd.exe', [
        '/c', 'wt', 'new-tab', '--', 'powershell', '-NoExit', '-Command', command,
      ], opts.cwd);
    }
    // PowerShell fallback
    return spawnDetached('powershell', [
      '-Command',
      `Start-Process powershell -ArgumentList '-NoExit','-Command','${command.replace(/'/g, "''")}'`,
    ], opts.cwd);
  }

  // ── macOS ─────────────────────────────────────────────────────────────
  if (platform === 'darwin') {
    return spawnMacOS(command, opts.cwd);
  }

  // ── LINUX ─────────────────────────────────────────────────────────────
  if (platform === 'linux') {
    return spawnLinux(command, opts.cwd);
  }

  // Unknown platform — print instructions
  console.error(`[terminal-spawn] Unsupported platform: ${platform}`);
  console.error(`[terminal-spawn] Open a new terminal and run: ${command}`);
}

// ── macOS implementation ──────────────────────────────────────────────────

function spawnMacOS(command, cwd) {
  const termProg = process.env.TERM_PROGRAM || '';
  const safeCwd = cwd ? `; cd ${JSON.stringify(cwd)}` : '';
  const fullCommand = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command;
  const escaped = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  let script;
  if (termProg === 'iTerm.app') {
    script = `
tell application "iTerm"
  create window with default profile command "/bin/bash -c \\"${escaped}\\""
end tell`;
  } else {
    // Terminal.app (default for Apple_Terminal, Warp, VS Code, unknown)
    script = `
tell application "Terminal"
  if it is running then
    do script "${escaped}"
  else
    do script "${escaped}" in window 1
  end if
  activate
end tell`;
  }

  const proc = spawn('osascript', ['-e', script], {
    shell: false,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
  return proc;
}

// ── Linux implementation ──────────────────────────────────────────────────

function spawnLinux(command, cwd) {
  // Check for GUI display
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return spawnLinuxHeadless(command, cwd);
  }

  const terminal = detectLinuxTerminal();
  const fullCommand = cwd ? `cd ${JSON.stringify(cwd)} && ${command}` : command;

  switch (terminal) {
    case 'wezterm':
      return spawnDetached('wezterm', ['start', '--', 'bash', '-c', fullCommand], cwd);
    case 'kitty':
      return spawnDetached('kitty', ['bash', '-c', fullCommand], cwd);
    case 'alacritty':
      return spawnDetached('alacritty', ['-e', 'bash', '-c', fullCommand], cwd);
    case 'gnome-terminal':
      // Use -- separator (modern, avoids deprecation warnings)
      return spawnDetached('gnome-terminal', ['--', 'bash', '-c', fullCommand], cwd);
    case 'konsole':
      return spawnDetached('konsole', ['-e', 'bash', '-c', fullCommand], cwd);
    case 'xfce4-terminal':
      return spawnDetached('xfce4-terminal', ['-e', `bash -c ${JSON.stringify(fullCommand)}`], cwd);
    case 'xterm':
    default:
      return spawnDetached('xterm', ['-e', 'bash', '-c', fullCommand], cwd);
  }
}

function detectLinuxTerminal() {
  const candidates = [
    'wezterm', 'kitty', 'alacritty', 'gnome-terminal',
    'konsole', 'xfce4-terminal', 'xterm',
  ];
  for (const bin of candidates) {
    try {
      execFileSync('which', [bin], { stdio: 'pipe' });
      return bin;
    } catch {
      // not found
    }
  }
  return 'xterm';
}

function spawnLinuxHeadless(command, cwd) {
  // Try tmux if available
  try {
    execFileSync('which', ['tmux'], { stdio: 'pipe' });
    const sessionName = `context-handoff-${Date.now()}`;
    const args = ['new-session', '-d', '-s', sessionName];
    if (cwd) args.push('-c', cwd);
    args.push(command);
    execFileSync('tmux', args, {
      stdio: 'ignore',
    });
    console.error(`[terminal-spawn] Created tmux session '${sessionName}'.`);
    console.error(`[terminal-spawn] Attach with: tmux attach -t ${sessionName}`);
    return;
  } catch {
    // tmux not available or failed
  }
  console.error('[terminal-spawn] No GUI display and no tmux. Open a new terminal and run:');
  console.error(`[terminal-spawn]   ${command}`);
}

// ── Utility ───────────────────────────────────────────────────────────────

function spawnDetached(bin, args, cwd) {
  const opts = {
    shell: false,
    detached: true,
    stdio: 'ignore',
  };
  if (cwd) opts.cwd = cwd;
  const proc = spawn(bin, args, opts);
  proc.unref();
  return proc;
}

module.exports = { spawnTerminalWindow };
```

---

## Gotchas and Caveats

### macOS

1. **`open -a Terminal` cannot run a command.** It only opens the app. Always use `osascript`.

2. **Terminal.app: `make new window` is broken.** The `make new window` and `make new document` AppleScript commands have been broken in Terminal.app for years. Use `do script "CMD"` (without an `in window` target) to get a new window.

3. **Terminal.app: `do script ""` with empty string.** The gist pattern uses `do script ""` when Terminal is already running — this creates a new window. Then `do script "CMD" in front window` runs the command. However, a simpler single-step approach: `do script "CMD"` (no window target) always opens a new window when Terminal is running.

4. **iTerm2 AppleScript: two incompatible APIs.** The older `make new terminal` / `make new session` API is not compatible with iTerm2 3.x `create window with default profile`. Detect iTerm2 version if needed; the modern API is safer.

5. **osascript runs synchronously by default.** Use `detached: true` + `proc.unref()` to fire-and-forget. The osascript call itself exits quickly; the terminal window stays open.

6. **Warp has no AppleScript or CLI API** for opening windows. Fall back to Terminal.app osascript when `$TERM_PROGRAM === 'WarpTerminal'` — this opens a Terminal.app window, not a Warp window. This is acceptable behavior.

7. **macOS permissions (Automation):** osascript controlling Terminal.app or iTerm2 requires the calling process to have Automation permissions in System Preferences > Privacy & Security > Automation. First run will show a system prompt. Claude Code (which runs hooks) should already have these permissions.

### Linux

8. **gnome-terminal `-e` and `--command` are deprecated.** Use `--` as the command separator. Example: `gnome-terminal -- bash -c "CMD"`. The old flags still work but emit deprecation warnings to stderr.

9. **gnome-terminal PID is not the terminal window PID.** It forks immediately; the returned PID is a DBus proxy. Do not use PID to track the terminal.

10. **xfce4-terminal `-e` takes a single shell string**, not an array. Pass `bash -c "CMD"` as one string argument.

11. **kitty and alacritty: command must be the process to run**, not a shell string. Pass `bash -c "CMD"` as separate args.

12. **`$DISPLAY` vs `$WAYLAND_DISPLAY`:** On modern Wayland systems `$DISPLAY` may be unset. Check both. Most terminal emulators handle Wayland natively; the env var is only needed for the headless check.

13. **`which` on Linux can fail silently.** Use `execSync` with `stdio: 'pipe'` and catch errors rather than `stdio: 'ignore'` so you can distinguish "not found" from other errors.

14. **tmux `new-window` vs `new-session`:** When `$TMUX` is set, `tmux new-window CMD` opens a new window in the current session — this is immediately visible to the user. Without `$TMUX`, `tmux new-session -d -s NAME CMD` starts headless and requires a manual attach.

15. **Shell escaping for the spawned command.** When using `bash -c "CMD"`, embedded double quotes in CMD must be escaped. The implementation above uses `JSON.stringify` for the cwd path and template strings for the command — verify escaping for commands with special characters.

### Cross-Platform

16. **`detached: true` + `proc.unref()` is required** for fire-and-forget. Without `unref()`, the parent Node.js process (the hook) waits for the child even with `detached: true`.

17. **`shell: false` for all spawns.** Per security standards — always use array args with `shell: false`. No shell metacharacter injection vectors.

---

## Sources Consulted

- [Stuart Dotson: How to programmatically open a new terminal tab/window](https://stuartdotson.com/blog/how-to-programmatically-open-a-new-terminal-tab-or-window/)
- [GitHub Gist: Execute command in new Terminal window on Mac OS X via AppleScript](https://gist.github.com/nuada/204e8082280328654ca651f1730a1aa7)
- [iTerm2 AppleScript Documentation](https://iterm2.com/documentation-scripting.html)
- [iTerm2 AppleScript Gist: reyjrar/1769355](https://gist.github.com/reyjrar/1769355)
- [skywind3000/terminal: Open Terminal Window cross-platform](https://github.com/skywind3000/terminal)
- [gnome-terminal man page (Debian)](https://manpages.debian.org/unstable/gnome-terminal/gnome-terminal.1.en.html)
- [gnome-terminal --command deprecated (Linux Mint Forums)](https://forums.linuxmint.com/viewtopic.php?t=429089)
- [Node.js help: gnome-terminal spawn PID issue #2902](https://github.com/nodejs/help/issues/2902)
- [Electron issue: XDG_CURRENT_DESKTOP values on Ubuntu/GNOME](https://github.com/electron/electron/issues/40795)
