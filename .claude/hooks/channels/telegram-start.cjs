#!/usr/bin/env node
'use strict';

/**
 * telegram-start.cjs — Launches the channel daemon
 *
 * Spawns the channel daemon (scripts/channels/daemon/index.cjs) as a hidden
 * background process. The daemon is a standalone event router that:
 *   - Polls Telegram directly (no MCP, no Claude for polling)
 *   - Only calls Claude -p --bare when a real message arrives
 *   - Exposes HTTP status on port 3101
 *   - Runs independently of any Claude session
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.claude', 'context', 'runtime');
const PID_FILE = path.join(RUNTIME, 'channel-daemon.pid');
const DAEMON = path.join(ROOT, 'scripts', 'channels', 'daemon', 'index.cjs');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

function isDaemonRunning() {
  // Check PID file
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(pid)) {
      process.kill(pid, 0);
      return true;
    }
  } catch {
    /* ignored */
  }

  // Check HTTP health endpoint
  return new Promise(resolve => {
    const port = process.env.CHANNEL_DAEMON_PORT || 3101;
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data.includes('"ok"')));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  loadEnv();

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const autoStart = (process.env.CHANNEL_AUTO_START || 'false').trim().toLowerCase();
  if (!botToken || autoStart !== 'true') {
    process.stderr.write(
      `[telegram-start] Skipped: token=${botToken ? 'SET' : 'MISSING'} autoStart=${autoStart}\n`
    );
    return;
  }

  if (process.env.TELEGRAM_HEADLESS_SESSION === '1') return;

  if (await isDaemonRunning()) {
    process.stderr.write('[telegram-start] Channel daemon already running\n');
    return;
  }

  fs.mkdirSync(RUNTIME, { recursive: true });

  // Don't pass ANTHROPIC_API_KEY — it would override OAuth and fail with OAuth tokens.
  // Without --bare, claude -p uses the normal OAuth session automatically.
  const daemonWin = DAEMON.replace(/\//g, '\\');
  const rootWin = ROOT.replace(/\//g, '\\');

  // Write launcher bat
  const batPath = path.join(RUNTIME, 'channel-daemon-launch.bat').replace(/\//g, '\\');
  fs.writeFileSync(
    batPath,
    [
      '@echo off',
      `set TELEGRAM_HEADLESS_SESSION=1`,
      `set TELEGRAM_BOT_TOKEN=${botToken}`,
      'rem auth via OAuth session (no API key needed)',
      process.env.TELEGRAM_ALLOWED_USERS
        ? `set TELEGRAM_ALLOWED_USERS=${process.env.TELEGRAM_ALLOWED_USERS}`
        : '',
      process.env.TELEGRAM_OWNER_ID ? `set TELEGRAM_OWNER_ID=${process.env.TELEGRAM_OWNER_ID}` : '',
      `cd /d "${rootWin}"`,
      `node "${daemonWin}"`,
    ]
      .filter(Boolean)
      .join('\r\n'),
    'utf8'
  );

  // Launch hidden via PowerShell
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Start-Process -WindowStyle Hidden -FilePath cmd.exe -ArgumentList '/c,"${batPath}"'`,
      ],
      { timeout: 5000, stdio: 'ignore', windowsHide: true }
    );

    process.stderr.write('[telegram-start] Channel daemon started\n');
  } catch (err) {
    process.stderr.write(`[telegram-start] Failed: ${err.message}\n`);
  }
}

// Read stdin (hook protocol) then run
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('error', () =>
  main().catch(e => process.stderr.write(`[WARN] telegram-start: ${e.message}\n`))
);
process.stdin.on('end', () =>
  main().catch(e => process.stderr.write(`[WARN] telegram-start: ${e.message}\n`))
);
