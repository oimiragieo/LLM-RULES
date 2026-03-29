#!/usr/bin/env node
'use strict';

/**
 * a2a-server-autostart.cjs — UserPromptSubmit hook
 *
 * On session start, launches the A2A Express server as a fully detached
 * background subprocess in a new cmd window using `start`.
 *
 * CTO Directive #3 (MANDATORY): The server MUST be spawned as a fully
 * detached background subprocess. NEVER synchronous — it would hang the
 * Router's pre-tool event loop.
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
const LOCKFILE = path.join(RUNTIME, 'a2a-autostart-cooldown.lock');
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
  const autoStart = (process.env.A2A_AUTO_START || 'false').trim().toLowerCase();
  if (autoStart !== 'true') {
    process.exit(0);
  }

  // Don't spawn from inside an A2A session itself (prevent recursive spawn)
  const cmdLine = process.env.CLAUDE_COMMAND_LINE || '';
  if (cmdLine.includes('a2a-server') || process.env.A2A_SESSION === 'true') {
    process.exit(0);
  }

  // ── 4. Check if an A2A server is already alive ─────────────────────────────
  const trackerPath = path.join(RUNTIME, 'terminal-pids.json');
  if (fs.existsSync(trackerPath)) {
    try {
      const raw = fs.readFileSync(trackerPath, 'utf8');
      const tracker = safeParseJSON(raw);
      const session = (tracker.sessions || []).find(
        s => s.purpose === 'a2a-server' && s.status === 'active'
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

  // ── 5. Determine port ─────────────────────────────────────────────────────
  const port = parseInt(process.env.A2A_PORT || '3100', 10);
  const validPort = isNaN(port) ? 3100 : port;

  // ── 6. Write launcher bat ─────────────────────────────────────────────────
  const tmpDir = path.join(ROOT, '.claude', 'context', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const rootWin = ROOT.replace(/\//g, '\\');
  const batPath = path.join(tmpDir, '_a2a-autostart.bat').replace(/\//g, '\\');
  const serverPath = path
    .join(ROOT, '.claude', 'lib', 'a2a', 'standalone.cjs')
    .replace(/\//g, '\\');

  // Bat: start node with the standalone server in a new cmd window, then self-delete.
  // Uses `title A2AServer` inside `cmd /k` so the window title is set before node runs.
  fs.writeFileSync(
    batPath,
    [
      '@echo off',
      `start "" /D "${rootWin}" cmd /k "title A2AServer & node "${serverPath}" --port ${validPort}"`,
      `del "%~f0" 2>nul`,
    ].join('\r\n'),
    'utf8'
  );

  // ── 7. Execute the bat ─────────────────────────────────────────────────────
  // cmd /c runs the bat which uses `start` to create an independent window,
  // then returns immediately. The `start` command breaks out of the process
  // tree — the new cmd window is NOT a child of this hook.
  let spawnedPid = null;
  try {
    // Use powershell to run the bat and capture the PID of the spawned cmd window
    // This is more reliable than tasklist for getting the PID of a `start` command
    const psScript = `
$splat = @{
  FilePath = 'cmd'
  ArgumentList = '/c', '${batPath.replace(/\\/g, '\\\\')}'
  PassThru = $true
  WindowStyle = 'Hidden'
}
$proc = Start-Process @splat
Write-Output $proc.Id
`;
    const _result = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      {
        shell: false,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        cwd: ROOT,
      }
    );
    // The PID returned is the powershell process, not the spawned cmd.
    // We need a different approach: find the cmd with title "A2AServer" after spawn.
  } catch (_e) {
    // PowerShell approach failed, fall back to simpler execFileSync
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
  }

  // ── 8. Find the PID of the spawned A2A server ──────────────────────────────
  // Wait briefly then find the cmd.exe with window title "A2AServer"
  // Using tasklist with /v (verbose) to get window titles
  const startTime = Date.now();
  while (Date.now() - startTime < 3000) {
    // 3 second timeout
    try {
      const output = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*A2AServer*' } | Select-Object -First 1 -ExpandProperty Id`,
        ],
        {
          shell: false,
          timeout: 2000,
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
          cwd: ROOT,
        }
      );
      const pidStr = output.toString().trim();
      if (pidStr && /^\d+$/.test(pidStr)) {
        spawnedPid = parseInt(pidStr, 10);
        break;
      }
    } catch (_) {
      // Ignore errors, retry
    }
    // Small delay before retry
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }

  // ── 9. Record PID in terminal-pids.json ────────────────────────────────────
  try {
    let tracker = { sessions: [] };
    if (fs.existsSync(trackerPath)) {
      try {
        const raw = fs.readFileSync(trackerPath, 'utf8');
        tracker = safeParseJSON(raw);
        if (!tracker.sessions) tracker.sessions = [];
      } catch (_) {
        tracker = { sessions: [] };
      }
    }

    // Remove any old a2a-server entries
    tracker.sessions = tracker.sessions.filter(s => s.purpose !== 'a2a-server');

    // Add new entry
    if (spawnedPid) {
      tracker.sessions.push({
        purpose: 'a2a-server',
        pid: spawnedPid,
        status: 'active',
        port: validPort,
        startedAt: new Date().toISOString(),
      });

      // Atomic write: write to temp then rename
      const tempPath = trackerPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(tracker, null, 2), 'utf8');
      fs.renameSync(tempPath, trackerPath);
    }
  } catch (e) {
    process.stderr.write(
      `[a2a-autostart] Warning: Failed to update terminal-pids.json: ${e.message}\n`
    );
  }

  process.stderr.write(
    `[a2a-autostart] Launched A2A server on port ${validPort} (cooldown: 2min)\n`
  );
} catch (err) {
  process.stderr.write(`[a2a-autostart] Error: ${err.message}\n`);
}

process.exit(0);
