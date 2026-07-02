'use strict';

/**
 * Circuit Breaker for Agent Routing
 *
 * Three states per agent:
 *   CLOSED    — normal operation, requests pass through
 *   OPEN      — failing, requests blocked
 *   HALF_OPEN — testing recovery, limited requests allowed
 *
 * Transitions:
 *   CLOSED → OPEN:      after failureThreshold consecutive failures
 *   OPEN → HALF_OPEN:   after resetTimeout ms elapsed
 *   HALF_OPEN → CLOSED: on success
 *   HALF_OPEN → OPEN:   on failure
 *
 * @module circuit-breaker
 */

const STATE_CLOSED = 'closed';
const STATE_OPEN = 'open';
const STATE_HALF_OPEN = 'half_open';

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RESET_TIMEOUT = 30000; // 30 seconds
const DEFAULT_HALF_OPEN_MAX = 1;

/**
 * @typedef {Object} CircuitRecord
 * @property {string} state
 * @property {number} failures
 * @property {number} successes
 * @property {number|null} lastFailureMs
 * @property {number|null} lastSuccessMs
 * @property {number} halfOpenAttempts
 */

class CircuitBreaker {
  /**
   * @param {{ failureThreshold?: number, resetTimeout?: number, halfOpenMax?: number }} [opts]
   * @param {Function} [nowFn] - Override for Date.now() (testing)
   */
  constructor(opts = {}, nowFn = null) {
    this._failureThreshold =
      typeof opts?.failureThreshold === 'number' && opts.failureThreshold > 0
        ? opts.failureThreshold
        : DEFAULT_FAILURE_THRESHOLD;
    this._resetTimeout =
      typeof opts?.resetTimeout === 'number' && opts.resetTimeout > 0
        ? opts.resetTimeout
        : DEFAULT_RESET_TIMEOUT;
    this._halfOpenMax =
      typeof opts?.halfOpenMax === 'number' && opts.halfOpenMax > 0
        ? opts.halfOpenMax
        : DEFAULT_HALF_OPEN_MAX;
    this._nowFn = typeof nowFn === 'function' ? nowFn : () => Date.now();
    /** @type {Map<string, CircuitRecord>} */
    this._circuits = new Map();
  }

  _now() {
    return this._nowFn();
  }

  /**
   * Get or create a circuit record for an agent.
   * @private
   */
  _getOrCreate(agentType) {
    const key = String(agentType || '');
    if (!key) return null;
    if (!this._circuits.has(key)) {
      this._circuits.set(key, {
        state: STATE_CLOSED,
        failures: 0,
        successes: 0,
        lastFailureMs: null,
        lastSuccessMs: null,
        halfOpenAttempts: 0,
      });
    }
    return this._circuits.get(key);
  }

  /**
   * Evaluate time-based transitions (OPEN → HALF_OPEN).
   * @private
   */
  _evaluateState(record) {
    if (!record) return STATE_CLOSED;
    if (record.state === STATE_OPEN && record.lastFailureMs !== null) {
      if (this._now() - record.lastFailureMs >= this._resetTimeout) {
        record.state = STATE_HALF_OPEN;
        record.halfOpenAttempts = 0;
      }
    }
    return record.state;
  }

  /**
   * Record a successful execution for an agent.
   * Resets failure count. HALF_OPEN → CLOSED.
   *
   * @param {string} agentType
   */
  recordSuccess(agentType) {
    const record = this._getOrCreate(agentType);
    if (!record) return;

    record.successes += 1;
    record.lastSuccessMs = this._now();
    record.failures = 0;
    record.halfOpenAttempts = 0;

    if (record.state === STATE_HALF_OPEN || record.state === STATE_OPEN) {
      record.state = STATE_CLOSED;
    }
  }

  /**
   * Record a failure for an agent.
   * CLOSED → OPEN when threshold hit. HALF_OPEN → OPEN immediately.
   *
   * @param {string} agentType
   */
  recordFailure(agentType) {
    const record = this._getOrCreate(agentType);
    if (!record) return;

    record.failures += 1;
    record.lastFailureMs = this._now();

    if (record.state === STATE_HALF_OPEN) {
      record.state = STATE_OPEN;
      record.halfOpenAttempts = 0;
    } else if (record.state === STATE_CLOSED && record.failures >= this._failureThreshold) {
      record.state = STATE_OPEN;
    }
  }

  /**
   * Check if an agent can execute (circuit allows traffic).
   *
   * @param {string} agentType
   * @returns {boolean}
   */
  canExecute(agentType) {
    const key = String(agentType || '');
    if (!key || !this._circuits.has(key)) return true;

    const record = this._circuits.get(key);
    const state = this._evaluateState(record);

    if (state === STATE_CLOSED) return true;
    if (state === STATE_HALF_OPEN) {
      // Each permitted probe consumes one half-open slot. Without this
      // increment the cap was never enforced (halfOpenAttempts stayed 0).
      if (record.halfOpenAttempts < this._halfOpenMax) {
        record.halfOpenAttempts += 1;
        return true;
      }
      return false;
    }
    return false; // OPEN
  }

  /**
   * Get the current state of an agent's circuit.
   *
   * @param {string} agentType
   * @returns {'closed' | 'open' | 'half_open'}
   */
  getState(agentType) {
    const key = String(agentType || '');
    if (!key || !this._circuits.has(key)) return STATE_CLOSED;
    return this._evaluateState(this._circuits.get(key));
  }

  /**
   * Get stats for an agent's circuit.
   *
   * @param {string} agentType
   * @returns {{ state: string, failures: number, successes: number, lastFailure: string|null, lastSuccess: string|null }}
   */
  getStats(agentType) {
    const key = String(agentType || '');
    if (!key || !this._circuits.has(key)) {
      return {
        state: STATE_CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null,
      };
    }

    const record = this._circuits.get(key);
    const state = this._evaluateState(record);

    return {
      state,
      failures: record.failures,
      successes: record.successes,
      lastFailure: record.lastFailureMs ? new Date(record.lastFailureMs).toISOString() : null,
      lastSuccess: record.lastSuccessMs ? new Date(record.lastSuccessMs).toISOString() : null,
    };
  }

  /**
   * Manually reset an agent's circuit to CLOSED.
   *
   * @param {string} agentType
   */
  reset(agentType) {
    const key = String(agentType || '');
    if (!key || !this._circuits.has(key)) return;

    const record = this._circuits.get(key);
    record.state = STATE_CLOSED;
    record.failures = 0;
    record.successes = 0;
    record.lastFailureMs = null;
    record.lastSuccessMs = null;
    record.halfOpenAttempts = 0;
  }

  /**
   * Get all tracked agent states.
   *
   * @returns {Object.<string, { state: string, failures: number, successes: number }>}
   */
  getAllStates() {
    const result = {};
    for (const [agentType] of this._circuits) {
      result[agentType] = this.getStats(agentType);
    }
    return result;
  }
}

module.exports = {
  CircuitBreaker,
  STATE_CLOSED,
  STATE_OPEN,
  STATE_HALF_OPEN,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RESET_TIMEOUT,
  DEFAULT_HALF_OPEN_MAX,
};
