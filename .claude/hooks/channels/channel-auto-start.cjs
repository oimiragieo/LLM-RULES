#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On each prompt, checks if CHANNEL_AUTO_START=true, TELEGRAM_BOT_TOKEN
 * is set, and no channel session is already running. If all conditions met,
 * spawns a new terminal with Claude in channel mode via channel-manager.cjs.
 *
 * Idempotent: channel-manager.cjs checks isChannelRunning() internally.
 * No flag file needed — the running PID is the guard.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Read stdin (required by hook protocol)
let _input = '';
process.stdin.on('data', (chunk) => { _input += chunk; });
process.stdin.on('end', () => {
  try {
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

    // Gate: both must be set
    if (!botToken || autoStart !== 'true') {
      process.exit(0);
    }

    // Gate: don't spawn from the channel session itself
    const cmdLine = process.env.CLAUDE_COMMAND_LINE || '';
    if (cmdLine.includes('dangerously-load-development-channels')) {
      process.exit(0);
    }

    // Gate: channel-manager.cjs must exist
    const channelManager = path.join(ROOT, '.claude', 'tools', 'cli', 'channel-manager.cjs');
    if (!fs.existsSync(channelManager)) {
      process.exit(0);
    }

    // channel-manager.cjs start is idempotent — it checks isChannelRunning()
    // internally and no-ops if already running. Safe to call every prompt.
    const result = execFileSync('node', [channelManager, 'start'], {
      shell: false,
      encoding: 'utf8',
      timeout: 20000,
      cwd: ROOT,
    });

    const parsed = JSON.parse(result);
    if (parsed.reason !== 'already-running') {
      process.stderr.write(`[channel-auto-start] ${result.trim()}\n`);
    }
  } catch (err) {
    // Fail-open — don't block the user's prompt
    process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
  }

  process.exit(0);
});
