#!/usr/bin/env node
// Agent: developer | Task: #7 | Session: 2026-03-10
'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { LOG_FILENAME } = require('./shift-change-log-writer.cjs');
const SUPPORTED_SCHEMA_MAJOR = '1';

function getDefaultRuntimeDir() {
  return path.join(__dirname, '../../context/runtime');
}

/**
 * Read and validate a shift change handover log.
 * Returns null for: missing file, corrupt JSON, status !== READY, version mismatch.
 * @param {string} [runtimeDir]
 * @returns {object|null}
 */
function readHandoverLog(runtimeDir) {
  const dir = runtimeDir || getDefaultRuntimeDir();
  const logPath = path.join(dir, LOG_FILENAME);

  if (!fs.existsSync(logPath)) {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    return null;
  }

  const data = safeParseJSON(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  // Reject incomplete writes
  if (data.status === 'WRITING') {
    return null;
  }

  // Only READY logs are consumable
  if (data.status !== 'READY') {
    return null;
  }

  // Schema version must be compatible (starts with '1.')
  if (!data.schemaVersion || !String(data.schemaVersion).startsWith(`${SUPPORTED_SCHEMA_MAJOR}.`)) {
    process.stderr.write(`[shift-change-log-reader] Incompatible schemaVersion: ${data.schemaVersion}\n`);
    return null;
  }

  return data;
}

/**
 * Atomically transition log status from READY to CLAIMED.
 * @param {string} [runtimeDir]
 * @param {string} claimingSessionId
 * @returns {boolean} true if claimed successfully
 */
function claimHandoverLog(runtimeDir, claimingSessionId) {
  const dir = runtimeDir || getDefaultRuntimeDir();
  const logPath = path.join(dir, LOG_FILENAME);

  const log = readHandoverLog(dir);
  if (!log) {
    return false;
  }

  log.status = 'CLAIMED';
  log.claimedBy = claimingSessionId;
  log.claimedAt = new Date().toISOString();

  try {
    const tmpPath = logPath + '.claim.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2), 'utf8');
    fs.renameSync(tmpPath, logPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { readHandoverLog, claimHandoverLog };
