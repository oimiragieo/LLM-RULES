#!/usr/bin/env node
/**
 * start-with-channels.cjs
 * Convenience launcher: reads .env and starts Claude Code with or without
 * the Telegram channel flag depending on TELEGRAM_BOT_TOKEN + CHANNEL_AUTO_START.
 *
 * Usage:
 *   node scripts/start-with-channels.cjs
 *   npm run start:telegram
 *   pnpm start:telegram
 *
 * Environment variables (read from .env):
 *   TELEGRAM_BOT_TOKEN     — required to enable channel auto-start
 *   CHANNEL_AUTO_START     — set to "true" to enable (default: false)
 *   CHANNEL_PLUGINS        — channel identifier (default: server:telegram-relay)
 *   CHANNEL_PERMISSIONS    — extra flags passed to claude (e.g. --dangerously-skip-permissions)
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Load .env (best-effort — no hard dependency on dotenv package)
// ---------------------------------------------------------------------------
function loadDotenv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Silently ignore .env parse errors — fall through to defaults
  }
}

loadDotenv();

// ---------------------------------------------------------------------------
// Resolve launch mode
// ---------------------------------------------------------------------------
const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const autoStart = (process.env.CHANNEL_AUTO_START || 'false').trim().toLowerCase();
const channelPlugins = (process.env.CHANNEL_PLUGINS || 'server:telegram-relay').trim();
const channelPermissions = (process.env.CHANNEL_PERMISSIONS || '').trim();

const shouldStartChannels = botToken && autoStart === 'true';

// ---------------------------------------------------------------------------
// Build the claude command args (shell: false — array-based, no injection)
// ---------------------------------------------------------------------------
let claudeArgs;

if (shouldStartChannels) {
  // Build: claude [CHANNEL_PERMISSIONS flags...] --dangerously-load-development-channels <CHANNEL_PLUGINS>
  const permissionsArgs = channelPermissions
    ? channelPermissions.split(/\s+/).filter(Boolean)
    : [];
  claudeArgs = [...permissionsArgs, '--dangerously-load-development-channels', channelPlugins];
  console.log('[start-with-channels] Channel mode enabled, launching with:', claudeArgs.join(' '));
} else {
  claudeArgs = [];
  if (!botToken) {
    console.log('[start-with-channels] Channel not configured, launching plain claude');
  } else {
    console.log('[start-with-channels] Auto-start disabled, launching plain claude');
  }
}

// ---------------------------------------------------------------------------
// Spawn claude (cross-platform)
// ---------------------------------------------------------------------------
// On Windows, npm installs a .cmd wrapper — .cmd files are batch scripts
// that require a shell to execute. We use cross-spawn-safe pattern:
// spawn the cmd via cmd.exe /c which is safe when args are array-based.
const isWindows = process.platform === 'win32';
const claudeCmd = 'claude';

// stdio: 'inherit' passes through stdin/stdout/stderr to the terminal so
// the interactive Claude Code session works normally.
// shell: true is required on Windows for .cmd wrappers (npm global installs).
// Args are passed as an array so shell metacharacter injection is still prevented.
const child = spawn(claudeCmd, claudeArgs, {
  shell: isWindows,
  stdio: 'inherit',
  env: process.env,
  windowsHide: false,
});

child.on('error', (err) => {
  console.error('[start-with-channels] Failed to spawn claude:', err.message);
  console.error('Ensure claude is installed and on your PATH: https://claude.ai/download');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
