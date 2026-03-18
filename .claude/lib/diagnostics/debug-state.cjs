#!/usr/bin/env node
'use strict';

/**
 * Persistent Debug State (Feature E6)
 * ====================================
 * Maintains debug session state across agent invocations.
 * Stores hypotheses, tested fixes, evidence, and current investigation status.
 *
 * Usage:
 *   const { createDebugSession, addHypothesis, recordEvidence, getSession } = require('./debug-state.cjs');
 *
 *   const session = createDebugSession({ bugId: 'BUG-123', description: 'Auth fails on refresh' });
 *   addHypothesis(session.id, { description: 'Token expired', priority: 'high' });
 *   recordEvidence(session.id, { hypothesis_id: 'H-001', type: 'log', content: 'Token exp: 0', supports: true });
 */

const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, '..', '..', 'context', 'tmp', 'debug');

/**
 * @typedef {Object} DebugSession
 * @property {string} id
 * @property {string} bug_id
 * @property {string} description
 * @property {'investigating'|'hypothesis_testing'|'root_cause_found'|'fix_applied'|'verified'|'closed'} status
 * @property {Array<Hypothesis>} hypotheses
 * @property {Array<Evidence>} evidence
 * @property {string|null} root_cause
 * @property {string|null} fix_description
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Hypothesis
 * @property {string} id
 * @property {string} description
 * @property {'high'|'medium'|'low'} priority
 * @property {'untested'|'testing'|'confirmed'|'rejected'} status
 */

/**
 * @typedef {Object} Evidence
 * @property {string} id
 * @property {string} hypothesis_id
 * @property {'log'|'test'|'trace'|'observation'|'reproduction'} type
 * @property {string} content
 * @property {boolean} supports - Whether this evidence supports the hypothesis
 */

let sessionCounter = 0;
let hypothesisCounter = 0;
let evidenceCounter = 0;

function ensureDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

function sessionPath(sessionId) {
  return path.join(DEBUG_DIR, `${sessionId}.json`);
}

/**
 * Create a new debug session.
 * @param {Object} params
 * @param {string} params.bugId
 * @param {string} params.description
 * @returns {DebugSession}
 */
function createDebugSession({ bugId, description }) {
  ensureDir();
  sessionCounter++;
  const session = {
    id: `dbg-${Date.now()}-${sessionCounter}`,
    bug_id: bugId,
    description,
    status: 'investigating',
    hypotheses: [],
    evidence: [],
    root_cause: null,
    fix_description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveSession(session);
  return session;
}

/**
 * Add a hypothesis to a debug session.
 * @param {string} sessionId
 * @param {Object} params
 * @param {string} params.description
 * @param {'high'|'medium'|'low'} [params.priority='medium']
 * @returns {Hypothesis}
 */
function addHypothesis(sessionId, { description, priority }) {
  const session = loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  hypothesisCounter++;
  const hypothesis = {
    id: `H-${String(hypothesisCounter).padStart(3, '0')}`,
    description,
    priority: priority || 'medium',
    status: 'untested',
  };

  session.hypotheses.push(hypothesis);
  session.updated_at = new Date().toISOString();
  saveSession(session);
  return hypothesis;
}

/**
 * Record evidence for/against a hypothesis.
 * @param {string} sessionId
 * @param {Object} params
 * @param {string} params.hypothesis_id
 * @param {'log'|'test'|'trace'|'observation'|'reproduction'} params.type
 * @param {string} params.content
 * @param {boolean} params.supports
 * @returns {Evidence}
 */
function recordEvidence(sessionId, { hypothesis_id, type, content, supports }) {
  const session = loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  evidenceCounter++;
  const evidence = {
    id: `E-${String(evidenceCounter).padStart(3, '0')}`,
    hypothesis_id,
    type: type || 'observation',
    content: (content || '').substring(0, 1000),
    supports: Boolean(supports),
  };

  session.evidence.push(evidence);
  session.updated_at = new Date().toISOString();

  // Auto-update hypothesis status
  const hyp = session.hypotheses.find(h => h.id === hypothesis_id);
  if (hyp && hyp.status === 'untested') {
    hyp.status = 'testing';
  }

  saveSession(session);
  return evidence;
}

/**
 * Set the root cause and advance session status.
 * @param {string} sessionId
 * @param {string} rootCause
 * @param {string} [confirmedHypothesisId]
 */
function setRootCause(sessionId, rootCause, confirmedHypothesisId) {
  const session = loadSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.root_cause = rootCause;
  session.status = 'root_cause_found';
  session.updated_at = new Date().toISOString();

  if (confirmedHypothesisId) {
    const hyp = session.hypotheses.find(h => h.id === confirmedHypothesisId);
    if (hyp) hyp.status = 'confirmed';
  }

  // Reject unconfirmed hypotheses
  for (const hyp of session.hypotheses) {
    if (hyp.status === 'untested' || hyp.status === 'testing') {
      if (hyp.id !== confirmedHypothesisId) {
        hyp.status = 'rejected';
      }
    }
  }

  saveSession(session);
}

/**
 * Get a debug session by ID.
 * @param {string} sessionId
 * @returns {DebugSession|null}
 */
function getSession(sessionId) {
  return loadSession(sessionId);
}

/**
 * List all debug sessions.
 * @returns {Array<{id: string, bug_id: string, status: string, created_at: string}>}
 */
function listSessions() {
  ensureDir();
  const files = fs.readdirSync(DEBUG_DIR).filter(f => f.endsWith('.json'));
  return files
    .map(f => {
      try {
        const session = JSON.parse(fs.readFileSync(path.join(DEBUG_DIR, f), 'utf8'));
        return {
          id: session.id,
          bug_id: session.bug_id,
          status: session.status,
          created_at: session.created_at,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function loadSession(sessionId) {
  const fp = sessionPath(sessionId);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function saveSession(session) {
  ensureDir();
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf8');
}

module.exports = {
  createDebugSession,
  addHypothesis,
  recordEvidence,
  setRootCause,
  getSession,
  listSessions,
  DEBUG_DIR,
};
