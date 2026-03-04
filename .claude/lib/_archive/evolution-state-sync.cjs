#!/usr/bin/env node
/**
 * Evolution State Sync
 * ====================
 *
 * @deprecated No active consumers. plan-evolution-guard uses prompt patterns directly.
 *
 * Synchronizes evolution state across workflows.
 * Part of the EVOLVE workflow integration layer.
 *
 * Features:
 * - Reads/writes evolution-state.json
 * - Tracks active evolutions
 * - Manages suggestion queue
 * - Provides locking mechanism
 * - Syncs state between workflows
 *
 * Usage:
 *   const { EvolutionStateSync } = require('./evolution-state-sync.cjs');
 *
 *   const sync = new EvolutionStateSync();
 *   const state = await sync.loadState();
 *   await sync.lock('workflow-123');
 *   // ... do work ...
 *   await sync.unlock('workflow-123');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('./utils/safe-json.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Default path for evolution state file
 */
const DEFAULT_STATE_PATH = '.claude/context/evolution-state.json';

/**
 * Default lock timeout (30 seconds)
 */
const DEFAULT_LOCK_TIMEOUT = 30000;

/**
 * Default state structure
 */
const DEFAULT_STATE = {
  version: '1.0.0',
  state: 'idle',
  currentEvolution: null,
  evolutions: [],
  patterns: [],
  suggestions: [],
  lastUpdated: null,
  locks: {},
};

/**
 * Valid evolution states (EVOLVE phases)
 */
const EVOLUTION_STATES = [
  'idle',
  'evaluating',
  'validating',
  'obtaining',
  'locking',
  'verifying',
  'enabling',
  'complete',
];

const PHASE_ALIASES = {
  evaluate: 'evaluating',
  validate: 'validating',
  obtain: 'obtaining',
  lock: 'locking',
  verify: 'verifying',
  enable: 'enabling',
};

// =============================================================================
// EvolutionStateSync Class
// =============================================================================

/**
 * Synchronizes evolution state across workflows
 */
class EvolutionStateSync {
  /**
   * Create a new EvolutionStateSync instance
   *
   * @param {Object} options - Configuration options
   * @param {string} options.statePath - Path to evolution-state.json
   * @param {number} options.lockTimeout - Lock timeout in ms
   */
  constructor(options = {}) {
    const basePath = options.basePath || process.cwd();

    this.options = {
      statePath: options.statePath || path.join(basePath, DEFAULT_STATE_PATH),
      lockTimeout: options.lockTimeout || DEFAULT_LOCK_TIMEOUT,
    };

    // State cache
    this._stateCache = null;
    this._cacheTime = 0;
    this._cacheMaxAge = 1000; // 1 second cache
  }

  /**
   * Load state from file
   *
   * @returns {Promise<Object>} Evolution state
   */
  async loadState() {
    // Check cache
    if (this._stateCache && Date.now() - this._cacheTime < this._cacheMaxAge) {
      return { ...this._stateCache };
    }

    try {
      if (!fs.existsSync(this.options.statePath)) {
        // Create default state
        const defaultState = { ...DEFAULT_STATE, lastUpdated: new Date().toISOString() };
        await this.saveState(defaultState);
        return defaultState;
      }

      const content = await fs.promises.readFile(this.options.statePath, 'utf-8');
      const state = safeParseJSON(content);

      // Update cache
      this._stateCache = state;
      this._cacheTime = Date.now();

      return { ...state };
    } catch (_e) {
      // Return default state on error
      const defaultState = { ...DEFAULT_STATE, lastUpdated: new Date().toISOString() };
      return defaultState;
    }
  }

  /**
   * Save state to file
   *
   * @param {Object} state - State to save
   */
  async saveState(state) {
    // Ensure directory exists
    const dir = path.dirname(this.options.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Update timestamp
    state.lastUpdated = new Date().toISOString();

    // Write atomically (write to temp, then rename)
    const tempPath = `${this.options.statePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.promises.rename(tempPath, this.options.statePath);

    // Invalidate cache
    this._stateCache = state;
    this._cacheTime = Date.now();
  }

  /**
   * Acquire a lock for a workflow
   *
   * @param {string} workflowId - Workflow ID
   * @param {number} timeout - Lock timeout in ms
   * @returns {Promise<boolean>} True if lock acquired
   */
  async lock(workflowId, timeout = this.options.lockTimeout) {
    const state = await this.loadState();

    // Ensure locks object exists
    if (!state.locks) {
      state.locks = {};
    }

    // Check if lock exists and hasn't expired
    if (state.locks[workflowId]) {
      const lockTime = new Date(state.locks[workflowId]).getTime();
      const now = Date.now();

      if (now - lockTime < timeout) {
        // Lock is still valid
        return false;
      }
      // Lock expired, allow acquisition
    }

    // Acquire lock
    state.locks[workflowId] = new Date().toISOString();
    await this.saveState(state);

    return true;
  }

  /**
   * Release a lock
   *
   * @param {string} workflowId - Workflow ID
   */
  async unlock(workflowId) {
    const state = await this.loadState();

    if (state.locks && state.locks[workflowId]) {
      delete state.locks[workflowId];
      await this.saveState(state);
    }
  }

  /**
   * Get active evolutions
   *
   * @returns {Promise<Array>} List of active evolutions
   */
  async getActiveEvolutions() {
    const state = await this.loadState();

    if (state.currentEvolution) {
      return [state.currentEvolution];
    }

    return [];
  }

  /**
   * Add a suggestion to the queue
   *
   * @param {Object} suggestion - Suggestion object
   * @param {string} suggestion.type - Artifact type
   * @param {string} suggestion.name - Suggested name
   * @param {string} suggestion.reason - Reason for suggestion
   */
  async addSuggestion(suggestion) {
    const state = await this.loadState();

    if (!state.suggestions) {
      state.suggestions = [];
    }

    // Add timestamp
    const enrichedSuggestion = {
      ...suggestion,
      suggestedAt: new Date().toISOString(),
    };

    state.suggestions.push(enrichedSuggestion);
    await this.saveState(state);
  }

  /**
   * Pop (remove and return) the first suggestion
   *
   * @returns {Promise<Object|null>} First suggestion or null
   */
  async popSuggestion() {
    const state = await this.loadState();

    if (!state.suggestions || state.suggestions.length === 0) {
      return null;
    }

    const suggestion = state.suggestions.shift();
    await this.saveState(state);

    return suggestion;
  }

  /**
   * Record an entry in the evolution history
   *
   * @param {Object} entry - History entry
   * @param {string} entry.type - Artifact type
   * @param {string} entry.name - Artifact name
   * @param {string} entry.path - Artifact path
   */
  async recordHistory(entry) {
    const state = await this.loadState();

    if (!state.evolutions) {
      state.evolutions = [];
    }

    // Add completion timestamp if not present
    const historyEntry = {
      ...entry,
      completedAt: entry.completedAt || new Date().toISOString(),
    };

    state.evolutions.push(historyEntry);
    await this.saveState(state);
  }

  /**
   * Update the current evolution
   *
   * @param {Object} evolution - Evolution data
   * @param {string} evolution.type - Artifact type
   * @param {string} evolution.name - Artifact name
   * @param {string} evolution.phase - Current phase
   */
  async updateCurrentEvolution(evolution) {
    const state = await this.loadState();

    state.currentEvolution = {
      ...evolution,
      updatedAt: new Date().toISOString(),
    };

    // Update state field to match phase
    const normalizedPhase =
      PHASE_ALIASES[evolution.phase] ||
      (EVOLUTION_STATES.includes(evolution.phase) ? evolution.phase : null);
    if (normalizedPhase) {
      state.state = normalizedPhase;
    }

    await this.saveState(state);
  }

  /**
   * Clear the current evolution
   */
  async clearCurrentEvolution() {
    const state = await this.loadState();

    state.currentEvolution = null;
    state.state = 'idle';

    await this.saveState(state);
  }

  /**
   * Get pending suggestions
   *
   * @returns {Promise<Array>} List of pending suggestions
   */
  async getPendingSuggestions() {
    const state = await this.loadState();
    return state.suggestions || [];
  }

  /**
   * Get evolution history
   *
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} Evolution history
   */
  async getHistory(limit = 50) {
    const state = await this.loadState();
    const history = state.evolutions || [];

    // Return most recent entries
    return history.slice(-limit);
  }

  /**
   * Add a detected pattern
   *
   * @param {Object} pattern - Pattern object
   */
  async addPattern(pattern) {
    const state = await this.loadState();

    if (!state.patterns) {
      state.patterns = [];
    }

    state.patterns.push({
      ...pattern,
      detectedAt: new Date().toISOString(),
    });

    await this.saveState(state);
  }

  /**
   * Check if a specific artifact is currently being evolved
   *
   * @param {string} type - Artifact type
   * @param {string} name - Artifact name
   * @returns {Promise<boolean>}
   */
  async isBeingEvolved(type, name) {
    const state = await this.loadState();

    if (!state.currentEvolution) {
      return false;
    }

    return state.currentEvolution.type === type && state.currentEvolution.name === name;
  }

  /**
   * Get the current state phase
   *
   * @returns {Promise<string>} Current phase
   */
  async getCurrentPhase() {
    const state = await this.loadState();
    return state.state || 'idle';
  }

  /**
   * Invalidate cache (force reload on next access)
   */
  invalidateCache() {
    this._stateCache = null;
    this._cacheTime = 0;
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  EvolutionStateSync,
  DEFAULT_STATE_PATH,
  DEFAULT_STATE,
  EVOLUTION_STATES,
  DEFAULT_LOCK_TIMEOUT,
};
