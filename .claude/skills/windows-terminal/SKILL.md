---
name: windows-terminal
description: Spawn and manage Windows Terminal (wt.exe) windows and tabs from Node.js scripts and Claude Code hooks, with App Execution Alias resolution, correct CLI flags, and anti-patterns to avoid
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: false
tools: [Read, Write, Bash]
agents: [developer, nodejs-pro]
category: "Specialized Patterns"
tags: [windows, terminal, spawn, wt, child-process, hooks]
verified: true
lastVerifiedAt: 2026-03-10
best_practices:
  - Always use cmd.exe /c wt or PowerShell Start-Process — never spawn wt.exe directly
  - Always use -w new to open a new window, not a tab in the user's current WT session
  - Always use shell:false with array args (no shell injection risk)
  - Always call child.unref() after detached spawn
error_handling: graceful
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
spawn('cmd.exe', [
  '/c', 'start', '',   // 'start' = Windows GUI window launcher; '' = required title placeholder
  'wt', '-w', 'new', 'new-tab',
  '--title', 'My Title',
  'cmd', '/k', 'set CLAUDECODE= && claude'  // unset CLAUDECODE before launching claude
], { shell: false });
// Note: no detached/stdio/unref needed — 'start' fully detaches by design
```

**Approach B — PowerShell Start-Process (alternative):**
`Start-Process` uses the Windows shell infrastructure to resolve aliases.
```javascript
spawn('powershell.exe', ['-NoProfile', '-Command',
  'Start-Process wt -ArgumentList "-w new new-tab --title \'My Title\' cmd /k \'set CLAUDECODE= && claude\'"'
], { detached: true, shell: false, stdio: 'ignore' });
```

**Approach C — PowerShell Start-Process cmd (no WT required):**
Fallback when Windows Terminal is not installed or WT_SESSION is not set.
```javascript
spawn('powershell.exe', ['-NoProfile', '-Command',
  'Start-Process cmd.exe -ArgumentList "/k claude" -WindowStyle Normal'
], { detached: true, shell: false, stdio: 'ignore' });
```

---

## WT CLI Syntax (from learn.microsoft.com, verified 2026-03-10)

```
wt [options] [command ; ]
```

If no command is specified, `new-tab` is used by default.

### Global Options

| Option | Short | Description |
|--------|-------|-------------|
| `--window <id>` | `-w` | Target window. `new`/`-1` = always new window; `0`/`last` = most recent; name = named window |
| `--maximized` | `-M` | Launch maximized |
| `--fullscreen` | `-F` | Launch fullscreen |
| `--focus` | `-f` | Launch in focus mode |
| `--pos x,y` | | Launch at position |
| `--size c,r` | | Launch with columns/rows |

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

| Shell | Separator | Example |
|-------|-----------|---------|
| cmd.exe | `;` | `wt new-tab cmd ; new-tab powershell` |
| PowerShell | `` `; `` (backtick-escaped) | `` wt new-tab cmd `; new-tab powershell `` |
| PowerShell stop-parse | `--% ;` | `wt --% new-tab cmd ; new-tab powershell` |
| Node.js (cmd.exe approach) | Array element `";"` | `['/c', 'wt', 'new-tab', 'cmd', ';', 'new-tab', 'powershell']` |

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
    detached: true, shell: false, stdio: 'ignore'
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
    detached: true, shell: false, stdio: 'ignore'
  });
  child.unref();
  return child;
}
```

### Fallback: new cmd.exe window (no WT required)

```javascript
function spawnCmdNewWindow(command, opts = {}) {
  const { windowStyle = 'Normal' } = opts;
  const child = spawn('powershell.exe', [
    '-NoProfile', '-Command',
    `Start-Process cmd.exe -ArgumentList "/k ${command}" -WindowStyle ${windowStyle}`
  ], { detached: true, shell: false, stdio: 'ignore' });
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
        } catch { /* try next */ }
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
//    ("Nested sessions share runtime resources and will crash all active sessions")
spawn('cmd.exe', ['/c', 'start', '', 'wt', '-w', 'new', 'new-tab', 'cmd', '/k', 'claude']);

// ❌ new-tab without -w new — opens TAB in user's existing WT session (confusing UX)
spawn('cmd.exe', ['/c', 'wt', 'new-tab', '--title', 'Claude', 'cmd', '/k', 'claude']);

// ❌ shell: true — exposes shell metacharacter injection attack surface
spawn('cmd.exe', ['/c', 'wt', '-w', 'new', 'new-tab', userInput], { shell: true });

// ❌ Direct string concatenation into PowerShell — injection risk
spawn('powershell.exe', ['-Command', `wt -w new new-tab ${userTitle}`]);
// → if userTitle = '"; rm -rf /' ... you get the idea

// ❌ execSync — blocks Node.js event loop, hangs hooks
const { execSync } = require('child_process');
execSync('wt -w new new-tab cmd /k claude'); // BLOCKS until WT closes

// ❌ Not calling child.unref() — Node.js waits for child to exit, keeps process alive
const child = spawn('cmd.exe', [...]);
// Missing: child.unref()
```

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
  const child = spawn('cmd.exe', [
    '/c', 'wt', '-w', 'new', 'new-tab',
    '--title', 'Claude New Session',
    'cmd', '/k', 'claude'
  ], { detached: true, shell: false, stdio: 'ignore' });
  child.unref();
} else {
  // Fallback: plain cmd.exe window
  const child = spawn('powershell.exe', [
    '-NoProfile', '-Command',
    'Start-Process cmd.exe -ArgumentList "/k claude" -WindowStyle Normal'
  ], { detached: true, shell: false, stdio: 'ignore' });
  child.unref();
}
```

### Example 2: Open two panes in a new WT window

```javascript
// Open a new WT window with two vertical panes: claude on left, PowerShell on right
// Note: semicolons in cmd.exe arrays require escaping as a string element ';'
spawn('cmd.exe', [
  '/c', 'wt', '-w', 'new',
  'new-tab', '--title', 'Claude', 'cmd', '/k', 'claude',
  ';', 'split-pane', '-V', 'powershell'
], { detached: true, shell: false, stdio: 'ignore' });
```

### Example 3: Open a specific WT profile

```javascript
// Open Windows Terminal with the 'Ubuntu' WSL profile in a new window
spawn('cmd.exe', [
  '/c', 'wt', '-w', 'new', 'new-tab',
  '-p', 'Ubuntu',
  '--title', 'WSL Session'
], { detached: true, shell: false, stdio: 'ignore' });
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
