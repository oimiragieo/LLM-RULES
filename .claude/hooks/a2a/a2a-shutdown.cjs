#!/usr/bin/env node
'use strict';

/**
 * a2a-shutdown.cjs — SessionEnd hook
 *
 * Gracefully shuts down the A2A server when the session ends.
 * Kills the A2A server PID recorded in terminal-pids.json.
 * Updates the PID entry to status: 'stopped'.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Drain stdin passively (prevent EPIPE) — never gate logic on it
process.stdin.resume();
process.stdin.on('data', () => {});
process.stdin.on('end', () => {});

const ROOT = path.resolve(__dirname, '..', '..', '..');
// Allow test override via TEST_RUNTIME_DIR env var
const RUNTIME = process.env.TEST_RUNTIME_DIR || path.join(ROOT, '.claude', 'context', 'runtime');
const TRACKER_PATH = path.join(RUNTIME, 'terminal-pids.json');

try {
  // ── 1. Check if terminal-pids.json exists ─────────────────────────────────
  if (!fs.existsSync(TRACKER_PATH)) {
    process.exit(0);
  }

  // ── 2. Load tracker and find A2A server session ───────────────────────────
  let tracker;
  try {
    const raw = fs.readFileSync(TRACKER_PATH, 'utf8');
    tracker = safeParseJSON(raw);
    if (!tracker.sessions) tracker.sessions = [];
  } catch (_) {
    process.exit(0);
  }

  const session = tracker.sessions.find(s => s.purpose === 'a2a-server' && s.status === 'active');

  if (!session || !session.pid) {
    process.exit(0);
  }

  // ── 3. Kill the A2A server process ────────────────────────────────────────
  const pid = session.pid;
  const port = session.port || 3100;

  try {
    // Check if process is alive
    process.kill(pid, 0);

    // Kill the process tree (Windows: taskkill /F /T for process tree)
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        shell: false,
        timeout: 5000,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (_killErr) {
      // Fallback: try process.kill
      try {
        process.kill(pid, 'SIGTERM');
      } catch (_) {
        // Process may have already exited
      }
    }

    process.stderr.write(`[a2a-shutdown] Killed A2A server PID ${pid}\n`);
  } catch (_e) {
    // Process not alive — continue to update status
    process.stderr.write(`[a2a-shutdown] A2A server PID ${pid} not alive\n`);
  }

  // ── 4. Update status to 'stopped' ─────────────────────────────────────────
  session.status = 'stopped';
  session.stoppedAt = new Date().toISOString();

  // Atomic write: write to temp then rename
  const tempPath = TRACKER_PATH + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(tracker, null, 2), 'utf8');
  fs.renameSync(tempPath, TRACKER_PATH);

  // ── 5. Verify port is freed ───────────────────────────────────────────────
  // This is informational only — we trust taskkill did its job
  process.stderr.write(`[a2a-shutdown] Port ${port} freed\n`);
} catch (err) {
  process.stderr.write(`[a2a-shutdown] Error: ${err.message}\n`);
}

process.exit(0);
