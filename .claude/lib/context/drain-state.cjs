#!/usr/bin/env node
// Agent: developer | Task: #9 | Session: 2026-03-10
'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const DRAIN_FILENAME = 'drain-state.json';
const DEFAULT_DRAIN_DEADLINE_MINUTES = 5;

function getDefaultRuntimeDir() {
  return path.join(__dirname, '../../context/runtime');
}

function getDrainPath(runtimeDir) {
  return path.join(runtimeDir || getDefaultRuntimeDir(), DRAIN_FILENAME);
}

/**
 * Enter drain mode for the current session.
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {number} [opts.drainDeadlineMinutes=5]
 * @param {string} [runtimeDir]
 */
function enterDrainMode({ sessionId, drainDeadlineMinutes = DEFAULT_DRAIN_DEADLINE_MINUTES } = {}, runtimeDir) {
  if (!sessionId) throw new Error('sessionId is required to enter drain mode');
  const dir = runtimeDir || getDefaultRuntimeDir();
  fs.mkdirSync(dir, { recursive: true });

  const deadline = new Date(Date.now() + drainDeadlineMinutes * 60 * 1000).toISOString();
  const state = {
    sessionId,
    drainDeadline: deadline,
    activatedAt: new Date().toISOString()
  };

  const p = getDrainPath(dir);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Check if the current session is actively draining.
 * Returns false if: file missing, sessionId mismatch, or deadline expired.
 * @param {string} currentSessionId
 * @param {string} [runtimeDir]
 * @returns {boolean}
 */
function isDraining(currentSessionId, runtimeDir) {
  const p = getDrainPath(runtimeDir);
  if (!fs.existsSync(p)) return false;

  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return false; }

  const data = safeParseJSON(raw);
  if (!data || typeof data !== 'object') return false;

  // New session must not inherit old drain state
  if (data.sessionId !== currentSessionId) return false;

  // Check deadline
  if (data.drainDeadline && new Date(data.drainDeadline) < new Date()) return false;

  return true;
}

/**
 * Exit drain mode by removing drain-state.json.
 * @param {string} [runtimeDir]
 */
function exitDrainMode(runtimeDir) {
  const p = getDrainPath(runtimeDir);
  try { fs.unlinkSync(p); } catch { /* already gone */ }
}

/**
 * Get the current drain state object, or null if not draining.
 * @param {string} [runtimeDir]
 * @returns {object|null}
 */
function getDrainState(runtimeDir) {
  const p = getDrainPath(runtimeDir);
  if (!fs.existsSync(p)) return null;
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return null; }
  const data = safeParseJSON(raw);
  return (data && typeof data === 'object') ? data : null;
}

module.exports = { enterDrainMode, isDraining, exitDrainMode, getDrainState, DRAIN_FILENAME };
