'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('./pre-tool-unified.shared.cjs');

let cleanupRan = false;

function getTmpDir() {
  const claudeDir = path.join(PROJECT_ROOT, '.claude');
  return path.join(claudeDir, 'context', 'tmp');
}

function cleanupFilesInDir(tmpDir, maxAgeMs) {
  if (!fs.existsSync(tmpDir)) {
    return { deleted: 0, errors: 0, bytes: 0 };
  }

  const now = Date.now();
  let deleted = 0;
  let errors = 0;
  let bytes = 0;

  try {
    const files = fs.readdirSync(tmpDir);

    for (const file of files) {
      const filePath = path.join(tmpDir, file);

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) continue;

        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
          fs.unlinkSync(filePath);
          deleted++;
          bytes += stats.size;
        }
      } catch (err) {
        console.error(`[pre-tool-unified:cleanup] Error processing ${file}: ${err.message}`);
        errors++;
      }
    }
  } catch (err) {
    console.error(`[pre-tool-unified:cleanup] Error reading ${tmpDir}: ${err.message}`);
    errors++;
  }

  return { deleted, errors, bytes };
}

function cleanupTmpFiles() {
  const tmpDir = getTmpDir();
  const maxAge = 24 * 60 * 60 * 1000;
  return cleanupFilesInDir(tmpDir, maxAge);
}

function cleanupMemoryTempFiles() {
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  if (!fs.existsSync(memoryDir)) {
    return { deleted: 0, errors: 0, bytes: 0 };
  }

  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;

  let deleted = 0;
  let errors = 0;
  let bytes = 0;

  try {
    const stack = [memoryDir];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const filePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(filePath);
          continue;
        }

        const stats = fs.statSync(filePath);
        const isTmpArtifact =
          entry.name.endsWith('.tmp') ||
          entry.name.includes('.tmp.') ||
          entry.name.startsWith('.tmp-');
        if (!isTmpArtifact) {
          continue;
        }

        const age = now - stats.mtimeMs;
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
          bytes += stats.size;
        }
      }
    }
  } catch (err) {
    console.error(`[pre-tool-unified:cleanup] Error reading memory dir: ${err.message}`);
    errors++;
  }

  return { deleted, errors, bytes };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkSessionCleanup() {
  try {
    if (cleanupRan) {
      return { ran: false, reason: 'already_ran' };
    }

    cleanupRan = true;

    const tmpResult = cleanupTmpFiles();
    const memoryTmpResult = cleanupMemoryTempFiles();
    const result = {
      deleted: tmpResult.deleted + memoryTmpResult.deleted,
      errors: tmpResult.errors + memoryTmpResult.errors,
      bytes: tmpResult.bytes + memoryTmpResult.bytes,
      tmp: tmpResult,
      memoryTmp: memoryTmpResult,
    };

    if (result.deleted > 0) {
      try {
        const { recordMemoryOperation } = require('../../lib/memory/memory-slo-metrics.cjs');
        recordMemoryOperation({
          staleTempFilesRemoved: result.deleted,
        });
      } catch (_e) {
        // Best-effort metrics only.
      }
    }

    if (result.deleted > 0) {
      console.error(
        `[pre-tool-unified:cleanup] Cleaned ${result.deleted} stale temp file(s) (${formatBytes(result.bytes)}) from tmp/ + memory/`
      );
    }

    if (result.errors > 0) {
      console.error(`[pre-tool-unified:cleanup] ${result.errors} error(s) during cleanup`);
    }

    return { ran: true, result };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:cleanup] Error:', err.message);
    }
    return { ran: false, error: err.message };
  }
}

module.exports = {
  checkSessionCleanup,
  cleanupMemoryTempFiles,
};
