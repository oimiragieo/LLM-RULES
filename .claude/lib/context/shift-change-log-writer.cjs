#!/usr/bin/env node
// Agent: developer | Task: #7 | Session: 2026-03-10
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';
const LOG_FILENAME = 'shift-change-log.json';
const TMP_SUFFIX = '.tmp';
const REQUIRED_FIELDS = [
  'sessionId', 'activePid', 'currentObjective', 'contextPercent',
  'contextSummary', 'memoryPointers', 'pendingActions', 'subagentStates',
  'resumeInstructions', 'pendingMemoryWrites', 'drainDeadline'
];
const VALID_STATUSES = ['WRITING', 'READY', 'CLAIMED', 'SUPERSEDED', 'FAILED'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

function getDefaultRuntimeDir() {
  return path.join(__dirname, '../../context/runtime');
}

/**
 * Validate handover log data before writing.
 * @param {object} data
 * @throws {Error} if validation fails
 */
function validateHandoverLog(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Handover log data must be an object');
  }
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  if (typeof data.contextPercent !== 'number' || data.contextPercent < 0 || data.contextPercent > 1) {
    throw new Error('contextPercent must be a number between 0 and 1');
  }
  if (!Array.isArray(data.memoryPointers)) {
    throw new Error('memoryPointers must be an array');
  }
  if (!Array.isArray(data.pendingActions)) {
    throw new Error('pendingActions must be an array');
  }
  for (const action of data.pendingActions) {
    if (!VALID_PRIORITIES.includes(action.priority)) {
      throw new Error(`Invalid priority "${action.priority}" — must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }
  }
  if (!Array.isArray(data.subagentStates)) {
    throw new Error('subagentStates must be an array');
  }
  if (!Array.isArray(data.pendingMemoryWrites)) {
    throw new Error('pendingMemoryWrites must be an array');
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw new Error(`Invalid status "${data.status}" — must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

/**
 * Write a shift change handover log atomically using temp-file-then-rename.
 * @param {object} data - Handover log fields (partial — defaults applied)
 * @param {string} [outputDir] - Directory to write to (defaults to runtime dir)
 * @returns {string} Path of written log file
 */
function writeHandoverLog(data, outputDir) {
  const runtimeDir = outputDir || getDefaultRuntimeDir();
  validateHandoverLog(data);

  const log = {
    schemaVersion: SCHEMA_VERSION,
    handoffId: data.handoffId || crypto.randomUUID(),
    generation: data.generation !== undefined ? data.generation : 1,
    status: 'WRITING',
    sessionId: data.sessionId,
    activePid: data.activePid,
    currentObjective: data.currentObjective,
    contextPercent: data.contextPercent,
    contextSummary: data.contextSummary,
    memoryPointers: data.memoryPointers,
    pendingActions: data.pendingActions,
    subagentStates: data.subagentStates,
    resumeInstructions: data.resumeInstructions,
    pendingMemoryWrites: data.pendingMemoryWrites,
    drainDeadline: data.drainDeadline,
    timestamp: data.timestamp || new Date().toISOString()
  };

  fs.mkdirSync(runtimeDir, { recursive: true });

  const finalPath = path.join(runtimeDir, LOG_FILENAME);
  const tmpPath = finalPath + TMP_SUFFIX;

  // Write WRITING state to tmp first
  fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2), 'utf8');

  // Transition to READY and rename (atomic on same filesystem)
  log.status = 'READY';
  fs.writeFileSync(tmpPath, JSON.stringify(log, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);

  return finalPath;
}

module.exports = { writeHandoverLog, validateHandoverLog, SCHEMA_VERSION, LOG_FILENAME };
