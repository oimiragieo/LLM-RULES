#!/usr/bin/env node
'use strict';

/**
 * Cron Session Launcher (Phase 0)
 * ================================
 * Spawns a detached `claude` subprocess that owns all CronCreate registrations.
 * Uses O_EXCL PID file locking to prevent duplicate sessions.
 *
 * Council conditions addressed:
 *   C2: CRON_SUBPROCESS_MODE=shadow|active (env var)
 *   C3: ANTHROPIC_API_KEY validation before spawn
 *
 * @see .claude/context/reports/architecture/cron-runner-subprocess-council-2026-03-09.md
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const PID_FILE = path.join(RUNTIME_DIR, 'cron-session.pid');
const SESSION_PING_FILE = path.join(RUNTIME_DIR, 'cron-session-ping.json');
const VALID_MODES = ['shadow', 'active'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a process with the given PID is alive.
 * Uses process.kill(pid, 0) which sends no signal but checks existence.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process, EPERM = exists but no permission (still alive)
    if (err.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Read the PID from the PID file (if it exists).
 * @returns {number|null}
 */
function readPidFile() {
  try {
    const content = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Acquire the PID file lock using O_EXCL (atomic, TOCTOU-safe).
 * @param {number} pid - The PID to write
 * @returns {{ acquired: boolean, reason?: string }}
 */
function acquirePidLock(pid) {
  try {
    // O_WRONLY | O_CREAT | O_EXCL — fails if file already exists
    const fd = fs.openSync(PID_FILE, 'wx');
    fs.writeSync(fd, String(pid));
    fs.closeSync(fd);
    return { acquired: true };
  } catch (err) {
    if (err.code === 'EEXIST') {
      // PID file exists — check if the process is still alive
      const existingPid = readPidFile();
      if (existingPid !== null && isProcessAlive(existingPid)) {
        return {
          acquired: false,
          reason: `Cron session already running (PID ${existingPid})`,
        };
      }
      // Stale PID file — remove and retry once
      try {
        fs.unlinkSync(PID_FILE);
        const fd = fs.openSync(PID_FILE, 'wx');
        fs.writeSync(fd, String(pid));
        fs.closeSync(fd);
        return { acquired: true };
      } catch (retryErr) {
        return {
          acquired: false,
          reason: `Failed to reclaim stale PID file: ${retryErr.message}`,
        };
      }
    }
    return { acquired: false, reason: `PID file error: ${err.message}` };
  }
}

/**
 * Release the PID file lock (best-effort).
 */
function releasePidLock() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    // Ignore — file may already be gone
  }
}

/**
 * Write the session ping file (signals the subprocess is alive).
 * @param {number} pid
 * @param {string} mode
 */
function writeSessionPing(pid, mode) {
  const ping = {
    pid,
    mode,
    started_at: new Date().toISOString(),
    last_ping_at: new Date().toISOString(),
    queue_depth: 0,
    total_ticks_processed: 0,
    total_actions_queued: 0,
    restart_count: 0,
    token_watermark: 0,
  };
  const tmpPath = SESSION_PING_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(ping, null, 2));
  fs.renameSync(tmpPath, SESSION_PING_FILE);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that required environment variables are present.
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateEnvironment() {
  const missing = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    missing.push('ANTHROPIC_API_KEY');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Resolve the CRON_SUBPROCESS_MODE (defaults to 'shadow').
 * @returns {{ mode: string, valid: boolean }}
 */
function resolveMode() {
  const mode = (process.env.CRON_SUBPROCESS_MODE || 'shadow').toLowerCase();
  return { mode, valid: VALID_MODES.includes(mode) };
}

// ---------------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------------

/**
 * Launch the cron subprocess.
 * @param {Object} [options]
 * @param {string} [options.claudeBinary='claude'] - Path to the claude CLI binary
 * @param {string[]} [options.args] - Additional args to pass to claude
 * @returns {{ success: boolean, pid?: number, reason?: string }}
 */
function launch(options) {
  const opts = options || {};
  const claudeBinary = opts.claudeBinary || 'claude';

  // Step 1: Validate environment
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    const msg = `Missing required environment variables: ${envCheck.missing.join(', ')}`;
    process.stderr.write(`[cron-launcher] FATAL: ${msg}\n`);
    return { success: false, reason: msg };
  }

  // Step 2: Resolve mode
  const modeCheck = resolveMode();
  if (!modeCheck.valid) {
    const msg = `Invalid CRON_SUBPROCESS_MODE: "${process.env.CRON_SUBPROCESS_MODE}". Must be one of: ${VALID_MODES.join(', ')}`;
    process.stderr.write(`[cron-launcher] FATAL: ${msg}\n`);
    return { success: false, reason: msg };
  }

  // Step 3: Check for existing session
  const existingPid = readPidFile();
  if (existingPid !== null && isProcessAlive(existingPid)) {
    const msg = `Cron session already running (PID ${existingPid})`;
    process.stderr.write(`[cron-launcher] INFO: ${msg}\n`);
    return { success: false, reason: msg };
  }

  // Step 4: Build spawn args
  // --dangerously-skip-permissions allows the subprocess to operate headlessly
  const baseArgs = ['--dangerously-skip-permissions'];
  const spawnArgs = opts.args ? baseArgs.concat(opts.args) : baseArgs;

  // Step 5: Spawn detached subprocess (shell: required for .cmd on Windows)
  let child;
  try {
    child = spawn(claudeBinary, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env, // Inherit full env
    });
    // Suppress unhandled 'error' event from crashing the process
    child.on('error', () => {});
  } catch (err) {
    const msg = `Failed to spawn claude subprocess: ${err.message}`;
    process.stderr.write(`[cron-launcher] FATAL: ${msg}\n`);
    return { success: false, reason: msg };
  }

  const pid = child.pid;
  if (!pid) {
    const msg = 'Subprocess spawned but no PID returned (binary may not exist)';
    process.stderr.write(`[cron-launcher] FATAL: ${msg}\n`);
    return { success: false, reason: msg };
  }

  // Step 6: Acquire PID lock
  const lockResult = acquirePidLock(pid);
  if (!lockResult.acquired) {
    // Kill the child we just spawned since we can't lock
    try {
      child.kill();
    } catch {
      // Best-effort
    }
    process.stderr.write(`[cron-launcher] FATAL: ${lockResult.reason}\n`);
    return { success: false, reason: lockResult.reason };
  }

  // Step 7: Unref so parent can exit independently
  child.unref();

  // Step 8: Write session ping
  writeSessionPing(pid, modeCheck.mode);

  process.stderr.write(
    `[cron-launcher] SUCCESS: Cron session launched (PID ${pid}, mode=${modeCheck.mode})\n`
  );
  return { success: true, pid };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const result = launch();
  process.exit(result.success ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

module.exports = {
  launch,
  isProcessAlive,
  readPidFile,
  acquirePidLock,
  releasePidLock,
  writeSessionPing,
  validateEnvironment,
  resolveMode,
  PID_FILE,
  SESSION_PING_FILE,
  RUNTIME_DIR,
  VALID_MODES,
};
