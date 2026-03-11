<!-- Agent: researcher | Task: #12 | Session: 2026-03-10 -->

# tmux Research: Phase 4 Shift Change Context Handoff — Windows Terminal Spawn

**Date**: 2026-03-10
**Purpose**: Evaluate tmux as an alternative to `cmd.exe /c wt` (Windows Terminal) and PowerShell `Start-Process` for spawning a new interactive terminal session running `claude` from a Node.js hook on Windows.

---

## Executive Summary

tmux is **not a viable primary option** for Phase 4 on native Windows. It has no native Windows binary and requires WSL, MSYS2, or Git Bash as a runtime host — none of which can spawn a new visible OS-level window that the user can immediately interact with. However, tmux is the **best cross-platform option** on Linux and macOS, and is excellent for WSL-first workflows where the user already lives inside a WSL terminal (e.g., Windows Terminal running Ubuntu). The correct architecture is: tmux on Linux/macOS, `wt` on native Windows, with a WSL detection branch that uses tmux when appropriate.

---

## Research Methodology

| Query | Tool | Purpose |
|-------|------|---------|
| "tmux new session nodejs spawn programmatic 2024 2025" | WebSearch | Node.js integration patterns |
| "tmux windows WSL Git Bash MSYS2 availability installation 2025" | WebSearch | Windows availability |
| "node-pty tmux programmatic terminal spawn interactive visible window" | WebSearch | Library options |
| "tmux new-session detached vs attached display headless" | WebSearch | Interactivity behavior |
| github.com/StarlaneStudios/node-tmux | WebFetch | node-tmux library API |
| github.com/tmux/tmux/wiki/Getting-Started | WebFetch | Official docs on session attach/detach |

---

## Detailed Findings

### 1. tmux Availability on Windows

**Native Windows**: tmux has **no native Windows binary**. It requires POSIX emulation.

| Environment | tmux Available? | Install Method | Quality |
|-------------|----------------|----------------|---------|
| WSL2 (Ubuntu/Debian) | Yes (full support) | `sudo apt install tmux` | Excellent — full feature set, tmux 3.6 (Dec 2025) |
| MSYS2 | Yes | `pacman -S tmux` (v3.6.a-1, 2025-12-06) | Good — but runs in MSYS2 terminal, not native Windows terminal |
| Git Bash | Partial | Copy binaries from MSYS2 manually | Fragile — requires manual `msys-event` dll copying |
| Native Windows (no WSL) | No | N/A | Not available |
| Cygwin | Yes (historically) | Cygwin installer | Legacy — not recommended for new projects |

**Key constraint**: On Windows, tmux is only fully functional in WSL2. MSYS2/Git Bash installations are functional but fragile and not reliably installable from a Node.js hook without preconditions.

### 2. tmux Programmatic Spawn from Node.js

#### Direct child_process pattern

```javascript
// Spawn a new detached tmux session running claude
const { spawn } = require('child_process');

// Create detached session
spawn('tmux', ['new-session', '-d', '-s', 'claude-handoff', '-c', '/workspace', 'claude'], {
  shell: false,
  detached: true,
  stdio: 'ignore'
});

// Attach to it in a new terminal (requires another terminal emulator)
spawn('tmux', ['attach-session', '-t', 'claude-handoff'], {
  shell: false,
  stdio: 'inherit'
});
```

#### node-tmux library (StarlaneStudios)

- **API**: `newSession(name, command?)`, `listSessions()`, `writeInput(session, text)`, `killSession(name)`
- **No Windows support**: The library assumes tmux is installed natively; no WSL bridge
- **Limitation**: Does not handle opening a new visible OS window — only manages sessions within the current terminal context

#### node-pty integration

- `node-pty` can spawn a PTY process but does not open new OS-level windows
- Useful for web-based terminals (xterm.js in Electron/browser) — not for native desktop terminal windows
- Works on Windows via ConPTY but is still in-process, not a new spawned window

### 3. tmux: Visible Window vs Headless Session — Critical Distinction

This is the **most important finding** for Phase 4:

| Mode | Command | Visible to User? | User Can Interact? |
|------|---------|------------------|--------------------|
| Detached | `tmux new-session -d -s name` | **No** — runs in background | Not until `tmux attach` in another terminal |
| Attached | `tmux new-session -s name` (no -d) | **Yes** — but takes over current terminal | Yes |
| New window in existing session | `tmux new-window` | **Yes** — switches to new window in same terminal | Yes |

**Critical insight**: tmux does NOT spawn a new OS-level terminal window. It creates panes/windows _within an existing terminal emulator_. To get a "new visible window", you must:
1. Have an existing tmux session the user is attached to, AND
2. Use `tmux new-window` or `tmux split-window` to add a pane

OR the Phase 4 hook must separately spawn a terminal emulator (`wt`, `xterm`, etc.) and then attach to the tmux session from within it.

### 4. tmux + WSL Integration Pattern

If the user is running inside Windows Terminal with a WSL pane, the flow works well:

```bash
# User is in WSL shell inside Windows Terminal
# Phase 4 hook (running in WSL context) can:

# Option A: New tmux window in current session (no new OS window)
tmux new-window -t current-session: 'claude'

# Option B: Detach + spawn wt tab attached to new session
tmux new-session -d -s claude-handoff 'claude'
# Then the Windows-side hook runs:
# wt.exe new-tab --title "Claude Handoff" -- wsl.exe -e tmux attach -t claude-handoff
```

This hybrid pattern (tmux session + `wt` attaching to it) is more complex but works when the user is WSL-first.

**WSL detection from Node.js hook**:
```javascript
const isWSL = () => {
  try {
    const release = require('fs').readFileSync('/proc/version', 'utf8');
    return release.toLowerCase().includes('microsoft');
  } catch { return false; }
};
```

### 5. Cross-Platform Analysis

| Platform | Best Option | tmux Role |
|----------|-------------|-----------|
| macOS | tmux | Primary — `tmux new-window` or iTerm2 `open-new-tab` |
| Linux (native) | tmux | Primary — `tmux new-window` within existing session |
| Windows (native, no WSL) | `wt` (Windows Terminal) | No tmux role |
| Windows + WSL2 (terminal = WSL shell) | tmux OR `wt` | tmux works within WSL session; `wt` works for new tab |
| Windows + WSL2 (terminal = PowerShell) | `wt` with WSL profile | tmux in background only |

**Conclusion**: tmux is the **correct solution on Linux/macOS** and eliminates the need for `wt` entirely on those platforms. On Windows, tmux is a supplemental tool at best.

### 6. Relevant Libraries and Prior Art

| Library/Pattern | Stars | Windows? | Interactive Visible Window? | Notes |
|----------------|-------|----------|----------------------------|-------|
| `node-tmux` (StarlaneStudios) | ~50 | No | No (session mgmt only) | Thin wrapper, TypeScript |
| `node-pty` (Microsoft) | ~4k | Yes (ConPTY) | No (in-process PTY) | Web terminals, Electron |
| `stmux` (rse) | ~300 | No | Yes (in existing terminal) | Blessed rendering, not new OS window |
| Direct `child_process.spawn('tmux', ...)` | N/A | WSL only | No (requires existing terminal) | Most flexible |

---

## Practical Recommendations

### P0 — Primary Implementation Strategy

Use a **platform-detection branch** in the Phase 4 hook:

```javascript
function spawnHandoffTerminal(claudeCommand) {
  const platform = process.platform;
  const isWSL = detectWSL();

  if (platform === 'darwin') {
    // macOS: use tmux new-window if inside tmux, else AppleScript/iTerm2
    if (process.env.TMUX) {
      spawnTmuxWindow(claudeCommand);
    } else {
      spawnMacTerminal(claudeCommand);
    }
  } else if (platform === 'linux' && !isWSL) {
    // Native Linux: tmux is ideal
    if (process.env.TMUX) {
      spawnTmuxWindow(claudeCommand);
    } else {
      spawnTmuxSession(claudeCommand); // then user attaches
    }
  } else if (platform === 'win32' || isWSL) {
    // Windows (native or WSL): use wt.exe
    spawnWindowsTerminal(claudeCommand);
  }
}
```

### P1 — tmux tmux-specific spawn pattern

```javascript
function spawnTmuxWindow(command) {
  // Creates a new window in the current session (user immediately sees it)
  const { spawnSync } = require('child_process');
  spawnSync('tmux', ['new-window', '-n', 'claude-handoff', command], {
    shell: false,
    stdio: 'ignore'
  });
}
```

### P2 — Consider tmux as fallback on WSL

If `wt.exe` is not available but the user is in WSL inside some terminal, use:
```javascript
spawnSync('tmux', ['new-window', '-t', ':'], { shell: false });
spawnSync('tmux', ['send-keys', '-t', ':', command, 'Enter'], { shell: false });
```

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| tmux not installed (Windows/native) | High — spawn fails | High on native Windows | Fall back to `wt`; only use tmux when `TMUX` env var set |
| tmux creates background session (not visible) | High — user doesn't see it | High if using `-d` without attaching | Use `new-window` (no `-d`) when inside existing tmux session |
| WSL tmux can't spawn visible window without `wt` | Medium | Medium | Hybrid: tmux session + `wt.exe attach` |
| node-tmux library Windows incompatibility | Low — avoidable | Certain | Don't use node-tmux; use direct `child_process.spawn` |
| TMUX env var check false negative | Low | Low | Also check `$TERM_PROGRAM=tmux` and socket file |

---

## Academic References

No academic papers directly applicable. Key practitioner references:
- [node-tmux GitHub](https://github.com/StarlaneStudios/node-tmux)
- [tmux Getting Started Wiki](https://github.com/tmux/tmux/wiki/Getting-Started)
- [MSYS2 tmux package](https://packages.msys2.org/packages/tmux)
- [Install Tmux on Git for Windows - DEV Community](https://dev.to/timothydjones/install-tmux-on-git-for-windows-1cf2)
- [Run Multiple NodeJS microservices with tmux - DEV Community](https://dev.to/sanketh_sh/run-multiple-nodejs-microservices-with-tmux-5f30)
- [node-pty GitHub (Microsoft)](https://github.com/microsoft/node-pty)

---

## Implementation Roadmap

1. **Phase 4 hook**: Add `process.env.TMUX` detection as first branch
2. **If TMUX set**: Use `tmux new-window -n claude-handoff claude` — no new OS window needed
3. **If on Linux/macOS without TMUX**: Use `tmux new-session -s claude-handoff claude` + print attach instructions
4. **If on Windows**: Use existing `wt` / `Start-Process` branches (no tmux)
5. **WSL hybrid** (optional, P2): `wt.exe` + `wsl.exe -e tmux attach` for WSL-first users who want tmux integration
