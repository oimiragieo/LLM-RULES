'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const AsyncLogBuffer = require('./async-log-buffer.cjs');

const DEFAULT_RECORDER_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'flight-recorder.jsonl'
);

const MAX_RECORDER_BYTES = Number(process.env.FLIGHT_RECORDER_MAX_BYTES || 5 * 1024 * 1024);
const MAX_RECORDER_FILES = Number(process.env.FLIGHT_RECORDER_MAX_FILES || 20);
const RETENTION_DAYS = Number(process.env.FLIGHT_RECORDER_RETENTION_DAYS || 7);
const ROTATED_SUFFIX_RE = /\.flight-recorder\.\d{13}\.jsonl$/;

// Singleton buffer
const logBuffer = new AsyncLogBuffer();

function getRecorderPath() {
  return process.env.FLIGHT_RECORDER_PATH || DEFAULT_RECORDER_PATH;
}

function getRotatedPath(filePath, timestamp = Date.now()) {
  const dir = path.dirname(filePath);
  return path.join(dir, `.flight-recorder.${timestamp}.jsonl`);
}

function listRotatedFiles(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => ROTATED_SUFFIX_RE.test(name))
    .map(name => path.join(dir, name));
}

let lastPruneTime = 0;
const PRUNE_DEBOUNCE_MS = 60 * 1000; // 1 minute

function rotateIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!Number.isFinite(MAX_RECORDER_BYTES) || MAX_RECORDER_BYTES <= 0) return null;
  if (stat.size < MAX_RECORDER_BYTES) return null;

  // Close buffer stream before rotation to release lock
  logBuffer.close();

  const rotated = getRotatedPath(filePath);
  fs.renameSync(filePath, rotated);

  // SEC-IMPL: Prune only during rotation to keep hot-path fast
  const now = Date.now();
  if (now - lastPruneTime > PRUNE_DEBOUNCE_MS) {
    pruneOldFiles(filePath);
    lastPruneTime = now;
  }

  return rotated;
}

function pruneOldFiles(filePath) {
  const now = Date.now();
  const retentionMs = RETENTION_DAYS > 0 ? RETENTION_DAYS * 24 * 60 * 60 * 1000 : 0;
  let files = listRotatedFiles(filePath)
    .map(fullPath => {
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (retentionMs > 0) {
    for (const row of files) {
      if (now - row.mtimeMs > retentionMs) {
        try {
          fs.unlinkSync(row.fullPath);
        } catch (_err) {
          // best-effort
        }
      }
    }
  }

  files = listRotatedFiles(filePath)
    .map(fullPath => {
      const stats = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stats.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (MAX_RECORDER_FILES > 0 && files.length > MAX_RECORDER_FILES) {
    for (const row of files.slice(MAX_RECORDER_FILES)) {
      try {
        fs.unlinkSync(row.fullPath);
      } catch (_err) {
        // best-effort
      }
    }
  }
}

/**
 * Record a telemetry event to the flight recorder.
 * STREAMING-SAFE (JSONL), FAIL-OPEN, ASYNC.
 *
 * @param {Object} event - Event data
 * @param {string} [filePath] - Optional override for testing
 */
function record(event, filePath = getRecorderPath()) {
  try {
    const enriched = {
      traceId: String(event?.traceId || process.env.CLAUDE_TRACE_ID || 'trace-unknown'),
      component: String(event?.component || 'unknown_component'),
      timestamp: event?.timestamp || new Date().toISOString(),
      ...event,
    };

    // Basic normalization for schema gate.
    if (!enriched.event) {
      enriched.event = 'unknown_telemetry';
    }

    // Check rotation (sync check, but only happens occasionally)

    // Optimization: Could move this to async loop too, but file stats are fast enough for now

    // compared to write blocking.

    rotateIfNeeded(filePath);

    logBuffer.setPath(filePath);
    logBuffer.write(enriched);
  } catch (_err) {
    // FAIL-OPEN: Never throw to avoid breaking the main agent loop
    if (process.env.DEBUG_TELEMETRY) {
      console.error(`[FlightRecorder] Failed to log event: ${_err.message}`);
    }
  }
}

// Ensure buffer is flushed on process exit
process.on('exit', () => logBuffer.close());

module.exports = {
  record,
  rotateIfNeeded,
  pruneOldFiles,
  getRotatedPath,
  getRecorderPath,
  listRotatedFiles,
  DEFAULT_RECORDER_PATH,
  // Export buffer for testing if needed
  _logBuffer: logBuffer,
};
