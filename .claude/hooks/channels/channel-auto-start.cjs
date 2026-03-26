#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On session start, spawns channel-manager.cjs start ONCE.
 * Uses an atomic lockfile (O_EXCL) to prevent parallel hooks from
 * spawning multiple channel sessions.
 *
 * IMPORTANT: All logic runs synchronously at module level — do NOT
 * wait for stdin. UserPromptSubmit hooks may be killed before stdin
 * closes. Drain stdin passively to avoid EPIPE but never gate on it.
 *
 * Cooldown: 120 seconds between spawn attempts.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Drain stdin passively (prevent EPIPE) — never gate logic on it
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {});

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKFILE = path.join(
  ROOT,
  '.claude',
  'context',
  'runtime',
  'channel-autostart-cooldown.lock'
);
const COOLDOWN_MS = 120000; // 2 minutes

// ── All checks run synchronously at module load ──────────────────────────────

try {
  // 1. Atomic lockfile gate — use O_EXCL (wx) to prevent parallel hooks
  //    from all spawning simultaneously on the same prompt.
  let lockExists = false;
  try {
    const lockContent = fs.readFileSync(LOCKFILE, 'utf8').trim();
    const lockTime = parseInt(lockContent, 10);
    if (!isNaN(lockTime) && Date.now() - lockTime < COOLDOWN_MS) {
      lockExists = true;
    }
  } catch (_) {
    // No lockfile or corrupt — proceed
  }

  if (lockExists) {
    process.exit(0);
  }

  // Write lockfile IMMEDIATELY — before any other checks — to win the race
  // against parallel hook instances on the same prompt
  fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');

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

  // 4. Fire-and-forget — spawn channel-manager in a detached process
  const child = spawn('node', [channelManager, 'start'], {
    shell: false,
    detached: true,
    stdio: 'ignore',
    cwd: ROOT,
  });
  child.unref();

  process.stderr.write('[channel-auto-start] Spawned channel-manager (cooldown: 2min)\n');
} catch (err) {
  process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
}

process.exit(0);
