---
name: windows-terminal
description: Spawn and manage Windows Terminal (wt.exe) windows and tabs from Node.js scripts and Claude Code hooks, with App Execution Alias resolution, correct CLI flags, and anti-patterns to avoid
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: false
tools: [Read, Write, Bash]
agents: [developer, nodejs-pro]
category: 'Specialized Patterns'
tags: [windows, terminal, spawn, wt, child-process, hooks]
verified: true
lastVerifiedAt: 2026-03-10
best_practices:
  - Always use cmd.exe /c wt or PowerShell Start-Process — never spawn wt.exe directly
  - Always use -w new to open a new window, not a tab in the user's current WT session
  - Always use shell:false with array args (no shell injection risk)
  - Always call child.unref() after detached spawn
error_handling: graceful
source: builtin
trust_score: 100
provenance_sha: a39356dd7d195fe7
---

# Windows Terminal Skill

<identity>
Expert in spawning and managing Windows Terminal (wt.exe) from Node.js scripts,
hooks, and agents. Covers App Execution Alias resolution, full WT CLI syntax,
reliable spawn patterns, and anti-patterns to avoid.
</identity>

<capabilities>
- Explain why wt.exe cannot be spawned directly from Node.js child_process
- Provide the two reliable alternatives (cmd.exe /c wt, PowerShell Start-Process)
- Full WT CLI syntax: all options, subcommands, flags, command chaining
- Detect Windows Terminal at runtime (WT_SESSION env var)
- Implement detached interactive session spawning (used by shift-change Phase 4)
- Security-safe spawn patterns (shell: false, array args, no injection)
</capabilities>

<instructions>
<execution_process>

## The App Execution Alias Problem

`wt.exe` is a **Windows App Execution Alias** registered at
`%LOCALAPPDATA%\Microsoft\WindowsApps`. App Execution Aliases:

- Work in interactive shells (cmd.exe, PowerShell terminal sessions)
- Are **NOT** resolvable from `child_process.spawn()` in Node.js
- Require the Windows shell infrastructure unavailable to child processes

**User confirmed failure (2026-03-10):**

```powershell
PS C:\Users\oimir> wt.exe
# wt.exe : The term 'wt.exe' is not recognized...
# Even though WT_SESSION is set and wt works interactively
```

### Reliable Approaches from Node.js

**Approach A — cmd.exe /c start wt (PRIMARY — verified 2026-03-10):**
`cmd /c start` is the Windows built-in for launching GUI windows from non-interactive
subprocess contexts (e.g. Claude Code hooks, piped processes). Plain `cmd /c wt` silently
fails to produce a visible window from such contexts. The empty string `''` is a required
title placeholder for `start` when passing arguments to the target program.

Two additional requirements when spawning `claude`:

- **Unset `CLAUDECODE`**: Claude Code sets this env var; child `claude` processes detect it
  and refuse to start ("cannot be launched inside another Claude Code session"). Clear it in
  the cmd command with `set CLAUDECODE=` before invoking `claude`.
- **`cmd /k` keeps the window open** after the command finishes (useful for interactive use
  or `-p` print-mode demos). Use `cmd /c` if you want the window to close on exit.

```javascript
// VERIFIED working from non-interactive subprocess (Claude Code hook, Bash tool, etc.)
spawn(
  'cmd.exe',
  [
    '/c',
    'start',
    '', // 'start' = Windows GUI window launcher; '' = required title placeholder
    'wt',
    '-w',
    'new',
    'new-tab',
    '--title',
    'My Title',
    'cmd',
    '/k',
    'set CLAUDECODE= && claude', // unset CLAUDECODE before launching claude
  ],
  { shell: false }
);
// Note: no detached/stdio/unref needed — 'start' fully detaches by design
```

**Approach B — PowerShell Start-Process (alternative):**
`Start-Process` uses the Windows shell infrastructure to resolve aliases.

```javascript
spawn(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    "Start-Process wt -ArgumentList \"-w new new-tab --title 'My Title' cmd /k 'set CLAUDECODE= && claude'\"",
  ],
  { detached: true, shell: false, stdio: 'ignore' }
);
```

**Approach C — PowerShell Start-Process cmd (no WT required):**
Fallback when Windows Terminal is not installed or WT_SESSION is not set.

```javascript
spawn(
  'powershell.exe',
  ['-NoProfile', '-Command', 'Start-Process cmd.exe -ArgumentList "/k claude" -WindowStyle Normal'],
  { detached: true, shell: false, stdio: 'ignore' }
);
```

---

## WT CLI Syntax (from learn.microsoft.com, verified 2026-03-10)

```
wt [options] [command ; ]
```

If no command is specified, `new-tab` is used by default.

### Global Options

| Option          | Short | Description                                                                                  |
| --------------- | ----- | -------------------------------------------------------------------------------------------- |
| `--window <id>` | `-w`  | Target window. `new`/`-1` = always new window; `0`/`last` = most recent; name = named window |
| `--maximized`   | `-M`  | Launch maximized                                                                             |
| `--fullscreen`  | `-F`  | Launch fullscreen                                                                            |
| `--focus`       | `-f`  | Launch in focus mode                                                                         |
| `--pos x,y`     |       | Launch at position                                                                           |
| `--size c,r`    |       | Launch with columns/rows                                                                     |

### Subcommands

#### new-tab (nt)

```
wt new-tab [options] [commandline]
  -p <profile>          Profile name
  -d <dir>              Starting directory
  --title <text>        Tab title
  --tabColor <hex>      Tab color (#RGB or #RRGGBB)
  --colorScheme <name>  Color scheme override
  --suppressApplicationTitle
  --useApplicationTitle
  <commandline>         Command to run in the tab
```

#### split-pane (sp)

```
wt split-pane [options] [commandline]
  -H / --horizontal     Split horizontally
  -V / --vertical       Split vertically
  -s / --size <float>   Pane size (e.g. 0.4 = 40%)
  -D / --duplicate      Duplicate current pane
  (+ same flags as new-tab)
```

#### focus-tab (ft)

```
wt focus-tab -t <index>   Focus tab by zero-based index
```

#### move-focus (mf)

```
wt move-focus <direction>
  # direction: up|down|left|right|first|previous|nextInOrder|previousInOrder
```

### Command Chaining (Semicolons)

Commands are separated by `;`. Escaping rules depend on the calling shell:

| Shell                      | Separator                   | Example                                                        |
| -------------------------- | --------------------------- | -------------------------------------------------------------- |
| cmd.exe                    | `;`                         | `wt new-tab cmd ; new-tab powershell`                          |
| PowerShell                 | `` `; `` (backtick-escaped) | ``wt new-tab cmd `; new-tab powershell``                       |
| PowerShell stop-parse      | `--% ;`                     | `wt --% new-tab cmd ; new-tab powershell`                      |
| Node.js (cmd.exe approach) | Array element `";"`         | `['/c', 'wt', 'new-tab', 'cmd', ';', 'new-tab', 'powershell']` |

---

## Detection Pattern

```javascript
/**
 * Determine Windows Terminal spawn strategy.
 * @returns {'windows-terminal'|'windows-cmd'|'unix'}
 */
function getWindowsSpawnStrategy() {
  if (process.platform !== 'win32') return 'unix';
  if (process.env.WT_SESSION) return 'windows-terminal';
  return 'windows-cmd';
}
```

---

## Canonical Node.js Spawn Patterns

### Open NEW window in Windows Terminal (primary use case)

```javascript
const { spawn } = require('child_process');

/**
 * Open a new WINDOW in Windows Terminal running a command.
 * Uses cmd.exe /c wt — resolves App Execution Alias reliably.
 * -w new forces a new window (not a tab in the user's current WT session).
 *
 * @param {string} command - Shell command to run (e.g. 'claude')
 * @param {object} opts
 * @param {string} [opts.title='New Session'] - Tab title
 * @param {string} [opts.profile] - WT profile name (e.g. 'Windows PowerShell')
 * @param {string} [opts.startingDir] - Starting directory
 */
function spawnWtNewWindow(command, opts = {}) {
  const { title = 'New Session', profile, startingDir } = opts;
  const wtArgs = ['/c', 'wt', '-w', 'new', 'new-tab'];
  if (title) wtArgs.push('--title', title);
  if (profile) wtArgs.push('-p', profile);
  if (startingDir) wtArgs.push('-d', startingDir);
  wtArgs.push('cmd', '/k', command);

  const child = spawn('cmd.exe', wtArgs, {
    detached: true,
    shell: false,
    stdio: 'ignore',
  });
  child.unref(); // Do NOT wait for child — let it run independently
  return child;
}

// Usage:
spawnWtNewWindow('claude', { title: 'Claude New Session' });
```

### Open new TAB in existing WT window (use -w 0)

```javascript
function spawnWtNewTab(command, opts = {}) {
  const { title, profile } = opts;
  const wtArgs = ['/c', 'wt', '-w', '0', 'new-tab'];
  if (title) wtArgs.push('--title', title);
  if (profile) wtArgs.push('-p', profile);
  wtArgs.push('cmd', '/k', command);

  const child = spawn('cmd.exe', wtArgs, {
    detached: true,
    shell: false,
    stdio: 'ignore',
  });
  child.unref();
  return child;
}
```

### Fallback: new cmd.exe window (no WT required)

```javascript
function spawnCmdNewWindow(command, opts = {}) {
  const { windowStyle = 'Normal' } = opts;
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Start-Process cmd.exe -ArgumentList "/k ${command}" -WindowStyle ${windowStyle}`,
    ],
    { detached: true, shell: false, stdio: 'ignore' }
  );
  child.unref();
  return child;
}
```

### Platform-aware spawn (shift-change Phase 4 pattern)

```javascript
function spawnInteractiveSession(command, opts = {}) {
  const strategy = getWindowsSpawnStrategy();

  switch (strategy) {
    case 'windows-terminal':
      return spawnWtNewWindow(command, opts);
    case 'windows-cmd':
      return spawnCmdNewWindow(command, opts);
    case 'unix': {
      // Try common Unix terminal emulators in order
      const emulators = [
        ['gnome-terminal', ['--', ...command.split(' ')]],
        ['xterm', ['-e', command]],
        ['konsole', ['-e', command]],
      ];
      for (const [bin, args] of emulators) {
        try {
          const child = spawn(bin, args, { detached: true, shell: false, stdio: 'ignore' });
          child.unref();
          return child;
        } catch {
          /* try next */
        }
      }
      throw new Error('No suitable terminal emulator found on Unix');
    }
    default:
      throw new Error(`Unknown platform spawn strategy: ${strategy}`);
  }
}
```

---

## Anti-Patterns — DO NOT USE

```javascript
// ❌ CommandNotFoundException — wt.exe alias not on Node.js child process PATH
spawn('wt.exe', ['-w', 'new', 'new-tab', 'cmd', '/k', 'claude'], { shell: false });

// ❌ cmd /c wt (without 'start') — silently produces no visible window from non-interactive
//    subprocess contexts (Claude Code hooks, piped Bash, service processes)
spawn('cmd.exe', ['/c', 'wt', '-w', 'new', 'new-tab', 'cmd', '/k', 'claude'], { shell: false });

// ❌ Missing 'set CLAUDECODE=' — claude refuses to start inside another Claude Code session
spawn('cmd.exe', ['/c', 'start', '', 'wt', '-w', 'new', 'new-tab', 'cmd', '/k', 'claude']);

// ❌ shell: true — exposes shell metacharacter injection attack surface
spawn('cmd.exe', ['/c', 'wt', '-w', 'new', 'new-tab', userInput], { shell: true });

// ❌ spawn({detached:true}) in hooks — Windows kills child when hook exits
spawn('node', ['my-script.js'], { detached: true, stdio: 'ignore' }).unref();
// The hook runner's job object kills ALL descendants — detached does NOT escape it

// ❌ AppActivate("title") — hits wrong window when multiple instances exist
// WshShell.AppActivate "claude"  ← matches user's main session, not the new one

// ❌ .join('\n') for bat files — cmd.exe fails or garbles output
fs.writeFileSync(batPath, lines.join('\n'), 'utf8'); // MUST use '\r\n'

// ❌ title command in cmd — WT overrides with the running process name
// start "MyTitle" cmd /k "title MyTitle & claude"  ← WT ignores both titles

// ❌ Not calling child.unref() — Node.js waits for child to exit, keeps process alive
const child = spawn('cmd.exe', [...]);
// Missing: child.unref()
```

---

## CRITICAL: Hook Process Tree Escape (discovered 2026-03-25)

Claude Code hooks run in a subprocess with a Windows job object. `spawn({ detached: true })`
does **NOT** escape the job object — Windows kills ALL descendants when the hook exits.

### The ONLY reliable escape pattern

Write a `.bat` file, then `execFileSync('cmd', ['/c', batPath])`. Inside the bat,
use `wt` or `start` to create processes in an INDEPENDENT process tree.

```javascript
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const batPath = path.join(tmpDir, '_launcher.bat').replace(/\//g, '\\');
fs.writeFileSync(
  batPath,
  [
    '@echo off',
    `wt -w 0 new-tab --title "MySession" -- cmd /k "cd /d "${rootWin}" && my-command"`,
    `del "%~f0" 2>nul`,
  ].join('\r\n'),
  'utf8'
); // MUST be \r\n for bat files

try {
  execFileSync('cmd', ['/c', batPath], {
    shell: false,
    timeout: 5000,
    stdio: 'ignore',
    cwd: ROOT,
  });
} catch (_) {
  // bat self-delete can cause non-zero exit — harmless
  // wt/start already fired before the delete ran
}
```

Why this works:

1. `cmd.exe /c bat` runs the bat synchronously
2. `wt` or `start` inside the bat creates a process in a NEW process tree
3. The bat returns immediately after `wt`/`start` fires
4. The new process is NOT in the hook's job object — it survives
5. `del "%~f0" 2>nul` self-cleans the bat file

### Tab vs Window from hooks

```bat
@rem Opens a TAB in the most recent WT window:
wt -w 0 new-tab --title "MyTab" -- cmd /k "my-command"

@rem Opens a new WINDOW (use when you don't want to intrude on user's WT):
start "" /D "C:\mydir" cmd /k "my-command"
```

---

## VBScript Window Targeting by PID (discovered 2026-03-25)

When sending keystrokes to a specific window (e.g., auto-accepting a confirmation
prompt), you MUST target by PID. Window titles are unreliable because:

- WT overrides `title` command and `start` title with the running process name
- Multiple windows may have the same title (e.g., two "claude" sessions)

### WMI query to find exact process, then AppActivate by PID

```vbs
WScript.Sleep 4000
Set wmi = GetObject("winmgmts:\\.\root\cimv2")

' Find cmd.exe with a unique marker in command line
Set procs = wmi.ExecQuery( _
  "SELECT ProcessId FROM Win32_Process " & _
  "WHERE Name='cmd.exe' AND CommandLine LIKE '%MyUniqueMarker%'")
Dim targetPid: targetPid = 0
For Each proc In procs
    targetPid = proc.ProcessId
    Exit For
Next

' Fallback: newest cmd.exe
If targetPid = 0 Then
    Set procs2 = wmi.ExecQuery( _
      "SELECT ProcessId, CreationDate FROM Win32_Process WHERE Name='cmd.exe'")
    Dim newest: newest = ""
    For Each proc In procs2
        If newest = "" Or proc.CreationDate > newest Then
            newest = proc.CreationDate
            targetPid = proc.ProcessId
        End If
    Next
End If

If targetPid > 0 Then
    Set WshShell = WScript.CreateObject("WScript.Shell")
    WshShell.AppActivate CLng(targetPid)
    WScript.Sleep 500
    WshShell.SendKeys "{ENTER}"
End If
```

Launch the VBScript from the same bat that spawns the terminal:

```bat
@echo off
wt -w 0 new-tab --title "MySession" -- cmd /k "my-command"
start "" wscript "C:\path\to\_auto-accept.vbs"
del "%~f0" 2>nul
```

---

## Lockfile Deduplication for Hooks

Hooks fire on every UserPromptSubmit. Use atomic O_EXCL lockfile to prevent
spawning multiple windows:

```javascript
const LOCKFILE = path.join(runtimeDir, 'my-cooldown.lock');
const COOLDOWN_MS = 120000; // 2 minutes

let alreadyLocked = false;
try {
  // wx = O_CREAT | O_EXCL — fails atomically if file exists
  fs.writeFileSync(LOCKFILE, String(Date.now()), { flag: 'wx' });
} catch (e) {
  if (e.code === 'EEXIST') {
    try {
      const lockTime = parseInt(fs.readFileSync(LOCKFILE, 'utf8').trim(), 10);
      if (!isNaN(lockTime) && Date.now() - lockTime < COOLDOWN_MS) {
        alreadyLocked = true;
      } else {
        fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8'); // Expired
      }
    } catch (_) {
      fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8'); // Corrupt
    }
  }
}
if (alreadyLocked) process.exit(0);
```

---

## PID Alive Check (cross-platform)

```javascript
function isPidAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 = existence check only, no kill
    return true;
  } catch (_) {
    return false; // ESRCH = no such process
  }
}
```

---

## Bat File Requirements

### CRLF line endings are MANDATORY

```javascript
// WRONG — cmd.exe fails silently or produces bizarre errors with LF
fs.writeFileSync(batPath, lines.join('\n'), 'utf8');

// RIGHT — CRLF required for all .bat and .cmd files
fs.writeFileSync(batPath, lines.join('\r\n'), 'utf8');
```

### Bash vs cmd escaping trap

When testing from Git Bash (Claude Code's default shell on Windows),
`cmd /c path\to\file.bat` fails because bash interprets `\t` as tab, `\n` as
newline, etc.

```bash
# WRONG from Git Bash — bash eats backslashes
cmd /c C:\path\to\file.bat

# RIGHT — use forward slashes or run from Node.js
cmd /c "C:/path/to/file.bat"
```

Best practice: Always use `execFileSync('cmd', ['/c', batPath])` from Node.js.
Node handles backslash paths correctly.

---

## Quick Reference: Anti-Pattern Table

| Pattern                           | Problem                          | Fix                           |
| --------------------------------- | -------------------------------- | ----------------------------- |
| `spawn({detached:true})` in hooks | Windows kills child on hook exit | Write bat + `execFileSync`    |
| `AppActivate("title")`            | Multiple windows match           | Target by PID via WMI         |
| `start "Title" cmd /k` from hook  | Opens new window, not tab        | `wt -w 0 new-tab --` in bat   |
| `.join('\n')` for bat files       | cmd.exe fails                    | `.join('\r\n')` (CRLF)        |
| `cmd /c path\file.bat` from bash  | Bash eats backslashes            | Use Node.js `execFileSync`    |
| `title MyTitle` in cmd            | WT overrides with process name   | Don't rely on titles, use PID |
| `process.exit(1)` to block hook   | Exit 1 = error, NOT block        | Use `process.exit(2)`         |

## Related Files (agent-studio)

- `.claude/hooks/channels/channel-auto-start.cjs` — Production hook using all patterns above
- `.claude/tools/cli/channel-manager.cjs` — Channel session lifecycle management
- `.claude/tools/cli/terminal-tracker.cjs` — PID tracking for spawned sessions
- `scripts/channels/_archive/start-telegram.bat` — Simple one-line launcher reference (archived)

---

## Injection-Safe Argument Handling

When `title` or `profile` come from user-supplied or external data, sanitize before use:

```javascript
/**
 * Sanitize a string for use as a WT --title or -p argument.
 * Strips shell metacharacters that could escape argument boundaries.
 */
function sanitizeWtArg(value) {
  if (typeof value !== 'string') return '';
  // Allow alphanumeric, spaces, hyphens, underscores, dots
  return value.replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 64);
}
```

</execution_process>

<best_practices>

1. **Use cmd.exe /c wt as primary**: Simpler and more reliable than PowerShell Start-Process. No escaping issues with semicolons in command chaining.

2. **Always -w new for new windows**: Without `-w new`, `wt new-tab` opens in the user's CURRENT WT session. This is confusing when triggering from a hook. Use `-w new` to guarantee a new, isolated window.

3. **shell: false always**: Prevents shell injection. Pass all arguments as array elements, never as a concatenated string.

4. **child.unref() mandatory**: Without `unref()`, the parent Node.js process (the hook) will wait for the terminal to close before exiting. This hangs the hook indefinitely.

5. **Sanitize user-supplied arguments**: Tab titles and profile names from external sources must be sanitized before passing to WT CLI args.

6. **Check WT_SESSION before using WT-specific features**: Some WT CLI flags (like split-pane, tabColor) are WT-only and fail in regular cmd.exe.

</best_practices>

<enforcement_hooks>

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execute hook: `hooks/pre-execute.cjs` — validates required fields and platform checks.
Post-execute hook: `hooks/post-execute.cjs` — emits observability event.

</enforcement_hooks>
</instructions>

<examples>

### Example 1: Spawn a new Claude session in Windows Terminal (shift-change Phase 4)

```javascript
const { spawn } = require('child_process');

// From spawn-new-session.cjs
const isWT = !!process.env.WT_SESSION;

if (isWT) {
  // cmd.exe resolves App Execution Alias
  const child = spawn(
    'cmd.exe',
    ['/c', 'wt', '-w', 'new', 'new-tab', '--title', 'Claude New Session', 'cmd', '/k', 'claude'],
    { detached: true, shell: false, stdio: 'ignore' }
  );
  child.unref();
} else {
  // Fallback: plain cmd.exe window
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Start-Process cmd.exe -ArgumentList "/k claude" -WindowStyle Normal',
    ],
    { detached: true, shell: false, stdio: 'ignore' }
  );
  child.unref();
}
```

### Example 2: Open two panes in a new WT window

```javascript
// Open a new WT window with two vertical panes: claude on left, PowerShell on right
// Note: semicolons in cmd.exe arrays require escaping as a string element ';'
spawn(
  'cmd.exe',
  [
    '/c',
    'wt',
    '-w',
    'new',
    'new-tab',
    '--title',
    'Claude',
    'cmd',
    '/k',
    'claude',
    ';',
    'split-pane',
    '-V',
    'powershell',
  ],
  { detached: true, shell: false, stdio: 'ignore' }
);
```

### Example 3: Open a specific WT profile

```javascript
// Open Windows Terminal with the 'Ubuntu' WSL profile in a new window
spawn('cmd.exe', ['/c', 'wt', '-w', 'new', 'new-tab', '-p', 'Ubuntu', '--title', 'WSL Session'], {
  detached: true,
  shell: false,
  stdio: 'ignore',
});
```

### Example 4: Detect and report terminal strategy

```javascript
function reportTerminalStrategy() {
  if (process.platform !== 'win32') {
    console.log('Unix: use gnome-terminal / xterm / konsole');
  } else if (process.env.WT_SESSION) {
    console.log('Windows Terminal detected — use cmd.exe /c wt -w new new-tab');
  } else {
    console.log('No WT — use PowerShell Start-Process cmd.exe');
  }
}
```

</examples>

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Search Protocol

For code discovery and search tasks, follow this priority order:

1. `pnpm search:code "<query>"` (Primary intent-based search).
2. `Skill({ skill: 'ripgrep' })` (for exact keyword/regex matches).
3. Semantic/structural search via code tools if available.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md` and `.claude/context/memory/decisions.md`.

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
