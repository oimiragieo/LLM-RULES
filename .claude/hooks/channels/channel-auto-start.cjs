#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * Spawns channel-manager.cjs start as a DETACHED background process
 * so it doesn't block the hook timeout. Returns immediately.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

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

    // Fire-and-forget: spawn as detached background process to avoid hook timeout
    const child = spawn('node', [channelManager, 'start'], {
      shell: false,
      detached: true,
      stdio: 'ignore',
      cwd: ROOT,
    });
    child.unref();

    process.stderr.write('[channel-auto-start] Spawned channel-manager start (background)\n');
  } catch (err) {
    process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
  }

  process.exit(0);
});
