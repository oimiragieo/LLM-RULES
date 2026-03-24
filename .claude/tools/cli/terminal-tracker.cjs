#!/usr/bin/env node
'use strict';

/**
 * Terminal Process Tracker — tracks spawned Claude CLI sessions by PID
 *
 * Usage:
 *   node .claude/tools/cli/terminal-tracker.cjs [list|kill-orphaned|cleanup]
 *
 * Exported API:
 *   snapshotProcesses()          — returns Set of current node.exe PIDs
 *   registerSpawn(purpose, by)   — returns afterSpawn() callback to diff + record new PID
 *   listTracked()                — returns all sessions from tracker file
 *   killOrphaned()               — marks dead PIDs; kills sessions older than 2h
 *   cleanup()                    — removes completed/orphaned entries
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const TRACKER_FILE = path.resolve(__dirname, '../../context/runtime/terminal-pids.json');

const ORPHAN_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Run a PowerShell command with shell:false and return trimmed stdout. */
function runPS(args) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ...args], {
      shell: false,
      encoding: 'utf8',
      timeout: 10000,
    }).trim();
  } catch (_e) {
    return '';
  }
}

/** Read and parse the tracker file. Returns { sessions: [] } on any error. */
function readTracker() {
  if (!fs.existsSync(TRACKER_FILE)) return { sessions: [] };
  let raw = '';
  try {
    raw = fs.readFileSync(TRACKER_FILE, 'utf8');
  } catch (_e) {
    return { sessions: [] };
  }
  const parsed = safeParseJSON(raw, null);
  const sessions = Array.isArray(parsed && parsed.sessions) ? parsed.sessions : [];
  return { sessions };
}

/** Atomically write sessions back to the tracker file. */
function writeTracker(sessions) {
  const dir = path.dirname(TRACKER_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify({ sessions }, null, 2);
  const tmp = TRACKER_FILE + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, TRACKER_FILE);
}

/** Check whether a specific PID is alive (returns boolean). */
function isPidAlive(pid) {
  const out = runPS([
    `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id`,
  ]);
  return out.trim() === String(pid);
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Snapshot the set of currently running node.exe PIDs.
 * Uses PowerShell Get-Process; returns an empty Set on failure.
 *
 * @returns {Set<number>}
 */
function snapshotProcesses() {
  const out = runPS([
    'Get-Process node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id',
  ]);
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const n = parseInt(line.trim(), 10);
    if (!isNaN(n)) pids.add(n);
  }
  return pids;
}

/**
 * Register a spawn intent. Call this BEFORE launching the child process.
 * Returns an afterSpawn() callback to call once the child is running.
 *
 * @param {string} purpose   — human description of why this session was spawned
 * @param {string} spawnedBy — agent or tool that triggered the spawn
 * @returns {() => void}     — afterSpawn callback
 */
function registerSpawn(purpose, spawnedBy) {
  const before = snapshotProcesses();

  return function afterSpawn() {
    const after = snapshotProcesses();
    let newPid = null;
    for (const pid of after) {
      if (!before.has(pid)) {
        newPid = pid;
        break;
      }
    }

    const { sessions } = readTracker();
    sessions.push({
      pid: newPid,
      purpose: String(purpose || 'unknown'),
      spawnedAt: new Date().toISOString(),
      spawnedBy: String(spawnedBy || 'unknown'),
      status: newPid !== null ? 'active' : 'orphaned',
    });
    writeTracker(sessions);
    return newPid;
  };
}

/**
 * List all tracked sessions.
 *
 * @returns {{ pid: number|null, purpose: string, spawnedAt: string, spawnedBy: string, status: string }[]}
 */
function listTracked() {
  return readTracker().sessions;
}

/**
 * Kill orphaned sessions:
 *   - Sessions whose PID is no longer alive → mark as "completed"
 *   - Sessions that ARE alive but older than 2 hours → kill + mark as "orphaned"
 *
 * @returns {{ killed: number[], completed: number[] }}
 */
function killOrphaned() {
  const { sessions } = readTracker();
  const killed = [];
  const completed = [];
  const now = Date.now();

  for (const s of sessions) {
    if (s.status !== 'active') continue;
    if (s.pid === null || s.pid === undefined) {
      s.status = 'orphaned';
      continue;
    }

    const alive = isPidAlive(s.pid);
    if (!alive) {
      s.status = 'completed';
      completed.push(s.pid);
      continue;
    }

    const age = now - new Date(s.spawnedAt).getTime();
    if (age > ORPHAN_AGE_MS) {
      // Kill it
      runPS([`Stop-Process -Id ${s.pid} -Force -ErrorAction SilentlyContinue`]);
      s.status = 'orphaned';
      killed.push(s.pid);
    }
  }

  writeTracker(sessions);
  return { killed, completed };
}

/**
 * Remove all completed and orphaned entries from the tracker file.
 *
 * @returns {number} number of entries removed
 */
function cleanup() {
  const { sessions } = readTracker();
  const before = sessions.length;
  const active = sessions.filter(s => s.status === 'active');
  writeTracker(active);
  return before - active.length;
}

// ---------------------------------------------------------------------------
// CLI mode
// ---------------------------------------------------------------------------

if (require.main === module) {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'list': {
      const sessions = listTracked();
      if (sessions.length === 0) {
        process.stdout.write('No tracked sessions.\n');
      } else {
        process.stdout.write(JSON.stringify({ sessions }, null, 2) + '\n');
      }
      break;
    }

    case 'kill-orphaned': {
      const { killed, completed } = killOrphaned();
      process.stdout.write(
        JSON.stringify(
          { killed, completed, summary: `killed=${killed.length} completed=${completed.length}` },
          null,
          2
        ) + '\n'
      );
      break;
    }

    case 'cleanup': {
      const removed = cleanup();
      process.stdout.write(JSON.stringify({ removed }, null, 2) + '\n');
      break;
    }

    default: {
      const usage = [
        'Usage: node terminal-tracker.cjs [list|kill-orphaned|cleanup]',
        '',
        '  list           Print all tracked sessions as JSON',
        '  kill-orphaned  Kill active sessions older than 2h; mark dead PIDs as completed',
        '  cleanup        Remove completed/orphaned entries from tracker file',
        '',
        'Heartbeat integration: call killOrphaned() every 30 minutes to auto-clean.',
      ].join('\n');
      process.stdout.write(usage + '\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { snapshotProcesses, registerSpawn, listTracked, killOrphaned, cleanup };
