#!/usr/bin/env node
'use strict';

/**
 * ProcessRegistry
 * ===============
 * Background process lifecycle manager.
 *
 * Tracks spawned child processes with their PID, status, stdout ring buffer,
 * and metadata. Supports crash detection, checkpoint/restore, and Windows-
 * compatible process management.
 *
 * Usage:
 *   const { ProcessRegistry } = require('.claude/lib/workers/process-registry.cjs');
 *   const registry = new ProcessRegistry();
 *   const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);
 *   const output = registry.getOutput(handle.pid);
 *   registry.stop(handle.pid);
 *   registry.checkpoint('/tmp/state.json');
 *   registry.restore('/tmp/state.json');
 */

const { spawn: nodeSpawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_MAX_LINES = 1000;
const DEFAULT_CHECKPOINT_PATH = path.join(process.cwd(), '.process-registry-checkpoint.json');

// ---------------------------------------------------------------------------
// Ring buffer for stdout lines
// ---------------------------------------------------------------------------

class RingBuffer {
  /**
   * @param {number} maxLines Maximum number of lines to retain.
   */
  constructor(maxLines = DEFAULT_MAX_LINES) {
    this._maxLines = maxLines;
    this._lines = [];
  }

  /**
   * Append a line, evicting the oldest if at capacity.
   * @param {string} line
   */
  push(line) {
    this._lines.push(line);
    if (this._lines.length > this._maxLines) {
      this._lines.shift();
    }
  }

  /**
   * Return all retained lines joined by newlines.
   * @returns {string}
   */
  getAll() {
    return this._lines.join('\n');
  }

  /**
   * Return the last `n` lines joined by newlines.
   * @param {number} n
   * @returns {string}
   */
  getTail(n) {
    return this._lines.slice(-n).join('\n');
  }

  /**
   * Return a copy of the internal lines array (for serialization).
   * @returns {string[]}
   */
  toArray() {
    return [...this._lines];
  }

  /**
   * Restore from a saved array (from deserialization).
   * @param {string[]} arr
   */
  fromArray(arr) {
    if (!Array.isArray(arr)) return;
    this._lines = arr.slice(-this._maxLines);
  }
}

// ---------------------------------------------------------------------------
// ProcessRegistry
// ---------------------------------------------------------------------------

class ProcessRegistry {
  /**
   * @param {object} [options]
   * @param {number} [options.maxLines=1000] Ring buffer size per process.
   * @param {string} [options.defaultCheckpointPath] Default path for checkpoint/restore.
   */
  constructor({
    maxLines = DEFAULT_MAX_LINES,
    defaultCheckpointPath = DEFAULT_CHECKPOINT_PATH,
  } = {}) {
    this._maxLines = maxLines;
    this._defaultCheckpointPath = defaultCheckpointPath;
    /** @type {Map<number, object>} pid → internal entry */
    this._processes = new Map();
  }

  /**
   * Spawn a background process.
   *
   * @param {string} command  The executable to run.
   * @param {string[]} [args] Arguments to pass.
   * @param {object} [options] Options forwarded to child_process.spawn (except stdio).
   * @returns {{ pid: number, status: 'running', command: string, args: string[], startedAt: string }}
   */
  spawn(command, args = [], options = {}) {
    const { stdio: _ignored, ...spawnOpts } = options;

    const child = nodeSpawn(command, args, {
      ...spawnOpts,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const pid = child.pid;
    const entry = {
      pid,
      status: 'running',
      command,
      args: [...args],
      startedAt: new Date().toISOString(),
      exitCode: null,
      _ring: new RingBuffer(this._maxLines),
      _child: child,
    };

    this._processes.set(pid, entry);

    // Capture stdout into the ring buffer
    if (child.stdout) {
      let partial = '';
      child.stdout.on('data', chunk => {
        const text = partial + chunk.toString();
        const lines = text.split('\n');
        partial = lines.pop(); // incomplete last fragment
        for (const line of lines) {
          entry._ring.push(line);
        }
      });
      child.stdout.on('end', () => {
        if (partial.length > 0) {
          entry._ring.push(partial);
          partial = '';
        }
      });
    }

    // Drain stderr to prevent the process from blocking on a full pipe,
    // but do not capture it into the ring buffer.
    if (child.stderr) {
      child.stderr.resume();
    }

    // Update status after all stdio streams are closed (ensures full stdout capture).
    child.on('close', code => {
      if (entry.status === 'running') {
        if (code !== 0 && code !== null) {
          entry.status = 'crashed';
          entry.exitCode = code;
        } else {
          entry.status = 'stopped';
          entry.exitCode = code;
        }
      }
      entry._child = null;
    });

    return {
      pid: entry.pid,
      status: entry.status,
      command: entry.command,
      args: entry.args,
      startedAt: entry.startedAt,
    };
  }

  /**
   * Terminate a tracked process.
   * On Windows uses `taskkill /PID <pid> /F`; on Unix sends SIGTERM.
   * Updates status to 'stopped' immediately (before the OS confirms exit).
   *
   * @param {number} pid
   */
  stop(pid) {
    const entry = this._processes.get(pid);
    if (!entry) return;
    if (entry.status !== 'running') return;

    // Mark stopped before killing so the 'close' handler does not override it.
    entry.status = 'stopped';

    if (IS_WINDOWS) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch (_e) {
        // Process may have already exited; ignore.
      }
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (_e) {
        // Process may have already exited; ignore.
      }
    }
  }

  /**
   * Return a snapshot of all tracked processes with their current status.
   *
   * @returns {Array<{ pid: number, status: string, command: string, args: string[], startedAt: string, exitCode: number|null }>}
   */
  list() {
    const result = [];
    for (const [, entry] of this._processes) {
      result.push(this._toPublic(entry));
    }
    return result;
  }

  /**
   * Return the captured stdout for a process.
   *
   * @param {number} pid
   * @param {object} [options]
   * @param {number} [options.tail] If set, return only the last `tail` lines.
   * @returns {string}
   */
  getOutput(pid, { tail } = {}) {
    const entry = this._processes.get(pid);
    if (!entry) return '';

    if (tail !== undefined) {
      return entry._ring.getTail(tail);
    }
    return entry._ring.getAll();
  }

  /**
   * Serialize all process metadata and stdout buffers to a JSON file.
   *
   * @param {string} [filePath] Defaults to `this._defaultCheckpointPath`.
   */
  checkpoint(filePath = this._defaultCheckpointPath) {
    const processes = [];
    for (const [, entry] of this._processes) {
      processes.push({
        pid: entry.pid,
        status: entry.status,
        command: entry.command,
        args: entry.args,
        startedAt: entry.startedAt,
        exitCode: entry.exitCode,
        stdout: entry._ring.toArray(),
      });
    }

    const data = { processes, savedAt: new Date().toISOString() };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Restore process registry from a checkpoint file.
   *
   * For each entry that was 'running', checks if the PID still exists:
   *   - Still alive  → status 'running'
   *   - Gone         → status 'lost'
   * Entries with other statuses are restored as-is.
   *
   * @param {string} [filePath] Defaults to `this._defaultCheckpointPath`.
   */
  restore(filePath = this._defaultCheckpointPath) {
    if (!fs.existsSync(filePath)) return;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_e) {
      return; // Corrupt checkpoint — skip silently.
    }

    if (!data || !Array.isArray(data.processes)) return;

    for (const saved of data.processes) {
      const { pid, command, args, startedAt, exitCode, stdout, status: savedStatus } = saved;

      const wasRunning = savedStatus === 'running';
      const alive = wasRunning ? this._pidExists(pid) : false;

      const status = wasRunning ? (alive ? 'running' : 'lost') : savedStatus;

      const entry = {
        pid,
        status,
        command: command || '',
        args: Array.isArray(args) ? args : [],
        startedAt: startedAt || new Date().toISOString(),
        exitCode: exitCode !== undefined ? exitCode : null,
        _ring: new RingBuffer(this._maxLines),
        _child: null,
      };

      // Restore captured stdout from the checkpoint.
      entry._ring.fromArray(stdout);

      this._processes.set(pid, entry);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Return a public-facing view of an internal entry.
   * @param {object} entry
   * @returns {object}
   */
  _toPublic(entry) {
    return {
      pid: entry.pid,
      status: entry.status,
      command: entry.command,
      args: entry.args,
      startedAt: entry.startedAt,
      exitCode: entry.exitCode,
    };
  }

  /**
   * Check whether a PID is currently alive.
   *
   * On Windows uses `tasklist /FI "PID eq N"`.
   * On Unix uses `process.kill(pid, 0)` (does not send a signal).
   *
   * @param {number} pid
   * @returns {boolean}
   */
  _pidExists(pid) {
    if (IS_WINDOWS) {
      try {
        const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], {
          encoding: 'utf8',
          stdio: 'pipe',
          windowsHide: true,
        });
        // tasklist prints the PID in the output if the process exists.
        return output.includes(String(pid));
      } catch (_e) {
        return false;
      }
    } else {
      try {
        process.kill(pid, 0);
        return true;
      } catch (_e) {
        return false;
      }
    }
  }
}

module.exports = { ProcessRegistry };
