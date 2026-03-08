'use strict';

/**
 * Heartbeat Sentinel — writes and reads the sentinel file that tracks
 * whether all heartbeat loops are currently registered.
 *
 * The sentinel file is written by heartbeat-orchestrator after successfully
 * registering all loops. The router can check it to decide whether
 * re-registration is needed.
 *
 * Sentinel location: .claude/context/runtime/heartbeat-active.json
 */

const fs = require('fs');
const path = require('path');

// Attempt to load proper-lockfile for atomic writes; fall back to tmp-rename.
let lockfile = null;
try {
  lockfile = require('proper-lockfile');
} catch (_) {
  // proper-lockfile unavailable — will use atomic tmp-rename instead
}

/** Absolute path to the sentinel file. */
function getSentinelPath() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  return path.join(projectRoot, '.claude', 'context', 'runtime', 'heartbeat-active.json');
}

/**
 * Write the sentinel file after successful loop registration.
 *
 * @param {Array<{id: string, name: string, schedule: string, registered_at?: string}>} loops
 *   Array of registered loop objects returned by CronCreate / built by the orchestrator.
 * @returns {string} Path to the written sentinel file.
 */
function writeSentinel(loops) {
  if (!Array.isArray(loops)) {
    throw new TypeError('writeSentinel: loops must be an array');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 46 * 60 * 60 * 1000);

  const sentinelData = {
    written_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    session_id: Date.now().toString(36),
    loop_count: loops.length,
    loops: loops.map(loop => ({
      id: loop.id || null,
      name: loop.name || null,
      schedule: loop.schedule || null,
      registered_at: loop.registered_at || now.toISOString(),
    })),
    bot_name: 'Agent_studio_bot',
    version: '1.0.0',
  };

  const sentinelPath = getSentinelPath();
  const sentinelDir = path.dirname(sentinelPath);

  // Ensure the runtime directory exists.
  if (!fs.existsSync(sentinelDir)) {
    fs.mkdirSync(sentinelDir, { recursive: true });
  }

  const payload = JSON.stringify(sentinelData, null, 2);

  if (lockfile) {
    // Use proper-lockfile for safe concurrent writes.
    const lockPath = sentinelPath + '.lock';
    try {
      // Ensure file exists before locking (lockfile requires it).
      if (!fs.existsSync(sentinelPath)) {
        fs.writeFileSync(sentinelPath, '{}', 'utf8');
      }
      const release = lockfile.lockSync(sentinelPath, { lockfilePath: lockPath });
      try {
        fs.writeFileSync(sentinelPath, payload, 'utf8');
      } finally {
        release();
      }
    } catch (_lockErr) {
      // Lock failed — fall through to atomic tmp-rename.
      _atomicWrite(sentinelPath, payload);
    }
  } else {
    _atomicWrite(sentinelPath, payload);
  }

  return sentinelPath;
}

/**
 * Atomic write: write to a temp file then rename over the target.
 * @private
 */
function _atomicWrite(targetPath, content) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Read the sentinel file and check whether it is still valid.
 *
 * @param {number} [expectedLoops=8] Minimum number of loops that must be registered.
 * @returns {{ valid: boolean, reason: string, data: object|null }}
 */
function checkSentinel(expectedLoops = 8) {
  const sentinelPath = getSentinelPath();

  if (!fs.existsSync(sentinelPath)) {
    return { valid: false, reason: 'missing', data: null };
  }

  let data;
  try {
    const raw = fs.readFileSync(sentinelPath, 'utf8');
    data = JSON.parse(raw);
  } catch (_parseErr) {
    return { valid: false, reason: 'corrupt', data: null };
  }

  // Check expiry.
  if (!data.expires_at) {
    return { valid: false, reason: 'no_expiry', data };
  }
  const expiresAt = new Date(data.expires_at);
  if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return { valid: false, reason: 'expired', data };
  }

  // Check loop count.
  const loopCount = typeof data.loop_count === 'number' ? data.loop_count : 0;
  if (loopCount < expectedLoops) {
    return { valid: false, reason: 'incomplete', loop_count: loopCount, data };
  }

  return { valid: true, reason: 'ok', data };
}

module.exports = { writeSentinel, checkSentinel, getSentinelPath };
