'use strict';

const fs = require('fs');
const path = require('path');
const { withLock } = require('../utils/file-locker.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// LOCK_ORDER: workflow-state -> memory-tiers

function getWorkflowStateLockPath(projectRoot = PROJECT_ROOT) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  const lockPath = path.join(runtimeDir, 'workflow-state.lock');
  if (!fs.existsSync(lockPath)) fs.writeFileSync(lockPath, '', 'utf8');
  return lockPath;
}

async function withWorkflowStateLock(fn, projectRoot = PROJECT_ROOT) {
  const lockPath = getWorkflowStateLockPath(projectRoot);
  return withLock(lockPath, fn, {
    retries: {
      retries: Number(process.env.WORKFLOW_STATE_LOCK_RETRIES || 20),
      minTimeout: Number(process.env.WORKFLOW_STATE_LOCK_MIN_TIMEOUT_MS || 50),
      maxTimeout: Number(process.env.WORKFLOW_STATE_LOCK_MAX_TIMEOUT_MS || 500),
    },
  });
}

module.exports = {
  getWorkflowStateLockPath,
  withWorkflowStateLock,
};
