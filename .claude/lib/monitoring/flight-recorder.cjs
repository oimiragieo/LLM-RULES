'use strict';

const fs = require('fs');
const path = require('path');
const { appendJsonl } = require('../utils/jsonl-utils.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const DEFAULT_RECORDER_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'flight-recorder.jsonl'
);

const MAX_RECORDER_LINES = Number(process.env.FLIGHT_RECORDER_MAX_LINES || 5000);
const MAX_RECORDER_BYTES = Number(process.env.FLIGHT_RECORDER_MAX_BYTES || 5 * 1024 * 1024);
const MAX_RECORDER_FILES = Number(process.env.FLIGHT_RECORDER_MAX_FILES || 20);
const RETENTION_DAYS = Number(process.env.FLIGHT_RECORDER_RETENTION_DAYS || 7);
const ROTATED_SUFFIX_RE = /\.flight-recorder\.\d{13}\.jsonl$/;

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

function rotateIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!Number.isFinite(MAX_RECORDER_BYTES) || MAX_RECORDER_BYTES <= 0) return null;
  if (stat.size < MAX_RECORDER_BYTES) return null;
  const rotated = getRotatedPath(filePath);
  fs.renameSync(filePath, rotated);
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
 * STREAMING-SAFE (JSONL), FAIL-OPEN, ATOMIC.
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

    rotateIfNeeded(filePath);
    pruneOldFiles(filePath);
    appendJsonl(filePath, enriched, { maxLines: MAX_RECORDER_LINES });
  } catch (_err) {
    // FAIL-OPEN: Never throw to avoid breaking the main agent loop
    if (process.env.DEBUG_TELEMETRY) {
      console.error(`[FlightRecorder] Failed to log event: ${_err.message}`);
    }
  }
}

module.exports = {
  record,
  rotateIfNeeded,
  pruneOldFiles,
  getRotatedPath,
  getRecorderPath,
  listRotatedFiles,
  DEFAULT_RECORDER_PATH,
};
