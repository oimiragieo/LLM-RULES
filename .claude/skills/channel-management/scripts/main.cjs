#!/usr/bin/env node
'use strict';

/**
 * channel-management/scripts/main.cjs
 *
 * CLI entry point for the channel-management skill.
 * Wraps channel-manager.cjs with structured JSON output and pre-execution validation.
 *
 * Usage:
 *   node .claude/skills/channel-management/scripts/main.cjs <action> [--json]
 *
 * Actions: start | stop | status | health
 *
 * Exit codes:
 *   0 — success
 *   1 — channel not running / degraded health (non-fatal)
 *   2 — fatal error (invalid action, missing token, crash)
 */

const path = require('path');
const fs = require('fs');

// ── Resolve project root ─────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// ── Bootstrap .env ───────────────────────────────────────────────────────────
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (_) {
  /* ignore */
}

// ── Input validation ─────────────────────────────────────────────────────────
const VALID_ACTIONS = ['start', 'stop', 'status', 'health'];
const action = process.argv[2] || 'status';
const jsonMode = process.argv.includes('--json');

if (!VALID_ACTIONS.includes(action)) {
  const err = {
    ok: false,
    error: `Unknown action: "${action}". Valid: ${VALID_ACTIONS.join(', ')}`,
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(err) + '\n');
  } else {
    process.stderr.write(`[channel-management] ${err.error}\n`);
  }
  process.exit(2);
}

// ── Load channel manager ─────────────────────────────────────────────────────
const managerPath = path.join(ROOT, '.claude', 'tools', 'cli', 'channel-manager.cjs');
const trackerPath = path.join(ROOT, '.claude', 'tools', 'cli', 'terminal-tracker.cjs');

if (!fs.existsSync(managerPath)) {
  const err = { ok: false, error: `channel-manager.cjs not found at: ${managerPath}` };
  process.stdout.write(JSON.stringify(err) + '\n');
  process.exit(2);
}

const { startChannel, stopChannel, isChannelRunning, getChannelPid } = require(managerPath);
const { listTracked, killOrphaned } = require(trackerPath);

// ── Execute action ───────────────────────────────────────────────────────────
let result;

switch (action) {
  case 'start': {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      result = {
        ok: false,
        action: 'start',
        reason: 'TELEGRAM_BOT_TOKEN not set — skipped',
        health: 'SKIPPED',
      };
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(1);
    }
    result = startChannel();
    result.action = 'start';
    result.health = result.ok ? 'OK' : 'DEGRADED';
    break;
  }

  case 'stop': {
    result = stopChannel();
    result.action = 'stop';
    result.health = 'STOPPED';
    break;
  }

  case 'status': {
    const running = isChannelRunning();
    const pid = getChannelPid();
    const tracked = listTracked().filter(s => s.purpose === 'channel-session');
    result = {
      ok: true,
      action: 'status',
      running,
      pid,
      sessions: tracked,
      health: running ? 'OK' : 'NOT_RUNNING',
    };
    break;
  }

  case 'health': {
    killOrphaned(); // prune dead entries first
    const running = isChannelRunning();
    const pid = getChannelPid();
    const tracked = listTracked().find(
      s => s.purpose === 'channel-session' && s.status === 'active'
    );
    result = {
      ok: running,
      action: 'health',
      running,
      pid,
      trackerEntry: tracked || null,
      health: running ? 'OK' : 'DEGRADED',
      checkedAt: new Date().toISOString(),
    };
    break;
  }

  default:
    result = { ok: false, action, error: 'Unhandled action' };
}

// ── Output ───────────────────────────────────────────────────────────────────
process.stdout.write(JSON.stringify(result, null, 2) + '\n');

process.exit(result.ok ? 0 : 1);
