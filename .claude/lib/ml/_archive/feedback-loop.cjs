/**
 * FeedbackLoop.cjs
 *
 * SPEC-026: Continuous Learning
 * Orchestrates model training and persistence based on new session data.
 * Retraining is gated by automationMode (off | log | enforce): only log/enforce
 * trigger retrain; off = ingest only (advice-only, no model changes).
 */

'use strict';

const ML_DEBUG = process.env.ML_DEBUG === 'true';
const fs = require('fs');
const path = require('path');

class FeedbackLoop {
  constructor(patternDetector, optimizationEngine, config = {}) {
    this.patternDetector = patternDetector;
    this.optimizationEngine = optimizationEngine;

    this.ingestCount = 0;
    this.retrainThreshold = config.retrainThreshold || 10;
    this.modelPath = config.modelPath || null;
    this.policyPath = config.policyPath || null;
    this.statePath = config.statePath || null;
    this.sessionsPath = config.sessionsPath || null;
    this.trainingWindow = config.trainingWindow || 200;
    this.maxSessionLogLines = config.maxSessionLogLines || 2000;
    /** off = ingest only; log | enforce = allow retrain and persist */
    this.automationMode = (config.automationMode || 'off').toLowerCase();
  }

  _ensureDirForFile(filePath) {
    if (!filePath) return;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _readState() {
    if (!this.statePath || !fs.existsSync(this.statePath)) {
      return { ingestCount: 0, lastRetrainAt: null };
    }
    try {
      return (
        JSON.parse(fs.readFileSync(this.statePath, 'utf8')) || {
          ingestCount: 0,
          lastRetrainAt: null,
        }
      );
    } catch {
      return { ingestCount: 0, lastRetrainAt: null };
    }
  }

  _writeState(state) {
    if (!this.statePath) return;
    this._ensureDirForFile(this.statePath);
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  _appendSession(session) {
    if (!this.sessionsPath) return;
    this._ensureDirForFile(this.sessionsPath);
    fs.appendFileSync(this.sessionsPath, JSON.stringify(session) + '\n', 'utf8');

    // Best-effort trim to keep bounded (simple: keep last N lines).
    try {
      const raw = fs.readFileSync(this.sessionsPath, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length > this.maxSessionLogLines) {
        const kept = lines.slice(-this.maxSessionLogLines).join('\n') + '\n';
        fs.writeFileSync(this.sessionsPath, kept, 'utf8');
      }
    } catch {
      // ignore trim failures
    }
  }

  _readRecentSessions() {
    if (!this.sessionsPath || !fs.existsSync(this.sessionsPath)) return [];
    try {
      const raw = fs.readFileSync(this.sessionsPath, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const window = Math.max(1, this.trainingWindow);
      const slice = lines.slice(-window);
      const sessions = [];
      for (const line of slice) {
        try {
          sessions.push(JSON.parse(line));
        } catch {
          // skip malformed line
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Process a completed session.
   * Always ingests data. Retraining runs only when automationMode is 'log' or 'enforce'.
   * @param {Object} session - { history, metrics, trace } for feature extraction
   * @returns {boolean} - true if retrain was triggered and ran
   */
  process(session) {
    // 0. Persist session (if configured) so training can survive hook process restarts.
    this._appendSession(session);

    // 1. Ingest Data (always, for future training)
    this.patternDetector.ingest(session);

    // 2. Update ingest count (persisted if configured; otherwise in-memory fallback)
    let state = null;
    if (this.statePath) {
      state = this._readState();
      state.ingestCount = (state.ingestCount || 0) + 1;
      this._writeState(state);
    } else {
      this.ingestCount++;
    }

    // 2. Check Threshold; only retrain when automation allows
    const currentCount = this.statePath ? state && state.ingestCount : this.ingestCount;
    if (currentCount >= this.retrainThreshold) {
      const allowed = this.automationMode === 'log' || this.automationMode === 'enforce';
      if (allowed) {
        this.retrain();
        if (this.statePath) {
          state.ingestCount = 0;
          state.lastRetrainAt = new Date().toISOString();
          this._writeState(state);
        } else {
          this.ingestCount = 0;
        }
        return true;
      }
      // When automation is off, do not reset count: if operator flips mode to log/enforce,
      // the next session will trigger retrain immediately using the persisted session log.
      if (!this.statePath) {
        this.ingestCount = Math.min(this.ingestCount, this.retrainThreshold);
      }
      return false;
    }

    return false;
  }

  /**
   * Retrain models and persist state. Called only when automationMode is log/enforce.
   */
  retrain() {
    if (ML_DEBUG) {
      process.stderr.write('[FeedbackLoop] Triggering retraining...\n');
    }

    // Rebuild training set from persisted sessions if available (required for hook processes).
    if (this.sessionsPath) {
      const sessions = this._readRecentSessions();
      if (sessions.length > 0) {
        if (typeof this.patternDetector.resetTraining === 'function') {
          this.patternDetector.resetTraining();
        } else {
          // Backward compat if resetTraining not present
          this.patternDetector.trainingData = [];
          this.patternDetector.isTrained = false;
        }
        for (const s of sessions) {
          this.patternDetector.ingest(s);
        }
      }
    }

    // 1. Train Pattern Detector (K-Means)
    const result = this.patternDetector.train();

    // 2. Persist Models
    if (this.modelPath) {
      this.patternDetector.saveModel(this.modelPath);
    }

    // 3. Persist Policies (Optimization Engine)
    if (this.policyPath) {
      if (this.optimizationEngine.savePolicies) {
        this.optimizationEngine.savePolicies();
      }
    }

    return result;
  }
}

module.exports = FeedbackLoop;
