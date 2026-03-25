#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On session start, spawns channel-manager.cjs start ONCE.
 * Uses a cooldown lockfile to prevent infinite spawn loops
 * (if claude exits before accepting the confirmation prompt,
 * isChannelRunning() returns false and the hook would re-fire).
 *
 * Cooldown: 120 seconds between spawn attempts.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCKFILE = path.join(ROOT, '.claude', 'context', 'runtime', 'channel-autostart-cooldown.lock');
const COOLDOWN_MS = 120000; // 2 minutes

let _input = '';
process.stdin.on('data', (chunk) => { _input += chunk; });
process.stdin.on('end', () => {
  try {
    // Cooldown check — don't retry within 2 minutes
    if (fs.existsSync(LOCKFILE)) {
      try {
        const lockTime = parseInt(fs.readFileSync(LOCKFILE, 'utf8').trim(), 10);
        if (Date.now() - lockTime < COOLDOWN_MS) {
          process.exit(0);
        }
      } catch (_e) {
        // Corrupt lockfile — proceed
      }
    }

    // Load .env
    const envPath = path.join(ROOT, '.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }

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

    // Write cooldown lockfile BEFORE spawning — prevents loop even if spawn fails
    fs.writeFileSync(LOCKFILE, String(Date.now()), 'utf8');

    // Fire-and-forget
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
});
