'use strict';

const fs = require('fs');
const path = require('path');
const { withLock } = require('../utils/file-locker.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// LOCK_ORDER: workflow-state -> memory-tiers

function getLockFilePath(projectRoot = PROJECT_ROOT) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  const lockSentinel = path.join(runtimeDir, 'memory-tiers.lock');
  if (!fs.existsSync(lockSentinel)) fs.writeFileSync(lockSentinel, '');
  return lockSentinel;
}

async function withFileLock(fn, projectRoot = PROJECT_ROOT) {
  const lockPath = getLockFilePath(projectRoot);
  const retries = Number(process.env.MEMORY_TIERS_LOCK_RETRIES || 5);
  const minTimeout = Number(process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS || 100);
  const maxTimeout = Number(process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS || 1000);
  try {
    return await withLock(lockPath, fn, {
      retries: {
        retries: Number.isFinite(retries) && retries >= 0 ? retries : 5,
        minTimeout: Number.isFinite(minTimeout) && minTimeout > 0 ? minTimeout : 100,
        maxTimeout: Number.isFinite(maxTimeout) && maxTimeout > 0 ? maxTimeout : 1000,
      },
    });
  } catch (lockErr) {
    throw new Error(`[memory-tiers] Lock acquisition failed (fail-closed): ${lockErr.message}`);
  }
}

function withFileLockSync(fn, projectRoot = PROJECT_ROOT) {
  const lockPath = getLockFilePath(projectRoot);
  const lockfile = require('proper-lockfile');
  const retries = Number(process.env.MEMORY_TIERS_LOCK_RETRIES || 5);
  const minTimeout = Number(process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS || 100);
  const maxTimeout = Number(process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS || 1000);

  const sleepSync = ms => {
    if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
      try {
        const sab = new SharedArrayBuffer(4);
        const ia = new Int32Array(sab);
        Atomics.wait(ia, 0, 0, ms);
        return;
      } catch (_err) {
        // Busy-wait fallback.
      }
    }
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy-wait fallback.
    }
  };

  let release = null;
  try {
    const maxRetries = Number.isFinite(retries) && retries >= 0 ? retries : 5;
    const minWait = Number.isFinite(minTimeout) && minTimeout > 0 ? minTimeout : 100;
    const maxWait = Number.isFinite(maxTimeout) && maxTimeout > 0 ? maxTimeout : 1000;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        release = lockfile.lockSync(lockPath, { stale: 15000 });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) break;
        const backoffMs = Math.min(maxWait, minWait * (attempt + 1));
        sleepSync(backoffMs);
      }
    }

    if (!release || lastError) {
      throw lastError || new Error('Failed to acquire sync lock');
    }

    return fn();
  } catch (lockErr) {
    throw new Error(`[memory-tiers] Lock acquisition failed (fail-closed): ${lockErr.message}`);
  } finally {
    if (typeof release === 'function') {
      try {
        release();
      } catch (_e) {
        // ignore lock release failures in sync path
      }
    }
  }
}

module.exports = { getLockFilePath, withFileLock, withFileLockSync };
