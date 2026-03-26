#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On session start, launches channel-manager.cjs via a .bat file using
 * `cmd /c start` to break completely out of the hook's process tree.
 *
 * Previous approach (spawn('node', [channelManager]) with detached:true)
 * failed because Windows kills the child when the hook process exits —
 * Node's detached flag doesn't escape the hook runner's job object.
 *
 * Lockfile uses O_EXCL (wx flag) for true atomic creation to prevent
 * parallel hook instances from all spawning simultaneously.
 *
 * All logic runs synchronously at module level — never gates on stdin.
 * Cooldown: 120 seconds between spawn attempts.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Drain stdin passively (prevent EPIPE) — never gate logic on it
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {});

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const LOCKFILE = path.join(RUNTIME, 'channel-autostart-cooldown.lock');
const COOLDOWN_MS = 120000; // 2 minutes

try {
  // 1. Atomic lockfile gate — try exclusive create first (wins the race)
  let alreadyLocked = false;
  try {
    // wx = O_CREAT | O_EXCL — fails atomically if file exists
    fs.writeFileSync(LOCKFILE, String(Date.now()), { flag: 'wx' });
    // We won the lock — proceed
  } catch (e) {
    if (e.code === 'EEXIST') {
      // File exists — check if cooldown has expired
      try {
        const lockTime = parseInt(fs.readFileSync(LOCKFILE, 'utf8').trim(), 10);
        if (!isNaN(lockTime) && Date.now() - lockTime < COOLDOWN_MS) {
          alreadyLocked = true;
        } else {
          // Expired — overwrite with new timestamp
          fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
        }
      } catch (_) {
        // Corrupt lockfile — overwrite
        fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
      }
    } else {
      // Some other error (permissions?) — try regular write
      fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');
    }
  }

  if (alreadyLocked) {
    process.exit(0);
  }

  // 2. Load .env
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

  // 3. Check prerequisites
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

  const channelManager = path.join(ROOT, '.claude', 'tools', 'cli', 'channel-manager.cjs');
  if (!fs.existsSync(channelManager)) {
    process.exit(0);
  }

  // 4. Write a tiny .bat launcher and use `cmd /c start` to escape the
  //    hook runner's process tree entirely. Node's detached:true doesn't
  //    work here because Windows job objects still kill the child.
  const batPath = path.join(ROOT, '.claude', 'context', 'tmp', '_channel-autostart.bat');
  const nodePath = process.execPath.replace(/\//g, '\\');
  const mgrPath = channelManager.replace(/\//g, '\\');
  const batContent = [
    '@echo off',
    `"${nodePath}" "${mgrPath}" start`,
    `del "%~f0"`,
  ].join('\r\n');

  fs.mkdirSync(path.dirname(batPath), { recursive: true });
  fs.writeFileSync(batPath, batContent, 'utf8');

  // `start "" /b` runs the bat in a new process group, completely detached.
  // The bat file deletes itself after running.
  execFileSync('cmd', ['/c', 'start', '""', '/b', batPath], {
    shell: false,
    windowsHide: true,
    timeout: 5000,
    cwd: ROOT,
  });

  process.stderr.write('[channel-auto-start] Launched channel-manager via bat (cooldown: 2min)\n');
} catch (err) {
  process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
}

process.exit(0);
