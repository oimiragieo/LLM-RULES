#!/usr/bin/env node
'use strict';

/**
 * channel-auto-start.cjs — UserPromptSubmit hook
 *
 * On the FIRST prompt of each session, checks if CHANNEL_AUTO_START=true
 * and TELEGRAM_BOT_TOKEN is set. If both, spawns a new terminal window
 * with Claude running in channel mode via channel-manager.cjs.
 *
 * This ensures Telegram is always available without the router needing
 * to know the launch command. Fully autonomous — no human input needed.
 *
 * Registered in settings.json under UserPromptSubmit.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Only run once per session — use a flag file
const ROOT = path.resolve(__dirname, '..', '..', '..');
const flagFile = path.join(ROOT, '.claude', 'context', 'runtime', 'channel-autostart-done.flag');

// Read stdin (UserPromptSubmit provides prompt data)
let _input = '';
process.stdin.on('data', (chunk) => { _input += chunk; });
process.stdin.on('end', () => {
  try {
    // Skip if already started this session
    if (fs.existsSync(flagFile)) {
      process.exit(0);
      return;
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
      return;
    }

    // Check if this session already has --dangerously-load-development-channels
    // (i.e., this IS the channel session — don't spawn another one)
    const cmdLine = process.env.CLAUDE_COMMAND_LINE || '';
    if (cmdLine.includes('dangerously-load-development-channels')) {
      process.exit(0);
      return;
    }

    // Check if channel is already running
    const channelManager = path.join(ROOT, '.claude', 'tools', 'cli', 'channel-manager.cjs');
    if (!fs.existsSync(channelManager)) {
      process.exit(0);
      return;
    }

    try {
      const status = execFileSync('node', [channelManager, 'status'], {
        shell: false,
        encoding: 'utf8',
        timeout: 10000,
        cwd: ROOT,
      });
      const parsed = JSON.parse(status);
      if (parsed.running) {
        // Already running — write flag and skip
        fs.writeFileSync(flagFile, new Date().toISOString(), 'utf8');
        process.exit(0);
        return;
      }
    } catch (_) {
      // Status check failed — try to start anyway
    }

    // Start the channel
    const result = execFileSync('node', [channelManager, 'start'], {
      shell: false,
      encoding: 'utf8',
      timeout: 20000,
      cwd: ROOT,
    });

    // Write flag so we don't start again this session
    fs.writeFileSync(flagFile, new Date().toISOString(), 'utf8');

    // Log to stderr (not stdout — stdout is for hook protocol)
    process.stderr.write(`[channel-auto-start] ${result.trim()}\n`);
  } catch (err) {
    // Fail-open — don't block the user's prompt
    process.stderr.write(`[channel-auto-start] Error: ${err.message}\n`);
  }

  process.exit(0);
});
