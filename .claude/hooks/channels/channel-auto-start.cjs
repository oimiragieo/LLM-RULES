#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On session start, directly launches `claude` with channel flags in a new
 * cmd window using `start`. No channel-manager indirection — mirrors what
 * scripts/channels/start-telegram.bat does (proven to work).
 *
 * After launching, spawns a VBScript to auto-accept the development-channels
 * confirmation prompt (AppActivate + SendKeys Enter).
 *
 * Lockfile uses O_EXCL (wx flag) for atomic creation to prevent races.
 * Cooldown: 120 seconds between spawn attempts.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Drain stdin passively (prevent EPIPE) — never gate logic on it
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {});

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const LOCKFILE = path.join(RUNTIME, 'channel-autostart-cooldown.lock');
const COOLDOWN_MS = 120000; // 2 minutes

try {
  // ── 1. Atomic lockfile gate ───────────────────────────────────────────────
  let alreadyLocked = false;
  try {
    fs.writeFileSync(LOCKFILE, String(Date.now()), { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') {
      try {
        const lockTime = parseInt(fs.readFileSync(LOCKFILE, 'utf8').trim(), 10);
        if (!isNaN(lockTime) && Date.now() - lockTime < COOLDOWN_MS) {
          alreadyLocked = true;
        } else {
          fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
        }
      } catch (_) {
        fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
      }
    } else {
      fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
    }
  }
  if (alreadyLocked) {
    process.exit(0);
  }

  // ── 2. Load .env ──────────────────────────────────────────────────────────
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }

  // ── 3. Check prerequisites ────────────────────────────────────────────────
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const autoStart = (process.env.CHANNEL_AUTO_START || 'false').trim().toLowerCase();
  if (!botToken || autoStart !== 'true') {
    process.exit(0);
  }

  // Don't spawn from the channel session itself
  const cmdLine = process.env.CLAUDE_COMMAND_LINE || '';
  if (cmdLine.includes('dangerously-load-development-channels')) {
    process.exit(0);
  }

  // ── 4. Check if a channel session is already alive ────────────────────────
  const trackerPath = path.join(RUNTIME, 'terminal-pids.json');
  if (fs.existsSync(trackerPath)) {
    try {
      const raw = fs.readFileSync(trackerPath, 'utf8');
      const tracker = safeParseJSON(raw);
      const session = (tracker.sessions || []).find(
        s => s.purpose === 'channel-session' && s.status === 'active'
      );
      if (session && session.pid) {
        try {
          process.kill(session.pid, 0); // signal 0 = just check if alive
          process.exit(0); // already running — skip
        } catch (_) {
          // PID dead — continue to spawn
        }
      }
    } catch (_) {
      // corrupt tracker — continue
    }
  }

  // ── 5. Build channel flags ────────────────────────────────────────────────
  const plugins = (process.env.CHANNEL_PLUGINS || 'server:telegram-relay')
    .split(/\s+/)
    .filter(Boolean);
  const channelFlags = plugins
    .flatMap(p => ['--dangerously-load-development-channels', p])
    .join(' ');
  const perms = (process.env.CHANNEL_PERMISSIONS || '--dangerously-skip-permissions').trim();

  // ── 6. Write launcher bat + auto-accept VBS ───────────────────────────────
  const tmpDir = path.join(ROOT, '.claude', 'context', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const rootWin = ROOT.replace(/\//g, '\\');
  const vbsPath = path.join(tmpDir, '_auto-accept.vbs').replace(/\//g, '\\');
  const batPath = path.join(tmpDir, '_channel-autostart.bat').replace(/\//g, '\\');

  // VBScript: find the newest cmd.exe process (our channel window), activate
  // it by PID, and press Enter to accept the development-channels confirmation.
  // Cannot use window title because WT overrides it with the running process.
  fs.writeFileSync(
    vbsPath,
    [
      'WScript.Sleep 4000',
      'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
      "Set procs = wmi.ExecQuery(\"SELECT ProcessId FROM Win32_Process WHERE Name='cmd.exe' AND CommandLine LIKE '%TelegramChannel%'\")",
      'Dim targetPid: targetPid = 0',
      'For Each proc In procs',
      '  targetPid = proc.ProcessId',
      '  Exit For',
      'Next',
      'If targetPid = 0 Then',
      '  Set procs2 = wmi.ExecQuery("SELECT ProcessId, CreationDate FROM Win32_Process WHERE Name=\'cmd.exe\'")',
      '  Dim newest: newest = ""',
      '  For Each proc In procs2',
      '    If newest = "" Or proc.CreationDate > newest Then',
      '      newest = proc.CreationDate',
      '      targetPid = proc.ProcessId',
      '    End If',
      '  Next',
      'End If',
      'If targetPid > 0 Then',
      '  Set WshShell = WScript.CreateObject("WScript.Shell")',
      '  WshShell.AppActivate CLng(targetPid)',
      '  WScript.Sleep 500',
      '  WshShell.SendKeys "{ENTER}"',
      'End If',
    ].join('\r\n'),
    'utf8'
  );

  // Bat: start claude directly in a new cmd window (like start-telegram.bat),
  // then start VBS for auto-accept, then self-delete.
  // Uses `title TelegramChannel` inside `cmd /k` so the window title is set
  // BEFORE claude runs — Windows Terminal uses the cmd title for its tab.
  // VBScript targets this title to auto-accept the confirmation prompt.
  fs.writeFileSync(
    batPath,
    [
      '@echo off',
      `start "" /D "${rootWin}" cmd /k "title TelegramChannel & claude ${perms} ${channelFlags}"`,
      `start "" wscript "${vbsPath}"`,
      `del "%~f0" 2>nul`,
    ].join('\r\n'),
    'utf8'
  );

  // ── 7. Execute the bat ─────────────────────────────────────────────────────
  // cmd /c runs the bat which uses `start` to create an independent window,
  // then returns immediately. The `start` command breaks out of the process
  // tree — the new cmd window is NOT a child of this hook.
  // Note: execFileSync may throw if cmd returns non-zero (e.g., the bat
  // self-delete fails). Catch and continue since the `start` already fired.
  try {
    execFileSync('cmd', ['/c', batPath], {
      shell: false,
      timeout: 5000,
      stdio: 'ignore',
      windowsHide: true,
      cwd: ROOT,
    });
  } catch (_) {
    // The `start` inside the bat already launched the window —
    // errors here are typically from the self-delete line, which is harmless.
  }

  process.stderr.write(
    '[channel-auto-start] Launched claude channel session directly (cooldown: 2min)\n'
  );
} catch (err) {
  process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
}

process.exit(0);
