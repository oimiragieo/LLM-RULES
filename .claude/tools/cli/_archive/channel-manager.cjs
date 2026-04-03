#!/usr/bin/env node
'use strict';

/**
 * channel-manager.cjs — Auto-spawns a Claude Code --channels session in a new
 * Windows Terminal tab and tracks it via terminal-tracker.cjs.
 *
 * CLI:  node .claude/tools/cli/channel-manager.cjs [start|stop|status]
 *
 * Exports: startChannel(), stopChannel(), isChannelRunning(), getChannelPid()
 *
 * .env configuration:
 *   TELEGRAM_BOT_TOKEN      Required — skipped silently when absent
 *   CHANNEL_AUTO_START      true|false (default: false)
 *   CHANNEL_PLUGINS         Space-separated plugin list
 *                           (default: plugin:telegram@claude-plugins-official)
 *   CHANNEL_PERMISSIONS     Extra claude flags (e.g. --dangerously-skip-permissions)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { registerSpawn, listTracked, killOrphaned } = require('./terminal-tracker.cjs');

// ── Bootstrap .env ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..');
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (_) {
  /* ignore */
}

// ── Configuration ──────────────────────────────────────────────────────────────

const PURPOSE_TAG = 'channel-session';

function getConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    plugins: (process.env.CHANNEL_PLUGINS || 'server:telegram-relay').split(/\s+/).filter(Boolean),
    permissions: process.env.CHANNEL_PERMISSIONS || '',
  };
}

// ── PID helpers ────────────────────────────────────────────────────────────────

/** Return the tracked active channel session, or null. */
function getChannelSession() {
  return listTracked().find(s => s.purpose === PURPOSE_TAG && s.status === 'active') || null;
}

/** Check whether a PID is still alive via PowerShell (shell:false). */
function isPidAlive(pid) {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id`,
      ],
      { shell: false, encoding: 'utf8', timeout: 8000 }
    ).trim();
    return out === String(pid);
  } catch (_) {
    return false;
  }
}

/** Sleep synchronously via PowerShell (shell:false). */
function sleepMs(ms) {
  try {
    execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Start-Sleep -Milliseconds ${ms}`],
      { shell: false, timeout: ms + 3000 }
    );
  } catch (_) {
    /* ignore */
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns true if a channel session is currently running. */
function isChannelRunning() {
  const s = getChannelSession();
  return Boolean(s && s.pid !== null && isPidAlive(s.pid));
}

/** Returns the PID of the running channel session, or null. */
function getChannelPid() {
  const s = getChannelSession();
  return s ? s.pid || null : null;
}

/**
 * Start a channel session in a new Windows Terminal tab.
 * Idempotent — no-op if already running.
 * @returns {{ ok: boolean, pid: number|null, reason: string }}
 */
function startChannel() {
  const cfg = getConfig();
  if (!cfg.botToken) {
    return { ok: false, pid: null, reason: 'TELEGRAM_BOT_TOKEN not set — skipped' };
  }
  if (isChannelRunning()) {
    return { ok: true, pid: getChannelPid(), reason: 'already-running' };
  }

  killOrphaned(); // prune dead entries before registering a new one

  // Build wt args. On Windows, claude is a .cmd wrapper — wt can't resolve
  // .cmd files directly, so we use `cmd /c claude` to let cmd.exe handle it.
  const channelArgs = cfg.plugins.flatMap(p => ['--dangerously-load-development-channels', p]);
  const permParts = cfg.permissions ? cfg.permissions.split(/\s+/).filter(Boolean) : [];
  channelArgs.unshift(...permParts);

  // --dangerously-load-development-channels shows a confirmation prompt.
  // We auto-accept by spawning a background PowerShell that sends Enter
  // to the foreground window after a short delay. This avoids piping stdin
  // (which breaks Ink's raw mode) while keeping launch fully hands-free.
  // Simple seed prompt — no special chars, no file paths, no nested quotes.
  // The telegram-channel-prompt.md is picked up via CLAUDE.md auto-discovery.
  // cmd /k keeps the window open if claude exits unexpectedly (e.g. confirmation prompt timeout).
  // No seed prompt — it interferes with the confirmation prompt selection.
  // The channel session picks up telegram-channel-prompt.md via CLAUDE.md.
  // Open as a tab in the CURRENT terminal window.
  // -w 0 only works when called from within a WT process (not detached hooks).
  // When called directly by the router via Bash, it opens in the same window.
  // Write a .bat launcher so wt executes a single file — avoids argument
  // splitting issues when spawned from detached hook processes.
  const batPath = path.join(ROOT, '.claude', 'context', 'tmp', '_channel-launch.bat');
  const batContent = [
    '@echo off',
    `cd /d "${ROOT}"`,
    `claude ${channelArgs.join(' ')}`,
    'pause',
  ].join('\r\n');
  fs.writeFileSync(batPath, batContent, 'utf8');

  const TAB_TITLE = 'TelegramChannel';
  const wtArgs = ['new-tab', '--title', TAB_TITLE, '-d', ROOT, '--', batPath];

  // Snapshot before launch so afterSpawn() can diff new PIDs
  const afterSpawn = registerSpawn(PURPOSE_TAG, 'channel-manager');

  try {
    const child = spawn('wt', wtArgs, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.on('error', e => {
      if (e.code === 'ENOENT') {
        // Fallback: wt not found, use a robust .bat file to avoid Windows escaping bugs
        const batPath = path.join(ROOT, '.claude', 'context', 'tmp', '_fallback_launch.bat');
        const batContent = `@echo off\r\ncd /d "${ROOT}"\r\nclaude ${channelArgs.join(' ')}\r\npause\r\ndel "%~f0"`;
        try {
          require('fs').writeFileSync(batPath, batContent, 'utf8');
        } catch (_) {
          /* fallback write failed */
        }
        spawn('cmd', ['/c', 'start', '"Agent Studio Channel"', batPath], {
          shell: false,
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
          cwd: ROOT,
        }).unref();
      }
    });
    child.unref();
  } catch (e) {
    return { ok: false, pid: null, reason: `spawn failed: ${e.message}` };
  }

  // Give wt time to create the tab and start the claude process (~3 s is typically enough)
  sleepMs(3000);

  // Diff PIDs once and record in tracker
  const newPid = afterSpawn();

  // Auto-accept confirmation prompt via VBScript (Windows only).
  // Uses AppActivate with the resolved PID to target the exact window —
  // avoids the "wrong window" problem when multiple Claude instances exist.
  if (process.platform === 'win32') {
    const vbsPath = path
      .resolve(ROOT, '.claude', 'context', 'tmp', '_auto-accept.vbs')
      .replace(/\//g, '\\');
    // If we have a PID, target by PID. Otherwise fall back to window title.
    const activateExpr = newPid
      ? `WshShell.AppActivate(${newPid})`
      : 'WshShell.AppActivate("claude")';
    const vbsContent = [
      'WScript.Sleep 4000',
      'Set WshShell = WScript.CreateObject("WScript.Shell")',
      activateExpr,
      'WScript.Sleep 500',
      'WshShell.SendKeys "{ENTER}"',
      'WScript.Sleep 500',
      'Dim fso: Set fso = CreateObject("Scripting.FileSystemObject")',
      'fso.DeleteFile WScript.ScriptFullName, True',
    ].join('\r\n');
    try {
      fs.writeFileSync(vbsPath, vbsContent, 'utf8');
      spawn('wscript', [vbsPath], {
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: ROOT,
      }).unref();
    } catch (_) {
      /* best-effort */
    }
  }

  const reason = newPid !== null ? 'started' : 'started-pid-unresolved';
  return { ok: true, pid: newPid, reason };
}

/**
 * Stop the running channel session.
 * @returns {{ ok: boolean, pid: number|null, reason: string }}
 */
function stopChannel() {
  const pid = getChannelPid();
  if (pid === null) return { ok: true, pid: null, reason: 'not-running' };

  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
      ],
      { shell: false, timeout: 10000 }
    );
  } catch (_) {
    /* already exited */
  }

  return { ok: true, pid, reason: 'stopped' };
}

/**
 * Restart: force-kill then re-spawn. Use when the channel session is
 * alive but unresponsive (e.g. after system sleep).
 * @returns {{ ok: boolean, pid: number|null, reason: string }}
 */
function restartChannel() {
  stopChannel();
  sleepMs(2000);
  return startChannel();
}

// ── CLI mode ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const cmd = (process.argv[2] || 'status').toLowerCase();
  if (cmd === 'start') {
    const r = startChannel();
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exitCode = r.ok ? 0 : 1;
  } else if (cmd === 'stop') {
    const r = stopChannel();
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else if (cmd === 'restart') {
    const r = restartChannel();
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exitCode = r.ok ? 0 : 1;
  } else if (cmd === 'status') {
    process.stdout.write(
      JSON.stringify({ running: isChannelRunning(), pid: getChannelPid() }, null, 2) + '\n'
    );
  } else {
    process.stderr.write(
      'Usage: node channel-manager.cjs [start|stop|restart|status]\n\n' +
        '  start   Spawn channel session (idempotent)\n' +
        '  stop    Kill the running channel session\n' +
        '  restart Force-kill and re-spawn (use after system sleep)\n' +
        '  status  Print running status and PID\n\n' +
        'Env: TELEGRAM_BOT_TOKEN, CHANNEL_AUTO_START, CHANNEL_PLUGINS, CHANNEL_PERMISSIONS\n'
    );
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = { startChannel, stopChannel, isChannelRunning, getChannelPid };
