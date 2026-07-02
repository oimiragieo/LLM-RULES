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
const { spawn } = require('child_process');

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

  try {
    launchDaemon();
    process.stderr.write('[telegram-start] Channel daemon started\n');
  } catch (err) {
    process.stderr.write(`[telegram-start] Failed: ${err.message}\n`);
  }
}

function buildDaemonEnv(baseEnv = process.env) {
  const env = { ...baseEnv, TELEGRAM_HEADLESS_SESSION: '1' };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function launchDaemon(options = {}) {
  const spawnFn = options.spawnFn || spawn;
  const child = spawnFn(process.execPath, [DAEMON], {
    cwd: ROOT,
    env: buildDaemonEnv(options.env || process.env),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
  if (typeof child.unref === 'function') child.unref();
  return child;
}

if (require.main === module) {
  // Read stdin (hook protocol) then run
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('error', () =>
    main().catch(e => process.stderr.write(`[WARN] telegram-start: ${e.message}\n`))
  );
  process.stdin.on('end', () =>
    main().catch(e => process.stderr.write(`[WARN] telegram-start: ${e.message}\n`))
  );
}

module.exports = {
  buildDaemonEnv,
  launchDaemon,
  main,
  DAEMON,
  ROOT,
};
