#!/usr/bin/env node
/**
 * artifact-integrator-spawner.cjs - Spawner for artifact-integrator skill
 * ========================================================================
 *
 * Spawns artifact-integrator skill in background for batch processing.
 *
 * Created: 2026-02-13 (C-003 Fix)
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Spawn artifact-integrator skill in background
 *
 * @param {Object} options - Spawn options
 * @param {string} [options.mode='batch'] - Processing mode
 * @param {number} [options.maxEntries=10] - Max entries to process
 * @param {boolean} [options.background=true] - Run in background (non-blocking)
 * @returns {Promise<void>}
 */
async function spawnArtifactIntegrator(options = {}) {
  const { mode = 'batch', maxEntries = 10, background = true } = options;

  // Path to artifact-integrator skill executor
  const skillPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'skills',
    'artifact-integrator',
    'executor.cjs'
  );

  // Build command arguments
  const args = [skillPath, '--mode', mode, '--max-entries', String(maxEntries)];

  if (background) {
    // Background spawn (non-blocking)
    const proc = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore', // Don't capture output
      windowsHide: true, // SECURITY: Hide window on Windows
    });

    proc.unref(); // Allow parent to exit

    // Note: no logging to avoid dependency on logger.cjs for minimal implementation
    return;
  } else {
    // Foreground spawn (blocking)
    return new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, args, {
        stdio: 'inherit',
        windowsHide: true,
      });

      proc.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Artifact integrator exited with code ${code}`));
        }
      });

      proc.on('error', err => {
        reject(err);
      });
    });
  }
}

/**
 * Get current integration queue size
 * @param {string} [queuePath] - Optional queue path (defaults to runtime queue)
 * @returns {number} - Number of entries in queue
 */
function getQueueSize(queuePath) {
  const targetPath =
    queuePath ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'integration-queue.jsonl');

  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isFile()) {
    return 0;
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  const lines = content
    .trim()
    .split('\n')
    .filter(line => line.trim());
  return lines.length;
}

module.exports = {
  spawnArtifactIntegrator,
  getQueueSize,
};
