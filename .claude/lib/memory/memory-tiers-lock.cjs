'use strict';

const fs = require('fs');
const path = require('path');
const { withLock } = require('../utils/file-locker.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

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

module.exports = { getLockFilePath, withFileLock };
